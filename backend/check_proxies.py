import asyncio
from database import db

async def main():
    print("Connecting to database...")
    await db.connect()
    
    print("Fetching proxies...")
    rows = await db.fetch("SELECT * FROM instagram_proxies")
    
    if not rows:
        print("No proxies found in the database.")
    else:
        for i, row in enumerate(rows):
            proxy = dict(row)
            print(f"\n--- Proxy {i+1} ---")
            for key, value in proxy.items():
                if key == "password" and value:
                    print(f"{key}: {'*' * len(value)} (hidden)")
                else:
                    print(f"{key}: {value}")
                    
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
