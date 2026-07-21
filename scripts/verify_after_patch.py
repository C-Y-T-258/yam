"""验证修复后的文件与原文件（已被覆盖前的版本，使用 git history）的对比."""
import json
import subprocess
from pathlib import Path

# 修复后的文件
new_path = Path("d:/yam/data/majors_realtime.json")
new = json.loads(new_path.read_text(encoding="utf-8"))

# 通过 git 拿修复前的版本
import os
os.chdir("d:/yam")
result = subprocess.run(
    ["git", "show", "HEAD:data/majors_realtime.json"],
    capture_output=True, text=True, encoding="utf-8",
)
old = json.loads(result.stdout)


def collect_by_yjxkdm(j):
    out = {}
    for cat in j.get("academic_categories", []) + j.get("professional_categories", []):
        for disc in cat.get("disciplines", []):
            out[disc["code"]] = {
                "name": disc["name"],
                "majors": disc.get("majors", []),
            }
    return out


old_map = collect_by_yjxkdm(old)
new_map = collect_by_yjxkdm(new)

print(f"原文件 yjxkdm 数: {len(old_map)}")
print(f"新文件 yjxkdm 数: {len(new_map)}")
print()

# 全量对比：每个 yjxkdm 的 majors 数量
all_codes = sorted(set(old_map.keys()) | set(new_map.keys()))
better = []
worse = []
same = []
for code in all_codes:
    old_n = len(old_map.get(code, {}).get("majors", []))
    new_n = len(new_map.get(code, {}).get("majors", []))
    if new_n > old_n:
        better.append((code, old_map.get(code, {}).get("name", ""), old_n, new_n))
    elif new_n < old_n:
        worse.append((code, old_map.get(code, {}).get("name", ""), old_n, new_n))
    else:
        same.append(code)

print(f"=== 对比结果 ===")
print(f"新文件 > 原文件: {len(better)} 个")
print(f"新文件 = 原文件: {len(same)} 个")
print(f"新文件 < 原文件: {len(worse)} 个")
print()

if better:
    print(f"--- 新文件数据更多的（Top 10） ---")
    better.sort(key=lambda x: x[3] - x[2], reverse=True)
    for code, name, o, n in better[:10]:
        print(f"  {code} {name}: {o} → {n} (+{n-o})")

if worse:
    print(f"\n--- 新文件数据更少的（全部） ---")
    worse.sort(key=lambda x: x[2] - x[3], reverse=True)
    for code, name, o, n in worse[:20]:
        print(f"  {code} {name}: {o} → {n} (-{o-n})")

# 总 majors 数
old_total = sum(len(v["majors"]) for v in old_map.values())
new_total = sum(len(v["majors"]) for v in new_map.values())
print(f"\n总 majors 数: 原 {old_total} → 新 {new_total} (差 {new_total-old_total})")
