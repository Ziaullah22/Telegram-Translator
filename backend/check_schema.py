import asyncio
from database import db

async def main():
    await db.connect()
    res = await db.fetch("SELECT * FROM campaign_steps LIMIT 1")
    if res:
        print(f"Columns: {list(res[0].keys())}")
    else:
        print("No steps found")
        
    leads = await db.fetch("SELECT id, current_step, status FROM campaign_leads LIMIT 5")
    print("\nLeads:")
    for l in leads:
        print(dict(l))
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
