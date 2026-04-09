import React, { useState, useEffect } from 'react';
import { 
    Instagram, Search, Trash2, Play,
    Zap, Target, Plus, Globe, Filter,
    RefreshCw, ExternalLink, UserCheck, CheckCircle2,
    Server, Users, AlertCircle, Loader2, X, Eye, EyeOff, Clock
} from 'lucide-react';
import { instagramAPI } from '../../services/api';
import { useSocket } from '../../hooks/useSocket';

// 🕒 Time Formatter Helper for Ghost Accounts
const timeAgo = (dateStr?: string) => {
    if (!dateStr) return 'Never Used';
    const seconds = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return `${Math.max(1, seconds)} sec ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hrs ago`;
    return `${Math.floor(hours / 24)} days ago`;
};

const InstagramLeadGenerator: React.FC = () => {
    const [leads, setLeads] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [proxies, setProxies] = useState<any[]>([]);
    const [stats, setStats] = useState({ total: 0, discovered: 0, analyzed: 0, rejected: 0, contacted: 0, converted: 0 });
    const [activeTab, setActiveTab] = useState<'leads' | 'accounts' | 'proxies' | 'campaign' | 'filters'>('leads');
    const [messageTemplate, setMessageTemplate] = useState('Hello [username], I saw your profile and loved your content! We help brands like yours grow. Would you be open to a quick chat?');
    const [isCampaignRunning, setIsCampaignRunning] = useState(false);
    const [filterSettings, setFilterSettings] = useState<{bio_keywords: string, min_followers: number, max_followers: number, sample_hashes: string[]}>({ bio_keywords: '', min_followers: 0, max_followers: 0, sample_hashes: [] });
    const [isSavingFilters, setIsSavingFilters] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [analyzingId, setAnalyzingId] = useState<number | null>(null);
    const [harvestingId, setHarvestingId] = useState<number | null>(null);
    const [autoAnalyzingId, setAutoAnalyzingId] = useState<number | null>(null);
    const [isAutoPilotRunning, setIsAutoPilotRunning] = useState(false);
    
    // Modals
    const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [showProxyModal, setShowProxyModal] = useState(false);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [selectedLead, setSelectedLead] = useState<any>(null);
    
    // Form States
    const [keywords, setKeywords] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [notification, setNotification] = useState<{msg: string, type: 'success' | 'alert'} | null>(null);
    const [newAccount, setNewAccount] = useState({ username: '', password: '', proxy_id: '', bundle: '', verification_code: '', session_id: '' });
    const [needs2FA, setNeeds2FA] = useState(false);
    const [newProxy, setNewProxy] = useState({ host: '', port: '', username: '', password: '', proxy_type: 'http', bundle: '' });
    
    // 🔗 Real-time Scout Sync
    const [isAuthorizing, setIsAuthorizing] = useState(false);
    const [showPass, setShowPass] = useState(false);
    const { onMessage: socketOnMessage } = useSocket();
    useEffect(() => {
        return socketOnMessage((data: any) => {
            if (data.topic === 'harvest_status') {
                if (data.status === 'completed' || data.status === 'error') {
                    setNotification({ 
                        msg: data.status === 'completed' ? '🏁 Scout Report Complete! ✨' : `❌ Scout Error: ${data.message}`, 
                        type: data.status === 'completed' ? 'success' : 'alert' 
                    });
                    setHarvestingId(null);
                    fetchData();
                }
            } else if (data.type === 'auto_analyze_stopped') {
                setIsAutoPilotRunning(false);
                setNotification({ msg: data.message || '🏁 Mission Complete: Auto-Pilot Finished!', type: 'success' });
            }
        });
    }, [socketOnMessage]);

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const [leadsData, statsData, accountsData, proxiesData] = await Promise.all([
                instagramAPI.getLeads({ 
                    status: filterStatus === 'all' ? undefined : filterStatus,
                    keyword: searchQuery || undefined
                }),
                instagramAPI.getStats(),
                instagramAPI.getAccounts(),
                instagramAPI.getProxies()
            ]);
            setLeads(leadsData);
            setStats(statsData);
            setAccounts(accountsData);
            setProxies(proxiesData);
        } catch (error) {
            console.error('Failed to fetch Instagram data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const { onMessage } = useSocket();

    useEffect(() => {
        const unsubscribe = onMessage((message: any) => {
            if (message.type === 'error_notification') {
                setNotification({ msg: message.message, type: 'alert' });
            } else if (message.type === 'instagram_lead_updated' || message.type === 'new_lead_discovered') {
                // 🛰️ INSTANT SYNC: Leads pop into the table the millisecond they are found!
                fetchData();
            } else if (message.type === 'auto_analyze_started') {
                setAutoAnalyzingId(message.lead_id);
            } else if (message.type === 'auto_analyze_finished') {
                setAutoAnalyzingId(null);
                fetchData(); // Refresh to show the new 'qualified/vetted' status immediately!
            }
        });
        return unsubscribe;
    }, [onMessage]);

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    useEffect(() => {
        fetchData();
        // Load saved filter settings
        instagramAPI.getFilterSettings()
            .then(s => setFilterSettings({
                bio_keywords: s.bio_keywords || '',
                min_followers: s.min_followers || 0,
                max_followers: s.max_followers || 0,
                sample_hashes: s.sample_hashes || []
            }))
            .catch(() => {});
    }, [filterStatus, searchQuery]);

    useEffect(() => {
        const checkPilotStatus = async () => {
            try {
                const [autoStatus, campStatus] = await Promise.all([
                    instagramAPI.getAutoPilotStatus(),
                    instagramAPI.getCampaignStatus()
                ]);
                setIsAutoPilotRunning(autoStatus.is_running);
                setIsCampaignRunning(campStatus.is_running);
            } catch (error) {
                console.error('Failed to get pilot status:', error);
            }
        };
        checkPilotStatus();
    }, []);

    useEffect(() => {
        let pollInterval: any;
        // 🏎️💨 HEARTBEAT: Pulse every 3s if ANYTHING is working! (Auto-Pilot OR Manual Analysis OR Harvest)
        if (isDiscovering || isAutoPilotRunning || isCampaignRunning || analyzingId !== null || harvestingId !== null) {
            pollInterval = setInterval(async () => {
                fetchData();
                if (isCampaignRunning) {
                    try {
                        const campStatus = await instagramAPI.getCampaignStatus();
                        if (!campStatus.is_running) {
                            setIsCampaignRunning(false);
                            setNotification({ msg: '🏁 Campaign Complete! All leads have been contacted.', type: 'success' });
                        }
                    } catch (e) { /* silent */ }
                }
            }, 3000);
        }
        return () => clearInterval(pollInterval);
    }, [isDiscovering, isAutoPilotRunning, isCampaignRunning, analyzingId, harvestingId]);

    const handleToggleAutoPilot = async () => {
        try {
            if (isAutoPilotRunning) {
                await instagramAPI.stopAutoPilot();
                setIsAutoPilotRunning(false);
                setNotification({ msg: 'Auto-Pilot Stopped. 🛑', type: 'success' });
            } else {
                await instagramAPI.startAutoPilot();
                setIsAutoPilotRunning(true);
                setNotification({ msg: 'Auto-Pilot Mode STARTED! 🏎️', type: 'success' });
            }
        } catch (error) {
            console.error('Failed to toggle Auto-Pilot:', error);
        }
    };

    const handleToggleCampaign = async () => {
        try {
            if (isCampaignRunning) {
                await instagramAPI.stopCampaign();
                setIsCampaignRunning(false);
                setNotification({ msg: 'Campaign Paused. 🛑', type: 'success' });
            } else {
                if (!messageTemplate.trim()) {
                    setNotification({ msg: 'Please write a message first!', type: 'alert' });
                    return;
                }
                const result = await instagramAPI.startCampaign(messageTemplate);
                if (result.status === 'started') {
                    setIsCampaignRunning(true);
                    setNotification({ msg: 'Outreach Pilot LAUNCHED! 🚀', type: 'success' });
                }
            }
        } catch (error) {
            console.error('Failed to toggle campaign:', error);
            setNotification({ msg: 'Campaign control failed.', type: 'alert' });
        }
    };

    const handleDeleteLead = async (id: number) => {
        try {
            await instagramAPI.deleteLead(id);
            setNotification({ msg: 'Lead deleted.', type: 'success' });
            fetchData();
        } catch (error) {
            console.error('Failed to delete lead:', error);
        }
    };

    const handleClearLeads = async () => {
        if (!window.confirm('Are you absolutely sure you want to clear ALL leads?')) return;
        try {
            await instagramAPI.clearLeads();
            setNotification({ msg: 'Database cleared successfully.', type: 'success' });
            fetchData();
        } catch (error) {
            console.error('Failed to clear leads:', error);
        }
    };

    const handleDiscover = async () => {
        if (!keywords.trim()) return;
        setIsDiscovering(true);
        try {
            const keywordList = keywords.split(',').map(k => k.trim()).filter(k => k);
            const result = await instagramAPI.discoverLeads(keywordList);
            setNotification({ msg: `Success! 🎉 Scraped ${result.new_leads_found} leads.`, type: 'success' });
            setShowDiscoveryModal(false);
            setKeywords('');
            fetchData();
        } catch (error: any) {
            console.error('Discovery failed:', error);
            setNotification({ msg: 'Scan failed.', type: 'alert' });
        } finally {
            setIsDiscovering(false);
        }
    };

    const handleAnalyze = async (leadId: number) => {
        setAnalyzingId(leadId);
        try {
            const result = await instagramAPI.analyzeLead(leadId);
            if (result.error) {
                alert(`Analysis failed: ${result.error}`);
            } else {
                fetchData();
            }
        } catch (error) {
            console.error('Analysis failed:', error);
        } finally {
            setAnalyzingId(null);
        }
    };

    const handleHarvest = async (leadId: number) => {
        if (harvestingId !== null) {
            setNotification({ msg: '⚠️ Scraper Busy: Please wait for the current harvest to finish!', type: 'alert' });
            return;
        }
        
        setHarvestingId(leadId);
        try {
            // 🔥 BACKGROUND ACTION: Trigger the surge and wait for the signal!
            await instagramAPI.harvestNetwork(leadId);
            setNotification({ msg: '🕸️ Follower Surge Started! 🚀', type: 'success' });
        } catch (error: any) {
            console.error('Harvest failed:', error);
            setNotification({ msg: 'Harvest failed. 🛑', type: 'alert' });
            setHarvestingId(null);
        }
    };

    const handleUpdateStatus = async (leadId: number, newStatus: string) => {
        try {
            await instagramAPI.updateLeadStatus(leadId, newStatus);
            setNotification({ msg: `Lead marked as ${newStatus}. ✅`, type: 'success' });
            fetchData();
        } catch (error) {
            console.error('Failed to update status:', error);
        }
    };

    // Force scrape a rejected lead — harvest it but keep status as 'rejected'
    const handleForceHarvest = async (leadId: number) => {
        if (harvestingId !== null) {
            setNotification({ msg: '⚠️ Scraper Busy: Please wait for the current harvest to finish!', type: 'alert' });
            return;
        }
        setHarvestingId(leadId);
        try {
            await instagramAPI.harvestNetwork(leadId);
            // After harvest is queued, restore rejected status so the lead stays filtered
            await instagramAPI.updateLeadStatus(leadId, 'rejected');
            setNotification({ msg: '🕸️ Force Scrape Started! Lead stays rejected. 📊', type: 'success' });
        } catch (error: any) {
            console.error('Force harvest failed:', error);
            setNotification({ msg: 'Force Scrape failed. 🛑', type: 'alert' });
            setHarvestingId(null);
        }
    };

    const handleAddAccount = async () => {
        try {
            setIsAuthorizing(true);
            const data = { 
                username: newAccount.username, 
                password: newAccount.password, 
                proxy_id: newAccount.proxy_id || null, 
                verification_code: newAccount.verification_code || undefined,
                session_id: newAccount.session_id || undefined
            };
            const res = await instagramAPI.addAccount(data);
            
            if (res.status === '2fa_required') {
                setNeeds2FA(true);
                setNotification({ msg: res.message || '🔐 2FA Required: Enter your code.', type: 'alert' });
                return;
            }

            if (res.status === 'error') {
                setNotification({ msg: `❌ ${res.message}`, type: 'alert' });
                return;
            }

            setShowAccountModal(false);
            setNeeds2FA(false);
            setNewAccount({ username: '', password: '', proxy_id: '', bundle: '', verification_code: '', session_id: '' });
            setNotification({ msg: '✅ Account Authorized successfully!', type: 'success' });
            fetchData();
        } catch (error: any) {
            console.error('Failed to add account:', error);
            setNotification({ msg: '❌ Auth Failed: Check logs/proxy.', type: 'alert' });
        } finally {
            setIsAuthorizing(false);
        }
    };

    const handleAddProxy = async () => {
        try {
            // High-Resilience Cleaner: Isolate the core IP:Port block from table copy-pastes
            const cleanBundle = newProxy.bundle.replace(/\t/g, ' ').trim().split(' ')[0];
            const data = { host: cleanBundle, port: 0, username: '', password: '', proxy_type: 'http' };
            await instagramAPI.addProxy(data);
            setShowProxyModal(false);
            setNewProxy({ host: '', port: '', username: '', password: '', proxy_type: 'http', bundle: '' });
            fetchData();
        } catch (error) {
            console.error('Failed to add proxy:', error);
        }
    };

    const handleDeleteAccount = async (id: number) => {
        if (!confirm('Are you sure you want to delete this account?')) return;
        try {
            await instagramAPI.deleteAccount(id);
            fetchData();
        } catch (error) {
            console.error('Failed to delete account:', error);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setIsUploadingImage(true);
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            try {
                const res = await instagramAPI.generateImageHash(reader.result as string);
                if (res.hash) {
                    setFilterSettings(p => ({
                        ...p,
                        sample_hashes: [...(p.sample_hashes || []), res.hash]
                    }));
                    setNotification({ msg: '✨ Visual fingerprint added!', type: 'success' });
                }
            } catch (err) {
                console.error(err);
                setNotification({ msg: 'Failed to generate fingerprint.', type: 'alert' });
            } finally {
                setIsUploadingImage(false);
            }
        };
    };

    const handleFixAccounts = async () => {
        try {
            await instagramAPI.fixAccountStatuses();
            setNotification({ msg: '✅ All ghost accounts activated! Ready for Campaign Pilot.', type: 'success' });
            fetchData();
        } catch (error) {
            console.error('Failed to fix accounts:', error);
            setNotification({ msg: 'Failed to activate accounts.', type: 'alert' });
        }
    };

    const handleDeleteProxy = async (id: number) => {
        if (!confirm('Are you sure you want to delete this proxy?')) return;
        try {
            await instagramAPI.deleteProxy(id);
            fetchData();
        } catch (error) {
            console.error('Failed to delete proxy:', error);
        }
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'discovered': case 'queued': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
            case 'analyzed': case 'qualified': case 'vetted': case 'harvested': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
            case 'rejected': case 'discarded': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
            case 'contacted': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
            case 'converted': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
            default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
        }
    };

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0f172a] p-6 lg:p-8 relative">
            {notification && (
                <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl backdrop-blur-md border ${
                        notification.type === 'success' ? 'bg-green-500/90 text-white border-green-400/20' : 'bg-red-500/90 text-white border-red-400/20'
                    }`}>
                        {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        <p className="font-bold text-sm tracking-tight">{notification.msg}</p>
                    </div>
                </div>
            )}

            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header Section */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
                            <span className="w-10 h-10 bg-gradient-to-tr from-pink-500 via-red-500 to-yellow-500 rounded-xl flex items-center justify-center shadow-lg shadow-pink-500/20">
                                <Instagram className="w-5 h-5 text-white" />
                            </span>
                            Instagram Intelligence
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">Automated lead discovery and multi-stage qualification engine.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={fetchData} className="p-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-all">
                            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                        <button 
                            onClick={handleToggleAutoPilot}
                            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all duration-500 ${
                                isAutoPilotRunning ? 'bg-green-500 text-white shadow-lg shadow-green-500/25' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-green-500'
                            }`}
                        >
                            <Play className={`w-4 h-4 ${isAutoPilotRunning ? 'fill-current' : 'group-hover:fill-green-500'}`} />
                            {isAutoPilotRunning ? 'Auto-Pilot Running' : 'Auto-Pilot Mode'}
                        </button>
                        <button onClick={handleClearLeads} className="flex items-center gap-2 px-6 py-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-2xl font-bold text-sm transition-all duration-300">
                            <Trash2 className="w-4 h-4" /> Clear All
                        </button>
                        <button onClick={() => setShowDiscoveryModal(true)} className="flex items-center gap-2 px-6 py-3 bg-pink-500 hover:bg-pink-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-pink-500/25 transition-all duration-300">
                            <Plus className="w-4 h-4" /> Discover Leads
                        </button>
                    </div>
                </div>

                {/* Tabs Hub */}
                <div className="flex items-center gap-1 p-1 bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5 w-fit shadow-sm">
                    {[
                        { id: 'leads', label: 'Leads Hub', icon: <Target className="w-4 h-4" /> },
                        { id: 'campaign', label: 'Campaign Center', icon: <Zap className="w-4 h-4" /> },
                        { id: 'accounts', label: 'Ghost Accounts', icon: <Users className="w-4 h-4" /> },
                        { id: 'proxies', label: 'Proxy Shield', icon: <Server className="w-4 h-4" /> },
                        { id: 'filters', label: 'Filter Rules', icon: <Filter className="w-4 h-4" /> }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                                activeTab === tab.id ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                            }`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {activeTab === 'leads' && (
                    <div className="space-y-6">
                        {/* Interactive Filter Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm">
                            <div className="flex-1 min-w-[300px] relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input 
                                    type="text" 
                                    placeholder="Search by username or industry keyword..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-xl pl-11 pr-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-pink-500/20"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">Quick Filter:</span>
                                {['all', 'discovered', 'qualified', 'rejected', 'contacted'].map(status => (
                                    <button
                                        key={status}
                                        onClick={() => setFilterStatus(status)}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                            filterStatus === status 
                                            ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/20' 
                                            : 'bg-gray-50 dark:bg-black/20 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                                        }`}
                                    >
                                        {status}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Stats Panel */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {[
                                { label: 'Total Scoped', value: stats.total, icon: <Globe className="w-5 h-5 text-blue-500" /> },
                                { label: 'Discovered', value: stats.discovered, icon: <Search className="w-5 h-5 text-indigo-500" /> },
                                { label: 'Qualified', value: stats.analyzed, icon: <CheckCircle2 className="w-5 h-5 text-green-500" /> },
                                { label: 'Rejected', value: stats.rejected, icon: <AlertCircle className="w-5 h-5 text-red-500" /> },
                                { label: 'Contacted', value: stats.contacted, icon: <Zap className="w-5 h-5 text-orange-500" /> },
                            ].map(stat => (
                                <div key={stat.label} className="bg-white dark:bg-[#1e293b] rounded-2xl p-5 border border-gray-100 dark:border-white/5 shadow-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        {stat.icon}
                                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{stat.label}</span>
                                    </div>
                                    <p className="text-2xl font-black text-gray-900 dark:text-white leading-none">{stat.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* Inventory Table */}
                        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50/50 dark:bg-gray-800/20 text-[9px] font-black text-gray-400 uppercase tracking-tight border-b border-gray-100 dark:border-white/5">
                                        <tr>
                                            <th className="px-4 py-3">Lead Handle</th>
                                            <th className="px-4 py-3">Status / Origin</th>
                                            <th className="px-4 py-3">Strategic Bio</th>
                                            <th className="px-4 py-3 text-center">Archive</th>
                                            <th className="px-4 py-3">Influence</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                        {leads.length === 0 ? (
                                            <tr><td colSpan={6} className="px-6 py-20 text-center text-gray-400 font-bold uppercase tracking-widest text-[10px]">No leads found.</td></tr>
                                        ) : (
                                            leads.map(lead => (
                                                <tr 
                                                    key={lead.id} 
                                                    className={`group transition-all duration-700 ${
                                                        autoAnalyzingId === lead.id 
                                                        ? 'bg-blue-500/10 dark:bg-blue-500/15 shadow-[inset_0_0_20px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/20' 
                                                        : 'hover:bg-gray-50 dark:hover:bg-white/[0.02]'
                                                    }`}
                                                >
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border border-white dark:border-gray-800">
                                                                {lead.profile_pic_url ? <img src={lead.profile_pic_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400"><Instagram className="w-3.5 h-3.5" /></div>}
                                                            </div>
                                                            <div className="flex flex-col">
                                                                 <span className="font-black text-gray-900 dark:text-white text-[12px] tracking-tighter truncate max-w-[100px]">@{lead.instagram_username || lead.username || 'unknown'}</span>
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-[9px] text-gray-400 font-bold lowercase truncate max-w-[80px]">{lead.full_name || 'Personal'}</span>
                                                                    {autoAnalyzingId === lead.id && (
                                                                        <span className="flex items-center gap-1 text-[8px] font-black text-blue-500 uppercase animate-pulse">
                                                                            <Loader2 className="w-2 h-2 animate-spin" /> Analyzing ⚙️
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex flex-col gap-1">
                                                            <span className={`px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-tight text-center ${getStatusStyle(lead.status)}`}>{lead.status}</span>
                                                            <div className={`px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-tighter inline-flex items-center justify-center gap-1 ${
                                                                lead.source === 'network_expansion' 
                                                                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 border border-purple-200 dark:border-purple-500/20' 
                                                                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 border border-blue-200 dark:border-blue-500/20'
                                                            }`}>
                                                                {lead.source === 'network_expansion' ? 'Follower' : 'Search'}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="max-w-[140px]">
                                                            {lead.bio ? (
                                                                <p className="text-[9px] text-gray-600 dark:text-gray-400 line-clamp-2 italic leading-tight">
                                                                    {lead.bio}
                                                                </p>
                                                            ) : (
                                                                lead.status === 'discovered' ? (
                                                                    <span className="text-[8px] text-gray-300 dark:text-gray-600 block animate-pulse">Wait Stage 2..🏎️💨</span>
                                                                ) : (
                                                                    <span className="text-[8px] text-gray-400/50 italic">No bio 🧐</span>
                                                                )
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex -space-x-1.5 isolate justify-center">
                                                            {lead.recent_posts && lead.recent_posts.length > 0 ? (
                                                                <>
                                                                    {lead.recent_posts.map((post: any, idx: number) => {
                                                                        const imageUrl = typeof post === 'string' ? post : post.display_url;
                                                                        return (
                                                                            <div 
                                                                                key={idx} 
                                                                                className="w-7 h-7 rounded-full border border-white dark:border-[#1e293b] overflow-hidden bg-gray-100 shadow-sm"
                                                                            >
                                                                                <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                                                                            </div>
                                                                        );
                                                                    })}
                                                                    <button 
                                                                        onClick={() => {
                                                                            setSelectedLead(lead);
                                                                            setShowPreviewModal(true);
                                                                        }}
                                                                        className="w-7 h-7 rounded-full border border-white dark:border-[#1e293b] bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors z-10"
                                                                    >
                                                                        <Eye className="w-3 text-gray-400" />
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <span className="text-[8px] text-gray-400 italic">No posts</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-[11px] font-black text-gray-900 dark:text-white">{lead.follower_count ? lead.follower_count.toLocaleString() : '---'}</span>
                                                                <span className="text-[8px] text-gray-400 font-bold uppercase">Fol</span>
                                                            </div>
                                                            <div className="flex items-center gap-1 border-t border-gray-100 dark:border-white/5">
                                                                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">{lead.following_count ? lead.following_count.toLocaleString() : '---'}</span>
                                                                <span className="text-[8px] text-gray-400 font-bold uppercase">Wng</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex items-center justify-end gap-1 group-hover:opacity-100 transition-opacity">
                                                            <a href={`https://instagram.com/${lead.instagram_username || lead.username}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-xl text-gray-400 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/10 transition-all"><ExternalLink className="w-4 h-4" /></a>
                                                            {lead.status === 'discarded' ? (
                                                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 text-red-500 font-black text-[9px] uppercase tracking-widest border border-red-500/20">
                                                                    <X className="w-3 h-3" /> Discarded 🗑️
                                                                </div>
                                                            ) : lead.status === 'rejected' ? (
                                                                <div className="flex items-center gap-1">
                                                                    <button
                                                                        onClick={() => handleForceHarvest(lead.id)}
                                                                        disabled={harvestingId === lead.id}
                                                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-black text-[9px] uppercase tracking-tight transition-all ${
                                                                            harvestingId === lead.id
                                                                            ? 'bg-orange-500 text-white animate-pulse'
                                                                            : 'bg-orange-500/10 text-orange-500 hover:bg-orange-500 hover:text-white border border-orange-500/20'
                                                                        }`}
                                                                        title="Force Scrape — harvest data but keep rejected status"
                                                                    >
                                                                        {harvestingId === lead.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
                                                                        {harvestingId === lead.id ? 'Scraping...' : 'Force Scrape'}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleUpdateStatus(lead.id, 'discarded')}
                                                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-black text-[9px] uppercase tracking-tight bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 transition-all"
                                                                        title="Discard permanently"
                                                                    >
                                                                        <X className="w-3 h-3" /> Discard
                                                                    </button>
                                                                </div>
                                                            ) : lead.status === 'discovered' ? (
                                                                <button onClick={() => handleAnalyze(lead.id)} disabled={analyzingId === lead.id} className={`p-2 rounded-xl transition-all ${analyzingId === lead.id ? 'bg-blue-500/10 text-blue-500 animate-pulse' : 'bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500 hover:text-white'}`} title="Identify Profile">
                                                                    {analyzingId === lead.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                                                                </button>
                                                            ) : (
                                                                <>
                                                                    {lead.is_private ? (
                                                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-500/10 text-orange-500 font-black text-[9px] uppercase tracking-widest border border-orange-500/20">
                                                                            <AlertCircle className="w-3 h-3" /> Private Profile 🔒
                                                                        </div>
                                                                    ) : (lead.status === 'vetted' || lead.status === 'harvested') ? (
                                                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-500 font-black text-[9px] uppercase tracking-widest border border-emerald-500/20">
                                                                            <CheckCircle2 className="w-3 h-3" /> Scrape Complete ✨
                                                                        </div>
                                                                    ) : lead.status === 'queued' ? (
                                                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-500/10 text-indigo-500 font-black text-[9px] uppercase tracking-widest border border-indigo-500/20 animate-pulse">
                                                                            <Clock className="w-3 h-3" /> In Queue ⏰
                                                                        </div>
                                                                    ) : (
                                                                        <button 
                                                                            onClick={() => handleHarvest(lead.id)} 
                                                                            disabled={harvestingId === lead.id} 
                                                                            className={`flex items-center gap-2 px-3 py-2 rounded-xl font-black text-[10px] uppercase tracking-tighter transition-all ${
                                                                                harvestingId === lead.id 
                                                                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' 
                                                                                : 'bg-green-500 text-white hover:bg-green-600 shadow-lg shadow-green-500/20'
                                                                            }`}
                                                                        >
                                                                            {harvestingId === lead.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
                                                                            {harvestingId === lead.id ? "Scraping..." : "Approve & Scrape"}
                                                                        </button>
                                                                    )}
                                                                    <button 
                                                                        onClick={() => handleUpdateStatus(lead.id, 'rejected')} 
                                                                        className="p-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm active:scale-95"
                                                                        title="DISCARD 🗑️❌"
                                                                    >
                                                                        <X className="w-4 h-4" />
                                                                    </button>
                                                                </>
                                                            )}
                                                            <button 
                                                                onClick={() => handleDeleteLead(lead.id)} 
                                                                className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'accounts' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-black text-gray-900 dark:text-white">Ghost Accounts</h2>
                            <div className="flex items-center gap-2">
                                <button onClick={handleFixAccounts} className="flex items-center gap-2 bg-green-500/10 hover:bg-green-500 text-green-600 hover:text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 border border-green-500/20" title="Activate all accounts for Campaign Pilot">
                                    <CheckCircle2 className="w-4 h-4" /> Activate All
                                </button>
                                <button onClick={() => setShowAccountModal(true)} className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-pink-600/25 transition-all active:scale-95"><Plus className="w-4 h-4" /> Add Account</button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {accounts.length === 0 ? (
                                <div className="col-span-3 text-center py-16 text-gray-400 text-sm font-bold uppercase tracking-widest">No ghost accounts yet. Add one to start outreach.</div>
                            ) : accounts.map(acc => (
                                <div key={acc.id} className="bg-white dark:bg-[#1e293b] rounded-2xl p-6 border border-gray-100 dark:border-white/5 shadow-sm group hover:shadow-md transition-all">
                                    <div className="flex items-start justify-between mb-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-orange-400 flex items-center justify-center shadow-lg shadow-pink-500/20">
                                                <Instagram className="w-6 h-6 text-white" />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${acc.status === 'active' ? 'bg-green-500 animate-pulse shadow-lg shadow-green-500/50' : acc.status === 'rate_limited' ? 'bg-yellow-500 animate-pulse shadow-lg shadow-yellow-500/50' : 'bg-gray-300 dark:bg-gray-600'}`}></span>
                                                    <span className={`text-[10px] font-black uppercase tracking-widest ${acc.status === 'active' ? 'text-green-500' : acc.status === 'rate_limited' ? 'text-yellow-500' : 'text-gray-400'}`}>
                                                        {acc.status === 'rate_limited' ? 'Limit Reached ⏳' : (acc.status || 'inactive')}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-gray-400 font-medium">{acc.proxy_host ? `🛡️ ${acc.proxy_host}` : '🌐 Direct IP'}</span>
                                                    <span className="text-[10px] bg-gray-100 dark:bg-gray-700/50 text-gray-500 px-1.5 py-0.5 rounded font-medium border border-gray-200 dark:border-gray-600">
                                                        ⏱️ {timeAgo(acc.last_used_at)}
                                                    </span>
                                                </div>

                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleDeleteAccount(acc.id)} 
                                            className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <h3 className="font-black text-gray-900 dark:text-white text-sm tracking-tight">@{acc.username}</h3>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'proxies' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-black text-gray-900 dark:text-white">Proxy Shield Pool</h2>
                            <button onClick={() => setShowProxyModal(true)} className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-pink-600/25 transition-all active:scale-95"><Plus className="w-4 h-4" /> Add Proxy</button>
                        </div>
                        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5 overflow-hidden shadow-sm">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-white/5">
                                    <tr><th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Host</th><th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Port</th><th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th><th className="px-6 py-4 text-right tracking-widest">Actions</th></tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                    {proxies.map(p => (
                                        <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors group"><td className="px-6 py-4 text-sm font-bold text-gray-900 dark:text-white">{p.host}</td><td className="px-6 py-4 text-sm text-gray-500">{p.port}</td><td className="px-6 py-4"><span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${p.is_working ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{p.is_working ? 'Healthy Shield' : 'Error'}</span></td><td className="px-6 py-4 text-right"><button onClick={() => handleDeleteProxy(p.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button></td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'campaign' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-2 space-y-6">
                                <div className="bg-white dark:bg-[#1e293b] rounded-3xl p-8 border border-gray-100 dark:border-white/5 shadow-sm">
                                    <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2 flex items-center gap-3">
                                        <Zap className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                                        Outreach Script Management
                                    </h3>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 font-medium">Draft your campaign message. Use the <span className="text-pink-500 font-bold">[username]</span> tag to personalize every message 🪄</p>
                                    
                                    <div className="relative">
                                        <textarea 
                                            value={messageTemplate}
                                            onChange={(e) => setMessageTemplate(e.target.value)}
                                            className="w-full bg-gray-50 dark:bg-black/20 border-2 border-gray-100 dark:border-white/5 rounded-2xl p-6 text-sm font-medium text-gray-700 dark:text-gray-300 focus:ring-4 focus:ring-pink-500/10 focus:border-pink-500/50 outline-none min-h-[200px] transition-all"
                                            placeholder="Write your DM script here..."
                                        />
                                        <div className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-1 bg-white dark:bg-gray-800 rounded-lg text-[10px] font-black text-gray-400 uppercase tracking-widest border border-gray-100 dark:border-white/5 shadow-sm">
                                            {messageTemplate.length} Characters
                                        </div>
                                    </div>

                                    <div className="mt-8 flex items-center justify-between gap-4 p-6 bg-pink-500/5 rounded-2xl border border-pink-500/10">
                                        <div>
                                            <h4 className="font-black text-pink-600 text-sm uppercase tracking-widest mb-1">Campaign Status</h4>
                                            <p className="text-xs text-gray-500 font-medium italic">Ready to engage {leads.filter(l => l.status === 'qualified' || l.status === 'analyzed').length} qualified leads.</p>
                                        </div>
                                        <button 
                                            onClick={handleToggleCampaign}
                                            className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-sm tracking-tight transition-all shadow-xl active:scale-95 ${
                                                isCampaignRunning 
                                                ? 'bg-red-500 text-white shadow-red-500/20' 
                                                : 'bg-pink-500 text-white shadow-pink-500/25 hover:bg-pink-600'
                                            }`}
                                        >
                                            {isCampaignRunning ? (
                                                <><RefreshCw className="w-4 h-4 animate-spin" /> Stop outreach</>
                                            ) : (
                                                <><Zap className="w-4 h-4 fill-current" /> Launch Outreach Pilot</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-8 text-white shadow-xl shadow-indigo-500/20">
                                    <Globe className="w-10 h-10 mb-6 opacity-20" />
                                    <h4 className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-60">Ready to engage</h4>
                                    <p className="text-4xl font-black tracking-tighter mb-4">{leads.filter(l => l.status === 'qualified' || l.status === 'analyzed').length}</p>
                                    <p className="text-xs font-medium opacity-80 leading-relaxed italic">The Stage 4 Engine will rotate through your {accounts.length} ghost accounts to deliver these messages safely.</p>
                                    
                                    <div className="mt-8 h-2 bg-white/20 rounded-full overflow-hidden">
                                        <div className="h-full bg-white animate-pulse" style={{ width: '100%' }}></div>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-[#1e293b] rounded-3xl p-6 border border-gray-100 dark:border-white/5 shadow-sm">
                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Pilot Intelligence</h4>
                                    <div className="space-y-4">
                                        {[
                                            { label: 'Ghost Rotation', val: 'Active', color: 'green' },
                                            { label: 'Safety Delay', val: '12-25s', color: 'blue' },
                                            { label: 'Outreach Success', val: 'Pending', color: 'gray' }
                                        ].map(item => (
                                            <div key={item.label} className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-gray-500">{item.label}</span>
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-tighter bg-${item.color}-500/10 text-${item.color}-500`}>{item.val}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'filters' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-2 space-y-6">
                                <div className="bg-white dark:bg-[#1e293b] rounded-3xl p-8 border border-gray-100 dark:border-white/5 shadow-sm">
                                    <h3 className="text-xl font-black text-gray-900 dark:text-white mb-1 flex items-center gap-3">
                                        <Filter className="w-5 h-5 text-purple-500" /> Bio Keyword Filter
                                    </h3>
                                    <p className="text-sm text-gray-500 mb-6">Only leads whose bio contains <span className="font-bold text-purple-500">at least one</span> of these words will be <span className="font-bold text-green-500">Qualified</span>. Leave empty to allow everyone.</p>
                                    <input
                                        type="text"
                                        value={filterSettings.bio_keywords}
                                        onChange={e => setFilterSettings(p => ({ ...p, bio_keywords: e.target.value }))}
                                        placeholder="luxury, agency, watches, brand, coach..."
                                        className="w-full bg-gray-50 dark:bg-black/20 border-2 border-gray-100 dark:border-white/5 rounded-2xl px-5 py-4 text-sm font-medium text-gray-700 dark:text-gray-300 focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500/50 outline-none transition-all"
                                    />
                                    <p className="text-xs text-gray-400 mt-2 ml-1">Separate keywords with commas. Case-insensitive.</p>
                                </div>

                                <div className="bg-white dark:bg-[#1e293b] rounded-3xl p-8 border border-gray-100 dark:border-white/5 shadow-sm">
                                    <h3 className="text-xl font-black text-gray-900 dark:text-white mb-1 flex items-center gap-3">
                                        <Users className="w-5 h-5 text-blue-500" /> Follower Range Filter
                                    </h3>
                                    <p className="text-sm text-gray-500 mb-6">Set both to 0 to disable.</p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Min Followers</label>
                                            <input type="number" value={filterSettings.min_followers} onChange={e => setFilterSettings(p => ({ ...p, min_followers: parseInt(e.target.value) || 0 }))} className="w-full bg-gray-50 dark:bg-black/20 border-2 border-gray-100 dark:border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-gray-700 dark:text-gray-300 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 outline-none transition-all" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Max Followers</label>
                                            <input type="number" value={filterSettings.max_followers} onChange={e => setFilterSettings(p => ({ ...p, max_followers: parseInt(e.target.value) || 0 }))} className="w-full bg-gray-50 dark:bg-black/20 border-2 border-gray-100 dark:border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-gray-700 dark:text-gray-300 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 outline-none transition-all" />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-[#1e293b] rounded-3xl p-8 border border-gray-100 dark:border-white/5 shadow-sm">
                                    <h3 className="text-xl font-black text-gray-900 dark:text-white mb-1 flex items-center gap-3">
                                        <Instagram className="w-5 h-5 text-pink-500" /> Visual Target Samples
                                    </h3>
                                    <p className="text-sm text-gray-500 mb-6">Upload photos of products, logos, or styles you want to find. We'll find leads posting similar content.</p>
                                    
                                    <div className="flex flex-wrap gap-4 mb-6">
                                        {(filterSettings.sample_hashes || []).map((h, i) => (
                                            <div key={i} className="relative group">
                                                <div className="w-20 h-20 bg-gray-100 dark:bg-black/40 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-white/10 overflow-hidden">
                                                    <div className="text-[10px] font-mono text-gray-400 opacity-50 select-none">#{h.substring(0,6)}</div>
                                                </div>
                                                <button 
                                                    onClick={() => setFilterSettings(p => ({ ...p, sample_hashes: p.sample_hashes.filter((_, idx) => idx !== i) }))}
                                                    className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                        <label className="w-20 h-20 bg-pink-500/10 hover:bg-pink-500/20 text-pink-500 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-pink-500/30 cursor-pointer transition-all active:scale-95 group">
                                            {isUploadingImage ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                                            <span className="text-[8px] font-black uppercase mt-1">Upload</span>
                                            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploadingImage} />
                                        </label>
                                    </div>
                                </div>

                                <button
                                    onClick={async () => {
                                        setIsSavingFilters(true);
                                        try {
                                            await instagramAPI.saveFilterSettings(filterSettings);
                                            setNotification({ msg: '✅ Filter rules saved! Auto-Pilot will apply them on next run.', type: 'success' });
                                        } catch { setNotification({ msg: 'Failed to save filters.', type: 'alert' }); }
                                        finally { setIsSavingFilters(false); }
                                    }}
                                    disabled={isSavingFilters}
                                    className="w-full flex items-center justify-center gap-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-8 py-4 rounded-2xl font-black text-sm transition-all shadow-xl shadow-purple-500/20 active:scale-95"
                                >
                                    {isSavingFilters ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                    {isSavingFilters ? 'Saving...' : 'Save Filter Rules'}
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-3xl p-8 text-white shadow-xl shadow-purple-500/20">
                                    <Filter className="w-10 h-10 mb-4 opacity-20" />
                                    <h4 className="text-[10px] font-black uppercase tracking-widest mb-4 opacity-60">Active Rules Preview</h4>
                                    <div className="space-y-3">
                                        <div className="bg-white/10 rounded-xl p-3">
                                            <p className="text-[10px] font-black uppercase opacity-60 mb-1">Bio Keywords</p>
                                            <p className="font-bold text-sm">{filterSettings.bio_keywords || <span className="opacity-40 italic">None — all pass</span>}</p>
                                        </div>
                                        <div className="bg-white/10 rounded-xl p-3">
                                            <p className="text-[10px] font-black uppercase opacity-60 mb-1">Followers</p>
                                            <p className="font-bold text-sm">
                                                {filterSettings.min_followers === 0 && filterSettings.max_followers === 0
                                                    ? <span className="opacity-40 italic">No limit</span>
                                                    : `${filterSettings.min_followers.toLocaleString()} – ${filterSettings.max_followers > 0 ? filterSettings.max_followers.toLocaleString() : '∞'}`
                                                }
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white dark:bg-[#1e293b] rounded-3xl p-6 border border-gray-100 dark:border-white/5 shadow-sm">
                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">How It Works</h4>
                                    <div className="space-y-3 text-xs text-gray-500 font-medium leading-relaxed">
                                        <p>🔍 Auto-Pilot scans each profile after discovery.</p>
                                        <p>✅ Match your rules → <span className="text-green-500 font-bold">Qualified</span></p>
                                        <p>⛔ Don't match → <span className="text-red-500 font-bold">Rejected</span></p>
                                        <p>📨 Campaign only DMs <span className="font-bold">Qualified</span> leads.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modals */}
            {showDiscoveryModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-[#1e293b] rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-8">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="p-3 bg-pink-100 dark:bg-pink-900/30 rounded-2xl"><Globe className="w-6 h-6 text-pink-600" /></div>
                                <div><h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Stage 1 Discovery</h2><p className="text-gray-500 text-sm">Find profiles via Google/DDG Indexing.</p></div>
                            </div>
                            <textarea placeholder="e.g. Luxury Watches, Pizza Paris" className="w-full bg-gray-50 dark:bg-gray-800/50 border-none rounded-2xl p-4 text-sm text-gray-900 dark:text-white" rows={4} value={keywords} onChange={e => setKeywords(e.target.value)} disabled={isDiscovering} />
                            <div className="flex items-center gap-3 mt-8">
                                <button onClick={() => setShowDiscoveryModal(false)} className="flex-1 px-6 py-3 rounded-2xl font-bold text-sm text-gray-400 transition-colors">Cancel</button>
                                <button onClick={handleDiscover} disabled={isDiscovering || !keywords.trim()} className="flex-[2] bg-pink-600 hover:bg-pink-700 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-lg shadow-pink-600/25 transition-all">
                                    {isDiscovering ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Start Discovery'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showAccountModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-[#1e293b] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-8">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-xl font-black text-gray-900 dark:text-white">Add Ghost Account</h2>
                            </div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">Authorize via Bundle String 🛰️</p>
                            
                            <div className="space-y-4">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Ghost Identity 👤</p>
                                        <input 
                                            type="text" 
                                            placeholder="Instagram Username" 
                                            className="w-full bg-gray-50 dark:bg-gray-800/50 border-2 border-gray-100 dark:border-white/5 rounded-2xl p-4 text-sm font-bold text-gray-900 dark:text-white focus:border-pink-500/50 outline-none transition-all"
                                            value={newAccount.username}
                                            onChange={e => setNewAccount({...newAccount, username: e.target.value})}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Access Key 🔒</p>
                                        <div className="relative">
                                            <input 
                                                type={showPass ? "text" : "password"} 
                                                placeholder="Account Password" 
                                                className="w-full bg-gray-50 dark:bg-gray-800/50 border-2 border-gray-100 dark:border-white/5 rounded-2xl p-4 pr-12 text-sm font-bold text-gray-900 dark:text-white focus:border-pink-500/50 outline-none transition-all"
                                                value={newAccount.password}
                                                onChange={e => setNewAccount({...newAccount, password: e.target.value})}
                                            />
                                            <button 
                                                type="button"
                                                onClick={() => setShowPass(!showPass)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                                            >
                                                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-gray-400 font-medium pl-1">✨ Standard authorization flow. Pro-identity encryption active.</p>

                                    <div className="pt-4 border-t border-gray-100 dark:border-white/5">
                                        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest pl-1 mb-3 flex items-center gap-2">
                                            <Globe className="w-3 h-3" />
                                            Manual Session Bypass (SECRET TUNNEL)
                                        </p>
                                        <input 
                                            type="text" 
                                            placeholder="Paste 'sessionid' from browser cookies" 
                                            className="w-full bg-indigo-50/30 dark:bg-indigo-900/10 border-2 border-indigo-100 dark:border-indigo-500/20 rounded-2xl p-4 text-[10px] font-mono text-indigo-600 dark:text-indigo-300 focus:border-indigo-500 outline-none transition-all"
                                            value={newAccount.session_id}
                                            onChange={e => setNewAccount({...newAccount, session_id: e.target.value})}
                                        />
                                        <p className="text-[9px] text-gray-400 mt-2 italic px-1">💡 Pro Tip: Bypasses "Incorrect Password" IP blocks by using your trusted browser session.</p>
                                    </div>
                                </div>

                                {needs2FA && (
                                    <div className="pt-2 animate-in slide-in-from-top-4 duration-300">
                                        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                                            Verification Code / 2FA (REQUIRED)
                                        </p>
                                        <input 
                                            type="text" 
                                            placeholder="Enter 6-Digit Code" 
                                            className="w-full bg-indigo-50/50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-500/40 rounded-xl p-4 text-sm font-black text-indigo-600 dark:text-indigo-400 outline-none focus:border-indigo-500 shadow-inner transition-all"
                                            value={newAccount.verification_code}
                                            onChange={e => setNewAccount({...newAccount, verification_code: e.target.value})}
                                            autoFocus
                                        />
                                        <p className="text-[9px] text-gray-400 mt-2 font-medium">🛡️ Enter the code from your app to satisfy the security challenge.</p>
                                    </div>
                                )}
                                
                                <div className="pt-2">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Assign Proxy Shield (Optional)</p>
                                    <select className="w-full bg-gray-50 dark:bg-gray-800/50 border-none rounded-xl p-4 text-sm text-gray-500 font-bold" value={newAccount.proxy_id} onChange={e => setNewAccount({...newAccount, proxy_id: e.target.value})}>
                                        <option value="">No Proxy (Local IP)</option>
                                        {proxies.map(p => <option key={p.id} value={p.id.toString()}>{p.host}:{p.port}</option>)}
                                    </select>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-3 mt-8">
                                <button onClick={() => setShowAccountModal(false)} className="px-6 py-3 font-bold text-sm text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
                                <button 
                                    onClick={handleAddAccount} 
                                    disabled={!newAccount.username || !newAccount.password || (needs2FA && !newAccount.verification_code) || isAuthorizing}
                                    className="flex-1 bg-gradient-to-tr from-pink-600 to-orange-500 hover:from-pink-700 hover:to-orange-600 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-xl shadow-pink-500/20 disabled:opacity-50 transition-all active:scale-95"
                                >
                                    {isAuthorizing ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Authorizing...</span>
                                        </div>
                                    ) : 'Authorize Account 🚀'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showProxyModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-[#1e293b] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-8">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-xl font-black text-gray-900 dark:text-white">Add Proxy Shield</h2>
                            </div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">Activate Shield via String 🌐</p>
                            
                            <div className="space-y-4">
                                <div className="space-y-3">
                                    <textarea 
                                        placeholder="user:pass:ip:port or ip:port:user:pass" 
                                        className="w-full bg-gray-50 dark:bg-gray-800/50 border-2 border-dashed border-gray-200 dark:border-white/10 rounded-2xl p-4 text-xs font-mono text-gray-600 dark:text-gray-300 min-h-[100px] focus:border-pink-500/50 outline-none transition-all"
                                        value={newProxy.bundle}
                                        onChange={e => setNewProxy({...newProxy, bundle: e.target.value})}
                                    />
                                    <p className="text-[10px] text-gray-400 font-medium">✨ System extraction ready. All protocols supported.</p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-3 mt-8">
                                <button onClick={() => setShowProxyModal(false)} className="px-6 py-3 font-bold text-sm text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
                                <button 
                                    onClick={handleAddProxy} 
                                    disabled={!newProxy.bundle}
                                    className="flex-1 bg-gradient-to-tr from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-xl shadow-purple-500/20 active:scale-95 disabled:opacity-50 transition-all"
                                >
                                    Activate Shield 🛡️
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Enhanced Post & Network Preview Modal */}
            {showPreviewModal && selectedLead && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
                    <div className="bg-white dark:bg-[#1e293b] rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden border border-white/10 animate-in fade-in zoom-in duration-300">
                        <div className="p-8">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl">
                                        <Users className="w-6 h-6 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">
                                            @{selectedLead.instagram_username || selectedLead.username}
                                        </h2>
                                        <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">In-Depth Lead Intelligence 🛰️</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setShowPreviewModal(false)}
                                    className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors"
                                >
                                    <X className="w-6 h-6 text-gray-400" />
                                </button>
                            </div>

                            <div className="bg-gray-50 dark:bg-black/20 rounded-2xl p-6 mb-8 border border-gray-100 dark:border-white/5">
                                <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-3">Professional Biography 🛰️</h3>
                                {selectedLead.bio ? (
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 leading-relaxed italic">
                                        "{selectedLead.bio}"
                                    </p>
                                ) : (
                                    <p className="text-sm text-gray-400 italic">No biography available for this profile.</p>
                                )}
                            </div>

                            <div className="max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Content Archive 📸</h3>
                                <div className="grid grid-cols-3 gap-4">
                                    {selectedLead.recent_posts && selectedLead.recent_posts.length > 0 ? (
                                        selectedLead.recent_posts.map((post: any, idx: number) => {
                                            const imageUrl = typeof post === 'string' ? post : post.display_url;
                                            return (
                                                <div key={idx} className="aspect-square rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 shadow-inner group relative">
                                                    <img src={imageUrl} alt={`Post ${idx + 1}`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                                    <a 
                                                        href={post.url || '#'} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3"
                                                    >
                                                        <span className="text-[10px] text-white font-black uppercase tracking-widest">View Full</span>
                                                    </a>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="col-span-3 py-10 text-center flex flex-col items-center">
                                            <div className="w-12 h-12 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4"><AlertCircle className="w-6 h-6 text-gray-300" /></div>
                                            <p className="text-gray-400 font-bold uppercase tracking-widest text-[9px]">Gallery is empty for this lead</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-8 flex justify-center">
                                <button 
                                    onClick={() => setShowPreviewModal(false)}
                                    className="px-10 py-3 bg-gray-900 dark:bg-white text-white dark:text-black rounded-2xl font-black text-sm transition-transform active:scale-95 shadow-xl shadow-gray-300/30 dark:shadow-none"
                                >
                                    Finish Inspection
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InstagramLeadGenerator;
