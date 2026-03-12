import asyncio
import asyncpg
from datetime import datetime, timezone, timedelta

async def check():
    conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5432/telegram_translator')
    campaign_id = 21
    window_start = datetime.now(timezone.utc) - timedelta(hours=24)

    with open('hiber_diag.txt', 'w') as f:
        f.write("=== PENDING LEADS IN CAMPAIGN 21 ===\n")
        pending = await conn.fetch("""
            SELECT id, telegram_identifier, assigned_account_id, status, current_step 
            FROM campaign_leads WHERE campaign_id = $1 AND status = 'pending' AND current_step = 0
        """, campaign_id)
        for p in pending:
            f.write(str(dict(p)) + '\n')

        f.write(f"\n=== ACCOUNT COLD OUTREACH (window_start={window_start}) ===\n")
        for acc_id in [31, 37]:
            last = await conn.fetchval(
                "SELECT MAX(created_at) FROM campaign_logs WHERE account_id = $1 AND action = 'initial_outreach'",
                acc_id
            )
            blocked = last is not None and last >= window_start  # type: ignore[operator]
            f.write(f"Account {acc_id}: last_cold={last}, blocked={blocked}\n")

        f.write("\n=== ALL CAMPAIGN_LOGS FOR ACCOUNTS 31, 37 ===\n")
        logs = await conn.fetch(
            "SELECT id, account_id, action, created_at, campaign_id FROM campaign_logs WHERE account_id IN (31, 37) ORDER BY id DESC LIMIT 10"
        )
        for l in logs:
            f.write(str(dict(l)) + '\n')

    await conn.close()
    print("Done - check hiber_diag.txt")

asyncio.run(check())
