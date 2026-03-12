import asyncio
from database import db

async def main():
    await db.connect()
    
    # Check logs for the last 15 minutes
    logs = await db.fetch("SELECT lead_id, action, details, created_at FROM campaign_logs ORDER BY created_at DESC LIMIT 30")
    print("--- Recent Logs ---")
    for lg in logs:
        print(f"[{lg['created_at']}] Lead: {lg['lead_id']}, Action: {lg['action']}, Details: {lg['details']}")

    # Check the leads we saw earlier
    leads = await db.fetch("SELECT id, telegram_identifier, current_step, status FROM campaign_leads WHERE id IN (12819, 12820, 12821, 12822)")
    print("\n--- Lead Status ---")
    for l in leads:
        print(f"ID: {l['id']}, Identifier: {l['telegram_identifier']}, Step: {l['current_step']}, Status: {l['status']}")

if __name__ == "__main__":
    asyncio.run(main())
