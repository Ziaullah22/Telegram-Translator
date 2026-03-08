import { MessageCircle, Search, Loader2, X, Users, Megaphone, BellOff, Trash2, Bell } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import type { TelegramChat, TelegramUserSearchResult } from '../../types';
import { telegramAPI } from '../../services/api';
import PeerAvatar, { prefetchAvatars } from '../Common/PeerAvatar';

interface ConversationListProps {
  conversations: TelegramChat[];
  currentConversation: TelegramChat | null;
  onConversationSelect: (conversation: TelegramChat) => void;
  onDeleteConversation?: (conversationId: number) => void;
  isConnected?: boolean;
  unreadCounts: Record<number, number>;
  accountId?: number;
  onConversationCreated?: () => Promise<void>;
}

const formatConvDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  } else {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
};

/**
 * CONVERSATION LIST COMPONENT
 * The left sidebar that displays all active chats, search functionality, 
 * unread badges, and real-time activity for the current Telegram account.
 */
export default function ConversationList({
  conversations,
  currentConversation,
  onConversationSelect,
  onDeleteConversation,
  isConnected = false,
  unreadCounts,
  accountId,
  onConversationCreated,
}: ConversationListProps) {
  /**
   * SEARCH & STATE
   * searchQuery: User input for global Telegram search or local filtering.
   * searchResults: Dynamic list of users/groups found on Telegram.
   * isSearching: Loading state for global search API calls.
   * contextMenu: Right-click menu state (mute/delete).
   */
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TelegramUserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; conversationId: number | null }>({
    isOpen: false,
    conversationId: null,
  });
  const [contextMenu, setContextMenu] = useState<{ conversation: TelegramChat; x: number; y: number } | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  // Close context menu when clicking anywhere
  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // Batch-prefetch all conversation photos as soon as they are available
  useEffect(() => {
    if (!accountId || conversations.length === 0) return;
    const peers = conversations
      .map(c => ({ peerId: c.telegram_peer_id! }))
      .filter(p => !!p.peerId);
    prefetchAvatars(accountId, peers);
  }, [accountId, conversations]);

  // Debounced search logic
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
    }, 400); // 400ms debounce

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, accountId, isConnected]);

  const handleUserSelect = async (user: TelegramUserSearchResult) => {
    if (!accountId) return;
    try {
      const titleParts = [];
      if (user.first_name) titleParts.push(user.first_name);
      if (user.last_name) titleParts.push(user.last_name);
      const title = titleParts.length > 0 ? titleParts.join(' ') : user.username || user.phone || 'Unknown';

      const isGroup = user.type === 'group' || user.type === 'supergroup' || user.type === 'channel';
      // Map 'user' to 'private' for database compatibility
      const targetType = user.type === 'user' ? 'private' : user.type;

      const conversation = await telegramAPI.createConversation(accountId, {
        telegram_peer_id: user.id,
        title: user.title || title,
        username: user.username,
        type: targetType,
        is_hidden: isGroup, // Hide if it's a group we haven't joined yet to trigger "Join" button UI
      });

      // Select immediately to show chat window
      onConversationSelect({
        id: conversation.id,
        title: conversation.title,
        username: user.username,
        type: targetType as any,
        is_hidden: conversation.is_hidden,
      } as TelegramChat);

      // Refresh list in background
      if (onConversationCreated) {
        onConversationCreated().catch(err => console.error('Failed to refresh list:', err));
      }

      // Clear search after selecting
      setSearchQuery('');
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };



  const getLastMessagePreview = (conversation: TelegramChat) => {
    if (!conversation.lastMessage) return 'No messages yet';
    const msg = conversation.lastMessage;
    if (msg.type === 'text') return msg.translated_text || msg.original_text || '';
    if (msg.type === 'photo') return '📷 Photo';
    if (msg.type === 'video') return '📹 Video';
    if (msg.type === 'voice') return '🎤 Voice message';
    if (msg.type === 'document') return '📄 Document';
    if (msg.type === 'sticker') return '😀 Sticker';
    if (msg.type === 'animation') return '🖼️ GIF';
    if (msg.type === 'location') return '📍 Location';
    if (msg.type === 'contact') return '👤 Contact';
    if (msg.type === 'poll') return '📊 Poll';
    if (msg.type === 'auto_reply') return '⚡ ' + (msg.translated_text || msg.original_text);
    return '💬 Message';
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case 'group':
      case 'supergroup':
        return <Users className="w-4 h-4" />;
      case 'channel':
        return <Megaphone className="w-4 h-4" />;
      default:
        return <MessageCircle className="w-4 h-4" />;
    }
  };

  return (
    <div id="conversation-list" className="w-80 bg-telegram-side-list-light dark:bg-telegram-side-list-dark border-r border-gray-100 dark:border-white/5 flex flex-col transition-colors duration-300">
      {/* Header with Search Bar */}
      <div id="search-container" className="p-3 border-b border-gray-100 dark:border-white/5 space-y-3">
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className={`w-4 h-4 transition-colors ${searchQuery ? 'text-[#419FD9]' : 'text-gray-400 dark:text-gray-500'}`} />
          </div>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={!isConnected}
            autoComplete="no-autofill-search"
            spellCheck={false}
            name="search-query-field"
            placeholder={isConnected ? "Search chats or usernames..." : "Connect account to search..."}
            className="w-full pl-9 pr-9 py-2 bg-gray-100 dark:bg-white/5 border border-transparent focus:border-[#419FD9] dark:focus:border-[#419FD9] rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-500 transition-all outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {isSearching && (
            <div className="absolute inset-y-0 right-8 pr-3 flex items-center">
              <Loader2 className="w-4 h-4 text-[#419FD9] animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* List Space */}
      <div id="list-container" className="flex-1 overflow-y-auto">
        {searchQuery.trim() ? (
          /* Search Results View */
          <div className="flex flex-col">
            <div className="px-4 py-2 text-[11px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-white/5">
              Global Search Results
            </div>
            {isSearching && searchResults.length === 0 ? (
              <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                Searching Telegram...
              </div>
            ) : searchResults.length === 0 && !isSearching ? (
              <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                No users found for "{searchQuery}"
              </div>
            ) : (
              searchResults.map((user) => {
                const displayName = user.username || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.phone || 'Unknown';
                const subtitle = user.username ? `@${user.username}` : user.phone || '';

                return (
                  <div
                    key={user.id}
                    onClick={() => handleUserSelect(user)}
                    className="flex items-center px-3 py-2.5 cursor-pointer hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark transition-colors border-b border-gray-50 dark:border-white/5 last:border-0"
                  >
                    <PeerAvatar
                      accountId={accountId}
                      peerId={user.id}
                      name={displayName}
                      className="w-12 h-12 rounded-full flex-shrink-0 text-lg"
                    />
                    <div className="flex-1 min-w-0 ml-3">
                      <h3 className="text-sm font-semibold truncate text-gray-900 dark:text-white">
                        {displayName}
                      </h3>
                      <p className="text-xs text-[#4da2d9] truncate">
                        {subtitle}
                      </p>
                    </div>
                    <div className="text-[#4da2d9] pr-2 opacity-70">
                      {getResultIcon(user.type)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Normal Conversations View */
          conversations.length === 0 ? (
            <div className="p-10 text-center">
              <MessageCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4 opacity-30" />
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                {isConnected ? 'No conversations yet' : 'Connect account to see conversations'}
              </p>
            </div>
          ) : (
            conversations.map((conversation) => {
              const isActive = currentConversation?.id === conversation.id;
              const unread = unreadCounts[conversation.id] || 0;
              const lastPreview = getLastMessagePreview(conversation);
              const isOutgoing = conversation.lastMessage?.is_outgoing;
              const displayName = conversation.title || conversation.username || 'Unknown';

              return (
                <div
                  key={conversation.id}
                  onClick={() => onConversationSelect(conversation)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ conversation, x: e.clientX, y: e.clientY });
                  }}
                  className={`flex items-center px-3 py-2.5 cursor-pointer transition-all duration-200 group ${isActive
                    ? 'bg-[#419FD9] shadow-inner'
                    : 'hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark'
                    }`}
                >
                  {/* Avatar */}
                  <PeerAvatar
                    accountId={accountId}
                    peerId={
                      conversation.telegram_peer_id
                        ? conversation.telegram_peer_id
                        : (conversation.type === 'private' && !conversation.lastMessage?.is_outgoing
                          ? conversation.lastMessage?.sender_user_id
                          : undefined)
                    }
                    name={displayName}
                    isActive={isActive}
                    className="w-12 h-12 rounded-full flex-shrink-0 text-lg"
                  />

                  {/* Info */}
                  <div className={`flex-1 min-w-0 ml-3 py-1 ${isActive ? '' : 'border-b border-gray-100 dark:border-white/5'}`}>
                    <div className="flex items-center justify-between">
                      <h3 className={`text-sm font-semibold truncate ${isActive ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                        {conversation.username && (!conversation.title || conversation.title.startsWith('+'))
                          ? `@${conversation.username}`
                          : (conversation.title || 'Unknown')}
                      </h3>
                      <div className="flex items-center space-x-1 ml-2 flex-shrink-0 relative">
                        {isOutgoing && (
                          <svg className={`w-3 h-3 ${isActive ? 'text-blue-100' : 'text-[#419FD9] dark:text-[#419FD9]'}`} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                        {conversation.is_muted && (
                          <BellOff className={`w-3 h-3 ${isActive ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`} />
                        )}
                        {!isActive && (
                          <span className={`text-[11px] transition-opacity duration-200 ${isActive ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'} group-hover:opacity-0`}>
                            {conversation.lastMessage ? formatConvDate(conversation.lastMessage.created_at) : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-0.5">
                      <p className={`text-xs truncate ${isActive ? 'text-blue-50' : 'text-gray-500 dark:text-gray-400'}`}>
                        {lastPreview}
                      </p>
                      {unread > 0 && (
                        <span className={`ml-2 flex-shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black text-white ${isActive ? 'bg-white/30' : conversation.is_muted ? 'bg-gray-400 dark:bg-gray-500' : 'bg-[#40A7E3]'}`}>
                          {unread}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )
        )}
      </div>

      {/* Context Menu (Right Click) */}
      {contextMenu && (
        <div
          className="fixed z-[200] w-52 bg-white dark:bg-[#232323] border border-gray-100 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Mute/Unmute */}
          <button
            onClick={() => {
              // Trigger mute logic if available, for now just placeholder as per logic in main window
              setContextMenu(null);
            }}
            className="w-full px-4 py-2.5 flex items-center space-x-3 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            <Bell className="w-[18px] h-[18px] text-gray-500" />
            <span className="text-[15px]">{contextMenu.conversation.is_muted ? 'Unmute' : 'Mute'}</span>
          </button>

          <div className="mx-3 border-b border-gray-100 dark:border-white/5" />

          {/* Delete */}
          <button
            onClick={() => {
              setDeleteModal({ isOpen: true, conversationId: contextMenu.conversation.id });
              setContextMenu(null);
            }}
            className="w-full px-4 py-2.5 flex items-center space-x-3 text-[#ff595a] hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-[18px] h-[18px]" />
            <span className="text-[15px] font-medium">Delete chat</span>
          </button>
        </div>
      )}

      {/* Modern Deletion Modal (Same template as single message delete) */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 animate-fade-in">
          <div className="bg-white dark:bg-[#212121] rounded-xl shadow-xl w-full max-w-[320px] overflow-hidden animate-scale-in">
            <div className="p-6">
              {(() => {
                const chatToDelete = conversations.find(c => c.id === deleteModal.conversationId);
                const isGroup = chatToDelete?.type === 'group' || chatToDelete?.type === 'supergroup';
                const isChannel = chatToDelete?.type === 'channel';

                let title = 'Delete Chat';
                let message = 'Are you sure you want to delete this chat? This cannot be undone.';
                let confirmText = 'Delete';

                if (isGroup) {
                  title = 'Leave Group';
                  message = 'Are you sure you want to leave this group? You will no longer receive messages from it.';
                  confirmText = 'Leave';
                } else if (isChannel) {
                  title = 'Leave Channel';
                  message = 'Are you sure you want to leave this channel? You will no longer receive updates.';
                  confirmText = 'Leave';
                }

                return (
                  <>
                    <h3 className="text-[19px] font-medium text-gray-900 dark:text-white mb-2">
                      {title}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300 text-[15px] mb-5">
                      {message}
                    </p>

                    <div className="flex items-center justify-end space-x-2 mt-2">
                      <button
                        onClick={() => setDeleteModal({ isOpen: false, conversationId: null })}
                        className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (deleteModal.conversationId && onDeleteConversation) {
                            onDeleteConversation(deleteModal.conversationId);
                          }
                          setDeleteModal({ isOpen: false, conversationId: null });
                        }}
                        className="px-4 py-2 text-[#e53935] hover:bg-[#e53935]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide"
                      >
                        {confirmText}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
