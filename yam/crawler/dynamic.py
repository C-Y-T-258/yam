"""基于 Playwright 的动态网页抓取组件.

参考旧项目 yanzhao-mcp 的 DynamicReader 实现，用于在 YAM 内部完成
需要浏览器环境或登录态的数据抓取，避免依赖外部 MCP。
"""

import asyncio
import json
from pathlib import Path
from typing import Any

from yam.config import config


BASE_URL = "https://yz.chsi.com.cn"
COOKIE_DOMAIN = "yz.chsi.com.cn"


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

        self.cookie_dir.mkdir(parents=True, exist_ok=True)
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=headless)
        self.context = await self.browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        )
        await self._load_cookies()

    async def close(self) -> None:
        """关闭浏览器并保存 cookie."""
        await self._save_cookies()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

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
        """保存 cookie 到本地."""
        if not self.context:
            return
        try:
            cookies = await self.context.cookies()
            important = [
                c for c in cookies
                if any(key in c.get("name", "") for key in ["JSESSIONID", "CHSICC", "SESSION"])
            ]
            to_save = important if important else cookies
            with open(self.cookie_file, "w", encoding="utf-8") as f:
                json.dump(to_save, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    async def fetch_school_list(
        self, major_code: str, major_name: str = ""
    ) -> list[dict[str, Any]]:
        """抓取开设目标专业的完整院校列表.

        通过浏览器调用研招网 `zydws.do` 接口并翻页，返回原始 API 记录列表。
        如果检测到未登录，抛出 LoginRequiredError。
        """
        page = await self.context.new_page()
        try:
            # 访问详情页建立 session
            detail_url = (
                f"{BASE_URL}/zsml/zydetail.do?"
                f"zydm={major_code}&zymc={self._quote(major_name or '')}"
                f"&xwlx=zyxw&mldm=08&mlmc=%E5%B7%A5%E5%AD%A6"
                f"&yjxkdm={major_code[:4]}&yjxkmc=%E7%94%B5%E5%AD%90%E4%BF%A1%E6%81%AF"
                f"&xxfs=1"
            )
            await page.goto(detail_url, wait_until="networkidle")
            await page.wait_for_timeout(2000)

            all_schools: list[dict[str, Any]] = []
            page_no = 1
            total_pages = 1

            while page_no <= total_pages:
                result = await page.evaluate(
                    """
                    async (params) => {
                        const formData = new URLSearchParams();
                        formData.append('zydm', params.major_code);
                        formData.append('zymc', '');
                        formData.append('dwmc', '');
                        formData.append('dwdm', '');
                        formData.append('ssdm', '');
                        formData.append('xxfs', '1');
                        formData.append('dwlxs[0]', 'all');
                        formData.append('tydxs', '');
                        formData.append('jsggjh', '');
                        formData.append('start', (params.page_no - 1) * 10);
                        formData.append('curPage', params.page_no);
                        formData.append('pageSize', 10);

                        const response = await fetch(params.api_url, {
                            method: 'POST',
                            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                            body: formData.toString()
                        });
                        return await response.json();
                    }
                    """,
                    {
                        "api_url": f"{BASE_URL}/zsml/rs/zydws.do",
                        "major_code": major_code,
                        "page_no": page_no,
                    },
                )

                msg = result.get("msg", {}) if isinstance(result, dict) else {}
                if isinstance(msg, str):
                    # 接口返回了错误字符串，通常是未登录
                    raise LoginRequiredError(f"研招网接口返回异常：{msg}")

                if page_no == 1:
                    total_pages = int(msg.get("totalPage", 1) or 1)

                schools = msg.get("list", [])
                if not schools and page_no == 1 and msg.get("totalCount", 0) == 0:
                    # 第一页就没有数据，可能是未登录导致
                    raise LoginRequiredError("研招网未返回数据，可能需要登录")

                all_schools.extend(schools)
                page_no += 1

            return all_schools
        finally:
            await page.close()

    async def interactive_login(self, major_code: str, major_name: str = "") -> None:
        """打开可见浏览器窗口，让用户手动登录.

        登录后 cookie 会自动保存，后续抓取可复用。
        """
        await self.init(headless=False)
        page = await self.context.new_page()
        detail_url = (
            f"{BASE_URL}/zsml/zydetail.do?"
            f"zydm={major_code}&zymc={self._quote(major_name or '')}"
            f"&xwlx=zyxw&mldm=08&mlmc=%E5%B7%A5%E5%AD%A6"
            f"&yjxkdm={major_code[:4]}&yjxkmc=%E7%94%B5%E5%AD%90%E4%BF%A1%E6%81%AF"
            f"&xxfs=1"
        )
        await page.goto(detail_url, wait_until="networkidle")
        # 等待用户手动完成登录，最多 5 分钟
        for _ in range(60):
            await asyncio.sleep(5)
            cookies = await self.context.cookies()
            if any("SESSION" in c.get("name", "") for c in cookies):
                break
        await self._save_cookies()
        await page.close()

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
            config.project_dir / "data" / "seeds" / f"yan_zhao_{major_code}_all_regions.json"
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
                "SESSION" in c.get("name", "") and c.get("value")
                for c in cookies
            )
        except Exception:
            return False

    async def fetch_and_save(self, headless: bool = True) -> int:
        """抓取完整学校列表并保存为种子文件."""
        if not self._has_login_cookie():
            raise LoginRequiredError(
                "未检测到研招网登录凭证，请先运行 yam fetch-seeds -m <专业代码> --login 完成登录"
            )
        reader = DynamicReader()
        try:
            await reader.init(headless=headless)
            raw_schools = await reader.fetch_school_list(self.major_code, self.major_name)
            schools = [self._normalize(item) for item in raw_schools]

            self.seed_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.seed_file, "w", encoding="utf-8") as f:
                json.dump(schools, f, ensure_ascii=False, indent=2)

            return len(schools)
        finally:
            await reader.close()

    async def login_and_fetch(self) -> int:
        """先交互式登录，再抓取完整列表."""
        reader = DynamicReader()
        await reader.init(headless=False)
        await reader.interactive_login(self.major_code, self.major_name)
        await reader.close()
        return await self.fetch_and_save(headless=True)

    def _normalize(self, item: dict[str, Any]) -> dict[str, Any]:
        """将研招网原始记录转为 YAM 种子文件格式."""
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
            "mldm": "08",
            "mlmc": "工学",
            "yjxkdm": self.major_code[:4],
            "yjxkmc": "电子信息",
            "xwlx": "zyxw",
            "xwlxmc": "专业学位",
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
