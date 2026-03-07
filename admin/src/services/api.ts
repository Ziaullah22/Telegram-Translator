import axios from 'axios';
import Cookies from 'js-cookie';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = Cookies.get('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 and 403 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      // Unauthorized or account deactivated
      Cookies.remove('admin_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const adminApi = {
  // Authentication
  login: (password: string) => api.post('/admin/auth/login', { password }),
  verifyToken: () => api.get('/admin/auth/verify'),

  // Colleagues (Users)
  getColleagues: () => api.get('/admin/colleagues'),
  getColleague: (id: number) => api.get(`/admin/colleagues/${id}`),
  createColleague: (data: { username: string; password: string; email?: string }) =>
    api.post('/admin/colleagues', data),
  updateColleague: (id: number, data: { username?: string; email?: string; is_active?: boolean }) =>
    api.put(`/admin/colleagues/${id}`, data),
  deleteColleague: (id: number) => api.delete(`/admin/colleagues/${id}`),
  resetColleaguePassword: (id: number, password: string) =>
    api.post(`/admin/colleagues/${id}/reset-password`, { password }),

  // Messages
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

  // Statistics
  getStatistics: () => api.get('/admin/statistics'),
  getAdminColleagueRanking: (limit?: number) => api.get('/analytics/admin/ranking/colleagues', { params: { limit } }),
  getAdminAccountRanking: (limit?: number) => api.get('/analytics/admin/ranking/accounts', { params: { limit } }),
  getAdminUserConversationRanking: (userId: number, limit?: number, accountId?: number) =>
    api.get(`/analytics/admin/users/${userId}/ranking/conversations`, { params: { limit, account_id: accountId } }),
  getAdminUserAccountRanking: (userId: number, limit?: number) =>
    api.get(`/analytics/admin/users/${userId}/ranking/accounts`, { params: { limit } }),

  // Encryption Settings
  getEncryptionSettings: () => api.get('/admin/encryption/settings'),
  updateEncryptionSettings: (data: { encryption_enabled: boolean }) =>
    api.put('/admin/encryption/settings', data),
};

export default api;
