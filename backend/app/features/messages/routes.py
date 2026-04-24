from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from typing import List, Optional, Any
from datetime import datetime
from app.core.database import db
from app.core.security import get_current_user
from app.core.encryption import encrypt_message_if_enabled, decrypt_message_if_encrypted
from models import MessageResponse, MessageSend, MessageReact
from telethon_service import telethon_service
from translation_service import translation_service
from sales_service import sales_service
from websocket_manager import manager
import logging
import os
import aiofiles
import json


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/messages", tags=["messages"])


# Mark all incoming messages in a conversation as read
@router.post("/conversations/{conversation_id}/read")
async def mark_as_read(
    conversation_id: int,
    current_user = Depends(get_current_user),
):
    conversation = await db.fetchrow(
        """
        SELECT c.*, ta.user_id FROM conversations c
        JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
        WHERE c.id = $1
        """,
        conversation_id,
    )

    if not conversation or conversation['user_id'] != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    await db.execute(
        "UPDATE messages SET is_read = true WHERE conversation_id = $1 AND is_outgoing = false",
        conversation_id,
    )

    return {"message": "Messages marked as read"}


# --- PHASE 1: INCREMENTAL PAGINATION (BACKEND) ---
# This slices the message history into small pieces (e.g., 30 at a time) to keep the app fast.
# Fetch a paginated list of messages for a specific conversation, deciphering if necessary
@router.get("/conversations/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    conversation_id: int,
    limit: int = 30,
    before_id: int = None,
    current_user = Depends(get_current_user),
):
    conversation = await db.fetchrow(
        """
        SELECT c.*, ta.user_id FROM conversations c
        JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
        WHERE c.id = $1
        """,
        conversation_id,
    )

    if not conversation or conversation['user_id'] != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    if before_id:
        messages = await db.fetch(
            """
            SELECT * FROM messages
            WHERE conversation_id = $1 AND id < $2
            ORDER BY created_at DESC
            LIMIT $3
            """,
            conversation_id,
            before_id,
            limit,
        )
    else:
        messages = await db.fetch(
            """
            SELECT * FROM messages
            WHERE conversation_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            conversation_id,
            limit,
        )

    result = []
    for msg in messages:
        # Ensure created_at is not None - use current time if it's None
        created_at = msg['created_at'] if msg['created_at'] is not None else datetime.now()
        
        # Decrypt message if encrypted
        is_encrypted = msg['is_encrypted']
        original_text, translated_text = await decrypt_message_if_encrypted(
            is_encrypted, msg['original_text'], msg['translated_text']
        )
        
        result.append({
            "id": msg['id'],
            "conversation_id": msg['conversation_id'],
            "telegram_message_id": msg['telegram_message_id'],
            "sender_user_id": msg['sender_user_id'],
            "sender_name": msg['sender_name'],
            "sender_username": msg['sender_username'],
            "type": msg['type'],
            "original_text": original_text,
            "translated_text": translated_text,
            "source_language": msg['source_language'],
            "target_language": msg['target_language'],
            "created_at": created_at,
            "edited_at": msg['edited_at'],
            "is_outgoing": msg['is_outgoing'],
            "media_file_name": msg['media_file_name'],
            "reply_to_telegram_id": msg['reply_to_telegram_id'],
            "reply_to_text": msg['reply_to_text'],
            "reply_to_sender": msg['reply_to_sender'],
            "is_read": msg['is_read'],
            "reactions": json.loads(msg['reactions']) if msg['reactions'] else {},
        })

    return result


# --- GLOBAL MESSAGE SEARCH ---
# Search for specific text across ALL messages belonging to the user's accounts
@router.get("/search", response_model=List[dict])
async def search_messages_global(
    query: str = Query(...),
    limit: int = 50,
    current_user = Depends(get_current_user),
):
    if not query.strip():
        return []

    # 1. Fetch recent messages for the user's accounts
    # Since messages are encrypted, we can't search via SQL ILIKE.
    # We fetch a reasonable batch and filter in Python.
    results = await db.fetch(
        """
        SELECT m.*, c.title as conversation_title, c.type as conversation_type, c.telegram_account_id
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
        WHERE ta.user_id = $1 
        ORDER BY m.created_at DESC
        LIMIT 1000
        """,
        current_user.user_id,
    )

    formatted = []
    query_lower = query.lower()
    
    for row in results:
        # Decrypt if necessary
        original_text, translated_text = await decrypt_message_if_encrypted(
            row['is_encrypted'], row['original_text'], row['translated_text']
        )
        
        # Check if query matches in either text
        orig_match = original_text and query_lower in original_text.lower()
        trans_match = translated_text and query_lower in translated_text.lower()
        
        if orig_match or trans_match:
            formatted.append({
                "id": row['id'],
                "conversation_id": row['conversation_id'],
                "telegram_message_id": row['telegram_message_id'],
                "sender_name": row['sender_name'],
                "sender_username": row['sender_username'],
                "text": translated_text or original_text,
                "created_at": row['created_at'],
                "is_outgoing": row['is_outgoing'],
                "conversation_title": row['conversation_title'],
                "conversation_type": row['conversation_type'],
                "telegram_account_id": row['telegram_account_id']
            })
            
            # Stop if we hit the limit
            if len(formatted) >= limit:
                break

    return formatted


# Translate and send a new text message to a designated conversation
@router.post("/send", response_model=MessageResponse)
async def send_message(
    message_data: MessageSend,
    current_user = Depends(get_current_user),
):
    conversation = await db.fetchrow(
        """
        SELECT c.*, ta.user_id, ta.target_language, ta.source_language
        FROM conversations c
        JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
        WHERE c.id = $1
        """,
        message_data.conversation_id,
    )

    if not conversation or conversation['user_id'] != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    # Apply global brand replacements to the text FIRST
    original_text = await sales_service.apply_branded_labels(message_data.text, current_user.user_id)
    translated_text = original_text
    
    if message_data.translate:
        # Translate the already-branded text
        translated_text = await sales_service.translate_with_protection(
            original_text,
            conversation['source_language'] if conversation['source_language'] != 'auto' else 'en',
            current_user.user_id
        )

    try:
        # Check if this is a Secret Chat
        if conversation['type'] == 'secret':
            sent_message = await telethon_service.sessions[conversation['telegram_account_id']].send_secret_message(
                conversation['telegram_peer_id'],
                translated_text
            )
        else:
            sent_message = await telethon_service.send_message(
                conversation['telegram_account_id'],
                conversation['telegram_peer_id'],
                translated_text,
                reply_to=message_data.reply_to_message_id
            )

        # Encrypt message if encryption is enabled (Standard database encryption, non-E2EE)
        processed_original, processed_translated, is_encrypted = await encrypt_message_if_enabled(
            db, original_text, translated_text
        )

        message_id = await db.fetchval(
            """
            INSERT INTO messages
            (conversation_id, telegram_message_id, sender_user_id, sender_name, sender_username, type, original_text, translated_text,
             source_language, target_language, created_at, is_encrypted, is_outgoing,
             reply_to_telegram_id, reply_to_text, reply_to_sender)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING id
            """,
            message_data.conversation_id,
            sent_message['message_id'],
            sent_message['sender_user_id'],
            sent_message['sender_name'],
            sent_message.get('sender_username') or 'User',
            'text',
            processed_original,
            processed_translated,
            conversation['target_language'],
            conversation['source_language'],
            sent_message['date'],
            is_encrypted,
            True,
            message_data.reply_to_message_id,
            None, # We'll populate this later if needed, or just leave it for outgoing
            None
        )

        await db.execute(
            "UPDATE conversations SET last_message_at = $1 WHERE id = $2",
            sent_message['date'],
            message_data.conversation_id,
        )

        message_response = {
            "id": message_id,
            "conversation_id": message_data.conversation_id,
            "telegram_message_id": sent_message['message_id'],
            "sender_user_id": sent_message['sender_user_id'],
            "sender_name": sent_message['sender_name'],
            "sender_username": sent_message.get('sender_username') or 'User',
            "peer_title": conversation['title'],
            "type": "text",
            "original_text": original_text,
            "translated_text": translated_text,
            "source_language": conversation['target_language'],
            "target_language": conversation['source_language'],
            "created_at": sent_message['date'].isoformat() if sent_message['date'] else None,
            "edited_at": None,
            "is_outgoing": True,
            "is_read": False,
            "reply_to_telegram_id": message_data.reply_to_message_id,
            "reply_to_text": None,
            "reply_to_sender": None,
        }

        await manager.send_to_account(
            {
                "type": "new_message",
                "message": message_response,
            },
            conversation['telegram_account_id'],
            current_user.user_id,
        )

        return message_response

    except Exception as e:
        logger.error(f"Error sending message: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send message: {str(e)}",
        )


# Manually translate passing text between specified languages
@router.post("/translate")
async def translate_message(
    text: str,
    target_language: str,
    source_language: str = "auto",
    current_user = Depends(get_current_user),
):
    translation = await translation_service.translate_text(
        text,
        target_language,
        source_language,
    )

    return translation


# Upload and send a media file with an optional translated caption
@router.post("/send-media")
async def send_media(
    conversation_id: int = Form(...),
    file: UploadFile = File(...),
    caption: str = Form(""),
    current_user = Depends(get_current_user),
):
    """Send a media file (photo, video, document) to a conversation"""
    conversation = await db.fetchrow(
        """
        SELECT c.*, ta.user_id, ta.target_language, ta.source_language
        FROM conversations c
        JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
        WHERE c.id = $1
        """,
        conversation_id,
    )

    if not conversation or conversation['user_id'] != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    try:
        # Translate caption if provided
        original_caption = caption
        translated_caption = caption
        source_lang = None
        
        if caption:
            dest_lang = conversation['source_language']
            if dest_lang == 'auto':
                dest_lang = 'en'
                
            translated_caption = await sales_service.translate_with_protection(
                caption,
                dest_lang,
                current_user.user_id
            )
            # source_lang is actually what dest_lang is (the target)
            source_lang = dest_lang
        
        # Create uploads directory if it doesn't exist
        os.makedirs("temp/uploads", exist_ok=True)
        
        # Save uploaded file temporarily
        file_path = f"temp/uploads/{file.filename}"
        async with aiofiles.open(file_path, 'wb') as out_file:
            content = await file.read()
            await out_file.write(content)
        
        # Send media via Telethon with translated caption
        sent_message = await telethon_service.send_media(
            conversation['telegram_account_id'],
            conversation['telegram_peer_id'],
            file_path,
            translated_caption
        )
        
        # Encrypt caption if encryption is enabled
        processed_original, processed_translated, is_encrypted = await encrypt_message_if_enabled(
            db, original_caption, translated_caption
        )
        
        # Save message to database with both original and translated caption
        message_id = await db.fetchval(
            """
            INSERT INTO messages
            (conversation_id, telegram_message_id, sender_user_id, sender_name, sender_username, type,
             original_text, translated_text, source_language, target_language, created_at, is_outgoing, media_file_name, is_encrypted)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id
            """,
            conversation_id,
            sent_message['message_id'],
            sent_message['sender_user_id'],
            sent_message['sender_name'],
            sent_message.get('sender_username') or 'User',
            sent_message['type'],
            processed_original,
            processed_translated,
            source_lang,
            conversation['source_language'],
            sent_message['date'],
            True,
            file.filename,
            is_encrypted
        )
        
        await db.execute(
            "UPDATE conversations SET last_message_at = $1 WHERE id = $2",
            sent_message['date'],
            conversation_id,
        )
        
        # Clean up temp file
        os.remove(file_path)
        
        message_response = {
            "id": message_id,
            "conversation_id": conversation_id,
            "telegram_message_id": sent_message['message_id'],
            "sender_user_id": sent_message['sender_user_id'],
            "sender_name": sent_message['sender_name'],
            "sender_username": sent_message.get('sender_username') or 'User',
            "type": sent_message['type'],
            "original_text": original_caption,
            "translated_text": translated_caption,
            "source_language": source_lang,
            "target_language": conversation['source_language'],
            "created_at": sent_message['date'].isoformat() if sent_message['date'] else None,
            "is_outgoing": True,
            "is_read": False,
            "media_file_name": file.filename,
        }
        
        await manager.send_to_account(
            {
                "type": "new_message",
                "message": message_response,
            },
            conversation['telegram_account_id'],
            current_user.user_id,
        )
        
        return message_response
        
    except Exception as e:
        logger.error(f"Error sending media: {e}")
        # Clean up temp file if it exists
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send media: {str(e)}",
        )


# Retrieve cached media or download it on-demand from a specific message
@router.get("/download-media/{conversation_id}/{message_id}")
async def download_media(
    conversation_id: int,
    message_id: int,
    telegram_message_id: Optional[str] = Query(None),
    media_file: Optional[str] = Query(None),
    current_user = Depends(get_current_user),
):
    # Parse telegram_message_id safely
    tg_msg_id = None
    if telegram_message_id and telegram_message_id != "undefined":
        try:
            tg_msg_id = int(telegram_message_id)
        except ValueError:
            pass

    # Get message with filename
    message = await db.fetchrow(
        """
        SELECT m.*, c.telegram_account_id, c.telegram_peer_id
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
        WHERE m.id = $1 AND c.id = $2 AND ta.user_id = $3
        """,
        message_id,
        conversation_id,
        current_user.user_id,
    )

    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )

    try:
        # 1. Handle local files (Bot auto-replies or product images)
        # Use override if provided, else use stored filename
        local_filename = media_file or message.get('media_file_name')
        
        # If it's a JSON array (album), and no override, take the first one
        if local_filename and local_filename.startswith('['):
            try:
                paths = json.loads(local_filename)
                if paths:
                    local_filename = paths[0]
            except:
                pass
                
        if local_filename and (local_filename.startswith('/media/') or local_filename.startswith('media/')):
            local_rel_path = local_filename.lstrip('/')
            abs_path = os.path.join(os.getcwd(), 'backend', local_rel_path)
            if not os.path.exists(abs_path):
                abs_path = os.path.join(os.getcwd(), local_rel_path)
            
            if os.path.exists(abs_path):
                logger.info(f"Serving local media file: {abs_path}")
                return FileResponse(
                    path=abs_path,
                    filename=os.path.basename(abs_path),
                    media_type='application/octet-stream'
                )

        # 2. Download via Telegram (Existing behavior)
        if not tg_msg_id:
             raise HTTPException(status_code=400, detail="Telegram message ID required for non-local media")
        
        download_dir = f"temp/downloads/{conversation_id}"
        os.makedirs(download_dir, exist_ok=True)
        
        base_filename = str(tg_msg_id)
        download_path = os.path.join(download_dir, base_filename)
        
        existing_files = [f for f in os.listdir(download_dir) if f.startswith(base_filename)]
        
        if existing_files:
            cached_file = os.path.join(download_dir, existing_files[0])
            logger.info(f"Using cached media file: {cached_file}")
            file_path = cached_file
        else:
            logger.info(f"Downloading media for message {tg_msg_id}")
            file_path = await telethon_service.download_media(
                message['telegram_account_id'],
                tg_msg_id,
                message['telegram_peer_id'],
                download_path
            )
            
            if not file_path or not os.path.exists(file_path):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Media file not found",
                )
        
        filename = message.get('media_file_name') or os.path.basename(file_path)
        
        return FileResponse(
            path=file_path,
            filename=filename,
            media_type='application/octet-stream'
        )
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e).lower()
        # Check if media was deleted or doesn't exist
        if "has no media" in error_msg or "message not found" in error_msg:
            logger.warning(f"Media deleted or not found for message {telegram_message_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="Media has been deleted",
            )
        
        logger.error(f"Error downloading media: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to download media: {str(e)}",
        )


# Delete specified messages from the local database and optionally revoke them on Telegram
@router.delete("/delete")
async def delete_messages_endpoint(
    conversation_id: int,
    message_ids: List[int] = Query(None),
    message_ids_alt: List[int] = Query(None, alias="message_ids[]"),
    revoke: bool = True,
    current_user = Depends(get_current_user),
):
    """Delete specific messages from a conversation and Telegram"""
    ids_to_delete = message_ids or message_ids_alt
    if not ids_to_delete:
        raise HTTPException(status_code=400, detail="No message IDs provided")

    # Verify conversation ownership and get account/peer info
    conversation = await db.fetchrow(
        """
        SELECT c.*, ta.user_id 
        FROM conversations c
        JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
        WHERE c.id = $1 AND ta.user_id = $2
        """,
        conversation_id,
        current_user.user_id,
    )

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    # Map local IDs to Telegram message IDs
    messages = await db.fetch(
        f"""
        SELECT id, telegram_message_id FROM messages 
        WHERE id = ANY($1) AND conversation_id = $2
        """,
        ids_to_delete,
        conversation_id
    )

    if not messages:
        return {"message": "No messages found to delete"}

    tg_message_ids = [m['telegram_message_id'] for m in messages if m['telegram_message_id']]
    found_local_ids = [m['id'] for m in messages]

    # Delete from Telegram if they have TG IDs
    if tg_message_ids:
        try:
            success = await telethon_service.delete_messages(
                conversation['telegram_account_id'],
                conversation['telegram_peer_id'],
                tg_message_ids,
                revoke=revoke
            )
            if not success:
                logger.warning(f"Telethon reported failure deleting messages {tg_message_ids}")
        except Exception as e:
            logger.error(f"Failed to delete messages from Telegram: {e}")
            # We continue to delete from local DB anyway

    # Delete from local database
    await db.execute(
        f"DELETE FROM messages WHERE id = ANY($1)",
        found_local_ids
    )

    # Notify frontend via WebSocket
    await manager.send_to_account(
        {
            "type": "messages_deleted",
            "conversation_id": conversation_id,
            "message_ids": found_local_ids
        },
        conversation['telegram_account_id'],
        current_user.user_id,
    )

    return {"message": f"Deleted {len(found_local_ids)} messages", "deleted_ids": found_local_ids}


# Forward selected messages natively to another target conversation
@router.post("/forward")
async def forward_messages(
    source_conversation_id: int = Form(...),
    target_conversation_id: int = Form(...),
    message_ids: str = Form(...),  # comma-separated local DB message IDs
    current_user = Depends(get_current_user),
):
    """Forward messages (text + media) to another conversation using Telethon native forward"""

    # Parse message IDs
    try:
        local_ids = [int(x.strip()) for x in message_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid message_ids format")

    if not local_ids:
        raise HTTPException(status_code=400, detail="No message IDs provided")

    # Verify source conversation
    source = await db.fetchrow(
        """
        SELECT c.*, ta.user_id, ta.target_language, ta.source_language
        FROM conversations c
        JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
        WHERE c.id = $1 AND ta.user_id = $2
        """,
        source_conversation_id,
        current_user.user_id,
    )
    if not source:
        raise HTTPException(status_code=404, detail="Source conversation not found")

    # Verify target conversation (must belong to same account)
    target = await db.fetchrow(
        """
        SELECT c.*, ta.user_id, ta.target_language, ta.source_language
        FROM conversations c
        JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
        WHERE c.id = $1 AND ta.user_id = $2 AND c.telegram_account_id = $3
        """,
        target_conversation_id,
        current_user.user_id,
        source['telegram_account_id'],
    )
    if not target:
        raise HTTPException(status_code=404, detail="Target conversation not found or belongs to different account")

    # Get the Telegram message IDs for these local DB IDs
    db_messages = await db.fetch(
        "SELECT id, telegram_message_id, type, original_text, translated_text, media_file_name FROM messages WHERE id = ANY($1) AND conversation_id = $2",
        local_ids,
        source_conversation_id,
    )
    if not db_messages:
        raise HTTPException(status_code=404, detail="Messages not found")

    tg_message_ids = [m['telegram_message_id'] for m in db_messages if m['telegram_message_id']]
    if not tg_message_ids:
        raise HTTPException(status_code=400, detail="Messages have no Telegram IDs to forward")

    try:
        forwarded = await telethon_service.forward_messages(
            source['telegram_account_id'],
            source['telegram_peer_id'],
            tg_message_ids,
            target['telegram_peer_id'],
        )
    except Exception as e:
        logger.error(f"Forward failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to forward: {str(e)}")

    # Save forwarded messages to DB and broadcast
    saved_messages = []
    now = datetime.utcnow()
    for fw, orig_db_msg in zip(forwarded, db_messages):
        # fw['text'] is what Telegram has (the translated/sent text).
        # We preserve the original language text from our DB and the translation from our DB.
        fwd_original = orig_db_msg['original_text'] or fw['text'] or ''
        fwd_translated = orig_db_msg['translated_text'] or orig_db_msg['original_text'] or fw['text'] or ''

        msg_id = await db.fetchval(
            """
            INSERT INTO messages
            (conversation_id, telegram_message_id, sender_user_id, sender_name, sender_username,
             type, original_text, translated_text, created_at, is_outgoing, media_file_name)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id
            """,
            target_conversation_id,
            fw['message_id'],
            fw['sender_user_id'],
            fw['sender_name'],
            fw.get('sender_username') or 'User',
            fw['type'],
            fwd_original,
            fwd_translated,
            fw['date'] or now,
            True,
            orig_db_msg['media_file_name'],
        )

        msg_response = {
            "id": msg_id,
            "conversation_id": target_conversation_id,
            "telegram_message_id": fw['message_id'],
            "sender_user_id": fw['sender_user_id'],
            "sender_name": fw['sender_name'],
            "sender_username": fw.get('sender_username') or 'User',
            "type": fw['type'],
            "original_text": fwd_original,
            "translated_text": fwd_translated,
            "created_at": (fw['date'] or now).isoformat() if fw.get('date') else now.isoformat(),
            "is_outgoing": True,
            "media_file_name": orig_db_msg['media_file_name'],
        }
        saved_messages.append(msg_response)

        # Broadcast so it appears in the target chat instantly
        await manager.send_to_account(
            {"type": "new_message", "message": msg_response},
            source['telegram_account_id'],
            current_user.user_id,
        )

    await db.execute(
        "UPDATE conversations SET last_message_at = NOW() WHERE id = $1",
        target_conversation_id,
    )

    return {"forwarded": len(saved_messages), "messages": saved_messages}


# Send an emoji reaction directly to a specific message
@router.post("/{message_id}/react")
async def react_to_message(
    message_id: int,
    reaction_data: MessageReact,
    current_user = Depends(get_current_user),
):
    # 1. Fetch message from DB
    message = await db.fetchrow(
        """
        SELECT m.*, c.telegram_account_id, c.telegram_peer_id 
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE m.id = $1
        """,
        message_id,
    )
    
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
        
    try:
        # 2. Call telethon_service
        logger.info(f"Sending reaction: account={message['telegram_account_id']}, peer={message['telegram_peer_id']}, msg_id={message['telegram_message_id']}, emoji={reaction_data.emoji}")
        await telethon_service.send_reaction(
            account_id=message['telegram_account_id'],
            peer_id=message['telegram_peer_id'],
            message_id=message['telegram_message_id'],
            emoji=reaction_data.emoji
        )
        
        # 3. Update local DB reactions
        # We'll just store/update the reaction from the current user
        # For simplicity, we'll store it as a counts dict
        current_reactions = json.loads(message['reactions']) if message['reactions'] else {}
        
        # Incremental logic: if we just reacted with this emoji, increment it
        # (This is a bit simplified, but gives immediate feedback)
        current_reactions[reaction_data.emoji] = current_reactions.get(reaction_data.emoji, 0) + 1
        
        await db.execute(
            "UPDATE messages SET reactions = $1 WHERE id = $2",
            json.dumps(current_reactions),
            message_id
        )
        
        # 4. Broadcast via WebSocket
        await manager.send_to_account(
            {
                "type": "message_reaction",
                "message_id": message_id,
                "reactions": current_reactions
            },
            message['telegram_account_id'],
            current_user.user_id,
        )
        
        return {"reactions": current_reactions}
        
    except Exception as e:
        logger.error(f"Error reacting to message: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to react: {str(e)}",
        )

@router.post("/secret/start")
async def start_secret_chat(
    account_id: int,
    peer_id: int,
    current_user = Depends(get_current_user),
):
    """Initiate a secret chat handshake with a peer"""
    # Verify account ownership
    account = await db.fetchrow(
        "SELECT id, user_id FROM telegram_accounts WHERE id = $1 AND user_id = $2",
        account_id, current_user.user_id
    )
    if not account:
        raise HTTPException(status_code=404, detail="Telegram account not found")

    try:
        # Check for active session
        session = await telethon_service.get_session(account_id)
        if not session:
            raise HTTPException(status_code=400, detail="Telegram account is not connected")

        # Initiate handshake — this creates the conversation in DB and returns its info
        result = await session.initiate_secret_chat(peer_id)

        # Fetch the newly created conversation row so we can broadcast it
        conv = await db.fetchrow(
            """
            SELECT c.id, c.telegram_peer_id, c.title, c.type, c.username, c.is_muted
            FROM conversations c
            WHERE c.telegram_account_id = $1 AND c.type = 'secret' AND c.telegram_peer_id = $2
            """,
            account_id, result.get("secret_chat_id", peer_id)
        )

        if conv:
            from websocket_manager import manager
            await manager.send_personal_message(
                {
                    "type": "new_conversation",
                    "conversation": {
                        "id": conv["id"],
                        "telegram_peer_id": conv["telegram_peer_id"],
                        "title": conv["title"],
                        "type": conv["type"],
                        "username": conv["username"],
                        "is_muted": conv["is_muted"] or False,
                        "unreadCount": 0,
                        "lastMessage": None,
                    },
                },
                current_user.user_id,
            )

        return result
    except Exception as e:
        logger.error(f"Failed to start secret chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))
