"""分析批量搜索结果."""
import json
from collections import Counter
from pathlib import Path

data = json.loads(Path("data/moe_majors_with_codes.json").read_text(encoding="utf-8"))
print(f"搜索名称数: {len(data)}")

# 统计结果类型
errors = 0
empty = 0
has_majors = 0
total_count_dist = Counter()
all_codes = set()
all_majors = []

for name, info in data.items():
    if "error" in info:
        errors += 1
        continue
    total = info.get("totalCount", 0)
    majors = info.get("majors", [])
    total_count_dist[total] += 1
    if not majors:
        empty += 1
    else:
        has_majors += 1
        for m in majors:
            if m.get("code"):
                all_codes.add(m["code"])
                all_majors.append(m)

print(f"错误数: {errors}")
print(f"空结果数: {empty}")
print(f"有结果数: {has_majors}")
print(f"独立代码数: {len(all_codes)}")

print(f"\ntotalCount 分布:")
for total, count in sorted(total_count_dist.items())[:20]:
    print(f"  totalCount={total}: {count} 个名称")

# 看有结果的名称
print(f"\n=== 有结果的名称（前 30 个）===")
for name, info in data.items():
    if info.get("majors"):
        majors = info["majors"]
        print(f"  {name} ({info.get('totalCount')}/{len(majors)}):")
        for m in majors[:3]:
            print(f"    {m.get('code')} {m.get('name')} (yjxkdm={m.get('yjxkdm')})")

# 看错误样本
if errors:
    print(f"\n=== 错误样本（前 5 个）===")
    for name, info in data.items():
        if "error" in info:
            print(f"  {name}: {info['error']}")
            if errors > 5:
                break
