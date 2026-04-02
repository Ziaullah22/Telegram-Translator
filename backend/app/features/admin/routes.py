from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.core.admin_security import (
    verify_admin_password,
    create_admin_access_token,
    get_current_admin,
    is_admin_password_set,
)
from app.core.encryption import get_encryption_service, decrypt_message_if_encrypted
from database import db
from auth import get_password_hash
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Request/Response Models
class AdminLoginRequest(BaseModel):
    password: str

class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class ColleagueCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None

class ColleagueUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None

class PasswordReset(BaseModel):
    password: str

class EncryptionSettingsUpdate(BaseModel):
    encryption_enabled: bool

class EncryptionSettingsResponse(BaseModel):
    encryption_enabled: bool
    encryption_enabled_at: Optional[datetime]
    encryption_disabled_at: Optional[datetime]
    updated_at: datetime
    encryption_service_available: bool
    total_messages: int
    encrypted_messages: int

# Authentication Routes
# Authenticate an admin user and return a signed JWT access token if the password is valid
@router.post("/auth/login", response_model=AdminLoginResponse)
async def admin_login(request: AdminLoginRequest):
    """Admin login with encrypted password"""
    if not is_admin_password_set():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin password not configured. Please set up admin password first."
        )
    
    if not verify_admin_password(request.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password"
        )
    
    access_token = create_admin_access_token({"admin": True})
    return {"access_token": access_token, "token_type": "bearer"}

# Validate the current admin's JWT token to ensure their session is still active
@router.get("/auth/verify")
async def verify_admin_token(admin = Depends(get_current_admin)):
    """Verify admin token is valid"""
    return {"status": "valid"}

# Colleague Management Routes
# Retrieve a list of all user colleagues along with their aggregated statistics and nested account details
@router.get("/colleagues")
async def get_colleagues(admin = Depends(get_current_admin)):
    """Get all colleagues with their accounts and statistics"""
    colleagues = await db.fetch("""
        SELECT 
            u.id, u.username, u.email, u.is_active, u.created_at, u.last_login,
            COUNT(DISTINCT ta.id) as account_count,
            COUNT(DISTINCT c.id) as conversation_count,
            COUNT(DISTINCT m.id) as message_count
        FROM users u
        LEFT JOIN telegram_accounts ta ON ta.user_id = u.id
        LEFT JOIN conversations c ON c.telegram_account_id = ta.id
        LEFT JOIN messages m ON m.conversation_id = c.id
        GROUP BY u.id, u.username, u.email, u.is_active, u.created_at, u.last_login
        ORDER BY u.created_at DESC
    """)
    
    result = []
    for colleague in colleagues:
        # Get accounts for this colleague
        accounts = await db.fetch("""
            SELECT id, user_id, display_name, account_name, is_active, 
                   source_language, target_language, created_at, last_used
            FROM telegram_accounts
            WHERE user_id = $1
            ORDER BY created_at DESC
        """, colleague['id'])
        
        result.append({
            "id": colleague['id'],
            "username": colleague['username'],
            "email": colleague['email'],
            "is_active": colleague['is_active'],
            "created_at": colleague['created_at'].isoformat(),
            "last_login": colleague['last_login'].isoformat() if colleague['last_login'] else None,
            "accounts": [dict(acc) for acc in accounts],
            "total_messages": colleague['message_count'],
            "total_conversations": colleague['conversation_count'],
        })
    
    return result

@router.get("/colleagues/{colleague_id}")
async def get_colleague(colleague_id: int, admin = Depends(get_current_admin)):
    """Get specific colleague details"""
    colleague = await db.fetchrow("""
        SELECT id, username, email, is_active, created_at, last_login
        FROM users
        WHERE id = $1
    """, colleague_id)
    
    if not colleague:
        raise HTTPException(status_code=404, detail="Colleague not found")
    
    accounts = await db.fetch("""
        SELECT id, user_id, display_name, account_name, is_active, 
               source_language, target_language, created_at, last_used
        FROM telegram_accounts
        WHERE user_id = $1
        ORDER BY created_at DESC
    """, colleague_id)
    
    return {
        **dict(colleague),
        "accounts": [dict(acc) for acc in accounts]
    }

