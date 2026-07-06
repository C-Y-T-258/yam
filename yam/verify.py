"""跨数据源一致性校验.

对比研招网、掌上考研两个来源的招生计划、分数线、人数，
把不一致或缺失的地方直接标出来，提醒用户自行到官网核实。
"""

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from yam.storage.db import Database


@dataclass
class CrossCheckIssue:
    """交叉校验发现的问题."""

    level: str
    category: str
    school_id: str
    school_name: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)


class CrossSourceVerifier:
    """跨数据源校验器."""

    def __init__(self, db: Database):
        self.db = db

    def verify(
        self,
        major_code: str,
        enrollment_diff_abs: int = 5,
        enrollment_diff_pct: float = 20.0,
    ) -> list[CrossCheckIssue]:
        """执行交叉校验.

        Args:
            major_code: 专业代码
            enrollment_diff_abs: 招生人数绝对差异阈值
            enrollment_diff_pct: 招生人数相对差异阈值（百分比）
        """
        issues: list[CrossCheckIssue] = []
        issues.extend(self._check_enrollment_consistency(major_code, enrollment_diff_abs, enrollment_diff_pct))
        issues.extend(self._check_year_coverage(major_code))
        issues.extend(self._check_missing_sources(major_code))
        return issues

    def _school_name(self, school_id: str, major_code: str) -> str:
        row = self.db.conn.execute(
            "SELECT name FROM schools WHERE school_id = ? AND major_code = ?",
            (school_id, major_code),
        ).fetchone()
        return row["name"] if row else school_id

    def _check_enrollment_consistency(
        self, major_code: str, diff_abs: int, diff_pct: float
    ) -> list[CrossCheckIssue]:
        """对比研招网与掌上考研 2026 招生人数."""
        issues: list[CrossCheckIssue] = []

        rows = self.db.conn.execute(
            """
            SELECT school_id, SUM(enrollment_count) AS total
            FROM departments
            WHERE major_code = ? AND enrollment_count IS NOT NULL
            GROUP BY school_id
            """,
            (major_code,),
        ).fetchall()
        yanzhao = {r["school_id"]: r["total"] or 0 for r in rows}

        rows = self.db.conn.execute(
            """
            SELECT school_id, year, SUM(enrollment_count) AS total
            FROM admission_plans
            WHERE major_code = ? AND enrollment_count IS NOT NULL
            GROUP BY school_id, year
            """,
            (major_code,),
        ).fetchall()
        zskyy: dict[str, dict[int, int]] = defaultdict(dict)
        for r in rows:
            zskyy[r["school_id"]][r["year"]] = r["total"] or 0

        for sid in sorted(set(yanzhao) | set(zskyy)):
            yz = yanzhao.get(sid, 0)
            zs = zskyy[sid].get(2026, 0)
            diff = yz - zs
            if yz > 0:
                pct = diff / yz * 100
            elif zs > 0:
                pct = -100.0
            else:
                pct = 0.0

            if abs(diff) >= diff_abs or abs(pct) >= diff_pct:
                issues.append(
                    CrossCheckIssue(
                        level="WARNING",
                        category="招生人数不一致",
                        school_id=sid,
                        school_name=self._school_name(sid, major_code),
                        message=(
                            f"2026 招生人数：研招网 {yz} 人，掌上考研 {zs} 人，"
                            f"差异 {diff:+d} 人（{pct:+.1f}%）"
                        ),
                        details={
                            "yanzhao_2026": yz,
                            "zhangshangkaoyan_2026": zs,
                            "diff": diff,
                            "diff_pct": pct,
                        },
                    )
                )
        return issues

    def _check_year_coverage(self, major_code: str) -> list[CrossCheckIssue]:
        """检查招生计划与分数线年份覆盖是否一致."""
        issues: list[CrossCheckIssue] = []

        rows = self.db.conn.execute(
            """
            SELECT school_id, year, SUM(enrollment_count) AS total
            FROM admission_plans
            WHERE major_code = ?
            GROUP BY school_id, year
            """,
            (major_code,),
        ).fetchall()
        plan_years: dict[str, set[int]] = defaultdict(set)
        for r in rows:
            if r["total"] is not None and r["total"] > 0:
                plan_years[r["school_id"]].add(r["year"])

        rows = self.db.conn.execute(
            """
            SELECT school_id, year, COUNT(*) AS c
            FROM score_lines
            WHERE major_code = ? AND total IS NOT NULL
            GROUP BY school_id, year
            """,
            (major_code,),
        ).fetchall()
        score_years: dict[str, set[int]] = defaultdict(set)
        for r in rows:
            if r["c"] > 0:
                score_years[r["school_id"]].add(r["year"])

        for sid in sorted(set(plan_years) | set(score_years)):
            py = plan_years.get(sid, set())
            sy = score_years.get(sid, set())
            if py != sy:
                missing_in_score = sorted(py - sy)
                missing_in_plan = sorted(sy - py)
                parts = []
                if missing_in_score:
                    parts.append(f"有招生计划但无分数线：{missing_in_score}")
                if missing_in_plan:
                    parts.append(f"有分数线但无招生计划：{missing_in_plan}")
                issues.append(
                    CrossCheckIssue(
                        level="INFO",
                        category="年份覆盖不一致",
                        school_id=sid,
                        school_name=self._school_name(sid, major_code),
                        message="；".join(parts),
                        details={
                            "plan_years": sorted(py),
                            "score_years": sorted(sy),
                        },
                    )
                )
        return issues

    def _check_missing_sources(self, major_code: str) -> list[CrossCheckIssue]:
        """检查学校是否缺少某一来源的数据."""
        issues: list[CrossCheckIssue] = []

        rows = self.db.conn.execute(
            """
            SELECT s.school_id, s.name,
                   EXISTS(SELECT 1 FROM departments d WHERE d.school_id = s.school_id AND d.major_code = s.major_code) AS has_yanzhao,
                   EXISTS(SELECT 1 FROM admission_plans ap WHERE ap.school_id = s.school_id AND ap.major_code = s.major_code) AS has_zskyy_plan,
                   EXISTS(SELECT 1 FROM score_lines sl WHERE sl.school_id = s.school_id AND sl.major_code = s.major_code) AS has_score
            FROM schools s
            WHERE s.major_code = ?
            """,
            (major_code,),
        ).fetchall()

        for r in rows:
            sid = r["school_id"]
            name = r["name"]
            missing = []
            if not r["has_yanzhao"]:
                missing.append("研招网院系/招生人数")
            if not r["has_zskyy_plan"]:
                missing.append("掌上考研招生计划")
            if not r["has_score"]:
                missing.append("掌上考研分数线")

            if missing:
                issues.append(
                    CrossCheckIssue(
                        level="WARNING",
                        category="数据来源缺失",
                        school_id=sid,
                        school_name=name,
                        message=f"缺少：{', '.join(missing)}",
                        details={"missing": missing},
                    )
                )
        return issues
