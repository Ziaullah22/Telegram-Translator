import React, { useState, useEffect } from 'react';
import {
    Plus, Rocket, Users, BarChart2, Play, Pause, Trash2, Upload,
    FileText, Clock, ChevronDown, ChevronUp, Zap, ShieldOff, GitBranch,
    MessageSquare, Info, CheckCircle2, AlertTriangle, Target, RotateCcw
} from 'lucide-react';
import { campaignsAPI } from '../../services/api';
import type { Campaign } from '../../types';
import CreateCampaignModal from './CreateCampaignModal';
import CampaignLeadsModal from './CampaignLeadsModal';
import CampaignAnalyticsModal from './CampaignAnalyticsModal';
import ConfirmModal from '../Common/ConfirmModal';

// ── How To Use Data ───────────────────────────────────────────────────────────
const HOW_TO_USE_STEPS = [
    {
        icon: <Upload className="w-5 h-5" />,
        color: 'blue',
        title: '1. Create Your Campaign',
        desc: 'Click "New Campaign", give it a name, write your opening message, and upload a CSV file with your leads (one username or phone number per line).',
    },
    {
        icon: <MessageSquare className="w-5 h-5" />,
        color: 'indigo',
        title: '2. Add Follow-Up Steps',
        desc: 'Add timed follow-up messages. Each step waits a set time (e.g. 1 day) then sends automatically if the lead hasn\'t replied yet.',
    },
    {
        icon: <GitBranch className="w-5 h-5" />,
        color: 'violet',
        title: '3. Set AI Responses & Jumps',
        desc: 'Each step now has TWO boxes: one for a timed follow-up (sent if the user is silent) and one for an AI Keyword Response (sent instantly if they reply with a keyword).',
    },
    {
        icon: <ShieldOff className="w-5 h-5" />,
        color: 'rose',
        title: '4. Enable Kill Switch',
        desc: 'Add negative keywords (e.g. "stop", "scam"). If a lead says one of these, the campaign immediately stops messaging them and marks them as aborted.',
    },
    {
        icon: <Rocket className="w-5 h-5" />,
        color: 'green',
        title: '5. Launch & Monitor',
        desc: 'Click Launch. The campaign handles everything: it waits, types, sends, and responds. Watch your Leads, Reached, and Replies numbers update in real time.',
    },
];

const SCENARIOS = [
    {
        icon: <Target className="w-5 h-5" />,
        badge: 'Standard',
        badgeColor: 'blue',
        title: 'Sequential Follow-Up',
        desc: 'Basic timed sequence — good for cold outreach when you don\'t know what the lead will say.',
        steps: [
            { label: 'Initial', text: '"Hi! Are you looking for web design services?"' },
            { label: 'Day 1', text: '"Just following up! Did you get a chance to read my message?"' },
            { label: 'Day 3', text: '"Last follow-up — let me know if you\'re interested!"' },
        ],
        tip: 'No keywords needed. The campaign just waits and sends in order.',
    },
    {
        icon: <GitBranch className="w-5 h-5" />,
        badge: 'Smart Jump',
        badgeColor: 'violet',
        title: 'Intelligent Branching (Jump to Step)',
        desc: 'When a lead shows buying intent, the campaign skips the queue and jumps straight to the sales pitch.',
        steps: [
            { label: 'Initial', text: '"Hi! Are you interested in a website?"' },
            { label: 'Step 1 (keywords: price, cost → Jump to Step 2)', text: '"Just following up!"' },
            { label: 'Step 2 (Sale)', text: '"Great! The price starts at $500. Here is your link: [LINK]"' },
        ],
        tip: 'Lead says "price" → Campaign skips Step 1\'s timer, jumps to Step 2 immediately.',
    },
    {
        icon: <ShieldOff className="w-5 h-5" />,
        badge: 'Kill Switch',
        badgeColor: 'rose',
        title: 'Negative Keyword Abort',
        desc: 'Protect your account from angry users. If they say anything negative, the campaign immediately stops and never contacts them again.',
        steps: [
            { label: 'Initial', text: '"Hi! Are you looking for services?"' },
            { label: 'Lead replies', text: '"Stop messaging me!" or "Is this a scam?"' },
            { label: 'Campaign action', text: 'Detects "stop" or "scam" → Instantly aborts. Lead marked FAILED.' },
        ],
        tip: 'Set negative keywords: stop, scam, spam, leave me alone, not interested.',
    },
    {
        icon: <RotateCcw className="w-5 h-5" />,
        badge: 'Looping',
        badgeColor: 'green',
        title: 'The Infinite Loop (Starting Over)',
        desc: 'Ensure your leads never go "cold". If they want to start over, the campaign can jump back to the very first message.',
        steps: [
            { label: 'Initial', text: '"Welcome to our service!"' },
            { label: 'Step 1 (keywords: restart, again → Jump to Start)', text: '"I haven\'t heard from you..."' },
            { label: 'Campaign action', text: 'Lead says "restart" → Campaign sends Loop Response (Purple) and resets to Step 0.' },
        ],
        tip: 'Perfect for customer service or complex flows where users might want to try again.',
    },
    {
        icon: <Zap className="w-5 h-5" />,
        badge: 'AI Replier',
        badgeColor: 'amber',
        title: 'Double-Box System (Timer vs AI)',
        desc: 'Understand the difference: Blue box is a "Reminder" (sent if silent); Purple box is an "Answer" (sent if they talk).',
        steps: [
            { label: 'Wait 1 Hour', text: 'User is silent → Campaign sends Blue Box reminder.' },
            { label: 'User Replies', text: 'User says "Tell me more" → Campaign sends Purple Box answer instantly.' },
            { label: 'Jump', text: 'Both actions move the lead to the next logic step automatically.' },
        ],
        tip: 'Use the Blue box for "Gentle Nudges" and the Purple box for "Direct Answers".',
    },
];

