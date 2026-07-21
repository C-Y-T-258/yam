"""检查最新跑出的 majors_realtime.json 数据质量."""
import json
import os
import sys
import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from yam.crawler.dynamic import is_professional_degree  # noqa: E402

p = Path("d:/yam/data/majors_realtime.json")
mtime = datetime.datetime.fromtimestamp(os.path.getmtime(p))
print(f"文件修改时间: {mtime}")
print(f"文件大小: {p.stat().st_size / 1024:.1f} KB")
print()

j = json.loads(p.read_text(encoding="utf-8"))
print(f"total_yjxkdm: {j.get('total_yjxkdm')}")
print(f"success_yjxkdm: {j.get('success_yjxkdm')}")
print(f"is_partial: {j.get('is_partial')}")
print(f"failed: {len(j.get('failed', []))}")
print()

# 统计每个 yjxkdm
stats = []
for cat in j.get("academic_categories", []) + j.get("professional_categories", []):
    for disc in cat.get("disciplines", []):
        code = disc["code"]
        name = disc["name"]
        majors = disc.get("majors", [])
        is_prof = is_professional_degree(code + "00")
        is_fallback = (
            len(majors) == 1
            and majors[0].get("code") == code + "00"
            and majors[0].get("name") == name
        )
        stats.append({
            "code": code, "name": name, "n_majors": len(majors),
            "is_prof": is_prof, "is_fallback": is_fallback,
        })

total = len(stats)
total_majors = sum(s["n_majors"] for s in stats)
n_0 = sum(1 for s in stats if s["n_majors"] == 0)
n_fb = sum(1 for s in stats if s["is_fallback"])
n_real = sum(1 for s in stats if s["n_majors"] > 1 or (s["n_majors"] == 1 and not s["is_fallback"]))

print(f"总 yjxkdm 数: {total}")
print(f"总 majors 数: {total_majors}")
print(f"0 majors: {n_0}")
print(f"fallback (1 major = yjxkdm+00): {n_fb}")
print(f"实际有专业数据 (>=1 真实): {n_real}")
print()

# 学术 vs 专业
prof_total = sum(1 for s in stats if s["is_prof"])
prof_fb = sum(1 for s in stats if s["is_prof"] and s["is_fallback"])
prof_real = sum(1 for s in stats if s["is_prof"] and not s["is_fallback"] and s["n_majors"] > 0)
print(f"专业学位: 总 {prof_total}, fallback {prof_fb}, 实际数据 {prof_real}")

acad_fb = [s for s in stats if not s["is_prof"] and s["is_fallback"]]
print(f"学术学位 fallback: {len(acad_fb)} 个")
print()

# 关键对比：检查之前问题 yjxkdm 的修复情况
print("=== 关键 yjxkdm 修复验证 ===")
key_codes = ["0270", "0307", "0770", "0779", "0860", "0302", "0301", "0202", "0854", "0251"]
for s in stats:
    if s["code"] in key_codes:
        flag = "[FB]" if s["is_fallback"] else ("[0]" if s["n_majors"] == 0 else "[OK]")
        print(f"  {flag} {s['code']} {s['name']}: {s['n_majors']} majors")

# 对比之前版本（修复后写入的 D:\data\majors_realtime.json）
print()
print("=== 与之前 D:\\data\\ 版本对比 ===")
p_old = Path("D:/data/majors_realtime.json")
if p_old.exists():
    old = json.loads(p_old.read_text(encoding="utf-8"))
    old_map = {}
    for cat in old.get("academic_categories", []) + old.get("professional_categories", []):
        for disc in cat.get("disciplines", []):
            old_map[disc["code"]] = len(disc.get("majors", []))
    same = more = less = 0
    diffs = []
    for s in stats:
        old_n = old_map.get(s["code"], 0)
        new_n = s["n_majors"]
        if new_n > old_n:
            more += 1
            diffs.append((s["code"], s["name"], old_n, new_n, "+"))
        elif new_n < old_n:
            less += 1
            diffs.append((s["code"], s["name"], old_n, new_n, "-"))
        else:
            same += 1
    print(f"相同: {same}, 这次更多: {more}, 这次更少: {less}")
    print()
    print("差异最大的 15 个:")
    diffs.sort(key=lambda x: abs(x[3] - x[2]), reverse=True)
    for code, name, o, n, sign in diffs[:15]:
        print(f"  {code} {name}: {o} → {n} ({sign}{abs(n-o)})")
else:
    print("D:/data/majors_realtime.json 不存在")
