import axios from 'axios';
import Cookies from 'js-cookie';

/**
 * --- ADMIN API SERVICE CONFIGURATION ---
 * 
 * This file centralizes all communications between the Admin Dashboard and the Backend.
 * It handles automatic authentication injection (via admin_token) and global error
 * handling for unauthorized sessions.
 */

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- REQUEST INTERCEPTOR: AUTHENTICATION ---
// Automatically attaches the 'admin_token' from browser cookies to every outgoing request.
api.interceptors.request.use((config) => {
  const token = Cookies.get('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- RESPONSE INTERCEPTOR: ERROR HANDLING ---
// Detects 401 (Unauthorized) or 403 (Forbidden) statuses globally.
// This usually means the session has expired or the account was deactivated.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      // Clear invalid token and force a redirect to login page
      Cookies.remove('admin_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/**
 * --- ADMIN API ENDPOINTS ---
 * 
 * Categorized groups of functions for managing the platform.
 */
export const adminApi = {
  // --- GROUP 1: AUTHENTICATION ---
  // Simple password-based entry for the admin panel.
  login: (password: string) => api.post('/admin/auth/login', { password }),
  verifyToken: () => api.get('/admin/auth/verify'),

  // --- GROUP 2: COLLEAGUE MANAGEMENT (RBAC) ---
  // Manage accounts and access levels for other workers/colleagues.
  getColleagues: () => api.get('/admin/colleagues'),
  getColleague: (id: number) => api.get(`/admin/colleagues/${id}`),
  createColleague: (data: { username: string; password: string; email?: string }) =>
    api.post('/admin/colleagues', data),
  updateColleague: (id: number, data: { username?: string; email?: string; is_active?: boolean }) =>
    api.put(`/admin/colleagues/${id}`, data),
  deleteColleague: (id: number) => api.delete(`/admin/colleagues/${id}`),
  resetColleaguePassword: (id: number, password: string) =>
    api.post(`/admin/colleagues/${id}/reset-password`, { password }),
  impersonateColleague: (id: number) => api.post(`/admin/colleagues/${id}/impersonate`),

  // --- GROUP 3: MESSAGE AUDIT & REVIEW ---
  // Monitor traffic across all accounts for compliance and monitoring.
  getMessages: (params?: {
    user_id?: number;
    account_id?: number;
    conversation_id?: number;
    limit?: number;
    offset?: number;
  }) => api.get('/admin/messages', { params }),

  getConversations: (params?: {
    user_id?: number;
    account_id?: number;
  }) => api.get('/admin/conversations', { params }),

  // --- GROUP 4: ANALYTICS & STATS ---
  // High-level data visualization for performance tracking.
  getStatistics: () => api.get('/admin/statistics'),
  getAdminColleagueRanking: (limit?: number) => api.get('/analytics/admin/ranking/colleagues', { params: { limit } }),
  getAdminAccountRanking: (limit?: number) => api.get('/analytics/admin/ranking/accounts', { params: { limit } }),
  getAdminUserConversationRanking: (userId: number, limit?: number, accountId?: number) =>
    api.get(`/analytics/admin/users/${userId}/ranking/conversations`, { params: { limit, account_id: accountId } }),
  getAdminUserAccountRanking: (userId: number, limit?: number) =>
    api.get(`/analytics/admin/users/${userId}/ranking/accounts`, { params: { limit } }),

  // --- GROUP 5: SECURITY & ENCRYPTION ---
  // Controls the global message visibility and database encryption flags.
  getEncryptionSettings: () => api.get('/admin/encryption/settings'),
  updateEncryptionSettings: (data: { encryption_enabled: boolean }) =>
    api.put('/admin/encryption/settings', data),
};

export default api;
