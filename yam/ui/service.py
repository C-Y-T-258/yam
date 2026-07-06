"""YAM UI 数据服务."""

import json
from typing import Any

from yam.config import config
from yam.storage.db import Database
from yam.ui import csv_export
from yam.verify import CrossSourceVerifier


def list_all_majors_status() -> list[dict[str, Any]]:
    """返回所有专业的数据采集状态."""
    db = Database()
    majors = config.list_majors(enabled_only=False)
    result = []
    for major in majors:
        code = major["code"]
        row = db.conn.execute(
            "SELECT COUNT(*) AS c, MAX(updated_at) AS last_update FROM schools WHERE major_code = ?",
            (code,),
        ).fetchone()
        school_count = row["c"] if row else 0
        last_update = row["last_update"] if row else None

        score_count = db.conn.execute(
            "SELECT COUNT(*) AS c FROM score_lines WHERE major_code = ?",
            (code,),
        ).fetchone()["c"]

        plan_count = db.conn.execute(
            "SELECT COUNT(*) AS c FROM admission_plans WHERE major_code = ?",
            (code,),
        ).fetchone()["c"]

        result.append({
            "code": code,
            "name": major["name"],
            "category_name": major.get("category_name", ""),
            "enabled": major.get("enabled", False),
            "school_count": school_count,
            "score_count": score_count,
            "plan_count": plan_count,
            "last_update": last_update or "-",
            "status": "fetched" if school_count > 0 else "empty",
        })
    db.close()
    return result


