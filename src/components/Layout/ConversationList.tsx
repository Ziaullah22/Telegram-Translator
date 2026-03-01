import { MessageCircle, UserPlus } from 'lucide-react';
import { useState } from 'react';
import type { TelegramChat, TelegramUserSearchResult } from '../../types';
import { telegramAPI } from '../../services/api';
import SearchUsersModal from '../Modals/SearchUsersModal';

interface ConversationListProps {
  conversations: TelegramChat[];
  currentConversation: TelegramChat | null;
  onConversationSelect: (conversation: TelegramChat) => void;
  isConnected?: boolean;
  unreadCounts: Record<number, number>;
  accountId?: number;
  onConversationCreated?: () => Promise<void>;
}

// Generate a consistent teal/blue color for avatar initials like Telegram
const getAvatarColor = (name: string) => {
  const colors = [
    '#2b96c7', '#2caef4', '#45bfff', '#3d9be9',
    '#4caf7d', '#45bf8d', '#5bb3a8', '#72b5e5',
    '#e36f6f', '#e37c6f', '#e3a76f', '#e3bc6f',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

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
  isConnected = false,
  unreadCounts,
  accountId,
  onConversationCreated,
}: ConversationListProps) {
  const [showSearchModal, setShowSearchModal] = useState(false);

  const handleUserSelect = async (user: TelegramUserSearchResult) => {
    if (!accountId) return;
    try {
      const titleParts = [];
      if (user.first_name) titleParts.push(user.first_name);
      if (user.last_name) titleParts.push(user.last_name);
      const title = titleParts.length > 0 ? titleParts.join(' ') : user.username || 'Unknown';

      const conversation = await telegramAPI.createConversation(accountId, {
        telegram_peer_id: user.id,
        title,
        username: user.username,
        type: 'private',
      });

      if (onConversationCreated) await onConversationCreated();

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

  const getConversationAvatar = (conversation: TelegramChat) => {
    const name = conversation.title || conversation.username || '?';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.charAt(0).toUpperCase();
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
    return '💬 Message';
  };

  return (
    <>
      <div id="conversation-list" className="w-80 bg-telegram-side-list-light dark:bg-telegram-side-list-dark border-r border-gray-100 dark:border-white/5 flex flex-col transition-colors duration-300">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Conversations</h2>
          <button
            onClick={() => setShowSearchModal(true)}
            disabled={!isConnected}
            className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed transition-all duration-300 shadow-md shadow-blue-600/20"
            title="Search users"
          >
            <UserPlus className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Conversations List */}
        <div id="conversation-list-items" className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-10 text-center">
              <MessageCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4 opacity-50" />
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                {isConnected ? 'No conversations yet' : 'Connect account to see conversations'}
              </p>
            </div>
          ) : (
            conversations.map((conversation) => {
              const isActive = currentConversation?.id === conversation.id;
              const avatarLabel = getConversationAvatar(conversation);
              const avatarColor = getAvatarColor(conversation.title || conversation.username || '?');
              const unread = unreadCounts[conversation.id] || 0;
              const lastPreview = getLastMessagePreview(conversation);
              const isOutgoing = conversation.lastMessage?.is_outgoing;

              return (
                <div
                  key={conversation.id}
                  onClick={() => onConversationSelect(conversation)}
                  className={`flex items-center px-3 py-2.5 cursor-pointer transition-colors duration-150 ${isActive
                    ? 'bg-[#419FD9]'
                    : 'hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark'
                    }`}
                >
                  {/* Avatar */}
                  <div
                    className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white text-lg"
                    style={{ backgroundColor: isActive ? '#60b4e8' : avatarColor }}
                  >
                    {avatarLabel}
                  </div>

                  {/* Info */}
                  <div className={`flex-1 min-w-0 ml-3 py-1 ${isActive ? '' : 'border-b border-gray-100 dark:border-white/5'}`}>
                    <div className="flex items-center justify-between">
                      <h3 className={`text-sm font-semibold truncate ${isActive ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                        {conversation.title || conversation.username || 'Unknown'}
                      </h3>
                      <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                        {isOutgoing && (
                          <svg className={`w-3 h-3 ${isActive ? 'text-blue-200' : 'text-blue-400 dark:text-blue-400'}`} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                        {conversation.lastMessage && (
                          <span className={`text-[11px] ${isActive ? 'text-blue-200' : 'text-gray-400 dark:text-gray-500'}`}>
                            {formatConvDate(conversation.lastMessage.created_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-0.5">
                      <p className={`text-xs truncate ${isActive ? 'text-blue-100' : 'text-gray-500 dark:text-[#4da2d9]'}`}>
                        {lastPreview}
                      </p>
                      {unread > 0 && (
                        <span className={`ml-2 flex-shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold text-white ${isActive ? 'bg-white/30' : 'bg-[#40A7E3]'}`}>
                          {unread}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
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