# Create a new colleague profile in the database with a securely hashed password
@router.post("/colleagues", status_code=status.HTTP_201_CREATED)
async def create_colleague(data: ColleagueCreate, admin = Depends(get_current_admin)):
    """Create new colleague account"""
    # Check if username exists
    existing = await db.fetchrow("SELECT id FROM users WHERE username = $1", data.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    password_hash = get_password_hash(data.password)
    
    colleague_id = await db.fetchval("""
        INSERT INTO users (username, password_hash, email, is_active)
        VALUES ($1, $2, $3, true)
        RETURNING id
    """, data.username, password_hash, data.email)
    
    return {"id": colleague_id, "message": "Colleague created successfully"}

@router.put("/colleagues/{colleague_id}")
async def update_colleague(
    colleague_id: int,
    data: ColleagueUpdate,
    admin = Depends(get_current_admin)
):
    """Update colleague information"""
    colleague = await db.fetchrow("SELECT id FROM users WHERE id = $1", colleague_id)
    if not colleague:
        raise HTTPException(status_code=404, detail="Colleague not found")
    
    # Build update query dynamically
    updates = []
    values = []
    param_count = 1
    
    if data.username is not None:
        updates.append(f"username = ${param_count}")
        values.append(data.username)
        param_count += 1
    
    if data.email is not None:
        updates.append(f"email = ${param_count}")
        values.append(data.email)
        param_count += 1
    
    if data.is_active is not None:
        updates.append(f"is_active = ${param_count}")
        values.append(data.is_active)
        param_count += 1
    
    if not updates:
        return {"message": "No updates provided"}
    
    values.append(colleague_id)
    query = f"UPDATE users SET {', '.join(updates)} WHERE id = ${param_count}"
    
    await db.execute(query, *values)
    return {"message": "Colleague updated successfully"}

@router.delete("/colleagues/{colleague_id}")
async def delete_colleague(colleague_id: int, admin = Depends(get_current_admin)):
    """Delete colleague and all associated data"""
    colleague = await db.fetchrow("SELECT id FROM users WHERE id = $1", colleague_id)
    if not colleague:
        raise HTTPException(status_code=404, detail="Colleague not found")
    
    await db.execute("DELETE FROM users WHERE id = $1", colleague_id)
    return {"message": "Colleague deleted successfully"}

    return {"message": "Password reset successfully"}

@router.post("/colleagues/{colleague_id}/impersonate")
async def impersonate_colleague(colleague_id: int, admin = Depends(get_current_admin)):
    """Allow admin to get an access token for any colleague (impersonation)"""
    colleague = await db.fetchrow("SELECT id, username, is_active FROM users WHERE id = $1", colleague_id)
    if not colleague:
        raise HTTPException(status_code=404, detail="Colleague not found")
    
    if not colleague['is_active']:
        raise HTTPException(status_code=403, detail="Cannot impersonate a deactivated account")
    
    from auth import create_access_token
    from datetime import timedelta
    from app.core.config import settings
    
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={
            "user_id": colleague['id'], 
            "username": colleague['username'],
            "impersonated_by": "admin"
        },
        expires_delta=access_token_expires,
    )
    
    logger.info(f"Admin impersonated colleague: {colleague['username']} (ID: {colleague['id']})")
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": colleague['id'],
            "username": colleague['username']
        }
    }

# Message Review Routes
@router.get("/conversations")
async def get_conversations(
    user_id: Optional[int] = None,
    account_id: Optional[int] = None,
    admin = Depends(get_current_admin)
):
    """Get conversations with filters"""
    from telethon_service import telethon_service
    
    query = """
        SELECT c.*, ta.id as account_id, ta.display_name as account_name, u.username as colleague_username
        FROM conversations c
        JOIN telegram_accounts ta ON ta.id = c.telegram_account_id
        JOIN users u ON u.id = ta.user_id
        WHERE c.is_hidden = false
    """
    params = []
    
    if user_id:
        params.append(user_id)
        query += f" AND u.id = ${len(params)}"
    
    if account_id:
        params.append(account_id)
        query += f" AND ta.id = ${len(params)}"
    
    query += " ORDER BY c.last_message_at DESC NULLS LAST"
    
    conversations = await db.fetch(query, *params)
    
    # Optimize: Get unique account IDs to avoid redundant and slow sequential me/get_me() calls
    unique_account_ids = {conv['account_id'] for conv in conversations}
    account_to_telegram_user_id = {}
    
    for acc_id in unique_account_ids:
        session = telethon_service.sessions.get(acc_id)
        if session and session.client and session.is_connected:
            # Check if we have it cached on the session object (we'll add this to the class too)
            cached_id = getattr(session, 'telegram_user_id', None)
            if cached_id:
                account_to_telegram_user_id[acc_id] = cached_id
            else:
                try:
                    me = await session.client.get_me()
                    if me:
                        account_to_telegram_user_id[acc_id] = me.id
                        setattr(session, 'telegram_user_id', me.id)
                    else:
                        account_to_telegram_user_id[acc_id] = None
                except Exception:
                    account_to_telegram_user_id[acc_id] = None
        else:
            account_to_telegram_user_id[acc_id] = None

    # Map the results back to conversations
    result = []
    for conv in conversations:
        conv_dict = dict(conv)
        conv_dict['account_telegram_user_id'] = account_to_telegram_user_id.get(conv['account_id'])
        result.append(conv_dict)
    
    return result

