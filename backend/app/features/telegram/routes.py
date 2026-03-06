from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Form
import asyncio
from typing import List
from app.core.database import db
from app.core.security import get_current_user
from models import (
    TelegramAccountCreate,
    TelegramAccountResponse,
    TelegramAccountUpdate,
    ConversationResponse,
    MessageResponse,
    MessageSend,
    UserSearchResult,
    ConversationCreate,
)
from telethon_service import telethon_service
from translation_service import translation_service
from websocket_manager import manager
import logging
import os, json
import shutil
import zipfile
import rarfile
import io

# Configure rarfile tool path
if os.name == 'nt':  # Windows
    RAR_TOOL_PATH = r"C:\Program Files\WinRAR\UnRAR.exe"
    if os.path.exists(RAR_TOOL_PATH):
        rarfile.UNRAR_TOOL = RAR_TOOL_PATH
else:  # Linux
    # On Linux, assume 'unrar' is in the system PATH
    rarfile.UNRAR_TOOL = "unrar"


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/telegram", tags=["telegram"])


@router.post("/accounts/validate-tdata")
async def validate_tdata(
    tdata: UploadFile = File(...),
    current_user = Depends(get_current_user),
):
    """Validate TData file and return account info without creating the account"""
    import time
    temp_id = f"{current_user.user_id}_{int(time.time())}"
    temp_path = f"temp/TData/{temp_id}"
    
    try:
        # Read the file content
        file_content = await tdata.read()
        
        # Check if it's a valid zip or rar file
        filename = tdata.filename.lower()
        try:
            os.makedirs(temp_path, exist_ok=True)
            if filename.endswith('.zip'):
                with zipfile.ZipFile(io.BytesIO(file_content), 'r') as zip_ref:
                    zip_ref.extractall(temp_path)
                    namelist = zip_ref.namelist()
                    if not namelist:
                        raise ValueError("Empty archive")
                    tg_account_id = namelist[0].split('/')[0]
            elif filename.endswith('.rar'):
                with rarfile.RarFile(io.BytesIO(file_content), 'r') as rar_ref:
                    rar_ref.extractall(temp_path)
                    namelist = rar_ref.namelist()
                    if not namelist:
                        raise ValueError("Empty archive")
                    tg_account_id = namelist[0].split('/')[0]
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Unsupported file format. Please upload a .zip or .rar file.",
                )
        except (zipfile.BadZipFile, rarfile.BadRarFile):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file format. Please upload a valid TData archive exported from Telegram Desktop.",
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to extract file: {str(e)}",
            )
        
        # Find the .json configuration file in the extracted directory
        json_file = None
        tg_account_id = None
        
        for root, dirs, files in os.walk(temp_path):
            for file in files:
                if file.endswith('.json'):
                    potential_account_id = file[:-5]
                    if os.path.exists(os.path.join(root, f"{potential_account_id}.session")):
                        json_file = os.path.join(root, file)
                        session_file = os.path.join(root, f"{potential_account_id}.session")
                        tg_account_id = potential_account_id
                        break
            if json_file:
                break
        
        if not json_file or not os.path.exists(session_file):
            if os.path.exists(temp_path):
                shutil.rmtree(temp_path)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing account configuration or session file (.json/.session). Please export a fresh TData from Telegram Desktop.",
            )
        
        # Parse account data
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                app_data = json.load(f)
            
            # Fallback order: username -> phone -> tg_account_id
            account_name = app_data.get('username') or app_data.get('phone') or tg_account_id
            app_id = app_data.get('app_id')
            app_hash = app_data.get('app_hash')
            
            if not app_id:
                raise ValueError("Missing app_id (API ID)")
            if not app_hash:
                raise ValueError("Missing app_hash (API Hash)")
                
        except json.JSONDecodeError:
            if os.path.exists(temp_path):
                shutil.rmtree(temp_path)
            logger.error(f"JSON decode error for TData validation in {temp_path}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid configuration file format. The TData file may be corrupted.",
            )
        except ValueError as e:
            if os.path.exists(temp_path):
                shutil.rmtree(temp_path)
            logger.error(f"Validation error in validate_tdata: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid TData file: {str(e)}. Please export a fresh TData from Telegram Desktop.",
            )
        except Exception as e:
            if os.path.exists(temp_path):
                shutil.rmtree(temp_path)
            logger.error(f"Unexpected error in validate_tdata: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Validation failed: {str(e)}",
            )
        except Exception as e:
            if os.path.exists(temp_path):
                shutil.rmtree(temp_path)
            logger.error(f"Unexpected error in validate_tdata: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Validation failed: {str(e)}",
            )
        
        # Check if account already exists
        existing = await db.fetchrow(
            "SELECT id, is_active, display_name FROM telegram_accounts WHERE user_id = $1 AND account_name = $2",
            current_user.user_id,
            account_name,
        )
        
        # Clean up temp directory
        shutil.rmtree(temp_path)
        
        return {
            "valid": True,
            "account_name": account_name,
            "exists": existing is not None,
            "is_active": existing['is_active'] if existing else False,
            "current_display_name": existing['display_name'] if existing else None,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        # Clean up temp directory on error
        if os.path.exists(temp_path):
            shutil.rmtree(temp_path)
        logger.error(f"Error validating TData: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to validate TData file: {str(e)}",
        )


@router.get("/accounts", response_model=List[TelegramAccountResponse])
async def get_accounts(current_user = Depends(get_current_user)):
    accounts = await db.fetch(
        """
        SELECT ta.id, ta.account_name, ta.display_name, ta.is_active,
               ta.source_language, ta.target_language, ta.created_at, ta.last_used,
               (
                   SELECT COUNT(*) 
                   FROM messages m
                   JOIN conversations c ON m.conversation_id = c.id
                   WHERE c.telegram_account_id = ta.id AND m.is_read = false AND m.is_outgoing = false
               ) as total_unread
        FROM telegram_accounts ta
        WHERE ta.user_id = $1 AND ta.is_active = true
        ORDER BY ta.last_used DESC NULLS LAST, ta.created_at DESC
        """,
        current_user.user_id,
    )

    result = []
    for account in accounts:
        session = await telethon_service.get_session(account['id'])
        is_connected = session.is_connected if session else False

        result.append({
            "id": account['id'],
            "account_name": account['account_name'],
            "display_name": account['display_name'],
            "is_active": account['is_active'],
            "source_language": account['source_language'],
            "target_language": account['target_language'],
            "created_at": account['created_at'],
            "last_used": account['last_used'],
            "is_connected": is_connected,
            "unread_count": account['total_unread'] or 0
        })

    return result


@router.post("/accounts", response_model=TelegramAccountResponse)
async def create_account(
    displayName: str = Form(...),
    sourceLanguage: str = Form("auto"),
    targetLanguage: str = Form("en"),
    tdata: UploadFile = File(None),
    current_user = Depends(get_current_user),
):
    if not tdata:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TData file (Zip format) is required",
        )

    # Create temporary extraction directory with timestamp to avoid conflicts
    import time
    temp_id = f"{current_user.user_id}_{int(time.time())}"
    temp_path = f"temp/TData/{temp_id}"
    
    try:
        # Read the file content into memory
        file_content = await tdata.read()
        filename = tdata.filename.lower()
        os.makedirs(temp_path, exist_ok=True)
        
        if filename.endswith('.zip'):
            with zipfile.ZipFile(io.BytesIO(file_content), 'r') as zip_ref:
                zip_ref.extractall(temp_path)
        elif filename.endswith('.rar'):
            with rarfile.RarFile(io.BytesIO(file_content), 'r') as rar_ref:
                rar_ref.extractall(temp_path)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported file format. Please upload a .zip or .rar file.",
            )
            
        # Find the .json configuration file in the extracted directory
        json_file = None
        tg_account_id = None
        session_file_path = None
        
        for root, dirs, files in os.walk(temp_path):
            for file in files:
                if file.endswith('.json'):
                    potential_account_id = file[:-5]
                    potential_session = os.path.join(root, f"{potential_account_id}.session")
                    if os.path.exists(potential_session):
                        json_file = os.path.join(root, file)
                        session_file_path = potential_session
                        tg_account_id = potential_account_id
                        break
            if json_file:
                break
        
        if not json_file or not session_file_path:
            raise ValueError("Missing .json or .session file in archive")
            
        with open(json_file, 'r', encoding='utf-8') as f:
            app_data = json.load(f)
            
        # Fallback order: username -> phone -> tg_account_id
        account_name = app_data.get('username') or app_data.get('phone') or tg_account_id
        app_id = app_data['app_id']
        app_hash = app_data['app_hash']
    except Exception as e:
        # Clean up temp directory on error
        if os.path.exists(temp_path):
            shutil.rmtree(temp_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid TData archive: {str(e)}",
        )

    # Check for existing account (only active accounts)
    existing = await db.fetchrow(
        "SELECT id, is_active FROM telegram_accounts WHERE user_id = $1 AND account_name = $2",
        current_user.user_id,
        account_name,
    )

    if existing and existing['is_active']:
        # Clean up temp directory
        if os.path.exists(temp_path):
            shutil.rmtree(temp_path)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Account name already exists",
        )

    # If account exists but is inactive, reactivate it
    try:
        if existing and not existing['is_active']:
            account_id = existing['id']
            await db.execute(
                """
                UPDATE telegram_accounts 
                SET is_active = true, 
                    display_name = $1, 
                    source_language = $2, 
                    target_language = $3,
                    app_id = $4,
                    app_hash = $5,
                    last_used = NULL
                WHERE id = $6
                """,
                displayName,
                sourceLanguage,
                targetLanguage,
                app_id,
                app_hash,
                account_id,
            )
            logger.info(f"Reactivated telegram account: {account_name} for user {current_user.user_id}")
        else:
            # Create new account
            account_id = await db.fetchval(
                """
                INSERT INTO telegram_accounts
                (user_id, display_name, account_name, source_language, target_language, app_id, app_hash)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
                """,
                current_user.user_id,
                displayName,
                account_name,
                sourceLanguage,
                targetLanguage,
                app_id,
                app_hash,
            )
    except Exception as e:
        # Clean up temp directory on database error
        if os.path.exists(temp_path):
            shutil.rmtree(temp_path)
        
        # Handle specific database errors
        error_msg = str(e)
        if "uq_telegram_accounts_user_display_name" in error_msg or "duplicate key" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Display name '{displayName}' is already in use. Please choose a different display name.",
            )
        else:
            logger.error(f"Database error creating account: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {str(e)}",
            )

    # Move session file to sessions directory
    tdata_path = f"sessions"
    os.makedirs(tdata_path, exist_ok=True)

    session_location = f"{tdata_path}/{current_user.user_id}_{account_name}.session"
    
    # Remove old session file if exists
    if os.path.exists(session_location):
        os.remove(session_location)
    
    shutil.move(session_file_path, session_location)
    
    # Clean up temp directory
    if os.path.exists(temp_path):
        shutil.rmtree(temp_path)
    
    tdata.file.close()

    # Start connection in background to avoid HTTP timeout
    async def start_initial_connection():
        try:
            connected = await telethon_service.connect_session(account_id)
            if connected:
                # Update last_used to place account at top of list
                await db.execute(
                    "UPDATE telegram_accounts SET last_used = NOW() WHERE id = $1",
                    account_id
                )
                logger.info(f"Background connection successful for new account: {account_name}")
            else:
                logger.error(f"Background connection failed for new account: {account_name}")
        except Exception as e:
            logger.error(f"Error in background connection for {account_name}: {e}")

    # Fire and forget the connection task
    asyncio.create_task(start_initial_connection())

    account = await db.fetchrow(
        "SELECT * FROM telegram_accounts WHERE id = $1 AND is_active = true",
        account_id,
    )

    return {
        "id": account['id'],
        "account_name": account['account_name'],
        "display_name": account['display_name'],
        "is_active": account['is_active'],
        "source_language": account['source_language'],
        "target_language": account['target_language'],
        "created_at": account['created_at'],
        "last_used": account['last_used'],
        "is_connected": False, # Initially false as it's connecting in background
    }


