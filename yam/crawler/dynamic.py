"""基于 Playwright 的动态网页抓取组件.

参考旧项目 yanzhao-mcp 的 DynamicReader 实现，用于在 YAM 内部完成
需要浏览器环境或登录态的数据抓取，避免依赖外部 MCP。
"""

import asyncio
import json
import os
import time
from pathlib import Path
from typing import Any

from yam.browser import launch_browser
from yam.config import config
from yam.diagnostics import log_event, safe_message


BASE_URL = "https://yz.chsi.com.cn"
COOKIE_DOMAIN = "yz.chsi.com.cn"


def _emit_seed_log(level: str, message: str) -> None:
    """Emit seed progress to the desktop protocol while keeping CLI output readable."""
    log_event("seed_progress", message, level)
    print(f"[{level.upper()}] {message}", flush=True)
    if os.environ.get("YAM_DESKTOP"):
        print(f"YAM_LOG {level} {message}", flush=True)


def _parse_school_list_response(result: Any) -> tuple[list[dict[str, Any]], int]:
    """Parse a successful zydws.do response; an empty list is a valid result."""
    if not isinstance(result, dict):
        raise RuntimeError("研招网院校接口返回了无效响应")
    msg = result.get("msg", {})
    if isinstance(msg, str):
        raise LoginRequiredError(f"研招网接口返回异常：{msg}")
    if not isinstance(msg, dict):
        raise RuntimeError("研招网院校接口返回了无效数据")
    schools = msg.get("list", [])
    if not isinstance(schools, list):
        raise RuntimeError("研招网院校列表格式无效")
    return schools, int(msg.get("totalCount", 0) or 0)

# 已知专业学位 4 位一级学科代码前缀（不完整列表，按需扩展）
_PROFESSIONAL_PREFIXES: set[str] = {
    "0251", "0252", "0253", "0254", "0255", "0256",
    "0351", "0352",
    "0451", "0452", "0453", "0454",
    "0551", "0552", "0553",
    "0651",
    "0854", "0855", "0856", "0857", "0858", "0859", "0860",
    "0951", "0952", "0953", "0954",
    "1051", "1052", "1053", "1054", "1055", "1056", "1057", "1058", "1059",
    "1151",
    "1251", "1252", "1253", "1254", "1255", "1256",
    "1351",
    "1451",
}

_DISCIPLINE_CATEGORIES: dict[str, str] = {
    "01": "哲学",
    "02": "经济学",
    "03": "法学",
    "04": "教育学",
    "05": "文学",
    "06": "历史学",
    "07": "理学",
    "08": "工学",
    "09": "农学",
    "10": "医学",
    "11": "军事学",
    "12": "管理学",
    "13": "艺术学",
    "14": "交叉学科",
}

_FIRST_LEVEL_DISCIPLINES: dict[str, str] = {
    "0812": "计算机科学与技术",
    "0854": "电子信息",
    "0839": "网络空间安全",
    "0809": "电子科学与技术",
    "0810": "信息与通信工程",
    "0811": "控制科学与工程",
    "0855": "机械",
    "0856": "材料与化工",
    "0857": "资源与环境",
    "0858": "能源动力",
    "0859": "土木水利",
    "0860": "生物与医药",
}

# 中国 34 个省级行政区代码（用于按省份扫描院校列表）
_PROVINCES: dict[str, str] = {
    "11": "北京", "12": "天津", "13": "河北", "14": "山西", "15": "内蒙古",
    "21": "辽宁", "22": "吉林", "23": "黑龙江",
    "31": "上海", "32": "江苏", "33": "浙江", "34": "安徽", "35": "福建", "36": "江西",
    "37": "山东", "41": "河南", "42": "湖北", "43": "湖南", "44": "广东", "45": "广西",
    "46": "海南",
    "50": "重庆", "51": "四川", "52": "贵州", "53": "云南", "54": "西藏",
    "61": "陕西", "62": "甘肃", "63": "青海", "64": "宁夏", "65": "新疆",
    "71": "台湾", "81": "香港", "82": "澳门",
}

# zydws.do 校名关键词（来自旧项目 yanzhao-mcp 策略 B）
# 不同 dwmc 关键词返回不同的前 10 所院校，用于补全密集省份
_KEYWORDS: list[str] = [
    "大学", "学院", "研究院", "研究所",
    "理工", "工业", "科技", "师范", "农业", "医学",
    "财经", "政法", "民族", "航空", "航天", "军事",
    "交通", "邮电", "建筑", "工程", "科学",
    "电子", "信息", "机械",
    "中国", "北方", "南方",
    "华东", "华南", "华北", "华中", "西南", "东南", "东北", "西北",
    "首都", "市", "省",
]


def is_professional_degree(major_code: str) -> bool:
    """根据专业代码判断是否专业学位.

    规律：4 位一级学科代码的第 3 位为 "5" 表示专业学位
    （学术学位第 3 位通常为 0-4 或 7 表示交叉学科，如 0270/0370）。
    """
    return len(major_code) >= 3 and major_code[2] == "5"


