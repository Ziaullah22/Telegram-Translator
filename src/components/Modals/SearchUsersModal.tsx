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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Search Users</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-gray-700">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-5 h-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by username..."
              autoFocus
              disabled={!isConnected}
              className="w-full pl-10 pr-10 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {isSearching && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {!searchQuery.trim() ? (
            <div className="text-center py-8">
              <Search className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">
                Enter a username to search for users
              </p>
            </div>
          ) : isSearching ? (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 text-blue-500 mx-auto mb-3 animate-spin" />
              <p className="text-gray-400 text-sm">Searching...</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No Result</p>
            </div>
          ) : (
            <div className="space-y-2">
              {searchResults.map((user) => {
                const displayName = user.username || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.phone || 'Unknown';
                const subtitle = user.username ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.phone : '';

                return (
                  <div
                    key={user.id}
                    onClick={() => handleUserClick(user)}
                    className="flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-gray-700 text-gray-200"
                  >
                    {/* Avatar */}
                    <PeerAvatar
                      accountId={accountId}
                      peerId={user.id}
                      name={displayName}
                      className="w-12 h-12 rounded-full flex-shrink-0 text-lg"
                    />

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium truncate">
                        {displayName}
                      </h3>
                      {subtitle && (
                        <p className="text-xs text-gray-400 truncate">
                          {subtitle}
                        </p>
                      )}
                    </div>

                    {/* User Icon */}
                    <div className="opacity-50">
                      <MessageCircle className="w-5 h-5" />
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
