"""通过 yjxkdm（一级学科代码）从研招网 zys.do 抓取所有二级学科.

这是"按一级学科列出所有专业"的权威方法，比猜测代码准确得多。
- 学术学位：传入 yjxkdm，xwlx=xs
- 专业学位：直接按 4 位代码查询（如 0854），xwlx=zy

研招网每页限制 10 条，需要根据 totalCount 翻页。
"""

import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from yam.crawler.dynamic import DynamicReader, BASE_URL


# 从 majors.ts 提取所有学术学位一级学科代码
def load_first_level_disciplines_from_ts() -> list[tuple[str, str]]:
    """返回 [(yjxkdm, name), ...]，如 [('0101', '哲学'), ('0201', '理论经济学'), ...]"""
    ts_path = Path("yam-desktop/src/data/majors.ts")
    content = ts_path.read_text(encoding="utf-8")
    # 匹配 ACADEMIC_CATEGORIES 数组里每个 discipline 的 code 和 name
    pairs: list[tuple[str, str]] = []
    # 简单解析：找 discipline 块的 code/name
    pattern = re.compile(
        r"code:\s*'(\d{4})',\s*name:\s*'([^']+)'", re.MULTILINE
    )
    seen = set()
    # 只取 ACADEMIC_CATEGORIES 部分
    academic_match = re.search(
        r"export const ACADEMIC_CATEGORIES.*?\](\s*\],?\s*\])",
        content,
        re.DOTALL,
    )
    academic_text = academic_match.group(0) if academic_match else content
    for m in pattern.finditer(academic_text):
        code, name = m.group(1), m.group(2)
        if code not in seen and not code.endswith("00"):
            # 一级学科代码以 0 结尾的（如 0101、0201）才算一级学科
            # 排除 0270、0471 这种以 70 结尾的"特殊学科"
            seen.add(code)
            pairs.append((code, name))
    return pairs


async def fetch_majors_by_yjxkdm(
    reader: DynamicReader, yjxkdm: str, mldm: str, xwlx: str = "xs"
) -> list[dict]:
    """分页抓取某个一级学科下的所有专业."""
    page = await reader.context.new_page()
    try:
        await page.goto(f"{BASE_URL}/zsml/", wait_until="load", timeout=60000)
        await page.wait_for_timeout(1500)

        all_majors: list[dict] = []
        total = 0
        for cur_page in range(1, 30):  # 最多 30 页 = 300 条
            result = await page.evaluate(
                """
                async (params) => {
                    const formData = new URLSearchParams();
                    formData.append('zydm', '');
                    formData.append('zymc', '');
                    formData.append('xwlx', params.xwlx);
                    formData.append('mldm', params.mldm);
                    formData.append('yjxkdm', params.yjxkdm);
                    formData.append('xxfs', '');
                    formData.append('tydxs', '');
                    formData.append('jsggjh', '');
                    formData.append('start', String((params.page - 1) * 10));
                    formData.append('curPage', String(params.page));
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
                {"yjxkdm": yjxkdm, "mldm": mldm, "xwlx": xwlx, "page": cur_page},
            )
            msg = result.get("msg", {})
            if isinstance(msg, str):
                print(f"  [ERROR] yjxkdm={yjxkdm} page={cur_page}: {msg}")
                break
            majors = msg.get("list", [])
            total = int(msg.get("totalCount", 0))
            all_majors.extend(majors)
            if cur_page == 1:
                print(f"  yjxkdm={yjxkdm}: totalCount={total}")
            if len(majors) < 10 or len(all_majors) >= total:
                break
            await page.wait_for_timeout(500)  # 避免限流
        return all_majors
    finally:
        await page.close()


async def main():
    reader = DynamicReader()
    await reader.init(headless=False)
    try:
        disciplines = load_first_level_disciplines_from_ts()
        print(f"从 majors.ts 加载 {len(disciplines)} 个一级学科")

        all_results: dict[str, list[dict]] = {}
        for code, name in disciplines:
            mldm = code[:2]
            print(f"\n=== 抓取 {code} {name} (mldm={mldm}) ===")
            try:
                majors = await fetch_majors_by_yjxkdm(reader, code, mldm, "xs")
                # 去重 + 按代码排序
                seen = set()
                unique = []
                for m in majors:
                    zydm = m.get("zydm", "")
                    if zydm and zydm not in seen:
                        seen.add(zydm)
                        unique.append({
                            "code": zydm,
                            "name": m.get("zymc", ""),
                            "yjxkdm": code,
                            "yjxkmc": name,
                        })
                all_results[code] = unique
                print(f"  去重后 {len(unique)} 个专业")
                await asyncio.sleep(1.0)  # 学科间间隔 1s 避免限流
            except Exception as e:
                print(f"  [ERROR] {code}: {e}")

        out = Path("data/yjxkdm_all_majors.json")
        out.write_text(json.dumps(all_results, ensure_ascii=False, indent=2), encoding="utf-8")
        total_count = sum(len(v) for v in all_results.values())
        print(f"\n=== 完成 ===")
        print(f"共抓取 {len(all_results)} 个一级学科, {total_count} 个专业")
        print(f"结果已保存到 {out}")
    finally:
        await reader.close()


if __name__ == "__main__":
    asyncio.run(main())
