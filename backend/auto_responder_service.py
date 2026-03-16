import logging
import json
from typing import Optional, Dict, Any, List, cast
from database import db
from telethon_service import telethon_service
from websocket_manager import manager
from translation_service import translation_service
from datetime import datetime, timezone

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
            
            # Find if this sender is a lead in an active campaign
            # We look for contacted/replied leads to see if they are responding to our outreach
            campaign_lead_row = await db.fetchrow(
                """
                SELECT cl.*, c.name as campaign_name, c.initial_message, 
                       c.negative_keywords::text as negative_keywords_json,
                       c.kill_switch_enabled, 
                       c.auto_replies as global_auto_replies,
                       (SELECT MAX(step_number) FROM campaign_steps WHERE campaign_id = cl.campaign_id) as max_step,
                       s.keywords::text as step_keywords, s.response_text as step_response, 
                       s.next_step as step_next_step, s.keyword_response_text, s.auto_replies as step_auto_replies
                FROM campaign_leads cl
                JOIN campaigns c ON cl.campaign_id = c.id
                LEFT JOIN campaign_steps s ON cl.campaign_id = s.campaign_id AND cl.current_step = s.step_number
                WHERE (cl.telegram_id = $1 OR cl.telegram_identifier = $2)
                AND cl.assigned_account_id = $3
                AND c.status = 'running'
                AND cl.status IN ('contacted', 'replied', 'completed')
                """,
                peer_id, peer_username, account_id
            )

            campaign_lead = None
            if campaign_lead_row:
                campaign_lead = dict(campaign_lead_row)
                
                # --- UNIVERSAL ANALYTICS: Track ANY reply (First response only) ---
                if campaign_lead.get('responded_at') is None and campaign_lead.get('first_contacted_at'):
                    try:
                        resp_time = datetime.now(timezone.utc) - campaign_lead['first_contacted_at']
                        resp_seconds = int(resp_time.total_seconds())
                        
                        await db.execute(
                            """
                            UPDATE campaign_leads 
                            SET responded_at = NOW(),
                                response_time_seconds = $2,
                                replied_at_step = $3,
                                status = 'replied',
                                telegram_id = $4
                            WHERE id = $1
                            """,
                            campaign_lead['id'], resp_seconds, campaign_lead['current_step'], peer_id
                        )
                        # Increment replied stats for campaign
                        await db.execute(
                            "UPDATE campaigns SET replied_leads = replied_leads + 1 WHERE id = $1",
                            campaign_lead['campaign_id']
                        )
                        # Log it
                        await db.execute(
                            "INSERT INTO campaign_logs (campaign_id, lead_id, account_id, action, details) VALUES ($1, $2, $3, 'lead_replied', $4)",
                            campaign_lead['campaign_id'], campaign_lead['id'], account_id, f"Lead replied with: {message_text[:50]}..."
                        )
                        # Update local dict for further processing
                        campaign_lead['status'] = 'replied'
                        campaign_lead['responded_at'] = datetime.now(timezone.utc)
                    except Exception as anal_err:
                        logger.error(f"Failed to save response analytics: {anal_err}")

            if campaign_lead:
                # Prepare keywords for matching from the step
                # (Synthesize the structure the rest of the code expects)
                kw_raw = campaign_lead.get('step_keywords')
                try:
                    keywords_list = json.loads(str(kw_raw)) if isinstance(kw_raw, str) else cast(List[Any], kw_raw)
                except Exception:
                    keywords_list = []
                
                campaign_lead['keywords'] = keywords_list
                
                # Match against all available versions (Original Lead text AND Operator translation)
                text_versions = [
                    message_text.lower(),
                    (message_data.get('translated_text') or "").lower(),
                    (message_data.get('operator_text') or "").lower()
                ]
                # Filter out empty and redundant versions
                text_versions = list(set([v for v in text_versions if v.strip()]))
                    
                matched_camp_keyword = None
                forced_next_step = None
                specific_reply = None

                # 1. Check Step-Specific multi-replies (PRIORITY 1)
                step_replies_list = []
                try:
                    raw_step_replies = campaign_lead.get('step_auto_replies')
                    if raw_step_replies:
                        step_replies_list = json.loads(str(raw_step_replies)) if isinstance(raw_step_replies, str) else raw_step_replies
                except Exception: pass

                if isinstance(step_replies_list, list):
                    for pair in step_replies_list:
                        if not isinstance(pair, dict): continue
                        for kw in pair.get('keywords', []):
                            kw_lower = str(kw).lower()
                            if any(kw_lower in v for v in text_versions):
                                matched_camp_keyword = str(kw)
                                specific_reply = pair.get('reply')
                                forced_next_step = pair.get('next_step')
                                break
                        if matched_camp_keyword: break

                # 2. Check Global multi-replies (PRIORITY 2)
                if not matched_camp_keyword:
                    global_replies_list = []
                    try:
                        raw_global_replies = campaign_lead.get('global_auto_replies')
                        if raw_global_replies:
                            global_replies_list = json.loads(str(raw_global_replies)) if isinstance(raw_global_replies, str) else raw_global_replies
                    except Exception: pass

                    if isinstance(global_replies_list, list):
                        for pair in global_replies_list:
                            if not isinstance(pair, dict): continue
                            for kw in pair.get('keywords', []):
                                kw_lower = str(kw).lower()
                                if any(kw_lower in v for v in text_versions):
                                    matched_camp_keyword = str(kw)
                                    specific_reply = pair.get('reply')
                                    forced_next_step = pair.get('next_step')
                                    break
                            if matched_camp_keyword: break

                # 3. Fallback to Legacy Keywords (PRIORITY 3)
                if not matched_camp_keyword:
                    for kw_item in keywords_list:
                        # kw_item can be a string or a dict {"text": "hi", "next_step": 2}
                        kw_text = kw_item["text"] if isinstance(kw_item, dict) else str(kw_item)
                        kw_lower = kw_text.lower()
                        if any(kw_lower in v for v in text_versions):
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
                        # PROGRESSION: Ensure lead moves FORWARD.
                        # If they are at Step 0, they MUST go to Step 1.
                        # If they are at Step N, they go to N+1.
                        target_step_num = min(campaign_lead['max_step'], campaign_lead['current_step'] + 1)
                        # Bulletproof: If they were stuck at 0, force them to 1 if Step 1 exists
                        if target_step_num == 0 and campaign_lead['max_step'] > 0:
                            target_step_num = 1
                        logger.info(f"Standard Progression! Keyword match moved lead from {campaign_lead['current_step']} to step {target_step_num}")
                    
                    # Ensure within bounds
                    if target_step_num < 0: target_step_num = 0

                    # FETCH THE ACTUAL MESSAGE FOR THE TARGET STEP (for fallback use)
                    target_step_data = await db.fetchrow(
                        "SELECT response_text, keyword_response_text FROM campaign_steps WHERE campaign_id = $1 AND step_number = $2",
                        campaign_lead['campaign_id'], target_step_num
                    )
                    
                    # Determine response text priority:
                    # 1. Specific Reply from the matched pair (NEW)
                    # 2. Keyword Response (AI Box 2) of the step that MATCHED
                    # 3. Keyword Response of the TARGET step (if jumping)
                    # 4. Follow-up Text (Box 1) of the TARGET step
                    # 5. Initial Message (if jumping to 0)
                    
                    final_response_text = specific_reply
                    
                    if not final_response_text:
                        final_response_text = campaign_lead.get('keyword_response_text')
                    
                    if not final_response_text and target_step_data:
                        final_response_text = target_step_data.get('keyword_response_text') or target_step_data.get('response_text')
                    
                    if not final_response_text and target_step_num == 0:
                        # Special Case: Loop back to start
                        camp_info = await db.fetchrow("SELECT initial_message FROM campaigns WHERE id = $1", campaign_lead['campaign_id'])
                        final_response_text = camp_info['initial_message'] if camp_info else None
 
                    if not final_response_text:
                        # Absolute fallback
                        final_response_text = cast(Optional[str], campaign_lead.get('step_response'))
                    
                    final_response_text = cast(Optional[str], final_response_text)
                    logger.info(f"Campaign Keyword Match! Lead {campaign_lead.get('id')} said '{matched_camp_keyword}'. Moving to step {target_step_num}.")

                    # ANALYTICS: Track response time if this is the first reply
                    if campaign_lead.get('responded_at') is None and campaign_lead.get('first_contact_at'):
                        try:
                            resp_time = datetime.now(timezone.utc) - campaign_lead['first_contact_at']
                            resp_seconds = int(resp_time.total_seconds())
                            
                            await db.execute(
                                """
                                UPDATE campaign_leads 
                                SET responded_at = NOW(),
                                    response_time_seconds = $2,
                                    replied_at_step = $3,
                                    status = 'replied'
                                WHERE id = $1
                                """,
                                campaign_lead['id'], resp_seconds, campaign_lead['current_step']
                            )
                            # Increment replied stats for campaign
                            await db.execute(
                                "UPDATE campaigns SET replied_leads = replied_leads + 1 WHERE id = $1",
                                campaign_lead['campaign_id']
                            )
                        except Exception as anal_err:
                            logger.error(f"Failed to save response analytics: {anal_err}")
                    
                    # 1. Prepare translation
                    target_msg_text = final_response_text
                    if source_language != target_language:
                        try:
                            translation = await translation_service.translate_text(
                                final_response_text,
                                source_language,
                                target_language
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
                        logger.info(f"Lead {campaign_lead['id']} looped back to Initial Message (Step 0).")
                    else:
                        # Determine if this match reaches the end
                        is_at_end = target_step_num >= campaign_lead['max_step']
                        new_status = 'completed' if is_at_end else 'replied'
                        
                        await db.execute(
                            "UPDATE campaign_leads SET current_step = $2, status = $3, last_contact_at = NOW() WHERE id = $1",
                            campaign_lead['id'], target_step_num, new_status
                        )
                        logger.info(f"Lead {campaign_lead['id']} moved to Step {target_step_num} ({new_status}) via keyword match.")


                    # 3. Send Campaign Response
                    success = await self._send_response(
                        account_id,
                        peer_id,
                        cast(Optional[str], target_msg_text),
                        cast(Optional[str], final_response_text),
                        cast(Optional[str], target_language), # Rule Language
                        cast(Optional[str], source_language), # Recipient Language
                        None, None
                    )
                    
                    if success:
                        # Log it
                        await db.execute(
                            "INSERT INTO campaign_logs (campaign_id, lead_id, account_id, action, details) VALUES ($1, $2, $3, 'keyword_reply', $4)",
                            campaign_lead['campaign_id'], campaign_lead['id'], account_id, f"Auto-replied to keyword: {matched_camp_keyword}. Moved to Step {next_followup_step}"
                        )
                        
                        # --- REAL-TIME ANALYTICS PUSH ---
                        await manager.send_personal_message({
                            "type": "campaign_stats_update",
                            "campaign_id": campaign_lead['campaign_id']
                        }, (await db.fetchval("SELECT user_id FROM telegram_accounts WHERE id = $1", account_id)))
                        
                        return True

            # 2. Check each global rule for a match
            for rule in rules:
                matched_keyword = None
                rule_language = rule['language']
                
                # Translate incoming message to rule's language for matching
                translated_message = message_text
                # Use 'auto' as source language since message_text is the raw incoming message from Lead
                if rule_language != 'auto': 
                    try:
                        translation_result = await translation_service.translate_text(
                            message_text,
                            target_language=rule_language,
                            source_language='auto'
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
                        source_language,
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
        account_id: Any,
        peer_id: Any,
        translated_text: Optional[str],
        original_text: Optional[str],
        source_lang: Optional[str], # Language of original_text (Operator)
        target_lang: Optional[str], # Language of translated_text (Recipient)
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
                source_lang,  
                target_lang,
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
                        "original_text": original_text,  
                        "translated_text": translated_text,  
                        "source_language": source_lang,  
                        "target_language": target_lang,
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
        rule_id: Any,
        message_data: Dict[str, Any],
        matched_keyword: Optional[str]
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
