/**
 * RESPONSE TIME RANKING COMPONENT
 * 
 * A reusable table component that displays response time leaderboards.
 * Used in:
 * 1. User-side Analytics (Conversations ranking)
 * 2. Admin-side Leaderboards (Account and User rankings)
 * 
 * It calculates and highlights performance (Fast, Average, Slow) based on thresholds.
 */
import React, { useState, useEffect } from 'react';
import { analyticsAPI } from '../../services/api';
import { Trophy, Clock, RefreshCw, User as UserIcon, Activity } from 'lucide-react';

interface RankingData {
    id: number;
    title: string;
    avg_response_time: number;
    total_responses: number;
    platform: string;
}

interface ResponseTimeRankingProps {
    type: 'conversations' | 'accounts' | 'admin';
    accountId?: number;
    limit?: number;
    title?: string;
    className?: string;
}

const ResponseTimeRanking: React.FC<ResponseTimeRankingProps> = ({
    type,
    accountId,
    limit = 10,
    title,
    className = ""
}) => {
    const [data, setData] = useState<RankingData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            let ranking;
            if (type === 'conversations') {
                ranking = await analyticsAPI.getConversationRanking(limit, accountId);
            } else if (type === 'accounts') {
                ranking = await analyticsAPI.getAccountRanking(limit);
            } else {
                ranking = await analyticsAPI.getAdminAccountRanking(limit);
            }
            setData(ranking);
        } catch (err) {
            console.error('Error fetching ranking:', err);
            setError('Failed to load ranking data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [type, limit, accountId]);

    const formatTime = (seconds: number) => {
        if (seconds === 0) return '0s';
        if (seconds < 60) return `${seconds.toFixed(1)}s`;
        if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
        if (seconds < 86400) return `${(seconds / 3600).toFixed(2)}h`;
        return `${(seconds / 86400).toFixed(2)}d`;
    };

    const getPerformanceInfo = (seconds: number) => {
        if (seconds < 300) return { label: 'Fast', color: 'text-green-500 bg-green-500/10' };
        if (seconds < 1800) return { label: 'Average', color: 'text-yellow-500 bg-yellow-500/10' };
        return { label: 'Slow', color: 'text-red-500 bg-red-500/10' };
    };

    const getRankStyle = (index: number) => {
        if (index === 0) return "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/50";
        if (index === 1) return "bg-gray-400/20 text-gray-600 dark:text-gray-400 border-gray-400/50";
        if (index === 2) return "bg-orange-400/20 text-orange-600 dark:text-orange-400 border-orange-400/50";
        return "bg-gray-100 dark:bg-white/5 text-gray-500 border-transparent";
    };

    return (
        <div className={`bg-white dark:bg-[#1e293b] rounded-2xl shadow-sm overflow-hidden border border-gray-100 dark:border-white/5 flex flex-col ${className}`}>
            {/* Table Header */}
            <div className="px-6 py-5 border-b border-gray-100 dark:border-white/5 flex items-center justify-between bg-gray-50/50 dark:bg-black/20">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-600 shrink-0">
                        <Trophy className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-widest leading-none">
                            {title || (type === 'conversations' ? 'Chat Ranking' : 'Account Ranking')}
                        </h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                            Response Time Leaderboard
                        </p>
                    </div>
                </div>
                <button
                    onClick={fetchData}
                    disabled={loading}
                    className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-500' : ''}`} />
                </button>
            </div>

            {/* Main Table Layout */}
            <div id="analytics-stats-table" className="flex-1 overflow-auto max-h-[450px] custom-scrollbar">
                <table className="w-full text-left border-collapse table-fixed min-w-[500px] md:min-w-0">
                    <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-[#1c2733] shadow-sm">
                        <tr className="text-[10px] uppercase font-black tracking-[0.2em] text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-white/5">
                            <th className="px-6 py-4 w-20 text-center">Rank</th>
                            {/* [FEATURE: Analytics Leaderboard] The 'Total Messages' column was explicitly removed to streamline the UI and focus strictly on response time metrics. */}
                            <th className="px-6 py-4 min-w-[200px]">User / Chat Title</th>
                            <th className="px-6 py-4 w-32 text-center">Avg Response</th>
                            <th className="px-6 py-4 w-32 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="py-20 text-center">
                                    <div className="flex flex-col items-center gap-3 opacity-50">
                                        <Activity className="w-8 h-8 animate-pulse text-blue-500" />
                                        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading Rankings...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan={4} className="py-12 text-center text-red-500 font-bold text-sm">{error}</td>
                            </tr>
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="py-12 text-center text-gray-400 italic text-sm font-medium">No performance data available yet.</td>
                            </tr>
                        ) : (
                            data.map((item, index) => {
                                const perf = getPerformanceInfo(item.avg_response_time);
                                return (
                                    <tr key={item.id} className="group hover:bg-blue-50/30 dark:hover:bg-blue-500/[0.03] transition-colors">
                                        {/* Rank Column */}
                                        <td className="px-6 py-5 text-center">
                                            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center mx-auto text-xs font-black transition-transform group-hover:scale-110 ${getRankStyle(index)}`}>
                                                {index === 0 ? <Trophy className="w-4 h-4" /> : `#${index + 1}`}
                                            </div>
                                        </td>

                                        {/* Name / Platform Column */}
                                        {/* [FEATURE: Analytics Leaderboard] Displaying the title. The backend provides the @username fallback if the name is a phone number. */}
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-400 group-hover:bg-blue-500/10 group-hover:text-blue-500 transition-colors">
                                                    <UserIcon className="w-4 h-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-[13px] text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-500 transition-colors">
                                                        {item.title}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md">
                                                            {item.platform}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Response Time Column */}
                                        <td className="px-6 py-5 text-center">
                                            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-300">
                                                <Clock className="w-3.5 h-3.5 text-blue-500" />
                                                {formatTime(item.avg_response_time)}
                                            </div>
                                        </td>

                                        {/* Status Column */}
                                        <td className="px-6 py-5 text-center">
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${perf.color}`}>
                                                {perf.label}
                                            </span>
                                        </td>

                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            {!loading && data.length > 0 && (
                <div className="px-6 py-4 bg-gray-50/50 dark:bg-black/20 border-t border-gray-100 dark:border-white/5">
                    <p className="text-[10px] text-center text-gray-400 font-black uppercase tracking-widest">
                        Performance data updates in real-time
                    </p>
                </div>
            )}
        </div>
    );
};

export default ResponseTimeRanking;
