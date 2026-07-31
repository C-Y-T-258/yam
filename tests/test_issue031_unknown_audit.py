from __future__ import annotations

import sqlite3
from pathlib import Path

from yam.scripts.audit_issue031_unknowns import audit


def test_issue031_unknown_audit_reports_score_and_catalog_boundaries(tmp_path: Path) -> None:
    source = tmp_path / "source.db"
    desktop = tmp_path / "desktop.db"

    with sqlite3.connect(source) as conn:
        conn.executescript(
            """
            CREATE TABLE departments (
                id INTEGER PRIMARY KEY,
                enrollment_count INTEGER NOT NULL,
                enrollment_text TEXT
            );
            CREATE TABLE score_lines (
                year INTEGER NOT NULL,
                total INTEGER NOT NULL,
                politics INTEGER NOT NULL,
                english INTEGER NOT NULL,
                special_one INTEGER NOT NULL,
                special_two INTEGER NOT NULL
            );
            INSERT INTO departments (enrollment_count, enrollment_text)
            VALUES (0, '专业：0(不含推免)'), (12, '专业：12(不含推免)');
            INSERT INTO score_lines
            VALUES (2025, 338, 45, 50, 75, 90), (2024, 335, 44, 49, 74, 89);
            """
        )

    with sqlite3.connect(desktop) as conn:
        conn.executescript(
            """
            CREATE TABLE workspace_plan_snapshots (
                plan_key TEXT NOT NULL,
                catalog_year INTEGER,
                catalog_year_status TEXT NOT NULL
            );
            CREATE TABLE workspace_plans (
                plan_key TEXT NOT NULL,
                enrollment_count INTEGER NOT NULL,
                enrollment_count_status TEXT NOT NULL
            );
            CREATE TABLE workspace_department_years (
                department_id INTEGER NOT NULL,
                min_score INTEGER NOT NULL,
                politics INTEGER NOT NULL,
                english INTEGER NOT NULL,
                math INTEGER NOT NULL,
                specialized INTEGER NOT NULL,
                score_scope TEXT NOT NULL
            );
            CREATE TABLE workspace_schools (
                school_id TEXT NOT NULL,
                min_score INTEGER NOT NULL,
                enroll_count INTEGER NOT NULL
            );
            INSERT INTO workspace_plan_snapshots VALUES ('p1', NULL, 'unknown');
            INSERT INTO workspace_plans VALUES ('p1', 0, 'provided'), ('p2', 0, 'unknown');
            INSERT INTO workspace_department_years
            VALUES (1, 338, 45, 50, 75, 90, 'school_major');
            INSERT INTO workspace_schools VALUES ('s1', 0, 0), ('s2', 338, 12);
            """
        )

    report = audit(source, desktop)

    assert report["source"]["conclusions"]["score_total_zero"].startswith("sentinel_in_projection")
    assert report["source"]["conclusions"]["catalog_year"].startswith("source_absent")
    assert report["source"]["department_enrollment"]["zero_with_text"] == 1
    assert report["desktop"]["conclusions"]["projected_catalog_year"].startswith("all_unknown")
    assert sorted(
        report["desktop"]["workspace_plans_enrollment"]["zero_by_status"],
        key=lambda row: row["status"],
    ) == [
        {"status": "provided", "count": 1},
        {"status": "unknown", "count": 1},
    ]
    assert report["desktop"]["department_years"]["min_score"]["zero_count"] == 0
