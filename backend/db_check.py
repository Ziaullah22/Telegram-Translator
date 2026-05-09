import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from database import db

async def fix():
    await db.connect()

    # Show full details of conversation 389
    row = await db.fetchrow("SELECT * FROM conversations WHERE id = 389")
    print('--- CONVERSATION 389 ---')
    for k, v in row.items():
        val_safe = str(v).encode('ascii', 'replace').decode('ascii') if v else 'None'
        print(f"  {k}: {val_safe}")

    # Show last 5 messages in conv 389 with sender info
    print('\n--- LAST 5 MESSAGES IN CONV 389 ---')
    msgs = await db.fetch("""
        SELECT id, telegram_message_id, sender_name, sender_username, original_text
        FROM messages WHERE conversation_id = 389
        ORDER BY id DESC LIMIT 5
    """)
    for m in msgs:
        sender = (m['sender_name'] or '').encode('ascii', 'replace').decode('ascii')
        text = (m['original_text'] or '')[:50].encode('ascii', 'replace').decode('ascii')
        print(f"  MsgID:{m['id']} | TgMsgID:{m['telegram_message_id']} | From:{sender} | {text}")

    # Also check if there are messages from カンゲリー in conv 389
    print('\n--- ALL PEER 0 CONVERSATIONS ---')
    zero_rows = await db.fetch("""
        SELECT id, title, invite_hash, telegram_account_id
        FROM conversations WHERE telegram_peer_id = 0
    """)
    for r in zero_rows:
        title_safe = (r['title'] or '').encode('ascii', 'replace').decode('ascii')
        msgs_count = await db.fetchval("SELECT COUNT(*) FROM messages WHERE conversation_id = $1", r['id'])
        print(f"  ID:{r['id']} | Acct:{r['telegram_account_id']} | Msgs:{msgs_count} | Hash:{r['invite_hash']} | Title:{title_safe}")

    await db.disconnect()

asyncio.run(fix())
