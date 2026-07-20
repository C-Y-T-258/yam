"""测试研招网 zys.do 接口的不同参数组合，看能否绕过 10 条限制.

测试方向：
1. pageSize=50 或 100（看研招网是否真的限制每页 10 条）
2. 不同的 start 偏移（start=0 + pageSize=50）
3. 旧版 queryAction.do GET 接口
4. wap 移动端接口
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from yam.crawler.dynamic import DynamicReader, BASE_URL


async def test_param_combos(reader: DynamicReader, yjxkdm: str = "0812"):
    """测试不同参数组合."""
    page = await reader.context.new_page()
    try:
        await page.goto(f"{BASE_URL}/zsml/", wait_until="load", timeout=60000)
        await page.wait_for_timeout(2000)

        tests = [
            ("pageSize=50", {"pageSize": "50", "start": "0", "curPage": "1"}),
            ("pageSize=100", {"pageSize": "100", "start": "0", "curPage": "1"}),
            ("pageSize=20", {"pageSize": "20", "start": "0", "curPage": "1"}),
            ("pageSize=200", {"pageSize": "200", "start": "0", "curPage": "1"}),
        ]

        for name, params in tests:
            print(f"\n=== {name} ===")
            result = await page.evaluate(
                """
                async (params) => {
                    const formData = new URLSearchParams();
                    formData.append('zydm', '');
                    formData.append('zymc', '');
                    formData.append('xwlx', 'xs');
                    formData.append('mldm', '08');
                    formData.append('yjxkdm', '0812');
                    formData.append('xxfs', '');
                    formData.append('tydxs', '');
                    formData.append('jsggjh', '');
                    formData.append('start', params.start);
                    formData.append('curPage', params.curPage);
                    formData.append('pageSize', params.pageSize);
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
                params,
            )
            msg = result.get("msg", {})
            if isinstance(msg, str):
                print(f"  ERROR: {msg}")
                continue
            total = msg.get("totalCount", 0)
            majors = msg.get("list", [])
            codes = sorted({m.get("zydm", "") for m in majors})
            print(f"  totalCount={total}, list size={len(majors)}, unique codes={len(codes)}")
            if majors:
                print(f"  first 3: {[(m.get('zydm'), m.get('zymc')) for m in majors[:3]]}")
            await page.wait_for_timeout(800)
    finally:
        await page.close()


async def test_query_action_do(reader: DynamicReader, yjxkdm: str = "0812"):
    """测试旧版 queryAction.do GET 接口."""
    page = await reader.context.new_page()
    try:
        # 旧版接口是 GET 请求
        url = f"{BASE_URL}/zsml/queryAction.do?ssdm=&dwmc=&mldm=xsxw&mlmc=&yjxkdm={yjxkdm}&zymc=&xxfs=1&pageno=1"
        print(f"\n=== queryAction.do (GET) ===")
        print(f"  URL: {url}")
        result = await page.evaluate(
            """
            async (url) => {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Referer': 'https://yz.chsi.com.cn/zsml/'
                    }
                });
                return await response.text();
            }
            """,
            url,
        )
        # 这个接口返回 HTML，不是 JSON
        print(f"  Response length: {len(result)}")
        # 提取专业代码
        import re
        codes = re.findall(r'zydm=(\w+)', result)
        unique_codes = sorted(set(codes))
        print(f"  Found {len(unique_codes)} unique zydm in HTML:")
        for c in unique_codes[:20]:
            print(f"    {c}")
    finally:
        await page.close()


async def test_zsml_zyfx_page(reader: DynamicReader, yjxkdm: str = "0812"):
    """测试研招网专业目录页（可能直接列出所有专业）."""
    page = await reader.context.new_page()
    try:
        # 尝试直接访问专业目录查询页
        url = f"{BASE_URL}/zsml/zyfx/index.do?yjxkdm={yjxkdm}"
        print(f"\n=== /zsml/zyfx/index.do ===")
        print(f"  URL: {url}")
        resp = await page.goto(url, wait_until="load", timeout=60000)
        print(f"  Status: {resp.status if resp else 'unknown'}")
        # 抓取页面里的所有专业代码
        html = await page.content()
        import re
        codes = re.findall(r'zydm=(\w+)', html)
        unique_codes = sorted(set(codes))
        print(f"  Found {len(unique_codes)} unique zydm in page HTML")
        # 也找 zymc= 后面的专业名
        names = re.findall(r'zymc=([^&"\']+)', html)
        unique_names = sorted(set(names))[:20]
        print(f"  First 20 names: {unique_names}")
    finally:
        await page.close()


async def main():
    reader = DynamicReader()
    await reader.init(headless=False)
    try:
        await test_param_combos(reader, "0812")
        await test_query_action_do(reader, "0812")
        await test_zsml_zyfx_page(reader, "0812")
    finally:
        await reader.close()


if __name__ == "__main__":
    asyncio.run(main())
