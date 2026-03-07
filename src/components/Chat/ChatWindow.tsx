import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Send, Languages, Clock, FileText, Copy, User, Paperclip, X, Image as ImageIcon, Video, Download, Zap, Smile, Trash, Trash2, CheckSquare, Reply, Forward, Play } from 'lucide-react';
import { templatesAPI, scheduledMessagesAPI } from '../../services/api';
import type { TelegramMessage, TelegramChat, TelegramAccount, MessageTemplate, ScheduledMessage } from '../../types';
import ScheduleMessageModal from '../Modals/ScheduleMessageModal';
import MessageTemplatesModal from '../Modals/MessageTemplatesModal';
import ContactInfoModal from '../Modals/ContactInfoModal';
import ConfirmModal from '../Modals/ConfirmModal';
import PeerAvatar from '../Common/PeerAvatar';
import ForwardMessageModal from '../Modals/ForwardMessageModal';

// Helper to check if string contains only emojis
const isOnlyEmoji = (str: string) => {
  if (!str) return false;
  const cleanStr = str.replace(/\s/g, '');
  if (!cleanStr || cleanStr.length > 10) return false; // Limit length for big emoji

  // Basic emoji range check
  const emojiRegex = /^(\u2702|\u2705|\u2708|\u2709|\u270A-\u270D|\u270F|\u2712|\u2714|\u2716|\u271D|\u2721|\u2728|\u2733|\u2734|\u2744|\u2747|\u274C|\u274E|\u2753-\u2755|\u2757|\u2763|\u2764|\u2795-\u2797|\u27A1|\u27B0|\u27BF|\u2934|\u2935|\u2B05-\u2B07|\u2B1B|\u2B1C|\u2B50|\u2B55|\u3030|\u303D|\u3297|\u3299|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF]|\uD83D[\uDE00-\uDE4F]|\uD83D[\uDE80-\uDEFF]|\uD83E[\uDD00-\uDDFF])+$/u;
  return emojiRegex.test(cleanStr);
};