def _is_login_cookie(name: str, domain: str = "") -> bool:
    """判断 cookie 是否可能是研招网登录凭证.

    注意：
    - JSESSIONID 只是服务器会话标识，未登录时也会存在，不能作为已登录依据；
    - CLIENTFLAG、XSRF-TOKEN 等也是非登录 cookie；
    - 首页未登录时会在 kl.chsi.com.cn 等子域种下 CHSICC01/02，需排除；
    - 真正代表登录态的是 account.chsi.com.cn 域下的 CASTGC（CAS 票据）。
    """
    upper = name.upper()
    if "JSESSIONID" in upper or "CLIENTFLAG" in upper:
        return False
    if "XSRF" in upper or "CSRF" in upper:
        return False
    # CAS 登录票据是研招网统一登录凭证
    if upper == "CASTGC":
        return True
    if domain and "kl.chsi.com.cn" in domain:
        return False
    if domain and "chsi.com.cn" not in domain:
        return False
    return "SESSION" in upper or "CHSICC" in upper or "LOGIN" in upper or "TOKEN" in upper


def build_detail_url(major_code: str, major_name: str = "") -> str:
    """构造研招网专业详情页 URL，自动识别学术/专业学位."""
    from urllib import parse

    xwlx = "zyxw" if is_professional_degree(major_code) else "xsxw"
    mldm = major_code[:2]
    mlmc = _DISCIPLINE_CATEGORIES.get(mldm, "工学")
    yjxkdm = major_code[:4]
    yjxkmc = _FIRST_LEVEL_DISCIPLINES.get(yjxkdm, major_name or "未知学科")
    return (
        f"{BASE_URL}/zsml/zydetail.do?"
        f"zydm={major_code}&zymc={parse.quote(major_name or '')}"
        f"&xwlx={xwlx}&mldm={mldm}&mlmc={parse.quote(mlmc)}"
        f"&yjxkdm={yjxkdm}&yjxkmc={parse.quote(yjxkmc)}"
        f"&xxfs=1"
    )


def _build_detail_url_with_sign(major: dict[str, Any], study_mode: str = "") -> str:
    """使用 zys.do 返回的专业元数据构造正确的详情页 URL.

    实测研招网详情页需要准确的 xwlx、sign、sign2 等参数，否则会出现
    "访问错误" 或后续 API 返回 "请登录"。
    """
    from urllib import parse

    return (
        f"{BASE_URL}/zsml/zydetail.do?"
        f"zydm={major.get('zydm', '')}"
        f"&zymc={parse.quote(major.get('zymc', ''))}"
        f"&xwlx={major.get('xwlx', '')}"
        f"&mldm={major.get('mldm', '')}"
        f"&mlmc={parse.quote(major.get('mlmc', ''))}"
        f"&yjxkdm={major.get('yjxkdm', '')}"
        f"&yjxkmc={parse.quote(major.get('yjxkmc', ''))}"
        f"&xxfs={study_mode}"
        f"&tydxs="
        f"&jsggjh="
        f"&sign={major.get('sign', '')}"
        f"&sign2={major.get('sign2', '')}"
    )


class LoginRequiredError(RuntimeError):
    """需要用户登录研招网."""


