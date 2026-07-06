"""数据采集器 - 支持进度回调."""

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
    """执行采集（在后台线程中运行）."""
    p = get_progress(major_code)
    _log(major_code, f"开始采集 {major_code} {major_info['name']}")

    try:
        crawler = YanZhaoCrawler(major_code, major_info["name"])
        score_crawler = ZhangShangKaoYanCrawler(major_code, major_info["name"])

        schools = crawler.fetch_schools()
        p.total = len(schools)
        _log(major_code, f"共 {len(schools)} 所院校")

        with Database() as db:
            fetched_school_ids = _get_fetched_school_ids(db, major_code, "departments")
            fetched_score_ids = (
                set() if skip_scores else _get_fetched_school_ids(db, major_code, "score_lines")
            )
            updated_at = now_str()

            for i, school in enumerate(schools):
                # 检查是否暂停
                with _lock:
                    if _progress[major_code].status == "paused":
                        _log(major_code, "采集已暂停")
                        return

                school_id = school["school_id"]
                name = school["name"]
                p.current = i + 1
                p.current_school = name

                if school_id in fetched_school_ids:
                    p.skipped += 1
                    _log(major_code, f"[{i+1}/{len(schools)}] {name} 跳过（已存在）")
                    continue

                _log(major_code, f"[{i+1}/{len(schools)}] {name} 采集中...")

                try:
                    departments = crawler.fetch_departments(school)
                    db.save_school(major_code, school, updated_at)
                    for dept in departments:
                        db.save_department(major_code, school_id, dept, updated_at)
                    db.log_fetch(major_code, school_id, "departments", "success")
                    p.success += 1
                    _log(major_code, f"  院系 OK ({len(departments)} 个)")
                except Exception as e:
                    db.log_fetch(major_code, school_id, "departments", "failed", str(e))
                    p.failed += 1
                    _log(major_code, f"  院系失败: {str(e)[:60]}")
                    continue

                if skip_scores or school_id in fetched_score_ids:
                    continue

                try:
                    scores = score_crawler.fetch_score_lines(school, target_years)
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
                    _log(major_code, f"  分数线 {len(scores)} 条")
                except Exception as e:
                    db.log_fetch(major_code, school_id, "score_lines", "failed", str(e))
                    p.score_failed += 1
                    _log(major_code, f"  分数线失败: {str(e)[:60]}")

            db.save_snapshot(major_code, major_info["name"], school_count=p.success, source="yanzhao")

        p.status = "done"
        p.finished_at = now_str()
        _log(major_code, f"采集完成: 成功 {p.success}, 失败 {p.failed}, 跳过 {p.skipped}")

    except Exception as e:
        p.status = "error"
        p.error = str(e)
        p.finished_at = now_str()
        _log(major_code, f"采集异常: {str(e)}")


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
