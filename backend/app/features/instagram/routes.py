from fastapi import APIRouter, Depends, Query, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
from models import TokenData, InstagramDiscoveryRequest, InstagramProxyCreate, InstagramAccountCreate
from auth import get_current_user
from instagram_service import instagram_service

router = APIRouter(prefix="/api/instagram", tags=["instagram"])

@router.post("/discover")
async def discover_leads(
    request: InstagramDiscoveryRequest,
    current_user: TokenData = Depends(get_current_user)
):
    """Stage 1: Discover Instagram leads from keywords (Professional Mode: Blocking)."""
    # 🌀 Pro Mode: Wait for complete results to give the final count
    new_count = await instagram_service.discover_leads_google(
        current_user.user_id, 
        request.keywords, 
        request.limit_per_keyword
    )
    return {"status": "success", "new_leads_found": new_count}

@router.get("/leads")
async def get_leads(
    status: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    limit: int = 10000,
    offset: int = 0,
    current_user: TokenData = Depends(get_current_user)
):
    """Retrieve Instagram leads with filtering and pagination."""
    return await instagram_service.get_leads(
        current_user.user_id, 
        status, 
        keyword, 
        limit, 
        offset
    )

@router.get("/stats")
async def get_instagram_stats(
    current_user: TokenData = Depends(get_current_user)
):
    """Retrieve statistics for Instagram lead generation."""
    return await instagram_service.get_stats(current_user.user_id)

# --- Proxies ---

@router.get("/proxies")
async def get_proxies(current_user: TokenData = Depends(get_current_user)):
    return await instagram_service.get_proxies(current_user.user_id)

@router.post("/proxies")
async def add_proxy(
    proxy: InstagramProxyCreate,
    current_user: TokenData = Depends(get_current_user)
):
    return await instagram_service.add_proxy(current_user.user_id, proxy)

# --- Accounts ---

@router.get("/accounts")
async def get_accounts(current_user: TokenData = Depends(get_current_user)):
    return await instagram_service.get_accounts(current_user.user_id)

@router.post("/accounts")
async def add_account(
    account: InstagramAccountCreate,
    current_user: TokenData = Depends(get_current_user)
):
    return await instagram_service.add_account(current_user.user_id, account)

@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    return await instagram_service.delete_account(current_user.user_id, account_id)

@router.delete("/proxies/{proxy_id}")
async def delete_proxy(
    proxy_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    return await instagram_service.delete_proxy(current_user.user_id, proxy_id)

@router.delete("/leads/{lead_id}")
async def delete_lead(
    lead_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """Delete a single Instagram lead by ID."""
    return await instagram_service.delete_lead(current_user.user_id, lead_id)

@router.delete("/leads/clear")
async def clear_all_leads(current_user: TokenData = Depends(get_current_user)):
    """Wipe all Instagram leads for the user."""
    return await instagram_service.clear_all_leads(current_user.user_id)

@router.post("/leads/{lead_id}/harvest")
async def harvest_lead_network(
    lead_id: int,
    background_tasks: BackgroundTasks,
    current_user: TokenData = Depends(get_current_user)
):
    """Explicitly trigger network harvesting (Followers/Following) for a vetted lead."""
    # 🏎️💨 Background: Don't make the user wait for the 2-minute scrape!
    background_tasks.add_task(instagram_service.harvest_lead_network, current_user.user_id, lead_id)
    return {"status": "success", "message": "💎 Harvest started in background! New leads will appear in your table shortly."}

@router.delete("/leads/{lead_id}")

# --- Analysis ---

@router.post("/leads/{lead_id}/status")
async def update_lead_status(
    lead_id: int,
    status: str = Query(...),
    current_user: TokenData = Depends(get_current_user)
):
    """Explicitly update lead status (e.g. mark as approved/rejected manually)."""
    return await instagram_service.update_lead_status(current_user.user_id, lead_id, status)

@router.post("/leads/{lead_id}/analyze")
async def manual_analyze_lead(
    lead_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """Stage 2: Manually analyze a single lead (Bio + Followers + Visuals)."""
    return await instagram_service.analyze_lead(current_user.user_id, lead_id)

@router.get("/leads/{lead_id}/network")
async def get_lead_network(
    lead_id: int,
    direction: Optional[str] = Query(None),
    current_user: TokenData = Depends(get_current_user)
):
    """Get the scraped followers/following list for a specific lead."""
    return await instagram_service.get_lead_network(current_user.user_id, lead_id, direction)

@router.post("/auto-analyze/start")
async def start_auto_pilot(current_user: TokenData = Depends(get_current_user)):
    """🏎️ START AUTO-PILOT: Scan all discovered leads in the background."""
    return await instagram_service.start_auto_analysis(current_user.user_id)

@router.post("/auto-analyze/stop")
async def stop_auto_pilot(current_user: TokenData = Depends(get_current_user)):
    """🛑 STOP AUTO-PILOT: Pause the background scanning."""
    return await instagram_service.stop_auto_analysis(current_user.user_id)

@router.get("/auto-analyze/status")
async def get_auto_pilot_status(current_user: TokenData = Depends(get_current_user)):
    """💡 STATUS: Check if Auto-Pilot is currently running."""
    return await instagram_service.get_worker_status(current_user.user_id)

# --- Stage 4: Outreach Campaign ---

class CampaignStartRequest(BaseModel):
    template: str

@router.post("/campaign/start")
async def start_campaign(req: CampaignStartRequest, current_user: TokenData = Depends(get_current_user)):
    """🚀 LAUNCH CAMPAIGN PILOT: Start sending DMs to qualified leads in background."""
    return await instagram_service.start_campaign(current_user.user_id, req.template)

@router.post("/campaign/stop")
async def stop_campaign(current_user: TokenData = Depends(get_current_user)):
    """🛑 STOP CAMPAIGN: Pause the outreach engine."""
    return await instagram_service.stop_campaign(current_user.user_id)

@router.get("/campaign/status")
async def get_campaign_status(current_user: TokenData = Depends(get_current_user)):
    """🚥 STATUS: Check if the Campaign Pilot is firing."""
    return await instagram_service.get_campaign_status(current_user.user_id)

@router.post("/campaign/fix-accounts")
async def fix_account_statuses(current_user: TokenData = Depends(get_current_user)):
    """🔧 FIX: Set all ghost accounts to 'active' status so Campaign Pilot can find them."""
    return await instagram_service.fix_account_statuses(current_user.user_id)

# --- Filter Settings ---

class FilterSettingsRequest(BaseModel):
    bio_keywords: str = ""
    min_followers: int = 0
    max_followers: int = 0
    sample_hashes: List[str] = []

@router.get("/filters/settings")
async def get_filter_settings(current_user: TokenData = Depends(get_current_user)):
    """⚙️ Get the user's lead qualification filter rules (keywords + image hashes)."""
    return await instagram_service.get_filter_settings(current_user.user_id)

@router.post("/filters/settings")
async def save_filter_settings(req: FilterSettingsRequest, current_user: TokenData = Depends(get_current_user)):
    """💾 Save bio keyword, follower range, and sample image hashes."""
    return await instagram_service.save_filter_settings(
        current_user.user_id, req.bio_keywords, req.min_followers, req.max_followers, req.sample_hashes
    )

class ImageHashRequest(BaseModel):
    image_base64: str

@router.post("/filters/generate-hash")
async def generate_image_hash(req: ImageHashRequest, current_user: TokenData = Depends(get_current_user)):
    """🖼️ Generate a visual fingerprint from an uploaded sample image."""
    h = await instagram_service.generate_sample_hash(req.image_base64)
    return {"hash": h}
