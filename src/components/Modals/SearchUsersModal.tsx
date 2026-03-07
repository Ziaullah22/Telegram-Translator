import { useState, useEffect, useRef } from 'react';
import { X, Search, Loader2, MessageCircle } from 'lucide-react';
import type { TelegramUserSearchResult } from '../../types';
import { telegramAPI } from '../../services/api';
import PeerAvatar from '../Common/PeerAvatar';

interface SearchUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: number;
  isConnected: boolean;
  onUserSelect: (user: TelegramUserSearchResult) => void;
}

export default function SearchUsersModal({
  isOpen,
  onClose,
  accountId,
  isConnected,
  onUserSelect,
}: SearchUsersModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TelegramUserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.trim().length === 0) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      if (!accountId || !isConnected) {
        setIsSearching(false);
        return;
      }

      try {
        const results = await telegramAPI.searchUsers(accountId, searchQuery);
        setSearchResults(results);
      } catch (error) {
        console.error('Search failed:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500); // 500ms debounce

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, accountId, isConnected]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [isOpen]);

  const handleUserClick = (user: TelegramUserSearchResult) => {
    onUserSelect(user);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-[#212121] rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-scale-in flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-white/5">
          <h3 className="text-[19px] font-medium text-gray-900 dark:text-white">
            Search Users
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-gray-100 dark:border-white/5">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className={`w-4 h-4 transition-colors ${searchQuery ? 'text-[#3390ec]' : 'text-gray-400'}`} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by username..."
              autoFocus
              disabled={!isConnected}
              className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-[14px] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#3390ec] transition-all disabled:opacity-50"
            />
            {isSearching && (
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                <Loader2 className="w-4 h-4 text-[#3390ec] animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[300px]">
          {!searchQuery.trim() ? (
            <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
              <Search className="w-16 h-16 text-gray-400 mb-4 stroke-[1.5]" />
              <p className="text-[15px] text-gray-500 px-10">
                Type a username to find people on Telegram
              </p>
            </div>
          ) : isSearching && searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Loader2 className="w-10 h-10 text-[#3390ec] animate-spin mb-4" />
              <p className="text-gray-400 text-sm">Searching...</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
              <MessageCircle className="w-16 h-16 text-gray-400 mb-4 stroke-[1.5]" />
              <p className="text-[15px] text-gray-500 px-10">No users found</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {searchResults.map((user) => {
                const displayName = user.username || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.phone || 'Unknown';
                const subtitle = user.username ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.phone : '';

                return (
                  <div
                    key={user.id}
                    onClick={() => handleUserClick(user)}
                    className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all hover:bg-gray-50 dark:hover:bg-white/5 group"
                  >
                    {/* Avatar */}
                    <div className="relative">
                      <PeerAvatar
                        accountId={accountId}
                        peerId={user.id}
                        name={displayName}
                        className="w-12 h-12 rounded-full flex-shrink-0"
                      />
                    </div>

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[14px] font-medium text-gray-900 dark:text-white truncate group-hover:text-[#3390ec] transition-colors">
                          {displayName}
                        </h4>
                      </div>
                      {subtitle && (
                        <p className="text-[13px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          {subtitle}
                        </p>
                      )}
                    </div>

                    {/* Action Icon */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity pr-1">
                      <div className="p-2 bg-[#3390ec]/10 text-[#3390ec] rounded-full">
                        <MessageCircle className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
