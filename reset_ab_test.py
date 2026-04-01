"""
A/B Test Reset Script
=====================
Run this script to clear all A/B test assignments so you can re-test 
with the same Telegram account.

Usage:
    python reset_ab_test.py
"""
import asyncio
import os

# Read DATABASE_URL directly from .env file - no backend imports needed
def load_env():
    env_path = os.path.join(os.path.dirname(__file__), 'backend', '.env')
    env_vars = {}
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and '=' in line and not line.startswith('#'):
                    key, _, val = line.partition('=')
                    env_vars[key.strip()] = val.strip()
    return env_vars

async def reset_ab_testing():
    try:
        import asyncpg
    except ImportError:
        print("❌ asyncpg is not installed. Please run: pip install asyncpg")
        return

    env = load_env()
    db_url = env.get('DATABASE_URL')

    if not db_url:
        print("❌ Could not find DATABASE_URL in backend/.env")
        return

    print(f"\n🔌 Connecting to database...")

    try:
        conn = await asyncpg.connect(db_url)

        # Count existing results first
        count = await conn.fetchval("SELECT COUNT(*) FROM ab_test_results")
        print(f"📊 Found {count} existing A/B test assignment(s).")

        # Clear all results
        await conn.execute("DELETE FROM ab_test_results")
        print("🧹 All assignments cleared!")

        await conn.close()

        print("\n✅ DONE! The bot will now assign a fresh variant (A or B) on the")
        print("   NEXT message you send to it on Telegram.")
        print("\n💡 TIP: Run this script again whenever you want to re-test a variant.")

    except Exception as e:
        print(f"❌ Database error: {e}")
        print("\n   Make sure the backend server is not blocking the database connection.")

if __name__ == "__main__":
    asyncio.run(reset_ab_testing())
