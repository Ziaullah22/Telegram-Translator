import asyncio
import sys
import os
from dotenv import load_dotenv
# Load environment variables FIRST before any other imports
load_dotenv('backend/.env')

# Add backend to path to find database module
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from database import db

async def check_account():
    # Load environment variables for DB connection
    load_dotenv('backend/.env')
    
    await db.connect()
    try:
        rows = await db.fetch("SELECT username, warming_session_count, daily_usage_count, status, created_at FROM instagram_warming_accounts")
        if not rows:
            print("No accounts found in the warming table.")
        for row in rows:
            print(f"--- Account Data ---")
            print(f"Username: @{row['username']}")
            print(f"Sessions Completed: {row['warming_session_count']}")
            print(f"Daily Usage Today: {row['daily_usage_count']}")
            print(f"Status: {row['status']}")
            print(f"Created At: {row['created_at']}")
            print(f"-------------------")
    finally:
        await db.disconnect()

if __name__ == "__main__":
    asyncio.run(check_account())
