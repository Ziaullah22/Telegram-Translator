import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

os.environ['DATABASE_URL'] = 'postgresql://postgres:postgres@localhost:5432/telegram_translator'
from database import db

async def check():
    await db.connect()
    print("Connected to DB")
    
    # Check instagram_leads
    res = await db.fetch("SELECT column_name FROM information_schema.columns WHERE table_name = 'instagram_leads'")
    print("Instagram Leads Columns:", [r['column_name'] for r in res])
    
    # Check queries? (Hint mentioned query_id)
    res = await db.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    print("All Tables:", [r['table_name'] for r in res])
    
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(check())
