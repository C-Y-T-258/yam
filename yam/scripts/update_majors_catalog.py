"""更新整个专业目录（含 J/Z 自设交叉学科），写入 JSON 文件供桌面端读取.

用法：
    python -m yam.scripts.update_majors_catalog
    python -m yam.scripts.update_majors_catalog --login  # 首次需要登录时
    python -m yam.scripts.update_majors_catalog --resume  # 断点续传（基于已存在的 JSON）

输出协议（stdout）：
    YAM_MAJORS_UPDATE_PROGRESS <current> <total> <name>
    YAM_MAJORS_UPDATE_DONE <json>

完成后会在 d:/yam/data/majors_realtime.json 写入完整目录。
增量保存：每 5 个 yjxkdm 写一次 JSON，中断后可读已爬部分数据。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MAJORS_TS = REPO_ROOT / "yam-desktop" / "src" / "data" / "majors.ts"
OUTPUT_JSON = REPO_ROOT / "data" / "majors_realtime.json"
PARTIAL_JSON = REPO_ROOT / "data" / "majors_realtime.partial.json"
INCREMENTAL_SAVE_INTERVAL = 5  # 每完成 5 个 yjxkdm 保存一次


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


def _build_catalog_output(
    catalog: dict[str, dict[str, Any]],
    failed: list[tuple[str, str]],
    total: int,
    completed_codes: list[str],
    is_partial: bool = False,
) -> dict[str, Any]:
    """根据 catalog 字典构建最终 JSON 输出结构（按学位类型拆分）."""
    from yam.crawler.dynamic import is_professional_degree

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

    return {
        "academic_categories": academic_categories,
        "professional_categories": professional_categories,
        "failed": failed,
        "total_yjxkdm": total,
        "success_yjxkdm": len(completed_codes),
        "completed_yjxkdm": completed_codes,
        "is_partial": is_partial,
    }


def _atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    """原子写入 JSON：先写临时文件，再 rename，避免中断时文件损坏."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(tmp, path)


async def update_all_majors(login: bool = False, resume: bool = False) -> dict[str, Any]:
    """遍历所有 yjxkdm，调 search_by_yjxkdm 拿完整专业列表，返回结构化目录.

    resume=True 时，加载 PARTIAL_JSON 中已完成的 yjxkdm，跳过这些不重跑。
    每完成 INCREMENTAL_SAVE_INTERVAL 个 yjxkdm 写一次 PARTIAL_JSON。
    """
    from yam.majors_searcher import MajorsSearcher
    from yam.crawler.dynamic import (
        _DISCIPLINE_CATEGORIES,
        _FIRST_LEVEL_DISCIPLINES,
        is_professional_degree,
    )

    yjxkdm_list = parse_yjxkdm_list_from_majors_ts()
    total = len(yjxkdm_list)

    # 断点续传：加载已存在的 partial JSON
    catalog: dict[str, dict[str, Any]] = {}
    failed: list[tuple[str, str]] = []
    completed_codes: set[str] = set()
    if resume and PARTIAL_JSON.exists():
        try:
            existing = json.loads(PARTIAL_JSON.read_text(encoding="utf-8"))
            completed_codes = set(existing.get("completed_yjxkdm", []))
            # 重建 catalog dict
            for cat in existing.get("academic_categories", []) + existing.get("professional_categories", []):
                mldm = cat["code"]
                mlmc = cat["name"]
                if mldm not in catalog:
                    catalog[mldm] = {"mlmc": mlmc, "disciplines": {}}
                for disc in cat["disciplines"]:
                    yjxkdm = disc["code"]
                    yjxkmc = disc["name"]
                    if yjxkdm not in catalog[mldm]["disciplines"]:
                        catalog[mldm]["disciplines"][yjxkdm] = {
                            "yjxkmc": yjxkmc,
                            "majors": [],
                        }
                    # 重建 majors 原始字段
                    for m in disc["majors"]:
                        is_prof = is_professional_degree(yjxkdm + "00")
                        catalog[mldm]["disciplines"][yjxkdm]["majors"].append({
                            "zydm": m["code"],
                            "zymc": m["name"],
                            "yjxkdm": yjxkdm,
                            "yjxkmc": yjxkmc,
                            "mldm": mldm,
                            "mlmc": mlmc,
                            "xwlx": "zy" if is_prof else "xs",
                        })
            print(
                f"YAM_MAJORS_UPDATE_PROGRESS 0 {total} 恢复模式：已加载 {len(completed_codes)} 个已完成的 yjxkdm",
                flush=True,
            )
        except Exception as e:
            print(f"YAM_MAJORS_UPDATE_WARN resume 加载失败，重新开始: {e}", flush=True)
            catalog = {}
            failed = []
            completed_codes = set()
    else:
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

    try:
        for idx, (yjxkdm, yjxkmc, mldm, mlmc) in enumerate(yjxkdm_list, 1):
            # 断点续传：跳过已完成的
            if yjxkdm in completed_codes:
                print(
                    f"YAM_MAJORS_UPDATE_PROGRESS {idx} {total} {yjxkdm} {yjxkmc} (跳过已完成)",
                    flush=True,
                )
                continue

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
            # 调试日志：打印每个 yjxkdm 拿到的专业数（普通 print，不带 YAM_ 前缀，
            # 避免 Rust 端把 WARN 当作失败计入 failed_count）
            print(
                f"  [debug] {yjxkdm} {yjxkmc} 拿到 {len(majors)} 个专业 "
                f"(total_count={result.get('total_count')}, fetched={result.get('fetched_count')})",
                flush=True,
            )
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
            completed_codes.add(yjxkdm)

            # 增量保存：每 INCREMENTAL_SAVE_INTERVAL 个 yjxkdm 后写一次 JSON
            if idx % INCREMENTAL_SAVE_INTERVAL == 0:
                partial_output = _build_catalog_output(
                    catalog,
                    failed,
                    total,
                    sorted(completed_codes),
                    is_partial=True,
                )
                _atomic_write_json(PARTIAL_JSON, partial_output)
                print(
                    f"YAM_MAJORS_UPDATE_PROGRESS {idx} {total} {yjxkdm} {yjxkmc} (已保存 {len(completed_codes)} 个学科)",
                    flush=True,
                )

            # 释放事件循环，避免长时间阻塞
            await asyncio.sleep(0.05)
    finally:
        await searcher.close()

    # 构建最终输出
    output = _build_catalog_output(
        catalog,
        failed,
        total,
        sorted(completed_codes),
        is_partial=False,
    )

    # 写入最终 JSON
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    _atomic_write_json(OUTPUT_JSON, output)
    # 清理 partial 文件
    if PARTIAL_JSON.exists():
        try:
            PARTIAL_JSON.unlink()
        except Exception:
            pass

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
    parser.add_argument(
        "--resume",
        action="store_true",
        help="断点续传：加载 majors_realtime.partial.json 中已完成的 yjxkdm",
    )
    args = parser.parse_args()

    try:
        result = asyncio.run(update_all_majors(login=args.login, resume=args.resume))
    except Exception as e:
        print(f"YAM_MAJORS_UPDATE_ERROR {e}", flush=True)
        sys.exit(1)

    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
