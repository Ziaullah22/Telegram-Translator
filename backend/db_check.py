import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from database import db

async def fix():
    await db.connect()
    
    # 1. Show all Peer:0 records for account 62
    rows = await db.fetch("""
        SELECT id, telegram_peer_id, title, invite_hash, is_hidden
        FROM conversations 
        WHERE telegram_account_id = 62 AND telegram_peer_id = 0
        ORDER BY id
    """)
    print(f'--- GHOST RECORDS (Peer=0) for Account 62: {len(rows)} records ---')
    ids_to_delete = []
    for r in rows:
        title_safe = (r['title'] or 'None').encode('ascii', 'replace').decode('ascii')
        print(f"  ID:{r['id']} | Hidden:{r['is_hidden']} | Title:{title_safe} | Hash:{r['invite_hash']}")
        ids_to_delete.append(r['id'])
    
    if ids_to_delete:
        # Delete messages first
        for cid in ids_to_delete:
            await db.execute("DELETE FROM messages WHERE conversation_id = $1", cid)
        # Delete conversations
        await db.execute("DELETE FROM conversations WHERE id = ANY($1::int[])", ids_to_delete)
        print(f'\nDeleted {len(ids_to_delete)} ghost conversations and their messages.')
    
    # Show remaining
    remaining = await db.fetch("""
        SELECT id, telegram_peer_id, title, invite_hash, is_hidden
        FROM conversations WHERE telegram_account_id = 62
        ORDER BY id DESC LIMIT 10
    """)
    print('\n--- REMAINING CONVERSATIONS ---')
    for r in remaining:
        title_safe = (r['title'] or 'None').encode('ascii', 'replace').decode('ascii')
        msgs = await db.fetchval("SELECT COUNT(*) FROM messages WHERE conversation_id = $1", r['id'])
        print(f"  ID:{r['id']} | Peer:{r['telegram_peer_id']} | Msgs:{msgs} | Title:{title_safe} | Hash:{r['invite_hash']}")
    
    await db.disconnect()
    print('\nDone!')

asyncio.run(fix())
