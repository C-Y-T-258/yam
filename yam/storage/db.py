"""SQLite 数据库操作."""

import json
import sqlite3
from pathlib import Path
from typing import Any, Optional

from yam.config import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS schools (
    school_id TEXT NOT NULL,
    major_code TEXT NOT NULL,
    name TEXT NOT NULL,
    province TEXT,
    level TEXT,
    self_scoring INTEGER DEFAULT 0,
    doctoral_program INTEGER DEFAULT 0,
    double_first_class INTEGER DEFAULT 0,
    updated_at TEXT,
    PRIMARY KEY (school_id, major_code)
);

CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id TEXT NOT NULL,
    school_id TEXT NOT NULL,
    major_code TEXT NOT NULL,
    name TEXT NOT NULL,
    research_direction TEXT,
    enrollment_count INTEGER,
    enrollment_text TEXT,
    exam_subjects TEXT,
    exam_type TEXT,
    study_mode TEXT,
    special_plans TEXT,
    advisor TEXT,
    source TEXT,
    updated_at TEXT,
    UNIQUE (school_id, major_code, department_id, research_direction)
);

CREATE TABLE IF NOT EXISTS score_lines (
    school_id TEXT NOT NULL,
    department_id TEXT NOT NULL,
    major_code TEXT NOT NULL,
    year INTEGER NOT NULL,
    total INTEGER,
    politics INTEGER,
    english INTEGER,
    special_one INTEGER,
    special_two INTEGER,
    note TEXT,
    source TEXT,
    updated_at TEXT,
    raw_code TEXT,
    raw_department_name TEXT,
    metric_type TEXT,
    match_scope TEXT,
    confidence REAL,
    raw_evidence_json TEXT,
    PRIMARY KEY (school_id, department_id, major_code, year)
);

CREATE TABLE IF NOT EXISTS score_request_status (
    major_code TEXT NOT NULL,
    school_id TEXT NOT NULL,
    requested_year INTEGER NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    error_message TEXT,
    retrieved_at TEXT,
    PRIMARY KEY (major_code, school_id, requested_year, source)
);

CREATE TABLE IF NOT EXISTS admission_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id TEXT NOT NULL,
    department_id TEXT NOT NULL,
    major_code TEXT NOT NULL,
    year INTEGER NOT NULL,
    plan_id TEXT,
    spe_id TEXT,
    department_name TEXT,
    research_direction TEXT,
    exam_subjects TEXT,
    reference_books TEXT,
    enrollment_count INTEGER,
    note TEXT,
    source TEXT,
    updated_at TEXT,
    UNIQUE (school_id, department_id, major_code, year)
);

CREATE TABLE IF NOT EXISTS fetch_log (
    major_code TEXT NOT NULL,
    school_id TEXT,
    task_type TEXT NOT NULL,
    status TEXT NOT NULL,
    tried_at TEXT,
    error_message TEXT,
    PRIMARY KEY (major_code, school_id, task_type)
);

CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    major_code TEXT NOT NULL,
    major_name TEXT,
    fetched_at TEXT,
    school_count INTEGER,
    source TEXT
);

CREATE TABLE IF NOT EXISTS favorites (
    school_id TEXT NOT NULL,
    major_code TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (school_id, major_code)
);

CREATE TABLE IF NOT EXISTS recent_views (
    school_id TEXT NOT NULL,
    major_code TEXT NOT NULL,
    viewed_at TEXT NOT NULL,
    PRIMARY KEY (school_id, major_code)
);

CREATE INDEX IF NOT EXISTS idx_schools_filter
ON schools (major_code, province, level, name);

CREATE INDEX IF NOT EXISTS idx_score_lines_school_major_year
ON score_lines (school_id, major_code, year DESC);

