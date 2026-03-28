import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def run():
    # Load environment variables
    load_dotenv()
    db_url = os.getenv("DATABASE_URL")
    
    if not db_url:
        print("Error: DATABASE_URL not found in environment variables.")
        return

    print("Connecting to database...")
    try:
        conn = await asyncpg.connect(db_url)
    except Exception as e:
        print(f"Connection failed: {e}")
        return
        
    try:
        # Add the language_expert_packs column
        print("Adding 'language_expert_packs' column to 'sales_settings' table...")
        await conn.execute("""
            ALTER TABLE sales_settings 
            ADD COLUMN IF NOT EXISTS language_expert_packs JSONB DEFAULT '{}';
        """)
        print("✅ Migration successful: Column added correctly!")
    except Exception as e:
        print(f"❌ Migration failed: {e}")
    finally:
        await conn.close()
        print("Database connection closed.")

if __name__ == "__main__":
    asyncio.run(run())
