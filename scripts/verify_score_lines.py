"""验证修复后 score_lines 同步的正确性."""
import sqlite3
from pathlib import Path

TARGET = Path.home() / ".yam" / "data" / "yam-desktop.db"
SOURCE = Path.home() / ".yam" / "data" / "yam.db"

target = sqlite3.connect(TARGET)
target.row_factory = sqlite3.Row
source = sqlite3.connect(SOURCE)
source.row_factory = sqlite3.Row

print("=" * 70)
print("1. 重复检查：同 department_id + year 多行")
print("=" * 70)
for mc in ["081200", "083500", "085410"]:
    cur = target.execute(
        """
        SELECT COUNT(*) as dup_cnt FROM (
            SELECT department_id, year, COUNT(*) as c
            FROM workspace_department_years
            GROUP BY department_id, year
            HAVING c > 1
        )
        """
    )
    dup = cur.fetchone()['dup_cnt']
    cur2 = target.execute(
        """
        SELECT COUNT(*) FROM workspace_department_years wdy
        JOIN workspace_departments wd ON wdy.department_id = wd.department_id
        WHERE wd.major_code = ?
        """,
        (mc,),
    )
    total = cur2.fetchone()[0]
    print(f"  {mc}: 总 {total} 行, 重复组数 {dup} {'✓' if dup == 0 else '✗'}")

print()
print("=" * 70)
print("2. 081200 三峡大学：每个 department 的年份数据")
print("=" * 70)
cur = target.execute(
    """
    SELECT wd.department_id, wd.name, wd.research_direction,
           GROUP_CONCAT(wdy.year || ':' || wdy.min_score, ' ') as years
    FROM workspace_departments wd
    LEFT JOIN workspace_department_years wdy ON wd.department_id = wdy.department_id
    WHERE wd.major_code = '081200'
      AND wd.school_id = (SELECT school_id FROM workspace_schools WHERE name LIKE '%三峡%' AND major_code='081200' LIMIT 1)
    GROUP BY wd.department_id
    """
)
for r in cur.fetchall():
    print(f"  dept_id={r['department_id']} | {r['name']} / {r['research_direction']}")
    print(f"    years: {r['years']}")

print()
print("=" * 70)
print("3. 081200 北京科技大学：验证多院系聚合效果")
print("=" * 70)
cur = target.execute(
    """
    SELECT wd.department_id, wd.name, wd.research_direction,
           GROUP_CONCAT(wdy.year || ':' || wdy.min_score, ' ') as years,
           MIN(wdy.min_score) as dept_min
    FROM workspace_departments wd
    LEFT JOIN workspace_department_years wdy ON wd.department_id = wdy.department_id
    WHERE wd.major_code = '081200'
      AND wd.school_id = (SELECT school_id FROM workspace_schools WHERE name LIKE '%北京科技%' AND major_code='081200' LIMIT 1)
    GROUP BY wd.department_id
    LIMIT 5
    """
)
for r in cur.fetchall():
    print(f"  dept_id={r['department_id']} | {r['name']} / {r['research_direction']} | dept_min={r['dept_min']}")
    print(f"    years: {r['years']}")

print()
print("  源 score_lines（按年聚合 MIN total）:")
cur = source.execute(
    """
    SELECT year, MIN(total) as min_total, COUNT(*) as cnt
    FROM score_lines
    WHERE school_id = (SELECT school_id FROM schools WHERE name LIKE '%北京科技%' AND major_code='081200' LIMIT 1)
      AND major_code = '081200'
    GROUP BY year
    ORDER BY year DESC
    """
)
for r in cur.fetchall():
    print(f"    {r['year']}: min_total={r['min_total']} (from {r['cnt']} rows)")

print()
print("=" * 70)
print("4. workspace_schools.min_score 统计")
print("=" * 70)
for mc in ["081200", "083500", "085410"]:
    cur = target.execute(
        """
        SELECT COUNT(*) as total,
               SUM(CASE WHEN min_score > 0 THEN 1 ELSE 0 END) as has_score,
               SUM(CASE WHEN min_score = 0 THEN 1 ELSE 0 END) as zero_score,
               MIN(min_score) as min_s, MAX(min_score) as max_s
        FROM workspace_schools WHERE major_code = ?
        """,
        (mc,),
    )
    r = cur.fetchone()
    print(f"  {mc}: {r['total']} 学校 / 有分数 {r['has_score']} / 零分 {r['zero_score']} / 范围 [{r['min_s']} - {r['max_s']}]")

print()
print("=" * 70)
print("5. 081200 零分学校抽样（数据源限制，非 bug）")
print("=" * 70)
cur = target.execute(
    """
    SELECT ws.name, ws.min_score
    FROM workspace_schools ws
    WHERE ws.major_code = '081200' AND ws.min_score = 0
    ORDER BY ws.name
    LIMIT 10
    """
)
for r in cur.fetchall():
    print(f"  {r['name']} (min_score=0)")

target.close()
source.close()
