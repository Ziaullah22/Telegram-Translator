import asyncio
import sys
import os

# Adjust paths to load config correctly
# Load backend .env before importing config/settings
import os
import sys
from dotenv import load_dotenv

backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(backend_dir)

load_dotenv(os.path.join(backend_dir, ".env"))

from app.core.config import settings
import asyncpg

async def reject_all_pending():
    print("Connecting to database...")
    try:
        conn = await asyncpg.connect(settings.database_url)
    except Exception as e:
        print(f"Error connecting to database: {e}")
        return

    try:
        # Check how many leads are currently pending
        pending_count = await conn.fetchval(
            "SELECT COUNT(*) FROM instagram_leads WHERE status = 'pending'"
        )
        print(f"Found {pending_count} pending leads.")

        if pending_count == 0:
            print("No pending leads to reject.")
            return

        # Update all pending leads to rejected
        print("Rejecting all pending leads...")
        result = await conn.execute(
            "UPDATE instagram_leads SET status = 'rejected' WHERE status = 'pending'"
        )
        print(f"Success! {result}")

    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(reject_all_pending())
