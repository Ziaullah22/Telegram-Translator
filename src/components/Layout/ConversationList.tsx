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
      <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white">Conversations</h2>
            <button
              onClick={() => setShowSearchModal(true)}
              disabled={!isConnected}
              className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
              title="Search users"
            >
              <UserPlus className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center">
              <MessageCircle className="w-12 h-12 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">
                {isConnected ? 'No conversations yet' : 'Connect account to see conversations'}
              </p>
            </div>
          ) : (
            <div className="p-2">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => onConversationSelect(conversation)}
                  className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-colors mb-1 ${currentConversation?.id === conversation.id
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-gray-700 text-gray-200'
                    }`}
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${currentConversation?.id === conversation.id
                    ? 'bg-blue-500'
                    : 'bg-gray-600'
                    }`}>
                    <span className="text-sm font-medium">
                      {getConversationAvatar(conversation)}
                    </span>
                  </div>

                  {/* Conversation Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium truncate">
                        {conversation.title || conversation.username || 'Unknown'}
                      </h3>
                      {conversation.lastMessage && (
                        <span className="text-xs opacity-70">
                          {new Date(conversation.lastMessage.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-1">
                      <p className={`text-xs truncate ${currentConversation?.id === conversation.id ? 'text-blue-100' : 'text-gray-400'
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
                                {conversation.lastMessage.original_text && (
                                  <span className="ml-1 opacity-70"> - {conversation.lastMessage.original_text}</span>
                                )}
                              </span>
                            )}
                          </>
                        ) : (
                          'No messages yet'
                        )}
                      </p>
                      {unreadCounts[conversation.id] > 0 && (
                        <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[10px]">
                          {unreadCounts[conversation.id]}
                        </span>
                      )}
                      {conversation.participantCount && conversation.participantCount > 1 && (
                        <span className="text-xs opacity-50">
                          {conversation.participantCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Type Icon */}
                  <div className="opacity-50">
                    {getConversationIcon(conversation.type)}
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