const colorMap: Record<string, { bg: string; text: string; border: string; icon: string }> = {
    blue:   { bg: 'bg-blue-500/10',   text: 'text-blue-500',   border: 'border-blue-500/20',   icon: 'bg-blue-500' },
    indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-500', border: 'border-indigo-500/20', icon: 'bg-indigo-500' },
    violet: { bg: 'bg-violet-500/10', text: 'text-violet-500', border: 'border-violet-500/20', icon: 'bg-violet-500' },
    rose:   { bg: 'bg-rose-500/10',   text: 'text-rose-500',   border: 'border-rose-500/20',   icon: 'bg-rose-500' },
    green:  { bg: 'bg-green-500/10',  text: 'text-green-500',  border: 'border-green-500/20',  icon: 'bg-green-500' },
    amber:  { bg: 'bg-amber-500/10',  text: 'text-amber-500',  border: 'border-amber-500/20',  icon: 'bg-amber-500' },
};

// ── Main Component ─────────────────────────────────────────────────────────────
const CampaignPage: React.FC = () => {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedCampaignForLeads, setSelectedCampaignForLeads] = useState<Campaign | null>(null);
    const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
    const [selectedAnalyticsCampaignId, setSelectedAnalyticsCampaignId] = useState<number | null>(null);
    const [showGuide, setShowGuide] = useState(false);
    const [expandedScenario, setExpandedScenario] = useState<number | null>(null);
    const [editCampaignId, setEditCampaignId] = useState<number | null>(null);
    const [updatingCampaigns, setUpdatingCampaigns] = useState<Set<number>>(new Set());

    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        confirmText: string;
        type: 'danger' | 'warning' | 'info';
        onConfirm: () => void;
    }>({
        isOpen: false,
        title: '',
        description: '',
        confirmText: '',
        type: 'warning',
        onConfirm: () => { }
    });

    const fetchCampaigns = async (silent = false) => {
        try {
            if (!silent) setIsLoading(true);
            const data = await campaignsAPI.getCampaigns();
            const newCampaigns = Array.isArray(data) ? data.filter(Boolean) : [];
            
            // Merge logic: Respect campaigns that are currently "waiting" for an API response
            setCampaigns(prev => {
                if (!prev.length) return newCampaigns;
                
                return newCampaigns.map(newCamp => {
                    const isUpdating = updatingCampaigns.has(newCamp.id);
                    if (isUpdating) {
                        // Find the current local version which has the "optimistic" status
                        const localCamp = prev.find(p => p.id === newCamp.id);
                        return localCamp ? { ...newCamp, status: localCamp.status } : newCamp;
                    }
                    return newCamp;
                });
            });
        } catch (error) {
            console.error('Failed to fetch campaigns:', error);
            if (!silent) setCampaigns([]);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    const handleDeleteCampaign = (e: React.MouseEvent, id: number, name: string) => {
        e.stopPropagation();
        setConfirmConfig({
            isOpen: true,
            title: 'Delete Campaign?',
            description: `This will permanently remove "${name}" and all associated leads and logs. This action cannot be undone.`,
            confirmText: 'Delete Permanently',
            type: 'danger',
            onConfirm: async () => {
                try {
                    await campaignsAPI.deleteCampaign(id);
                    fetchCampaigns();
                    setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                } catch {
                    alert('Failed to delete campaign.');
                }
            }
        });
    };

    const handleRestartCampaign = (e: React.MouseEvent, id: number, name: string) => {
        e.stopPropagation();
        setConfirmConfig({
            isOpen: true,
            title: 'Restart Campaign?',
            description: `This will reset all leads in "${name}" back to Step 0 and set them to "Pending". Use this only if you want to re-run the entire sequence.`,
            confirmText: 'Restart From Scratch',
            type: 'warning',
            onConfirm: async () => {
                try {
                    await campaignsAPI.restartCampaign(id);
                    fetchCampaigns();
                    setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                } catch {
                    alert('Failed to restart campaign.');
                }
            }
        });
    };

    const handleUpdateStatus = async (e: React.MouseEvent, id: number, currentStatus: string) => {
        e.stopPropagation();
        
        // Prevent spam clicking if already updating
        if (updatingCampaigns.has(id)) return;

        try {
            // 1. Mark as updating
            setUpdatingCampaigns(prev => new Set(prev).add(id));

            // 2. Optimistically update UI
            const targetStatus = currentStatus === 'running' ? 'paused' : 'running';
            setCampaigns(prev => prev.map(c => 
                c.id === id ? { ...c, status: targetStatus } : c
            ));
            
            // 3. Call API
            if (currentStatus === 'running') {
                await campaignsAPI.pauseCampaign(id);
            } else {
                await campaignsAPI.resumeCampaign(id);
            }

            // 4. Release lock immediately after API returns success
            setUpdatingCampaigns(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            fetchCampaigns(true);

        } catch {
            alert('Failed to update campaign status. Please try again.');
            setUpdatingCampaigns(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            fetchCampaigns(true);
        }
    };

    useEffect(() => {
        fetchCampaigns();
        // Slowing down refresh to 5 seconds to prevent performance issues and accidental overrides
        const interval = setInterval(() => fetchCampaigns(true), 5000);
        return () => clearInterval(interval);
    }, []);

    const getTimeUntilReset = (resetDateStr?: string) => {
        if (!resetDateStr) return '';
        const diffMs = new Date(resetDateStr).getTime() - Date.now();
        if (diffMs <= 0) return 'Resetting...';
        const h = Math.floor(diffMs / 3600000);
        const m = Math.floor((diffMs % 3600000) / 60000);
        const s = Math.floor((diffMs % 60000) / 1000);
        return `${h}h ${m}m ${s}s`;
    };

    const getStatusBadge = (status: string, isHibernating?: boolean) => {
        if (isHibernating && status === 'running') {
            return (
                <span className="flex items-center gap-1 bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    <Clock className="w-3 h-3" /> Hibernating
                </span>
            );
        }
        const styles: Record<string, string> = {
            draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-300',
            running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 animate-pulse',
            paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
            completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
        };
        return (
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${styles[status] || styles.draft}`}>
                {status}
            </span>
        );
    };

    const totalLeads = campaigns.reduce((a, c) => a + (c.total_leads || 0), 0);
    const totalReached = campaigns.reduce((a, c) => a + (c.completed_leads || 0), 0);
    const totalReplies = campaigns.reduce((a, c) => a + (c.replied_leads || 0), 0);
    const convRate = totalReached > 0 ? Math.round((totalReplies / totalReached) * 100) : 0;

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0f172a] p-6 lg:p-8">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* ── Header ── */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
                            <span className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30">
                                <Rocket className="w-5 h-5 text-white" />
                            </span>
                            Automated Campaigns
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">
                            Launch smart outreach sequences that work while you sleep.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowGuide(v => !v)}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-all text-sm font-semibold"
                        >
                            <Info className="w-4 h-4" />
                            {showGuide ? 'Hide Guide' : 'How to Use'}
                        </button>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/25 font-bold text-sm"
                        >
                            <Plus className="w-4 h-4" />
                            New Campaign
                        </button>
                    </div>
                </div>

                {/* ── Stats ── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Total Leads', value: totalLeads, icon: <Users className="w-5 h-5" />, color: 'blue' },
                        { label: 'Reached', value: totalReached, icon: <CheckCircle2 className="w-5 h-5" />, color: 'indigo' },
                        { label: 'Replies', value: totalReplies, icon: <MessageSquare className="w-5 h-5" />, color: 'green' },
                        { label: 'Reply Rate', value: `${convRate}%`, icon: <BarChart2 className="w-5 h-5" />, color: 'violet' },
                    ].map(stat => {
                        const c = colorMap[stat.color];
                        return (
                            <div key={stat.label} className="bg-white dark:bg-[#1e293b] rounded-2xl p-5 border border-gray-100 dark:border-white/5 shadow-sm">
                                <div className="flex items-center justify-between mb-3">
                                    <div className={`p-2 rounded-xl ${c.bg}`}>
                                        <span className={c.text}>{stat.icon}</span>
                                    </div>
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</span>
                                </div>
                                <p className="text-3xl font-black text-gray-900 dark:text-white">{stat.value}</p>
                            </div>
                        );
                    })}
                </div>

                {/* ── How To Use Guide ── */}
                {showGuide && (
                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden">
                        <div className="p-5 border-b border-gray-100 dark:border-white/5 flex items-center gap-3">
                            <Info className="w-5 h-5 text-blue-500" />
                            <h2 className="text-base font-black text-gray-900 dark:text-white tracking-tight">How to Use the Campaign System</h2>
                        </div>

                        {/* 5 Steps */}
                        <div className="p-5 grid grid-cols-1 md:grid-cols-5 gap-4 border-b border-gray-100 dark:border-white/5">
                            {HOW_TO_USE_STEPS.map((step, i) => {
                                const c = colorMap[step.color];
                                return (
                                    <div key={i} className={`rounded-xl p-4 ${c.bg} ${c.border} border`}>
                                        <div className={`w-8 h-8 rounded-lg ${c.icon} flex items-center justify-center text-white mb-3`}>
                                            {step.icon}
                                        </div>
                                        <p className={`text-xs font-black mb-1 ${c.text}`}>{step.title}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{step.desc}</p>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Scenarios */}
                        <div className="p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <Zap className="w-4 h-4 text-amber-500" />
                                <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Test Scenarios</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {SCENARIOS.map((sc, i) => {
                                    const c = colorMap[sc.badgeColor];
                                    const isOpen = expandedScenario === i;
                                    return (
                                        <div key={i} className="rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
                                            <button
                                                onClick={() => setExpandedScenario(isOpen ? null : i)}
                                                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${c.bg}`}>
                                                        <span className={c.text}>{sc.icon}</span>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>{sc.badge}</span>
                                                        </div>
                                                        <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">{sc.title}</p>
                                                    </div>
                                                </div>
                                                {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                                            </button>
                                            {isOpen && (
                                                <div className="px-4 pb-4 border-t border-gray-100 dark:border-white/5 pt-3 space-y-3">
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">{sc.desc}</p>
                                                    <div className="space-y-2">
                                                        {sc.steps.map((s, j) => (
                                                            <div key={j} className="flex gap-2 items-start">
                                                                <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${c.bg} ${c.text} shrink-0 mt-0.5`}>{s.label}</span>
                                                                <p className="text-xs text-gray-600 dark:text-gray-300 italic">{s.text}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className={`flex items-start gap-2 rounded-lg p-3 ${c.bg}`}>
                                                        <AlertTriangle className={`w-3.5 h-3.5 ${c.text} shrink-0 mt-0.5`} />
                                                        <p className={`text-xs font-semibold ${c.text}`}>{sc.tip}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Campaign List ── */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">Your Campaigns</h2>
                        <span className="text-xs text-gray-400 font-semibold">{campaigns.length} total</span>
                    </div>

                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5">
                            <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-3" />
                            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Loading campaigns...</p>
                        </div>
                    ) : campaigns.length === 0 ? (
                        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border-2 border-dashed border-gray-200 dark:border-white/5 p-12 text-center">
                            <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Rocket className="w-8 h-8 text-blue-500" />
                            </div>
                            <h3 className="text-lg font-black text-gray-900 dark:text-white mb-1">No Campaigns Yet</h3>
                            <p className="text-gray-400 text-sm mb-6 max-w-xs mx-auto">Create your first automated outreach campaign to get started.</p>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-600/20"
                            >
                                <Plus className="w-4 h-4" /> Create First Campaign
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {campaigns.map(camp => (
                                <div
                                    key={camp.id}
                                    onClick={() => setSelectedCampaignForLeads(camp)}
                                    className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5 hover:border-blue-500/30 dark:hover:border-blue-500/30 transition-all duration-200 group cursor-pointer shadow-sm hover:shadow-md"
                                >
                                    <div className="p-5 flex flex-wrap items-center justify-between gap-4">

                                        {/* Left: Icon + Name */}
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0 group-hover:scale-105 transition-transform">
                                                <FileText className="w-5 h-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                                    <h3 className="text-base font-black text-gray-900 dark:text-white leading-none truncate">{camp.name}</h3>
                                                    {getStatusBadge(camp.status, camp.is_hibernating)}
                                                    {camp.is_hibernating && camp.status === 'running' && (
                                                        <span className="text-[10px] font-bold text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-lg">
                                                            ⏰ {getTimeUntilReset(camp.next_reset_at)}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-400 truncate max-w-xs">
                                                    "{camp.initial_message?.substring(0, 60) || ''}..."
                                                </p>
                                            </div>
                                        </div>

                                        {/* Center: Stats */}
                                        <div className="flex items-center gap-6">
                                            {[
                                                { label: 'Leads', value: camp.total_leads ?? 0, color: 'text-gray-900 dark:text-white' },
                                                { label: 'Reached', value: camp.completed_leads ?? 0, color: 'text-blue-600 dark:text-blue-400' },
                                                { label: 'Replies', value: camp.replied_leads ?? 0, color: 'text-green-500' },
                                            ].map(stat => (
                                                <div key={stat.label} className="text-center">
                                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">{stat.label}</p>
                                                    <p className={`text-xl font-black leading-none ${stat.color}`}>{stat.value}</p>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Right: Actions */}
                                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                            <button
                                                title="View Leads"
                                                onClick={() => setSelectedCampaignForLeads(camp)}
                                                className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                                            >
                                                <Users className="w-4 h-4" />
                                            </button>
                                            <button
                                                title="View Analytics"
                                                onClick={() => { setIsAnalyticsOpen(true); setSelectedAnalyticsCampaignId(camp.id); }}
                                                className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all"
                                            >
                                                <BarChart2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                title={camp.status !== 'paused' && camp.status !== 'draft' ? "Pause campaign to edit" : "Edit Campaign"}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (camp.status !== 'paused' && camp.status !== 'draft') {
                                                        alert("Please pause the campaign first before editing.");
                                                        return;
                                                    }
                                                    setEditCampaignId(camp.id);
                                                    setShowCreateModal(true);
                                                }}
                                                className={`p-2.5 rounded-xl transition-all ${
                                                    camp.status !== 'paused' && camp.status !== 'draft'
                                                    ? 'bg-gray-50/50 dark:bg-gray-800/50 text-gray-300 dark:text-gray-600 cursor-not-allowed' 
                                                    : 'bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                                                }`}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                                            </button>
                                            <button
                                                title="Restart Campaign"
                                                onClick={(e) => handleRestartCampaign(e, camp.id, camp.name)}
                                                className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all"
                                            >
                                                <RotateCcw className="w-4 h-4" />
                                            </button>
                                            <button
                                                title="Delete Campaign"
                                                onClick={(e) => handleDeleteCampaign(e, camp.id, camp.name)}
                                                className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            {camp.status === 'paused' || camp.status === 'draft' ? (
                                                <button
                                                    onClick={(e) => handleUpdateStatus(e, camp.id, camp.status)}
                                                    className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-md shadow-green-500/20"
                                                >
                                                    <Play className="w-3.5 h-3.5" /> Resume
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={(e) => handleUpdateStatus(e, camp.id, camp.status)}
                                                    className="flex items-center gap-1.5 bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-md shadow-yellow-500/20"
                                                >
                                                    <Pause className="w-3.5 h-3.5" /> Pause
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <CreateCampaignModal
                isOpen={showCreateModal}
                onClose={() => {
                    setShowCreateModal(false);
                    setEditCampaignId(null);
                }}
                onSuccess={fetchCampaigns}
                editCampaignId={editCampaignId}
            />

            {/* Analytics Modal */}
            <CampaignAnalyticsModal
                isOpen={isAnalyticsOpen}
                onClose={() => setIsAnalyticsOpen(false)}
                campaignId={selectedAnalyticsCampaignId}
            />

            {/* Leads Modal */}
            <CampaignLeadsModal
                isOpen={!!selectedCampaignForLeads}
                onClose={() => setSelectedCampaignForLeads(null)}
                campaign={selectedCampaignForLeads}
            />

            <ConfirmModal
                isOpen={confirmConfig.isOpen}
                onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                description={confirmConfig.description}
                confirmText={confirmConfig.confirmText}
                type={confirmConfig.type}
            />
        </div>
    );
};

export default CampaignPage;
