import { useState, useEffect } from 'react';
import { LayoutDashboard, MessageSquare, Send, Inbox, AlertCircle, Clock, User, Calendar, RefreshCw, Filter, HelpCircle, ChevronDown } from 'lucide-react';
import { analyticsAPI } from '../../services/api';
import type { TelegramAccount } from '../../types';

interface DashboardMetrics {
  received_24h_count: number;
  sent_24h_count: number;
  unread_count: number;
  follow_ups_count: number;
}

interface UnreadMessage {
  id: number;
  conversation_id: number;
  sender_name: string;
  text: string;
  created_at: string;
  conversation_title: string;
  account_name: string;
}

interface ActivityItem {
  id: number;
  conversation_id: number;
  sender_name: string;
  text: string;
  is_outgoing: boolean;
  created_at: string;
  conversation_title: string;
  account_name: string;
}

interface FollowUpItem {
  conversation_id: number;
  conversation_title: string;
  telegram_peer_id: number;
  telegram_account_id: number;
  account_name: string;
  last_message_at: string;
  last_message_text: string;
  tags: string[];
  pipeline_stage: string;
}

interface DashboardData {
  metrics: DashboardMetrics;
  unread_messages: UnreadMessage[];
  activity_24h: ActivityItem[];
  follow_ups: FollowUpItem[];
}

interface DashboardPageProps {
  accounts: TelegramAccount[];
}

