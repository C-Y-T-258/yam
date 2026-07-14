"""将 Python 后端 yam.db 数据同步到 Tauri 桌面端 SQLite.

用法：
    python -m yam.scripts.sync_to_tauri --major-code 085400
    python -m yam.scripts.sync_to_tauri --major-code 085400 --clear
    python -m yam.scripts.sync_to_tauri  # 同步全部 enabled 专业
"""

import argparse
import json
import sqlite3
import sys
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
    PRIMARY KEY (school_id, major_code)
);

CREATE TABLE IF NOT EXISTS workspace_departments (
    department_id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id TEXT NOT NULL,
    major_code TEXT NOT NULL,
    name TEXT NOT NULL,
    research_direction TEXT NOT NULL,
    exam_subjects TEXT NOT NULL,
    study_mode TEXT NOT NULL DEFAULT '',
    exam_type TEXT NOT NULL DEFAULT '',
    special_plans TEXT NOT NULL DEFAULT '[]',
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
    FOREIGN KEY (department_id) REFERENCES workspace_departments(department_id)
);

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
    add_if_missing("workspace_departments", "study_mode", "TEXT NOT NULL DEFAULT ''")
    add_if_missing("workspace_departments", "exam_type", "TEXT NOT NULL DEFAULT ''")
    add_if_missing("workspace_departments", "special_plans", "TEXT NOT NULL DEFAULT '[]'")


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
    """研招网种子文件路径，可能不存在."""
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
        """
        DELETE FROM workspace_department_years
        WHERE department_id IN (
            SELECT department_id FROM workspace_departments WHERE major_code = ?
        )
        """,
        (major_code,),
    )
    conn.execute("DELETE FROM workspace_departments WHERE major_code = ?", (major_code,))
    conn.execute("DELETE FROM workspace_schools WHERE major_code = ?", (major_code,))
    conn.commit()


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
    return rows


def apply_zhangshangkaoyan_rank(
    schools: list[dict[str, Any]], major_code: str
) -> list[dict[str, Any]]:
    """用掌上考研排名覆写 display_order，失败降级到 school_code 升序."""
    try:
        from yam.crawler.zhangshangkaoyan import ZhangShangKaoYanCrawler

        crawler = ZhangShangKaoYanCrawler(major_code, major_code)
        rank_map = crawler.fetch_school_rank_map(major_code)
    except Exception:
        rank_map = {}

    if not rank_map:
        # 降级：按 school_code 升序赋 display_order
        schools.sort(key=lambda s: s.get("school_code", "") or "")
        for idx, s in enumerate(schools):
            s["display_order"] = idx
        return schools

    # 用掌上考研排名赋值；排名未命中的学校排在末尾
    max_rank = max(rank_map.values()) + 1 if rank_map else 0
    for s in schools:
        normalized = _normalize_name(s.get("name", ""))
        s["display_order"] = rank_map.get(normalized, max_rank)
    # 重新按 display_order 排序
    schools.sort(key=lambda s: s.get("display_order", 0))
    return schools


def _enrich_school_fields(school: dict[str, Any]) -> None:
    """根据 level 文本反推 is_985/is_211/double_first_class，覆盖种子默认值."""
    level = school.get("level", "") or ""
    if level == "科研院所":
        school["is_985"] = 0
        school["is_211"] = 0
        school["double_first_class"] = 0
        return
    school["is_985"] = 1 if "985" in level else school.get("is_985", 0)
    school["is_211"] = 1 if "211" in level else school.get("is_211", 0)
    school["double_first_class"] = 1 if "双一流" in level else school.get("double_first_class", 0)


