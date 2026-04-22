import React, { useState, useEffect } from 'react';
import {
  Flame, Search, Trash2, Shield, Plus,
  Users, Globe, RefreshCw, Upload,
  ExternalLink, CheckCircle2, AlertCircle,
  Loader2, X, Ghost, Server, UserCheck, Clock, Instagram, Zap, Snowflake, Lock, History
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
  const [activeTab, setActiveTab] = useState<'accounts' | 'proxies' | 'settings'>('accounts');
  const [leads, setLeads] = useState<InstagramWarmingLead[]>([]);
  const [accounts, setAccounts] = useState<InstagramWarmingAccount[]>([]);
  const [proxies, setProxies] = useState<InstagramWarmingProxy[]>([]);
  const [settings, setSettings] = useState<InstagramWarmingSettings>({ bio_keywords: '', min_followers: 0, max_followers: 0 });

  const [isLoading, setIsLoading] = useState(true);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [harvestingId, setHarvestingId] = useState<number | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [warmingAccountId, setWarmingAccountId] = useState<number | null>(null);
  const [pausingAccountId, setPausingAccountId] = useState<number | null>(null);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'alert' } | null>(null);

  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showProxyModal, setShowProxyModal] = useState(false);

  const [keywords, setKeywords] = useState('');
  const [newAccount, setNewAccount] = useState({ username: '', password: '', proxy_id: '', verification_code: '' });
  const [newProxy, setNewProxy] = useState({ host: '', port: '', username: '', password: '', proxy_type: 'http' });

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<InstagramWarmingAccount | null>(null);
  const [accountLogs, setAccountLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 0) return 'just now'; // Safety for clock drift
    if (diffInSeconds < 60) return 'seconds ago';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 7200) return `1h ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 172800) return 'Yesterday';
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const getSeasoningProgress = (count: number) => {
    if (count >= 30) return { text: '👑 Seasoned', color: 'text-yellow-500', bg: 'bg-yellow-500' };
    if (count >= 21) return { text: '⚔️ Mature', color: 'text-green-500', bg: 'bg-green-500' };
    if (count >= 14) return { text: '⚔️ Operative', color: 'text-blue-500', bg: 'bg-blue-500' };
    if (count >= 7) return { text: '🧪 Socialite', color: 'text-purple-500', bg: 'bg-purple-500' };
    return { text: '🛡️ Incubation', color: 'text-orange-500', bg: 'bg-gradient-to-r from-orange-400 to-orange-600' };
  };

  const notify = (msg: string, type: 'success' | 'alert' = 'success') => setNotification({ msg, type });
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

    // 📡 LIVE RADAR: Poll accounts status every 10s if we are on the accounts tab
    let pollInterval: any;
    if (activeTab === 'accounts') {
      pollInterval = setInterval(() => {
        // Shorter, silent fetch for accounts
        instagramWarmingAPI.getAccounts().then(setAccounts).catch(() => { });
      }, 10000);
    }

    return () => {
      unsubscribe();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [onMessage, activeTab]);

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

  const handleWarmup = async (accountId: number) => {
    // Prevent if already locked client-side
    const account = accounts.find(a => a.id === accountId);
    if (account && (account.daily_usage_count || 0) >= 1) {
      const resetAt = new Date(new Date(account.last_usage_reset as string).getTime() + 24 * 60 * 60 * 1000);
      const diff = resetAt.getTime() - new Date().getTime();
      if (diff > 0) {
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        notify(`🔒 @${account.username} is locked. Resets in ${h}h ${m}m.`, 'alert');
        return;
      }
    }
    setWarmingAccountId(accountId);
    try {
      const res = await instagramWarmingAPI.warmupAccount(accountId);
      if (res?.error) {
        notify(`🔒 ${res.error}`, 'alert');
      } else {
        notify('🔥 Warmup session launched for Ghost Unit!');
      }
      fetchData();
    } catch {
      notify('Warming mission failed.', 'alert');
    } finally {
      setWarmingAccountId(null);
    }
  };

  const handlePauseResume = async (accountId: number, isPaused?: boolean) => {
    setPausingAccountId(accountId);
    try {
      if (isPaused) {
        // Resume the bot
        await instagramWarmingAPI.resumeAccount(accountId);
        notify('🤖 Bot resumed! Smart navigation engaged.');
      } else {
        // Pause the bot — human takes control
        await instagramWarmingAPI.pauseAccount(accountId);
        notify('🎮 You have control! Bot is waiting...');
      }
      fetchData(); // Sync active states immediately
    } catch {
      notify('Control handoff failed.', 'alert');
    } finally {
      setPausingAccountId(null);
    }
  };


  const handleShowHistory = async (account: InstagramWarmingAccount) => {
    setSelectedAccount(account);
    setShowHistoryModal(true);
    setIsLoadingLogs(true);
    try {
      const logs = await instagramWarmingAPI.getAccountLogs(account.id);
      setAccountLogs(logs);
    } catch {
      notify('Failed to retrieve ghost journal.', 'alert');
    } finally {
      setIsLoadingLogs(false);
    }
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
      case 'frozen': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border border-blue-200/50';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const tabs = [
    { id: 'accounts', label: 'Ghost Units', icon: <Ghost className="w-4 h-4" /> },
    { id: 'proxies', label: 'Network Shield', icon: <Shield className="w-4 h-4" /> },
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
              Pure social warming — 30-day ghost maturation protocol.
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
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-sm shadow-lg animate-in fade-in zoom-in duration-300 ${remainingNap > 3600
                ? 'bg-indigo-600 text-white shadow-indigo-500/30'
                : 'bg-amber-500 text-white shadow-amber-500/30'
                }`}>
                <Clock className="w-4 h-4 animate-pulse" />
                <div className="flex flex-col leading-tight">
                  <span className="text-[9px] uppercase tracking-widest opacity-80">
                    {remainingNap > 3600 ? '🔒 Fleet Resting — Next Session In' : '⚡ Engine Cooldown'}
                  </span>
                  <span>{(() => {
                    const h = Math.floor(remainingNap / 3600);
                    const m = Math.floor((remainingNap % 3600) / 60);
                    const s = remainingNap % 60;
                    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                  })()}</span>
                </div>
              </div>
            )}
            <button
              onClick={fetchData}
              className="p-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-all"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Ghost Units', value: accounts.length, icon: <Ghost className="w-5 h-5 text-indigo-500" /> },
            { label: 'Active Now', value: accounts.filter(a => a.is_active).length, icon: <Zap className="w-5 h-5 text-green-500" /> },
            { label: 'Locked (24h)', value: accounts.filter(a => (a.daily_usage_count || 0) >= 1).length, icon: <Lock className="w-5 h-5 text-amber-500" /> },
            { label: 'Shield Nodes', value: proxies.length, icon: <Server className="w-5 h-5 text-blue-500" /> },
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


        {/* ── ACCOUNTS TAB: PROFESSIONAL COMMAND CONSOLE ── */}
        {activeTab === 'accounts' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-gray-900 dark:text-white">Ghost Fleet Control</h3>
                <p className="text-gray-400 text-xs font-medium mt-0.5 uppercase tracking-wider">Enterprise Management Protocol v2.0</p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept=".txt"
                  className="hidden"
                  id="bulk-accounts-upload"
                  onChange={handleBulkUploadAccounts}
                />
                <label
                  htmlFor="bulk-accounts-upload"
                  className="group flex items-center gap-2 px-5 py-2.5 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all cursor-pointer border border-transparent hover:border-orange-400/50"
                >
                  <Upload className="w-3.5 h-3.5" /> {bulkUploading === 'accounts' ? 'Deploying...' : 'Bulk Deployment'}
                </label>
                <button
                  onClick={() => setShowAccountModal(true)}
                  className="flex items-center gap-2 px-6 py-2.5 bg-orange-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-orange-600/20 hover:bg-orange-500 transition-all border border-orange-400/50"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Ghost Unit
                </button>
              </div>
            </div>

            {accounts.length === 0 ? (
              <div className="bg-white dark:bg-[#1e293b] rounded-[32px] border border-gray-100 dark:border-white/5 py-24 text-center">
                <div className="w-16 h-16 bg-gray-50 dark:bg-black/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-dashed border-gray-200 dark:border-white/10">
                  <Ghost className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                </div>
                <p className="text-gray-400 font-black uppercase tracking-widest text-[10px]">Ghost Fleet Offline. Deploy units to begin.</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-[#1e293b] rounded-[32px] border border-gray-100 dark:border-white/5 shadow-2xl shadow-black/5 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 dark:bg-black/20 border-b border-gray-100 dark:border-white/5">
                        <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400">Identity / Profile</th>
                        <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400">Networking</th>
                        <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400">Seasoning Path</th>
                        <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400">Pulse / Limit</th>
                        <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Ops Control</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                      {accounts.map(account => (
                        <tr key={account.id} className="group hover:bg-gray-50/80 dark:hover:bg-white/[0.02] transition-all">
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-4">
                              <div className="relative">
                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center border-2 ${account.is_active ? 'bg-orange-500/10 border-orange-500/20' : 'bg-gray-100 dark:bg-black/40 border-transparent'
                                  }`}>
                                  <Instagram className={`w-5 h-5 ${account.is_active ? 'text-orange-500' : 'text-gray-400'}`} />
                                </div>
                                {account.is_active && (
                                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-[#1e293b] animate-pulse shadow-lg shadow-green-500/50" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-black text-gray-900 dark:text-white tracking-tight">@{account.username}</p>
                                  {account.is_paused && (
                                    <span className="bg-blue-500/10 text-blue-500 text-[8px] font-black uppercase px-1.5 py-0.5 rounded italic">Paused</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`text-[9px] font-black uppercase tracking-tighter px-2 py-0.5 rounded ${account.status === 'active' ? 'bg-green-500/10 text-green-500' :
                                    account.status === 'frozen' ? 'bg-blue-500/10 text-blue-500' :
                                      'bg-red-500/10 text-red-500'
                                    }`}>{account.status}</span>
                                  <span className="text-gray-400 text-[9px] font-bold tracking-tight">{formatTimeAgo(account.created_at)}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-5">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5 text-gray-900 dark:text-white font-bold text-xs uppercase tracking-tighter">
                                <Shield className="w-3 h-3 text-blue-500" />
                                {(account as any).proxy_host || 'Direct Link'}
                              </div>
                              <span className="text-[9px] text-gray-400 font-medium uppercase tracking-widest mt-1">Isolated Node</span>
                            </div>
                          </td>

                          <td className="px-6 py-5 w-52">
                            <div className="space-y-1.5">
                              <div className="flex justify-between items-center">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${getSeasoningProgress(account.warming_session_count || 0).color}`}>
                                  {getSeasoningProgress(account.warming_session_count || 0).text}
                                </span>
                                <span className="text-[9px] font-bold text-gray-400">
                                  Day {Math.min(account.warming_session_count || 0, 30)}/30
                                </span>
                              </div>
                              <div className="h-1.5 bg-gray-100 dark:bg-black/40 rounded-full overflow-hidden w-36">
                                <div
                                  className={`h-full transition-all duration-700 ${getSeasoningProgress(account.warming_session_count || 0).bg}`}
                                  style={{ width: `${Math.min(((account.warming_session_count || 0) / 30) * 100, 100)}%` }}
                                />
                              </div>
                              <p className="text-[8px] text-gray-400 font-medium uppercase tracking-wider">
                                {(account.warming_session_count || 0) < 7 ? 'Scroll + Reels only' :
                                  (account.warming_session_count || 0) < 14 ? '+ Liking posts' :
                                    (account.warming_session_count || 0) < 21 ? '+ Following users' :
                                      '+ Explore deep dive'}
                              </p>
                            </div>
                          </td>

                          <td className="px-6 py-5">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${account.daily_usage_count !== undefined && account.daily_usage_count >= 1 ? 'bg-amber-500' : 'bg-green-500'
                                  } shadow-[0_0_8px_rgba(34,197,94,0.3)]`} />
                                <span className={`text-xs font-black uppercase ${account.daily_usage_count !== undefined && account.daily_usage_count >= 1
                                  ? 'text-amber-500' : 'text-green-500'
                                  }`}>
                                  {account.daily_usage_count !== undefined && account.daily_usage_count >= 1 ? 'Done Today' : 'Ready'}
                                </span>
                              </div>
                              <span className="text-[8px] uppercase tracking-widest font-bold text-gray-400">Pure Warmup Only</span>
                              {account.daily_usage_count !== undefined && account.daily_usage_count >= 1 && (
                                <div className="flex items-center gap-1 text-amber-500 text-[9px] font-black uppercase italic animate-pulse">
                                  <Lock className="w-2.5 h-2.5" />
                                  <span>{(() => {
                                    const resetAt = new Date(new Date(account.last_usage_reset as string).getTime() + 24 * 60 * 60 * 1000);
                                    const diff = resetAt.getTime() - new Date().getTime();
                                    if (diff <= 0) return "RESETTING...";
                                    const h = Math.floor(diff / (1000 * 60 * 60));
                                    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                                    return `Resets in ${h}h ${m}m`;
                                  })()}</span>
                                </div>
                              )}
                              {/* Frozen state badge with Timer */}
                              {account.frozen_until && new Date(account.frozen_until as string) > new Date() && (
                                <div className="flex flex-col gap-1 mt-1">
                                  <div className="flex items-center gap-1.5 text-blue-500 text-[9px] font-black uppercase tracking-widest italic animate-pulse">
                                    <Snowflake className="w-2.5 h-2.5 animate-spin-slow" />
                                    <span>Frozen (Safety Sleep)</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-blue-400/80 text-[8px] font-bold uppercase tracking-tight">
                                    <Clock className="w-2 h-2" />
                                    <span>{(() => {
                                      const thawAt = new Date(account.frozen_until as string);
                                      const diff = thawAt.getTime() - new Date().getTime();
                                      if (diff <= 0) return "WAKING UP...";
                                      const h = Math.floor(diff / (1000 * 60 * 60));
                                      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                                      return `Unfreezes in ${h}h ${m}m`;
                                    })()}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>

                          <td className="px-6 py-5">
                            <div className="flex items-center justify-end gap-2">
                              {/* 🎮 CONTROL BUTTON */}
                              {account.is_active && (
                                <button
                                  onClick={() => handlePauseResume(account.id, account.is_paused)}
                                  disabled={pausingAccountId === account.id}
                                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg ${account.is_paused
                                    ? 'bg-green-600 text-white hover:bg-green-500 animate-pulse'
                                    : 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-500/20'
                                    }`}
                                >
                                  {pausingAccountId === account.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : account.is_paused ? <Zap className="w-3 h-3" /> : <Ghost className="w-3 h-3" />}
                                  {account.is_paused ? 'Resume' : 'Control'}
                                </button>
                              )}

                              {/* WARMUP BUTTON */}
                              {!account.is_active && (
                                <div className="relative group/warmup">
                                  <button
                                    onClick={() => handleWarmup(account.id)}
                                    disabled={warmingAccountId === account.id || (account.daily_usage_count || 0) >= 1}
                                    className={`p-2.5 rounded-xl transition-all ${warmingAccountId === account.id
                                      ? 'bg-orange-500 text-white animate-pulse'
                                      : (account.daily_usage_count || 0) >= 1
                                        ? 'bg-amber-500/10 text-amber-500 cursor-not-allowed'
                                        : 'bg-orange-500/10 text-orange-500 hover:bg-orange-500 hover:text-white border border-transparent hover:border-orange-400'
                                      }`}
                                    title={(account.daily_usage_count || 0) >= 1 ? 'Already warmed today' : 'Start Manual Warmup'}
                                  >
                                    {warmingAccountId === account.id
                                      ? <Loader2 className="w-4 h-4 animate-spin" />
                                      : (account.daily_usage_count || 0) >= 1
                                        ? <Lock className="w-4 h-4" />
                                        : <Flame className="w-4 h-4" />}
                                  </button>
                                  {/* Tooltip showing unlock time */}
                                  {(account.daily_usage_count || 0) >= 1 && account.last_usage_reset && (
                                    <div className="absolute bottom-full right-0 mb-2 w-36 bg-gray-900 text-white text-[9px] font-black uppercase tracking-wider rounded-xl px-3 py-2 opacity-0 group-hover/warmup:opacity-100 transition-all pointer-events-none shadow-2xl z-50">
                                      <div className="text-amber-400 mb-0.5">🔒 Locked 24h</div>
                                      <div>{(() => {
                                        const resetAt = new Date(new Date(account.last_usage_reset as string).getTime() + 24 * 60 * 60 * 1000);
                                        const diff = resetAt.getTime() - new Date().getTime();
                                        if (diff <= 0) return 'Resetting...';
                                        const h = Math.floor(diff / (1000 * 60 * 60));
                                        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                                        return `Resets in ${h}h ${m}m`;
                                      })()}</div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* HISTORY BUTTON */}
                              <button
                                onClick={() => handleShowHistory(account)}
                                className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-xl hover:bg-indigo-500 hover:text-white transition-all border border-transparent hover:border-indigo-400"
                                title="View Activity Journal"
                              >
                                <History className="w-4 h-4" />
                              </button>

                              {/* DELETE BUTTON */}
                              <button
                                onClick={() => instagramWarmingAPI.deleteAccount(account.id).then(fetchData)}
                                className="p-2.5 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all border border-transparent hover:border-red-400"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4">
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
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4">
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
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4">
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
      {/* ── HISTORY MODAL ── */}
      {showHistoryModal && selectedAccount && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowHistoryModal(false)} />
          <div className="relative bg-white dark:bg-[#1e293b] w-full max-w-xl rounded-[32px] shadow-2xl border border-gray-200 dark:border-white/10 p-8 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between mb-6 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                  <History className="w-5 h-5 text-indigo-500" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white">Ghost Journal</h3>
                  <p className="text-gray-500 text-xs font-medium mt-0.5">@{selectedAccount.username}'s Activity Logs</p>
                </div>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
              {isLoadingLogs ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Accessing records...</p>
                </div>
              ) : accountLogs.length === 0 ? (
                <div className="text-center py-20 text-gray-500 font-bold uppercase tracking-widest text-[10px]">
                  No activities recorded in the last 24h.
                </div>
              ) : (
                <div className="relative pl-6 border-l-2 border-gray-100 dark:border-white/5 space-y-6">
                  {accountLogs.map((log, idx) => (
                    <div key={log.id} className="relative">
                      <div className="absolute -left-[29px] top-1.5 w-3 h-3 rounded-full bg-indigo-500 border-4 border-white dark:border-[#1e293b]" />
                      <div className="bg-gray-50 dark:bg-black/20 rounded-2xl p-4 border border-transparent hover:border-indigo-500/30 transition-all">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-indigo-500/10 text-indigo-500 rounded-lg">
                            {log.log_type}
                          </span>
                          <span className="text-[9px] font-bold text-gray-400">
                            {formatTimeAgo(log.created_at)}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          {log.message}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-white/5 shrink-0">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="w-full py-4 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white rounded-2xl font-black text-sm hover:bg-gray-200 dark:hover:bg-white/10 transition-all"
              >
                Close Journal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InstagramWarmingDashboard;