class DynamicReader:
    """研招网动态页面读取器.

    基于 Playwright，支持 cookie 持久化。首次使用需要用户在弹出的浏览器
    窗口中登录研招网；登录状态会保存到 `~/.yam/cookies/`，后续运行可复用。
    """

    def __init__(self) -> None:
        self.browser = None
        self.context = None
        self.playwright = None
        self.cookie_dir = config.data_dir.parent / "cookies"
        self.cookie_file = self.cookie_dir / f"{COOKIE_DOMAIN}.json"

    async def init(self, headless: bool = True) -> None:
        """初始化浏览器."""
        from playwright.async_api import async_playwright

        started = time.monotonic()
        log_event("browser_init_started", f"headless={headless}")
        self.cookie_dir.mkdir(parents=True, exist_ok=True)
        self.playwright = await async_playwright().start()
        self.browser = await launch_browser(self.playwright.chromium, headless=headless)
        self.context = await self.browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        )
        await self._load_cookies()
        log_event(
            "browser_init_completed",
            f"headless={headless} elapsed_ms={int((time.monotonic() - started) * 1000)}",
        )

    async def close(self) -> None:
        """关闭浏览器并保存 cookie."""
        await self._save_cookies()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    @staticmethod
    async def _goto_with_retry(page, url: str, *, attempts: int = 3) -> None:
        """等待 DOM 就绪，并只对页面导航超时做有限重试。"""
        from playwright.async_api import TimeoutError as PlaywrightTimeoutError
        from urllib.parse import urlsplit

        path = urlsplit(url).path or "/"
        for attempt in range(1, attempts + 1):
            started = time.monotonic()
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=60000)
                log_event(
                    "browser_navigation",
                    f"path={path} attempt={attempt}/{attempts} status=success "
                    f"elapsed_ms={int((time.monotonic() - started) * 1000)}",
                )
                return
            except PlaywrightTimeoutError as exc:
                log_event(
                    "browser_navigation",
                    f"path={path} attempt={attempt}/{attempts} status=timeout "
                    f"elapsed_ms={int((time.monotonic() - started) * 1000)} "
                    f"error={safe_message(exc)}",
                    "WARN",
                )
                if attempt == attempts:
                    raise
                await asyncio.sleep(attempt * 2)

    async def _load_cookies(self) -> None:
        """从本地加载 cookie."""
        if not self.cookie_file.exists():
            return
        try:
            with open(self.cookie_file, "r", encoding="utf-8") as f:
                cookies = json.load(f)
            valid = [c for c in cookies if "name" in c and "value" in c and "domain" in c]
            if valid:
                await self.context.add_cookies(valid)
        except Exception:
            pass

    async def _save_cookies(self) -> None:
        """保存 cookie 到本地.

        一旦检测到 CASTGC 等登录凭证，就把全部 cookie（包括 JSESSIONID 等
        yz.chsi.com.cn 域下的 session cookie）一起保存，否则后续 API 调用
        会因为没有 session 而报“请登录”。
        """
        if not self.context:
            return
        try:
            cookies = await self.context.cookies()
            has_login = any(_is_login_cookie(c.get("name", ""), c.get("domain", "")) for c in cookies)
            to_save = cookies if has_login else []
            with open(self.cookie_file, "w", encoding="utf-8") as f:
                json.dump(to_save, f, ensure_ascii=False, indent=2)
            # Cookie 只保存在本机，并尽量限制为当前用户可读写。
            try:
                self.cookie_file.chmod(0o600)
            except OSError:
                # Windows 的 chmod 语义有限；文件仍位于用户主目录下。
                pass
        except Exception:
            pass

    async def _fetch_major_sign(
        self, page, major_code: str, major_name: str = ""
    ) -> dict[str, Any]:
        """调用 zys.do 获取专业元数据（含 xwlx、sign、sign2）."""
        mldm = major_code[:2]
        # 学术学位在 zys.do 中 xwlx 为 xs，专业学位为 zy
        xwlx = "xs" if not is_professional_degree(major_code) else "zy"
        result = await page.evaluate(
            """
            async (params) => {
                const formData = new URLSearchParams();
                formData.append('zydm', params.zydm);
                formData.append('zymc', '');
                formData.append('xwlx', params.xwlx);
                formData.append('mldm', params.mldm);
                formData.append('yjxkdm', '');
                formData.append('xxfs', '');
                formData.append('tydxs', '');
                formData.append('jsggjh', '');
                formData.append('start', '0');
                formData.append('curPage', '1');
                formData.append('pageSize', '10');
                formData.append('totalPage', '0');
                formData.append('totalCount', '0');

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
            {"zydm": major_code, "xwlx": xwlx, "mldm": mldm},
        )
        msg = result.get("msg", {}) if isinstance(result, dict) else {}
        if isinstance(msg, str):
            raise LoginRequiredError(f"获取专业签名失败：{msg}")
        majors = msg.get("list", [])
        for major in majors:
            if major.get("zydm") == major_code:
                return major
        if majors:
            return majors[0]
        # 不再武断判定为“需要登录”：zys.do 对 085400 等部分专业学位代码返回空列表
        # 但官网仍可查询（通常按一级学科 0854 返回）。返回默认签名让后续流程继续尝试。
        print(
            f"[WARN] zys.do 未返回 {major_code} 的签名信息（totalCount=0），"
            f"使用默认签名继续尝试详情页。"
        )
        return {
            "zydm": major_code,
            "zymc": major_name,
            "xwlx": xwlx,
            "mldm": mldm,
            "mlmc": _DISCIPLINE_CATEGORIES.get(mldm, ""),
            "yjxkdm": major_code[:4],
            "yjxkmc": _FIRST_LEVEL_DISCIPLINES.get(major_code[:4], ""),
            "sign": "",
            "sign2": "",
        }

    async def fetch_school_list(
        self, major_code: str, major_name: str = ""
    ) -> list[dict[str, Any]]:
        """抓取开设目标专业的完整院校列表.

        针对 ISSUE-015（zydws.do 翻页返回"请登录"）的解决方案：
        研招网服务端在每个登录会话内只允许一次 zydws.do 调用，第二次起
        一律返回"请登录"。但服务端按"参数组合"区分调用——不同 ssdm
        （省份）/dwlxs（院校类型）/tydxs（退役士兵）等参数视为不同调用。

        策略：
        1. 先扫描 34 个省级行政区，每个省份调用一次 zydws.do（ssdm 过滤），
           获取该省份第一页（最多 10 所）；
        2. 对院校数 >10 的省份，追加 dwlxs=zhx（自划线）、dwlxs=syl（双一流）、
           tydxs=0/1 等筛选组合，每次返回不同的前 10 所；
        3. 按 schId 去重合并，最终覆盖率通常 ≥ 90%。
        """
        import requests

        # 1. 通过浏览器获取 sign 元数据并建立 session
        sign_page = await self.context.new_page()
        try:
            await self._goto_with_retry(sign_page, f"{BASE_URL}/zsml/")
            await sign_page.wait_for_timeout(1500)
            major = await self._fetch_major_sign(sign_page, major_code, major_name)
            detail_url = _build_detail_url_with_sign(major, study_mode="")
            # 访问详情页建立 session 上下文
            await self._goto_with_retry(sign_page, detail_url)
            await sign_page.wait_for_timeout(1500)
        finally:
            await sign_page.close()

        # 2. 从浏览器提取 cookies，转用 requests 调用 API
        #    （requests 比 page.evaluate 更稳定，且避免每页创建新页面开销）
        browser_cookies = await self.context.cookies()
        cookie_dict = {
            c["name"]: c["value"]
            for c in browser_cookies
            if "chsi.com.cn" in c.get("domain", "")
        }

        if not cookie_dict.get("CASTGC"):
            raise LoginRequiredError("未检测到研招网登录凭证（CASTGC），请先完成登录")

        sess = requests.Session()
        sess.cookies.update(cookie_dict)
        sess.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        })

        api_url = f"{BASE_URL}/zsml/rs/zydws.do"
        headers = {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/plain, */*",
            "Referer": detail_url,
            "Origin": BASE_URL,
        }

        def _call(ssdm: str = "", dwlxs: str = "all", xxfs: str = "",
                  tydxs: str = "", jsggjh: str = "", dwmc: str = "") -> tuple[list[dict], int]:
            """调用 zydws.do，返回 (院校列表, totalCount).

            dwmc 参数为校名关键词筛选（策略 B），不同关键词返回不同的前 10 所。
            """
            data = {
                "zydm": major.get("zydm", major_code),
                "zymc": major.get("zymc", major_name),
                "dwmc": dwmc,
                "ssdm": ssdm,
                "xxfs": xxfs,
                "dwlxs[0]": dwlxs,
                "tydxs": tydxs,
                "jsggjh": jsggjh,
                "start": "0",
                "curPage": "1",
                "pageSize": "20",
                "totalPage": "0",
                "totalCount": "0",
            }
            started = time.monotonic()
            request_label = (
                f"major_code={major_code} region={ssdm or 'all'} "
                f"dwlxs={dwlxs or 'none'} study_mode={xxfs or 'all'} "
                f"veteran={tydxs or 'all'} minority_plan={jsggjh or 'all'} "
                f"keyword={dwmc or 'none'}"
            )
            try:
                r = sess.post(api_url, data=data, headers=headers, timeout=30)
                r.raise_for_status()
                schools, total = _parse_school_list_response(r.json())
                log_event(
                    "seed_school_request",
                    f"{request_label} status=success returned={len(schools)} total={total} "
                    f"elapsed_ms={int((time.monotonic() - started) * 1000)}",
                )
                return schools, total
            except Exception as exc:
                log_event(
                    "seed_school_request",
                    f"{request_label} status=error "
                    f"elapsed_ms={int((time.monotonic() - started) * 1000)} "
                    f"error={safe_message(exc)}",
                    "WARN",
                )
                raise

        # 3. 扫描所有省份
        all_schools: dict[str, dict[str, Any]] = {}  # schId → school
        provinces_over_10: list[tuple[str, str, int]] = []  # (code, name, total)

        seed_started = time.monotonic()
        _emit_seed_log("info", "院校目录阶段 1/4：扫描 34 个省级地区...")
        for code, pname in _PROVINCES.items():
            schools: list[dict] = []
            total = 0
            for attempt in range(3):
                try:
                    schools, total = _call(ssdm=code)
                except LoginRequiredError as e:
                    print(f"[WARN] {pname} 调用失败（尝试 {attempt+1}/3）：{e}")
                    if attempt < 2:
                        await asyncio.sleep(4 * (attempt + 1))
                    continue
                # 正常响应中的 0 所是合法结果，不能把大量空省当成故障重试。
                break

            for s in schools:
                sid = s.get("schId", "")
                if sid and sid not in all_schools:
                    all_schools[sid] = s

            status = "OK" if total <= 10 else f"PARTIAL (仅获 {len(schools)}/{total})"
            print(f"[INFO] {pname}: {len(schools)} 所 {status}（累计 {len(all_schools)}）")

            if total > 10:
                provinces_over_10.append((code, pname, total))

            # 34 次不同参数组合低速串行即可；有数据时稍多留出服务端恢复时间。
            await asyncio.sleep(2 if total > 0 else 0.5)

        _emit_seed_log(
            "info",
            f"院校目录阶段 1/4 完成：已找到 {len(all_schools)} 所，"
            f"耗时 {int(time.monotonic() - seed_started)} 秒",
        )

        # 4. 对 >10 所的省份追加筛选组合
        if provinces_over_10:
            _emit_seed_log(
                "info",
                f"院校目录阶段 2/4：{len(provinces_over_10)} 个密集地区追加筛选...",
            )
            # 筛选组合：(筛选参数, 描述)
            # xxfs=1/2（全日制/非全日制）是关键扩展：不同学习方式返回不同前 10 所
            extra_filters = [
                ({"dwlxs": "zhx"}, "自划线"),
                ({"dwlxs": "syl"}, "双一流"),
                ({"tydxs": "1"}, "退役士兵"),
                ({"tydxs": "0"}, "非退役士兵"),
                ({"jsggjh": "1"}, "少数民族骨干"),
                ({"jsggjh": "0"}, "非少数民族骨干"),
                ({"xxfs": "1"}, "全日制"),
                ({"xxfs": "2"}, "非全日制"),
            ]
            for code, pname, _ in provinces_over_10:
                for params, desc in extra_filters:
                    try:
                        schools, _ = _call(ssdm=code, **params)
                    except LoginRequiredError as e:
                        print(f"[WARN] {pname}-{desc} 失败：{e}")
                        await asyncio.sleep(8)
                        continue

                    new_count = 0
                    for s in schools:
                        sid = s.get("schId", "")
                        if sid and sid not in all_schools:
                            all_schools[sid] = s
                            new_count += 1
                    if new_count:
                        print(f"[INFO] {pname}-{desc}: +{new_count} 新增（累计 {len(all_schools)}）")

                    await asyncio.sleep(5)

            _emit_seed_log(
                "info", f"院校目录阶段 2/4 完成：累计 {len(all_schools)} 所"
            )

        if not all_schools:
            raise LoginRequiredError("研招网未返回任何院校数据，可能需要登录")

        # 4.5 关键词搜索（策略 B）：对仍有缺失的省份用 dwmc 关键词补全
        #     不同关键词返回不同的前 10 所，用于突破密集省份的 10 条限制
        if provinces_over_10:
            # 统计每省已找到的院校数
            province_found: dict[str, int] = {}
            for s in all_schools.values():
                ssdm = s.get("szssm", "")
                if ssdm:
                    province_found[ssdm] = province_found.get(ssdm, 0) + 1

            missing_provinces = [
                (code, pname, total, province_found.get(code, 0))
                for code, pname, total in provinces_over_10
                if province_found.get(code, 0) < total
            ]

            if missing_provinces:
                total_missing = sum(t - f for _, _, t, f in missing_provinces)
                _emit_seed_log(
                    "info",
                    f"院校目录阶段 3/4：{len(missing_provinces)} 个地区仍缺 "
                    f"{total_missing} 所，启动关键词补全...",
                )
                await asyncio.sleep(10)  # 多筛选后缓冲，避免 zydws.do 频率限制
                for code, pname, total, found in missing_provinces:
                    missing = total - found
                    print(f"[INFO] {pname}: {found}/{total}，缺 {missing} 所")
                    for kw in _KEYWORDS:
                        try:
                            schools, _ = _call(ssdm=code, dwmc=kw)
                        except LoginRequiredError as e:
                            print(f"[WARN] {pname}-{kw} 失败：{e}")
                            await asyncio.sleep(8)
                            continue

                        new_count = 0
                        for s in schools:
                            sid = s.get("schId", "")
                            if sid and sid not in all_schools:
                                all_schools[sid] = s
                                new_count += 1
                        if new_count:
                            print(f"[INFO] {pname}-{kw}: +{new_count} 新增（累计 {len(all_schools)}）")

                        # 重新统计该省已找到数
                        province_found[code] = sum(
                            1 for s in all_schools.values()
                            if s.get("szssm", "") == code
                        )
                        if province_found[code] >= total:
                            print(f"[INFO] {pname}: 全部 {total} 所已找到 OK")
                            break

                        await asyncio.sleep(5)

                _emit_seed_log(
                    "info", f"院校目录阶段 3/4 完成：累计 {len(all_schools)} 所"
                )

        # 5. dwzys.do 补缺：aiohttp 并发 + 精准遍历
        #    dwzys.do 按 dwdm 精确查询，不受 zydws.do "每参数组合一次" 限制
        #
        #    实测发现（2026-07）：
        #    - 并发 5 短时（40 请求）100% 成功，但持续高频（200+）触发雪崩式限流
        #    - 并发 ≥10 立即全部限流；旧项目"并发 15"在当前网络环境已失效
        #    - 限流后 sleep 5s 不足恢复，需要 sleep 15s 以上
        #    - dwzys.do 对无效 dwdm 返回 dict msg（list=[], totalCount=0），
        #      只有"访问太频繁"/"请登录"才返回字符串 msg
        #
        #    遍历范围策略（基于已知院校分布的精准遍历）：
        #    - 全段遍历（10001-19999 + 80001-82999 + 90001-92999）约 6000 个代码，
        #      限流严重且性价比低
        #    - 改为遍历"已知 dwdm 的 ±10 邻域" + "小间隙（10<gap<100）填补"
        #      总量约 1500-2000 个，精准覆盖最可能的缺失位置
        #    - 缺失院校最可能在已知 dwdm 附近（如同省相邻代码段）
        known_dwdms = {s.get("dwdm", "") for s in all_schools.values() if s.get("dwdm")}
        known_ints = sorted(int(d) for d in known_dwdms if d.isdigit())

        # 计算遍历范围：±10 邻域 + 小间隙填补
        #    实测验证（2026-07）：段±10 + 小间隙(6-99)能达到 100% 覆盖率（271/271）
        #    - 段±5 找到 1 所（北京联合大学 11417，在已知 11415 的 +2 位置）
        #    - 段±6-10 额外找到 2 所（青岛大学 11065、烟台大学 11066，在 11000 段）
        #    - 青岛大学和烟台大学的 dwdm 远离山东主段 10422-10451，只有段±10 能覆盖
        to_search_set: set[int] = set()
        for k in known_ints:
            for c in range(max(1, k - 10), k + 11):
                if str(c) not in known_dwdms:
                    to_search_set.add(c)
        # 小间隙填补：相邻已知 dwdm 差距 11-99 的，填补整个间隙
        for i in range(len(known_ints) - 1):
            gap = known_ints[i + 1] - known_ints[i]
            if 11 <= gap <= 99:
                for c in range(known_ints[i] + 1, known_ints[i + 1]):
                    if str(c) not in known_dwdms:
                        to_search_set.add(c)

        to_search = sorted(to_search_set)

        if to_search:
            import aiohttp

            _emit_seed_log(
                "info",
                f"院校目录阶段 4/4：校代码补缺 {len(to_search)} 项...",
            )

            mldm = major_code[:2]
            yjxkdm = major_code[:4]
            zydm = major.get("zydm", major_code)
            zycm = major.get("zymc", major_name)
            cookie_str = "; ".join(f"{k}={v}" for k, v in cookie_dict.items())
            dwzys_url = f"{BASE_URL}/zsml/rs/dwzys.do"
            dwzys_headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
                "Accept": "application/json, text/plain, */*",
                "Referer": detail_url,
                "Origin": BASE_URL,
                "Cookie": cookie_str,
            }

            dwzys_before = len(all_schools)
            # 批处理参数：批 30，并发 3，批间 sleep 30s，限流率高时 sleep 60s
            #    实测：30s 批间 sleep 是"稳定状态"，成功率约 72%，不触发雪崩封禁
            #    - 5s 批间 sleep：第 2 批起雪崩式限流
            #    - 30s 批间 sleep：持续 ~28% 限流率，但每批都能成功 18-25 个
            #    - 60s 批间 sleep：限流率更低，但吞吐量减半
            batch_size = 30
            dwzys_sem = asyncio.Semaphore(3)

            async def _dwzys_fetch_one(
                session: "aiohttp.ClientSession", code: str
            ) -> tuple[str, list[dict], str]:
                """查询单个 dwdm，返回 (code, schools, status).

                网络异常时重试 2 次（间隔 0.5s），参考旧项目策略 C；
                限流时不重试（避免加剧雪崩封禁）。
                """
                async with dwzys_sem:
                    data = {
                        "dwdm": code, "dwmc": "",
                        "zydm": zydm, "zycm": zycm,
                        "xxfs": "", "mldm": mldm, "yjxkdm": yjxkdm,
                        "start": "0", "pageSize": "10",
                        "totalPage": "0", "totalCount": "0",
                    }
                    # 网络异常重试 2 次（间隔 0.5s），限流立即返回不重试
                    for attempt in range(3):
                        try:
                            async with session.post(
                                dwzys_url, data=data, headers=dwzys_headers,
                                timeout=aiohttp.ClientTimeout(total=10),
                            ) as r:
                                result = await r.json()
                                msg = result.get("msg", {})
                                if isinstance(msg, dict):
                                    return code, msg.get("list", []), "ok"
                                # 字符串 msg = "访问太频繁"/"请登录"，不重试
                                return code, [], "limited"
                        except Exception:
                            if attempt < 2:
                                await asyncio.sleep(0.5)
                            else:
                                return code, [], "error"

            total_batches = (len(to_search) + batch_size - 1) // batch_size
            total_limited = 0
            total_ok = 0

            async with aiohttp.ClientSession() as session:
                for bi in range(0, len(to_search), batch_size):
                    batch_started = time.monotonic()
                    batch = [str(c) for c in to_search[bi:bi + batch_size]]
                    batch_num = bi // batch_size + 1
                    results = await asyncio.gather(
                        *[_dwzys_fetch_one(session, c) for c in batch]
                    )

                    batch_limited = sum(1 for _, _, st in results if st == "limited")
                    batch_ok = sum(1 for _, _, st in results if st == "ok")
                    batch_error = sum(1 for _, _, st in results if st == "error")
                    total_limited += batch_limited
                    total_ok += batch_ok
                    log_event(
                        "seed_code_batch",
                        f"major_code={major_code} batch={batch_num}/{total_batches} "
                        f"size={len(batch)} ok={batch_ok} limited={batch_limited} "
                        f"errors={batch_error} "
                        f"elapsed_ms={int((time.monotonic() - batch_started) * 1000)}",
                        "WARN" if batch_limited or batch_error else "INFO",
                    )

                    for code, schools, _ in results:
                        for s in schools:
                            sid = s.get("schId", "")
                            if sid and sid not in all_schools:
                                all_schools[sid] = s
                                print(f"[INFO] dwzys.do {code}: +{s.get('dwmc', '?')}")

                    # 自适应限流：
                    # - 限流率 >50%：sleep 60s（避免雪崩封禁）
                    # - 限流率 10-50%：sleep 30s（稳定状态）
                    # - 限流率 <10%：sleep 15s（加速）
                    is_last_batch = bi + batch_size >= len(to_search)
                    if is_last_batch:
                        continue
                    if batch_limited > len(batch) * 0.5:
                        print(
                            f"[WARN] 批 {batch_num}/{total_batches}: "
                            f"限流 {batch_limited}/{len(batch)}，sleep 60s..."
                        )
                        await asyncio.sleep(60)
                    elif batch_limited > len(batch) * 0.1:
                        await asyncio.sleep(30)  # 稳定状态 sleep
                    else:
                        await asyncio.sleep(15)  # 低限流，加速

                    # 每 10 批打印进度
                    if batch_num % 10 == 0:
                        print(
                            f"[INFO] 进度 {batch_num}/{total_batches}："
                            f"成功 {total_ok}，限流 {total_limited}，"
                            f"累计 {len(all_schools)} 所"
                        )

            dwzys_new = len(all_schools) - dwzys_before
            _emit_seed_log(
                "info",
                f"院校目录阶段 4/4 完成：新增 {dwzys_new} 所，"
                f"累计 {len(all_schools)} 所（成功请求 {total_ok}，限流 {total_limited}）",
            )

        _emit_seed_log(
            "success",
            f"院校目录建立完成：共 {len(all_schools)} 所，"
            f"总耗时 {int(time.monotonic() - seed_started)} 秒",
        )
        return list(all_schools.values())

    async def _clear_session_cookies(self) -> None:
        """清除 yz.chsi.com.cn 域的 session 相关 cookie（JSESSIONID 等）.

        保留 CASTGC 等登录凭证，仅清除会话标识，使下次请求时服务端
        分配新的 JSESSIONID，避免连续 API 调用被风控拦截。
        """
        if not self.context:
            return
        try:
            cookies = await self.context.cookies()
            # 保留非 session 类的 cookie（CASTGC、统计 cookie 等）
            keep = [
                c for c in cookies
                if c.get("name", "").upper() not in ("JSESSIONID",)
                and "CLIENTFLAG" not in c.get("name", "").upper()
                and "XSRF" not in c.get("name", "").upper()
            ]
            await self.context.clear_cookies()
            if keep:
                await self.context.add_cookies(keep)
        except Exception:
            pass

    async def interactive_login(self, major_code: str, major_name: str = "") -> bool:
        """打开可见浏览器窗口，让用户手动登录.

        登录后 cookie 会自动保存，后续抓取可复用。
        为了避免本地旧 SESSION 导致一启动就被误判为已登录，
        先清空当前 context 的 cookies 并保存空文件，强制用户重新登录。

        返回是否检测到登录凭证。
        """
        login_started = time.monotonic()
        log_event("interactive_login_started", f"major_code={major_code or 'none'}")
        await self.init(headless=False)
        await self.context.clear_cookies()
        await self._save_cookies()
        page = await self.context.new_page()
        # 打开查询页，让用户通过研招网正常入口登录；
        # 登录成功后重定向回本页，可在 yz.chsi.com.cn 域建立有效 session。
        # 打开研招网硕士目录首页（queryAction.do?m=query 在 2026 研招网返回 404）
        await self._goto_with_retry(page, f"{BASE_URL}/zsml/")
        # 等待用户手动完成登录，最多 5 分钟
        logged_in = False
        polls = 0
        for _ in range(60):
            await asyncio.sleep(5)
            polls += 1
            cookies = await self.context.cookies()
            if any(_is_login_cookie(c.get("name", ""), c.get("domain", "")) for c in cookies):
                logged_in = True
                break

        log_event(
            "interactive_login_detected",
            f"major_code={major_code or 'none'} success={logged_in} polls={polls} "
            f"elapsed_seconds={int(time.monotonic() - login_started)}",
            "INFO" if logged_in else "WARN",
        )

        if logged_in:
            # 再访问目标专业详情页，初始化该专业的查询 session 上下文，
            # 同时确保 CAS 登录态在 yz.chsi.com.cn 域下生效。
            detail_url = build_detail_url(major_code, major_name)
            await self._goto_with_retry(page, detail_url)
            await page.wait_for_timeout(2000)
            # 回到查询页，保存最终 cookie 集合
            await self._goto_with_retry(page, f"{BASE_URL}/zsml/")
            await page.wait_for_timeout(1500)

        await self._save_cookies()
        await page.close()
        log_event(
            "interactive_login_completed",
            f"major_code={major_code or 'none'} success={logged_in} "
            f"elapsed_seconds={int(time.monotonic() - login_started)}",
            "INFO" if logged_in else "WARN",
        )
        return logged_in

    @staticmethod
    def _quote(text: str) -> str:
        from urllib import parse

        return parse.quote(text)


class DynamicYanZhaoCrawler:
    """基于浏览器自动化的研招网种子抓取器."""

    def __init__(self, major_code: str, major_name: str):
        self.major_code = major_code
        self.major_name = major_name
        self.seed_file = (
            config.data_dir / "seeds" / f"yan_zhao_{major_code}_all_regions.json"
        )

    @staticmethod
    def _has_login_cookie() -> bool:
        """检查本地是否保存了有效的研招网登录 cookie."""
        cookie_file = config.data_dir.parent / "cookies" / f"{COOKIE_DOMAIN}.json"
        if not cookie_file.exists():
            return False
        try:
            with open(cookie_file, "r", encoding="utf-8") as f:
                cookies = json.load(f)
            return any(
                _is_login_cookie(c.get("name", ""), c.get("domain", "")) and c.get("value")
                for c in cookies
            )
        except Exception:
            return False

    async def fetch_and_save(self, headless: bool = True) -> dict[str, Any]:
        """抓取完整学校列表并保存为种子文件.

        返回包含 school_count、seed_file 的字典，便于桌面端调用。
        """
        started = time.monotonic()
        log_event("seed_fetch_started", f"major_code={self.major_code} headless={headless}")
        if not self._has_login_cookie():
            raise LoginRequiredError("未检测到研招网登录凭证，请先完成登录")
        reader = DynamicReader()
        try:
            await reader.init(headless=headless)
            raw_schools = await reader.fetch_school_list(self.major_code, self.major_name)
            schools = [self._normalize(item) for item in raw_schools]

            self.seed_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.seed_file, "w", encoding="utf-8") as f:
                json.dump(schools, f, ensure_ascii=False, indent=2)

            result = {
                "school_count": len(schools),
                "seed_file": str(self.seed_file),
            }
            log_event(
                "seed_fetch_completed",
                f"major_code={self.major_code} school_count={len(schools)} "
                f"elapsed_seconds={int(time.monotonic() - started)}",
            )
            return result
        finally:
            await reader.close()

    async def login_and_fetch(self) -> dict[str, Any]:
        """先交互式登录，再抓取完整列表.

        返回包含 school_count、seed_file、cookie_path 的字典。
        """
        started = time.monotonic()
        log_event("login_and_seed_started", f"major_code={self.major_code}")
        reader = DynamicReader()
        try:
            logged_in = await reader.interactive_login(self.major_code, self.major_name)
            if not logged_in:
                log_event(
                    "login_and_seed_completed",
                    f"major_code={self.major_code} success=False school_count=0 "
                    f"elapsed_seconds={int(time.monotonic() - started)}",
                    "WARN",
                )
                return {
                    "success": False,
                    "school_count": 0,
                    "error": "未检测到登录凭证，请确认已完成研招网登录",
                    "cookie_path": str(reader.cookie_file),
                }
            # 复用已登录的浏览器上下文直接抓取，避免切换 headless 上下文后
            # cookie/会话状态丢失导致接口返回“请登录”。
            raw_schools = await reader.fetch_school_list(self.major_code, self.major_name)
            schools = [self._normalize(item) for item in raw_schools]
            self.seed_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.seed_file, "w", encoding="utf-8") as f:
                json.dump(schools, f, ensure_ascii=False, indent=2)
            result = {
                "success": len(schools) > 0,
                "school_count": len(schools),
                "seed_file": str(self.seed_file),
                "cookie_path": str(reader.cookie_file),
            }
            log_event(
                "login_and_seed_completed",
                f"major_code={self.major_code} success={result['success']} "
                f"school_count={len(schools)} elapsed_seconds={int(time.monotonic() - started)}",
            )
            return result
        finally:
            await reader.close()

    def _normalize(self, item: dict[str, Any]) -> dict[str, Any]:
        """将研招网原始记录转为 YAM 种子文件格式."""
        professional = is_professional_degree(self.major_code)
        mldm = self.major_code[:2]
        mlmc = _DISCIPLINE_CATEGORIES.get(mldm, "工学")
        yjxkdm = self.major_code[:4]
        yjxkmc = _FIRST_LEVEL_DISCIPLINES.get(yjxkdm, self.major_name or "未知学科")
        return {
            "schId": item.get("schId", ""),
            "dwdm": item.get("dwdm", ""),
            "dwmc": item.get("dwmc", ""),
            "szssm": item.get("szssm", ""),
            "szss": item.get("szss", ""),
            "szqy": item.get("szqy"),
            "zhx": item.get("zhx", "0"),
            "bs": item.get("bs", "0"),
            "syl": item.get("syl", "0"),
            "b985": item.get("b985", "0"),
            "yjsy": item.get("yjsy", "0"),
            "zydm": self.major_code,
            "zymc": self.major_name,
            "mldm": mldm,
            "mlmc": mlmc,
            "yjxkdm": yjxkdm,
            "yjxkmc": yjxkmc,
            "xwlx": "zyxw" if professional else "xsxw",
            "xwlxmc": "专业学位" if professional else "学术学位",
            "sign": item.get("sign", ""),
            "sign2": item.get("sign2", ""),
            "mxxfs": "1",
            "mdwlxs": ["all"],
            "mtydxs": "",
            "mjsggjh": "",
            "showTable": False,
            "data": [],
            "totalCount": 0,
            "pageSize": 3,
            "curPage": 1,
            "source": "yanzhao_dynamic",
        }

