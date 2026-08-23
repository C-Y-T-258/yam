from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path
from unittest import mock

import pytest

from yam import backend_entry
from yam.scripts.sync_to_tauri import (
    TARGET_SCHEMA,
    _legacy_plan_key,
    clear_major,
    enrollment_snapshot_fields,
    insert_department,
    insert_department_years,
    insert_shared_score_evidence,
    load_score_lines,
    map_score_source_entities,
    migrate_plan_snapshot_identities,
    unique_plan_enrollment_total,
)
from yam.storage.db import Database


@pytest.mark.parametrize(
    "args",
    [
        ["--help"],
        ["sync-to-tauri", "--help"],
        ["search-majors", "--help"],
    ],
)
def test_dispatcher_help_smoke(args: list[str]) -> None:
    env = os.environ.copy()
    env.update(PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    result = subprocess.run(
        [sys.executable, "-m", "yam.backend_entry", *args],
        cwd=Path(__file__).parents[1],
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert result.returncode == 0, result.stderr
    assert "help" in result.stdout.lower() or "帮助" in result.stdout


def test_backend_entry_forces_utf8_when_windows_parent_uses_cp936() -> None:
    env = os.environ.copy()
    env.update(PYTHONIOENCODING="cp936", PYTHONUTF8="0")
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import yam.backend_entry; print('YAM_ENCODING_TEST 中文 check')",
        ],
        cwd=Path(__file__).parents[1],
        env=env,
        capture_output=True,
    )
    assert result.returncode == 0, result.stderr.decode("utf-8", errors="replace")
    assert result.stdout.decode("utf-8").strip() == "YAM_ENCODING_TEST 中文 check"


def test_doctor_json_protocol(capsys: pytest.CaptureFixture[str]) -> None:
    assert backend_entry.main(["doctor", "--json"]) == 0
    line = capsys.readouterr().out.strip()
    assert line.startswith("YAM_BACKEND_STATUS ")
    payload = json.loads(line.removeprefix("YAM_BACKEND_STATUS "))
    assert payload["mode"] == "development"
    assert payload["dependencies"] == {"playwright": True, "httpx": True, "aiohttp": True}
    assert payload["browser"] in {"msedge", "missing"}


def test_sync_arguments_are_forwarded(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def fake_forward(main: object, args: list[str]) -> int:
        captured.update(main=main, args=args)
        return 0

    fake_module = mock.Mock()
    monkeypatch.setattr(backend_entry, "_forward", fake_forward)
    monkeypatch.setitem(sys.modules, "yam.scripts.sync_to_tauri", fake_module)
    assert backend_entry.main(["sync-to-tauri", "--major-code", "081200", "--clear"]) == 0
    assert captured["args"] == ["--major-code", "081200", "--clear"]


def test_sync_missing_source_is_a_normal_empty_state(tmp_path: Path) -> None:
    source = tmp_path / "missing.db"
    target = tmp_path / "target.db"
    env = os.environ.copy()
    env.update(PYTHONIOENCODING="cp936", PYTHONUTF8="0")
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "yam.backend_entry",
            "sync-to-tauri",
            "--source",
            str(source),
            "--target",
            str(target),
        ],
        cwd=Path(__file__).parents[1],
        env=env,
        capture_output=True,
    )
    assert result.returncode == 0, result.stderr.decode("utf-8", errors="replace")
    line = result.stdout.decode("utf-8").strip()
    assert line.startswith("YAM_SYNC_EMPTY ")
    assert json.loads(line.removeprefix("YAM_SYNC_EMPTY ")) == {"source": str(source)}
    assert not target.exists()


def test_enrollment_zero_is_provided_not_unknown() -> None:
    target = sqlite3.connect(":memory:")
    target.row_factory = sqlite3.Row
    target.executescript(TARGET_SCHEMA)

    explicit_zero = {
        "department_id": "dept-zero",
        "name": "Computer School",
        "research_direction": "AI",
        "exam_subjects": [],
        "special_plans": [],
        "study_mode": "full-time",
        "exam_type": "unified",
        "enrollment_count": 0,
        "enrollment_text": "major:0(no recommendation)",
        "source": "yanzhao",
        "updated_at": "2026-08-01T08:00:00Z",
    }
    insert_department(target, "school-1", "085410", explicit_zero)
    plan = target.execute(
        """SELECT enrollment_count, enrollment_count_status, enrollment_text
           FROM workspace_plans WHERE school_id='school-1' AND major_code='085410'"""
    ).fetchone()
    snapshot = target.execute(
        """SELECT enrollment_count, enrollment_count_status, enrollment_text
           FROM workspace_plan_snapshots WHERE source_department_id='dept-zero'"""
    ).fetchone()
    assert tuple(plan) == (0, "provided", "major:0(no recommendation)")
    assert tuple(snapshot) == (0, "provided", "major:0(no recommendation)")

    assert enrollment_snapshot_fields({"enrollment_count": None, "enrollment_text": ""}) == (
        0,
        "unknown",
        "",
    )
    target.close()


