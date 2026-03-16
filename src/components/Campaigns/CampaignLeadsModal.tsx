import React, { useState, useEffect } from 'react';
import { X, Users, Search, Smartphone, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { campaignsAPI } from '../../services/api';
import { useSocket } from '../../hooks/useSocket';
import type { Campaign, CampaignLead } from '../../types';

interface CampaignLeadsModalProps {
    isOpen: boolean;
    onClose: () => void;
    campaign: Campaign | null;
}

const CampaignLeadsModal: React.FC<CampaignLeadsModalProps> = ({ isOpen, onClose, campaign }) => {
    const [leads, setLeads] = useState<CampaignLead[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const { onMessage } = useSocket();

    useEffect(() => {
        if (isOpen && campaign) {
            fetchLeads();

            // Listen for updates via WebSocket
            const unsubscribe = onMessage((data: any) => {
                // Refresh if a message arrives or stats change (with a 500ms safety buffer)
                if (data.type === 'new_message' || data.type === 'campaign_stats_update') {
                    setTimeout(() => fetchLeads(), 500);
                }
            });

            return () => {
                unsubscribe();
            };
        }
    }, [isOpen, campaign, onMessage]);

    const fetchLeads = async () => {
        if (!campaign) return;
        try {
            setIsLoading(true);
            const data = await campaignsAPI.getLeads(campaign.id);
            setLeads(data);
        } catch (error) {
            console.error('Failed to fetch leads:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen || !campaign) return null;

    const filteredLeads = leads.filter(lead =>
        lead.telegram_identifier.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (lead.assigned_account_name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
            case 'replied': return <Users className="w-4 h-4 text-blue-500" />;
            case 'failed': return <AlertCircle className="w-4 h-4 text-red-500" />;
            default: return <Clock className="w-4 h-4 text-gray-400" />;
        }
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-0 bg-black/60 backdrop-blur-md animate-fade-in">
            <div className="bg-white dark:bg-[#111827] w-full h-full flex flex-col overflow-hidden">

                {/* ── OPTIMIZED HEADER ── */}
                <div className="px-8 py-4 border-b border-blue-100 dark:border-white/5 flex items-center justify-between bg-[#f0f9ff] dark:bg-[#0f172a] z-20 shrink-0 shadow-sm transition-colors">
                    
                    {/* Left: Campaign Context */}
                    <div className="flex items-center gap-4 min-w-[280px]">
                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                            <Users className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-lg font-black text-gray-900 dark:text-white leading-none uppercase tracking-tight">Lead Intel</h2>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 truncate max-w-[200px]">{campaign.name}</p>
                        </div>
                    </div>

                    {/* Center: Branding Title */}
                    <div className="flex items-center gap-1 bg-white/50 dark:bg-black/30 p-1 px-4 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm">
                        <span className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-[0.2em]">Assignment Database</span>
                    </div>

                    {/* Right: Exit Action */}
                    <div className="flex items-center justify-end min-w-[280px]">
                        <button 
                            onClick={onClose} 
                            className="w-10 h-10 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all text-gray-400 hover:text-red-500"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="px-20 py-4 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/20 flex items-center space-x-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by identifier or account..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm focus:border-blue-500 outline-none transition-all"
                        />
                    </div>
                    <div className="flex items-center space-x-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                        <span>Total: {leads.length}</span>
                        <span className="h-3 w-px bg-gray-300 dark:bg-gray-700" />
                        <span>Filtered: {filteredLeads.length}</span>
                    </div>
                </div>

                {/* Body Alignment Wrapper */}
                <div className="flex-1 overflow-hidden flex flex-col px-20">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full">
                            <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
                            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Scanning lead database...</p>
                        </div>
                    ) : filteredLeads.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                            <Search className="w-12 h-12 mb-4 opacity-20" />
                            <p className="font-bold">No leads found</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-white dark:bg-[#1a222c] z-10">
                                <tr className="border-b border-gray-100 dark:border-white/5 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    <th className="px-6 py-4">Lead Identifier</th>
                                    <th className="px-6 py-4">Assigned Account</th>
                                    <th className="px-6 py-4">Current Step</th>
                                    <th className="px-6 py-4">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                                {filteredLeads.map((lead) => (
                                    <tr key={lead.id} className="hover:bg-blue-500/5 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center space-x-2 text-sm font-bold text-gray-900 dark:text-white">
                                                <div className="w-2 h-2 rounded-full bg-blue-500 opacity-50" />
                                                <span>{lead.telegram_identifier}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {lead.assigned_account_id ? (
                                                <div className="flex items-center space-x-2">
                                                    <div className="p-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
                                                        <Smartphone className="w-3.5 h-3.5 text-gray-500" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{lead.assigned_account_display_name || lead.assigned_account_name}</span>
                                                        <span className="text-[10px] text-gray-400 uppercase font-black tracking-tighter">ID: {lead.assigned_account_id}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-red-500 font-bold italic">Unassigned</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="inline-flex items-center px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-bold text-gray-500">
                                                Step {lead.current_step}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <div className="flex items-center space-x-2">
                                                    {lead.status === 'contacted' && lead.current_step > 0 ? (
                                                        <>
                                                            <Clock className="w-4 h-4 text-orange-400" />
                                                            <span className="text-xs font-bold capitalize text-orange-500">Waiting</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            {getStatusIcon(lead.status)}
                                                            <span className={`text-xs font-bold capitalize ${lead.status === 'replied' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}>{lead.status}</span>
                                                        </>
                                                    )}
                                                </div>
                                                {lead.status === 'replied' && (
                                                    <button
                                                        onClick={() => {
                                                            onClose();
                                                            window.dispatchEvent(new CustomEvent('nav-to-chat', {
                                                                detail: { accountId: lead.assigned_account_id, peerId: lead.telegram_id || lead.telegram_identifier }
                                                            }));
                                                        }}
                                                        className="mt-2 text-[10px] font-black uppercase text-blue-500 hover:text-blue-600 flex items-center"
                                                    >
                                                        <Search className="w-3 h-3 mr-1" /> Open Chat
                                                    </button>
                                                )}
                                                <span className="text-[10px] text-gray-400 font-medium mt-1">
                                                    {lead.status === 'replied' ? 'Lead responded' :
                                                        lead.status === 'contacted' ? `Contacted (Step ${lead.current_step})` :
                                                            lead.status === 'completed' ? 'All steps finished' :
                                                                lead.status === 'pending' ? 'Ready to send' : ''}
                                                </span>
                                                {lead.status === 'failed' && lead.failure_reason && (
                                                    <span className="text-[10px] text-red-400 font-medium mt-1 leading-tight max-w-[150px] truncate hover:whitespace-normal hover:overflow-visible hover:bg-white dark:hover:bg-gray-800 hover:z-50 hover:relative hover:p-1 hover:border hover:rounded hover:shadow-lg transition-all cursor-help" title={lead.failure_reason}>
                                                        {lead.failure_reason}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-gray-50 dark:bg-black/20 border-t border-gray-100 dark:border-white/5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center mt-auto">
                    Round-robin load balancing active • Protecting your accounts via staggered outreach
                </div>
            </div>
        </div>
    );
};

export default CampaignLeadsModal;
