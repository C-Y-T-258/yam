"""测试研招网 zys.do 按专业名称搜索（zymc 参数）.

策略：传入 zymc=信息安全，看返回什么。
如果按名称搜索能返回所有匹配的专业（含代码），那就能绕过"每学科 10 条"限制。
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from yam.crawler.dynamic import DynamicReader, BASE_URL


async def search_by_name(reader: DynamicReader, zymc: str, mldm: str = ""):
    """按专业名称搜索."""
    page = await reader.context.new_page()
    try:
        await page.goto(f"{BASE_URL}/zsml/", wait_until="load", timeout=60000)
        await page.wait_for_timeout(1500)
        result = await page.evaluate(
            """
            async (params) => {
                const formData = new URLSearchParams();
                formData.append('zydm', '');
                formData.append('zymc', params.zymc);
                formData.append('xwlx', 'xs');
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
            {"zymc": zymc, "mldm": mldm},
        )
        return result
    finally:
        await page.close()


async def main():
    reader = DynamicReader()
    await reader.init(headless=False)
    try:
        # 测试 1: 按名称搜索"信息安全"（不限定门类）
        print("=== 测试 1: zymc=信息安全, mldm='' ===")
        result = await search_by_name(reader, "信息安全", "")
        msg = result.get("msg", {})
        if isinstance(msg, str):
            print(f"  ERROR: {msg}")
        else:
            total = msg.get("totalCount", 0)
            majors = msg.get("list", [])
            print(f"  totalCount={total}, list size={len(majors)}")
            for m in majors:
                print(f"  {m.get('zydm')} {m.get('zymc')} (yjxkdm={m.get('yjxkdm')}, mldm={m.get('mldm')})")

        # 测试 2: 按名称搜索"信息安全"，限定工学（mldm=08）
        print("\n=== 测试 2: zymc=信息安全, mldm=08 ===")
        result = await search_by_name(reader, "信息安全", "08")
        msg = result.get("msg", {})
        if isinstance(msg, str):
            print(f"  ERROR: {msg}")
        else:
            total = msg.get("totalCount", 0)
            majors = msg.get("list", [])
            print(f"  totalCount={total}, list size={len(majors)}")
            for m in majors:
                print(f"  {m.get('zydm')} {m.get('zymc')} (yjxkdm={m.get('yjxkdm')})")

        # 测试 3: 按名称搜索"人工智能"
        print("\n=== 测试 3: zymc=人工智能 ===")
        result = await search_by_name(reader, "人工智能", "")
        msg = result.get("msg", {})
        if isinstance(msg, str):
            print(f"  ERROR: {msg}")
        else:
            total = msg.get("totalCount", 0)
            majors = msg.get("list", [])
            print(f"  totalCount={total}, list size={len(majors)}")
            for m in majors:
                print(f"  {m.get('zydm')} {m.get('zymc')} (yjxkdm={m.get('yjxkdm')}, mldm={m.get('mldm')})")

        # 测试 4: 翻第 2 页看是否被限制
        print("\n=== 测试 4: zymc=人工智能 第 2 页 ===")
        page = await reader.context.new_page()
        try:
            await page.goto(f"{BASE_URL}/zsml/", wait_until="load", timeout=60000)
            await page.wait_for_timeout(1500)
            result = await page.evaluate(
                """
                async () => {
                    const formData = new URLSearchParams();
                    formData.append('zydm', '');
                    formData.append('zymc', '人工智能');
                    formData.append('xwlx', 'xs');
                    formData.append('mldm', '');
                    formData.append('yjxkdm', '');
                    formData.append('xxfs', '');
                    formData.append('tydxs', '');
                    formData.append('jsggjh', '');
                    formData.append('start', '10');
                    formData.append('curPage', '2');
                    formData.append('pageSize', '10');
                    formData.append('totalPage', '0');
                    formData.append('totalCount', '0');
                    const response = await fetch('https://yz.chsi.com.cn/zsml/rs/zys.do', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://yz.chsi.com.cn/zsml/'},
                        body: formData.toString()
                    });
                    return await response.json();
                }
                """,
            )
            msg = result.get("msg", {})
            if isinstance(msg, str):
                print(f"  ERROR (page 2): {msg}")
            else:
                total = msg.get("totalCount", 0)
                majors = msg.get("list", [])
                print(f"  totalCount={total}, list size={len(majors)}")
                for m in majors[:5]:
                    print(f"  {m.get('zydm')} {m.get('zymc')} (yjxkdm={m.get('yjxkdm')})")
        finally:
            await page.close()

    finally:
        await reader.close()


if __name__ == "__main__":
    asyncio.run(main())
