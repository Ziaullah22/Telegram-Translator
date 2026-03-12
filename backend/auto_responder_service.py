import logging
from typing import Optional, Dict, Any
from database import db
from telethon_service import telethon_service
from websocket_manager import manager
from translation_service import translation_service

logger = logging.getLogger(__name__)


# Central service for matching incoming messages against keywords and dispatching appropriate replies
class AutoResponderService:
    # Initialize the auto-responder and enable it by default
    def __init__(self):
        self.enabled = True
    
    # Evaluate incoming messages against user-defined rules and trigger a translation-aware response if a keyword matches
    async def check_and_respond(self, message_data: Dict[str, Any], user_id: int) -> bool:
        """
        Check if message matches any auto-responder rules and send response if matched.
        Returns True if a response was sent, False otherwise.
        """
        if not self.enabled:
            return False
        
        # Only respond to incoming messages (not outgoing)
        if message_data.get('is_outgoing', False):
            return False
        
        account_id = message_data.get('account_id')
        message_text = message_data.get('text', '').strip()
        
        if not account_id or not message_text:
            return False
        
        try:
            # Get active rules for this user, ordered by priority
            rules = await db.fetch(
                """
                SELECT id, name, keywords, response_text, language, media_type, media_file_path, priority
                FROM auto_responder_rules
                WHERE user_id = $1 AND is_active = true
                ORDER BY priority DESC, id ASC
                """,
                user_id,
            )
            rules = rules or []
            
            # Get account's source and target languages
            account = await db.fetchrow(
                "SELECT source_language, target_language FROM telegram_accounts WHERE id = $1",
                account_id
            )
            source_language = account['source_language'] if account else 'auto'
            target_language = account['target_language'] if account else 'en'
            
            # 1. NEW: Check for Campaign-Specific Keywords first
            peer_id = message_data.get('peer_id')
            peer_username = message_data.get('sender_username') or str(peer_id)
            
            campaign_lead = await db.fetchrow(
                """
                SELECT l.id, l.campaign_id, l.current_step, l.assigned_account_id,
                       s.keywords, s.response_text as step_response, s.keyword_response_text,
                       s.wait_time_hours, s.id as step_id, s.next_step as step_next_step,
                       (SELECT MAX(step_number) FROM campaign_steps WHERE campaign_id = l.campaign_id) as max_step
                FROM campaign_leads l
                JOIN campaign_steps s ON l.campaign_id = s.campaign_id 
                AND s.step_number = (
                    SELECT MAX(step_number) FROM campaign_steps 
                    WHERE campaign_id = l.campaign_id 
                    AND step_number <= CASE WHEN l.current_step = 0 THEN 1 ELSE l.current_step END
                )
                WHERE (l.telegram_id = $1 OR l.telegram_identifier = $2) 
                AND l.assigned_account_id = $3
                AND l.status IN ('contacted', 'replied', 'completed')
                """,
                peer_id, peer_username, account_id
            )

            # Also handle leads at step 0 (received initial message, now replying)
            # Step 0 has no campaign_steps row, so above query returns nothing.
            # We need to grab Step 1 keywords for these leads.
            if not campaign_lead:
                step0_lead = await db.fetchrow(
                    """
                    SELECT l.id, l.campaign_id, l.current_step, l.assigned_account_id,
                           (SELECT MAX(step_number) FROM campaign_steps WHERE campaign_id = l.campaign_id) as max_step
                    FROM campaign_leads l
                    WHERE (l.telegram_id = $1 OR l.telegram_identifier = $2)
                    AND l.assigned_account_id = $3
                    AND l.status IN ('contacted', 'replied')
                    AND l.current_step = 0
                    """,
                    peer_id, peer_username, account_id
                )
                if step0_lead:
                    # Fetch Step 1 definition for this campaign
                    step1 = await db.fetchrow(
                        "SELECT keywords, response_text, keyword_response_text, next_step FROM campaign_steps WHERE campaign_id = $1 AND step_number = 1",
                        step0_lead['campaign_id']
                    )
                    if step1:
                        # Build a synthetic campaign_lead object for keyword processing
                        campaign_lead = {
                            'id': step0_lead['id'],
                            'campaign_id': step0_lead['campaign_id'],
                            'current_step': 0,
                            'max_step': step0_lead['max_step'],
                            'keywords': step1['keywords'],
                            'step_response': step1['response_text'],
                            'keyword_response_text': step1['keyword_response_text'],
                            'step_next_step': step1['next_step'],
                        }

            if campaign_lead:
                campaign_lead = dict(campaign_lead)
            
            if campaign_lead and campaign_lead['keywords']:
                import json
                try:
                    keywords_list = json.loads(campaign_lead['keywords']) if isinstance(campaign_lead['keywords'], str) else campaign_lead['keywords']
                except Exception:
                    keywords_list = []
                    
                message_lower = message_text.lower()
                matched_camp_keyword = None
                forced_next_step = None

                for kw_item in keywords_list:
                    # kw_item can be a string or a dict {"text": "hi", "next_step": 2}
                    kw_text = kw_item["text"] if isinstance(kw_item, dict) else kw_item
                    if kw_text.lower() in message_lower:
                        matched_camp_keyword = kw_text
                        forced_next_step = kw_item.get("next_step") if isinstance(kw_item, dict) else None
                        break
                
                if matched_camp_keyword:
                    # Determine target step
                    if forced_next_step is not None:
                        target_step_num = forced_next_step
                        logger.info(f"Intelligent Branching! Keyword '{matched_camp_keyword}' forced jump to step {target_step_num}")
                    elif campaign_lead.get('step_next_step') is not None:
                        target_step_num = campaign_lead['step_next_step']
                        logger.info(f"Intelligent Branching! Step default jump to step {target_step_num}")
                    else:
                        # STANDARD: If no jump specified, we send the message of the step that MATCHED
                        # which is campaign_lead['current_step']
                        target_step_num = campaign_lead['current_step']
                    
                    # CAP or Loop back to Step 1 logic
                    if target_step_num > campaign_lead['max_step']:
                        target_step_num = campaign_lead['max_step']

                    # FETCH THE ACTUAL MESSAGE FOR THE TARGET STEP
                    # This ensures we send the "Price" message if jumping to the "Price Step"
                    target_step_data = await db.fetchrow(
                        "SELECT response_text FROM campaign_steps WHERE campaign_id = $1 AND step_number = $2",
                        campaign_lead['campaign_id'], target_step_num
                    )
                    
                    # PRIORITIZE Keyword Response of the MATCHING step
                    final_response_text = campaign_lead.get('keyword_response_text') or campaign_lead.get('step_response')
                    
                    # Optional: If jumping to a step that is NOT himself, we MIGHT want target step message?
                    # But for "Starting over" context, we want the current step's reply.
                    
                    logger.info(f"Campaign Keyword Match! Lead {campaign_lead['id']} said '{matched_camp_keyword}'. Sending step {target_step_num} response.")
                    
                    # 1. Prepare translation
                    target_msg_text = final_response_text
                    if source_language != target_language:
                        try:
                            translation = await translation_service.translate_text(
                                final_response_text,
                                target_language,
                                source_language
                            )
                            target_msg_text = translation['translated_text']
                        except Exception as e:
                            logger.error(f"Failed to translate campaign auto-response: {e}")

                    # 2. UPDATE STATE FIRST (Locking the lead to prevent double-sends)
                    # We move the lead to 'target_step_num'. 
                    # This means the NEXT thing the timer will fire is the follow-up for that step.
                    next_followup_step = target_step_num
                    
                    # If target_step_num is 0, it's a loop back to the very beginning (Initial Message)
                    if target_step_num == 0:
                        # SET last_contact_at TO 1 HOUR AGO to ensure the worker fires IMMEDIATELY
                        await db.execute(
                            "UPDATE campaign_leads SET current_step = 0, status = 'pending', last_contact_at = NOW() - interval '1 hour' WHERE id = $1",
                            campaign_lead['id']
                        )
                        # Ensure the campaign is marked as 'running' again if it was 'completed'
                        await db.execute("UPDATE campaigns SET status = 'running' WHERE id = $1", campaign_lead['campaign_id'])
                        logger.info(f"Lead {campaign_lead['id']} looped back to Initial Message (Step 0). Campaign Reactivated.")
                    else:
                        # Check if this target step actually exists
                        exists = await db.fetchval(
                            "SELECT EXISTS(SELECT 1 FROM campaign_steps WHERE campaign_id = $1 AND step_number = $2)",
                            campaign_lead['campaign_id'], target_step_num
                        )
                        
                        if not exists:
                            # If jumping to a non-existent step, it's effectively completing
                            await db.execute(
                                "UPDATE campaign_leads SET current_step = $2, status = 'completed', last_contact_at = NOW() WHERE id = $1",
                                campaign_lead['id'], target_step_num
                            )
                            logger.info(f"Lead {campaign_lead['id']} completed (jumped to non-existent step {target_step_num}).")
                        else:
                            await db.execute(
                                "UPDATE campaign_leads SET current_step = $2, status = 'contacted', last_contact_at = NOW() WHERE id = $1",
                                campaign_lead['id'], target_step_num
                            )
                            logger.info(f"Lead {campaign_lead['id']} moved to Step {target_step_num}.")


                    # 3. Send Campaign Response
                    success = await self._send_response(
                        account_id,
                        peer_id,
                        target_msg_text,
                        final_response_text,
                        source_language, 
                        None, None
                    )
                    
                    if success:
                        # Log it
                        await db.execute(
                            "INSERT INTO campaign_logs (campaign_id, lead_id, account_id, action, details) VALUES ($1, $2, $3, 'keyword_reply', $4)",
                            campaign_lead['campaign_id'], campaign_lead['id'], account_id, f"Auto-replied to keyword: {matched_camp_keyword}. Moved to Step {next_followup_step}"
                        )
                        return True

            # 2. Check each global rule for a match
            for rule in rules:
                matched_keyword = None
                rule_language = rule['language']
                
                # Translate incoming message to rule's language for matching
                translated_message = message_text
                if rule_language != source_language:
                    try:
                        translation_result = await translation_service.translate_text(
                            message_text,
                            target_language=rule_language,
                            source_language=source_language
                        )
                        translated_message = translation_result.get('translated_text', message_text)
                        logger.debug(f"Translated message to {rule_language}: {translated_message}")
                    except Exception as e:
                        logger.warning(f"Failed to translate message for rule matching: {e}")
                        # Fall back to original message
                        translated_message = message_text
                
                # Check if any keyword is contained in the translated message (case-insensitive)
                message_lower = translated_message.lower()
                for keyword in rule['keywords']:
                    if keyword.lower() in message_lower:
                        matched_keyword = keyword
                        break
                
                if matched_keyword:
                    logger.info(f"Auto-responder rule {rule['id']} matched keyword '{matched_keyword}' in message")
                    
                    # Translate response to account's source language (the language user speaks)
                    original_response = rule['response_text']
                    translated_response = rule['response_text']
                    
                    if source_language != rule_language:
                        try:
                            translation_result = await translation_service.translate_text(
                                rule['response_text'],
                                target_language=source_language,
                                source_language=rule_language
                            )
                            translated_response = translation_result.get('translated_text', rule['response_text'])
                            logger.debug(f"Translated response to {source_language}: {translated_response}")
                        except Exception as e:
                            logger.warning(f"Failed to translate response: {e}")
                            # Fall back to original response
                            translated_response = rule['response_text']
                    
                    # Send the auto-response
                    success = await self._send_response(
                        account_id,
                        message_data['peer_id'],
                        translated_response,
                        original_response,
                        rule_language,
                        rule['media_type'],
                        rule['media_file_path']
                    )
                    
                    if success:
                        # Log the trigger
                        await self._log_trigger(
                            rule['id'],
                            message_data,
                            matched_keyword
                        )
                        return True
                    
            return False
            
        except Exception as e:
            logger.error(f"Error in auto-responder check: {e}")
            return False
    
    # Actually dispatch the automated reply to the contact via Telethon, handling media attachments and database saving
    async def _send_response(
        self,
        account_id: int,
        peer_id: int,
        translated_text: str,
        original_text: str,
        source_lang: str,
        media_type: Optional[str],
        media_file_path: Optional[str]
    ) -> bool:
        """Send the auto-response message"""
        try:
            session = await telethon_service.get_session(account_id)
            if not session or not session.is_connected:
                logger.error(f"Session not connected for account {account_id}")
                return False
            
            # Send message with or without media (send translated text to customer)
            if media_type and media_file_path:
                # Send with media
                sent_message = await session.client.send_file(
                    peer_id,
                    media_file_path,
                    caption=translated_text
                )
            else:
                # Send text only
                sent_message = await session.client.send_message(
                    peer_id,
                    translated_text
                )
            
            # Get conversation_id
            conversation = await db.fetchrow(
                """
                SELECT id FROM conversations
                WHERE telegram_account_id = $1 AND telegram_peer_id = $2
                """,
                account_id,
                peer_id
            )
            
            if not conversation:
                logger.warning(f"Conversation not found for saving auto-reply")
                return True  # Still return True as message was sent
            
            # Get account info for target language
            account = await db.fetchrow(
                "SELECT target_language FROM telegram_accounts WHERE id = $1",
                account_id
            )
            
            # Determine message type
            msg_type = 'auto_reply'
            
            # Extract media info from sent message
            has_media = bool(media_type and media_file_path)
            media_file_name = None
            if has_media and media_file_path:
                import os
                media_file_name = os.path.basename(media_file_path)
            
            # Save the auto-reply message to database with both original and translated text
            message_id = await db.fetchval(
                """
                INSERT INTO messages
                (conversation_id, telegram_message_id, sender_user_id, sender_name, 
                 sender_username, type, original_text, translated_text, source_language,
                 target_language, created_at, is_outgoing, has_media, media_file_name)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING id
                """,
                conversation['id'],
                sent_message.id,
                sent_message.sender_id,
                'Auto-Responder',
                'auto_responder',
                msg_type,
                original_text,  # Original response in rule's language
                translated_text,  # Translated to customer's language
                source_lang,  # Rule's language
                account['target_language'] if account else 'en',
                sent_message.date,
                True,  # is_outgoing
                has_media,
                media_file_name
            )
            
            # Broadcast the message via WebSocket
            await manager.send_to_account(
                {
                    "type": "new_message",
                    "message": {
                        "id": message_id,
                        "conversation_id": conversation['id'],
                        "telegram_message_id": sent_message.id,
                        "sender_user_id": sent_message.sender_id,
                        "sender_name": "Auto-Responder",
                        "sender_username": "auto_responder",
                        "type": msg_type,
                        "original_text": original_text,  # Original in rule's language
                        "translated_text": translated_text,  # Translated to customer's language
                        "source_language": source_lang,  # Rule's language
                        "target_language": account['target_language'] if account else 'en',
                        "created_at": sent_message.date.isoformat() if sent_message.date else None,
                        "is_outgoing": True,
                        "has_media": has_media,
                        "media_file_name": media_file_name
                    }
                },
                account_id,
                (await db.fetchval("SELECT user_id FROM telegram_accounts WHERE id = $1", account_id))
            )
            
            logger.info(f"Sent auto-response to peer {peer_id}, message_id: {message_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send auto-response: {e}")
            return False
    
    # Persist a log record in the database whenever an auto-responder rule successfully fires
    async def _log_trigger(
        self,
        rule_id: int,
        message_data: Dict[str, Any],
        matched_keyword: str
    ):
        """Log the auto-responder trigger"""
        try:
            # Get conversation_id
            conversation = await db.fetchrow(
                """
                SELECT id FROM conversations
                WHERE telegram_account_id = $1 AND telegram_peer_id = $2
                """,
                message_data['account_id'],
                message_data['peer_id']
            )
            
            if not conversation:
                logger.warning(f"Conversation not found for logging auto-responder trigger")
                return
            
            # Get incoming message_id
            incoming_message = await db.fetchrow(
                """
                SELECT id FROM messages
                WHERE conversation_id = $1 AND telegram_message_id = $2
                ORDER BY created_at DESC
                LIMIT 1
                """,
                conversation['id'],
                message_data['message_id']
            )
            
            if not incoming_message:
                logger.warning(f"Incoming message not found for logging")
                return
            
            # Log the trigger
            await db.execute(
                """
                INSERT INTO auto_responder_logs
                (rule_id, conversation_id, incoming_message_id, matched_keyword)
                VALUES ($1, $2, $3, $4)
                """,
                rule_id,
                conversation['id'],
                incoming_message['id'],
                matched_keyword
            )
            
        except Exception as e:
            logger.error(f"Failed to log auto-responder trigger: {e}")


# Global instance
auto_responder_service = AutoResponderService()
