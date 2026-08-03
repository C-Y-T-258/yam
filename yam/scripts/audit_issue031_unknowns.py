"""Audit ISSUE-031 unknown/sentinel boundaries without mutating databases.

The script intentionally reports counts and conclusions together so UI/export
cleanup can cite repeatable evidence instead of relying on ad-hoc inspection.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path
from typing import Any


DEFAULT_SOURCE_DB = Path.home() / ".yam" / "data" / "yam.db"
DEFAULT_DESKTOP_DB = Path.home() / ".yam" / "data" / "yam-desktop.db"


def _connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    return row is not None


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    if not _table_exists(conn, table):
        return set()
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}


def _scalar(conn: sqlite3.Connection, sql: str, params: tuple[Any, ...] = ()) -> int:
    value = conn.execute(sql, params).fetchone()[0]
    return int(value or 0)


def _group_counts(conn: sqlite3.Connection, sql: str) -> list[dict[str, Any]]:
    rows = conn.execute(sql).fetchall()
    return [dict(row) for row in rows]


def _numeric_counts(conn: sqlite3.Connection, table: str, column: str) -> dict[str, int]:
    cols = _columns(conn, table)
    if column not in cols:
        return {"present": 0}
    return {
        "present": 1,
        "total_rows": _scalar(conn, f"SELECT COUNT(*) FROM {table}"),
        "null_count": _scalar(conn, f"SELECT COUNT(*) FROM {table} WHERE {column} IS NULL"),
        "zero_count": _scalar(conn, f"SELECT COUNT(*) FROM {table} WHERE {column}=0"),
        "positive_count": _scalar(conn, f"SELECT COUNT(*) FROM {table} WHERE {column}>0"),
    }


def audit_source_db(path: Path) -> dict[str, Any]:
    result: dict[str, Any] = {
        "path": str(path),
        "exists": path.exists(),
        "tables": {},
        "conclusions": {},
    }
    if not path.exists():
        result["conclusions"]["source_db"] = "missing"
        return result

    with _connect(path) as conn:
        for table in ("departments", "score_lines"):
            result["tables"][table] = {
                "exists": _table_exists(conn, table),
                "columns": sorted(_columns(conn, table)),
            }
            if _table_exists(conn, table):
                result["tables"][table]["rows"] = _scalar(conn, f"SELECT COUNT(*) FROM {table}")

        score_counts = {
            column: _numeric_counts(conn, "score_lines", column)
            for column in ("year", "total", "politics", "english", "special_one", "special_two")
        }
        result["score_lines"] = score_counts
        total_counts = score_counts["total"]
        if total_counts.get("present") and total_counts["zero_count"] == 0 and total_counts["null_count"] == 0:
            result["conclusions"]["score_total_zero"] = (
                "sentinel_in_projection: source score_lines.total has no zero/null rows"
            )
        else:
            result["conclusions"]["score_total_zero"] = "requires_manual_review"

        dept_cols = _columns(conn, "departments")
        if "catalog_year" not in dept_cols:
            result["catalog_year"] = {"present": 0}
            result["conclusions"]["catalog_year"] = "source_absent: departments.catalog_year column is not present"
        else:
            catalog = _numeric_counts(conn, "departments", "catalog_year")
            result["catalog_year"] = catalog
            if catalog["positive_count"] == 0:
                result["conclusions"]["catalog_year"] = "source_empty: no positive catalog_year values"
            else:
                result["conclusions"]["catalog_year"] = "source_partial_or_available"

        if "enrollment_count" in dept_cols:
            result["department_enrollment"] = {
                **_numeric_counts(conn, "departments", "enrollment_count"),
                "zero_with_text": _scalar(
                    conn,
                    "SELECT COUNT(*) FROM departments "
                    "WHERE enrollment_count=0 AND COALESCE(enrollment_text, '')<>''",
                )
                if "enrollment_text" in dept_cols
                else 0,
            }

    return result


def audit_desktop_db(path: Path) -> dict[str, Any]:
    result: dict[str, Any] = {
        "path": str(path),
        "exists": path.exists(),
        "tables": {},
        "conclusions": {},
    }
    if not path.exists():
        result["conclusions"]["desktop_db"] = "missing"
        return result

    with _connect(path) as conn:
        for table in (
            "workspace_schools",
            "workspace_plans",
            "workspace_plan_snapshots",
            "workspace_department_years",
            "workspace_score_evidence",
        ):
            result["tables"][table] = {
                "exists": _table_exists(conn, table),
                "columns": sorted(_columns(conn, table)),
            }
            if _table_exists(conn, table):
                result["tables"][table]["rows"] = _scalar(conn, f"SELECT COUNT(*) FROM {table}")

        if _table_exists(conn, "workspace_plan_snapshots"):
            snapshot_total = _scalar(conn, "SELECT COUNT(*) FROM workspace_plan_snapshots")
            result["plan_snapshots"] = {
                "total_rows": snapshot_total,
                "catalog_year_null": _scalar(
                    conn,
                    "SELECT COUNT(*) FROM workspace_plan_snapshots WHERE catalog_year IS NULL",
                ),
                "catalog_year_positive": _scalar(
                    conn,
                    "SELECT COUNT(*) FROM workspace_plan_snapshots WHERE catalog_year>0",
                ),
                "status_counts": _group_counts(
                    conn,
                    "SELECT catalog_year_status AS status, COUNT(*) AS count "
                    "FROM workspace_plan_snapshots GROUP BY catalog_year_status ORDER BY count DESC",
                ),
            }
            if result["plan_snapshots"]["catalog_year_positive"] == 0:
                result["conclusions"]["projected_catalog_year"] = (
                    "all_unknown: desktop snapshots contain no positive catalog_year"
                )
            else:
                result["conclusions"]["projected_catalog_year"] = "partially_available"

        if _table_exists(conn, "workspace_plans"):
            result["workspace_plans_enrollment"] = {
                **_numeric_counts(conn, "workspace_plans", "enrollment_count"),
                "zero_by_status": _group_counts(
                    conn,
                    "SELECT enrollment_count_status AS status, COUNT(*) AS count "
                    "FROM workspace_plans WHERE enrollment_count=0 "
                    "GROUP BY enrollment_count_status ORDER BY count DESC",
                ),
            }

        if _table_exists(conn, "workspace_department_years"):
            result["department_years"] = {
                "min_score": _numeric_counts(conn, "workspace_department_years", "min_score"),
                "component_zero_by_scope": _group_counts(
                    conn,
                    "SELECT score_scope, "
                    "SUM(CASE WHEN politics=0 THEN 1 ELSE 0 END) AS politics_zero, "
                    "SUM(CASE WHEN english=0 THEN 1 ELSE 0 END) AS english_zero, "
                    "SUM(CASE WHEN math=0 THEN 1 ELSE 0 END) AS math_zero, "
                    "SUM(CASE WHEN specialized=0 THEN 1 ELSE 0 END) AS specialized_zero, "
                    "COUNT(*) AS total "
                    "FROM workspace_department_years GROUP BY score_scope ORDER BY score_scope",
                ),
            }
            if result["department_years"]["min_score"].get("zero_count") == 0:
                result["conclusions"]["department_year_min_score_zero"] = (
                    "not_present: projected year rows have no zero min_score"
                )

        if _table_exists(conn, "workspace_schools"):
            result["workspace_schools"] = {
                "min_score": _numeric_counts(conn, "workspace_schools", "min_score"),
                "enroll_count": _numeric_counts(conn, "workspace_schools", "enroll_count"),
            }

    return result


def audit(source_db: Path, desktop_db: Path) -> dict[str, Any]:
    return {
        "issue": "ISSUE-031",
        "source": audit_source_db(source_db),
        "desktop": audit_desktop_db(desktop_db),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-db", type=Path, default=DEFAULT_SOURCE_DB)
    parser.add_argument("--desktop-db", type=Path, default=DEFAULT_DESKTOP_DB)
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    args = parser.parse_args()
    report = audit(args.source_db, args.desktop_db)
    print(json.dumps(report, ensure_ascii=False, indent=2 if args.pretty else None, sort_keys=True))


if __name__ == "__main__":
    main()
