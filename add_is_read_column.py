import sqlite3
import os

db_path = 'backend/database.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute('ALTER TABLE messages ADD COLUMN is_read BOOLEAN DEFAULT FALSE')
        conn.commit()
        print('Column is_read added successfully')
    except Exception as e:
        print(f"Error adding column: {e}")
    finally:
        conn.close()
else:
    print(f"Database {db_path} not found")
