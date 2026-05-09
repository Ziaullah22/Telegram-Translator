import os
import json
import logging
import asyncio
import random
from typing import List, Optional, Dict, Any
from datetime import datetime
from instagrapi import Client
from database import db
from websocket_manager import manager
from translation_service import translation_service

logger = logging.getLogger(__name__)

class InstagramChatService:
    def __init__(self):
        self.clients: Dict[int, Client] = {} # account_id -> instagrapi Client
        self.translation_cache: Dict[str, str] = {} # msg_id -> translated_text

    async def get_client(self, account_id: int) -> Client:
        """Get or initialize an instagrapi client for the given account."""
        if account_id in self.clients:
            return self.clients[account_id]

        # Fetch account data
        account = await db.fetchrow(
            "SELECT * FROM instagram_accounts WHERE id = $1", account_id
        )
        if not account:
            raise Exception("Account not found")

        client = Client()
        
        # Setup proxy if available
        if account.get('proxy_id'):
            proxy = await db.fetchrow("SELECT * FROM instagram_proxies WHERE id = $1", account['proxy_id'])
            if proxy:
                p_auth = f"{proxy['username']}:{proxy['password']}@" if proxy['username'] else ""
                proxy_url = f"http://{p_auth}{proxy['host']}:{proxy['port']}"
                client.set_proxy(proxy_url)

        # Load session from full_cookies_json
        if account.get('full_cookies_json'):
            try:
                state = json.loads(account['full_cookies_json'])
                # Check if we have an active Playwright session to pull FRESH cookies from
                from app.features.instagram.session_manager import instagram_session_manager
                if instagram_session_manager.is_connected(account_id):
                    logger.info(f"🔄 Pulling FRESH cookies from active browser for @{account['username']}")
                    session = instagram_session_manager.active_sessions[account_id]
                    state = await session['context'].storage_state()

                cookies_to_use = []
                if isinstance(state, dict):
                    cookies_to_use = state.get('cookies', [])
                elif isinstance(state, list):
                    cookies_to_use = state
                
                if cookies_to_use:
                    cookies_dict = {}
                    for c in cookies_to_use:
                        # Normalize domains and ensure we get the key auth cookies
                        if 'instagram.com' in c.get('domain', ''):
                            cookies_dict[c['name']] = c['value']
                    
                    if cookies_dict:
                        logger.info(f"💉 Injecting {len(cookies_dict)} cookies for @{account['username']}")
                        # Use set_settings which is more robust across instagrapi versions
                        client.set_settings({"cookies": cookies_dict})
                        
                        # Try to find the session ID and do a direct login (bypass device checks)
                        session_id = cookies_dict.get('sessionid')
                        if session_id:
                            try:
                                # This is the most reliable way to use a browser session in instagrapi
                                await asyncio.get_event_loop().run_in_executor(
                                    None, lambda: client.login_by_sessionid(session_id)
                                )
                                logger.info(f"🚀 Session ID login successful for @{account['username']}")
                            except: pass
                    else:
                        logger.warning(f"⚠️ No instagram.com cookies found for @{account['username']}")
            except Exception as e:
                logger.error(f"Failed to load Instagram session for {account_id}: {e}")

        self.clients[account_id] = client
        return client

    async def get_threads(self, account_id: int, amount: int = 20) -> List[Dict[str, Any]]:
        """Fetch recent direct message threads."""
        client = await self.get_client(account_id)
        
        # Run in thread pool since instagrapi is synchronous
        threads = await asyncio.get_event_loop().run_in_executor(
            None, lambda: client.direct_threads(amount)
        )
        account_settings = await db.fetchrow(
            "SELECT is_translation_enabled, target_language FROM instagram_accounts WHERE id = $1",
            account_id
        )
        is_trans_enabled = account_settings['is_translation_enabled'] if account_settings else True
        target_lang = account_settings['target_language'] if account_settings else "en"
        
        results = []
        for t in threads:
            # Format thread data to match our frontend expectations
            last_msg = None
            
            # Safely extract the last message from the thread
            last_item = getattr(t, 'last_permanent_item', None)
            if not last_item:
                # Fallback to general last_item if permanent is missing
                last_item = getattr(t, 'last_item', None)
            if not last_item and hasattr(t, 'items') and t.items:
                last_item = t.items[0]
                
            if last_item:
                # Try to get text from various possible fields (text, clip, media, etc.)
                msg_text = getattr(last_item, 'text', None)
                if not msg_text:
                    item_type = getattr(last_item, 'item_type', 'media')
                    msg_text = f"[{item_type.capitalize()}]"
                
                last_msg = {
                    "id": str(getattr(last_item, 'id', '')),
                    "text": msg_text,
                    "created_at": last_item.timestamp.isoformat() if hasattr(last_item, 'timestamp') and last_item.timestamp else None,
                    "is_outgoing": str(getattr(last_item, 'user_id', None)) == str(client.user_id)
                }

                # Apply translation to the last message if needed
                if last_msg["text"] and not last_msg["text"].startswith("[") and not last_msg["is_outgoing"]:
                    if is_trans_enabled:
                        msg_id = last_msg["id"]
                        if msg_id in self.translation_cache:
                            last_msg["text"] = self.translation_cache[msg_id]
                        else:
                            try:
                                translated = await translation_service.translate_text(last_msg["text"], target_lang)
                                self.translation_cache[msg_id] = translated
                                last_msg["text"] = translated
                            except: pass

            results.append({
                "id": t.id,
                "title": t.thread_title or (t.users[0].full_name if t.users else "Unknown"),
                "username": t.users[0].username if t.users else None,
                "type": "private" if not getattr(t, 'is_group', False) else "group",
                "last_message": last_msg,
                "unread_count": getattr(t, 'read_state', 0), # Simplified
                "photo_url": t.users[0].profile_pic_url if t.users else None
            })
        return results

    async def get_messages(self, account_id: int, thread_id: str, amount: int = 20) -> List[Dict[str, Any]]:
        """Fetch messages for a specific thread."""
        if str(thread_id).startswith("new_"):
            # This is a virtual thread for a new conversation, there are no messages yet
            return []
            
        client = await self.get_client(account_id)
        
        thread = await asyncio.get_event_loop().run_in_executor(
            None, lambda: client.direct_thread(thread_id)
        )
        
        messages = []
        # instagrapi DirectThread stores history in either 'messages' or 'items'
        thread_messages = getattr(thread, 'messages', None)
        if not thread_messages:
            thread_messages = getattr(thread, 'items', [])
            
        # Fetch translation settings
        account = await db.fetchrow(
            "SELECT is_translation_enabled, target_language FROM instagram_accounts WHERE id = $1", 
            account_id
        )
        is_trans_enabled = account['is_translation_enabled'] if account else True
        target_lang = account['target_language'] if account else "en"
            
        if thread_messages:
            for item in thread_messages:
                user_id = getattr(item, 'user_id', None)
                
                # Safely resolve sender name
                sender_name = "Unknown"
                if str(user_id) == str(client.user_id):
                    sender_name = "Me"
                elif hasattr(thread, 'users') and thread.users:
                    for u in thread.users:
                        if str(getattr(u, 'pk', None)) == str(user_id):
                            sender_name = getattr(u, 'full_name', getattr(u, 'username', 'Unknown'))
                            break

                text = getattr(item, 'text', '')
                if not text:
                    text = "[Media or System Message]"
                    
                # Handle automatic translation with memory cache
                original_text = text
                translated_text = text
                msg_id = str(getattr(item, 'id', f"msg-{datetime.now().timestamp()}"))
                
                if text and msg_id and not text.startswith("[Media"):
                    if is_trans_enabled:
                        if msg_id not in self.translation_cache:
                            try:
                                # Translate to the user's configured target language
                                res = await translation_service.translate_text(text, target_lang)
                                translated_text = res.get("translated_text", text)
                                self.translation_cache[msg_id] = translated_text
                            except Exception as e:
                                logger.error(f"Failed to translate Instagram message {msg_id}: {e}")
                        else:
                            translated_text = self.translation_cache[msg_id]

                ts = getattr(item, 'timestamp', None)
                
                messages.append({
                    "id": msg_id,
                    "thread_id": thread_id,
                    "sender_id": str(user_id) if user_id else None,
                    "sender_name": sender_name,
                    "text": text, # Fallback text
                    "original_text": original_text,
                    "translated_text": translated_text,
                    "type": "text" if getattr(item, 'item_type', '') == "text" else "media",
                    "created_at": ts.isoformat() if ts else datetime.now().isoformat(),
                    "is_outgoing": str(user_id) == str(client.user_id)
                })
        
        # Reverse to get chronological order for frontend
        messages.reverse()
        return messages

    async def send_message(self, account_id: int, thread_id: str, text: str) -> Dict[str, Any]:
        """Send a direct message."""
        client = await self.get_client(account_id)
        
        # Fetch translation settings
        account = await db.fetchrow(
            "SELECT is_translation_enabled, source_language FROM instagram_accounts WHERE id = $1", 
            account_id
        )
        is_trans_enabled = account['is_translation_enabled'] if account else True
        source_lang = account['source_language'] if account else "auto"
        
        original_text = text
        translated_text = text
        
        # Translate outgoing message to the foreign user's language (source_language)
        if is_trans_enabled and source_lang != 'auto':
            try:
                res = await translation_service.translate_text(original_text, source_lang)
                translated_text = res.get("translated_text", original_text)
            except Exception as e:
                logger.error(f"Failed to translate outgoing Instagram message: {e}")
        
        # Check if this is a 'new' thread by username
        if str(thread_id).startswith("new_"):
            user_id = thread_id.replace("new_", "")
            item = await asyncio.get_event_loop().run_in_executor(
                None, lambda: client.direct_send(translated_text, user_ids=[user_id])
            )
            
            # The direct_send response doesn't reliably contain the thread_id.
            # We must fetch the latest inbox to get the real thread_id we just created.
            try:
                latest = await self.get_threads(account_id, amount=1)
                if latest:
                    thread_id = latest[0]["id"]
            except Exception as e:
                logger.error(f"Failed to fetch new thread ID: {e}")
                # Fallback to the item's thread_id if available
                thread_id = getattr(item, "thread_id", thread_id)
        else:
            item = await asyncio.get_event_loop().run_in_executor(
                None, lambda: client.direct_send(translated_text, thread_ids=[thread_id])
            )
        
        msg_id = str(getattr(item, "id", f"temp-{datetime.now().timestamp()}"))
        
        # Cache it so the next poll instantly shows the bilingual version
        self.translation_cache[msg_id] = original_text
        
        return {
            "id": msg_id,
            "thread_id": thread_id,
            "sender_id": client.user_id,
            "text": translated_text,
            "original_text": translated_text,
            "translated_text": original_text,
            "created_at": datetime.now().isoformat(),
            "is_outgoing": True
        }

    async def search_users(self, account_id: int, query: str) -> List[Dict[str, Any]]:
        """Search for Instagram users by query with automatic session retry."""
        query = query.strip() # Clean up any accidental spaces
        if not query: return []
        
        for attempt in [1, 2]:
            try:
                client = await self.get_client(account_id)
                logger.info(f"🔍 Searching for '{query}' using account {account_id} (Attempt {attempt})")
                users = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: client.search_users(query)
                )
                
                results = []
                for u in users:
                    results.append({
                        "id": u.pk,
                        "username": u.username,
                        "full_name": u.full_name,
                        "photo_url": u.profile_pic_url,
                        "is_private": u.is_private
                    })
                logger.info(f"✅ Found {len(results)} results for '{query}'")
                return results
            except Exception as e:
                if "login_required" in str(e).lower() and attempt == 1:
                    logger.warning(f"⚠️ Session expired for account {account_id}. Clearing cache and retrying...")
                    self.clients.pop(account_id, None)
                    continue
                logger.error(f"❌ Search failed for '{query}': {e}")
                raise e
        return []

    async def create_thread_by_username(self, account_id: int, username: str) -> Dict[str, Any]:
        """Find a user and create a thread (or find existing one)."""
        client = await self.get_client(account_id)
        user_id = await asyncio.get_event_loop().run_in_executor(
            None, lambda: client.user_id_from_username(username)
        )
        
        user_info = await asyncio.get_event_loop().run_in_executor(
            None, lambda: client.user_info(user_id)
        )
        
        return {
            "id": f"new_{user_id}", # Temporary ID for frontend
            "title": user_info.full_name or user_info.username,
            "username": user_info.username,
            "type": "private",
            "last_message": None,
            "unread_count": 0,
            "photo_url": user_info.profile_pic_url
        }

instagram_chat_service = InstagramChatService()
