import React, { useState, useEffect, useRef } from 'react';
import { 
    BarChart3, Clock, Target, MessageSquare, TrendingUp, 
    Users, Activity, Zap, X, AlertCircle
} from 'lucide-react';
import { campaignsAPI } from '../../services/api';
import { useSocket } from '../../hooks/useSocket';

const formatDate = (date: string | Date) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
};

const formatTimeOnly = (date: string | Date) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
};

interface CampaignAnalyticsModalProps {
    isOpen: boolean;
    onClose: () => void;
    campaignId: number | null;
}

const CampaignAnalyticsModal: React.FC<CampaignAnalyticsModalProps> = ({ isOpen, onClose, campaignId }) => {
    const [analytics, setAnalytics] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'leads'>('overview');
    
    // Lead History Popup States
    const [selectedLeadData, setSelectedLeadData] = useState<any>(null);
    const [leadHistory, setLeadHistory] = useState<any[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTo({
                top: chatContainerRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [leadHistory]);

    const { onMessage } = useSocket();

    const fetchAnalytics = React.useCallback(async () => {
        if (!campaignId) return;
        try {
            const data = await campaignsAPI.getCampaignAnalytics(campaignId);
            setAnalytics(data);
        } catch (error) {
            console.error('Failed to fetch campaign analytics:', error);
        } finally {
            setIsLoading(false);
        }
    }, [campaignId]);

    useEffect(() => {
        if (isOpen && campaignId) {
            fetchAnalytics();

            // --- REAL-TIME LIVE UPDATES ---
            const unsubscribe = onMessage((data: any) => {
                const isNewMessage = data.type === 'new_message';
                const isStatsUpdate = data.type === 'campaign_stats_update';
                const isCorrectCampaign = !data.campaign_id || Number(data.campaign_id) === Number(campaignId);

                if ((isNewMessage || isStatsUpdate) && isCorrectCampaign) {
                    // Small buffer to let the backend finish DB writes
                    setTimeout(() => fetchAnalytics(), 800);
                }
            });

            return () => {
                unsubscribe();
            };
        }
    }, [isOpen, campaignId, fetchAnalytics, onMessage]);

    const handleViewLeadHistory = async (leadID: number) => {
        try {
            setIsHistoryLoading(true);
            const data = await campaignsAPI.getLeadCampaignHistory(campaignId!, leadID);
            setSelectedLeadData(data.lead);
            setLeadHistory(data.history);
        } catch (error) {
            console.error('Failed to fetch lead history:', error);
        } finally {
            setIsHistoryLoading(false);
        }
    };

    if (!isOpen) return null;

    const formatDuration = (seconds: number) => {
        if (!seconds) return 'N/A';
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
            
            <div className="relative bg-white dark:bg-[#0f172a] w-full max-w-5xl max-h-[90vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col border border-gray-100 dark:border-white/5">
                
                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center">
                            <BarChart3 className="w-6 h-6 text-blue-500" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-900 dark:text-white">Campaign Analytics</h2>
                            <p className="text-sm text-gray-400 font-medium">{analytics?.summary?.name || 'Loading...'}</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={fetchAnalytics}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors text-gray-400"
                        >
                            <Activity className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={onClose}
                            className="p-2 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors text-gray-400 hover:text-red-500"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="px-6 py-2 bg-gray-50/50 dark:bg-black/20 border-b border-gray-100 dark:border-white/5 flex items-center gap-6">
                    {[
                        { id: 'overview', label: 'Overview', icon: <TrendingUp className="w-4 h-4" /> },
                        { id: 'leads', label: 'Chat History', icon: <Target className="w-4 h-4" /> },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 py-3 px-1 text-sm font-bold transition-all border-b-2 ${
                                activeTab === tab.id 
                                ? 'text-blue-500 border-blue-500' 
                                : 'text-gray-400 border-transparent hover:text-gray-600 dark:hover:text-gray-200'
                            }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
                            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Crunching campaign data...</p>
                        </div>
                    ) : !analytics ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <AlertCircle className="w-12 h-12 text-red-500 mb-4 opacity-20" />
                            <p className="text-gray-900 dark:text-white font-bold">Failed to load analytics</p>
                            <p className="text-gray-400 text-sm">There was an error fetching the data for this campaign.</p>
                            <button 
                                onClick={fetchAnalytics}
                                className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-xl font-bold hover:bg-blue-600 transition-colors"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            
                            {activeTab === 'overview' && (
                                <>
                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {[
                                            { label: 'Total Leads', value: analytics.summary?.total_leads, icon: <Users />, color: 'blue' },
                                            { label: 'Reached', value: analytics.summary?.reached_leads, icon: <Zap />, color: 'indigo' },
                                            { label: 'Replies', value: analytics.summary?.replied_leads, icon: <MessageSquare />, color: 'green' },
                                            { label: 'Conversion', value: `${analytics.summary?.conversion_rate}%`, icon: <TrendingUp />, color: 'amber' },
                                        ].map(stat => (
                                            <div key={stat.label} className="bg-white dark:bg-[#1e293b] p-5 rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className={`p-2 rounded-xl bg-${stat.color}-500/10 text-${stat.color}-500`}>
                                                        {React.cloneElement(stat.icon as React.ReactElement, { className: 'w-4 h-4' })}
                                                    </div>
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</span>
                                                </div>
                                                <div className="text-2xl font-black text-gray-900 dark:text-white leading-none">
                                                    {stat.value}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Performance Focus */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* Avg Response Time */}
                                        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden">
                                            <div className="relative z-10">
                                                <div className="flex items-center gap-3 mb-6">
                                                    <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
                                                        <Clock className="w-5 h-5 text-white" />
                                                    </div>
                                                    <h3 className="text-lg font-black uppercase tracking-tight">Avg Response Time</h3>
                                                </div>
                                                <div className="text-5xl font-black mb-2 tracking-tighter">
                                                    {formatDuration(analytics.summary?.avg_response_time_seconds)}
                                                </div>
                                                <p className="text-blue-100 text-sm font-bold">
                                                    Average time it takes for a lead to reply to your messages.
                                                </p>
                                            </div>
                                            {/* Decor */}
                                            <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
                                        </div>

                                        {/* Recent Activity Mini-Feed */}
                                        <div className="bg-white dark:bg-[#1e293b] rounded-[2.5rem] border border-gray-100 dark:border-white/5 p-6 shadow-sm overflow-hidden flex flex-col">
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">Recent Activity</h3>
                                                <button 
                                                    onClick={() => setActiveTab('leads')}
                                                    className="text-[10px] font-bold text-blue-500 hover:underline"
                                                >
                                                    View All
                                                </button>
                                            </div>
                                            <div className="space-y-4 flex-1">
                                                {(analytics.recent_activity || []).slice(0, 4).map((log: any, i: number) => (
                                                    <div key={i} className="flex gap-3">
                                                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                                                            log.action === 'keyword_reply' ? 'bg-green-500' : 'bg-blue-500'
                                                        }`} />
                                                        <div>
                                                            <p className="text-xs font-black text-gray-900 dark:text-white leading-tight">
                                                                @{log.telegram_identifier} <span className="text-gray-400 font-bold">{log.action === 'keyword_reply' ? 'Replied' : 'Sent'}</span>
                                                            </p>
                                                            <p className="text-[10px] text-gray-400 font-medium truncate max-w-[200px]">{log.details}</p>
                                                        </div>
                                                        <span className="ml-auto text-[10px] text-gray-300 font-bold">{formatTimeOnly(log.created_at)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}


                            {activeTab === 'leads' && (
                                <div className="space-y-4">
                                    <div className="bg-blue-50 dark:bg-blue-500/5 p-4 rounded-2xl border border-blue-100 dark:border-blue-500/10">
                                        <p className="text-xs text-blue-600 dark:text-blue-400 font-bold">
                                            💡 Click on any user below to see the full message history of the campaign with that lead.
                                        </p>
                                    </div>
                                    <div className="bg-white dark:bg-[#1e293b] rounded-[2rem] border border-gray-100 dark:border-white/5 overflow-hidden shadow-sm">
                                        <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-gray-50/50 dark:bg-black/20 border-b border-gray-100 dark:border-white/5">
                                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Lead Identifier</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Step</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Last Message (Translated)</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Resp. Time</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                            {(analytics.top_conversions || []).map((lead: any, i: number) => (
                                                <tr key={i} className="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors group cursor-pointer" onClick={() => handleViewLeadHistory(lead.id)}>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-black text-gray-900 dark:text-white group-hover:text-blue-500 transition-colors">@{lead.telegram_identifier}</span>
                                                            <Activity className="w-3 h-3 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        </div>
                                                    </td>
                                                     <td className="px-6 py-4 text-center">
                                                        <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-500 text-[10px] font-black rounded-lg">Step {lead.step_number}</span>
                                                     </td>
                                                    <td className="px-6 py-4 max-w-[300px]">
                                                        {(() => {
                                                            const isReplyNewer = lead.reply_at && (!lead.sent_at || new Date(lead.reply_at) > new Date(lead.sent_at));
                                                            const lastTranslated = isReplyNewer 
                                                                ? (lead.reply_translated || lead.reply_original) 
                                                                : (lead.sent_translated || lead.sent_text);
                                                            const lastTime = isReplyNewer ? lead.reply_at : lead.sent_at;
                                                            return (
                                                                <div className="flex flex-col gap-1">
                                                                    <p className="text-sm font-bold text-gray-700 dark:text-gray-200 line-clamp-2 leading-tight">
                                                                        {lastTranslated || 'No message'}
                                                                    </p>
                                                                    {lastTime && (
                                                                        <span className="text-[10px] text-gray-400 font-medium">
                                                                            {formatDate(lastTime)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-xs font-bold text-blue-500">{formatDuration(lead.response_time_seconds)}</span>
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
                </div>

                {/* Footer Info */}
                <div className="p-4 bg-gray-50/50 dark:bg-black/20 border-t border-gray-100 dark:border-white/5 flex items-center justify-center gap-4">
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Real-time stats tracking active</span>
                    </div>
                </div>
            </div>

            {/* Lead History Popup */}
            {selectedLeadData && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setSelectedLeadData(null)} />
                    <div className="relative bg-white dark:bg-[#0f172a] w-full max-w-2xl max-h-[85vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-white/5 animate-in zoom-in-95 duration-200">
                        
                        {/* Popup Header */}
                        <div className="p-6 border-b border-gray-100 dark:border-white/5 flex items-center justify-between bg-gray-50/50 dark:bg-black/20">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-green-500/10 rounded-2xl flex items-center justify-center">
                                    <MessageSquare className="w-5 h-5 text-green-500" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-gray-900 dark:text-white">@{selectedLeadData.identifier}</h3>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                                            selectedLeadData.status === 'completed' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'
                                        }`}>
                                            {selectedLeadData.status}
                                        </span>
                                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Step {selectedLeadData.current_step}</span>
                                    </div>
                                </div>
                            </div>
                            <button 
                                onClick={() => setSelectedLeadData(null)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors text-gray-400"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* History Messages */}
                        <div 
                            ref={chatContainerRef}
                            className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-gray-50/30 dark:bg-black/10"
                        >
                            {isHistoryLoading ? (
                                <div className="flex flex-col items-center justify-center py-20">
                                    <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
                                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Retrieving history...</p>
                                </div>
                            ) : leadHistory.length === 0 ? (
                                <div className="text-center py-20">
                                    <p className="text-gray-400 font-bold">No campaign history found for this lead.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {leadHistory.map((msg, idx) => (
                                        <div key={idx} className={`flex ${msg.is_outgoing ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[85%] group`}>
                                                <div className={`p-4 rounded-[1.5rem] shadow-sm ${
                                                    msg.is_outgoing 
                                                    ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-tr-none' 
                                                    : 'bg-white dark:bg-[#1e293b] text-gray-900 dark:text-white border border-gray-100 dark:border-white/5 rounded-tl-none'
                                                }`}>
                                                    <div className="space-y-1.5">
                                                        <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${
                                                            msg.is_outgoing ? 'text-white/50' : 'text-gray-400'
                                                        }`}>
                                                            Original
                                                        </div>
                                                        <div className="text-sm font-medium leading-relaxed">
                                                            {msg.original_text}
                                                        </div>
                                                        {(msg.original_text && msg.translated_text) && (
                                                            <div className={`pt-2 mt-2 border-t ${
                                                                msg.is_outgoing 
                                                                ? 'border-white/20' 
                                                                : 'border-gray-100 dark:border-white/5'
                                                            }`}>
                                                                <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${
                                                                    msg.is_outgoing ? 'text-white/50' : 'text-gray-400'
                                                                }`}>
                                                                    Translated
                                                                </div>
                                                                <div className={`text-sm opacity-90 ${
                                                                    msg.is_outgoing ? 'text-white' : 'text-gray-900 dark:text-white'
                                                                }`}>
                                                                    {msg.translated_text}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className={`text-[9px] font-black uppercase tracking-widest mt-1.5 block opacity-0 group-hover:opacity-100 transition-opacity ${
                                                    msg.is_outgoing ? 'text-right text-indigo-400' : 'text-left text-gray-400'
                                                }`}>
                                                    {formatDate(msg.created_at)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                    
                                    {selectedLeadData.status === 'completed' && (
                                        <div className="flex items-center gap-4 py-4">
                                            <div className="flex-1 h-px bg-gray-100 dark:bg-white/5" />
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Campaign sequence completed</span>
                                            <div className="flex-1 h-px bg-gray-100 dark:bg-white/5" />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        <div className="p-4 bg-gray-50/50 dark:bg-black/20 border-t border-gray-100 dark:border-white/5 flex items-center justify-center">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest italic">
                                History shown from first campaign contact until sequence end
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CampaignAnalyticsModal;
