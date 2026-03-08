import logging
from typing import Optional, Dict, Any
from database import db
from telethon_service import telethon_service
from websocket_manager import manager
from translation_service import translation_service

logger = logging.getLogger(__name__)


class AutoResponderService:
    def __init__(self):
        self.enabled = True
    
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
            
            if not rules:
                return False
            
            # Get account's source and target languages
            account = await db.fetchrow(
                "SELECT source_language, target_language FROM telegram_accounts WHERE id = $1",
                account_id
            )
            source_language = account['source_language'] if account else 'auto'
            target_language = account['target_language'] if account else 'en'
            
            # Check each rule for a match
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
