/**
 * --- MAIN API SERVICE (USER SIDE) ---
 * 
 * This file centralizes all network requests for the main translator application.
 * It uses Axios with interceptors for authentication and error handling.
 * Categories: Auth, Telegram, Translation, CRM, Automation, Analytics.
 */
import axios from 'axios';
import Cookies from 'js-cookie';
import type { User, TelegramAccount, TelegramChat, TelegramMessage, TranslationResult, Language, MessageTemplate, ScheduledMessage, ContactInfo, AutoResponderRule, AutoResponderLog, Campaign, CampaignStep, CampaignLead, AutoReplyPair } from '../types';

// --- CONFIGURATION & INTERCEPTORS ---
const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// --- INTERCEPTOR: AUTH TOKEN ---
// Automatically injects the JWT auth token from cookies into every request header
api.interceptors.request.use((config) => {
  const token = Cookies.get('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- INTERCEPTOR: ERROR HANDLING ---
// Global response handling for authentication errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If the server returns 401 (Unauthorized) or 403 (Forbidden), 
    // it means the session has expired or is invalid.
    // We redirect to /login EXCEPT if the error happened during the login/register call itself.
    if ((error.response?.status === 401 || error.response?.status === 403) &&
      !error.config.url?.includes('/auth/login') &&
      !error.config.url?.includes('/auth/register')) {
      Cookies.remove('auth_token', { path: '/' });
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// --- AUTHENTICATION SERVICES ---
// Handles user login, registration, and session verification
export const authAPI = {
  login: async (username: string, password: string): Promise<{ access_token: string; token_type: string }> => {
    const response = await api.post('/auth/login', { username, password });
    return response.data;
  },

  register: async (username: string, password: string, email?: string): Promise<{ access_token: string; token_type: string }> => {
    const response = await api.post('/auth/register', { username, password, email });
    return response.data;
  },

  me: async (): Promise<User> => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};

// --- TELEGRAM ACCOUNT MANAGEMENT ---
// Handles TData validation, connecting/disconnecting accounts, profile updates, and privacy settings
export const telegramAPI = {
  validateTData: async (file: File): Promise<{
    valid: boolean;
    account_name: string;
    exists: boolean;
    is_active: boolean;
    current_display_name?: string;
  }> => {
    const formData = new FormData();
    formData.append('tdata', file);
    const response = await api.post('/telegram/accounts/validate-tdata', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  getAccounts: async (): Promise<TelegramAccount[]> => {
    const response = await api.get('/telegram/accounts');
    const items = response.data as any[];
    return (items || []).map((a: any) => ({
      id: a.id,
      displayName: a.display_name ?? undefined,
      accountName: a.account_name,
      isActive: a.is_active,
      sourceLanguage: a.source_language,
      targetLanguage: a.target_language,
      createdAt: a.created_at,
      lastUsed: a.last_used ?? undefined,
      isConnected: a.is_connected === true,
      unreadCount: a.unread_count,
    }));
  },

  addAccount: async (data: FormData): Promise<TelegramAccount> => {
    const response = await api.post('/telegram/accounts', data, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    const a = response.data;
    return {
      id: a.id,
      displayName: a.display_name ?? undefined,
      accountName: a.account_name,
      isActive: a.is_active,
      sourceLanguage: a.source_language,
      targetLanguage: a.target_language,
      createdAt: a.created_at,
      lastUsed: a.last_used ?? undefined,
      isConnected: a.is_connected === true,
      unreadCount: a.unread_count,
    } as TelegramAccount;
  },

  updateAccount: async (
    accountId: number,
    payload: { displayName?: string; sourceLanguage?: string; targetLanguage?: string; isActive?: boolean }
  ): Promise<TelegramAccount> => {
    const response = await api.patch(`/telegram/accounts/${accountId}`, {
      display_name: payload.displayName,
      source_language: payload.sourceLanguage,
      target_language: payload.targetLanguage,
      is_active: payload.isActive,
    });
    const a = response.data;
    return {
      id: a.id,
      displayName: a.display_name ?? undefined,
      accountName: a.account_name,
      isActive: a.is_active,
      sourceLanguage: a.source_language,
      targetLanguage: a.target_language,
      createdAt: a.created_at,
      lastUsed: a.last_used ?? undefined,
      isConnected: a.is_connected === true,
      unreadCount: a.unread_count,
    } as TelegramAccount;
  },

  softDeleteAccount: async (accountId: number): Promise<void> => {
    await api.patch(`/telegram/accounts/${accountId}`, { is_active: false });
  },

  connectAccount: async (accountId: number): Promise<{ connected: boolean }> => {
    const response = await api.post(`/telegram/accounts/${accountId}/connect`);
    return response.data;
  },

  disconnectAccount: async (accountId: number): Promise<{ connected: boolean }> => {
    const response = await api.post(`/telegram/accounts/${accountId}/disconnect`);
    return response.data;
  },

  deleteAccount: async (accountId: number): Promise<void> => {
    await api.delete(`/telegram/accounts/${accountId}`);
  },

  searchUsers: async (accountId: number, username: string) => {
    const response = await api.get(`/telegram/accounts/${accountId}/search-users`, {
      params: { username }
    });
    return response.data;
  },

  createConversation: async (accountId: number, data: {
    telegram_peer_id: number;
    title?: string;
    username?: string;
    type?: string;
    is_hidden?: boolean;
  }) => {
    const response = await api.post(`/telegram/accounts/${accountId}/conversations`, data);
    return response.data;
  },

  unhideConversation: async (conversationId: number) => {
    const response = await api.get(`/telegram/conversations/${conversationId}/unhide`);
    return response.data;
  },

  joinConversation: async (conversationId: number) => {
    const response = await api.post(`/telegram/conversations/${conversationId}/join`);
    return response.data;
  },

  toggleMute: async (conversationId: number) => {
    const response = await api.post(`/telegram/conversations/${conversationId}/toggle_mute`);
    return response.data;
  },

  leaveConversation: async (conversationId: number) => {
    const response = await api.post(`/telegram/conversations/${conversationId}/leave`);
    return response.data;
  },

  deleteConversation: async (conversationId: number) => {
    const response = await api.delete(`/telegram/conversations/${conversationId}`);
    return response.data;
  },

  searchUsersByPhone: async (accountId: number, phone: string) => {
    const response = await api.get(`/telegram/accounts/${accountId}/search-users`, {
      params: { username: phone }
    });
    return response.data;
  },

  getProfile: async (accountId: number) => {
    const response = await api.get(`/telegram/accounts/${accountId}/profile`, { timeout: 30000 });
    return response.data;
  },

  updateProfile: async (accountId: number, data: { first_name?: string; last_name?: string; bio?: string }) => {
    const response = await api.patch(`/telegram/accounts/${accountId}/profile`, data, { timeout: 30000 });
    return response.data;
  },

  uploadProfilePhoto: async (accountId: number, file: File) => {
    const formData = new FormData();
    formData.append('photo', file);
    const response = await api.post(`/telegram/accounts/${accountId}/profile/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000, // Photos can take a while to upload
    });
    return response.data;
  },

  setPhonePrivacy: async (accountId: number, visibility: 'everybody' | 'contacts' | 'nobody') => {
    const response = await api.patch(`/telegram/accounts/${accountId}/profile/privacy`, { visibility }, { timeout: 30000 });
    return response.data;
  },

  getSessions: async (accountId: number) => {
    const response = await api.get(`/telegram/accounts/${accountId}/sessions`);
    return response.data;
  },

  logoutAccount: async (accountId: number) => {
    const response = await api.post(`/telegram/accounts/${accountId}/logout`);
    return response.data;
  },

  terminateSession: async (accountId: number, sessionHash: string) => {
    const response = await api.delete(`/telegram/accounts/${accountId}/sessions/${sessionHash}`);
    return response.data;
  },

  terminateAllSessions: async (accountId: number) => {
    const response = await api.delete(`/telegram/accounts/${accountId}/sessions/terminate_all`);
    return response.data;
  },

  change2FA: async (accountId: number, currentPassword: string, newPassword: string) => {
    const response = await api.post(`/telegram/accounts/${accountId}/2fa`, {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return response.data;
  },

  getPeerPhoto: async (accountId: number, peerId: number) => {
    const response = await api.get(`/telegram/accounts/${accountId}/peers/${peerId}/photo`);
    return response.data;
  },
};

// --- TRANSLATION SERVICES ---
// Interfaces with Google Translate/DeepL/LibreTranslate on the backend
export const translationAPI = {
  // Translates text from source to target using the specified engine
  translate: async (
    text: string,
    targetLanguage: string,
    sourceLanguage?: string,
    engine?: string
  ): Promise<TranslationResult> => {
    const response = await api.post('/translation/translate', {
      text,
      targetLanguage,
      sourceLanguage,
      engine,
    });
    return response.data;
  },

  // Returns a list of available translation engine names
  getEngines: async (): Promise<{ engines: string[] }> => {
    const response = await api.get('/translation/engines');
    return response.data;
  },

  // Returns all supported languages for translation
  getLanguages: async (): Promise<{ languages: Language[] }> => {
    const response = await api.get('/translation/languages');
    return response.data;
  },
};

// --- CONVERSATION SERVICES ---
// Manages the chat/conversation metadata for connected Telegram accounts
export const conversationsAPI = {
  // Fetches all active conversations for a specific Telegram account
  getConversations: async (accountId: number): Promise<TelegramChat[]> => {
    const response = await api.get(`/telegram/accounts/${accountId}/conversations`);
    const items = response.data as any[];
    return (items || []).map((c: any) => ({
      id: c.id,
      telegram_peer_id: c.telegram_peer_id,
      title: c.title,
      username: c.username,
      type: c.type,
      is_muted: c.is_muted || false,
      is_hidden: c.is_hidden || false,
      lastMessage: c.last_message ? {
        ...c.last_message,
        sender_user_id: c.last_message.sender_user_id,
      } : undefined,
      unreadCount: c.unread_count,
    }));
  },
};

// Messages API
export const messagesAPI = {
  getMessages: async (conversationId: number, limit: number = 30, before_id?: number) => {
    const response = await api.get(`/messages/conversations/${conversationId}/messages`, {
      params: { limit, ...(before_id ? { before_id } : {}) }
    });
    return response.data;
  },

  sendMessage: async (conversationId: number, text: string, translate: boolean = true, reply_to_message_id?: number) => {
    const response = await api.post('/messages/send', {
      conversation_id: conversationId,
      text,
      translate,
      reply_to_message_id
    });
    return response.data;
  },

  sendMedia: async (formData: FormData): Promise<TelegramMessage> => {
    const response = await api.post('/messages/send-media', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  forwardMessages: async (sourceConversationId: number, targetConversationId: number, messageIds: number[]): Promise<{ forwarded: number }> => {
    const formData = new FormData();
    formData.append('source_conversation_id', String(sourceConversationId));
    formData.append('target_conversation_id', String(targetConversationId));
    formData.append('message_ids', messageIds.join(','));
    const response = await api.post('/messages/forward', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    });
    return response.data;
  },

  reactToMessage: async (messageId: number, emoji: string) => {
    const response = await api.post(`/messages/${messageId}/react`, { emoji });
    return response.data;
  },

  deleteMessages: async (conversationId: number, messageIds: number[], revoke: boolean = true) => {
    const response = await api.delete('/messages/delete', {
      params: { conversation_id: conversationId, message_ids: messageIds, revoke }
    });
    return response.data;
  },

  translateText: async (text: string, targetLanguage: string, sourceLanguage: string = 'auto') => {
    const response = await api.post('/messages/translate', null, {
      params: { text, target_language: targetLanguage, source_language: sourceLanguage }
    });
    return response.data;
  },

  markAsRead: async (conversationId: number) => {
    const response = await api.post(`/messages/conversations/${conversationId}/read`);
    return response.data;
  },
};

// --- HEALTH & STATUS SERVICES ---
// Used to verify if the backend and database are reachable
export const healthAPI = {
  check: async (): Promise<{ status: string; database: string }> => {
    const response = await api.get('/health');
    return response.data;
  },
};

// --- MESSAGE TEMPLATE SERVICES ---
// Handles CRUD operations for quick-reply templates
export const templatesAPI = {
  // Get all templates owned by the current user
  getTemplates: async (): Promise<MessageTemplate[]> => {
    const response = await api.get('/templates');
    return response.data;
  },

  // Get a single template's details
  getTemplate: async (templateId: number): Promise<MessageTemplate> => {
    const response = await api.get(`/templates/${templateId}`);
    return response.data;
  },

  // Create a new reusable message template
  createTemplate: async (name: string, content: string): Promise<MessageTemplate> => {
    const response = await api.post('/templates', { name, content });
    return response.data;
  },

  // Update an existing template's name or content
  updateTemplate: async (templateId: number, data: { name?: string; content?: string }): Promise<MessageTemplate> => {
    const response = await api.put(`/templates/${templateId}`, data);
    return response.data;
  },

  // Delete a template permanently
  deleteTemplate: async (templateId: number): Promise<void> => {
    await api.delete(`/templates/${templateId}`);
  },
};

// --- SCHEDULED MESSAGE SERVICES ---
// Manages messages set to be sent automatically after a delay
export const scheduledMessagesAPI = {
  // Get all active scheduled tasks for the user
  getScheduledMessages: async (): Promise<ScheduledMessage[]> => {
    const response = await api.get('/scheduled-messages');
    return response.data;
  },

  // Get scheduled tasks specifically for one conversation
  getScheduledMessagesByConversation: async (conversationId: number): Promise<ScheduledMessage[]> => {
    const response = await api.get(`/scheduled-messages/conversation/${conversationId}`);
    return response.data;
  },

  // Create a new scheduling task with a delay in days
  createScheduledMessage: async (conversationId: number, messageText: string, daysDelay: number): Promise<ScheduledMessage> => {
    const response = await api.post('/scheduled-messages', {
      conversation_id: conversationId,
      message_text: messageText,
      days_delay: daysDelay,
    });
    return response.data;
  },

  // Update text or delay of a pending scheduled message
  updateScheduledMessage: async (messageId: number, data: { message_text?: string; days_delay?: number }): Promise<ScheduledMessage> => {
    const response = await api.put(`/scheduled-messages/${messageId}`, data);
    return response.data;
  },

  // Cancel and delete a scheduled message task
  cancelScheduledMessage: async (messageId: number): Promise<void> => {
    await api.delete(`/scheduled-messages/${messageId}`);
  },
};

// --- CONTACT CRM SERVICES ---
// Manages detailed lead/contact information linked to conversations
export const contactsAPI = {
  // Fetch profile/leadsheet for a specific conversation
  getContactInfo: async (conversationId: number): Promise<ContactInfo | null> => {
    const response = await api.get(`/contacts/conversation/${conversationId}`);
    return response.data;
  },

  // Initialize a new contact info record
  createContactInfo: async (data: Partial<ContactInfo>): Promise<ContactInfo> => {
    const response = await api.post('/contacts', data);
    return response.data;
  },

  // Update existing contact details (Address, Note, Payment Method, etc.)
  updateContactInfo: async (contactId: number, data: Partial<ContactInfo>): Promise<ContactInfo> => {
    const response = await api.put(`/contacts/${contactId}`, data);
    return response.data;
  },

  // Remove a contact record
  deleteContactInfo: async (contactId: number): Promise<void> => {
    await api.delete(`/contacts/${contactId}`);
  },
};

// --- AUTO-RESPONDER SERVICES ---
// Manages keyword-based automated replies
export const autoResponderAPI = {
  // List all rules defined by the user
  getRules: async (): Promise<AutoResponderRule[]> => {
    const response = await api.get('/auto-responder/rules');
    return response.data;
  },

  // Create a new automation rule with keywords and response text
  createRule: async (data: {
    name: string;
    keywords: string[];
    response_text: string;
    language: string;
    media_type?: string;
    priority?: number;
    is_active?: boolean;
  }): Promise<AutoResponderRule> => {
    const response = await api.post('/auto-responder/rules', data);
    return response.data;
  },

  // Modify an existing automation rule
  updateRule: async (ruleId: number, data: {
    name?: string;
    keywords?: string[];
    response_text?: string;
    language?: string;
    media_type?: string;
    priority?: number;
    is_active?: boolean;
  }): Promise<AutoResponderRule> => {
    const response = await api.patch(`/auto-responder/rules/${ruleId}`, data);
    return response.data;
  },

  // Permanently delete a rule
  deleteRule: async (ruleId: number): Promise<void> => {
    await api.delete(`/auto-responder/rules/${ruleId}`);
  },

  // Attach a photo or video to an auto-responder rule
  uploadMedia: async (ruleId: number, file: File): Promise<{ message: string; media_type: string; file_path: string }> => {
    const formData = new FormData();
    formData.append('media', file);
    const response = await api.post(`/auto-responder/rules/${ruleId}/upload-media`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Detach media from a rule
  deleteMedia: async (ruleId: number): Promise<void> => {
    await api.delete(`/auto-responder/rules/${ruleId}/media`);
  },

  // Fetch history/logs of when rules were triggered
  getLogs: async (limit: number = 50): Promise<AutoResponderLog[]> => {
    const response = await api.get(`/auto-responder/logs?limit=${limit}`);
    return response.data;
  },
};

// Analytics API
export const analyticsAPI = {
  getConversationRanking: async (limit: number = 10, accountId?: number) => {
    const response = await api.get('/analytics/ranking/conversations', {
      params: { limit, account_id: accountId }
    });
    return response.data;
  },
  getAccountRanking: async (limit: number = 10) => {
    const response = await api.get('/analytics/ranking/accounts', { params: { limit } });
    return response.data;
  },
  getAdminAccountRanking: async (limit: number = 20) => {
    const response = await api.get('/analytics/admin/ranking/accounts', { params: { limit } });
    return response.data;
  }
};

// --- CAMPAIGN SERVICES ---
// Manages automated lead outreach and multi-step campaigns
export const campaignsAPI = {
  // Get all campaigns for the current user
  getCampaigns: async (): Promise<Campaign[]> => {
    const response = await api.get('/campaigns');
    return response.data;
  },

  // Get a single campaign with its basic stats
  getCampaign: async (campaignId: number): Promise<Campaign> => {
    const response = await api.get(`/campaigns/${campaignId}`);
    return response.data;
  },

  // Fetch in-depth analytics for a single campaign
  getCampaignAnalytics: async (campaignId: number): Promise<any> => {
    const response = await api.get(`/campaigns/${campaignId}/analytics`);
    return response.data;
  },

  // Get a lead's campaign history
  getLeadCampaignHistory: async (campaignId: number, leadId: number): Promise<any> => {
    const response = await api.get(`/campaigns/${campaignId}/leads/${leadId}/history`);
    return response.data;
  },

  // Create a new campaign with a name and opening message
  createCampaign: async (data: { 
    name: string; 
    initial_message: string; 
    negative_keywords?: string[];
    kill_switch_enabled?: boolean;
    auto_replies?: AutoReplyPair[];
  }): Promise<Campaign> => {
    const response = await api.post('/campaigns', data);
    return response.data;
  },

  // Update a campaign and its steps fully
  updateCampaignFull: async (campaignId: number, data: {
    name: string;
    initial_message: string;
    negative_keywords: string[];
    kill_switch_enabled: boolean;
    auto_replies?: AutoReplyPair[];
    steps: {
      step_number: number;
      wait_time_hours: number;
      keywords: string[];
      response_text: string;
      keyword_response_text?: string;
      next_step?: number;
      auto_replies?: AutoReplyPair[];
    }[];
  }): Promise<{ success: boolean; message: string }> => {
    const response = await api.put(`/campaigns/${campaignId}`, data);
    return response.data;
  },

  // Upload a lead CSV file to a specific campaign
  uploadLeads: async (campaignId: number, file: File): Promise<{ message: string; total_leads: number }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/campaigns/${campaignId}/upload-leads`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Add an automated sequence step to a campaign
  addStep: async (campaignId: number, data: {
    step_number: number;
    wait_time_hours: number;
    keywords: string[];
    response_text: string;
    keyword_response_text?: string;
    next_step?: number;
    auto_replies?: AutoReplyPair[];
  }): Promise<CampaignStep> => {
    const response = await api.post(`/campaigns/${campaignId}/steps`, data);
    return response.data;
  },

  // Alias for addStep used in CreateCampaignModal
  createStep: async (campaignId: number, data: {
    step_number: number;
    wait_time_hours: number;
    keywords: string[];
    response_text: string;
    keyword_response_text?: string;
    next_step?: number;
    auto_replies?: AutoReplyPair[];
  }): Promise<CampaignStep> => {
    const response = await api.post(`/campaigns/${campaignId}/steps`, data);
    return response.data;
  },

  // Fetch all configured steps for a campaign
  getSteps: async (campaignId: number): Promise<CampaignStep[]> => {
    const response = await api.get(`/campaigns/${campaignId}/steps`);
    return response.data;
  },

  // Fetch all leads for a campaign, including their assignment status
  getLeads: async (campaign_id: number): Promise<CampaignLead[]> => {
    const response = await api.get(`/campaigns/${campaign_id}/leads`);
    return response.data;
  },

  // Delete an entire campaign and all its associations
  deleteCampaign: async (campaignId: number): Promise<void> => {
    await api.delete(`/campaigns/${campaignId}`);
  },

  // Pause a campaign
  pauseCampaign: async (campaignId: number): Promise<void> => {
    await api.post(`/campaigns/${campaignId}/pause`);
  },

  // Resume a paused campaign (does not reset leads)
  resumeCampaign: async (campaignId: number): Promise<void> => {
    await api.post(`/campaigns/${campaignId}/resume`);
  },

  // Restart a campaign from scratch (resets ALL leads to pending + step 0)
  restartCampaign: async (campaignId: number): Promise<void> => {
    await api.post(`/campaigns/${campaignId}/restart`);
  },

  // Get daily outreach safety stats for an account
  getSafetyStats: async (accountId: number): Promise<{ new_conversations_today: number; limit: number; remaining: number }> => {
    const response = await api.get(`/campaigns/safety-stats/${accountId}`);
    return response.data;
  },
};