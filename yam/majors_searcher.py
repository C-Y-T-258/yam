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
                try {
                    const response = await fetch('https://yz.chsi.com.cn/zsml/rs/zys.do', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Referer': 'https://yz.chsi.com.cn/zsml/'
                        },
                        body: formData.toString()
                    });
                    if (!response.ok) {
                        return {msg: 'HTTP ' + response.status, list: []};
                    }
                    return await response.json();
                } catch (e) {
                    return {msg: 'fetch失败:' + e.message, list: []};
                }
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

        优化策略（v2）：
        1. 复用单个 page：同一 yjxkdm 内不再每个 zydm 新建 page（核心加速点）
        2. 详情页预热只做一次（不再每个 zydm 都 goto 详情页）
        3. totalCount=0 + first_list 为空时跳过枚举（无数据学科）
        4. wait 时间从 800/1500ms 压缩到 300/500ms
        5. sleep 0.3s → 0.1s
        6. 单 zydm 返回"请登录"时 goto zsml 重置 session 重试一次

        注意：total_count 只是 zydm=yjxkdm+"00" 这一个 zydm 的总数，
        不代表整个 yjxkdm 下所有 zydm 的总数，所以不能用 total_count≤10 跳过枚举。

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

        # === 第 1 步：新建 page + 默认查询拿 seed_major ===
        initial_zydm = yjxkdm + "00"
        page = await self.reader.context.new_page()
        try:
            await page.goto(f"{BASE_URL}/zsml/", wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(150)

            async def _first_call() -> tuple[dict[str, Any] | str, bool]:
                """返回 (msg, is_login_required)。msg 是 dict 表示成功，str 表示错误."""
                resp = await self._call_zys_do(
                    page,
                    zydm=initial_zydm,
                    yjxkdm=yjxkdm,
                    xwlx=xwlx,
                    mldm=mldm,
                    cur_page=1,
                )
                return resp.get("msg", {}), False

            first_msg = await _first_call()

            # 处理限流：如果返回"访问太频繁"，等待 3 秒重试
            if isinstance(first_msg, str) and "访问太频繁" in first_msg:
                await asyncio.sleep(3)
                first_msg = await _first_call()
            if isinstance(first_msg, str) and "访问太频繁" in first_msg:
                await asyncio.sleep(5)
                first_msg = await _first_call()

            seed_major = None
            total_count = 0
            first_list: list[dict[str, Any]] = []
            if isinstance(first_msg, dict):
                first_list = first_msg.get("list", []) or []
                if first_list:
                    seed_major = first_list[0]
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

            # 如果第 1 次返回空或只有 fallback（total_count<=1），可能是 session 未建立。
            # 尝试 goto 详情页（用 yjxkdm+"00" 构造 URL，不依赖 sign）建立 session，然后重试。
            # 这解决了 headless 模式下 cookie 存在但 yz.chsi.com.cn 域 session 未建立的问题。
            # ISSUE-023: 把 total_count==0 扩展到 total_count<=1，覆盖"只有 1 个 fallback major"的场景。
            if (not seed_major and total_count == 0) or total_count <= 1:
                try:
                    detail_url = build_detail_url(yjxkdm + "00", yjxkmc)
                    await page.goto(detail_url, wait_until="domcontentloaded", timeout=30000)
                    await page.wait_for_timeout(500)
                    await page.goto(f"{BASE_URL}/zsml/", wait_until="domcontentloaded", timeout=30000)
                    await page.wait_for_timeout(200)
                    # 重试 zys.do
                    first_resp = await self._call_zys_do(
                        page,
                        zydm=initial_zydm,
                        yjxkdm=yjxkdm,
                        xwlx=xwlx,
                        mldm=mldm,
                        cur_page=1,
                    )
                    first_msg = first_resp.get("msg", {})
                    if isinstance(first_msg, dict):
                        new_list = first_msg.get("list", []) or []
                        new_total = int(first_msg.get("totalCount", 0) or 0)
                        # 只有当重试结果比原结果更好时才更新
                        if new_total > total_count or len(new_list) > len(first_list):
                            first_list = new_list
                            if first_list:
                                seed_major = first_list[0]
                                if not yjxkmc and seed_major.get("yjxkmc"):
                                    yjxkmc = seed_major["yjxkmc"]
                            total_count = new_total
                    elif isinstance(first_msg, str) and "登录" in first_msg:
                        return {
                            "majors": [],
                            "total_count": 0,
                            "fetched_count": 0,
                            "need_login": True,
                            "yjxkdm": yjxkdm,
                            "yjxkmc": yjxkmc,
                        }
                except Exception:
                    pass

            # 空学科（无 seed_major）：直接返回，不枚举
            # 注意：total_count=0 但 first_list 非空时仍要继续（0854 等可能返回 0 但有 seed）
            if not seed_major:
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
            add_unique(first_list)

            # === 第 2 步：详情页预热（只做一次）===
            # 实测发现：goto 详情页 + 回到 /zsml/ 后，后续 zys.do 调用更稳定。
            # 跳过此步骤会导致枚举 30 个 zydm 时部分调用返回空。
            try:
                detail_url = _build_detail_url_with_sign(seed_major, study_mode="")
                await page.goto(detail_url, wait_until="domcontentloaded", timeout=30000)
                await page.wait_for_timeout(200)
                await page.goto(f"{BASE_URL}/zsml/", wait_until="domcontentloaded", timeout=30000)
                await page.wait_for_timeout(150)
            except Exception:
                pass

            # === 第 3 步：分段枚举 zydm 列表（同 page 内连续调，分段 break 优化）===
            # 6 位 zydm 候选分 3 段：
            # - base (XX00-XX09)：基础学术代码，连续 5 个真正空响应就 break
            # - J (XXJ0-XXJ9)：J 自设学科，连续 3 个真正空响应就 break
            # - Z (XXZ0-XXZ9)：Z 交叉学科，连续 3 个真正空响应就 break
            # 每段单独计数，避免某段全空时拖累下一段。
            # ISSUE-023: 大部分 yjxkdm 只有 1-5 个有效 zydm，原 30 个全查浪费时间。
            # 网络错误（err 非空，如限流）不计入"连续空"，避免误 break 漏掉后续数据。
            segments: list[tuple[list[str], int]] = [
                ([f"{yjxkdm}0{i}" for i in range(10)], 5),  # base
                ([f"{yjxkdm}J{i}" for i in range(10)], 3),  # J 自设
                ([f"{yjxkdm}Z{i}" for i in range(10)], 3),  # Z 交叉
            ]

            # totalCount>10 的 zydm 用 8 种 combo 拆分（在同一 page 内连续调）
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

            async def call_with_retry(zydm: str, **combo) -> tuple[list[dict[str, Any]], int, str | None]:
                """同一 page 内调 zys.do；空响应/请登录/访问太频繁时重试.

                重试策略：
                1. 第 1 次调用
                2. 如果返回空 dict {}（fetch 失败）、msg 是"请登录"或"访问太频繁"，
                   - "访问太频繁"：等待 3 秒后重试（避免加剧限流）
                   - 其他：goto /zsml/ 重置 session + 等待 1 秒，重试
                3. 最多重试 2 次
                """
                async def _single_call() -> tuple[list[dict[str, Any]], int, str | None]:
                    resp = await self._call_zys_do(
                        page, zydm=zydm, yjxkdm=yjxkdm, xwlx=xwlx, mldm=mldm, **combo
                    )
                    msg = resp.get("msg", {})
                    # 空 dict（fetch 失败或返回异常）
                    if not msg:
                        return [], 0, "空响应"
                    if isinstance(msg, str):
                        if "登录" in msg or "访问太频繁" in msg or "fetch失败" in msg or "HTTP" in msg:
                            return [], 0, msg
                        return [], 0, msg
                    if not isinstance(msg, dict):
                        return [], 0, "msg 类型异常"
                    return (
                        msg.get("list", []) or [],
                        int(msg.get("totalCount", 0) or 0),
                        None,
                    )

                # 第 1 次调用
                lst, total, err = await _single_call()
                if err:
                    # 限流：等待 3 秒
                    if "访问太频繁" in (err or ""):
                        await asyncio.sleep(3)
                    else:
                        # 其他错误：goto /zsml/ 重置 session + 等待 300ms
                        try:
                            await page.goto(f"{BASE_URL}/zsml/", wait_until="domcontentloaded", timeout=30000)
                            await page.wait_for_timeout(300)
                        except Exception:
                            pass
                    # 重试第 1 次
                    lst, total, err = await _single_call()
                if err and "访问太频繁" in (err or ""):
                    # 仍限流：再等待 5 秒重试一次
                    await asyncio.sleep(5)
                    lst, total, err = await _single_call()
                return lst, total, err

            # 分段枚举：每段内连续 N 个真正空响应就 break，进入下一段
            # ISSUE-023: 跳过 initial_zydm（第 1 步已调过，同 session 再调会返回"请登录"）
            for candidates, empty_threshold in segments:
                consecutive_empty = 0
                for zydm in candidates:
                    if zydm == initial_zydm:
                        continue  # 已在第 1 步调过，跳过避免"请登录"
                    lst, total, err = await call_with_retry(zydm)
                    if err:
                        # 网络错误（限流等）：跳过但不计入"连续空"
                        continue
                    if not lst and total == 0:
                        # 真正空响应：计数
                        consecutive_empty += 1
                        if consecutive_empty >= empty_threshold:
                            break  # 跳出当前段，进入下一段
                        continue
                    # 有数据：重置连续空计数
                    consecutive_empty = 0
                    add_unique(lst)

                    # 如果 total > 10，逐个尝试组合直到拿全该 zydm
                    if total > 10:
                        target_for_zydm = total
                        for combo in combos_for_split:
                            current = sum(1 for m in majors if m["zydm"] == zydm)
                            if current >= target_for_zydm:
                                break
                            lst2, _, _ = await call_with_retry(zydm, **combo)
                            add_unique(lst2)

                    # ISSUE-023: 去掉 sleep 0.1s——同 page 内连续 zys.do 调用不需要等待

            return {
                "majors": majors,
                "total_count": total_count,
                "fetched_count": len(majors),
                "need_login": False,
                "yjxkdm": yjxkdm,
                "yjxkmc": yjxkmc,
            }
        finally:
            await page.close()

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
