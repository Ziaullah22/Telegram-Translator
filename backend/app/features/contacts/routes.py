# ---------------------------------------------------------
# CONTACTS CONTROLLER (app/features/contacts/routes.py)
# ---------------------------------------------------------
# Provides a mini-CRM for each Telegram conversation.
# Stores detailed metadata like address, phone numbers, 
# product interest, and sales status for deep customer 
# relationship management.

router = APIRouter(prefix="/api/contacts", tags=["contacts"])

logger = logging.getLogger(__name__)

@router.get("/conversation/{conversation_id}", response_model=Optional[ContactInfoResponse])
async def get_contact_info(
    conversation_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """Get contact info for a conversation"""
    try:
        # Verify user owns this conversation
        conversation = await db.fetchrow(
            """
            SELECT c.id
            FROM conversations c
            JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
            WHERE c.id = $1 AND ta.user_id = $2
            """,
            conversation_id,
            current_user.user_id
        )
        
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Get contact info
        contact_info = await db.fetchrow(
            "SELECT * FROM contact_info WHERE conversation_id = $1",
            conversation_id
        )
        
        if not contact_info:
            return None
        
        return ContactInfoResponse(**dict(contact_info))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get contact info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get contact info: {str(e)}")

@router.post("", response_model=ContactInfoResponse)
async def create_contact_info(
    contact_info: ContactInfoCreate,
    current_user: TokenData = Depends(get_current_user)
):
    """Create contact info for a conversation"""
    try:
        # Verify user owns this conversation
        conversation = await db.fetchrow(
            """
            SELECT c.id
            FROM conversations c
            JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
            WHERE c.id = $1 AND ta.user_id = $2
            """,
            contact_info.conversation_id,
            current_user.user_id
        )
        
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Check if contact info already exists
        existing = await db.fetchrow(
            "SELECT id FROM contact_info WHERE conversation_id = $1",
            contact_info.conversation_id
        )
        
        if existing:
            raise HTTPException(status_code=400, detail="Contact info already exists for this conversation")
        
        # Create contact info
        row = await db.fetchrow(
            """
            INSERT INTO contact_info
            (conversation_id, name, address, telephone, telegram_id, telegram_id2, 
             signal_id, signal_id2, product_interest, sales_volume, ready_for_sample,
             sample_recipient_info, sample_feedback, payment_method, delivery_method, note)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING *
            """,
            contact_info.conversation_id,
            contact_info.name,
            contact_info.address,
            contact_info.telephone,
            contact_info.telegram_id,
            contact_info.telegram_id2,
            contact_info.signal_id,
            contact_info.signal_id2,
            contact_info.product_interest,
            contact_info.sales_volume,
            contact_info.ready_for_sample,
            contact_info.sample_recipient_info,
            contact_info.sample_feedback,
            contact_info.payment_method,
            contact_info.delivery_method,
            contact_info.note
        )
        
        return ContactInfoResponse(**dict(row))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create contact info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create contact info: {str(e)}")

@router.put("/{contact_id}", response_model=ContactInfoResponse)
async def update_contact_info(
    contact_id: int,
    contact_update: ContactInfoUpdate,
    current_user: TokenData = Depends(get_current_user)
):
    """Update contact info"""
    try:
        # Verify user owns this contact info
        existing = await db.fetchrow(
            """
            SELECT ci.*
            FROM contact_info ci
            JOIN conversations c ON ci.conversation_id = c.id
            JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
            WHERE ci.id = $1 AND ta.user_id = $2
            """,
            contact_id,
            current_user.user_id
        )
        
        if not existing:
            raise HTTPException(status_code=404, detail="Contact info not found")
        
        # Build update query dynamically
        update_fields = []
        values = []
        param_count = 1
        
        for field, value in contact_update.dict(exclude_unset=True).items():
            update_fields.append(f"{field} = ${param_count}")
            values.append(value)
            param_count += 1
        
        if not update_fields:
            return ContactInfoResponse(**dict(existing))
        
        # Add updated_at
        update_fields.append(f"updated_at = ${param_count}")
        values.append(datetime.now())
        param_count += 1
        
        # Add contact_id for WHERE clause
        values.append(contact_id)
        
        query = f"""
            UPDATE contact_info
            SET {', '.join(update_fields)}
            WHERE id = ${param_count}
            RETURNING *
        """
        
        row = await db.fetchrow(query, *values)
        
        return ContactInfoResponse(**dict(row))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update contact info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update contact info: {str(e)}")

@router.delete("/{contact_id}")
async def delete_contact_info(
    contact_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """Delete contact info"""
    try:
        # Verify user owns this contact info
        existing = await db.fetchrow(
            """
            SELECT ci.id
            FROM contact_info ci
            JOIN conversations c ON ci.conversation_id = c.id
            JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
            WHERE ci.id = $1 AND ta.user_id = $2
            """,
            contact_id,
            current_user.user_id
        )
        
        if not existing:
            raise HTTPException(status_code=404, detail="Contact info not found")
        
        await db.execute(
            "DELETE FROM contact_info WHERE id = $1",
            contact_id
        )
        
        return {"message": "Contact info deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete contact info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete contact info: {str(e)}")
