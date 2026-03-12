import asyncio, sys
sys.path.insert(0, '.')
from database import db

async def check():
    await db.connect()
    rows = await db.fetch('SELECT id, campaign_id, step_number, keywords, next_step, response_text FROM campaign_steps ORDER BY id DESC LIMIT 15')
    print("=== CAMPAIGN STEPS ===")
    for r in rows:
        d = dict(r)
        print("Step:", d['step_number'], "| next_step:", d['next_step'], "| keywords:", d['keywords'], "| msg:", str(d['response_text'])[:50])
    print("\n=== LEADS ===")
    leads = await db.fetch('SELECT id, campaign_id, current_step, status, telegram_identifier FROM campaign_leads ORDER BY id DESC LIMIT 5')
    for l in leads:
        print(dict(l))
    await db.disconnect()

asyncio.run(check())
