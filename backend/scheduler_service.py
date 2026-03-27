import asyncio
import logging
from typing import Dict, Optional
from datetime import datetime
from database import db
from telethon_service import telethon_service
from translation_service import translation_service
from websocket_manager import manager

logger = logging.getLogger(__name__)

# Service responsible for tracking and executing scheduled messages asynchronously
class SchedulerService:
    # Initialize the scheduler, maintaining an in-memory dictionary of pending tasks
    def __init__(self):
        self.scheduled_messages: Dict[int, dict] = {}  # message_id -> message_data
        self.scheduler_task: Optional[asyncio.Task] = None
        self.check_interval = 30  # Check every 30 seconds
        
    # Start the continuous scheduler background worker task
    async def start(self):
        """Start the scheduler service"""
        logger.info("Starting scheduler service...")
        await self.load_scheduled_messages()
        
        if not self.scheduler_task or self.scheduler_task.done():
            self.scheduler_task = asyncio.create_task(self._run_scheduler())
            logger.info("Scheduler service started")
    
    # Safely stop and cancel the scheduler worker loop
    async def stop(self):
        """Stop the scheduler service"""
        if self.scheduler_task and not self.scheduler_task.done():
            self.scheduler_task.cancel()
            try:
                await self.scheduler_task
            except asyncio.CancelledError:
                pass
            logger.info("Scheduler service stopped")
    
    # Pull all pending, unsent, uncancelled messages from the DB into memory
    async def load_scheduled_messages(self):
        """Load all pending scheduled messages from database"""
        try:
            rows = await db.fetch(
                """
                SELECT sm.*, c.telegram_account_id, c.telegram_peer_id
                FROM scheduled_messages sm
                JOIN conversations c ON sm.conversation_id = c.id
                WHERE sm.is_sent = FALSE AND sm.is_cancelled = FALSE
                ORDER BY sm.scheduled_at ASC
                """
            )
            
            self.scheduled_messages = {}
            for row in rows:
                self.scheduled_messages[row['id']] = dict(row)
            
            logger.info(f"Loaded {len(self.scheduled_messages)} scheduled messages")
        except Exception as e:
            logger.error(f"Failed to load scheduled messages: {e}")
    
    # Add a specific newly scheduled message to the tracking map
    async def add_scheduled_message(self, message_id: int):
        """Add a new scheduled message to the scheduler"""
        try:
            row = await db.fetchrow(
                """
                SELECT sm.*, c.telegram_account_id, c.telegram_peer_id
                FROM scheduled_messages sm
                JOIN conversations c ON sm.conversation_id = c.id
                WHERE sm.id = $1
                """,
                message_id
            )
            
            if row:
                self.scheduled_messages[message_id] = dict(row)
                logger.info(f"Added scheduled message {message_id} to scheduler")
        except Exception as e:
            logger.error(f"Failed to add scheduled message {message_id}: {e}")
    
    # Delete a specific scheduled message from the tracking map to prevent it from sending
    async def remove_scheduled_message(self, message_id: int):
        """Remove a scheduled message from the scheduler"""
        if message_id in self.scheduled_messages:
            del self.scheduled_messages[message_id]
            logger.info(f"Removed scheduled message {message_id} from scheduler")
    
    # Automatically cancel pending scheduled sequences if the other party responds manually
    async def cancel_scheduled_messages_for_conversation(self, conversation_id: int):
        """Cancel all scheduled messages for a conversation (when opposite party responds)"""
        try:
            # Get scheduled messages before cancelling
            scheduled_msgs = await db.fetch(
                """
                SELECT id, message_text, scheduled_at
                FROM scheduled_messages
                WHERE conversation_id = $1 AND is_sent = FALSE AND is_cancelled = FALSE
                """,
                conversation_id
            )
            
            if not scheduled_msgs:
                return
            
            # Update database
            await db.execute(
                """
                UPDATE scheduled_messages
                SET is_cancelled = TRUE, cancelled_at = NOW()
                WHERE conversation_id = $1 AND is_sent = FALSE AND is_cancelled = FALSE
                """,
                conversation_id
            )
            
            # Insert system message for each cancelled scheduled message and collect IDs
            from datetime import datetime
            system_messages = []
            for msg in scheduled_msgs:
                scheduled_date = msg['scheduled_at'].strftime('%Y-%m-%d %H:%M')
                system_text = f"Scheduled message cancelled (was scheduled for {scheduled_date}): \"{msg['message_text']}\""
                
                created_at = datetime.now()
                msg_id = await db.fetchval(
                    """
                    INSERT INTO messages
                    (conversation_id, sender_name, sender_username, type, original_text, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING id
                    """,
                    conversation_id,
                    'System',
                    'system',
                    'system',
                    system_text,
                    created_at
                )
                system_messages.append({
                    'id': msg_id,
                    'text': system_text,
                    'created_at': created_at
                })
            
            # Remove from memory
            to_remove = [
                msg_id for msg_id, msg_data in self.scheduled_messages.items()
                if msg_data['conversation_id'] == conversation_id
            ]
            
            for msg_id in to_remove:
                del self.scheduled_messages[msg_id]
            
            logger.info(f"Cancelled {len(to_remove)} scheduled messages for conversation {conversation_id}")
            
            # Notify frontend via WebSocket
            if to_remove:
                conversation = await db.fetchrow(
                    """
                    SELECT c.id, ta.user_id, ta.id as account_id
                    FROM conversations c
                    JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
                    WHERE c.id = $1
                    """,
                    conversation_id
                )
                
                if conversation:
                    # Send cancellation notification
                    await manager.send_to_account(
                        {
                            "type": "scheduled_messages_cancelled",
                            "conversation_id": conversation_id,
                            "cancelled_ids": to_remove
                        },
                        conversation['account_id'],
                        conversation['user_id']
                    )
                    
                    # Send system messages via WebSocket
                    for sys_msg in system_messages:
                        await manager.send_to_account(
                            {
                                "type": "new_message",
                                "message": {
                                    "id": sys_msg['id'],
                                    "conversation_id": conversation_id,
                                    "telegram_message_id": None,
                                    "sender_user_id": None,
                                    "sender_name": "System",
                                    "sender_username": "system",
                                    "type": "system",
                                    "original_text": sys_msg['text'],
                                    "translated_text": None,
                                    "source_language": None,
                                    "target_language": None,
                                    "created_at": sys_msg['created_at'].isoformat()
                                }
                            },
                            conversation['account_id'],
                            conversation['user_id']
                        )
        except Exception as e:
            logger.error(f"Failed to cancel scheduled messages for conversation {conversation_id}: {e}")
    
    # Main infinite polling loop to execute any tasks whose delay period has expired
    async def _run_scheduler(self):
        """Main scheduler loop"""
        logger.info("Scheduler loop started")
        
        while True:
            try:
                await asyncio.sleep(self.check_interval)
                
                from datetime import timezone
                now = datetime.now(timezone.utc)
                messages_to_send = []
                
                # Find messages that should be sent
                for msg_id, msg_data in list(self.scheduled_messages.items()):
                    if msg_data['scheduled_at'] <= now:
                        messages_to_send.append((msg_id, msg_data))
                
                # Send messages
                for msg_id, msg_data in messages_to_send:
                    try:
                        await self._send_scheduled_message(msg_id, msg_data)
                    except Exception as e:
                        logger.error(f"Failed to send scheduled message {msg_id}: {e}")
                
                # Check for payment reminders (Phase 4)
                await self._check_order_reminders()
                
            except Exception as e:
                logger.error(f"Error in scheduler loop: {e}")
                await asyncio.sleep(self.check_interval)
    
    # Process, translate, and dispatch a single finalized scheduled message to Telegram
    async def _send_scheduled_message(self, message_id: int, message_data: dict):
        """Send a scheduled message"""
        try:
            account_id = message_data['telegram_account_id']
            peer_id = message_data['telegram_peer_id']
            conversation_id = message_data['conversation_id']
            message_text = message_data['message_text']
            
            # Get account and conversation info
            account = await db.fetchrow(
                """
                SELECT ta.user_id, ta.target_language, ta.source_language, c.title as peer_title
                FROM telegram_accounts ta
                JOIN conversations c ON c.telegram_account_id = ta.id
                WHERE ta.id = $1 AND c.id = $2
                """,
                account_id,
                conversation_id
            )
            
            if not account:
                logger.error(f"Account {account_id} not found for scheduled message {message_id}")
                return

            logger.info(f"Scheduler sending to account_id={account_id}, user_id={account['user_id'] if account else 'NOT FOUND'}")
            logger.info(f"Active WS connections: {list(manager.active_connections.keys())}")
            
            # Translate message
            translation = await translation_service.translate_text(
                message_text,
                account['source_language'],  # Translate TO source language (for sending)
                account['target_language']   # FROM target language (user's input)
            )
            
            # Send message via Telethon
            sent_message = await telethon_service.send_message(
                account_id,
                peer_id,
                translation['translated_text']
            )
            
            # Save to database
            created_at = sent_message.get('date', datetime.now())
            
            msg_id = await db.fetchval(
                """
                INSERT INTO messages
                (conversation_id, telegram_message_id, sender_user_id, sender_name, sender_username, type,
                original_text, translated_text, source_language, target_language, created_at, is_outgoing)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE)
                RETURNING id
                """,
                conversation_id,
                sent_message.get('message_id'),
                sent_message.get('sender_user_id'),
                sent_message.get('sender_name'),
                sent_message.get('sender_username') or sent_message.get('sender_name') or 'me',
                'text',
                message_text,
                translation['translated_text'],
                account['target_language'],
                account['source_language'],
                created_at
            )
            
            # Update conversation
            await db.execute(
                "UPDATE conversations SET last_message_at = $1 WHERE id = $2",
                created_at,
                conversation_id
            )
            
            # Mark scheduled message as sent
            await db.execute(
                """
                UPDATE scheduled_messages
                SET is_sent = TRUE, sent_at = NOW()
                WHERE id = $1
                """,
                message_id
            )
            
            # Remove from scheduler
            if message_id in self.scheduled_messages:
                del self.scheduled_messages[message_id]
            
            # Notify frontend via WebSocket - sent message
            await manager.send_to_account(
                {
                    "type": "new_message",
                    "message": {
                        "id": msg_id,
                        "conversation_id": conversation_id,
                        "telegram_message_id": sent_message.get('message_id'),
                        "sender_user_id": sent_message.get('sender_user_id'),
                        "sender_name": sent_message.get('sender_name'),
                        "sender_username": sent_message.get('sender_username') or 'User',
                        "peer_title": account['peer_title'],
                        "type": "text",
                        "original_text": message_text,
                        "translated_text": translation['translated_text'],
                        "source_language": account['target_language'],
                        "target_language": account['source_language'],
                        "created_at": created_at.isoformat() if created_at else None,
                        "edited_at": None,
                        "is_outgoing": True,
                        "reply_to_telegram_id": None,
                        "reply_to_text": None,
                        "reply_to_sender": None
                    }
                },
                account_id,
                account['user_id']
            )
            
            logger.info(f"Sending WebSocket notification to account_id={account_id}, user_id={account['user_id']}")
            await manager.send_to_account(
                {
                    "type": "scheduled_message_sent",
                    "scheduled_message_id": message_id,
                    "message_id": msg_id,
                    "message": {
                        "id": msg_id,
                        "conversation_id": conversation_id,
                        "telegram_message_id": sent_message.get('message_id'),
                        "sender_user_id": sent_message.get('sender_user_id'),
                        "sender_name": sent_message.get('sender_name'),
                        "sender_username": sent_message.get('sender_username') or 'User',
                        "peer_title": account['peer_title'],
                        "type": "text",
                        "original_text": message_text,
                        "translated_text": translation['translated_text'],
                        "source_language": account['target_language'],
                        "target_language": account['source_language'],
                        "created_at": created_at.isoformat() if created_at else None,
                        "is_outgoing": True,
                        "reply_to_telegram_id": None,
                        "reply_to_text": None,
                        "reply_to_sender": None
                    }
                },
                account_id,
                account['user_id']
            )
            
            logger.info(f"Successfully sent scheduled message {message_id}")
            
        except Exception as e:
            logger.error(f"Failed to send scheduled message {message_id}: {e}")
            # Mark as failed but don't delete - admin can review
            await db.execute(
                """
                UPDATE scheduled_messages
                SET is_cancelled = TRUE, cancelled_at = NOW()
                WHERE id = $1
                """,
                message_id
            )
            if message_id in self.scheduled_messages:
                del self.scheduled_messages[message_id]

    async def _check_order_reminders(self):
        """Check for orders that need a nudge (Phase 4 & 5)"""
        try:
            # Fetch orders in pending_payment or disapproved status that need a reminder
            # We use CASE to pick the right settings based on status
            orders = await db.fetch(
                """
                WITH settings_expanded AS (
                    SELECT o.*,
                           ta.target_language, 
                           ta.source_language,
                           CASE 
                             WHEN o.status = 'pending_payment' THEN COALESCE(s.payment_reminder_message, 'Hello! We haven''t received your payment screenshot for Order {order_id}. Please send it when you can. 🙏')
                             WHEN o.status = 'disapproved' THEN COALESCE(s.disapproved_reminder_message, 'We are still waiting for your updated screenshot for Order {order_id}. Please send it as soon as possible. 🙏')
                           END as reminder_template,
                           CASE 
                             WHEN o.status = 'pending_payment' THEN COALESCE(s.payment_reminder_interval_days, 0)
                             WHEN o.status = 'disapproved' THEN COALESCE(s.disapproved_reminder_interval_days, 0)
                           END as target_days,
                           CASE 
                             WHEN o.status = 'pending_payment' THEN COALESCE(s.payment_reminder_interval_hours, 2)
                             WHEN o.status = 'disapproved' THEN COALESCE(s.disapproved_reminder_interval_hours, 2)
                           END as target_hours,
                           CASE 
                             WHEN o.status = 'pending_payment' THEN COALESCE(s.payment_reminder_interval_minutes, 0)
                             WHEN o.status = 'disapproved' THEN COALESCE(s.disapproved_reminder_interval_minutes, 0)
                           END as target_minutes,
                           CASE 
                             WHEN o.status = 'pending_payment' THEN COALESCE(s.payment_reminder_count, 3)
                             WHEN o.status = 'disapproved' THEN COALESCE(s.disapproved_reminder_count, 3)
                           END as target_max_count,
                           CASE
                             WHEN o.status = 'pending_payment' THEN o.created_at
                             ELSE o.updated_at
                           END as base_time
                    FROM orders o
                    LEFT JOIN sales_settings s ON o.user_id = s.user_id
                    LEFT JOIN telegram_accounts ta ON o.telegram_account_id = ta.id
                    WHERE o.status IN ('pending_payment', 'disapproved')
                )
                SELECT * FROM settings_expanded
                WHERE reminder_count < target_max_count
                AND (
                    -- Condition for pending_payment: proof must be missing
                    (status = 'pending_payment' AND payment_screenshot_path IS NULL)
                    OR
                    -- Condition for disapproved: just waiting for new interaction
                    (status = 'disapproved')
                )
                AND (
                    (last_reminder_at IS NULL AND base_time + (target_days * INTERVAL '1 day' + target_hours * INTERVAL '1 hour' + target_minutes * INTERVAL '1 minute') <= NOW())
                    OR 
                    (last_reminder_at IS NOT NULL AND last_reminder_at + (target_days * INTERVAL '1 day' + target_hours * INTERVAL '1 hour' + target_minutes * INTERVAL '1 minute') <= NOW())
                )
                """
            )
            
            if not orders: return

            from sales_service import sales_service
            
            for ord in orders:
                try:
                    logger.info(f"Sending automated {ord['status']} reminder for Order {ord['po_number']} to Peer {ord['telegram_peer_id']}")
                    
                    # Replace placeholder
                    message_text = ord['reminder_template'].replace("{order_id}", ord['po_number'])
                    
                    # Use sales_service to translate (if enabled), send, and log the broadcast to chat UI
                    await sales_service._translate_and_send_reply(
                        account_id=ord['telegram_account_id'],
                        peer_id=ord['telegram_peer_id'],
                        text=message_text,
                        user_id=ord['user_id']
                    )
                    
                    # Update order
                    await db.execute(
                        "UPDATE orders SET reminder_count = reminder_count + 1, last_reminder_at = NOW() WHERE id = $1",
                        ord['id']
                    )
                    
                except Exception as e:
                    logger.error(f"Failed to send reminder for order {ord['id']}: {e}")
        except Exception as e:
            logger.error(f"Error in _check_order_reminders: {e}")

scheduler_service = SchedulerService()
