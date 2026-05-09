import React, { useState, useEffect } from 'react';
import { Search, MessageSquare, ChevronLeft, Loader2, UserPlus } from 'lucide-react';
import type { InstagramChat } from '../../types';
import { format } from 'date-fns';
import { instagramChatAPI } from '../../services/api';

interface Props {
  conversations: InstagramChat[];
  currentConversation: InstagramChat | null;
  onConversationSelect: (conv: InstagramChat) => void;
  onBack: () => void;
  accountId: number;
}

export default function InstagramConversationList({
  conversations,
  currentConversation,
  onConversationSelect,
  onBack,
  accountId
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      if (searchQuery.length >= 3) {
        setIsSearching(true);
        try {
          const results = await instagramChatAPI.searchUsers(accountId, searchQuery);
          setSearchResults(results);
        } catch (e) {
          console.error('Search failed:', e);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, accountId]);

  const handleStartNewChat = async (username: string) => {
    try {
      const newThread = await instagramChatAPI.createThread(accountId, username);
      onConversationSelect(newThread);
      setSearchQuery('');
    } catch (e) {
      console.error('Failed to create thread:', e);
      alert('Failed to start chat with @' + username);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#17212b]">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-white/5 flex items-center space-x-3">
        <button 
          onClick={onBack}
          className="xl:hidden p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">Instagram DMs</h2>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Active Account</p>
        </div>
      </div>

      {/* Search */}
      <div className="p-3">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
          <input
            type="text"
            placeholder="Search users or chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-100 dark:bg-white/5 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 transition-all"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {searchQuery.length >= 3 ? (
          <div className="px-2 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-3 mb-2">Search Results</p>
            {searchResults.length === 0 && !isSearching ? (
              <div className="p-8 text-center text-gray-400">
                <p className="text-sm">No users found for "{searchQuery}"</p>
              </div>
            ) : (
              searchResults.map((user) => (
                <div
                  key={user.id}
                  onClick={() => handleStartNewChat(user.username)}
                  className="flex items-center p-3 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5 transition-all group"
                >
                  <img src={user.photo_url} alt="" className="w-10 h-10 rounded-full border border-gray-100 dark:border-white/10" />
                  <div className="ml-3 flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{user.username}</p>
                    <p className="text-xs text-gray-500 truncate">{user.full_name}</p>
                  </div>
                  <UserPlus className="w-4 h-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              ))
            )}
          </div>
        ) : (
          <>
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full opacity-30 px-8 text-center">
                <MessageSquare className="w-12 h-12 mb-4" />
                <p className="text-sm font-bold">No messages found</p>
                <p className="text-xs mt-1">Search for a user above to start a new chat.</p>
              </div>
            ) : (
              <div className="space-y-0.5 px-2">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => onConversationSelect(conv)}
                    className={`flex items-center p-3 rounded-xl cursor-pointer transition-all duration-200 group ${
                      currentConversation?.id === conv.id
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                        : 'hover:bg-gray-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="relative">
                      {conv.photo_url ? (
                        <img 
                          src={conv.photo_url} 
                          alt={conv.title} 
                          className="w-12 h-12 rounded-full object-cover border-2 border-white/10"
                        />
                      ) : (
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
                          currentConversation?.id === conv.id ? 'bg-white/20' : 'bg-blue-500/10 text-blue-500'
                        }`}>
                          {conv.title.charAt(0)}
                        </div>
                      )}
                      {conv.unread_count > 0 && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white dark:border-[#17212b]">
                          {conv.unread_count}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 ml-3">
                      <div className="flex justify-between items-start">
                        <h3 className={`font-bold text-sm truncate ${currentConversation?.id === conv.id ? 'text-white' : ''}`}>
                          {conv.title}
                        </h3>
                        {conv.last_message && (
                          <span className={`text-[10px] ${currentConversation?.id === conv.id ? 'text-white/70' : 'text-gray-400'}`}>
                            {format(new Date(conv.last_message.created_at), 'HH:mm')}
                          </span>
                        )}
                      </div>
                      <p className={`text-xs truncate mt-0.5 ${
                        currentConversation?.id === conv.id ? 'text-white/80' : 'text-gray-500'
                      }`}>
                        {conv.last_message?.is_outgoing ? 'You: ' : ''}
                        {conv.last_message?.text || 'No messages yet'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
