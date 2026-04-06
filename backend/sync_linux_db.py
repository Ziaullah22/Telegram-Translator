import asyncio
from database import db

async def run():
  print('Starting Database Sync...')
  await db.connect()
  await db.execute('''
      CREATE TABLE IF NOT EXISTS instagram_filter_settings (
          user_id INTEGER PRIMARY KEY,
          bio_keywords TEXT DEFAULT '',
          min_followers INTEGER DEFAULT 0,
          max_followers INTEGER DEFAULT 0,
          sample_hashes TEXT DEFAULT '[]',
          updated_at TIMESTAMP DEFAULT NOW()
      );
  ''')
  print('instagram_filter_settings verified.')
  try:
      await db.execute('ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP;')
      print('last_used_at timestamp verified.')
  except Exception as e:
      print(f'Timestamp check: {e}')
  await db.close()
  print('Database Synchronized for Linux Deployment.')

asyncio.run(run())
