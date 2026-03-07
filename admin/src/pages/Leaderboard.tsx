import { useState, useEffect } from 'react';
import { Trophy, Clock, RefreshCw, User as UserIcon, Activity, Smartphone, Users, BarChart2, ChevronDown } from 'lucide-react';
import { adminApi } from '../services/api';

interface RankingData {
    id: number;
    title: string;
    subtitle?: string;
    avg_response_time: number;
    total_responses: number;
    platform: string;
}

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
    if (index === 0) return "bg-yellow-500/20 text-yellow-600 border-yellow-500/50";
    if (index === 1) return "bg-gray-400/20 text-gray-600 border-gray-400/50";
    if (index === 2) return "bg-orange-400/20 text-orange-600 border-orange-400/50";
    return "bg-gray-100 text-gray-500 border-transparent";
};

interface LeaderboardTableProps {
    title: string;
    type: 'user-conversation' | 'user-account';
    icon?: any;
    userId: number;
    accountId?: number | 'all';
}

const LeaderboardTable = ({ title, type, userId, accountId }: LeaderboardTableProps) => {
    const [data, setData] = useState<RankingData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            let res;
            if (type === 'user-conversation') {
                res = await adminApi.getAdminUserConversationRanking(userId, 20, accountId === 'all' ? undefined : (accountId as number));
            } else if (type === 'user-account') {
                res = await adminApi.getAdminUserAccountRanking(userId, 20);
            }
            setData(res?.data || []);
        } catch (err) {
            console.error('Error fetching ranking:', err);
            setError('Failed to load ranking data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [type, userId, accountId]);

    // Exact replica styling from `ResponseTimeRanking.tsx`
    return (
        <div className={`bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200 flex flex-col`}>
            {/* Table Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-500 shadow-inner">
                        <Trophy className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-black text-gray-900 uppercase tracking-wider italic">
                            {title || (type === 'user-conversation' ? 'Chat Ranking' : 'Account Ranking')}
                        </h3>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-none mt-1">
                            Response Time Leaderboard
                        </p>
                    </div>
                </div>
                <button
                    onClick={fetchData}
                    disabled={loading}
                    className="p-2 hover:bg-gray-100 rounded-xl transition-all border border-transparent hover:border-gray-200 text-gray-500 active:scale-95"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Main Table Layout */}
            <div className="flex-1 overflow-auto max-h-[450px] custom-scrollbar">
                <table className="w-full text-left border-collapse table-fixed">
                    <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
                        <tr className="text-[10px] uppercase font-black tracking-[0.2em] text-gray-400 border-b border-gray-100">
                            <th className="px-6 py-4 w-20 text-center">Rank</th>
                            {/* [FEATURE: Analytics Leaderboard] The 'Total Messages' column was explicitly removed to streamline the UI and focus strictly on response time metrics. */}
                            <th className="px-6 py-4 min-w-[200px]">User / Chat Title</th>
                            <th className="px-6 py-4 w-32 text-center">Avg Response</th>
                            <th className="px-6 py-4 w-32 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
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
                                    <tr key={item.id} className="group hover:bg-blue-50/30 transition-colors">
                                        {/* Rank Column */}
                                        <td className="px-6 py-5 text-center">
                                            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center mx-auto text-xs font-black transition-transform group-hover:scale-110 ${getRankStyle(index)}`}>
                                                {index === 0 ? <Trophy className="w-4 h-4" /> : `#${index + 1}`}
                                            </div>
                                        </td>

                                        {/* Name / Platform Column */}
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-blue-500/10 group-hover:text-blue-500 transition-colors">
                                                    <UserIcon className="w-4 h-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-[13px] text-gray-900 truncate group-hover:text-blue-500 transition-colors">
                                                        {item.title}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-blue-500/10 text-blue-600 rounded-md">
                                                            {item.platform || "Telegram"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Response Time Column */}
                                        <td className="px-6 py-5 text-center">
                                            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-gray-700">
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
        </div>
    );
};

const Leaderboard = () => {
    const [colleagues, setColleagues] = useState<any[]>([]);
    const [selectedColleagueId, setSelectedColleagueId] = useState<number | 'all'>('all');

    // Extracted accounts for this colleague
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<number | 'all'>('all');

    const [isColleagueDropdownOpen, setIsColleagueDropdownOpen] = useState(false);
    const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);

    useEffect(() => {
        const fetchColleagues = async () => {
            try {
                const res = await adminApi.getColleagues();
                setColleagues(res.data || []);
            } catch (err) {
                console.error("Failed to load colleagues", err);
            }
        };
        fetchColleagues();
    }, []);

    // When a specific colleague is selected, fetch their accounts
    useEffect(() => {
        if (selectedColleagueId !== 'all') {
            const fetchAccounts = async () => {
                try {
                    // Fetch accounts by getting user conversations/accounts. 
                    const res = await adminApi.getAdminUserAccountRanking(selectedColleagueId);
                    setAccounts(res.data || []);
                } catch (err) {
                    console.error("Failed to load accounts for colleague", err);
                }
            };
            fetchAccounts();
        } else {
            setAccounts([]);
        }
        setSelectedAccountId('all');
    }, [selectedColleagueId]);

    const selectedColleague = selectedColleagueId === 'all'
        ? null
        : colleagues.find(c => c.id === selectedColleagueId);

    const selectedAccount = selectedAccountId === 'all'
        ? null
        : accounts.find(a => a.id === selectedAccountId);

    return (
        <div className="flex-1 bg-gray-50 p-8 min-h-screen">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Navigation / Filter Bar mimicking user-side completely */}
                <div className="flex items-center justify-between mb-2">
                    {/* Placeholder div for flex spacing mirroring the 'Back to chats' button on user side */}
                    <div></div>

                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Filter Stats:</span>

                        {/* Colleague Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => { setIsColleagueDropdownOpen(!isColleagueDropdownOpen); setIsAccountDropdownOpen(false); }}
                                className="flex items-center gap-3 bg-white text-gray-700 px-4 py-2.5 rounded-xl border border-gray-100 text-xs font-black uppercase tracking-widest shadow-sm hover:border-blue-500/50 transition-all active:scale-95"
                            >
                                <Users className="w-3.5 h-3.5 text-blue-500" />
                                <span>{selectedColleague ? selectedColleague.email : "Select Colleague"}</span>
                                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isColleagueDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isColleagueDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setIsColleagueDropdownOpen(false)} />
                                    <div className="absolute right-0 mt-2 w-64 bg-white/95 backdrop-blur-xl border border-gray-100 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="p-2 border-b border-gray-100 text-[9px] font-black uppercase tracking-widest text-gray-400 px-4">
                                            Select Perspective
                                        </div>
                                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                            {colleagues.map(colleague => (
                                                <button
                                                    key={colleague.id}
                                                    onClick={() => { setSelectedColleagueId(colleague.id); setIsColleagueDropdownOpen(false); }}
                                                    className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center gap-2 hover:bg-blue-500/10 transition-colors ${selectedColleagueId === colleague.id ? 'text-blue-500' : 'text-gray-600'}`}
                                                >
                                                    <UserIcon className="w-3.5 h-3.5" />
                                                    {colleague.username} ({colleague.email})
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Account Dropdown (Only show if a specific Colleague is selected) */}
                        {selectedColleagueId !== 'all' && (
                            <div className="relative">
                                <button
                                    onClick={() => { setIsAccountDropdownOpen(!isAccountDropdownOpen); setIsColleagueDropdownOpen(false); }}
                                    className="flex items-center gap-3 bg-white text-gray-700 px-4 py-2.5 rounded-xl border border-gray-100 text-xs font-black uppercase tracking-widest shadow-sm hover:border-blue-500/50 transition-all active:scale-95"
                                >
                                    <Smartphone className="w-3.5 h-3.5 text-blue-500" />
                                    <span>{selectedAccount ? selectedAccount.title : "All Sessions Overview"}</span>
                                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isAccountDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {isAccountDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setIsAccountDropdownOpen(false)} />
                                        <div className="absolute right-0 mt-2 w-64 bg-white/95 backdrop-blur-xl border border-gray-100 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                            <div className="p-2 border-b border-gray-100 text-[9px] font-black uppercase tracking-widest text-gray-400 px-4">
                                                Select Session
                                            </div>
                                            <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                                <button
                                                    onClick={() => { setSelectedAccountId('all'); setIsAccountDropdownOpen(false); }}
                                                    className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center gap-2 hover:bg-blue-500/10 transition-colors ${selectedAccountId === 'all' ? 'text-blue-500' : 'text-gray-600'}`}
                                                >
                                                    <Activity className="w-3.5 h-3.5" />
                                                    Global Overview
                                                </button>
                                                {accounts.map(acc => (
                                                    <button
                                                        key={acc.id}
                                                        onClick={() => { setSelectedAccountId(acc.id); setIsAccountDropdownOpen(false); }}
                                                        className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center gap-2 hover:bg-blue-500/10 transition-colors ${selectedAccountId === acc.id ? 'text-blue-500' : 'text-gray-600'}`}
                                                    >
                                                        <Smartphone className="w-3.5 h-3.5" />
                                                        {acc.title}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {selectedColleagueId === 'all' ? (
                    // Default State / Welcome Note
                    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center max-w-2xl mx-auto">
                        <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center mb-6">
                            <Trophy className="w-12 h-12 text-blue-500" />
                        </div>
                        <h2 className="text-3xl font-black text-gray-900 uppercase tracking-wider italic mb-6">
                            Welcome to the <span className="text-blue-500">Admin Leaderboard</span>
                        </h2>

                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-left w-full space-y-6">
                            <h3 className="font-black text-gray-900 uppercase tracking-widest text-sm border-b pb-3">How to Use This Dashboard</h3>

                            <div className="space-y-4 text-sm text-gray-600">
                                <div className="flex items-start gap-4">
                                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">1</div>
                                    <div>
                                        <p className="font-bold text-gray-900">Select a Colleague</p>
                                        <p>Use the <strong>"Select Perspective"</strong> dropdown in the top right. Once you choose a colleague, this screen will transform to perfectly mirror what that colleague naturally sees on their own personal leaderboard.</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">2</div>
                                    <div>
                                        <p className="font-bold text-gray-900">View Global Session Stats</p>
                                        <p>By default, the dashboard will show their "Global Overview"—a complete summary of their chat speed across <strong>all</strong> of their active connected Telegram sessions simultaneously.</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">3</div>
                                    <div>
                                        <p className="font-bold text-gray-900">Filter by Specific Account</p>
                                        <p>Once a colleague is selected, a new <strong>Session Filter</strong> appears next to it. You can select exactly one of their connected accounts (e.g., "Work Phone") to drill down and only monitor response times inside that isolated device.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    // Replica of user-side rendering
                    <>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h1 className="text-3xl font-black text-gray-900 uppercase tracking-wider italic flex items-center gap-3">
                                    <BarChart2 className="w-8 h-8 text-blue-500" />
                                    {selectedAccount ? (
                                        <>Statistics <span className="text-blue-500">for {selectedAccount.title}</span></>
                                    ) : (
                                        <>Global <span className="text-blue-500">Statistics</span></>
                                    )}
                                </h1>
                                <p className="text-gray-500 mt-2 font-medium">
                                    {selectedAccount
                                        ? "Detailed response metrics for this specific session."
                                        : "Monitor response times and team performance across all platforms."}
                                </p>
                            </div>

                            <div className="flex items-center gap-4 bg-white#17212b] p-4 rounded-2xl shadow-sm border border-gray-100">
                                <div className="p-3 bg-green-500/10 rounded-xl text-green-500">
                                    <Activity className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-black tracking-widest">Active Focus</p>
                                    <p className="text-lg font-bold text-gray-900 italic truncate max-w-[150px]">
                                        {selectedAccount ? selectedAccount.title : (selectedColleague?.email || "All Sessions")}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Stats List Identical to AnalyticsPage */}
                        <div className="flex flex-col gap-8">
                            <LeaderboardTable
                                type="user-account"
                                title="Fastest Sessions Leaderboard"
                                userId={selectedColleagueId}
                            />
                            <LeaderboardTable
                                type="user-conversation"
                                title={selectedAccount ? `Statistics for ${selectedAccount.title}` : "Individual Chat Statistics"}
                                accountId={selectedAccountId === 'all' ? undefined : selectedAccountId}
                                userId={selectedColleagueId}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default Leaderboard;
