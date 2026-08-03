"""数据采集器 - 支持进度回调.

ISSUE-029：套用 ISSUE-023 的 httpx 并发方案，单专业采集 15-25min → 3-5min。
两阶段并发：fetch_departments_batch + fetch_score_lines_batch，各 15 并发。
"""

import asyncio
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from yam.config import config
from yam.crawler.yanzhao import YanZhaoCrawler
from yam.crawler.zhangshangkaoyan import ZhangShangKaoYanCrawler
from yam.storage.db import Database
from yam.utils import now_str


@dataclass
class FetchProgress:
    """采集进度."""
    major_code: str
    major_name: str
    status: str = "idle"  # idle / running / paused / done / error
    total: int = 0
    current: int = 0
    success: int = 0
    failed: int = 0
    skipped: int = 0
    score_success: int = 0
    score_failed: int = 0
    current_school: str = ""
    logs: list[str] = field(default_factory=list)
    error: str = ""
    started_at: str = ""
    finished_at: str = ""


# 全局进度存储 {major_code: FetchProgress}
_progress: dict[str, FetchProgress] = {}
_lock = threading.Lock()


def get_progress(major_code: str) -> FetchProgress:
    """获取指定专业的采集进度."""
    with _lock:
        if major_code not in _progress:
            _progress[major_code] = FetchProgress(major_code=major_code, major_name="")
        return _progress[major_code]


def _log(major_code: str, msg: str) -> None:
    """添加日志."""
    with _lock:
        p = _progress[major_code]
        timestamp = time.strftime("%H:%M:%S")
        p.logs.append(f"[{timestamp}] {msg}")
        # 只保留最后50条
        if len(p.logs) > 50:
            p.logs = p.logs[-50:]


def start_fetch(
    major_code: str,
    years: list[int] | None = None,
    skip_scores: bool = False,
) -> None:
    """在后台线程启动采集."""
    with _lock:
        p = _progress.get(major_code)
        if p and p.status == "running":
            return  # 已在运行

    target_years = years or [2026, 2025, 2024, 2023]
    major_info = config.get_major(major_code)
    if not major_info:
        with _lock:
            _progress[major_code] = FetchProgress(
                major_code=major_code,
                major_name="",
                status="error",
                error=f"未知专业代码 {major_code}",
            )
        return

    with _lock:
        _progress[major_code] = FetchProgress(
            major_code=major_code,
            major_name=major_info["name"],
            status="running",
            started_at=now_str(),
        )

    thread = threading.Thread(
        target=_run_fetch,
        args=(major_code, major_info, target_years, skip_scores),
        daemon=True,
    )
    thread.start()


def _run_fetch(
    major_code: str,
    major_info: dict[str, Any],
    target_years: list[int],
    skip_scores: bool,
) -> None:
    """执行采集（在后台线程中运行）.

    ISSUE-029：内部用 asyncio.run 调用异步并发逻辑。
    """
    try:
        asyncio.run(
            _run_fetch_async(major_code, major_info, target_years, skip_scores)
        )
    except Exception as e:
        p = get_progress(major_code)
        p.status = "error"
        p.error = str(e)
        p.finished_at = now_str()
        _log(major_code, f"采集异常: {str(e)}")


