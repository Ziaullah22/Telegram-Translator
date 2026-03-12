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
from campaign_service import campaign_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])

# Create a new automated campaign with an initial outreach message
@router.post("", response_model=CampaignResponse)
async def create_campaign(
    campaign: CampaignCreate,
    current_user: TokenData = Depends(get_current_user)
):
    import json
    try:
        row = await db.fetchrow(
            """
            INSERT INTO campaigns (user_id, name, initial_message, status, negative_keywords, kill_switch_enabled)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            """,
            current_user.user_id,
            campaign.name,
            campaign.initial_message,
            CampaignStatus.draft,
            json.dumps(campaign.negative_keywords),
            campaign.kill_switch_enabled
        )
        row_dict = dict(row)
        if isinstance(row_dict.get('negative_keywords'), str):
            row_dict['negative_keywords'] = json.loads(row_dict['negative_keywords'])
        return row_dict
    except Exception as e:
        logger.error(f"Failed to create campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Retrieve all campaigns created by the current user
@router.get("", response_model=List[CampaignResponse])
async def get_campaigns(
    current_user: TokenData = Depends(get_current_user)
):
    import json
    rows = await db.fetch(
        "SELECT * FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC",
        current_user.user_id
    )
    
    result = []
    for row in rows:
        camp_dict = dict(row)
        if isinstance(camp_dict.get('negative_keywords'), str):
            camp_dict['negative_keywords'] = json.loads(camp_dict['negative_keywords'])
        hibernation = await campaign_service.get_campaign_hibernation_status(camp_dict['id'], current_user.user_id)
        camp_dict.update(hibernation)
        result.append(camp_dict)
        
    return result

# Fetch details of a single campaign
@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    import json
    row = await db.fetchrow(
        "SELECT * FROM campaigns WHERE id = $1 AND user_id = $2",
        campaign_id,
        current_user.user_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    camp_dict = dict(row)
    if isinstance(camp_dict.get('negative_keywords'), str):
        camp_dict['negative_keywords'] = json.loads(camp_dict['negative_keywords'])
    hibernation = await campaign_service.get_campaign_hibernation_status(campaign_id, current_user.user_id)
    camp_dict.update(hibernation)
    return camp_dict

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
                # Strip out common URL formats
                if identifier.startswith('https://t.me/'):
                    identifier = identifier[13:]
                elif identifier.startswith('http://t.me/'):
                    identifier = identifier[12:]
                elif identifier.startswith('t.me/'):
                    identifier = identifier[5:]
                    
                if identifier.startswith('@'):
                    identifier = identifier[1:]
                
                # Only add if we still have a valid identifier after cleanup
                if identifier:
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
            INSERT INTO campaign_steps (campaign_id, step_number, wait_time_hours, keywords, response_text, keyword_response_text, next_step)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            """,
            campaign_id,
            step.step_number,
            step.wait_time_hours,
            json.dumps(step.keywords),
            step.response_text,
            step.keyword_response_text,
            step.next_step
        )
        row_dict = dict(row)
        if isinstance(row_dict.get('keywords'), str):
            row_dict['keywords'] = json.loads(row_dict['keywords'])
            
        return row_dict
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



@router.post("/{campaign_id}/pause")
async def pause_campaign(
    campaign_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    await db.execute(
        "UPDATE campaigns SET status = 'paused' WHERE id = $1 AND user_id = $2",
        campaign_id,
        current_user.user_id
    )
    return {"success": True}

@router.post("/{campaign_id}/resume")
async def resume_campaign(
    campaign_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    # Only update the campaign status — do NOT touch lead statuses.
    # Leads already have their real statuses (contacted, completed, failed, etc.)
    # and the campaign engine will correctly skip them.
    await db.execute(
        "UPDATE campaigns SET status = 'running' WHERE id = $1 AND user_id = $2",
        campaign_id,
        current_user.user_id
    )
    return {"success": True}

@router.post("/{campaign_id}/restart")
async def restart_campaign(
    campaign_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """
    Restart a campaign from scratch:
    - Resets ALL leads back to step 0 and status 'pending'
    - Clears failure reasons
    - Resets campaign counters (completed, replied)
    - Sets campaign status back to 'running'
    """
    campaign = await db.fetchrow(
        "SELECT id FROM campaigns WHERE id = $1 AND user_id = $2",
        campaign_id, current_user.user_id
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    try:
        # 1. Reset all leads to initial state
        await db.execute(
            """
            UPDATE campaign_leads
            SET current_step = 0,
                status = 'pending',
                last_contact_at = NULL,
                failure_reason = NULL
            WHERE campaign_id = $1
            """,
            campaign_id
        )

        # 2. Reset campaign counters and status
        await db.execute(
            """
            UPDATE campaigns
            SET status = 'running',
                completed_leads = 0,
                replied_leads = 0
            WHERE id = $1 AND user_id = $2
            """,
            campaign_id, current_user.user_id
        )

        return {"success": True, "message": "Campaign restarted from scratch"}
    except Exception as e:
        logger.error(f"Failed to restart campaign {campaign_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to restart campaign")

@router.get("/safety-stats/{account_id}")
async def get_safety_stats(
    account_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    stats = await campaign_service.get_account_outreach_stats(account_id)
    return stats

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
