"""检查 score_lines 重复行的根因."""
import sqlite3
from pathlib import Path

TARGET = Path.home() / ".yam" / "data" / "yam-desktop.db"
SOURCE = Path.home() / ".yam" / "data" / "yam.db"

target = sqlite3.connect(TARGET)
target.row_factory = sqlite3.Row
source = sqlite3.connect(SOURCE)
source.row_factory = sqlite3.Row

print("=" * 70)
print("1. dept_id=156683 是哪个学校哪个院系")
print("=" * 70)
cur = target.execute(
    """
    SELECT wd.department_id, wd.school_id, wd.major_code, wd.name, wd.research_direction,
           ws.name as school_name
    FROM workspace_departments wd
    JOIN workspace_schools ws ON wd.school_id = ws.school_id AND wd.major_code = ws.major_code
    WHERE wd.department_id = 156683
    """
)
r = cur.fetchone()
if r:
    print(f"  school: {r['school_name']} (school_id={r['school_id']})")
    print(f"  dept: {r['name']} / {r['research_direction']}")

print()
print("=" * 70)
print("2. 该校 081200 在源 score_lines 表里的所有行")
print("=" * 70)
cur = target.execute("SELECT school_id FROM workspace_departments WHERE department_id = 156683")
sid = cur.fetchone()['school_id']
cur = source.execute(
    """
    SELECT year, total, politics, english, special_one, special_two, department_id, source, note
    FROM score_lines
    WHERE school_id = ? AND major_code = '081200'
    ORDER BY year DESC, total
    """,
    (sid,),
)
rows = cur.fetchall()
print(f"  school_id={sid}, 共 {len(rows)} 行:")
for r in rows:
    print(f"    {r['year']} | total={r['total']} | pol={r['politics']} eng={r['english']} s1={r['special_one']} s2={r['special_two']} | dept_id={r['department_id']!r} | source={r['source']!r} | note={r['note']!r}")

print()
print("=" * 70)
print("3. 源 score_lines 同校同年多行的学校数量（081200）")
print("=" * 70)
cur = source.execute(
    """
    SELECT school_id, year, COUNT(*) as cnt,
           GROUP_CONCAT(total, ',') as totals,
           GROUP_CONCAT(department_id, ',') as dept_ids
    FROM score_lines
    WHERE major_code = '081200'
    GROUP BY school_id, year
    HAVING cnt > 1
    ORDER BY cnt DESC
    LIMIT 10
    """
)
multi = cur.fetchall()
if multi:
    print(f"  发现 {len(multi)} 组同校同年多行（显示前 10）：")
    for r in multi:
        print(f"    school_id={r['school_id']} year={r['year']} x{r['cnt']} | totals=[{r['totals']}] | dept_ids=[{r['dept_ids']}]")
else:
    print("  无同校同年多行")

print()
print("=" * 70)
print("4. 统计：081200 score_lines 同校同年去重后还剩多少行")
print("=" * 70)
cur = source.execute(
    """
    SELECT COUNT(*) FROM (
        SELECT DISTINCT school_id, year, total, politics, english, special_one, special_two
        FROM score_lines
        WHERE major_code = '081200'
    )
    """
)
print(f"  DISTINCT school_id+year+scores 后: {cur.fetchone()[0]} 行")

cur = source.execute(
    """
    SELECT COUNT(*) FROM (
        SELECT DISTINCT school_id, year
        FROM score_lines
        WHERE major_code = '081200'
    )
    """
)
print(f"  DISTINCT school_id+year 后: {cur.fetchone()[0]} 行（每年每校只保留 1 行）")

target.close()
source.close()
