"""Create a read-only, SQL-traceable audit for admission-cycle research.

The output intentionally contains aggregate facts only. Every result set keeps
the SQL that produced it, and both databases are hashed before and after the
audit so an accidental mutation fails the run.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote


DEFAULT_SOURCE_DB = Path.home() / ".yam" / "data" / "yam.db"
DEFAULT_DESKTOP_DB = Path.home() / ".yam" / "data" / "yam-desktop.db"


SOURCE_QUERIES = {
    "source.table_counts": """
        SELECT name AS table_name,
               CASE name
                 WHEN 'schools' THEN (SELECT COUNT(*) FROM schools)
                 WHEN 'departments' THEN (SELECT COUNT(*) FROM departments)
                 WHEN 'score_lines' THEN (SELECT COUNT(*) FROM score_lines)
                 WHEN 'score_request_status' THEN (SELECT COUNT(*) FROM score_request_status)
                 WHEN 'admission_plans' THEN (SELECT COUNT(*) FROM admission_plans)
                 WHEN 'fetch_log' THEN (SELECT COUNT(*) FROM fetch_log)
                 WHEN 'snapshots' THEN (SELECT COUNT(*) FROM snapshots)
                 WHEN 'favorites' THEN (SELECT COUNT(*) FROM favorites)
                 WHEN 'recent_views' THEN (SELECT COUNT(*) FROM recent_views)
               END AS row_count
          FROM sqlite_master
         WHERE type = 'table'
           AND name IN ('schools', 'departments', 'score_lines', 'score_request_status',
                        'admission_plans', 'fetch_log', 'snapshots', 'favorites', 'recent_views')
         ORDER BY name
    """,
    "source.temporal_columns": """
        SELECT m.name AS table_name, p.name AS column_name, p.type AS declared_type
          FROM sqlite_master AS m, pragma_table_info(m.name) AS p
         WHERE m.type = 'table'
           AND (p.name LIKE '%year%' OR p.name LIKE '%\\_at' ESCAPE '\\'
                OR p.name LIKE '%date%' OR p.name LIKE '%time%')
         ORDER BY m.name, p.cid
    """,
    "source.current_entities": """
        SELECT COUNT(*) AS department_rows,
               COUNT(DISTINCT major_code) AS majors,
               COUNT(DISTINCT school_id) AS source_school_ids,
               COUNT(DISTINCT school_id || '|' || major_code) AS school_major_pairs,
               COUNT(DISTINCT school_id || '|' || major_code || '|' || department_id)
                   AS school_major_departments
          FROM departments
    """,
    "source.department_year_fields": """
        SELECT SUM(CASE WHEN p.name = 'catalog_year' THEN 1 ELSE 0 END) AS catalog_year_columns,
               SUM(CASE WHEN p.name = 'year' THEN 1 ELSE 0 END) AS generic_year_columns
          FROM pragma_table_info('departments') AS p
    """,
    "source.department_observation_range": """
        SELECT MIN(updated_at) AS earliest_updated_at,
               MAX(updated_at) AS latest_updated_at,
               COUNT(DISTINCT updated_at) AS distinct_observation_times
          FROM departments
    """,
    "source.score_by_year": """
        SELECT year, COUNT(*) AS rows,
               COUNT(DISTINCT school_id || '|' || major_code) AS school_major_pairs,
               COUNT(DISTINCT school_id) AS source_school_ids
          FROM score_lines
         GROUP BY year
         ORDER BY year
    """,
    "source.score_type_scope": """
        SELECT COALESCE(metric_type, '(null)') AS metric_type,
               COALESCE(match_scope, '(null)') AS match_scope,
               COUNT(*) AS rows
          FROM score_lines
         GROUP BY metric_type, match_scope
         ORDER BY rows DESC, metric_type, match_scope
    """,
    "source.score_request_status": """
        SELECT requested_year, source, status, COUNT(*) AS requests
          FROM score_request_status
         GROUP BY requested_year, source, status
         ORDER BY requested_year, source, status
    """,
    "source.admission_plan_by_year_major": """
        SELECT year, major_code, COUNT(*) AS rows,
               COUNT(DISTINCT school_id) AS source_school_ids,
               COUNT(DISTINCT department_id) AS source_department_ids
          FROM admission_plans
         GROUP BY year, major_code
         ORDER BY year, major_code
    """,
    "source.admission_plan_time_range": """
        SELECT MIN(updated_at) AS earliest_updated_at,
               MAX(updated_at) AS latest_updated_at,
               COUNT(DISTINCT updated_at) AS distinct_observation_times
          FROM admission_plans
    """,
}


DESKTOP_QUERIES = {
    "desktop.table_counts": """
        SELECT name AS table_name,
               CASE name
                 WHEN 'workspace_schools' THEN (SELECT COUNT(*) FROM workspace_schools)
                 WHEN 'workspace_departments' THEN (SELECT COUNT(*) FROM workspace_departments)
                 WHEN 'workspace_department_years' THEN (SELECT COUNT(*) FROM workspace_department_years)
                 WHEN 'workspace_majors' THEN (SELECT COUNT(*) FROM workspace_majors)
                 WHEN 'workspace_department_entities' THEN (SELECT COUNT(*) FROM workspace_department_entities)
                 WHEN 'workspace_plans' THEN (SELECT COUNT(*) FROM workspace_plans)
                 WHEN 'workspace_plan_years' THEN (SELECT COUNT(*) FROM workspace_plan_years)
                 WHEN 'workspace_plan_snapshots' THEN (SELECT COUNT(*) FROM workspace_plan_snapshots)
                 WHEN 'workspace_score_request_status' THEN (SELECT COUNT(*) FROM workspace_score_request_status)
                 WHEN 'workspace_score_evidence' THEN (SELECT COUNT(*) FROM workspace_score_evidence)
                 WHEN 'workspace_plan_score_evidence' THEN (SELECT COUNT(*) FROM workspace_plan_score_evidence)
                 WHEN 'workspace_source_entities' THEN (SELECT COUNT(*) FROM workspace_source_entities)
                 WHEN 'workspace_entity_mappings' THEN (SELECT COUNT(*) FROM workspace_entity_mappings)
                 WHEN 'workspace_model_state' THEN (SELECT COUNT(*) FROM workspace_model_state)
               END AS row_count
          FROM sqlite_master
         WHERE type = 'table' AND name LIKE 'workspace_%'
         ORDER BY name
    """,
    "desktop.temporal_columns": """
        SELECT m.name AS table_name, p.name AS column_name, p.type AS declared_type
          FROM sqlite_master AS m, pragma_table_info(m.name) AS p
         WHERE m.type = 'table'
           AND (p.name LIKE '%year%' OR p.name LIKE '%\\_at' ESCAPE '\\'
                OR p.name LIKE '%date%' OR p.name LIKE '%time%')
         ORDER BY m.name, p.cid
    """,
    "desktop.current_entities": """
        SELECT (SELECT COUNT(*) FROM workspace_majors) AS majors,
               (SELECT COUNT(*) FROM workspace_schools) AS school_major_pairs,
               (SELECT COUNT(*) FROM workspace_department_entities) AS department_entities,
               (SELECT COUNT(*) FROM workspace_plans) AS plans,
               (SELECT COUNT(DISTINCT school_id) FROM workspace_schools) AS source_school_ids
    """,
    "desktop.catalog_year_status": """
        SELECT catalog_year, catalog_year_status, COUNT(*) AS snapshots,
               MIN(observed_at) AS earliest_observed_at,
               MAX(observed_at) AS latest_observed_at
          FROM workspace_plan_snapshots
         GROUP BY catalog_year, catalog_year_status
         ORDER BY catalog_year, catalog_year_status
    """,
    "desktop.score_evidence_by_year_scope": """
        SELECT year, score_scope, COUNT(*) AS evidence_rows,
               COUNT(DISTINCT school_id || '|' || major_code) AS school_major_pairs
          FROM workspace_score_evidence
         GROUP BY year, score_scope
         ORDER BY year, score_scope
    """,
    "desktop.department_year_projection": """
        SELECT year, score_scope, COUNT(*) AS projected_rows,
               COUNT(DISTINCT department_id) AS current_departments
          FROM workspace_department_years
         GROUP BY year, score_scope
         ORDER BY year, score_scope
    """,
    "desktop.plan_year_rows": """
        SELECT year, COUNT(*) AS rows, COUNT(DISTINCT plan_key) AS plans
          FROM workspace_plan_years
         GROUP BY year
         ORDER BY year
    """,
    "desktop.score_request_status": """
        SELECT requested_year, source, status, COUNT(*) AS requests
          FROM workspace_score_request_status
         GROUP BY requested_year, source, status
         ORDER BY requested_year, source, status
    """,
    "desktop.source_mapping_status": """
        SELECT se.source, se.entity_type, em.target_entity_type, em.mapping_status,
               COUNT(*) AS mappings
          FROM workspace_source_entities AS se
          LEFT JOIN workspace_entity_mappings AS em
            ON em.source_entity_key = se.source_entity_key
         GROUP BY se.source, se.entity_type, em.target_entity_type, em.mapping_status
         ORDER BY se.source, se.entity_type, em.target_entity_type, em.mapping_status
    """,
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _connect_read_only(path: Path) -> sqlite3.Connection:
    uri = f"file:{quote(path.resolve().as_posix(), safe='/:')}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only = ON")
    return conn


def _run_queries(path: Path, queries: dict[str, str]) -> dict[str, Any]:
    before = _sha256(path)
    results: dict[str, Any] = {}
    with _connect_read_only(path) as conn:
        query_only = int(conn.execute("PRAGMA query_only").fetchone()[0])
        for query_id, sql in queries.items():
            cursor = conn.execute(sql)
            results[query_id] = {
                "sql": " ".join(sql.split()),
                "columns": [column[0] for column in cursor.description],
                "rows": [dict(row) for row in cursor.fetchall()],
            }
    after = _sha256(path)
    if before != after:
        raise RuntimeError(f"database changed during read-only audit: {path}")
    stat = path.stat()
    return {
        "database": {
            "path": str(path.resolve()),
            "size_bytes": stat.st_size,
            "sha256_before": before,
            "sha256_after": after,
            "query_only": query_only,
        },
        "queries": results,
    }


def audit(source_db: Path, desktop_db: Path) -> dict[str, Any]:
    for path in (source_db, desktop_db):
        if not path.is_file():
            raise FileNotFoundError(path)
    return {
        "artifact_schema": "yam.year_source_local_audit.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "admission_cycles": [2023, 2024, 2025, 2026],
        "source": _run_queries(source_db, SOURCE_QUERIES),
        "desktop": _run_queries(desktop_db, DESKTOP_QUERIES),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-db", type=Path, default=DEFAULT_SOURCE_DB)
    parser.add_argument("--desktop-db", type=Path, default=DEFAULT_DESKTOP_DB)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()
    report = audit(args.source_db, args.desktop_db)
    payload = json.dumps(report, ensure_ascii=False, indent=2 if args.pretty else None, sort_keys=True)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)


if __name__ == "__main__":
    main()
