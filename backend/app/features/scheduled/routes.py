# ---------------------------------------------------------
# SCHEDULED MESSAGES CONTROLLER (app/features/scheduled/routes.py)
# ---------------------------------------------------------
# Manages future-dated Telegram messages.
# Features:
# 1. Queueing new messages with a custom delay (fractional days).
# 2. Listing, updating, and cancelling pending scheduled tasks.
# 3. Automatic system message logging upon manual cancellation.

router = APIRouter(prefix="/api/scheduled-messages", tags=["scheduled-messages"])


@router.post("", response_model=ScheduledMessageResponse)
async def create_scheduled_message(
    scheduled_msg: ScheduledMessageCreate,
    current_user: TokenData = Depends(get_current_user)
):
    """Create a new scheduled message"""
    try:
        # Verify conversation belongs to user's account
        conversation = await db.fetchrow(
            """
            SELECT c.id, c.telegram_account_id
            FROM conversations c
            JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
            WHERE c.id = $1 AND ta.user_id = $2
            """,
            scheduled_msg.conversation_id,
            current_user.user_id
        )
        
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Calculate scheduled time
        scheduled_at = datetime.now() + timedelta(days=scheduled_msg.days_delay)
        
        # Create scheduled message
        msg_id = await db.fetchval(
            """
            INSERT INTO scheduled_messages (conversation_id, message_text, scheduled_at)
            VALUES ($1, $2, $3)
            RETURNING id
            """,
            scheduled_msg.conversation_id,
            scheduled_msg.message_text,
            scheduled_at
        )
        
        row = await db.fetchrow(
            "SELECT * FROM scheduled_messages WHERE id = $1",
            msg_id
        )
        
        # Notify scheduler
        await scheduler_service.add_scheduled_message(msg_id)
        
        # Get account info for WebSocket notification
        from websocket_manager import manager
        account_info = await db.fetchrow(
            """
            SELECT ta.id as account_id, ta.user_id
            FROM conversations c
            JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
            WHERE c.id = $1
            """,
            scheduled_msg.conversation_id
        )
        
        if account_info:
            # Send scheduled message created notification
            await manager.send_to_account(
                {
                    "type": "scheduled_message_created",
                    "scheduled_message": {
                        "id": row['id'],
                        "conversation_id": row['conversation_id'],
                        "message_text": row['message_text'],
                        "scheduled_at": row['scheduled_at'].isoformat(),
                        "created_at": row['created_at'].isoformat(),
                        "is_sent": row['is_sent'],
                        "is_cancelled": row['is_cancelled']
                    }
                },
                account_info['account_id'],
                account_info['user_id']
            )
        
        return ScheduledMessageResponse(**dict(row))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create scheduled message: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create scheduled message: {str(e)}")

