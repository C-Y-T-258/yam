"""从 MOE PDF 提取所有自设学科名称，去重统计."""

import json
import re
from pathlib import Path
import pdfplumber


def main():
    pdf_path = Path("data/moe_pdfs/self_set_second_level.pdf")
    all_combos: list[tuple[str, str, str]] = []  # (school, yjxkmc, zymc)
    all_names: set[str] = set()

    with pdfplumber.open(pdf_path) as pdf:
        current_school = ""
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if not row or len(row) < 3:
                        continue
                    school, yjxkmc, zymc = row[0], row[1], row[2]
                    if school and school != "单位名称":
                        current_school = school
                    if yjxkmc and yjxkmc != "一级学科名称" and zymc and zymc != "自设学科名称":
                        all_combos.append((current_school, yjxkmc, zymc))
                        all_names.add(zymc)

    print(f"总记录数: {len(all_combos)}")
    print(f"不同名称数: {len(all_names)}")

    # 按一级学科分组
    by_discipline: dict[str, list[str]] = {}
    for school, yjxkmc, zymc in all_combos:
        by_discipline.setdefault(yjxkmc, set()).add(zymc)  # type: ignore

    print(f"\n一级学科数: {len(by_discipline)}")
    print("\n=== 各一级学科的自设专业数 ===")
    for yjxkmc in sorted(by_discipline.keys()):
        names = by_discipline[yjxkmc]  # type: ignore
        print(f"  {yjxkmc}: {len(names)} 个不同名称")

    # 保存所有名称
    out = Path("data/moe_self_set_names.json")
    out.write_text(
        json.dumps(
            {
                "all_names": sorted(all_names),
                "by_discipline": {k: sorted(v) for k, v in by_discipline.items()},  # type: ignore
                "total_combos": len(all_combos),
                "total_unique_names": len(all_names),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\n结果已保存到 {out}")

    # 重点看计算机科学与技术
    cs_names = by_discipline.get("计算机科学与技术", set())  # type: ignore
    print(f"\n=== 计算机科学与技术（{len(cs_names)} 个名称）===")
    for n in sorted(cs_names):
        print(f"  {n}")


if __name__ == "__main__":
    main()
