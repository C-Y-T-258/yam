"""验证合并后的 yaml 文件完整性."""

import yaml
from pathlib import Path

data = yaml.safe_load(Path("data/majors.yaml").read_text(encoding="utf-8"))
cats = data["categories"]
print(f"yaml: {len(cats)} categories, key={list(data.keys())}")
total = sum(len(c.get("majors", [])) for c in cats)
print(f"total majors: {total}")

cat08 = [c for c in cats if c["code"] == "08"][0]
majors_0812 = [m for m in cat08["majors"] if str(m["code"]).startswith("0812")]
print(f"\n=== 0812 under 08: {len(majors_0812)} majors ===")
for m in majors_0812:
    code = m["code"]
    name = m["name"]
    print(f"  {code} {name}")
