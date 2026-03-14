
import asyncio
from database import db

async def main():
    try:
        await db.connect()
        print("Connected to DB")
        # Add auto_replies to campaigns
        await db.execute("ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS auto_replies JSONB DEFAULT '[]'::jsonb")
        print("Added auto_replies to campaigns")
        # Add auto_replies to campaign_steps
        await db.execute("ALTER TABLE campaign_steps ADD COLUMN IF NOT EXISTS auto_replies JSONB DEFAULT '[]'::jsonb")
        print("Added auto_replies to campaign_steps")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
