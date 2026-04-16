from pydantic import BaseModel, Field
from typing import Optional, List, Union
from datetime import datetime
from enum import Enum

class InstagramWarmingAccountStatus(str, Enum):
    active = "active"
    banned = "banned"
    error = "error"
    pending = "pending"

class InstagramWarmingAccountCreate(BaseModel):
    username: str
    password: str
    proxy_id: Optional[Union[int, str]] = None

class InstagramWarmingProxyCreate(BaseModel):
    host: str
    port: int
    username: Optional[str] = None
    password: Optional[str] = None
    proxy_type: str = "http"

class InstagramWarmingDiscoveryRequest(BaseModel):
    keywords: List[str]
    limit_per_keyword: int = 50

class InstagramWarmingSettingsRequest(BaseModel):
    bio_keywords: str = ""
    min_followers: int = 0
    max_followers: int = 0
