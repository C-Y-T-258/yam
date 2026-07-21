"""对比新旧两个文件中专业学位 yjxkdm 的 majors 数据."""
import json
from pathlib import Path

p_old = Path("d:/yam/data/majors_realtime.json")
p_new = Path("D:/data/majors_realtime.json")

old = json.loads(p_old.read_text(encoding="utf-8"))
new = json.loads(p_new.read_text(encoding="utf-8"))


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

# 找出专业学位（0854, 0251 等）
from yam.crawler.dynamic import is_professional_degree
import sys
sys.path.insert(0, "d:/yam")

prof_codes = [c for c in old_map.keys() if is_professional_degree(c + "00")]
print(f"专业学位 yjxkdm 数: {len(prof_codes)}")
print()

# 对比每个专业学位的 majors 数量
print(f"{'代码':<8} {'名称':<24} {'原数量':>6} {'新数量':>6} {'差异':>6}")
diffs = []
for code in sorted(prof_codes):
    old_n = len(old_map.get(code, {}).get("majors", []))
    new_n = len(new_map.get(code, {}).get("majors", []))
    diff = new_n - old_n
    name = old_map.get(code, {}).get("name", "?")
    if diff != 0:
        diffs.append((code, name, old_n, new_n, diff))
    print(f"{code:<8} {name[:22]:<24} {old_n:>6} {new_n:>6} {diff:>+6}")

print()
print(f"差异不为 0 的专业学位数: {len(diffs)}")
print()

# 抽样几个专业学位看原文件的 majors 内容
print("=== 原文件中抽样专业学位的 majors 内容 ===")
sample_codes = ["0854", "0251", "0351", "0451"]
for code in sample_codes:
    if code in old_map:
        print(f"\n[{code} {old_map[code]['name']}] (共 {len(old_map[code]['majors'])} 个 majors)")
        for m in old_map[code]["majors"][:5]:
            print(f"  {m.get('code', '')}  {m.get('name', '')}")

# 抽样新文件
print("\n=== 新文件中抽样专业学位的 majors 内容 ===")
for code in sample_codes:
    if code in new_map:
        print(f"\n[{code} {new_map[code]['name']}] (共 {len(new_map[code]['majors'])} 个 majors)")
        for m in new_map[code]["majors"][:5]:
            print(f"  {m.get('code', '')}  {m.get('name', '')}")
