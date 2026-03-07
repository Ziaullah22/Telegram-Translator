import asyncio
import os
import logging
from typing import Dict, Optional, List, Callable
from telethon import TelegramClient, events, functions, types
from telethon.tl.types import User, Chat, Channel, Message, PeerUser, PeerChat, PeerChannel
from telethon.errors import FloodWaitError, UserDeactivatedError, AuthKeyUnregisteredError, SessionPasswordNeededError
from telethon.sessions import SQLiteSession
from app.core.config import settings
from database import db
import json
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


# Using standard SQLiteSession as WAL mode can sometimes cause issues during intense reloads on Windows
from telethon.sessions import SQLiteSession

class TelegramSession:
    def __init__(self, account_id: int, telegram_api_id: int, telegram_api_hash: str, session_filepath: str):
        self.account_id = account_id
        self.client: Optional[TelegramClient] = None
        self.telegram_api_id = telegram_api_id
        self.telegram_api_hash = telegram_api_hash
        self.is_connected = False
        self.session_filepath = session_filepath
        # Rate limiting: track last message time
        self.last_message_time = None
        self.min_message_interval = 1.0  # Minimum 1 second between messages
        # Entity cache: peer_id -> entity (populated from dialogs on connect)
        self.entity_cache: Dict[int, object] = {}
        self.telegram_user_id: Optional[int] = None

    async def connect(self):
        try:
            # Standard SQLite session. Telethon handles the file locking.
            # We strip .session from filepath because Telethon appends it automatically.
            session_id = self.session_filepath
            if session_id.endswith('.session'):
                session_id = session_id[:-8]

            self.client = TelegramClient(
                session_id,
                self.telegram_api_id,
                self.telegram_api_hash,
                device_model="Desktop",
                system_version="Windows 10",
                app_version="1.0.0"
            )

            await self.client.connect()
            
            # Check if user is authorized
            if not await self.client.is_user_authorized():
                logger.error(f"Session {self.account_id} is not authorized. Please re-authenticate.")
                await self.client.disconnect()
                self.is_connected = False
                return False

            self.is_connected = True
            logger.info(f"Connected to Telegram Account. ID: {self.account_id}")

            # Cache the account's own telegram ID for faster admin operations
            try:
                # Use a timeout for get_me to prevent startup hangs
                me = await asyncio.wait_for(self.client.get_me(), timeout=10.0)
                if me:
                    self.telegram_user_id = me.id
            except Exception as e:
                logger.warning(f"Could not get 'me' for account {self.account_id} during connect: {e}")

            # Pre-warm entity cache using SAME ID format as our DB (_get_peer_id)
            try:
                # limit the number of dialogs to fetch to keep connection fast
                async for dialog in self.client.iter_dialogs(limit=100):
                    if dialog.entity:
                        db_peer_id = self._get_peer_id(dialog.entity)
                        if db_peer_id:
                            self.entity_cache[db_peer_id] = dialog.entity
                        # Also index by raw entity.id as fallback
                        raw_id = getattr(dialog.entity, 'id', None)
                        if raw_id and raw_id != db_peer_id:
                            self.entity_cache[raw_id] = dialog.entity
                logger.info(f"Entity cache warmed: {len(self.entity_cache)} entries for account {self.account_id}")
            except Exception as e:
                logger.warning(f"Could not warm entity cache: {e}")

            return True

        except UserDeactivatedError:
            self.is_connected = False
            logger.error(f"Account {self.account_id} is banned/deactivated.")
            raise Exception("This Telegram account has been banned or deactivated by Telegram.")
        except AuthKeyUnregisteredError:
            self.is_connected = False
            logger.error(f"Session for account {self.account_id} is expired.")
            raise Exception("The session is invalid or has expired. Please export a new TData zip.")
        except SessionPasswordNeededError:
            self.is_connected = False
            logger.error(f"Account {self.account_id} requires 2FA password which is not supported in TData direct login yet.")
            raise Exception("This account has 2-Step Verification enabled. Please disable it or use a TData without it.")
        except Exception as e:
            error_msg = str(e).lower()
            logger.error(f"Failed to connect session {self.account_id}: {e}")
            self.is_connected = False
            
            # Identify other specific Telegram errors if any
            if "deactivated" in error_msg or "banned" in error_msg:
                raise Exception("This Telegram account has been banned or deactivated by Telegram.")
            
            # Re-raise the original or a generic exception
            raise Exception(f"Telegram connection failed: {str(e)}")

    async def disconnect(self):
        if self.client:
            await self.client.disconnect()
            self.is_connected = False
            logger.info(f"Disconnected session: {self.account_id}")

    async def get_dialogs(self, limit: int = 50):
        if not self.client or not self.is_connected:
            return []

        try:
            dialogs = await self.client.get_dialogs(limit=limit)
            result = []

            for dialog in dialogs:
                peer_id = self._get_peer_id(dialog.entity)
                conv_type = self._get_conversation_type(dialog.entity)

                result.append({
                    "peer_id": peer_id,
                    "title": dialog.title or dialog.name,
                    "type": conv_type,
                    "unread_count": dialog.unread_count,
                    "last_message_date": dialog.date
                })

            return result
        except Exception as e:
            logger.error(f"Error fetching dialogs for {self.account_id}: {e}")
            return []

    async def get_messages(self, peer_id: int, limit: int = 50):
        if not self.client or not self.is_connected:
            return []

        try:
            messages = await self.client.get_messages(peer_id, limit=limit)
            result = []

            for msg in messages:
                if msg.text:
                    result.append({
                        "message_id": msg.id,
                        "text": msg.text,
                        "sender_id": msg.sender_id,
                        "date": msg.date,
                        "is_outgoing": msg.out
                    })

            return result
        except Exception as e:
            logger.error(f"Error fetching messages for {self.account_id}: {e}")
            return []

    async def get_unread_messages(self):
        """Get unread messages from all dialogs"""
        if not self.client or not self.is_connected:
            return []

        try:
            # Check if client is authorized
            if not await self.client.is_user_authorized():
                logger.error(f"Client not authorized for account {self.account_id}")
                self.is_connected = False
                return []

            logger.info(f"Getting unread messages for account {self.account_id}")
            dialogs = await self.client.get_dialogs()
            unread_messages = []

            for dialog in dialogs:
                if dialog.unread_count > 0:
                    try:
                        # Get recent messages from this dialog
                        messages = await self.client.get_messages(
                            dialog.entity, 
                            limit=min(dialog.unread_count, 10)  # Limit to avoid too many requests
                        )
                        
                        for msg in reversed(messages):
                            if not msg.out:  # Only incoming messages (text or media)
                                try:
                                    # Get sender info safely
                                    sender_info = await self._get_sender_info_safe(msg.sender_id)
                                    
                                    # Determine message type, extract filename and duration
                                    msg_type = "text"
                                    has_media = False
                                    media_filename = None
                                    duration = None
                                    
                                    if msg.photo:
                                        msg_type = "photo"
                                        has_media = True
                                        media_filename = f"photo_{msg.id}.jpg"
                                    elif msg.video:
                                        msg_type = "video"
                                        has_media = True
                                        from telethon.tl.types import DocumentAttributeVideo
                                        if msg.document and hasattr(msg.document, 'attributes'):
                                            for attr in msg.document.attributes:
                                                if hasattr(attr, 'file_name'):
                                                    media_filename = attr.file_name
                                                if isinstance(attr, DocumentAttributeVideo):
                                                    duration = getattr(attr, 'duration', None)
                                        if not media_filename:
                                            media_filename = f"video_{msg.id}.mp4"
                                    elif msg.voice:
                                        msg_type = "voice"
                                        from telethon.tl.types import DocumentAttributeAudio
                                        has_media = True
                                        media_filename = f"voice_{msg.id}.ogg"
                                        if msg.document and hasattr(msg.document, 'attributes'):
                                            for attr in msg.document.attributes:
                                                if isinstance(attr, DocumentAttributeAudio):
                                                    duration = getattr(attr, 'duration', None)
                                    elif msg.document:
                                        msg_type = "document"
                                        has_media = True
                                        if hasattr(msg.document, 'attributes'):
                                            for attr in msg.document.attributes:
                                                if hasattr(attr, 'file_name'):
                                                    media_filename = attr.file_name
                                                    break
                                        if not media_filename:
                                            media_filename = f"document_{msg.id}"
                                    
                                    # Get conversation type
                                    conversation_type = self._get_conversation_type(dialog.entity)
                                    
                                    unread_messages.append({
                                        "message_id": msg.id,
                                        "text": msg.text or msg.message or "",
                                        "sender_id": msg.sender_id,
                                        "sender_name": sender_info.get("name"),
                                        "sender_username": sender_info.get("username"),
                                        "peer_id": self._get_peer_id(dialog.entity),
                                        "peer_title": dialog.title if dialog.title is not None else sender_info.get("name"),
                                        "conversation_type": conversation_type,
                                        "date": msg.date,
                                        "is_outgoing": msg.out,
                                        "type": msg_type,
                                        "has_media": has_media,
                                        "media_filename": media_filename,
                                        "media_thumbnail": await self._extract_thumbnail(msg),
                                        "media_duration": duration
                                    })

                                    await self.client.send_read_acknowledge(dialog.entity, max_id=msg.id)
                                except Exception as e:
                                    logger.error(f"Error processing message {msg.id}: {e}")
                                    continue
                    except Exception as e:
                        logger.error(f"Error getting messages from dialog {dialog.title if dialog.title is not None else sender_info.get('name')}: {e}")
                        continue
            return unread_messages
            
        except Exception as e:
            logger.error(f"Error fetching unread messages for {self.account_id}: {e}")
            # If it's an authorization error, mark as disconnected
            if "not registered" in str(e).lower() or "unauthorized" in str(e).lower():
                self.is_connected = False
            return []

    async def _get_sender_info_safe(self, sender_id):
        """Safely get sender info with proper error handling"""
        try:
            if sender_id:
                entity = await self.client.get_entity(sender_id)
                if isinstance(entity, User):
                    name_parts = []
                    if entity.first_name:
                        name_parts.append(entity.first_name)
                    if entity.last_name:
                        name_parts.append(entity.last_name)
                    
                    full_name = " ".join(name_parts) if name_parts else (entity.username or entity.phone or "Unknown")
                    
                    return {
                        "name": full_name,
                        "username": entity.username,
                        "phone": entity.phone
                    }
        except Exception as e:
            logger.error(f"Error getting sender info for {sender_id}: {e}")
        
        return {"name": "Unknown", "username": None, "phone": None}

    async def send_message(self, peer_id: int, text: str, max_retries: int = 3, reply_to: int = None):
        if not self.client or not self.is_connected:
            raise Exception("Client not connected")

        # Rate limiting: wait if needed
        if self.last_message_time:
            elapsed = (datetime.now() - self.last_message_time).total_seconds()
            if elapsed < self.min_message_interval:
                wait_time = self.min_message_interval - elapsed
                logger.debug(f"Rate limiting: waiting {wait_time:.2f}s before sending")
                await asyncio.sleep(wait_time)

        retry_count = 0
        while retry_count <= max_retries:
            try:
                message = await self.client.send_message(peer_id, text, reply_to=reply_to)
                self.last_message_time = datetime.now()  # Update last message time
                
                # Get current user information
                me = await self.client.get_me()
                
                return {
                    "message_id": message.id,
                    "text": message.text,
                    "date": message.date,
                    "is_outgoing": True,
                    "sender_user_id": me.id,
                    "sender_name": f"{me.first_name or ''} {me.last_name or ''}".strip() or me.username or "Unknown",
                    "sender_username": me.username
                }
            except FloodWaitError as e:
                wait_time = e.seconds
                if retry_count < max_retries:
                    logger.warning(f"FloodWaitError: Waiting {wait_time} seconds before retry {retry_count + 1}/{max_retries}")
                    await asyncio.sleep(wait_time)
                    retry_count += 1
                else:
                    logger.error(f"Max retries reached for account {self.account_id}. FloodWait: {wait_time}s")
                    raise Exception(f"Rate limit exceeded. Please wait {wait_time} seconds before sending more messages.")
            except Exception as e:
                logger.error(f"Error sending message for {self.account_id}: {e}")
                raise

    async def send_reaction(self, peer_id: int, message_id: int, emoji: str):
        """Send a reaction to a message"""
        if not self.client or not self.is_connected:
            raise Exception("Client not connected")
        
        try:
            # Sanitize emoji: strip variation selectors (U+FE0F) which often cause "Invalid reaction" errors
            sanitized_emoji = emoji.replace('\ufe0f', '') if emoji else None
            logger.info(f"Reacting with emoji: {emoji} (bytes: {emoji.encode('utf-8') if emoji else 'None'}) -> Sanitized: {sanitized_emoji} (bytes: {sanitized_emoji.encode('utf-8') if sanitized_emoji else 'None'})")
            
            # emoji can be None to remove reaction, but typically a string
            reaction = [types.ReactionEmoji(emoticon=sanitized_emoji)] if sanitized_emoji else []
            
            # Use get_input_entity to ensure we have a valid InputPeer correctly resolved
            try:
                peer = await self.client.get_input_entity(peer_id)
            except Exception as e:
                # Fallback to direct resolution if cache fails
                logger.warning(f"Input entity failed for {peer_id}, trying full get_entity: {e}")
                peer = await self.client.get_entity(peer_id)

            await self.client(functions.messages.SendReactionRequest(
                peer=peer,
                msg_id=message_id,
                reaction=reaction
            ))
        except Exception as e:
            logger.error(f"Error sending reaction for account {self.account_id}: {e}")
            raise

    async def send_media(self, peer_id: int, file_path: str, caption: str = "", max_retries: int = 3):
        """Send a media file (photo, video, document) to a peer"""
        if not self.client or not self.is_connected:
            raise Exception("Client not connected")

        # Rate limiting: wait if needed
        if self.last_message_time:
            elapsed = (datetime.now() - self.last_message_time).total_seconds()
            if elapsed < self.min_message_interval:
                wait_time = self.min_message_interval - elapsed
                logger.debug(f"Rate limiting (media): waiting {wait_time:.2f}s before sending")
                await asyncio.sleep(wait_time)

        retry_count = 0
        while retry_count <= max_retries:
            try:
                message = await self.client.send_file(
                    peer_id,
                    file_path,
                    caption=caption
                )
                self.last_message_time = datetime.now()  # Update last message time
                
                # Get current user information
                me = await self.client.get_me()
                
                # Determine message type
                msg_type = "document"
                if message.photo:
                    msg_type = "photo"
                elif message.video:
                    msg_type = "video"
                elif message.voice:
                    msg_type = "voice"
                
                return {
                    "message_id": message.id,
                    "text": caption,
                    "date": message.date,
                    "is_outgoing": True,
                    "type": msg_type,
                    "sender_user_id": me.id,
                    "sender_name": f"{me.first_name or ''} {me.last_name or ''}".strip() or me.username or "Unknown",
                    "sender_username": me.username,
                    "media": message.media
                }
            except FloodWaitError as e:
                wait_time = e.seconds
                if retry_count < max_retries:
                    logger.warning(f"FloodWaitError (media): Waiting {wait_time} seconds before retry {retry_count + 1}/{max_retries}")
                    await asyncio.sleep(wait_time)
                    retry_count += 1
                else:
                    logger.error(f"Max retries reached for account {self.account_id}. FloodWait: {wait_time}s")
                    raise Exception(f"Rate limit exceeded. Please wait {wait_time} seconds before sending more messages.")
            except Exception as e:
                logger.error(f"Error sending media for {self.account_id}: {e}")
                raise

    async def download_media(self, telegram_message_id: int, peer_id: int, download_path: str):
        """Download media from a message"""
        if not self.client or not self.is_connected:
            raise Exception("Client not connected")

        try:
            # Get the message from the peer
            messages = await self.client.get_messages(peer_id, ids=[telegram_message_id])
            
            if not messages or len(messages) == 0:
                raise Exception("Message not found")
            
            message = messages[0]
            
            if not message or not message.media:
                raise Exception("Message has no media")
            
            # Download the media
            file_path = await self.client.download_media(message, file=download_path)
            
            if not file_path:
                raise Exception("Failed to download media file")
            
            return file_path
        except Exception as e:
            logger.error(f"Error downloading media for account {self.account_id}, message {telegram_message_id}: {e}")
            raise

    async def join_chat(self, peer_id: int):
        """Join a Telegram group or channel"""
        if not self.client or not self.is_connected:
            raise Exception("Client not connected")

        try:
            from telethon.tl.functions.channels import JoinChannelRequest
            entity = await self.client.get_entity(peer_id)
            
            # For channels and supergroups
            if isinstance(entity, Channel):
                await self.client(JoinChannelRequest(entity))
                return True
            # For normal groups, you usually need an invite or to be added, 
            # but global search usually returns supergroups/channels.
            return True
        except Exception as e:
            logger.error(f"Error joining chat {peer_id} for account {self.account_id}: {e}")
            raise

    async def get_history(self, peer_id: int, limit: int = 50):
        """Fetch message history for a peer without extra API calls to avoid SQLite lock"""
        if not self.client or not self.is_connected:
            return []

        try:
            messages = await self.client.get_messages(peer_id, limit=limit)
            result = []

            for msg in messages:
                # Extract sender name from already-fetched msg.sender (no extra API call needed)
                sender_name = "Unknown"
                sender_username = None
                if msg.sender:
                    sender = msg.sender
                    if hasattr(sender, 'first_name') or hasattr(sender, 'last_name'):
                        parts = []
                        if getattr(sender, 'first_name', None):
                            parts.append(sender.first_name)
                        if getattr(sender, 'last_name', None):
                            parts.append(sender.last_name)
                        sender_name = " ".join(parts) if parts else getattr(sender, 'username', None) or getattr(sender, 'phone', None) or "Unknown"
                    elif hasattr(sender, 'title'):
                        sender_name = sender.title or "Unknown"
                    sender_username = getattr(sender, 'username', None)

                # Determine message type, extract filename and duration
                msg_type = "text"
                has_media = False
                media_filename = None
                duration = None
                
                if msg.photo:
                    msg_type = "photo"
                    has_media = True
                    media_filename = f"photo_{msg.id}.jpg"
                elif msg.video:
                    msg_type = "video"
                    has_media = True
                    from telethon.tl.types import DocumentAttributeVideo
                    if msg.document and hasattr(msg.document, 'attributes'):
                        for attr in msg.document.attributes:
                            if hasattr(attr, 'file_name'):
                                media_filename = attr.file_name
                            if isinstance(attr, DocumentAttributeVideo):
                                duration = getattr(attr, 'duration', None)
                    if not media_filename:
                        media_filename = f"video_{msg.id}.mp4"
                elif msg.voice:
                    msg_type = "voice"
                    from telethon.tl.types import DocumentAttributeAudio
                    has_media = True
                    media_filename = f"voice_{msg.id}.ogg"
                    if msg.document and hasattr(msg.document, 'attributes'):
                        for attr in msg.document.attributes:
                            if isinstance(attr, DocumentAttributeAudio):
                                duration = getattr(attr, 'duration', None)
                elif msg.document:
                    msg_type = "document"
                    has_media = True
                    if hasattr(msg.document, 'attributes'):
                        for attr in msg.document.attributes:
                            if hasattr(attr, 'file_name'):
                                media_filename = attr.file_name
                                break
                    if not media_filename:
                        media_filename = f"document_{msg.id}"

                result.append({
                    "message_id": msg.id,
                    "text": msg.text or msg.message or "",
                    "sender_id": msg.sender_id,
                    "sender_name": sender_name,
                    "sender_username": sender_username,
                    "peer_id": peer_id,
                    "date": msg.date,
                    "is_outgoing": msg.out,
                    "type": msg_type,
                    "has_media": has_media,
                    "media_filename": media_filename,
                    "media_thumbnail": await self._extract_thumbnail(msg),
                    "media_duration": duration,
                    "reply_to_message_id": msg.reply_to.reply_to_msg_id if msg.reply_to else None
                })

            return result
        except Exception as e:
            logger.error(f"Error fetching history for {self.account_id}: {e}")
            return []

    def _get_peer_id(self, entity) -> int:
        if isinstance(entity, User):
            return entity.id
        elif isinstance(entity, Chat):
            return -entity.id
        elif isinstance(entity, Channel):
            return -1000000000000 - entity.id
        return 0

    def _get_conversation_type(self, entity) -> str:
        if isinstance(entity, User):
            return "private"
        elif isinstance(entity, Chat):
            return "group"
        elif isinstance(entity, Channel):
            return "channel" if entity.broadcast else "supergroup"
        return "private"

    async def _extract_thumbnail(self, msg) -> Optional[str]:
        """Extract a base64 encoded thumbnail from a message (stripped or smallest size)"""
        try:
            import base64
            from telethon.tl.types import PhotoStrippedSize, PhotoSize, PhotoSizeProgressive
            from telethon.utils import stripped_to_jpg
            
            photo = msg.photo
            document = msg.document
            
            # 1. Try PhotoStrippedSize first (fastest, no download)
            sizes = []
            if photo:
                sizes = photo.sizes
            elif document and msg.video:
                sizes = getattr(document, 'thumbs', [])
                
            for size in sizes:
                if isinstance(size, PhotoStrippedSize):
                    jpg_bytes = stripped_to_jpg(size.bytes)
                    return base64.b64encode(jpg_bytes).decode('utf-8')
            
            # 2. Fallback: Download smallest thumb if stripped not found
            if not self.client or not self.client.is_connected:
                return None
                
            media = photo or document
            if not media:
                return None
                
            # Download tiny thumbnail to bytes (usually < 20KB)
            # -1 usually gets the smallest available thumb
            try:
                thumb_bytes = await asyncio.wait_for(
                    self.client.download_media(media, thumb=-1, file=bytes),
                    timeout=5.0
                )
                if thumb_bytes:
                    return base64.b64encode(thumb_bytes).decode('utf-8')
            except Exception as e:
                logger.debug(f"Failed to download small thumb fallback: {e}")
                
            return None
        except Exception as e:
            logger.debug(f"Thumbnail extraction failed: {e}")
            return None

    async def search_users(self, username: str, limit: int = 10):
        """Search for Telegram users by username or phone number"""
        if not self.client or not self.is_connected:
            return []

        # Detect if this is a phone number search
        cleaned = username.strip().replace(' ', '').replace('-', '')
        
        # Force + for phone numbers that look international (more than 7 digits)
        if cleaned.isdigit() and len(cleaned) >= 10 and not cleaned.startswith('+'):
            cleaned = '+' + cleaned
            
        is_phone = cleaned.startswith('+') or (cleaned.isdigit() and len(cleaned) > 5)
        
        if is_phone:
            return await self._search_by_phone(cleaned, limit)

        try:
            from telethon.tl.functions.contacts import SearchRequest
            
            # Search globally using Telegram's search
            search_results = await self.client(SearchRequest(
                q=username,
                limit=limit
            ))
            
            results = []
            
            # Process users
            for user in search_results.users:
                if isinstance(user, User) and not user.bot:
                    results.append({
                        "id": user.id,
                        "username": user.username,
                        "first_name": user.first_name,
                        "last_name": user.last_name,
                        "phone": user.phone,
                        "is_contact": user.contact or False,
                        "type": "user"
                    })
            
            # Process chats/channels
            for chat in search_results.chats:
                chat_type = self._get_conversation_type(chat)
                results.append({
                    "id": self._get_peer_id(chat),
                    "username": getattr(chat, 'username', None),
                    "title": getattr(chat, 'title', None) or getattr(chat, 'name', None),
                    "type": chat_type,
                    "is_contact": False
                })
            
            return results[:limit * 2]
                
        except Exception as e:
            logger.error(f"Error searching users for {self.account_id}: {e}")
            return []

    async def _search_by_phone(self, phone: str, limit: int = 10):
        """Search by phone number using ImportContacts"""
        try:
            from telethon.tl.functions.contacts import ImportContactsRequest, DeleteContactsRequest
            from telethon.tl.types import InputPhoneContact
            
            # Use the phone number itself as the temporary name
            # This is less confusing than 'Search' if it ends up being displayed
            result = await self.client(ImportContactsRequest(contacts=[
                InputPhoneContact(client_id=0, phone=phone, first_name=phone, last_name='')
            ]))
            
            found = []
            for user in result.users:
                # If Telegram has a real name for this user, it usually returns it in results.users
                # even if we provided a different one in ImportContactsRequest (sometimes).
                # But to be safe, we'll use the user's properties.
                found.append({
                    "id": user.id,
                    "username": user.username,
                    "first_name": user.first_name if user.first_name != phone else (user.username or phone),
                    "last_name": user.last_name,
                    "phone": user.phone or phone,
                    "is_contact": False,
                    "type": "user"
                })
            
            # Clean up temp contact
            if result.users:
                try:
                    await self.client(DeleteContactsRequest(id=[u.id for u in result.users]))
                except Exception:
                    pass
            
            return found[:limit]
        except Exception as e:
            logger.error(f"Phone search error for {phone}: {e}")
            return []

    async def delete_messages(self, peer_id: int, message_ids: List[int], revoke: bool = True):
        """Delete messages from a conversation"""
        if not self.client or not self.is_connected:
            return False
            
        try:
            await self.client.delete_messages(peer_id, message_ids, revoke=revoke)
            return True
        except Exception as e:
            logger.error(f"Error deleting messages for {self.account_id}: {e}")
            return False

    async def delete_dialog(self, peer_id: int):
        """Delete a dialog/conversation from Telegram side"""
        if not self.client or not self.is_connected:
            return False
            
        try:
            # revoke=True deletes for everyone if private chat
            await self.client.delete_dialog(peer_id, revoke=True)
            return True
        except Exception as e:
            logger.error(f"Dialog deletion error: {e}")
            return False

    async def forward_messages(self, from_peer_id: int, message_ids: List[int], to_peer_id: int):
        """Forward one or more messages (with media) to another chat using Telethon's native forward"""
        if not self.client or not self.is_connected:
            raise Exception("Client not connected")
        try:
            result = await self.client.forward_messages(
                entity=to_peer_id,
                messages=message_ids,
                from_peer=from_peer_id,
            )
            me = await self.client.get_me()
            # result can be a list or single Message
            msgs = result if isinstance(result, list) else [result]
            return [
                {
                    "message_id": m.id,
                    "date": m.date,
                    "sender_user_id": me.id,
                    "sender_name": f"{me.first_name or ''} {me.last_name or ''}".strip() or me.username or "Unknown",
                    "sender_username": me.username,
                    "type": "photo" if m.photo else ("video" if m.video else ("document" if m.document else "text")),
                    "text": m.text or m.message or "",
                }
                for m in msgs if m
            ]
        except Exception as e:
            logger.error(f"Error forwarding messages for {self.account_id}: {e}")
            raise



