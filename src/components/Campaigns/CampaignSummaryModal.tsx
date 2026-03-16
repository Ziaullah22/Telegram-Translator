import React, { useState, useEffect } from 'react';
import { 
    FileText, X, Rocket, Users, CheckCircle2, MessageSquare, 
    Target, Clock, ShieldOff, GitBranch, Zap, ChevronRight,
    ArrowRightCircle, AlertCircle
} from 'lucide-react';
import { campaignsAPI } from '../../services/api';
import type { Campaign, CampaignStep } from '../../types';

interface CampaignSummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    campaignId: number | null;
}

const CampaignSummaryModal: React.FC<CampaignSummaryModalProps> = ({ isOpen, onClose, campaignId }) => {
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [steps, setSteps] = useState<CampaignStep[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && campaignId) {
            const loadData = async () => {
                setLoading(true);
                setError(null);
                try {
                    const [campData, stepsData] = await Promise.all([
                        campaignsAPI.getCampaign(campaignId),
                        campaignsAPI.getSteps(campaignId)
                    ]);
                    setCampaign(campData);
                    setSteps(stepsData);
                } catch (err) {
                    console.error("Failed to load summary data:", err);
                    setError("We couldn't load the campaign details. Please try again.");
                } finally {
                    setLoading(false);
                }
            };
            loadData();
        }
    }, [isOpen, campaignId]);

    if (!isOpen) return null;

    const formatWaitTime = (totalHours: number) => {
        if (!totalHours || totalHours === 0) return 'No Wait';
        
        const days = Math.floor(totalHours / 24);
        const hours = Math.floor(totalHours % 24);
        const minutes = Math.round((totalHours % 1) * 60);

        const parts = [];
        if (days > 0) parts.push(`${days} ${days === 1 ? 'Day' : 'Days'}`);
        if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'Hour' : 'Hours'}`);
        if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'Minute' : 'Minutes'}`);

        return parts.length > 0 ? parts.join(' ') : 'No Wait';
    };

    const stats = campaign ? [
        { label: 'Total Leads', value: campaign.total_leads ?? 0, icon: <Users className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-500/10' },
        { label: 'Finished', value: campaign.completed_leads ?? 0, icon: <CheckCircle2 className="w-5 h-5 text-indigo-500" />, bg: 'bg-indigo-500/10' },
        { label: 'Replies', value: campaign.replied_leads ?? 0, icon: <MessageSquare className="w-5 h-5 text-green-500" />, bg: 'bg-green-500/10' },
        { label: 'Reply Rate', value: `${campaign.completed_leads ? Math.round(((campaign.replied_leads || 0) / campaign.completed_leads) * 100) : 0}%`, icon: <Target className="w-5 h-5 text-blue-600" />, bg: 'bg-blue-600/10' },
    ] : [];

    return (
        <div className="fixed inset-x-0 bottom-0 top-[73px] z-[100] flex items-center justify-center p-0">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
            
            <div className="relative bg-[#f8fafc] dark:bg-[#0f172a] w-full h-full overflow-hidden flex flex-col animate-fade-in">
                
                {/* ── HEADER ── */}
                <div className="border-b border-blue-100 dark:border-white/5 bg-[#f0f9ff] dark:bg-[#0f172a] z-20 shrink-0 shadow-sm transition-colors">
                    <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                                <Zap className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-gray-900 dark:text-white leading-none uppercase tracking-tight">Campaign Summary</h2>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Everything about your campaign</p>
                            </div>
                        </div>

                        <button 
                            onClick={onClose}
                            className="w-10 h-10 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all text-gray-400 hover:text-red-500"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* ── BODY ── */}
                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center space-y-4 text-center">
                        <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
                        <p className="text-gray-400 font-black uppercase tracking-widest text-xs">Loading Summary...</p>
                    </div>
                ) : error ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4 text-center">
                        <AlertCircle className="w-12 h-12 text-red-500 mb-2" />
                        <h3 className="text-lg font-black text-gray-900 dark:text-white">Something went wrong</h3>
                        <p className="text-gray-500 dark:text-gray-400 max-w-sm">{error}</p>
                        <button onClick={onClose} className="px-6 py-2 bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 rounded-xl font-bold">Close</button>
                    </div>
                ) : campaign ? (
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <div className="w-full px-6 py-8 space-y-8">
                            
                            {/* Stats */}
                            <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
                                {stats.map((stat: any) => (
                                    <div key={stat.label} className="bg-white dark:bg-[#1e293b] p-5 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className={`p-2 rounded-xl ${stat.bg}`}>
                                                {stat.icon}
                                            </div>
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</span>
                                        </div>
                                        <p className="text-2xl font-black text-gray-900 dark:text-white">{stat.value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Single Column Content */}
                            <div className="max-w-6xl mx-auto space-y-8">
                                
                                {/* 1. Basics */}
                                <div className="bg-white dark:bg-[#1e293b] rounded-3xl p-8 border border-gray-100 dark:border-white/5 shadow-sm">
                                    <div className="flex items-center gap-3 border-b border-gray-50 dark:border-white/5 pb-6 mb-6">
                                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                            <Target className="w-5 h-5 text-blue-500" />
                                        </div>
                                        <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-widest">Basics</h3>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Name</p>
                                            <p className="text-lg font-black text-gray-900 dark:text-white">{campaign.name}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Status</p>
                                            <span className={`inline-flex px-3 py-1.5 rounded-full text-[12px] font-black uppercase tracking-wider ${
                                                campaign.status === 'running' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                                                campaign.status === 'paused' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' :
                                                'bg-gray-100 text-gray-600 dark:bg-gray-700'
                                            }`}>
                                                {campaign.status}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* 2. Always On Replies */}
                                <div className="bg-white dark:bg-[#1e293b] rounded-3xl p-8 border border-gray-100 dark:border-white/5 shadow-sm">
                                    <div className="flex items-center gap-3 border-b border-gray-50 dark:border-white/5 pb-6 mb-6">
                                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                            <Zap className="w-5 h-5 text-blue-500" />
                                        </div>
                                        <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-widest">Always On Replies</h3>
                                    </div>
                                    
                                    <div className="space-y-6">
                                        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed font-bold">These replies work at any time, no matter which message was sent last.</p>
                                                                  {campaign.auto_replies && campaign.auto_replies.length > 0 ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {campaign.auto_replies.map((reply: any, i: number) => (
                                                    <div key={i} className="p-6 bg-gray-50 dark:bg-white/5 rounded-[24px] border border-gray-100 dark:border-white/5 hover:border-blue-200 transition-colors">
                                                        <div className="flex flex-wrap gap-2 mb-4">
                                                            {(Array.isArray(reply.keywords) ? reply.keywords : []).map((kw: string, ki: number) => (
                                                                <span key={ki} className="px-2 py-1 bg-blue-600/10 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase rounded-lg border border-blue-600/20">{kw}</span>
                                                            ))}
                                                        </div>
                                                        <p className="text-sm font-bold text-gray-700 dark:text-gray-300 italic leading-relaxed pl-3 border-l-2 border-blue-600/30">"Ans: {reply.reply}"</p>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="p-12 bg-gray-50/50 dark:bg-white/5 rounded-[32px] border border-dashed border-gray-200 dark:border-white/10 text-center">
                                                <p className="text-xs text-gray-400 font-black uppercase tracking-widest">No Rules Set</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 3. Stop Words */}
                                <div className="bg-white dark:bg-[#1e293b] rounded-3xl p-8 border border-gray-100 dark:border-white/5 shadow-sm">
                                    <div className="flex items-center gap-3 border-b border-gray-50 dark:border-white/5 pb-6 mb-6">
                                        <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                                            <ShieldOff className="w-5 h-5 text-red-500" />
                                        </div>
                                        <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-widest">Stop Words</h3>
                                    </div>
                                    
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Keywords that stop the campaign</p>
                                        {campaign.negative_keywords && campaign.negative_keywords.length > 0 ? (
                                            <div className="flex flex-wrap gap-3">
                                                {campaign.negative_keywords.map((word: string, i: number) => (
                                                    <span key={i} className="px-4 py-2 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-black uppercase tracking-widest rounded-xl border border-red-100 dark:border-red-900/20">
                                                        {word.trim()}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-gray-400 italic font-bold">No stop words set.</p>
                                        )}
                                    </div>
                                </div>

                                {/* 4. Message Order */}
                                <div className="bg-white dark:bg-[#1e293b] rounded-3xl p-8 border border-gray-100 dark:border-white/5 shadow-sm">
                                    <div className="flex items-center justify-between border-b border-gray-50 dark:border-white/5 pb-8 mb-10">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-xl shadow-indigo-500/20 text-white">
                                                <GitBranch className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-widest leading-none">Message Order</h3>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1.5">{steps.length + 1} Step Flow</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-16 relative">
                                        {/* Vertical Timeline Track */}
                                        <div className="absolute left-8 top-10 bottom-10 w-0.5 bg-gray-100 dark:bg-white/5 -z-0" />

                                        {/* Step 0: First Message */}
                                        <div className="relative flex gap-10 z-10">
                                            <div className="w-16 h-16 rounded-[24px] bg-blue-600 text-white flex items-center justify-center shadow-2xl shadow-blue-600/30 shrink-0 border-[6px] border-white dark:border-[#1e293b]">
                                                <Rocket className="w-7 h-7" />
                                            </div>
                                            <div className="flex-1 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[12px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 dark:bg-blue-900/40 px-4 py-1.5 rounded-full border border-blue-100 dark:border-blue-500/20">Step 0: First Message</span>
                                                    <div className="flex items-center gap-2 py-1.5 px-4 bg-gray-50 dark:bg-black/20 rounded-full border border-gray-100 dark:border-white/5">
                                                        <Clock className="w-4 h-4 text-gray-400" />
                                                        <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Sends Now</span>
                                                    </div>
                                                </div>
                                                <div className="bg-[#f0f9ff] dark:bg-blue-900/10 p-8 rounded-[32px] border border-blue-100 dark:border-blue-500/20 shadow-sm relative group overflow-hidden">
                                                    <FileText className="absolute top-4 right-4 w-12 h-12 text-blue-600 opacity-5" />
                                                    <p className="text-lg font-bold text-gray-800 dark:text-gray-200 italic leading-relaxed relative z-10">"{campaign.initial_message}"</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Follow-up Steps */}
                                        {steps.map((step: any, idx: number) => (
                                            <div key={idx} className="relative flex gap-10 z-10">
                                                <div className="w-16 h-16 rounded-[24px] bg-white dark:bg-[#0f172a] text-indigo-600 flex items-center justify-center font-black shadow-xl shadow-indigo-500/5 shrink-0 border-[6px] border-indigo-50 dark:border-indigo-900/10 text-2xl">
                                                    {idx + 1}
                                                </div>
                                                <div className="flex-1 space-y-6">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[12px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 dark:bg-indigo-900/40 px-4 py-1.5 rounded-full border border-indigo-100 dark:border-indigo-500/20">Step {idx + 1}: Follow-up</span>
                                                        <div className="flex items-center gap-2 py-1.5 px-4 bg-gray-50 dark:bg-black/20 rounded-full border border-gray-100 dark:border-white/5">
                                                            <Clock className="w-4 h-4 text-gray-400" />
                                                            <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Wait: {formatWaitTime(step.wait_time_hours)}</span>
                                                        </div>
                                                    </div>

                                                    {/* Primary Nudge */}
                                                    <div className="bg-white dark:bg-[#1e293b] p-8 rounded-[32px] border border-gray-100 dark:border-white/10 shadow-sm relative">
                                                        <div className="flex items-center gap-3 mb-4">
                                                            <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                                                <MessageSquare className="w-4 h-4 text-blue-500" />
                                                            </div>
                                                            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Sent if they don't reply</p>
                                                        </div>
                                                        <p className="text-lg font-bold text-gray-800 dark:text-gray-200 italic leading-relaxed">"{step.response_text}"</p>
                                                    </div>

                                                    {/* Step Keywords & Responses */}
                                                    {((step.keywords && step.keywords.length > 0) || (step.auto_replies && step.auto_replies.length > 0)) && (
                                                        <div className="space-y-6 pl-8 border-l-4 border-dashed border-blue-100 dark:border-blue-500/10 ml-8">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                                                    <Zap className="w-4 h-4 text-blue-500" />
                                                                </div>
                                                                <p className="text-[11px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Fast Replies for this step</p>
                                                            </div>
                                                            
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                {/* Simple Keyword Replies */}
                                                                {step.keywords && step.keywords.length > 0 && (
                                                                     <div className="p-6 bg-blue-50/20 dark:bg-blue-500/5 rounded-[28px] border border-blue-100 dark:border-blue-500/10 space-y-4">
                                                                        <div className="flex flex-wrap gap-2">
                                                                            {step.keywords.map((kw: string, ki: number) => (
                                                                                <span key={ki} className="px-2 py-1 bg-white dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 text-[10px] font-black uppercase rounded-lg border border-blue-100 dark:border-blue-500/20">{kw}</span>
                                                                            ))}
                                                                        </div>
                                                                        <p className="text-sm font-bold text-gray-700 dark:text-gray-400 italic">"Ans: {step.keyword_response_text || 'Acknowledged'}"</p>
                                                                     </div>
                                                                )}

                                                                {/* Auto Replies with Jumps */}
                                                                {step.auto_replies && step.auto_replies.map((reply: any, ri: number) => (
                                                                    <div key={ri} className="p-6 bg-blue-50/20 dark:bg-blue-500/5 rounded-[28px] border border-blue-100 dark:border-blue-500/10 flex flex-col gap-4">
                                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                                            <div className="flex flex-wrap gap-2">
                                                                                {(Array.isArray(reply.keywords) ? reply.keywords : []).map((kw: string, ki: number) => (
                                                                                    <span key={ki} className="px-2 py-1 bg-white dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 text-[10px] font-black uppercase rounded-lg border border-blue-100 dark:border-blue-500/20">{kw}</span>
                                                                                ))}
                                                                            </div>
                                                                            {reply.next_step !== undefined && reply.next_step !== null && (
                                                                                <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase rounded-full border border-blue-500/10 shrink-0">
                                                                                    <ArrowRightCircle className="w-3 h-3" />
                                                                                    Go to Step {reply.next_step}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <p className="text-sm font-bold text-gray-700 dark:text-gray-300 italic leading-relaxed">"Ans: {reply.reply}"</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}

                                        {steps.length === 0 && (
                                            <div className="relative flex gap-10 z-10 opacity-50">
                                                <div className="w-16 h-16 rounded-[24px] bg-gray-100 dark:bg-white/5 text-gray-300 flex items-center justify-center shrink-0 border-[6px] border-gray-50 dark:border-white/5">
                                                    <ChevronRight className="w-8 h-8" />
                                                </div>
                                                <div className="flex-1 p-10 bg-gray-50 dark:bg-white/5 rounded-[40px] border border-dashed border-gray-200 dark:border-white/5">
                                                    <p className="text-sm text-gray-400 font-black uppercase tracking-widest italic">No more steps after this.</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default CampaignSummaryModal;
