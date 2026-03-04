import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Languages, Clock, FileText, Copy, User, Paperclip, X, Image as ImageIcon, Video, Download, Zap, Smile } from 'lucide-react';
import { templatesAPI, scheduledMessagesAPI } from '../../services/api';
import type { TelegramMessage, TelegramChat, TelegramAccount, MessageTemplate, ScheduledMessage } from '../../types';
import ScheduleMessageModal from '../Modals/ScheduleMessageModal';
import MessageTemplatesModal from '../Modals/MessageTemplatesModal';
import ContactInfoModal from '../Modals/ContactInfoModal';

// Helper to check if string contains only emojis
const isOnlyEmoji = (str: string) => {
  if (!str) return false;
  const cleanStr = str.replace(/\s/g, '');
  if (!cleanStr || cleanStr.length > 10) return false; // Limit length for big emoji

  // Basic emoji range check
  const emojiRegex = /^(\u2702|\u2705|\u2708|\u2709|\u270A-\u270D|\u270F|\u2712|\u2714|\u2716|\u271D|\u2721|\u2728|\u2733|\u2734|\u2744|\u2747|\u274C|\u274E|\u2753-\u2755|\u2757|\u2763|\u2764|\u2795-\u2797|\u27A1|\u27B0|\u27BF|\u2934|\u2935|\u2B05-\u2B07|\u2B1B|\u2B1C|\u2B50|\u2B55|\u3030|\u303D|\u3297|\u3299|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF]|\uD83D[\uDE00-\uDE4F]|\uD83D[\uDE80-\uDEFF]|\uD83E[\uDD00-\uDDFF])+$/u;
  return emojiRegex.test(cleanStr);
};

