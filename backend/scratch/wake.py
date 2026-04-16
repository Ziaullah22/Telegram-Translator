import asyncio
from database import db
async def mf():
 await db.connect()
 await db.execute('UPDATE instagram_warming_accounts SET next_wakeup_time = NULL, frozen_until = NULL, status = ''active''')
 await db.disconnect()
asyncio.run(mf())
