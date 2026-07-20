"""研招网专业实时查询模块.

通过 Playwright 浏览器环境调用研招网 zys.do 接口，按一级学科代码或专业名称
实时查询所有专业。复用 DynamicReader 的 cookie 持久化与浏览器管理逻辑。

研招网 zys.do 接口特性：
- POST 表单请求，返回 JSON
- 服务端按"参数组合"区分调用，同一会话内同一参数组合第二次起返回"请登录"
- pageSize 参数被服务端忽略，固定 10 条/页
- 但每个 zydm + jsggjh 组合被视为不同调用，每次返回该组合的前 10 条
- 解决方案：枚举 zydm（含 J/Z 自设/交叉学科）+ 用 jsggjh=0/1 拆分子集
"""

from __future__ import annotations

import asyncio
from typing import Any

from yam.crawler.dynamic import (
    BASE_URL,
    DynamicReader,
    _DISCIPLINE_CATEGORIES,
    _FIRST_LEVEL_DISCIPLINES,
    _build_detail_url_with_sign,
    _is_login_cookie,
    build_detail_url,
    is_professional_degree,
)


class MajorsSearcher:
    """研招网专业实时查询器.

    复用 DynamicReader 的浏览器与 cookie 管理，新增 zys.do 翻页拉取能力。
    """

    def __init__(self, headless: bool = True) -> None:
        self.reader = DynamicReader()
        self.headless = headless
        self._logged_in = False

    async def _ensure_browser(self) -> None:
        if self.reader.context is None:
            await self.reader.init(headless=self.headless)

    async def interactive_login(self, major_code_for_login: str = "081200") -> bool:
        """打开可见浏览器让用户手动登录.

        复用 DynamicReader.interactive_login 流程：
        - 清空旧 cookies（避免误判）
        - 等待用户在浏览器中完成登录（最多 5 分钟）
        - 访问详情页建立 yz.chsi.com.cn 域的 session
        - 保存最终 cookies 供后续 headless 查询复用

        major_code_for_login 用于构造详情页 URL 建立专业 session。
        """
        # 强制 headless=False 启动可见浏览器
        self.headless = False
        await self._ensure_browser()

        # 清空旧 cookies，强制用户重新登录（避免本地过期 SESSION 误判）
        await self.reader.context.clear_cookies()
        await self.reader._save_cookies()

        page = await self.reader.context.new_page()
        try:
            await page.goto(f"{BASE_URL}/zsml/", wait_until="load", timeout=60000)

            # 轮询等待用户完成登录，最多 5 分钟
            for _ in range(60):
                await asyncio.sleep(5)
                cookies = await self.reader.context.cookies()
                if any(
                    _is_login_cookie(c.get("name", ""), c.get("domain", ""))
                    and c.get("value")
                    for c in cookies
                ):
                    self._logged_in = True
                    break

            if self._logged_in:
                # 访问详情页建立 session 上下文
                detail_url = build_detail_url(major_code_for_login, "")
                await page.goto(detail_url, wait_until="load", timeout=60000)
                await page.wait_for_timeout(2000)
                await page.goto(f"{BASE_URL}/zsml/", wait_until="load", timeout=60000)
                await page.wait_for_timeout(1500)

            await self.reader._save_cookies()
            return self._logged_in
        finally:
            await page.close()

    async def close(self) -> None:
        await self.reader.close()

    async def _call_zys_do(
        self,
        page,
        zydm: str = "",
        zymc: str = "",
        yjxkdm: str = "",
        xwlx: str = "",
        mldm: str = "",
        xxfs: str = "",
        tydxs: str = "",
        jsggjh: str = "",
        cur_page: int = 1,
    ) -> dict[str, Any]:
        """调用 zys.do 单次请求.

        参数与研招网官网保持一致。返回完整 JSON（含 list/totalCount/totalPage）。
        """
        params: dict[str, str] = {
            "zydm": zydm,
            "zymc": zymc,
            "xwlx": xwlx,
            "mldm": mldm,
            "yjxkdm": yjxkdm,
            "xxfs": xxfs,
            "tydxs": tydxs,
            "jsggjh": jsggjh,
            "start": str((cur_page - 1) * 10),
            "curPage": str(cur_page),
            "pageSize": "10",
            "totalPage": "0",
            "totalCount": "0",
        }

        result = await page.evaluate(
            """
            async (params) => {
                const formData = new URLSearchParams();
                for (const [k, v] of Object.entries(params)) {
                    formData.append(k, v);
                }
                const response = await fetch('https://yz.chsi.com.cn/zsml/rs/zys.do', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': 'https://yz.chsi.com.cn/zsml/'
                    },
                    body: formData.toString()
                });
                return await response.json();
            }
            """,
            params,
        )
        return result if isinstance(result, dict) else {}

    async def _query_with_fresh_session(
        self,
        seed_major: dict[str, Any] | None,
        yjxkdm: str,
        xwlx: str,
        mldm: str,
        zydm: str = "",
        jsggjh: str = "",
        tydxs: str = "",
        cur_page: int = 1,
    ) -> tuple[list[dict[str, Any]], int, str | None]:
        """新建 page、用 seed_major 预热 session 后调用一次 zys.do.

        返回 (list, totalCount, error_msg).
        """
        page = await self.reader.context.new_page()
        try:
            await page.goto(f"{BASE_URL}/zsml/", wait_until="load", timeout=60000)
            await page.wait_for_timeout(800)

            # 用 seed_major 访问详情页建立 session 上下文
            if seed_major:
                try:
                    detail_url = _build_detail_url_with_sign(seed_major, study_mode="")
                    await page.goto(detail_url, wait_until="load", timeout=60000)
                    await page.wait_for_timeout(1500)
                    await page.goto(f"{BASE_URL}/zsml/", wait_until="load", timeout=60000)
                    await page.wait_for_timeout(800)
                except Exception:
                    pass

            resp = await self._call_zys_do(
                page,
                zydm=zydm,
                yjxkdm=yjxkdm,
                xwlx=xwlx,
                mldm=mldm,
                jsggjh=jsggjh,
                tydxs=tydxs,
                cur_page=cur_page,
            )
            msg = resp.get("msg", {})
            if isinstance(msg, str):
                return [], 0, msg
            if not isinstance(msg, dict):
                return [], 0, "msg 类型异常"
            return (
                msg.get("list", []) or [],
                int(msg.get("totalCount", 0) or 0),
                None,
            )
        finally:
            await page.close()

    @staticmethod
    def _normalize_major(
        m: dict[str, Any],
        yjxkdm: str,
        yjxkmc: str,
        mldm: str,
        mlmc: str,
        xwlx: str,
    ) -> dict[str, Any]:
        return {
            "zydm": m.get("zydm", ""),
            "zymc": m.get("zymc", ""),
            "yjxkdm": m.get("yjxkdm", yjxkdm),
            "yjxkmc": m.get("yjxkmc", yjxkmc),
            "mldm": m.get("mldm", mldm),
            "mlmc": m.get("mlmc", mlmc),
            "xwlx": m.get("xwlx", xwlx),
        }

    async def search_by_yjxkdm(self, yjxkdm: str) -> dict[str, Any]:
        """按一级学科代码查询所有专业（含 J/Z 自设交叉学科）.

        绕过 zys.do "每会话一次" 限制的组合策略：
        1. 第 1 次默认查询拿第 1 页 + seed_major（用于详情页预热）
        2. 枚举 zydm（4 位基础码 + J0-J9 + Z0-Z9 自设/交叉学科代码）
        3. 对 totalCount>10 的 zydm 用 jsggjh=0/1 拆分查询
        4. 按 (zydm, zymc) 去重合并

        返回标准化字段：zydm/zymc/yjxkdm/yjxkmc/mldm/mlmc/xwlx.
        """
        if len(yjxkdm) < 4:
            raise ValueError(f"一级学科代码至少 4 位：{yjxkdm}")

        yjxkdm = yjxkdm[:4]
        mldm = yjxkdm[:2]
        mlmc = _DISCIPLINE_CATEGORIES.get(mldm, "")
        yjxkmc = _FIRST_LEVEL_DISCIPLINES.get(yjxkdm, "")
        # 0854、0855 等 4 位代码段表示专业学位一级学科，xwlx=zy
        xwlx = "zy" if is_professional_degree(yjxkdm + "00") else "xs"

        await self._ensure_browser()

        # === 第 1 步：拿 seed_major + 第 1 页数据 ===
        # 关键：传初始 zydm = yjxkdm + "00"，确保只查本学科代码，避免研招网
        # 忽略 yjxkdm 参数时返回任意专业污染 seed_major
        initial_zydm = yjxkdm + "00"
        first_page = await self.reader.context.new_page()
        try:
            await first_page.goto(f"{BASE_URL}/zsml/", wait_until="load", timeout=60000)
            await first_page.wait_for_timeout(800)
            first_resp = await self._call_zys_do(
                first_page,
                zydm=initial_zydm,
                yjxkdm=yjxkdm,
                xwlx=xwlx,
                mldm=mldm,
                cur_page=1,
            )
            first_msg = first_resp.get("msg", {})
        finally:
            await first_page.close()

        seed_major = None
        total_count = 0
        if isinstance(first_msg, dict):
            first_list = first_msg.get("list", []) or []
            if first_list:
                seed_major = first_list[0]
                # 优先用 zys.do 返回数据中的 yjxkmc/mlmc，避免本地字典不全
                if not yjxkmc and seed_major.get("yjxkmc"):
                    yjxkmc = seed_major["yjxkmc"]
            total_count = int(first_msg.get("totalCount", 0) or 0)
        elif isinstance(first_msg, str) and "登录" in first_msg:
            return {
                "majors": [],
                "total_count": 0,
                "fetched_count": 0,
                "need_login": True,
                "yjxkdm": yjxkdm,
                "yjxkmc": yjxkmc,
            }

        if total_count == 0 or not seed_major:
            return {
                "majors": [],
                "total_count": 0,
                "fetched_count": 0,
                "need_login": False,
                "yjxkdm": yjxkdm,
                "yjxkmc": yjxkmc,
            }

        # 累计结果，按 (zydm, zymc) 唯一性去重
        seen: set[tuple[str, str]] = set()
        majors: list[dict[str, Any]] = []

        def add_unique(items: list[dict[str, Any]]) -> int:
            count = 0
            for m in items:
                normalized = self._normalize_major(
                    m, yjxkdm, yjxkmc, mldm, mlmc, xwlx
                )
                key = (normalized["zydm"], normalized["zymc"])
                if key in seen:
                    continue
                seen.add(key)
                majors.append(normalized)
                count += 1
            return count

        # 把第 1 页数据加入
        add_unique(first_list if isinstance(first_msg, dict) else [])

        # === 第 2 步：枚举 zydm 列表 ===
        # 6 位 zydm 候选：基础学术代码（XX0XX0-9）+ J/Z 自设/交叉学科代码
        # 081200-081209（基础学术二级学科）
        # 0812J0-0812J9（教育部自设交叉学科）
        # 0812Z0-0812Z9（高校自主设置交叉学科）
        candidate_zydms: list[str] = []
        for i in range(10):
            candidate_zydms.append(f"{yjxkdm}0{i}")  # 0812 + 0 + 0-9
        for suffix_char in ["J", "Z"]:
            for i in range(10):
                candidate_zydms.append(f"{yjxkdm}{suffix_char}{i}")

        # === 第 3 步：对每个 zydm 查询，必要时用多种参数组合拿全 ===
        # 组合策略（按需启用，最多 9 次查询以拿全 totalCount）：
        # 1. 默认 (jsggjh="", tydxs="")
        # 2-3. jsggjh=0 / jsggjh=1
        # 4-5. tydxs=0 / tydxs=1
        # 6-9. jsggjh+tydxs 4 种组合
        combos_for_split = [
            {"jsggjh": "0"},
            {"jsggjh": "1"},
            {"tydxs": "0"},
            {"tydxs": "1"},
            {"jsggjh": "0", "tydxs": "0"},
            {"jsggjh": "0", "tydxs": "1"},
            {"jsggjh": "1", "tydxs": "0"},
            {"jsggjh": "1", "tydxs": "1"},
        ]

        for zydm in candidate_zydms:
            # 第一次：默认参数
            lst, total, err = await self._query_with_fresh_session(
                seed_major, yjxkdm, xwlx, mldm, zydm=zydm
            )
            if err and "登录" in err:
                continue
            add_unique(lst)

            # 如果 total > 10，逐个尝试组合直到拿全该 zydm
            if total > 10:
                target_for_zydm = total
                for combo in combos_for_split:
                    # 检查当前 zydm 是否已拿全
                    current = sum(1 for m in majors if m["zydm"] == zydm)
                    if current >= target_for_zydm:
                        break
                    lst2, _, _ = await self._query_with_fresh_session(
                        seed_major, yjxkdm, xwlx, mldm, zydm=zydm, **combo
                    )
                    add_unique(lst2)
                    await asyncio.sleep(0.3)

            await asyncio.sleep(0.3)

        return {
            "majors": majors,
            "total_count": total_count,
            "fetched_count": len(majors),
            "need_login": False,
            "yjxkdm": yjxkdm,
            "yjxkmc": yjxkmc,
        }

    async def search_by_name(self, keyword: str) -> list[dict[str, Any]]:
        """按专业名称关键词查询.

        - 研招网 zys.do 按名称搜索时 totalCount 通常 ≤ 10，可一次拿全
        - 不分学术/专业学位，xwlx 留空让服务端匹配
        """
        if not keyword.strip():
            return {"majors": [], "total_count": 0, "fetched_count": 0, "need_login": False}

        await self._ensure_browser()
        page = await self.reader.context.new_page()
        try:
            await page.goto(f"{BASE_URL}/zsml/", wait_until="load", timeout=60000)
            await page.wait_for_timeout(800)

            resp = await self._call_zys_do(page, zymc=keyword.strip(), cur_page=1)
            msg = resp.get("msg", {})

            if isinstance(msg, str):
                if "登录" in msg:
                    return {
                        "majors": [],
                        "total_count": 0,
                        "fetched_count": 0,
                        "need_login": True,
                        "keyword": keyword,
                    }
                raise RuntimeError(f"zys.do 返回异常：{msg}")

            if not isinstance(msg, dict):
                return {"majors": [], "total_count": 0, "fetched_count": 0, "need_login": False}

            page_list = msg.get("list", []) or []
            majors = []
            for m in page_list:
                majors.append({
                    "zydm": m.get("zydm", ""),
                    "zymc": m.get("zymc", ""),
                    "yjxkdm": m.get("yjxkdm", ""),
                    "yjxkmc": m.get("yjxkmc", ""),
                    "mldm": m.get("mldm", ""),
                    "mlmc": m.get("mlmc", ""),
                    "xwlx": m.get("xwlx", ""),
                })

            return {
                "majors": majors,
                "total_count": int(msg.get("totalCount", 0) or 0),
                "fetched_count": len(majors),
                "need_login": False,
                "keyword": keyword,
            }
        finally:
            await page.close()