// Photo Message Component - displays images inline like Telegram
const PhotoMessage: React.FC<{
  message: TelegramMessage;
  loadedImages: Record<number, string>;
  loadImage: (message: TelegramMessage) => Promise<string | null>;
  onDownload: (message: TelegramMessage) => void;
  onImageLoad?: () => void;
}> = ({ message, loadedImages, loadImage, onDownload, onImageLoad }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(loadedImages[message.id] || null);
  const [loading, setLoading] = useState(!loadedImages[message.id]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!loadedImages[message.id] && !error) {
      setLoading(true);
      loadImage(message).then(url => {
        if (url) {
          setImageUrl(url);
        } else {
          setError(true);
        }
        setLoading(false);
      });
    }
  }, [message, loadedImages, loadImage, error]);

  if (loading) {
    return (
      <div className="mb-2">
        <div className="bg-gray-800/30 rounded-lg p-8 flex items-center justify-center min-w-[200px] min-h-[150px]">
          <div className="flex flex-col items-center space-y-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
            <p className="text-xs text-gray-400">Loading image...</p>
          </div>
        </div>
      </div>
    );
  }

  // Check if media was deleted
  if (imageUrl === 'DELETED') {
    return (
      <div className="mb-2">
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 flex items-center space-x-3">
          <ImageIcon className="w-8 h-8 text-red-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-300">📷 Photo</p>
            <p className="text-xs text-red-400">Media has been deleted</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      <div className="mb-2">
        <div
          className="bg-gray-800/50 rounded-lg p-4 flex items-center space-x-3 cursor-pointer hover:bg-gray-800/70 transition-colors"
          onClick={() => onDownload(message)}
        >
          <ImageIcon className="w-8 h-8 text-blue-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">📷 Photo</p>
            <p className="text-xs text-gray-400">Click to download</p>
          </div>
          <Download className="w-5 h-5 text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2">
      <div
        className="relative rounded-lg overflow-hidden cursor-pointer group max-w-md"
        onClick={() => onDownload(message)}
        title="Click to download"
      >
        <img
          src={imageUrl}
          alt={message.media_file_name || 'Photo'}
          className="w-full h-auto max-h-[400px] object-contain bg-gray-900/50"
          style={{ display: 'block' }}
          onLoad={() => onImageLoad?.()}
        />
        {/* Download overlay on hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center space-y-2">
            <Download className="w-10 h-10 text-white drop-shadow-lg" />
            <span className="text-white text-sm font-medium drop-shadow-lg">Download</span>
          </div>
        </div>
      </div>
      {message.media_file_name && (
        <p className="text-xs text-gray-400 mt-1 px-1">{message.media_file_name}</p>
      )}
    </div>
  );
};

// Video Message Component - displays videos inline like Telegram
const VideoMessage: React.FC<{
  message: TelegramMessage;
  loadedImages: Record<number, string>;
  loadImage: (message: TelegramMessage) => Promise<string | null>;
  onDownload: (message: TelegramMessage) => void;
  onImageLoad?: () => void;
}> = ({ message, loadedImages, loadImage, onDownload, onImageLoad }) => {
  const [videoUrl, setVideoUrl] = useState<string | null>(loadedImages[message.id] || null);
  const [loading, setLoading] = useState(!loadedImages[message.id]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!loadedImages[message.id] && !error) {
      setLoading(true);
      loadImage(message).then(url => {
        if (url) {
          setVideoUrl(url);
        } else {
          setError(true);
        }
        setLoading(false);
      });
    }
  }, [message, loadedImages, loadImage, error]);

  if (loading) {
    return (
      <div className="mb-2">
        <div className="bg-gray-800/30 rounded-lg p-8 flex items-center justify-center min-w-[200px] min-h-[150px]">
          <div className="flex flex-col items-center space-y-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
            <p className="text-xs text-gray-400">Loading video...</p>
          </div>
        </div>
      </div>
    );
  }

  // Check if media was deleted
  if (videoUrl === 'DELETED') {
    return (
      <div className="mb-2">
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 flex items-center space-x-3">
          <Video className="w-8 h-8 text-red-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-300">🎥 Video</p>
            <p className="text-xs text-red-400">Media has been deleted</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !videoUrl) {
    return (
      <div className="mb-2">
        <div
          className="bg-gray-800/50 rounded-lg p-4 flex items-center space-x-3 cursor-pointer hover:bg-gray-800/70 transition-colors"
          onClick={() => onDownload(message)}
        >
          <Video className="w-8 h-8 text-purple-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">🎥 Video</p>
            <p className="text-xs text-gray-400">Click to download</p>
          </div>
          <Download className="w-5 h-5 text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2">
      <div
        className="relative rounded-lg overflow-hidden max-w-md bg-gray-900/50"
      >
        <video
          src={videoUrl}
          controls
          autoPlay
          onLoadedData={() => onImageLoad?.()}
          loop
          muted
          playsInline
          className="w-full h-auto max-h-[400px] object-contain"
          style={{ display: 'block' }}
          preload="auto"
        >
          Your browser does not support the video tag.
        </video>
        {/* Download button overlay */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload(message);
          }}
          className="absolute top-2 right-2 p-2 bg-black/60 hover:bg-black/80 rounded-lg transition-colors"
          title="Download video"
        >
          <Download className="w-5 h-5 text-white" />
        </button>
      </div>
      {message.media_file_name && (
        <p className="text-xs text-gray-400 mt-1 px-1">{message.media_file_name}</p>
      )}
    </div>
  );
};

interface ChatWindowProps {
  messages: TelegramMessage[];
  currentConversation: TelegramChat | null;
  currentAccount: TelegramAccount | null;
  isConnected: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  onSendMessage: (text: string) => Promise<void>;
  onSendMedia: (file: File, caption: string) => Promise<void>;
  onJoinConversation?: (conversationId: number) => Promise<void>;
  onToggleMute?: (conversationId: number) => Promise<void>;
  conversationId?: number;
  hasMoreMessages?: boolean;
  onLoadMoreMessages?: () => Promise<void>;
}

