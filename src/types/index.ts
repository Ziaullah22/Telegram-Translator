/**
 * --- TS TYPE DEFINITIONS (PROJECT-WIDE) ---
 * 
 * Central registry for all data schemas used in the Frontend & Admin.
 */
export interface User {
  id: number;
  username: string;
  email?: string;
  createdAt: string;
  impersonated_by?: string;
}

export interface TelegramAccount {
  id: number;
  displayName?: string;
  accountName: string;
  isActive: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  isTranslationEnabled: boolean;
  notificationsEnabled: boolean;
  createdAt: string;
  lastUsed?: string;
  isConnected: boolean;
  unreadCount?: number;
  unreadTotal?: number;
}

export interface TelegramMessage {
  id: number;
  conversation_id: number;
  telegram_message_id: number;
  sender_user_id?: number;
  sender_name?: string;
  sender_username?: string;
  peer_title: string;
  type: 'text' | 'photo' | 'video' | 'voice' | 'document' | 'system' | 'auto_reply' | 'sticker' | 'animation' | 'location' | 'contact' | 'poll' | 'game' | 'venue' | 'invoice' | 'giveaway' | 'giveaway_winners' | 'story' | 'unsupported';
  original_text: string;
  translated_text?: string;
  source_language?: string;
  target_language?: string;
  created_at: string;
  is_outgoing: boolean;
  reply_to_telegram_id?: number;
  reply_to_text?: string;
  reply_to_sender?: string;
  has_media?: boolean;
  media_file_name?: string;
  media_thumbnail?: string;
  media_duration?: number;
  reactions?: Record<string, number>;
}

export interface TelegramChat {
  id: number;
  telegram_peer_id?: number;
  title?: string;
  username?: string;
  type: 'private' | 'group' | 'supergroup' | 'channel' | 'secret';
  participantCount?: number;
  lastMessage?: TelegramMessage;
  unreadCount?: number;
  is_hidden?: boolean;
  is_muted?: boolean;
  photo_url?: string;
}

export interface TranslationResult {
  translatedText: string;
  detectedLanguage?: string;
  confidence?: number;
}

