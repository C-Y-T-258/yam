"""分析最新跑出的 majors_realtime.json 数据质量."""
import json
import sys
from pathlib import Path
from collections import Counter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from yam.crawler.dynamic import is_professional_degree  # noqa: E402

p = Path("d:/yam/data/majors_realtime.json")
j = json.loads(p.read_text(encoding="utf-8"))

# 统计每个 yjxkdm 的 majors 数
stats = []
for cat in j.get("academic_categories", []) + j.get("professional_categories", []):
    for disc in cat.get("disciplines", []):
        code = disc["code"]
        name = disc["name"]
        majors = disc.get("majors", [])
        is_prof = is_professional_degree(code + "00")
        # 是否是 fallback（只有一个 major 且 code == yjxkdm+"00"）
        is_fallback = (
            len(majors) == 1
            and majors[0].get("code") == code + "00"
            and majors[0].get("name") == name
        )
        stats.append({
            "code": code,
            "name": name,
            "n_majors": len(majors),
            "is_prof": is_prof,
            "is_fallback": is_fallback,
        })

total = len(stats)
print(f"总 yjxkdm 数: {total}")
print(f"总 majors 数: {sum(s['n_majors'] for s in stats)}")
print()

# 分布
n_0 = sum(1 for s in stats if s["n_majors"] == 0)
n_fallback = sum(1 for s in stats if s["is_fallback"])
n_real = sum(1 for s in stats if s["n_majors"] > 1 or (s["n_majors"] == 1 and not s["is_fallback"]))
print(f"0 majors: {n_0}")
print(f"1 fallback major (按一级学科招生): {n_fallback}")
print(f"实际有专业数据 (>=1 真实 major): {n_real}")
print()

# fallback 分布
print("=== fallback 分布（按门类）===")
fb_by_ml = Counter(s["code"][:2] for s in stats if s["is_fallback"])
for ml, n in sorted(fb_by_ml.items()):
    print(f"  {ml}xx: {n} 个")
print()

# 学术 vs 专业学位
prof_total = sum(1 for s in stats if s["is_prof"])
prof_fb = sum(1 for s in stats if s["is_prof"] and s["is_fallback"])
prof_real = sum(1 for s in stats if s["is_prof"] and not s["is_fallback"] and s["n_majors"] > 0)
prof_zero = sum(1 for s in stats if s["is_prof"] and s["n_majors"] == 0)
print(f"专业学位: 总 {prof_total}, fallback {prof_fb}, 实际数据 {prof_real}, 0 majors {prof_zero}")
print()

# 学术学位中也有 fallback 的（异常情况）
acad_fb = [s for s in stats if not s["is_prof"] and s["is_fallback"]]
print(f"=== 学术学位中的 fallback（异常，可能查询失败）===")
print(f"数量: {len(acad_fb)}")
if acad_fb:
    print(f"代码列表: {[s['code'] for s in acad_fb[:30]]}")
    print()
    print("详细（前 20 个）:")
    for s in acad_fb[:20]:
        print(f"  {s['code']} {s['name']}")

# 抽样几个 yjxkdm 的 majors
print()
print("=== 抽样验证（前 10 个 yjxkdm）===")
for s in stats[:10]:
    flag = "[FB]" if s["is_fallback"] else ("[0]" if s["n_majors"] == 0 else "[OK]")
    print(f"  {flag} {s['code']} {s['name']}: {s['n_majors']} majors")

# 对比之前的修复版本（D:\data\majors_realtime.json）
print()
print("=== 与之前修复版本对比 ===")
p_old = Path("D:/data/majors_realtime.json")
if p_old.exists():
    old = json.loads(p_old.read_text(encoding="utf-8"))
    old_map = {}
    for cat in old.get("academic_categories", []) + old.get("professional_categories", []):
        for disc in cat.get("disciplines", []):
            old_map[disc["code"]] = len(disc.get("majors", []))

    same = 0
    more = 0
    less = 0
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
    print(f"与上次跑的版本（D:\\data\\）对比:")
    print(f"  相同: {same}")
    print(f"  这次更多: {more}")
    print(f"  这次更少: {less}")
    print()
    print("差异最大的 15 个:")
    diffs.sort(key=lambda x: abs(x[3] - x[2]), reverse=True)
    for code, name, o, n, sign in diffs[:15]:
        print(f"  {code} {name}: {o} → {n} ({sign}{abs(n-o)})")
