import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

async def main():
    from database import db
    await db.connect()
    
    print("Applying missing columns to orders table...")
    try:
        await db.execute("""
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;
        """)
        print("Columns added!")
    except Exception as e:
        print(f"Error adding columns: {e}")

    # Verify
    cols = await db.fetch("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'orders'
        ORDER BY ordinal_position
    """)
    print("\nOrders columns now:")
    for c in cols:
        print(f"  {c['column_name']}")

    # Test the actual update
    order = await db.fetchrow("SELECT id FROM orders ORDER BY id DESC LIMIT 1")
    if order:
        try:
            await db.execute(
                "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2",
                'pending_payment', order['id']
            )
            print(f"\nUPDATE SUCCESS for order {order['id']}")
        except Exception as e:
            print(f"\nUPDATE FAILED: {e}")

    await db.disconnect()

asyncio.run(main())
