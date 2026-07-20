"""测试研招网 zys.do 接口能否按一级学科代码（yjxkdm）列出所有二级学科.

之前的 discover_self_set_majors 脚本是"猜测代码再验证"，覆盖率低。
本脚本测试另一种方式：传入空的 zydm + yjxkdm，看能否一次性返回该学科下所有专业。
"""

import asyncio
import json
import sys
from pathlib import Path

# 复用项目内的 DynamicReader
sys.path.insert(0, str(Path(__file__).parent.parent))

from yam.crawler.dynamic import DynamicReader, BASE_URL


async def test_list_by_yjxkdm(reader: DynamicReader, yjxkdm: str) -> dict:
    """测试传入 yjxkdm 而不是 zydm，看能否列出该学科下所有专业."""
    page = await reader.context.new_page()
    try:
        await page.goto(f"{BASE_URL}/zsml/", wait_until="load", timeout=60000)
        await page.wait_for_timeout(2000)
        result = await page.evaluate(
            """
            async (params) => {
                const formData = new URLSearchParams();
                formData.append('zydm', '');           // 空代码
                formData.append('zymc', '');
                formData.append('xwlx', 'xs');          // 学术学位
                formData.append('mldm', params.mldm);
                formData.append('yjxkdm', params.yjxkdm);  // 关键：传入一级学科
                formData.append('xxfs', '');
                formData.append('tydxs', '');
                formData.append('jsggjh', '');
                formData.append('start', '0');
                formData.append('curPage', '1');
                formData.append('pageSize', '100');     // 一次取 100 条
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
            {"yjxkdm": yjxkdm, "mldm": yjxkdm[:2]},
        )
        return result
    finally:
        await page.close()


async def main():
    reader = DynamicReader()
    await reader.init(headless=False)
    try:
        # 测试 0812 计算机科学与技术
        print("=== 测试 0812 计算机科学与技术 ===")
        result = await test_list_by_yjxkdm(reader, "0812")
        msg = result.get("msg", {})
        if isinstance(msg, str):
            print(f"ERROR: msg is string: {msg}")
            return
        total = msg.get("totalCount", 0)
        majors = msg.get("list", [])
        print(f"totalCount: {total}, list size: {len(majors)}")
        if majors:
            print("前 5 条:")
            for m in majors[:5]:
                print(f"  {m.get('zydm')} {m.get('zymc')} (xwlx={m.get('xwlx')})")
            print("所有 zydm:")
            codes = sorted({m.get('zydm', '') for m in majors})
            print(f"  共 {len(codes)} 个不同 zydm")
            for c in codes:
                print(f"    {c}")

        # 保存完整结果
        out = Path("data/yjxkdm_0812_test.json")
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n完整结果已保存到 {out}")
    finally:
        await reader.close()


if __name__ == "__main__":
    asyncio.run(main())