@router.post("/accounts/{account_id}/connect")
async def connect_account(
    account_id: int,
    current_user = Depends(get_current_user),
):
    account = await db.fetchrow(
        "SELECT * FROM telegram_accounts WHERE id = $1 AND user_id = $2",
        account_id,
        current_user.user_id,
    )

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )

    try:
        connected = await telethon_service.connect_session(account_id)

        if not connected:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to connect to Telegram. Please check your session file.",
            )

        return {"message": "Connected successfully", "connected": True}
    
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error connecting account {account_id}: {e}")
        
        # If the error message is already descriptive, use it
        if "banned" in error_msg.lower() or "deactivated" in error_msg.lower() or "expired" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_msg,
            )
            
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to connect to Telegram: {str(e)}",
        )


@router.post("/accounts/{account_id}/disconnect")
async def disconnect_account(
    account_id: int,
    current_user = Depends(get_current_user),
):
    account = await db.fetchrow(
        "SELECT * FROM telegram_accounts WHERE id = $1 AND user_id = $2",
        account_id,
        current_user.user_id,
    )

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )

    await telethon_service.disconnect_session(account_id)

    return {"message": "Disconnected successfully", "connected": False}


@router.patch("/accounts/{account_id}", response_model=TelegramAccountResponse)
async def update_account(
    account_id: int,
    update_data: TelegramAccountUpdate,
    current_user = Depends(get_current_user),
):
    account = await db.fetchrow(
        "SELECT * FROM telegram_accounts WHERE id = $1 AND user_id = $2",
        account_id,
        current_user.user_id,
    )

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )

    update_fields = []
    values = []
    param_count = 1

    if update_data.account_name is not None:
        update_fields.append(f"account_name = ${param_count}")
        values.append(update_data.account_name)
        param_count += 1

    if update_data.display_name is not None:
        update_fields.append(f"display_name = ${param_count}")
        values.append(update_data.display_name)
        param_count += 1

    if update_data.source_language is not None:
        update_fields.append(f"source_language = ${param_count}")
        values.append(update_data.source_language)
        param_count += 1

    if update_data.target_language is not None:
        update_fields.append(f"target_language = ${param_count}")
        values.append(update_data.target_language)
        param_count += 1

    if update_data.is_active is not None:
        update_fields.append(f"is_active = ${param_count}")
        values.append(update_data.is_active)
        param_count += 1

    if not update_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    query = f"""
        UPDATE telegram_accounts
        SET {", ".join(update_fields)}
        WHERE id = {account_id}
        RETURNING *
    """

    updated_account = await db.fetchrow(query, *values)

    session = await telethon_service.get_session(account_id)
    is_connected = session.is_connected if session else False

    update_result = {
        "id": updated_account['id'],
        "account_name": updated_account['account_name'],
        "display_name": updated_account['display_name'],
        "is_active": updated_account['is_active'],
        "source_language": updated_account['source_language'],
        "target_language": updated_account['target_language'],
        "created_at": updated_account['created_at'],
        "last_used": updated_account['last_used'],
        "is_connected": is_connected,
    }

    # Notify frontend via WebSocket for instant UI updates
    await manager.send_to_account(
        {
            "type": "account_updated",
            "account": update_result
        },
        account_id,
        current_user.user_id,
    )

    return update_result


