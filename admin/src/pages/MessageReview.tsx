/**
 * --- ADMIN MESSAGE REVIEW PAGE ---
 * 
 * Allows administrators to monitor all conversations across all colleagues.
 * Features:
 * 1. Multi-level filtering: Colleague -> Telegram Account -> Conversation
 * 2. Live WebSocket streaming: New messages appear automatically
 * 3. Media processing: Unified download and rendering for images/videos/files
 * 4. Audit Trail: Distinguishes between manual sends and Auto-Replies
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';
import { Search, Filter, ArrowLeft, MessageSquare, Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import { adminApi } from '../services/api';
import { Message, Conversation, ColleagueWithAccounts } from '../types';

// --- COMPONENT: IMAGE MESSAGE ---
// Handles lazy loading and rendering of image media in the audit trail.
const ImageMessage: React.FC<{
  message: Message;
  loadedMedia: Record<number, string>;
  loadMedia: (message: Message) => Promise<string | null>;
  isFromAccount: boolean;
  isMediaOnly?: boolean;
  isSticker?: boolean;
}> = ({ message, loadedMedia, loadMedia, isFromAccount, isMediaOnly, isSticker }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(loadedMedia[message.id] || null);
  const [loading, setLoading] = useState(!loadedMedia[message.id]);
  const [error, setError] = useState(false);

  // Load the image binary when the component enters the viewport or the message changes
  useEffect(() => {
    const hasMedia = message.media_file_name || ['photo', 'video', 'voice', 'document', 'sticker'].includes(message.type);
    if (!loadedMedia[message.id] && hasMedia) {
      setLoading(true);
      loadMedia(message)
        .then(url => {
          setImageUrl(url);
          setLoading(false);
        })
        .catch(() => {
          setError(true);
          setLoading(false);
        });
    }
  }, [message, loadedMedia, loadMedia]);

  // Loading Placeholder
  if (loading) {
    return (
      <div className="mb-2 rounded-lg overflow-hidden bg-gray-100 max-w-xs">
        <div className="aspect-video flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-2"></div>
            <p className="text-xs text-gray-500">Loading image...</p>
          </div>
        </div>
      </div>
    );
  }

  // Handle deleted/expired media from Telegram servers
  if (imageUrl === 'DELETED') {
    return (
      <div className="mb-2 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center space-x-2">
        <ImageIcon className="w-5 h-5 text-red-400" />
        <div>
          <p className="text-sm font-medium text-red-600">📷 Photo</p>
          <p className="text-xs text-red-500">Media has been deleted</p>
        </div>
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      <div className={`mb-2 text-xs ${isFromAccount ? 'text-blue-100' : 'text-gray-500'}`}>
        📎 {message.media_file_name || 'Image attachment'}
      </div>
    );
  }

  return (
    <div
      className={`relative group cursor-pointer ${isSticker ? 'max-w-[160px]' : isMediaOnly ? 'w-full' : '-mx-3.5 -mt-2 mb-2'}`}
      onClick={() => window.open(imageUrl, '_blank')}
    >
      <img
        src={imageUrl}
        alt={message.media_file_name || 'Photo'}
        className={`w-full h-auto max-h-[500px] bg-gray-100 ${isSticker ? '' : 'object-contain'} ${isMediaOnly ? 'rounded-2xl' : 'rounded-t-2xl'}`}
      />
      {/* Download Hover Overlay */}
      {!isSticker && (
        <div className={`absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200 flex items-center justify-center ${isMediaOnly ? 'rounded-2xl' : 'rounded-t-2xl'}`}>
          <div className="opacity-0 group-hover:opacity-100 bg-black/40 text-white rounded-full p-2 transition-opacity duration-200">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};

// Video Message Component
const VideoMessage: React.FC<{
  message: Message;
  loadedMedia: Record<number, string>;
  loadMedia: (message: Message) => Promise<string | null>;
  isFromAccount: boolean;
  isMediaOnly?: boolean;
}> = ({ message, loadedMedia, loadMedia, isFromAccount, isMediaOnly }) => {
  const [videoUrl, setVideoUrl] = useState<string | null>(loadedMedia[message.id] || null);
  const [loading, setLoading] = useState(!loadedMedia[message.id]);
  const [error, setError] = useState(false);

  useEffect(() => {
    const hasMedia = message.media_file_name || ['photo', 'video', 'voice', 'document', 'sticker'].includes(message.type);
    if (!loadedMedia[message.id] && hasMedia) {
      setLoading(true);
      loadMedia(message)
        .then(url => {
          setVideoUrl(url);
          setLoading(false);
        })
        .catch(() => {
          setError(true);
          setLoading(false);
        });
    }
  }, [message, loadedMedia, loadMedia]);

  if (loading) {
    return (
      <div className="mb-2 rounded-lg overflow-hidden bg-gray-100 max-w-xs">
        <div className="aspect-video flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-2"></div>
            <p className="text-xs text-gray-500">Loading video...</p>
          </div>
        </div>
      </div>
    );
  }

  if (videoUrl === 'DELETED') {
    return (
      <div className="mb-2 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center space-x-2">
        <VideoIcon className="w-5 h-5 text-red-400" />
        <div>
          <p className="text-sm font-medium text-red-600">🎥 Video</p>
          <p className="text-xs text-red-500">Media has been deleted</p>
        </div>
      </div>
    );
  }

  if (error || !videoUrl) {
    return (
      <div className={`mb-2 text-xs ${isFromAccount ? 'text-blue-100' : 'text-gray-500'}`}>
        📎 {message.media_file_name || 'Video attachment'}
      </div>
    );
  }

  return (
    <div className={`relative group overflow-hidden bg-black ${isMediaOnly ? 'rounded-2xl w-full' : '-mx-3.5 -mt-2 mb-2 rounded-t-2xl'}`}>
      <video
        src={videoUrl}
        controls
        autoPlay
        loop
        className="w-full h-auto max-h-[500px]"
        poster={message.media_file_name ? undefined : undefined}
      />
    </div>
  );
};

const MessageReview = () => {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [colleagues, setColleagues] = useState<ColleagueWithAccounts[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(
    userId ? parseInt(userId) : null
  );
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadedMedia, setLoadedMedia] = useState<Record<number, string>>({});
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const selectedConvRef = useRef<number | null>(null);
  const MESSAGES_PER_PAGE = 10;

  useEffect(() => {
    const fetchColleagues = async () => {
      try {
        const response = await adminApi.getColleagues();
        setColleagues(response.data);
      } catch (error) {
        console.error('Failed to fetch colleagues:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchColleagues();
  }, []);

  useEffect(() => {
    setConversations([]);
    setSelectedConversationId(null);
    setMessages([]);
    fetchConversations();
  }, [selectedUserId, selectedAccountId]);

  useEffect(() => {
    if (selectedConversationId) {
      setMessages([]);
      setHasMore(true);
      fetchMessages(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId]);

  // Scroll to bottom when messages first load or conversation changes
  useEffect(() => {
    if (messagesContainerRef.current && messages.length > 0 && !loadingMore) {
      const container = messagesContainerRef.current;
      // Force scroll to bottom on initial load of a conversation
      container.scrollTop = container.scrollHeight;

      // Secondary check for slow-loading content
      const timer = setTimeout(() => {
        if (container) container.scrollTop = container.scrollHeight;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedConversationId, messages.length === MESSAGES_PER_PAGE]); // Trigger on initial load


  // --- FETCH: CONVERSATIONS ---
  // Retrieves the list of chats based on selected colleague and/or account.
  const fetchConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const params: { user_id?: number; account_id?: number } = {};
      if (selectedUserId) params.user_id = selectedUserId;
      if (selectedAccountId) params.account_id = selectedAccountId;

      const response = await adminApi.getConversations(params);
      setConversations(response.data);
    } catch (error) {
      console.error('Final conversations fetch failed:', error);
      setConversations([]);
    } finally {
      setLoadingConversations(false);
    }
  }, [selectedUserId, selectedAccountId]);

  const fetchMessages = async (reset = false) => {
    if (!selectedConversationId || (!reset && !hasMore) || loadingMore) return;

    try {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const params: { limit: number; offset: number; conversation_id?: number } = {
        limit: MESSAGES_PER_PAGE,
        offset: reset ? 0 : messages.length,
      };
      if (selectedConversationId) params.conversation_id = selectedConversationId;

      const response = await adminApi.getMessages(params);
      const newMessages = response.data;

      // API returns messages sorted by created_at ASC (oldest first)
      // Display as-is: oldest at top, newest at bottom
      if (reset) {
        setMessages(newMessages);
      } else {
        // Prepend older messages when loading more, filter out duplicates
        setMessages(prev => {
          const existingIds = new Set(prev.map((m: Message) => m.id));
          const uniqueNewMessages = newMessages.filter((m: Message) => !existingIds.has(m.id));
          return [...uniqueNewMessages, ...prev];
        });
      }

      setHasMore(newMessages.length === MESSAGES_PER_PAGE);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current || loadingMore || !hasMore) return;

    const { scrollTop } = messagesContainerRef.current;

    // Load more when scrolled to top (to get older messages)
    if (scrollTop === 0) {
      const prevScrollHeight = messagesContainerRef.current.scrollHeight;
      fetchMessages(false);
      // Maintain scroll position after loading older messages
      setTimeout(() => {
        if (messagesContainerRef.current) {
          const newScrollHeight = messagesContainerRef.current.scrollHeight;
          messagesContainerRef.current.scrollTop = newScrollHeight - prevScrollHeight;
        }
      }, 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, hasMore, messages.length]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  useEffect(() => {
    selectedConvRef.current = selectedConversationId;
  }, [selectedConversationId]);

  // --- WEBSOCKET: REAL-TIME AUDIT STREAM ---
  // Establishes a permanent connection to listen for new messages across ALL accounts.
  useEffect(() => {
    const adminToken = Cookies.get('admin_token');
    if (!adminToken) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${adminToken}`;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log('Admin stream established');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle incoming messages for the selected view
        if (data.type === 'new_message') {
          const newMessage = data.message;
          const currentSelectedId = selectedConvRef.current;

          // Push the conversation to the top of the sidebar list
          setConversations(prev => {
            const index = prev.findIndex(c => c.id === newMessage.conversation_id);
            if (index !== -1) {
              const updated = [...prev];
              updated[index] = { ...updated[index], last_message_at: newMessage.created_at };
              const item = updated.splice(index, 1)[0];
              return [item, ...updated];
            }
            return prev;
          });

          // If the user is currently watching THIS conversation, append the message
          if (newMessage.conversation_id === currentSelectedId) {
            setMessages(prev => {
              if (prev.some(m => m.id === newMessage.id || m.telegram_message_id === newMessage.telegram_message_id)) return prev;
              const updated = [...prev, newMessage];

              // Auto-scroll to bottom if the viewer is already near the bottom
              setTimeout(() => {
                if (messagesContainerRef.current) {
                  const container = messagesContainerRef.current;
                  const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 250;
                  if (isNearBottom || isMessageFromAccount(newMessage)) {
                    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                  }
                }
              }, 50);
              return updated;
            });
          }
        }

        // Handle deletions (sync UI with background events)
        else if (data.type === 'messages_deleted') {
          const { conversation_id, message_ids } = data;
          if (conversation_id === selectedConvRef.current) {
            setMessages(prev => prev.filter(m => !message_ids.includes(m.id)));
          }
        } else if (data.type === 'conversation_deleted') {
          const { conversation_id } = data;
          setConversations(prev => prev.filter(c => c.id !== conversation_id));
          if (conversation_id === selectedConvRef.current) {
            setSelectedConversationId(null);
            setMessages([]);
          }
        } else if (data.type === 'account_deleted') {
          const { account_id } = data;
          setColleagues(prev => prev.map(colleague => ({
            ...colleague,
            accounts: colleague.accounts.filter(acc => acc.id !== account_id)
          })));

          if (selectedAccountId === account_id) {
            setSelectedAccountId(null);
            setConversations([]);
            setMessages([]);
          }
        }
      } catch (err) {
        console.error('Admin WS parse error:', err);
      }
    };

    socket.onclose = () => {
      console.log('Admin stream closed');
    };

    return () => {
      socket.close();
    };
  }, []);

  const selectedColleague = colleagues.find((c) => c.id === selectedUserId);
  const accounts = selectedColleague?.accounts || [];
  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);

  // Load media (image/video) for a message
  const loadMedia = async (message: Message): Promise<string | null> => {
    if (loadedMedia[message.id]) {
      return loadedMedia[message.id];
    }

    try {
      const adminToken = Cookies.get('admin_token');
      const response = await fetch(
        `/api/admin/download-media/${message.conversation_id}/${message.id}?telegram_message_id=${message.telegram_message_id}`,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
          },
        }
      );

      if (response.status === 410) {
        setLoadedMedia(prev => ({ ...prev, [message.id]: 'DELETED' }));
        return 'DELETED';
      }

      if (!response.ok) {
        throw new Error('Failed to load media');
      }

      const blob = await response.blob();
      const mediaUrl = window.URL.createObjectURL(blob);

      setLoadedMedia(prev => ({ ...prev, [message.id]: mediaUrl }));

      return mediaUrl;
    } catch (error) {
      console.error('Failed to load media:', error);
      return null;
    }
  };

  // Determine if message is from the account owner (should show on right)
  const isMessageFromAccount = (message: Message) => {
    // Compare message sender_user_id with the Telegram account owner's ID
    // If they match, the message was sent by the account owner (show on right)
    if (selectedConversation?.account_telegram_user_id && message.sender_user_id) {
      return message.sender_user_id === selectedConversation.account_telegram_user_id;
    }
    // Fallback to is_outgoing if account_telegram_user_id is not available
    return message.is_outgoing;
  };

  const filteredMessages = messages.filter((msg) => {
    const term = searchTerm.toLowerCase();
    return (
      (msg.original_text?.toLowerCase().includes(term) ?? false) ||
      (msg.translated_text?.toLowerCase().includes(term) ?? false) ||
      (msg.sender_name?.toLowerCase().includes(term) ?? false) ||
      (msg.sender_username?.toLowerCase().includes(term) ?? false)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center mb-6">
        {userId && (
          <button
            onClick={() => navigate('/messages')}
            className="mr-4 p-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-2xl font-bold text-gray-900">Message Review</h1>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex items-center mb-3">
          <Filter className="w-4 h-4 text-gray-500 mr-2" />
          <h2 className="text-md font-semibold text-gray-900">Filters</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Colleague
            </label>
            <select
              value={selectedUserId || ''}
              onChange={(e) => {
                const value = e.target.value ? parseInt(e.target.value) : null;
                setSelectedUserId(value);
                setSelectedAccountId(null);
                setSelectedConversationId(null);
                setConversations([]);
                setMessages([]);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Colleagues</option>
              {colleagues.map((colleague) => (
                <option key={colleague.id} value={colleague.id}>
                  {colleague.username} ({colleague.accounts.length} accounts)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Telegram Account
            </label>
            <select
              value={selectedAccountId || ''}
              onChange={(e) => {
                const value = e.target.value ? parseInt(e.target.value) : null;
                setSelectedAccountId(value);
                setSelectedConversationId(null);
                setConversations([]);
                setMessages([]);
              }}
              disabled={!selectedUserId}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
            >
              <option value="">All Accounts</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.display_name} ({account.account_name})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Conversation
            </label>
            <select
              value={selectedConversationId || ''}
              onChange={(e) => {
                const value = e.target.value ? parseInt(e.target.value) : null;
                setSelectedConversationId(value);
              }}
              disabled={loadingConversations || conversations.length === 0}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
            >
              <option value="">
                {loadingConversations ? 'Loading conversations...' : conversations.length === 0 ? 'No conversations found' : 'Select Conversation'}
              </option>
              {conversations.map((conv) => (
                <option key={conv.id} value={conv.id}>
                  {conv.account_name ? `${conv.account_name} ↔ ${conv.title}` : `${conv.title} (${conv.type})`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Search */}
      {selectedConversationId && (
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search messages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      )}

      {/* Messages */}
      {selectedConversationId ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden h-[calc(100vh-420px)] min-h-[400px]">
          <div
            ref={messagesContainerRef}
            className="flex-1 p-4 space-y-3 overflow-y-auto bg-gray-50"
          >
            {loadingMore && (
              <div className="flex justify-center py-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              </div>
            )}
            {filteredMessages.length > 0 ? (
              filteredMessages.map((message) => {
                const isFromAccount = isMessageFromAccount(message);
                const hasMedia = !!(message.media_file_name || ['photo', 'video', 'voice', 'document', 'sticker'].includes(message.type));
                const isSticker = message.type === 'sticker';
                const hasText = !!(message.original_text || message.translated_text);
                const isMediaOnly = hasMedia && !hasText && !isSticker;

                return (
                  <div
                    key={message.id}
                    className={`flex ${isFromAccount ? 'justify-end' : 'justify-start'} mb-2`}
                  >
                    <div className={`max-w-[85%] ${isFromAccount ? 'ml-12' : 'mr-12'}`}>
                      {/* Sender info for incoming messages */}
                      {!isFromAccount && (
                        <div className="flex items-center space-x-2 mb-1 px-1">
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                              {message.sender_name || message.sender_username || selectedConversation?.title || 'Unknown'}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Message bubble */}
                      <div
                        className={`shadow-sm transition-all duration-200 ${isSticker
                          ? ''
                          : isFromAccount
                            ? 'bg-blue-600 text-white rounded-2xl rounded-tr-none'
                            : 'bg-white text-gray-900 rounded-2xl rounded-tl-none border border-gray-100'
                          } ${isMediaOnly ? 'p-0 overflow-hidden' : isSticker ? 'p-0' : 'px-3.5 py-2'}`}
                      >
                        {/* Auto-reply badge */}
                        {message.type === 'auto_reply' && (
                          <div className={`flex items-center space-x-1 mb-1 pb-1 border-b ${isFromAccount ? 'border-white/10' : 'border-gray-100'
                            }`}>
                            <span className="text-[10px] font-bold text-yellow-500 flex items-center italic">
                              <span className="mr-1">⚡</span> AUTO-REPLY
                            </span>
                          </div>
                        )}

                        {/* Media preview */}
                        {(message.media_file_name || ['photo', 'video', 'voice', 'document', 'sticker'].includes(message.type)) && (() => {
                          const fileName = (message.media_file_name || '').toLowerCase();
                          const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(fileName) || message.type === 'photo' || message.type === 'sticker';
                          const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(fileName) || message.type === 'video';
                          const isAudio = /\.(mp3|wav|ogg|m4a)$/i.test(fileName) || message.type === 'voice';

                          if (isImage) {
                            return (
                              <ImageMessage
                                message={message}
                                loadedMedia={loadedMedia}
                                loadMedia={loadMedia}
                                isFromAccount={isFromAccount}
                                isMediaOnly={isMediaOnly}
                                isSticker={isSticker}
                              />
                            );
                          } else if (isVideo) {
                            return (
                              <VideoMessage
                                message={message}
                                loadedMedia={loadedMedia}
                                loadMedia={loadMedia}
                                isFromAccount={isFromAccount}
                                isMediaOnly={isMediaOnly}
                              />
                            );
                          } else if (isAudio) {
                            return (
                              <div className={`mb-2 flex items-center space-x-2 px-3 py-2 rounded-lg ${isFromAccount ? 'bg-blue-700/50' : 'bg-gray-100'}`}>
                                <svg className={`w-5 h-5 ${isFromAccount ? 'text-blue-200' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                </svg>
                                <span className={`text-xs ${isFromAccount ? 'text-blue-100' : 'text-gray-600'}`}>
                                  🎤 Voice Note
                                </span>
                              </div>
                            );
                          } else {
                            return (
                              <div className={`mb-2 flex items-center space-x-2 px-3 py-2 rounded-lg ${isFromAccount ? 'bg-blue-700/50' : 'bg-gray-100'
                                }`}>
                                <svg className={`w-5 h-5 ${isFromAccount ? 'text-blue-200' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <span className={`text-xs ${isFromAccount ? 'text-blue-100' : 'text-gray-600'} truncate max-w-xs`}>
                                  📎 {message.media_file_name || 'Attachment'}
                                </span>
                              </div>
                            );
                          }
                        })()}

                        {/* Original text */}
                        {message.original_text && (
                          <div className="mb-1">
                            {message.source_language && (
                              <span className={`text-[10px] font-bold mr-1.5 ${isFromAccount ? 'text-blue-200' : 'text-blue-500'
                                }`}>
                                [{message.source_language.toUpperCase()}]
                              </span>
                            )}
                            <p className="text-[13px] leading-snug">{message.original_text}</p>
                          </div>
                        )}

                        {/* Translated text */}
                        {message.translated_text && message.translated_text !== message.original_text && (
                          <div className={`pt-1.5 mt-1.5 border-t ${isFromAccount ? 'border-white/10' : 'border-gray-100'
                            }`}>
                            {message.target_language && (
                              <span className={`text-[10px] font-bold mr-1.5 ${isFromAccount ? 'text-blue-200' : 'text-blue-500'
                                }`}>
                                [{message.target_language.toUpperCase()}]
                              </span>
                            )}
                            <p className="text-[13px] leading-snug italic opacity-90">{message.translated_text}</p>
                          </div>
                        )}

                        {/* Timestamp */}
                        <div className="flex items-center justify-end mt-1 space-x-1.5">
                          <p className={`text-[10px] ${isFromAccount ? 'text-blue-100' : 'text-gray-400'}`}>
                            {new Date(message.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                          {isFromAccount && (
                            <div className="flex items-center">
                              <svg className="w-2.5 h-2.5 text-blue-200 opacity-70" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 text-gray-500">
                No messages found
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">
            Select a colleague and conversation to view messages
          </p>
        </div>
      )}
    </div>
  );
};

export default MessageReview;
