from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from models import TokenData
from auth import get_current_user
from instagram_chat_service import instagram_chat_service

router = APIRouter(prefix="/api/instagram/chat", tags=["instagram_chat"])

@router.get("/threads")
async def get_threads(
    account_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """Get recent Instagram DM threads for a connected account."""
    try:
        # Verify account ownership
        from database import db
        account = await db.fetchrow(
            "SELECT id FROM instagram_accounts WHERE id = $1 AND user_id = $2",
            account_id, current_user.user_id
        )
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
            
        return await instagram_chat_service.get_threads(account_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/threads/{thread_id}/send")
async def send_message(
    account_id: int,
    thread_id: str,
    text: str,
    current_user: TokenData = Depends(get_current_user)
):
    """Send a message to an Instagram thread."""
    try:
        # Verify account ownership
        from database import db
        account = await db.fetchrow(
            "SELECT id FROM instagram_accounts WHERE id = $1 AND user_id = $2",
            account_id, current_user.user_id
        )
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
            
        return await instagram_chat_service.send_message(account_id, thread_id, text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/threads/{thread_id}/messages")
async def get_messages(
    account_id: int,
    thread_id: str,
    current_user: TokenData = Depends(get_current_user)
):
    """Get messages for a specific Instagram thread."""
    try:
        # Verify account ownership
        from database import db
        account = await db.fetchrow(
            "SELECT id FROM instagram_accounts WHERE id = $1 AND user_id = $2",
            account_id, current_user.user_id
        )
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
            
        return await instagram_chat_service.get_messages(account_id, thread_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/search-user")
async def search_users(
    account_id: int,
    query: str,
    current_user: TokenData = Depends(get_current_user)
):
    """Search for users to start a new chat with."""
    try:
        # Verify account ownership
        from database import db
        account = await db.fetchrow(
            "SELECT id FROM instagram_accounts WHERE id = $1 AND user_id = $2",
            account_id, current_user.user_id
        )
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
            
        return await instagram_chat_service.search_users(account_id, query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/threads/create")
async def create_thread(
    account_id: int,
    username: str,
    current_user: TokenData = Depends(get_current_user)
):
    """Initiate a thread with a user by username."""
    try:
        # Verify account ownership
        from database import db
        account = await db.fetchrow(
            "SELECT id FROM instagram_accounts WHERE id = $1 AND user_id = $2",
            account_id, current_user.user_id
        )
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
            
        return await instagram_chat_service.create_thread_by_username(account_id, username)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
