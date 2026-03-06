import axios from 'axios';
import Cookies from 'js-cookie';
import type { User, TelegramAccount, TelegramChat, TelegramMessage, TranslationResult, Language, MessageTemplate, ScheduledMessage, ContactInfo, AutoResponderRule, AutoResponderLog } from '../types';

const API_BASE_URL = '/api';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = Cookies.get('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only redirect to login if we have a 401/403 on a non-auth endpoint
    // This allows login/register to handle their own errors
    if ((error.response?.status === 401 || error.response?.status === 403) &&
      !error.config.url?.includes('/auth/login') &&
      !error.config.url?.includes('/auth/register')) {
      Cookies.remove('auth_token', { path: '/' });
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
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

// Telegram API
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
    const response = await api.post(`/telegram/conversations/${conversationId}/unhide`);
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

// Translation API
export const translationAPI = {
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

  getEngines: async (): Promise<{ engines: string[] }> => {
    const response = await api.get('/translation/engines');
    return response.data;
  },

  getLanguages: async (): Promise<{ languages: Language[] }> => {
    const response = await api.get('/translation/languages');
    return response.data;
  },
};

// Conversations API
export const conversationsAPI = {
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

  sendMessage: async (conversationId: number, text: string, translate: boolean = true) => {
    const response = await api.post('/messages/send', {
      conversation_id: conversationId,
      text,
      translate
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

// Health check
export const healthAPI = {
  check: async (): Promise<{ status: string; database: string }> => {
    const response = await api.get('/health');
    return response.data;
  },
};

// Message Templates API
export const templatesAPI = {
  getTemplates: async (): Promise<MessageTemplate[]> => {
    const response = await api.get('/templates');
    return response.data;
  },

  getTemplate: async (templateId: number): Promise<MessageTemplate> => {
    const response = await api.get(`/templates/${templateId}`);
    return response.data;
  },

  createTemplate: async (name: string, content: string): Promise<MessageTemplate> => {
    const response = await api.post('/templates', { name, content });
    return response.data;
  },

  updateTemplate: async (templateId: number, data: { name?: string; content?: string }): Promise<MessageTemplate> => {
    const response = await api.put(`/templates/${templateId}`, data);
    return response.data;
  },

  deleteTemplate: async (templateId: number): Promise<void> => {
    await api.delete(`/templates/${templateId}`);
  },
};

// Scheduled Messages API
export const scheduledMessagesAPI = {
  getScheduledMessages: async (): Promise<ScheduledMessage[]> => {
    const response = await api.get('/scheduled-messages');
    return response.data;
  },

  getScheduledMessagesByConversation: async (conversationId: number): Promise<ScheduledMessage[]> => {
    const response = await api.get(`/scheduled-messages/conversation/${conversationId}`);
    return response.data;
  },

  createScheduledMessage: async (conversationId: number, messageText: string, daysDelay: number): Promise<ScheduledMessage> => {
    const response = await api.post('/scheduled-messages', {
      conversation_id: conversationId,
      message_text: messageText,
      days_delay: daysDelay,
    });
    return response.data;
  },

  updateScheduledMessage: async (messageId: number, data: { message_text?: string; days_delay?: number }): Promise<ScheduledMessage> => {
    const response = await api.put(`/scheduled-messages/${messageId}`, data);
    return response.data;
  },

  cancelScheduledMessage: async (messageId: number): Promise<void> => {
    await api.delete(`/scheduled-messages/${messageId}`);
  },
};

// Contact CRM API
export const contactsAPI = {
  getContactInfo: async (conversationId: number): Promise<ContactInfo | null> => {
    const response = await api.get(`/contacts/conversation/${conversationId}`);
    return response.data;
  },

  createContactInfo: async (data: Partial<ContactInfo>): Promise<ContactInfo> => {
    const response = await api.post('/contacts', data);
    return response.data;
  },

  updateContactInfo: async (contactId: number, data: Partial<ContactInfo>): Promise<ContactInfo> => {
    const response = await api.put(`/contacts/${contactId}`, data);
    return response.data;
  },

  deleteContactInfo: async (contactId: number): Promise<void> => {
    await api.delete(`/contacts/${contactId}`);
  },
};

// Auto-Responder API
export const autoResponderAPI = {
  getRules: async (): Promise<AutoResponderRule[]> => {
    const response = await api.get('/auto-responder/rules');
    return response.data;
  },

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

  deleteRule: async (ruleId: number): Promise<void> => {
    await api.delete(`/auto-responder/rules/${ruleId}`);
  },

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

  deleteMedia: async (ruleId: number): Promise<void> => {
    await api.delete(`/auto-responder/rules/${ruleId}/media`);
  },

  getLogs: async (limit: number = 50): Promise<AutoResponderLog[]> => {
    const response = await api.get(`/auto-responder/logs?limit=${limit}`);
    return response.data;
  },
};