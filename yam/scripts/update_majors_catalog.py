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
import random
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MAJORS_TS = REPO_ROOT / "yam-desktop" / "src" / "data" / "majors.ts"
OUTPUT_JSON = REPO_ROOT / "data" / "majors_realtime.json"
PARTIAL_JSON = REPO_ROOT / "data" / "majors_realtime.partial.json"
INCREMENTAL_SAVE_INTERVAL = 5  # 每完成 5 个 yjxkdm 保存一次（保留用于单测/兜底）
# ISSUE-023：并发优化参数
# 单 context 多 page 并发，每 page 各自 JSESSIONID，避免"同一会话同参组合"冲突。
# 批间 sleep 避免触发"访问太频繁"限流。
# 实测发现 6 并发会触发限流（5 个返回空、1 个卡在重试），降到 3 并发 + 错开请求。
CONCURRENCY = 3  # 每批并发数（zys.do 按 IP 限流，3 并发 + 错开较安全）
BATCH_PAUSE = 3.0  # 批间 sleep 秒（让限流恢复）
ITEM_STAGGER_MAX = 1.5  # 批内每个 yjxkdm 启动前的随机延迟上限（秒）


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

    # ISSUE-023：过滤掉已完成的，分批并发处理剩余 yjxkdm
    pending = [
        (yjxkdm, yjxkmc, mldm, mlmc)
        for (yjxkdm, yjxkmc, mldm, mlmc) in yjxkdm_list
        if yjxkdm not in completed_codes
    ]
    total_pending = len(pending)
    already_done = total - total_pending
    if already_done > 0:
        print(
            f"YAM_MAJORS_UPDATE_PROGRESS {already_done} {total} 恢复模式：跳过 {already_done} 个已完成",
            flush=True,
        )

    total_batches = (total_pending + CONCURRENCY - 1) // CONCURRENCY

    async def _process_one(
        yjxkdm: str, yjxkmc: str, mldm: str, mlmc: str
    ) -> dict[str, Any]:
        """单个 yjxkdm 并发任务单元：调 search_by_yjxkdm，返回结果或错误.

        同时输出 YAM_MAJORS_UPDATE_BATCH_ITEM 协议行让前端能展示批次内每个 yjxkdm 的实时状态。
        启动前随机 sleep 0~ITEM_STAGGER_MAX 秒错开请求，避免同时打 zys.do 触发"访问太频繁"。
        """
        # 错开请求：随机延迟 0 ~ ITEM_STAGGER_MAX 秒
        if ITEM_STAGGER_MAX > 0:
            stagger = random.uniform(0, ITEM_STAGGER_MAX)
            await asyncio.sleep(stagger)

        # 通知前端：该 yjxkdm 开始处理
        print(
            f"YAM_MAJORS_UPDATE_BATCH_ITEM {yjxkdm} running {yjxkmc}",
            flush=True,
        )
        try:
            result = await searcher.search_by_yjxkdm(yjxkdm)
        except Exception as e:
            print(
                f"YAM_MAJORS_UPDATE_BATCH_ITEM {yjxkdm} failed {e}",
                flush=True,
            )
            return {
                "yjxkdm": yjxkdm,
                "yjxkmc": yjxkmc,
                "mldm": mldm,
                "mlmc": mlmc,
                "error": str(e),
            }

        # 通知前端：该 yjxkdm 完成或需要登录
        if result.get("need_login"):
            print(
                f"YAM_MAJORS_UPDATE_BATCH_ITEM {yjxkdm} failed 需要登录",
                flush=True,
            )
        else:
            majors_count = len(result.get("majors", []))
            print(
                f"YAM_MAJORS_UPDATE_BATCH_ITEM {yjxkdm} done 拿到 {majors_count} 个专业",
                flush=True,
            )
        return {
            "yjxkdm": yjxkdm,
            "yjxkmc": yjxkmc,
            "mldm": mldm,
            "mlmc": mlmc,
            "result": result,
        }

    try:
        processed = already_done
        need_login_break = False

        for batch_start in range(0, total_pending, CONCURRENCY):
            batch = pending[batch_start : batch_start + CONCURRENCY]
            batch_num = batch_start // CONCURRENCY + 1

            # 通知前端：批次开始（含本批 yjxkdm 列表，前端展示 N 个并发项卡片）
            batch_info = json.dumps(
                [{"yjxkdm": y, "yjxkmc": m} for y, m, _, _ in batch],
                ensure_ascii=False,
            )
            print(
                f"YAM_MAJORS_UPDATE_BATCH_START {batch_num} {total_batches} {batch_info}",
                flush=True,
            )
            print(
                f"YAM_MAJORS_UPDATE_PROGRESS {processed} {total} "
                f"批次 {batch_num}/{total_batches} ({len(batch)} 个学科并发)",
                flush=True,
            )

            # 并发执行批次：单 context 多 page，每 page 独立 JSESSIONID
            tasks = [_process_one(*item) for item in batch]
            results = await asyncio.gather(*tasks)

            for r in results:
                processed += 1
                yjxkdm = r["yjxkdm"]
                yjxkmc = r["yjxkmc"]
                mldm = r["mldm"]
                mlmc = r["mlmc"]

                if "error" in r:
                    print(
                        f"YAM_MAJORS_UPDATE_WARN {yjxkdm} 查询失败: {r['error']}",
                        flush=True,
                    )
                    failed.append((yjxkdm, r["error"]))
                    continue

                result = r["result"]
                if result.get("need_login"):
                    print(
                        f"YAM_MAJORS_UPDATE_ERROR 需要登录才能继续查询（在 {yjxkdm} 处中断）",
                        flush=True,
                    )
                    need_login_break = True
                    break

                majors = result.get("majors", [])
                # 调试日志：打印每个 yjxkdm 拿到的专业数（普通 print，不带 YAM_ 前缀，
                # 避免 Rust 端把 WARN 当作失败计入 failed_count）
                print(
                    f"  [debug] {yjxkdm} {yjxkmc} 拿到 {len(majors)} 个专业 "
                    f"(total_count={result.get('total_count')}, "
                    f"fetched={result.get('fetched_count')})",
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

                print(
                    f"YAM_MAJORS_UPDATE_PROGRESS {processed} {total} {yjxkdm} {yjxkmc}",
                    flush=True,
                )

            if need_login_break:
                break

            # 批后增量保存（每批保存一次，比原每 5 个更密集）
            partial_output = _build_catalog_output(
                catalog,
                failed,
                total,
                sorted(completed_codes),
                is_partial=True,
            )
            _atomic_write_json(PARTIAL_JSON, partial_output)
            print(
                f"YAM_MAJORS_UPDATE_PROGRESS {processed} {total} "
                f"(批次 {batch_num} 完成，已保存 {len(completed_codes)} 个学科)",
                flush=True,
            )

            # 批间 sleep 避免限流（最后一批不 sleep）
            if batch_start + CONCURRENCY < total_pending:
                await asyncio.sleep(BATCH_PAUSE)
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
