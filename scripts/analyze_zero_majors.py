"""分析新文件中 0 majors 的 yjxkdm."""
import json
from pathlib import Path

p = Path("D:/data/majors_realtime.json")
j = json.loads(p.read_text(encoding="utf-8"))

# 收集所有 yjxkdm 的 majors 数
all_disciplines = []
for cat in j.get("academic_categories", []) + j.get("professional_categories", []):
    for disc in cat.get("disciplines", []):
        all_disciplines.append({
            "code": disc["code"],
            "name": disc["name"],
            "majors_n": len(disc.get("majors", [])),
        })

# 0 majors 的
zero_majors = [d for d in all_disciplines if d["majors_n"] == 0]
print(f"0 majors 的 yjxkdm 数量: {len(zero_majors)}")
print()

# 按门类代码分组统计
from collections import Counter
ml_count = Counter(d["code"][:2] for d in zero_majors)
print("0 majors 的门类分布:")
for ml, n in sorted(ml_count.items()):
    print(f"  {ml}xx: {n} 个")

print()
print("0 majors 的 yjxkdm 列表:")
for d in zero_majors:
    print(f"  {d['code']} {d['name']}")
