from fastapi import APIRouter, Depends, HTTPException
from typing import List
from datetime import datetime
from database import db
from auth import get_current_user
from models import (
    MessageTemplateCreate,
    MessageTemplateUpdate,
    MessageTemplateResponse,
    TokenData
)

router = APIRouter(prefix="/api/templates", tags=["templates"])

@router.post("", response_model=MessageTemplateResponse)
async def create_template(
    template: MessageTemplateCreate,
    current_user: TokenData = Depends(get_current_user)
):
    """Create a new message template"""
    try:
        template_id = await db.fetchval(
            """
            INSERT INTO message_templates (user_id, name, content)
            VALUES ($1, $2, $3)
            RETURNING id
            """,
            current_user.user_id,
            template.name,
            template.content
        )
        
        row = await db.fetchrow(
            "SELECT * FROM message_templates WHERE id = $1",
            template_id
        )
        
        return MessageTemplateResponse(**dict(row))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create template: {str(e)}")

@router.get("", response_model=List[MessageTemplateResponse])
async def get_templates(
    current_user: TokenData = Depends(get_current_user)
):
    """Get all message templates for the current user"""
    try:
        rows = await db.fetch(
            """
            SELECT * FROM message_templates
            WHERE user_id = $1
            ORDER BY created_at DESC
            """,
            current_user.user_id
        )
        
        return [MessageTemplateResponse(**dict(row)) for row in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch templates: {str(e)}")

@router.get("/{template_id}", response_model=MessageTemplateResponse)
async def get_template(
    template_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """Get a specific message template"""
    try:
        row = await db.fetchrow(
            """
            SELECT * FROM message_templates
            WHERE id = $1 AND user_id = $2
            """,
            template_id,
            current_user.user_id
        )
        
        if not row:
            raise HTTPException(status_code=404, detail="Template not found")
        
        return MessageTemplateResponse(**dict(row))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch template: {str(e)}")

@router.put("/{template_id}", response_model=MessageTemplateResponse)
async def update_template(
    template_id: int,
    template: MessageTemplateUpdate,
    current_user: TokenData = Depends(get_current_user)
):
    """Update a message template"""
    try:
        # Check if template exists and belongs to user
        existing = await db.fetchrow(
            "SELECT id FROM message_templates WHERE id = $1 AND user_id = $2",
            template_id,
            current_user.user_id
        )
        
        if not existing:
            raise HTTPException(status_code=404, detail="Template not found")
        
        # Build update query dynamically based on provided fields
        update_fields = []
        values = []
        param_count = 1
        
        if template.name is not None:
            update_fields.append(f"name = ${param_count}")
            values.append(template.name)
            param_count += 1
        
        if template.content is not None:
            update_fields.append(f"content = ${param_count}")
            values.append(template.content)
            param_count += 1
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        update_fields.append(f"updated_at = ${param_count}")
        values.append(datetime.now())
        param_count += 1
        
        values.extend([template_id, current_user.user_id])
        
        query = f"""
            UPDATE message_templates
            SET {', '.join(update_fields)}
            WHERE id = ${param_count} AND user_id = ${param_count + 1}
            RETURNING *
        """
        
        row = await db.fetchrow(query, *values)
        
        return MessageTemplateResponse(**dict(row))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update template: {str(e)}")

@router.delete("/{template_id}")
async def delete_template(
    template_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """Delete a message template"""
    try:
        result = await db.execute(
            """
            DELETE FROM message_templates
            WHERE id = $1 AND user_id = $2
            """,
            template_id,
            current_user.user_id
        )
        
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Template not found")
        
        return {"message": "Template deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete template: {str(e)}")
