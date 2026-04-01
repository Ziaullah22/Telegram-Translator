import asyncio
import asyncpg
import os

async def check_schema():
    conn = await asyncpg.connect("postgresql://postgres:postgres@localhost:5432/telegram_translator")
    try:
        # Check columns of contact_info
        columns = await conn.fetch("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'contact_info'
        """)
        print("Existing columns in contact_info:")
        for col in columns:
            print(f"- {col['column_name']}: {col['data_type']}")
            
        # Check if table exists
        exists = await conn.fetchval("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'contact_info')")
        print(f"\nTable 'contact_info' exists: {exists}")
        
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(check_schema())
