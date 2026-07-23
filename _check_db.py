import sqlite3, os
p = os.path.expanduser('~/.yam/data/yam-desktop.db')
print('db path:', p)
print('db exists:', os.path.exists(p), 'size:', os.path.getsize(p) if os.path.exists(p) else 0)
c = sqlite3.connect(p)
cur = c.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
print('tables:', [r[0] for r in cur.fetchall()])
try:
    cur.execute("SELECT major_code, COUNT(*) FROM workspace_schools GROUP BY major_code")
    print('workspace_schools by major:', cur.fetchall())
    cur.execute("SELECT COUNT(*) FROM workspace_departments")
    print('workspace_departments count:', cur.fetchone()[0])
except Exception as e:
    print('query error:', e)
c.close()
