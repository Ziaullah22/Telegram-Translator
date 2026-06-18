import asyncio
import socks
import traceback
from telethon import TelegramClient

async def test_conn(ptype, ptype_name, rdns):
    print(f"Testing connection using {ptype_name} (rdns={rdns})...")
    proxy = (ptype, '38.154.203.95', 5863, rdns, 'bfnzrocn', 'od37fxggn9dd')
    client = TelegramClient('temp_test_session', 2040, 'b18441a111713c11a9ebd21973a14035', proxy=proxy)
    try:
        await asyncio.wait_for(client.connect(), timeout=10.0)
        print(f"✅ Success connecting with {ptype_name} (rdns={rdns})!")
        await client.disconnect()
        return True
    except Exception as e:
        print(f"❌ Failed connecting with {ptype_name} (rdns={rdns}): {type(e).__name__}: {str(e)}")
        traceback.print_exc()
        return False

async def main():
    print("--- SOCKS5 TEST ---")
    await test_conn(socks.SOCKS5, "SOCKS5", True)
    await test_conn(socks.SOCKS5, "SOCKS5", False)
    
    print("--- HTTP TEST ---")
    await test_conn(socks.HTTP, "HTTP", True)
    await test_conn(socks.HTTP, "HTTP", False)

if __name__ == '__main__':
    asyncio.run(main())
