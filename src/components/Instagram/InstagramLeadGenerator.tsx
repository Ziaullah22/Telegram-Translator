import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Instagram,
    Search,
    Globe,
    UserCheck,
    Users,
    Plus,
    Trash2,
    RefreshCw,
    Play,
    Zap,
    AlertCircle,
    AlertTriangle,
    Clock,
    CheckCircle2,
    ExternalLink,
    Eye,
    EyeOff,
    Loader2,
    Server,
    X,
    Edit3,
    Upload,
    Target,
    Filter,
    Sparkles,
    Brain,
    MessageSquare,
    Wand2,
    ChevronRight,
    Hash,
    Send
} from 'lucide-react';
import { instagramAPI, api } from '../../services/api';
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

const getDisplayEngineName = (provider?: string) => {
    if (!provider) return 'AI Engine';
    if (provider.includes('Ollama')) return provider;
    if (provider.includes('None') || provider.includes('Fallback')) return 'Fallback AI';
    return `${provider.split(' ')[0]} AI`;
};

const InstagramLeadGenerator: React.FC = () => {
    const fetchRequestRef = useRef(0);
    const [leads, setLeads] = useState<any[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalLeadsCount, setTotalLeadsCount] = useState(0);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [proxies, setProxies] = useState<any[]>([]);
    const [stats, setStats] = useState({ total: 0, discovered: 0, analyzed: 0, rejected: 0, contacted: 0, converted: 0 });
    const [activeTab, setActiveTab] = useState<'leads' | 'accounts' | 'proxies' | 'campaign' | 'filters'>('leads');
    const [messageTemplate, setMessageTemplate] = useState('Hello [username], I saw your profile and loved your content! We help brands like yours grow. Would you be open to a quick chat?');
    const [isCampaignRunning, setIsCampaignRunning] = useState(false);
    const [filterSettings, setFilterSettings] = useState<{
        bio_keywords: string,
        min_followers: number,
        max_followers: number,
        sample_hashes: string[],
        visual_niche: string,
        minimax_api_key: string,
        enable_ai_filter: boolean,
        google_niche_filter: string,
        ai_model: string,
        bio_exclude_keywords: string,
        bio_cities_whitelist: string,
        enable_ai_analysis: boolean,
        ai_intent_filter: string
    }>({
        bio_keywords: '',
        min_followers: 0,
        max_followers: 0,
        sample_hashes: [],
        visual_niche: '',
        minimax_api_key: '',
        enable_ai_filter: false,
        google_niche_filter: '',
        ai_model: 'minimax-text-01',
        bio_exclude_keywords: '',
        bio_cities_whitelist: '',
        enable_ai_analysis: true,
        ai_intent_filter: ''
    });
    const [isSavingFilters, setIsSavingFilters] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [analyzingId, setAnalyzingId] = useState<number | null>(null);
    const [harvestingId, setHarvestingId] = useState<number | null>(null);
    const [statusUpdates, setStatusUpdates] = useState<Record<number, string>>({});
    const [autoAnalyzingId, setAutoAnalyzingId] = useState<number | null>(null);
    const [isAutoPilotRunning, setIsAutoPilotRunning] = useState(false);
    const [restTimer, setRestTimer] = useState<number | null>(null);
    const [bulkUploading, setBulkUploading] = useState<'accounts' | 'proxies' | null>(null);
    const [connectingIds, setConnectingIds] = useState<Set<number>>(new Set());
    const [connectedIds, setConnectedIds] = useState<Set<number>>(new Set());

    // Live Discovery HUD states
    const [discoveryProgressMessage, setDiscoveryProgressMessage] = useState<string | null>(null);
    const [discoveryStartTime, setDiscoveryStartTime] = useState<number | null>(null);
    const [discoveryTimer, setDiscoveryTimer] = useState<string>('00:00');

    // Modals
    const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [showProxyModal, setShowProxyModal] = useState(false);
    const [showBulkProxyModal, setShowBulkProxyModal] = useState(false);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [showAuditModal, setShowAuditModal] = useState(false);
    const [showTraceModal, setShowTraceModal] = useState(false);

    const [selectedLead, setSelectedLead] = useState<any>(null);

    // Form States
    const [keywords, setKeywords] = useState('');

    // 🤖 AI Keyword Suggestion States
    const [aiDiscoveryStep, setAiDiscoveryStep] = useState<'chat' | 'review'>('chat');
    const [aiSeedInput, setAiSeedInput] = useState('');
    const [aiChatHistory, setAiChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
    const [aiChatInput, setAiChatInput] = useState('');
    const [aiSuggestedKeywords, setAiSuggestedKeywords] = useState<string[]>([]);
    const [aiKeywordCount, setAiKeywordCount] = useState(20);
    const [isAiThinking, setIsAiThinking] = useState(false);
    const [aiProxyInfo, setAiProxyInfo] = useState<{ count: number; mode: string; time_estimate: string } | null>(null);
    const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
    const [aiProvider, setAiProvider] = useState<string>('');
    const [keywordModel, setKeywordModel] = useState<string>('auto');
    const aiChatEndRef = useRef<HTMLDivElement>(null);

    // 🤖 AI Bad Keyword Suggestion States (Filter block list)
    const [showBadKeywordsModal, setShowBadKeywordsModal] = useState(false);
    const [badAiDiscoveryStep, setBadAiDiscoveryStep] = useState<'chat' | 'review'>('chat');
    const [badAiSeedInput, setBadAiSeedInput] = useState('');
    const [badAiChatHistory, setBadAiChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
    const [badAiChatInput, setBadAiChatInput] = useState('');
    const [badAiSuggestedKeywords, setBadAiSuggestedKeywords] = useState<string[]>([]);
    const [badAiKeywordCount, setBadAiKeywordCount] = useState(20);
    const [isBadAiThinking, setIsBadAiThinking] = useState(false);
    const [badSelectedKeywords, setBadSelectedKeywords] = useState<Set<string>>(new Set());
    const [badAiProvider, setBadAiProvider] = useState<string>('');
    const [badKeywordModel, setBadKeywordModel] = useState<string>('auto');
    const badAiChatEndRef = useRef<HTMLDivElement>(null);

    // 🤖 AI Cities Whitelist Suggestion States
    const [showCitiesModal, setShowCitiesModal] = useState(false);
    const [citiesAiDiscoveryStep, setCitiesAiDiscoveryStep] = useState<'chat' | 'review'>('chat');
    const [citiesAiSeedInput, setCitiesAiSeedInput] = useState('');
    const [citiesAiChatHistory, setCitiesAiChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
    const [citiesAiChatInput, setCitiesAiChatInput] = useState('');
    const [citiesAiSuggestedKeywords, setCitiesAiSuggestedKeywords] = useState<string[]>([]);
    const [citiesAiKeywordCount, setCitiesAiKeywordCount] = useState(50);
    const [isCitiesAiThinking, setIsCitiesAiThinking] = useState(false);
    const [citiesSelectedKeywords, setCitiesSelectedKeywords] = useState<Set<string>>(new Set());
    const [citiesAiProvider, setCitiesAiProvider] = useState<string>('');
    const citiesAiChatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (citiesAiChatEndRef.current) {
            citiesAiChatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [citiesAiChatHistory, isCitiesAiThinking]);

    useEffect(() => {
        if (badAiChatEndRef.current) {
            badAiChatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [badAiChatHistory, isBadAiThinking]);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [notification, setNotification] = useState<{ msg: string, type: 'success' | 'alert' } | null>(null);
    const [newAccount, setNewAccount] = useState({ username: '', password: '', proxy_id: '', bundle: '', verification_code: '', session_id: '' });
    const [bulkAccountsString, setBulkAccountsString] = useState('');
    const [isBulkAdding, setIsBulkAdding] = useState(false);
    const [bulkProxyString, setBulkProxyString] = useState('');
    const [isBulkAddingProxies, setIsBulkAddingProxies] = useState(false);
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

    const fetchData = useCallback(async () => {
        const requestId = ++fetchRequestRef.current;
        try {
            setIsLoading(true);
            const [leadsRes, statsData, accountsData, proxiesData] = await Promise.all([
                instagramAPI.getLeads({
                    status: filterStatus === 'all' ? undefined : filterStatus,
                    keyword: searchQuery || undefined,
                    limit: pageSize,
                    offset: (currentPage - 1) * pageSize
                }),
                instagramAPI.getStats(),
                instagramAPI.getAccounts(),
                instagramAPI.getProxies()
            ]);
            
            if (requestId !== fetchRequestRef.current) {
                return; // Stale request — a newer one is in flight, discard this
            }

            if (leadsRes && Array.isArray(leadsRes.leads)) {
                setLeads(leadsRes.leads);
                setTotalLeadsCount(typeof leadsRes.total === 'number' ? leadsRes.total : leadsRes.leads.length);
            } else if (leadsRes && Array.isArray(leadsRes)) {
                // Fallback: plain array (shouldn't happen with current backend)
                setLeads(leadsRes);
                setTotalLeadsCount((leadsRes as any[]).length);
            } else {
                setLeads([]);
                setTotalLeadsCount(0);
            }
            setStats(statsData);
            setAccounts(accountsData);
            setProxies(proxiesData);
        } catch (error) {
            console.error('Failed to fetch Instagram data:', error);
        } finally {
            if (requestId === fetchRequestRef.current) {
                setIsLoading(false);
            }
        }
    }, [currentPage, pageSize, filterStatus, searchQuery]);

    const { onMessage } = useSocket();

    useEffect(() => {
        const unsubscribe = onMessage((message: any) => {
            if (message.type === 'error_notification') {
                setNotification({ msg: message.message, type: 'alert' });
            } else if (message.type === 'instagram_lead_updated' || message.type === 'new_lead_discovered') {
                // 🛰️ INSTANT SYNC: Leads pop into the table the millisecond they are found!
                if (message.current_action) {
                    setStatusUpdates(prev => ({ ...prev, [message.lead_id]: message.current_action }));
                }
                fetchData();
                // If the updated lead is the one we are harvesting, clear the stuck state
                if (message.type === 'instagram_lead_updated') {
                    setHarvestingId((currentHarvestingId) => {
                        if (currentHarvestingId === message.lead_id) {
                            return null;
                        }
                        return currentHarvestingId;
                    });
                }
            } else if (message.type === 'auto_analyze_started') {
                setAutoAnalyzingId(message.lead_id);
                setRestTimer(null);
            } else if (message.type === 'auto_analyze_finished') {
                setAutoAnalyzingId(null);
                fetchData(); // Refresh to show the new 'qualified/vetted' status immediately!
            } else if (message.type === 'auto_analyze_resting') {
                setRestTimer(message.duration);
                setAutoAnalyzingId(null);
            } else if (message.type === 'discovery_progress') {
                setIsDiscovering(true);
                setDiscoveryProgressMessage(message.message);
                setDiscoveryStartTime(prev => prev || Date.now());
            } else if (message.type === 'discovery_finished') {
                setIsDiscovering(false);
                setDiscoveryProgressMessage(null);
                setDiscoveryStartTime(null);
                setNotification({ msg: message.message, type: 'success' });
                fetchData();
            } else if (message.type === 'filter_settings_updated') {
                setFilterSettings(prev => ({ ...prev, ...message.settings }));
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

    // Reset page index on query or filter status changes
    useEffect(() => {
        setCurrentPage(1);
    }, [filterStatus, searchQuery]);

    // Refetch data whenever fetchData identity changes (i.e. when any of its deps change)
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        // Load saved filter settings
        instagramAPI.getFilterSettings()
            .then((s: any) => setFilterSettings({
                bio_keywords: s.bio_keywords || '',
                min_followers: s.min_followers || 0,
                max_followers: s.max_followers || 0,
                sample_hashes: s.sample_hashes || [],
                visual_niche: s.visual_niche || '',
                minimax_api_key: s.minimax_api_key || '',
                enable_ai_filter: !!s.enable_ai_filter,
                google_niche_filter: s.google_niche_filter || '',
                ai_model: s.ai_model === 'ollama-local' ? 'gemma4' : (s.ai_model || 'minimax-text-01'),
                bio_exclude_keywords: s.bio_exclude_keywords || '',
                bio_cities_whitelist: s.bio_cities_whitelist || '',
                enable_ai_analysis: s.enable_ai_analysis !== undefined ? s.enable_ai_analysis : true,
                ai_intent_filter: s.ai_intent_filter || ''
            }))
            .catch(() => { });
    }, []);

    useEffect(() => {
        const checkPilotStatus = async () => {
            try {
                const [autoStatus, campStatus, discStatus] = await Promise.all([
                    instagramAPI.getAutoPilotStatus(),
                    instagramAPI.getCampaignStatus(),
                    instagramAPI.getDiscoveryStatus()
                ]);
                setIsAutoPilotRunning(autoStatus.is_running);
                setIsCampaignRunning(campStatus.is_running);

                if (discStatus.active) {
                    setIsDiscovering(true);
                    setDiscoveryProgressMessage(discStatus.progress);
                    setDiscoveryStartTime(prev => prev || Date.now());
                } else {
                    setIsDiscovering(false);
                    setDiscoveryProgressMessage(null);
                    setDiscoveryStartTime(null);
                }
            } catch (error) {
                console.error('Failed to get pilot status:', error);
            }
        };
        checkPilotStatus();
        const pilotStatusInterval = setInterval(checkPilotStatus, 15000);
        return () => clearInterval(pilotStatusInterval);
    }, []);

    // ⏱️ Real-time Discovery Stopwatch Timer
    useEffect(() => {
        if (!isDiscovering || !discoveryStartTime) {
            setDiscoveryTimer('00:00');
            return;
        }

        const interval = setInterval(() => {
            const elapsedMs = Date.now() - discoveryStartTime;
            const totalSecs = Math.floor(elapsedMs / 1000);
            const mins = Math.floor(totalSecs / 60);
            const secs = totalSecs % 60;
            const minStr = mins < 10 ? `0${mins}` : `${mins}`;
            const secStr = secs < 10 ? `0${secs}` : `${secs}`;
            setDiscoveryTimer(`${minStr}:${secStr}`);
        }, 1000);

        return () => clearInterval(interval);
    }, [isDiscovering, discoveryStartTime]);

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

    // Timer effect for Auto-Pilot Resting
    useEffect(() => {
        let interval: any;
        if (restTimer !== null && restTimer > 0) {
            interval = setInterval(() => {
                setRestTimer(prev => (prev !== null && prev > 0) ? prev - 1 : null);
            }, 1000);
        } else if (restTimer === 0) {
            setRestTimer(null);
        }
        return () => clearInterval(interval);
    }, [restTimer]);

    // Timer effect for Auto-Pilot Resting
    useEffect(() => {
        let interval: any;
        if (restTimer !== null && restTimer > 0) {
            interval = setInterval(() => {
                setRestTimer(prev => (prev !== null && prev > 0) ? prev - 1 : null);
            }, 1000);
        } else if (restTimer === 0) {
            setRestTimer(null);
        }
        return () => clearInterval(interval);
    }, [restTimer]);

    const notify = (msg: string, type: 'success' | 'alert' = 'success') => setNotification({ msg, type });

    const handleBulkUploadAccounts = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBulkUploading('accounts');
        console.log('🚀 Deploying Ghost Fleet via file:', file.name);
        try {
            await instagramAPI.bulkUploadAccounts(file);
            fetchData();
            notify('🛸 Ghost Unit Reinforced!');
            setShowBulkModal(false);
        } catch (err) {
            console.error('❌ Bulk Account Deployment Failed:', err);
            notify('Upload failed.', 'alert');
        } finally {
            setBulkUploading(null);
            // Reset input value so same file can be uploaded again if needed
            e.target.value = '';
        }
    };

    const handleBulkUploadProxies = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBulkUploading('proxies');
        console.log('🛰️ Expanding Network Shield via file:', file.name);
        try {
            await instagramAPI.bulkUploadProxies(file);
            fetchData();
            notify('🛰️ Network Shield Expanded!');
            setShowBulkProxyModal(false);
        } catch (err) {
            console.error('❌ Proxy Sync Failed:', err);
            notify('Proxy sync failed.', 'alert');
        } finally {
            setBulkUploading(null);
            e.target.value = '';
        }
    };

    /*
    const handleDiscover = async () => {
        if (!keywords.trim()) return;
        setIsDiscovering(true);
        setDiscoveryStartTime(Date.now());
        setDiscoveryProgressMessage('Initiating background lead discovery...');
        setShowDiscoveryModal(false);
        setKeywords('');
        setNotification({ msg: '🚀 Discovery started in background! Live progress HUD active.', type: 'success' });
        
        try {
            const keywordList = keywords.split(',').map(k => k.trim()).filter(k => k);
            await instagramAPI.discoverLeads(keywordList);
            // 🧹 After discovery, auto-deduplicate in background
            setTimeout(async () => {
                try {
                    const dedupResult = await instagramAPI.deduplicateLeads();
                    if (dedupResult.removed > 0) {
                        setNotification({ msg: `🧹 Auto-purged ${dedupResult.removed} duplicate leads!`, type: 'success' });
                        fetchData();
                    }
                } catch { / * silent * / }
            }, 5000);
        } catch (error: any) {
            console.error('Failed to trigger discovery:', error);
            setIsDiscovering(false);
            setDiscoveryStartTime(null);
            setDiscoveryProgressMessage(null);
            setNotification({ msg: 'Failed to start scan.', type: 'alert' });
        }
    };
    */

    // 🤖 AI-powered discovery with selected keywords
    const handleAiDiscover = async () => {
        const kws = Array.from(selectedKeywords).filter(k => k.trim());
        if (kws.length === 0) {
            setNotification({ msg: 'Select at least 1 keyword to start!', type: 'alert' });
            return;
        }
        setIsDiscovering(true);
        setDiscoveryStartTime(Date.now());
        setDiscoveryProgressMessage('Initiating background lead discovery...');
        setShowDiscoveryModal(false);
        // Reset AI modal state
        setAiDiscoveryStep('chat');
        setAiChatHistory([]);
        setAiSuggestedKeywords([]);
        setSelectedKeywords(new Set());
        setAiSeedInput('');
        setAiChatInput('');
        setNotification({ msg: `🚀 Launched with ${kws.length} AI keywords! Live HUD active.`, type: 'success' });

        try {
            await instagramAPI.discoverLeads(kws, 50);
            // 🧹 Auto-dedup after scraping
            setTimeout(async () => {
                try {
                    const dedupResult = await instagramAPI.deduplicateLeads();
                    if (dedupResult.removed > 0) {
                        setNotification({ msg: `🧹 Auto-purged ${dedupResult.removed} duplicate leads!`, type: 'success' });
                        fetchData();
                    }
                } catch { /* silent */ }
            }, 5000);
        } catch (error: any) {
            console.error('Failed to trigger AI discovery:', error);
            setIsDiscovering(false);
            setDiscoveryStartTime(null);
            setDiscoveryProgressMessage(null);
            setNotification({ msg: 'Failed to start AI scan.', type: 'alert' });
        }
    };

    // Send message to AI keyword chat
    const handleAiKeywordChat = async (overrideMessage?: string) => {
        const message = overrideMessage || aiChatInput.trim();
        if (!message && !aiSeedInput.trim()) return;

        const seeds = aiSeedInput.split(',').map(k => k.trim()).filter(Boolean);
        const userMsg = message || `Generate ${aiKeywordCount} Instagram search keyword variations based on: ${seeds.join(', ')}`;

        const newHistory: { role: 'user' | 'assistant'; content: string }[] = [
            ...aiChatHistory,
            { role: 'user', content: userMsg }
        ];
        setAiChatHistory(newHistory);
        setAiChatInput('');
        setIsAiThinking(true);

        try {
            const result = await instagramAPI.suggestKeywords({
                seed_keywords: seeds.length > 0 ? seeds : ['instagram influencer'],
                conversation_history: newHistory,
                user_message: userMsg,
                count: aiKeywordCount,
                provider: keywordModel
            });

            const updatedHistory: { role: 'user' | 'assistant'; content: string }[] = [
                ...newHistory,
                { role: 'assistant', content: result.ai_message }
            ];
            setAiChatHistory(updatedHistory);
            setAiProvider(result.api_provider || 'Unknown');

            if (result.keywords && result.keywords.length > 0) {
                setAiSuggestedKeywords(result.keywords);
                setSelectedKeywords(new Set(result.keywords));
                // Allow user to converse first, they can proceed manually via the review button
                // setAiDiscoveryStep('review');
            }

            setAiProxyInfo({
                count: result.proxy_count,
                mode: result.mode,
                time_estimate: result.time_estimate
            });
        } catch (error: any) {
            const errMsg = error?.response?.data?.detail || 'AI service unavailable. Try again.';
            setAiChatHistory(prev => [
                ...prev,
                { role: 'assistant', content: `❌ ${errMsg} You can still type keywords manually.` }
            ]);
        } finally {
            setIsAiThinking(false);
            setTimeout(() => aiChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
    };

    // Send message to AI bad word chat
    const handleBadAiKeywordChat = async (overrideMessage?: string) => {
        const message = overrideMessage || badAiChatInput.trim();
        if (!message && !badAiSeedInput.trim()) return;

        const seeds = badAiSeedInput.split(',').map(k => k.trim()).filter(Boolean);
        const userMsg = message || `Generate ${badAiKeywordCount} blacklist keywords to filter out unwanted profiles based on: ${seeds.join(', ')}`;

        const newHistory: { role: 'user' | 'assistant'; content: string }[] = [
            ...badAiChatHistory,
            { role: 'user', content: userMsg }
        ];
        setBadAiChatHistory(newHistory);
        setBadAiChatInput('');
        setIsBadAiThinking(true);

        try {
            const result = await instagramAPI.suggestBadKeywords({
                seed_keywords: seeds.length > 0 ? seeds : ['competitor', 'spam'],
                conversation_history: newHistory,
                user_message: userMsg,
                count: badAiKeywordCount,
                provider: badKeywordModel
            });

            const updatedHistory: { role: 'user' | 'assistant'; content: string }[] = [
                ...newHistory,
                { role: 'assistant', content: result.ai_message }
            ];
            setBadAiChatHistory(updatedHistory);
            setBadAiProvider(result.api_provider || 'Unknown');

            if (result.keywords && result.keywords.length > 0) {
                setBadAiSuggestedKeywords(result.keywords);
                setBadSelectedKeywords(new Set(result.keywords));
                // Allow user to converse first, they can proceed manually via the review button
                // setBadAiDiscoveryStep('review');
            }
        } catch (error: any) {
            const errMsg = error?.response?.data?.detail || 'AI service unavailable. Try again.';
            setBadAiChatHistory(prev => [
                ...prev,
                { role: 'assistant', content: `❌ ${errMsg} You can still enter keywords manually.` }
            ]);
        } finally {
            setIsBadAiThinking(false);
            setTimeout(() => badAiChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
    };

    // Apply the selected bad keywords to the exclude list field
    const handleApplyBadKeywords = () => {
        const selected = Array.from(badSelectedKeywords).filter(Boolean);
        if (selected.length === 0) {
            notify('Select at least one keyword.', 'alert');
            return;
        }

        // Merge with existing exclude keywords
        const existing = filterSettings.bio_exclude_keywords
            ? filterSettings.bio_exclude_keywords.split(',').map((s: string) => s.trim()).filter(Boolean)
            : [];
        const merged = Array.from(new Set([...existing, ...selected]));

        setFilterSettings(prev => ({
            ...prev,
            bio_exclude_keywords: merged.join(', ')
        }));

        setShowBadKeywordsModal(false);
        setBadAiChatHistory([]);
        setBadAiSuggestedKeywords([]);
        setBadSelectedKeywords(new Set());
        setBadAiSeedInput('');
        setBadAiChatInput('');
        setBadAiDiscoveryStep('chat');
        notify(`Added ${selected.length} keywords to block list!`);
    };

    // Send message to AI regional cities whitelist chat
    const handleCitiesAiChat = async (overrideMessage?: string) => {
        const message = overrideMessage || citiesAiChatInput.trim();
        if (!message && !citiesAiSeedInput.trim()) return;

        const regionStr = citiesAiSeedInput.trim() || 'Australia';
        const userMsg = message || `Generate a list of ${citiesAiKeywordCount} major cities, suburbs, or regions in: ${regionStr} for our profile location whitelist.`;

        const newHistory: { role: 'user' | 'assistant'; content: string }[] = [
            ...citiesAiChatHistory,
            { role: 'user', content: userMsg }
        ];
        setCitiesAiChatHistory(newHistory);
        setCitiesAiChatInput('');
        setIsCitiesAiThinking(true);

        try {
            const result = await instagramAPI.suggestCities({
                region: regionStr,
                conversation_history: newHistory,
                user_message: userMsg,
                count: citiesAiKeywordCount
            });

            const updatedHistory: { role: 'user' | 'assistant'; content: string }[] = [
                ...newHistory,
                { role: 'assistant', content: result.ai_message }
            ];
            setCitiesAiChatHistory(updatedHistory);
            setCitiesAiProvider(result.api_provider || 'Unknown');

            if (result.cities && result.cities.length > 0) {
                setCitiesAiSuggestedKeywords(result.cities);
                setCitiesSelectedKeywords(new Set(result.cities));
                // Allow user to converse first, they can proceed manually via the review button
                // setCitiesAiDiscoveryStep('review');
            }
        } catch (error: any) {
            const errMsg = error?.response?.data?.detail || 'AI service unavailable. Try again.';
            setCitiesAiChatHistory(prev => [
                ...prev,
                { role: 'assistant', content: `❌ ${errMsg} You can still enter cities manually.` }
            ]);
        } finally {
            setIsCitiesAiThinking(false);
            setTimeout(() => citiesAiChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
    };

    // Apply the selected cities to the whitelist field
    const handleApplyCities = () => {
        const selected = Array.from(citiesSelectedKeywords).filter(Boolean);
        if (selected.length === 0) {
            notify('Select at least one city/region.', 'alert');
            return;
        }

        // Merge with existing cities whitelist
        const existing = filterSettings.bio_cities_whitelist
            ? filterSettings.bio_cities_whitelist.split(',').map((s: string) => s.trim()).filter(Boolean)
            : [];
        const merged = Array.from(new Set([...existing, ...selected]));

        setFilterSettings(prev => ({
            ...prev,
            bio_cities_whitelist: merged.join(', ')
        }));

        setShowCitiesModal(false);
        setCitiesAiChatHistory([]);
        setCitiesAiSuggestedKeywords([]);
        setCitiesSelectedKeywords(new Set());
        setCitiesAiSeedInput('');
        setCitiesAiChatInput('');
        setCitiesAiDiscoveryStep('chat');
        notify(`Added ${selected.length} cities/regions to target whitelist!`);
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

    const handleBulkAdd = async () => {
        if (!bulkAccountsString.trim()) return;
        try {
            setIsBulkAdding(true);
            const result = await instagramAPI.bulkAddAccounts(bulkAccountsString, newAccount.proxy_id || undefined);
            setNotification({ msg: `✅ Bulk Deployment Complete: ${result.success} success, ${result.failed} failed.`, type: 'success' });
            setShowBulkModal(false);
            setBulkAccountsString('');
            fetchData();
        } catch (error) {
            console.error('Bulk add failed:', error);
            setNotification({ msg: '❌ Bulk Deployment Failed.', type: 'alert' });
        } finally {
            setIsBulkAdding(false);
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

    const handleBulkAddProxies = async () => {
        if (!bulkProxyString.trim()) return;
        try {
            setIsBulkAddingProxies(true);
            const result = await instagramAPI.bulkAddProxies(bulkProxyString);
            setNotification({ msg: `✅ Shield Deployment Complete: ${result.success} success, ${result.failed} failed.`, type: 'success' });
            setShowBulkProxyModal(false);
            setBulkProxyString('');
            fetchData();
        } catch (error) {
            console.error('Bulk proxy add failed:', error);
            setNotification({ msg: '❌ Proxy Deployment Failed.', type: 'alert' });
        } finally {
            setIsBulkAddingProxies(false);
        }
    };

    const handleDeleteAccount = async (id: number) => {
        try {
            await instagramAPI.deleteAccount(id);
            fetchData();
        } catch (error) {
            console.error('Failed to delete account:', error);
        }
    };

    const handleConnectAccount = async (id: number) => {
        setConnectingIds(prev => new Set(prev).add(id));
        try {
            const res = await instagramAPI.connectAccount(id);
            if (res.status === 'connected' || res.status === 'already_connected') {
                setConnectedIds(prev => new Set(prev).add(id));
                notify('🌐 Browser Link Established! 🚀');
            }
        } catch (err) {
            console.error(err);
            notify('Failed to connect browser.', 'alert');
        } finally {
            setConnectingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const handleDisconnectAccount = async (id: number) => {
        try {
            await instagramAPI.disconnectAccount(id);
            setConnectedIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            notify('🔌 Browser Link Severed.');
        } catch (err) {
            console.error(err);
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
            case 'pending_ai': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 animate-pulse';
            case 'private': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
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
                <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[9999] animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl backdrop-blur-md border ${notification.type === 'success' ? 'bg-green-500/90 text-white border-green-400/20' : 'bg-red-500/90 text-white border-red-400/20'
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
                            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all duration-500 ${isAutoPilotRunning
                                    ? restTimer !== null
                                        ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25'
                                        : 'bg-green-500 text-white shadow-lg shadow-green-500/25'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-green-500'
                                }`}
                        >
                            <Play className={`w-4 h-4 ${isAutoPilotRunning ? 'fill-current' : 'group-hover:fill-green-500'}`} />
                            {isAutoPilotRunning ? 'Scanning...' : 'Auto-Pilot Mode'}
                        </button>
                        <button
                            onClick={async () => {
                                const newVal = !filterSettings.enable_ai_analysis;
                                setFilterSettings(p => ({ ...p, enable_ai_analysis: newVal }));
                                try {
                                    await api.post('/instagram/filters/settings', {
                                        ...filterSettings,
                                        enable_ai_analysis: newVal
                                    });
                                    setNotification({ msg: `AI Analysis turned ${newVal ? 'ON 🧠' : 'OFF 🛑'}`, type: 'success' });
                                } catch {
                                    setNotification({ msg: 'Failed to update AI Analysis status.', type: 'alert' });
                                }
                            }}
                            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all duration-500 ${filterSettings.enable_ai_analysis
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 animate-pulse'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-indigo-500'
                                }`}
                        >
                            <Brain className={`w-4 h-4 ${filterSettings.enable_ai_analysis ? 'fill-current' : ''}`} />
                            {filterSettings.enable_ai_analysis ? 'AI Analysis ON 🧠' : 'AI Analysis OFF 🛑'}
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
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                }`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {activeTab === 'leads' && (
                    <div className="space-y-6">
                        {/* 🛰️ Live Background Discovery HUD */}
                        {isDiscovering && (
                            <div className="bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-indigo-500/10 dark:from-pink-500/20 dark:via-purple-500/20 dark:to-indigo-500/20 border border-pink-500/20 rounded-2xl p-5 shadow-xl relative overflow-hidden animate-pulse">
                                {/* Pulse light effect */}
                                <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/5 dark:bg-pink-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                                    <div className="flex items-center gap-4">
                                        {/* Pulse indicator */}
                                        <div className="relative flex h-5 w-5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-5 w-5 bg-pink-500 flex items-center justify-center text-[10px] text-white font-black">🛰️</span>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-black text-gray-800 dark:text-white flex items-center gap-2">
                                                <span>Live Lead Discovery Active</span>
                                                <span className="bg-pink-500/20 text-pink-600 dark:text-pink-400 text-[10px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider animate-bounce">
                                                    Running
                                                </span>
                                            </h4>
                                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
                                                <span className="inline-block w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full"></span>
                                                <span>{discoveryProgressMessage || 'Scraper starting up...'}</span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 self-end md:self-center">
                                        <div className="bg-white/50 dark:bg-black/35 backdrop-blur-md border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2 flex items-center gap-2 text-xs font-black text-gray-700 dark:text-gray-300">
                                            <span>⏱️ Elapsed:</span>
                                            <span className="text-pink-600 dark:text-pink-400 font-mono tracking-wider">{discoveryTimer}</span>
                                        </div>
                                    </div>
                                </div>
                                {/* Pulse loader bar */}
                                <div className="w-full bg-gray-200 dark:bg-black/40 rounded-full h-1 mt-4 overflow-hidden">
                                    <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 h-1 rounded-full animate-[shimmer_1.5s_infinite] bg-[length:200%_100%]"></div>
                                </div>
                            </div>
                        )}

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
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === status
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
                                            <th className="px-4 py-3">Influence / Agent</th>
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
                                                    className={`group transition-all duration-700 ${autoAnalyzingId === lead.id
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
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="font-black text-gray-900 dark:text-white text-[12px] tracking-tighter truncate max-w-[100px]">@{lead.instagram_username || lead.username || 'unknown'}</span>
                                                                    {lead.score > 0 && (
                                                                        <div className={`w-2 h-2 rounded-full ${lead.score > 80 ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : lead.score > 40 ? 'bg-yellow-500' : 'bg-red-500'}`} title={`Strategic Score: ${lead.score}%`} />
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    {(() => {
                                                                        const ai = typeof lead.data_audit_json === 'string' ? JSON.parse(lead.data_audit_json || '{}') : lead.data_audit_json;
                                                                        return ai?.niche ? (
                                                                            <span className="text-[8px] font-black text-indigo-500 uppercase bg-indigo-500/10 px-1 rounded flex items-center gap-0.5">
                                                                                <Sparkles className="w-2 h-2" /> {ai.niche}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-[9px] text-gray-400 font-bold lowercase truncate max-w-[80px]">{lead.full_name || 'Personal'}</span>
                                                                        );
                                                                    })()}
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
                                                            <div className={`px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-tighter inline-flex items-center justify-center gap-1 ${lead.source === 'network_expansion'
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
                                                                ) : lead.status === 'pending_ai' ? (
                                                                    <span className="text-[8px] text-amber-500 font-bold block animate-pulse">
                                                                        {statusUpdates[lead.id] || "Waiting for AI... 🧠"}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[8px] text-gray-400/50 italic">
                                                                        {statusUpdates[lead.id] || "No bio 🧐"}
                                                                    </span>
                                                                )
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex -space-x-1.5 isolate justify-center">
                                                            {lead.recent_posts && lead.recent_posts.length > 0 ? (
                                                                <>
                                                                    {lead.recent_posts.map((post: any, idx: number) => {
                                                                        const b64 = typeof post === 'object' && post?.b64_data ? post.b64_data : null;
                                                                        const imageUrl = b64
                                                                            ? (b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`)
                                                                            : (typeof post === 'string' ? post : (post?.display_url || ''));
                                                                        return (
                                                                            <div
                                                                                key={idx}
                                                                                className="w-7 h-7 rounded-full border border-white dark:border-[#1e293b] overflow-hidden bg-gray-100 shadow-sm"
                                                                            >
                                                                                {imageUrl ? (
                                                                                    <img
                                                                                        src={imageUrl}
                                                                                        alt=""
                                                                                        className="w-full h-full object-cover"
                                                                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                                                    />
                                                                                ) : null}
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
                                                                <span className="text-[9px] text-gray-500 dark:text-gray-400">{lead.following_count ? lead.following_count.toLocaleString() : '---'}</span>
                                                                <span className="text-[8px] text-gray-400 font-bold uppercase">Wng</span>
                                                            </div>
                                                            {lead.assigned_account_name && (
                                                                <div className="mt-1 flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-500/20">
                                                                    <Users className="w-2.5 h-2.5 text-blue-500" />
                                                                    <span className="text-[7px] font-black text-blue-600 uppercase truncate max-w-[50px]">@{lead.assigned_account_name}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex items-center justify-end gap-1 group-hover:opacity-100 transition-opacity">
                                                            <a href={`https://instagram.com/${lead.instagram_username || lead.username}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-xl text-gray-400 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/10 transition-all"><ExternalLink className="w-4 h-4" /></a>
                                                            {(lead.data_audit_json || lead.rejection_reason) && (
                                                                <>
                                                                    <button
                                                                        onClick={() => {
                                                                            setSelectedLead(lead);
                                                                            setShowAuditModal(true);
                                                                        }}
                                                                        className="p-2 rounded-xl text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all"
                                                                        title="View AI Decision Audit"
                                                                    >
                                                                        <Brain className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            setSelectedLead(lead);
                                                                            setShowTraceModal(true);
                                                                        }}
                                                                        className="p-2 rounded-xl text-pink-400 hover:text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-900/10 transition-all"
                                                                        title="View Step-by-Step Filter Trace"
                                                                    >
                                                                        <Filter className="w-4 h-4" />
                                                                    </button>
                                                                </>
                                                            )}
                                                            {lead.status === 'discarded' ? (
                                                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 text-red-500 font-black text-[9px] uppercase tracking-widest border border-red-500/20">
                                                                    <X className="w-3 h-3" /> Discarded 🗑️
                                                                </div>
                                                            ) : lead.status === 'rejected' ? (
                                                                <div className="flex items-center gap-1">
                                                                    <button
                                                                        onClick={() => handleForceHarvest(lead.id)}
                                                                        disabled={harvestingId === lead.id}
                                                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-black text-[9px] uppercase tracking-tight transition-all ${harvestingId === lead.id
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
                                                                    {lead.status === 'failed' ? (
                                                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-500/10 text-gray-500 font-black text-[9px] uppercase tracking-widest border border-gray-500/20" title="Account unavailable or blocked">
                                                                            <AlertCircle className="w-3 h-3" /> FAILED ❌
                                                                        </div>
                                                                    ) : (lead.status === 'private' || lead.is_private) ? (
                                                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-500/10 text-orange-500 font-black text-[9px] uppercase tracking-widest border border-orange-500/20">
                                                                            <AlertCircle className="w-3 h-3" /> Private 🔒
                                                                        </div>
                                                                    ) : lead.status === 'error' ? (
                                                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 text-red-500 font-black text-[9px] uppercase tracking-widest border border-red-500/20" title="Username not found or invalid">
                                                                            <AlertCircle className="w-3 h-3" /> Not Found ❌
                                                                        </div>
                                                                    ) : (lead.status === 'vetted' || lead.status === 'harvested') ? (
                                                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-500 font-black text-[9px] uppercase tracking-widest border border-emerald-500/20">
                                                                            <CheckCircle2 className="w-3 h-3" /> Scrape Complete ✨
                                                                        </div>
                                                                    ) : lead.status === 'queued' ? (
                                                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-500/10 text-indigo-500 font-black text-[9px] uppercase tracking-widest border border-indigo-500/20 animate-pulse">
                                                                            <Clock className="w-3 h-3" /> In Queue ⏰
                                                                        </div>
                                                                    ) : lead.status === 'pending_ai' ? (
                                                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 text-amber-500 font-black text-[9px] uppercase tracking-widest border border-amber-500/20 animate-pulse" title="Ready for AI Analysis">
                                                                            <Brain className="w-3 h-3" /> PENDING AI 🧠
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => handleHarvest(lead.id)}
                                                                            disabled={harvestingId === lead.id}
                                                                            className={`flex items-center gap-2 px-3 py-2 rounded-xl font-black text-[10px] uppercase tracking-tighter transition-all ${harvestingId === lead.id
                                                                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                                                                                : 'bg-green-500 text-white hover:bg-green-600 shadow-lg shadow-green-500/20'
                                                                                }`}
                                                                        >
                                                                            {harvestingId === lead.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
                                                                            {harvestingId === lead.id ? "Scraping..." : "Approve & Scrape"}
                                                                        </button>
                                                                    )}
                                                                    {!(lead.status === 'vetted' || lead.status === 'harvested') && (
                                                                        <button
                                                                            onClick={() => handleUpdateStatus(lead.id, 'rejected')}
                                                                            className="p-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm active:scale-95"
                                                                            title="DISCARD 🗑️❌"
                                                                        >
                                                                            <X className="w-4 h-4" />
                                                                        </button>
                                                                    )}
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


                            {/* ── Professional Pagination ── */}
                            {totalLeadsCount > 0 && (() => {
                                const totalPages = Math.max(1, Math.ceil(totalLeadsCount / pageSize));
                                const startItem = Math.min(totalLeadsCount, (currentPage - 1) * pageSize + 1);
                                const endItem = Math.min(totalLeadsCount, currentPage * pageSize);

                                // Build page number list with ellipsis
                                const buildPages = (): (number | '...')[] => {
                                    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
                                    const pages: (number | '...')[] = [1];
                                    if (currentPage > 3) pages.push('...');
                                    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
                                    if (currentPage < totalPages - 2) pages.push('...');
                                    pages.push(totalPages);
                                    return pages;
                                };
                                const pages = buildPages();

                                return (
                                    <div className="px-5 py-4 border-t border-gray-100 dark:border-white/5 bg-white dark:bg-[#1e293b] flex flex-wrap items-center justify-between gap-3">
                                        {/* Left: count info + per-page selector */}
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                                                {startItem}–{endItem} <span className="text-gray-300 dark:text-gray-600">of</span> {totalLeadsCount.toLocaleString()} leads
                                            </span>
                                            <div className="h-4 w-px bg-gray-200 dark:bg-white/10" />
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Show</span>
                                                <select
                                                    value={pageSize}
                                                    onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                                                    className="bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl px-2.5 py-1.5 text-[11px] font-black text-gray-700 dark:text-gray-300 outline-none focus:border-indigo-500 cursor-pointer"
                                                >
                                                    {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                                                </select>
                                                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">/ page</span>
                                            </div>
                                        </div>

                                        {/* Right: page number buttons */}
                                        <div className="flex items-center gap-1.5">
                                            {/* Prev */}
                                            <button
                                                disabled={currentPage === 1}
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                className="flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a2436] font-black text-[10px] uppercase tracking-widest text-gray-500 hover:border-indigo-500 hover:text-indigo-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
                                            >
                                                ← Prev
                                            </button>

                                            {/* Page number buttons */}
                                            {pages.map((p, idx) =>
                                                p === '...' ? (
                                                    <span key={`ellipsis-${idx}`} className="px-2 text-gray-400 font-bold text-xs select-none">…</span>
                                                ) : (
                                                    <button
                                                        key={p}
                                                        onClick={() => setCurrentPage(p as number)}
                                                        className={`min-w-[36px] h-9 px-2 rounded-xl text-[11px] font-black transition-all active:scale-95 ${
                                                            currentPage === p
                                                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 scale-105'
                                                                : 'bg-white dark:bg-[#1a2436] border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-indigo-400 hover:text-indigo-500'
                                                        }`}
                                                    >
                                                        {p}
                                                    </button>
                                                )
                                            )}

                                            {/* Next */}
                                            <button
                                                disabled={currentPage >= totalPages}
                                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                className="flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a2436] font-black text-[10px] uppercase tracking-widest text-gray-500 hover:border-indigo-500 hover:text-indigo-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
                                            >
                                                Next →
                                            </button>
                                        </div>
                                    </div>
                                );
                            })()}

                        </div>
                    </div>
                )}

                {activeTab === 'accounts' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Ghost Fleet Management</h2>
                                <p className="text-xs text-gray-500 font-medium">Currently using {accounts.length} identities. Multi-phase safety active.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={handleFixAccounts} className="flex items-center gap-2 bg-green-500/10 hover:bg-green-500 text-green-600 hover:text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 border border-green-500/20" title="Activate all accounts for Campaign Pilot">
                                    <CheckCircle2 className="w-4 h-4" /> Activate All
                                </button>
                                <input type="file" accept=".txt" className="hidden" id="bulk-accounts-upload" onChange={handleBulkUploadAccounts} disabled={bulkUploading === 'accounts'} />
                                <label htmlFor="bulk-accounts-upload" className="flex items-center gap-2 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-600 hover:text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 border border-indigo-500/20 cursor-pointer">
                                    <Upload className="w-4 h-4" /> {bulkUploading === 'accounts' ? 'Deploying...' : 'Bulk Import'}
                                </label>
                                <button onClick={() => setShowBulkModal(true)} className="p-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-indigo-500 transition-all border border-transparent hover:border-indigo-500/20" title="Paste identities manually">
                                    <Edit3 className="w-4 h-4" />
                                </button>
                                <button onClick={() => setShowAccountModal(true)} className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-pink-600/25 transition-all active:scale-95"><Plus className="w-4 h-4" /> Add Account</button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {accounts.length === 0 ? (
                                <div className="col-span-3 text-center py-16 text-gray-400 text-sm font-bold uppercase tracking-widest">No ghost accounts yet. Add one to start outreach.</div>
                            ) : accounts.map(acc => {
                                const usagePercent = (acc.daily_usage_count / 10) * 100;
                                const safetyScore = Math.max(0, 100 - (acc.daily_usage_count * 10));

                                return (
                                    <div key={acc.id} className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm group relative">
                                        <div className="flex items-start justify-between mb-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-orange-400 flex items-center justify-center shadow-lg shadow-pink-500/20">
                                                    <Instagram className="w-6 h-6 text-white" />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${acc.status === 'active' ? 'bg-green-500 animate-pulse' :
                                                                acc.status === 'frozen' ? 'bg-blue-500 shadow-[0_0_10px_#3b82f6]' :
                                                                    acc.status === 'rate_limited' ? 'bg-yellow-500' : 'bg-gray-300'
                                                            }`}></span>
                                                        <span className={`text-[10px] font-black uppercase tracking-widest ${acc.status === 'active' ? 'text-green-500' :
                                                                acc.status === 'frozen' ? 'text-blue-500' :
                                                                    acc.status === 'rate_limited' ? 'text-yellow-500' : 'text-gray-400'
                                                            }`}>
                                                            {acc.status === 'frozen' ? 'Cold Sleep ❄️' :
                                                                acc.daily_usage_count >= 10 ? 'Locked (Limit) ⏳' :
                                                                    (acc.status || 'inactive')}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-1.5 h-1.5 rounded-full ${safetyScore > 70 ? 'bg-green-500' : safetyScore > 30 ? 'bg-yellow-500' : 'bg-red-500'}`} />
                                                        <span className="text-[10px] text-gray-400 font-black uppercase tracking-tighter">Safety: {safetyScore}%</span>
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

                                        <div className="mb-4">
                                            <h3 className="font-black text-gray-900 dark:text-white text-sm tracking-tight flex items-center justify-between">
                                                @{acc.username}
                                                {acc.status === 'frozen' && acc.frozen_until && (
                                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 text-blue-500 rounded-lg animate-pulse">
                                                        <Clock className="w-3 h-3" />
                                                        <span className="text-[9px] font-black">{(() => {
                                                            const diff = new Date(acc.frozen_until).getTime() - new Date().getTime();
                                                            if (diff <= 0) return '00:00:00';
                                                            const h = Math.floor(diff / 3600000);
                                                            const m = Math.floor((diff % 3600000) / 60000);
                                                            const s = Math.floor((diff % 60000) / 1000);
                                                            return `${h}h ${m}m ${s}s`;
                                                        })()}</span>
                                                    </div>
                                                )}
                                            </h3>
                                            <p className="text-[10px] text-gray-400 font-medium mt-1">
                                                {acc.proxy_host ? `🛡️ ${acc.proxy_host}` : '🌐 Direct IP'} • {timeAgo(acc.last_used_at)}
                                            </p>
                                        </div>

                                        <div className="space-y-3 pt-4 border-t border-gray-50 dark:border-white/5">
                                            {/* Usage Bar */}
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Daily Scopes</span>
                                                    <span className="text-[9px] font-black text-gray-500">{acc.daily_usage_count}/10</span>
                                                </div>
                                                <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                    <div className={`h-full transition-all duration-500 ${usagePercent > 80 ? 'bg-red-500' : usagePercent > 50 ? 'bg-yellow-500' : 'bg-blue-500'}`} style={{ width: `${usagePercent}%` }} />
                                                </div>
                                            </div>

                                            {/* Maturation Phase */}
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Ghost Phase</span>
                                                    <span className="text-[9px] font-black text-indigo-500 uppercase">
                                                        {acc.warming_session_count < 7 ? '1: Incubation' :
                                                            acc.warming_session_count < 14 ? '2: Socialite' :
                                                                acc.warming_session_count < 21 ? '3: Operative' : '4: Mature'}
                                                    </span>
                                                </div>
                                                <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-1000"
                                                        style={{ width: `${Math.min(100, (acc.warming_session_count / 21) * 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4 pt-4 border-t border-gray-50 dark:border-white/5 flex flex-col gap-2">
                                            {connectedIds.has(acc.id) ? (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                await instagramAPI.focusAccount(acc.id);
                                                                const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                                                                if (!isLocal) {
                                                                    const vncHost = window.location.hostname;
                                                                    const vncUrl = `http://${vncHost}:6080/vnc.html?autoconnect=1&resize=scale&quality=6`;
                                                                    window.open(vncUrl, '_blank');
                                                                }
                                                            } catch (e) {
                                                                setNotification({ msg: 'Failed to focus account stream', type: 'alert' });
                                                            }
                                                        }}
                                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" /> View Live
                                                    </button>
                                                    <button
                                                        onClick={() => handleDisconnectAccount(acc.id)}
                                                        className="p-2.5 rounded-xl bg-red-500 text-white shadow-lg shadow-red-500/20 active:scale-95 transition-all"
                                                        title="Disconnect"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => handleConnectAccount(acc.id)}
                                                    disabled={connectingIds.has(acc.id)}
                                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all ${connectingIds.has(acc.id)
                                                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                                                            : 'bg-indigo-600 text-white shadow-indigo-600/20 hover:bg-indigo-700'
                                                        }`}
                                                >
                                                    {connectingIds.has(acc.id) ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Play className="w-3.5 h-3.5" />
                                                    )}
                                                    {connectingIds.has(acc.id) ? 'Connecting...' : 'Connect Browser'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {activeTab === 'proxies' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Proxy Shield Pool</h2>
                                <p className="text-xs text-gray-500 font-medium">Currently using {proxies.length} active shields.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="file" accept=".txt" className="hidden" id="bulk-proxies-upload" onChange={handleBulkUploadProxies} disabled={bulkUploading === 'proxies'} />
                                <label htmlFor="bulk-proxies-upload" className="flex items-center gap-2 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-600 hover:text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 border border-indigo-500/20 cursor-pointer">
                                    <Upload className="w-4 h-4" /> {bulkUploading === 'proxies' ? 'Deploying...' : 'Bulk Import'}
                                </label>
                                <button onClick={() => setShowBulkProxyModal(true)} className="p-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-indigo-500 transition-all border border-transparent hover:border-indigo-500/20" title="Paste proxies manually">
                                    <Edit3 className="w-4 h-4" />
                                </button>
                                <button onClick={() => setShowProxyModal(true)} className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-pink-600/25 transition-all active:scale-95"><Plus className="w-4 h-4" /> Add Proxy</button>
                            </div>
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
                                            className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-sm tracking-tight transition-all shadow-xl active:scale-95 ${isCampaignRunning
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
                                <div className="space-y-4 p-6 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-3xl border border-indigo-500/10 mb-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-500">
                                                <Brain className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-black text-gray-900 dark:text-white tracking-tight">Stage 2 AI Lead Analysis</h3>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Process pending leads using local Gemma-4 intent analysis</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={filterSettings.enable_ai_analysis}
                                                onChange={(e) => setFilterSettings(p => ({ ...p, enable_ai_analysis: e.target.checked }))}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                                        </label>
                                    </div>
                                    <p className="text-[9px] text-gray-400 font-medium leading-relaxed italic">
                                        🧠 When ON, AI will automatically analyze your pending leads in the background, score them, and approve or reject them. When OFF, pending leads will wait.
                                    </p>

                                    <div className="space-y-3 pt-2 animate-in fade-in duration-300">
                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            Target Lead Intent / Qualification Criteria
                                            <span className="px-1.5 py-0.5 bg-indigo-500 text-white rounded text-[8px]">New</span>
                                        </label>
                                        <textarea
                                            rows={3}
                                            placeholder="Describe the target business or profiles you want the AI to approve. E.g., 'Find vehicle wrapping shops, PPF studios, or vinyl wrap distributors, ignoring personal bloggers.'"
                                            value={filterSettings.ai_intent_filter}
                                            onChange={(e) => setFilterSettings(p => ({ ...p, ai_intent_filter: e.target.value }))}
                                            className="w-full bg-white dark:bg-black/40 border border-gray-100 dark:border-white/5 rounded-2xl px-5 py-4 text-sm font-medium text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-indigo-500/20 placeholder:text-gray-400"
                                        />
                                        <p className="text-[9px] text-gray-400 font-medium leading-relaxed italic">
                                            💡 When sequential AI analysis runs, the AI will evaluate each profile against this intent. Leads that match are marked qualified (High Quality), and others are rejected (Low Quality).
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-4 p-6 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-3xl border border-indigo-500/10 mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-500">
                                            <Brain className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-gray-900 dark:text-white tracking-tight">AI Vision Training</h3>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Identify leads using LLaVA local vision model</p>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            Target Visual Niche
                                            <span className="px-1.5 py-0.5 bg-indigo-500 text-white rounded text-[8px]">New</span>
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g., 'Luxury watches on wrist', 'Organic food catering', 'High-end sneakers'"
                                            value={filterSettings.visual_niche}
                                            onChange={(e) => setFilterSettings(p => ({ ...p, visual_niche: e.target.value }))}
                                            className="w-full bg-white dark:bg-black/40 border border-gray-100 dark:border-white/5 rounded-2xl px-5 py-4 text-sm font-medium text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-indigo-500/20 placeholder:text-gray-400"
                                        />
                                        <p className="text-[9px] text-gray-400 font-medium leading-relaxed italic">
                                            💡 AI will 'look' at the first two posts of every lead. If they don't match this description, the lead is automatically rejected.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-4 p-6 bg-gradient-to-br from-purple-500/5 to-indigo-500/5 rounded-3xl border border-purple-500/10 mb-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-500">
                                                <Brain className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-black text-gray-900 dark:text-white tracking-tight">Deep AI Search Result Filter</h3>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Filter Google results using AI before analysis</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={filterSettings.enable_ai_filter}
                                                onChange={(e) => setFilterSettings(p => ({ ...p, enable_ai_filter: e.target.checked }))}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                                        </label>
                                    </div>

                                    {filterSettings.enable_ai_filter && (
                                        <div className="space-y-4 pt-2 animate-in fade-in duration-300">
                                            <div className="space-y-2">
                                                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                    Target Lead Criteria Description
                                                </label>
                                                <textarea
                                                    rows={3}
                                                    placeholder="Specify what type of leads you look for in detail. AI will read Google's snippet and ignore results that don't match. E.g., 'Only show Instagram accounts of personal fitness coaches or premium Gyms, ignoring review lists or clothing brands.'"
                                                    value={filterSettings.google_niche_filter}
                                                    onChange={(e) => setFilterSettings(p => ({ ...p, google_niche_filter: e.target.value }))}
                                                    className="w-full bg-white dark:bg-black/40 border border-gray-100 dark:border-white/5 rounded-2xl px-5 py-4 text-sm font-medium text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-purple-500/20 placeholder:text-gray-400"
                                                />
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
                                                        AI Model Engine
                                                    </label>
                                                    <select
                                                        value={filterSettings.ai_model}
                                                        onChange={(e) => setFilterSettings(p => ({ ...p, ai_model: e.target.value }))}
                                                        className="w-full bg-white dark:bg-black/40 border border-gray-100 dark:border-white/5 rounded-2xl px-5 py-4 text-sm font-medium text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-purple-500/20 outline-none"
                                                    >
                                                        <option value="gemma4" className="bg-white dark:bg-slate-800 text-gray-800 dark:text-white">gemma4 (Ollama / Local)</option>
                                                        <option value="gemma4:e2b" className="bg-white dark:bg-slate-800 text-gray-800 dark:text-white">gemma4:e2b (Ollama / Local)</option>
                                                        <option value="qwen3.6" className="bg-white dark:bg-slate-800 text-gray-800 dark:text-white">qwen3.6 (Ollama / Local)</option>
                                                        <option value="minimax-text-01" className="bg-white dark:bg-slate-800 text-gray-800 dark:text-white">MiniMax 2.7 (Cloud / API Key Required)</option>
                                                        <option disabled className="bg-white dark:bg-slate-800 text-gray-400">── Free Cloud APIs ──</option>
                                                        <option value="gemini" className="bg-white dark:bg-slate-800 text-gray-800 dark:text-white">✨ Gemini 2.5 Flash (Free / GEMINI_API_KEY)</option>
                                                        <option value="groq" className="bg-white dark:bg-slate-800 text-gray-800 dark:text-white">⚡ Groq Llama-3.3-70B (Free / GROQ_API_KEY)</option>
                                                        <option value="openrouter" className="bg-white dark:bg-slate-800 text-gray-800 dark:text-white">🌐 OpenRouter Gemini Flash (Free / OPENROUTER_API_KEY)</option>
                                                        <option value="huggingface" className="bg-white dark:bg-slate-800 text-gray-800 dark:text-white">🤗 HuggingFace Qwen-72B (Free / HUGGINGFACE_API_KEY)</option>
                                                    </select>
                                                </div>

                                                {filterSettings.ai_model.startsWith('minimax') && (
                                                    <div className="space-y-2 animate-in slide-in-from-left-2 duration-200">
                                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
                                                            MiniMax API Key
                                                        </label>
                                                        <input
                                                            type="password"
                                                            placeholder="Enter MiniMax API Key"
                                                            value={filterSettings.minimax_api_key}
                                                            onChange={(e) => setFilterSettings(p => ({ ...p, minimax_api_key: e.target.value }))}
                                                            className="w-full bg-white dark:bg-black/40 border border-gray-100 dark:border-white/5 rounded-2xl px-5 py-4 text-sm font-medium text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-purple-500/20 placeholder:text-gray-400"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-white dark:bg-[#1e293b] rounded-3xl p-8 border border-gray-100 dark:border-white/5 shadow-sm">
                                    <h3 className="text-xl font-black text-gray-900 dark:text-white mb-1 flex items-center gap-3">
                                        <Filter className="w-5 h-5 text-purple-500" /> Bio Keyword Filter (Allow List)
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
                                    <div className="flex items-center justify-between mb-1">
                                        <h3 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-3">
                                            <X className="w-5 h-5 text-red-500" /> Exclude Keywords (Block List)
                                        </h3>
                                        <button
                                            onClick={() => {
                                                setBadAiDiscoveryStep('chat');
                                                setShowBadKeywordsModal(true);
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-500/10 to-pink-500/10 border border-red-500/20 hover:border-red-500/40 text-red-500 rounded-xl text-xs font-black transition-all active:scale-95 animate-pulse"
                                        >
                                            <Wand2 className="w-3.5 h-3.5" />
                                            🤖 AI Suggest
                                        </button>
                                    </div>
                                    <p className="text-sm text-gray-500 mb-6">Leads whose bio contains <span className="font-bold text-red-500">any</span> of these words will be <span className="font-bold text-red-500">Rejected</span> immediately.</p>
                                    <input
                                        type="text"
                                        value={filterSettings.bio_exclude_keywords || ''}
                                        onChange={e => setFilterSettings(p => ({ ...p, bio_exclude_keywords: e.target.value }))}
                                        placeholder="scam, giveaway, bot, competitor, reseller..."
                                        className="w-full bg-gray-50 dark:bg-black/20 border-2 border-gray-100 dark:border-white/5 rounded-2xl px-5 py-4 text-sm font-medium text-gray-700 dark:text-gray-300 focus:ring-4 focus:ring-red-500/10 focus:border-red-500/50 outline-none transition-all"
                                    />
                                    <p className="text-xs text-gray-400 mt-2 ml-1">Separate keywords with commas. Case-insensitive.</p>
                                </div>

                                <div className="bg-white dark:bg-[#1e293b] rounded-3xl p-8 border border-gray-100 dark:border-white/5 shadow-sm">
                                    <div className="flex items-center justify-between mb-1">
                                        <h3 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-3">
                                            <Globe className="w-5 h-5 text-indigo-500" /> Target Cities Whitelist (Regional Whitelist)
                                        </h3>
                                        <button
                                            onClick={() => {
                                                setCitiesAiDiscoveryStep('chat');
                                                setShowCitiesModal(true);
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 hover:border-indigo-500/40 text-indigo-500 rounded-xl text-xs font-black transition-all active:scale-95 animate-pulse"
                                        >
                                            <Wand2 className="w-3.5 h-3.5" />
                                            🤖 AI Suggest Cities
                                        </button>
                                    </div>
                                    <p className="text-sm text-gray-500 mb-6">Only leads whose bio contains <span className="font-bold text-indigo-500">at least one</span> of these cities/regions will be <span className="font-bold text-green-500">Qualified</span>. Leave empty to allow all locations.</p>
                                    <input
                                        type="text"
                                        value={filterSettings.bio_cities_whitelist || ''}
                                        onChange={e => setFilterSettings(p => ({ ...p, bio_cities_whitelist: e.target.value }))}
                                        placeholder="Sydney, Melbourne, Brisbane, London, New York..."
                                        className="w-full bg-gray-50 dark:bg-black/20 border-2 border-gray-100 dark:border-white/5 rounded-2xl px-5 py-4 text-sm font-medium text-gray-700 dark:text-gray-300 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 outline-none transition-all"
                                    />
                                    <p className="text-xs text-gray-400 mt-2 ml-1">Separate cities with commas. Case-insensitive.</p>
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
                                                    <div className="text-[10px] font-mono text-gray-400 opacity-50 select-none">#{h.substring(0, 6)}</div>
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
                                            await api.post('/instagram/filters/settings', filterSettings);
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
                                            <p className="text-[10px] font-black uppercase opacity-60 mb-1">Bio Keywords (Allow List)</p>
                                            <p className="font-bold text-sm">{filterSettings.bio_keywords || <span className="opacity-40 italic">None — all pass</span>}</p>
                                        </div>
                                        <div className="bg-white/10 rounded-xl p-3">
                                            <p className="text-[10px] font-black uppercase opacity-60 mb-1">Exclude Keywords (Block List)</p>
                                            <p className="font-bold text-sm">{filterSettings.bio_exclude_keywords || <span className="opacity-40 italic">None — no exclusions</span>}</p>
                                        </div>
                                        <div className="bg-white/10 rounded-xl p-3">
                                            <p className="text-[10px] font-black uppercase opacity-60 mb-1">Target Cities Whitelist</p>
                                            <p className="font-bold text-sm truncate">{filterSettings.bio_cities_whitelist || <span className="opacity-40 italic">None — all regions pass</span>}</p>
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

            {/* AI Decision Audit Modal */}
            {showAuditModal && selectedLead && (() => {
                // 🛰️ LIVE SYNC: Find the latest version of this lead in the main state
                const liveLead = leads.find(l => l.id === selectedLead.id) || selectedLead;
                const ai = typeof liveLead.data_audit_json === 'string' ? JSON.parse(liveLead.data_audit_json || '{}') : liveLead.data_audit_json;

                return (
                    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
                        <div className="bg-white dark:bg-[#1e293b] rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden border border-white/10 animate-in fade-in zoom-in duration-300 flex flex-col max-h-[90vh]">
                            {/* Sticky Header */}
                            <div className="p-8 pb-4 shrink-0">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-indigo-500/10 rounded-2xl">
                                            <Brain className="w-6 h-6 text-indigo-500" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">AI Decision Audit</h2>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Decision Logic for @{liveLead.username}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setShowAuditModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors">
                                        <X className="w-6 h-6 text-gray-400" />
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable Content */}
                            <div className="px-8 flex-1 overflow-y-auto space-y-6 pb-2 scrollbar-hide">
                                {/* Gemma Analysis */}
                                {(!ai || Object.keys(ai).length === 0) ? (
                                    liveLead.status === 'rejected' ? (
                                        <div className="p-6 bg-red-500/5 rounded-3xl border border-red-500/10">
                                            <div className="flex items-center gap-2 mb-3">
                                                <AlertTriangle className="w-4 h-4 text-red-500" />
                                                <h3 className="text-[10px] font-black text-red-500 uppercase tracking-widest">Rejection Reason</h3>
                                            </div>
                                            <p className="text-sm font-bold text-red-600 dark:text-red-400 leading-relaxed pl-1">
                                                {liveLead.rejection_reason || "Lead was rejected by the filtering rules before deep AI analysis."}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="p-6 bg-gray-50 dark:bg-white/5 rounded-3xl border border-dashed border-gray-200 dark:border-white/10 flex flex-col items-center py-10">
                                            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Gemma is analyzing profile bio...</p>
                                        </div>
                                    )
                                ) : (
                                    <div className="space-y-4">

                                        {liveLead.status === 'rejected' && liveLead.rejection_reason && (
                                            <div className="p-6 bg-red-500/5 rounded-3xl border border-red-500/10">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <AlertTriangle className="w-4 h-4 text-red-500" />
                                                    <h3 className="text-[10px] font-black text-red-500 uppercase tracking-widest">Rejection Reason</h3>
                                                </div>
                                                <p className="text-sm font-bold text-red-600 dark:text-red-400 leading-relaxed pl-1">
                                                    {liveLead.rejection_reason}
                                                </p>
                                            </div>
                                        )}

                                        {ai.strategy && (
                                            <div className="p-6 bg-indigo-500/5 rounded-3xl border border-indigo-500/10">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Sparkles className="w-4 h-4 text-indigo-500" />
                                                <h3 className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-widest">Gemma Strategic Analysis</h3>
                                            </div>
                                            <p className="text-sm font-bold text-gray-700 dark:text-gray-300 leading-relaxed italic mb-4">
                                                "{ai.strategy || 'No strategic summary available.'}"
                                            </p>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="p-3 bg-white dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                                    <span className="text-[8px] font-black text-gray-400 uppercase block mb-1">Detected Niche</span>
                                                    <span className="text-xs font-black text-indigo-600 uppercase tracking-tighter">{ai.niche || 'General'}</span>
                                                </div>
                                                <div className="p-3 bg-white dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                                    <span className="text-[8px] font-black text-gray-400 uppercase block mb-1">Intent Score</span>
                                                    <span className="text-xs font-black text-emerald-500 uppercase tracking-tighter">{ai.intent_score || 0}% Match</span>
                                                </div>
                                            </div>
                                            </div>
                                        )}

                                        {ai.suggested_hook && (
                                            <div className="p-6 bg-pink-500/5 rounded-3xl border border-pink-500/10">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <Zap className="w-4 h-4 text-pink-500" />
                                                        <h3 className="text-[10px] font-black text-pink-500 uppercase tracking-widest">AI Cold Hook</h3>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(ai.suggested_hook);
                                                            setNotification({ msg: '📋 Hook copied!', type: 'success' });
                                                        }}
                                                        className="text-[9px] font-black text-pink-500 uppercase hover:underline"
                                                    >
                                                        Copy Hook
                                                    </button>
                                                </div>
                                                <p className="text-sm font-black text-gray-900 dark:text-white tracking-tight">
                                                    "{ai.suggested_hook}"
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Sticky Footer */}
                            <div className="p-8 pt-4 shrink-0 bg-white dark:bg-[#1e293b] border-t border-gray-100 dark:border-white/5">
                                <button onClick={() => setShowAuditModal(false)} className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-black rounded-2xl font-black text-sm transition-transform active:scale-95 shadow-xl">
                                    Close Audit
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Filter Trace Modal */}
            {showTraceModal && selectedLead && (() => {
                const liveLead = leads.find(l => l.id === selectedLead.id) || selectedLead;
                const ai = typeof liveLead.data_audit_json === 'string' ? JSON.parse(liveLead.data_audit_json || '{}') : liveLead.data_audit_json;
                const filterTrace = ai?.filter_trace || [];

                return (
                    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
                        <div className="bg-white dark:bg-[#1e293b] rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden border border-white/10 animate-in fade-in zoom-in duration-300 flex flex-col max-h-[90vh]">
                            {/* Sticky Header */}
                            <div className="p-8 pb-4 shrink-0">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-pink-500/10 rounded-2xl">
                                            <Filter className="w-6 h-6 text-pink-500" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Lead Filter Trace</h2>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Step-by-Step Decision logic for @{liveLead.username}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setShowTraceModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors">
                                        <X className="w-6 h-6 text-gray-400" />
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable Content */}
                            <div className="px-8 flex-1 overflow-y-auto space-y-6 pb-6 scrollbar-hide">
                                {/* Decision Process Trace Timeline */}
                                <div className="p-6 bg-gray-50 dark:bg-slate-800/40 rounded-3xl border border-gray-100 dark:border-white/5 space-y-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Target className="w-4 h-4 text-pink-500" />
                                        <h3 className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-widest">Execution Steps</h3>
                                    </div>
                                    
                                    {filterTrace.length === 0 ? (
                                        <div className="text-center py-6">
                                            <p className="text-xs text-gray-400 italic">No decision steps recorded.</p>
                                            <p className="text-[11px] text-gray-400 mt-2 font-medium">This lead was analyzed before filter tracking was added. Toggle AI Analysis or manually trigger analysis to generate a fresh trace!</p>
                                        </div>
                                    ) : (
                                        <div className="relative pl-6 border-l border-gray-200 dark:border-white/10 space-y-5">
                                            {filterTrace.map((item: any, idx: number) => {
                                                const isPassed = item.status === 'passed';
                                                const isFailed = item.status === 'failed';
                                                
                                                let icon = "⏭️";
                                                let dotColor = "bg-gray-100 dark:bg-slate-800 text-gray-400 border-gray-200 dark:border-white/10";
                                                if (isPassed) {
                                                    icon = "✓";
                                                    dotColor = "bg-green-500 text-white border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.3)]";
                                                } else if (isFailed) {
                                                    icon = "✕";
                                                    dotColor = "bg-red-500 text-white border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]";
                                                }
                                                
                                                return (
                                                    <div key={idx} className="relative">
                                                        {/* Timeline dot */}
                                                        <div className={`absolute -left-[35px] top-0.5 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center text-[10px] font-extrabold transition-all duration-300 ${dotColor}`}>
                                                            {icon}
                                                        </div>
                                                        
                                                        <div>
                                                            <div className="flex items-center justify-between gap-2">
                                                                <h4 className="text-xs font-black text-gray-900 dark:text-white tracking-tight">{item.step}</h4>
                                                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest ${
                                                                    isPassed ? 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400' :
                                                                    isFailed ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400' :
                                                                    'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                                                                }`}>
                                                                    {item.status}
                                                                </span>
                                                            </div>
                                                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{item.details}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Sticky Footer */}
                            <div className="p-8 pt-4 shrink-0 bg-white dark:bg-[#1e293b] border-t border-gray-100 dark:border-white/5">
                                <button onClick={() => setShowTraceModal(false)} className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-black rounded-2xl font-black text-sm transition-transform active:scale-95 shadow-xl">
                                    Close Trace
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* 🤖 Enhanced AI-Powered Discovery Modal */}
            {showDiscoveryModal && (
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
                    <div className="bg-white dark:bg-[#0f172a] rounded-3xl w-full max-w-4xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] dark:shadow-[0_30px_70px_-10px_rgba(0,0,0,0.8)] border border-white/10 dark:border-white/5 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh] overflow-hidden">

                        {/* Modal Header */}
                        <div className="p-6 pb-4 border-b border-gray-100 dark:border-white/5 flex-shrink-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-gradient-to-tr from-pink-500 to-purple-600 rounded-2xl shadow-lg shadow-pink-500/20">
                                        <Wand2 className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black text-gray-900 dark:text-white tracking-tight">Stage 1: AI Keyword Engine</h2>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Conversational keyword expansion • Google scraping</p>
                                    </div>
                                </div>
                                <button onClick={() => { setShowDiscoveryModal(false); setAiDiscoveryStep('chat'); setAiChatHistory([]); setAiSuggestedKeywords([]); setSelectedKeywords(new Set()); setAiProvider(''); }} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors">
                                    <X className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>

                            {/* Step indicator */}
                            <div className="flex items-center gap-2 mt-4">
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${aiDiscoveryStep === 'chat' ? 'bg-pink-500 text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-400'}`}>
                                    <MessageSquare className="w-3 h-3" /> AI Chat
                                </div>
                                <ChevronRight className="w-3 h-3 text-gray-300" />
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${aiDiscoveryStep === 'review' ? 'bg-pink-500 text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-400'}`}>
                                    <Hash className="w-3 h-3" /> Review Keywords
                                </div>
                                <ChevronRight className="w-3 h-3 text-gray-300" />
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider bg-gray-100 dark:bg-white/5 text-gray-400">
                                    <Play className="w-3 h-3" /> Launch
                                </div>
                            </div>
                        </div>

                        {/* STEP 1: AI Chat Side-by-Side */}
                        {aiDiscoveryStep === 'chat' && (
                            <div className="flex flex-1 overflow-hidden divide-x divide-gray-100 dark:divide-white/5">
                                {/* Left Pane: Chat */}
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    {/* Seed keywords input */}
                                    <div className="p-4 bg-gray-50/50 dark:bg-white/[0.02] border-b border-gray-100 dark:border-white/5 flex-shrink-0">
                                        <div className="flex items-center justify-between mb-2.5">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Your Niche / Seed Keywords</p>
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[9px] font-black uppercase text-gray-400">AI Model:</span>
                                                    <select
                                                        value={keywordModel}
                                                        onChange={e => setKeywordModel(e.target.value)}
                                                        className="bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-gray-700 dark:text-gray-300 outline-none focus:border-pink-500"
                                                    >
                                                        <option value="auto">Auto / Default</option>
                                                        <option value="gemini">Gemini API</option>
                                                        <option value="groq">Groq API</option>
                                                        <option value="openrouter">OpenRouter API</option>
                                                        <option value="openrouter_free">Llama 3 8B Free (OpenRouter)</option>
                                                        <option value="huggingface">Qwen 2.5 72B (Hugging Face)</option>
                                                        <option value="gemma">Gemma 4 (Ollama)</option>
                                                    </select>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[9px] font-black uppercase text-gray-400">Target Count:</span>
                                                    <select
                                                        value={aiKeywordCount}
                                                        onChange={e => setAiKeywordCount(parseInt(e.target.value))}
                                                        className="bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-gray-700 dark:text-gray-300 outline-none focus:border-pink-500"
                                                    >
                                                        {[10, 20, 30, 50, 75, 100].map(n => <option key={n} value={n}>{n} Variations</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="e.g. Luxury Watches, Coffee Shop, Yoga Studio..."
                                                value={aiSeedInput}
                                                onChange={e => setAiSeedInput(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter' && !isAiThinking) handleAiKeywordChat(); }}
                                                className="flex-1 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-white outline-none focus:border-pink-400"
                                            />
                                            <button
                                                onClick={() => handleAiKeywordChat()}
                                                disabled={isAiThinking || !aiSeedInput.trim()}
                                                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white rounded-xl font-black text-xs transition-all shadow-lg shadow-pink-500/20 disabled:opacity-50"
                                            >
                                                {isAiThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                                {isAiThinking ? 'Thinking...' : 'Expand with AI'}
                                            </button>
                                        </div>

                                        {/* Direct start option */}
                                        {aiSeedInput.trim() && (
                                            <div className="mt-2.5 flex items-center gap-2">
                                                <div className="flex-1 h-px bg-gray-200 dark:bg-white/5" />
                                                <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">or</span>
                                                <div className="flex-1 h-px bg-gray-200 dark:bg-white/5" />
                                            </div>
                                        )}
                                        {aiSeedInput.trim() && (
                                            <button
                                                onClick={() => {
                                                    const kws = aiSeedInput.split(',').map(k => k.trim()).filter(Boolean);
                                                    if (kws.length === 0) return;
                                                    setIsDiscovering(true);
                                                    setDiscoveryStartTime(Date.now());
                                                    setDiscoveryProgressMessage('Initiating background lead discovery...');
                                                    setShowDiscoveryModal(false);
                                                    setAiDiscoveryStep('chat');
                                                    setAiChatHistory([]);
                                                    setAiSuggestedKeywords([]);
                                                    setSelectedKeywords(new Set());
                                                    setAiSeedInput('');
                                                    setNotification({ msg: `🚀 Started with ${kws.length} seed keyword(s)! Live HUD active.`, type: 'success' });
                                                    instagramAPI.discoverLeads(kws, 50)
                                                        .then(() => {
                                                            setTimeout(async () => {
                                                                try {
                                                                    const d = await instagramAPI.deduplicateLeads();
                                                                    if (d.removed > 0) { setNotification({ msg: `🧹 Auto-purged ${d.removed} duplicates!`, type: 'success' }); fetchData(); }
                                                                } catch { /* silent */ }
                                                            }, 5000);
                                                        })
                                                        .catch(() => {
                                                            setIsDiscovering(false);
                                                            setDiscoveryStartTime(null);
                                                            setDiscoveryProgressMessage(null);
                                                            setNotification({ msg: 'Failed to start scan.', type: 'alert' });
                                                        });
                                                }}
                                                disabled={isDiscovering}
                                                className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 bg-gray-900 dark:bg-white/5 hover:bg-gray-800 dark:hover:bg-white/10 border border-gray-700 dark:border-white/10 text-white text-xs font-black rounded-xl transition-all"
                                            >
                                                <Play className="w-3.5 h-3.5 fill-current" />
                                                Start Discovery with Seed Keywords Only (skip AI)
                                            </button>
                                        )}
                                    </div>

                                    {/* Chat messages */}
                                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                        {aiChatHistory.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                                <div className="w-16 h-16 bg-gradient-to-tr from-pink-500/20 to-purple-600/20 rounded-3xl flex items-center justify-center mb-4">
                                                    <Brain className="w-8 h-8 text-pink-500" />
                                                </div>
                                                <h3 className="text-sm font-black text-gray-900 dark:text-white mb-2">AI Keyword Strategist Ready</h3>
                                                <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
                                                    Enter your niche above and I'll generate <span className="text-pink-500 font-bold">{aiKeywordCount} relevant keyword variations</span>. Have a conversation to refine them!
                                                </p>
                                                <div className="mt-4 grid grid-cols-2 gap-2 w-full max-w-xs">
                                                    {['Luxury Watches', 'Coffee Roasters', 'Yoga Studios', 'Real Estate Agents'].map(example => (
                                                        <button
                                                            key={example}
                                                            onClick={() => { setAiSeedInput(example); }}
                                                            className="text-[10px] font-bold text-pink-500 bg-pink-50 dark:bg-pink-500/10 border border-pink-200 dark:border-pink-500/20 rounded-xl px-3 py-2 hover:bg-pink-100 dark:hover:bg-pink-500/20 transition-all"
                                                        >
                                                            {example}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            aiChatHistory.map((msg, idx) => (
                                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs font-medium leading-relaxed ${msg.role === 'user'
                                                            ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white rounded-br-none'
                                                            : 'bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 rounded-bl-none border border-gray-200 dark:border-white/5'
                                                        }`}>
                                                        {msg.role === 'assistant' && (
                                                            <div className="flex items-center gap-1.5 mb-1">
                                                                <Sparkles className="w-3 h-3 text-pink-500" />
                                                                <span className="text-[9px] font-black text-pink-500 uppercase tracking-widest">{getDisplayEngineName(aiProvider)}</span>
                                                            </div>
                                                        )}
                                                        {msg.content}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                        {isAiThinking && (
                                            <div className="flex justify-start">
                                                <div className="bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-2xl rounded-bl-none px-4 py-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <Sparkles className="w-3 h-3 text-pink-500" />
                                                        <span className="text-[9px] font-black text-pink-500 uppercase tracking-widest font-bold">{getDisplayEngineName(aiProvider)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        <div className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                        <div className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                        <div className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div ref={aiChatEndRef} />
                                    </div>

                                    {/* Refinement chat input */}
                                    {aiChatHistory.length > 0 && (
                                        <div className="p-4 border-t border-gray-100 dark:border-white/5 flex-shrink-0">
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Refine: 'more local ones', 'add USA cities', 'focus on luxury'..."
                                                    value={aiChatInput}
                                                    onChange={e => setAiChatInput(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter' && !isAiThinking && aiChatInput.trim()) handleAiKeywordChat(); }}
                                                    className="flex-1 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-pink-400"
                                                />
                                                <button
                                                    onClick={() => handleAiKeywordChat()}
                                                    disabled={isAiThinking || !aiChatInput.trim()}
                                                    className="p-2.5 bg-pink-500 hover:bg-pink-600 text-white rounded-xl transition-all disabled:opacity-50"
                                                >
                                                    <Send className="w-4 h-4" />
                                                </button>
                                            </div>
                                            {aiSuggestedKeywords.length > 0 && (
                                                <button
                                                    onClick={() => setAiDiscoveryStep('review')}
                                                    className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-xl font-black text-xs tracking-wide shadow-lg shadow-pink-500/20 hover:from-pink-600 hover:to-purple-700 transition-all"
                                                >
                                                    <ChevronRight className="w-4 h-4" />
                                                    Review {aiSuggestedKeywords.length} Keywords →
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Right Pane: Real-time Keyword Suggestions List */}
                                <div className="w-[300px] flex-shrink-0 flex flex-col bg-gray-50/50 dark:bg-[#090d16] overflow-hidden">
                                    <div className="p-4 border-b border-gray-100 dark:border-white/5">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Proposed Keywords ({aiSuggestedKeywords.length})</p>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                                        {aiSuggestedKeywords.length === 0 ? (
                                            <div className="text-center py-12 text-gray-400 text-xs font-medium italic">
                                                No keywords suggested yet. Start by entering seeds on the left.
                                            </div>
                                        ) : (
                                            aiSuggestedKeywords.map((kw, idx) => (
                                                <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/5 text-xs font-bold text-gray-700 dark:text-gray-300">
                                                    <Hash className="w-3.5 h-3.5 opacity-40 text-pink-500" />
                                                    <span className="truncate">{kw}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {/* Active AI Provider HUD */}
                                    <div className="p-4 border-t border-gray-100 dark:border-white/5 bg-white dark:bg-[#0f172a] shrink-0">
                                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-gray-400">
                                            <span>Active Engine:</span>
                                            {aiProvider ? (
                                                aiProvider.includes('Ollama') ? (
                                                    <span className="text-purple-500 flex items-center gap-1 animate-pulse">
                                                        <Sparkles className="w-3 h-3 fill-current" />
                                                        {aiProvider}
                                                    </span>
                                                ) : aiProvider.includes('None') || aiProvider.includes('Fallback') ? (
                                                    <span className="text-amber-500 flex items-center gap-1">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        Fallback (Ollama Offline)
                                                    </span>
                                                ) : (
                                                    <span className="text-green-500 flex items-center gap-1 font-bold">
                                                        <Sparkles className="w-3 h-3 fill-current" />
                                                        {aiProvider.split(' ')[0]} API
                                                    </span>
                                                )
                                            ) : (
                                                <span className="text-gray-500 italic">Waiting...</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 2: Keyword Review & Launch */}
                        {aiDiscoveryStep === 'review' && (
                            <div className="flex flex-col flex-1 overflow-hidden">
                                {/* Info bar */}
                                {aiProxyInfo && (
                                    <div className="px-5 py-3 bg-gradient-to-r from-pink-500/10 to-purple-500/10 border-b border-pink-500/10 flex-shrink-0">
                                        <div className="flex items-center justify-between flex-wrap gap-3">
                                            <div className="flex items-center gap-4">
                                                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${aiProxyInfo.mode === 'parallel'
                                                        ? 'bg-green-500/10 text-green-600 border border-green-500/20'
                                                        : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                                    }`}>
                                                    <Zap className="w-3 h-3" />
                                                    {aiProxyInfo.mode === 'parallel' ? `⚡ Parallel (${aiProxyInfo.count} proxies)` : '📶 Sequential (No Proxies)'}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-500 uppercase tracking-wider">
                                                    <Clock className="w-3 h-3" />
                                                    Est: {aiProxyInfo.time_estimate}
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-black text-pink-500">{selectedKeywords.size}/{aiSuggestedKeywords.length} selected</span>
                                        </div>
                                    </div>
                                )}

                                {/* Keywords grid with checkboxes */}
                                <div className="flex-1 overflow-y-auto p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">AI Generated Keywords — Click to toggle</p>
                                        <div className="flex gap-2">
                                            <button onClick={() => setSelectedKeywords(new Set(aiSuggestedKeywords))} className="text-[9px] font-black text-pink-500 uppercase tracking-widest hover:underline">All</button>
                                            <span className="text-gray-300">·</span>
                                            <button onClick={() => setSelectedKeywords(new Set())} className="text-[9px] font-black text-gray-400 uppercase tracking-widest hover:underline">None</button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {aiSuggestedKeywords.map((kw, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => setSelectedKeywords(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(kw)) next.delete(kw); else next.add(kw);
                                                    return next;
                                                })}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${selectedKeywords.has(kw)
                                                        ? 'bg-pink-500 text-white border-pink-400 shadow-md shadow-pink-500/20'
                                                        : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/5 hover:border-pink-300'
                                                    }`}
                                            >
                                                {selectedKeywords.has(kw) && <CheckCircle2 className="w-3 h-3" />}
                                                <Hash className="w-3 h-3 opacity-50" />
                                                {kw}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Add custom keywords */}
                                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/5">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Add Manual Keywords</p>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="Add your own keyword and press Enter..."
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                                                        const newKw = (e.target as HTMLInputElement).value.trim();
                                                        setAiSuggestedKeywords(prev => [...prev, newKw]);
                                                        setSelectedKeywords(prev => new Set([...prev, newKw]));
                                                        (e.target as HTMLInputElement).value = '';
                                                    }
                                                }}
                                                className="flex-1 bg-gray-50 dark:bg-white/5 border border-dashed border-gray-300 dark:border-white/10 rounded-xl px-4 py-2 text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-pink-400"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Footer actions */}
                                <div className="p-4 border-t border-gray-100 dark:border-white/5 flex-shrink-0 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setAiDiscoveryStep('chat')}
                                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-xs font-bold text-gray-500 dark:text-gray-400 hover:border-pink-300 transition-all"
                                        >
                                            ← Back to Chat
                                        </button>
                                        <button
                                            onClick={handleAiDiscover}
                                            disabled={selectedKeywords.size === 0 || isDiscovering}
                                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white rounded-xl font-black text-sm shadow-xl shadow-pink-500/20 disabled:opacity-50 transition-all active:scale-95"
                                        >
                                            {isDiscovering ? (
                                                <><Loader2 className="w-4 h-4 animate-spin" /> Starting...</>
                                            ) : (
                                                <><Play className="w-4 h-4 fill-current" /> Launch with {selectedKeywords.size} Keywords 🚀</>
                                            )}
                                        </button>
                                    </div>
                                    <p className="text-[9px] text-gray-400 text-center">
                                        After scraping, duplicates will be <span className="text-pink-400 font-bold">auto-purged</span> and results loaded into your panel.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 🤖 AI-Powered Bad Keywords Modal */}
            {showBadKeywordsModal && (
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#0f172a] rounded-3xl w-full max-w-4xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] dark:shadow-[0_30px_70px_-10px_rgba(0,0,0,0.8)] border border-white/10 dark:border-white/5 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh] overflow-hidden">

                        {/* Modal Header */}
                        <div className="p-6 pb-4 border-b border-gray-100 dark:border-white/5 flex-shrink-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-gradient-to-tr from-red-500 to-pink-600 rounded-2xl shadow-lg shadow-red-500/20">
                                        <Wand2 className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black text-gray-900 dark:text-white tracking-tight">AI Bad Result Keyword Builder</h2>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Conversational negative keywords • Step 2 Bio Scan Filters</p>
                                    </div>
                                </div>
                                <button onClick={() => { setShowBadKeywordsModal(false); setBadAiDiscoveryStep('chat'); setBadAiChatHistory([]); setBadAiSuggestedKeywords([]); setBadSelectedKeywords(new Set()); setBadAiProvider(''); }} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors">
                                    <X className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>

                            {/* Step indicator */}
                            <div className="flex items-center gap-2 mt-4">
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${badAiDiscoveryStep === 'chat' ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-400'}`}>
                                    <MessageSquare className="w-3 h-3" /> AI Chat
                                </div>
                                <ChevronRight className="w-3 h-3 text-gray-300" />
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${badAiDiscoveryStep === 'review' ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-400'}`}>
                                    <Hash className="w-3 h-3" /> Review Keywords
                                </div>
                                <ChevronRight className="w-3 h-3 text-gray-300" />
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider bg-gray-100 dark:bg-white/5 text-gray-400">
                                    <Play className="w-3 h-3" /> Apply to Filter
                                </div>
                            </div>
                        </div>

                        {/* STEP 1: AI Chat Side-by-Side */}
                        {badAiDiscoveryStep === 'chat' && (
                            <div className="flex flex-1 overflow-hidden divide-x divide-gray-100 dark:divide-white/5">
                                {/* Left Pane: Chat */}
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    {/* Seed keywords input */}
                                    <div className="p-4 bg-gray-50/50 dark:bg-white/[0.02] border-b border-gray-100 dark:border-white/5 flex-shrink-0">
                                        <div className="flex items-center justify-between mb-2.5">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Describe What to Exclude (Niche / Competitors / Bot patterns)</p>
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[9px] font-black uppercase text-gray-400">AI Model:</span>
                                                    <select
                                                        value={badKeywordModel}
                                                        onChange={e => setBadKeywordModel(e.target.value)}
                                                        className="bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-gray-700 dark:text-gray-300 outline-none focus:border-red-500"
                                                    >
                                                        <option value="auto">Auto / Default</option>
                                                        <option value="gemini">Gemini API</option>
                                                        <option value="groq">Groq API</option>
                                                        <option value="openrouter">OpenRouter API</option>
                                                        <option value="openrouter_free">Llama 3 8B Free (OpenRouter)</option>
                                                        <option value="huggingface">Qwen 2.5 72B (Hugging Face)</option>
                                                        <option value="gemma">Gemma 4 (Ollama)</option>
                                                    </select>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[9px] font-black uppercase text-gray-400">Target Count:</span>
                                                    <select
                                                        value={badAiKeywordCount}
                                                        onChange={e => setBadAiKeywordCount(parseInt(e.target.value))}
                                                        className="bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-gray-700 dark:text-gray-300 outline-none focus:border-red-500"
                                                    >
                                                        {[10, 20, 30, 50, 75, 100].map(n => <option key={n} value={n}>{n} Variations</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="e.g. Competitors, bots, giveaway accounts, resellers, fake profiles..."
                                                value={badAiSeedInput}
                                                onChange={e => setBadAiSeedInput(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter' && !isBadAiThinking) handleBadAiKeywordChat(); }}
                                                className="flex-1 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-white outline-none focus:border-red-400"
                                            />
                                            <button
                                                onClick={() => handleBadAiKeywordChat()}
                                                disabled={isBadAiThinking || !badAiSeedInput.trim()}
                                                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white rounded-xl font-black text-xs transition-all shadow-lg shadow-red-500/20 disabled:opacity-50"
                                            >
                                                {isBadAiThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                                {isBadAiThinking ? 'Thinking...' : 'Get Bad Words'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Chat messages */}
                                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                        {badAiChatHistory.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                                <div className="w-16 h-16 bg-gradient-to-tr from-red-500/20 to-pink-600/20 rounded-3xl flex items-center justify-center mb-4">
                                                    <Brain className="w-8 h-8 text-red-500" />
                                                </div>
                                                <h3 className="text-sm font-black text-gray-900 dark:text-white mb-2">AI Bad Result Filter Assistant</h3>
                                                <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
                                                    Describe what profiles you want to filter out (e.g. replica sellers, dropshippers, spam accounts, giveaway channels) and I'll suggest negative keywords to block them.
                                                </p>
                                            </div>
                                        ) : (
                                            badAiChatHistory.map((msg, idx) => (
                                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs font-medium leading-relaxed ${msg.role === 'user'
                                                            ? 'bg-gradient-to-br from-red-500 to-pink-600 text-white rounded-br-none'
                                                            : 'bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 rounded-bl-none border border-gray-200 dark:border-white/5'
                                                        }`}>
                                                        {msg.role === 'assistant' && (
                                                            <div className="flex items-center gap-1.5 mb-1">
                                                                <Sparkles className="w-3 h-3 text-red-500" />
                                                                <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">{getDisplayEngineName(badAiProvider)}</span>
                                                            </div>
                                                        )}
                                                        {msg.content}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                        {isBadAiThinking && (
                                            <div className="flex justify-start">
                                                <div className="bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-2xl rounded-bl-none px-4 py-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <Sparkles className="w-3 h-3 text-red-500" />
                                                        <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">{getDisplayEngineName(badAiProvider)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        <div className="w-1.5 h-1.5 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                        <div className="w-1.5 h-1.5 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                        <div className="w-1.5 h-1.5 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div ref={badAiChatEndRef} />
                                    </div>

                                    {/* Refinement chat input (shown after first response) */}
                                    {badAiChatHistory.length > 0 && (
                                        <div className="p-4 border-t border-gray-100 dark:border-white/5 flex-shrink-0">
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Refine: 'add wholesale terms', 'focus on dropshipping'..."
                                                    value={badAiChatInput}
                                                    onChange={e => setBadAiChatInput(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter' && !isBadAiThinking && badAiChatInput.trim()) handleBadAiKeywordChat(); }}
                                                    className="flex-1 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-red-400"
                                                />
                                                <button
                                                    onClick={() => handleBadAiKeywordChat()}
                                                    disabled={isBadAiThinking || !badAiChatInput.trim()}
                                                    className="p-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all disabled:opacity-50"
                                                >
                                                    <Send className="w-4 h-4" />
                                                </button>
                                            </div>
                                            {badAiSuggestedKeywords.length > 0 && (
                                                <button
                                                    onClick={() => setBadAiDiscoveryStep('review')}
                                                    className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-xl font-black text-xs tracking-wide shadow-lg shadow-red-500/20 hover:from-red-600 hover:to-pink-700 transition-all"
                                                >
                                                    <ChevronRight className="w-4 h-4" />
                                                    Review {badAiSuggestedKeywords.length} Bad Keywords →
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Right Pane: Real-time Excluded Keywords List */}
                                <div className="w-[300px] flex-shrink-0 flex flex-col bg-gray-50/50 dark:bg-[#090d16] overflow-hidden">
                                    <div className="p-4 border-b border-gray-100 dark:border-white/5">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Proposed Excluded Keywords ({badAiSuggestedKeywords.length})</p>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                                        {badAiSuggestedKeywords.length === 0 ? (
                                            <div className="text-center py-12 text-gray-400 text-xs font-medium italic">
                                                No bad keywords suggested yet. Start by entering descriptors on the left.
                                            </div>
                                        ) : (
                                            badAiSuggestedKeywords.map((kw, idx) => (
                                                <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/5 text-xs font-bold text-gray-700 dark:text-gray-300">
                                                    <Hash className="w-3.5 h-3.5 opacity-40 text-red-500" />
                                                    <span className="truncate">{kw}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {/* Active AI Provider HUD */}
                                    <div className="p-4 border-t border-gray-100 dark:border-white/5 bg-white dark:bg-[#0f172a] shrink-0">
                                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-gray-400">
                                            <span>Active Engine:</span>
                                            {badAiProvider ? (
                                                badAiProvider.includes('Ollama') ? (
                                                    <span className="text-purple-500 flex items-center gap-1 animate-pulse">
                                                        <Sparkles className="w-3 h-3 fill-current" />
                                                        {badAiProvider}
                                                    </span>
                                                ) : badAiProvider.includes('None') || badAiProvider.includes('Fallback') ? (
                                                    <span className="text-amber-500 flex items-center gap-1">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        Fallback (Ollama Offline)
                                                    </span>
                                                ) : (
                                                    <span className="text-red-500 flex items-center gap-1 font-bold">
                                                        <Sparkles className="w-3 h-3 fill-current" />
                                                        {badAiProvider.split(' ')[0]} API
                                                    </span>
                                                )
                                            ) : (
                                                <span className="text-gray-500 italic">Waiting...</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 2: Keyword Review & Apply */}
                        {badAiDiscoveryStep === 'review' && (
                            <div className="flex flex-col flex-1 overflow-hidden">
                                {/* Keywords grid with checkboxes */}
                                <div className="flex-1 overflow-y-auto p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">AI Suggested Bad Keywords — Toggle to select</p>
                                        <div className="flex gap-2">
                                            <button onClick={() => setBadSelectedKeywords(new Set(badAiSuggestedKeywords))} className="text-[9px] font-black text-red-500 uppercase tracking-widest hover:underline">All</button>
                                            <span className="text-gray-300">·</span>
                                            <button onClick={() => setBadSelectedKeywords(new Set())} className="text-[9px] font-black text-gray-400 uppercase tracking-widest hover:underline">None</button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {badAiSuggestedKeywords.map((kw, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => setBadSelectedKeywords(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(kw)) next.delete(kw); else next.add(kw);
                                                    return next;
                                                })}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${badSelectedKeywords.has(kw)
                                                        ? 'bg-red-500 text-white border-red-400 shadow-md shadow-red-500/20'
                                                        : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/5 hover:border-red-300'
                                                    }`}
                                            >
                                                {badSelectedKeywords.has(kw) && <CheckCircle2 className="w-3 h-3" />}
                                                <Hash className="w-3 h-3 opacity-50" />
                                                {kw}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Add custom keywords */}
                                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/5">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Add Manual Excluded Keywords</p>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="Add custom bad word and press Enter..."
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                                                        const newKw = (e.target as HTMLInputElement).value.trim();
                                                        setBadAiSuggestedKeywords(prev => [...prev, newKw]);
                                                        setBadSelectedKeywords(prev => new Set([...prev, newKw]));
                                                        (e.target as HTMLInputElement).value = '';
                                                    }
                                                }}
                                                className="flex-1 bg-gray-50 dark:bg-white/5 border border-dashed border-gray-300 dark:border-white/10 rounded-xl px-4 py-2 text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-red-400"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Footer actions */}
                                <div className="p-4 border-t border-gray-100 dark:border-white/5 flex-shrink-0">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setBadAiDiscoveryStep('chat')}
                                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-xs font-bold text-gray-500 dark:text-gray-400 hover:border-red-300 transition-all"
                                        >
                                            ← Back to Chat
                                        </button>
                                        <button
                                            onClick={handleApplyBadKeywords}
                                            disabled={badSelectedKeywords.size === 0}
                                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white rounded-xl font-black text-sm shadow-xl shadow-red-500/20 transition-all active:scale-95"
                                        >
                                            <CheckCircle2 className="w-4 h-4" /> Add {badSelectedKeywords.size} Keywords to Block List
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showCitiesModal && (
                <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
                    <div className="bg-white dark:bg-[#0f172a] rounded-3xl w-full max-w-4xl shadow-2xl border border-white/10 dark:border-white/5 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh] overflow-hidden">

                        {/* Modal Header */}
                        <div className="p-6 pb-4 border-b border-gray-100 dark:border-white/5 flex-shrink-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/20">
                                        <Wand2 className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black text-gray-900 dark:text-white tracking-tight">Step 2: Regional Whitelist Builder</h2>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Conversational Whitelist suggester • Gemma AI</p>
                                    </div>
                                </div>
                                <button onClick={() => { setShowCitiesModal(false); setCitiesAiDiscoveryStep('chat'); setCitiesAiChatHistory([]); setCitiesAiSuggestedKeywords([]); setCitiesSelectedKeywords(new Set()); setCitiesAiProvider(''); }} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors">
                                    <X className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>
                        </div>

                        {/* STEP 1: Conversational input / Chat Side-by-Side */}
                        {citiesAiDiscoveryStep === 'chat' && (
                            <div className="flex flex-1 overflow-hidden divide-x divide-gray-100 dark:divide-white/5">
                                {/* Left Pane: Chat */}
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                        {citiesAiChatHistory.length === 0 ? (
                                            <div className="space-y-6 max-w-md mx-auto pt-6 text-center">
                                                <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto text-indigo-500">
                                                    <Sparkles className="w-8 h-8" />
                                                </div>
                                                <div>
                                                    <h3 className="font-black text-gray-950 dark:text-white text-base">Generate Location Whitelist</h3>
                                                    <p className="text-xs text-gray-500 mt-1">Specify a target country or region, and Gemma AI will suggest up to 500 major cities, suburbs, and areas to include on the whitelist.</p>
                                                </div>
                                                <div className="space-y-4 text-left">
                                                    <div className="space-y-1">
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest pl-1">Target Country or Region 📍</p>
                                                        <input
                                                            type="text"
                                                            placeholder="e.g. Australia, California, Germany..."
                                                            value={citiesAiSeedInput}
                                                            onChange={e => setCitiesAiSeedInput(e.target.value)}
                                                            className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white outline-none focus:border-indigo-400"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest pl-1">Suggested Locations count ({citiesAiKeywordCount})</p>
                                                        <input
                                                            type="range"
                                                            min="20"
                                                            max="500"
                                                            step="10"
                                                            value={citiesAiKeywordCount}
                                                            onChange={e => setCitiesAiKeywordCount(parseInt(e.target.value))}
                                                            className="w-full h-1.5 bg-gray-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                                        />
                                                        <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase tracking-tight">
                                                            <span>20 cities</span>
                                                            <span>500 cities</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleCitiesAiChat()}
                                                        disabled={isCitiesAiThinking || !citiesAiSeedInput.trim()}
                                                        className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50"
                                                    >
                                                        Generate Target Whitelist ✨
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            citiesAiChatHistory.map((msg, idx) => (
                                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm font-semibold leading-relaxed shadow-sm ${msg.role === 'user'
                                                            ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-br-none'
                                                            : 'bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 rounded-bl-none border border-gray-200 dark:border-white/5'
                                                        }`}>
                                                        {msg.role === 'assistant' && (
                                                            <div className="flex items-center gap-1.5 mb-1">
                                                                <Sparkles className="w-3 h-3 text-indigo-500" />
                                                                <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">{getDisplayEngineName(citiesAiProvider)}</span>
                                                            </div>
                                                        )}
                                                        {msg.content}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                        {isCitiesAiThinking && (
                                            <div className="flex justify-start">
                                                <div className="bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-2xl rounded-bl-none px-4 py-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <Sparkles className="w-3 h-3 text-indigo-500" />
                                                        <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest font-bold">{getDisplayEngineName(citiesAiProvider)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div ref={citiesAiChatEndRef} />
                                    </div>

                                    {/* Refinement chat input */}
                                    {citiesAiChatHistory.length > 0 && (
                                        <div className="p-4 border-t border-gray-100 dark:border-white/5 flex-shrink-0">
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Refine: 'only major capital cities', 'add suburbs of Melbourne'..."
                                                    value={citiesAiChatInput}
                                                    onChange={e => setCitiesAiChatInput(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter' && !isCitiesAiThinking && citiesAiChatInput.trim()) handleCitiesAiChat(); }}
                                                    className="flex-1 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-indigo-400"
                                                />
                                                <button
                                                    onClick={() => handleCitiesAiChat()}
                                                    disabled={isCitiesAiThinking || !citiesAiChatInput.trim()}
                                                    className="p-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl transition-all disabled:opacity-50"
                                                >
                                                    <Send className="w-4 h-4" />
                                                </button>
                                            </div>
                                            {citiesAiSuggestedKeywords.length > 0 && (
                                                <button
                                                    onClick={() => setCitiesAiDiscoveryStep('review')}
                                                    className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-black text-xs tracking-wide shadow-lg shadow-indigo-500/20 hover:from-indigo-600 hover:to-purple-700 transition-all"
                                                >
                                                    <ChevronRight className="w-4 h-4" />
                                                    Review {citiesAiSuggestedKeywords.length} Cities Whitelist →
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Right Pane: Real-time Cities Whitelist List */}
                                <div className="w-[300px] flex-shrink-0 flex flex-col bg-gray-50/50 dark:bg-[#090d16] overflow-hidden">
                                    <div className="p-4 border-b border-gray-100 dark:border-white/5">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Proposed Cities ({citiesAiSuggestedKeywords.length})</p>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                                        {citiesAiSuggestedKeywords.length === 0 ? (
                                            <div className="text-center py-12 text-gray-400 text-xs font-medium italic">
                                                No cities suggested yet. Start by entering a target country/region on the left.
                                            </div>
                                        ) : (
                                            citiesAiSuggestedKeywords.map((kw, idx) => (
                                                <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/5 text-xs font-bold text-gray-700 dark:text-gray-300">
                                                    <Globe className="w-3.5 h-3.5 opacity-40 text-indigo-500" />
                                                    <span className="truncate">{kw}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {/* Active AI Provider HUD */}
                                    <div className="p-4 border-t border-gray-100 dark:border-white/5 bg-white dark:bg-[#0f172a] shrink-0">
                                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-gray-400">
                                            <span>Active Engine:</span>
                                            {citiesAiProvider ? (
                                                citiesAiProvider.includes('Ollama') ? (
                                                    <span className="text-purple-500 flex items-center gap-1 animate-pulse">
                                                        <Sparkles className="w-3 h-3 fill-current" />
                                                        {citiesAiProvider}
                                                    </span>
                                                ) : citiesAiProvider.includes('None') || citiesAiProvider.includes('Fallback') ? (
                                                    <span className="text-amber-500 flex items-center gap-1">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        Fallback (Ollama Offline)
                                                    </span>
                                                ) : (
                                                    <span className="text-indigo-500 flex items-center gap-1 font-bold">
                                                        <Sparkles className="w-3 h-3 fill-current" />
                                                        {citiesAiProvider.split(' ')[0]} API
                                                    </span>
                                                )
                                            ) : (
                                                <span className="text-gray-500 italic">Waiting...</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 2: Cities Review & Apply */}
                        {citiesAiDiscoveryStep === 'review' && (
                            <div className="flex flex-col flex-1 overflow-hidden">
                                <div className="flex-1 overflow-y-auto p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">AI Suggested Target Whitelist — Toggle to select</p>
                                        <div className="flex gap-2">
                                            <button onClick={() => setCitiesSelectedKeywords(new Set(citiesAiSuggestedKeywords))} className="text-[9px] font-black text-indigo-500 uppercase tracking-widest hover:underline">All</button>
                                            <span className="text-gray-300">·</span>
                                            <button onClick={() => setCitiesSelectedKeywords(new Set())} className="text-[9px] font-black text-gray-400 uppercase tracking-widest hover:underline">None</button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {citiesAiSuggestedKeywords.map((kw, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => setCitiesSelectedKeywords(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(kw)) next.delete(kw); else next.add(kw);
                                                    return next;
                                                })}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${citiesSelectedKeywords.has(kw)
                                                        ? 'bg-indigo-500 text-white border-indigo-400 shadow-md shadow-indigo-500/20'
                                                        : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/5 hover:border-indigo-300'
                                                    }`}
                                            >
                                                {citiesSelectedKeywords.has(kw) && <CheckCircle2 className="w-3 h-3" />}
                                                <Globe className="w-3 h-3 opacity-50" />
                                                {kw}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Add custom cities */}
                                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/5">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Add Manual Whitelist Locations</p>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="Add custom city/region and press Enter..."
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                                                        const newKw = (e.target as HTMLInputElement).value.trim();
                                                        setCitiesAiSuggestedKeywords(prev => [...prev, newKw]);
                                                        setCitiesSelectedKeywords(prev => new Set([...prev, newKw]));
                                                        (e.target as HTMLInputElement).value = '';
                                                    }
                                                }}
                                                className="flex-1 bg-gray-50 dark:bg-white/5 border border-dashed border-gray-300 dark:border-white/10 rounded-xl px-4 py-2 text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-indigo-400"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Footer actions */}
                                <div className="p-4 border-t border-gray-100 dark:border-white/5 flex-shrink-0">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setCitiesAiDiscoveryStep('chat')}
                                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-xs font-bold text-gray-500 dark:text-gray-400 hover:border-indigo-300 transition-all"
                                        >
                                            ← Back to Chat
                                        </button>
                                        <button
                                            onClick={handleApplyCities}
                                            disabled={citiesSelectedKeywords.size === 0}
                                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-black text-sm shadow-xl shadow-indigo-500/20 transition-all active:scale-95"
                                        >
                                            <CheckCircle2 className="w-4 h-4" /> Add {citiesSelectedKeywords.size} Locations to Whitelist
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showAccountModal && (
                <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
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
                                            onChange={e => setNewAccount({ ...newAccount, username: e.target.value })}
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
                                                onChange={e => setNewAccount({ ...newAccount, password: e.target.value })}
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
                                            onChange={e => setNewAccount({ ...newAccount, session_id: e.target.value })}
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
                                            onChange={e => setNewAccount({ ...newAccount, verification_code: e.target.value })}
                                            autoFocus
                                        />
                                        <p className="text-[9px] text-gray-400 mt-2 font-medium">🛡️ Enter the code from your app to satisfy the security challenge.</p>
                                    </div>
                                )}

                                <div className="pt-2">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Assign Proxy Shield (Optional)</p>
                                    <select className="w-full bg-gray-50 dark:bg-gray-800/50 border-none rounded-xl p-4 text-sm text-gray-500 font-bold" value={newAccount.proxy_id} onChange={e => setNewAccount({ ...newAccount, proxy_id: e.target.value })}>
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
                <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
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
                                        onChange={e => setNewProxy({ ...newProxy, bundle: e.target.value })}
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
            {showPreviewModal && selectedLead && (() => {
                const liveLead = leads.find(l => l.id === selectedLead.id) || selectedLead;
                return (
                    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 sm:p-8 bg-slate-900/90 backdrop-blur-md">
                        <div className="bg-white dark:bg-[#1e293b] rounded-[2.5rem] w-full max-w-2xl max-h-[85vh] shadow-2xl overflow-hidden border border-white/10 animate-in fade-in zoom-in duration-300 flex flex-col mt-10">

                            {/* Sticky Header */}
                            <div className="p-8 pb-4 flex items-center justify-between border-b border-gray-100 dark:border-white/5 bg-white dark:bg-[#1e293b] z-10">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl">
                                        <Users className="w-6 h-6 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">@{liveLead.username}</h2>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{liveLead.full_name || 'Anonymous Creator'}</span>
                                            <span className="w-1 h-1 bg-gray-300 rounded-full" />
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{liveLead.followers?.toLocaleString() || 0} Followers</span>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setShowPreviewModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors">
                                    <X className="w-6 h-6 text-gray-400" />
                                </button>
                            </div>

                            {/* Scrollable Content */}
                            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Biography & Intent 📝</h3>
                                    <div className="p-6 bg-gray-50 dark:bg-white/5 rounded-3xl border border-gray-100 dark:border-white/5">
                                        <p className="text-sm font-bold text-gray-700 dark:text-gray-300 leading-relaxed">
                                            {liveLead.biography || "No biography provided by this creator."}
                                        </p>
                                    </div>
                                    {liveLead.external_url && (
                                        <a
                                            href={liveLead.external_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-3 p-4 bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-500/30 hover:scale-[1.02] transition-transform"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                            Visit Portfolio / Linktree
                                        </a>
                                    )}
                                </div>

                                <div className="mb-4">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Content Archive 📸</h3>
                                    <div className="grid grid-cols-3 gap-4">
                                        {liveLead.recent_posts && liveLead.recent_posts.length > 0 ? (
                                            liveLead.recent_posts.map((post: any, idx: number) => {
                                                // Prioritize base64 screenshot (captured during scraping) over external URL
                                                const b64 = typeof post === 'object' && post?.b64_data ? post.b64_data : null;
                                                const imgSrc = b64
                                                    ? (b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`)
                                                    : (typeof post === 'string' ? post : (post?.display_url || ''));
                                                return (
                                                    <div key={idx} className="aspect-square rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 shadow-inner group relative border border-gray-100 dark:border-white/5">
                                                        {imgSrc ? (
                                                            <img
                                                                src={imgSrc}
                                                                alt={`Post ${idx + 1}`}
                                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                                <AlertCircle className="w-6 h-6" />
                                                            </div>
                                                        )}
                                                        {post?.url && (
                                                            <a
                                                                href={post.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3"
                                                            >
                                                                <span className="text-[10px] text-white font-black uppercase tracking-widest">View Post</span>
                                                            </a>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="col-span-3 py-10 text-center flex flex-col items-center border-2 border-dashed border-gray-100 dark:border-white/5 rounded-3xl">
                                                <div className="w-12 h-12 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4"><AlertCircle className="w-6 h-6 text-gray-300" /></div>
                                                <p className="text-gray-400 font-bold uppercase tracking-widest text-[9px]">Gallery is empty for this lead</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Sticky Footer */}
                            <div className="p-8 pt-4 border-t border-gray-100 dark:border-white/5 bg-white dark:bg-[#1e293b] z-10 flex justify-center">
                                <button
                                    onClick={() => setShowPreviewModal(false)}
                                    className="w-full max-w-xs py-4 bg-gray-900 dark:bg-white text-white dark:text-black rounded-2xl font-black text-sm transition-transform active:scale-95 shadow-xl shadow-gray-300/30 dark:shadow-none"
                                >
                                    Finish Inspection
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {showBulkModal && (
                <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-[#1e293b] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-8">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-xl font-black text-gray-900 dark:text-white">Bulk Ghost Deployment</h2>
                            </div>
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-6">Mass Authorize Identities 🛰️</p>

                            <div className="flex items-center justify-between gap-4 p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                                        <Plus className="w-5 h-5 text-indigo-500" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase text-indigo-600">Flash Onboarding</span>
                                        <span className="text-[9px] font-medium text-gray-500 uppercase tracking-tighter">Upload account list (.txt)</span>
                                    </div>
                                </div>
                                <label className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all active:scale-95 shadow-lg shadow-indigo-500/20">
                                    {bulkUploading === 'accounts' ? 'Uploading...' : 'Select File'}
                                    <input type="file" className="hidden" accept=".txt" onChange={handleBulkUploadAccounts} disabled={bulkUploading === 'accounts'} />
                                </label>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Accounts List (One per line)</p>
                                    <textarea
                                        placeholder="username:password&#10;username:password"
                                        className="w-full bg-gray-50 dark:bg-gray-800/50 border-2 border-gray-100 dark:border-white/5 rounded-2xl p-4 text-xs font-mono text-gray-900 dark:text-white focus:border-indigo-500/50 outline-none transition-all min-h-[200px]"
                                        value={bulkAccountsString}
                                        onChange={e => setBulkAccountsString(e.target.value)}
                                    />
                                    <p className="text-[9px] text-gray-400 mt-1 italic">Format: username:password</p>
                                </div>

                                <div className="pt-2">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Assign Proxy Shield (Optional)</p>
                                    <select className="w-full bg-gray-50 dark:bg-gray-800/50 border-none rounded-xl p-4 text-sm text-gray-500 font-bold" value={newAccount.proxy_id} onChange={e => setNewAccount({ ...newAccount, proxy_id: e.target.value })}>
                                        <option value="">No Proxy (Local IP)</option>
                                        {proxies.map(p => <option key={p.id} value={p.id.toString()}>{p.host}:{p.port}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 mt-8">
                                <button onClick={() => setShowBulkModal(false)} className="px-6 py-3 font-bold text-sm text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
                                <button
                                    onClick={handleBulkAdd}
                                    disabled={!bulkAccountsString.trim() || isBulkAdding}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-xl shadow-indigo-500/20 disabled:opacity-50 transition-all active:scale-95"
                                >
                                    {isBulkAdding ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Deploying Fleet...</span>
                                        </div>
                                    ) : 'Deploy Ghost Fleet 🚀'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showBulkProxyModal && (
                <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-[#1e293b] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-8">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-xl font-black text-gray-900 dark:text-white">Bulk Shield Deployment</h2>
                            </div>
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-6">Mass Authorize Proxies 🌐</p>

                            <div className="flex items-center justify-between gap-4 p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                                        <Server className="w-5 h-5 text-indigo-500" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase text-indigo-600">Rapid Deployment</span>
                                        <span className="text-[9px] font-medium text-gray-500 uppercase tracking-tighter">Upload proxy list (.txt)</span>
                                    </div>
                                </div>
                                <label className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all active:scale-95 shadow-lg shadow-indigo-500/20">
                                    {bulkUploading === 'proxies' ? 'Uploading...' : 'Select File'}
                                    <input type="file" className="hidden" accept=".txt" onChange={handleBulkUploadProxies} disabled={bulkUploading === 'proxies'} />
                                </label>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Proxy List (One per line)</p>
                                    <textarea
                                        placeholder="host:port:user:pass&#10;user:pass:host:port"
                                        className="w-full bg-gray-50 dark:bg-gray-800/50 border-2 border-gray-100 dark:border-white/5 rounded-2xl p-4 text-xs font-mono text-gray-900 dark:text-white focus:border-indigo-500/50 outline-none transition-all min-h-[200px]"
                                        value={bulkProxyString}
                                        onChange={e => setBulkProxyString(e.target.value)}
                                    />
                                    <p className="text-[9px] text-gray-400 mt-1 italic">Format: host:port:user:pass or user:pass:host:port</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 mt-8">
                                <button onClick={() => setShowBulkProxyModal(false)} className="px-6 py-3 font-bold text-sm text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
                                <button
                                    onClick={handleBulkAddProxies}
                                    disabled={!bulkProxyString.trim() || isBulkAddingProxies}
                                    className="flex-1 bg-pink-600 hover:bg-pink-700 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-xl shadow-pink-500/20 disabled:opacity-50 transition-all active:scale-95"
                                >
                                    {isBulkAddingProxies ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Deploying Shields...</span>
                                        </div>
                                    ) : 'Deploy Shield Pool 🛡️'}
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
