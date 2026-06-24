import asyncio
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import db

async def main():
    await db.connect()
    try:
        rows = await db.fetch("SELECT * FROM instagram_leads WHERE data_audit_json::text LIKE '%CAKES%' OR data_audit_json::text LIKE '%weed%'")
        print(f"Found {len(rows)} matching leads in DB:")
        for r in rows:
            print("--- LEAD ---")
            print(f"ID: {r['id']}")
            print(f"Username: {r['instagram_username']}")
            print(f"Status: {r['status']}")
            print(f"Bio: {r['bio']}")
            print(f"Google Title: {r['google_title']}")
            print(f"Google Description: {r['google_description']}")
            print(f"Audit JSON: {r['data_audit_json']}")
    finally:
         await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
