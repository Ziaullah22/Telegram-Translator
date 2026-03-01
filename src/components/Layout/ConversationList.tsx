import { MessageCircle, Users, Bot, UserPlus } from 'lucide-react';
import { useState } from 'react';
import type { TelegramChat, TelegramUserSearchResult } from '../../types';
import { telegramAPI } from '../../services/api';
import SearchUsersModal from '../Modals/SearchUsersModal';

interface ConversationListProps {
  conversations: TelegramChat[];
  currentConversation: TelegramChat | null;
  onConversationSelect: (conversation: TelegramChat) => void;
  isConnected?: boolean;
  unreadCounts: Record<number, number>; // conversationId -> count
  accountId?: number;
  onConversationCreated?: () => Promise<void>;
}

export default function ConversationList({
  conversations,
  currentConversation,
  onConversationSelect,
  isConnected = false,
  unreadCounts,
  accountId,
  onConversationCreated,
}: ConversationListProps) {
  const [showSearchModal, setShowSearchModal] = useState(false);

  const handleUserSelect = async (user: TelegramUserSearchResult) => {
    if (!accountId) return;

    try {
      // Build title from first_name and last_name
      const titleParts = [];
      if (user.first_name) titleParts.push(user.first_name);
      if (user.last_name) titleParts.push(user.last_name);
      const title = titleParts.length > 0 ? titleParts.join(' ') : user.username || 'Unknown';

      const conversation = await telegramAPI.createConversation(accountId, {
        telegram_peer_id: user.id,
        title: title,
        username: user.username,
        type: 'private',
      });

      // Notify parent to refresh conversations and wait for it
      if (onConversationCreated) {
        await onConversationCreated();
      }

      // Select the new conversation after reload
      onConversationSelect({
        id: conversation.id,
        title: conversation.title,
        username: user.username,
        type: 'private',
      } as TelegramChat);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };
  const getConversationIcon = (type: string) => {
    switch (type) {
      case 'private':
        return <MessageCircle className="w-5 h-5" />;
      case 'group':
      case 'supergroup':
        return <Users className="w-5 h-5" />;
      case 'channel':
        return <Bot className="w-5 h-5" />;
      default:
        return <MessageCircle className="w-5 h-5" />;
    }
  };

  const getConversationAvatar = (conversation: TelegramChat) => {
    if (conversation.title) {
      return conversation.title.charAt(0).toUpperCase();
    }
    if (conversation.username) {
      return conversation.username.charAt(0).toUpperCase();
    }
    return '?';
  };

  return (
    <>
      <div id="conversation-list" className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-colors duration-300">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Conversations</h2>
            <button
              onClick={() => setShowSearchModal(true)}
              disabled={!isConnected}
              className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed transition-all duration-300 shadow-md shadow-blue-600/20"
              title="Search users"
            >
              <UserPlus className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Conversations List */}
        <div id="conversation-list" className="flex-1 overflow-y-auto custom-scrollbar">
          {conversations.length === 0 ? (
            <div className="p-10 text-center">
              <MessageCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4 opacity-50" />
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                {isConnected ? 'No conversations yet' : 'Connect account to see conversations'}
              </p>
            </div>
          ) : (
            <div className="p-2">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => onConversationSelect(conversation)}
                  className={`flex items-center space-x-3 p-4 rounded-xl cursor-pointer transition-all duration-300 mb-2 border ${currentConversation?.id === conversation.id
                    ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20'
                    : 'bg-white dark:bg-transparent border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200 hover:shadow-sm'
                    }`}
                >
                  {/* Avatar */}
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shadow-sm ${currentConversation?.id === conversation.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-blue-600 dark:text-blue-400'
                    }`}>
                    <span className="uppercase">
                      {getConversationAvatar(conversation)}
                    </span>
                  </div>

                  {/* Conversation Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h3 className="text-sm font-bold truncate">
                        {conversation.title || conversation.username || 'Unknown'}
                      </h3>
                      {conversation.lastMessage && (
                        <span className={`text-[10px] font-medium opacity-70 ${currentConversation?.id === conversation.id ? 'text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                          {new Date(conversation.lastMessage.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <p className={`text-xs truncate font-medium ${currentConversation?.id === conversation.id ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                        {conversation.lastMessage ? (
                          <>
                            {conversation.lastMessage.is_outgoing && <span className="mr-1 opacity-70">You:</span>}
                            {conversation.lastMessage.type === 'text' ? (
                              conversation.lastMessage.translated_text || conversation.lastMessage.original_text
                            ) : (
                              <span className="italic flex items-center space-x-1">
                                <span>
                                  {conversation.lastMessage.type === 'photo' && '📷 Photo'}
                                  {conversation.lastMessage.type === 'video' && '📹 Video'}
                                  {conversation.lastMessage.type === 'voice' && '🎤 Voice'}
                                  {conversation.lastMessage.type === 'document' && '📄 Document'}
                                  {conversation.lastMessage.type === 'sticker' && '😀 Sticker'}
                                  {conversation.lastMessage.type === 'animation' && '🖼️ GIF'}
                                  {conversation.lastMessage.type === 'location' && '📍 Location'}
                                  {conversation.lastMessage.type === 'contact' && '👤 Contact'}
                                  {conversation.lastMessage.type === 'poll' && '📊 Poll'}
                                  {conversation.lastMessage.type === 'game' && '🎮 Game'}
                                  {conversation.lastMessage.type === 'venue' && '🏛️ Venue'}
                                  {conversation.lastMessage.type === 'invoice' && '💳 Invoice'}
                                  {conversation.lastMessage.type === 'giveaway' && '🎁 Giveaway'}
                                  {conversation.lastMessage.type === 'giveaway_winners' && '🏆 Giveaway Winners'}
                                  {conversation.lastMessage.type === 'story' && '📖 Story'}
                                  {conversation.lastMessage.type === 'unsupported' && '❓ Unsupported'}
                                  {!['photo', 'video', 'voice', 'document', 'sticker', 'animation', 'location', 'contact', 'poll', 'game', 'venue', 'invoice', 'giveaway', 'giveaway_winners', 'story', 'unsupported'].includes(conversation.lastMessage.type) && '💬 Message'}
                                </span>
                              </span>
                            )}
                          </>
                        ) : (
                          'No messages yet'
                        )}
                      </p>
                      <div className="flex items-center space-x-2 ml-2">
                        {unreadCounts[conversation.id] > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-black shadow-sm">
                            {unreadCounts[conversation.id]}
                          </span>
                        )}
                        <div className={`opacity-40 ${currentConversation?.id === conversation.id ? 'text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                          {getConversationIcon(conversation.type)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Search Modal */}
      <SearchUsersModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        accountId={accountId || 0}
        isConnected={isConnected}
        onUserSelect={handleUserSelect}
      />
    </>
  );
}
