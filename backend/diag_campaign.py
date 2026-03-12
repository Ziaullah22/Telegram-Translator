import asyncio
from database import db
from datetime import datetime

async def main():
    await db.connect()
    
    # 1. Campaigns
    campaigns = await db.fetch("SELECT id, name, status FROM campaigns")
    print("--- Campaigns ---")
    for c in campaigns:
        print(f"ID: {c['id']}, Name: {c['name']}, Status: {c['status']}")
        
    # 2. Campaign Steps
    steps = await db.fetch("SELECT campaign_id, step_number, wait_time_hours, keywords, response_text, keyword_response_text FROM campaign_steps")
    print("\n--- Campaign Steps ---")
    for s in steps:
        print(f"CampID: {s['campaign_id']}, Step#: {s['step_number']}, Wait: {s['wait_time_hours']}h, Keywords: {s['keywords']}")
        print(f"  Response: {s['response_text'][:50]}...")
        print(f"  AI Reply: {s['keyword_response_text'][:50]}...")

    # 3. Leads
    leads = await db.fetch("SELECT id, campaign_id, telegram_identifier, current_step, status, last_contact_at FROM campaign_leads")
    print("\n--- Leads ---")
    for l in leads:
        print(f"ID: {l['id']}, CampID: {l['campaign_id']}, Target: {l['telegram_identifier']}, Step: {l['current_step']}, Status: {l['status']}, Last: {l['last_contact_at']}")

    # 4. Logs
    logs = await db.fetch("SELECT campaign_id, lead_id, action, details, created_at FROM campaign_logs ORDER BY created_at DESC LIMIT 5")
    print("\n--- Recent Logs ---")
    for lg in logs:
        print(f"[{lg['created_at']}] Camp: {lg['campaign_id']}, Lead: {lg['lead_id']}, Action: {lg['action']}, Details: {lg['details']}")

if __name__ == "__main__":
    asyncio.run(main())