class SchoolDataService:
    """UI 数据服务，封装数据库查询与跨源校验."""

    def __init__(self, major_code: str):
        self.major_code = major_code
        self.db = Database()
        self.verifier = CrossSourceVerifier(self.db)
        self._issues: dict[str, list[str]] | None = None
        self._issue_details: dict[str, list[Any]] | None = None

    def close(self) -> None:
        self.db.close()

    def _load_issues(self) -> None:
        """加载并缓存所有异常."""
        if self._issues is not None:
            return
        self._issues = {}
        self._issue_details = {}
        for issue in self.verifier.verify(self.major_code):
            self._issues.setdefault(issue.school_id, []).append(issue.message)
            self._issue_details.setdefault(issue.school_id, []).append(issue)

    def list_schools(self, keyword: str = "") -> list[dict[str, Any]]:
        """获取院校列表，支持按名称筛选."""
        return self.search_schools(keyword=keyword)

    def search_schools(
        self,
        keyword: str = "",
        provinces: list[str] | None = None,
        levels: list[str] | None = None,
        min_plan: int | None = None,
        max_plan: int | None = None,
        has_anomaly: bool | None = None,
        sort: str = "name",
        limit: int = 0,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """复合搜索院校."""
        self._load_issues()

        conditions = ["s.major_code = ?"]
        params: list[Any] = [self.major_code]

        if keyword:
            conditions.append("s.name LIKE ?")
            params.append(f"%{keyword}%")
        if provinces:
            placeholders = ",".join("?" * len(provinces))
            conditions.append(f"s.province IN ({placeholders})")
            params.extend(provinces)
        if levels:
            placeholders = ",".join("?" * len(levels))
            conditions.append(f"s.level IN ({placeholders})")
            params.extend(levels)

        where_clause = " AND ".join(conditions)

        sql = f"""
        SELECT s.school_id, s.name, s.province, s.level, s.updated_at,
               COALESCE(yz.total, 0) AS yanzhao_total,
               COALESCE(zs.total, 0) AS zskyy_total
        FROM schools s
        LEFT JOIN (
            SELECT school_id, SUM(enrollment_count) AS total
            FROM departments
            WHERE major_code = ?
            GROUP BY school_id
        ) yz ON yz.school_id = s.school_id
        LEFT JOIN (
            SELECT school_id, SUM(enrollment_count) AS total
            FROM admission_plans
            WHERE major_code = ? AND year = 2026
            GROUP BY school_id
        ) zs ON zs.school_id = s.school_id
        WHERE {where_clause}
        """
        params = [self.major_code, self.major_code] + params

        # 排序
        order_map = {
            "name": "s.name",
            "yanzhao_total": "yanzhao_total DESC",
            "zskyy_total": "zskyy_total DESC",
            "province": "s.province, s.name",
        }
        order_by = order_map.get(sort, "s.name")
        sql += f" ORDER BY {order_by}"

        rows = self.db.conn.execute(sql, params).fetchall()

        results = []
        for r in rows:
            sid = r["school_id"]
            issues = self._issues.get(sid, [])
            school = {
                "school_id": sid,
                "name": r["name"],
                "province": r["province"] or "-",
                "level": r["level"] or "-",
                "yanzhao_total": r["yanzhao_total"],
                "zskyy_total": r["zskyy_total"],
                "has_issue": bool(issues),
                "issues": issues,
            }

            # 招生人数范围筛选
            total = max(r["yanzhao_total"], r["zskyy_total"])
            if min_plan is not None and total < min_plan:
                continue
            if max_plan is not None and total > max_plan:
                continue

            # 异常筛选
            if has_anomaly is True and not issues:
                continue
            if has_anomaly is False and issues:
                continue

            results.append(school)

        if limit > 0:
            results = results[offset : offset + limit]
        return results

    def get_filter_options(self) -> dict[str, list[str]]:
        """返回筛选选项枚举."""
        provinces = [
            r["province"]
            for r in self.db.conn.execute(
                "SELECT DISTINCT province FROM schools WHERE major_code = ? AND province IS NOT NULL ORDER BY province",
                (self.major_code,),
            ).fetchall()
        ]
        levels = [
            r["level"]
            for r in self.db.conn.execute(
                "SELECT DISTINCT level FROM schools WHERE major_code = ? AND level IS NOT NULL ORDER BY level",
                (self.major_code,),
            ).fetchall()
        ]
        return {"provinces": provinces, "levels": levels}

    def get_school(self, school_id: str) -> dict[str, Any] | None:
        """获取院校基本信息."""
        row = self.db.conn.execute(
            "SELECT * FROM schools WHERE school_id = ? AND major_code = ?",
            (school_id, self.major_code),
        ).fetchone()
        if not row:
            return None
        return dict(row)

    def get_school_summary(self, school_id: str) -> dict[str, Any]:
        """获取院校摘要（用于详情页顶部）."""
        school = self.get_school(school_id)
        if not school:
            return {}

        self._load_issues()

        yz_row = self.db.conn.execute(
            "SELECT SUM(enrollment_count) AS total FROM departments WHERE school_id = ? AND major_code = ?",
            (school_id, self.major_code),
        ).fetchone()
        zs_row = self.db.conn.execute(
            "SELECT SUM(enrollment_count) AS total FROM admission_plans WHERE school_id = ? AND major_code = ? AND year = 2026",
            (school_id, self.major_code),
        ).fetchone()

        score_years = [
            r["year"]
            for r in self.db.conn.execute(
                "SELECT DISTINCT year FROM score_lines WHERE school_id = ? AND major_code = ? ORDER BY year DESC",
                (school_id, self.major_code),
            ).fetchall()
        ]

        return {
            **school,
            "yanzhao_2026": yz_row["total"] or 0,
            "zhangshangkaoyan_2026": zs_row["total"] or 0,
            "score_years": score_years,
            "issues": self._issues.get(school_id, []),
            "is_favorite": self.is_favorite(school_id),
        }

    def get_departments(self, school_id: str) -> list[dict[str, Any]]:
        """获取研招网院系数据."""
        rows = self.db.conn.execute(
            """
            SELECT name, research_direction, enrollment_count, enrollment_text,
                   exam_subjects, exam_type, advisor
            FROM departments
            WHERE school_id = ? AND major_code = ?
            ORDER BY enrollment_count DESC, name
            """,
            (school_id, self.major_code),
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["exam_subjects"] = self._parse_json_list(d.get("exam_subjects"))
            result.append(d)
        return result

    def get_admission_plans(self, school_id: str) -> list[dict[str, Any]]:
        """获取掌上考研招生计划."""
        rows = self.db.conn.execute(
            """
            SELECT year, department_name, enrollment_count, note, research_direction, exam_subjects
            FROM admission_plans
            WHERE school_id = ? AND major_code = ?
            ORDER BY year DESC, department_name
            """,
            (school_id, self.major_code),
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["exam_subjects"] = self._parse_json_list(d.get("exam_subjects"))
            result.append(d)
        return result

    def get_score_lines(self, school_id: str) -> list[dict[str, Any]]:
        """获取掌上考研分数线."""
        rows = self.db.conn.execute(
            """
            SELECT year, department_id, total, politics, english,
                   special_one, special_two, note
            FROM score_lines
            WHERE school_id = ? AND major_code = ?
            ORDER BY year DESC, department_id
            """,
            (school_id, self.major_code),
        ).fetchall()
        return [dict(r) for r in rows]

    def get_anomalies(self, school_id: str | None = None) -> list[dict[str, Any]]:
        """获取异常数据."""
        self._load_issues()
        if school_id:
            return [
                {"school_id": school_id, "message": m}
                for m in self._issues.get(school_id, [])
            ]
        return [
            {"school_id": sid, "message": m}
            for sid, messages in self._issues.items()
            for m in messages
        ]

    def add_favorite(self, school_id: str) -> None:
        self.db.add_favorite(self.major_code, school_id)

    def remove_favorite(self, school_id: str) -> None:
        self.db.remove_favorite(self.major_code, school_id)

    def list_favorites(self) -> list[dict[str, Any]]:
        ids = self.db.list_favorites(self.major_code)
        return [s for s in self.search_schools() if s["school_id"] in ids]

    def is_favorite(self, school_id: str) -> bool:
        return self.db.is_favorite(self.major_code, school_id)

    def add_recent_view(self, school_id: str) -> None:
        self.db.add_recent_view(self.major_code, school_id)

    def list_recent_views(self, limit: int = 10) -> list[dict[str, Any]]:
        ids = self.db.list_recent_views(self.major_code, limit)
        schools = {s["school_id"]: s for s in self.search_schools()}
        return [schools[sid] for sid in ids if sid in schools]

    def get_dashboard_stats(self) -> dict[str, Any]:
        """获取首页 KPI 数据."""
        self._load_issues()

        total = self.db.conn.execute(
            "SELECT COUNT(*) AS c FROM schools WHERE major_code = ?",
            (self.major_code,),
        ).fetchone()["c"]

        normal = 0
        for sid in self._get_all_school_ids():
            if not self._issues.get(sid):
                normal += 1

        favorite_count = len(self.db.list_favorites(self.major_code))

        # 最近更新时间
        row = self.db.conn.execute(
            "SELECT MAX(updated_at) AS last_update FROM schools WHERE major_code = ?",
            (self.major_code,),
        ).fetchone()

        return {
            "total_schools": total,
            "normal_schools": normal,
            "anomaly_schools": total - normal,
            "favorite_count": favorite_count,
            "last_update": row["last_update"] or "-",
        }

    def export_csv(self, school_ids: list[str] | None = None, format: str = "detail") -> str:
        """导出 CSV 文本."""
        if format == "compare":
            schools = []
            for sid in school_ids or []:
                summary = self.get_school_summary(sid)
                if summary:
                    schools.append(summary)
            return csv_export.export_compare(schools)

        if school_ids and len(school_ids) == 1:
            school = self.get_school(school_ids[0])
            departments = self.get_departments(school_ids[0]) if school else []
            return csv_export.export_school_detail(school or {}, departments)

        schools = self.search_schools()
        if school_ids:
            schools = [s for s in schools if s["school_id"] in school_ids]
        return csv_export.export_schools(schools)

    def _get_all_school_ids(self) -> list[str]:
        rows = self.db.conn.execute(
            "SELECT school_id FROM schools WHERE major_code = ?",
            (self.major_code,),
        ).fetchall()
        return [r["school_id"] for r in rows]

    @staticmethod
    def _parse_json_list(value: Any) -> list[str]:
        """解析 JSON 列表或字符串."""
        if not value:
            return []
        if isinstance(value, list):
            return [str(v) for v in value]
        try:
            data = json.loads(value)
            if isinstance(data, list):
                return [str(v) for v in data]
        except (json.JSONDecodeError, TypeError):
            pass
        return [str(value)]
