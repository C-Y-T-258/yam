"""补丁脚本：为 0 majors 的 yjxkdm 注入 fallback major，与原 update_majors_catalog.py 行为一致.

研招网对专业学位（0854 电子信息等）按一级学科招生，
zys.do 返回 totalCount=0 + 空 list 是真实情况，注入 yjxkdm+"00" 作为 fallback。

用法：python scripts/patch_prof_fallback.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from yam.crawler.dynamic import is_professional_degree  # noqa: E402

SRC = Path("D:/data/majors_realtime.json")
DST = Path("d:/yam/data/majors_realtime.json")


def patch() -> None:
    if not SRC.exists():
        print(f"找不到源文件: {SRC}")
        sys.exit(1)

    j = json.loads(SRC.read_text(encoding="utf-8"))

    patched_count = 0
    zero_before = 0
    for cat in j.get("academic_categories", []) + j.get("professional_categories", []):
        for disc in cat.get("disciplines", []):
            if not disc.get("majors"):
                zero_before += 1
                disc["majors"] = [{
                    "code": disc["code"] + "00",
                    "name": disc["name"],
                }]
                patched_count += 1

    DST.parent.mkdir(parents=True, exist_ok=True)
    DST.write_text(
        json.dumps(j, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"修复前 0 majors 数量: {zero_before}")
    print(f"已注入 fallback 的数量: {patched_count}")
    print(f"写入: {DST}")
    print(f"文件大小: {DST.stat().st_size / 1024:.1f} KB")

    # 验证：再次扫描
    j2 = json.loads(DST.read_text(encoding="utf-8"))
    zero_after = 0
    for cat in j2.get("academic_categories", []) + j2.get("professional_categories", []):
        for disc in cat.get("disciplines", []):
            if not disc.get("majors"):
                zero_after += 1
    print(f"修复后 0 majors 数量: {zero_after}")

    # 抽样验证
    print("\n=== 抽样验证 ===")
    for cat in j2.get("academic_categories", []) + j2.get("professional_categories", []):
        for disc in cat.get("disciplines", []):
            if disc["code"] in ("0854", "0251", "0351", "0451"):
                print(f"  [{disc['code']} {disc['name']}] majors={disc['majors']}")


if __name__ == "__main__":
    patch()
