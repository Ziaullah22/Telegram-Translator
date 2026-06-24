import asyncio
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import db

async def main():
    await db.connect()
    try:
        new_intent = (
            "Only match profiles that are actively related to cannabis, electronic cigarettes, vaping, "
            "smoking, or related products. The result must be associated with one of the following: "
            "cannabis, electronic cigarettes, vapes, vape shops, smoke shops, cbd stores, cannabis brands, "
            "medical dispensaries, thc vapes, thc/cbd cartridges, ecigs, thc/cbd carts, cannabis oil/concentrates, "
            "stoned, stoners, baked, e-liquid, 420, bongs, pipes, hookahs, dab rigs, smoke gear, smoking sessions, "
            "smoke lounges, vape hardware, vapers, vaping, wholesale, or distribution."
        )
        print("Fixing database settings in instagram_filter_settings...")
        await db.execute(
            "UPDATE instagram_filter_settings SET ai_intent_filter = $1 WHERE user_id = 2",
            new_intent
        )
        print("Successfully updated database intent filter settings to match your target cannabis/vape intent!")
    finally:
         await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
