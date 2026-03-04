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
from auth import get_current_user
from jose import jwt, JWTError
from auto_responder_service import auto_responder_service
from app.core.admin_security import ADMIN_SECRET_KEY, ADMIN_ALGORITHM

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting application...")

    await db.connect()
    logger.info("Database connected")
    
    # Initialize encryption service
    if settings.aes_encryption_key:
        initialize_encryption_service(settings.aes_encryption_key)
        logger.info("Encryption service initialized")
    else:
        logger.warning("AES encryption key not configured - encryption features disabled")

    async def handle_new_message(message_data: dict):
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
                conversation_id = await db.fetchval(
                    """
                    INSERT INTO conversations (telegram_account_id, telegram_peer_id, title, type)
                    VALUES ($1, $2, $3, $4)
                    RETURNING id
                    """,
                    account_id,
                    peer_id,
                    message_data.get('peer_title', 'Unknown'),
                    message_data.get('conversation_type', 'private')
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
            
            # Translate text if present
            translated_text = None
            source_lang = None
            if text:
                try:
                    translation = await translation_service.translate_text(
                        text,
                        account['target_language'],
                        account['source_language']
                    )
                    translated_text = translation['translated_text']
                    source_lang = translation['source_language']
                except Exception as e:
                    logger.error(f"Translation error in handle_new_message: {e}")
                    translated_text = text
                    source_lang = account['source_language']
            
            # Encrypt message if encryption is enabled
            processed_original, processed_translated, is_encrypted = await encrypt_message_if_enabled(
                db, text, translated_text
            )
            
            message_id = await db.fetchval(
                """
                INSERT INTO messages
                (conversation_id, telegram_message_id, sender_user_id, sender_name, sender_username, type, original_text, translated_text,
                 source_language, target_language, created_at, is_encrypted, is_outgoing)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING id
                """,
                conversation_id,
                message_data['message_id'],
                message_data['sender_id'],
                message_data['sender_name'],
                message_data.get('sender_username') or 'User',
                msg_type,
                processed_original,
                processed_translated,
                source_lang,
                account['target_language'],
                created_at,
                is_encrypted,
                message_data.get('is_outgoing', False)
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
                "sender_name": message_data['sender_name'],
                "sender_username": message_data['sender_username'],
                "peer_title": message_data['peer_title'],
                "type": msg_type,
                "original_text": text,
                "translated_text": translated_text,
                "source_language": source_lang,
                "target_language": account['target_language'],
                "created_at": created_at.isoformat() if created_at else None,
                "edited_at": None,
                "is_outgoing": message_data['is_outgoing'],
                "media_file_name": message_data.get('media_filename'),
            }

            await manager.send_to_account(
                {
                    "type": "new_message",
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
    allow_origins=[settings.frontend_url],
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

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "database": "connected"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
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
