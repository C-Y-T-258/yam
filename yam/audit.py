"""数据审计模块.

对抓取落库的数据进行多维度质量检查，重点验证：
- 数据覆盖率（院校、院系、历年分数线、招生计划）
- 来源可追溯性（source 字段、抓取日志）
- 数值合理性（单科<=总分、分数范围、招生人数）
- 内部一致性（院系与分数线是否匹配、重复记录）
"""

from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

from yam.storage.db import Database
from yam.verify import CrossSourceVerifier


@dataclass
class AuditIssue:
    """审计发现的问题."""

    level: str
    category: str
    message: str
    details: dict[str, Any]

    def __str__(self) -> str:
        return f"[{self.level}] {self.category}: {self.message}"


class DataAuditor:
    """数据审计器."""

    def __init__(self, db: Database):
        self.db = db

    def audit(self, major_code: str) -> list[AuditIssue]:
        issues: list[AuditIssue] = []
        issues.extend(self._audit_coverage(major_code))
        issues.extend(self._audit_source_traceability(major_code))
        issues.extend(self._audit_score_line_validity(major_code))
        issues.extend(self._audit_enrollment_validity(major_code))
        issues.extend(self._audit_internal_consistency(major_code))
        issues.extend(self._audit_direction_quality(major_code))
        issues.extend(self._audit_duplicates(major_code))
        issues.extend(self._audit_plan_year_gaps(major_code))
        issues.extend(self._audit_fetch_failures(major_code))
        issues.extend(self._audit_cross_source_consistency(major_code))
        return issues

    def _audit_coverage(self, major_code: str) -> Iterator[AuditIssue]:
        """检查数据覆盖率."""
        # 院校覆盖
        row = self.db.conn.execute(
            "SELECT COUNT(*) AS c FROM schools WHERE major_code = ?", (major_code,)
        ).fetchone()
        school_count = row["c"] if row else 0

        # 院系覆盖
        row = self.db.conn.execute(
            "SELECT COUNT(*) AS c FROM departments WHERE major_code = ?", (major_code,)
        ).fetchone()
        dept_count = row["c"] if row else 0

        # 历年分数线覆盖
        years: list[int] = [2026, 2025, 2024, 2023]
        coverage: dict[int, int] = {}
        for year in years:
            row = self.db.conn.execute(
                """
                SELECT COUNT(DISTINCT school_id) AS c
                FROM score_lines
                WHERE major_code = ? AND year = ? AND total IS NOT NULL
                """,
                (major_code, year),
            ).fetchone()
            coverage[year] = row["c"] if row else 0

        # 招生计划覆盖
        row = self.db.conn.execute(
            """
            SELECT COUNT(DISTINCT school_id) AS c FROM admission_plans
            WHERE major_code = ?
            """,
            (major_code,),
        ).fetchone()
        plan_school_count = row["c"] if row else 0

        # 覆盖率报告：INFO 级别，帮助用户掌握现状，不视为错误
        yield AuditIssue(
            level="INFO",
            category="数据覆盖",
            message=(
                f"院校 {school_count} 所，院系 {dept_count} 个；"
                f"分数线覆盖 {coverage[2026]}/{coverage[2025]}/{coverage[2024]}/{coverage[2023]} "
                f"(2026/2025/2024/2023)；招生计划覆盖 {plan_school_count} 所"
            ),
            details={
                "school_count": school_count,
                "department_count": dept_count,
                "score_coverage": coverage,
                "admission_plan_school_count": plan_school_count,
            },
        )

        # 无院系的院校
        row = self.db.conn.execute(
            """
            SELECT COUNT(*) AS c FROM schools s
            WHERE s.major_code = ?
              AND NOT EXISTS (
                  SELECT 1 FROM departments d
                  WHERE d.school_id = s.school_id AND d.major_code = s.major_code
              )
            """,
            (major_code,),
        ).fetchone()
        if row and row["c"] > 0:
            yield AuditIssue(
                level="WARNING",
                category="数据覆盖",
                message=f"{row['c']} 所院校没有院系所信息",
                details={"count": row["c"]},
            )

        # 无分数线的院校（只要抓过分数线就算，不区分年份）
        row = self.db.conn.execute(
            """
            SELECT COUNT(*) AS c FROM schools s
            WHERE s.major_code = ?
              AND NOT EXISTS (
                  SELECT 1 FROM score_lines sl
                  WHERE sl.school_id = s.school_id AND sl.major_code = s.major_code
              )
            """,
            (major_code,),
        ).fetchone()
        if row and row["c"] > 0:
            yield AuditIssue(
                level="WARNING",
                category="数据覆盖",
                message=f"{row['c']} 所院校没有任何年份的分数线",
                details={"count": row["c"]},
            )

    def _audit_source_traceability(self, major_code: str) -> Iterator[AuditIssue]:
        """检查数据来源可追溯性."""
        # 院系来源缺失
        row = self.db.conn.execute(
            """
            SELECT COUNT(*) AS c FROM departments
            WHERE major_code = ? AND (source IS NULL OR source = '')
            """,
            (major_code,),
        ).fetchone()
        if row and row["c"] > 0:
            yield AuditIssue(
                level="ERROR",
                category="来源追溯",
                message=f"{row['c']} 条院系记录缺少 source 字段",
                details={"count": row["c"]},
            )

        # 分数线来源缺失
        row = self.db.conn.execute(
            """
            SELECT COUNT(*) AS c FROM score_lines
            WHERE major_code = ? AND (source IS NULL OR source = '')
            """,
            (major_code,),
        ).fetchone()
        if row and row["c"] > 0:
            yield AuditIssue(
                level="ERROR",
                category="来源追溯",
                message=f"{row['c']} 条分数线记录缺少 source 字段",
                details={"count": row["c"]},
            )

        # 招生计划来源缺失
        row = self.db.conn.execute(
            """
            SELECT COUNT(*) AS c FROM admission_plans
            WHERE major_code = ? AND (source IS NULL OR source = '')
            """,
            (major_code,),
        ).fetchone()
        if row and row["c"] > 0:
            yield AuditIssue(
                level="ERROR",
                category="来源追溯",
                message=f"{row['c']} 条招生计划记录缺少 source 字段",
                details={"count": row["c"]},
            )

    def _audit_score_line_validity(self, major_code: str) -> Iterator[AuditIssue]:
        """检查分数线数值合理性."""
        # 单科高于总分
        row = self.db.conn.execute(
            """
            SELECT COUNT(*) AS c FROM score_lines
            WHERE major_code = ? AND total IS NOT NULL
              AND (
                  (politics IS NOT NULL AND politics > total)
                  OR (english IS NOT NULL AND english > total)
                  OR (special_one IS NOT NULL AND special_one > total)
                  OR (special_two IS NOT NULL AND special_two > total)
              )
            """,
            (major_code,),
        ).fetchone()
        if row and row["c"] > 0:
            yield AuditIssue(
                level="ERROR",
                category="数值合理性",
                message=f"{row['c']} 条分数线存在单科高于总分",
                details={"count": row["c"]},
            )

        # 总分超出合理范围（考研总分 500 分制）
        row = self.db.conn.execute(
            """
            SELECT COUNT(*) AS c FROM score_lines
            WHERE major_code = ? AND total IS NOT NULL
              AND (total < 0 OR total > 500)
            """,
            (major_code,),
        ).fetchone()
        if row and row["c"] > 0:
            yield AuditIssue(
                level="ERROR",
                category="数值合理性",
                message=f"{row['c']} 条分数线总分超出 0-500 范围",
                details={"count": row["c"]},
            )

        # 公共课单科超出合理范围
        row = self.db.conn.execute(
            """
            SELECT COUNT(*) AS c FROM score_lines
            WHERE major_code = ?
              AND (
                  (politics IS NOT NULL AND (politics < 0 OR politics > 150))
                  OR (english IS NOT NULL AND (english < 0 OR english > 150))
              )
            """,
            (major_code,),
        ).fetchone()
        if row and row["c"] > 0:
            yield AuditIssue(
                level="ERROR",
                category="数值合理性",
                message=f"{row['c']} 条分数线公共课单科超出 0-150 范围",
                details={"count": row["c"]},
            )

        # 专业课单科超出合理范围
        row = self.db.conn.execute(
            """
            SELECT COUNT(*) AS c FROM score_lines
            WHERE major_code = ?
              AND (
                  (special_one IS NOT NULL AND (special_one < 0 OR special_one > 150))
                  OR (special_two IS NOT NULL AND (special_two < 0 OR special_two > 150))
              )
            """,
            (major_code,),
        ).fetchone()
        if row and row["c"] > 0:
            yield AuditIssue(
                level="ERROR",
                category="数值合理性",
                message=f"{row['c']} 条分数线专业课单科超出 0-150 范围",
                details={"count": row["c"]},
            )

    def _audit_enrollment_validity(self, major_code: str) -> Iterator[AuditIssue]:
        """检查招生人数合理性."""
        row = self.db.conn.execute(
            """
            SELECT COUNT(*) AS c FROM departments
            WHERE major_code = ? AND (enrollment_count IS NULL OR enrollment_count < 0)
            """,
            (major_code,),
        ).fetchone()
        if row and row["c"] > 0:
            yield AuditIssue(
                level="WARNING",
                category="数值合理性",
                message=f"{row['c']} 条院系招生人数为空或负数",
                details={"count": row["c"]},
            )

        # 招生计划人数异常
        row = self.db.conn.execute(
            """
            SELECT COUNT(*) AS c FROM admission_plans
            WHERE major_code = ? AND enrollment_count IS NOT NULL
              AND (enrollment_count < 0 OR enrollment_count > 1000)
            """,
            (major_code,),
        ).fetchone()
        if row and row["c"] > 0:
            yield AuditIssue(
                level="WARNING",
                category="数值合理性",
                message=f"{row['c']} 条招生计划人数异常（<0 或 >1000）",
                details={"count": row["c"]},
            )

    def _audit_internal_consistency(self, major_code: str) -> Iterator[AuditIssue]:
        """检查数据内部一致性.

        注：研招网院系 ID 与掌上考研院系 ID 不是同一套编码，因此只检查
        分数线/招生计划所属院校是否存在于院校表中，不比较 department_id。
        """
        # 有分数线但无对应院校
        row = self.db.conn.execute(
            """
            SELECT COUNT(DISTINCT sl.school_id) AS c
            FROM score_lines sl
            WHERE sl.major_code = ?
              AND sl.school_id != ''
              AND NOT EXISTS (
                  SELECT 1 FROM schools s
                  WHERE s.school_id = sl.school_id AND s.major_code = sl.major_code
              )
            """,
            (major_code,),
        ).fetchone()
        if row and row["c"] > 0:
            yield AuditIssue(
                level="ERROR",
                category="一致性",
                message=f"{row['c']} 所分数线记录的院校在院校表中不存在",
                details={"count": row["c"]},
            )

        # 有招生计划但无对应院校
        row = self.db.conn.execute(
            """
            SELECT COUNT(DISTINCT ap.school_id) AS c
            FROM admission_plans ap
            WHERE ap.major_code = ?
              AND ap.school_id != ''
              AND NOT EXISTS (
                  SELECT 1 FROM schools s
                  WHERE s.school_id = ap.school_id AND s.major_code = ap.major_code
              )
            """,
            (major_code,),
        ).fetchone()
        if row and row["c"] > 0:
            yield AuditIssue(
                level="ERROR",
                category="一致性",
                message=f"{row['c']} 所招生计划记录的院校在院校表中不存在",
                details={"count": row["c"]},
            )

    def _audit_direction_quality(self, major_code: str) -> Iterator[AuditIssue]:
        """检查无法生成任何研究方向 fallback 的记录."""
        row = self.db.conn.execute(
            """
            SELECT COUNT(*) AS c
            FROM departments
            WHERE major_code = ?
              AND TRIM(COALESCE(research_direction, '')) = ''
              AND TRIM(COALESCE(exam_subjects, '')) IN ('', '[]')
              AND TRIM(COALESCE(special_plans, '')) IN ('', '[]')
            """,
            (major_code,),
        ).fetchone()
        if row and row["c"] > 0:
            yield AuditIssue(
                level="INFO",
                category="空方向",
                message=f"{row['c']} 条院系记录无研究方向、考试科目或专项计划，将显示‘未注明研究方向’",
                details={"count": row["c"]},
            )

    def _audit_duplicates(self, major_code: str) -> Iterator[AuditIssue]:
        """检查重复记录."""
        # 重复分数线：同一学校、院系、年份多条 total 不为空
        rows = self.db.conn.execute(
            """
            SELECT school_id, department_id, year, COUNT(*) AS c
            FROM score_lines
            WHERE major_code = ? AND total IS NOT NULL
            GROUP BY school_id, department_id, year
            HAVING c > 1
            """,
            (major_code,),
        ).fetchall()
        if rows:
            total_dup = sum(row["c"] - 1 for row in rows)
            yield AuditIssue(
                level="WARNING",
                category="重复数据",
                message=f"发现 {len(rows)} 组重复分数线记录，涉及 {total_dup} 条冗余数据",
                details={"group_count": len(rows), "redundant_count": total_dup},
            )

        # 重复招生计划：使用完整业务键，避免把同院系同年下的合法不同方向误判为重复。
        rows = self.db.conn.execute(
            """
            SELECT school_id, department_id, year, plan_id, spe_id,
                   COALESCE(research_direction, '') AS research_direction,
                   COALESCE(exam_subjects, '') AS exam_subjects,
                   COUNT(*) AS c
            FROM admission_plans
            WHERE major_code = ?
            GROUP BY school_id, department_id, year, plan_id, spe_id,
                     research_direction, exam_subjects
            HAVING c > 1
            """,
            (major_code,),
        ).fetchall()
        if rows:
            total_dup = sum(row["c"] - 1 for row in rows)
            yield AuditIssue(
                level="WARNING",
                category="重复数据",
                message=f"发现 {len(rows)} 组重复招生计划记录，涉及 {total_dup} 条冗余数据",
                details={"group_count": len(rows), "redundant_count": total_dup},
            )

    def _audit_plan_year_gaps(self, major_code: str) -> Iterator[AuditIssue]:
        """检查同一计划/方向的年份序列是否存在中间断档."""
        rows = self.db.conn.execute(
            """
            SELECT school_id, department_id, plan_id, spe_id,
                   COALESCE(research_direction, '') AS research_direction,
                   GROUP_CONCAT(DISTINCT year) AS years
            FROM admission_plans
            WHERE major_code = ? AND year > 0
            GROUP BY school_id, department_id, plan_id, spe_id, research_direction
            """,
            (major_code,),
        ).fetchall()
        gap_groups = []
        for row in rows:
            years = sorted({int(year) for year in (row["years"] or "").split(",") if year})
            if len(years) < 2:
                continue
            missing = sorted(set(range(years[0], years[-1] + 1)) - set(years))
            if missing:
                gap_groups.append({
                    "school_id": row["school_id"],
                    "department_id": row["department_id"],
                    "research_direction": row["research_direction"],
                    "years": years,
                    "missing": missing,
                })
        if gap_groups:
            yield AuditIssue(
                level="INFO",
                category="年份缺失",
                message=f"发现 {len(gap_groups)} 个招生计划/方向存在年份断档",
                details={"group_count": len(gap_groups), "samples": gap_groups[:20]},
            )

    def _audit_fetch_failures(self, major_code: str) -> Iterator[AuditIssue]:
        """检查抓取失败记录."""
        rows = self.db.conn.execute(
            """
            SELECT task_type, COUNT(*) AS c
            FROM fetch_log
            WHERE major_code = ? AND status = 'failed'
            GROUP BY task_type
            """,
            (major_code,),
        ).fetchall()
        for row in rows:
            yield AuditIssue(
                level="WARNING",
                category="抓取失败",
                message=f"任务 {row['task_type']} 有 {row['c']} 条失败记录",
                details={"task_type": row["task_type"], "count": row["c"]},
            )

    def _audit_cross_source_consistency(self, major_code: str) -> Iterator[AuditIssue]:
        """检查研招网与掌上考研跨数据源一致性."""
        verifier = CrossSourceVerifier(self.db)
        issues = verifier.verify(major_code)

        counts: dict[str, int] = {}
        for issue in issues:
            counts[issue.category] = counts.get(issue.category, 0) + 1

        if counts:
            parts = [f"{k} {v} 所" for k, v in counts.items()]
            yield AuditIssue(
                level="WARNING",
                category="跨数据源一致性",
                message="两站数据口径不同，建议到院校官网核实：" + "；".join(parts),
                details=counts,
            )
