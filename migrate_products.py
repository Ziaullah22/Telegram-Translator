
import asyncio
import asyncpg
import os

async def migrate():
    # Try to load URL from backend/.env like the main app does
    db_url = "postgresql://postgres:postgres@localhost:5432/telegram_translator" # Default fallback
    
    # Path to backend/.env
    env_path = os.path.join(os.getcwd(), 'backend', '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('DATABASE_URL='):
                    db_url = line.split('=')[1].strip()
                    break

    print(f"Connecting to database: {db_url}")
    try:
        conn = await asyncpg.connect(db_url)
        print("Connected successfully!")
        
        try:
            print("Creating products table...")
            
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS products (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    name VARCHAR(255) NOT NULL,
                    description TEXT,
                    price DECIMAL(12, 2) NOT NULL DEFAULT 0,
                    stock_quantity INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                
                ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_url TEXT;
                ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_urls JSONB DEFAULT '[]'::jsonb;
                
                -- Add keywords column if it does not exist (we use JSONB instead of TEXT[] for easier parsing)
                ALTER TABLE products ADD COLUMN IF NOT EXISTS keywords JSONB DEFAULT '[]'::jsonb;
                
                CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);
            """)
            print("✓ Table: products migrations applied")

            print("\nDatabase migration completed successfully.")
            
        except Exception as e:
            print(f"\nError during schema update: {e}")
        finally:
            await conn.close()
            
    except Exception as e:
        print(f"\nFailed to connect to database. Please check your DATABASE_URL in backend/.env")
        print(f"Error: {e}")

if __name__ == "__main__":
    print("Starting Product Table Migration...")
    asyncio.run(migrate())
