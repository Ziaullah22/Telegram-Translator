/**
 * ANALYTICS PAGE
 * 
 * Provides a dashboard for viewing response time statistics.
 * Allows users to:
 * 1. Filter statistics by specific Telegram accounts
 * 2. View rankings of contacts based on their response speed
 * 3. Monitor overall performance metrics
 */
import React, { useState, useEffect } from 'react';
import ResponseTimeRanking from './ResponseTimeRanking';
import { BarChart2, Activity, ChevronDown, Smartphone } from 'lucide-react';
import { telegramAPI } from '../../services/api';
import type { TelegramAccount } from '../../types';

const AnalyticsPage: React.FC = () => {
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

    // Auto-select first account if none selected and accounts are loaded
    useEffect(() => {
        if (selectedAccountId === 'all' && accounts.length > 0) {
            setSelectedAccountId(accounts[0].id);
        }
    }, [accounts, selectedAccountId]);

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0f172a] p-4 sm:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">

                {/* ── Header ── */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 id="analytics-header" className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
                            <span className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30 shrink-0">
                                <BarChart2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                            </span>
                            Performance Analytics
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-2 sm:mt-1 text-xs sm:text-sm font-medium">
                            {selectedAccount
                                ? `Detailed response metrics for ${selectedAccount.displayName || selectedAccount.accountName}.`
                                : 'Monitor response times and performance across all sessions.'}
                        </p>
                    </div>

                    {/* Account Filter */}
                    <div className="flex items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 hidden sm:block">Filter:</span>
                        <div className="relative w-full sm:w-auto">
                            <button
                                id="analytics-filter-btn"
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="flex items-center justify-between gap-2 bg-white dark:bg-[#1e293b] text-gray-700 dark:text-gray-200 px-4 py-3 sm:py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-xs font-black uppercase tracking-widest shadow-sm hover:border-blue-500/50 transition-all w-full sm:w-auto"
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <Smartphone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                    <span className="max-w-[180px] sm:max-w-[160px] truncate">
                                        {selectedAccount ? (selectedAccount.displayName || selectedAccount.accountName) : 'All Sessions'}
                                    </span>
                                </div>
                                <ChevronDown className={`w-4 h-4 shrink-0 text-gray-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />
                                    <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-full sm:w-64 bg-white dark:bg-[#1e293b] border border-gray-100 dark:border-white/10 rounded-2xl shadow-2xl z-20 overflow-hidden text-left">
                                        <div className="px-4 py-3 border-b border-gray-100 dark:border-white/5 text-[9px] font-black uppercase tracking-widest text-gray-400">
                                            Select Account
                                        </div>
                                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                            {accounts.map(acc => (
                                                <button
                                                    key={acc.id}
                                                    onClick={() => { setSelectedAccountId(acc.id); setIsDropdownOpen(false); }}
                                                    className={`w-full text-left px-4 py-3.5 sm:py-3 text-xs sm:text-sm font-bold flex items-center gap-3 hover:bg-blue-500/10 transition-colors ${selectedAccountId === acc.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'}`}
                                                >
                                                    <Smartphone className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                                                    <span className="truncate">{acc.displayName || acc.accountName}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Stats Overview Cards ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                        {
                            label: 'Active Session',
                            value: selectedAccount?.displayName || selectedAccount?.accountName || '—',
                            icon: <Activity className="w-5 h-5" />,
                            bg: 'bg-blue-600/10',
                            text: 'text-blue-600',
                        },
                        {
                            label: 'Accounts Loaded',
                            value: accounts.length,
                            icon: <Smartphone className="w-5 h-5" />,
                            bg: 'bg-indigo-500/10',
                            text: 'text-indigo-500',
                        },
                        {
                            label: 'Data Mode',
                            value: selectedAccount ? 'Per Account' : 'Global',
                            icon: <BarChart2 className="w-5 h-5" />,
                            bg: 'bg-green-500/10',
                            text: 'text-green-500',
                        },
                    ].map(stat => (
                        <div key={stat.label} className="bg-white dark:bg-[#1e293b] rounded-2xl p-5 border border-gray-100 dark:border-white/5 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <div className={`p-2 rounded-xl ${stat.bg}`}>
                                    <span className={stat.text}>{stat.icon}</span>
                                </div>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</span>
                            </div>
                            <p className="text-xl font-black text-gray-900 dark:text-white truncate">{stat.value}</p>
                        </div>
                    ))}
                </div>

                {/* ── Rankings Table ── */}
                <div className="flex flex-col gap-8">
                    {selectedAccountId !== 'all' && (
                        <ResponseTimeRanking
                            type="conversations"
                            title={`Response Rankings — ${selectedAccount?.displayName || selectedAccount?.accountName}`}
                            accountId={selectedAccountId}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default AnalyticsPage;
