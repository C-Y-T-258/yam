"""对比 yjxkdm_all_majors.json 与现有 majors.ts/yaml，找出增量."""

import json
import re
from pathlib import Path

# 加载抓取结果
fetched = json.loads(Path("data/yjxkdm_all_majors.json").read_text(encoding="utf-8"))
all_fetched = []
for yjxkdm, majors in fetched.items():
    for m in majors:
        all_fetched.append({
            "code": m["code"],
            "name": m["name"],
            "yjxkdm": yjxkdm,
        })

print(f"抓取总数: {len(all_fetched)} 个专业")

# 加载现有 majors.ts 的所有专业代码
ts = Path("yam-desktop/src/data/majors.ts").read_text(encoding="utf-8")
existing_codes = set(re.findall(r"code:\s*'([^']+)'", ts))
print(f"majors.ts 现有: {len(existing_codes)} 个专业代码")

# 找出增量
fetched_codes = {m["code"] for m in all_fetched}
new_codes = fetched_codes - existing_codes
missing_in_fetched = existing_codes - fetched_codes

print(f"\n=== 抓取结果分析 ===")
print(f"  抓取到的独立代码: {len(fetched_codes)}")
print(f"  majors.ts 已有的代码: {len(existing_codes)}")
print(f"  抓取新增（majors.ts 没有）: {len(new_codes)}")
print(f"  majors.ts 有但抓取没有: {len(missing_in_fetched)}")

# 列出新增
if new_codes:
    print(f"\n=== 新增专业（前 50 个）===")
    new_majors = [m for m in all_fetched if m["code"] in new_codes]
    # 按学科分组
    by_discipline: dict[str, list] = {}
    for m in new_majors:
        by_discipline.setdefault(m["yjxkdm"], []).append(m)
    for yjxkdm in sorted(by_discipline.keys()):
        print(f"\n  {yjxkdm}:")
        for m in by_discipline[yjxkdm]:
            print(f"    {m['code']} {m['name']}")

# 找出 totalCount > 10 但只抓到 ≤10 的学科（需要登录补全）
print(f"\n=== 需要登录补全的学科（totalCount > 10）===")
# 从原始日志提取 totalCount
log = Path("C:/Users/12721/AppData/Local/Temp/trae-agent-toolhost/jobs/job-86599835679b4a19ba91169277f20dbe/output.log").read_text(encoding="utf-8")
import re as _re
totals = dict(_re.findall(r"yjxkdm=(\d{4}): totalCount=(\d+)", log))
need_login = []
for yjxkdm_str, total_str in totals.items():
    total = int(total_str)
    fetched_count = len(fetched.get(yjxkdm_str, []))
    if total > 10 and fetched_count < total:
        need_login.append((yjxkdm_str, fetched_count, total))
need_login.sort(key=lambda x: x[2], reverse=True)
print(f"  共 {len(need_login)} 个学科需要登录补全:")
for code, got, total in need_login:
    print(f"    {code}: 抓到 {got}/{total}")
