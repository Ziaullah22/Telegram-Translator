import asyncio
import os
import sys

# Add backend directory to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from database import db

async def cleanup_duplicates():
    print("Cleaning up duplicate messages...")
    await db.connect()
    
    # Use a CTE to find duplicates and keep only the first one
    # We keep the one with the smallest 'id'
    try:
        deleted_count = await db.fetchval("""
            WITH duplicates AS (
                SELECT id, 
                       ROW_NUMBER() OVER (
                           PARTITION BY conversation_id, telegram_message_id 
                           ORDER BY id ASC
                       ) as row_num
                FROM messages
                WHERE telegram_message_id IS NOT NULL AND telegram_message_id != 0
            )
            DELETE FROM messages
            WHERE id IN (
                SELECT id FROM duplicates WHERE row_num > 1
            )
            RETURNING count(*)
        """)
        print(f"✓ Removed {deleted_count or 0} duplicate messages.")
    except Exception as e:
        print(f"Error cleaning duplicates: {e}")
    finally:
        await db.disconnect()

if __name__ == "__main__":
    asyncio.run(cleanup_duplicates())
