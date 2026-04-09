
import asyncio
import sys
import os

# Add the backend directory to python path
backend_path = os.path.join(os.getcwd(), 'backend')
sys.path.append(backend_path)

# Change CWD to backend so .env is found by Settings
os.chdir(backend_path)

async def repair():
    from database import db
    from app.core.config import settings
    
    print("Connecting to database...")
    await db.connect()
    
    try:
        print("Injecting missing columns into 'instagram_accounts'...")
        await db.execute("""
            ALTER TABLE instagram_accounts 
            ADD COLUMN IF NOT EXISTS verification_code TEXT,
            ADD COLUMN IF NOT EXISTS session_id TEXT;
        """)
        print("Database repair SUCCESSFUL!")
    except Exception as e:
        print(f"Repair FAILED: {e}")
    finally:
        await db.disconnect()

if __name__ == "__main__":
    asyncio.run(repair())