export default function DashboardPage({ accounts }: DashboardPageProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Close dropdown on click outside
  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleOutsideClick = () => setIsDropdownOpen(false);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [isDropdownOpen]);

  useEffect(() => {
    loadDashboard(selectedAccountId);
  }, [selectedAccountId]);

  const loadDashboard = async (accountId: number | null) => {
    try {
      setIsLoading(true);
      const res = await analyticsAPI.getDashboardData(accountId ?? undefined);
      setData(res);
    } catch (e) {
      console.error('Failed to load dashboard data', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadDashboard(selectedAccountId);
  };

  const getStageColor = (stage: string) => {
    switch (stage?.toLowerCase()) {
      case 'lead': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
      case 'qualified': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'negotiating': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'ordered': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'won': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 ring-1 ring-green-500/30';
      case 'lost': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  if (isLoading && !isRefreshing) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0f172a] p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const metrics = data?.metrics || { received_24h_count: 0, sent_24h_count: 0, unread_count: 0, follow_ups_count: 0 };
  const unreadMessages = data?.unread_messages || [];
  const activity24h = data?.activity_24h || [];
  const followUps = data?.follow_ups || [];

  const selectedAccountName = selectedAccountId 
    ? accounts.find(acc => acc.id === selectedAccountId)?.displayName || accounts.find(acc => acc.id === selectedAccountId)?.accountName || `Account #${selectedAccountId}`
    : 'All Accounts';

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0f172a] p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-fade-in">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
              <span className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30 flex-shrink-0">
                <LayoutDashboard className="w-5 h-5 text-white" />
              </span>
              Operational Dashboard
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2 text-xs sm:text-sm font-medium leading-relaxed">
              Track your translation and customer outreach performance in one unified view.
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Custom Account Selector */}
            <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-xl text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/10 transition-all shadow-sm cursor-pointer"
              >
                <Filter className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-black uppercase text-gray-400 hidden sm:inline">Account:</span>
                <span className="text-blue-600 dark:text-blue-400">{selectedAccountName}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-450 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#1e293b] border border-gray-150 dark:border-white/5 rounded-xl shadow-xl z-[100] py-1 overflow-hidden animate-scale-in">
                  <button
                    onClick={() => {
                      setSelectedAccountId(null);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-xs sm:text-sm font-bold text-left hover:bg-gray-50 dark:hover:bg-white/5 transition-all ${
                      selectedAccountId === null ? 'text-blue-600 dark:text-blue-500 bg-blue-50/30 dark:bg-blue-500/10' : 'text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    <span>All Accounts</span>
                    {selectedAccountId === null && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    )}
                  </button>
                  {accounts.map(acc => {
                    const isSelected = selectedAccountId === acc.id;
                    const displayName = acc.displayName || acc.accountName;
                    return (
                      <button
                        key={acc.id}
                        onClick={() => {
                          setSelectedAccountId(acc.id);
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-4 py-2.5 text-xs sm:text-sm font-bold text-left hover:bg-gray-50 dark:hover:bg-white/5 transition-all ${
                          isSelected ? 'text-blue-600 dark:text-blue-500 bg-blue-50/30 dark:bg-blue-500/10' : 'text-gray-700 dark:text-gray-200'
                        }`}
                      >
                        <span className="truncate pr-2">{displayName}</span>
                        {isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/10 transition-all cursor-pointer shadow-sm disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed text-blue-600 dark:text-blue-400 animate-slide-up">
          <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold uppercase tracking-wider block mb-0.5">Quick Guide</span>
            Use this dashboard to monitor chat response tasks. "Follow Ups" display threads where customers sent the last message and are waiting for your reply. Archived or hidden chats are excluded automatically to help you focus on active conversations.
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Card 1: Received 24h */}
          <div className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm flex items-center justify-between hover:scale-[1.02] transition-transform duration-300">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Received (24h)</p>
              <h3 className="text-3xl font-black text-gray-900 dark:text-white mt-1">{metrics.received_24h_count}</h3>
              <p className="text-[10px] text-gray-400 mt-1.5">Incoming user messages</p>
            </div>
            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
              <MessageSquare className="w-6 h-6" />
            </div>
          </div>

          {/* Card 2: Sent 24h */}
          <div className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm flex items-center justify-between hover:scale-[1.02] transition-transform duration-300">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Sent (24h)</p>
              <h3 className="text-3xl font-black text-gray-900 dark:text-white mt-1">{metrics.sent_24h_count}</h3>
              <p className="text-[10px] text-gray-400 mt-1.5">Outgoing agent replies</p>
            </div>
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
              <Send className="w-6 h-6" />
            </div>
          </div>

          {/* Card 3: Unread */}
          <div className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm flex items-center justify-between hover:scale-[1.02] transition-transform duration-300">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Unread Messages</p>
              <h3 className="text-3xl font-black text-gray-900 dark:text-white mt-1">{metrics.unread_count}</h3>
              <p className="text-[10px] text-gray-400 mt-1.5">Awaiting first check</p>
            </div>
            <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center text-red-500">
              <Inbox className="w-6 h-6" />
            </div>
          </div>

          {/* Card 4: Follow Ups */}
          <div className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm flex items-center justify-between hover:scale-[1.02] transition-transform duration-300">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Follow Ups Due</p>
              <h3 className="text-3xl font-black text-gray-900 dark:text-white mt-1">{metrics.follow_ups_count}</h3>
              <p className="text-[10px] text-gray-400 mt-1.5">Awaiting agent reply</p>
            </div>
            <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500">
              <AlertCircle className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Dashboard Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
          
          {/* Left Column: Follow Ups & Unread Messages */}
          <div className="lg:col-span-8 space-y-6 sm:space-y-8">
            {/* Follow Ups Section */}
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden animate-slide-up flex flex-col">
              <div className="px-6 py-5 border-b border-gray-100 dark:border-white/5 flex-shrink-0">
                <h3 className="text-sm font-black uppercase tracking-widest text-gray-900 dark:text-white">Conversations Awaiting Your Reply</h3>
                <p className="text-[11px] text-gray-400 mt-1">These are active users who sent the last message and need a response.</p>
              </div>
              
              {followUps.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <User className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm">Great work! You have replied to all conversations.</p>
                </div>
              ) : (
                <div className="max-h-[600px] overflow-y-auto custom-scrollbar flex-1 p-4 sm:p-6 space-y-4">
                  {followUps.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="group bg-white dark:bg-[#1e293b] rounded-xl border border-gray-200/80 dark:border-white/5 p-4 shadow-sm hover:shadow-md hover:border-blue-500/30 dark:hover:border-blue-500/30 transition-all duration-300 flex flex-col gap-3"
                    >
                      {/* Card Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-tr from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-500/10">
                            {item.conversation_title?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          <div>
                            <div className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                              {item.conversation_title}
                            </div>
                            <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500">
                              via {item.account_name}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getStageColor(item.pipeline_stage)}`}>
                            {item.pipeline_stage}
                          </span>
                          {item.tags && item.tags.length > 0 ? (
                            item.tags.map(t => (
                              <span key={t} className="inline-flex px-2 py-0.5 bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 text-[9px] font-bold rounded">
                                {t}
                              </span>
                            ))
                          ) : (
                            <span className="text-[9px] text-gray-450 italic">No tags</span>
                          )}
                          <span className="inline-flex items-center gap-1 text-[10px] text-gray-505 bg-gray-55/80 dark:bg-white/5 px-2 py-0.5 rounded ml-auto sm:ml-0 font-medium">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            {formatTimeAgo(item.last_message_at)}
                          </span>
                        </div>
                      </div>

                      {/* Card Body - Full Text Content */}
                      <div className="bg-gray-50 dark:bg-[#0f172a] rounded-xl p-3 border border-gray-100 dark:border-white/5 text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap break-words">
                        {item.last_message_text || <span className="text-gray-400 italic">No text content</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Unread Messages List */}
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden animate-slide-up flex flex-col">
              <div className="px-6 py-5 border-b border-gray-100 dark:border-white/5 flex-shrink-0">
                <h3 className="text-sm font-black uppercase tracking-widest text-gray-900 dark:text-white">Unchecked Incoming Messages</h3>
                <p className="text-[11px] text-gray-400 mt-1">Recent unread messages that haven't been clicked on.</p>
              </div>
              
              {unreadMessages.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <Inbox className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm">No unchecked messages.</p>
                </div>
              ) : (
                <div className="max-h-[300px] overflow-y-auto custom-scrollbar flex-1 divide-y divide-gray-50 dark:divide-white/5">
                  {unreadMessages.map((msg, idx) => (
                    <div key={idx} className="px-6 py-4 flex items-start justify-between gap-4 hover:bg-red-500/[0.02] transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-gray-900 dark:text-white">{msg.sender_name}</span>
                          <span className="text-[10px] text-gray-400">in {msg.conversation_title} ({msg.account_name})</span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap break-words">
                          {msg.text}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-[10px] text-gray-400">{formatTimeAgo(msg.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Received & Sent feeds as separate widgets */}
          <div className="lg:col-span-4 space-y-6">

            {/* Received Messages (24h) */}
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden flex flex-col h-[400px] animate-slide-up">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-white/5 flex-shrink-0 flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold text-sm">←</div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-gray-900 dark:text-white">Received (24h)</h3>
                  <p className="text-[11px] text-gray-400">Messages received in the last 24 hours.</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
                {activity24h.filter(i => !i.is_outgoing).length === 0 ? (
                  <div className="py-16 text-center text-gray-400">
                    <Inbox className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                    <p className="text-xs">No received messages in the last 24h.</p>
                  </div>
                ) : (
                  activity24h.filter(i => !i.is_outgoing).map((item, idx) => (
                    <div key={idx} className="text-xs leading-normal">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-gray-900 dark:text-white truncate">{item.sender_name}</span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">{formatTimeAgo(item.created_at)}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 truncate">in {item.conversation_title} ({item.account_name})</p>
                      <p className="text-gray-600 dark:text-gray-300 mt-1 bg-blue-50/50 dark:bg-blue-500/5 p-2 rounded-lg border border-blue-100 dark:border-blue-500/10 whitespace-pre-wrap break-words">
                        {item.text || <span className="text-gray-400 italic">No text content</span>}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Sent Messages (24h) */}
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden flex flex-col h-[400px] animate-slide-up">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-white/5 flex-shrink-0 flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold text-sm">→</div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-gray-900 dark:text-white">Sent (24h)</h3>
                  <p className="text-[11px] text-gray-400">Messages you sent in the last 24 hours.</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
                {activity24h.filter(i => i.is_outgoing).length === 0 ? (
                  <div className="py-16 text-center text-gray-400">
                    <Send className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                    <p className="text-xs">No sent messages in the last 24h.</p>
                  </div>
                ) : (
                  activity24h.filter(i => i.is_outgoing).map((item, idx) => (
                    <div key={idx} className="text-xs leading-normal">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-gray-900 dark:text-white truncate">To: {item.sender_name}</span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">{formatTimeAgo(item.created_at)}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 truncate">in {item.conversation_title} ({item.account_name})</p>
                      <p className="text-gray-600 dark:text-gray-300 mt-1 bg-emerald-50/50 dark:bg-emerald-500/5 p-2 rounded-lg border border-emerald-100 dark:border-emerald-500/10 whitespace-pre-wrap break-words">
                        {item.text || <span className="text-gray-400 italic">No text content</span>}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
