from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import List, Optional
import io
import csv
from datetime import datetime
from database import db
from auth import get_current_user
from models import (
    CampaignCreate,
    CampaignResponse,
    CampaignStepCreate,
    CampaignStepResponse,
    CampaignLeadResponse,
    TokenData,
    CampaignStatus
)
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])

# Create a new automated campaign with an initial outreach message
@router.post("", response_model=CampaignResponse)
async def create_campaign(
    campaign: CampaignCreate,
    current_user: TokenData = Depends(get_current_user)
):
    try:
        row = await db.fetchrow(
            """
            INSERT INTO campaigns (user_id, name, initial_message, status)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            """,
            current_user.user_id,
            campaign.name,
            campaign.initial_message,
            CampaignStatus.draft
        )
        return dict(row)
    except Exception as e:
        logger.error(f"Failed to create campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Retrieve all campaigns created by the current user
@router.get("", response_model=List[CampaignResponse])
async def get_campaigns(
    current_user: TokenData = Depends(get_current_user)
):
    rows = await db.fetch(
        "SELECT * FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC",
        current_user.user_id
    )
    return [dict(row) for row in rows]

# Fetch details of a single campaign
@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    row = await db.fetchrow(
        "SELECT * FROM campaigns WHERE id = $1 AND user_id = $2",
        campaign_id,
        current_user.user_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return dict(row)

# Upload a CSV file containing Telegram usernames or phone numbers to populate the campaign queue
@router.post("/{campaign_id}/upload-leads")
async def upload_leads(
    campaign_id: int,
    file: UploadFile = File(...),
    current_user: TokenData = Depends(get_current_user)
):
    # Verify campaign ownership
    campaign = await db.fetchrow(
        "SELECT id FROM campaigns WHERE id = $1 AND user_id = $2",
        campaign_id,
        current_user.user_id
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    try:
        content = await file.read()
        decoded = content.decode('utf-8-sig').splitlines()
        reader = csv.reader(decoded)
        
        identifiers = []
        for row in reader:
            if not row: continue
            # Assume first column is the username/phone
            identifier = row[0].strip()
            if identifier:
                if identifier.startswith('@'):
                    identifier = identifier[1:]
                identifiers.append(identifier)
        
        if not identifiers:
            return {"message": "No valid leads found in CSV", "count": 0}

        # Fetch active accounts to distribute leads
        accounts = await db.fetch(
            "SELECT id FROM telegram_accounts WHERE user_id = $1 AND is_active = true",
            current_user.user_id
        )
        
        account_count = len(accounts)
        
        # Insert leads while skipping duplicates and distributing across accounts
        count = 0
        for i, identifier in enumerate(identifiers):
            try:
                # Round-robin assignment if accounts exist
                assigned_account_id = None
                if account_count > 0:
                    assigned_account_id = accounts[i % account_count]['id']

                await db.execute(
                    """
                    INSERT INTO campaign_leads (campaign_id, telegram_identifier, assigned_account_id)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (campaign_id, telegram_identifier) DO NOTHING
                    """,
                    campaign_id,
                    identifier,
                    assigned_account_id
                )
                count += 1
            except Exception:
                continue
        
        # Update total leads count in campaign table
        await db.execute(
            "UPDATE campaigns SET total_leads = (SELECT COUNT(*) FROM campaign_leads WHERE campaign_id = $1) WHERE id = $1",
            campaign_id
        )

        return {
            "message": f"Successfully uploaded {count} new leads", 
            "total_leads": len(identifiers),
            "accounts_used": account_count
        }
    except Exception as e:
        logger.error(f"Lead upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process CSV: {str(e)}")

# Add a specific follow-up step to a campaign
@router.post("/{campaign_id}/steps", response_model=CampaignStepResponse)
async def add_campaign_step(
    campaign_id: int,
    step: CampaignStepCreate,
    current_user: TokenData = Depends(get_current_user)
):
    # Verify campaign ownership
    campaign = await db.fetchrow(
        "SELECT id FROM campaigns WHERE id = $1 AND user_id = $2",
        campaign_id,
        current_user.user_id
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    import json
    try:
        row = await db.fetchrow(
            """
            INSERT INTO campaign_steps (campaign_id, step_number, wait_time_hours, keywords, response_text)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            """,
            campaign_id,
            step.step_number,
            step.wait_time_hours,
            json.dumps(step.keywords),
            step.response_text
        )
        return dict(row)
    except Exception as e:
        logger.error(f"Failed to add step: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# List all automated steps configured for a specific campaign
@router.get("/{campaign_id}/steps", response_model=List[CampaignStepResponse])
async def get_campaign_steps(
    campaign_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    rows = await db.fetch(
        "SELECT * FROM campaign_steps WHERE campaign_id = $1 ORDER BY step_number ASC",
        campaign_id
    )
    
    import json
    result = []
    for row in rows:
        d = dict(row)
        if isinstance(d['keywords'], str):
            d['keywords'] = json.loads(d['keywords'])
        result.append(d)
        
    return result

# List leads for a specific campaign, including assigned account info
@router.get("/{campaign_id}/leads", response_model=List[CampaignLeadResponse])
# Fetch all leads for a specific campaign
async def get_campaign_leads(
    campaign_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    # Verify campaign ownership
    campaign = await db.fetchrow(
        "SELECT id FROM campaigns WHERE id = $1 AND user_id = $2",
        campaign_id,
        current_user.user_id
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    rows = await db.fetch(
        """
        SELECT cl.*, ta.account_name as assigned_account_name, ta.display_name as assigned_account_display_name
        FROM campaign_leads cl
        LEFT JOIN telegram_accounts ta ON cl.assigned_account_id = ta.id
        WHERE cl.campaign_id = $1
        ORDER BY cl.created_at ASC
        """,
        campaign_id
    )
    return [dict(row) for row in rows]

# Delete a specified campaign (this will cascade delete leads and steps)
@router.delete("/{campaign_id}")
async def delete_campaign(
    campaign_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    campaign = await db.fetchrow(
        "SELECT id FROM campaigns WHERE id = $1 AND user_id = $2",
        campaign_id,
        current_user.user_id
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    try:
        await db.execute(
            "DELETE FROM campaigns WHERE id = $1 AND user_id = $2",
            campaign_id,
            current_user.user_id
        )
        return {"success": True, "message": "Campaign and all related data deleted successfully"}
    except Exception as e:
        logger.error(f"Failed to delete campaign: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete campaign")