@router.get("/messages")
async def get_messages(
    user_id: Optional[int] = None,
    account_id: Optional[int] = None,
    conversation_id: Optional[int] = None,
    limit: int = 100,
    offset: int = 0,
    admin = Depends(get_current_admin)
):
    """Get messages with filters"""
    query = """
        SELECT m.*
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        JOIN telegram_accounts ta ON ta.id = c.telegram_account_id
        JOIN users u ON u.id = ta.user_id
        WHERE 1=1
    """
    params = []
    
    if user_id:
        params.append(user_id)
        query += f" AND u.id = ${len(params)}"
    
    if account_id:
        params.append(account_id)
        query += f" AND ta.id = ${len(params)}"
    
    if conversation_id:
        params.append(conversation_id)
        query += f" AND c.id = ${len(params)}"
    
    query += " ORDER BY m.created_at DESC"
    
    params.append(limit)
    query += f" LIMIT ${len(params)}"
    
    params.append(offset)
    query += f" OFFSET ${len(params)}"
    
    messages = await db.fetch(query, *params)
    
    # Decrypt messages if they are encrypted
    result = []
    for msg in reversed(messages):
        msg_dict = dict(msg)
        
        # Decrypt message if encrypted
        is_encrypted = msg_dict.get('is_encrypted', False)
        if is_encrypted:
            original_text, translated_text = await decrypt_message_if_encrypted(
                is_encrypted, msg_dict.get('original_text'), msg_dict.get('translated_text')
            )
            msg_dict['original_text'] = original_text
            msg_dict['translated_text'] = translated_text
        
        result.append(msg_dict)
    
    return result

# Statistics Route
@router.get("/statistics")
async def get_statistics(admin = Depends(get_current_admin)):
    """Get overall statistics"""
    stats = await db.fetchrow("""
        SELECT 
            COUNT(DISTINCT u.id) as total_users,
            COUNT(DISTINCT CASE WHEN u.is_active THEN u.id END) as active_users,
            COUNT(DISTINCT ta.id) as total_accounts,
            COUNT(DISTINCT c.id) as total_conversations,
            COUNT(DISTINCT m.id) as total_messages
        FROM users u
        LEFT JOIN telegram_accounts ta ON ta.user_id = u.id
        LEFT JOIN conversations c ON c.telegram_account_id = ta.id
        LEFT JOIN messages m ON m.conversation_id = c.id
    """)
    
    return dict(stats)

