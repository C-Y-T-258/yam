"""更新整个专业目录（含 J/Z 自设交叉学科），写入 JSON 文件供桌面端读取.

用法：
    python -m yam.scripts.update_majors_catalog
    python -m yam.scripts.update_majors_catalog --login  # 首次需要登录时

输出协议（stdout）：
    YAM_MAJORS_UPDATE_PROGRESS <current> <total> <name>
    YAM_MAJORS_UPDATE_DONE <json>

完成后会在 d:/yam/data/majors_realtime.json 写入完整目录。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MAJORS_TS = REPO_ROOT / "yam-desktop" / "src" / "data" / "majors.ts"
OUTPUT_JSON = REPO_ROOT / "data" / "majors_realtime.json"


def parse_yjxkdm_list_from_majors_ts() -> list[tuple[str, str, str, str]]:
    """从 yam-desktop/src/data/majors.ts 解析所有 (yjxkdm, yjxkmc, mldm, mlmc) 列表.

    返回 [(yjxkdm, yjxkmc, mldm, mlmc), ...]，去重。

    按行扫描，跟踪当前 category（2 位代码），遇到 4 位代码的 discipline 就记录。
    """
    if not MAJORS_TS.exists():
        raise FileNotFoundError(f"找不到 majors.ts: {MAJORS_TS}")

    content = MAJORS_TS.read_text(encoding="utf-8")

    results: list[tuple[str, str, str, str]] = []
    seen: set[str] = set()

    current_mldm = ""
    current_mlmc = ""

    # 先匹配所有 category 块：code: 'XX', name: 'XXX', disciplines: [
    # 然后在该块内匹配所有 discipline：code: 'XXXX', name: 'XXX'
    # 由于 disciplines 数组嵌套 majors 数组，需要按层级跟踪
    # 简化：用正则匹配每个 category 块的整体范围（从 code: 'XX' 到下一个 code: 'XX' 或文件末尾）
    cat_pattern = re.compile(
        r"code:\s*'(\d{2})',\s*name:\s*'([^']+)',\s*disciplines:\s*\[",
    )
    disc_pattern = re.compile(r"code:\s*'(\d{4})',\s*name:\s*'([^']+)'")

    # 找到所有 category 的位置
    cat_matches = list(cat_pattern.finditer(content))
    for i, cat_m in enumerate(cat_matches):
        mldm = cat_m.group(1)
        mlmc = cat_m.group(2)
        # 该 category 块的范围：从当前匹配结束到下一个 category 匹配开始（或文件末尾）
        start = cat_m.end()
        end = cat_matches[i + 1].start() if i + 1 < len(cat_matches) else len(content)
        block = content[start:end]

        # 在该块内找所有 4 位代码的 discipline
        for d_m in disc_pattern.finditer(block):
            yjxkdm = d_m.group(1)
            yjxkmc = d_m.group(2)
            if yjxkdm in seen:
                continue
            seen.add(yjxkdm)
            results.append((yjxkdm, yjxkmc, mldm, mlmc))

    return results


async def update_all_majors(login: bool = False) -> dict[str, Any]:
    """遍历所有 yjxkdm，调 search_by_yjxkdm 拿完整专业列表，返回结构化目录."""
    from yam.majors_searcher import MajorsSearcher
    from yam.crawler.dynamic import (
        _DISCIPLINE_CATEGORIES,
        _FIRST_LEVEL_DISCIPLINES,
        is_professional_degree,
    )

    yjxkdm_list = parse_yjxkdm_list_from_majors_ts()
    total = len(yjxkdm_list)
    print(f"YAM_MAJORS_UPDATE_PROGRESS 0 {total} 准备开始", flush=True)

    print(f"YAM_MAJORS_UPDATE_PROGRESS 0 {total} 启动浏览器", flush=True)
    searcher = MajorsSearcher(headless=not login)
    await searcher._ensure_browser()
    print(f"YAM_MAJORS_UPDATE_PROGRESS 0 {total} 浏览器就绪", flush=True)

    if login:
        # 首次需要登录：打开可见浏览器，用第一个学科作为登录入口
        print(f"YAM_MAJORS_UPDATE_PROGRESS 0 {total} 等待登录", flush=True)
        logged_in = await searcher.interactive_login(
            major_code_for_login=yjxkdm_list[0][0] + "00"
        )
        if not logged_in:
            print("YAM_MAJORS_UPDATE_ERROR 未检测到登录凭证", flush=True)
            await searcher.close()
            return {"error": "未登录"}
        print(f"YAM_MAJORS_UPDATE_PROGRESS 0 {total} 登录成功", flush=True)

    # 用 mldm 聚合结果：{mldm: {mlmc, disciplines: {yjxkdm: {yjxkmc, majors: [...]}}}}
    catalog: dict[str, dict[str, Any]] = {}
    failed: list[tuple[str, str]] = []

    try:
        for idx, (yjxkdm, yjxkmc, mldm, mlmc) in enumerate(yjxkdm_list, 1):
            # 统一格式：`<current> <total> <yjxkdm> <yjxkmc>`，描述在 Rust 端按需拼接
            print(
                f"YAM_MAJORS_UPDATE_PROGRESS {idx} {total} {yjxkdm} {yjxkmc}",
                flush=True,
            )
            try:
                result = await searcher.search_by_yjxkdm(yjxkdm)
            except Exception as e:
                print(f"YAM_MAJORS_UPDATE_WARN {yjxkdm} 查询失败: {e}", flush=True)
                failed.append((yjxkdm, str(e)))
                continue

            if result.get("need_login"):
                print(
                    f"YAM_MAJORS_UPDATE_ERROR 需要登录才能继续查询（在 {yjxkdm} 处中断）",
                    flush=True,
                )
                break

            majors = result.get("majors", [])
            if not majors:
                # 该学科可能按一级学科招生，用 yjxkdm + "00" 作为兜底
                majors = [{
                    "zydm": yjxkdm + "00",
                    "zymc": yjxkmc,
                    "yjxkdm": yjxkdm,
                    "yjxkmc": yjxkmc,
                    "mldm": mldm,
                    "mlmc": mlmc,
                    "xwlx": "zy" if is_professional_degree(yjxkdm + "00") else "xs",
                }]

            # 聚合到 catalog
            if mldm not in catalog:
                catalog[mldm] = {"mlmc": mlmc, "disciplines": {}}
            if yjxkdm not in catalog[mldm]["disciplines"]:
                catalog[mldm]["disciplines"][yjxkdm] = {
                    "yjxkmc": yjxkmc,
                    "majors": [],
                }
            catalog[mldm]["disciplines"][yjxkdm]["majors"].extend(majors)

            # 释放事件循环，避免长时间阻塞
            await asyncio.sleep(0.1)
    finally:
        await searcher.close()

    # 转换为前端期望的格式：{categories: [{code, name, disciplines: [{code, name, majors: [{code, name}]}]}]}
    # 按学位类型拆分：学术学位（yjxkdm 第 3 位非 "5"）vs 专业学位（第 3 位为 "5"）
    academic_categories: list[dict[str, Any]] = []
    professional_categories: list[dict[str, Any]] = []

    for mldm in sorted(catalog.keys()):
        cat = catalog[mldm]
        academic_disciplines: list[dict[str, Any]] = []
        professional_disciplines: list[dict[str, Any]] = []

        for yjxkdm in sorted(cat["disciplines"].keys()):
            disc = cat["disciplines"][yjxkdm]
            # 按 (zydm, zymc) 去重
            seen: set[tuple[str, str]] = set()
            unique_majors: list[dict[str, str]] = []
            for m in disc["majors"]:
                key = (m["zydm"], m["zymc"])
                if key in seen:
                    continue
                seen.add(key)
                unique_majors.append({"code": m["zydm"], "name": m["zymc"]})
            unique_majors.sort(key=lambda x: x["code"])

            disc_obj = {
                "code": yjxkdm,
                "name": disc["yjxkmc"],
                "majors": unique_majors,
            }
            if is_professional_degree(yjxkdm + "00"):
                professional_disciplines.append(disc_obj)
            else:
                academic_disciplines.append(disc_obj)

        if academic_disciplines:
            academic_categories.append({
                "code": mldm,
                "name": cat["mlmc"],
                "disciplines": academic_disciplines,
            })
        if professional_disciplines:
            professional_categories.append({
                "code": mldm,
                "name": cat["mlmc"],
                "disciplines": professional_disciplines,
            })

    output = {
        "academic_categories": academic_categories,
        "professional_categories": professional_categories,
        "failed": failed,
        "total_yjxkdm": total,
        "success_yjxkdm": total - len(failed),
    }

    # 写入 JSON 文件
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(
        f"YAM_MAJORS_UPDATE_DONE {json.dumps(output, ensure_ascii=False)}",
        flush=True,
    )
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="更新整个专业目录")
    parser.add_argument(
        "--login",
        action="store_true",
        help="首次需要登录时加上此参数",
    )
    args = parser.parse_args()

    try:
        result = asyncio.run(update_all_majors(login=args.login))
    except Exception as e:
        print(f"YAM_MAJORS_UPDATE_ERROR {e}", flush=True)
        sys.exit(1)

    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
