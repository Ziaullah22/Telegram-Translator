
import { Plus, Smartphone, Wifi, WifiOff, Pencil, Trash2, Bell } from 'lucide-react';
import type { TelegramAccount } from '../../types';

interface SidebarProps {
  accounts: TelegramAccount[];
  currentAccount: TelegramAccount | null;
  onAccountSelect: (account: TelegramAccount) => void;
  onAddAccount: () => void;
  onConnect: (account: TelegramAccount) => void;
  onDisconnect: (account: TelegramAccount) => void;
  onEdit: (account: TelegramAccount) => void;
  onSoftDelete: (account: TelegramAccount) => void;
  unreadCounts: Record<number, Record<number, number>>; // accountId -> { conversationId: count }
}

export default function Sidebar({
  accounts,
  currentAccount,
  onAccountSelect,
  onAddAccount,
  onConnect,
  onDisconnect,
  onEdit,
  onSoftDelete,
  unreadCounts,
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
    <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-colors duration-300">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <button
          id="add-account-btn"
          onClick={onAddAccount}
          className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-all duration-300 shadow-md shadow-blue-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>Add Account</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4">
            Telegram Accounts
          </h3>

          <div id="sidebar-accounts">

            {accounts.length === 0 ? (
              <div className="text-center py-10 text-gray-400 dark:text-gray-500">
                <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold">No accounts added yet</p>
                <p className="text-xs mt-1">Click "Add Account" to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedAccounts.map((account) => (
                  <div
                    key={account.id}
                    className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer ${currentAccount?.id === account.id
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20'
                      : 'bg-gray-50 dark:bg-gray-700/50 border-gray-100 dark:border-gray-600/50 text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 hover:shadow-md'
                      }`}
                    onClick={() => onAccountSelect(account)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold truncate text-[15px]">{account.displayName || account.accountName}</h4>
                      <div className="flex items-center space-x-2">
                        {(() => {
                          const map = unreadCounts[account.id] || {};
                          const total = Object.values(map).reduce((s, n) => s + (n || 0), 0);
                          return total > 0 ? (
                            <div className="flex items-center space-x-1 px-2 py-0.5 rounded-xl bg-red-500 shadow-sm animate-pulse-subtle">
                              <Bell className="w-3 h-3 text-white" />
                              <span className="text-[10px] font-black text-white leading-none">
                                {total}
                              </span>
                            </div>
                          ) : null;
                        })()}
                        <button
                          onClick={(e) => { e.stopPropagation(); onEdit(account); }}
                          className={`p-1.5 rounded-lg transition-colors ${currentAccount?.id === account.id ? 'hover:bg-blue-500' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onSoftDelete(account); }}
                          className={`p-1.5 rounded-lg transition-colors ${currentAccount?.id === account.id ? 'hover:bg-blue-500' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-red-500 dark:text-red-400" />
                        </button>
                        {account.isConnected ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDisconnect(account);
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${currentAccount?.id === account.id ? 'hover:bg-blue-500' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                            title="Disconnect"
                          >
                            <Wifi className={`w-4 h-4 ${currentAccount?.id === account.id ? 'text-white' : 'text-green-500'}`} />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onConnect(account);
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${currentAccount?.id === account.id ? 'hover:bg-blue-500' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                            title="Connect"
                          >
                            <WifiOff className="w-4 h-4 text-red-500" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="text-[11px] space-y-1.5 font-medium">
                      {account.accountName && (
                        <p className={`${currentAccount?.id === account.id ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>{account.accountName}</p>
                      )}
                      <div className="flex justify-between items-center">
                        <span className={`${currentAccount?.id === account.id ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
                          {account.sourceLanguage} → {account.targetLanguage}
                        </span>
                        <span
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${account.isConnected
                            ? currentAccount?.id === account.id
                              ? 'bg-white/20 text-white'
                              : 'bg-green-500/10 text-green-600 dark:text-green-400'
                            : currentAccount?.id === account.id
                              ? 'bg-black/20 text-white/80'
                              : 'bg-red-500/10 text-red-600 dark:text-red-400'
                            }`}
                        >
                          {account.isConnected ? 'Connected' : 'Offline'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}