@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: int,
    current_user = Depends(get_current_user),
):
    account = await db.fetchrow(
        "SELECT * FROM telegram_accounts WHERE id = $1 AND user_id = $2",
        account_id,
        current_user.user_id,
    )

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )

    await telethon_service.disconnect_session(account_id)

    # Delete Telegram account from database
    await db.execute(
        "DELETE FROM telegram_accounts WHERE id = $1 AND user_id = $2",
        account_id,
        current_user.user_id,
    )

    await manager.send_to_account(
        {
            "type": "account_deleted",
            "account_id": account_id
        },
        account_id,
        current_user.user_id,
    )

    logger.info(f"Telegram account deleted: {account['account_name']} for user {current_user.user_id}")

    return {"message": "Account deleted successfully"}


@router.get("/accounts/{account_id}/conversations", response_model=List[ConversationResponse])
async def get_conversations(
    account_id: int,
    current_user = Depends(get_current_user),
):
    account = await db.fetchrow(
        "SELECT * FROM telegram_accounts WHERE id = $1 AND user_id = $2",
        account_id,
        current_user.user_id,
    )

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )

    # Fetch conversations directly from database with last message content
    conversations = await db.fetch(
        """
        WITH LastMessages AS (
            SELECT conversation_id, 
                   id, telegram_message_id, sender_user_id, sender_name, sender_username, 
                   type, original_text, translated_text, source_language, target_language, 
                   created_at, edited_at, is_outgoing, media_file_name,
                   ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at DESC) as rn
            FROM messages
        )
        SELECT c.*, 
               lm.id as last_msg_db_id, lm.telegram_message_id, lm.sender_user_id, lm.sender_name, 
               lm.sender_username, lm.type as msg_type, lm.original_text, lm.translated_text, 
               lm.source_language as msg_source_lang, lm.target_language as msg_target_lang, 
               lm.created_at as msg_created_at, lm.edited_at as msg_edited_at, 
               lm.is_outgoing as msg_is_outgoing, lm.media_file_name,
               (SELECT COUNT(*) FROM messages m2 
                WHERE m2.conversation_id = c.id AND m2.is_outgoing = false AND (m2.is_read = false OR m2.is_read IS NULL)) as unread_count_db
        FROM conversations c
        LEFT JOIN LastMessages lm ON c.id = lm.conversation_id AND lm.rn = 1
        WHERE c.telegram_account_id = $1 AND c.is_hidden = false
        ORDER BY COALESCE(lm.created_at, c.created_at) DESC
        """,
        account_id,
    )

    result = []
    for conv in conversations:
        last_message = None
        if conv['last_msg_db_id']:
            last_message = {
                "id": conv['last_msg_db_id'],
                "conversation_id": conv['id'],
                "telegram_message_id": conv['telegram_message_id'],
                "sender_user_id": conv['sender_user_id'],
                "sender_name": conv['sender_name'],
                "sender_username": conv['sender_username'],
                "type": conv['msg_type'],
                "original_text": conv['original_text'],
                "translated_text": conv['translated_text'],
                "source_language": conv['msg_source_lang'],
                "target_language": conv['msg_target_lang'],
                "created_at": conv['msg_created_at'],
                "edited_at": conv['msg_edited_at'],
                "is_outgoing": conv['msg_is_outgoing'] or False,
                "media_file_name": conv['media_file_name'],
            }

        result.append({
            "id": conv['id'],
            "telegram_account_id": conv['telegram_account_id'],
            "telegram_peer_id": conv['telegram_peer_id'],
            "title": conv['title'],
            "type": conv['type'],
            "is_archived": conv['is_archived'],
            "created_at": conv['created_at'],
            "last_message_at": conv['msg_created_at'] or conv['created_at'],
            "last_message": last_message,
            "unread_count": conv['unread_count_db'] or 0,
            "is_muted": conv.get('is_muted', False),
            "is_hidden": conv.get('is_hidden', False),
        })

    return result


