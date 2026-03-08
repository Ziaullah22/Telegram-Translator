from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Query, Request
import asyncio
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from datetime import datetime
import logging
import traceback
from app.core.config import settings
from app.core.encryption import initialize_encryption_service, encrypt_message_if_enabled
from database import db
from telethon_service import telethon_service
from websocket_manager import manager
from translation_service import translation_service
from scheduler_service import scheduler_service
from app.features.auth.routes import router as auth_router
from app.features.telegram.routes import router as telegram_router
from app.features.messages.routes import router as messages_router
from app.features.translation.routes import router as translation_router
from app.features.templates.routes import router as templates_router
from app.features.scheduled.routes import router as scheduled_router
from app.features.contacts.routes import router as contacts_router
from app.features.auto_responder.routes import router as auto_responder_router
from app.features.admin.routes import router as admin_router
from app.features.analytics.routes import router as analytics_router
from auth import get_current_user
from jose import jwt, JWTError
from auto_responder_service import auto_responder_service
from app.core.admin_security import ADMIN_SECRET_KEY, ADMIN_ALGORITHM

# ---------------------------------------------------------
# APPLICATION ENTRY POINT (main.py)
# ---------------------------------------------------------
# This file initializes the FastAPI application, sets up middleware, 
# registers all individual feature routers, and manages the main 
# application lifecycle (lifespan). It also handles the primary 
# WebSocket connection for real-time message broadcasting.

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    APP LIFESPAN MANAGEMENT
    Handles startup and shutdown events for the entire backend.
    Includes database connectivity, migrations, and service initialization.
    """

    logger.info("Starting application...")

    await db.connect()
    logger.info("Database connected")

    # Run migration for reply support
    try:
        await db.execute("""
        ALTER TABLE messages
          ADD COLUMN IF NOT EXISTS reply_to_telegram_id BIGINT,
          ADD COLUMN IF NOT EXISTS reply_to_text TEXT,
          ADD COLUMN IF NOT EXISTS reply_to_sender TEXT,
          ADD COLUMN IF NOT EXISTS media_thumbnail TEXT,
          ADD COLUMN IF NOT EXISTS media_duration INTEGER;
        """)
        logger.info("Database migration (reply support, thumbnails & duration) completed")
    except Exception as e:
        logger.error(f"Migration error: {e}")
    
    # Initialize encryption service
    if settings.aes_encryption_key:
        initialize_encryption_service(settings.aes_encryption_key)
        logger.info("Encryption service initialized")
    else:
        logger.warning("AES encryption key not configured - encryption features disabled")

    async def handle_new_message(message_data: dict):
        """
        CORE MESSAGE PROCESSOR
        Executed every time the Telethon service detects a new Telegram message.
        1. Identifies the user and target language.
        2. Performs language detection and translation.
        3. Encrypts and persists the message to the database.
        4. Broadcasts the update via WebSocket for real-time UI refresh.
        """
        try:
            account_id = message_data['account_id']
            peer_id = message_data['peer_id']

            account = await db.fetchrow(
                "SELECT user_id, target_language, source_language FROM telegram_accounts WHERE id = $1",
                account_id
            )


            if not account:
                return

            conversation = await db.fetchrow(
                "SELECT id FROM conversations WHERE telegram_account_id = $1 AND telegram_peer_id = $2",
                account_id,
                peer_id
            )

            if not conversation:
                peer_title = message_data.get('peer_title', 'Unknown')
                peer_username = message_data.get('sender_username') if message_data.get('conversation_type', 'private') == 'private' else None
                
                # Title Fallback: if name is phone number, use username if we have it
                if message_data.get('conversation_type', 'private') == 'private' and peer_username and (not peer_title or peer_title.strip().startswith('+')):
                    peer_title = f"@{peer_username}"

                conversation_id = await db.fetchval(
                    """
                    INSERT INTO conversations (telegram_account_id, telegram_peer_id, title, type, username)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id
                    """,
                    account_id,
                    peer_id,
                    peer_title,
                    message_data.get('conversation_type', 'private'),
                    peer_username
                )
            else:
                conversation_id = conversation['id']

            # Check if message already exists to avoid duplication
            existing_message = await db.fetchrow(
                "SELECT id FROM messages WHERE conversation_id = $1 AND telegram_message_id = $2",
                conversation_id,
                message_data['message_id']
            )
            if existing_message:
                logger.info(f"Message {message_data['message_id']} already exists, skipping")
                return

            # Ensure we have a valid datetime for created_at
            created_at = message_data['date'] if message_data['date'] is not None else datetime.now()
            
            msg_type = message_data.get('type', 'text')
            text = message_data.get('text', '')
            
            # Translation Logic:
            # We want to show the message in the user's 'target_language' (translated) 
            # and the 'source_language' (original).
            
            translated_text = text
            source_lang = account['source_language']
            
            if text:
                try:
                    # Detect language first to see if it's already in the target language
                    detected = translation_service.detect_language(text)
                    
                    target_lang = account['target_language']
                    logger.info(f"Processing message: detected={detected}, target={target_lang}, account_src={account['source_language']}")
                    
                    if detected == target_lang:
                        logger.info("Message already in target language, back-translating to original")
                        back_translation = await translation_service.translate_text(
                            text,
                            account['source_language'],
                            account['target_language']
                        )
                        processed_original = back_translation['translated_text']
                        processed_translated = text
                        source_lang = account['source_language']
                    else:
                        logger.info(f"Translating message to {target_lang}")
                        translation = await translation_service.translate_text(
                            text,
                            target_lang,
                            'auto'
                        )
                        processed_original = text
                        processed_translated = translation['translated_text']
                        source_lang = translation['source_language']
                        logger.info(f"Translation result: {processed_translated[:50]}...")
                except Exception as e:
                    logger.error(f"Translation error in handle_new_message: {e}")
                    processed_original = text
                    processed_translated = text
            else:
                processed_original = text
                processed_translated = text

            # Encrypt message if encryption is enabled
            processed_original, processed_translated, is_encrypted = await encrypt_message_if_enabled(
                db, processed_original, processed_translated
            )
            
            # Handle reply information if present
            reply_to_tg_id = message_data.get('reply_to_msg_id')
            reply_to_text = None
            reply_to_sender = None
            
            if reply_to_tg_id:
                # Try to find the message being replied to in our database to get its text/sender
                replied_msg = await db.fetchrow(
                    "SELECT original_text, translated_text, sender_name FROM messages WHERE conversation_id = $1 AND telegram_message_id = $2",
                    conversation_id,
                    reply_to_tg_id
                )
                if replied_msg:
                    reply_to_text = replied_msg['translated_text'] or replied_msg['original_text']
                    reply_to_sender = replied_msg['sender_name']

            message_id = await db.fetchval(
                """
                INSERT INTO messages
                (conversation_id, telegram_message_id, sender_user_id, sender_name, sender_username, type, original_text, translated_text,
                 source_language, target_language, created_at, is_encrypted, is_outgoing, media_file_name,
                 reply_to_telegram_id, reply_to_text, reply_to_sender, media_thumbnail, media_duration)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                RETURNING id
                """,
                conversation_id,
                message_data['message_id'],
                message_data.get('sender_id'),
                message_data.get('sender_name', 'Unknown'),
                message_data.get('sender_username') or 'User',
                msg_type,
                processed_original,
                processed_translated,
                source_lang,
                account['target_language'],
                created_at,
                is_encrypted,
                message_data.get('is_outgoing', False),
                message_data.get('media_filename'),
                reply_to_tg_id,
                reply_to_text,
                reply_to_sender,
                message_data.get('media_thumbnail'),
                message_data.get('media_duration')
            )

            await db.execute(
                "UPDATE conversations SET last_message_at = $1 WHERE id = $2",
                created_at,
                conversation_id
            )

            message_response = {
                "id": message_id,
                "conversation_id": conversation_id,
                "telegram_message_id": message_data['message_id'],
                "sender_user_id": message_data['sender_id'],
                "sender_name": message_data.get('sender_name', 'Unknown'),
                "sender_username": message_data.get('sender_username'),
                "peer_title": message_data.get('peer_title', ''),
                "type": msg_type,
                "original_text": processed_original,
                "translated_text": processed_translated,
                "source_language": source_lang,
                "target_language": account['target_language'],
                "created_at": created_at.isoformat() if isinstance(created_at, datetime) else created_at,
                "edited_at": None,
                "is_outgoing": message_data.get('is_outgoing', False),
                "media_file_name": message_data.get('media_filename'),
                "reply_to_telegram_id": reply_to_tg_id,
                "reply_to_text": reply_to_text,
                "reply_to_sender": reply_to_sender,
                "media_thumbnail": message_data.get('media_thumbnail'),
                "media_duration": message_data.get('media_duration'),
            }

            await manager.send_to_account(
                {
                    "type": "new_message",
                    "account_id": account_id,
                    "message": message_response
                },
                account_id,
                account['user_id']
            )

            # Check for auto-responder matches
            await auto_responder_service.check_and_respond(
                message_data,
                account['user_id']
            )

        except Exception as e:
            logger.error(f"Error handling new message: {e}")
            logger.error(traceback.format_exc())

    telethon_service.add_message_handler(handle_new_message)
 
    async def handle_reaction(reaction_data: dict):
        try:
            account_id = reaction_data['account_id']
            peer_id = reaction_data['peer_id']
            tg_message_id = reaction_data['message_id']
            reactions = reaction_data['reactions']
            
            # Find local message_id
            message = await db.fetchrow(
                """
                SELECT m.id, ta.user_id 
                FROM messages m
                JOIN conversations c ON m.conversation_id = c.id
                JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
                WHERE c.telegram_account_id = $1 AND c.telegram_peer_id = $2 AND m.telegram_message_id = $3
                """,
                account_id,
                peer_id,
                tg_message_id
            )
            
            if message:
                import json
                # Update DB
                await db.execute(
                    "UPDATE messages SET reactions = $1 WHERE id = $2",
                    json.dumps(reactions),
                    message['id']
                )
                
                # Broadcast
                await manager.send_to_account(
                    {
                        "type": "message_reaction",
                        "message_id": message['id'],
                        "reactions": reactions
                    },
                    account_id,
                    message['user_id']
                )
        except Exception as e:
            logger.error(f"Error in handle_reaction: {e}")

    telethon_service.add_reaction_handler(handle_reaction)
    
    # Auto-connect accounts from database in the background
    async def auto_connect_accounts():
        try:
            accounts = await db.fetch("SELECT id, display_name FROM telegram_accounts WHERE is_active = true")
            logger.info(f"Auto-connecting {len(accounts)} active account(s)...")
            for account in accounts:
                try:
                    await telethon_service.connect_session(account['id'])
                    logger.info(f"\u2713 Connected account: {account['display_name']}")
                except Exception as e:
                    logger.error(f"\u2717 Error connecting account {account['display_name']}: {e}")
        except Exception as e:
            logger.error(f"Error fetching accounts for auto-connect: {e}")

    # Fire and forget the connection task
    asyncio.create_task(auto_connect_accounts())

    # Start scheduler
    await scheduler_service.start()
    logger.info("Scheduler started")

    yield

    # Shutdown
    await telethon_service.disconnect_all()
    await scheduler_service.stop()
    await db.disconnect()
    logger.info("Application shutdown complete")

app = FastAPI(lifespan=lifespan)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception caught: {exc}")
    logger.error(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "error": str(exc)},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(telegram_router)
app.include_router(messages_router)
app.include_router(translation_router)
app.include_router(templates_router)
app.include_router(scheduled_router)
app.include_router(contacts_router)
app.include_router(auto_responder_router)
app.include_router(admin_router)
app.include_router(analytics_router)

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "database": "connected"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    GLOBAL WEBSOCKET HANDLER
    Manages connections for both normal users and administrators.
    - User Authentication: via standard 'auth_token'.
    - Admin Authentication: via 'admin_token'.
    Ensures real-time updates are only dispatched to authorized sessions.
    """
    try:
        token = websocket.query_params.get("token")

        if not token:
            logger.warning("WebSocket attempt without token")
            await websocket.close(code=1008)
            return

        # Debug log for token (partial)
        logger.info(f"WebSocket handshake attempt for token beginning: {token[:20]}...")
        
        user_id = None
        is_admin = False
        
        # Try decoding with user secret first
        try:
            payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
            user_id = payload.get("user_id")
        except JWTError:
            # Try decoding with admin secret
            try:
                payload = jwt.decode(token, ADMIN_SECRET_KEY, algorithms=[ADMIN_ALGORITHM])
                if payload.get("type") == "admin":
                    is_admin = True
                    logger.info("WebSocket authenticated for admin")
            except JWTError as e:
                logger.error(f"WebSocket JWT Error: {e}")
                await websocket.close(code=1008)
                return
        
        if not user_id and not is_admin:
            logger.warning(f"WebSocket rejected: Token payload missing user_id and not admin.")
            await websocket.close(code=1008)
            return

        if is_admin:
            await manager.connect(websocket, is_admin=True)
        else:
            await manager.connect(websocket, user_id=int(user_id))
        
        try:
            while True:
                data = await websocket.receive_json()
                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
        except WebSocketDisconnect:
            if is_admin:
                manager.disconnect(websocket, is_admin=True)
            else:
                manager.disconnect(websocket, user_id=int(user_id))
        except Exception as e:
            logger.error(f"WebSocket loop error: {e}")
            if is_admin:
                manager.disconnect(websocket, is_admin=True)
            else:
                manager.disconnect(websocket, user_id=int(user_id))
            
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
        await websocket.close(code=1008)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