# Media Download Route for Admin
@router.get("/download-media/{conversation_id}/{message_id}")
async def admin_download_media(
    conversation_id: int,
    message_id: int,
    telegram_message_id: int,
    admin = Depends(get_current_admin)
):
    """Download media from a message (admin access)"""
    from fastapi.responses import FileResponse
    from fastapi import HTTPException, status
    import os
    import logging
    from telethon_service import telethon_service
    
    logger = logging.getLogger(__name__)
    
    # Get message with account info (admin can access any message)
    message = await db.fetchrow(
        """
        SELECT m.*, c.telegram_account_id, c.telegram_peer_id
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE m.id = $1 AND c.id = $2
        """,
        message_id,
        conversation_id,
    )

    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )

    try:
        # Create structured downloads directory
        download_dir = f"temp/downloads/{conversation_id}"
        os.makedirs(download_dir, exist_ok=True)
        
        # Use telegram_message_id as base filename
        base_filename = str(telegram_message_id)
        download_path = os.path.join(download_dir, base_filename)
        
        # Check if file already exists (cached)
        existing_files = [f for f in os.listdir(download_dir) if f.startswith(base_filename)]
        
        if existing_files:
            # Use cached file
            cached_file = os.path.join(download_dir, existing_files[0])
            logger.info(f"Using cached media file: {cached_file}")
            file_path = cached_file
        else:
            # Download media via Telethon
            logger.info(f"Downloading media for message {telegram_message_id}")
            
            session = await telethon_service.get_session(message['telegram_account_id'])
            if not session or not session.is_connected:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Telegram session not available"
                )
            
            try:
                # Download the media using our helper which ensures the message is fetched first
                file_path = await session.download_media(
                    telegram_message_id,
                    message['telegram_peer_id'],
                    download_path
                )
                
                if not file_path:
                    raise HTTPException(
                        status_code=status.HTTP_410_GONE,
                        detail="Media has been deleted or is no longer available"
                    )
                    
                logger.info(f"Downloaded media to: {file_path}")
            except Exception as e:
                logger.error(f"Failed to download media: {e}")
                if "deleted" in str(e).lower() or "expired" in str(e).lower():
                    raise HTTPException(
                        status_code=status.HTTP_410_GONE,
                        detail="Media has been deleted"
                    )
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to download media: {str(e)}"
                )
        
        # Determine media type from file extension
        file_ext = os.path.splitext(file_path)[1].lower()
        media_type_map = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.mov': 'video/quicktime',
            '.avi': 'video/x-msvideo',
        }
        media_type = media_type_map.get(file_ext, 'application/octet-stream')
        
        # Use stored filename or generate from telegram_message_id
        filename = message['media_file_name'] or f"media_{telegram_message_id}{file_ext}"
        
        return FileResponse(
            path=file_path,
            media_type=media_type,
            filename=filename
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading media: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

# Encryption Settings Routes
@router.get("/encryption/settings", response_model=EncryptionSettingsResponse)
async def get_encryption_settings(admin = Depends(get_current_admin)):
    """Get current encryption settings and statistics"""
    # Get encryption settings
    settings = await db.fetchrow("""
        SELECT encryption_enabled, encryption_enabled_at, encryption_disabled_at, updated_at
        FROM system_settings
        WHERE id = 1
    """)
    
    if not settings:
        # Initialize settings if not exists
        await db.execute("""
            INSERT INTO system_settings (id, encryption_enabled)
            VALUES (1, FALSE)
            ON CONFLICT (id) DO NOTHING
        """)
        settings = await db.fetchrow("""
            SELECT encryption_enabled, encryption_enabled_at, encryption_disabled_at, updated_at
            FROM system_settings
            WHERE id = 1
        """)
    
    # Get message statistics
    message_stats = await db.fetchrow("""
        SELECT 
            COUNT(*) as total_messages,
            COUNT(*) FILTER (WHERE is_encrypted = TRUE) as encrypted_messages
        FROM messages
    """)
    
    # Check if encryption service is available
    encryption_service = get_encryption_service()
    
    return {
        "encryption_enabled": settings['encryption_enabled'],
        "encryption_enabled_at": settings['encryption_enabled_at'],
        "encryption_disabled_at": settings['encryption_disabled_at'],
        "updated_at": settings['updated_at'],
        "encryption_service_available": encryption_service is not None,
        "total_messages": message_stats['total_messages'] or 0,
        "encrypted_messages": message_stats['encrypted_messages'] or 0,
    }

@router.put("/encryption/settings")
async def update_encryption_settings(
    data: EncryptionSettingsUpdate,
    admin = Depends(get_current_admin)
):
    """Enable or disable encryption for new messages"""
    # Check if encryption service is available
    encryption_service = get_encryption_service()
    if data.encryption_enabled and not encryption_service:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Encryption service not available. Please configure AES_ENCRYPTION_KEY in .env file."
        )
    
    # Get current settings
    current_settings = await db.fetchrow("""
        SELECT encryption_enabled FROM system_settings WHERE id = 1
    """)
    
    if not current_settings:
        # Initialize settings if not exists
        await db.execute("""
            INSERT INTO system_settings (id, encryption_enabled)
            VALUES (1, $1)
        """, data.encryption_enabled)
    else:
        # Update settings
        if data.encryption_enabled and not current_settings['encryption_enabled']:
            # Enabling encryption
            await db.execute("""
                UPDATE system_settings
                SET encryption_enabled = TRUE,
                    encryption_enabled_at = NOW(),
                    updated_at = NOW(),
                    updated_by = 'admin'
                WHERE id = 1
            """)
            logger.info("Encryption enabled by admin")
        elif not data.encryption_enabled and current_settings['encryption_enabled']:
            # Disabling encryption
            await db.execute("""
                UPDATE system_settings
                SET encryption_enabled = FALSE,
                    encryption_disabled_at = NOW(),
                    updated_at = NOW(),
                    updated_by = 'admin'
                WHERE id = 1
            """)
            logger.info("Encryption disabled by admin")
    
    return {
        "message": f"Encryption {'enabled' if data.encryption_enabled else 'disabled'} successfully",
        "encryption_enabled": data.encryption_enabled
    }
