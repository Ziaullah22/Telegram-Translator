import asyncio
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

    async def _get_sales_settings(self, user_id: int) -> Dict[str, Any]:
        try:
            row = await db.fetchrow("SELECT * FROM sales_settings WHERE user_id = $1", user_id)
            if row:
                d = dict(row)
                for k in ['system_labels', 'system_prompts', 'protected_words', 'ignored_languages', 'language_expert_packs']:
                    val = d.get(k)
                    if isinstance(val, str):
                        d[k] = json.loads(val)
                    elif val is None:
                        if k in ['protected_words', 'ignored_languages']: d[k] = []
                        else: d[k] = {}
                # Fetch active A/B test if exists
                ab_test = await db.fetchrow("SELECT * FROM ab_tests WHERE user_id = $1 AND is_active = TRUE LIMIT 1", user_id)
                d['active_ab_test'] = dict(ab_test) if ab_test else None
                
                return d
        except Exception as e:
            logger.error(f"Error fetching sales settings: {e}")
        return {'protected_words': [], 'ignored_languages': [], 'system_labels': {}, 'system_prompts': {}, 'language_expert_packs': {}, 'active_ab_test': None}

    async def apply_branded_labels(self, text: str, user_id: int) -> str:
        """Applies global label replacements to any text (manual or auto)"""
        if not text: return text
        settings = await self._get_sales_settings(user_id)
        labels = settings.get('system_labels', {})
        if not labels: return text
        
        processed_text = text
        for key, display_val in labels.items():
            if not key or not display_val: continue
            
            # 1. SMART CHECK: Prevent duplicates like "Hello bro bro" when label is "Hello" -> "Hello bro"
            # We use a negative lookahead to only replace the key if it's NOT followed by the suffix.
            if display_val.lower().startswith(key.lower()) and len(display_val) > len(key):
                suffix = display_val[len(key):].strip()
                if suffix:
                    # Look for [KEY] followed by [SUFFIX] (case insensitive) and replace with [DISPLAY_VAL]
                    # This handles "Hello Bro" -> "Hello bro"
                    smart_pattern = re.compile(
                        r'\b' + re.escape(key) + r'\s+' + re.escape(suffix) + r'\b', 
                        re.IGNORECASE
                    )
                    processed_text = smart_pattern.sub(display_val, processed_text)
                    
                    # 2. General replacement but ONLY if not already followed by the suffix
                    # This handles "Hello" -> "Hello bro" but skips "Hello bro" (already replaced)
                    pattern = re.compile(
                        r'\b' + re.escape(key) + r'\b(?!\s+' + re.escape(suffix) + r'\b)', 
                        re.IGNORECASE
                    )
                    processed_text = pattern.sub(display_val, processed_text)
                    continue # Skip general replacement as we handled it
            
            # 3. Normal replacement for simple keys
            pattern = re.compile(r'\b' + re.escape(key) + r'\b', re.IGNORECASE)
            processed_text = pattern.sub(display_val, processed_text)
            
        return processed_text

    async def translate_with_protection(self, text: str, target_lang: str, user_id: int) -> str:
        """Translates text while honoring ignored languages and protected words"""
        # 0. Apply Branded Replacements FIRST
        text = await self.apply_branded_labels(text, user_id)
        
        settings = await self._get_sales_settings(user_id)
        
        # 1. Check Ignored Languages
        ignored_langs = [l.lower() for l in settings.get('ignored_languages', [])]
        target_lang_code = target_lang.lower()
        expert_packs = settings.get('language_expert_packs', {})
        
        # Smart Language Matching: 
        # 1. Try exact match (e.g., 'zh-cn')
        # 2. Try prefix match (e.g., if target is 'zh-cn', try 'zh')
        # 3. Try reverse prefix match (e.g., if target is 'zh', find first pack starting with 'zh-')
        target_pack = expert_packs.get(target_lang_code)
        
        if not target_pack:
            base_lang = target_lang_code.split('-')[0]
            target_pack = expert_packs.get(base_lang)
            
            if not target_pack:
                # Look for ANY pack that belongs to this language family
                family_pack_key = next((k for k in expert_packs.keys() if k.startswith(base_lang + '-')), None)
                if family_pack_key:
                    target_pack = expert_packs.get(family_pack_key)
        
        target_pack = target_pack or {}
        
        # Structure for tokens
        tokens = {}
        token_count = 0
        processed_text = text

        # 1. Check Expert Pack for this specific language
        # If we have a human translation for a phrase, we swap it and PROTECT it
        if target_pack:
            # Sort keys by length DESC to match longest phrases first
            sorted_pack_keys = sorted(target_pack.keys(), key=len, reverse=True)
            for raw_key in sorted_pack_keys:
                expert_val = target_pack[raw_key]
                if not raw_key or not expert_val: continue
                
                # SMART MATCHING: Only use word boundaries (\b) if the key starts/ends with word characters.
                # This allows matching "This work?" precisely while still allowing "Sale" to not match "Salesman".
                start_boundary = r'\b' if re.match(r'^\w', raw_key) else ''
                end_boundary = r'\b' if re.search(r'\w$', raw_key) else ''
                
                pattern = re.compile(start_boundary + re.escape(raw_key) + end_boundary, re.IGNORECASE)
                if pattern.search(processed_text):
                    # Replace with token and store the EXPERT VALUE as the replacement
                    token = f"__EXP_{token_count}__"
                    tokens[token] = expert_val
                    processed_text = pattern.sub(token, processed_text)
                    token_count += 1

        # 2. Check General Protected Words (Word Shields)
        protected_words = settings.get('protected_words', [])
        for word in protected_words:
            if not word: continue
            # Look for word and replace with token
            pattern = re.compile(r'\b' + re.escape(word) + r'\b', re.IGNORECASE)
            if pattern.search(processed_text):
                token = f"__PW_{token_count}__"
                # Store ORIGINAL word to put back later
                tokens[token] = word 
                processed_text = pattern.sub(token, processed_text)
                token_count += 1
        
        # 3. Translate the tokenized text (fallback)
        if not processed_text.strip():
            return processed_text
            
        if target_lang_code not in ignored_langs:
            try:
                res = await translation_service.translate_text(processed_text, target_lang)
                result_text = res['translated_text']
            except Exception as e:
                logger.error(f"Expert Pack translation error: {e}")
                result_text = processed_text # Fallback to tokenized text
        else:
            result_text = processed_text
            
        # 4. Detokenize: Swap tokens back to their human/protected values
        for token, replacement in tokens.items():
            result_text = result_text.replace(token, replacement)
            
            # Handle if translator added spaces: "__PW_ 0 __" or similar
            # Extract index from token string __EXP_0__ or __PW_0__
            parts = token.strip('_').split('_')
            if len(parts) >= 2:
                prefix = parts[0]
                idx = parts[1]
                clean_pattern = re.compile(f"__\s*{prefix}\s*_\s*{idx}\s*__", re.IGNORECASE)
                result_text = clean_pattern.sub(replacement, result_text)

        return result_text

    async def _get_system_prompt(self, user_id: int, key: str, default: str, target_lang: Optional[str] = None) -> str:
        """Fetch branded prompt from sales_settings or fallback to default, trying lang-specific key first"""
        try:
            settings_row = await db.fetchrow("SELECT system_prompts FROM sales_settings WHERE user_id = $1", user_id)
            if settings_row and settings_row['system_prompts']:
                prompts = settings_row['system_prompts']
                if isinstance(prompts, str): prompts = json.loads(prompts)
                # Try specific language key first: KEY_es
                if target_lang:
                    lang_key = f"{key}_{target_lang.lower()}"
                    if lang_key in prompts: return prompts[lang_key]
                return prompts.get(key, default)
        except Exception as e:
            logger.error(f"Error fetching system prompt {key}: {e}")
        return default

    async def _get_system_label(self, user_id: int, key: str, default: str, target_lang: Optional[str] = None) -> str:
        """Fetch branded label from sales_settings or fallback to default, trying lang-specific key first"""
        try:
            settings = await self._get_sales_settings(user_id)
            labels = settings.get('system_labels', {})
            
            # 1. Try specific language key first: KEY_es
            if target_lang:
                lang_key = f"{key}_{target_lang.lower()}"
                if lang_key in labels: return labels[lang_key]
            
            # 2. Try the primary key
            return labels.get(key, default)
        except Exception as e:
            logger.error(f"Error fetching system label {key}: {e}")
        return default

    async def _get_status_template(self, user_id: int, status: str, default: str) -> str:
        """Fetch status message template from sales_settings or fallback to default"""
        try:
            settings = await self._get_sales_settings(user_id)
            messages = settings.get('status_messages', {})
            return messages.get(status, default)
        except Exception as e:
            logger.error(f"Error fetching status template {status}: {e}")
        return default

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
        msg_type = message_data.get('type', 'text')
        
        if account_id_raw is None or peer_id_raw is None or (not text and msg_type != 'photo'):
            return False
            
        account_id = int(account_id_raw)
        peer_id = int(peer_id_raw)

        # 0. Check for Payment Screenshot if it's a photo
        if msg_type == 'photo':
            # Check for recent pending_payment or disapproved order for this user
            order = await db.fetchrow(
                "SELECT id, po_number, status FROM orders WHERE telegram_account_id = $1 AND telegram_peer_id = $2 AND status IN ('pending_payment', 'disapproved') ORDER BY created_at DESC LIMIT 1",
                account_id, peer_id
            )
            if order:
                media_file = message_data.get('media_filename')
                # 1. Update order (if it was disapproved, move it back to pending_payment for re-verification)
                await db.execute(
                    "UPDATE orders SET payment_screenshot_path = $1, status = 'pending_payment', reminder_count = 0, updated_at = NOW() WHERE id = $2",
                    media_file, order['id']
                )
                
                # 2. Store in proof history table
                await db.execute(
                    "INSERT INTO order_proofs (order_id, file_path) VALUES ($1, $2)",
                    order['id'], media_file
                )
                
                logger.info(f"Payment screenshot detected and linked to Order {order['po_number']}. History updated.")
                prompt = await self._get_system_prompt(user_id, 'SCREENSHOT_RECEIVED', "✅ Thank you for the screenshot! We have received it for Order {order_id} and will verify it shortly. 🙏")
                msg = prompt.replace("{order_id}", f"#{order['po_number']}")
                await self._translate_and_send_reply(account_id, peer_id, msg, user_id)
                return True
            return False

        # PRE-PROCESSING: Internal Back-Translation for Logic
        # We translate the customer's message to English internally to perform regex matching.
        # This allows the bot to understand "确认" as "CONFIRM" or "طلب" as "Order".
        logic_text = text # Fallback
        try:
            # Fetch target language and translation toggle for this account
            account_data = await db.fetchrow("SELECT target_language, translation_enabled FROM telegram_accounts WHERE id = $1", account_id)
            target_lang = account_data['target_language'] if account_data else 'en'
            translation_enabled = account_data['translation_enabled'] if account_data else True
            
            # If the user's language is NOT english AND translator is ON, we translate their message back to english for the bot's logic
            # This allows the bot to understand foreign language intents like "确认" as "CONFIRM"
            if target_lang != 'en' and translation_enabled:
                # We translate text -> English (en)
                t_data = await translation_service.translate_text(text, 'en')
                logic_text = t_data['translated_text'].strip()
                logger.debug(f"Internally translated incoming text for logic: '{text}' -> '{logic_text}'")
            else:
                logic_text = text
        except Exception as e:
            logger.error(f"Error in back-translation for logic: {e}")
            logic_text = text

        # Use logic_text for ALL intent detection below
        logic_text_upper = logic_text.upper()
        logic_text_lower = logic_text.lower()
        text_lower = text.lower()
        stripped_logic = logic_text_lower.strip()
        stripped_text = text_lower.strip()

        # ---------------------------------------------------------
        # 1. HEURISTIC ORDER INTENT MATCHER (Flexible for all languages)
        # ---------------------------------------------------------
        # We look for: [Order Verb] + [Product Match] + [Some Number]
        # We handle this BEFORE state processing so a user can always start a new order.
        order_verbs = {
            'order', 'ordern', 'orden', 'comando', 'command', 'request', 'buy', 'purchase', 'booking', 'book',
            '订购', 'طلب', '命令', '买', 'comprar', 'acheter', 'commande', 'pedido', 'pide', 'kauf', 'hacer pedido'
        }
        has_order_verb = any(v in logic_text_lower for v in order_verbs)
        all_nums = re.findall(r'\d+', logic_text)
        
        # A/B TEST TRACKING: If this is an order intent, check if user was part of a test
        async def track_conversion():
            await db.execute(
                "UPDATE ab_test_results SET is_converted = TRUE, converted_at = NOW() WHERE telegram_account_id = $1 AND telegram_peer_id = $2 AND is_converted = FALSE",
                account_id, peer_id
            )

        products = await db.fetch("SELECT * FROM products WHERE user_id = $1", user_id)
        for product in products:
            name_match = product['name'].lower() in logic_text_lower
            keyword_match = False
            keywords = product['keywords']
            if isinstance(keywords, str):
                try: keywords = json.loads(keywords)
                except: keywords = [keywords]
            if isinstance(keywords, list):
                keyword_match = any(k.lower() in logic_text_lower for k in keywords if k)
            
            if name_match or keyword_match:
                prod_name_nums = re.findall(r'\d+', product['name'])
                if has_order_verb or (len(all_nums) > 0):
                    # We pick the LAST number because product names (like iPhone 11) 
                    # often have numbers at the start/middle.
                    final_qty = 1
                    if all_nums:
                        try:
                            # Filter out numbers that are part of the product name
                            potential_qtys = [int(n) for n in all_nums if n not in prod_name_nums]
                            if potential_qtys:
                                final_qty = potential_qtys[-1] # Take the last one (usually at the end of message)
                            else:
                                # If no other numbers, maybe they just said "iphone 11 case 1" 
                                # and we already filtered the '1' if it was part of '11'? 
                                # Let's be safer: if the last number in message is a likely quantity
                                last_num = int(all_nums[-1])
                                if last_num < 100: # Heuristic: unlikely to order 100+ of something vs product model
                                    final_qty = last_num
                        except:
                            final_qty = 1
                            
                    logger.info(f"Fuzzy Order Intent Detected: '{product['name']}' x {final_qty}")
                    await track_conversion()
                    return await self._handle_order_intent(account_id, peer_id, product['name'], final_qty, user_id)

        # ---------------------------------------------------------
        # 2. Check for product inquiries (Keywords) using logic_text
        # ---------------------------------------------------------
        # We check this before state because keyword inquiry is a global intent.
        matches = []
        for product in products:
            keywords = product['keywords']
            if isinstance(keywords, str):
                try: keywords = json.loads(keywords)
                except: keywords = [keywords]
            if isinstance(keywords, list) and any(k.lower() in logic_text_lower for k in keywords if k):
                matches.append(product)

        if matches:
            logger.info(f"Product inquiry detected: {len(matches)} matching in: {text}")
            
            # A/B TEST ASSIGNMENT: If user inquiries and isn't in a test yet, assign them
            settings = await self._get_sales_settings(user_id)
            active_test = settings.get('active_ab_test')
            
            if active_test:
                # Check if already assigned
                existing = await db.fetchrow(
                    "SELECT variant FROM ab_test_results WHERE test_id = $1 AND telegram_account_id = $2 AND telegram_peer_id = $3",
                    active_test['id'], account_id, peer_id
                )
                
                variant = None
                if not existing:
                    import random
                    variant = random.choice(['A', 'B'])
                    await db.execute(
                        "INSERT INTO ab_test_results (test_id, telegram_account_id, telegram_peer_id, variant, variant_assigned) VALUES ($1, $2, $3, $4, $4)",
                        active_test['id'], account_id, peer_id, variant
                    )
                else:
                    variant = existing['variant']
                
                # If variant B is assigned, send Pitch B FIRST, then let normal product info follow
                if variant == 'B' and active_test.get('variant_b_text'):
                    await self._translate_and_send_reply(account_id, peer_id, active_test['variant_b_text'], user_id)
                elif variant == 'A' and active_test.get('variant_a_text'):
                    await self._translate_and_send_reply(account_id, peer_id, active_test['variant_a_text'], user_id)
                # Fall through to send normal product info below

            for product in matches:
                await self._send_product_info(account_id, peer_id, product, user_id)
            return True

        # ---------------------------------------------------------
        # 3. Check current conversation state using logic_text
        # ---------------------------------------------------------
        state = await db.fetchrow(
            "SELECT * FROM sales_states WHERE telegram_account_id = $1 AND telegram_peer_id = $2",
            account_id, peer_id
        )

        if state and state['status'] != 'idle':
            current_status = state['status']
            if current_status == 'awaiting_delivery_pref':
                return await self._process_delivery_pref(account_id, peer_id, state, logic_text, text, user_id)
            elif current_status in ('awaiting_address', 'awaiting_h2h_address'):
                return await self._process_address(account_id, peer_id, state, text, user_id)
            elif current_status == 'awaiting_time_slot':
                return await self._process_time_slot(account_id, peer_id, state, text, user_id)
            elif current_status == 'awaiting_instructions':
                return await self._process_instructions(account_id, peer_id, state, text, user_id)
            elif current_status == 'awaiting_confirmation':
                # GLOBAL MULTILINGUAL CONFIRMATION CHECK
                confirm_words = {
                    'confirm', 'confirmar', 'confirmer', 'ok', 'okay', 'yes', 'confirmado', 'confirmé', 'si', 'sí', 'oui', 'ja', 'vov',
                    'yes', 'confirmed', 'confirming', '确认', '確認', 'نعم', 'جی ہاں', '✅', 'tak', 'da'
                }
                # Shortcut check - strictly exact
                is_confirm = any(s in logic_text_lower or s in text_lower for s in confirm_words) or \
                             stripped_logic == '1' or stripped_text == '1'
                             
                cancel_words = {
                    'cancel', 'cancelar', 'annuler', 'no', 'stop', 'cancelado', 'annulé', 'nein', 'non', 'discard', 'cancelling',
                    '取消', '❌', 'ne', 'nē', 'rādd', 'khārij'
                }
                is_cancel = any(s in logic_text_lower or s in text_lower for s in cancel_words) or \
                            stripped_logic == '2' or stripped_text == '2'

                if is_confirm:
                    logger.info(f"Confirmed order for account {account_id}, peer {peer_id}")
                    return await self._process_confirmation(account_id, peer_id, state, user_id)
                elif is_cancel:
                    logger.info(f"Cancelled order for account {account_id}, peer {peer_id}")
                    await db.execute("UPDATE sales_states SET status = 'idle' WHERE id = $1", state['id'])
                    prompt = await self._get_system_prompt(user_id, 'ORDER_CANCELLED', "❌ Order cancelled.")
                    await self._translate_and_send_reply(account_id, peer_id, prompt, user_id)
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
            prompt = await self._get_system_prompt(user_id, 'PRODUCT_NOT_FOUND', "Sorry, I couldn't find a product matching '{product_query}'.")
            msg = prompt.replace("{product_query}", product_query)
            await self._translate_and_send_reply(account_id, peer_id, msg, user_id)
            return True

        if product['stock_quantity'] < 1:
            prompt = await self._get_system_prompt(user_id, 'OUT_OF_STOCK', "Sorry, {product_name} is currently out of stock.")
            msg = prompt.replace("{product_name}", product['name'])
            await self._translate_and_send_reply(account_id, peer_id, msg, user_id)
            return True

        delivery_mode_raw = product.get('delivery_mode')
        delivery_mode = (str(delivery_mode_raw).strip().lower()) if delivery_mode_raw else 'both'
        
        logger.info(f"DEBUG - Product '{product['name']}' raw delivery_mode from DB: {delivery_mode_raw} -> Evaluated to: {delivery_mode}")
        
        # CRITICAL FIX: Ensure we use the SPECIFIC product's delivery mode safely
        if delivery_mode == 'mailing' or delivery_mode == 'mailing_only':
            initial_status = 'awaiting_address'
            delivery_mode = 'mailing'
        elif delivery_mode == 'hand_to_hand' or delivery_mode == 'hand_only':
            initial_status = 'awaiting_address'
            delivery_mode = 'hand_to_hand'
        else:
            initial_status = 'awaiting_delivery_pref'
            delivery_mode = 'both'
            
        logger.info(f"DEBUG - Final Delivery Path Chosen: {delivery_mode}")
            
        await db.execute(
            """
            INSERT INTO sales_states (telegram_account_id, telegram_peer_id, status, pending_product_id, pending_quantity, delivery_mode, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (telegram_account_id, telegram_peer_id)
            DO UPDATE SET status = $3, pending_product_id = $4, pending_quantity = $5, delivery_mode = $6, updated_at = NOW()
            """,
            account_id, peer_id, initial_status, product['id'], quantity, delivery_mode
        )

        if delivery_mode == 'both':
            prompt = await self._get_system_prompt(user_id, 'DELIVERY_PREF_BOTH', "Great! Do you prefer this product to be Mailed to you, or delivered Hand-to-Hand? (Reply 'Mail' or 'Hand')")
            await self._translate_and_send_reply(account_id, peer_id, prompt, user_id)
        elif delivery_mode == 'mailing':
            await db.execute("UPDATE sales_states SET delivery_method = 'mailing' WHERE telegram_account_id=$1 AND telegram_peer_id=$2", account_id, peer_id)
            prompt = await self._get_system_prompt(user_id, 'ADDRESS_MAILING', "Great! Please provide your full mailing address.")
            await self._translate_and_send_reply(account_id, peer_id, prompt, user_id)
        elif delivery_mode == 'hand_to_hand':
            await db.execute("UPDATE sales_states SET delivery_method = 'hand_to_hand' WHERE telegram_account_id=$1 AND telegram_peer_id=$2", account_id, peer_id)
            prompt = await self._get_system_prompt(user_id, 'ADDRESS_HAND', "Great! Please provide your preferred meetup/delivery address.")
            await self._translate_and_send_reply(account_id, peer_id, prompt, user_id)
        return True

    async def _process_delivery_pref(self, account_id: int, peer_id: int, state: Any, logic_text: str, text: str, user_id: int) -> bool:
        logic_lower = logic_text.lower()
        text_lower = text.lower()
        
        # Check for Mailing Synonyms in both English (logic) and Original (text)
        mailing_synonyms = {'mail', 'mailing', 'shipping', 'correo', 'correio', 'envi', 'post', '1'}
        # Check for Hand Synonyms in both English (logic) and Original (text)
        hand_synonyms = {'hand', 'meetup', 'pickup', 'personal', 'mano', 'mão', 'recojo', '2'}
        
        is_mailing = any(s in logic_lower or s in text_lower for s in mailing_synonyms)
        is_hand = any(s in logic_lower or s in text_lower for s in hand_synonyms)
        
        if is_mailing:
            await db.execute("UPDATE sales_states SET delivery_method = 'mailing', status = 'awaiting_address' WHERE id = $1", state['id'])
            prompt = await self._get_system_prompt(user_id, 'ADDRESS_MAILING', "Great! Please provide your full mailing address.")
            await self._translate_and_send_reply(account_id, peer_id, prompt, user_id)
        elif is_hand:
            await db.execute("UPDATE sales_states SET delivery_method = 'hand_to_hand', status = 'awaiting_address' WHERE id = $1", state['id'])
            prompt = await self._get_system_prompt(user_id, 'ADDRESS_HAND', "Great! Please provide your preferred meetup/delivery address.")
            await self._translate_and_send_reply(account_id, peer_id, prompt, user_id)
        else:
            prompt = await self._get_system_prompt(user_id, 'INVALID_DELIVERY_PREF', "Please reply with either 'Mail' or 'Hand'.")
            await self._translate_and_send_reply(account_id, peer_id, prompt, user_id)
        return True

    async def _process_address(self, account_id: int, peer_id: int, state: Any, text: str, user_id: int) -> bool:
        method = state.get('delivery_method', 'mailing') or 'mailing'
        next_status = 'awaiting_time_slot' if method == 'hand_to_hand' else 'awaiting_instructions'
        await db.execute("UPDATE sales_states SET delivery_address = $1, status = $2 WHERE id = $3", text, next_status, state['id'])
        
        if method == 'hand_to_hand':
            prompt = await self._get_system_prompt(user_id, 'TIME_SLOT', "What is your preferred time slot for the delivery?")
            await self._translate_and_send_reply(account_id, peer_id, prompt, user_id)
        else:
            prompt = await self._get_system_prompt(user_id, 'INSTRUCTIONS', "Do you have any extra delivery instructions? (Reply 'None' if not)")
            await self._translate_and_send_reply(account_id, peer_id, prompt, user_id)
        return True

    async def _process_time_slot(self, account_id: int, peer_id: int, state: Any, text: str, user_id: int) -> bool:
        await db.execute("UPDATE sales_states SET delivery_time_slot = $1, status = 'awaiting_instructions' WHERE id = $2", text, state['id'])
        prompt = await self._get_system_prompt(user_id, 'EXTRA_INSTRUCTIONS', "Any extra delivery instructions we should know about? (Reply 'None' if not)")
        await self._translate_and_send_reply(account_id, peer_id, prompt, user_id)
        return True

    async def _process_instructions(self, account_id: int, peer_id: int, state: Any, text: str, user_id: int) -> bool:
        await db.execute("UPDATE sales_states SET delivery_instructions = $1, status = 'awaiting_confirmation' WHERE id = $2", text, state['id'])
        updated_state = await db.fetchrow("SELECT * FROM sales_states WHERE id = $1", state['id'])
        return await self._send_order_summary(account_id, peer_id, updated_state, user_id)

    async def _send_order_summary(self, account_id: int, peer_id: int, state: Any, user_id: int) -> bool:
        product = await db.fetchrow("SELECT * FROM products WHERE id = $1", state['pending_product_id'])
        quantity = state['pending_quantity']
        
        # Fetch target language and toggle
        account_data = await db.fetchrow("SELECT source_language, translation_enabled FROM telegram_accounts WHERE id = $1", account_id)
        target_lang = account_data['source_language'] if account_data else 'en'
        translation_enabled = account_data['translation_enabled'] if account_data else True

        total = product['price'] * quantity
        
        method = state.get('delivery_method', 'mailing') or 'mailing'
        address = state.get('delivery_address', 'N/A')
        time_slot = state.get('delivery_time_slot', 'N/A')
        instr = state.get('delivery_instructions', 'None')
        
        # Build translated delivery details block
        if translation_enabled and target_lang != 'en':
            try:
                # Fetch branded labels first
                l_title = await self._get_system_label(user_id, 'ORDER_SUMMARY_TITLE', "ORDER SUMMARY", target_lang)
                l_prod = await self._get_system_label(user_id, 'PRODUCT_LABEL', "Product:", target_lang)
                l_qty = await self._get_system_label(user_id, 'QUANTITY_LABEL', "Quantity:", target_lang)
                l_price = await self._get_system_label(user_id, 'PRICE_LABEL', "Price:", target_lang)
                l_total = await self._get_system_label(user_id, 'TOTAL_LABEL', "Total Amount:", target_lang)
                l_reply = await self._get_system_label(user_id, 'INVOICE_FOOTER_REPLY', "Reply", target_lang)
                l_to_conf = await self._get_system_label(user_id, 'INVOICE_FOOTER_CONFIRM', "to confirm", target_lang)
                l_to_disc = await self._get_system_label(user_id, 'INVOICE_FOOTER_DISCARD', "to discard", target_lang)
                l_confirm = await self._get_system_label(user_id, 'CONFIRM_BTN', "CONFIRM", target_lang)
                l_cancel = await self._get_system_label(user_id, 'CANCEL_BTN', "CANCEL", target_lang)
                l_del_method = await self._get_system_label(user_id, 'DELIVERY_METHOD_LABEL', "Delivery Method:", target_lang)
                l_address = await self._get_system_label(user_id, 'ADDRESS_LABEL', "Address:", target_lang)
                l_time_slot = await self._get_system_label(user_id, 'TIME_SLOT_LABEL', "Time Slot:", target_lang)
                l_instr = await self._get_system_label(user_id, 'INSTRUCTIONS_LABEL', "Instructions:", target_lang)

                tasks = [
                    self.translate_with_protection(l_title, target_lang, user_id),
                    self.translate_with_protection(l_prod, target_lang, user_id),
                    self.translate_with_protection(l_qty, target_lang, user_id),
                    self.translate_with_protection(l_price, target_lang, user_id),
                    self.translate_with_protection(l_total, target_lang, user_id),
                    self.translate_with_protection(l_reply, target_lang, user_id),
                    self.translate_with_protection(l_to_conf, target_lang, user_id),
                    self.translate_with_protection(l_to_disc, target_lang, user_id),
                    self.translate_with_protection(product['name'], target_lang, user_id),
                    self.translate_with_protection(l_confirm, target_lang, user_id),
                    self.translate_with_protection(l_cancel, target_lang, user_id),
                    # Delivery labels
                    self.translate_with_protection(l_del_method, target_lang, user_id),
                    self.translate_with_protection(l_address, target_lang, user_id),
                    self.translate_with_protection(l_time_slot, target_lang, user_id),
                    self.translate_with_protection(l_instr, target_lang, user_id),
                    self.translate_with_protection(method.replace('_', ' ').title(), target_lang, user_id),
                ]
                results = await asyncio.gather(*tasks)
                
                t_title = results[0]
                t_prod = results[1]
                t_qty = results[2]
                t_price = results[3]
                t_total = results[4]
                t_reply = results[5]
                t_to_conf = results[6]
                t_to_disc = results[7]
                t_name = results[8]
                t_confirm = results[9].upper()
                t_cancel = results[10].upper()
                t_del_method = results[11]
                t_address = results[12]
                t_time_slot = results[13]
                t_instructions = results[14]
                t_method_val = results[15]
            except:
                t_title, t_prod, t_qty, t_price, t_total, t_reply, t_to_conf, t_to_disc, t_name, t_confirm, t_cancel = (
                    await self._get_system_label(user_id, 'ORDER_SUMMARY_TITLE', "ORDER SUMMARY"),
                    await self._get_system_label(user_id, 'PRODUCT_LABEL', "Product:"),
                    await self._get_system_label(user_id, 'QUANTITY_LABEL', "Quantity:"),
                    await self._get_system_label(user_id, 'PRICE_LABEL', "Price:"),
                    await self._get_system_label(user_id, 'TOTAL_LABEL', "Total Amount:"),
                    await self._get_system_label(user_id, 'INVOICE_FOOTER_REPLY', "Reply"),
                    await self._get_system_label(user_id, 'INVOICE_FOOTER_CONFIRM', "to confirm"),
                    await self._get_system_label(user_id, 'INVOICE_FOOTER_DISCARD', "to discard"),
                    product['name'],
                    await self._get_system_label(user_id, 'CONFIRM_BTN', "CONFIRM"),
                    await self._get_system_label(user_id, 'CANCEL_BTN', "CANCEL")
                )
                t_del_method, t_address, t_time_slot, t_instructions = (
                    await self._get_system_label(user_id, 'DELIVERY_METHOD_LABEL', "Delivery Method:"),
                    await self._get_system_label(user_id, 'ADDRESS_LABEL', "Address:"),
                    await self._get_system_label(user_id, 'TIME_SLOT_LABEL', "Time Slot:"),
                    await self._get_system_label(user_id, 'INSTRUCTIONS_LABEL', "Instructions:")
                )
                t_method_val = method.replace('_', ' ').title()
        else:
            t_title, t_prod, t_qty, t_price, t_total, t_reply, t_to_conf, t_to_disc, t_name, t_confirm, t_cancel = (
                await self._get_system_label(user_id, 'ORDER_SUMMARY_TITLE', "ORDER SUMMARY"),
                await self._get_system_label(user_id, 'PRODUCT_LABEL', "Product:"),
                await self._get_system_label(user_id, 'QUANTITY_LABEL', "Quantity:"),
                await self._get_system_label(user_id, 'PRICE_LABEL', "Price:"),
                await self._get_system_label(user_id, 'TOTAL_LABEL', "Total Amount:"),
                await self._get_system_label(user_id, 'INVOICE_FOOTER_REPLY', "Reply"),
                await self._get_system_label(user_id, 'INVOICE_FOOTER_CONFIRM', "to confirm"),
                await self._get_system_label(user_id, 'INVOICE_FOOTER_DISCARD', "to discard"),
                product['name'],
                await self._get_system_label(user_id, 'CONFIRM_BTN', "CONFIRM"),
                await self._get_system_label(user_id, 'CANCEL_BTN', "CANCEL")
            )
            t_del_method, t_address, t_time_slot, t_instructions = (
                await self._get_system_label(user_id, 'DELIVERY_METHOD_LABEL', "Delivery Method:"),
                await self._get_system_label(user_id, 'ADDRESS_LABEL', "Address:"),
                await self._get_system_label(user_id, 'TIME_SLOT_LABEL', "Time Slot:"),
                await self._get_system_label(user_id, 'INSTRUCTIONS_LABEL', "Instructions:")
            )
            t_method_val = method.replace('_', ' ').title()

        # 1. BUILD ENGLISH DELIVERY BLOCK (For Admin/Records)
        # We fetch the branded English labels first to ensure overrides are used in records
        l_del_method_label = await self._get_system_label(user_id, 'DELIVERY_METHOD_LABEL', "Delivery Method:")
        l_address_label = await self._get_system_label(user_id, 'ADDRESS_LABEL', "Address:")
        l_time_slot_label = await self._get_system_label(user_id, 'TIME_SLOT_LABEL', "Time Slot:")
        l_instructions_label = await self._get_system_label(user_id, 'INSTRUCTIONS_LABEL', "Instructions:")
        
        eng_method_val = method.replace('_', ' ').title()
        eng_delivery_block = f"🚚 **{l_del_method_label}** {eng_method_val}\n📍 **{l_address_label}** {address}"
        if method == 'hand_to_hand':
            eng_delivery_block += f"\n⏰ **{l_time_slot_label}** {time_slot}"
        eng_delivery_block += f"\n📝 **{l_instructions_label}** {instr}"

        # 2. BUILD TRANSLATED DELIVERY BLOCK (For Customer)
        translated_delivery_block = f"🚚 **{t_del_method}** {t_method_val}\n📍 **{t_address}** {address}"
        if method == 'hand_to_hand':
            translated_delivery_block += f"\n⏰ **{t_time_slot}** {time_slot}"
        translated_delivery_block += f"\n📝 **{t_instructions}** {instr}"

        # 3. BUILD CUSTOMER INVOICE (Translated)
        invoice_msg = (
            f"🛍️ **{t_title}**\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"🔹 **{t_prod}** {t_name}\n"
            f"🔹 **{t_qty}** {quantity}\n"
            f"🔹 **{t_price}** ${product['price']:.2f}\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"{translated_delivery_block}\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"💰 **{t_total} ${total:.2f}**\n\n"
            f"✅ {t_reply} {t_to_conf}: **{t_confirm}**\n"
            f"❌ {t_reply} {t_to_disc}: **{t_cancel}**"
        )
        
        # 4. BUILD ADMIN AUDIT MESSAGE (Clean English)
        eng_msg = (
            f"🛍️ **ORDER SUMMARY**\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"🔹 **Product:** {product['name']}\n"
            f"🔹 **Quantity:** {quantity}\n"
            f"🔹 **Price:** ${product['price']:.2f}\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"{eng_delivery_block}\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"💰 **Total Amount: ${total:.2f}**\n\n"
            f"✅ Reply **CONFIRM** | ❌ Reply **CANCEL**"
        )
        
        await self._send_simple_reply(account_id, peer_id, invoice_msg, user_id, original_text=eng_msg)
        return True

    async def _process_confirmation(self, account_id: int, peer_id: int, state: Any, user_id: int) -> bool:
        """Finalize order, update stock, and send payment info"""
        try:
            product_id = state['pending_product_id']
            requested_qty = state['pending_quantity']
            
            # PHASE 1: DATABASE
            final_data = {}
            async with db.pool.acquire() as conn:
                async with conn.transaction():
                    product = await conn.fetchrow("SELECT id, name, price, stock_quantity FROM products WHERE id = $1 FOR UPDATE", product_id)
                    if not product:
                        prompt = await self._get_system_prompt(user_id, 'PRODUCT_NOT_FOUND_CANCEL', "Product not found. Order cancelled.")
                        await self._translate_and_send_reply(account_id, peer_id, prompt, user_id)
                        await conn.execute("UPDATE sales_states SET status = 'idle' WHERE id = $1", state['id'])
                        return True

                    if product['stock_quantity'] < requested_qty:
                        prompt = await self._get_system_prompt(user_id, 'INSUFFICIENT_STOCK_CANCEL', "Insufficient stock. Order cancelled.")
                        await self._translate_and_send_reply(account_id, peer_id, prompt, user_id)
                        await conn.execute("UPDATE sales_states SET status = 'idle' WHERE id = $1", state['id'])
                        return True

                    new_stock = product['stock_quantity'] - requested_qty
                    await conn.execute("UPDATE products SET stock_quantity = $1 WHERE id = $2", new_stock, product_id)

                    next_id = await conn.fetchval("SELECT COALESCE(MAX(id), 0) + 1 FROM orders")
                    po_number = f"PO-{1000 + next_id}"
                    total_price = product['price'] * requested_qty

                    await conn.execute(
                        """
                        INSERT INTO orders (po_number, user_id, product_id, telegram_account_id, telegram_peer_id, quantity, unit_price, total_price, status, delivery_method, delivery_address, delivery_time_slot, delivery_instructions)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_payment', $9, $10, $11, $12)
                        """,
                        po_number, user_id, product_id, account_id, peer_id, requested_qty, product['price'], total_price,
                        state.get('delivery_method'), state.get('delivery_address'), state.get('delivery_time_slot'), state.get('delivery_instructions')
                    )
                    await conn.execute("UPDATE sales_states SET status = 'idle' WHERE id = $1", state['id'])
                    
                    settings = await conn.fetchrow("SELECT payment_details FROM sales_settings WHERE user_id = $1", user_id)
                    payment_info = settings['payment_details'] if settings else "[No payment info]"

                    final_data = {
                        "po_number": po_number,
                        "product_name": product['name'],
                        "product_id": product['id'], # Store ID for upsell lookup
                        "qty": requested_qty,
                        "total": total_price,
                        "payment_info": payment_info
                    }
                    
                    # --- CRM LINK: Update Contact Info with Product Interest and Pipeline Stage ---
                    try:
                        # Find the conversation linked to this order
                        conv = await conn.fetchrow(
                            "SELECT id FROM conversations WHERE telegram_account_id = $1 AND telegram_peer_id = $2",
                            account_id, peer_id
                        )
                        if conv:
                            # Update or Insert into contact_info
                            await conn.execute(
                                """
                                INSERT INTO contact_info (conversation_id, name, product_interest, pipeline_stage, updated_at)
                                VALUES ($1, $2, $3, 'Closing', NOW())
                                ON CONFLICT (conversation_id) 
                                DO UPDATE SET 
                                    product_interest = CASE 
                                        WHEN contact_info.product_interest IS NULL OR contact_info.product_interest = '' THEN EXCLUDED.product_interest
                                        WHEN contact_info.product_interest NOT LIKE '%' || EXCLUDED.product_interest || '%' THEN contact_info.product_interest || ', ' || EXCLUDED.product_interest
                                        ELSE contact_info.product_interest
                                    END,
                                    pipeline_stage = 'Closing',
                                    updated_at = NOW()
                                """,
                                conv['id'], final_data['product_name'], final_data['product_name']
                            )
                    except Exception as crm_err:
                        logger.error(f"Failed to update CRM for order: {crm_err}")

            # PHASE 2: TRANSLATE & BROADCAST (Outside transaction)
            try:
                account_data = await db.fetchrow("SELECT source_language, translation_enabled FROM telegram_accounts WHERE id = $1", account_id)
                target_lang = account_data['source_language'] if account_data else 'en'
                translation_enabled = account_data['translation_enabled'] if account_data else True
                
                if translation_enabled and target_lang != 'en':
                    tasks = [
                        self.translate_with_protection(await self._get_system_prompt(user_id, 'ORDER_CONFIRMED_HEADER', "ORDER CONFIRMED!"), target_lang, user_id),
                        self.translate_with_protection(await self._get_system_prompt(user_id, 'ORDER_ID_LABEL', "Order ID:"), target_lang, user_id),
                        self.translate_with_protection(await self._get_system_prompt(user_id, 'DATE_LABEL', "Date:"), target_lang, user_id),
                        self.translate_with_protection(await self._get_system_prompt(user_id, 'DETAILS_LABEL', "Details:"), target_lang, user_id),
                        self.translate_with_protection(await self._get_system_prompt(user_id, 'PAYMENT_INSTRUCTIONS_LABEL', "Payment Instructions:"), target_lang, user_id),
                        self.translate_with_protection(await self._get_system_prompt(user_id, 'THANKS_FOR_BUSINESS', "Thank you for your business! 🙏"), target_lang, user_id),
                        self.translate_with_protection(final_data['payment_info'], target_lang, user_id),
                        self.translate_with_protection(await self._get_system_prompt(user_id, 'SEND_SCREENSHOT_PROMPT', "Please send a screenshot of your payment for verification."), target_lang, user_id),
                        self.translate_with_protection(final_data['product_name'], target_lang, user_id),
                    ]
                    results = await asyncio.gather(*tasks)
                    h = results[0]
                    l_id = results[1]
                    l_date = results[2]
                    l_det = results[3]
                    l_pay = results[4]
                    footer = results[5]
                    final_pi = results[6]
                    l_screenshot = results[7]
                    t_product_name = results[8]
                else:
                    h, l_id, l_date, l_det, l_pay, footer, final_pi = ("ORDER CONFIRMED!", "Order ID:", "Date:", "Details:", "Payment Instructions:", "Thank you for your business!", final_data['payment_info'])
                    l_screenshot = "Please send a screenshot of your payment for verification."
                    t_product_name = final_data['product_name']
            except:
                h, l_id, l_date, l_det, l_pay, footer, final_pi = ("ORDER CONFIRMED!", "Order ID:", "Date:", "Details:", "Payment Instructions:", "Thank you for your business!", final_data['payment_info'])
                l_screenshot = "Please send a screenshot of your payment for verification."
                t_product_name = final_data['product_name']

            conf_msg = f"🎉 **{h}**\n{l_id} `{final_data['po_number']}`\n{l_date} {datetime.now().strftime('%d %B %Y')}\n\n📦 **{l_det}**\n{t_product_name} × {final_data['qty']} = **${final_data['total']:.2f}**\n\n💳 **{l_pay}**\n{final_pi}\n\n📸 {l_screenshot}\n\n{footer} 🙏"
            eng_msg = f"🎉 **ORDER CONFIRMED!**\nOrder ID: `{final_data['po_number']}`\nDate: {datetime.now().strftime('%d %B %Y')}\n\n📦 **Details:**\n{final_data['product_name']} × {final_data['qty']} = **${final_data['total']:.2f}**\n\n💳 **Payment Instructions:**\n{final_data['payment_info']}\n\n📸 Please send a screenshot of your payment for verification.\n\nThank you for your business! 🙏"
            
            await self._send_simple_reply(account_id, peer_id, conf_msg, user_id, original_text=eng_msg)
            
            # --- PHASE 3: AUTOMATED UPSELL ---
            try:
                # Refresh product data to get latest upsell_product_id from the original purchased product
                target_pid = final_data.get('product_id')
                prod_row = await db.fetchrow("SELECT upsell_product_id FROM products WHERE id = $1", target_pid)
                if prod_row and prod_row['upsell_product_id']:
                    upsell_id = prod_row['upsell_product_id']
                    upsell_product = await db.fetchrow("SELECT * FROM products WHERE id = $1 AND stock_quantity > 0", upsell_id)
                    
                    if upsell_product:
                        # Wait a bit so the messages don't overlap too much
                        await asyncio.sleep(3)
                        
                        # Fetch recommendation prompt
                        rec_prompt = await self._get_system_prompt(user_id, 'UPSELL_RECOMMENDATION', "Based on your purchase, you might also like this:")
                        await self._translate_and_send_reply(account_id, peer_id, rec_prompt, user_id)
                        
                        # Wait 1s and send the product details
                        await asyncio.sleep(1.5)
                        await self._send_product_info(account_id, peer_id, upsell_product, user_id)
                        logger.info(f"Automated upsell triggered for Order {final_data['po_number']}: Product {upsell_id}")
            except Exception as upsell_err:
                logger.error(f"Error triggering upsell: {upsell_err}")

            await manager.send_personal_message({"type": "order_confirmed", **final_data}, user_id)
            return True
        except Exception as e:
            logger.error(f"Error in confirmation: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return True

    async def _send_product_info(self, account_id: int, peer_id: int, product: Any, user_id: int) -> bool:
        """Send product details auto-reply with all available images"""
        price = product.get('price', 0.0)
        desc = product.get('description') or 'Quality product'
        name = product.get('name', 'Product')

        # Fetch target language and toggle for the account to provide pre-translation
        account_data = await db.fetchrow("SELECT source_language, translation_enabled FROM telegram_accounts WHERE id = $1", account_id)
        target_lang = account_data['source_language'] if account_data else 'en'
        translation_enabled = account_data['translation_enabled'] if account_data else True

        # Translate COMPLETELY everything (Name, Labels, Description) IF ENABLED
        try:
            # Fetch branded labels
            l_price = await self._get_system_label(user_id, 'PRICE_LABEL', "Price:")
            l_desc = await self._get_system_label(user_id, 'DESCRIPTION_LABEL', "Description:")
            l_instr = await self._get_system_label(user_id, 'ORDER_INSTRUCTION', "To order, please reply:")
            l_qty_hint = await self._get_system_label(user_id, 'QTY_HINT', "[quantity]")

            if translation_enabled and target_lang != 'en':
                # Localize Name & Description & Labels
                tasks = [
                    self.translate_with_protection(name, target_lang, user_id),
                    self.translate_with_protection(l_price, target_lang, user_id),
                    self.translate_with_protection(l_desc, target_lang, user_id),
                    self.translate_with_protection(l_instr, target_lang, user_id),
                    self.translate_with_protection(desc, target_lang, user_id),
                    self.translate_with_protection(l_qty_hint, target_lang, user_id)
                ]
                results = await asyncio.gather(*tasks)
                
                translated_name = results[0]
                t_price_label = results[1]
                t_desc_label = results[2]
                t_order_instr = results[3]
                translated_desc = results[4]
                t_qty_placeholder = results[5]
            else:
                translated_name = name
                t_price_label = l_price
                t_desc_label = l_desc
                t_order_instr = l_instr
                translated_desc = desc
                t_qty_placeholder = l_qty_hint
        except Exception:
            translated_name = name
            t_price_label = "Price:"
            t_desc_label = "Description:"
            t_order_instr = "To order, please reply:"
            translated_desc = desc
            t_qty_placeholder = "[quantity]"

        # Create the message for the CUSTOMER (Dramatically simplified per User request)
        customer_reply_text = (
            f"📦 **{translated_name}**\n"
            f"💰 **{t_price_label}** ${price:.2f}\n"
            f"📝 **{t_desc_label}** {translated_desc}\n\n"
            f"🛒 {t_order_instr}\n"
            f"`{translated_name} {t_qty_placeholder}`"
        )
        
        # Original English text for Admin records
        admin_original_text = (
            f"📦 **{name}**\n"
            f"💰 **Price:** ${price:.2f}\n"
            f"📝 **Description:** {desc}\n\n"
            f"🛒 To order, please reply:\n"
            f"`{name} [quantity]`"
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

    async def _send_simple_reply(self, account_id: int, peer_id: int, text: str, user_id: int, original_text: Optional[str] = None) -> bool:
        session = await telethon_service.get_session(account_id)
        if session and session.is_connected:
            result = await session.client.send_message(peer_id, text)
            await self._save_auto_message(
                account_id, peer_id, original_text or text, user_id, 
                translated_text=text if original_text else None,
                telegram_message_id=result.id
            )
            return True
        return False

    async def _save_auto_message(self, account_id: int, peer_id: int, original_text: str, user_id: int, 
                                msg_type: str = 'auto_reply', media_file_name: Optional[str] = None, 
                                translated_text: Optional[str] = None, telegram_message_id: Optional[int] = None):
        conversation = await db.fetchrow(
            "SELECT id, title FROM conversations WHERE telegram_account_id = $1 AND telegram_peer_id = $2",
            account_id, peer_id
        )
        if conversation:
            conversation_id = conversation['id']
            peer_title = conversation['title'] or f"Chat {peer_id}"
            
            # Use provided translated_text or fallback to original_text
            t_text = translated_text if translated_text is not None else original_text
            
            logger.info(f"Saving auto-reply for conversation {conversation_id}: {original_text[:50]}...")
            msg_id = await db.fetchval(
                """
                INSERT INTO messages (conversation_id, telegram_message_id, sender_user_id, sender_name, sender_username, type, original_text, translated_text, is_outgoing, media_file_name, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, NOW())
                RETURNING id
                """,
                conversation_id, telegram_message_id, 0, 'Bot', 'bot', msg_type, original_text, t_text, media_file_name
            )
            # Update last_message_at for the conversation
            await db.execute(
                "UPDATE conversations SET last_message_at = NOW() WHERE id = $1",
                conversation_id
            )

            logger.info(f"Broadcasting auto-reply {msg_id} to user {user_id}")

            # Get target language for the account
            target_lang = await db.fetchval("SELECT target_language FROM telegram_accounts WHERE id = $1", account_id) or 'en'

            # Prepare message response that matches what App.tsx expects from handle_new_message (main.py)
            await manager.send_to_account({
                "type": "new_message",
                "message": {
                    "id": msg_id,
                    "conversation_id": conversation_id,
                    "telegram_message_id": telegram_message_id or 0,
                    "sender_name": "Bot",
                    "sender_username": "bot",
                    "sender_user_id": 0,
                    "peer_title": peer_title,
                    "type": msg_type,
                    "original_text": original_text,
                    "translated_text": t_text,
                    "is_outgoing": True,
                    "media_file_name": media_file_name,
                    "created_at": datetime.now().isoformat(),
                    "source_language": 'en',
                    "target_language": target_lang,
                    "edited_at": None,
                    "reply_to_telegram_id": None,
                    "reply_to_text": None,
                    "reply_to_sender": None,
                    "media_thumbnail": None,
                    "media_duration": None
                }
            }, account_id, user_id)

    async def _send_simple_reply(self, account_id: int, peer_id: int, text: str, user_id: int, original_text: str = None):
        """Send message and broadcast to admin UI, preserving original text if provided"""
        session = await telethon_service.get_session(account_id)
        if session and session.is_connected:
            result = await session.client.send_message(peer_id, text)
            # Use original_text if provided, otherwise fallback to the translated text
            await self._save_auto_message(account_id, peer_id, original_text or text, user_id, telegram_message_id=result.id, translated_text=text)

    async def _translate_and_send_reply(self, account_id: int, peer_id: int, text: str, user_id: int):
        """Fetch target lang, translate, and send"""
        try:
            account_data = await db.fetchrow("SELECT source_language, translation_enabled FROM telegram_accounts WHERE id = $1", account_id)
            target_lang = account_data['source_language'] if account_data else 'en'
            translation_enabled = account_data['translation_enabled'] if account_data else True
            
            if target_lang != 'en' and translation_enabled:
                # IMPORTANT: We check if the translated version already exists as a manual override to avoid Google Translate loop
                # This ensures your "Branded Personality" messages are also localized correctly
                translated_text = await self.translate_with_protection(text, target_lang, user_id)
            else:
                translated_text = text
        except:
            translated_text = text
            
        await self._send_simple_reply(account_id, peer_id, translated_text, user_id, original_text=text)


    async def send_status_update_message(self, order_id: int, status: str, user_id: int, reason: str = None) -> bool:
        """Sends an automated, professionally formatted status update message to the customer."""
        try:
            logger.info(f"SalesService.send_status_update_message: order {order_id}, status {status}, user {user_id}")
            order = await db.fetchrow("SELECT * FROM orders WHERE id = $1", order_id)
            if not order: 
                logger.error(f"Order {order_id} not found")
                return False
            
            # 1. Fetch branded template from DB settings
            status_templates = {
                "paid": "✅ *Payment Confirmed!*\n\nWe have successfully verified your payment for Order {order_id}. We are now preparing your items for delivery. Thank you! 🙏",
                "packed": "📦 *Order Packed & Ready!*\n\nGood news! Your order {order_id} has been packed and is ready for pickup/delivery.",
                "shipped": "🚚 *Order Shipped!*\n\nYour order {order_id} has been shipped! It is now on its way to your delivery address. 🏁",
                "delivered": "🎁 *Order Delivered!*\n\nYour order {order_id} has been successfully delivered. We hope you enjoy your purchase! 🌟",
                "disapproved": "❌ *Verification Issue*\n\nWe were unable to verify your payment for Order {order_id}.\n\n*Reason:* {reason}\n\nPlease check your transaction and attach the correct screenshot to this chat. Thank you!"
            }
            
            default_template = status_templates.get(status)
            if not default_template:
                logger.warning(f"No status message found for status '{status}'")
                return False
                
            template = await self._get_status_template(user_id, status, default_template)
            if not template:
                logger.warning(f"No hardcoded template found for status '{status}'")
                return False
                
            # Use the provided reason or the one from the database
            final_reason = reason or order.get('disapproval_reason') or "No specific reason provided."
                
            # 2. Dynamic Variable Injection
            msg = template.replace("{order_id}", f"#{order['po_number']}").replace("{reason}", final_reason)
            
            # 3. Transparent Translation & Dispatch
            # The _translate_and_send_reply handles language detection and async sending
            await self._translate_and_send_reply(order['telegram_account_id'], order['telegram_peer_id'], msg, user_id)
            
            logger.info(f"Automated '{status}' notification dispatched for Order {order_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to dispatch status update for order {order_id}: {e}")
            return False

sales_service = SalesService()
