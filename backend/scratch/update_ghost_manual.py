import asyncio
import json
import re
from database import db

async def manual_update():
    await db.connect()
    
    username = "chahat__7sab_ki_1a43"
    password = "6QjKkTGn2NIw"
    two_fa_secret = "VPKCB36FRVU4IAHCWNNKVDLJESP6MQLX"
    # Extracting sessionid from the full cookie provided
    cookie_str = "x-mid=adDGBQABAAGqTXUxwDHZ6DTfiMBa;ig-u-rur=NCG,37518397453,1806825866:01fe9bde9a1fc6be15de5d2355d40168bd01942b1a38d4b2bf8452f8a205274155266a23;ig-u-ds-user-id=37518397453;ds_user_id=37518397453;sessionid=37518397453%3AV8hqx5SU6cyQnN%3A6%3AAYgCwH5UYbjqeMo0tZDMalygCbbguKXIDDQUa4PElA;"
    
    session_id = None
    match = re.search(r'sessionid=([^; ]+)', cookie_str)
    if match:
        session_id = match.group(1).replace("%3A", ":") # Decode the %3A
    
    print(f"Updating @{username}...")
    print(f"Session: {session_id}")
    print(f"2FA Secret: {two_fa_secret}")
    
    await db.execute("""
        UPDATE instagram_warming_accounts 
        SET password = $1, session_id = $2, verification_code = $3, status = 'active', updated_at = NOW() 
        WHERE username = $4
    """, password, session_id, two_fa_secret, username)
    
    print("Update Successful! Warming Engine now has the credentials.")
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(manual_update())
