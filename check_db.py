import asyncio
import asyncpg
import os

async def check_constraints():
    db_url = "postgresql://postgres:postgres@localhost:5432/telegram_translator"
    env_path = os.path.join(os.getcwd(), 'backend', '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('DATABASE_URL='):
                    db_url = line.split('=')[1].strip()
                    break

    conn = await asyncpg.connect(db_url)
    try:
        # Check foreign key constraints for campaign_logs
        rows = await conn.fetch("""
            SELECT
                tc.constraint_name, 
                tc.table_name, 
                kcu.column_name, 
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name,
                rc.delete_rule
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
                JOIN information_schema.referential_constraints AS rc
                  ON rc.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'campaign_logs';
        """)
        for row in rows:
            print(f"Constraint: {row['constraint_name']}, Column: {row['column_name']}, Delete Rule: {row['delete_rule']}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(check_constraints())
