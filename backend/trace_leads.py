import asyncio
from database import db

async def main():
    await db.connect()
    
    # Check the specific lead in the screenshot
    leads = await db.fetch("SELECT id, campaign_id, telegram_identifier, current_step, status, failure_reason, last_contact_at FROM campaign_leads WHERE telegram_identifier LIKE '%princ804%' OR telegram_identifier LIKE '%Ziaullah4127%'")
    print("--- Affected Leads ---")
    for l in leads:
        print(f"ID: {l['id']}, Identifier: {l['telegram_identifier']}, Step: {l['current_step']}, Status: {l['status']}, Fail: {l['failure_reason']}")
        print(f"  Last Contact: {l['last_contact_at']}")
        
        # Check logs for this lead
        logs = await db.fetch("SELECT action, details, created_at FROM campaign_logs WHERE lead_id = $1 ORDER BY created_at DESC", l['id'])
        print("  Logs:")
        for lg in logs:
            print(f"    [{lg['created_at']}] {lg['action']}: {lg['details']}")
            
    # Check Global Stats
    stats = await db.fetch("SELECT status, count(*) FROM campaign_leads GROUP BY status")
    print("\n--- Global Lead Stats ---")
    for s in stats:
        print(f"{s['status']}: {s['count']}")

if __name__ == "__main__":
    asyncio.run(main())
