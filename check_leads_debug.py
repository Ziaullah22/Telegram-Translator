import asyncio
import json
import os
import sys

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from database import db

async def check():
    await db.connect()
    try:
        campaigns = await db.fetch("SELECT id, name, status FROM campaigns")
        print("CAMPAIGNS:")
        for camp in campaigns:
            print(f"ID: {camp['id']}, Name: {camp['name']}, Status: {camp['status']}")
            
            leads = await db.fetch("SELECT id, telegram_identifier, current_step, status FROM campaign_leads WHERE campaign_id = $1", camp['id'])
            print(f"  LEADS for {camp['id']}:")
            for lead in leads:
                print(f"    ID: {lead['id']}, Identifier: {lead['telegram_identifier']}, Step: {lead['current_step']}, Status: {lead['status']}")
            
            steps = await db.fetch("SELECT step_number, keywords FROM campaign_steps WHERE campaign_id = $1", camp['id'])
            print(f"  STEPS for {camp['id']}:")
            for step in steps:
                print(f"    Step {step['step_number']}, Keywords: {step['keywords']}")
                
    finally:
        await db.disconnect()

if __name__ == "__main__":
    asyncio.run(check())
