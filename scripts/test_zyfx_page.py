"""测试研招网专业目录页是否直接列出所有专业（无需翻页）."""

import asyncio
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from yam.crawler.dynamic import DynamicReader, BASE_URL


async def main():
    reader = DynamicReader()
    await reader.init(headless=False)
    try:
        page = await reader.context.new_page()
        # 直接访问专业目录查询页（按一级学科）
        url = f"{BASE_URL}/zsml/zyfx/index.do?yjxkdm=0812"
        print(f"=== 测试 /zsml/zyfx/index.do?yjxkdm=0812 ===")
        resp = await page.goto(url, wait_until="load", timeout=60000)
        print(f"Status: {resp.status if resp else 'unknown'}")
        print(f"URL after redirect: {page.url}")
        await page.wait_for_timeout(2000)
        html = await page.content()
        print(f"HTML length: {len(html)}")

        # 提取专业代码
        codes = re.findall(r'zydm=(\w+)', html)
        unique_codes = sorted(set(codes))
        print(f"\nFound {len(unique_codes)} unique zydm in HTML:")
        for c in unique_codes:
            print(f"  {c}")

        # 提取专业名称
        names = re.findall(r'zymc=([^&"\']+)', html)
        unique_names = sorted(set(names))
        print(f"\nFound {len(unique_names)} unique zymc:")
        for n in unique_names:
            print(f"  {n}")

        # 看页面里有没有 list/table 数据
        # 研招网专业目录页通常用 <a> 标签链接到具体专业
        links = re.findall(r'<a[^>]*href="[^"]*zydetail[^"]*"[^>]*>([^<]+)</a>', html)
        print(f"\nFound {len(links)} zydetail links:")
        for l in links[:20]:
            print(f"  {l.strip()}")

        await page.close()

        # 也测试一下 zsml 主页本身的查询表单
        page2 = await reader.context.new_page()
        print(f"\n=== 测试主页 /zsml/ 的专业搜索 ===")
        await page2.goto(f"{BASE_URL}/zsml/", wait_until="load", timeout=60000)
        await page2.wait_for_timeout(2000)
        # 模拟用户选择 0812 并点击查询
        # 看页面调用什么 API、返回什么
        # 监听网络请求
        requests_log = []
        page2.on("response", lambda resp: requests_log.append((resp.url, resp.status)) if "zys" in resp.url or "queryAction" in resp.url else None)
        # 触发查询（如果页面上有按钮）
        # 先简单看 HTML 结构
        html2 = await page2.content()
        print(f"Main page HTML length: {len(html2)}")
        # 找 form action
        forms = re.findall(r'<form[^>]*action="([^"]+)"', html2)
        print(f"Forms: {forms[:5]}")
        await page2.close()

    finally:
        await reader.close()


if __name__ == "__main__":
    asyncio.run(main())
