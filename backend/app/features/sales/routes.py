from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from database import db
from auth import get_current_user
from pydantic import BaseModel
from datetime import datetime

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
