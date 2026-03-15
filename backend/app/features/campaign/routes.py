from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import List, Optional, Dict, Any, cast
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
    CampaignStatus,
    CampaignFullUpdate
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
            INSERT INTO campaigns (user_id, name, initial_message, status, negative_keywords, kill_switch_enabled, auto_replies)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            """,
            current_user.user_id,
            campaign.name,
            campaign.initial_message,
            CampaignStatus.draft,
            json.dumps(campaign.negative_keywords),
            campaign.kill_switch_enabled,
            json.dumps([r.dict() for r in campaign.auto_replies])
        )
        row_dict = dict(row)
        if isinstance(row_dict.get('negative_keywords'), str):
            row_dict['negative_keywords'] = json.loads(row_dict['negative_keywords'])
        if isinstance(row_dict.get('auto_replies'), str):
            row_dict['auto_replies'] = json.loads(row_dict['auto_replies'])
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
        if isinstance(camp_dict.get('auto_replies'), str):
            camp_dict['auto_replies'] = json.loads(camp_dict['auto_replies'])
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
    if isinstance(camp_dict.get('auto_replies'), str):
        camp_dict['auto_replies'] = json.loads(camp_dict['auto_replies'])
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
                    identifier = identifier.replace('https://t.me/', '', 1)
                elif identifier.startswith('http://t.me/'):
                    identifier = identifier.replace('http://t.me/', '', 1)
                elif identifier.startswith('t.me/'):
                    identifier = identifier.replace('t.me/', '', 1)
                    
                if identifier.startswith('@'):
                    identifier = identifier.replace('@', '', 1)
                
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
            INSERT INTO campaign_steps (campaign_id, step_number, wait_time_hours, keywords, response_text, keyword_response_text, next_step, auto_replies)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            """,
            campaign_id,
            step.step_number,
            step.wait_time_hours,
            json.dumps(step.keywords),
            step.response_text,
            step.keyword_response_text,
            step.next_step,
            json.dumps([r.dict() for r in step.auto_replies])
        )
        row_dict = dict(row)
        if isinstance(row_dict.get('keywords'), str):
            row_dict['keywords'] = json.loads(row_dict['keywords'])
        if isinstance(row_dict.get('auto_replies'), str):
            row_dict['auto_replies'] = json.loads(row_dict['auto_replies'])
            
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
        d = cast(Dict[str, Any], dict(row))
        kw = d.get('keywords')
        if isinstance(kw, str):
            d['keywords'] = json.loads(kw)
        
        ar = d.get('auto_replies')
        if isinstance(ar, str):
            d['auto_replies'] = json.loads(ar)
        elif ar is None:
            d['auto_replies'] = []
            
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
                first_contacted_at = NULL,
                responded_at = NULL,
                response_time_seconds = NULL,
                replied_at_step = NULL,
                failure_reason = NULL,
                restarted_at = NOW()
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

        # 3. Clear campaign logs (start activities from fresh)
        await db.execute(
            "DELETE FROM campaign_logs WHERE campaign_id = $1",
            campaign_id
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

@router.get("/{campaign_id}/analytics")
async def get_campaign_analytics(
    campaign_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    # Verify ownership
    campaign = await db.fetchrow(
        "SELECT id, name, total_leads, completed_leads, replied_leads FROM campaigns WHERE id = $1 AND user_id = $2",
        campaign_id, current_user.user_id
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # 1. Basic Stats
    total = campaign['total_leads'] or 0
    replied = campaign['replied_leads'] or 0
    conversion_rate = (replied / total * 100) if total > 0 else 0

    # 2. Average Response Time (only for leads that replied)
    avg_response_seconds = await db.fetchval(
        """
        SELECT AVG(response_time_seconds) 
        FROM campaign_leads 
        WHERE campaign_id = $1 AND response_time_seconds IS NOT NULL
        """,
        campaign_id
    ) or 0

    # 3. Step Performance Tracking (Include Step 0 and Reach vs Replies)
    step_stats = await db.fetch(
        """
        WITH all_steps AS (
            SELECT 0 as step_number, 'Initial Message' as label
            UNION ALL
            SELECT step_number, 'Step ' || step_number FROM campaign_steps WHERE campaign_id = $1
        )
        SELECT 
            als.step_number,
            als.label,
            (SELECT COUNT(*) FROM campaign_leads WHERE campaign_id = $1 AND current_step >= als.step_number) as reached_count,
            (SELECT COUNT(*) FROM campaign_leads WHERE campaign_id = $1 AND replied_at_step = als.step_number) as reply_count,
            (SELECT AVG(response_time_seconds) FROM campaign_leads WHERE campaign_id = $1 AND replied_at_step = als.step_number) as avg_response_time
        FROM all_steps als
        ORDER BY als.step_number
        """,
        campaign_id
    )

    # 4. Timeline Logs (Latest 50 actions for context, filtered by restart)
    logs = await db.fetch(
        """
        SELECT cl.action, cl.details, cl.created_at, l.telegram_identifier
        FROM campaign_logs cl
        JOIN campaign_leads l ON cl.lead_id = l.id
        WHERE cl.campaign_id = $1 
        AND cl.created_at >= COALESCE(l.restarted_at, '2000-01-01'::timestamp)
        ORDER BY cl.created_at DESC
        LIMIT 50
        """,
        campaign_id
    )

    # 5. Engagement List (Use current_step as lead's actual progress)
    top_leads = await db.fetch(
        """
        SELECT cl.id, cl.telegram_identifier, cl.current_step as step_number, cl.response_time_seconds, 
               cl.responded_at, cl.status, cl.last_contact_at,
               COALESCE(cs_current.response_text, c.initial_message) as sent_text,
               (SELECT original_text FROM messages m 
                JOIN conversations conv ON m.conversation_id = conv.id 
                WHERE (conv.telegram_peer_id = cl.telegram_id OR (cl.telegram_id IS NULL AND CAST(conv.telegram_peer_id AS TEXT) = cl.telegram_identifier))
                AND m.is_outgoing = FALSE 
                AND m.created_at >= COALESCE(cl.restarted_at, cl.first_contacted_at)
                ORDER BY m.created_at ASC LIMIT 1) as reply_original,
               (SELECT translated_text FROM messages m 
                JOIN conversations conv ON m.conversation_id = conv.id 
                WHERE (conv.telegram_peer_id = cl.telegram_id OR (cl.telegram_id IS NULL AND CAST(conv.telegram_peer_id AS TEXT) = cl.telegram_identifier))
                AND m.is_outgoing = FALSE 
                AND m.created_at >= COALESCE(cl.restarted_at, cl.first_contacted_at)
                ORDER BY m.created_at ASC LIMIT 1) as reply_translated,
               (SELECT source_language FROM messages m 
                JOIN conversations conv ON m.conversation_id = conv.id 
                WHERE (conv.telegram_peer_id = cl.telegram_id OR (cl.telegram_id IS NULL AND CAST(conv.telegram_peer_id AS TEXT) = cl.telegram_identifier))
                AND m.is_outgoing = FALSE 
                AND m.created_at >= COALESCE(cl.restarted_at, cl.first_contacted_at)
                ORDER BY m.created_at ASC LIMIT 1) as reply_source_lang,
               (SELECT target_language FROM messages m 
                JOIN conversations conv ON m.conversation_id = conv.id 
                WHERE (conv.telegram_peer_id = cl.telegram_id OR (cl.telegram_id IS NULL AND CAST(conv.telegram_peer_id AS TEXT) = cl.telegram_identifier))
                AND m.is_outgoing = FALSE 
                AND m.created_at >= COALESCE(cl.restarted_at, cl.first_contacted_at)
                ORDER BY m.created_at ASC LIMIT 1) as reply_target_lang,
               (SELECT original_text FROM messages m 
                JOIN conversations conv ON m.conversation_id = conv.id 
                WHERE (conv.telegram_peer_id = cl.telegram_id OR (cl.telegram_id IS NULL AND CAST(conv.telegram_peer_id AS TEXT) = cl.telegram_identifier))
                AND m.is_outgoing = TRUE
                AND m.created_at >= COALESCE(cl.restarted_at, cl.first_contacted_at)
                ORDER BY m.created_at DESC LIMIT 1) as sent_original,
               (SELECT translated_text FROM messages m 
                JOIN conversations conv ON m.conversation_id = conv.id 
                WHERE (conv.telegram_peer_id = cl.telegram_id OR (cl.telegram_id IS NULL AND CAST(conv.telegram_peer_id AS TEXT) = cl.telegram_identifier))
                AND m.is_outgoing = TRUE
                AND m.created_at >= COALESCE(cl.restarted_at, cl.first_contacted_at)
                ORDER BY m.created_at DESC LIMIT 1) as sent_translated,
               (SELECT source_language FROM messages m 
                JOIN conversations conv ON m.conversation_id = conv.id 
                WHERE (conv.telegram_peer_id = cl.telegram_id OR (cl.telegram_id IS NULL AND CAST(conv.telegram_peer_id AS TEXT) = cl.telegram_identifier))
                AND m.is_outgoing = TRUE
                AND m.created_at >= COALESCE(cl.restarted_at, cl.first_contacted_at)
                ORDER BY m.created_at DESC LIMIT 1) as sent_source_lang,
               (SELECT target_language FROM messages m 
                JOIN conversations conv ON m.conversation_id = conv.id 
                WHERE (conv.telegram_peer_id = cl.telegram_id OR (cl.telegram_id IS NULL AND CAST(conv.telegram_peer_id AS TEXT) = cl.telegram_identifier))
                AND m.is_outgoing = TRUE
                AND m.created_at >= COALESCE(cl.restarted_at, cl.first_contacted_at)
                ORDER BY m.created_at DESC LIMIT 1) as sent_target_lang
        FROM campaign_leads cl
        JOIN campaigns c ON cl.campaign_id = c.id
        LEFT JOIN campaign_steps cs_reply ON cl.campaign_id = cs_reply.campaign_id AND cl.replied_at_step = cs_reply.step_number
        LEFT JOIN campaign_steps cs_current ON cl.campaign_id = cs_current.campaign_id AND cl.current_step = cs_current.step_number
        WHERE cl.campaign_id = $1 AND cl.status IN ('contacted', 'replied', 'completed')
        ORDER BY cl.responded_at DESC NULLS LAST, cl.last_contact_at DESC
        LIMIT 20
        """,
        campaign_id
    )

    return {
        "summary": {
            "name": campaign['name'],
            "total_leads": total,
            "reached_leads": campaign['completed_leads'],
            "replied_leads": replied,
            "conversion_rate": round(float(conversion_rate), 1),
            "avg_response_time_seconds": int(avg_response_seconds)
        },
        "step_performance": [dict(s) for s in step_stats],
        "recent_activity": [dict(l) for l in logs],
        "top_conversions": [dict(tl) for tl in top_leads]
    }


@router.get("/{campaign_id}/leads/{lead_id}/history")
async def get_lead_campaign_history(
    campaign_id: int,
    lead_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    # Verify ownership of the campaign and lead
    lead = await db.fetchrow(
        """
        SELECT cl.*, c.name as campaign_name, c.user_id
        FROM campaign_leads cl
        JOIN campaigns c ON cl.campaign_id = c.id
        WHERE cl.id = $1 AND cl.campaign_id = $2 AND c.user_id = $3
        """,
        lead_id, campaign_id, current_user.user_id
    )
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    start_time = lead['restarted_at'] or lead['first_contacted_at']
    if not start_time:
        return {"history": []}

    # Fetch messages in the conversation starting from first contact
    # We find the conversation between the assigned account and the telegram_id
    history = await db.fetch(
        """
        SELECT m.id, m.original_text, m.translated_text, m.is_outgoing, m.created_at, m.is_encrypted,
               m.source_language, m.target_language
        FROM messages m
        JOIN conversations conv ON m.conversation_id = conv.id
        WHERE conv.telegram_account_id = $1
        AND conv.telegram_peer_id = $2
        AND m.created_at >= $3
        ORDER BY m.created_at ASC
        """,
        lead['assigned_account_id'], lead['telegram_id'], start_time
    )
    
    return {
        "lead": {
            "identifier": lead['telegram_identifier'],
            "status": lead['status'],
            "current_step": lead['current_step']
        },
        "history": [dict(h) for h in history]
    }


@router.put("/{campaign_id}")
async def update_campaign_full(
    campaign_id: int,
    campaign_update: CampaignFullUpdate,
    current_user: TokenData = Depends(get_current_user)
):
    campaign = await db.fetchrow(
        "SELECT id FROM campaigns WHERE id = $1 AND user_id = $2",
        campaign_id,
        current_user.user_id
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    import json
    try:
        # Update main campaign fields
        await db.execute(
            """
            UPDATE campaigns 
            SET name = $1, initial_message = $2, negative_keywords = $3, 
                kill_switch_enabled = $4, auto_replies = $5
            WHERE id = $6
            """,
            campaign_update.name,
            campaign_update.initial_message,
            json.dumps(campaign_update.negative_keywords),
            campaign_update.kill_switch_enabled,
            json.dumps([r.dict() for r in campaign_update.auto_replies]),
            campaign_id
        )

        # Recreate steps (easiest way to handle updates without complex matching)
        await db.execute("DELETE FROM campaign_steps WHERE campaign_id = $1", campaign_id)

        for step in campaign_update.steps:
            await db.execute(
                """
                INSERT INTO campaign_steps (
                    campaign_id, step_number, wait_time_hours, keywords, 
                    response_text, keyword_response_text, next_step, auto_replies
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                campaign_id,
                step.step_number,
                step.wait_time_hours,
                json.dumps(step.keywords),
                step.response_text,
                step.keyword_response_text,
                step.next_step,
                json.dumps([r.dict() for r in step.auto_replies])
            )

        return {"success": True, "message": "Campaign updated successfully"}
    except Exception as e:
        logger.error(f"Failed to update campaign {campaign_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update campaign")
