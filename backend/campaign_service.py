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

    async def get_campaign_hibernation_status(self, campaign_id: int, user_id: int) -> dict:
        """Check if a campaign is hibernating (all accounts assigned to THIS campaign's leads are at limit).
        Returns is_hibernating (bool) and next_reset_at (datetime or None)."""
        try:
            window_start = datetime.now(timezone.utc) - timedelta(hours=24)
            
            # Get only accounts that have PENDING leads in THIS specific campaign
            # (Only these accounts matter for hibernation - others are irrelevant)
            assigned_accounts = await db.fetch(
                """
                SELECT DISTINCT assigned_account_id as id 
                FROM campaign_leads 
                WHERE campaign_id = $1 
                AND status = 'pending' 
                AND current_step = 0
                AND assigned_account_id IS NOT NULL
                """,
                campaign_id
            )
            
            if not assigned_accounts:
                # No pending leads at all - not hibernating, just done
                return {"is_hibernating": False, "next_reset_at": None}

            earliest_reset = None
            all_blocked = True

            for acc in assigned_accounts:
                last_cold_outreach = await db.fetchval(
                    """
                    SELECT MAX(created_at) FROM campaign_logs 
                    WHERE account_id = $1 AND action = 'initial_outreach'
                    """,
                    acc['id']
                )
                if not last_cold_outreach or last_cold_outreach < window_start:
                    # This account is available - campaign is NOT hibernating
                    all_blocked = False
                    break
                else:
                    reset_time = last_cold_outreach + timedelta(hours=24)
                    if earliest_reset is None or reset_time < earliest_reset:
                        earliest_reset = reset_time

            if all_blocked:
                return {
                    "is_hibernating": True,
                    "next_reset_at": earliest_reset.isoformat() if earliest_reset else None
                }

            return {"is_hibernating": False, "next_reset_at": None}
        except Exception as e:
            logger.error(f"Error checking hibernation status for campaign {campaign_id}: {e}")
            return {"is_hibernating": False, "next_reset_at": None}

    async def _process_outreach(self):
        """Find leads and send initial messages"""
        # 1. Fetch all running campaigns
        running_campaigns = await db.fetch(
            "SELECT id, user_id, name, initial_message FROM campaigns WHERE status = 'running'"
        )

        for campaign in running_campaigns:
            campaign_id = campaign['id']
            user_id = campaign['user_id']
            
            # Check if campaign has actually finished
            has_active_leads = await db.fetchval(
                """
                SELECT EXISTS(
                    SELECT 1 FROM campaign_leads 
                    WHERE campaign_id = $1 AND status IN ('pending', 'contacted')
                )
                """,
                campaign_id
            )
            
            if not has_active_leads:
                logger.info(f"Campaign '{campaign['name']}' (ID: {campaign_id}) has zero active leads left. Marking as COMPLETED.")
                await db.execute("UPDATE campaigns SET status = 'completed' WHERE id = $1", campaign_id)
                continue

            # Get all active accounts for this user
            all_accounts = await db.fetch(
                "SELECT id FROM telegram_accounts WHERE user_id = $1 AND is_active = true",
                user_id
            )
            all_account_ids = [acc['id'] for acc in all_accounts]
            
            if not all_account_ids:
                continue

            # 2A. COLD OUTREACH CHECK - Only 1 new stranger per account per 24 hours
            # This is the strict anti-ban protection for Step 0 (first messages)
            window_start = datetime.now(timezone.utc) - timedelta(hours=24)
            cold_available_ids = []
            
            for acc in all_accounts:
                last_cold_outreach = await db.fetchval(
                    """
                    SELECT MAX(created_at) FROM campaign_logs 
                    WHERE account_id = $1
                    AND action = 'initial_outreach'
                    """,
                    acc['id']
                )
                if not last_cold_outreach or last_cold_outreach < window_start:
                    cold_available_ids.append(acc['id'])
                else:
                    reset_time = last_cold_outreach + timedelta(hours=24)
                    logger.info(f"Account {acc['id']} cold limit reached. Resets at: {reset_time}")

            # 2B. WARM FOLLOW-UP CHECK - All accounts are always available for follow-ups!
            # These are NOT new strangers, we already spoke to them. No cold limit applies.
            warm_available_ids = all_account_ids  # All accounts can send follow-ups anytime

            # 3A. Find OUTREACH leads (Step 0, 'pending')
            # Split into COLD (new stranger) vs WARM (looped back/existing contact)
            cold_leads = []
            
            # 1. Loopers/Re-activations (Already have a telegram_id -> NOT COLD anymore)
            loop_leads = await db.fetch(
                """
                SELECT l.id, l.telegram_identifier, l.telegram_id, l.assigned_account_id, l.current_step, l.last_contact_at,
                       c.initial_message, NULL::text as step_message, NULL::float as wait_time_hours
                FROM campaign_leads l
                JOIN campaigns c ON l.campaign_id = c.id
                WHERE l.campaign_id = $1 
                AND l.assigned_account_id = ANY($2)
                AND l.current_step = 0 AND l.status = 'pending'
                AND l.telegram_id IS NOT NULL
                ORDER BY l.created_at ASC
                LIMIT 5
                """,
                campaign_id, all_account_ids
            )

            # 2. Pure Cold Strangers (Needs cold limit check)
            if cold_available_ids:
                cold_leads = await db.fetch(
                    """
                    SELECT l.id, l.telegram_identifier, l.assigned_account_id, l.current_step, l.last_contact_at,
                           c.initial_message, NULL::text as step_message, NULL::float as wait_time_hours
                    FROM campaign_leads l
                    JOIN campaigns c ON l.campaign_id = c.id
                    WHERE l.campaign_id = $1 
                    AND l.assigned_account_id = ANY($2)
                    AND l.current_step = 0 AND l.status = 'pending'
                    AND l.telegram_id IS NULL
                    ORDER BY l.created_at ASC
                    LIMIT 1
                    """,
                    campaign_id, cold_available_ids
                )

            # 3B. Find WARM FOLLOW-UP leads (Step > 0, 'contacted', timer expired)
            warm_leads = await db.fetch(
                """
                SELECT l.id, l.telegram_identifier, l.assigned_account_id, l.current_step, l.last_contact_at,
                       c.initial_message, s.response_text as step_message, s.wait_time_hours, s.next_step
                FROM campaign_leads l
                JOIN campaigns c ON l.campaign_id = c.id
                JOIN campaign_steps s ON l.campaign_id = s.campaign_id AND s.step_number = l.current_step
                WHERE l.campaign_id = $1 
                AND l.assigned_account_id = ANY($2)
                AND l.current_step > 0 AND l.status = 'contacted' 
                AND l.last_contact_at + (s.wait_time_hours * interval '1 hour') <= NOW()
                ORDER BY l.last_contact_at ASC
                LIMIT 1
                """,
                campaign_id, warm_available_ids
            )

            # Combine: prioritize warm follow-ups and loopers first, then new cold leads
            pending_leads = list(warm_leads) + list(loop_leads) + list(cold_leads)

            if not pending_leads:
                if not cold_available_ids:
                    # Only log hibernation if we actually HAVE pending Strangers (Step 0) but no accounts available
                    has_step0_pending = await db.fetchval(
                        "SELECT EXISTS(SELECT 1 FROM campaign_leads WHERE campaign_id = $1 AND current_step = 0 AND status = 'pending')",
                        campaign_id
                    )
                    if has_step0_pending:
                        logger.info(f"Campaign '{campaign['name']}' (ID: {campaign_id}): HIBERNATING. (All accounts at cold limit)")
                    else:
                        # If no Step 0, then we are just waiting for follow-up timers
                        logger.debug(f"Campaign '{campaign['name']}' (ID: {campaign_id}): Waiting for follow-up timers.")
                else:
                    logger.debug(f"Campaign '{campaign['name']}' (ID: {campaign_id}): No leads ready for outreach at this moment.")
                continue

            for lead in pending_leads:
                account_id = lead['assigned_account_id']
                current_step = lead['current_step']
                
                # Determine the message to send
                message_to_send = lead['initial_message'] if current_step == 0 else lead['step_message']
                
                if not message_to_send:
                    logger.warning(f"No message found for lead {lead['id']} at step {current_step}. Completing lead.")
                    await db.execute("UPDATE campaign_leads SET status = 'completed' WHERE id = $1", lead['id'])
                    continue

                # NEW: Ensure the account is CONNECTED before sending
                # Transient disconnects often stall campaigns.
                try:
                    await telethon_service.reconnect_if_needed(account_id)
                except Exception as e:
                    logger.error(f"Failed to reconnect account {account_id} for lead {lead['id']}: {e}")
                    await db.execute(
                        "UPDATE campaign_leads SET status = 'failed', failure_reason = 'Account disconnected' WHERE id = $1",
                        lead['id']
                    )
                    continue

                # 4. Global Safety Check (for Step 0 only, and ONLY for brand new strangers)
                if current_step == 0 and lead.get('telegram_id') is None:
                    already_contacted = await db.fetchval(
                        "SELECT EXISTS(SELECT 1 FROM campaign_leads WHERE telegram_identifier = $1 AND status IN ('contacted', 'replied', 'completed') AND id != $2)",
                        lead['telegram_identifier'], lead['id']
                    )
                    if already_contacted:
                        await db.execute("UPDATE campaign_leads SET status = 'completed', failure_reason = 'Already contacted globally' WHERE id = $1", lead['id'])
                        continue

                # 5. Process the Message
                try:
                    action_type = "initial_outreach" if current_step == 0 else f"follow_up_step_{current_step}"
                    logger.info(f"Processing {action_type} for lead {lead['telegram_identifier']} via account {account_id}")
                    
                    # 1. Prepare translation (translate source to target)
                    account = await db.fetchrow(
                        "SELECT user_id, source_language, target_language FROM telegram_accounts WHERE id = $1",
                        account_id
                    )
                    
                    target_msg_text = message_to_send
                    if account and account['source_language'] != account['target_language']:
                        try:
                            translation = await translation_service.translate_text(
                                message_to_send,
                                account['source_language'],
                                account['target_language']
                            )
                            target_msg_text = translation['translated_text']
                        except Exception as e:
                            logger.error(f"Failed to translate campaign message to target language: {e}")
                            
                    # Human-Pace Simulation
                    typing_duration = random.uniform(5.0, 10.0)
                    await telethon_service.send_typing(account_id, lead['telegram_identifier'], duration=typing_duration)

                    # Prefer numeric ID if available for faster resolution and better reliability
                    peer_identifier = lead.get('telegram_id') or lead['telegram_identifier']
                    sent_msg = await telethon_service.send_message(account_id, peer_identifier, target_msg_text)

                    # C. Sync to Local Chat History & Dashboard
                    try:
                        peer_id = sent_msg['peer_id']
                        
                        # original_text = what the operator wrote (their own language)
                        # translated_text = what was actually sent to the Telegram user (target language)
                        original_text = message_to_send
                        translated_text = target_msg_text

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
                            (conversation_id, telegram_message_id, original_text, translated_text, is_outgoing, created_at, 
                             sender_user_id, sender_name, sender_username, type, source_language, target_language)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'text', $10, $11)
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
                            sent_msg.get('sender_username') or 'unknown',
                            account['target_language'],
                            account['source_language']
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

                    # D. Update Database: Lead Status & Step (Milestone 5: Intelligent Branching)
                    # Timer-based follow-ups ALWAYS go to the next sequential step.
                    # Keyword-based jumps are handled separately in auto_responder_service.py.
                    next_step = current_step + 1
                    
                    # Check if this was the LAST step for the campaign
                    total_steps = await db.fetchval("SELECT MAX(step_number) FROM campaign_steps WHERE campaign_id = $1", campaign_id) or 0
                    
                    # If we just sent the last step, they are COMPLETED!
                    # If we are loopers (step 0), they are just starting (contacted)
                    final_status = 'contacted'
                    final_step = next_step
                    
                    if current_step > 0 and current_step >= total_steps:
                        final_status = 'completed'
                        final_step = current_step # Keep them at the last step number for context
                        logger.info(f"Lead {lead['id']} has reached the absolute end of the sequence (Step {total_steps}). Marking as COMPLETED.")

                    await db.execute(
                        """
                        UPDATE campaign_leads 
                        SET status = $2, 
                            current_step = $3, 
                            last_contact_at = NOW(),
                            first_contacted_at = CASE WHEN $3 = 1 AND first_contacted_at IS NULL THEN NOW() ELSE first_contacted_at END,
                            telegram_id = $4
                        WHERE id = $1
                        """,
                        lead['id'], final_status, final_step, peer_id
                    )

                    # E. Update Campaign Stats
                    await db.execute(
                        "UPDATE campaigns SET completed_leads = completed_leads + 1 WHERE id = $1",
                        campaign_id
                    )

                    # F. Log the Action
                    await db.execute(
                        """
                        INSERT INTO campaign_logs (campaign_id, lead_id, account_id, action, details)
                        VALUES ($1, $2, $3, $4, $5)
                        """,
                        campaign_id, lead['id'], account_id, action_type, f"Message sent (Step {current_step}) via account {account_id}"
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
                        INSERT INTO campaign_logs (campaign_id, lead_id, account_id, action, details)
                        VALUES ($1, $2, $3, 'error', $4)
                        """,
                        campaign_id, lead['id'], account_id, error_str
                    )

            # 6. Check if campaign is now FULLY COMPLETED (no pending, no contacted leads left)
            has_active_leads = await db.fetchval(
                """
                SELECT EXISTS(
                    SELECT 1 FROM campaign_leads 
                    WHERE campaign_id = $1 AND status IN ('pending', 'contacted')
                )
                """,
                campaign_id
            )
            
            if not has_active_leads:
                logger.info(f"Campaign '{campaign['name']}' (ID: {campaign_id}) has finished all leads. Marking as COMPLETED.")
                await db.execute("UPDATE campaigns SET status = 'completed' WHERE id = $1", campaign_id)

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

campaign_service = CampaignService()
