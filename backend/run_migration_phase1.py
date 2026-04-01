import asyncio
import asyncpg
import sys

async def migrate():
    try:
        conn = await asyncpg.connect("postgresql://postgres:postgres@localhost:5432/telegram_translator")
        print("Connected to DB")
        
        # Add tags column
        await conn.execute("""
            ALTER TABLE contact_info 
            ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'
        """)
        print("Added 'tags' column (if not existed)")
        
        # Add pipeline_stage column
        await conn.execute("""
            ALTER TABLE contact_info 
            ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(50) DEFAULT 'Lead'
        """)
        print("Added 'pipeline_stage' column (if not existed)")
        
        await conn.close()
        print("Migration completed.")
    except Exception as e:
        print(f"Error during migration: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(migrate())