@router.get("/accounts/{account_id}/search-users", response_model=List[UserSearchResult])
async def search_users(
    account_id: int,
    username: str,
    current_user = Depends(get_current_user),
):
    """Search for Telegram users by username"""
    account = await db.fetchrow(
        "SELECT * FROM telegram_accounts WHERE id = $1 AND user_id = $2",
        account_id,
        current_user.user_id,
    )

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )

    # Check if session is connected
    session = await telethon_service.get_session(account_id)
    if not session or not session.is_connected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account not connected",
        )

    try:
        users = await telethon_service.search_users(account_id, username, limit=10)
        return users
    except Exception as e:
        logger.error(f"Error searching users: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to search users: {str(e)}",
        )


@router.post("/accounts/{account_id}/conversations", response_model=ConversationResponse)
async def create_conversation(
    account_id: int,
    conversation_data: ConversationCreate,
    current_user = Depends(get_current_user),
):
    """Create a new conversation with a Telegram user"""
    account = await db.fetchrow(
        "SELECT * FROM telegram_accounts WHERE id = $1 AND user_id = $2",
        account_id,
        current_user.user_id,
    )

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )

    # Check if conversation already exists
    existing = await db.fetchrow(
        "SELECT * FROM conversations WHERE telegram_account_id = $1 AND telegram_peer_id = $2",
        account_id,
        conversation_data.telegram_peer_id,
    )

    if existing:
        # Return existing conversation
        return {
            "id": existing['id'],
            "telegram_account_id": existing['telegram_account_id'],
            "telegram_peer_id": existing['telegram_peer_id'],
            "title": existing['title'],
            "type": existing['type'],
            "is_archived": existing['is_archived'],
            "created_at": existing['created_at'],
            "last_message_at": existing.get('last_message_at'),
            "unread_count": 0,
            "is_hidden": existing.get('is_hidden', False),
            "is_muted": existing.get('is_muted', False),
        }

    # Create new conversation
    conversation_id = await db.fetchval(
        """
        INSERT INTO conversations (telegram_account_id, telegram_peer_id, title, type, is_hidden, is_muted)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        """,
        account_id,
        conversation_data.telegram_peer_id,
        conversation_data.title or conversation_data.username or "Unknown",
        conversation_data.type,
        conversation_data.is_hidden,
        False, # is_muted
    )

    conversation = await db.fetchrow(
        "SELECT * FROM conversations WHERE id = $1",
        conversation_id,
    )

    logger.info(f"New conversation created: {conversation_id} for account {account_id}")

    return {
        "id": conversation['id'],
        "telegram_account_id": conversation['telegram_account_id'],
        "telegram_peer_id": conversation['telegram_peer_id'],
        "title": conversation['title'],
        "type": conversation['type'],
        "is_archived": conversation['is_archived'],
        "created_at": conversation['created_at'],
        "last_message_at": conversation.get('last_message_at'),
        "unread_count": 0,
        "is_hidden": conversation.get('is_hidden', False),
        "is_muted": conversation.get('is_muted', False),
    }

