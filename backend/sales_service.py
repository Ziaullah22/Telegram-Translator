import logging
import json
import re
from typing import Optional, Dict, Any, List
from database import db
from telethon_service import telethon_service
from websocket_manager import manager
from translation_service import translation_service
from datetime import datetime
import os

logger = logging.getLogger(__name__)

class SalesService:
    def __init__(self):
        self.enabled = True

    async def check_and_handle_sales(self, message_data: Dict[str, Any], user_id: int) -> bool:
        """
        Check if message relates to product inquiry, ordering, or confirmation.
        Returns True if handled, False otherwise.
        """
        if not self.enabled or message_data.get('is_outgoing', False):
            return False

        account_id_raw = message_data.get('account_id')
        peer_id_raw = message_data.get('peer_id')
        text = message_data.get('text', '').strip()
        
        if account_id_raw is None or peer_id_raw is None or not text:
            return False
            
        account_id = int(account_id_raw)
        peer_id = int(peer_id_raw)

        # 1. Check current conversation state
        state = await db.fetchrow(
            "SELECT * FROM sales_states WHERE telegram_account_id = $1 AND telegram_peer_id = $2",
            account_id, peer_id
        )

        if state and state['status'] == 'awaiting_confirmation':
            # Handle Confirmation/Cancellation
            if text.upper() == 'CONFIRM':
                logger.info(f"Confirmed order for account {account_id}, peer {peer_id}")
                return await self._process_confirmation(account_id, peer_id, state, user_id)
            elif text.upper() == 'CANCEL':
                logger.info(f"Cancelled order for account {account_id}, peer {peer_id}")
                await db.execute(
                    "UPDATE sales_states SET status = 'idle' WHERE id = $1",
                    state['id']
                )
                await self._send_simple_reply(account_id, peer_id, "❌ Order cancelled.", user_id)
                return True

        # 2. Check for "order [product] [quantity]" pattern
        order_match = re.search(r'(?i)order\s+(.+?)\s+(\d+)', text)
        if not order_match:
            order_match = re.search(r'(?i)order\s+(\d+)\s+(.+)', text)
            if order_match:
                quantity = int(order_match.group(1))
                product_query = order_match.group(2).strip()
            else:
                quantity = None
                product_query = None
        else:
            product_query = order_match.group(1).strip()
            quantity = int(order_match.group(2))

        if product_query and quantity:
            logger.info(f"Order intent detected: {product_query} x {quantity}")
            return await self._handle_order_intent(account_id, peer_id, product_query, quantity, user_id)

        # 3. Check for product inquiries (Keywords)
        products = await db.fetch("SELECT * FROM products WHERE user_id = $1", user_id)
        text_lower = text.lower()
        matches = []
        for product in products:
            keywords = product['keywords']
            if isinstance(keywords, str):
                try:
                    keywords = json.loads(keywords)
                except:
                    keywords = [keywords]
            
            if not isinstance(keywords, list):
                keywords = []

            if any(k.lower() in text_lower for k in keywords if k):
                matches.append(product)

        if matches:
            logger.info(f"Product inquiry detected: {len(matches)} matching in: {text}")
            for product in matches:
                await self._send_product_info(account_id, peer_id, product, user_id)
            return True

        return False

    async def _handle_order_intent(self, account_id: int, peer_id: int, product_query: str, quantity: int, user_id: int) -> bool:
        """Find product and send draft invoice"""
        product = await db.fetchrow(
            """
            SELECT * FROM products 
            WHERE user_id = $1 
            AND (LOWER(name) LIKE $2 OR keywords::text ILIKE $3)
            ORDER BY (LOWER(name) = $4) DESC
            LIMIT 1
            """,
            user_id, f"%{product_query.lower()}%", f"%{product_query.lower()}%", product_query.lower()
        )

        if not product:
            await self._send_simple_reply(account_id, peer_id, f"Sorry, I couldn't find a product matching '{product_query}'.", user_id)
            return True

        if product['stock_quantity'] < 1:
            await self._send_simple_reply(account_id, peer_id, f"Sorry, {product['name']} is currently out of stock.", user_id)
            return True

        await db.execute(
            """
            INSERT INTO sales_states (telegram_account_id, telegram_peer_id, status, pending_product_id, pending_quantity, updated_at)
            VALUES ($1, $2, 'awaiting_confirmation', $3, $4, NOW())
            ON CONFLICT (telegram_account_id, telegram_peer_id)
            DO UPDATE SET status = 'awaiting_confirmation', pending_product_id = $3, pending_quantity = $4, updated_at = NOW()
            """,
            account_id, peer_id, product['id'], quantity
        )

        total = product['price'] * quantity
        invoice_msg = (
            f"📋 **ORDER DRAFT**\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"🔹 **Product:** {product['name']}\n"
            f"🔹 **Quantity:** {quantity}\n"
            f"🔹 **Price:** ${product['price']:.2f}\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"💰 **Total Amount: ${total:.2f}**\n\n"
            f"✅ Reply **CONFIRM** to place order\n"
            f"❌ Reply **CANCEL** to discard"
        )
        await self._send_simple_reply(account_id, peer_id, invoice_msg, user_id)
        return True

    async def _process_confirmation(self, account_id: int, peer_id: int, state: Any, user_id: int) -> bool:
        """Verify stock, create PO, update inventory, and send final confirmation"""
        try:
            product_id = state['pending_product_id']
            requested_qty = state['pending_quantity']

            async with db.pool.acquire() as conn:
                async with conn.transaction():
                    product = await conn.fetchrow(
                        "SELECT * FROM products WHERE id = $1 FOR UPDATE",
                        product_id
                    )

                    if not product:
                        await self._send_simple_reply(account_id, peer_id, "Sorry, the product was not found. Order cancelled.", user_id)
                        return True

                    actual_stock = product['stock_quantity']

                    if actual_stock < requested_qty:
                        if actual_stock > 0:
                            msg = (
                                f"❌ Sorry, we only have {actual_stock} unit{'s' if actual_stock > 1 else ''} of {product['name']} available right now. "
                                f"Would you like to order {actual_stock} unit{'s' if actual_stock > 1 else ''} instead? "
                                f"Reply **CONFIRM** to proceed or **CANCEL** to cancel."
                            )
                            await conn.execute("UPDATE sales_states SET pending_quantity = $1 WHERE id = $2", actual_stock, state['id'])
                        else:
                            msg = f"❌ Sorry, {product['name']} just went out of stock."
                            await conn.execute("UPDATE sales_states SET status = 'idle' WHERE id = $1", state['id'])
                        
                        await self._send_simple_reply(account_id, peer_id, msg, user_id)
                        return True

                    new_stock = actual_stock - requested_qty
                    await conn.execute("UPDATE products SET stock_quantity = $1 WHERE id = $2", new_stock, product_id)

                    order_count = await conn.fetchval("SELECT COUNT(*) FROM orders") or 0
                    po_number = f"PO-{1000 + order_count + 1}"

                    total_price = product['price'] * requested_qty
                    await conn.execute(
                        """
                        INSERT INTO orders (po_number, user_id, product_id, telegram_account_id, telegram_peer_id, quantity, unit_price, total_price, status)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed')
                        """,
                        po_number, user_id, product_id, account_id, peer_id, requested_qty, product['price'], total_price
                    )

                    settings = await conn.fetchrow("SELECT payment_details FROM sales_settings WHERE user_id = $1", user_id)
                    payment_info = settings['payment_details'] if settings and settings['payment_details'] else "[No payment details configured]"

                    conf_msg = (
                        f"🎉 **ORDER CONFIRMED!**\n"
                        f"Order ID: `{po_number}`\n"
                        f"Date: {datetime.now().strftime('%d %B %Y')}\n\n"
                        f"📦 **Details:**\n"
                        f"{product['name']} × {requested_qty} = **${total_price:.2f}**\n\n"
                        f"💳 **Payment Instructions:**\n"
                        f"{payment_info}\n\n"
                        f"Thank you for your business! 🙏"
                    )

                    await conn.execute("UPDATE sales_states SET status = 'idle' WHERE id = $1", state['id'])
                    
                    # Store info for reply outside transaction
                    final_data = {
                        "conf_msg": conf_msg,
                        "po_number": po_number,
                        "product_name": product['name'],
                        "qty": requested_qty,
                        "total": total_price
                    }
                
                # Transaction finished successfully
                await self._send_simple_reply(account_id, peer_id, final_data['conf_msg'], user_id)
                
                await manager.send_personal_message({
                    "type": "order_confirmed",
                    "po_number": final_data['po_number'],
                    "product_name": final_data['product_name'],
                    "quantity": final_data['qty'],
                    "total_price": final_data['total']
                }, user_id)

                return True
        except Exception as e:
            logger.error(f"Error in _process_confirmation: {e}")
            await self._send_simple_reply(account_id, peer_id, "Sorry, something went wrong while confirming your order.", user_id)
            return True
        return False

    async def _send_product_info(self, account_id: int, peer_id: int, product: Any, user_id: int) -> bool:
        """Send product details auto-reply with all available images"""
        price = product.get('price', 0.0)
        desc = product.get('description') or 'Quality product'
        name = product.get('name', 'Product')

        # Fetch target language for the account to provide pre-translation
        account_data = await db.fetchrow("SELECT target_language FROM telegram_accounts WHERE id = $1", account_id)
        target_lang = account_data['target_language'] if account_data else 'en'
        
        # Translate ONLY the description part for the customer and Admin UI
        try:
            t_data = await translation_service.translate_text(desc, target_lang)
            translated_desc = t_data['translated_text']
        except Exception:
            translated_desc = desc

        # Create the message for the CUSTOMER (Translated description only)
        customer_reply_text = (
            f"📦 **{name}**\n"
            f"💰 **Price:** ${price:.2f}\n"
            f"📝 **Description:** {translated_desc}\n\n"
            f"🛒 To order, please reply:\n"
            f"`Order {name} [quantity]`"
        )
        
        # Create the message for the ADMIN (English everything)
        admin_original_text = (
            f"📦 **{name}**\n"
            f"💰 **Price:** ${price:.2f}\n"
            f"📝 **Description:** {desc}\n\n"
            f"🛒 To order, please reply:\n"
            f"`Order {name} [quantity]`"
        )
        
        # The 'Translated' view in admin will show the full message with the translated description
        admin_translated_text = customer_reply_text

        photo_paths_with_urls = []
        photo_urls = product.get('photo_urls', [])
        if isinstance(photo_urls, str):
            try:
                photo_urls = json.loads(photo_urls)
            except:
                photo_urls = []
        
        if not photo_urls and product.get('photo_url'):
            photo_urls = [product['photo_url']]
            
        if photo_urls:
            project_root = os.getcwd()
            for url in photo_urls:
                rel_path = url.lstrip('/')
                # Try multiple path resolutions for Windows/Linux compatibility
                possible_paths = [
                    os.path.join(project_root, rel_path),
                    os.path.join(project_root, 'backend', rel_path),
                    os.path.join(os.path.dirname(os.path.dirname(__file__)), rel_path),
                    os.path.join(os.path.dirname(__file__), rel_path)
                ]
                
                found_path = None
                for p in possible_paths:
                    if os.path.exists(p) and os.path.isfile(p):
                        found_path = p
                        break
                
                if found_path:
                    photo_paths_with_urls.append((found_path, url))
                else:
                    logger.warning(f"Product photo not found at any of: {possible_paths}")

        session = await telethon_service.get_session(account_id)
        if session and session.is_connected:
            try:
                photo_paths = [p for p, u in photo_paths_with_urls]
                
                if photo_paths:
                    # Send media. Telethon returns a list if an album was sent.
                    result = await session.client.send_file(peer_id, photo_paths, caption=customer_reply_text)
                    
                    # Store all relative URLs as a JSON array in one message
                    all_urls = [u for p, u in photo_paths_with_urls]
                    
                    # Extract message ID from result to prevent duplication in main.py
                    tg_msg_id = result[0].id if isinstance(result, list) else result.id
                    
                    await self._save_auto_message(
                        account_id, peer_id, admin_original_text, user_id, 
                        msg_type='photo', 
                        media_file_name=json.dumps(all_urls),
                        translated_text=admin_translated_text,
                        telegram_message_id=tg_msg_id
                    )
                else:
                    result = await session.client.send_message(peer_id, customer_reply_text)
                    await self._save_auto_message(
                        account_id, peer_id, admin_original_text, user_id, 
                        translated_text=admin_translated_text,
                        telegram_message_id=result.id
                    )
                return True
            except Exception as e:
                logger.error(f"Error sending product info: {e}")
                await session.client.send_message(peer_id, customer_reply_text)
                await self._save_auto_message(account_id, peer_id, admin_original_text, user_id, translated_text=admin_translated_text)
                return True
        return False

    async def _send_simple_reply(self, account_id: int, peer_id: int, text: str, user_id: int) -> bool:
        session = await telethon_service.get_session(account_id)
        if session and session.is_connected:
            await session.client.send_message(peer_id, text)
            await self._save_auto_message(account_id, peer_id, text, user_id)
            return True
        return False

    async def _save_auto_message(self, account_id: int, peer_id: int, original_text: str, user_id: int, 
                                msg_type: str = 'auto_reply', media_file_name: Optional[str] = None, 
                                translated_text: Optional[str] = None, telegram_message_id: Optional[int] = None):
        conversation_id = await db.fetchval(
            "SELECT id FROM conversations WHERE telegram_account_id = $1 AND telegram_peer_id = $2",
            account_id, peer_id
        )
        if conversation_id:
            # Use provided translated_text or fallback to original_text
            t_text = translated_text if translated_text is not None else original_text
            
            msg_id = await db.fetchval(
                """
                INSERT INTO messages (conversation_id, telegram_message_id, sender_name, sender_username, type, original_text, translated_text, is_outgoing, media_file_name, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, NOW())
                RETURNING id
                """,
                conversation_id, telegram_message_id, 'Bot', 'bot', msg_type, original_text, t_text, media_file_name
            )
            await manager.send_to_account({
                "type": "new_message",
                "message": {
                    "id": msg_id,
                    "conversation_id": conversation_id,
                    "telegram_message_id": telegram_message_id,
                    "sender_name": "Bot",
                    "sender_username": "bot",
                    "type": msg_type,
                    "original_text": original_text,
                    "translated_text": t_text,
                    "is_outgoing": True,
                    "media_file_name": media_file_name,
                    "created_at": datetime.now().isoformat()
                }
            }, account_id, user_id)

sales_service = SalesService()