CREATE INDEX IF NOT EXISTS idx_departments_major_school
ON departments (major_code, school_id);
"""


class Database:
    """YAM SQLite 数据库."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or config.data_dir / "yam.db"
        self.conn = sqlite3.connect(str(self.db_path))
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        self.conn.executescript(SCHEMA)
        self.conn.commit()
        self._migrate_schema()

    def _migrate_schema(self) -> None:
        """轻量 schema 迁移."""
        version = self.conn.execute("PRAGMA user_version").fetchone()["user_version"]
        if version < 1:
            # v1: 新增 favorites / recent_views 表与索引
            self.conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS favorites (
                    school_id TEXT NOT NULL,
                    major_code TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (school_id, major_code)
                );
                CREATE TABLE IF NOT EXISTS recent_views (
                    school_id TEXT NOT NULL,
                    major_code TEXT NOT NULL,
                    viewed_at TEXT NOT NULL,
                    PRIMARY KEY (school_id, major_code)
                );
                CREATE INDEX IF NOT EXISTS idx_schools_filter
                ON schools (major_code, province, level, name);
                PRAGMA user_version = 1;
                """
            )
            self.conn.commit()
        if version < 2:
            # v2: 新增学校特性与院系属性字段
            def _has_column(table: str, column: str) -> bool:
                cur = self.conn.execute(f"PRAGMA table_info({table})")
                return any(r["name"] == column for r in cur.fetchall())

            if not _has_column("schools", "self_scoring"):
                self.conn.execute("ALTER TABLE schools ADD COLUMN self_scoring INTEGER DEFAULT 0")
            if not _has_column("schools", "doctoral_program"):
                self.conn.execute("ALTER TABLE schools ADD COLUMN doctoral_program INTEGER DEFAULT 0")
            if not _has_column("schools", "double_first_class"):
                self.conn.execute("ALTER TABLE schools ADD COLUMN double_first_class INTEGER DEFAULT 0")
            if not _has_column("departments", "study_mode"):
                self.conn.execute("ALTER TABLE departments ADD COLUMN study_mode TEXT")
            if not _has_column("departments", "special_plans"):
                self.conn.execute("ALTER TABLE departments ADD COLUMN special_plans TEXT")
            self.conn.execute("PRAGMA user_version = 2")
            self.conn.commit()
        if version < 3:
            # v3: 新增学校代码、省份代码、985/211 标识、掌上考研排名字段
            def _has_column(table: str, column: str) -> bool:
                cur = self.conn.execute(f"PRAGMA table_info({table})")
                return any(r["name"] == column for r in cur.fetchall())

            if not _has_column("schools", "school_code"):
                self.conn.execute("ALTER TABLE schools ADD COLUMN school_code TEXT DEFAULT ''")
            if not _has_column("schools", "province_code"):
                self.conn.execute("ALTER TABLE schools ADD COLUMN province_code TEXT DEFAULT ''")
            if not _has_column("schools", "is_985"):
                self.conn.execute("ALTER TABLE schools ADD COLUMN is_985 INTEGER DEFAULT 0")
            if not _has_column("schools", "is_211"):
                self.conn.execute("ALTER TABLE schools ADD COLUMN is_211 INTEGER DEFAULT 0")
            if not _has_column("schools", "display_order"):
                self.conn.execute("ALTER TABLE schools ADD COLUMN display_order INTEGER DEFAULT 0")
            self.conn.execute("PRAGMA user_version = 3")
            self.conn.commit()

        def _has_column(table: str, column: str) -> bool:
            return any(r["name"] == column for r in self.conn.execute(f"PRAGMA table_info({table})"))

        for column, column_type in (("raw_code", "TEXT"), ("raw_department_name", "TEXT"),
                                    ("metric_type", "TEXT"), ("match_scope", "TEXT"),
                                    ("confidence", "REAL"), ("raw_evidence_json", "TEXT")):
            if not _has_column("score_lines", column):
                self.conn.execute(f"ALTER TABLE score_lines ADD COLUMN {column} {column_type}")
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS score_request_status (
                major_code TEXT NOT NULL, school_id TEXT NOT NULL,
                requested_year INTEGER NOT NULL, source TEXT NOT NULL,
                status TEXT NOT NULL, error_message TEXT, retrieved_at TEXT,
                PRIMARY KEY (major_code, school_id, requested_year, source))
        """)
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> "Database":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()

    def save_school(self, major_code: str, school: dict[str, Any], updated_at: str) -> None:
        self.conn.execute(
            """
            INSERT OR REPLACE INTO schools
            (school_id, major_code, name, province, level,
             self_scoring, doctoral_program, double_first_class,
             school_code, province_code, is_985, is_211, display_order,
             updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                school["school_id"],
                major_code,
                school["name"],
                school.get("province"),
                school.get("level"),
                int(bool(school.get("self_scoring", False))),
                int(bool(school.get("doctoral_program", False))),
                int(bool(school.get("double_first_class", False))),
                school.get("school_code", "") or "",
                school.get("province_code", "") or "",
                int(bool(school.get("is_985", False))),
                int(bool(school.get("is_211", False))),
                int(school.get("display_order", 0) or 0),
                updated_at,
            ),
        )

    def save_department(
        self, major_code: str, school_id: str, dept: dict[str, Any], updated_at: str
    ) -> None:
        self.conn.execute(
            """
            INSERT OR REPLACE INTO departments
            (department_id, school_id, major_code, name, research_direction,
             enrollment_count, enrollment_text, exam_subjects, exam_type,
             study_mode, special_plans, advisor, source, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                dept.get("department_id", ""),
                school_id,
                major_code,
                dept["name"],
                dept.get("research_direction", ""),
                dept.get("enrollment_count"),
                dept.get("enrollment_text", ""),
                json.dumps(dept.get("exam_subjects", []), ensure_ascii=False),
                dept.get("exam_type", ""),
                dept.get("study_mode", ""),
                json.dumps(dept.get("special_plans", []) or [], ensure_ascii=False),
                dept.get("advisor", ""),
                dept.get("source", ""),
                updated_at,
            ),
        )

    def save_score_line(
        self,
        major_code: str,
        school_id: str,
        department_id: str,
        year: int,
        score: dict[str, Any],
        source: str,
        updated_at: str,
    ) -> None:
        self.conn.execute(
            """
            INSERT OR REPLACE INTO score_lines
            (school_id, department_id, major_code, year, total, politics, english,
             special_one, special_two, note, source, updated_at, raw_code,
             raw_department_name, metric_type, match_scope, confidence,
             raw_evidence_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                school_id,
                department_id,
                major_code,
                year,
                score.get("total"),
                score.get("politics"),
                score.get("english"),
                score.get("special_one"),
                score.get("special_two"),
                score.get("note"),
                source,
                updated_at,
                score.get("raw_code", ""),
                score.get("raw_department_name", ""),
                score.get("metric_type", "score_line"),
                score.get("match_scope", ""),
                score.get("confidence"),
                json.dumps(
                    score.get("raw_evidence", score.get("raw_evidence_json", score)),
                    ensure_ascii=False,
                ),
            ),
        )

    def save_score_request_status(
        self, major_code: str, school_id: str, requested_year: int, source: str,
        status: str, error_message: Optional[str] = None, retrieved_at: Optional[str] = None,
    ) -> None:
        from yam.utils import now_str
        existing = self.conn.execute(
            "SELECT status FROM score_request_status WHERE major_code = ? AND school_id = ? AND requested_year = ? AND source = ?",
            (major_code, school_id, requested_year, source),
        ).fetchone()
        if existing and existing["status"] == "success_empty" and status == "api_error":
            return
        self.conn.execute(
            """INSERT OR REPLACE INTO score_request_status
            (major_code, school_id, requested_year, source, status, error_message, retrieved_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (major_code, school_id, requested_year, source, status, error_message, retrieved_at or now_str()),
        )
        self.conn.commit()

    def get_score_request_statuses(self, major_code: str, school_id: str, source: str) -> dict[int, str]:
        rows = self.conn.execute(
            "SELECT requested_year, status FROM score_request_status WHERE major_code = ? AND school_id = ? AND source = ?",
            (major_code, school_id, source),
        ).fetchall()
        return {int(row["requested_year"]): row["status"] for row in rows}

    def get_pending_score_years(
        self, major_code: str, school_id: str, years: list[int], source: str
    ) -> list[int]:
        """返回仍需采集的年份；只有已有数据的年份可以跳过。"""
        statuses = self.get_score_request_statuses(major_code, school_id, source)
        return [year for year in years if statuses.get(year) != "success_with_data"]

    def clear_fetch_state(self, major_code: str) -> None:
        self.conn.execute("DELETE FROM fetch_log WHERE major_code = ?", (major_code,))
        self.conn.execute("DELETE FROM score_request_status WHERE major_code = ?", (major_code,))
        self.conn.commit()

    def save_admission_plan(
        self,
        major_code: str,
        school_id: str,
        plan: dict[str, Any],
        source: str,
        updated_at: str,
    ) -> None:
        """保存招生计划."""
        self.conn.execute(
            """
            INSERT OR REPLACE INTO admission_plans
            (school_id, department_id, major_code, year, plan_id, spe_id,
             department_name, research_direction, exam_subjects, reference_books,
             enrollment_count, note, source, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                school_id,
                plan.get("department_id", ""),
                major_code,
                plan.get("year", 2026),
                str(plan.get("plan_id", "")),
                str(plan.get("spe_id", "")),
                plan.get("department_name", ""),
                plan.get("research_direction", ""),
                json.dumps(plan.get("exam_subjects", []), ensure_ascii=False),
                json.dumps(plan.get("reference_books", []), ensure_ascii=False),
                plan.get("enrollment_count"),
                plan.get("note", ""),
                source,
                updated_at,
            ),
        )
        self.conn.commit()

    def log_fetch(
        self,
        major_code: str,
        school_id: Optional[str],
        task_type: str,
        status: str,
        error_message: Optional[str] = None,
    ) -> None:
        from yam.utils import now_str

        self.conn.execute(
            """
            INSERT OR REPLACE INTO fetch_log
            (major_code, school_id, task_type, status, tried_at, error_message)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (major_code, school_id, task_type, status, now_str(), error_message),
        )
        self.conn.commit()

    def save_snapshot(
        self, major_code: str, major_name: str, school_count: int, source: str
    ) -> int:
        from yam.utils import now_str

        cursor = self.conn.execute(
            """
            INSERT INTO snapshots (major_code, major_name, fetched_at, school_count, source)
            VALUES (?, ?, ?, ?, ?)
            """,
            (major_code, major_name, now_str(), school_count, source),
        )
        self.conn.commit()
        return cursor.lastrowid or 0

    def add_favorite(self, major_code: str, school_id: str) -> None:
        from yam.utils import now_str

        self.conn.execute(
            """
            INSERT OR REPLACE INTO favorites (school_id, major_code, created_at)
            VALUES (?, ?, ?)
            """,
            (school_id, major_code, now_str()),
        )
        self.conn.commit()

    def remove_favorite(self, major_code: str, school_id: str) -> None:
        self.conn.execute(
            "DELETE FROM favorites WHERE school_id = ? AND major_code = ?",
            (school_id, major_code),
        )
        self.conn.commit()

    def list_favorites(self, major_code: str) -> list[str]:
        rows = self.conn.execute(
            "SELECT school_id FROM favorites WHERE major_code = ? ORDER BY created_at DESC",
            (major_code,),
        ).fetchall()
        return [r["school_id"] for r in rows]

    def is_favorite(self, major_code: str, school_id: str) -> bool:
        row = self.conn.execute(
            "SELECT 1 FROM favorites WHERE school_id = ? AND major_code = ?",
            (school_id, major_code),
        ).fetchone()
        return row is not None

    def add_recent_view(self, major_code: str, school_id: str) -> None:
        from yam.utils import now_str

        self.conn.execute(
            """
            INSERT OR REPLACE INTO recent_views (school_id, major_code, viewed_at)
            VALUES (?, ?, ?)
            """,
            (school_id, major_code, now_str()),
        )
        self.conn.commit()

    def list_recent_views(self, major_code: str, limit: int = 10) -> list[str]:
        rows = self.conn.execute(
            """
            SELECT school_id FROM recent_views
            WHERE major_code = ?
            ORDER BY viewed_at DESC
            LIMIT ?
            """,
            (major_code, limit),
        ).fetchall()
        return [r["school_id"] for r in rows]

    def get_stats(self, major_code: str) -> dict[str, Any]:
        stats: dict[str, Any] = {"major_code": major_code}
        row = self.conn.execute(
            "SELECT COUNT(*) AS c FROM schools WHERE major_code = ?", (major_code,)
        ).fetchone()
        stats["school_count"] = row["c"] if row else 0

        row = self.conn.execute(
            "SELECT COUNT(*) AS c FROM departments WHERE major_code = ?", (major_code,)
        ).fetchone()
        stats["department_count"] = row["c"] if row else 0

        for year in [2026, 2025, 2024, 2023]:
            row = self.conn.execute(
                """
                SELECT COUNT(DISTINCT school_id) AS c
                FROM score_lines
                WHERE major_code = ? AND year = ? AND total IS NOT NULL
                """,
                (major_code, year),
            ).fetchone()
            stats[f"score_{year}"] = row["c"] if row else 0

        return stats
