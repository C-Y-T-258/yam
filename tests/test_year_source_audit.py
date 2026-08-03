from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path

import pytest

from yam.scripts.audit_year_sources import audit


def _hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_year_source_audit_is_read_only_and_keeps_sql(tmp_path: Path) -> None:
    source = tmp_path / "source.db"
    desktop = tmp_path / "desktop.db"
    with sqlite3.connect(source) as conn:
        conn.executescript(
            """
            CREATE TABLE departments (
              school_id TEXT, major_code TEXT, department_id TEXT, updated_at TEXT
            );
            CREATE TABLE score_lines (
              school_id TEXT, major_code TEXT, department_id TEXT, year INTEGER,
              metric_type TEXT, match_scope TEXT
            );
            CREATE TABLE score_request_status (
              requested_year INTEGER, source TEXT, status TEXT
            );
            CREATE TABLE admission_plans (
              school_id TEXT, department_id TEXT, major_code TEXT, year INTEGER, updated_at TEXT
            );
            CREATE TABLE schools (school_id TEXT);
            CREATE TABLE fetch_log (id INTEGER);
            CREATE TABLE snapshots (id INTEGER);
            CREATE TABLE favorites (id INTEGER);
            CREATE TABLE recent_views (id INTEGER);
            INSERT INTO departments VALUES ('s1', '081200', 'd1', '2026-07-30');
            INSERT INTO score_lines VALUES ('s1', '081200', 'z1', 2025, 'score_line', 'major');
            INSERT INTO score_request_status VALUES (2025, 'source-a', 'success_with_data');
            INSERT INTO admission_plans VALUES ('s1', 'z1', '085410', 2025, '2026-07-07');
            """
        )
    with sqlite3.connect(desktop) as conn:
        conn.executescript(
            """
            CREATE TABLE workspace_majors (major_code TEXT);
            CREATE TABLE workspace_schools (school_id TEXT, major_code TEXT);
            CREATE TABLE workspace_departments (department_id INTEGER);
            CREATE TABLE workspace_department_entities (department_key TEXT);
            CREATE TABLE workspace_plans (plan_key TEXT);
            CREATE TABLE workspace_plan_years (plan_key TEXT, year INTEGER);
            CREATE TABLE workspace_plan_snapshots (
              catalog_year INTEGER, catalog_year_status TEXT, observed_at TEXT
            );
            CREATE TABLE workspace_score_request_status (
              requested_year INTEGER, source TEXT, status TEXT
            );
            CREATE TABLE workspace_score_evidence (
              school_id TEXT, major_code TEXT, year INTEGER, score_scope TEXT
            );
            CREATE TABLE workspace_plan_score_evidence (plan_key TEXT);
            CREATE TABLE workspace_source_entities (
              source_entity_key TEXT, source TEXT, entity_type TEXT
            );
            CREATE TABLE workspace_entity_mappings (
              source_entity_key TEXT, target_entity_type TEXT, mapping_status TEXT
            );
            CREATE TABLE workspace_model_state (major_code TEXT);
            CREATE TABLE workspace_department_years (
              department_id INTEGER, year INTEGER, score_scope TEXT
            );
            INSERT INTO workspace_majors VALUES ('081200');
            INSERT INTO workspace_schools VALUES ('s1', '081200');
            INSERT INTO workspace_department_entities VALUES ('d1');
            INSERT INTO workspace_plans VALUES ('p1');
            INSERT INTO workspace_plan_snapshots VALUES (NULL, 'unknown', '2026-07-30');
            INSERT INTO workspace_score_evidence VALUES ('s1', '081200', 2025, 'school_major');
            INSERT INTO workspace_department_years VALUES (1, 2025, 'school_major');
            """
        )

    before = (_hash(source), _hash(desktop))
    report = audit(source, desktop)
    after = (_hash(source), _hash(desktop))

    assert before == after
    assert report["source"]["database"]["query_only"] == 1
    assert report["desktop"]["database"]["query_only"] == 1
    assert report["source"]["queries"]["source.score_by_year"]["rows"] == [
        {"year": 2025, "rows": 1, "school_major_pairs": 1, "source_school_ids": 1}
    ]
    assert "SELECT year" in report["source"]["queries"]["source.score_by_year"]["sql"]


def test_year_source_audit_rejects_missing_database(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        audit(tmp_path / "missing-source.db", tmp_path / "missing-desktop.db")