@router.post("/conversations/{conversation_id}/join")
async def join_conversation(
    conversation_id: int,
    current_user = Depends(get_current_user),
):
    """Join the group/channel and unhide it"""
    # Get details
    conv = await db.fetchrow(
        "SELECT telegram_account_id, telegram_peer_id FROM conversations WHERE id = $1",
        conversation_id
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Try to join via Telethon
    try:
        await telethon_service.join_chat(conv['telegram_account_id'], conv['telegram_peer_id'])
    except Exception as e:
        # Some errors might be okay (e.g. already joined), but log it
        logger.warning(f"Joining chat error: {e}")
    
    # Unhide in database
    await db.execute(
        "UPDATE conversations SET is_hidden = false WHERE id = $1",
        conversation_id
    )

    # Fetch previous history (last 50 messages) in background to prevent timeout
    await telethon_service.fetch_and_save_history(conv['telegram_account_id'], conv['telegram_peer_id'], limit=50)

    # Insert a "You joined this group/channel" system message
    # Get conversation info to choose text
    conv_info = await db.fetchrow("SELECT type, title FROM conversations WHERE id = $1", conversation_id)
    join_text = f"You joined this {'channel' if conv_info['type'] == 'channel' else 'group'}"
    
    await db.execute(
        """
        INSERT INTO messages (
            conversation_id, sender_name, sender_username, type, original_text, translated_text, is_outgoing, is_read
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """,
        conversation_id,
        "System",
        "system",
        "system",
        join_text,
        join_text,
        False,
        True
    )

    return {"status": "success"}

@router.post("/conversations/{conversation_id}/unhide")
async def unhide_conversation(
    conversation_id: int,
    current_user = Depends(get_current_user),
):
    """Make a hidden conversation visible in the sidebar"""
    await db.execute(
        "UPDATE conversations SET is_hidden = false WHERE id = $1",
        conversation_id
    )
    return {"status": "success"}

@router.post("/conversations/{conversation_id}/toggle_mute")
async def toggle_mute(
    conversation_id: int,
    current_user = Depends(get_current_user),
):
    """Toggle the mute status of a conversation"""
    await db.execute(
        "UPDATE conversations SET is_muted = NOT is_muted WHERE id = $1",
        conversation_id
    )
    new_status = await db.fetchval("SELECT is_muted FROM conversations WHERE id = $1", conversation_id)
    return {"status": "success", "is_muted": new_status}


@router.post("/conversations/{conversation_id}/leave")
async def leave_conversation(
    conversation_id: int,
    current_user = Depends(get_current_user),
):
    """Leave a group/channel and hide conversation"""
    conv = await db.fetchrow(
        """SELECT c.telegram_account_id, c.telegram_peer_id FROM conversations c
           JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
           WHERE c.id = $1 AND ta.user_id = $2""",
        conversation_id, current_user.user_id
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    try:
        await telethon_service.leave_chat(conv['telegram_account_id'], conv['telegram_peer_id'])
    except Exception as e:
        logger.warning(f"Leave chat error (may already have left): {e}")
    
    await db.execute(
        "UPDATE conversations SET is_hidden = true WHERE id = $1",
        conversation_id
    )

    # Notify via WebSocket so it's removed from admin side too
    await manager.send_to_account(
        {
            "type": "conversation_deleted",
            "conversation_id": conversation_id
        },
        conv['telegram_account_id'],
        current_user.user_id,
    )

    return {"status": "success"}


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: int,
    current_user = Depends(get_current_user),
):
    """Hard delete a conversation and its messages from DB and Telegram"""
    conv = await db.fetchrow(
        """SELECT c.id, c.telegram_account_id, c.telegram_peer_id FROM conversations c
           JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
           WHERE c.id = $1 AND ta.user_id = $2""",
        conversation_id, current_user.user_id
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Delete from Telegram side too
    try:
        await telethon_service.delete_dialog(conv['telegram_account_id'], conv['telegram_peer_id'])
    except Exception as e:
        logger.error(f"Failed to delete Telegram dialog: {e}")

    # Delete messages first (FW constraint)
    await db.execute("DELETE FROM messages WHERE conversation_id = $1", conversation_id)
    
    # Delete conversation
    await db.execute("DELETE FROM conversations WHERE id = $1", conversation_id)
    
    # Notify via WebSocket
    await manager.send_to_account(
        {
            "type": "conversation_deleted",
            "conversation_id": conversation_id
        },
        conv['telegram_account_id'],
        current_user.user_id,
    )

    return {"status": "success", "message": "Conversation and messages deleted permanently"}


@router.get("/accounts/{account_id}/profile")
async def get_profile(
    account_id: int,
    current_user = Depends(get_current_user),
):
    """Get Telegram profile info for an account"""
    account = await db.fetchrow(
        "SELECT * FROM telegram_accounts WHERE id = $1 AND user_id = $2",
        account_id, current_user.user_id
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    session = await telethon_service.get_session(account_id)
    if not session or not session.is_connected:
        raise HTTPException(status_code=400, detail="Account not connected")
    
    try:
        profile = await telethon_service.get_profile(account_id)
        return profile
    except Exception as e:
        logger.error(f"Failed to get profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/accounts/{account_id}/profile")
async def update_profile(
    account_id: int,
    data: dict,
    current_user = Depends(get_current_user),
):
    """Update Telegram profile name/bio"""
    account = await db.fetchrow(
        "SELECT * FROM telegram_accounts WHERE id = $1 AND user_id = $2",
        account_id, current_user.user_id
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    try:
        result = await telethon_service.update_profile(
            account_id,
            first_name=data.get('first_name'),
            last_name=data.get('last_name'),
            bio=data.get('bio')
        )
        return result
    except Exception as e:
        logger.error(f"Failed to update profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/accounts/{account_id}/profile/photo")
async def upload_profile_photo(
    account_id: int,
    photo: UploadFile = File(...),
    current_user = Depends(get_current_user),
):
    """Upload a new profile photo"""
    account = await db.fetchrow(
        "SELECT * FROM telegram_accounts WHERE id = $1 AND user_id = $2",
        account_id, current_user.user_id
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    try:
        file_bytes = await photo.read()
        result = await telethon_service.upload_profile_photo(account_id, file_bytes, photo.filename or "photo.jpg")
        return result
    except Exception as e:
        logger.error(f"Failed to upload profile photo: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/accounts/{account_id}/profile/privacy")
async def set_phone_privacy(
    account_id: int,
    data: dict,
    current_user = Depends(get_current_user),
):
    """Set phone number privacy (everybody/contacts/nobody)"""
    account = await db.fetchrow(
        "SELECT * FROM telegram_accounts WHERE id = $1 AND user_id = $2",
        account_id, current_user.user_id
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    visibility = data.get('visibility', 'contacts')
    if visibility not in ('everybody', 'contacts', 'nobody'):
        raise HTTPException(status_code=400, detail="visibility must be everybody, contacts, or nobody")
    
    try:
        result = await telethon_service.set_phone_privacy(account_id, visibility)
        return result
    except Exception as e:
        logger.error(f"Failed to set phone privacy: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/accounts/{account_id}/sessions")
async def get_sessions(
    account_id: int,
    current_user = Depends(get_current_user),
):
    """Get all active Telegram sessions (devices)"""
    account = await db.fetchrow(
        "SELECT * FROM telegram_accounts WHERE id = $1 AND user_id = $2",
        account_id, current_user.user_id
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    session = await telethon_service.get_session(account_id)
    if not session or not session.is_connected:
        raise HTTPException(status_code=400, detail="Account not connected")
    
    try:
        sessions = await telethon_service.get_sessions(account_id)
        return sessions
    except Exception as e:
        logger.error(f"Failed to get sessions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/accounts/{account_id}/sessions/{session_hash}")
async def terminate_session(
    account_id: int,
    session_hash: str,
    current_user = Depends(get_current_user),
):
    """Terminate a specific Telegram session"""
    account = await db.fetchrow(
        "SELECT * FROM telegram_accounts WHERE id = $1 AND user_id = $2",
        account_id, current_user.user_id
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    try:
        result = await telethon_service.terminate_session(account_id, int(session_hash))
        return result
    except Exception as e:
        logger.error(f"Failed to terminate session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/accounts/{account_id}/2fa")
async def change_2fa(
    account_id: int,
    data: dict,
    current_user = Depends(get_current_user),
):
    """Change the Telegram 2FA cloud password"""
    account = await db.fetchrow(
        "SELECT * FROM telegram_accounts WHERE id = $1 AND user_id = $2",
        account_id, current_user.user_id
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')
    
    if not new_password:
        raise HTTPException(status_code=400, detail="New password is required")
    
    try:
        result = await telethon_service.change_2fa(account_id, current_password, new_password)
        return result
    except Exception as e:
        logger.error(f"Failed to change 2FA: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/accounts/{account_id}/peers/{peer_id}/photo")
async def get_peer_photo(
    account_id: int,
    peer_id: int,
    current_user = Depends(get_current_user),
):
    """Get profile photo for a specific peer"""
    account = await db.fetchrow(
        "SELECT * FROM telegram_accounts WHERE id = $1 AND user_id = $2",
        account_id, current_user.user_id
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    try:
        photo_url = await telethon_service.get_peer_photo(account_id, peer_id)
        return {"photo_url": photo_url}
    except Exception as e:
        logger.error(f"Failed to get peer photo: {e}")
        raise HTTPException(status_code=400, detail=str(e))