export interface Language {
  code: string;
  name: string;
  isSource: boolean;
  isTarget: boolean;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AppState {
  currentAccount: TelegramAccount | null;
  accounts: TelegramAccount[];
  currentChat: TelegramChat | null;
  chats: TelegramChat[];
  messages: TelegramMessage[];
  isConnected: boolean;
}

export interface MessageTemplate {
  id: number;
  user_id: number;
  name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduledMessage {
  id: number;
  conversation_id: number;
  message_text: string;
  scheduled_at: string;
  created_at: string;
  is_sent: boolean;
  is_cancelled: boolean;
  sent_at?: string;
  cancelled_at?: string;
}

export interface ContactInfo {
  id: number;
  conversation_id: number;
  name?: string;
  address?: string;
  telephone?: string;
  telegram_id?: string;
  telegram_id2?: string;
  signal_id?: string;
  signal_id2?: string;
  product_interest?: string;
  sales_volume?: string;
  ready_for_sample: boolean;
  sample_recipient_info?: string;
  sample_feedback?: string;
  payment_method?: string;
  delivery_method?: string;
  note?: string;
  tags?: string[];
  pipeline_stage?: string;
  created_at: string;
  updated_at: string;
}

export interface TelegramUserSearchResult {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  is_contact: boolean;
  title?: string;
  type: 'user' | 'group' | 'supergroup' | 'channel';
  photo_url?: string;
}

export interface AutoResponderRule {
  id: number;
  user_id: number;
  name: string;
  keywords: string[];
  response_text: string;
  language: string;
  media_type?: string;
  media_file_path?: string;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface AutoResponderLog {
  id: number;
  rule_id: number;
  rule_name: string;
  conversation_id: number;
  conversation_title: string;
  matched_keyword: string;
  triggered_at: string;
}

export interface AutoReplyPair {
  keywords: string[];
  reply: string;
  next_step?: number | null;
}

export interface Campaign {
  id: number;
  user_id: number;
  name: string;
  initial_message: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'archived';
  is_hibernating?: boolean;
  next_reset_at?: string;
  total_leads: number;
  completed_leads: number;
  replied_leads?: number;
  negative_keywords?: string[];
  kill_switch_enabled?: boolean;
  auto_replies?: AutoReplyPair[];
  created_at: string;
  updated_at: string;
}

export interface CampaignStep {
  id: number;
  campaign_id: number;
  step_number: number;
  wait_time_hours: number;
  keywords: string[];
  response_text: string;
  keyword_response_text?: string;
  next_step?: number;
  auto_replies?: AutoReplyPair[];
  created_at: string;
}

export interface Product {
  id: number;
  user_id: number;
  name: string;
  description?: string;
  price: number;
  stock_quantity: number;
  keywords: string[];
  delivery_mode: string;
  upsell_product_id?: number;
  photo_url?: string;
  photo_urls: string[];
  created_at: string;
  updated_at: string;
}

export interface CampaignLead {
  id: number;
  campaign_id: number;
  telegram_identifier: string;
  current_step: number;
  status: 'pending' | 'contacted' | 'replied' | 'completed' | 'failed';
  failure_reason?: string;
  last_contact_at?: string;
  assigned_account_id?: number;
  telegram_id?: number;
  assigned_account_name?: string;
  assigned_account_display_name?: string;
  created_at: string;
}

export interface Order {
  id: number;
  po_number: string;
  product_id?: number;
  product_name: string;
  photo_urls?: string[];
  product_description?: string;
  telegram_account_id?: number;
  telegram_peer_id: number;
  customer_name?: string;
  customer_username?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
  delivery_method?: string;
  delivery_address?: string;
  delivery_time_slot?: string;
  delivery_instructions?: string;
  payment_screenshot_path?: string;
  proof_history?: string[];
  disapproval_reason?: string;
  reminder_count?: number;
  last_reminder_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface SalesSettings {
  payment_details: string;
  payment_reminder_message?: string;
  payment_reminder_interval_days?: number;
  payment_reminder_interval_hours?: number;
  payment_reminder_interval_minutes?: number;
  payment_reminder_count?: number;
  disapproved_reminder_message?: string;
  disapproved_reminder_interval_days?: number;
  disapproved_reminder_interval_hours?: number;
  disapproved_reminder_interval_minutes?: number;
  disapproved_reminder_count?: number;
  status_messages?: Record<string, string>;
  system_labels?: Record<string, string>;
  system_prompts?: Record<string, string>;
  protected_words?: string[];
  ignored_languages?: string[];
  language_expert_packs?: Record<string, Record<string, string>>;
}

export interface InstagramWarmingAccount {
  id: number;
  user_id: number;
  username: string;
  status: 'active' | 'banned' | 'error' | 'pending';
  proxy_id?: number;
  proxy_host?: string;
  warming_session_count?: number;
  daily_usage_count?: number;
  frozen_until?: string | Date;
  last_usage_reset?: string | Date;
  last_used?: string;
  is_active?: boolean;
  is_paused?: boolean;
  created_at: string;
}

export interface InstagramWarmingProxy {
  id: number;
  user_id: number;
  host: string;
  port: number;
  username?: string;
  proxy_type: string;
  is_working: boolean;
  created_at: string;
}

export interface InstagramWarmingLead {
  id: number;
  user_id: number;
  instagram_username: string;
  full_name?: string;
  profile_pic_url?: string;
  bio?: string;
  follower_count?: number;
  following_count?: number;
  is_private: boolean;
  status: 'discovered' | 'qualified' | 'rejected' | 'harvested' | 'failed' | 'warming' | 'warmed' | 'queued' | 'private';
  discovery_keyword?: string;
  source?: string;
  recent_posts?: any[];
  created_at: string;
  updated_at: string;
}

export interface InstagramWarmingSettings {
  bio_keywords: string;
  min_followers: number;
  max_followers: number;
}