import asyncio
import logging
import random
from typing import Optional
from datetime import datetime, timezone, timedelta
from database import db
from telethon_service import telethon_service
from websocket_manager import manager
from translation_service import translation_service

logger = logging.getLogger(__name__)

class CampaignService:
    def __init__(self):
        self.worker_task: Optional[asyncio.Task] = None
        self.check_interval = 60  # Check for new leads every 60 seconds
        self.is_running = False

    async def start(self):
        """Start the campaign outreach worker"""
        if not self.is_running:
            self.is_running = True
            self.worker_task = asyncio.create_task(self._run_worker())
            logger.info("Campaign outreach service started")

    async def stop(self):
        """Stop the campaign outreach worker"""
        self.is_running = False
        if self.worker_task:
            self.worker_task.cancel()
            try:
                await self.worker_task
            except asyncio.CancelledError:
                pass
            logger.info("Campaign outreach service stopped")

    async def _run_worker(self):
        """Main worker loop for campaign outreach"""
        while self.is_running:
            try:
                await self._process_outreach()
            except Exception as e:
                logger.error(f"Error in campaign worker: {e}")
            
            await asyncio.sleep(self.check_interval)

    async def _process_outreach(self):
        """Find leads and send initial messages"""
        # 1. Fetch all running campaigns
        running_campaigns = await db.fetch(
            "SELECT id, user_id, name, initial_message FROM campaigns WHERE status = 'running'"
        )

        for campaign in running_campaigns:
            campaign_id = campaign['id']
            user_id = campaign['user_id']
            
            # 2. Pre-Check: Are any accounts available for this campaign in the last 24 HOURS?
            window_start = datetime.now(timezone.utc) - timedelta(hours=24)
            available_account_ids = []
            
            # Get all active accounts for this user
            all_accounts = await db.fetch(
                "SELECT id FROM telegram_accounts WHERE user_id = $1 AND is_active = true",
                user_id
            )
            
            for acc in all_accounts:
                # Check if this specific account has sent an outreach in the last 24 hours
                sent_in_window = await db.fetchval(
                    """
                    SELECT COUNT(*) FROM campaign_logs l
                    JOIN campaign_leads cl ON l.lead_id = cl.id
                    WHERE cl.assigned_account_id = $1
                    AND l.action = 'initial_outreach'
                    AND l.created_at >= $2
                    """,
                    acc['id'], window_start
                )
                if sent_in_window < 1: # Our 1-message-per-24h limit
                    available_account_ids.append(acc['id'])

            if not available_account_ids:
                logger.info(f"Campaign '{campaign['name']}' (ID: {campaign_id}): All accounts reached daily limits. Hibernating...")
                continue

            # 3. Find pending leads at step 0 assigned to our AVAILABLE accounts
            pending_leads = await db.fetch(
                """
                SELECT id, telegram_identifier, assigned_account_id 
                FROM campaign_leads 
                WHERE campaign_id = $1 AND status = 'pending' AND current_step = 0
                AND assigned_account_id = ANY($2)
                ORDER BY created_at ASC
                LIMIT 5
                """,
                campaign_id, available_account_ids
            )

            if not pending_leads:
                continue

            for lead in pending_leads:
                account_id = lead['assigned_account_id']
                if not account_id:
                    continue

                # 3. Global Safety: Check if this user has ALREADY been contacted by ANY account
                # This prevents double-outreach even across different campaigns/accounts
                already_contacted = await db.fetchval(
                    """
                    SELECT EXISTS(
                        SELECT 1 FROM campaign_leads 
                        WHERE telegram_identifier = $1 
                        AND status IN ('contacted', 'replied', 'completed')
                        AND id != $2
                    )
                    """,
                    lead['telegram_identifier'], lead['id']
                )

                if already_contacted:
                    logger.info(f"Lead {lead['telegram_identifier']} already contacted globally. Skipping.")
                    await db.execute(
                        "UPDATE campaign_leads SET status = 'completed', failure_reason = 'Already contacted globally' WHERE id = $1",
                        lead['id']
                    )
                    continue

                # 4. Process the Outreach
                try:
                    logger.info(f"Starting outreach for lead {lead['telegram_identifier']} via account {account_id}")
                    
                    # A. Human-Pace Simulation: "is typing..." for 5-10 seconds
                    typing_duration = random.uniform(5.0, 10.0)
                    logger.info(f"Simulating typing for {typing_duration:.1f}s...")
                    
                    await telethon_service.send_typing(
                        account_id,
                        lead['telegram_identifier'],
                        duration=typing_duration
                    )

                    # B. Send the Initial Message
                    sent_msg = await telethon_service.send_message(
                        account_id,
                        lead['telegram_identifier'],
                        campaign['initial_message']
                    )

                    # C. Sync to Local Chat History & Dashboard
                    try:
                        # Find/Create Local Conversation
                        account = await db.fetchrow(
                            "SELECT user_id, source_language, target_language FROM telegram_accounts WHERE id = $1",
                            account_id
                        )
                        
                        peer_id = sent_msg['peer_id']
                        
                        # Translate campaign message for the dashboard view
                        # original_text is what went to Telegram (usually target language)
                        # translated_text is what should show in the translator's native language (source_language)
                        original_text = sent_msg['text']
                        translated_text = original_text
                        
                        try:
                            # If the message is already in target_lang, it might need translation to source_lang for the user
                            translation = await translation_service.translate_text(
                                original_text,
                                account['source_language'],
                                'auto'
                            )
                            translated_text = translation['translated_text']
                        except Exception as transl_err:
                            logger.error(f"Failed to translate campaign message for dashboard: {transl_err}")

                        conversation = await db.fetchrow(
                            "SELECT id FROM conversations WHERE telegram_account_id = $1 AND telegram_peer_id = $2",
                            account_id, peer_id
                        )
                        
                        if not conversation:
                            conversation_id = await db.fetchval(
                                """
                                INSERT INTO conversations (telegram_account_id, telegram_peer_id, title, type, username)
                                VALUES ($1, $2, $3, 'private', $4)
                                RETURNING id
                                """,
                                account_id, peer_id, lead['telegram_identifier'], lead['telegram_identifier']
                            )
                        else:
                            conversation_id = conversation['id']

                        # Save Message
                        msg_id = await db.fetchval(
                            """
                            INSERT INTO messages 
                            (conversation_id, telegram_message_id, original_text, translated_text, is_outgoing, created_at, sender_user_id, sender_name, sender_username, type)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'text')
                            RETURNING id
                            """,
                            conversation_id, 
                            sent_msg['message_id'], 
                            original_text, 
                            translated_text, 
                            True, 
                            sent_msg['date'], 
                            sent_msg['sender_user_id'],
                            sent_msg.get('sender_name') or 'Me',
                            sent_msg.get('sender_username') or 'unknown'
                        )

                        # Notify Frontend via WebSocket
                        await manager.send_to_account({
                            "type": "new_message",
                            "message": {
                                "id": msg_id,
                                "conversation_id": conversation_id,
                                "telegram_message_id": sent_msg['message_id'],
                                "text": original_text,
                                "original_text": original_text,
                                "translated_text": translated_text,
                                "is_outgoing": True,
                                "created_at": sent_msg['date'].isoformat(),
                                "sender_user_id": sent_msg['sender_user_id'],
                                "sender_name": sent_msg.get('sender_name') or 'Me',
                                "sender_username": sent_msg.get('sender_username') or 'unknown',
                                "type": "text",
                                "peer_title": lead['telegram_identifier']
                            }
                        }, account_id, account['user_id'])
                        
                        logger.info(f"Synced campaign message to local history for account {account_id}")
                    except Exception as sync_err:
                        logger.error(f"Failed to sync campaign message to history: {sync_err}")

                    # D. Update Database: Lead Status & Step
                    await db.execute(
                        """
                        UPDATE campaign_leads 
                        SET status = 'contacted', 
                            current_step = 1, 
                            last_contact_at = NOW() 
                        WHERE id = $1
                        """,
                        lead['id']
                    )

                    # E. Update Campaign Stats
                    await db.execute(
                        "UPDATE campaigns SET completed_leads = completed_leads + 1 WHERE id = $1",
                        campaign_id
                    )

                    # F. Log the Action
                    await db.execute(
                        """
                        INSERT INTO campaign_logs (campaign_id, lead_id, action, details)
                        VALUES ($1, $2, 'initial_outreach', $3)
                        """,
                        campaign_id, lead['id'], f"Initial message sent via account {account_id}"
                    )

                    logger.info(f"Successfully contacted lead {lead['telegram_identifier']}")

                except Exception as e:
                    error_str = str(e)
                    friendly_reason = error_str
                    
                    # Map raw Telegram errors to "Human Friendly" reasons
                    if "ChatWriteForbidden" in error_str:
                        friendly_reason = "Privacy protected (Only contacts can message)"
                    elif "UserPrivacyRestricted" in error_str:
                        friendly_reason = "User privacy restricted"
                    elif "UsernameNotOccupied" in error_str or "PeerIdInvalid" in error_str:
                        friendly_reason = "Username not found"
                    elif "FloodWait" in error_str:
                        friendly_reason = "Telegram limit: Too many messages"
                    elif "UserDeactivated" in error_str:
                        friendly_reason = "Account deleted/deactivated"
                    elif "SlowModeWait" in error_str:
                        friendly_reason = "Slow mode active in chat"

                    logger.error(f"Failed to send outreach to {lead['telegram_identifier']}: {error_str}")
                    
                    await db.execute(
                        "UPDATE campaign_leads SET status = 'failed', failure_reason = $2 WHERE id = $1",
                        lead['id'], friendly_reason
                    )
                    await db.execute(
                        """
                        INSERT INTO campaign_logs (campaign_id, lead_id, action, details)
                        VALUES ($1, $2, 'error', $3)
                        """,
                        campaign_id, lead['id'], error_str
                    )

    async def get_account_outreach_stats(self, account_id: int):
        """Get outreach stats for a specific account for today"""
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        count = await db.fetchval(
            """
            SELECT COUNT(*) FROM campaign_leads
            WHERE assigned_account_id = $1
            AND current_step >= 1
            AND last_contact_at >= $2
            """,
            account_id, today_start
        )
        return {
            "new_conversations_today": count,
            "limit": 1,
            "remaining": max(0, 1 - count)
        }

    async def get_campaign_hibernation_status(self, campaign_id: int, user_id: int):
        """Check if all accounts for a user/campaign have reached daily limits (24-hour rolling)"""
        window_start = datetime.now(timezone.utc) - timedelta(hours=24)
        
        # Get all active accounts for this user
        accounts = await db.fetch(
            "SELECT id FROM telegram_accounts WHERE user_id = $1 AND is_active = true",
            user_id
        )
        
        if not accounts:
            return {"is_hibernating": False, "next_reset_at": None}
            
        available_times = []
        for acc in accounts:
            last_outreach = await db.fetchrow(
                """
                SELECT l.created_at FROM campaign_logs l
                JOIN campaign_leads cl ON l.lead_id = cl.id
                WHERE cl.assigned_account_id = $1
                AND l.action = 'initial_outreach'
                ORDER BY l.created_at DESC
                LIMIT 1
                """,
                acc['id']
            )
            
            if not last_outreach or last_outreach['created_at'] < window_start:
                # This account is available NOW
                return {"is_hibernating": False, "next_reset_at": None}
            else:
                # Account will be available 24 hours after this outreach
                available_times.append(last_outreach['created_at'] + timedelta(hours=24))
        
        # If we reach here, all accounts are busy.
        # The campaign will wake up when the SOONEST account becomes available.
        is_hibernating = True
        next_reset_at = min(available_times) if available_times else None
            
        return {
            "is_hibernating": is_hibernating,
            "next_reset_at": next_reset_at
        }

campaign_service = CampaignService()
