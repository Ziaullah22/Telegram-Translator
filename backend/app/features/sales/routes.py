from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from typing import List, Optional
from database import db
from auth import get_current_user
from pydantic import BaseModel
from datetime import datetime
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sales", tags=["Sales"])

class OrderResponse(BaseModel):
    id: int
    po_number: str
    product_id: Optional[int]
    product_name: str
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
    created_at: datetime

class SalesSettingsSchema(BaseModel):
    payment_details: str

@router.get("/orders", response_model=List[OrderResponse])
async def get_orders(user = Depends(get_current_user)):
    rows = await db.fetch(
        """
        SELECT 
            o.*, 
            p.name as product_name,
            p.photo_urls,
            p.description as product_description,
            c.title as customer_name, 
            c.username as customer_username
        FROM orders o
        LEFT JOIN products p ON o.product_id = p.id
        LEFT JOIN conversations c ON o.telegram_account_id = c.telegram_account_id AND o.telegram_peer_id = c.telegram_peer_id
        WHERE o.user_id = $1
        ORDER BY o.created_at DESC
        """,
        user.user_id
    )
    return [dict(row) for row in rows]

class OrderStatusUpdate(BaseModel):
    status: str

@router.patch("/orders/{order_id}/status")
async def update_order_status(order_id: int, payload: OrderStatusUpdate, user = Depends(get_current_user)):
    logger.info(f"Updating order {order_id} status to {payload.status} for user {user.user_id}")
    # Check if order belongs to user
    order = await db.fetchrow("SELECT * FROM orders WHERE id = $1 AND user_id = $2", order_id, user.user_id)
    if not order:
        logger.warning(f"Order {order_id} not found or access denied for user {user.user_id}")
        raise HTTPException(status_code=404, detail="Order not found")
        
    try:
        await db.execute(
            "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2",
            payload.status, order_id
        )
        logger.info(f"DB updated for order {order_id}")
        
        # If status is changed to 'paid', send confirmation message via sales_service
        if payload.status == 'paid':
            logger.info(f"Triggering payment confirmation message for order {order_id}")
            from sales_service import sales_service
            success = await sales_service.send_payment_confirmation(order_id, user.user_id)
            if not success:
                logger.error(f"sales_service.send_payment_confirmation failed for order {order_id}")
            else:
                logger.info(f"Payment confirmation message sent for order {order_id}")
            
        return {"status": "success"}
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error updating order status: {error_msg}")
        import traceback
        stack_trace = traceback.format_exc()
        logger.error(stack_trace)
        
        # Return a more descriptive error if possible
        # This helps frontend debugging
        return JSONResponse(
            status_code=500,
            content={
                "detail": f"Internal Server Error: {error_msg}",
                "traceback": stack_trace if settings.debug else None
            }
        )

@router.get("/settings")
async def get_sales_settings(user = Depends(get_current_user)):
    row = await db.fetchrow(
        "SELECT payment_details FROM sales_settings WHERE user_id = $1",
        user.user_id
    )
    if not row:
        return {"payment_details": ""}
    return dict(row)

@router.post("/settings")
async def update_sales_settings(settings: SalesSettingsSchema, user = Depends(get_current_user)):
    await db.execute(
        """
        INSERT INTO sales_settings (user_id, payment_details, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id) 
        DO UPDATE SET payment_details = $2, updated_at = NOW()
        """,
        user.user_id, settings.payment_details
    )
    return {"status": "success"}