async def _run_fetch_async(
    major_code: str,
    major_info: dict[str, Any],
    target_years: list[int],
    skip_scores: bool,
) -> None:
    """ISSUE-029 异步并发采集核心逻辑（NiceGUI web UI 版本）.

    两阶段并发，与 cli._fetch_async 逻辑一致，但进度更新到 _progress 字典
    而非输出 YAM_PROGRESS 行。暂停检查放在阶段之间。
    """
    p = get_progress(major_code)
    _log(major_code, f"开始采集 {major_code} {major_info['name']}")

    crawler = YanZhaoCrawler(major_code, major_info["name"])
    score_crawler = ZhangShangKaoYanCrawler(major_code, major_info["name"])

    schools = crawler.fetch_schools()
    _log(major_code, f"共 {len(schools)} 所院校")

    with Database() as db:
        fetched_school_ids = _get_fetched_school_ids(db, major_code, "departments")
        score_years = (
            {
                school["school_id"]: db.get_pending_score_years(
                    major_code, school["school_id"], target_years, score_crawler.source
                )
                for school in schools
            }
            if not skip_scores else {}
        )
        updated_at = now_str()

        # 院系和分数分别计算待采集合，避免院系已成功后无法补采缺失分数年份。
        pending_schools = [s for s in schools if s["school_id"] not in fetched_school_ids]
        skipped_count = len(schools) - len(pending_schools)
        score_pending = (
            [s for s in schools if score_years.get(s["school_id"])]
            if not skip_scores else []
        )

        # 总任务数 = 院系阶段 + 分数线阶段
        total_tasks = len(pending_schools) + len(score_pending)
        p.total = total_tasks
        p.skipped = skipped_count
        _log(
            major_code,
            f"待采集院系 {len(pending_schools)} 所，跳过 {skipped_count} 所，"
            f"待采集分数线 {len(score_pending)} 所",
        )

        # ===== 阶段 1：并发获取院系所（三阶段降级重试）=====
        if pending_schools:
            _log(major_code, f"阶段 1/2：并发获取院系所（{len(pending_schools)} 所，三阶段降级）...")

            def _dept_progress(current: int, total: int, name: str) -> None:
                p.current = current
                p.current_school = name

            def _dept_log(level: str, msg: str) -> None:
                _log(major_code, f"  [{level}] {msg}")

            depts_map, depts_errors = await crawler.fetch_departments_with_retries(
                pending_schools,
                on_progress=_dept_progress,
                on_log=_dept_log,
            )

            for school in pending_schools:
                school_id = school["school_id"]
                name = school["name"]
                if school_id not in depts_map:
                    err_msg = depts_errors.get(school_id, "未知失败")
                    db.log_fetch(major_code, school_id, "departments", "failed", err_msg)
                    p.failed += 1
                    _log(major_code, f"  {name} 院系失败: {err_msg[:60]}")
                    continue
                depts = depts_map[school_id]
                try:
                    db.save_school(major_code, school, updated_at)
                    for dept in depts:
                        db.save_department(major_code, school_id, dept, updated_at)
                    db.log_fetch(major_code, school_id, "departments", "success")
                    p.success += 1
                    _log(major_code, f"  {name} 院系 OK ({len(depts)} 个)")
                except Exception as e:
                    db.log_fetch(major_code, school_id, "departments", "failed", str(e))
                    p.failed += 1
                    _log(major_code, f"  {name} 写入失败: {str(e)[:60]}")

        # 暂停检查（阶段之间）
        with _lock:
            if _progress[major_code].status == "paused":
                _log(major_code, "采集已暂停（院系阶段完成，分数线阶段未开始）")
                return

        # ===== 阶段 2：并发获取分数线 =====
        if score_pending:
            offset = len(pending_schools)
            _log(
                major_code,
                f"阶段 2/2：并发获取分数线（{len(score_pending)} 所 × {len(target_years)} 年，15 并发）...",
            )

            def _score_progress(current: int, total: int, name: str) -> None:
                p.current = offset + current
                p.current_school = name

            score_requests = [dict(s, _score_years=score_years.get(s["school_id"], target_years)) for s in score_pending]
            score_result = await score_crawler.fetch_score_lines_batch(
                score_requests, target_years, on_progress=_score_progress, return_status=True
            )
            scores_map = score_result["scores"]
            score_statuses = score_result["statuses"]

            for school in score_pending:
                school_id = school["school_id"]
                name = school["name"]
                if school_id not in scores_map:
                    for year, state in score_statuses.get(school_id, {}).items():
                        db.save_score_request_status(major_code, school_id, year, score_crawler.source, state["status"], state.get("error"))
                    db.log_fetch(
                        major_code, school_id, "score_lines", "failed",
                        "school_id 未找到或网络错误",
                    )
                    p.score_failed += 1
                    _log(major_code, f"  {name} 分数线失败")
                    continue
                scores = scores_map.get(school_id, [])
                try:
                    for year, state in score_statuses.get(school_id, {}).items():
                        db.save_score_request_status(major_code, school_id, year, score_crawler.source, state["status"], state.get("error"))
                    for score in scores:
                        db.save_score_line(
                            major_code,
                            school_id,
                            score["department_id"],
                            score["year"],
                            score,
                            score_crawler.source,
                            updated_at,
                        )
                    db.log_fetch(major_code, school_id, "score_lines", "success")
                    p.score_success += 1
                    _log(major_code, f"  {name} 分数线 {len(scores)} 条")
                except Exception as e:
                    db.log_fetch(major_code, school_id, "score_lines", "failed", str(e))
                    p.score_failed += 1
                    _log(major_code, f"  {name} 分数线写入失败: {str(e)[:60]}")

        db.save_snapshot(major_code, major_info["name"], school_count=p.success, source="yanzhao")

    p.status = "done"
    p.finished_at = now_str()
    _log(major_code, f"采集完成: 成功 {p.success}, 失败 {p.failed}, 跳过 {p.skipped}")


def pause_fetch(major_code: str) -> None:
    """暂停采集."""
    with _lock:
        if major_code in _progress and _progress[major_code].status == "running":
            _progress[major_code].status = "paused"
            _log(major_code, "用户暂停采集")


def resume_fetch(major_code: str) -> None:
    """恢复采集（重新启动）."""
    with _lock:
        if major_code in _progress and _progress[major_code].status == "paused":
            _progress[major_code].status = "idle"
    start_fetch(major_code)


def _get_fetched_school_ids(db: Database, major_code: str, task_type: str) -> set[str]:
    rows = db.conn.execute(
        "SELECT school_id FROM fetch_log WHERE major_code = ? AND task_type = ? AND status = 'success'",
        (major_code, task_type),
    ).fetchall()
    return {row["school_id"] for row in rows if row["school_id"]}
