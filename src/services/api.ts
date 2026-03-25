/**
 * --- TS API SERVICE LAYER ---
 * 
 * Main interface for Backend communication.
 * All functions return typed Promises for consistent data flow.
 */
import axios from 'axios';
import { 
  User, AuthState, TelegramAccount, TelegramChat, TelegramMessage, 
  MessageTemplate, ScheduledMessage, ContactInfo, Language,
  AutoResponderRule, AutoResponderLog, Campaign, CampaignStep,
  CampaignLead, Product, Order, SalesSettings
} from '../types';

const API_BASE_URL = 'http://localhost:8000'; // Update based on environment if needed

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Interceptor to add Auth Token to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- AUTH SERVICES ---
export const authAPI = {
  login: async (credentials: any): Promise<{ access_token: string; token_type: string }> => {
    const response = await api.post('/api/auth/login', credentials);
    return response.data;
  },
  
  register: async (data: any): Promise<User> => {
    const response = await api.post('/api/auth/register', data);
    return response.data;
  },

  getMe: async (): Promise<User> => {
    const response = await api.get('/api/auth/me');
    return response.data;
  },
};

// --- TELEGRAM SERVICES ---
export const telegramAPI = {
  getAccounts: async (): Promise<TelegramAccount[]> => {
    const response = await api.get('/api/telegram/accounts');
    return response.data.map((acc: any) => ({
      ...acc,
      id: acc.id,
      displayName: acc.display_name,
      accountName: acc.account_name,
      isActive: acc.is_active,
      sourceLanguage: acc.source_language,
      targetLanguage: acc.target_language,
      isTranslationEnabled: acc.translation_enabled,
      createdAt: acc.created_at,
      lastUsed: acc.last_used,
      isConnected: acc.is_connected,
      unreadCount: acc.unread_count || 0,
      unreadTotal: acc.unread_total || 0,
    } as TelegramAccount));
  },

  getAccount: async (accountId: number): Promise<TelegramAccount> => {
    const response = await api.get(`/api/telegram/accounts/${accountId}`);
    const acc = response.data;
    return {
      ...acc,
      id: acc.id,
      displayName: acc.display_name,
      accountName: acc.account_name,
      isActive: acc.is_active,
      sourceLanguage: acc.source_language,
      targetLanguage: acc.target_language,
      isTranslationEnabled: acc.translation_enabled,
      createdAt: acc.created_at,
      lastUsed: acc.last_used,
      isConnected: acc.is_connected,
      unreadCount: acc.unread_count || 0,
      unreadTotal: acc.unread_total || 0,
    } as TelegramAccount;
  },

  addAccount: async (data: any): Promise<TelegramAccount> => {
    const response = await api.post('/api/telegram/accounts', data);
    const acc = response.data;
    return {
      ...acc,
      id: acc.id,
      displayName: acc.display_name,
      accountName: acc.account_name,
      isActive: acc.is_active,
      sourceLanguage: acc.source_language,
      targetLanguage: acc.target_language,
      isTranslationEnabled: acc.translation_enabled,
      createdAt: acc.created_at,
      lastUsed: acc.last_used,
      isConnected: acc.is_connected,
      unreadCount: acc.unread_count || 0,
      unreadTotal: acc.unread_total || 0,
    } as TelegramAccount;
  },

  updateAccount: async (accountId: number, data: any): Promise<TelegramAccount> => {
    const response = await api.patch(`/api/telegram/accounts/${accountId}`, data);
    const acc = response.data;
    return {
      ...acc,
      id: acc.id,
      displayName: acc.display_name,
      accountName: acc.account_name,
      isActive: acc.is_active,
      sourceLanguage: acc.source_language,
      targetLanguage: acc.target_language,
      isTranslationEnabled: acc.translation_enabled,
      createdAt: acc.created_at,
      lastUsed: acc.last_used,
      isConnected: acc.is_connected,
      unreadCount: acc.unread_count || 0,
      unreadTotal: acc.unread_total || 0,
    } as TelegramAccount;
  },

  softDeleteAccount: async (accountId: number): Promise<void> => {
    await api.patch(`/api/telegram/accounts/${accountId}`, { is_active: false });
  },

  connectAccount: async (accountId: number): Promise<{ connected: boolean }> => {
    const response = await api.post(`/api/telegram/accounts/${accountId}/connect`);
    return response.data;
  },

  disconnectAccount: async (accountId: number): Promise<{ connected: boolean }> => {
    const response = await api.post(`/api/telegram/accounts/${accountId}/disconnect`);
    return response.data;
  },

  deleteAccount: async (accountId: number): Promise<void> => {
    await api.delete(`/api/telegram/accounts/${accountId}`);
  },

  searchUsers: async (accountId: number, username: string) => {
    const response = await api.get(`/api/telegram/accounts/${accountId}/search-users`, {
      params: { username }
    });
    return response.data;
  },

  getPeerProfile: async (accountId: number, peerId: number): Promise<{ phone: string, bio: string }> => {
    const response = await api.get(`/api/telegram/accounts/${accountId}/peers/${peerId}/profile`);
    return response.data;
  },

  createConversation: async (accountId: number, data: {
    telegram_peer_id: number;
    title?: string;
    username?: string;
    type?: string;
    is_hidden?: boolean;
  }) => {
    const response = await api.post(`/api/telegram/accounts/${accountId}/conversations`, data);
    return response.data;
  },

  unhideConversation: async (conversationId: number) => {
    const response = await api.get(`/api/telegram/conversations/${conversationId}/unhide`);
    return response.data;
  },

  joinConversation: async (conversationId: number) => {
    const response = await api.post(`/api/telegram/conversations/${conversationId}/join`);
    return response.data;
  },

  toggleMute: async (conversationId: number) => {
    const response = await api.post(`/api/telegram/conversations/${conversationId}/toggle_mute`);
    return response.data;
  },

  leaveConversation: async (conversationId: number) => {
    const response = await api.post(`/api/telegram/conversations/${conversationId}/leave`);
    return response.data;
  },

  deleteConversation: async (conversationId: number) => {
    const response = await api.delete(`/api/telegram/conversations/${conversationId}`);
    return response.data;
  },

  searchUsersByPhone: async (accountId: number, phone: string) => {
    const response = await api.get(`/api/telegram/accounts/${accountId}/search-users`, {
      params: { username: phone }
    });
    return response.data;
  },

  getProfile: async (accountId: number) => {
    const response = await api.get(`/api/telegram/accounts/${accountId}/profile`, { timeout: 30000 });
    return response.data;
  },

  updateProfile: async (accountId: number, data: { first_name?: string; last_name?: string; bio?: string }) => {
    const response = await api.patch(`/api/telegram/accounts/${accountId}/profile`, data, { timeout: 30000 });
    return response.data;
  },

  uploadProfilePhoto: async (accountId: number, file: File) => {
    const formData = new FormData();
    formData.append('photo', file);
    const response = await api.post(`/api/telegram/accounts/${accountId}/profile/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000, // Photos can take a while to upload
    });
    return response.data;
  },

  setPhonePrivacy: async (accountId: number, visibility: 'everybody' | 'contacts' | 'nobody') => {
    const response = await api.patch(`/api/telegram/accounts/${accountId}/profile/privacy`, { visibility }, { timeout: 30000 });
    return response.data;
  },

  getConversations: async (accountId: number): Promise<TelegramChat[]> => {
    const response = await api.get(`/api/telegram/accounts/${accountId}/conversations`);
    return response.data;
  },

  getMessages: async (conversationId: number): Promise<TelegramMessage[]> => {
    const response = await api.get(`/api/telegram/conversations/${conversationId}/messages`);
    return response.data;
  },

  sendMessage: async (data: { conversation_id: number; text: string; translate?: boolean; reply_to_message_id?: number }) => {
    const response = await api.post('/api/telegram/messages/send', data);
    return response.data;
  },

  markAsRead: async (conversationId: number) => {
    const response = await api.post(`/api/telegram/conversations/${conversationId}/read`);
    return response.data;
  },
};

// --- CRM & PRODUCTIVITY SERVICES ---
export const templatesAPI = {
  getTemplates: async (): Promise<MessageTemplate[]> => {
    const response = await api.get('/api/templates/');
    return response.data;
  },

  createTemplate: async (data: any): Promise<MessageTemplate> => {
    const response = await api.post('/api/templates/', data);
    return response.data;
  },

  updateTemplate: async (templateId: number, data: any): Promise<MessageTemplate> => {
    const response = await api.put(`/api/templates/${templateId}`, data);
    return response.data;
  },

  deleteTemplate: async (templateId: number): Promise<void> => {
    await api.delete(`/api/templates/${templateId}`);
  },
};

export const scheduledAPI = {
  getMessages: async (): Promise<ScheduledMessage[]> => {
    const response = await api.get('/api/scheduled/');
    return response.data;
  },

  scheduleMessage: async (data: any): Promise<ScheduledMessage> => {
    const response = await api.post('/api/scheduled/', data);
    return response.data;
  },

  updateScheduled: async (messageId: number, data: any): Promise<ScheduledMessage> => {
    const response = await api.patch(`/api/scheduled/${messageId}`, data);
    return response.data;
  },

  cancelScheduled: async (messageId: number): Promise<void> => {
    await api.post(`/api/scheduled/${messageId}/cancel`);
  },
};

export const contactsAPI = {
  getContacts: async (): Promise<ContactInfo[]> => {
    const response = await api.get('/api/contacts/');
    return response.data;
  },

  getByConversation: async (conversationId: number): Promise<ContactInfo | null> => {
    const response = await api.get(`/api/contacts/conversation/${conversationId}`);
    return response.data;
  },

  createContact: async (data: any): Promise<ContactInfo> => {
    const response = await api.post('/api/contacts/', data);
    return response.data;
  },

  updateContact: async (contactId: number, data: any): Promise<ContactInfo> => {
    const response = await api.patch(`/api/contacts/${contactId}`, data);
    return response.data;
  },
};

// --- TRANSLATION SERVICES ---
export const translationAPI = {
  getLanguages: async (): Promise<Language[]> => {
    const response = await api.get('/api/translation/languages');
    return response.data;
  },

  translate: async (data: { text: string; target_language: string; source_language: string }) => {
    const response = await api.post('/api/translation/translate', data);
    return response.data;
  },
};

// --- AUTO-RESPONDER SERVICES ---
export const responderAPI = {
  getRules: async (): Promise<AutoResponderRule[]> => {
    const response = await api.get('/api/auto-responder/rules');
    return response.data;
  },

  createRule: async (data: any): Promise<AutoResponderRule> => {
    const response = await api.post('/api/auto-responder/rules', data);
    return response.data;
  },

  updateRule: async (ruleId: number, data: any): Promise<AutoResponderRule> => {
    const response = await api.patch(`/api/auto-responder/rules/${ruleId}`, data);
    return response.data;
  },

  deleteRule: async (ruleId: number): Promise<void> => {
    await api.delete(`/api/auto-responder/rules/${ruleId}`);
  },

  getLogs: async (): Promise<AutoResponderLog[]> => {
    const response = await api.get('/api/auto-responder/logs');
    return response.data;
  },
};

// --- CAMPAIGN SERVICES ---
export const campaignAPI = {
  getCampaigns: async (): Promise<Campaign[]> => {
    const response = await api.get('/api/campaigns/');
    return response.data;
  },

  getCampaign: async (campaignId: number): Promise<Campaign & { steps: CampaignStep[] }> => {
    const response = await api.get(`/api/campaigns/${campaignId}`);
    return response.data;
  },

  createCampaign: async (data: any): Promise<Campaign> => {
    const response = await api.post('/api/campaigns/', data);
    return response.data;
  },

  updateCampaign: async (campaignId: number, data: any): Promise<Campaign> => {
    const response = await api.patch(`/api/campaigns/${campaignId}`, data);
    return response.data;
  },

  fullUpdateCampaign: async (campaignId: number, data: any): Promise<Campaign> => {
    const response = await api.put(`/api/campaigns/${campaignId}`, data);
    return response.data;
  },

  deleteCampaign: async (campaignId: number): Promise<void> => {
    await api.delete(`/api/campaigns/${campaignId}`);
  },

  getLeads: async (campaignId: number): Promise<CampaignLead[]> => {
    const response = await api.get(`/api/campaigns/${campaignId}/leads`);
    return response.data;
  },

  addLeads: async (campaignId: number, data: { leads: string[] }): Promise<{ added: number }> => {
    const response = await api.post(`/api/campaigns/${campaignId}/leads`, data);
    return response.data;
  },

  removeLead: async (campaignId: number, leadId: number): Promise<void> => {
    await api.delete(`/api/campaigns/${campaignId}/leads/${leadId}`);
  },

  startCampaign: async (campaignId: number): Promise<void> => {
    await api.post(`/api/campaigns/${campaignId}/start`);
  },

  pauseCampaign: async (campaignId: number): Promise<void> => {
    await api.post(`/api/campaigns/${campaignId}/pause`);
  },

  resetCampaignLeads: async (campaignId: number): Promise<void> => {
    await api.post(`/api/campaigns/${campaignId}/leads/reset`);
  },

  getSafetyStats: async (accountId: number): Promise<{ new_conversations_today: number; limit: number; remaining: number }> => {
    const response = await api.get(`/api/campaigns/safety-stats/${accountId}`);
    return response.data;
  },
};

// --- PRODUCT CATALOG & INVENTORY SERVICES ---
export const productsAPI = {
  getProducts: async (): Promise<Product[]> => {
    const response = await api.get('/api/products/');
    return response.data;
  },

  createProduct: async (formData: FormData): Promise<Product> => {
    const response = await api.post('/api/products/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  updateProduct: async (productId: number, formData: FormData): Promise<Product> => {
    const response = await api.put(`/api/products/${productId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  deleteProduct: async (productId: number): Promise<void> => {
    await api.delete(`/api/products/${productId}`);
  },
};

// --- SALES & ORDERS SERVICES ---
export const salesAPI = {
  getOrders: async (): Promise<Order[]> => {
    const response = await api.get('/api/sales/orders');
    return response.data;
  },

  getSettings: async (): Promise<SalesSettings> => {
    const response = await api.get('/api/sales/settings');
    return response.data;
  },

  updateSettings: async (settings: SalesSettings): Promise<void> => {
    await api.post('/api/sales/settings', settings);
  },

  updateOrderStatus: async (orderId: number, status: string): Promise<void> => {
    await api.patch(`/api/sales/orders/${orderId}/status`, { status });
  },
};
