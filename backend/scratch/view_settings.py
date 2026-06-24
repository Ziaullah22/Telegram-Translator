import asyncio
import json
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import db

async def main():
    await db.connect()
    try:
        row = await db.fetchrow("SELECT * FROM instagram_filter_settings")
        if row:
            print("FILTER SETTINGS IN DATABASE:")
            for k, v in dict(row).items():
                print(f"{k}: {v}")
        else:
            print("No filter settings found.")
    finally:
         await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
