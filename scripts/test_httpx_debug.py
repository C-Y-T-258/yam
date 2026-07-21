"""E2-D: 深入调研为何 httpx 拿到比 Playwright 少.

思路：在同一个 Playwright session 中，
1. 用 page.evaluate(fetch) 调 zys.do（拿 Playwright 结果）
2. 立即用 httpx + 同样的 cookies 调同一 zys.do（拿 httpx 结果）
3. 对比两边返回的 list/totalCount

如果两边一致，说明 httpx 本身能复现 Playwright 行为；
如果 httpx 少了，说明差异在请求本身（headers/TLS/HTTP版本）。
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from urllib.parse import urlencode

import httpx

BASE_URL = "https://yz.chsi.com.cn"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


async def main() -> None:
    from playwright.async_api import async_playwright

    cookie_file = Path.home() / ".yam" / "cookies" / "yz.chsi.com.cn.json"
    saved_cookies = json.loads(cookie_file.read_text(encoding="utf-8")) if cookie_file.exists() else []

    yjxkdm = "0202"
    xwlx = "xs"
    mldm = "02"
    initial_zydm = yjxkdm + "00"
    detail_url = (
        f"{BASE_URL}/zsml/zydetail.do?"
        f"zydm={initial_zydm}&zymc=&xwlx={xwlx}&mldm={mldm}&mlmc="
        f"&yjxkdm={yjxkdm}&yjxkmc=&xxfs=1"
    )

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            context = await browser.new_context(user_agent=UA)
            if saved_cookies:
                await context.add_cookies(saved_cookies)

            page = await context.new_page()
            # 1. 访问 zsml + 详情页
            await page.goto(f"{BASE_URL}/zsml/", wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(150)
            await page.goto(detail_url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(300)

            # 2. 拿 document.cookie（浏览器实际带的）
            doc_cookie = await page.evaluate("document.cookie")
            print(f"document.cookie: {doc_cookie[:200]}...")

            # 3. 拿 context.cookies()（所有 cookies）
            all_cookies = await context.cookies()
            cookie_dict = {
                c["name"]: c["value"]
                for c in all_cookies
                if "chsi.com.cn" in c.get("domain", "") and c.get("value")
            }
            print(f"context.cookies() count: {len(cookie_dict)}")
            print(f"  cookie names: {sorted(cookie_dict.keys())}")

            # 4. 用 page.evaluate(fetch) 调 zys.do（Playwright 原生）
            params = {
                "zydm": initial_zydm, "zymc": "", "xwlx": xwlx, "mldm": mldm,
                "yjxkdm": yjxkdm, "xxfs": "", "tydxs": "", "jsggjh": "",
                "start": "0", "curPage": "1", "pageSize": "10",
                "totalPage": "0", "totalCount": "0",
            }
            playwright_result = await page.evaluate(
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
            pw_msg = playwright_result.get("msg", {})
            pw_list = pw_msg.get("list", []) if isinstance(pw_msg, dict) else []
            pw_total = pw_msg.get("totalCount", 0) if isinstance(pw_msg, dict) else 0
            print(f"\n[Playwright] zydm={initial_zydm}: list={len(pw_list)} total={pw_total}")

            # 5. 立即用 httpx + 同样的 cookies 调同一 zys.do
            async with httpx.AsyncClient(
                http2=False,
                follow_redirects=True,
                headers={"User-Agent": UA},
                cookies=cookie_dict,
            ) as client:
                api_url = f"{BASE_URL}/zsml/rs/zys.do"
                data = {
                    "zydm": initial_zydm, "zymc": "", "xwlx": xwlx, "mldm": mldm,
                    "yjxkdm": yjxkdm, "xxfs": "", "tydxs": "", "jsggjh": "",
                    "start": "0", "curPage": "1", "pageSize": "10",
                    "totalPage": "0", "totalCount": "0",
                }
                # 5a. 最小 headers（只加 Playwright 中显式声明的）
                headers_min = {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": f"{BASE_URL}/zsml/",
                    "User-Agent": UA,
                }
                r = await client.post(api_url, content=urlencode(data), headers=headers_min, timeout=30.0)
                print(f"\n[httpx min headers] status={r.status_code}")
                try:
                    result = r.json()
                    msg = result.get("msg", {})
                    if isinstance(msg, dict):
                        print(f"  list={len(msg.get('list', []))} total={msg.get('totalCount', 0)}")
                    else:
                        print(f"  msg={msg}")
                except Exception as e:
                    print(f"  JSON 解析失败: {e}, body={r.text[:300]}")

                # 5b. 完整 headers（加 X-Requested-With 等）
                headers_full = {
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest",
                    "Accept": "application/json, text/plain, */*",
                    "Referer": f"{BASE_URL}/zsml/",
                    "Origin": BASE_URL,
                    "User-Agent": UA,
                }
                r = await client.post(api_url, content=urlencode(data), headers=headers_full, timeout=30.0)
                print(f"\n[httpx full headers] status={r.status_code}")
                try:
                    result = r.json()
                    msg = result.get("msg", {})
                    if isinstance(msg, dict):
                        print(f"  list={len(msg.get('list', []))} total={msg.get('totalCount', 0)}")
                    else:
                        print(f"  msg={msg}")
                except Exception as e:
                    print(f"  JSON 解析失败: {e}, body={r.text[:300]}")

                # 5c. 加 Sec-Fetch-* headers（模拟浏览器自动加的）
                headers_browser = {
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest",
                    "Accept": "application/json, text/plain, */*",
                    "Referer": f"{BASE_URL}/zsml/",
                    "Origin": BASE_URL,
                    "User-Agent": UA,
                    "Sec-Fetch-Site": "same-origin",
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Dest": "empty",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                }
                r = await client.post(api_url, content=urlencode(data), headers=headers_browser, timeout=30.0)
                print(f"\n[httpx browser-like headers] status={r.status_code}")
                try:
                    result = r.json()
                    msg = result.get("msg", {})
                    if isinstance(msg, dict):
                        print(f"  list={len(msg.get('list', []))} total={msg.get('totalCount', 0)}")
                    else:
                        print(f"  msg={msg}")
                except Exception as e:
                    print(f"  JSON 解析失败: {e}, body={r.text[:300]}")

            # 6. 再用 Playwright 调一次相同 zydm（验证 session 是否还有效）
            playwright_result2 = await page.evaluate(
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
            pw2_msg = playwright_result2.get("msg", {})
            if isinstance(pw2_msg, str):
                print(f"\n[Playwright 2nd] msg={pw2_msg}（预期：第 2 次同参组合会返回'请登录'）")
            else:
                print(f"\n[Playwright 2nd] list={len(pw2_msg.get('list', []))} total={pw2_msg.get('totalCount', 0)}")

        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
