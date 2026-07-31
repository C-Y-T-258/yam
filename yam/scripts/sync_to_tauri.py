"""将 Python 后端 yam.db 数据同步到 Tauri 桌面端 SQLite.

用法：
    python -m yam.scripts.sync_to_tauri --major-code 085400
    python -m yam.scripts.sync_to_tauri --major-code 085400 --clear
    python -m yam.scripts.sync_to_tauri  # 同步全部 enabled 专业
"""

import argparse
import hashlib
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from yam.config import config

TARGET_SCHEMA = """
CREATE TABLE IF NOT EXISTS workspace_schools (
    school_id TEXT NOT NULL,
    major_code TEXT NOT NULL,
    name TEXT NOT NULL,
    province TEXT NOT NULL,
    level TEXT NOT NULL,
    min_score INTEGER NOT NULL,
    enroll_count INTEGER NOT NULL,
    self_scoring INTEGER NOT NULL DEFAULT 0,
    doctoral_program INTEGER NOT NULL DEFAULT 0,
    double_first_class INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'yanzhao',
    updated_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (school_id, major_code)
);

CREATE TABLE IF NOT EXISTS workspace_departments (
    department_id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_department_id TEXT NOT NULL DEFAULT '',
    plan_key TEXT NOT NULL DEFAULT '',
    school_id TEXT NOT NULL,
    major_code TEXT NOT NULL,
    name TEXT NOT NULL,
    research_direction TEXT NOT NULL,
    exam_subjects TEXT NOT NULL,
    study_mode TEXT NOT NULL DEFAULT '',
    exam_type TEXT NOT NULL DEFAULT '',
    special_plans TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (school_id, major_code) REFERENCES workspace_schools(school_id, major_code)
);

CREATE TABLE IF NOT EXISTS workspace_department_years (
    year_id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    enroll_count INTEGER NOT NULL,
    min_score INTEGER NOT NULL,
    politics INTEGER NOT NULL,
    english INTEGER NOT NULL,
    math INTEGER NOT NULL,
    specialized INTEGER NOT NULL,
    score_scope TEXT NOT NULL DEFAULT 'school_major',
    source TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT '',
    match_note TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (department_id) REFERENCES workspace_departments(department_id)
);

CREATE TABLE IF NOT EXISTS workspace_majors (
    major_code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    degree_type TEXT NOT NULL DEFAULT '',
    category_code TEXT NOT NULL DEFAULT '',
    category_name TEXT NOT NULL DEFAULT '',
    discipline_code TEXT NOT NULL DEFAULT '',
    discipline_name TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'major_catalog',
    updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS workspace_department_entities (
    department_key TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    major_code TEXT NOT NULL,
    source_department_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT '',
    UNIQUE(school_id, major_code, source_department_id, name)
);

CREATE TABLE IF NOT EXISTS workspace_plans (
    plan_id INTEGER PRIMARY KEY,
    plan_key TEXT NOT NULL UNIQUE,
    department_key TEXT NOT NULL,
    school_id TEXT NOT NULL,
    major_code TEXT NOT NULL,
    research_direction TEXT NOT NULL,
    exam_subjects TEXT NOT NULL,
    study_mode TEXT NOT NULL DEFAULT '',
    exam_type TEXT NOT NULL DEFAULT '',
    special_plans TEXT NOT NULL DEFAULT '[]',
    enrollment_count INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT '',
    source_record_kind TEXT NOT NULL DEFAULT 'yanzhao_department_derived',
    updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS workspace_plan_snapshots (
    snapshot_key TEXT PRIMARY KEY,
    plan_key TEXT NOT NULL,
    department_key TEXT NOT NULL,
    school_id TEXT NOT NULL,
    major_code TEXT NOT NULL,
    catalog_year INTEGER,
    catalog_year_status TEXT NOT NULL DEFAULT 'unknown'
        CHECK(catalog_year_status IN ('provided', 'unknown')),
    observed_at TEXT NOT NULL,
    research_direction TEXT NOT NULL,
    exam_subjects TEXT NOT NULL,
    study_mode TEXT NOT NULL DEFAULT '',
    exam_type TEXT NOT NULL DEFAULT '',
    special_plans TEXT NOT NULL DEFAULT '[]',
    enrollment_count INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT '',
    source_record_kind TEXT NOT NULL DEFAULT 'yanzhao_department_derived',
    UNIQUE(plan_key, observed_at)
);

CREATE TABLE IF NOT EXISTS workspace_plan_years (
    plan_year_id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_key TEXT NOT NULL,
    year INTEGER NOT NULL,
    enroll_count INTEGER NOT NULL,
    min_score INTEGER NOT NULL,
    politics INTEGER NOT NULL,
    english INTEGER NOT NULL,
    math INTEGER NOT NULL,
    specialized INTEGER NOT NULL,
    score_scope TEXT NOT NULL DEFAULT 'school_major',
    source TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT '',
    match_note TEXT NOT NULL DEFAULT '',
    UNIQUE(plan_key, year)
);

CREATE TABLE IF NOT EXISTS workspace_score_evidence (
    evidence_key TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    major_code TEXT NOT NULL,
    year INTEGER NOT NULL,
    min_score INTEGER NOT NULL,
    politics INTEGER NOT NULL,
    english INTEGER NOT NULL,
    math INTEGER NOT NULL,
    specialized INTEGER NOT NULL,
    score_scope TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT '',
    match_note TEXT NOT NULL DEFAULT '',
    raw_evidence_json TEXT NOT NULL DEFAULT '{}',
    source_record_count INTEGER NOT NULL DEFAULT 1,
    selected_department_id TEXT NOT NULL DEFAULT '',
    UNIQUE(school_id, major_code, year, score_scope, source, selected_department_id)
);

CREATE TABLE IF NOT EXISTS workspace_plan_score_evidence (
    plan_key TEXT NOT NULL,
    evidence_key TEXT NOT NULL,
    relation_kind TEXT NOT NULL DEFAULT 'shared_reference',
    PRIMARY KEY (plan_key, evidence_key)
);

CREATE TABLE IF NOT EXISTS workspace_score_request_status (
    major_code TEXT NOT NULL,
    school_id TEXT NOT NULL,
    requested_year INTEGER NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    error_message TEXT NOT NULL DEFAULT '',
    retrieved_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (major_code, school_id, requested_year, source)
);

CREATE TABLE IF NOT EXISTS workspace_model_state (
    major_code TEXT PRIMARY KEY,
    model_version INTEGER NOT NULL DEFAULT 4,
    status TEXT NOT NULL CHECK(status IN ('writing','ready','failed')),
    old_plan_count INTEGER NOT NULL DEFAULT 0,
    new_plan_count INTEGER NOT NULL DEFAULT 0,
    old_year_count INTEGER NOT NULL DEFAULT 0,
    new_year_count INTEGER NOT NULL DEFAULT 0,
    verified_at TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_workspace_schools_major_score
ON workspace_schools(major_code, min_score DESC, name);
CREATE INDEX IF NOT EXISTS idx_workspace_departments_major_school
ON workspace_departments(major_code, school_id);
CREATE INDEX IF NOT EXISTS idx_workspace_department_years_department
ON workspace_department_years(department_id, year DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_entities_major_school
ON workspace_department_entities(major_code, school_id);
CREATE INDEX IF NOT EXISTS idx_workspace_plans_major_school
ON workspace_plans(major_code, school_id);
CREATE INDEX IF NOT EXISTS idx_workspace_plans_department
ON workspace_plans(department_key);
CREATE INDEX IF NOT EXISTS idx_workspace_plan_snapshots_plan
ON workspace_plan_snapshots(plan_key, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_plan_snapshots_major
ON workspace_plan_snapshots(major_code, school_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_plan_years_plan
ON workspace_plan_years(plan_key, year DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_score_evidence_school
ON workspace_score_evidence(major_code, school_id, year DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_plan_score_evidence_plan
ON workspace_plan_score_evidence(plan_key);

CREATE TABLE IF NOT EXISTS favorites (
    favorite_id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id TEXT NOT NULL,
    major_code TEXT NOT NULL,
    major_name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(school_id, major_code)
);

CREATE TABLE IF NOT EXISTS recent_views (
    recent_id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id TEXT NOT NULL,
    major_code TEXT NOT NULL,
    major_name TEXT NOT NULL,
    viewed_at INTEGER NOT NULL,
    UNIQUE(school_id, major_code)
);
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="同步 Python yam.db 到 Tauri 桌面端 DB")
    parser.add_argument("--source", default=None, help="源 yam.db 路径")
    parser.add_argument("--target", default=None, help="目标 Tauri DB 路径")
    parser.add_argument("--major-code", default=None, help="只同步指定专业代码")
    parser.add_argument("--clear", action="store_true", help="同步前清空目标工作区表")
    return parser.parse_args()


def ensure_target_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(TARGET_SCHEMA)
    conn.commit()

    # Defensively add missing columns (same as Tauri migrate_schema).
    def add_if_missing(table: str, column: str, definition: str) -> None:
        cur = conn.execute(f"PRAGMA table_info({table})")
        if any(r["name"] == column for r in cur.fetchall()):
            return
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
        conn.commit()

    add_if_missing("workspace_schools", "self_scoring", "INTEGER NOT NULL DEFAULT 0")
    add_if_missing("workspace_schools", "doctoral_program", "INTEGER NOT NULL DEFAULT 0")
    add_if_missing("workspace_schools", "double_first_class", "INTEGER NOT NULL DEFAULT 0")
    add_if_missing("workspace_schools", "school_code", "TEXT NOT NULL DEFAULT ''")
    add_if_missing("workspace_schools", "province_code", "TEXT NOT NULL DEFAULT ''")
    add_if_missing("workspace_schools", "is_985", "INTEGER NOT NULL DEFAULT 0")
    add_if_missing("workspace_schools", "is_211", "INTEGER NOT NULL DEFAULT 0")
    add_if_missing("workspace_schools", "display_order", "INTEGER NOT NULL DEFAULT 0")
    add_if_missing("workspace_schools", "source", "TEXT NOT NULL DEFAULT 'yanzhao'")
    add_if_missing("workspace_schools", "updated_at", "TEXT NOT NULL DEFAULT ''")
    add_if_missing("workspace_departments", "source_department_id", "TEXT NOT NULL DEFAULT ''")
    add_if_missing("workspace_departments", "plan_key", "TEXT NOT NULL DEFAULT ''")
    add_if_missing("workspace_departments", "study_mode", "TEXT NOT NULL DEFAULT ''")
    add_if_missing("workspace_departments", "exam_type", "TEXT NOT NULL DEFAULT ''")
    add_if_missing("workspace_departments", "special_plans", "TEXT NOT NULL DEFAULT '[]'")
    add_if_missing("workspace_departments", "source", "TEXT NOT NULL DEFAULT ''")
    add_if_missing("workspace_departments", "updated_at", "TEXT NOT NULL DEFAULT ''")
    add_if_missing("workspace_department_years", "score_scope", "TEXT NOT NULL DEFAULT 'school_major'")
    add_if_missing("workspace_department_years", "source", "TEXT NOT NULL DEFAULT ''")
    add_if_missing("workspace_department_years", "updated_at", "TEXT NOT NULL DEFAULT ''")
    add_if_missing("workspace_department_years", "match_note", "TEXT NOT NULL DEFAULT ''")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workspace_schools_major_code "
        "ON workspace_schools(major_code, school_code, name)"
    )
    conn.commit()


def _normalize_name(name: str) -> str:
    """统一学校名称标点，方便与掌上考研排名对齐."""
    return name.replace("(", "（").replace(")", "）").replace(" ", "").strip()


def _source_has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    cur = conn.execute(f"PRAGMA table_info({table})")
    return any(r["name"] == column for r in cur.fetchall())


def _is_research_institute(name: str) -> bool:
    return any(p in name for p in ("研究院", "研究所", "科学院", "研究生院"))


# 研招网种子省份简写归一化到标准名（与 Tauri 端 YANZHAO_PROVINCE_ORDER 一致）
_PROVINCE_NORMALIZE: dict[str, str] = {
    "内蒙": "内蒙古",
}


def _normalize_province(name: str) -> str:
    return _PROVINCE_NORMALIZE.get(name, name)


def _seed_path(major_code: str) -> Path:
    """研招网种子文件路径，优先用户目录，源码模式兼容仓库数据."""
    user_path = config.data_dir / "seeds" / f"yan_zhao_{major_code}_all_regions.json"
    if user_path.exists():
        return user_path
    return config.project_dir / "data" / "seeds" / f"yan_zhao_{major_code}_all_regions.json"


def load_seed_index(major_code: str) -> dict[str, dict[str, Any]]:
    """加载种子文件并按 school_id 索引，返回 {schId: seed_item}."""
    path = _seed_path(major_code)
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return {str(item.get("schId", "")): item for item in raw}


def clear_major(conn: sqlite3.Connection, major_code: str) -> None:
    conn.execute(
        "DELETE FROM workspace_plan_score_evidence WHERE plan_key IN "
        "(SELECT plan_key FROM workspace_plans WHERE major_code = ?)", (major_code,),
    )
    conn.execute(
        "DELETE FROM workspace_plan_years WHERE plan_key IN "
        "(SELECT plan_key FROM workspace_plans WHERE major_code = ?)", (major_code,),
    )
    conn.execute("DELETE FROM workspace_score_evidence WHERE major_code = ?", (major_code,))
    conn.execute("DELETE FROM workspace_plans WHERE major_code = ?", (major_code,))
    conn.execute("DELETE FROM workspace_department_entities WHERE major_code = ?", (major_code,))
    conn.execute("DELETE FROM workspace_score_request_status WHERE major_code = ?", (major_code,))
    conn.execute("DELETE FROM workspace_model_state WHERE major_code = ?", (major_code,))
    conn.execute("DELETE FROM workspace_majors WHERE major_code = ?", (major_code,))
    conn.execute(
        "DELETE FROM workspace_department_years WHERE department_id IN "
        "(SELECT department_id FROM workspace_departments WHERE major_code = ?)",
        (major_code,),
    )
    conn.execute("DELETE FROM workspace_departments WHERE major_code = ?", (major_code,))
    conn.execute("DELETE FROM workspace_schools WHERE major_code = ?", (major_code,))


def _department_key(school_id: str, major_code: str, source_department_id: str, name: str) -> str:
    identity = [value.strip() for value in (school_id, major_code, source_department_id, name)]
    digest = hashlib.sha256(
        json.dumps(identity, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return f"department:v1:{digest}"


def _score_evidence_key(
    school_id: str,
    major_code: str,
    year: int,
    score_scope: str,
    source: str,
    selected_department_id: str,
) -> str:
    identity = [school_id, major_code, year, score_scope, source, selected_department_id]
    digest = hashlib.sha256(
        json.dumps(identity, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return f"score-evidence:v1:{digest}"


def _plan_snapshot_key(plan_key: str, observed_at: str) -> str:
    digest = hashlib.sha256(f"{plan_key}\0{observed_at}".encode("utf-8")).hexdigest()
    return f"plan-snapshot:v1:{digest}"


def load_schools(conn: sqlite3.Connection, major_code: str) -> list[dict[str, Any]]:
    """读取源库 schools，动态适配新旧 schema.

    旧 schema 没有 school_code/province_code/is_985/is_211/display_order，
    缺失字段补默认值。返回顺序按 school_code 升序（研招网国标代码顺序）。
    """
    has_school_code = _source_has_column(conn, "schools", "school_code")
    has_province_code = _source_has_column(conn, "schools", "province_code")
    has_is_985 = _source_has_column(conn, "schools", "is_985")
    has_is_211 = _source_has_column(conn, "schools", "is_211")
    has_display_order = _source_has_column(conn, "schools", "display_order")
    has_updated_at = _source_has_column(conn, "schools", "updated_at")

    select_cols = [
        "school_id", "name", "province", "level",
        "self_scoring", "doctoral_program", "double_first_class",
    ]
    if has_school_code:
        select_cols.append("school_code")
    if has_province_code:
        select_cols.append("province_code")
    if has_is_985:
        select_cols.append("is_985")
    if has_is_211:
        select_cols.append("is_211")
    if has_display_order:
        select_cols.append("display_order")
    if has_updated_at:
        select_cols.append("updated_at")

    order_by = "school_code ASC" if has_school_code else "name ASC"
    sql = (
        f"SELECT {', '.join(select_cols)} "
        f"FROM schools WHERE major_code = ? ORDER BY {order_by}"
    )
    cur = conn.execute(sql, (major_code,))
    rows = [dict(r) for r in cur.fetchall()]

    # 补默认值
    for r in rows:
        r.setdefault("school_code", "")
        r.setdefault("province_code", "")
        r.setdefault("is_985", 0)
        r.setdefault("is_211", 0)
        r.setdefault("display_order", 0)
        r.setdefault("updated_at", "")
        r["source"] = "yanzhao"
    return rows


def apply_zhangshangkaoyan_rank(
    schools: list[dict[str, Any]], major_code: str
) -> list[dict[str, Any]]:
    """用掌上考研数据覆写 is_985/is_211/double_first_class 标签，并按 school_code 排序.

    研招网 API 的 b985 字段不可靠（全为 0）且无 b211 字段，
    掌上考研 /school/schoolList 接口（按名字查）返回完整的
    is_985/is_211/is_zihuaxian 字段，以此作为 985/211 标识的权威数据源。

    为减少 API 调用，只对双一流学校（syl=1）查询掌上考研标签，
    因为 985/211 必然是双一流的子集。查询结果会缓存到本地文件。

    display_order 按 school_code 升序赋值（掌上考研 schoolListBySpecial 接口已失效）。
    """
    # 筛选双一流学校，只对这些学校查询 985/211 标签
    double_first_schools = [
        s for s in schools
        if s.get("double_first_class") == 1 and s.get("level") != "科研院所"
    ]

    if double_first_schools:
        try:
            from yam.crawler.zhangshangkaoyan import ZhangShangKaoYanCrawler

            crawler = ZhangShangKaoYanCrawler(major_code, major_code)
            tags_map = crawler.fetch_school_tags_map(
                [s.get("name", "") for s in double_first_schools]
            )
        except Exception:
            tags_map = {}

        # 用掌上考研标签覆写 985/211/double_first_class
        for s in double_first_schools:
            normalized = _normalize_name(s.get("name", ""))
            tags = tags_map.get(normalized)
            if tags is not None:
                s["is_985"] = tags["is_985"]
                s["is_211"] = tags["is_211"]
                s["double_first_class"] = tags["syl"]

    # display_order 按 school_code 升序赋值
    schools.sort(key=lambda s: s.get("school_code", "") or "")
    for idx, s in enumerate(schools):
        s["display_order"] = idx
    return schools


def _enrich_school_fields(school: dict[str, Any]) -> None:
    """根据 is_985/is_211/double_first_class 字段更新 level 文本.

    研招网 b985 字段不可靠，is_985/is_211 在 apply_zhangshangkaoyan_rank 中
    由掌上考研数据覆写。这里根据最终的 is_985/is_211/double_first_class 字段值
    生成规范的 level 文本。
    """
    if school.get("level") == "科研院所":
        school["is_985"] = 0
        school["is_211"] = 0
        school["double_first_class"] = 0
        return

    is_985 = int(school.get("is_985", 0))
    is_211 = int(school.get("is_211", 0))
    is_double = int(school.get("double_first_class", 0))

    # 生成规范的 level 文本
    tags = []
    if is_985:
        tags.append("985")
    if is_211:
        tags.append("211")
    if is_double:
        tags.append("双一流")
    school["level"] = " / ".join(tags) if tags else "普通本科"


def load_departments(conn: sqlite3.Connection, school_id: str, major_code: str) -> list[dict[str, Any]]:
    source_expr = "COALESCE(source, '')" if _source_has_column(conn, "departments", "source") else "''"
    updated_at_expr = "COALESCE(updated_at, '')" if _source_has_column(conn, "departments", "updated_at") else "''"
    catalog_year_expr = "catalog_year" if _source_has_column(conn, "departments", "catalog_year") else "NULL"
    cur = conn.execute(
        f"""
        SELECT department_id, name, research_direction, enrollment_count,
               exam_subjects, exam_type, study_mode, special_plans,
               {source_expr} AS source, {updated_at_expr} AS updated_at,
               {catalog_year_expr} AS catalog_year
        FROM departments
        WHERE school_id = ? AND major_code = ?
        ORDER BY name
        """,
        (school_id, major_code),
    )
    rows = cur.fetchall()
    result = []
    for r in rows:
        item = dict(r)
        item["exam_subjects"] = json.loads(item.get("exam_subjects") or "[]")
        item["special_plans"] = json.loads(item.get("special_plans") or "[]")
        result.append(item)
    return result


def load_score_lines(
    conn: sqlite3.Connection, school_id: str, department_name: str, major_code: str
) -> list[dict[str, Any]]:
    """每年选择一条完整来源记录，禁止按列 MIN 拼接不存在的分数线。"""
    optional_columns = {
        name for name in (
            "raw_code", "raw_department_name", "metric_type", "match_scope",
            "confidence", "raw_evidence_json",
        ) if _source_has_column(conn, "score_lines", name)
    }
    select_optional = ", ".join(f"sl.{name}" for name in sorted(optional_columns))
    if select_optional:
        select_optional = ", " + select_optional
    rows = conn.execute(
        f"""
        SELECT sl.department_id, sl.year, sl.total, sl.politics, sl.english,
               sl.special_one, sl.special_two, COALESCE(sl.source, '') source,
               COALESCE(sl.updated_at, '') updated_at, COALESCE(sl.note, '') note
               {select_optional}
        FROM score_lines sl
        WHERE sl.school_id = ? AND sl.major_code = ?
        ORDER BY sl.year DESC,
                 CASE WHEN sl.total IS NULL THEN 1 ELSE 0 END,
                 sl.total ASC, sl.department_id ASC
        """,
        (school_id, major_code),
    ).fetchall()
    grouped: dict[int, list[dict[str, Any]]] = {}
    for row in rows:
        item = dict(row)
        grouped.setdefault(int(item["year"]), []).append(item)

    result: list[dict[str, Any]] = []
    for year in sorted(grouped, reverse=True):
        candidates = grouped[year]
        selected = dict(candidates[0])
        selected["source_record_count"] = len(candidates)
        selected["selected_department_id"] = selected.get("department_id") or ""
        if len(candidates) > 1:
            detail = f"同校同专业同年{len(candidates)}条来源记录，完整保留最低总分记录"
            selected["note"] = " | ".join(v for v in (selected.get("note") or "", detail) if v)
        result.append(selected)
    return result


def insert_department(
    target: sqlite3.Connection,
    school_id: str,
    major_code: str,
    dept: dict[str, Any],
) -> int:
    exam_subjects = [str(value).strip() for value in (dept.get("exam_subjects") or [])]
    special_plans = [str(value).strip() for value in (dept.get("special_plans") or [])]
    source_department_id = str(dept.get("department_id") or "").strip()
    name = str(dept.get("name") or "").strip()
    research_direction = str(dept.get("research_direction") or "").strip()
    study_mode = str(dept.get("study_mode") or "").strip()
    exam_type = str(dept.get("exam_type") or "").strip()
    plan_identity = [
        school_id,
        major_code,
        source_department_id,
        name,
        research_direction,
        exam_subjects,
        study_mode,
        exam_type,
        special_plans,
    ]
    plan_key = hashlib.sha256(
        json.dumps(
            plan_identity,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    source = str(dept.get("source") or "")
    updated_at = str(dept.get("updated_at") or "")
    exam_subjects_text = ",".join(exam_subjects)
    special_plans_text = json.dumps(special_plans, ensure_ascii=False)
    department_key = _department_key(school_id, major_code, source_department_id, name)
    target.execute(
        """
        INSERT INTO workspace_department_entities
        (department_key, school_id, major_code, source_department_id, name, source, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(department_key) DO UPDATE SET
            source=excluded.source, updated_at=excluded.updated_at
        """,
        (department_key, school_id, major_code, source_department_id, name, source, updated_at),
    )
    cursor = target.execute(
        """
        INSERT INTO workspace_departments
        (source_department_id, plan_key, school_id, major_code, name, research_direction,
         exam_subjects, study_mode, exam_type, special_plans, source, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (source_department_id, plan_key, school_id, major_code, name, research_direction,
         exam_subjects_text, study_mode, exam_type, special_plans_text, source, updated_at),
    )
    department_id = int(cursor.lastrowid)
    target.execute(
        """
        INSERT INTO workspace_plans
        (plan_id, plan_key, department_key, school_id, major_code, research_direction,
         exam_subjects, study_mode, exam_type, special_plans, enrollment_count, source,
         source_record_kind, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'yanzhao_department_derived', ?)
        """,
        (department_id, plan_key, department_key, school_id, major_code, research_direction,
         exam_subjects_text, study_mode, exam_type, special_plans_text,
         dept.get("enrollment_count") or 0, source, updated_at),
    )
    catalog_year = int(dept.get("catalog_year") or 0) or None
    catalog_year_status = "provided" if catalog_year is not None else "unknown"
    observed_at = updated_at or datetime.now(timezone.utc).isoformat()
    target.execute(
        """
        INSERT INTO workspace_plan_snapshots
        (snapshot_key, plan_key, department_key, school_id, major_code, catalog_year,
         catalog_year_status, observed_at, research_direction, exam_subjects, study_mode,
         exam_type, special_plans, enrollment_count, source, source_record_kind)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'yanzhao_department_derived')
        ON CONFLICT(snapshot_key) DO UPDATE SET
            catalog_year=excluded.catalog_year,
            catalog_year_status=excluded.catalog_year_status,
            research_direction=excluded.research_direction,
            exam_subjects=excluded.exam_subjects,
            study_mode=excluded.study_mode,
            exam_type=excluded.exam_type,
            special_plans=excluded.special_plans,
            enrollment_count=excluded.enrollment_count,
            source=excluded.source
        """,
        (
            _plan_snapshot_key(plan_key, observed_at),
            plan_key,
            department_key,
            school_id,
            major_code,
            catalog_year,
            catalog_year_status,
            observed_at,
            research_direction,
            exam_subjects_text,
            study_mode,
            exam_type,
            special_plans_text,
            dept.get("enrollment_count") or 0,
            source,
        ),
    )
    return department_id


def _score_scope(score: dict[str, Any]) -> str:
    note = str(score.get("note") or "")
    match_scope = str(score.get("match_scope") or "")
    if match_scope in ("discipline", "first_level") or "一级学科参考线" in note:
        return "first_level_reference"
    if match_scope == "category" or "门类级参考线" in note:
        return "category_reference"
    return "school_major"


def insert_shared_score_evidence(
    target: sqlite3.Connection,
    school_id: str,
    major_code: str,
    score_lines: list[dict[str, Any]],
) -> dict[int, str]:
    """每校、专业、年份只保存一份共享分数证据。"""
    evidence_keys: dict[int, str] = {}
    for score in score_lines:
        year = int(score.get("year") or 0)
        score_scope = _score_scope(score)
        source = str(score.get("source") or "")
        selected_department_id = str(score.get("selected_department_id") or "")
        evidence_key = _score_evidence_key(
            school_id,
            major_code,
            year,
            score_scope,
            source,
            selected_department_id,
        )
        target.execute(
            """
            INSERT INTO workspace_score_evidence
            (evidence_key, school_id, major_code, year, min_score, politics, english,
             math, specialized, score_scope, source, updated_at, match_note,
             raw_evidence_json, source_record_count, selected_department_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                evidence_key,
                school_id,
                major_code,
                year,
                score.get("total") or 0,
                score.get("politics") or 0,
                score.get("english") or 0,
                score.get("special_one") or 0,
                score.get("special_two") or 0,
                score_scope,
                source,
                score.get("updated_at") or "",
                score.get("note") or "",
                score.get("raw_evidence_json") or "{}",
                int(score.get("source_record_count") or 1),
                selected_department_id,
            ),
        )
        evidence_keys[year] = evidence_key
    return evidence_keys


def insert_department_years(
    target: sqlite3.Connection,
    department_id: int,
    dept_enrollment_count: int | None,
    score_lines: list[dict[str, Any]],
    shared_evidence_keys: dict[int, str],
) -> int:
    """legacy 表保留投影；normalized 模型只保存共享证据引用。"""
    latest_main_score = 0
    for score in score_lines:
        total = score.get("total")
        note = score.get("note") or ""
        score_scope = _score_scope(score)
        if latest_main_score == 0 and total is not None and score_scope == "school_major":
            latest_main_score = int(total)

        year_values = (
            score.get("year") or 0,
            0,  # 当前招生人数不是历史年份人数，禁止复制到每个分数年份。
            total or 0,
            score.get("politics") or 0,
            score.get("english") or 0,
            score.get("special_one") or 0,
            score.get("special_two") or 0,
            score_scope,
            score.get("source") or "",
            score.get("updated_at") or "",
            note,
        )
        target.execute(
            """
            INSERT INTO workspace_department_years
            (department_id, year, enroll_count, min_score, politics, english, math, specialized,
             score_scope, source, updated_at, match_note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (department_id, *year_values),
        )
        plan_key = target.execute(
            "SELECT plan_key FROM workspace_plans WHERE plan_id = ?", (department_id,)
        ).fetchone()[0]
        evidence_key = shared_evidence_keys.get(int(score.get("year") or 0))
        if evidence_key:
            target.execute(
                """INSERT INTO workspace_plan_score_evidence
                   (plan_key, evidence_key, relation_kind)
                   VALUES (?, ?, 'shared_reference')""",
                (plan_key, evidence_key),
            )
        else:
            target.execute(
                """
                INSERT INTO workspace_plan_years
                (plan_key, year, enroll_count, min_score, politics, english, math, specialized,
                 score_scope, source, updated_at, match_note)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (plan_key, *year_values),
            )
    return latest_main_score


def unique_plan_enrollment_total(departments: list[dict[str, Any]]) -> int:
    seen: set[tuple[str, str, str, int]] = set()
    total = 0
    for dept in departments:
        count = int(dept.get("enrollment_count") or 0)
        key = (
            str(dept.get("department_id") or "").strip(),
            str(dept.get("study_mode") or "").strip(),
            str(dept.get("exam_type") or "").strip(),
            count,
        )
        if key in seen:
            continue
        seen.add(key)
        total += count
    return total


def sync_major(source: sqlite3.Connection, target: sqlite3.Connection, major_code: str) -> dict[str, int]:
    clear_major(target, major_code)
    now_str = datetime.now(timezone.utc).isoformat()
    major_info = config.get_major(major_code) or {}
    major_source = (
        "realtime_major_catalog"
        if config.realtime_majors_file.exists()
        and bool(major_info.get("discipline_code") or major_info.get("category_code"))
        else "static_major_catalog"
    )
    target.execute(
        """
        INSERT INTO workspace_majors
        (major_code, name, degree_type, category_code, category_name,
         discipline_code, discipline_name, source, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (major_code, str(major_info.get("name") or major_info.get("zymc") or major_code),
         str(major_info.get("degree_type") or ""), str(major_info.get("category_code") or ""),
         str(major_info.get("category_name") or ""), str(major_info.get("discipline_code") or ""),
         str(major_info.get("discipline_name") or ""), major_source, now_str),
    )
    target.execute(
        "INSERT INTO workspace_model_state (major_code, model_version, status) VALUES (?, 4, 'writing')",
        (major_code,),
    )

    if _source_has_column(source, "score_request_status", "status"):
        status_rows = source.execute(
            """SELECT major_code, school_id, requested_year, source, status,
                      COALESCE(error_message, ''), COALESCE(retrieved_at, '')
               FROM score_request_status WHERE major_code = ?""",
            (major_code,),
        ).fetchall()
        target.executemany(
            """INSERT INTO workspace_score_request_status
               (major_code, school_id, requested_year, source, status, error_message, retrieved_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            [tuple(row) for row in status_rows],
        )

    schools = load_schools(source, major_code)
    # 从种子文件回填 school_code/province_code/is_985/is_211 并修正科研院所 level
    seed_index = load_seed_index(major_code)
    if seed_index:
        for s in schools:
            seed = seed_index.get(str(s["school_id"]))
            if seed:
                s["school_code"] = seed.get("dwdm", "") or ""
                s["province_code"] = seed.get("szssm", "") or ""
                s["is_985"] = 1 if seed.get("b985") == "1" else 0
                # 种子无独立 211 字段：985 自动含 211
                s["is_211"] = 1 if seed.get("b985") == "1" else 0
                # 省份名归一化（"内蒙" → "内蒙古"）
                s["province"] = _normalize_province(seed.get("szss", "") or s.get("province", "") or "")
            # 科研院所 level 修正（无论种子是否存在都按名称判断）
            if _is_research_institute(s.get("name", "")):
                s["level"] = "科研院所"
    # 先用掌上考研数据覆写 is_985/is_211/double_first_class 字段
    schools = apply_zhangshangkaoyan_rank(schools, major_code)
    # 再根据最终的 is_985/is_211/double_first_class 字段生成规范的 level 文本
    for s in schools:
        _enrich_school_fields(s)
    inserted_schools = 0
    inserted_departments = 0
    inserted_years = 0

    for school in schools:
        school_id = school["school_id"]
        departments = load_departments(source, school_id, major_code)
        # 当前分数按学校+专业+年份聚合，每所学校只需查询一次并复用到各计划。
        score_lines = load_score_lines(source, school_id, "", major_code)
        shared_evidence_keys = insert_shared_score_evidence(
            target, school_id, major_code, score_lines
        )

        school_enroll_count = unique_plan_enrollment_total(departments)
        school_min_score: int | None = None

        for dept in departments:
            dept_enrollment_count = dept.get("enrollment_count") or 0

            target_dept_id = insert_department(target, school_id, major_code, dept)
            inserted_departments += 1

            latest_dept_score = insert_department_years(
                target,
                target_dept_id,
                dept_enrollment_count,
                score_lines,
                shared_evidence_keys,
            )
            inserted_years += len(score_lines)

            if latest_dept_score > 0 and school_min_score is None:
                # 所有计划共享同一学校专业参考层，院校主分数取最新可用专业级记录。
                school_min_score = latest_dept_score

        target.execute(
            """
            INSERT INTO workspace_schools
            (school_id, major_code, name, province, level, min_score, enroll_count,
             self_scoring, doctoral_program, double_first_class,
             school_code, province_code, is_985, is_211, display_order, source, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                school_id,
                major_code,
                school.get("name") or "",
                school.get("province") or "",
                school.get("level") or "",
                school_min_score or 0,
                school_enroll_count,
                int(bool(school.get("self_scoring"))),
                int(bool(school.get("doctoral_program"))),
                int(bool(school.get("double_first_class"))),
                school.get("school_code", "") or "",
                school.get("province_code", "") or "",
                int(bool(school.get("is_985"))),
                int(bool(school.get("is_211"))),
                int(school.get("display_order", 0) or 0),
                "yanzhao",
                school.get("updated_at", "") or "",
            ),
        )
        inserted_schools += 1

    old_plan_count = target.execute(
        "SELECT COUNT(*) FROM workspace_departments WHERE major_code = ?", (major_code,)
    ).fetchone()[0]
    new_plan_count = target.execute(
        "SELECT COUNT(*) FROM workspace_plans WHERE major_code = ?", (major_code,)
    ).fetchone()[0]
    old_year_count = target.execute(
        """SELECT COUNT(*) FROM workspace_department_years y
           JOIN workspace_departments d ON d.department_id = y.department_id
           WHERE d.major_code = ?""", (major_code,),
    ).fetchone()[0]
    new_year_count = target.execute(
        """SELECT
             (SELECT COUNT(*) FROM workspace_plan_years y
              JOIN workspace_plans p ON p.plan_key = y.plan_key
              WHERE p.major_code = ?)
             +
             (SELECT COUNT(*) FROM workspace_plan_score_evidence r
              JOIN workspace_plans p ON p.plan_key = r.plan_key
              JOIN workspace_score_evidence e ON e.evidence_key = r.evidence_key
              WHERE p.major_code = ?)""",
        (major_code, major_code),
    ).fetchone()[0]
    invalid_plan_keys = target.execute(
        """SELECT COUNT(*) FROM workspace_departments
           WHERE major_code = ? AND (plan_key IS NULL OR TRIM(plan_key) = '')""",
        (major_code,),
    ).fetchone()[0]
    duplicate_plan_keys = target.execute(
        """SELECT COUNT(*) FROM (
           SELECT plan_key FROM workspace_plans WHERE major_code = ?
           GROUP BY plan_key HAVING COUNT(*) > 1)""", (major_code,),
    ).fetchone()[0]
    duplicate_years = target.execute(
        """SELECT COUNT(*) FROM (
           SELECT plan_key, year FROM (
             SELECT y.plan_key, y.year FROM workspace_plan_years y
             JOIN workspace_plans p ON p.plan_key = y.plan_key WHERE p.major_code = ?
             UNION ALL
             SELECT r.plan_key, e.year FROM workspace_plan_score_evidence r
             JOIN workspace_score_evidence e ON e.evidence_key = r.evidence_key
             JOIN workspace_plans p ON p.plan_key = r.plan_key WHERE p.major_code = ?
           ) GROUP BY plan_key, year HAVING COUNT(*) > 1)""",
        (major_code, major_code),
    ).fetchone()[0]
    invalid_evidence_links = target.execute(
        """SELECT COUNT(*) FROM workspace_plan_score_evidence r
           LEFT JOIN workspace_plans p ON p.plan_key = r.plan_key
           LEFT JOIN workspace_score_evidence e ON e.evidence_key = r.evidence_key
           WHERE p.plan_key IS NULL OR e.evidence_key IS NULL
              OR p.school_id <> e.school_id OR p.major_code <> e.major_code"""
    ).fetchone()[0]
    plans_without_snapshots = target.execute(
        """SELECT COUNT(*) FROM workspace_plans p
           LEFT JOIN workspace_plan_snapshots s ON s.plan_key = p.plan_key
           WHERE p.major_code = ? AND s.snapshot_key IS NULL""",
        (major_code,),
    ).fetchone()[0]
    if (old_plan_count != new_plan_count or old_year_count != new_year_count
            or invalid_plan_keys or duplicate_plan_keys or duplicate_years
            or invalid_evidence_links or plans_without_snapshots):
        raise RuntimeError(
            f"规范化校验失败: plans={old_plan_count}/{new_plan_count}, "
            f"years={old_year_count}/{new_year_count}, empty_keys={invalid_plan_keys}, "
            f"duplicate_keys={duplicate_plan_keys}, duplicate_years={duplicate_years}, "
            f"invalid_evidence_links={invalid_evidence_links}, "
            f"plans_without_snapshots={plans_without_snapshots}"
        )
    target.execute(
        """UPDATE workspace_model_state SET status='ready', old_plan_count=?, new_plan_count=?,
           old_year_count=?, new_year_count=?, verified_at=?, error_message=''
           WHERE major_code=?""",
        (old_plan_count, new_plan_count, old_year_count, new_year_count, now_str, major_code),
    )
    return {
        "schools": inserted_schools,
        "departments": inserted_departments,
        "years": inserted_years,
    }


def main() -> int:
    args = parse_args()

    source_path = Path(args.source) if args.source else config.data_dir / "yam.db"
    target_path = Path(args.target) if args.target else Path.home() / ".yam" / "data" / "yam-desktop.db"

    if not source_path.exists():
        print(f"源数据库不存在: {source_path}", file=sys.stderr)
        return 1

    target_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(str(source_path)) as source:
        source.row_factory = sqlite3.Row
        with sqlite3.connect(str(target_path)) as target:
            target.row_factory = sqlite3.Row
            ensure_target_schema(target)

            if args.clear and not args.major_code:
                for table in [
                    "workspace_plan_score_evidence", "workspace_plan_years",
                    "workspace_score_evidence", "workspace_plan_snapshots",
                    "workspace_plans", "workspace_department_entities",
                    "workspace_model_state", "workspace_majors", "workspace_department_years",
                    "workspace_departments", "workspace_schools",
                ]:
                    target.execute(f"DELETE FROM {table}")
                target.commit()

            major_codes: list[str]
            if args.major_code:
                major_codes = [args.major_code]
            else:
                cur = source.execute(
                    "SELECT DISTINCT major_code FROM schools ORDER BY major_code"
                )
                major_codes = [r["major_code"] for r in cur.fetchall()]

            for major_code in major_codes:
                with target:
                    stats = sync_major(source, target, major_code)
                print(
                    f"同步完成 {major_code}: "
                    f"{stats['schools']} 所学校, "
                    f"{stats['departments']} 个院系, "
                    f"{stats['years']} 条年份数据"
                )

    return 0


if __name__ == "__main__":
    sys.exit(main())