export default function ChatWindow({
  messages,
  currentConversation,
  currentAccount,
  isConnected,
  sourceLanguage,
  targetLanguage,
  onSendMessage,
  onSendMedia,
  onJoinConversation,
  onToggleMute,
  conversationId,
  hasMoreMessages = false,
  onLoadMoreMessages,
}: ChatWindowProps) {
  const [newMessage, setNewMessage] = useState('');
  const [translating, setTranslating] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pickerPos, setPickerPos] = useState({ x: 0, y: 0 });
  const pickerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPickerPos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      dragStart.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    if (showEmojiPicker) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [showEmojiPicker]);

  const onDragStart = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const emojis = [
    { cat: 'Recent', items: ['❤️', '🔥', '👍', '😂', '😍', '✨', '🙏', '😊'] },
    { cat: 'Smileys', items: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '☺️', '😚', '😙', '😋', '😛', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😮‍💨', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🫣', '🤭', '🫢', '🫡', '🤫', '🫠', '🤥', '😶', '🫥', '😶‍🌫️', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '😵‍💫', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕'] },
    { cat: 'Gestures', items: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾'] }
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addEmoji = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
    // Keep focus on input if possible, but for simplicity just toggle for now
  };
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactSaveAlert, setContactSaveAlert] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [loadedImages, setLoadedImages] = useState<Record<number, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevScrollHeightRef = useRef<number>(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Helper to check if message has photo media
  const hasPhoto = (message: TelegramMessage) => {
    return message.type === 'photo' ||
      (message.type === 'auto_reply' && message.media_file_name?.match(/\.(jpg|jpeg|png|gif|webp)$/i));
  };

  // Helper to check if message has video media
  const hasVideo = (message: TelegramMessage) => {
    return message.type === 'video' ||
      (message.type === 'auto_reply' && message.media_file_name?.match(/\.(mp4|webm|mov|avi)$/i));
  };

  // Scroll detection for infinite scroll (load older messages on scroll to top)
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = async () => {
      if (container.scrollTop <= 10 && hasMoreMessages && !loadingMore && onLoadMoreMessages) {
        // Save scroll height before loading
        prevScrollHeightRef.current = container.scrollHeight;
        setLoadingMore(true);
        await onLoadMoreMessages();
        setLoadingMore(false);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMoreMessages, loadingMore, onLoadMoreMessages]);

  // After loading older messages, restore scroll position
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !loadingMore) return;
    // Restore position: new scrollHeight - old scrollHeight
    const newScrollHeight = container.scrollHeight;
    container.scrollTop = newScrollHeight - prevScrollHeightRef.current;
  });

  useEffect(() => {
    scrollToBottom();
  }, [messages.length > 0 && messages[messages.length - 1]?.id]);

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (conversationId) {
      loadScheduledMessages();
    } else {
      // Clear scheduled messages when no conversation is selected
      setScheduledMessages([]);
    }
  }, [conversationId]);

  // Reload scheduled messages when messages change (to detect system messages about sent/cancelled)
  useEffect(() => {
    if (conversationId && messages.length > 0) {
      // Check if any recent message is a system message about scheduled messages
      const recentMessages = messages.slice(-5); // Check last 5 messages
      const hasScheduledSystemMessage = recentMessages.some(msg =>
        msg.type === 'system' &&
        msg.original_text && (
          msg.original_text.includes('Scheduled message sent') ||
          msg.original_text.includes('Scheduled message cancelled') ||
          msg.original_text.includes('Scheduled message manually cancelled') ||
          msg.original_text.includes('Scheduled message set')
        )
      );

      if (hasScheduledSystemMessage) {
        // Add a small delay to ensure database is updated before reloading
        const timer = setTimeout(() => {
          loadScheduledMessages();
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [messages, conversationId]);

  const loadTemplates = async () => {
    try {
      const data = await templatesAPI.getTemplates();
      setTemplates(data);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  const loadScheduledMessages = async () => {
    if (!conversationId) return;
    try {
      const data = await scheduledMessagesAPI.getScheduledMessagesByConversation(conversationId);
      setScheduledMessages(data);
    } catch (err) {
      console.error('Failed to load scheduled messages:', err);
    }
  };

  const handleTemplateSelect = (template: MessageTemplate) => {
    setNewMessage(template.content);
    setShowTemplates(false);
  };

  const handleCancelScheduledMessage = async (messageId: number) => {
    if (!confirm('Cancel this scheduled message?')) return;
    try {
      await scheduledMessagesAPI.cancelScheduledMessage(messageId);
      // Remove from local state immediately for instant feedback
      setScheduledMessages(scheduledMessages.filter(m => m.id !== messageId));
      // The system message will be added via WebSocket and trigger a reload
    } catch (err) {
      console.error('Failed to cancel scheduled message:', err);
    }
  };

  const handleContactSaved = () => {
    setContactSaveAlert(true);
    setTimeout(() => setContactSaveAlert(false), 3000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      alert('File size must be less than 50MB');
      return;
    }

    setSelectedFile(file);

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendFile = async () => {
    if (!selectedFile || !currentConversation || !isConnected) return;

    setUploadingFile(true);
    try {
      await onSendMedia(selectedFile, newMessage);
      // Clear file and message
      handleRemoveFile();
      setNewMessage('');
    } catch (error) {
      // Error is handled in the callback
    } finally {
      setUploadingFile(false);
    }
  };

  const loadImage = async (message: TelegramMessage) => {
    // Return cached image if already loaded
    if (loadedImages[message.id]) {
      return loadedImages[message.id];
    }

    try {
      const token = document.cookie.split('auth_token=')[1]?.split(';')[0];
      const url = `http://localhost:8000/api/messages/download-media/${message.conversation_id}/${message.id}?telegram_message_id=${message.telegram_message_id}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      // Check if media was deleted (410 Gone)
      if (response.status === 410) {
        // Mark as deleted
        setLoadedImages(prev => ({ ...prev, [message.id]: 'DELETED' }));
        return 'DELETED';
      }

      if (!response.ok) {
        throw new Error('Failed to load media');
      }

      const blob = await response.blob();
      const imageUrl = window.URL.createObjectURL(blob);

      // Cache the loaded image
      setLoadedImages(prev => ({ ...prev, [message.id]: imageUrl }));

      return imageUrl;
    } catch (error) {
      console.error('Failed to load media:', error);
      return null;
    }
  };

  const handleDownloadMedia = async (message: TelegramMessage) => {
    try {
      const token = document.cookie.split('auth_token=')[1]?.split(';')[0];
      const url = `http://localhost:8000/api/messages/download-media/${message.conversation_id}/${message.id}?telegram_message_id=${message.telegram_message_id}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to download media');
      }

      // Get filename from Content-Disposition header or use stored filename
      const contentDisposition = response.headers.get('content-disposition');
      let filename = message.media_file_name || `media_${message.telegram_message_id}`;

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Create blob and download
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download media:', error);
      alert('Failed to download media. Please try again.');
    }
  };

  // Sort messages by timestamp
  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [messages]);

  // Determine if message should be shown on the right (outgoing style)
  const isMessageOutgoing = (message: TelegramMessage) => {
    // If message is already marked as outgoing, use that
    if (message.is_outgoing) return true;

    // If we have current account info, check if sender matches current account
    if (currentAccount && message.sender_username) {
      return message.sender_username === currentAccount.accountName;
    }

    // Fallback to original is_outgoing
    return message.is_outgoing;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !isConnected || !currentConversation || translating) return;

    setTranslating(true);
    try {
      // Send the message directly - translation is handled by the backend
      await onSendMessage(newMessage);
      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
      // You could add a toast notification here to show the error to the user
    } finally {
      setTranslating(false);
    }
  };


  return (
    <div id="chat-window" className="flex-1 flex flex-col bg-telegram-bg-light dark:bg-telegram-bg-dark transition-colors duration-300">
      {/* Contact Save Alert */}
      {contactSaveAlert && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
          <div className="bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">Contact information saved successfully!</span>
          </div>
        </div>
      )}

      {/* Chat header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 shadow-sm z-10">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xl shadow-inner uppercase">
                {currentConversation?.title?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                  {currentConversation?.title || 'Translation Chat'}
                </h2>
                {currentAccount && (
                  <p className="text-sm text-gray-400">
                    {targetLanguage === 'auto' ? 'Auto-detect' : targetLanguage.toUpperCase()} → {sourceLanguage === 'auto' ? 'Auto-detect' : sourceLanguage.toUpperCase()}
                  </p>
                )}
              </div>
              {/* Scheduled Messages Badge */}
              {scheduledMessages.length > 0 && (
                <div className="flex items-center space-x-2">
                  {scheduledMessages.map((sm) => {
                    const scheduledDate = new Date(sm.scheduled_at);
                    const formattedDate = scheduledDate.toLocaleString('en-US', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                      timeZoneName: 'short'
                    });
                    return (
                      <div
                        key={sm.id}
                        className="flex items-center space-x-2 px-3 py-2 bg-blue-100 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-500/40 rounded-lg shadow-sm"
                      >
                        <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <div className="flex flex-col">
                          <span className="text-xs text-blue-700 dark:text-blue-300 font-bold">
                            {formattedDate}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs font-medium">
                            {sm.message_text}
                          </span>
                        </div>
                        <button
                          onClick={() => handleCancelScheduledMessage(sm.id)}
                          className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 text-xs ml-2 flex-shrink-0 font-black p-1"
                          title="Cancel scheduled message"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          {/* Contact Info Button */}
          {currentConversation && (
            <button
              id="chat-crm-btn"
              onClick={() => setShowContactModal(true)}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center space-x-2 text-sm"
              title="Contact CRM Info"
            >
              <User className="w-4 h-4" />
              <span>CRM</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-6 dark:bg-[#0E1621] chat-telegram-bg">
        {/* Loading older messages spinner */}
        {loadingMore && (
          <div className="flex justify-center py-3">
            <div className="flex items-center space-x-2 text-xs text-gray-400 bg-black/10 dark:bg-white/5 px-4 py-2 rounded-full">
              <svg className="animate-spin w-3 h-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span>Loading older messages...</span>
            </div>
          </div>
        )}
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <Languages className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-400 mb-2">
              {!currentConversation ? 'Select a conversation' : 'No messages yet'}
            </h3>
            <p className="text-gray-500">
              {!currentConversation
                ? 'Choose a conversation from the list to start viewing messages'
                : isConnected
                  ? 'Start a conversation to see real-time translations'
                  : 'Connect to a Telegram account to begin'
              }
            </p>
          </div>
        ) : (
          (() => {
            const getDateLabel = (dateStr: string): string => {
              const date = new Date(dateStr);
              const now = new Date();
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
              const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86400000);
              if (diffDays === 0) return 'Today';
              if (diffDays === 1) return 'Yesterday';
              if (date.getFullYear() === now.getFullYear()) {
                return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
              }
              return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            };

            let lastDateLabel = '';
            const elements: React.ReactNode[] = [];

            sortedMessages.forEach((message) => {
              const dateLabel = getDateLabel(message.created_at);
              if (dateLabel !== lastDateLabel) {
                lastDateLabel = dateLabel;
                elements.push(
                  <div key={`sep-${message.id}`} className="flex justify-center my-3">
                    <span className="px-4 py-1 rounded-full text-xs font-medium bg-black/20 dark:bg-black/30 text-gray-800 dark:text-gray-200 backdrop-blur-sm shadow-sm select-none">
                      {dateLabel}
                    </span>
                  </div>
                );
              }

              if (message.type === 'system') {
                elements.push(
                  <div key={message.id} className="flex justify-center mb-4">
                    <div className="px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg max-w-2xl">
                      <p className="text-xs text-yellow-300 text-center">{message.original_text}</p>
                      <p className="text-xs text-gray-500 text-center mt-1">{new Date(message.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                );
                return;
              }

              const isOutgoing = isMessageOutgoing(message);
              elements.push(
                <div
                  key={message.id}
                  className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} mb-4`}
                >
                  <div className={`max-w-xs lg:max-w-md ${isOutgoing ? 'ml-12' : 'mr-12'}`}>
                    {/* Sender info for group/supergroup/channel incoming messages - Telegram Desktop doesn't show this in private chats */}
                    {!isOutgoing && currentConversation?.type !== 'private' && (
                      <div className="flex items-center space-x-2 mb-2 px-1">
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-xs font-bold text-white uppercase">
                          {message.sender_name ? message.sender_name.charAt(0) : '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-blue-500/80 dark:text-blue-400/80 truncate">
                            {message.sender_name || message.sender_username || 'Unknown'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Message bubble */}
                    {isOnlyEmoji(message.translated_text || message.original_text) ? (
                      <div className="py-1 px-1 inline-block">
                        <span style={{ fontSize: '96px', lineHeight: '1.1' }} className="select-none block">
                          {message.translated_text || message.original_text}
                        </span>
                        <div className="flex items-center justify-end mt-1 space-x-1">
                          <div className="flex items-center space-x-1 bg-black/40 dark:bg-black/50 rounded-full px-2 py-0.5">
                            <p className="text-[10px] text-white">
                              {new Date(message.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                            {isOutgoing && (
                              <div className="flex items-center">
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                <svg className="w-3 h-3 text-white -ml-1" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`px-3 py-2 rounded-2xl break-words whitespace-pre-wrap overflow-hidden shadow-sm relative ${isOutgoing
                          ? 'bg-telegram-bubble-out-light dark:bg-telegram-bubble-out-dark text-gray-900 dark:text-white rounded-br-md ml-auto'
                          : 'bg-telegram-bubble-in-light dark:bg-telegram-bubble-in-dark text-gray-900 dark:text-gray-100 rounded-bl-md mr-auto'
                          }`}
                      >
                        {/* Auto-Reply Badge */}
                        {message.type === 'auto_reply' && (
                          <div className="flex items-center space-x-1 mb-2 pb-2 border-b border-white/20">
                            <Zap className="w-3 h-3 text-yellow-400" />
                            <span className="text-xs font-medium text-yellow-400">Auto-Reply</span>
                          </div>
                        )}

                        {/* Photo - Display as inline image like Telegram */}
                        {hasPhoto(message) && (
                          <PhotoMessage
                            message={message}
                            loadedImages={loadedImages}
                            loadImage={loadImage}
                            onDownload={handleDownloadMedia}
                            onImageLoad={scrollToBottom}
                          />
                        )}

                        {/* Video - Display as inline video player like Telegram */}
                        {hasVideo(message) && (
                          <VideoMessage
                            message={message}
                            loadedImages={loadedImages}
                            loadImage={loadImage}
                            onDownload={handleDownloadMedia}
                            onImageLoad={scrollToBottom}
                          />
                        )}

                        {/* Document - keep as icon */}
                        {message.type === 'document' && (
                          <div className="mb-3">
                            <div className="bg-gray-800/50 rounded-lg p-3 flex items-center space-x-3">
                              <div className="flex-shrink-0">
                                <FileText className="w-8 h-8 text-green-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {message.media_file_name || '📄 Document'}
                                </p>
                                <p className="text-xs text-gray-400">Click to download</p>
                              </div>
                              <button
                                onClick={() => handleDownloadMedia(message)}
                                className="flex-shrink-0 p-2 hover:bg-gray-700 rounded-lg transition-colors"
                                title="Download"
                              >
                                <Download className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Caption/Text */}
                        {message.original_text && (
                          <div className="mb-2">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="text-xs font-medium text-blue-400">
                                {message.source_language && `${message.source_language.toUpperCase()}`}
                              </span>
                              <span className="text-sm leading-relaxed break-all">{message.original_text}</span>
                            </div>
                          </div>
                        )}

                        {/* Translated caption/message */}
                        {message.translated_text && (
                          <div className={`border-t pt-2 mt-2 ${isOutgoing ? 'border-gray-900/10 dark:border-white/10' : 'border-gray-100 dark:border-gray-700'}`}>
                            <p className={`text-sm font-bold leading-relaxed break-all ${isOutgoing ? 'text-gray-900 dark:text-white' : 'text-gray-900 dark:text-gray-100'}`}>{message.translated_text}</p>
                          </div>
                        )}

                        {/* Timestamp and read receipt */}
                        <div className="flex items-center justify-end mt-2 space-x-1">
                          <p className="text-xs opacity-70">
                            {new Date(message.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                          {isOutgoing && (
                            <div className="flex items-center">
                              <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              <svg className="w-3 h-3 text-blue-400 -ml-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            });
            return elements;
          })()
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      <div id="chat-input-area" className="bg-white dark:bg-[#1c2733] border-t border-gray-200 dark:border-white/5 px-4 pt-3 pb-4 transition-colors duration-300">
        {/* Template Selector */}
        {showTemplates && templates.length > 0 && (
          <div className="mb-3 p-3 bg-gray-100 dark:bg-[#0e1621] rounded-xl border border-gray-200 dark:border-white/10 max-h-48 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Message Templates</span>
              <button onClick={() => setShowTemplates(false)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleTemplateSelect(template)}
                  className="w-full text-left p-2 bg-gray-200 dark:bg-white/5 hover:bg-gray-300 dark:hover:bg-white/10 rounded-lg transition-colors"
                >
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{template.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{template.content}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {showTemplates && <div id="templates-menu-state-open" className="hidden" />}
        {/* Top action row: Templates + Manage */}
        <div className="flex items-center space-x-2 mb-3">
          <button
            id="chat-templates-btn"
            type="button"
            onClick={() => setShowTemplates(!showTemplates)}
            disabled={!isConnected || !currentConversation}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all text-sm border border-gray-200 dark:border-white/10"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Templates</span>
          </button>
          <button
            id="chat-templates-manage-btn"
            type="button"
            onClick={() => setShowTemplatesModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all text-sm border border-gray-200 dark:border-white/10"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Manage</span>
          </button>
        </div>

        {/* File Preview */}
        {selectedFile && (
          <div className="mb-3 p-3 bg-gray-100 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10">
            <div className="flex items-start space-x-3">
              {filePreview ? (
                <img src={filePreview} alt="Preview" className="w-16 h-16 object-cover rounded-lg" />
              ) : (
                <div className="w-16 h-16 bg-gray-200 dark:bg-white/10 rounded-lg flex items-center justify-center">
                  <Video className="w-7 h-7 text-gray-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{selectedFile.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button onClick={handleRemoveFile} className="text-gray-400 hover:text-gray-700 dark:hover:text-white" type="button">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Input row */}
        {currentConversation?.is_hidden ? (
          <div className="flex bg-white dark:bg-[#1c2733] rounded-xl overflow-hidden shadow-sm border border-gray-200 dark:border-white/5">
            <button
              onClick={() => conversationId && onJoinConversation?.(conversationId)}
              className="flex-1 py-4 bg-[#419FD9] hover:bg-[#3b8fc4] text-white font-bold uppercase tracking-widest transition-all active:scale-[0.99] flex items-center justify-center"
            >
              Join {currentConversation.type === 'channel' ? 'Channel' : 'Group'}
            </button>
          </div>
        ) : currentConversation?.type === 'channel' ? (
          <div className="flex bg-white dark:bg-[#1c2733] rounded-xl overflow-hidden shadow-sm border border-gray-200 dark:border-white/5">
            <button
              onClick={() => conversationId && onToggleMute?.(conversationId)}
              className="flex-1 py-3 text-[#419FD9] font-bold uppercase tracking-widest hover:bg-gray-50 dark:hover:bg-white/5 transition-all active:scale-[0.99]"
            >
              {currentConversation.is_muted ? 'Unmute' : 'Mute'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
            <input ref={fileInputRef} type="file" onChange={handleFileSelect} className="hidden" />

            {/* Text input with emoji icon inside */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={
                  !currentConversation
                    ? 'Select a conversation to start messaging'
                    : isConnected
                      ? `Type in ${targetLanguage === 'auto' ? 'any language' : targetLanguage.toUpperCase()}... (will be translated to ${sourceLanguage === 'auto' ? 'detected language' : sourceLanguage.toUpperCase()})`
                      : 'Connect to an account to start messaging'
                }
                className="w-full px-4 py-3 pr-12 bg-gray-100 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-colors text-sm"
                disabled={!isConnected || !currentConversation || translating}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  title="Emojis"
                >
                  <Smile className="w-5 h-5" />
                </button>
                {translating && <Languages className="w-4 h-4 text-blue-400 animate-pulse" />}
              </div>

              {/* Emoji Picker Overlay */}
              {showEmojiPicker && (
                <div
                  ref={pickerRef}
                  style={{
                    transform: `translate(${pickerPos.x}px, ${pickerPos.y}px)`,
                    transition: isDragging.current ? 'none' : 'transform 0.1s ease-out'
                  }}
                  className="absolute bottom-full right-0 mb-4 w-[350px] h-[450px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl shadow-2xl flex flex-col z-50 overflow-hidden animate-fade-in transition-colors duration-300"
                >
                  <div
                    onMouseDown={onDragStart}
                    className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900/80 cursor-grab active:cursor-grabbing backdrop-blur-md"
                  >
                    <div className="flex items-center space-x-2">
                      <Smile className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-black text-gray-900 dark:text-white tracking-wide uppercase">Select Emoji</span>
                    </div>
                    <button
                      onClick={() => setShowEmojiPicker(false)}
                      className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-white dark:bg-gray-800/50">
                    {emojis.map((group) => (
                      <div key={group.cat} className="mb-6">
                        <p className="text-[11px] font-bold text-blue-400/70 mb-3 uppercase tracking-widest">{group.cat}</p>
                        <div className="grid grid-cols-8 gap-1.5">
                          {group.items.map((emoji, idx) => (
                            <button
                              key={`${group.cat}-${idx}`}
                              type="button"
                              onClick={() => addEmoji(emoji)}
                              className="text-2xl hover:bg-blue-500/20 p-2 rounded-xl transition-all transform hover:scale-125 active:scale-90"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Attachment button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!isConnected || !currentConversation || uploadingFile}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all"
              title="Attach file"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Send / Send File button */}
            {selectedFile ? (
              <button
                type="button"
                onClick={handleSendFile}
                disabled={uploadingFile || !isConnected || !currentConversation}
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all shadow-lg shadow-blue-600/30"
              >
                {uploadingFile ? <Languages className="w-4 h-4 animate-pulse" /> : <Send className="w-4 h-4" />}
              </button>
            ) : (
              <button
                type="submit"
                disabled={!newMessage.trim() || !isConnected || !currentConversation || translating}
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all shadow-lg shadow-blue-600/30"
              >
                <Send className="w-4 h-4" />
              </button>
            )}

            {/* Schedule button */}
            <button
              id="chat-schedule-btn"
              type="button"
              onClick={() => setShowScheduleModal(true)}
              disabled={!newMessage.trim() || !isConnected || !currentConversation}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all shadow-lg shadow-purple-600/30"
              title="Schedule Message"
            >
              <Clock className="w-4 h-4" />
            </button>
          </form>
        )}

        <p className="text-xs text-blue-500 dark:text-[#4da2d9] mt-2">
          Your message will be automatically translated and sent in {sourceLanguage === 'auto' ? 'detected language' : sourceLanguage.toUpperCase()}
        </p>
      </div>

      {/* Modals */}
      <ScheduleMessageModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        conversationId={conversationId || null}
        messageText={newMessage}
        onScheduled={loadScheduledMessages}
      />
      <MessageTemplatesModal
        isOpen={showTemplatesModal}
        onClose={() => {
          setShowTemplatesModal(false);
          loadTemplates();
        }}
      />
      <ContactInfoModal
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
        conversationId={conversationId || null}
        onSaved={handleContactSaved}
      />
    </div >
  );
}