def test_plan_snapshot_catalog_year_is_provided_only_when_source_supplies_it() -> None:
    target = sqlite3.connect(":memory:")
    target.row_factory = sqlite3.Row
    target.executescript(TARGET_SCHEMA)

    base = {
        "department_id": "dept-1",
        "name": "Computer School",
        "research_direction": "AI",
        "exam_subjects": ["English", "408"],
        "special_plans": [],
        "study_mode": "full-time",
        "exam_type": "unified",
        "updated_at": "2026-08-01T08:00:00Z",
        "enrollment_count": 12,
    }
    insert_department(target, "school-1", "085410", {**base, "catalog_year": 2027})
    insert_department(
        target,
        "school-2",
        "085410",
        {**base, "department_id": "dept-2", "catalog_year": None},
    )

    rows = target.execute(
        "SELECT school_id, catalog_year, catalog_year_status "
        "FROM workspace_plan_snapshots ORDER BY school_id"
    ).fetchall()
    assert [tuple(row) for row in rows] == [
        ("school-1", 2027, "provided"),
        ("school-2", None, "unknown"),
    ]
    target.close()


def test_search_arguments_are_forwarded(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def fake_run_cli(command: str, args: list[str]) -> int:
        captured.update(command=command, args=args)
        return 0

    monkeypatch.setattr(backend_entry, "_run_cli", fake_run_cli)
    assert backend_entry.main(["search-majors", "--yjxkdm", "0812", "--json"]) == 0
    assert captured == {"command": "search-majors", "args": ["--yjxkdm", "0812", "--json"]}


def test_bundled_resources_and_user_realtime_path(tmp_path: Path) -> None:
    resource_dir = tmp_path / "backend-assets"
    resource_data = resource_dir / "data"
    resource_data.mkdir(parents=True)
    source = Path(__file__).parents[1] / "data" / "majors.yaml"
    (resource_data / "majors.yaml").write_bytes(source.read_bytes())

    home = tmp_path / "home"
    script = """
from yam.config import config
assert config.get_major('081200')['code'] == '081200'
assert config.majors_file == __import__('pathlib').Path(__import__('os').environ['YAM_RESOURCE_DIR']) / 'data' / 'majors.yaml'
assert config.realtime_majors_file == __import__('pathlib').Path.home() / '.yam' / 'data' / 'majors_realtime.json'
assert not str(config.realtime_majors_file).startswith(str(config.majors_file.parent))
print(config.realtime_majors_file)
"""
    env = os.environ.copy()
    env.update(HOME=str(home), USERPROFILE=str(home), YAM_RESOURCE_DIR=str(resource_dir))
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=Path(__file__).parents[1],
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert result.returncode == 0, result.stderr
    assert str(home / ".yam" / "data" / "majors_realtime.json") in result.stdout
    assert not (resource_data / "majors_realtime.json").exists()


def test_score_evidence_schema_migrates_and_persists_raw_record(tmp_path: Path) -> None:
    db_path = tmp_path / "legacy.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        """CREATE TABLE score_lines (
        school_id TEXT NOT NULL, department_id TEXT NOT NULL, major_code TEXT NOT NULL,
        year INTEGER NOT NULL, total INTEGER, politics INTEGER, english INTEGER,
        special_one INTEGER, special_two INTEGER, note TEXT, source TEXT, updated_at TEXT,
        PRIMARY KEY (school_id, department_id, major_code, year))"""
    )
    conn.execute("PRAGMA user_version = 3")
    conn.commit()
    conn.close()

    with Database(db_path) as db:
        db.save_score_line(
            "085410",
            "school-1",
            "department-1",
            2025,
            {
                "total": 285,
                "raw_code": "0854",
                "raw_department_name": "电子信息学院",
                "metric_type": "score_line",
                "match_scope": "discipline",
                "confidence": 0.8,
                "raw_evidence": {"code": "0854", "total": "285"},
            },
            "zhangshangkaoyan",
            "2026-07-30T00:00:00Z",
        )
        db.conn.commit()
        row = db.conn.execute(
            "SELECT raw_code, raw_department_name, metric_type, match_scope, confidence, raw_evidence_json FROM score_lines"
        ).fetchone()

    assert tuple(row[:5]) == ("0854", "电子信息学院", "score_line", "discipline", 0.8)
    assert json.loads(row[5]) == {"code": "0854", "total": "285"}


def test_score_request_status_drives_year_level_retry(tmp_path: Path) -> None:
    with Database(tmp_path / "status.db") as db:
        db.save_score_request_status("085410", "school-1", 2026, "source", "success_with_data")
        db.save_score_request_status("085410", "school-1", 2025, "source", "success_empty")
        db.save_score_request_status("085410", "school-1", 2024, "source", "api_error", "timeout")

        assert db.get_pending_score_years(
            "085410", "school-1", [2026, 2025, 2024, 2023], "source"
        ) == [2025, 2024, 2023]

        db.save_score_request_status("085410", "school-1", 2025, "source", "api_error", "temporary")
        statuses = db.get_score_request_statuses("085410", "school-1", "source")

    assert statuses == {2024: "api_error", 2025: "success_empty", 2026: "success_with_data"}


def test_clear_fetch_state_resets_only_target_major(tmp_path: Path) -> None:
    with Database(tmp_path / "force.db") as db:
        for major_code in ("085410", "081200"):
            db.log_fetch(major_code, "school-1", "score_lines", "success")
            db.save_score_request_status(
                major_code, "school-1", 2026, "source", "success_with_data"
            )

        db.clear_fetch_state("085410")
        remaining_logs = db.conn.execute(
            "SELECT major_code FROM fetch_log ORDER BY major_code"
        ).fetchall()
        remaining_statuses = db.conn.execute(
            "SELECT major_code FROM score_request_status ORDER BY major_code"
        ).fetchall()

    assert [row[0] for row in remaining_logs] == ["081200"]
    assert [row[0] for row in remaining_statuses] == ["081200"]


def test_unique_plan_enrollment_total_deduplicates_directions() -> None:
    departments = [
        {"department_id": "010", "study_mode": "全日制", "exam_type": "统考", "enrollment_count": 10},
        {"department_id": "010", "study_mode": "全日制", "exam_type": "统考", "enrollment_count": 10},
        {"department_id": "010", "study_mode": "非全日制", "exam_type": "统考", "enrollment_count": 30},
    ]
    assert unique_plan_enrollment_total(departments) == 40


def test_load_score_lines_keeps_one_complete_source_record() -> None:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute(
        """CREATE TABLE score_lines (
        school_id TEXT NOT NULL, department_id TEXT NOT NULL, major_code TEXT NOT NULL,
        year INTEGER NOT NULL, total INTEGER, politics INTEGER, english INTEGER,
        special_one INTEGER, special_two INTEGER, note TEXT, source TEXT, updated_at TEXT,
        PRIMARY KEY (school_id, department_id, major_code, year))"""
    )
    conn.executemany(
        "INSERT INTO score_lines VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            ("whu", "a", "085410", 2025, 285, 50, 50, 80, 90, "", "source", "t1"),
            ("whu", "b", "085410", 2025, 350, 50, 50, 100, 85, "", "source", "t2"),
        ],
    )

    rows = load_score_lines(conn, "whu", "", "085410")
    conn.close()

    assert len(rows) == 1
    assert tuple(rows[0][key] for key in ("total", "politics", "english", "special_one", "special_two")) == (
        285,
        50,
        50,
        80,
        90,
    )
    assert rows[0]["source_record_count"] == 2
    assert rows[0]["selected_department_id"] == "a"


def test_shared_score_evidence_is_stored_once_and_linked_to_plans() -> None:
    target = sqlite3.connect(":memory:")
    target.row_factory = sqlite3.Row
    target.executescript(TARGET_SCHEMA)
    score_lines = [
        {
            "year": 2025,
            "total": 335,
            "politics": 50,
            "english": 50,
            "special_one": 80,
            "special_two": 90,
            "source": "source",
            "updated_at": "2026-07-31T00:00:00Z",
            "note": "学校专业参考线",
            "selected_department_id": "source-dept",
            "source_record_count": 2,
            "raw_evidence_json": '{"code":"085410"}',
            "raw_code": "085410",
            "raw_department_name": "计算机学院",
        }
    ]
    evidence_keys = insert_shared_score_evidence(
        target, "school-1", "085410", score_lines
    )
    department_payloads = []
    for direction in ("方向一", "方向二"):
        payload = {
            "department_id": "dept-1",
            "name": "计算机学院",
            "research_direction": direction,
            "exam_subjects": [],
            "special_plans": [],
            "study_mode": "全日制",
            "exam_type": "统考",
            "enrollment_count": 10,
            "source": "yanzhao",
            "updated_at": "2026-07-31T08:00:00Z",
        }
        department_payloads.append(payload)
        department_id = insert_department(
            target,
            "school-1",
            "085410",
            payload,
        )
        insert_department_years(target, department_id, 10, score_lines, evidence_keys)

    target.execute(
        """INSERT INTO workspace_source_entities
           (source_entity_key, source, school_id, major_code, source_entity_id,
            source_entity_name)
           VALUES ('unmatched-source', 'zhangshangkaoyan', 'school-1', '085410',
                   'remote-2', '不存在学院')"""
    )
    insert_department(
        target,
        "school-1",
        "085410",
        {**department_payloads[0], "department_id": "dept-x", "name": "重复学院", "research_direction": "方向X"},
    )
    insert_department(
        target,
        "school-1",
        "085410",
        {**department_payloads[0], "department_id": "dept-y", "name": "重复学院", "research_direction": "方向Y"},
    )
    target.execute(
        """INSERT INTO workspace_source_entities
           (source_entity_key, source, school_id, major_code, source_entity_id,
            source_entity_name)
           VALUES ('ambiguous-source', 'zhangshangkaoyan', 'school-1', '085410',
                   'remote-3', '重复学院')"""
    )
    mapping_counts = map_score_source_entities(target, "school-1", "085410")

    assert target.execute("SELECT COUNT(*) FROM workspace_score_evidence").fetchone()[0] == 1
    assert target.execute("SELECT COUNT(*) FROM workspace_plan_score_evidence").fetchone()[0] == 2
    assert target.execute("SELECT COUNT(*) FROM workspace_plan_years").fetchone()[0] == 0
    assert target.execute("SELECT COUNT(*) FROM workspace_department_years").fetchone()[0] == 2
    assert target.execute(
        "SELECT COUNT(DISTINCT evidence_key) FROM workspace_plan_score_evidence"
    ).fetchone()[0] == 1
    assert mapping_counts == {"candidate": 1, "ambiguous": 1, "unmapped": 1}
    mapped = target.execute(
        """SELECT m.target_entity_type, m.mapping_status, m.mapping_rule, m.confidence
           FROM workspace_score_evidence e
           JOIN workspace_entity_mappings m ON m.source_entity_key=e.source_entity_key"""
    ).fetchone()
    assert tuple(mapped) == ("department", "candidate", "exact_normalized_name", 0.8)
    unmapped = target.execute(
        """SELECT target_entity_type, mapping_status, mapping_rule, confidence
           FROM workspace_entity_mappings WHERE source_entity_key='unmatched-source'"""
    ).fetchone()
    assert tuple(unmapped) == (
        "school_major", "unmapped", "no_unique_department_name", 0.0,
    )
    ambiguous = target.execute(
        """SELECT target_entity_type, mapping_status, mapping_rule, confidence
           FROM workspace_entity_mappings WHERE source_entity_key='ambiguous-source'"""
    ).fetchone()
    assert tuple(ambiguous) == (
        "school_major", "ambiguous", "normalized_name_ambiguous", 0.0,
    )
    snapshots = target.execute(
        "SELECT catalog_year, catalog_year_status, observed_at "
        "FROM workspace_plan_snapshots ORDER BY plan_key"
    ).fetchall()
    assert len(snapshots) == 4
    assert all(row["catalog_year"] is None for row in snapshots)
    assert all(row["catalog_year_status"] == "unknown" for row in snapshots)
    assert all(row["observed_at"] == "2026-07-31T08:00:00Z" for row in snapshots)
    assert all(
        row[0].startswith("plan:v2:")
        for row in target.execute("SELECT plan_key FROM workspace_plans").fetchall()
    )

    clear_major(target, "085410")
    assert target.execute("SELECT COUNT(*) FROM workspace_score_evidence").fetchone()[0] == 0
    assert target.execute("SELECT COUNT(*) FROM workspace_plan_score_evidence").fetchone()[0] == 0
    assert target.execute("SELECT COUNT(*) FROM workspace_source_entities").fetchone()[0] == 0
    assert target.execute("SELECT COUNT(*) FROM workspace_entity_mappings").fetchone()[0] == 0
    assert target.execute("SELECT COUNT(*) FROM workspace_plan_snapshots").fetchone()[0] == 4
    for payload in department_payloads:
        insert_department(target, "school-1", "085410", payload)
    assert target.execute("SELECT COUNT(*) FROM workspace_plan_snapshots").fetchone()[0] == 4
    target.close()


def test_plan_identity_ignores_versioned_display_fields_and_migrates_v1_snapshot() -> None:
    target = sqlite3.connect(":memory:")
    target.row_factory = sqlite3.Row
    target.executescript(TARGET_SCHEMA)
    original = {
        "department_id": "dept-1",
        "name": "计算机学院",
        "research_direction": "人工智能",
        "exam_subjects": ["英语一", "408"],
        "special_plans": ["退役大学生士兵"],
        "study_mode": "全日制",
        "exam_type": "统考",
        "updated_at": "2026-07-31T08:00:00Z",
    }
    insert_department(target, "school-1", "085410", original)
    stable_key = target.execute("SELECT plan_key FROM workspace_plans").fetchone()[0]

    clear_major(target, "085410")
    changed = {
        **original,
        "name": "计算机与人工智能学院",
        "exam_subjects": ["英语二", "自命题"],
        "special_plans": [],
        "study_mode": "非全日制",
        "exam_type": "单独考试",
        "updated_at": "2026-08-01T08:00:00Z",
    }
    insert_department(target, "school-1", "085410", changed)
    assert target.execute("SELECT plan_key FROM workspace_plans").fetchone()[0] == stable_key
    assert target.execute(
        "SELECT COUNT(DISTINCT plan_key) FROM workspace_plan_snapshots"
    ).fetchone()[0] == 1
    assert target.execute("SELECT COUNT(*) FROM workspace_plan_snapshots").fetchone()[0] == 2

    legacy_key = _legacy_plan_key(
        "school-2", "085410", "dept-2", "旧学院", "方向一",
        ["英语一", "408"], "全日制", "统考", [],
    )
    target.execute(
        """INSERT INTO workspace_department_entities
           (department_key, school_id, major_code, source_department_id, name)
           VALUES ('department:v1:legacy', 'school-2', '085410', 'dept-2', '旧学院')"""
    )
    target.execute(
        """INSERT INTO workspace_plans
           (plan_id, plan_key, department_key, school_id, major_code, research_direction,
            exam_subjects, study_mode, exam_type, special_plans)
           VALUES (99, ?, 'department:v1:legacy', 'school-2', '085410', '方向一',
                   '英语一,408', '全日制', '统考', '[]')""",
        (legacy_key,),
    )
    target.execute(
        """INSERT INTO workspace_plan_snapshots
           (snapshot_key, plan_key, department_key, school_id, major_code,
            plan_identity_version, observed_at, research_direction, exam_subjects)
           VALUES ('legacy-snapshot', ?, 'department:v1:legacy', 'school-2', '085410',
                   1, '2026-07-30T08:00:00Z', '方向一', '英语一,408')""",
        (legacy_key,),
    )
    target.execute(
        """INSERT INTO workspace_plan_snapshots
           (snapshot_key, plan_key, department_key, school_id, major_code,
            plan_identity_version, observed_at, research_direction, exam_subjects)
           VALUES ('unmapped-snapshot', 'orphan-v1', 'unknown-department', 'school-3',
                   '085410', 1, '2026-07-29T08:00:00Z', '方向二', '408')"""
    )

    migrated, merged = migrate_plan_snapshot_identities(target, "085410")
    migrated_row = target.execute(
        """SELECT plan_key, department_key, source_department_id, department_name,
                  plan_identity_version
           FROM workspace_plan_snapshots WHERE snapshot_key='legacy-snapshot'"""
    ).fetchone()
    assert migrated >= 1
    assert merged == 0
    assert migrated_row["plan_key"].startswith("plan:v2:")
    assert migrated_row["department_key"].startswith("department:v2:")
    assert migrated_row["source_department_id"] == "dept-2"
    assert migrated_row["department_name"] == "旧学院"
    assert migrated_row["plan_identity_version"] == 2
    assert target.execute(
        "SELECT plan_key FROM workspace_plan_snapshots WHERE snapshot_key='unmapped-snapshot'"
    ).fetchone()[0] == "orphan-v1"
    target.close()

