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
from campaign_service import campaign_service
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
from app.features.campaign.routes import router as campaign_router
from app.features.products.routes import router as products_router
from app.features.sales.routes import router as sales_router
from auth import get_current_user
from jose import jwt, JWTError
from auto_responder_service import auto_responder_service
from sales_service import sales_service
from app.core.admin_security import ADMIN_SECRET_KEY, ADMIN_ALGORITHM

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Application lifespan manager to setup DB connections, migrations, encryption, and background tasks on startup
@asynccontextmanager
async def lifespan(app: FastAPI):
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

        -- Campaign Management Tables
        CREATE TABLE IF NOT EXISTS campaigns (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            initial_message TEXT NOT NULL,
            status VARCHAR(50) DEFAULT 'draft',
            total_leads INTEGER DEFAULT 0,
            completed_leads INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            negative_keywords JSONB DEFAULT '[]',
            kill_switch_enabled BOOLEAN DEFAULT TRUE,
            auto_replies JSONB DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS campaign_steps (
            id SERIAL PRIMARY KEY,
            campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
            step_number INTEGER NOT NULL,
            wait_time_hours FLOAT DEFAULT 0,
            keywords JSONB DEFAULT '[]',
            response_text TEXT NOT NULL,
            next_step INTEGER,
            auto_replies JSONB DEFAULT '[]',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(campaign_id, step_number)
        );

        CREATE TABLE IF NOT EXISTS campaign_leads (
            id SERIAL PRIMARY KEY,
            campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
            telegram_identifier VARCHAR(255) NOT NULL,
            current_step INTEGER DEFAULT 0, -- 0 means opening message (initial_outreach) needs to be sent
            status VARCHAR(50) DEFAULT 'pending',
            last_contact_at TIMESTAMP WITH TIME ZONE,
            assigned_account_id INTEGER REFERENCES telegram_accounts(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(campaign_id, telegram_identifier)
        );

        CREATE TABLE IF NOT EXISTS campaign_logs (
            id SERIAL PRIMARY KEY,
            campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
            lead_id INTEGER REFERENCES campaign_leads(id) ON DELETE CASCADE,
            action VARCHAR(255) NOT NULL,
            details TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Add missing columns to existing tables if they weren't created fresh
        ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS kill_switch_enabled BOOLEAN DEFAULT TRUE;
        ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS auto_replies JSONB DEFAULT '[]';
        ALTER TABLE campaign_steps ADD COLUMN IF NOT EXISTS auto_replies JSONB DEFAULT '[]';


        -- Milestone 2: Sales & Inventory Automation
        CREATE TABLE IF NOT EXISTS sales_states (
            id SERIAL PRIMARY KEY,
            telegram_account_id INTEGER REFERENCES telegram_accounts(id) ON DELETE CASCADE,
            telegram_peer_id BIGINT NOT NULL,
            status VARCHAR(50) DEFAULT 'idle', -- 'idle', 'awaiting_confirmation'
            pending_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
            pending_quantity INTEGER,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(telegram_account_id, telegram_peer_id)
        );

        CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            po_number VARCHAR(100) UNIQUE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
            telegram_account_id INTEGER REFERENCES telegram_accounts(id) ON DELETE SET NULL,
            telegram_peer_id BIGINT,
            quantity INTEGER,
            unit_price FLOAT,
            total_price FLOAT,
            status VARCHAR(50) DEFAULT 'confirmed', 
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sales_settings (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
            payment_details TEXT,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        """)
        logger.info("Database migration (reply support & Campaign tables) completed")
    except Exception as e:
        logger.error(f"Migration error: {e}")
    
    # Initialize encryption service
    if settings.aes_encryption_key:
        initialize_encryption_service(settings.aes_encryption_key)
        logger.info("Encryption service initialized")
    else:
        logger.warning("AES encryption key not configured - encryption features disabled")

    # Handler for incoming new messages from Telegram, applying translation and DB storage
    async def handle_new_message(message_data: dict):
        try:
            account_id = message_data['account_id']
            peer_id = message_data['peer_id']

            account = await db.fetchrow(
                "SELECT user_id, target_language, source_language, translation_enabled FROM telegram_accounts WHERE id = $1",
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
            
            processed_original = text
            processed_translated = text
            source_lang = account['source_language']
            translation_enabled = account.get('translation_enabled', True)
            
            if text and translation_enabled:
                try:
                    # Detect language first to see if it's already in the target language
                    detected = translation_service.detect_language(text)
                    target_lang = account['target_language']
                    
                    # Special Logic for Product Auto-Replies:
                    # If it's an outgoing product message, we only want to show the Description translation in the Admin UI.
                    if message_data.get('is_outgoing') and "📝 **Description:**" in text:
                        # Find the description part and translate ONLY that
                        # For now, it's already in the message (original text).
                        # Let's see if there is a translated desc already included (it will be in parenthesis)
                        import re
                        match = re.search(r'📝 \*\*Description:\*\* .*?\n\((.*?)\)', text)
                        if match:
                            # We already included it in the SalesService construct
                            processed_translated = match.group(1).strip('_- ')
                            processed_original = text
                            logger.info("Parsed pre-translated product description for Admin UI")
                        else:
                            # If not included, we translate the line after the label
                            desc_match = re.search(r'📝 \*\*Description:\*\* (.*?)\n', text)
                            if desc_match:
                                translation = await translation_service.translate_text(desc_match.group(1), target_lang)
                                processed_translated = translation['translated_text']
                                logger.info("Manually translated product description for Admin UI")
                    
                    elif detected == target_lang:
                        logger.info("Message already in target language, back-translating to original")
                        back_translation = await translation_service.translate_text(
                            text,
                            account['source_language'],
                            account['target_language']
                        )
                        processed_original = back_translation['translated_text']
                        processed_translated = text
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

            # 1. Update Lead Status if this is a reply to a campaign
            if not message_data.get('is_outgoing', False):
                # A. Try matching by EXACT ID (Reliable)
                lead = await db.fetchrow(
                    """
                    SELECT id, campaign_id, status FROM campaign_leads 
                    WHERE telegram_id = $1 
                    AND assigned_account_id = $2
                    AND status IN ('contacted', 'pending', 'replied')
                    """,
                    peer_id, account_id
                )
                
                # B. Fallback: Try matching by Username/Identifier (for old leads)
                if not lead:
                    peer_identifier = message_data.get('sender_username') or str(peer_id)
                    lead = await db.fetchrow(
                        """
                        SELECT id, campaign_id, status FROM campaign_leads 
                        WHERE telegram_identifier = $1 
                        AND assigned_account_id = $2
                        AND status IN ('contacted', 'pending', 'replied')
                        """,
                        peer_identifier, account_id
                    )
                
                if lead:
                    logger.info(f"Lead {peer_id} replied! Updating status for lead {lead['id']}.")
                    
                    # 1. Update Lead Status FIRST
                    await db.execute(
                        "UPDATE campaign_leads SET status = 'replied' WHERE id = $1",
                        lead['id']
                    )

                    # 2. Increment statistics if they haven't replied before
                    if lead['status'] != 'replied':
                        await db.execute(
                            "UPDATE campaigns SET replied_leads = replied_leads + 1 WHERE id = $1",
                            lead['campaign_id']
                        )
                        
                        # 3. Notify frontend to refresh (Now safe because DB is updated)
                        await manager.send_personal_message({
                            "type": "campaign_stats_update",
                            "campaign_id": lead['campaign_id']
                        }, account['user_id'])
                    # Log the reply event
                    await db.execute(
                        """
                        INSERT INTO campaign_logs (campaign_id, lead_id, account_id, action, details)
                        VALUES ($1, $2, $3, 'reply_received', $4)
                        """,
                        lead['campaign_id'], lead['id'], account_id, f"Customer replied to message"
                    )
                    
                    # 4. Kill Switch: Check for negative keywords (Milestone 5)
                    campaign = await db.fetchrow(
                        "SELECT negative_keywords, kill_switch_enabled FROM campaigns WHERE id = $1",
                        lead['campaign_id']
                    )
                    
                    if campaign and campaign.get('kill_switch_enabled') and campaign['negative_keywords']:
                        import json
                        try:
                            neg_keywords = json.loads(campaign['negative_keywords']) if isinstance(campaign['negative_keywords'], str) else campaign['negative_keywords']
                        except Exception:
                            neg_keywords = []

                        # Match against all available versions (Original Lead text AND Operator translation)
                        text_versions = [
                            text.lower(),
                            processed_translated.lower(),
                            processed_original.lower()
                        ]
                        # Filter out empty and redundant versions
                        text_versions = list(set([v for v in text_versions if v.strip()]))

                        matched_neg = None
                        for nkw in neg_keywords:
                            nkw_lower = nkw.lower()
                            if any(nkw_lower in v for v in text_versions):
                                matched_neg = nkw
                                break
                        
                        if matched_neg:
                            logger.info(f"Kill Switch Triggered! Lead {lead['id']} said negative keyword '{matched_neg}'. Aborting sequence.")
                            await db.execute(
                                "UPDATE campaign_leads SET status = 'failed', failure_reason = $2 WHERE id = $1",
                                lead['id'], f"Aborted by Kill Switch (Keyword: {matched_neg})"
                            )
                            # Log the kill switch trigger
                            await db.execute(
                                """
                                INSERT INTO campaign_logs (campaign_id, lead_id, account_id, action, details)
                                VALUES ($1, $2, $3, 'kill_switch', $4)
                                """,
                                lead['campaign_id'], lead['id'], account_id, f"Sequence aborted automatically due to negative keyword: {matched_neg}"
                            )
                            # Do not process auto-responder after kill switch
                            return

            # 2. Check for Products/Sales/Inventory logic (Milestone 2)
            # This handles product inquiries, order commands, and confirmations.
            sales_handled = await sales_service.check_and_handle_sales(
                message_data,
                account['user_id']
            )
            
            # 3. Check for auto-responder matches (Global keywords)
            if not sales_handled:
                message_data['translated_text'] = processed_translated
                message_data['operator_text'] = processed_original
                await auto_responder_service.check_and_respond(
                    message_data,
                    account['user_id']
                )

        except Exception as e:
            logger.error(f"Error handling new message: {e}")
            logger.error(traceback.format_exc())

    telethon_service.add_message_handler(handle_new_message)
 
    # Handler for incoming message reactions from Telegram
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
    # Background task to automatically reconnect all active accounts on startup
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

    # Start campaign outreach service
    await campaign_service.start()
    logger.info("Campaign outreach service started")

    yield

    # Shutdown
    await telethon_service.disconnect_all()
    await scheduler_service.stop()
    await campaign_service.stop()
    await db.disconnect()
    logger.info("Application shutdown complete")

app = FastAPI(lifespan=lifespan)

from fastapi.staticfiles import StaticFiles
import os
os.makedirs("backend/media/products", exist_ok=True)
app.mount("/media", StaticFiles(directory="backend/media"), name="media")

# Global exception handler to catch all unhandled exceptions and return a 500 response
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
app.include_router(campaign_router)
app.include_router(products_router)
app.include_router(sales_router)

# Health check endpoint for monitoring application status
@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "database": "connected"}

# WebSocket endpoint supporting real-time updates for both users and admins
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
