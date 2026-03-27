import asyncio
import os
import sys

# Add backend directory to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from database import db

async def check_duplicates():
    print("Checking for duplicate messages in database...")
    await db.connect()
    
    try:
        rows = await db.fetch("""
            SELECT telegram_message_id, conversation_id, COUNT(*) 
            FROM messages 
            WHERE telegram_message_id != 0 
            GROUP BY telegram_message_id, conversation_id 
            HAVING COUNT(*) > 1
        """)
        if rows:
            print(f"!!! Found {len(rows)} duplicated entries!")
            for row in rows:
                print(f"  - ID: {row['telegram_message_id']} (Count: {row['count']})")
        else:
            print("✓ No duplicates found in database.")
    except Exception as e:
        print(f"Error checking duplicates: {e}")
    finally:
        await db.disconnect()

if __name__ == "__main__":
    asyncio.run(check_duplicates())
