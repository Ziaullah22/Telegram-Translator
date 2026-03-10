from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

# --- User Authentication Models ---
# Schema for registering a new user
class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    email: Optional[str] = None

# Schema for user login requests
class UserLogin(BaseModel):
    username: str
    password: str

# Schema for returning user profile details
class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str]
    is_active: bool
    created_at: datetime

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    user_id: Optional[int] = None
    username: Optional[str] = None

# --- Telegram Account Models ---
# Schema for defining a new Telegram account connection
class TelegramAccountCreate(BaseModel):
    display_name: str
    source_language: str = "auto"
    target_language: str = "en"

class TelegramAccountResponse(BaseModel):
    id: int
    account_name: str
    display_name: Optional[str]
    is_active: bool
    source_language: str
    target_language: str
    created_at: datetime
    last_used: Optional[datetime]
    is_connected: bool = False
    unread_count: int = 0

class TelegramAccountUpdate(BaseModel):
    account_name: Optional[str] = None
    display_name: Optional[str] = None
    source_language: Optional[str] = None
    target_language: Optional[str] = None
    is_active: Optional[bool] = None

# --- Conversation & Message Models ---
# Enumeration of supported Telegram conversation types
class ConversationType(str, Enum):
    private = "private"
    group = "group"
    supergroup = "supergroup"
    channel = "channel"

class ConversationResponse(BaseModel):
    id: int
    telegram_account_id: int
    telegram_peer_id: int
    title: Optional[str]
    type: str
    is_archived: bool
    created_at: datetime
    last_message_at: Optional[datetime]
    last_message: Optional['MessageResponse'] = None
    unread_count: int = 0
    username: Optional[str] = None
    is_hidden: bool = False
    is_muted: bool = False

class MessageType(str, Enum):
    text = "text"
    photo = "photo"
    video = "video"
    voice = "voice"
    document = "document"
    sticker = "sticker"
    system = "system"

class MessageResponse(BaseModel):
    id: int
    conversation_id: int
    telegram_message_id: Optional[int]
    sender_user_id: Optional[int]
    sender_name: Optional[str]
    sender_username: Optional[str]
    type: str
    original_text: Optional[str]
    translated_text: Optional[str]
    source_language: Optional[str]
    target_language: Optional[str]
    created_at: datetime
    edited_at: Optional[datetime]
    is_outgoing: bool = False
    media_file_name: Optional[str] = None
    reply_to_telegram_id: Optional[int] = None
    reply_to_text: Optional[str] = None
    reply_to_sender: Optional[str] = None
    reactions: Optional[dict] = None

class MessageSend(BaseModel):
    conversation_id: int
    text: str
    translate: bool = True
    reply_to_message_id: Optional[int] = None # This is the telegram_message_id to reply to

class MessageReact(BaseModel):
    emoji: str

class TranslationRequest(BaseModel):
    text: str
    target_language: str
    source_language: str = "auto"

class TranslationResponse(BaseModel):
    original_text: str
    translated_text: str
    source_language: str
    target_language: str

class TdataUpload(BaseModel):
    account_name: str
    source_language: str = "auto"
    target_language: str = "en"

# --- Message Templates ---
# Schema for creating a reusable message template
class MessageTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    content: str = Field(..., min_length=1)

class MessageTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    content: Optional[str] = Field(None, min_length=1)

class MessageTemplateResponse(BaseModel):
    id: int
    user_id: int
    name: str
    content: str
    created_at: datetime
    updated_at: datetime

# --- Scheduled Messages ---
# Schema for scheduling a future automated message
class ScheduledMessageCreate(BaseModel):
    conversation_id: int
    message_text: str = Field(..., min_length=1)
    days_delay: float = Field(..., gt=0)  # Fractional days supported (e.g., 0.021 = 30 min)

class ScheduledMessageUpdate(BaseModel):
    message_text: Optional[str] = Field(None, min_length=1)
    days_delay: Optional[float] = Field(None, gt=0)

class ScheduledMessageResponse(BaseModel):
    id: int
    conversation_id: int
    message_text: str
    scheduled_at: datetime
    created_at: datetime
    is_sent: bool
    is_cancelled: bool

# --- Contact CRM Models ---
# Schema for generating structured CRM records per conversation
class ContactInfoCreate(BaseModel):
    conversation_id: int
    name: Optional[str] = None
    address: Optional[str] = None
    telephone: Optional[str] = None
    telegram_id: Optional[str] = None
    telegram_id2: Optional[str] = None
    signal_id: Optional[str] = None
    signal_id2: Optional[str] = None
    product_interest: Optional[str] = None
    sales_volume: Optional[str] = None
    ready_for_sample: Optional[bool] = False
    sample_recipient_info: Optional[str] = None
    sample_feedback: Optional[str] = None
    payment_method: Optional[str] = None
    delivery_method: Optional[str] = None
    note: Optional[str] = None

class ContactInfoUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    telephone: Optional[str] = None
    telegram_id: Optional[str] = None
    telegram_id2: Optional[str] = None
    signal_id: Optional[str] = None
    signal_id2: Optional[str] = None
    product_interest: Optional[str] = None
    sales_volume: Optional[str] = None
    ready_for_sample: Optional[bool] = None
    sample_recipient_info: Optional[str] = None
    sample_feedback: Optional[str] = None
    payment_method: Optional[str] = None
    delivery_method: Optional[str] = None
    note: Optional[str] = None

# --- Auto Responder Models ---
# Schema for creating a new keyword-based auto-reply rule
class AutoResponderRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    keywords: List[str] = Field(..., min_items=1)
    response_text: str = Field(..., min_length=1)
    language: str = Field(default='en', max_length=10)
    media_type: Optional[str] = None
    priority: int = 0
    is_active: bool = True

class AutoResponderRuleUpdate(BaseModel):
    name: Optional[str] = None
    keywords: Optional[List[str]] = None
    response_text: Optional[str] = None
    language: Optional[str] = None
    media_type: Optional[str] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None

class AutoResponderRuleResponse(BaseModel):
    id: int
    user_id: int
    name: str
    keywords: List[str]
    response_text: str
    language: str
    media_type: Optional[str]
    media_file_path: Optional[str]
    is_active: bool
    priority: int
    created_at: datetime
    updated_at: datetime

class AutoResponderLogResponse(BaseModel):
    id: int
    rule_id: int
    rule_name: str
    conversation_id: int
    conversation_title: str
    matched_keyword: str
    triggered_at: datetime

class ContactInfoResponse(BaseModel):
    id: int
    conversation_id: int
    name: Optional[str]
    address: Optional[str]
    telephone: Optional[str]
    telegram_id: Optional[str]
    telegram_id2: Optional[str]
    signal_id: Optional[str]
    signal_id2: Optional[str]
    product_interest: Optional[str]
    sales_volume: Optional[str]
    ready_for_sample: bool
    sample_recipient_info: Optional[str]
    sample_feedback: Optional[str]
    payment_method: Optional[str]
    delivery_method: Optional[str]
    note: Optional[str]
    created_at: datetime
    updated_at: datetime

# User Search
class UserSearchResult(BaseModel):
    id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    is_contact: bool = False
    title: Optional[str] = None
    type: str = "user" # "user", "group", "channel"
    photo_url: Optional[str] = None

class ConversationCreate(BaseModel):
    telegram_peer_id: int
    title: Optional[str]
    username: Optional[str]
    type: str = "private"
    is_hidden: bool = False
    is_muted: bool = False
# --- Campaign Models ---
class CampaignStatus(str, Enum):
    draft = "draft"
    running = "running"
    paused = "paused"
    completed = "completed"
    archived = "archived"

class CampaignCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    initial_message: str = Field(..., min_length=1)

class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    initial_message: Optional[str] = None
    status: Optional[CampaignStatus] = None

class CampaignResponse(BaseModel):
    id: int
    user_id: int
    name: str
    initial_message: str
    status: CampaignStatus
    total_leads: int = 0
    completed_leads: int = 0
    is_hibernating: bool = False
    next_reset_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

class CampaignStepCreate(BaseModel):
    step_number: int = Field(..., gt=0)
    wait_time_hours: float = Field(..., ge=0)
    keywords: List[str] = Field(..., min_items=1)
    response_text: str = Field(..., min_length=1)

class CampaignStepUpdate(BaseModel):
    wait_time_hours: Optional[float] = None
    keywords: Optional[List[str]] = None
    response_text: Optional[str] = None

class CampaignStepResponse(BaseModel):
    id: int
    campaign_id: int
    step_number: int
    wait_time_hours: float
    keywords: List[str]
    response_text: str
    created_at: datetime

class LeadStatus(str, Enum):
    pending = "pending"
    contacted = "contacted"
    replied = "replied"
    completed = "completed"
    failed = "failed"

class CampaignLeadResponse(BaseModel):
    id: int
    campaign_id: int
    telegram_identifier: str
    current_step: int
    status: LeadStatus
    failure_reason: Optional[str] = None
    last_contact_at: Optional[datetime]
    assigned_account_id: Optional[int]
    assigned_account_name: Optional[str] = None
    assigned_account_display_name: Optional[str] = None
    created_at: datetime
