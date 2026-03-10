import React, { useState, useEffect } from 'react';
import { Plus, Rocket, Users, BarChart2, Play, Pause, Trash2, Upload, FileText, Clock } from 'lucide-react';
import { campaignsAPI } from '../../services/api';
import type { Campaign } from '../../types';
import CreateCampaignModal from './CreateCampaignModal';
import CampaignLeadsModal from './CampaignLeadsModal';

const CampaignPage: React.FC = () => {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedCampaignForLeads, setSelectedCampaignForLeads] = useState<Campaign | null>(null);

    const fetchCampaigns = async (silent = false) => {
        try {
            if (!silent) setIsLoading(true);
            const data = await campaignsAPI.getCampaigns();
            setCampaigns(data);
        } catch (error) {
            console.error('Failed to fetch campaigns:', error);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    const handleDeleteCampaign = async (e: React.MouseEvent, id: number, name: string) => {
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to completely delete the campaign "${name}"?\n\nThis will permanently remove all associated leads and follow-up steps. This action cannot be undone.`)) {
            try {
                await campaignsAPI.deleteCampaign(id);
                fetchCampaigns();
            } catch (error) {
                console.error('Failed to delete campaign:', error);
                alert("Failed to delete campaign. Please try again.");
            }
        }
    };

    const handleUpdateStatus = async (e: React.MouseEvent, id: number, currentStatus: string) => {
        e.stopPropagation();
        try {
            if (currentStatus === 'running') {
                await campaignsAPI.pauseCampaign(id);
            } else {
                await campaignsAPI.resumeCampaign(id);
            }
            fetchCampaigns();
        } catch (error) {
            console.error('Failed to update campaign status:', error);
            alert("Failed to update campaign status. Please try again.");
        }
    };

    useEffect(() => {
        fetchCampaigns();
        // Refresh silently every second so the countdown timer feels alive
        const interval = setInterval(() => fetchCampaigns(true), 1000);
        return () => clearInterval(interval);
    }, []);

    const getTimeUntilReset = (resetDateStr?: string) => {
        if (!resetDateStr) return '';
        const now = new Date();
        const resetDate = new Date(resetDateStr);
        const diffMs = resetDate.getTime() - now.getTime();

        if (diffMs <= 0) return 'Resetting...';

        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diffMs % (1000 * 60)) / 1000);

        return `${hours}h ${mins}m ${secs}s`;
    };

    const getStatusBadge = (status: string, isHibernating?: boolean) => {
        if (isHibernating && status === 'running') {
            return (
                <span className="flex items-center bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    <Clock className="w-3 h-3 mr-1" />
                    Hibernating
                </span>
            );
        }

        const styles = {
            draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300',
            running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 animate-pulse-subtle',
            paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
            completed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
        };
        return (
            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${styles[status as keyof typeof styles] || styles.draft}`}>
                {status}
            </span>
        );
    };

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0f172a] p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight flex items-center">
                            <Rocket className="w-8 h-8 mr-3 text-blue-500" />
                            Automated Campaigns
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-1 font-medium italic">
                            Launch and manage your automated outreach engine
                        </p>
                    </div>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl transition-all duration-300 shadow-lg shadow-blue-600/20 font-bold"
                    >
                        <Plus className="w-5 h-5" />
                        <span>Create New Campaign</span>
                    </button>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    <div className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5">
                        <div className="flex items-center justify-between mb-2">
                            <div className="p-3 bg-blue-500/10 rounded-xl">
                                <Users className="w-6 h-6 text-blue-500" />
                            </div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Active Leads</span>
                        </div>
                        <p className="text-3xl font-black text-gray-900 dark:text-white">
                            {campaigns.reduce((acc, curr) => acc + curr.total_leads, 0)}
                        </p>
                    </div>
                    <div className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5">
                        <div className="flex items-center justify-between mb-2">
                            <div className="p-3 bg-green-500/10 rounded-xl">
                                <BarChart2 className="w-6 h-6 text-green-500" />
                            </div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Global conversion</span>
                        </div>
                        <p className="text-3xl font-black text-gray-900 dark:text-white">0%</p>
                    </div>
                    <div className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5">
                        <div className="flex items-center justify-between mb-2">
                            <div className="p-3 bg-orange-500/10 rounded-xl">
                                <Rocket className="w-6 h-6 text-orange-500" />
                            </div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Daily Safety Cap</span>
                        </div>
                        <p className="text-3xl font-black text-gray-900 dark:text-white">100%</p>
                    </div>
                </div>

                {/* Campaign List */}
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Loading Engines...</p>
                    </div>
                ) : campaigns.length === 0 ? (
                    <div className="bg-white dark:bg-[#1e293b] rounded-3xl p-12 text-center border-2 border-dashed border-gray-100 dark:border-white/5">
                        <div className="w-20 h-20 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Upload className="w-10 h-10 text-gray-300" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Campaigns Found</h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm mx-auto">
                            Start your automated outreach by creating a campaign and uploading your lead CSV.
                        </p>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="inline-flex items-center space-x-2 text-blue-500 hover:text-blue-600 font-black uppercase tracking-widest text-sm translate-y-0 hover:translate-y-[-2px] transition-all"
                        >
                            <span>+ Initialize Campaign</span>
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {campaigns.map((camp) => (
                            <div
                                key={camp.id}
                                onClick={() => setSelectedCampaignForLeads(camp)}
                                className="bg-white dark:bg-[#1e293b] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-white/5 hover:border-blue-500/30 transition-all duration-300 group cursor-pointer"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex items-center space-x-5">
                                        <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
                                            <FileText className="w-7 h-7" />
                                        </div>
                                        <div>
                                            <div className="flex items-center space-x-3 mb-1">
                                                <h3 className="text-lg font-black text-gray-900 dark:text-white tracking-tight leading-none">
                                                    {camp.name}
                                                </h3>
                                                {getStatusBadge(camp.status, camp.is_hibernating)}
                                                {camp.is_hibernating && camp.status === 'running' && (
                                                    <span className="text-[10px] font-bold text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-lg flex items-center">
                                                        Next Batch In: {getTimeUntilReset(camp.next_reset_at)}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                                                Initial Message: "{camp.initial_message.substring(0, 50)}..."
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-12 px-6">
                                        <div className="text-center">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Leads</p>
                                            <p className="text-xl font-black text-gray-900 dark:text-white leading-none">{camp.total_leads}</p>
                                        </div>
                                        <div className="text-center text-blue-500">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">View Details</p>
                                            <Users className="w-5 h-5 mx-auto" />
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-2">
                                        <button
                                            title="Delete Campaign"
                                            onClick={(e) => handleDeleteCampaign(e, camp.id, camp.name)}
                                            className="p-2.5 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-xl hover:bg-red-500/10 hover:text-red-500 transition-all"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                        {camp.status === 'paused' || camp.status === 'draft' ? (
                                            <button
                                                onClick={(e) => handleUpdateStatus(e, camp.id, camp.status)}
                                                className="flex items-center space-x-2 bg-green-500 hover:bg-green-600 text-white px-5 py-2.5 rounded-xl transition-all shadow-md shadow-green-500/20 font-bold text-sm"
                                            >
                                                <Play className="w-4 h-4" />
                                                <span>Resume</span>
                                            </button>
                                        ) : (
                                            <button
                                                onClick={(e) => handleUpdateStatus(e, camp.id, camp.status)}
                                                className="flex items-center space-x-2 bg-yellow-500 hover:bg-yellow-600 text-white px-5 py-2.5 rounded-xl transition-all shadow-md shadow-yellow-500/20 font-bold text-sm"
                                            >
                                                <Pause className="w-4 h-4" />
                                                <span>Pause</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <CreateCampaignModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onSuccess={fetchCampaigns}
            />

            <CampaignLeadsModal
                isOpen={!!selectedCampaignForLeads}
                onClose={() => setSelectedCampaignForLeads(null)}
                campaign={selectedCampaignForLeads}
            />
        </div>
    );
};

export default CampaignPage;
