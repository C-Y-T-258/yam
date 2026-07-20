"""合并多个探测结果，取并集。"""
import json
from pathlib import Path

results = {}
files = [
    'data/self_set_majors.json',
    'data/self_set_0812_test.json',
    'data/self_set_0812_concurrent_test.json',
]
for f in files:
    p = Path(f)
    if not p.exists():
        continue
    data = json.loads(p.read_text(encoding='utf-8'))
    for prefix, majors in data.items():
        if prefix not in results:
            results[prefix] = []
        existing_codes = {m['code'] for m in results[prefix]}
        for m in majors:
            if m['code'] not in existing_codes:
                results[prefix].append(m)
                existing_codes.add(m['code'])

total = sum(len(v) for v in results.values())
print(f'合并后: {len(results)} 个一级学科, {total} 个自设二级学科')
for prefix in sorted(results.keys()):
    print(f'  {prefix}: {len(results[prefix])} 个')
    for m in results[prefix]:
        print(f'    {m["code"]} {m["name"]}')

Path('data/self_set_majors_merged.json').write_text(
    json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8'
)
print(f'\n已保存到 data/self_set_majors_merged.json')
