from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File
from typing import List
from app.core.database import db
from app.core.security import get_current_user
from models import (
    AutoResponderRuleCreate,
    AutoResponderRuleUpdate,
    AutoResponderRuleResponse,
    AutoResponderLogResponse,
)
import logging
import os

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auto-responder", tags=["auto-responder"])


@router.get("/rules", response_model=List[AutoResponderRuleResponse])
async def get_rules(current_user = Depends(get_current_user)):
    """Get all auto-responder rules for the current user"""
    rules = await db.fetch(
        """
        SELECT id, user_id, name, keywords, response_text, language,
               media_type, media_file_path, is_active, priority,
               created_at, updated_at
        FROM auto_responder_rules
        WHERE user_id = $1
        ORDER BY priority DESC, created_at DESC
        """,
        current_user.user_id,
    )
    
    return [dict(rule) for rule in rules]


@router.post("/rules", response_model=AutoResponderRuleResponse)
async def create_rule(
    rule: AutoResponderRuleCreate,
    current_user = Depends(get_current_user),
):
    """Create a new auto-responder rule"""
    rule_id = await db.fetchval(
        """
        INSERT INTO auto_responder_rules
        (user_id, name, keywords, response_text, language, media_type, priority, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
        """,
        current_user.user_id,
        rule.name,
        rule.keywords,
        rule.response_text,
        rule.language,
        rule.media_type,
        rule.priority,
        rule.is_active,
    )
    
    created_rule = await db.fetchrow(
        """
        SELECT id, user_id, name, keywords, response_text, language,
               media_type, media_file_path, is_active, priority,
               created_at, updated_at
        FROM auto_responder_rules
        WHERE id = $1
        """,
        rule_id,
    )
    
    logger.info(f"Created auto-responder rule {rule_id} for user {current_user.user_id}")
    return dict(created_rule)


@router.patch("/rules/{rule_id}", response_model=AutoResponderRuleResponse)
async def update_rule(
    rule_id: int,
    rule_update: AutoResponderRuleUpdate,
    current_user = Depends(get_current_user),
):
    """Update an auto-responder rule"""
    # Verify rule belongs to user
    existing = await db.fetchrow(
        "SELECT id FROM auto_responder_rules WHERE id = $1 AND user_id = $2",
        rule_id,
        current_user.user_id,
    )
    
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found",
        )
    
    # Build update query dynamically
    updates = []
    values = []
    param_count = 1
    
    if rule_update.name is not None:
        updates.append(f"name = ${param_count}")
        values.append(rule_update.name)
        param_count += 1
    
    if rule_update.keywords is not None:
        updates.append(f"keywords = ${param_count}")
        values.append(rule_update.keywords)
        param_count += 1
    
    if rule_update.response_text is not None:
        updates.append(f"response_text = ${param_count}")
        values.append(rule_update.response_text)
        param_count += 1
    
    if rule_update.language is not None:
        updates.append(f"language = ${param_count}")
        values.append(rule_update.language)
        param_count += 1
    
    if rule_update.media_type is not None:
        updates.append(f"media_type = ${param_count}")
        values.append(rule_update.media_type)
        param_count += 1
    
    if rule_update.priority is not None:
        updates.append(f"priority = ${param_count}")
        values.append(rule_update.priority)
        param_count += 1
    
    if rule_update.is_active is not None:
        updates.append(f"is_active = ${param_count}")
        values.append(rule_update.is_active)
        param_count += 1
    
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )
    
    updates.append(f"updated_at = NOW()")
    values.append(rule_id)
    
    query = f"""
        UPDATE auto_responder_rules
        SET {', '.join(updates)}
        WHERE id = ${param_count}
    """
    
    await db.execute(query, *values)
    
    updated_rule = await db.fetchrow(
        """
        SELECT id, user_id, name, keywords, response_text, language,
               media_type, media_file_path, is_active, priority,
               created_at, updated_at
        FROM auto_responder_rules
        WHERE id = $1
        """,
        rule_id,
    )
    
    logger.info(f"Updated auto-responder rule {rule_id}")
    return dict(updated_rule)


