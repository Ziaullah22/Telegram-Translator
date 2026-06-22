import asyncio
import httpx

API_KEY = "cfe5eb8b039d9ea6e54a9287b34e5274"

async def test_2captcha():
    print("🤖 Testing 2Captcha API Key...")
    
    async with httpx.AsyncClient() as client:
        # Check Balance Endpoint
        url = f"http://2captcha.com/res.php?key={API_KEY}&action=getbalance&json=1"
        try:
            response = await client.get(url)
            data = response.json()
            
            if data.get("status") == 1:
                balance = data.get("request")
                print(f"✅ Success! Your 2Captcha API key is valid.")
                print(f"💰 Current Account Balance: ${balance}")
            else:
                print(f"❌ Error! Invalid API key or issue with 2Captcha.")
                print(f"Server response: {data}")
                
        except Exception as e:
            print(f"❌ Connection error: {e}")

if __name__ == "__main__":
    asyncio.run(test_2captcha())