// Helper to format bytes to human readable string
const formatBytes = (bytes: number, decimals = 1) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Helper to format duration in m:ss
const formatDuration = (seconds?: number) => {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// --- IndexedDB Cache for Persistent Media ---
const DB_NAME = 'TG_Media_Cache';
const STORE_NAME = 'blobs';
const DB_VERSION = 1;

const openMediaDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getCachedMedia = async (id: number): Promise<Blob | null> => {
  try {
    const db = await openMediaDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn('IDB Get Failed', e);
    return null;
  }
};

const setCachedMedia = async (id: number, blob: Blob) => {
  try {
    const db = await openMediaDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(blob, id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('IDB Save Failed', e);
  }
};

// Photo Message Component - displays images inline like Telegram
const PhotoMessage: React.FC<{
  message: TelegramMessage;
  loadedImages: Record<number, string>;
  loadImage: (message: TelegramMessage, onProgress?: (p: { loaded: number; total: number; percentage: number }) => void) => Promise<string | null>;
  onDownload: (message: TelegramMessage) => void;
  onImageLoad?: () => void;
}> = ({ message, loadedImages, loadImage, onDownload, onImageLoad }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(loadedImages[message.id] || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number; percentage: number } | null>(null);

  // Auto-check persistent cache on mount
  useEffect(() => {
    if (!imageUrl && !loading) {
      getCachedMedia(message.id).then(blob => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          setImageUrl(url);
        }
      });
    }
  }, [message.id]);

  const startDownload = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (loading || imageUrl) return;
    setLoading(true);
    loadImage(message, setProgress).then(url => {
      if (url) {
        setImageUrl(url);
      } else {
        setError(true);
      }
      setLoading(false);
    });
  };

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

  if (!imageUrl) {
    return (
      <div className="mb-2">
        <div
          className="relative overflow-hidden rounded-xl min-w-[240px] min-h-[180px] cursor-pointer group transition-all border border-gray-200/10 shadow-lg"
          onClick={startDownload}
        >
          {/* Blurred Thumbnail Background */}
          {message.media_thumbnail && (
            <div
              className="absolute inset-0 bg-cover bg-center scale-110 transition-transform duration-500 group-hover:scale-105"
              style={{
                backgroundImage: `url(data:image/jpeg;base64,${message.media_thumbnail})`,
                filter: 'blur(4px) brightness(0.8)'
              }}
            />
          )}

          {/* Fallback pattern/color if no thumbnail */}
          {!message.media_thumbnail && (
            <div className="absolute inset-0 bg-gradient-to-br from-gray-700/40 to-gray-900/40 flex items-center justify-center opacity-50">
              <ImageIcon className="w-20 h-20 text-white/10 blur-[2px]" />
            </div>
          )}

          {/* Content Overlay */}
          <div className="relative z-10 flex flex-col items-center justify-center min-h-[180px] w-full bg-black/5 group-hover:bg-black/10 transition-colors">
            <div className="flex flex-col items-center space-y-3">
              <div className="relative flex items-center justify-center">
                {loading ? (
                  <div className="relative w-14 h-14 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90 transform">
                      <circle
                        cx="28"
                        cy="28"
                        r="25"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="transparent"
                        className="text-white/20"
                      />
                      <circle
                        cx="28"
                        cy="28"
                        r="25"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="transparent"
                        strokeDasharray={157}
                        strokeDashoffset={157 - (157 * (progress?.percentage || 0)) / 100}
                        className="text-white transition-all duration-300"
                      />
                    </svg>
                    <span className="absolute text-[11px] font-bold text-white">
                      {progress?.percentage || 0}%
                    </span>
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-transform border border-white/20">
                    <Download className="w-7 h-7 text-white" />
                  </div>
                )}
              </div>
              <div className="text-center px-4">
                <p className="text-[13px] font-bold text-white drop-shadow-lg">
                  Photo
                </p>
                {progress && progress.total > 0 && (
                  <p className="text-[11px] text-white font-medium mt-0.5 drop-shadow-md">
                    {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
                  </p>
                )}
                {error && <p className="text-xs text-red-500 mt-1 font-bold">Failed to load. Click to retry.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2">
      <div
        className="relative rounded-lg overflow-hidden cursor-pointer group max-w-md shadow-sm border border-black/5 dark:border-white/5"
        onClick={() => {
          // Optional: Open a full screen preview if needed, for now just allow re-download/save via menu
        }}
      >
        <img
          src={imageUrl}
          alt={message.media_file_name || 'Photo'}
          className="w-full h-auto max-h-[450px] object-contain bg-gray-900/50"
          style={{ display: 'block' }}
          onLoad={() => onImageLoad?.()}
        />
        {/* Full View / Save overlay on hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all duration-300">
            <div
              onClick={(e) => {
                e.stopPropagation();
                onDownload(message);
              }}
              className="bg-black/60 hover:bg-black/80 p-3 rounded-full text-white flex items-center justify-center space-x-2 backdrop-blur-sm"
            >
              <Download className="w-5 h-5" />
              <span className="text-xs font-medium">Save to system</span>
            </div>
          </div>
        </div>
      </div>
      {message.media_file_name && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 px-1 italic">{message.media_file_name}</p>
      )}
    </div>
  );
};

// Video Message Component - displays videos inline like Telegram
const VideoMessage: React.FC<{
  message: TelegramMessage;
  loadedImages: Record<number, string>;
  loadImage: (message: TelegramMessage, onProgress?: (p: { loaded: number; total: number; percentage: number }) => void) => Promise<string | null>;
  onDownload: (message: TelegramMessage) => void;
  onImageLoad?: () => void;
}> = ({ message, loadedImages, loadImage, onDownload, onImageLoad }) => {
  const [videoUrl, setVideoUrl] = useState<string | null>(loadedImages[message.id] || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number; percentage: number } | null>(null);

  // Auto-check persistent cache on mount
  useEffect(() => {
    if (!videoUrl && !loading) {
      getCachedMedia(message.id).then(blob => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          setVideoUrl(url);
        }
      });
    }
  }, [message.id]);

  const startDownload = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (loading || videoUrl) return;
    setLoading(true);
    loadImage(message, setProgress).then(url => {
      if (url) {
        setVideoUrl(url);
      } else {
        setError(true);
      }
      setLoading(false);
    });
  };

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

  if (!videoUrl) {
    const durationStr = formatDuration(message.media_duration);

    return (
      <div className="mb-2">
        <div
          className="relative overflow-hidden rounded-xl min-w-[240px] min-h-[180px] cursor-pointer group transition-all border border-purple-500/10 shadow-lg"
          onClick={startDownload}
        >
          {/* Blurred Thumbnail Background */}
          {message.media_thumbnail && (
            <div
              className="absolute inset-0 bg-cover bg-center scale-110 transition-transform duration-500 group-hover:scale-105"
              style={{
                backgroundImage: `url(data:image/jpeg;base64,${message.media_thumbnail})`,
                filter: 'blur(4px) brightness(0.7)'
              }}
            />
          )}

          {/* Fallback pattern/color if no thumbnail */}
          {!message.media_thumbnail && (
            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 to-gray-900/40 flex items-center justify-center opacity-50">
              <Play className="w-20 h-20 text-white/10 blur-[2px]" />
            </div>
          )}

          <div className="relative z-10 flex flex-col items-center justify-center min-h-[180px] w-full bg-black/10 group-hover:bg-black/20 transition-colors">
            <div className="flex flex-col items-center space-y-3">
              <div className="relative flex items-center justify-center">
                {loading ? (
                  <div className="relative w-14 h-14 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90 transform">
                      <circle
                        cx="28"
                        cy="28"
                        r="25"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="transparent"
                        className="text-white/20"
                      />
                      <circle
                        cx="28"
                        cy="28"
                        r="25"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="transparent"
                        strokeDasharray={157}
                        strokeDashoffset={157 - (157 * (progress?.percentage || 0)) / 100}
                        className="text-white transition-all duration-300"
                      />
                    </svg>
                    <span className="absolute text-[11px] font-bold text-white">
                      {progress?.percentage || 0}%
                    </span>
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-transform border border-white/20">
                    <Play className="w-7 h-7 text-white ml-1 fill-white" />
                  </div>
                )}
              </div>
              <div className="text-center px-4">
                <p className="text-[13px] font-bold text-white drop-shadow-lg">
                  Video
                </p>
                {progress && progress.total > 0 && (
                  <p className="text-[11px] text-white font-medium mt-0.5 drop-shadow-md">
                    {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
                  </p>
                )}
                {error && <p className="text-xs text-red-500 mt-1 font-bold">Failed to load. Click to retry.</p>}
              </div>
            </div>

            {/* Duration Tag like in the screenshot */}
            {durationStr && !loading && (
              <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded flex items-center space-x-1 border border-white/10">
                <Video className="w-3 h-3 text-white fill-white" />
                <span className="text-[11px] font-bold text-white">{durationStr}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2">
      <div
        className="relative rounded-lg overflow-hidden max-w-md bg-gray-900/50 shadow-sm border border-black/5 dark:border-white/5"
      >
        <video
          src={videoUrl}
          controls
          autoPlay
          onLoadedData={() => onImageLoad?.()}
          loop
          muted
          playsInline
          className="w-full h-auto max-h-[450px] object-contain"
          style={{ display: 'block' }}
          preload="auto"
        >
          Your browser does not support the video tag.
        </video>
        {/* Full View / Save overlay on top right */}
        <div className="absolute top-2 right-2 flex space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload(message);
            }}
            className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white transition-all backdrop-blur-sm"
            title="Save video to system"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>
      {message.media_file_name && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 px-1 italic">{message.media_file_name}</p>
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
  onSendMessage: (text: string, replyToId?: number) => Promise<void>;
  onSendMedia: (file: File, caption: string) => Promise<void>;
  onJoinConversation?: (conversationId: number) => Promise<void>;
  onToggleMute?: (conversationId: number) => Promise<void>;
  onLeaveConversation?: (conversationId: number) => Promise<void>;
  onDeleteConversation?: (conversationId: number) => Promise<void>;
  onDeleteMessages?: (conversationId: number, messageIds: number[], revoke: boolean) => Promise<void>;
  hasMoreMessages?: boolean;
  onLoadMoreMessages?: () => Promise<void>;
  onReact?: (messageId: number, emoji: string) => Promise<void>;
  scheduledMessages: ScheduledMessage[];
  setScheduledMessages: React.Dispatch<React.SetStateAction<ScheduledMessage[]>>;
  conversations: TelegramChat[];
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
  onLeaveConversation,
  onDeleteConversation,
  onDeleteMessages,
  hasMoreMessages = false,
  onLoadMoreMessages,
  onReact,
  scheduledMessages,
  setScheduledMessages,
  conversations,
}: ChatWindowProps): JSX.Element {
  const [showChatMenu, setShowChatMenu] = useState(false);
  const conversationId = currentConversation?.id;
  const [newMessage, setNewMessage] = useState('');
  const [translating, setTranslating] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [showTemplatesList, setShowTemplatesList] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<number[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteForEveryone] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ message: TelegramMessage; x: number; y: number } | null>(null);
  const [replyMessage, setReplyMessage] = useState<TelegramMessage | null>(null);
  const [forwardMessage, setForwardMessage] = useState<TelegramMessage | null>(null);
  const emojiStrip = ['❤️', '🔥', '👍', '😂', '😍', '🙏'];
  const inputRef = useRef<HTMLInputElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const isAtBottomRef = useRef(true);
  const lastScrolledId = useRef<number | null>(null);
  const initialScrollAnchorRef = useRef<boolean>(true);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

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
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    type: 'danger'
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to check if message has photo media
  const hasPhoto = (message: TelegramMessage) => {
    return message.type === 'photo' ||
      (message.type === 'auto_reply' && message.media_file_name?.match(/\.(jpg|jpeg|png|gif|webp)$/i));
  };


  // Helper to check if message has video media

  // Helper to check if message has video media
  const hasVideo = (message: TelegramMessage) => {
    return message.type === 'video' ||
      (message.type === 'auto_reply' && message.media_file_name?.match(/\.(mp4|webm|mov|avi)$/i));
  };

  // Sort messages by timestamp and include unsent scheduled messages
  const sortedMessages = useMemo(() => {
    // Track sent outgoing texts to hide virtual scheduled bubbles once the real message arrives
    const sentOutgoingTexts = new Set(messages.filter(m => m.is_outgoing && m.telegram_message_id > 0).map(m => m.original_text?.trim()));

    const virtualScheduled = scheduledMessages
      .filter(sm => {
        if (sm.is_sent || sm.is_cancelled) return false;
        // Hide virtual bubble if a real outgoing message with same text already landed
        if (sentOutgoingTexts.has(sm.message_text?.trim())) return false;
        return true;
      })
      .map(sm => ({
        id: -(sm.id + 900000), // negative to avoid collision with real message IDs
        scheduled_message_id: sm.id,  // store real scheduled ID for cancel action
        conversation_id: sm.conversation_id,
        telegram_message_id: 0,
        sender_name: currentAccount?.displayName || 'Me',
        sender_username: currentAccount?.accountName,
        peer_title: currentConversation?.title || '',
        type: 'text',
        original_text: sm.message_text,
        translated_text: undefined,
        created_at: sm.scheduled_at,
        is_outgoing: true,
        is_scheduled_virtual: true,
        scheduled_at: sm.scheduled_at,
      } as any));

    return [...messages, ...virtualScheduled].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [messages, scheduledMessages, currentAccount, currentConversation]);

  const listItems = useMemo(() => {
    const items: ({ type: 'date'; label: string; id: string } | { type: 'message'; data: TelegramMessage })[] = [];
    let lastDateLabel = '';

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

    sortedMessages.forEach((message) => {
      const dateLabel = getDateLabel(message.created_at);
      if (dateLabel !== lastDateLabel) {
        items.push({ type: 'date', label: dateLabel, id: `sep-${message.id}` });
        lastDateLabel = dateLabel;
      }
      items.push({ type: 'message', data: message });
    });

    return items;
  }, [sortedMessages]);


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

  useEffect(() => {
    if (conversationId) {
      initialScrollAnchorRef.current = true;
      lastScrolledId.current = conversationId;

      // Keep anchoring to bottom for 2 seconds to catch late-arriving messages
      const anchorTimer = setTimeout(() => {
        initialScrollAnchorRef.current = false;
      }, 2000);

      return () => clearTimeout(anchorTimer);
    } else {
      lastScrolledId.current = null;
      initialScrollAnchorRef.current = false;
    }
  }, [conversationId]);

  // Handle data arrival and initial scroll
  useEffect(() => {
    if (conversationId && listItems.length > 0 && initialScrollAnchorRef.current) {
      if (virtuosoRef.current) {
        virtuosoRef.current.scrollToIndex({
          index: listItems.length - 1,
          align: 'end',
          behavior: 'auto'
        });
      }
    }
  }, [conversationId, listItems.length]);

  // Periodically refresh scheduled messages so sent ones disappear promptly
  useEffect(() => {
    if (!conversationId) return;
    const hasPending = scheduledMessages.some(sm => !sm.is_sent && !sm.is_cancelled);
    if (!hasPending) return;
    const interval = setInterval(() => {
      loadScheduledMessages();
    }, 30000); // refresh every 30 seconds while there are pending scheduled messages
    return () => clearInterval(interval);
  }, [conversationId, scheduledMessages.length]);

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
    setShowTemplatesList(false);
  };

  const handleCancelScheduledMessage = async (messageId: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'Cancel Message',
      message: 'Are you sure you want to cancel this scheduled message?',
      type: 'warning',
      onConfirm: async () => {
        try {
          await scheduledMessagesAPI.cancelScheduledMessage(messageId);
          setScheduledMessages(scheduledMessages.filter(m => m.id !== messageId));
        } catch (err) {
          console.error('Failed to cancel scheduled message:', err);
        }
      }
    });
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

  const loadImage = async (
    message: TelegramMessage,
    onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void
  ) => {
    // 1. Return memory-cached URL if already loaded in this session
    if (loadedImages[message.id]) {
      return loadedImages[message.id];
    }

    // 2. Check persistent IndexedDB cache
    try {
      const cachedBlob = await getCachedMedia(message.id);
      if (cachedBlob) {
        const url = URL.createObjectURL(cachedBlob);
        setLoadedImages(prev => ({ ...prev, [message.id]: url }));
        return url;
      }
    } catch (e) {
      console.warn('Cache lookup failed', e);
    }

    try {
      const token = document.cookie.split('auth_token=')[1]?.split(';')[0];
      const url = `/api/messages/download-media/${message.conversation_id}/${message.id}?telegram_message_id=${message.telegram_message_id}`;

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

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const contentLength = +(response.headers.get('Content-Length') || 0);
      const reader = response.body.getReader();
      let loadedValue = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        loadedValue += value.length;

        if (onProgress && contentLength) {
          onProgress({
            loaded: loadedValue,
            total: contentLength,
            percentage: Math.round((loadedValue / contentLength) * 100),
          });
        }
      }

      const blob = new Blob(chunks as any[]);
      const imageUrl = window.URL.createObjectURL(blob);

      // Save to persistent cache
      await setCachedMedia(message.id, blob);

      // Cache the loaded image in memory
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
      const url = `/api/messages/download-media/${message.conversation_id}/${message.id}?telegram_message_id=${message.telegram_message_id}`;

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

  const toggleMessageSelection = (messageId: number) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedMessages([messageId]);
    } else {
      setSelectedMessages(prev =>
        prev.includes(messageId)
          ? prev.filter(id => id !== messageId)
          : [...prev, messageId]
      );
    }
  };

  const cancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedMessages([]);
  };

  const handleDeleteSelected = () => {
    if (selectedMessages.length === 0) return;
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!conversationId || selectedMessages.length === 0 || !onDeleteMessages) return;

    setIsDeleting(true);
    try {
      await onDeleteMessages(conversationId, selectedMessages, deleteForEveryone);
      setShowDeleteConfirm(false);
      setIsSelectionMode(false);
      setSelectedMessages([]);
    } catch (error) {
      console.error('Failed to delete messages:', error);
      alert('Failed to delete messages. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const scrollToBottom = (behavior: "auto" | "smooth" = 'smooth') => {
    if (virtuosoRef.current && listItems.length > 0) {
      virtuosoRef.current.scrollToIndex({
        index: listItems.length - 1,
        align: 'end',
        behavior
      });
    }
  };

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
      // Send the message directly with reply info if present
      await onSendMessage(newMessage, replyMessage?.telegram_message_id);
      setNewMessage('');
      setReplyMessage(null); // Clear reply after sending
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setTranslating(false);
    }
  };


  return (
    <div id="chat-window" className="relative flex-1 flex flex-col bg-telegram-bg-light dark:bg-telegram-bg-dark transition-colors duration-300">
      {/* Selection Mode Header overlay */}
      {isSelectionMode && (
        <div className="absolute top-0 left-0 right-0 h-14 bg-white dark:bg-[#212121] z-50 flex items-center justify-between px-4 shadow-sm border-b border-gray-100 dark:border-white/5 transition-all">
          <div className="flex items-center space-x-4">
            <button onClick={cancelSelection} className="text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 p-2 rounded-full transition-colors flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
            <span className="text-gray-900 dark:text-white font-medium text-[17px]">
              {selectedMessages.length} {selectedMessages.length === 1 ? 'message' : 'messages'}
            </span>
          </div>
          <div className="flex items-center">
            <button
              onClick={handleDeleteSelected}
              disabled={selectedMessages.length === 0}
              className="text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 p-2 rounded-full transition-colors disabled:opacity-50"
              title="Delete"
            >
              <Trash className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 animate-fade-in">
          <div className="bg-white dark:bg-[#212121] rounded-xl shadow-xl w-full max-w-[320px] overflow-hidden animate-scale-in">
            <div className="p-6">
              <h3 className="text-[19px] font-medium text-gray-900 dark:text-white mb-2">
                {selectedMessages.length > 1 ? 'Delete messages' : 'Delete message'}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-[15px] mb-5">
                Are you sure you want to delete {selectedMessages.length === 1 ? 'this message' : 'these messages'}?
              </p>

              <div className="flex items-center justify-end space-x-2 mt-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 text-[#e53935] hover:bg-[#e53935]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide flex items-center justify-center min-w-[80px]"
                >
                  {isDeleting ? (
                    <div className="w-4 h-4 border-2 border-[#e53935]/30 border-t-[#e53935] rounded-full animate-spin"></div>
                  ) : (
                    "Delete"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-[200] w-52 bg-white dark:bg-[#232323] border border-gray-100 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Emoji reaction strip */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-white/5">
            {emojiStrip.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  if (onReact) {
                    onReact(contextMenu.message.id, emoji);
                  }
                  setContextMenu(null);
                }}
                className="text-[22px] hover:scale-125 transition-transform px-0.5"
                title={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
            <button
              onClick={() => setContextMenu(null)}
              className="text-[22px] hover:scale-125 transition-transform px-0.5 opacity-50"
              title="More"
            >+</button>
          </div>

          {/* Reply */}
          <button
            onClick={() => {
              setReplyMessage(contextMenu.message);
              setContextMenu(null);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            className="w-full px-4 py-2.5 flex items-center space-x-3 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            <Reply className="w-[18px] h-[18px] text-gray-500" />
            <span className="text-[15px]">Reply</span>
          </button>

          {/* Copy */}
          <button
            onClick={() => {
              const text = contextMenu.message.translated_text || contextMenu.message.original_text || '';
              navigator.clipboard.writeText(text).catch(() => { });
              setContextMenu(null);
            }}
            className="w-full px-4 py-2.5 flex items-center space-x-3 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            <Copy className="w-[18px] h-[18px] text-gray-500" />
            <span className="text-[15px]">Copy</span>
          </button>

          {/* Save Image (only for photo messages) */}
          {(contextMenu.message.type === 'photo' || contextMenu.message.type === 'video') && (
            <button
              onClick={() => {
                handleDownloadMedia(contextMenu.message);
                setContextMenu(null);
              }}
              className="w-full px-4 py-2.5 flex items-center space-x-3 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
            >
              <Download className="w-[18px] h-[18px] text-gray-500" />
              <span className="text-[15px]">{contextMenu.message.type === 'video' ? 'Save Video' : 'Save Image'}</span>
            </button>
          )}

          {/* Forward */}
          <button
            onClick={() => {
              setForwardMessage(contextMenu.message);
              setContextMenu(null);
            }}
            className="w-full px-4 py-2.5 flex items-center space-x-3 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            <Forward className="w-[18px] h-[18px] text-gray-500" />
            <span className="text-[15px]">Forward</span>
          </button>

          <div className="mx-3 border-b border-gray-100 dark:border-white/5" />

          {/* Select */}
          <button
            onClick={() => {
              setIsSelectionMode(true);
              setSelectedMessages([contextMenu.message.id]);
              setContextMenu(null);
            }}
            className="w-full px-4 py-2.5 flex items-center space-x-3 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            <CheckSquare className="w-[18px] h-[18px] text-gray-500" />
            <span className="text-[15px]">Select</span>
          </button>

          <div className="mx-3 border-b border-gray-100 dark:border-white/5" />

          {/* Delete */}
          <button
            onClick={() => {
              setSelectedMessages([contextMenu.message.id]);
              setShowDeleteConfirm(true);
              setContextMenu(null);
            }}
            className="w-full px-4 py-2.5 flex items-center space-x-3 text-[#e53935] hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            <Trash className="w-[18px] h-[18px]" />
            <span className="text-[15px]">Delete</span>
          </button>
        </div>
      )}

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
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 shadow-sm z-10 transition-colors duration-200 relative min-h-[72px]">
        {isSelectionMode ? (
          <div className="absolute inset-0 flex items-center justify-between px-6 bg-white dark:bg-gray-800 animate-fade-in z-20">
            <div className="flex items-center space-x-6">
              <button onClick={cancelSelection} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1.5 rounded-full transition-colors focus:bg-gray-100 dark:focus:bg-gray-700 outline-none">
                <X className="w-6 h-6" />
              </button>
              <span className="text-[17px] font-semibold text-gray-900 dark:text-white">
                {selectedMessages.length} message{selectedMessages.length !== 1 && 's'} selected
              </span>
            </div>
            <button
              onClick={cancelSelection}
              className="text-[#419FD9] hover:bg-[#419FD9]/10 rounded-md px-4 py-2 font-medium uppercase text-sm tracking-wide transition-colors outline-none"
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between animate-fade-in">
            <div className="flex-1">
              <div className="flex items-center space-x-4">
                <PeerAvatar
                  accountId={currentAccount?.id}
                  peerId={
                    currentConversation?.telegram_peer_id ||
                    (currentConversation?.type === 'private' && !currentConversation?.lastMessage?.is_outgoing
                      ? currentConversation?.lastMessage?.sender_user_id
                      : undefined) ||
                    (currentConversation?.type !== 'private' ? currentConversation?.id : undefined)
                  }
                  name={currentConversation?.title || 'Unknown'}
                  className="w-12 h-12 rounded-full flex-shrink-0 text-xl font-bold uppercase shadow-inner"
                />
                <div className="flex-1 min-w-0">
                  <h2 className="text-[17px] font-semibold text-gray-900 dark:text-white truncate">
                    {currentConversation?.title || 'Translation Chat'}
                  </h2>
                  {currentAccount && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {targetLanguage === 'auto' ? 'Auto-detect' : targetLanguage.toUpperCase()} → {sourceLanguage === 'auto' ? 'Auto-detect' : sourceLanguage.toUpperCase()}
                    </p>
                  )}
                </div>
                {/* Scheduled Messages count in header (compact) */}
                {scheduledMessages.length > 0 && (
                  <div className="flex items-center space-x-1 px-2 py-1 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-md">
                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                      {scheduledMessages.filter(sm => !sm.is_sent && !sm.is_cancelled).length}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {/* Chat Actions Menu */}
            {currentConversation && (
              <div className="relative ml-2">
                <button
                  onClick={() => setShowChatMenu(p => !p)}
                  className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="More options"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
                {showChatMenu && (
                  <div className="absolute right-0 top-10 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.15)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] z-50 w-52 py-1 animate-scale-in">
                    {/* Private Chat Options */}
                    {currentConversation.type === 'private' && onDeleteConversation && (
                      <button
                        onClick={() => {
                          setShowChatMenu(false);
                          setConfirmModal({
                            isOpen: true,
                            title: 'Delete Chat',
                            message: 'Are you sure you want to delete this chat? This will remove it from your list and delete all messages.',
                            type: 'danger',
                            onConfirm: () => onDeleteConversation(currentConversation.id)
                          });
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-[#ff595a] hover:bg-red-50 dark:hover:bg-red-500/10 font-medium flex items-center space-x-2 transition-colors"
                      >
                        <Trash2 className="w-[18px] h-[18px]" />
                        <span className="text-[15px]">Delete chat</span>
                      </button>
                    )}

                    {/* Group/Channel Options */}
                    {(currentConversation.type === 'group' || currentConversation.type === 'supergroup' || currentConversation.type === 'channel') && onLeaveConversation && (
                      <button
                        onClick={() => {
                          const isChannel = currentConversation.type === 'channel';
                          setShowChatMenu(false);
                          setConfirmModal({
                            isOpen: true,
                            title: isChannel ? 'Leave Channel' : 'Leave Group',
                            message: isChannel
                              ? 'Are you sure you want to leave this channel? You will no longer receive updates.'
                              : 'Are you sure you want to leave this group? You will no longer receive messages from it.',
                            type: 'danger',
                            onConfirm: () => onLeaveConversation(currentConversation.id)
                          });
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-[#ff595a] hover:bg-red-50 dark:hover:bg-red-500/10 font-medium flex items-center space-x-2 transition-colors"
                      >
                        <Trash2 className="w-[18px] h-[18px]" />
                        <span className="text-[15px]">{currentConversation.type === 'channel' ? 'Leave channel' : 'Leave group'}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Contact Info Button */}
            {currentConversation && (
              <button
                id="chat-crm-btn"
                onClick={() => setShowContactModal(true)}
                className="ml-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center space-x-2 text-sm font-medium"
                title="Contact CRM Info"
              >
                <User className="w-4 h-4" />
                <span>CRM</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 relative overflow-hidden dark:bg-[#0E1621] chat-telegram-bg">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <Languages className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-400 mb-2">
              {!currentConversation ? 'Select a conversation' : 'No messages yet'}
            </h3>
            <p className="text-gray-500 px-6">
              {!currentConversation
                ? 'Choose a conversation from the list to start viewing messages'
                : isConnected
                  ? 'Start a conversation to see real-time translations'
                  : 'Connect to a Telegram account to begin'
              }
            </p>
          </div>
        ) : (
          <Virtuoso
            key={conversationId || 'empty'}
            ref={virtuosoRef}
            data={listItems}
            className="h-full custom-scrollbar"
            initialTopMostItemIndex={999999}
            followOutput={(isAtBottom) => isAtBottom ? 'smooth' : false}
            increaseViewportBy={300}
            atBottomStateChange={(atBottom) => {
              isAtBottomRef.current = atBottom;
            }}
            startReached={async () => {
              if (hasMoreMessages && !loadingMore && onLoadMoreMessages) {
                setLoadingMore(true);
                await onLoadMoreMessages();
                setLoadingMore(false);
              }
            }}
            components={{
              Header: () => loadingMore ? (
                <div className="flex justify-center py-3">
                  <div className="flex items-center space-x-2 text-xs text-gray-400 bg-black/10 dark:bg-white/5 px-4 py-2 rounded-full backdrop-blur-sm">
                    <svg className="animate-spin w-3 h-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    <span>Loading older messages...</span>
                  </div>
                </div>
              ) : null
            }}
            itemContent={(_, item) => {
              if (item.type === 'date') {
                return (
                  <div key={item.id} className="flex justify-center my-3">
                    <span className="px-4 py-1 rounded-full text-xs font-medium bg-black/20 dark:bg-black/30 text-gray-800 dark:text-gray-200 backdrop-blur-sm shadow-sm select-none">
                      {item.label}
                    </span>
                  </div>
                );
              }

              const message = item.data;
              if (message.type === 'system') {
                return (
                  <div key={message.id} className="flex justify-center mb-4 px-6">
                    <div className="px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg max-w-2xl">
                      <p className="text-xs text-yellow-300 text-center">{message.original_text}</p>
                      <p className="text-xs text-gray-500 text-center mt-1">{new Date(message.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                );
              }

              const isOutgoing = isMessageOutgoing(message);
              const isSelected = selectedMessages.includes(message.id);

              return (
                <div
                  key={message.id}
                  data-tg-id={message.telegram_message_id}
                  className={`relative flex ${isOutgoing ? 'justify-end' : 'justify-start'} mb-1 group px-6 py-1.5 transition-colors duration-200 cursor-auto ${isSelected ? 'bg-[#419FD9]/10 dark:bg-[#419FD9]/15' : isSelectionMode ? 'hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer' : ''
                    }`}
                  onClick={(e) => {
                    if (isSelectionMode) {
                      e.preventDefault();
                      toggleMessageSelection(message.id);
                    }
                  }}
                  onContextMenu={(e) => {
                    if (message.type === 'system' || (message as any).is_scheduled_virtual) return;
                    e.preventDefault();
                    if (isSelectionMode) {
                      toggleMessageSelection(message.id);
                    } else {
                      let x = e.clientX;
                      let y = e.clientY;
                      if (x + 208 > window.innerWidth) x = window.innerWidth - 208 - 8;
                      if (y + 340 > window.innerHeight) y = window.innerHeight - 340 - 8;
                      setContextMenu({ message, x, y });
                    }
                  }}
                >
                  {/* Selection Checkbox */}
                  {isSelectionMode && (
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center justify-center z-10 pointer-events-none">
                      <div className={`w-[22px] h-[22px] rounded-full border-[2px] flex items-center justify-center transition-all duration-200 ${isSelected
                        ? 'bg-[#419FD9] border-[#419FD9] scale-105'
                        : 'border-gray-400 dark:border-gray-500 bg-transparent'
                        }`}>
                        {isSelected && (
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  )}

                  <div className={`flex flex-col max-w-[85%] lg:max-w-[70%] ${isOutgoing ? 'items-end' : 'items-start'}`}>
                    {/* Sender info for group/supergroup/channel incoming messages */}
                    {!isOutgoing && (message.sender_name || message.sender_username) && (
                      <div className="flex items-center space-x-2 mb-1 pl-1">
                        <PeerAvatar
                          accountId={currentAccount?.id}
                          peerId={message.sender_user_id}
                          name={message.sender_name || 'Unknown'}
                          className="w-8 h-8 rounded-full flex-shrink-0 text-xs font-bold uppercase shadow-sm"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-blue-500/80 dark:text-blue-400/80 truncate">
                            {message.sender_name}
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
                          } ${(message as any).is_scheduled_virtual ? 'opacity-80 border border-dashed border-amber-400/40' : ''}`}
                      >
                        {/* Scheduled indicator strip */}
                        {(message as any).is_scheduled_virtual && (
                          <div className="flex items-center space-x-1 mb-1.5 pb-1.5 border-b border-amber-400/20">
                            <Clock className="w-3 h-3 text-amber-400 flex-shrink-0" />
                            <span className="text-[11px] font-semibold text-amber-400 tracking-wide uppercase">Scheduled</span>
                          </div>
                        )}
                        {/* Reply Preview inside bubble */}
                        {message.reply_to_telegram_id && (
                          <div
                            className={`mb-2 pl-3 py-1 border-l-[3px] rounded bg-black/5 dark:bg-white/5 cursor-pointer max-w-full overflow-hidden ${isOutgoing ? 'border-[#3390ec]' : 'border-[#3390ec]'
                              }`}
                            onClick={() => {
                              // Find the original message element and scroll to it
                              const element = document.querySelector(`[data-tg-id="${message.reply_to_telegram_id}"]`);
                              if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                // Add a temporary highlight effect
                                element.classList.add('bg-blue-500/10');
                                setTimeout(() => element.classList.remove('bg-blue-500/10'), 2000);
                              }
                            }}
                          >
                            <p className="text-[13px] font-bold text-[#3390ec] truncate mb-0.5">
                              {message.reply_to_sender || 'User'}
                            </p>
                            <p className="text-[13px] text-gray-600 dark:text-gray-400 truncate leading-tight">
                              {message.reply_to_text || 'Message'}
                            </p>
                          </div>
                        )}

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
                            onImageLoad={() => {
                              if (isAtBottomRef.current) {
                                scrollToBottom('auto');
                              }
                            }}
                          />
                        )}

                        {/* Video - Display as inline video player like Telegram */}
                        {hasVideo(message) && (
                          <VideoMessage
                            message={message}
                            loadedImages={loadedImages}
                            loadImage={loadImage}
                            onDownload={handleDownloadMedia}
                            onImageLoad={() => {
                              if (isAtBottomRef.current) {
                                scrollToBottom('auto');
                              }
                            }}
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

                        {/* Reactions display */}
                        {message.reactions && Object.keys(message.reactions).length > 0 && (
                          <div className={`mt-2 flex flex-wrap gap-1 ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                            {Object.entries(message.reactions as Record<string, number> || {}).map(([emoji, count]) => (
                              <div
                                key={emoji}
                                className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-[12px] animate-fade-in border border-white/5"
                              >
                                <span>{emoji}</span>
                                {count > 1 && <span className="font-medium text-[11px] opacity-70">{(count as number)}</span>}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Timestamp and read receipt */}
                        <div className="flex items-center justify-end mt-2 space-x-1">
                          {(message as any).is_scheduled_virtual ? (
                            // Scheduled message footer: show clock icon + scheduled time + cancel button
                            <div className="flex items-center space-x-1.5">
                              <Clock className="w-3 h-3 text-amber-400 flex-shrink-0" />
                              <p className="text-[11px] text-amber-400 font-medium">
                                {new Date(message.created_at).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCancelScheduledMessage((message as any).scheduled_message_id);
                                }}
                                className="text-red-400 hover:text-red-500 p-0.5 rounded transition-colors"
                                title="Cancel scheduled message"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <>
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
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
          />
        )}
      </div>

      {/* Message input */}
      <div id="chat-input-area" className={`bg-white dark:bg-[#1c2733] border-t border-gray-200 dark:border-white/5 transition-colors duration-300 ${isSelectionMode ? 'p-2' : 'px-4 pt-3 pb-4'}`}>
        {isSelectionMode ? (
          <div className="flex justify-center items-center h-[56px] space-x-4 animate-fade-in">
            <button
              onClick={() => {
                const firstMsg = selectedMessages.length > 0 ? messages.find(m => m.id === selectedMessages[0]) : null;
                setForwardMessage(firstMsg || null);
              }}
              disabled={selectedMessages.length === 0}
              className="flex items-center space-x-2 text-[#3390ec] hover:bg-[#3390ec]/10 px-8 py-2.5 rounded-lg transition-all font-medium disabled:opacity-50"
            >
              <Forward className="w-5 h-5" />
              <span className="uppercase text-sm tracking-wide">Forward</span>
            </button>
            <button
              onClick={handleDeleteSelected}
              disabled={selectedMessages.length === 0}
              className="flex items-center space-x-2 text-[#E53935] hover:bg-[#E53935]/10 px-8 py-2.5 rounded-lg transition-all font-medium disabled:opacity-50"
            >
              <Trash className="w-5 h-5" />
              <span className="uppercase text-sm tracking-wide">Delete</span>
            </button>
          </div>
        ) : (
          <>
            {/* Template Selector */}
            {showTemplatesList && templates.length > 0 && (
              <div className="mb-3 p-3 bg-gray-100 dark:bg-[#0e1621] rounded-xl border border-gray-200 dark:border-white/10 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Message Templates</span>
                  <button onClick={() => setShowTemplatesList(false)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1 rounded-lg transition-colors">
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

            {showTemplatesList && <div id="templates-menu-state-open" className="hidden" />}
            {/* Top action row: Templates + Manage */}
            <div className="flex items-center space-x-2 mb-3">
              <button
                id="chat-templates-btn"
                type="button"
                onClick={() => setShowTemplatesList(!showTemplatesList)}
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

            {/* Reply Banner */}
            {replyMessage && (
              <div className="mb-2 flex items-center px-3 py-2 bg-gray-50 dark:bg-white/5 border-l-2 border-[#3390ec] rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#3390ec] mb-0.5">Reply to message</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{replyMessage.translated_text || replyMessage.original_text}</p>
                </div>
                <button onClick={() => setReplyMessage(null)} className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <X className="w-4 h-4" />
                </button>
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
                    ref={inputRef}
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
          </>
        )}
      </div>

      {/* Modals */}
      <ScheduleMessageModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        conversationId={conversationId || null}
        messageText={newMessage}
        onScheduled={() => {
          loadScheduledMessages();
          setNewMessage('');
        }}
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
        accountId={currentAccount?.id}
        peerId={currentConversation?.telegram_peer_id || currentConversation?.id}
        contactName={currentConversation?.title || 'Unknown'}
        onSaved={handleContactSaved}
      />
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
      />
      <ForwardMessageModal
        isOpen={!!forwardMessage || (isSelectionMode && !!forwardMessage)}
        onClose={() => {
          setForwardMessage(null);
          if (isSelectionMode) {
            setIsSelectionMode(false);
            setSelectedMessages([]);
          }
        }}
        selectedMessageIds={isSelectionMode ? selectedMessages : (forwardMessage ? [forwardMessage.id] : [])}
        previewMessage={forwardMessage}
        conversations={conversations}
        sourceConversationId={conversationId || null}
        currentAccountId={currentAccount?.id}
      />

    </div>
  );
}