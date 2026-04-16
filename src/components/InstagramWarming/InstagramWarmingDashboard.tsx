import React, { useState, useEffect } from 'react';
import {
  Flame, Search, Trash2, Shield, Plus,
  Settings, Users, Globe, RefreshCw, Upload,
  ExternalLink, CheckCircle2, AlertCircle,
  Loader2, X, Ghost, Server, UserCheck, Clock, Instagram, Zap, Snowflake, Lock
} from 'lucide-react';
import { instagramWarmingAPI } from '../../services/warming_api';
import { useSocket } from '../../hooks/useSocket';
import type {
  InstagramWarmingLead,
  InstagramWarmingAccount,
  InstagramWarmingProxy,
  InstagramWarmingSettings
} from '../../types';

const inputClass = "w-full bg-gray-50 dark:bg-black/20 border-2 border-transparent focus:border-orange-500 focus:outline-none rounded-2xl p-4 text-sm font-medium text-gray-900 dark:text-white transition-all placeholder-gray-400";
const labelClass = "block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2";

const InstagramWarmingDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'leads' | 'accounts' | 'proxies' | 'settings'>('leads');
  const [leads, setLeads] = useState<InstagramWarmingLead[]>([]);
  const [accounts, setAccounts] = useState<InstagramWarmingAccount[]>([]);
  const [proxies, setProxies] = useState<InstagramWarmingProxy[]>([]);
  const [settings, setSettings] = useState<InstagramWarmingSettings>({ bio_keywords: '', min_followers: 0, max_followers: 0 });

  const [isLoading, setIsLoading] = useState(true);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [harvestingId, setHarvestingId] = useState<number | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'alert' } | null>(null);

  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showProxyModal, setShowProxyModal] = useState(false);

  const [keywords, setKeywords] = useState('');
  const [newAccount, setNewAccount] = useState({ username: '', password: '', proxy_id: '', verification_code: '' });
  const [newProxy, setNewProxy] = useState({ host: '', port: '', username: '', password: '', proxy_type: 'http' });
  const [bulkUploading, setBulkUploading] = useState<'accounts' | 'proxies' | null>(null);

  const handleBulkUploadAccounts = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkUploading('accounts');
    try {
      await instagramWarmingAPI.bulkUploadAccounts(file);
      fetchData();
      notify('🛸 Ghost Unit Reinforced!');
    } catch (err) {
      notify('Upload failed.', 'alert');
    } finally {
      setBulkUploading(null);
    }
  };

  const handleBulkUploadProxies = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkUploading('proxies');
    try {
      await instagramWarmingAPI.bulkUploadProxies(file);
      fetchData();
      notify('🛰️ Network Shield Expanded!');
    } catch (err) {
      notify('Proxy sync failed.', 'alert');
    } finally {
      setBulkUploading(null);
    }
  };

  const [isAutoPilotRunning, setIsAutoPilotRunning] = useState(false);
  const [napEndTime, setNapEndTime] = useState<number | null>(null);
  const [remainingNap, setRemainingNap] = useState<number>(0);

  const notify = (msg: string, type: 'success' | 'alert' = 'success') => setNotification({ msg, type });
  const { onMessage } = useSocket();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [leadsData, accountsData, proxiesData, settingsData, autopilotStatus] = await Promise.all([
        instagramWarmingAPI.getLeads({ limit: 500 }),
        instagramWarmingAPI.getAccounts(),
        instagramWarmingAPI.getProxies(),
        instagramWarmingAPI.getSettings(),
        instagramWarmingAPI.getAutoPilotStatus()
      ]);
      setLeads(leadsData);
      setAccounts(accountsData);
      setProxies(proxiesData);
      setSettings(settingsData);
      setIsAutoPilotRunning(autopilotStatus.is_running);
      if (autopilotStatus.nap_end_time) {
        setNapEndTime(autopilotStatus.nap_end_time);
      } else {
        setNapEndTime(null);
      }
    } catch (e) {
      notify('Failed to sync with command center.', 'alert');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const unsubscribe = onMessage((msg: any) => {
      if (msg.type === 'instagram_lead_updated' || msg.type === 'new_lead_discovered') {
        fetchData();
        if (msg.type === 'instagram_lead_updated') {
          setHarvestingId(h => h === msg.lead_id ? null : h);
          setAnalyzingId(a => a === msg.lead_id ? null : a);
        }
      }
      if (msg.type === 'warming_autopilot_nap_sync') {
        setNapEndTime(msg.nap_end_time);
      } else if (msg.type === 'warming_autopilot_idle' || msg.type === 'instagram_lead_updated') {
        setNapEndTime(null);
      }
    });
    return unsubscribe;
  }, [onMessage]);

  useEffect(() => {
    if (!napEndTime) {
      setRemainingNap(0);
      return;
    }
    const tick = () => {
      const left = Math.ceil(napEndTime - (Date.now() / 1000));
      if (left <= 0) {
        setNapEndTime(null);
        setRemainingNap(0);
      } else {
        setRemainingNap(left);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [napEndTime]);

  const toggleAutoPilot = async () => {
    try {
      if (isAutoPilotRunning) {
        await instagramWarmingAPI.stopAutoPilot();
        notify('Warming Auto-Pilot Stopped.');
      } else {
        await instagramWarmingAPI.startAutoPilot();
        notify('Warming Auto-Pilot Engaged! 🚀');
      }
      setIsAutoPilotRunning(!isAutoPilotRunning);
    } catch {
      notify('Failed to toggle Auto-Pilot.', 'alert');
    }
  };

  useEffect(() => {
    if (notification) {
      const t = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(t);
    }
  }, [notification]);

  const handleDiscover = async () => {
    if (!keywords.trim()) return;
    setIsDiscovering(true);
    try {
      const kws = keywords.split(',').map(k => k.trim()).filter(Boolean);
      await instagramWarmingAPI.discoverLeads(kws);
      notify('Warming mission launched! Search is running in background 🚀');
      setShowDiscoveryModal(false);
      setKeywords('');
    } catch {
      notify('Mission failure. Check proxy logs.', 'alert');
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleAnalyze = async (leadId: number) => {
    setAnalyzingId(leadId);
    try {
      const res = await instagramWarmingAPI.analyzeLead(leadId);
      if (res.error) notify(`Analysis Error: ${res.error}`, 'alert');
      else fetchData();
    } catch {
      notify('Scout analysis failed. Check ghost status.', 'alert');
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleHarvest = async (leadId: number) => {
    if (harvestingId !== null) return notify('Scraper Busy: One harvest at a time.', 'alert');
    setHarvestingId(leadId);
    try {
      await instagramWarmingAPI.harvestNetwork(leadId);
      notify('🕸️ Follower Surge Started! Leads deploying to pool.');
    } catch {
      notify('Harvest failed. 🛑', 'alert');
      setHarvestingId(null);
    }
  };

  const handleUpdateStatus = async (leadId: number, status: string) => {
    try {
      await instagramWarmingAPI.updateLeadStatus(leadId, status);
      fetchData();
    } catch { notify('Status update failed.', 'alert'); }
  };

  const handleDeleteLead = async (leadId: number) => {
    try {
      await instagramWarmingAPI.deleteLead(leadId);
      setLeads(leads.filter(l => l.id !== leadId));
    } catch { notify('Failed to purge lead.', 'alert'); }
  };

  const handleClearLeads = async () => {
    if (!window.confirm('Wipe ALL Warming targets? This cannot be undone.')) return;
    try {
      await instagramWarmingAPI.clearLeads();
      setLeads([]);
      notify('Database purged. 🧹');
    } catch { notify('Purge failed.', 'alert'); }
  };

  const handleAddAccount = async () => {
    if (!newAccount.username || !newAccount.password) return notify('Username and password required.', 'alert');
    try {
      await instagramWarmingAPI.addAccount({
        ...newAccount,
        proxy_id: newAccount.proxy_id ? parseInt(newAccount.proxy_id) : null
      });
      notify('Ghost account deployed! 👻');
      setShowAccountModal(false);
      setNewAccount({ username: '', password: '', proxy_id: '', verification_code: '' });
      fetchData();
    } catch {
      notify('Account deployment failed.', 'alert');
    }
  };

  const handleAddProxy = async () => {
    if (!newProxy.host || !newProxy.port) return notify('Host and port required.', 'alert');
    try {
      await instagramWarmingAPI.addProxy({ ...newProxy, port: parseInt(newProxy.port.toString()) });
      notify('Proxy shield activated! 🛡️');
      setShowProxyModal(false);
      setNewProxy({ host: '', port: '', username: '', password: '', proxy_type: 'http' });
      fetchData();
    } catch {
      notify('Proxy configuration error.', 'alert');
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      await instagramWarmingAPI.saveSettings(settings);
      notify('Warming protocols saved. ⚙️');
    } catch {
      notify('Failed to save settings.', 'alert');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const statusStyle = (s: string) => {
    switch (s) {
      case 'discovered': case 'queued': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'qualified': case 'harvested': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'rejected': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'private': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 border border-orange-200/50';
      case 'warming': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'warmed': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const tabs = [
    { id: 'leads', label: 'Discovery Pool', icon: <Users className="w-4 h-4" /> },
    { id: 'accounts', label: 'Ghost Unit', icon: <Ghost className="w-4 h-4" /> },
    { id: 'proxies', label: 'Network Shield', icon: <Shield className="w-4 h-4" /> },
    // { id: 'settings', label: 'Protocols', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0f172a] p-6 lg:p-8">

      {/* Toast */}
      {notification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[9999] animate-in slide-in-from-top-8 duration-300">
          <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border text-white text-sm font-bold ${notification.type === 'success' ? 'bg-green-500 border-green-400/30' : 'bg-red-500 border-red-400/30'
            }`}>
            {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            {notification.msg}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-8">

        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
              <span className="w-10 h-10 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
                <Flame className="w-5 h-5 text-white" />
              </span>
              Instagram Warmer
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">
              Isolated lead discovery &amp; profile warming — zero link to your main leads.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleAutoPilot}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-sm transition-all border ${isAutoPilotRunning
                ? 'bg-amber-500/10 border-amber-500/50 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                : 'bg-gray-100 dark:bg-white/5 border-transparent text-gray-500 hover:border-gray-300'
                }`}
            >
              <Zap className={`w-4 h-4 ${isAutoPilotRunning ? 'animate-pulse fill-current' : ''}`} />
              {isAutoPilotRunning ? 'Engine Auto-Pilot: ON' : 'Engine Auto-Pilot: OFF'}
            </button>
            {remainingNap > 0 && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-500 text-white font-bold text-sm shadow-[0_0_15px_rgba(245,158,11,0.3)] animate-in fade-in zoom-in duration-300">
                <Clock className="w-4 h-4 animate-spin-slow" />
                <span>Nap Timer: {(() => {
                  const h = Math.floor(remainingNap / 3600);
                  const m = Math.floor((remainingNap % 3600) / 60);
                  const s = remainingNap % 60;
                  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                })()}</span>
              </div>
            )}
            <button
              onClick={fetchData}
              className="p-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-all"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleClearLeads}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-2xl font-bold text-sm transition-all"
            >
              <Trash2 className="w-4 h-4" /> Wipe Pool
            </button>
            <button
              onClick={() => setShowDiscoveryModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-orange-500/25 transition-all"
            >
              <Search className="w-4 h-4" /> Start Discovery
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Total Scoped', value: leads.length, icon: <Globe className="w-5 h-5 text-blue-500" /> },
            { label: 'Qualified', value: leads.filter(l => l.status === 'qualified' || l.status === 'harvested').length, icon: <CheckCircle2 className="w-5 h-5 text-purple-500" /> },
            { label: 'Rejected', value: leads.filter(l => l.status === 'rejected').length, icon: <AlertCircle className="w-5 h-5 text-red-500" /> },
            { label: 'Ghosts', value: accounts.length, icon: <Ghost className="w-5 h-5 text-indigo-500" /> },
            { label: 'Network', value: leads.filter(l => l.source === 'network_expansion').length, icon: <Users className="w-5 h-5 text-orange-500" /> },
          ].map(stat => (
            <div key={stat.label} className="bg-white dark:bg-[#1e293b] rounded-2xl p-5 border border-gray-100 dark:border-white/5 shadow-sm">
              <div className="flex items-center justify-between mb-3">{stat.icon}<span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{stat.label}</span></div>
              <p className="text-2xl font-black text-gray-900 dark:text-white leading-none">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5 w-fit shadow-sm">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* ── LEADS TAB ── */}
        {activeTab === 'leads' && (
          <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-20 text-orange-500">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50/50 dark:bg-black/10 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-white/5">
                    <tr>
                      <th className="px-6 py-4">Identity</th>
                      <th className="px-6 py-4">Status / Origin</th>
                      <th className="px-6 py-4">Influence</th>
                      <th className="px-6 py-4">Bio / Description</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                    {leads.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-20 text-center text-gray-400 font-bold uppercase tracking-widest text-[10px]">
                          Discovery pool is empty — launch a mission to find targets.
                        </td>
                      </tr>
                    ) : leads.map(lead => (
                      <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl overflow-hidden bg-orange-500/10 flex items-center justify-center text-orange-500 font-black text-xs border border-white dark:border-gray-800">
                              {lead.profile_pic_url ? <img src={lead.profile_pic_url} className="w-full h-full object-cover" alt="" /> : <Instagram className="w-5 h-5" />}
                            </div>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <span className="font-black text-gray-900 dark:text-white text-sm">@{lead.instagram_username}</span>
                                {lead.is_private && <Lock className="w-2.5 h-2.5 text-orange-500 shadow-orange-500/20" />}
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] text-gray-400 font-bold lowercase">{lead.full_name || 'Personal'}</span>
                                {analyzingId === lead.id && <span className="text-[8px] font-black text-orange-500 uppercase animate-pulse">Analyzing...</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1 w-fit">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest text-center ${statusStyle(lead.status)}`}>
                              {lead.status}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter text-center ${lead.source === 'network_expansion' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'}`}>
                              {lead.source === 'network_expansion' ? 'Follower' : 'Search'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-black text-gray-900 dark:text-white">{lead.follower_count ? lead.follower_count.toLocaleString() : '---'}</span>
                              <span className="text-[8px] text-gray-400 font-bold uppercase">Fol</span>
                            </div>
                            <div className="flex items-center gap-1 opacity-60">
                              <span className="text-[10px] font-bold text-gray-500">{lead.following_count ? lead.following_count.toLocaleString() : '---'}</span>
                              <span className="text-[8px] text-gray-400 font-bold uppercase">Wng</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 max-w-[200px]">
                          <p className="text-[10px] text-gray-500 line-clamp-2 leading-relaxed italic">
                            {lead.bio || (lead.status === 'discovered' ? 'Awaiting Identify...' : 'No bio available')}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <a href={`https://instagram.com/${lead.instagram_username}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-xl text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-all"><ExternalLink className="w-4 h-4" /></a>

                            {lead.status === 'qualified' && <span className="px-2 py-0.5 bg-green-500/10 text-green-500 rounded-lg text-[9px] font-black uppercase tracking-widest">Pass</span>}
                            {lead.status === 'rejected' && <span className="px-2 py-0.5 bg-red-500/10 text-red-500 rounded-lg text-[9px] font-black uppercase tracking-widest">Skip</span>}
                            {lead.status === 'private' && <span className="px-2 py-0.5 bg-orange-500/10 text-orange-500 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Locked</span>}
                            {lead.status === 'harvested' && <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-lg italic text-[9px] font-black uppercase tracking-widest">Harvested</span>}
                            {lead.status === 'discovered' && <span className="px-2 py-0.5 bg-orange-500/10 text-orange-500 rounded-lg text-[9px] font-black uppercase tracking-widest">New</span>}
                            {lead.status === 'failed' && <span className="px-2 py-0.5 bg-gray-500/10 text-gray-400 rounded-lg text-[9px] font-black uppercase tracking-widest">Retry</span>}

                            {lead.status === 'discovered' ? (
                              <button onClick={() => handleAnalyze(lead.id)} disabled={analyzingId === lead.id} className={`p-2 rounded-xl transition-all ${analyzingId === lead.id ? 'bg-orange-500/10 text-orange-500 animate-pulse' : 'bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500 hover:text-white'}`} title="Identify Profile">
                                {analyzingId === lead.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                              </button>
                            ) : (lead.status === 'rejected' || lead.status === 'private') ? (
                              <button onClick={() => handleUpdateStatus(lead.id, 'discovered')} className="p-2 rounded-xl bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white transition-all" title="Retry Analysis">
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            ) : lead.status === 'harvested' ? (
                              <div className="p-2 text-green-500 flex items-center gap-1.5" title="Deep Scrape Completed">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Completed</span>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleHarvest(lead.id)}
                                disabled={harvestingId === lead.id}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl font-black text-[10px] uppercase tracking-tighter transition-all ${harvestingId === lead.id ? 'bg-emerald-500 text-white animate-pulse' : 'bg-green-500 text-white hover:bg-green-600 shadow-md shadow-green-500/10'}`}
                              >
                                {harvestingId === lead.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
                                {harvestingId === lead.id ? "Scraping..." : "Approve & Scrape"}
                              </button>
                            )}

                            <button onClick={() => handleDeleteLead(lead.id)} className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ACCOUNTS TAB ── */}
        {activeTab === 'accounts' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-gray-900 dark:text-white">Ghost Unit Management</h3>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".txt"
                  className="hidden"
                  id="bulk-accounts-upload"
                  onChange={handleBulkUploadAccounts}
                />
                <label
                  htmlFor="bulk-accounts-upload"
                  className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white rounded-xl font-bold text-xs hover:opacity-90 transition-all cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" /> {bulkUploading === 'accounts' ? 'Uploading...' : 'Bulk Upload'}
                </label>
                <button
                  onClick={() => setShowAccountModal(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-black rounded-xl font-bold text-xs shadow-xl shadow-black/10 hover:opacity-90 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Deploy Account
                </button>
              </div>
            </div>
            {accounts.length === 0 ? (
              <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5 py-20 text-center text-gray-400 font-bold uppercase tracking-widest text-[10px]">
                No ghost accounts deployed yet.
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-4">
                {accounts.map(account => (
                  <div key={account.id} className="bg-white dark:bg-[#1e293b] rounded-2xl p-5 border border-gray-100 dark:border-white/5 shadow-sm relative group">
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => instagramWarmingAPI.deleteAccount(account.id).then(fetchData)}
                        className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-gray-100 dark:bg-black/20 rounded-2xl flex items-center justify-center">
                        <Ghost className="w-6 h-6 text-gray-400" />
                      </div>
                      <div>
                        <p className="font-black text-gray-900 dark:text-white tracking-tight">@{account.username}</p>
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg ${account.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                          }`}>{account.status}</span>
                        {(account as any).frozen_until && new Date((account as any).frozen_until) > new Date() && (
                          <div className="flex items-center gap-1 mt-1 text-blue-500 text-[9px] font-black uppercase italic tracking-tighter bg-blue-500/10 px-2 py-0.5 rounded-lg animate-pulse">
                            <Snowflake className="w-2.5 h-2.5" />
                            <span>Frozen: {(() => {
                              const diff = new Date((account as any).frozen_until).getTime() - new Date().getTime();
                              const h = Math.floor(diff / (1000 * 60 * 60));
                              const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                              return `${h}h ${m}m Left`;
                            })()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-white/5">
                      <div className="flex justify-between items-center text-[10px] uppercase font-black tracking-widest text-gray-400">
                        <span>Fleet Age</span>
                        <span className="text-gray-900 dark:text-white font-black">
                          {Math.max(1, Math.floor((new Date().getTime() - new Date(account.created_at).getTime()) / (1000 * 60 * 60 * 24)))} Days
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] uppercase font-black tracking-widest">
                          <span className="text-gray-400">Safety Meter</span>
                          <span className={`${(account as any).daily_usage_count >= 5 ? 'text-red-500 font-black' : 'text-orange-500 font-black'}`}>
                            {(account as any).daily_usage_count}/5 Active
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-black/40 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-700 ${(account as any).daily_usage_count >= 5 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]' : 'bg-gradient-to-r from-orange-400 to-orange-600 shadow-[0_0_10px_rgba(249,115,22,0.5)]'}`}
                            style={{ width: `${Math.min(((account as any).daily_usage_count / 5) * 100, 100)}%` }}
                          />
                        </div>
                        {(account as any).daily_usage_count >= 5 && (
                          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-tighter text-red-500/80 mt-1">
                            <Clock className="w-2.5 h-2.5 animate-pulse" />
                            <span>LOCKED: {(() => {
                              const resetAt = new Date(new Date((account as any).last_usage_reset).getTime() + 24 * 60 * 60 * 1000);
                              const diff = resetAt.getTime() - new Date().getTime();
                              if (diff <= 0) return "RESETTING...";
                              const h = Math.floor(diff / (1000 * 60 * 60));
                              const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                              return `${h}h ${m}m Remaining`;
                            })()}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-[10px] uppercase font-black tracking-widest text-gray-400">
                        <span>Shield Node</span>
                        <span className="text-gray-900 dark:text-white italic truncate max-w-[100px]">
                          {(account as any).proxy_host || 'Direct Handshake'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PROXIES TAB ── */}
        {activeTab === 'proxies' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-gray-900 dark:text-white">Network Shield</h3>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".txt"
                  className="hidden"
                  id="bulk-proxies-upload"
                  onChange={handleBulkUploadProxies}
                />
                <label
                  htmlFor="bulk-proxies-upload"
                  className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white rounded-xl font-bold text-xs hover:opacity-90 transition-all cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" /> {bulkUploading === 'proxies' ? 'Syncing...' : 'Bulk Sync'}
                </label>
                <button
                  onClick={() => setShowProxyModal(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-black rounded-xl font-bold text-xs shadow-xl shadow-black/10 hover:opacity-90 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Proxy Node
                </button>
              </div>
            </div>
            {proxies.length === 0 ? (
              <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5 py-20 text-center text-gray-400 font-bold uppercase tracking-widest text-[10px]">
                No proxy nodes configured. Direct connection in use.
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-4">
                {proxies.map(proxy => (
                  <div key={proxy.id} className="bg-white dark:bg-[#1e293b] rounded-2xl p-5 border border-gray-100 dark:border-white/5 shadow-sm relative group">
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => instagramWarmingAPI.deleteProxy(proxy.id).then(fetchData)}
                        className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center">
                        <Server className="w-6 h-6 text-blue-500" />
                      </div>
                      <div>
                        <p className="font-black text-gray-900 dark:text-white tracking-tight">{proxy.host}:{proxy.port}</p>
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-500">{proxy.proxy_type}</span>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-gray-100 dark:border-white/5 text-[10px] uppercase font-black tracking-widest text-gray-400">
                      <div className="flex justify-between"><span>Auth:</span><span className="text-gray-900 dark:text-white">{proxy.username ? '🔒 Protected' : 'Open'}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === 'settings' && (
          <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm p-8 max-w-2xl space-y-8">
            <div>
              <h3 className="text-xl font-black text-gray-900 dark:text-white mb-1">Warming Protocols</h3>
              <p className="text-gray-400 text-sm font-medium">Configure discovery filters for this isolated module.</p>
            </div>
            <div className="space-y-5">
              <div>
                <label className={labelClass}>Bio Keywords Filter</label>
                <input
                  type="text"
                  value={settings.bio_keywords}
                  onChange={e => setSettings(s => ({ ...s, bio_keywords: e.target.value }))}
                  placeholder="e.g. coach, entrepreneur, ceo"
                  className={inputClass}
                />
                <p className="text-[10px] text-gray-400 mt-1.5 font-medium">Comma-separated. Only show leads whose bio contains these words.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Min Followers</label>
                  <input
                    type="number"
                    value={settings.min_followers}
                    onChange={e => setSettings(s => ({ ...s, min_followers: parseInt(e.target.value) || 0 }))}
                    className={inputClass}
                    min={0}
                  />
                </div>
                <div>
                  <label className={labelClass}>Max Followers</label>
                  <input
                    type="number"
                    value={settings.max_followers}
                    onChange={e => setSettings(s => ({ ...s, max_followers: parseInt(e.target.value) || 0 }))}
                    className={inputClass}
                    min={0}
                  />
                  <p className="text-[10px] text-gray-400 mt-1.5 font-medium">Set 0 for no upper limit.</p>
                </div>
              </div>
            </div>
            <button
              onClick={handleSaveSettings}
              disabled={isSavingSettings}
              className="flex items-center gap-2 px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-orange-500/20 transition-all disabled:opacity-50"
            >
              {isSavingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Save Protocols
            </button>
          </div>
        )}
      </div>

      {/* ── DISCOVERY MODAL ── */}
      {showDiscoveryModal && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowDiscoveryModal(false)} />
          <div className="relative bg-white dark:bg-[#1e293b] w-full max-w-lg rounded-[32px] shadow-2xl border border-gray-200 dark:border-white/10 p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-black text-gray-900 dark:text-white">Mission Briefing</h3>
                <p className="text-gray-500 text-sm font-medium mt-0.5">Targets stay isolated in the Warming pool.</p>
              </div>
              <button onClick={() => setShowDiscoveryModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-5">
              <div>
                <label className={labelClass}>Target Keywords (comma-separated)</label>
                <textarea
                  value={keywords}
                  onChange={e => setKeywords(e.target.value)}
                  placeholder="e.g. fashion blogger, tech entrepreneur, @startup"
                  className={`${inputClass} h-32 resize-none`}
                />
              </div>
              <button
                onClick={handleDiscover}
                disabled={isDiscovering || !keywords.trim()}
                className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-orange-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDiscovering ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                {isDiscovering ? 'Executing Search Surge...' : 'Initiate Discovery Wave'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ACCOUNT MODAL ── */}
      {showAccountModal && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowAccountModal(false)} />
          <div className="relative bg-white dark:bg-[#1e293b] w-full max-w-lg rounded-[32px] shadow-2xl border border-gray-200 dark:border-white/10 p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-black text-gray-900 dark:text-white">Deploy Ghost Account</h3>
                <p className="text-gray-500 text-sm font-medium mt-0.5">Add an Instagram account for warming operations.</p>
              </div>
              <button onClick={() => setShowAccountModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Instagram Username</label>
                <input type="text" value={newAccount.username} onChange={e => setNewAccount(a => ({ ...a, username: e.target.value }))} placeholder="@username" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Password</label>
                <input type="password" value={newAccount.password} onChange={e => setNewAccount(a => ({ ...a, password: e.target.value }))} placeholder="••••••••" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>2FA Secret / Code (Optional)</label>
                <input type="text" value={newAccount.verification_code} onChange={e => setNewAccount(p => ({ ...p, verification_code: e.target.value }))} placeholder="ABCD 1234..." className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Assign Proxy Node</label>
                <select value={newAccount.proxy_id} onChange={e => setNewAccount(p => ({ ...p, proxy_id: e.target.value }))} className={inputClass}>
                  <option value="">Direct Handshake (No Proxy)</option>
                  {proxies.map(p => (
                    <option key={p.id} value={p.id}>{p.host}:{p.port} ({p.proxy_type})</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleAddAccount}
                className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-black rounded-2xl font-black text-sm transition-all hover:opacity-90 flex items-center justify-center gap-2 mt-2"
              >
                <Ghost className="w-5 h-5" /> Deploy Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PROXY MODAL ── */}
      {showProxyModal && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowProxyModal(false)} />
          <div className="relative bg-white dark:bg-[#1e293b] w-full max-w-lg rounded-[32px] shadow-2xl border border-gray-200 dark:border-white/10 p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-black text-gray-900 dark:text-white">Add Proxy Node</h3>
                <p className="text-gray-500 text-sm font-medium mt-0.5">Configure a proxy for identity masking.</p>
              </div>
              <button onClick={() => setShowProxyModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className={labelClass}>Host / IP</label>
                  <input type="text" value={newProxy.host} onChange={e => setNewProxy(p => ({ ...p, host: e.target.value }))} placeholder="192.168.1.1" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Port</label>
                  <input type="number" value={newProxy.port} onChange={e => setNewProxy(p => ({ ...p, port: e.target.value }))} placeholder="8080" className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Type</label>
                <select value={newProxy.proxy_type} onChange={e => setNewProxy(p => ({ ...p, proxy_type: e.target.value }))} className={inputClass}>
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                  <option value="socks5">SOCKS5</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Username (Optional)</label>
                  <input type="text" value={newProxy.username} onChange={e => setNewProxy(p => ({ ...p, username: e.target.value }))} placeholder="user" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Password (Optional)</label>
                  <input type="password" value={newProxy.password} onChange={e => setNewProxy(p => ({ ...p, password: e.target.value }))} placeholder="••••" className={inputClass} />
                </div>
              </div>
              <button
                onClick={handleAddProxy}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 mt-2"
              >
                <Globe className="w-5 h-5" /> Activate Proxy Node
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InstagramWarmingDashboard;
