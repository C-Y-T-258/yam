"""E2-A3: Playwright 激活 session + httpx 接管 zys.do 调用.

流程：
1. 启动 Playwright（headless）
2. 打开 page，访问 zsml 首页 + 详情页（建立专业 session）
3. 从 Playwright 提取所有 cookies（包括激活后的 JSESSIONID）
4. 用这些 cookies 创建 httpx client
5. 用 httpx 调 zys.do 枚举 zydm
6. 对比 Playwright 单独跑的结果

目标：验证 httpx 能否复用 Playwright 已激活的 session。
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path
from urllib.parse import urlencode

import httpx

BASE_URL = "https://yz.chsi.com.cn"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


async def activate_session_with_playwright(
    yjxkdm: str, xwlx: str, mldm: str
) -> tuple[list[dict], int, dict[str, str], str | None]:
    """用 Playwright 激活 session 并做第 1 次 zys.do 调用.

    返回 (first_list, total_count, cookies_dict, error).
    """
    from playwright.async_api import async_playwright

    initial_zydm = yjxkdm + "00"
    detail_url = (
        f"{BASE_URL}/zsml/zydetail.do?"
        f"zydm={initial_zydm}&zymc=&xwlx={xwlx}&mldm={mldm}&mlmc="
        f"&yjxkdm={yjxkdm}&yjxkmc=&xxfs=1"
    )

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            # 加载已保存的 cookies
            cookie_file = Path.home() / ".yam" / "cookies" / "yz.chsi.com.cn.json"
            saved_cookies = json.loads(cookie_file.read_text(encoding="utf-8")) if cookie_file.exists() else []

            context = await browser.new_context(user_agent=UA)
            if saved_cookies:
                await context.add_cookies(saved_cookies)

            page = await context.new_page()
            # 1. 访问 zsml 首页
            await page.goto(f"{BASE_URL}/zsml/", wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(150)
            # 2. 访问详情页建立专业 session
            await page.goto(detail_url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(300)

            # 3. 用 Playwright 调第 1 次 zys.do（激活 session + 拿 seed_major）
            params = {
                "zydm": initial_zydm, "zymc": "", "xwlx": xwlx, "mldm": mldm,
                "yjxkdm": yjxkdm, "xxfs": "", "tydxs": "", "jsggjh": "",
                "start": "0", "curPage": "1", "pageSize": "10",
                "totalPage": "0", "totalCount": "0",
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
            msg = result.get("msg", {})
            if isinstance(msg, str):
                return [], 0, {}, f"第 1 次 Playwright 调用失败: {msg}"
            first_list = msg.get("list", []) or []
            total = int(msg.get("totalCount", 0) or 0)

            # 4. 提取所有 cookies（含激活后的 JSESSIONID）
            browser_cookies = await context.cookies()
            cookies_dict = {
                c["name"]: c["value"]
                for c in browser_cookies
                if "chsi.com.cn" in c.get("domain", "") and c.get("value")
            }
            return first_list, total, cookies_dict, None
        finally:
            await browser.close()


async def call_zys_do_with_httpx(
    cookies: dict[str, str], zydm: str, yjxkdm: str, xwlx: str, mldm: str
) -> tuple[list[dict], int, str | None]:
    """用 httpx 复用 Playwright 激活的 cookies 调一次 zys.do."""
    async with httpx.AsyncClient(
        http2=False,
        follow_redirects=True,
        headers={"User-Agent": UA},
        cookies=cookies,
    ) as client:
        api_url = f"{BASE_URL}/zsml/rs/zys.do"
        data = {
            "zydm": zydm, "zymc": "", "xwlx": xwlx, "mldm": mldm,
            "yjxkdm": yjxkdm, "xxfs": "", "tydxs": "", "jsggjh": "",
            "start": "0", "curPage": "1", "pageSize": "10",
            "totalPage": "0", "totalCount": "0",
        }
        headers = {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/plain, */*",
            "Referer": f"{BASE_URL}/zsml/",
            "Origin": BASE_URL,
        }
        r = await client.post(api_url, content=urlencode(data), headers=headers, timeout=30.0)
        if r.status_code != 200:
            return [], 0, f"zys.do HTTP {r.status_code}"
        try:
            result = r.json()
        except Exception as e:
            return [], 0, f"zys.do JSON 解析失败: {e}"
        msg = result.get("msg", {})
        if isinstance(msg, str):
            return [], 0, msg
        if not isinstance(msg, dict):
            return [], 0, "msg 类型异常"
        return msg.get("list", []) or [], int(msg.get("totalCount", 0) or 0), None


async def search_with_hybrid(yjxkdm: str, xwlx: str, mldm: str) -> None:
    """Playwright 激活 + httpx 枚举完整流程."""
    t0 = time.time()
    # 1. Playwright 激活 session + 第 1 次调用
    first_list, total, cookies, err = await activate_session_with_playwright(yjxkdm, xwlx, mldm)
    if err:
        print(f"  ❌ Playwright 激活失败: {err}")
        return
    print(f"  Playwright 第 1 次: list={len(first_list)} total={total} cookies={len(cookies)} 耗时={time.time()-t0:.2f}s")

    # 2. 用 httpx 枚举其他 zydm
    t1 = time.time()
    all_majors: list[dict] = list(first_list)
    distinct_zydms: set[str] = {m.get("zydm", "") for m in first_list if m.get("zydm")}
    initial_zydm = yjxkdm + "00"

    # 枚举 XX01-XX99
    for i in range(1, 100):
        zydm = f"{yjxkdm}{i:02d}"
        if zydm == initial_zydm:
            continue
        lst, _, _ = await call_zys_do_with_httpx(cookies, zydm, yjxkdm, xwlx, mldm)
        if lst:
            all_majors.extend(lst)
            distinct_zydms.update(m.get("zydm", "") for m in lst if m.get("zydm"))

    # 枚举 J/Z 自设
    for prefix in ["J", "Z"]:
        for i in range(0, 100):
            zydm = f"{prefix}{yjxkdm}{i:02d}"
            lst, _, _ = await call_zys_do_with_httpx(cookies, zydm, yjxkdm, xwlx, mldm)
            if lst:
                all_majors.extend(lst)
                distinct_zydms.update(m.get("zydm", "") for m in lst if m.get("zydm"))

    # 去重
    seen: set[tuple[str, str]] = set()
    unique: list[dict] = []
    for m in all_majors:
        key = (m.get("zydm", ""), m.get("zymc", ""))
        if key in seen:
            continue
        seen.add(key)
        unique.append(m)

    t2 = time.time()
    print(f"  httpx 枚举完成: majors={len(unique)} distinct_zydms={len(distinct_zydms)} 耗时={t2-t1:.2f}s")
    print(f"  总耗时={t2-t0:.2f}s")


async def main() -> None:
    print("=== E2-A3: Playwright 激活 + httpx 接管（0101 哲学） ===")
    await search_with_hybrid("0101", "xs", "01")
    print(f"  对比 Playwright CONCURRENCY=2+retry: 11 majors, 10 distinct zydms")

    print("\n=== E2-A3: Playwright 激活 + httpx 接管（0202 应用经济学） ===")
    await search_with_hybrid("0202", "xs", "02")
    print(f"  对比 Playwright CONCURRENCY=2+retry: 71 majors, 21 distinct zydms")


if __name__ == "__main__":
    asyncio.run(main())
