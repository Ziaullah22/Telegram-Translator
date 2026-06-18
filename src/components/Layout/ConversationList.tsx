/**
 * CONVERSATION LIST COMPONENT
 * 
 * Displays the list of chats (private, groups, channels) for the current account.
 * Responsibilities:
 * 1. Local and global search (Telegram search)
 * 2. Real-time updates for unread counts and last messages
 * 3. Avatar pre-fetching for smooth scrolling
 * 4. Context menu for chat actions (Mute, Delete)
 */
import { MessageCircle, Search, Loader2, X, Users, Megaphone, BellOff, Trash2, Bell, Lock, ArrowLeft, MessageSquare, Pin, CheckSquare } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import type { TelegramChat, TelegramUserSearchResult, TelegramGlobalMessageSearchResult } from '../../types';
import { telegramAPI, messagesAPI } from '../../services/api';
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
  isTranslationEnabled?: boolean;
  hideOriginal?: boolean;
  onBack?: () => void;
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

export default function ConversationList({
  conversations,
  currentConversation,
  onConversationSelect,
  onDeleteConversation,
  isConnected = false,
  unreadCounts,
  accountId,
  onConversationCreated,
  isTranslationEnabled = true,
  hideOriginal = false,
  onBack,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TelegramUserSearchResult[]>([]);
  const [messageResults, setMessageResults] = useState<TelegramGlobalMessageSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchFilter, setSearchFilter] = useState<'all' | 'users' | 'groups' | 'channels'>('all');
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; conversationId: number | null }>({
    isOpen: false,
    conversationId: null,
  });
  const [contextMenu, setContextMenu] = useState<{ conversation: TelegramChat; x: number; y: number } | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [optimisticDeletedIds, setOptimisticDeletedIds] = useState<Set<number>>(new Set());
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
      setMessageResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      if (!accountId || !isConnected) {
        setIsSearching(false);
        return;
      }

      // Add a controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      try {
        const [users, messages] = await Promise.all([
          telegramAPI.searchUsers(accountId, searchQuery),
          messagesAPI.searchGlobalMessages(searchQuery)
        ]);
        setSearchResults(users);
        setMessageResults(messages);
      } catch (error) {
        console.error('Search failed:', error);
        if (searchQuery.trim().length > 0) {
           // Only clear if search was actually failing, but keep previous results if it was just a slow/aborted request
           // setSearchResults([]);
        }
      } finally {
        clearTimeout(timeoutId);
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
        invite_hash: user.invite_hash,
      });

      // Select immediately to show chat window
      onConversationSelect({
        id: conversation.id,
        title: conversation.title,
        username: user.username,
        type: targetType as any,
        is_hidden: conversation.is_hidden,
        can_post: conversation.can_post !== undefined ? conversation.can_post : true,
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
    
    if (msg.type === 'text' || msg.type === 'auto_reply') {
      let text = '';
      if (hideOriginal) {
        text = msg.is_outgoing ? msg.original_text : (msg.translated_text || msg.original_text);
      } else {
        text = isTranslationEnabled ? (msg.translated_text || msg.original_text) : msg.original_text;
      }
      return (msg.type === 'auto_reply' ? '⚡ ' : '') + (text || '');
    }
    if (msg.type === 'photo') return '📷 Photo';
    if (msg.type === 'video') return '📹 Video';
    if (msg.type === 'voice') return '🎤 Voice message';
    if (msg.type === 'document') return '📄 Document';
    if (msg.type === 'sticker') return '😀 Sticker';
    if (msg.type === 'animation') return '🖼️ GIF';
    if (msg.type === 'location') return '📍 Location';
    if (msg.type === 'contact') return '👤 Contact';
    if (msg.type === 'poll') return '📊 Poll';
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
    <div id="conversation-list" className="w-full h-full bg-telegram-side-list-light dark:bg-telegram-side-list-dark border-r border-gray-100 dark:border-white/5 flex flex-col transition-all duration-300">
      {/* Header with Search Bar and Back Button */}
      {/* Header with Search Bar, Back Button OR Selection Actions */}
      <div id="search-container" className="p-3 border-b border-gray-100 dark:border-white/5 flex flex-col gap-2">
        {isSelectionMode ? (
          <div className="flex items-center justify-between h-9 px-1 animate-fade-in">
            {/* Left side: Cancel & Select All */}
            <div className="flex items-center space-x-3">
              <button
                onClick={() => {
                  setIsSelectionMode(false);
                  setSelectedIds(new Set());
                }}
                className="flex items-center justify-center p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-all"
                title="Cancel selection"
              >
                <X className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  const currentVisible = conversations.filter(c => {
                    if (optimisticDeletedIds.has(c.id)) return false;
                    
                    if (searchQuery.trim()) {
                      const title = (c.title || '').toLowerCase();
                      const username = (c.username || '').toLowerCase();
                      const query = searchQuery.toLowerCase();
                      if (!title.includes(query) && !username.includes(query)) return false;
                    }

                    if (searchFilter === 'all') return true;
                    if (searchFilter === 'users') return c.type === 'private';
                    if (searchFilter === 'groups') return c.type === 'group' || c.type === 'supergroup';
                    if (searchFilter === 'channels') return c.type === 'channel';
                    return true;
                  });

                  const visibleIds = currentVisible.map(c => c.id);
                  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

                  if (allSelected) {
                    setSelectedIds(prev => {
                      const next = new Set(prev);
                      visibleIds.forEach(id => next.delete(id));
                      return next;
                    });
                  } else {
                    setSelectedIds(prev => {
                      const next = new Set(prev);
                      visibleIds.forEach(id => next.add(id));
                      return next;
                    });
                  }
                }}
                className="text-[13px] font-bold text-[#3390ec] hover:text-[#2879c9] transition-colors uppercase tracking-wide"
              >
                {(() => {
                  const currentVisible = conversations.filter(c => {
                    if (optimisticDeletedIds.has(c.id)) return false;
                    
                    if (searchQuery.trim()) {
                      const title = (c.title || '').toLowerCase();
                      const username = (c.username || '').toLowerCase();
                      const query = searchQuery.toLowerCase();
                      if (!title.includes(query) && !username.includes(query)) return false;
                    }

                    if (searchFilter === 'all') return true;
                    if (searchFilter === 'users') return c.type === 'private';
                    if (searchFilter === 'groups') return c.type === 'group' || c.type === 'supergroup';
                    if (searchFilter === 'channels') return c.type === 'channel';
                    return true;
                  });
                  
                  const visibleIds = currentVisible.map(c => c.id);
                  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
                  return allSelected ? 'None' : 'All';
                })()}
              </button>
            </div>

            {/* Center: Selected Count */}
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {selectedIds.size} selected
            </span>

            {/* Right side: Delete button */}
            <button
              disabled={selectedIds.size === 0}
              onClick={() => setBulkDeleteModalOpen(true)}
              className="flex items-center space-x-1 px-3 py-1.5 bg-[#e53935] hover:bg-[#d32f2f] disabled:bg-gray-200 dark:disabled:bg-[#2c2c2c] disabled:text-gray-400 dark:disabled:text-gray-600 text-white font-bold rounded-lg transition-all uppercase text-[12px] tracking-wide disabled:opacity-50"
            >
              <span>Delete</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="xl:hidden p-2 -ml-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-all"
                title="Back to Accounts"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="relative group flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className={`w-4 h-4 transition-colors ${searchQuery ? 'text-blue-600' : 'text-gray-400 dark:text-gray-500'}`} />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)} // Delay to allow filter clicks
                disabled={!isConnected}
                autoComplete="no-autofill-search"
                spellCheck={false}
                name="search-query-field"
                placeholder={isConnected ? "Search chats..." : "Connect account..."}
                className="w-full pl-9 pr-9 py-2 bg-gray-100 dark:bg-white/5 border border-transparent focus:border-blue-600 dark:focus:border-blue-600 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-500 transition-all outline-none"
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
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                </div>
              )}
            </div>
            {isConnected && conversations.length > 0 && (
              <button
                onClick={() => {
                  setIsSelectionMode(!isSelectionMode);
                  setSelectedIds(new Set());
                }}
                className={`p-2 rounded-xl border transition-all shrink-0 ${
                  isSelectionMode 
                    ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                    : 'bg-gray-100 dark:bg-white/5 border-transparent text-gray-500 hover:bg-gray-200 dark:hover:bg-white/10 dark:text-gray-400'
                }`}
                title="Bulk Edit Chats"
              >
                <CheckSquare className="w-4.5 h-4.5" />
              </button>
            )}
          </div>
        )}

        {/* Global Search Filters */}
        {(searchQuery.trim() || isSearchFocused || searchFilter !== 'all') && (
          <div className="px-1 flex gap-1.5 overflow-x-auto no-scrollbar scroll-smooth">
            {[
              { id: 'all', label: 'All' },
              { id: 'users', label: 'Users' },
              { id: 'groups', label: 'Groups' },
              { id: 'channels', label: 'Channels' }
            ].map(filter => (
              <button
                key={filter.id}
                onClick={() => setSearchFilter(filter.id as any)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  searchFilter === filter.id 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List Space */}
      <div id="list-container" className="flex-1 overflow-y-auto">
        {(searchQuery.trim() || searchFilter !== 'all') ? (
          /* Combined Search View (Local + Global) */
          <div className="flex flex-col">
            
            {/* Section 1: Local Matches (Your Chats) */}
            {(() => {
              // If we are strictly searching for something else, we can hide the header but keep the items?
              // The user said: "chats should only show if i select all"
              // But usually you want to see your existing user chats if you select "Users".
              // I will follow the user's request: only show "Your Chats" section if "All" is selected OR if it matches.
              
              const localMatches = conversations.filter(conv => {
                if (optimisticDeletedIds.has(conv.id)) return false;
                const title = (conv.title || '').toLowerCase();
                const username = (conv.username || '').toLowerCase();
                const query = searchQuery.toLowerCase();
                
                // Filter by text
                const matchesText = title.includes(query) || username.includes(query);
                if (!matchesText && searchQuery.trim()) return false;

                // Filter by category
                if (searchFilter === 'all') return true;
                if (searchFilter === 'users') return conv.type === 'private';
                if (searchFilter === 'groups') return conv.type === 'group' || conv.type === 'supergroup';
                if (searchFilter === 'channels') return conv.type === 'channel';
                return true;
              });

              if (localMatches.length === 0) return null;

              const sortedLocalMatches = [...localMatches].sort((a, b) => {
                const aPinned = a.is_pinned ? 1 : 0;
                const bPinned = b.is_pinned ? 1 : 0;
                if (aPinned !== bPinned) return bPinned - aPinned;
                const aTime = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
                const bTime = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
                return bTime - aTime;
              });

              return (
                <>
                  <div className="px-4 py-2 text-[11px] font-bold text-blue-600 dark:text-blue-500 uppercase tracking-widest bg-gray-50/50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5">
                    Your Chats
                  </div>
                  {sortedLocalMatches.map(conv => {
                    const isActive = currentConversation?.id === conv.id;
                    return (
                      <div
                        key={conv.id}
                        onClick={() => {
                          if (isSelectionMode) {
                            toggleSelect(conv.id);
                          } else {
                            onConversationSelect(conv);
                            setSearchQuery('');
                          }
                        }}
                        className={`flex items-center px-3 py-2.5 cursor-pointer transition-all duration-200 group border-l-4 border-b border-gray-50 dark:border-white/5 last:border-0 ${isActive
                          ? 'bg-blue-600 border-l-blue-600 shadow-inner'
                          : conv.is_pinned
                            ? 'bg-gray-50/70 dark:bg-white/[0.04] border-l-blue-500 hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark'
                            : 'border-l-transparent hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark'
                          }`}
                      >
                      {isSelectionMode && (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(conv.id);
                          }}
                          className="pr-2 pl-1 flex-shrink-0"
                        >
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                            selectedIds.has(conv.id)
                              ? 'bg-blue-600 border-blue-600 text-white scale-110'
                              : 'border-gray-300 dark:border-white/20 bg-transparent'
                          }`}>
                            {selectedIds.has(conv.id) && (
                              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      )}
                      <PeerAvatar
                        accountId={accountId}
                        peerId={conv.telegram_peer_id!}
                        name={conv.title || 'Unknown'}
                        className="w-12 h-12 rounded-full flex-shrink-0 text-lg"
                      />
                      <div className="flex-1 min-w-0 ml-3">
                        <h3 className="text-sm font-semibold truncate text-gray-900 dark:text-white">
                          {conv.title || 'Unknown'}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {conv.username ? `@${conv.username}` : (conv.type.charAt(0).toUpperCase() + conv.type.slice(1))}
                        </p>
                      </div>
                    </div>
                  );
                })}
                </>
              );
            })()}

            {/* Section 2: Global Search Results */}
            <div className="px-4 py-2 flex items-center justify-between text-[11px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50/50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5 mt-2">
              <span>{searchFilter === 'all' ? 'Global Search' : `${searchFilter.charAt(0).toUpperCase() + searchFilter.slice(1)}`}</span>
              {searchFilter !== 'all' && (
                <button 
                  onClick={() => setSearchFilter('all')}
                  className="text-blue-600 hover:text-blue-700 normal-case font-medium"
                >
                  Clear Filter
                </button>
              )}
            </div>

            {isSearching && searchResults.length === 0 ? (
              <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                Searching Telegram...
              </div>
            ) : (() => {
              const filteredGlobal = searchResults.filter(user => {
                // If it's an invite link (id 0), it's never a local duplicate by ID
                if (user.id === 0) return true;

                // Remove duplicates that are already in local matches
                const isAlreadyLocal = conversations.some(c => Number(c.telegram_peer_id) === Number(user.id));
                if (isAlreadyLocal) return false;

                if (searchFilter === 'all') return true;
                if (searchFilter === 'users') return user.type === 'user' || user.type === 'private';
                if (searchFilter === 'groups') return user.type === 'group' || user.type === 'supergroup';
                if (searchFilter === 'channels') return user.type === 'channel';
                return true;
              });

              if (filteredGlobal.length === 0) {
                return (
                  <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                    {searchQuery.trim() ? `No more ${searchFilter !== 'all' ? searchFilter : 'results'} for "${searchQuery}"` : 'Type to search'}
                  </div>
                );
              }

              return filteredGlobal.map((user) => {
                const displayName = user.title || user.username || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.phone || 'Unknown';
                const subtitle = user.username ? `@${user.username}` : user.title ? (user.type === 'channel' ? 'Channel' : 'Group') : user.phone || '';
                
                // Use invite_hash as key for id 0 to avoid React duplicate key warnings
                const resultKey = user.id === 0 ? `invite_${user.invite_hash}` : `peer_${user.id}`;

                return (
                  <div
                    key={resultKey}
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
                      <p className="text-xs text-blue-600 dark:text-blue-400 truncate">
                        {subtitle}
                      </p>
                    </div>
                    <div className="text-blue-600 dark:text-blue-400 pr-2 opacity-70">
                      {getResultIcon(user.type)}
                    </div>
                  </div>
                );
              });
            })()}

            {/* Section 3: Message Results (Only show on 'All' tab) */}
            {searchFilter === 'all' && messageResults.length > 0 && (
              <>
                <div className="px-4 py-2 text-[11px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50/50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5 mt-2">
                  Messages
                </div>
                {messageResults.map(msg => (
                  <div
                    key={msg.id}
                    onClick={() => {
                      const fullConv = conversations.find(c => c.id === msg.conversation_id);
                      if (fullConv) {
                        onConversationSelect(fullConv);
                      } else {
                        onConversationSelect({
                          id: msg.conversation_id,
                          title: msg.conversation_title,
                          type: msg.conversation_type as any,
                          telegram_account_id: msg.telegram_account_id
                        } as any);
                      }
                      setSearchQuery('');
                    }}
                    className="flex flex-col px-4 py-3 cursor-pointer hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark transition-colors border-b border-gray-50 dark:border-white/5"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400 truncate max-w-[70%]">
                        {msg.conversation_title}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {formatConvDate(msg.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-3 h-3 text-gray-400 shrink-0" />
                      <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed">
                        <span className="font-semibold">{msg.sender_name}:</span> {msg.text}
                      </p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : (
          /* Normal Conversations View */
          (() => {
            const filteredConversations = conversations.filter(conv => {
              if (optimisticDeletedIds.has(conv.id)) return false;
              if (searchFilter === 'all') return true;
              if (searchFilter === 'users') return conv.type === 'private';
              if (searchFilter === 'groups') return conv.type === 'group' || conv.type === 'supergroup';
              if (searchFilter === 'channels') return conv.type === 'channel';
              return true;
            });

            if (filteredConversations.length === 0) {
              return (
                <div className="p-10 text-center">
                  <MessageCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4 opacity-30" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                    {searchFilter === 'all' ? 'No conversations yet' : `No ${searchFilter} found`}
                  </p>
                </div>
              );
            }

            const sortedConversations = [...filteredConversations].sort((a, b) => {
              const aPinned = a.is_pinned ? 1 : 0;
              const bPinned = b.is_pinned ? 1 : 0;
              if (aPinned !== bPinned) return bPinned - aPinned;
              const aTime = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
              const bTime = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
              return bTime - aTime;
            });

            return sortedConversations.map((conversation) => {
              const isActive = currentConversation?.id === conversation.id;
              const unread = unreadCounts[conversation.id] || 0;
              const lastPreview = getLastMessagePreview(conversation);
              const isOutgoing = conversation.lastMessage?.is_outgoing;
              const displayName = conversation.title || conversation.username || 'Unknown';

              return (
                <div
                  key={conversation.id}
                  onClick={() => {
                    if (isSelectionMode) {
                      toggleSelect(conversation.id);
                    } else {
                      onConversationSelect(conversation);
                    }
                  }}
                  onContextMenu={(e) => {
                    if (isSelectionMode) return;
                    e.preventDefault();
                    const menuHeight = 145; // Adjusted for Pin option
                    const menuWidth = 208;  // w-52 is 13rem = 208px
                    
                    let y = e.clientY;
                    let x = e.clientX;
                    
                    // Adjust position if it overflows the bottom of the screen
                    if (y + menuHeight > window.innerHeight) {
                      y = window.innerHeight - menuHeight - 10; // 10px spacing buffer
                    }
                    
                    // Adjust position if it overflows the right edge of the screen
                    if (x + menuWidth > window.innerWidth) {
                      x = window.innerWidth - menuWidth - 10;
                    }
                    
                    setContextMenu({ conversation, x, y });
                  }}
                  className={`flex items-center px-3 py-2.5 cursor-pointer transition-all duration-200 group border-l-4 ${isActive
                    ? 'bg-blue-600 border-l-blue-600 shadow-inner'
                    : conversation.is_pinned
                      ? 'bg-gray-50/70 dark:bg-white/[0.04] border-l-blue-500 hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark'
                      : 'border-l-transparent hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark'
                    }`}
                >
                  {isSelectionMode && (
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(conversation.id);
                      }}
                      className="pr-2 pl-1 flex-shrink-0"
                    >
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                        selectedIds.has(conversation.id)
                          ? 'bg-blue-600 border-blue-600 text-white scale-110'
                          : 'border-gray-300 dark:border-white/20 bg-transparent'
                      }`}>
                        {selectedIds.has(conversation.id) && (
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  )}
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
                      <h3 className={`text-sm font-semibold truncate flex items-center gap-1 ${isActive ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                        {conversation.type === 'secret' && <Lock className={`w-3 h-3 ${isActive ? 'text-blue-100' : 'text-green-500'}`} />}
                        {conversation.username && (!conversation.title || conversation.title.startsWith('+'))
                          ? `@${conversation.username}`
                          : (conversation.title || 'Unknown')}
                      </h3>
                      <div className="flex items-center space-x-1 ml-2 flex-shrink-0 relative">
                        {isOutgoing && (
                          <div className="flex items-center mr-1">
                            <svg className={`${conversation.lastMessage?.is_read ? 'text-blue-400' : (isActive ? 'text-blue-100' : 'text-gray-400')} w-3 h-3 transition-colors duration-300`} fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            {conversation.lastMessage?.is_read && (
                              <svg className="w-3 h-3 text-blue-400 -ml-1 transition-colors duration-300" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                        )}
                        {conversation.is_pinned && (
                          <Pin className={`w-3.5 h-3.5 rotate-45 ${isActive ? 'text-blue-100' : 'text-blue-500'}`} />
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
                        <span className={`ml-2 flex-shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black text-white ${isActive ? 'bg-white/30' : conversation.is_muted ? 'bg-gray-400 dark:bg-gray-500' : 'bg-blue-600'}`}>
                          {unread}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            });
          })()
        )}
      </div>

      {/* Context Menu (Right Click) */}
      {contextMenu && (
        <div
          className="fixed z-[200] w-52 bg-white dark:bg-[#232323] border border-gray-100 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Pin/Unpin */}
          <button
            onClick={async () => {
              const conv = contextMenu.conversation;
              try {
                await telegramAPI.togglePinConversation(conv.id);
                if (onConversationCreated) {
                  await onConversationCreated();
                }
              } catch (e) {
                console.error("Pin toggle failed:", e);
              }
              setContextMenu(null);
            }}
            className="w-full px-4 py-2.5 flex items-center space-x-3 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            <Pin className="w-[18px] h-[18px] text-gray-500 rotate-45" />
            <span className="text-[15px]">{contextMenu.conversation.is_pinned ? 'Unpin from top' : 'Pin to top'}</span>
          </button>

          <div className="mx-3 border-b border-gray-100 dark:border-white/5" />

          {/* Mute/Unmute */}
          <button
            onClick={async () => {
              const conv = contextMenu.conversation;
              try {
                await telegramAPI.toggleMute(conv.id);
                if (onConversationCreated) {
                  await onConversationCreated();
                }
              } catch (e) {
                console.error("Mute toggle failed:", e);
              }
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



      {/* Modern Bulk Deletion Modal */}
      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[0.5px] animate-fade-in">
          <div className="bg-white dark:bg-[#212121] rounded-2xl shadow-xl w-full max-w-[320px] overflow-hidden animate-scale-in border border-gray-100 dark:border-white/5">
            <div className="p-6">
              <h3 className="text-[18px] font-medium text-gray-900 dark:text-white mb-2.5">
                Delete {selectedIds.size} {selectedIds.size === 1 ? 'chat' : 'chats'}?
              </h3>
              <p className="text-[#707579] dark:text-[#aaaaaa] text-[14.5px] leading-relaxed mb-6">
                Are you sure you want to delete and leave {selectedIds.size === 1 ? 'this chat' : 'these chats'}? All message history will be lost.
              </p>

              <div className="flex items-center justify-end space-x-1 mt-2">
                <button
                  onClick={() => setBulkDeleteModalOpen(false)}
                  className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-bold rounded-lg transition-colors uppercase text-sm tracking-wide bg-transparent border-0 outline-none"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      const idsToDelete = Array.from(selectedIds);
                      
                      // Optimistically hide them immediately
                      setOptimisticDeletedIds(prev => {
                        const next = new Set(prev);
                        idsToDelete.forEach(id => next.add(id));
                        return next;
                      });

                      setSelectedIds(new Set());
                      setIsSelectionMode(false);
                      setBulkDeleteModalOpen(false);

                      // Run the deletion in background
                      telegramAPI.bulkDeleteConversations(idsToDelete).catch(e => {
                        console.error("Bulk deletion failed:", e);
                        // Revert optimistic delete if it failed
                        setOptimisticDeletedIds(prev => {
                          const next = new Set(prev);
                          idsToDelete.forEach(id => next.delete(id));
                          return next;
                        });
                      });
                    } catch (e) {
                      console.error("Bulk deletion click error:", e);
                    }
                  }}
                  className="px-4 py-2 text-[#e53935] hover:bg-[#e53935]/10 font-bold rounded-lg transition-colors uppercase text-sm tracking-wide bg-transparent border-0 outline-none"
                >
                  Delete All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modern Deletion Modal (Same template as single message delete) */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[0.5px] animate-fade-in">
          <div className="bg-white dark:bg-[#212121] rounded-2xl shadow-xl w-full max-w-[320px] overflow-hidden animate-scale-in border border-gray-100 dark:border-white/5">
            <div className="p-6">
              {(() => {
                const chatToDelete = conversations.find(c => c.id === deleteModal.conversationId);
                const isGroup = chatToDelete?.type === 'group' || chatToDelete?.type === 'supergroup';
                const isChannel = chatToDelete?.type === 'channel';

                let title = 'Delete Chat?';
                let message = 'Are you sure you want to delete this chat? All message history will be lost.';
                let confirmText = 'Delete';

                if (isGroup) {
                  title = 'Leave Group?';
                  message = 'Are you sure you want to leave this group? You will no longer receive messages from it.';
                  confirmText = 'Leave';
                } else if (isChannel) {
                  title = 'Leave Channel?';
                  message = 'Are you sure you want to leave this channel? You will no longer receive updates.';
                  confirmText = 'Leave';
                }

                return (
                  <>
                    <h3 className="text-[18px] font-medium text-gray-900 dark:text-white mb-2.5">
                      {title}
                    </h3>
                    <p className="text-[#707579] dark:text-[#aaaaaa] text-[14.5px] leading-relaxed mb-6">
                      {message}
                    </p>

                    <div className="flex items-center justify-end space-x-1 mt-2">
                      <button
                        onClick={() => setDeleteModal({ isOpen: false, conversationId: null })}
                        className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-bold rounded-lg transition-colors uppercase text-sm tracking-wide bg-transparent border-0 outline-none"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          const id = deleteModal.conversationId;
                          if (id) {
                            // Optimistically hide immediately
                            setOptimisticDeletedIds(prev => {
                              const next = new Set(prev);
                              next.add(id);
                              return next;
                            });
                            if (onDeleteConversation) {
                              onDeleteConversation(id);
                            }
                          }
                          setDeleteModal({ isOpen: false, conversationId: null });
                        }}
                        className="px-4 py-2 text-[#e53935] hover:bg-[#e53935]/10 font-bold rounded-lg transition-colors uppercase text-sm tracking-wide bg-transparent border-0 outline-none"
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
