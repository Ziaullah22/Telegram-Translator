import asyncio
import os
import sys

# Add the parent directory of the script to sys.path to allow importing from 'backend'
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import db

async def check_schema():
    await db.connect()
    # Check instagram_leads
    res_leads = await db.fetch("SELECT column_name FROM information_schema.columns WHERE table_name = 'instagram_leads'")
    cols_leads = [r['column_name'] for r in res_leads]
    print(f"instagram_leads columns: {cols_leads}")
    
    # Check instagram_filter_settings
    res_settings = await db.fetch("SELECT column_name FROM information_schema.columns WHERE table_name = 'instagram_filter_settings'")
    cols_settings = [r['column_name'] for r in res_settings]
    print(f"instagram_filter_settings columns: {cols_settings}")
    
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(check_schema())
