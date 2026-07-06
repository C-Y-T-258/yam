"""CSV 导出工具."""

import csv
import io
from typing import Any


def _write_csv(rows: list[dict[str, Any]], fieldnames: list[str]) -> str:
    """将字典列表写入 CSV 字符串."""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow({k: row.get(k, "") for k in fieldnames})
    return output.getvalue()


def export_schools(schools: list[dict[str, Any]]) -> str:
    """导出院校列表 CSV."""
    fieldnames = ["school_id", "name", "province", "level", "has_issue"]
    return _write_csv(schools, fieldnames)


def export_school_detail(school: dict[str, Any], departments: list[dict[str, Any]]) -> str:
    """导出单个院校详情 CSV."""
    rows = []
    base = {
        "school_id": school.get("school_id", ""),
        "name": school.get("name", ""),
        "province": school.get("province", ""),
        "level": school.get("level", ""),
    }
    for dept in departments:
        row = {
            **base,
            "department_name": dept.get("name", ""),
            "research_direction": dept.get("research_direction", ""),
            "enrollment_count": dept.get("enrollment_count", ""),
            "enrollment_text": dept.get("enrollment_text", ""),
            "exam_type": dept.get("exam_type", ""),
            "advisor": dept.get("advisor", ""),
        }
        rows.append(row)
    fieldnames = [
        "school_id",
        "name",
        "province",
        "level",
        "department_name",
        "research_direction",
        "enrollment_count",
        "enrollment_text",
        "exam_type",
        "advisor",
    ]
    return _write_csv(rows, fieldnames)


def export_compare(schools: list[dict[str, Any]]) -> str:
    """导出对比结果 CSV."""
    fieldnames = [
        "name",
        "province",
        "level",
        "yanzhao_2026",
        "zhangshangkaoyan_2026",
        "score_years",
        "issues",
    ]
    rows = []
    for school in schools:
        rows.append(
            {
                "name": school.get("name", ""),
                "province": school.get("province", ""),
                "level": school.get("level", ""),
                "yanzhao_2026": school.get("yanzhao_2026", ""),
                "zhangshangkaoyan_2026": school.get("zhangshangkaoyan_2026", ""),
                "score_years": ",".join(str(y) for y in school.get("score_years", [])),
                "issues": "; ".join(school.get("issues", [])),
            }
        )
    return _write_csv(rows, fieldnames)
