import sqlite3
import os

db_path = 'backend/database.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('PRAGMA table_info(messages)')
    for row in cursor.fetchall():
        print(row)
    conn.close()
else:
    print(f"Database {db_path} not found")