@router.get("/conversation/{conversation_id}", response_model=List[ScheduledMessageResponse])
async def get_scheduled_messages_by_conversation(
    conversation_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """Get all scheduled messages for a conversation"""
    try:
        # Verify conversation belongs to user
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
        
        rows = await db.fetch(
            """
            SELECT * FROM scheduled_messages
            WHERE conversation_id = $1 AND is_sent = FALSE AND is_cancelled = FALSE
            ORDER BY scheduled_at ASC
            """,
            conversation_id
        )
        
        return [ScheduledMessageResponse(**dict(row)) for row in rows]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch scheduled messages: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch scheduled messages: {str(e)}")

@router.get("", response_model=List[ScheduledMessageResponse])
async def get_all_scheduled_messages(
    current_user: TokenData = Depends(get_current_user)
):
    """Get all scheduled messages for the current user"""
    try:
        rows = await db.fetch(
            """
            SELECT sm.*
            FROM scheduled_messages sm
            JOIN conversations c ON sm.conversation_id = c.id
            JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
            WHERE ta.user_id = $1 AND sm.is_sent = FALSE AND sm.is_cancelled = FALSE
            ORDER BY sm.scheduled_at ASC
            """,
            current_user.user_id
        )
        
        return [ScheduledMessageResponse(**dict(row)) for row in rows]
    except Exception as e:
        logger.error(f"Failed to fetch all scheduled messages: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch scheduled messages: {str(e)}")

@router.put("/{message_id}", response_model=ScheduledMessageResponse)
async def update_scheduled_message(
    message_id: int,
    update_data: ScheduledMessageUpdate,
    current_user: TokenData = Depends(get_current_user)
):
    """Update a scheduled message"""
    try:
        # Verify message belongs to user and is not sent/cancelled
        existing = await db.fetchrow(
            """
            SELECT sm.id, sm.scheduled_at
            FROM scheduled_messages sm
            JOIN conversations c ON sm.conversation_id = c.id
            JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
            WHERE sm.id = $1 AND ta.user_id = $2 AND sm.is_sent = FALSE AND sm.is_cancelled = FALSE
            """,
            message_id,
            current_user.user_id
        )
        
        if not existing:
            raise HTTPException(status_code=404, detail="Scheduled message not found or already sent/cancelled")
        
        # Build update query
        update_fields = []
        values = []
        param_count = 1
        
        if update_data.message_text is not None:
            update_fields.append(f"message_text = ${param_count}")
            values.append(update_data.message_text)
            param_count += 1
        
        if update_data.days_delay is not None:
            new_scheduled_at = datetime.now() + timedelta(days=update_data.days_delay)
            update_fields.append(f"scheduled_at = ${param_count}")
            values.append(new_scheduled_at)
            param_count += 1
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        values.append(message_id)
        
        query = f"""
            UPDATE scheduled_messages
            SET {', '.join(update_fields)}
            WHERE id = ${param_count}
            RETURNING *
        """
        
        row = await db.fetchrow(query, *values)
        
        # Update in scheduler
        await scheduler_service.remove_scheduled_message(message_id)
        await scheduler_service.add_scheduled_message(message_id)
        
        return ScheduledMessageResponse(**dict(row))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update scheduled message: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update scheduled message: {str(e)}")

@router.delete("/{message_id}")
async def cancel_scheduled_message(
    message_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """Cancel a scheduled message"""
    try:
        # Get scheduled message details before cancelling
        scheduled_msg = await db.fetchrow(
            """
            SELECT sm.id, sm.conversation_id, sm.message_text, sm.scheduled_at
            FROM scheduled_messages sm
            JOIN conversations c ON sm.conversation_id = c.id
            JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
            WHERE sm.id = $1 AND ta.user_id = $2
            AND sm.is_sent = FALSE AND sm.is_cancelled = FALSE
            """,
            message_id,
            current_user.user_id
        )
        
        if not scheduled_msg:
            raise HTTPException(status_code=404, detail="Scheduled message not found or already sent/cancelled")
        
        # Cancel the scheduled message
        await db.execute(
            """
            UPDATE scheduled_messages
            SET is_cancelled = TRUE, cancelled_at = NOW()
            WHERE id = $1
            """,
            message_id
        )
        
        # Insert system message
        scheduled_date = scheduled_msg['scheduled_at'].strftime('%Y-%m-%d %H:%M')
        system_text = f"Scheduled message manually cancelled (was scheduled for {scheduled_date}): \"{scheduled_msg['message_text']}\""
        
        created_at = datetime.now()
        msg_id = await db.fetchval(
            """
            INSERT INTO messages
            (conversation_id, sender_name, sender_username, type, original_text, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
            """,
            scheduled_msg['conversation_id'],
            'System',
            'system',
            'system',
            system_text,
            created_at
        )
        
        # Get account info for WebSocket notification
        from websocket_manager import manager
        account_info = await db.fetchrow(
            """
            SELECT ta.id as account_id, ta.user_id
            FROM conversations c
            JOIN telegram_accounts ta ON c.telegram_account_id = ta.id
            WHERE c.id = $1
            """,
            scheduled_msg['conversation_id']
        )
        
        if account_info:
            # Send system message via WebSocket
            await manager.send_to_account(
                {
                    "type": "new_message",
                    "message": {
                        "id": msg_id,
                        "conversation_id": scheduled_msg['conversation_id'],
                        "telegram_message_id": None,
                        "sender_user_id": None,
                        "sender_name": "System",
                        "sender_username": "system",
                        "type": "system",
                        "original_text": system_text,
                        "translated_text": None,
                        "source_language": None,
                        "target_language": None,
                        "created_at": created_at.isoformat(),
                        "is_outgoing": False
                    }
                },
                account_info['account_id'],
                account_info['user_id']
            )
        
        # Remove from scheduler
        await scheduler_service.remove_scheduled_message(message_id)
        
        return {"message": "Scheduled message cancelled successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to cancel scheduled message: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to cancel scheduled message: {str(e)}")
