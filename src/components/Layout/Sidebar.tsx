/**
 * SIDEBAR COMPONENT
 * 
 * Displays the list of connected Telegram accounts.
 * Includes functionality to:
 * 1. Switch between accounts
 * 2. Add new accounts (Upload TData)
 * 3. Connect/Disconnect accounts
 * 4. Manage account settings (Profile, 2FA, Sessions)
 * 5. Display unread message counts per account
 */
import { Plus, Smartphone, Wifi, WifiOff, Pencil, Trash2, Bell, BellOff, User, Shield } from 'lucide-react';
import type { TelegramAccount } from '../../types';

interface SidebarProps {
  accounts: TelegramAccount[];
  currentAccount: TelegramAccount | null;
  onAccountSelect: (account: TelegramAccount) => void;
  onAddAccount: () => void;
  onConnect: (account: TelegramAccount) => void;
  onDisconnect: (account: TelegramAccount) => void;
  onEdit: (account: TelegramAccount) => void;
  onDelete: (account: TelegramAccount) => void;
  onProfile: (account: TelegramAccount) => void;
  onSessions: (account: TelegramAccount) => void;
  unreadCounts: Record<number, Record<number, number>>; // accountId -> { conversationId: count }
  hideOriginal: boolean;
  onToggleHideOriginal: () => void;
}

