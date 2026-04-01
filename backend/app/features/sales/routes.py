from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from typing import List, Optional
from database import db
from auth import get_current_user
from pydantic import BaseModel, Field
from datetime import datetime
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sales", tags=["Sales"])

class ABTestSchema(BaseModel):
    name: str
    variant_a_text: str
    variant_b_text: str
    is_active: bool = True

class ABTestResultResponse(BaseModel):
    variant: str
    conversions: int
    participants: int
    conversion_rate: float


class OrderResponse(BaseModel):
    id: int
    po_number: str
    product_id: Optional[int]
    product_name: Optional[str] = "Deleted Product"
    photo_urls: Optional[List[str]] = []
    product_description: Optional[str] = None
    telegram_account_id: Optional[int]
    telegram_peer_id: int
    customer_name: Optional[str] = None
    customer_username: Optional[str] = None
    quantity: int
    unit_price: float
    total_price: float
    status: str
    delivery_method: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_time_slot: Optional[str] = None
    delivery_instructions: Optional[str] = None
    payment_screenshot_path: Optional[str] = None
    disapproval_reason: Optional[str] = None
    reminder_count: Optional[int] = 0
    last_reminder_at: Optional[datetime] = None
    proof_history: Optional[List[str]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

class OrderStatusUpdate(BaseModel):
    status: str
    reason: Optional[str] = None

class SalesSettingsSchema(BaseModel):
    payment_details: str
    payment_reminder_message: str
    payment_reminder_interval_days: int = 0
    payment_reminder_interval_hours: int = 2
    payment_reminder_interval_minutes: int = 0
    payment_reminder_count: int
    disapproved_reminder_message: str = "We are still waiting for your updated screenshot for Order {order_id}. Please send it as soon as possible. 🙏"
    disapproved_reminder_interval_days: int = 0
    disapproved_reminder_interval_hours: int = 2
    disapproved_reminder_interval_minutes: int = 0
    disapproved_reminder_count: int = 3
    status_messages: dict
    system_labels: dict = {}
    system_prompts: dict = {}
    protected_words: List[str] = []
    ignored_languages: List[str] = []
    language_expert_packs: dict = {}

@router.get("/orders", response_model=List[OrderResponse])
async def get_orders(status: Optional[str] = None, user = Depends(get_current_user)):
    query = """
        SELECT 
            o.*, 
            COALESCE(p.name, 'Deleted Product') as product_name,
            p.photo_urls,
            p.description as product_description,
            c.title as customer_name, 
            c.username as customer_username,
            (SELECT ARRAY_AGG(file_path ORDER BY created_at) FROM order_proofs WHERE order_id = o.id) as proof_history
        FROM orders o
        LEFT JOIN products p ON o.product_id = p.id
        LEFT JOIN conversations c ON o.telegram_account_id = c.telegram_account_id AND o.telegram_peer_id = c.telegram_peer_id
        WHERE o.user_id = $1
    """
    params = [user.user_id]
    
    if status and status != 'all':
        query += " AND o.status = $2"
        params.append(status)
        
    query += " ORDER BY o.created_at DESC"
    
    import json
    rows = await db.fetch(query, *params)
    mapped_rows = []
    for row in rows:
        d = dict(row)
        if isinstance(d.get('photo_urls'), str):
            try: d['photo_urls'] = json.loads(d['photo_urls'])
            except: d['photo_urls'] = []
        if isinstance(d.get('proof_history'), str):
            # ARRAY_AGG might return string from some postgres versions or drivers? Actually it's an asyncpg list.
            pass
        mapped_rows.append(d)
        
    return mapped_rows

@router.patch("/orders/{order_id}/status")
async def update_order_status(order_id: int, payload: OrderStatusUpdate, user = Depends(get_current_user)):
    logger.info(f"Updating order {order_id} status to {payload.status} for user {user.user_id}")
    # Check if order belongs to user
    order = await db.fetchrow("SELECT * FROM orders WHERE id = $1 AND user_id = $2", order_id, user.user_id)
    if not order:
        logger.warning(f"Order {order_id} not found or access denied for user {user.user_id}")
        raise HTTPException(status_code=404, detail="Order not found")
        
    try:
        if payload.status == 'disapproved':
            # Reset reminder_count to 0 so the follow-up sequence starts for the re-verification
            await db.execute(
                "UPDATE orders SET status = $1, disapproval_reason = $2, reminder_count = 0, updated_at = NOW() WHERE id = $3",
                payload.status, payload.reason or "No specific reason provided.", order_id
            )
        else:
            await db.execute(
                "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2",
                payload.status, order_id
            )
            
        logger.info(f"DB updated for order {order_id}")
        
        # --- CRM SYNC: Update Lead Stage based on Order Status ---
        try:
            # Determine new stage
            new_stage = None
            if payload.status == 'delivered':
                new_stage = 'Won'
            elif payload.status in ['paid', 'packed', 'shipped']:
                new_stage = 'Closing'
            elif payload.status == 'cancelled':
                new_stage = 'Lost'

            if new_stage:
                await db.execute(
                    """
                    UPDATE contact_info SET pipeline_stage = $1, updated_at = NOW()
                    WHERE conversation_id = (
                        SELECT id FROM conversations 
                        WHERE telegram_account_id = $2 AND telegram_peer_id = $3
                    )
                    """,
                    new_stage, order['telegram_account_id'], order['telegram_peer_id']
                )
        except Exception as crm_err:
            logger.error(f"Failed to sync CRM stage on status update: {crm_err}")
        logger.info(f"Triggering automated message for order {order_id} with status {payload.status}")
        from sales_service import sales_service
        # Send automated status update message using the central service
        await sales_service.send_status_update_message(order_id, payload.status, user.user_id, reason=payload.reason)
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error updating order status: {e}")
        raise HTTPException(status_code=500, detail="Failed to update order status")

@router.delete("/orders/{order_id}")
async def delete_order(order_id: int, user = Depends(get_current_user)):
    logger.info(f"Deleting order {order_id} for user {user.user_id}")
    order = await db.fetchrow("SELECT * FROM orders WHERE id = $1 AND user_id = $2", order_id, user.user_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found or access denied")
        
    try:
        # Delete associated proofs first
        await db.execute("DELETE FROM order_proofs WHERE order_id = $1", order_id)
        # Delete the order
        await db.execute("DELETE FROM orders WHERE id = $1", order_id)
        return {"status": "deleted"}
    except Exception as e:
        logger.error(f"Error deleting order {order_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete order")

@router.get("/settings")
async def get_sales_settings(user = Depends(get_current_user)):
    row = await db.fetchrow(
        "SELECT * FROM sales_settings WHERE user_id = $1",
        user.user_id
    )
    if not row:
        return {
            "payment_details": "",
            "payment_reminder_message": "Hello! We haven't received your payment screenshot for Order {order_id}. Please send it when you can. 🙏",
            "payment_reminder_interval_hours": 2,
            "payment_reminder_count": 3,
            "status_messages": {},
            "system_labels": {},
            "system_prompts": {},
            "protected_words": [],
            "ignored_languages": [],
            "language_expert_packs": {}
        }
    return dict(row)

@router.post("/settings")
async def update_sales_settings(settings: SalesSettingsSchema, user = Depends(get_current_user)):
    await db.execute(
        """
        INSERT INTO sales_settings (
            user_id, payment_details, payment_reminder_message, 
            payment_reminder_interval_days, payment_reminder_interval_hours, 
            payment_reminder_interval_minutes, payment_reminder_count,
            disapproved_reminder_message, disapproved_reminder_interval_days,
            disapproved_reminder_interval_hours, disapproved_reminder_interval_minutes,
            disapproved_reminder_count,
            status_messages,
            system_labels,
            system_prompts,
            protected_words,
            ignored_languages,
            language_expert_packs,
            updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
        ON CONFLICT (user_id) 
        DO UPDATE SET 
            payment_details = EXCLUDED.payment_details,
            payment_reminder_message = EXCLUDED.payment_reminder_message,
            payment_reminder_interval_days = EXCLUDED.payment_reminder_interval_days,
            payment_reminder_interval_hours = EXCLUDED.payment_reminder_interval_hours,
            payment_reminder_interval_minutes = EXCLUDED.payment_reminder_interval_minutes,
            payment_reminder_count = EXCLUDED.payment_reminder_count,
            disapproved_reminder_message = EXCLUDED.disapproved_reminder_message,
            disapproved_reminder_interval_days = EXCLUDED.disapproved_reminder_interval_days,
            disapproved_reminder_interval_hours = EXCLUDED.disapproved_reminder_interval_hours,
            disapproved_reminder_interval_minutes = EXCLUDED.disapproved_reminder_interval_minutes,
            disapproved_reminder_count = EXCLUDED.disapproved_reminder_count,
            status_messages = EXCLUDED.status_messages,
            system_labels = EXCLUDED.system_labels,
            system_prompts = EXCLUDED.system_prompts,
            protected_words = EXCLUDED.protected_words,
            ignored_languages = EXCLUDED.ignored_languages,
            language_expert_packs = EXCLUDED.language_expert_packs,
            updated_at = NOW()
        """,
        user.user_id, settings.payment_details, settings.payment_reminder_message,
        settings.payment_reminder_interval_days, settings.payment_reminder_interval_hours,
        settings.payment_reminder_interval_minutes, settings.payment_reminder_count,
        settings.disapproved_reminder_message, settings.disapproved_reminder_interval_days,
        settings.disapproved_reminder_interval_hours, settings.disapproved_reminder_interval_minutes,
        settings.disapproved_reminder_count,
        settings.status_messages,
        settings.system_labels,
        settings.system_prompts,
        settings.protected_words,
        settings.ignored_languages,
        settings.language_expert_packs
    )
    return {"status": "success"}

@router.get("/ab-tests")
async def get_ab_tests(user = Depends(get_current_user)):
    # Fetch tests and calculate per-variant stats
    query = """
        SELECT 
            t.*,
            (SELECT COUNT(*) FROM ab_test_results WHERE test_id = t.id) as total_participants,
            (SELECT COUNT(*) FROM ab_test_results WHERE test_id = t.id AND is_converted = TRUE) as total_conversions,
            (SELECT COUNT(*) FROM ab_test_results WHERE test_id = t.id AND variant = 'A') as variant_a_participants,
            (SELECT COUNT(*) FROM ab_test_results WHERE test_id = t.id AND variant = 'A' AND is_converted = TRUE) as variant_a_conversions,
            (SELECT COUNT(*) FROM ab_test_results WHERE test_id = t.id AND variant = 'B') as variant_b_participants,
            (SELECT COUNT(*) FROM ab_test_results WHERE test_id = t.id AND variant = 'B' AND is_converted = TRUE) as variant_b_conversions
        FROM ab_tests t
        WHERE t.user_id = $1
        ORDER BY t.created_at DESC
    """
    rows = await db.fetch(query, user.user_id)
    return [dict(row) for row in rows]


@router.post("/ab-tests")
async def update_ab_test(payload: ABTestSchema, user = Depends(get_current_user)):
    # For now, we only support one active test at a time for simplicity
    # Deactivate others if this one is active
    if payload.is_active:
        await db.execute("UPDATE ab_tests SET is_active = FALSE WHERE user_id = $1", user.user_id)
    
    await db.execute(
        """
        INSERT INTO ab_tests (user_id, name, variant_a_text, variant_b_text, is_active, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            variant_a_text = EXCLUDED.variant_a_text,
            variant_b_text = EXCLUDED.variant_b_text,
            is_active = EXCLUDED.is_active,
            updated_at = NOW()
        """,
        user.user_id, payload.name, payload.variant_a_text, payload.variant_b_text, payload.is_active
    )
    return {"status": "success"}

