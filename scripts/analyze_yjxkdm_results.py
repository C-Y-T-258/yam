"""分析 yjxkdm_all_majors.json 抓取结果."""

import json
from pathlib import Path

data = json.loads(Path("data/yjxkdm_all_majors.json").read_text(encoding="utf-8"))
print(f"抓取到 {len(data)} 个一级学科")
total = 0
for yjxkdm, majors in data.items():
    total += len(majors)
print(f"总计: {total} 个专业\n")

print("=== 0812 计算机科学与技术 ===")
for m in data.get("0812", []):
    print(f"  {m['code']} {m['name']}")

print("\n=== 各学科专业数量分布 ===")
for yjxkdm in sorted(data.keys()):
    majors = data[yjxkdm]
    if majors:
        name = majors[0].get("yjxkmc", "")
        print(f"  {yjxkdm} {name}: {len(majors)}")
