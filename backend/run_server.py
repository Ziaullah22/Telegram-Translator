"""
Custom uvicorn launcher for Windows.
Sets WindowsProactorEventLoopPolicy BEFORE uvicorn creates the event loop,
which is required for Playwright to launch subprocess (Chrome browser).
"""
import asyncio
import sys

# ✅ MUST be set BEFORE uvicorn.run() - this is the ONLY reliable fix on Windows
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False  # ❌ reload=True spawns a fresh subprocess that resets the event loop policy
    )
