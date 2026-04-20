from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, UploadFile, File
from typing import List, Optional
from auth import get_current_user
from models import TokenData
from .models import (
    InstagramWarmingDiscoveryRequest, 
    InstagramWarmingAccountCreate, 
    InstagramWarmingProxyCreate,
    InstagramWarmingSettingsRequest
)
from .service import instagram_warming_service

router = APIRouter(prefix="/api/instagram-warming", tags=["instagram-warming"])
@router.get("/health")
async def warming_health():
    return {"status": "warming router active"}

@router.get("/leads")
async def get_warming_leads(
    status: Optional[str] = Query(None), 
    limit: int = 500, 
    offset: int = 0, 
    current_user: TokenData = Depends(get_current_user)
):
    return await instagram_warming_service.get_leads(current_user.user_id, status, limit, offset)

@router.post("/discover")
async def discover_warming_leads(
    req: InstagramWarmingDiscoveryRequest, 
    background_tasks: BackgroundTasks, 
    current_user: TokenData = Depends(get_current_user)
):
    background_tasks.add_task(instagram_warming_service.discover_leads_google, current_user.user_id, req.keywords, req.limit_per_keyword)
    return {"message": "Discovery mission started in background"}

@router.get("/accounts")
async def get_warming_accounts(current_user: TokenData = Depends(get_current_user)):
    return await instagram_warming_service.get_accounts(current_user.user_id)

@router.post("/accounts")
async def add_warming_account(
    req: InstagramWarmingAccountCreate, 
    current_user: TokenData = Depends(get_current_user)
):
    return await instagram_warming_service.add_account(current_user.user_id, req)

@router.delete("/accounts/{account_id}")
async def delete_warming_account(account_id: int, current_user: TokenData = Depends(get_current_user)):
    return await instagram_warming_service.delete_account(current_user.user_id, account_id)

@router.get("/proxies")
async def get_warming_proxies(current_user: TokenData = Depends(get_current_user)):
    return await instagram_warming_service.get_proxies(current_user.user_id)

@router.post("/proxies")
async def add_warming_proxy(
    req: InstagramWarmingProxyCreate, 
    current_user: TokenData = Depends(get_current_user)
):
    return await instagram_warming_service.add_proxy(current_user.user_id, req)

@router.delete("/proxies/{proxy_id}")
async def delete_warming_proxy(proxy_id: int, current_user: TokenData = Depends(get_current_user)):
    return await instagram_warming_service.delete_proxy(current_user.user_id, proxy_id)

@router.get("/settings")
async def get_warming_settings(current_user: TokenData = Depends(get_current_user)):
    return await instagram_warming_service.get_settings(current_user.user_id)

@router.post("/settings")
async def save_warming_settings(
    req: InstagramWarmingSettingsRequest, 
    current_user: TokenData = Depends(get_current_user)
):
    return await instagram_warming_service.save_settings(current_user.user_id, req)

@router.post("/accounts/bulk")
async def bulk_upload_accounts(
    file: UploadFile = File(...),
    current_user: TokenData = Depends(get_current_user)
):
    """🚀 BULK ACCOUNT MISSION: Upload a .txt file and automatically distribute existing proxies."""
    content = await file.read()
    lines = content.decode('utf-8').splitlines()
    count = await instagram_warming_service.bulk_add_accounts(current_user.user_id, lines)
    return {"status": "success", "count": count, "message": f"🛸 Ghost Unit Reinforced: {count} accounts deployed with proxy rotation."}

@router.post("/proxies/bulk")
async def bulk_upload_proxies(
    file: UploadFile = File(...),
    current_user: TokenData = Depends(get_current_user)
):
    """🚀 BULK PROXY RELOAD: Upload a host:port:user:pass list for the ghost fleet."""
    content = await file.read()
    lines = content.decode('utf-8').splitlines()
    count = await instagram_warming_service.bulk_add_proxies(current_user.user_id, lines)
    return {"status": "success", "count": count, "message": f"🛰️ Comms Established: {count} proxies synced for the warming engine."}

@router.post("/analyze/{lead_id}")
async def analyze_warming_lead(lead_id: int, current_user: TokenData = Depends(get_current_user)):
    return await instagram_warming_service.analyze_lead(current_user.user_id, lead_id)

@router.post("/harvest/{lead_id}")
async def harvest_warming_lead(lead_id: int, current_user: TokenData = Depends(get_current_user)):
    return await instagram_warming_service.harvest_lead_network(current_user.user_id, lead_id)

@router.post("/autopilot/start")
async def start_warming_autopilot(current_user: TokenData = Depends(get_current_user)):
    return await instagram_warming_service.start_auto_pilot(current_user.user_id)

@router.post("/autopilot/stop")
async def stop_warming_autopilot(current_user: TokenData = Depends(get_current_user)):
    return await instagram_warming_service.stop_auto_pilot(current_user.user_id)

@router.get("/autopilot/status")
async def get_warming_autopilot_status(current_user: TokenData = Depends(get_current_user)):
    import time
    nap_end = instagram_warming_service.nap_end_times.get(current_user.user_id, 0)
    is_napping = nap_end > time.time()
    return {
        "is_running": instagram_warming_service.workers.get(current_user.user_id, False),
        "nap_end_time": nap_end if is_napping else None
    }

@router.patch("/accounts/{account_id}")
async def update_warming_account(account_id: int, data: dict, current_user: TokenData = Depends(get_current_user)):
    return await instagram_warming_service.update_account(current_user.user_id, account_id, data)

@router.patch("/leads/{lead_id}/status")
async def update_warming_lead_status(lead_id: int, status: str, current_user: TokenData = Depends(get_current_user)):
    return await instagram_warming_service.update_lead_status(current_user.user_id, lead_id, status)

@router.delete("/leads/{lead_id}")
async def delete_warming_lead(lead_id: int, current_user: TokenData = Depends(get_current_user)):
    return await instagram_warming_service.delete_lead(current_user.user_id, lead_id)

@router.delete("/leads")
async def clear_warming_leads(current_user: TokenData = Depends(get_current_user)):
    return await instagram_warming_service.clear_leads(current_user.user_id)

@router.post("/accounts/{account_id}/warmup")
async def manual_account_warmup(account_id: int, current_user: TokenData = Depends(get_current_user)):
    return await instagram_warming_service.manual_warmup_account(current_user.user_id, account_id)

@router.post("/accounts/{account_id}/pause")
async def pause_account_bot(account_id: int, current_user: TokenData = Depends(get_current_user)):
    """🎮 Human takes control — bot pauses for this account."""
    return await instagram_warming_service.pause_session(current_user.user_id, account_id)

@router.post("/accounts/{account_id}/resume")
async def resume_account_bot(account_id: int, current_user: TokenData = Depends(get_current_user)):
    """🤖 Bot resumes control — smart page-aware navigation."""
    return await instagram_warming_service.resume_session(current_user.user_id, account_id)

@router.get("/accounts/{account_id}/logs")
async def get_warming_account_logs(
    account_id: int, 
    limit: int = 50, 
    current_user: TokenData = Depends(get_current_user)
):
    """📜 Ghost Journal: Fetch recent activity logs for an account."""
    return await instagram_warming_service.get_account_logs(current_user.user_id, account_id, limit)

@router.get("/accounts/paused")
async def get_paused_accounts(current_user: TokenData = Depends(get_current_user)):
    """Returns list of account IDs currently paused (human in control)."""
    return {"paused": list(instagram_warming_service.paused_accounts)}
