import { api } from './api';

export const instagramWarmingAPI = {
  getLeads: async (params: { status?: string; limit?: number; offset?: number }) => {
    const response = await api.get('/instagram-warming/leads', { params });
    return response.data;
  },

  discoverLeads: async (keywords: string[], limit_per_keyword: number = 50) => {
    const response = await api.post('/instagram-warming/discover', { keywords, limit_per_keyword });
    return response.data;
  },

  getAccounts: async () => {
    const response = await api.get('/instagram-warming/accounts');
    return response.data;
  },

  addAccount: async (accountData: any) => {
    const response = await api.post('/instagram-warming/accounts', accountData);
    return response.data;
  },

  deleteAccount: async (accountId: number) => {
    await api.delete(`/instagram-warming/accounts/${accountId}`);
  },

  getProxies: async () => {
    const response = await api.get('/instagram-warming/proxies');
    return response.data;
  },

  addProxy: async (proxyData: any) => {
    const response = await api.post('/instagram-warming/proxies', proxyData);
    return response.data;
  },

  deleteProxy: async (proxyId: number) => {
    await api.delete(`/instagram-warming/proxies/${proxyId}`);
  },

  getSettings: async () => {
    const response = await api.get('/instagram-warming/settings');
    return response.data;
  },

  saveSettings: async (settings: { bio_keywords: string; min_followers: number; max_followers: number }) => {
    const response = await api.post('/instagram-warming/settings', settings);
    return response.data;
  },

  analyzeLead: async (leadId: number) => {
    const response = await api.post(`/instagram-warming/analyze/${leadId}`);
    return response.data;
  },

  harvestNetwork: async (leadId: number) => {
    const response = await api.post(`/instagram-warming/harvest/${leadId}`);
    return response.data;
  },

  deleteLead: async (leadId: number) => {
    await api.delete(`/instagram-warming/leads/${leadId}`);
  },

  clearLeads: async () => {
    await api.delete('/instagram-warming/leads');
  },

  updateLeadStatus: async (leadId: number, status: string) => {
    const response = await api.patch(`/instagram-warming/leads/${leadId}/status`, null, { params: { status } });
    return response.data;
  },

  bulkUploadAccounts: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/instagram-warming/accounts/bulk', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  bulkUploadProxies: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/instagram-warming/proxies/bulk', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },
  startAutoPilot: async () => {
    const response = await api.post('/instagram-warming/autopilot/start');
    return response.data;
  },
  stopAutoPilot: async () => {
    const response = await api.post('/instagram-warming/autopilot/stop');
    return response.data;
  },
  getAutoPilotStatus: async () => {
    const response = await api.get('/instagram-warming/autopilot/status');
    return response.data;
  },

  updateAccount: async (accountId: number, data: any) => {
    const response = await api.patch(`/instagram-warming/accounts/${accountId}`, data);
    return response.data;
  },
  warmupAccount: async (accountId: number) => {
    const response = await api.post(`/instagram-warming/accounts/${accountId}/warmup`);
    return response.data;
  },
  pauseAccount: async (accountId: number) => {
    const response = await api.post(`/instagram-warming/accounts/${accountId}/pause`);
    return response.data;
  },
  resumeAccount: async (accountId: number) => {
    const response = await api.post(`/instagram-warming/accounts/${accountId}/resume`);
    return response.data;
  },
  getAccountLogs: async (accountId: number, limit: number = 50) => {
    const response = await api.get(`/instagram-warming/accounts/${accountId}/logs`, { params: { limit } });
    return response.data;
  }
};