class TelethonService:
    def __init__(self):
        self.sessions: Dict[int, TelegramSession] = {}
        self.message_handlers: List[Callable] = []
        self.reaction_handlers: List[Callable] = []
        self.polling_task: Optional[asyncio.Task] = None
        self.polling_interval = 10  # seconds
        os.makedirs("sessions", exist_ok=True)

    def add_message_handler(self, handler):
        if handler not in self.message_handlers:
            self.message_handlers.append(handler)

    def add_reaction_handler(self, handler):
        if handler not in self.reaction_handlers:
            self.reaction_handlers.append(handler)

    async def connect_session(self, account_id: int) -> bool:
        if account_id in self.sessions and self.sessions[account_id].is_connected:
            return True

        row = await db.fetchrow(
            "SELECT app_id, app_hash, user_id, account_name FROM telegram_accounts WHERE id = $1",
            account_id
        )

        if not row:
            return False

        app_id = row['app_id']
        app_hash = row['app_hash']
        user_id = row['user_id']
        account_name = row['account_name']

        session_file = f"sessions/{user_id}_{account_name}.session"
        session = TelegramSession(account_id, app_id, app_hash, session_file)
        connected = await session.connect()

        if connected:
            self.sessions[account_id] = session
            await self._setup_event_handlers(session)
            await db.execute(
                "UPDATE telegram_accounts SET last_used = NOW() WHERE id = $1",
                account_id
            )
            
            # Check for unread messages immediately after connection
            try:
                await self._check_unread_messages_on_start(account_id)
            except Exception as e:
                logger.error(f"Error checking unread messages on start for account {account_id}: {e}")
            
            # Start polling if not already running
            if not self.polling_task or self.polling_task.done():
                self.polling_task = asyncio.create_task(self._poll_unread_messages())
            
            return True
        return False

    async def disconnect_session(self, account_id: int):
        if account_id in self.sessions:
            await self.sessions[account_id].disconnect()
            del self.sessions[account_id]

    async def get_session(self, account_id: int) -> Optional[TelegramSession]:
        return self.sessions.get(account_id)

    async def get_dialogs(self, account_id: int, limit: int = 50):
        session = self.sessions.get(account_id)
        if not session:
            raise Exception("Session not connected")

        return await session.get_dialogs(limit)

    async def get_messages(self, account_id: int, peer_id: int, limit: int = 50):
        session = self.sessions.get(account_id)
        if not session:
            raise Exception("Session not connected")

        return await session.get_messages(peer_id, limit)

    async def send_message(self, account_id: int, peer_id: int, text: str, reply_to: int = None):
        session = await self.get_session(account_id)
        if not session:
            raise Exception("Telegram account is not connected. Please reconnect your account.")
        return await session.send_message(peer_id, text, reply_to=reply_to)

    async def delete_messages(self, account_id: int, peer_id: int, message_ids: List[int], revoke: bool = True):
        session = await self.get_session(account_id)
        if not session:
            return False
        return await session.delete_messages(peer_id, message_ids, revoke=revoke)

    async def delete_dialog(self, account_id: int, peer_id: int):
        session = await self.get_session(account_id)
        if not session:
            return False
        return await session.delete_dialog(peer_id)

    async def get_unread_messages(self, account_id: int):
        """Get unread messages for a specific account"""
        session = self.sessions.get(account_id)
        if not session:
            raise Exception("Session not connected")

        return await session.get_unread_messages()

    async def search_users(self, account_id: int, username: str, limit: int = 10):
        """Search for Telegram users by username"""
        session = self.sessions.get(account_id)
        if not session:
            raise Exception("Session not connected")

        return await session.search_users(username, limit)

    async def send_media(self, account_id: int, peer_id: int, file_path: str, caption: str = ""):
        """Send media file to a peer"""
        session = self.sessions.get(account_id)
        if not session:
            raise Exception("Session not connected")

        return await session.send_media(peer_id, file_path, caption)

    async def forward_messages(self, account_id: int, from_peer_id: int, message_ids: List[int], to_peer_id: int):
        """Forward messages (text + media) natively via Telethon"""
        session = self.sessions.get(account_id)
        if not session:
            raise Exception("Session not connected")
        return await session.forward_messages(from_peer_id, message_ids, to_peer_id)

    async def download_media(self, account_id: int, telegram_message_id: int, peer_id: int, download_path: str):
        """Download media from a message"""
        session = self.sessions.get(account_id)
        if not session:
            raise Exception("Session not connected")

        return await session.download_media(telegram_message_id, peer_id, download_path)

    async def join_chat(self, account_id: int, peer_id: int):
        """Join a group or channel"""
        session = self.sessions.get(account_id)
        if not session:
            raise Exception("Session not connected")

        return await session.join_chat(peer_id)

    async def fetch_and_save_history(self, account_id: int, peer_id: int, limit: int = 50):
        """Fetch history and trigger handlers to save to DB as a background task"""
        # Run in background to avoid blocking the caller
        asyncio.create_task(self._do_fetch_history(account_id, peer_id, limit))
        return True

    async def _do_fetch_history(self, account_id: int, peer_id: int, limit: int):
        """Internal background worker for history fetching"""
        try:
            session = self.sessions.get(account_id)
            if not session:
                logger.warning(f"Cannot fetch history: session {account_id} not connected")
                return

            logger.info(f"Background fetching history for account {account_id}, peer {peer_id}")
            messages = await session.get_history(peer_id, limit=limit)
            if not messages:
                logger.info(f"No history found for peer {peer_id}")
                return
            
            # Sort by date ascending so they are processed in order
            messages.sort(key=lambda x: x['date'])
            
            for msg_data in messages:
                msg_data['account_id'] = account_id
                for handler in self.message_handlers:
                    try:
                        await handler(msg_data)
                    except Exception as e:
                        logger.error(f"Error in handler during history catchup: {e}")
            logger.info(f"Successfully caught up {len(messages)} historical messages for peer {peer_id}")
        except Exception as e:
            logger.error(f"Background history fetch failed: {e}")

    async def _setup_event_handlers(self, session: TelegramSession):
        @session.client.on(events.NewMessage)
        async def handle_new_message(event):
            try:
                message = event.message
                peer_id = session._get_peer_id(await event.get_chat())
                
                # Get sender information safely
                sender_info = await session._get_sender_info_safe(message.sender_id)
                
                # Get peer title and conversation type
                try:
                    chat = await event.get_chat()
                    peer_title = getattr(chat, 'title', None) or sender_info["name"]
                    conversation_type = session._get_conversation_type(chat)
                except:
                    peer_title = sender_info["name"]
                    conversation_type = "private"

                # Determine message type and extract duration
                msg_type = "text"
                has_media = False
                media_filename = None
                duration = None
                
                if message.photo:
                    msg_type = "photo"
                    has_media = True
                    media_filename = f"photo_{message.id}.jpg"
                elif message.video:
                    msg_type = "video"
                    has_media = True
                    from telethon.tl.types import DocumentAttributeVideo
                    if message.document and hasattr(message.document, 'attributes'):
                        for attr in message.document.attributes:
                            if hasattr(attr, 'file_name'):
                                media_filename = attr.file_name
                            if isinstance(attr, DocumentAttributeVideo):
                                duration = getattr(attr, 'duration', None)
                    if not media_filename:
                        media_filename = f"video_{message.id}.mp4"
                elif message.voice:
                    msg_type = "voice"
                    has_media = True
                    media_filename = f"voice_{message.id}.ogg"
                    from telethon.tl.types import DocumentAttributeAudio
                    if message.document and hasattr(message.document, 'attributes'):
                        for attr in message.document.attributes:
                            if isinstance(attr, DocumentAttributeAudio):
                                duration = getattr(attr, 'duration', None)
                elif message.document:
                    msg_type = "document"
                    has_media = True
                    if hasattr(message.document, 'attributes'):
                        for attr in message.document.attributes:
                            if hasattr(attr, 'file_name'):
                                media_filename = attr.file_name
                                break
                    if not media_filename:
                        media_filename = f"document_{message.id}"

                message_data = {
                    "account_id": session.account_id,
                    "peer_id": peer_id,
                    "message_id": message.id,
                    "text": message.text or message.message or "",
                    "sender_id": message.sender_id,
                    "sender_name": sender_info["name"],
                    "sender_username": sender_info["username"],
                    "peer_title": peer_title,
                    "conversation_type": conversation_type,
                    "date": message.date,
                    "is_outgoing": message.out,
                    "type": msg_type,
                    "has_media": has_media,
                    "media_filename": media_filename,
                    "media_thumbnail": await session._extract_thumbnail(message),
                    "media_duration": duration,
                    "reply_to_msg_id": message.reply_to.reply_to_msg_id if message.reply_to else None
                }
                print("message_data", message_data)

                # Mark message as read (only for incoming messages)
                if not message.out:
                    try:
                        await session.client.send_read_acknowledge(await event.get_chat(), max_id=message.id)
                        logger.debug(f"Marked message {message.id} as read")
                    except Exception as e:
                        logger.error(f"Error marking message {message.id} as read: {e}")

                for handler in self.message_handlers:
                    await handler(message_data)

            except Exception as e:
                logger.error(f"Error handling new message: {e}")

        # @session.client.on(events.MessageReactions)
        # async def handle_reactions(event):
        #     try:
        #         reactions_dict = {}
        #         if event.reactions and hasattr(event.reactions, 'results'):
        #             for r in event.reactions.results:
        #                 emoji = getattr(r.reaction, 'emoticon', None)
        #                 if emoji:
        #                     reactions_dict[emoji] = r.count
        #         
        #         chat = await event.get_input_chat()
        #         peer_id = session._get_peer_id(chat)
        #         
        #         reaction_data = {
        #             "account_id": session.account_id,
        #             "peer_id": peer_id,
        #             "message_id": event.msg_id,
        #             "reactions": reactions_dict
        #         }
        #         
        #         for handler in self.reaction_handlers:
        #             await handler(reaction_data)
        #     except Exception as e:
        #         logger.error(f"Error handling reactions event: {e}")

    async def _check_unread_messages_on_start(self, account_id: int):
        """Check for unread messages immediately when session starts"""
        try:
            logger.info(f"Checking unread messages for account {account_id} on start")
            unread_messages = await self.get_unread_messages(account_id)
            logger.info(f"Found {len(unread_messages)} unread messages for account {account_id}")
            
            if unread_messages:
                
                # Process each unread message
                for msg_data in unread_messages:
                    try:
                        # Create message data for handlers
                        message_data = {
                            "account_id": account_id,
                            "peer_id": msg_data["peer_id"],
                            "message_id": msg_data["message_id"],
                            "text": msg_data["text"],
                            "sender_id": msg_data["sender_id"],
                            "sender_name": msg_data["sender_name"],
                            "sender_username": msg_data["sender_username"],
                            "peer_title": msg_data["peer_title"],
                            "conversation_type": msg_data.get("conversation_type", "private"),
                            "date": msg_data["date"],
                            "is_outgoing": msg_data["is_outgoing"],
                            "type": msg_data["type"],
                            "has_media": msg_data["has_media"],
                            "media_filename": msg_data["media_filename"],
                            "media_thumbnail": msg_data.get("media_thumbnail"),
                            "media_duration": msg_data.get("media_duration"),
                            "reply_to_msg_id": msg_data.get("reply_to_message_id")
                        }
                        
                        # Call all registered handlers
                        for handler in self.message_handlers:
                            try:
                                await handler(message_data)
                            except Exception as e:
                                logger.error(f"Error in message handler for unread message: {e}")
                                
                    except Exception as e:
                        logger.error(f"Error processing unread message {msg_data.get('message_id', 'unknown')}: {e}")
                        continue
            else:
                logger.info(f"No unread messages found for account {account_id}")
                
        except Exception as e:
            logger.error(f"Error checking unread messages on start for account {account_id}: {e}")

    async def _poll_unread_messages(self):
        """Background task to poll for unread messages"""
        logger.info("Starting unread message polling task")
        
        # while True:
        #     try:
        #         await asyncio.sleep(self.polling_interval)
                
        #         for account_id, session in list(self.sessions.items()):
        #             if session.is_connected:
        #                 try:
        #                     unread_messages = await session.get_unread_messages()
        #                     print("unread_messages", unread_messages)
        #                     for msg_data in unread_messages:
        #                         # Create message data for handlers
        #                         message_data = {
        #                             "account_id": account_id,
        #                             "peer_id": msg_data["peer_id"],
        #                             "message_id": msg_data["message_id"],
        #                             "text": msg_data["text"],
        #                             "sender_id": msg_data["sender_id"],
        #                             "sender_name": msg_data["sender_name"],
        #                             "sender_username": msg_data["sender_username"],
        #                             "peer_title": msg_data["peer_title"],
        #                             "date": msg_data["date"],
        #                             "is_outgoing": msg_data["is_outgoing"]
        #                         }
                                
        #                         # Call all registered handlers
        #                         for handler in self.message_handlers:
        #                             try:
        #                                 await handler(message_data)
        #                             except Exception as e:
        #                                 logger.error(f"Error in message handler: {e}")
                            
        #                 except Exception as e:
        #                     logger.error(f"Error polling unread messages for account {account_id}: {e}")
        #                     # If session is no longer connected due to auth error, remove it
        #                     if not session.is_connected:
        #                         logger.info(f"Removing disconnected session {account_id}")
        #                         del self.sessions[account_id]
                            
        #     except Exception as e:
        #         logger.error(f"Error in polling task: {e}")
        #         await asyncio.sleep(self.polling_interval)

    async def disconnect_all(self):
        # Stop polling task
        if self.polling_task and not self.polling_task.done():
            self.polling_task.cancel()
            try:
                await self.polling_task
            except asyncio.CancelledError:
                pass
        
        for account_id in list(self.sessions.keys()):
            await self.disconnect_session(account_id)

    async def leave_chat(self, account_id: int, peer_id: int):
        """Leave a group or channel"""
        session = self.sessions.get(account_id)
        if not session or not session.client:
            raise Exception("Account not connected")
        
        from telethon.tl.functions.channels import LeaveChannelRequest
        from telethon.tl.functions.messages import DeleteChatUserRequest
        
        try:
            entity = await session.client.get_entity(peer_id)
            if hasattr(entity, 'megagroup') or hasattr(entity, 'broadcast'):
                await session.client(LeaveChannelRequest(entity))
            else:
                me = await session.client.get_me()
                await session.client(DeleteChatUserRequest(peer_id, me))
        except Exception as e:
            logger.warning(f"Leave chat error for peer {peer_id}: {e}")
            raise

    async def get_profile(self, account_id: int) -> dict:
        """Get the Telegram user's own profile info including privacy"""
        session = self.sessions.get(account_id)
        if not session or not session.client:
            logger.error(f"Cannot get profile: session {account_id} not connected in TelethonService")
            raise Exception("Account not connected")
        
        from telethon.tl.functions.users import GetFullUserRequest
        from telethon.tl.functions.account import GetPrivacyRequest
        from telethon.tl.types import InputPrivacyKeyPhoneNumber, PrivacyValueAllowAll, PrivacyValueAllowContacts
        
        try:
            logger.info(f"Fetching profile for account {account_id}")
            # Use a short timeout for basic info
            me = await asyncio.wait_for(session.client.get_me(), timeout=15.0)
            if not me:
                raise Exception("Not authorized")
                
            full = await asyncio.wait_for(session.client(GetFullUserRequest(me)), timeout=15.0)
            
            # Get privacy settings
            phone_privacy = 'nobody'
            try:
                privacy = await asyncio.wait_for(session.client(GetPrivacyRequest(key=InputPrivacyKeyPhoneNumber())), timeout=10.0)
                for rule in privacy.rules:
                    if isinstance(rule, PrivacyValueAllowAll):
                        phone_privacy = 'everybody'
                        break
                    elif isinstance(rule, PrivacyValueAllowContacts):
                        phone_privacy = 'contacts'
                        break
            except Exception as e:
                logger.warning(f"Could not get privacy settings for account {account_id}: {e}")

            # Build a clean profile dict
            user = full.users[0]
            photo_url = None
            
            # Try to get profile photo bytes (very safe, with timeout)
            try:
                # Photos can be large, but we only want a small base64 string
                photo_bytes = await asyncio.wait_for(session.client.download_profile_photo(me, bytes), timeout=15.0)
                if photo_bytes:
                    import base64
                    photo_url = f"data:image/jpeg;base64,{base64.b64encode(photo_bytes).decode()}"
            except Exception as e:
                logger.debug(f"Could not download profile photo for {account_id}: {e}")
            
            return {
                "id": user.id,
                "first_name": user.first_name or "",
                "last_name": user.last_name or "",
                "username": user.username or "",
                "phone": user.phone or "",
                "bio": full.full_user.about or "",
                "photo_url": photo_url,
                "phone_privacy": phone_privacy
            }
        except asyncio.TimeoutError:
            logger.error(f"Timeout while fetching profile for account {account_id}")
            raise Exception("Telegram request timed out. Please try again.")
        except Exception as e:
            logger.error(f"Error fetching profile for account {account_id}: {e}")
            raise e

    async def update_profile(self, account_id: int, first_name: str = None, last_name: str = None, bio: str = None) -> dict:
        """Update Telegram profile name and bio"""
        session = self.sessions.get(account_id)
        if not session or not session.client:
            raise Exception("Account not connected")
        
        from telethon.tl.functions.account import UpdateProfileRequest
        
        kwargs = {}
        if first_name is not None:
            kwargs['first_name'] = first_name
        if last_name is not None:
            kwargs['last_name'] = last_name
        if bio is not None:
            kwargs['about'] = bio
        
        await session.client(UpdateProfileRequest(**kwargs))
        return {"status": "success", "message": "Profile updated successfully"}

    async def upload_profile_photo(self, account_id: int, file_bytes: bytes, filename: str) -> dict:
        """Upload a new profile photo"""
        session = self.sessions.get(account_id)
        if not session or not session.client:
            raise Exception("Account not connected")
        
        from telethon.tl.functions.photos import UploadProfilePhotoRequest
        import io
        
        file_obj = io.BytesIO(file_bytes)
        file_obj.name = filename
        uploaded = await session.client.upload_file(file_obj)
        await session.client(UploadProfilePhotoRequest(file=uploaded))
        return {"status": "success", "message": "Profile photo updated"}

    async def set_phone_privacy(self, account_id: int, visibility: str) -> dict:
        """Set phone number privacy setting"""
        session = self.sessions.get(account_id)
        if not session or not session.client:
            raise Exception("Account not connected")
        
        from telethon.tl.functions.account import SetPrivacyRequest
        from telethon.tl.types import (
            InputPrivacyKeyPhoneNumber,
            InputPrivacyValueAllowAll,
            InputPrivacyValueAllowContacts,
            InputPrivacyValueDisallowAll,
        )
        
        if visibility == 'everybody':
            rules = [InputPrivacyValueAllowAll()]
        elif visibility == 'contacts':
            rules = [InputPrivacyValueAllowContacts()]
        else:  # nobody
            rules = [InputPrivacyValueDisallowAll()]
        
        await session.client(SetPrivacyRequest(key=InputPrivacyKeyPhoneNumber(), rules=rules))
        return {"status": "success", "visibility": visibility}

    async def get_sessions(self, account_id: int) -> list:
        """Get all active Telegram sessions"""
        session = self.sessions.get(account_id)
        if not session or not session.client:
            raise Exception("Account not connected")
        
        from telethon.tl.functions.account import GetAuthorizationsRequest
        
        result = await session.client(GetAuthorizationsRequest())
        sessions = []
        for auth in result.authorizations:
            sessions.append({
                "hash": str(auth.hash),
                "device_model": auth.device_model or "Unknown",
                "platform": auth.platform or "",
                "system_version": auth.system_version or "",
                "app_name": auth.app_name or "",
                "app_version": auth.app_version or "",
                "date_created": auth.date_created.isoformat() if auth.date_created else None,
                "date_active": auth.date_active.isoformat() if auth.date_active else None,
                "ip": auth.ip or "",
                "country": auth.country or "",
                "region": auth.region or "",
                "current": auth.current,
                "password_pending": auth.password_pending,
            })
        return sessions

    async def terminate_session(self, account_id: int, session_hash: int) -> dict:
        """Terminate a specific session by hash"""
        session = self.sessions.get(account_id)
        if not session or not session.client:
            raise Exception("Account not connected")
        
        from telethon.tl.functions.account import ResetAuthorizationRequest
        
        await session.client(ResetAuthorizationRequest(hash=session_hash))
        return {"status": "success", "message": "Session terminated"}

    async def logout(self, account_id: int) -> dict:
        """Log out the current session (this device) from Telegram servers"""
        session = self.sessions.get(account_id)
        if not session or not session.client:
            raise Exception("Account not connected")
        
        # This will invalidate the session key on Telegram servers
        await session.client.log_out()
        
        # Clean up our local session tracking
        if account_id in self.sessions:
            session_file = self.sessions[account_id].session_filepath
            del self.sessions[account_id]
            
            # Clean up the file from disk as it's now invalid
            try:
                if os.path.exists(session_file):
                    os.remove(session_file)
                # Also clean up journal files
                for suffix in ['-journal', '-wal', '-shm']:
                    if os.path.exists(session_file + suffix):
                        os.remove(session_file + suffix)
            except Exception as e:
                logger.warning(f"Could not delete session file after logout: {e}")
            
        return {"status": "success", "message": "Logged out successfully"}

    async def terminate_all_sessions(self, account_id: int) -> dict:
        """Terminate all other sessions except current"""
        session = self.sessions.get(account_id)
        if not session or not session.client:
            raise Exception("Account not connected")
        
        from telethon.tl.functions.account import ResetAuthorizationsRequest
        
        await session.client(ResetAuthorizationsRequest())
        return {"status": "success", "message": "All other sessions terminated"}

    async def change_2fa(self, account_id: int, current_password: str, new_password: str) -> dict:
        """Change Telegram 2FA password"""
        session = self.sessions.get(account_id)
        if not session or not session.client:
            raise Exception("Account not connected")
        
        from telethon.errors import PasswordHashInvalidError
        try:
            await session.client.edit_2fa(
                current_password=current_password if current_password else None,
                new_password=new_password,
            )
            return {"status": "success", "message": "2FA password updated successfully"}
        except PasswordHashInvalidError:
            raise Exception("The current 2FA password you entered is incorrect. If you haven't set one yet, try leaving it empty.")
        except Exception as e:
            logger.error(f"Telegram 2FA change error: {e}")
            raise e

    async def get_peer_photo(self, account_id: int, peer_id: int) -> str:
        """Download and return peer's profile photo as base64"""
        session = self.sessions.get(account_id)
        if not session or not session.client:
            raise Exception("Account not connected")
        
        import base64
        
        # Look up entity from our cache (keyed by both raw and full peer IDs)
        entity = session.entity_cache.get(peer_id)
        
        if not entity:
            # Try Telethon's own session cache as fallback
            for peer_type in (peer_id, PeerUser(peer_id), PeerChannel(peer_id), PeerChat(peer_id)):
                try:
                    entity = await session.client.get_entity(peer_type)
                    if entity:
                        # Cache using DB-compatible ID format
                        try:
                            db_id = session._get_peer_id(entity)
                            if db_id:
                                session.entity_cache[db_id] = entity
                        except Exception:
                            pass
                        raw_id = getattr(entity, 'id', None)
                        if raw_id:
                            session.entity_cache[raw_id] = entity
                        break
                except Exception:
                    continue

        if not entity:
            logger.warning(f"Entity not found for peer {peer_id} in account {account_id}. Cache has {len(session.entity_cache)} entries.")
            raise Exception(f"Entity not found for peer {peer_id}")
        
        try:
            photo_bytes = await session.client.download_profile_photo(entity, bytes)
        except Exception as e:
            logger.error(f"Error downloading photo for peer {peer_id}: {e}")
            raise e
        
        if photo_bytes:
            return f"data:image/jpeg;base64,{base64.b64encode(photo_bytes).decode()}"
        return None  # Entity has no profile photo set

    async def send_reaction(self, account_id: int, peer_id: int, message_id: int, emoji: str):
        """Send a reaction to a message"""
        session = self.sessions.get(account_id)
        if not session:
            raise Exception("Account not connected")
        return await session.send_reaction(peer_id, message_id, emoji)


telethon_service = TelethonService()
