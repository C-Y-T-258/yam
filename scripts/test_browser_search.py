"""测试 Playwright 浏览器环境批量搜索的限流情况."""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from yam.crawler.dynamic import DynamicReader, BASE_URL


async def search_one(page, zymc: str) -> dict:
    """在浏览器页面里搜索一个名称."""
    result = await page.evaluate(
        """
        async (zymc) => {
            const formData = new URLSearchParams();
            formData.append('zydm', '');
            formData.append('zymc', zymc);
            formData.append('xwlx', 'xs');
            formData.append('mldm', '');
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
        zymc,
    )
    return result


async def main():
    # 测试 20 个名称
    data = json.loads(Path("data/moe_self_set_names.json").read_text(encoding="utf-8"))
    all_names = data["all_names"]
    test_names = all_names[:20]  # 取前 20 个测试
    print(f"测试 {len(test_names)} 个名称:")

    reader = DynamicReader()
    await reader.init(headless=False)
    try:
        page = await reader.context.new_page()
        await page.goto(f"{BASE_URL}/zsml/", wait_until="load", timeout=60000)
        await page.wait_for_timeout(2000)

        success = 0
        errors = 0
        for i, name in enumerate(test_names):
            result = await search_one(page, name)
            msg = result.get("msg", {})
            if isinstance(msg, str):
                print(f"  [{i+1}] {name}: ERROR - {msg}")
                errors += 1
            else:
                total = msg.get("totalCount", 0)
                majors = msg.get("list", [])
                print(f"  [{i+1}] {name}: total={total}, got={len(majors)}")
                success += 1
            await page.wait_for_timeout(800)  # 0.8s 间隔

        print(f"\n=== 结果 ===")
        print(f"成功: {success}, 错误: {errors}")
        await page.close()
    finally:
        await reader.close()


if __name__ == "__main__":
    asyncio.run(main())