@router.delete("/rules/{rule_id}")
async def delete_rule(
    rule_id: int,
    current_user = Depends(get_current_user),
):
    """Delete an auto-responder rule"""
    # Verify rule belongs to user
    existing = await db.fetchrow(
        "SELECT id, media_file_path FROM auto_responder_rules WHERE id = $1 AND user_id = $2",
        rule_id,
        current_user.user_id,
    )
    
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found",
        )
    
    # Delete media file if exists
    if existing['media_file_path'] and os.path.exists(existing['media_file_path']):
        try:
            os.remove(existing['media_file_path'])
        except Exception as e:
            logger.error(f"Failed to delete media file: {e}")
    
    await db.execute(
        "DELETE FROM auto_responder_rules WHERE id = $1",
        rule_id,
    )
    
    logger.info(f"Deleted auto-responder rule {rule_id}")
    return {"message": "Rule deleted successfully"}


@router.get("/logs", response_model=List[AutoResponderLogResponse])
async def get_logs(
    limit: int = 50,
    current_user = Depends(get_current_user),
):
    """Get auto-responder trigger logs for the current user"""
    logs = await db.fetch(
        """
        SELECT l.id, l.rule_id, r.name as rule_name, l.conversation_id,
               c.title as conversation_title, l.matched_keyword, l.triggered_at
        FROM auto_responder_logs l
        JOIN auto_responder_rules r ON l.rule_id = r.id
        JOIN conversations c ON l.conversation_id = c.id
        WHERE r.user_id = $1
        ORDER BY l.triggered_at DESC
        LIMIT $2
        """,
        current_user.user_id,
        limit,
    )
    
    return [dict(log) for log in logs]


@router.post("/rules/{rule_id}/upload-media")
async def upload_media(
    rule_id: int,
    media: UploadFile = File(...),
    current_user = Depends(get_current_user),
):
    """Upload media file for an auto-responder rule"""
    # Verify rule belongs to user
    existing = await db.fetchrow(
        "SELECT id, media_file_path FROM auto_responder_rules WHERE id = $1 AND user_id = $2",
        rule_id,
        current_user.user_id,
    )
    
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found",
        )
    
    # Validate file type
    content_type = media.content_type or ""
    if content_type.startswith("image/"):
        media_type = "photo"
    elif content_type.startswith("video/"):
        media_type = "video"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only image and video files are supported",
        )
    
    # Create media directory
    media_dir = f"media/auto_responder/{current_user.user_id}"
    os.makedirs(media_dir, exist_ok=True)
    
    # Delete old media file if exists
    if existing['media_file_path'] and os.path.exists(existing['media_file_path']):
        try:
            os.remove(existing['media_file_path'])
        except Exception as e:
            logger.error(f"Failed to delete old media file: {e}")
    
    # Save new media file
    file_extension = os.path.splitext(media.filename)[1] if media.filename else ""
    file_path = f"{media_dir}/{rule_id}{file_extension}"
    
    with open(file_path, "wb") as f:
        content = await media.read()
        f.write(content)
    
    # Update rule with media info
    await db.execute(
        """
        UPDATE auto_responder_rules
        SET media_type = $1, media_file_path = $2, updated_at = NOW()
        WHERE id = $3
        """,
        media_type,
        file_path,
        rule_id,
    )
    
    logger.info(f"Uploaded media for auto-responder rule {rule_id}")
    return {"message": "Media uploaded successfully", "media_type": media_type, "file_path": file_path}


@router.delete("/rules/{rule_id}/media")
async def delete_media(
    rule_id: int,
    current_user = Depends(get_current_user),
):
    """Delete media file from an auto-responder rule"""
    # Verify rule belongs to user
    existing = await db.fetchrow(
        "SELECT id, media_file_path FROM auto_responder_rules WHERE id = $1 AND user_id = $2",
        rule_id,
        current_user.user_id,
    )
    
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found",
        )
    
    # Delete media file if exists
    if existing['media_file_path'] and os.path.exists(existing['media_file_path']):
        try:
            os.remove(existing['media_file_path'])
        except Exception as e:
            logger.error(f"Failed to delete media file: {e}")
    
    # Update rule to remove media info
    await db.execute(
        """
        UPDATE auto_responder_rules
        SET media_type = NULL, media_file_path = NULL, updated_at = NOW()
        WHERE id = $1
        """,
        rule_id,
    )
    
    logger.info(f"Deleted media from auto-responder rule {rule_id}")
    return {"message": "Media deleted successfully"}
