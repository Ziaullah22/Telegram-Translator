import React, { useState, useEffect } from 'react';
import ResponseTimeRanking from './ResponseTimeRanking';
import { BarChart2, Activity, ArrowLeft, ChevronDown, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { telegramAPI } from '../../services/api';
import type { TelegramAccount } from '../../types';

const AnalyticsPage: React.FC = () => {
    const navigate = useNavigate();
    const [accounts, setAccounts] = useState<TelegramAccount[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<number | 'all'>('all');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const data = await telegramAPI.getAccounts();
                setAccounts(data);
            } catch (err) {
                console.error('Error fetching accounts:', err);
            }
        };
        fetchAccounts();
    }, []);

    const selectedAccount = selectedAccountId === 'all'
        ? null
        : accounts.find(a => a.id === selectedAccountId);

    return (
        <div className="flex-1 bg-gray-50 dark:bg-[#0e1621] p-8 overflow-y-auto custom-scrollbar">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Navigation Bar */}
                <div className="flex items-center justify-between mb-2">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-blue-500 transition-colors bg-white dark:bg-[#17212b] px-4 py-2 rounded-xl border border-gray-100 dark:border-white/5"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Chats
                    </button>

                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Filter Stats:</span>
                        <div className="relative">
                            <button
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="flex items-center gap-3 bg-white dark:bg-[#17212b] text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-xl border border-gray-100 dark:border-white/5 text-xs font-black uppercase tracking-widest shadow-sm hover:border-blue-500/50 transition-all active:scale-95"
                            >
                                <Smartphone className="w-3.5 h-3.5 text-blue-500" />
                                <span>{selectedAccount ? (selectedAccount.displayName || selectedAccount.accountName) : "All Sessions Overview"}</span>
                                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />
                                    <div className="absolute right-0 mt-2 w-64 bg-white/80 dark:bg-[#17212b]/80 backdrop-blur-xl border border-gray-100 dark:border-white/10 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="p-2 border-b border-gray-100 dark:border-white/5 text-[9px] font-black uppercase tracking-widest text-gray-400 px-4">
                                            Select Perspective
                                        </div>
                                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                            <button
                                                onClick={() => { setSelectedAccountId('all'); setIsDropdownOpen(false); }}
                                                className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center gap-2 hover:bg-blue-500/10 transition-colors ${selectedAccountId === 'all' ? 'text-blue-500' : 'text-gray-600 dark:text-gray-300'}`}
                                            >
                                                <Activity className="w-3.5 h-3.5" />
                                                Global Overview
                                            </button>
                                            {accounts.map(acc => (
                                                <button
                                                    key={acc.id}
                                                    onClick={() => { setSelectedAccountId(acc.id); setIsDropdownOpen(false); }}
                                                    className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center gap-2 hover:bg-blue-500/10 transition-colors ${selectedAccountId === acc.id ? 'text-blue-500' : 'text-gray-600 dark:text-gray-300'}`}
                                                >
                                                    <Smartphone className="w-3.5 h-3.5" />
                                                    {acc.displayName || acc.accountName}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-white uppercase tracking-wider italic flex items-center gap-3">
                            <BarChart2 className="w-8 h-8 text-blue-500" />
                            {selectedAccount ? (
                                <>Statistics <span className="text-blue-500">for {selectedAccount.displayName || selectedAccount.accountName}</span></>
                            ) : (
                                <>Global <span className="text-blue-500">Statistics</span></>
                            )}
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium">
                            {selectedAccount
                                ? "Detailed response metrics for this specific session."
                                : "Monitor response times and team performance across all platforms."}
                        </p>
                    </div>

                    <div className="flex items-center gap-4 bg-white dark:bg-[#17212b] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5">
                        <div className="p-3 bg-green-500/10 rounded-xl text-green-500">
                            <Activity className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase font-black tracking-widest">Active Focus</p>
                            <p className="text-lg font-bold text-gray-900 dark:text-gray-100 italic truncate max-w-[150px]">
                                {selectedAccount ? (selectedAccount.displayName || selectedAccount.accountName) : "All Sessions"}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Stats List */}
                <div className="flex flex-col gap-8">
                    <ResponseTimeRanking
                        type="accounts"
                        title="Fastest Sessions Leaderboard"
                    />
                    <ResponseTimeRanking
                        type="conversations"
                        title={selectedAccount ? `Statistics for ${selectedAccount.displayName || selectedAccount.accountName}` : "Individual Chat Statistics"}
                        accountId={selectedAccountId === 'all' ? undefined : selectedAccountId}
                    />
                </div>
            </div>
        </div>
    );
};

export default AnalyticsPage;