export default function Sidebar({
  accounts,
  currentAccount,
  onAccountSelect,
  onAddAccount,
  onConnect,
  onDisconnect,
  onEdit,
  onDelete,
  onProfile,
  onSessions,
  unreadCounts,
  hideOriginal,
  onToggleHideOriginal,
}: SidebarProps) {
  // Natural sort function that handles numbers correctly (1,2,3,11,23 instead of 1,11,2,23,3)
  const naturalSort = (a: string, b: string): number => {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  };

  // Sort accounts: connected first, then disconnected, then naturally within each group
  const sortedAccounts = [...accounts].sort((a, b) => {
    // First, sort by connection status
    if (a.isConnected && !b.isConnected) return -1;
    if (!a.isConnected && b.isConnected) return 1;

    // Within same connection status, sort naturally by display name
    const nameA = (a.displayName || a.accountName).toLowerCase();
    const nameB = (b.displayName || b.accountName).toLowerCase();
    return naturalSort(nameA, nameB);
  });

  return (
    <div id="main-sidebar" className="w-full h-full bg-white dark:bg-[#17212b] border-r border-gray-100 dark:border-white/5 flex flex-col transition-colors duration-300 relative">
      <div className="p-3 border-b border-gray-100 dark:border-white/5">
        <button
          id="add-account-btn"
          onClick={onAddAccount}
          className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-all duration-300 shadow-md shadow-blue-600/20 text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add Account</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-3">
          <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">
            Accounts
          </h3>

          <div id="sidebar-accounts">

            {accounts.length === 0 ? (
              <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                <Smartphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-xs font-semibold">No accounts yet</p>
                <p className="text-[10px] mt-1">Click "Add Account" to start</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedAccounts.map((account) => (
                  <div
                    key={account.id}
                    className={`p-3 rounded-xl border transition-all duration-300 cursor-pointer relative overflow-hidden ${currentAccount?.id === account.id
                      ? 'bg-slate-200/90 dark:bg-white/10 border-slate-300 dark:border-white/20 text-gray-900 dark:text-white shadow-md'
                      : 'bg-gray-50/50 dark:bg-transparent border-transparent text-gray-700 dark:text-gray-300 hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark hover:shadow-sm'
                      }`}
                    onClick={() => onAccountSelect(account)}
                  >
                    {currentAccount?.id === account.id && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" />
                    )}
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold truncate text-[13px] flex-1 mr-1">{account.displayName || account.accountName}</h4>
                      <div className="flex items-center space-x-1 flex-shrink-0">
                        {(() => {
                          const map = unreadCounts[account.id] || {};
                          const total = Object.values(map).reduce((s, n) => s + (n || 0), 0);
                          return total > 0 ? (
                            <div className="flex items-center space-x-0.5 px-1.5 py-0.5 rounded-xl bg-blue-600 shadow-sm animate-pulse-subtle">
                              <Bell className="w-2.5 h-2.5 text-white" />
                              <span className="text-[9px] font-black text-white leading-none">
                                {total}
                              </span>
                            </div>
                          ) : null;
                        })()}

                        <div className="h-4 w-px bg-gray-200 dark:bg-white/10 mx-1" />

                        <button
                          id="account-edit-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(account);
                          }}
                          className={`p-1 rounded-lg transition-colors ${currentAccount?.id === account.id ? 'hover:bg-slate-300 dark:hover:bg-white/20' : 'hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark'}`}
                          title="Settings"
                        >
                          <Pencil className="w-3.5 h-3.5 text-gray-500" />
                        </button>

                        <button
                          id="account-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(account);
                          }}
                          className={`p-1 rounded-lg transition-colors ${currentAccount?.id === account.id ? 'hover:bg-slate-300 dark:hover:bg-white/20' : 'hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark'}`}
                          title="Remove Account"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </button>

                        <button
                          id="account-profile-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onProfile(account);
                          }}
                          className={`p-1 rounded-lg transition-colors ${currentAccount?.id === account.id ? 'hover:bg-slate-300 dark:hover:bg-white/20' : 'hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark'}`}
                          title="Profile"
                        >
                          <User className="w-3.5 h-3.5 text-blue-500" />
                        </button>

                        <button
                          id="account-sessions-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSessions(account);
                          }}
                          className={`p-1 rounded-lg transition-colors ${currentAccount?.id === account.id ? 'hover:bg-slate-300 dark:hover:bg-white/20' : 'hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark'}`}
                          title="Active Sessions"
                        >
                          <Shield className="w-3.5 h-3.5 text-amber-500" />
                        </button>

                        {account.isConnected ? (
                          <button
                            id="account-online-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDisconnect(account);
                            }}
                            className={`p-1 rounded-lg transition-colors ${currentAccount?.id === account.id ? 'hover:bg-slate-300 dark:hover:bg-white/20' : 'hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark'}`}
                            title="Disconnect"
                          >
                            <Wifi className="w-3.5 h-3.5 text-green-500" />
                          </button>
                        ) : (
                          <button
                            id="account-online-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onConnect(account);
                            }}
                            className={`p-1 rounded-lg transition-colors ${currentAccount?.id === account.id ? 'hover:bg-slate-300 dark:hover:bg-white/20' : 'hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark'}`}
                            title="Connect"
                          >
                            <WifiOff className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="text-[11px] space-y-1 font-medium">
                      {account.accountName && (
                        <p className={`${currentAccount?.id === account.id ? 'text-gray-600 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'} truncate`}>{account.accountName}</p>
                      )}
                      <div className="flex justify-between items-center">
                        <div className={`inline-flex items-center gap-1 rounded-lg px-1.5 py-0 shadow-sm border bg-black/5 border-black/5 dark:bg-white/5 dark:border-white/5`}>
                          <span className={`text-[9px] font-black uppercase tracking-widest leading-none ${currentAccount?.id === account.id ? 'text-gray-900 dark:text-white/90' : 'text-gray-600 dark:text-gray-300'}`}>
                            {account.targetLanguage.toUpperCase()}
                          </span>
                          <div className={`flex items-center opacity-60 ${currentAccount?.id === account.id ? 'text-gray-500 dark:text-white/70' : 'text-gray-400'}`}>
                            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 17H4L8 21" />
                              <path d="M4 7H20L16 3" />
                            </svg>
                          </div>
                          <span className={`text-[9px] font-black uppercase tracking-widest leading-none ${currentAccount?.id === account.id ? 'text-gray-900 dark:text-white/90' : 'text-gray-600 dark:text-gray-300'}`}>
                            {account.sourceLanguage.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          {account.notificationsEnabled === false && (
                            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <BellOff className="w-2.5 h-2.5" />
                              Muted
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${account.isConnected
                              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                              : 'bg-red-500/10 text-red-600 dark:text-red-400'
                              }`}
                          >
                            {account.isConnected ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* --- ADDED FEATURE: FOCUS MODE TOGGLE --- */}
      <div className="p-4 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/10">
        <label className="flex items-center justify-between cursor-pointer group">
          <div className="flex flex-col">
            <span className="text-[11px] font-black uppercase tracking-tight text-gray-700 dark:text-gray-200 group-hover:text-blue-500 transition-colors">
              Focus Mode
            </span>
            <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 leading-none mt-0.5">
              Hide Foreign Text
            </span>
          </div>
          <div 
            onClick={onToggleHideOriginal}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
              hideOriginal ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                hideOriginal ? 'translate-x-[1.2rem]' : 'translate-x-[0.2rem]'
              }`}
            />
          </div>
        </label>
      </div>
    </div>
  );
}