def load_departments(conn: sqlite3.Connection, school_id: str, major_code: str) -> list[dict[str, Any]]:
    cur = conn.execute(
        """
        SELECT department_id, name, research_direction, enrollment_count,
               exam_subjects, exam_type, study_mode, special_plans
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
    """加载院系历年分数线.

    score_lines.department_id 来自掌上考研 API，与 departments.department_id
    （研招网院系所代码）不是同一套编码，因此通过 admission_plans 中的
    department_name 建立映射关系。
    """
    cur = conn.execute(
        """
        SELECT DISTINCT sl.year, sl.total, sl.politics, sl.english, sl.special_one, sl.special_two
        FROM score_lines sl
        WHERE sl.school_id = ? AND sl.major_code = ?
          AND sl.department_id IN (
              SELECT ap.department_id
              FROM admission_plans ap
              WHERE ap.school_id = sl.school_id
                AND ap.major_code = sl.major_code
                AND ap.department_name = ?
          )
        ORDER BY sl.year DESC
        """,
        (school_id, major_code, department_name),
    )
    return [dict(r) for r in cur.fetchall()]


def insert_department(
    target: sqlite3.Connection,
    school_id: str,
    major_code: str,
    dept: dict[str, Any],
) -> int:
    exam_subjects = dept.get("exam_subjects") or []
    special_plans = dept.get("special_plans") or []
    target.execute(
        """
        INSERT INTO workspace_departments
        (school_id, major_code, name, research_direction, exam_subjects,
         study_mode, exam_type, special_plans)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            school_id,
            major_code,
            dept.get("name") or "",
            dept.get("research_direction") or "",
            ",".join(exam_subjects),
            dept.get("study_mode") or "",
            dept.get("exam_type") or "",
            json.dumps(special_plans, ensure_ascii=False),
        ),
    )
    target.commit()
    return target.execute("SELECT last_insert_rowid()").fetchone()[0]


def insert_department_years(
    target: sqlite3.Connection,
    department_id: int,
    dept_enrollment_count: int | None,
    score_lines: list[dict[str, Any]],
) -> int:
    """写入年份数据，返回该院系聚合后的 min_score."""
    dept_min_score: int | None = None
    for score in score_lines:
        total = score.get("total")
        if total is not None:
            if dept_min_score is None or total < dept_min_score:
                dept_min_score = total

        target.execute(
            """
            INSERT INTO workspace_department_years
            (department_id, year, enroll_count, min_score, politics, english, math, specialized)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                department_id,
                score.get("year") or 0,
                dept_enrollment_count or 0,
                total or 0,
                score.get("politics") or 0,
                score.get("english") or 0,
                score.get("special_one") or 0,
                score.get("special_two") or 0,
            ),
        )
    target.commit()
    return dept_min_score or 0


def sync_major(source: sqlite3.Connection, target: sqlite3.Connection, major_code: str) -> dict[str, int]:
    clear_major(target, major_code)

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
    # 根据 level 文本最终确认 is_985/is_211/double_first_class
    for s in schools:
        _enrich_school_fields(s)
    schools = apply_zhangshangkaoyan_rank(schools, major_code)
    inserted_schools = 0
    inserted_departments = 0
    inserted_years = 0

    for school in schools:
        school_id = school["school_id"]
        departments = load_departments(source, school_id, major_code)

        school_enroll_count = 0
        school_min_score: int | None = None

        for dept in departments:
            dept_enrollment_count = dept.get("enrollment_count") or 0
            school_enroll_count += dept_enrollment_count

            target_dept_id = insert_department(target, school_id, major_code, dept)
            inserted_departments += 1

            score_lines = load_score_lines(source, school_id, dept["name"], major_code)
            dept_min_score = insert_department_years(
                target, target_dept_id, dept_enrollment_count, score_lines
            )
            inserted_years += len(score_lines)

            if dept_min_score > 0 and (school_min_score is None or dept_min_score < school_min_score):
                school_min_score = dept_min_score

        target.execute(
            """
            INSERT INTO workspace_schools
            (school_id, major_code, name, province, level, min_score, enroll_count,
             self_scoring, doctoral_program, double_first_class,
             school_code, province_code, is_985, is_211, display_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            ),
        )
        inserted_schools += 1

    target.commit()
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
                for table in ["workspace_department_years", "workspace_departments", "workspace_schools"]:
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
