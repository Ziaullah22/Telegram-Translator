/**
 * CHAT WINDOW COMPONENT
 * 
 * This is the heart of the chat interface, responsible for:
 * 1. Rendering the message list with virtualization (Virtuoso)
 * 2. Handling message input with auto-translation
 * 3. Media display (Photos/Videos with IndexedDB caching)
 * 4. Context menus for message actions (Forward, Reply, Delete, React)
 * 5. Message selection and bulk operations
 * 6. Managing scheduled messages and templates
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Send, Languages, Clock, FileText, Copy, User, Paperclip, X, Image as ImageIcon, Video, Download, Zap, Smile, Trash, Trash2, Reply, Forward, Play, ChevronDown, CheckCircle2 } from 'lucide-react';
import { templatesAPI, scheduledMessagesAPI } from '../../services/api';
import type { TelegramMessage, TelegramChat, TelegramAccount, MessageTemplate, ScheduledMessage } from '../../types';
import ScheduleMessageModal from '../Modals/ScheduleMessageModal';
import MessageTemplatesModal from '../Modals/MessageTemplatesModal';
import ContactInfoModal from '../Modals/ContactInfoModal';
import ChatProfileModal from '../Modals/ChatProfileModal';
import ConfirmModal from '../Modals/ConfirmModal';
import PeerAvatar from '../Common/PeerAvatar';
import ForwardMessageModal from '../Modals/ForwardMessageModal';

// --- UTILITY: EMOJI DETECTION ---
// Determines if a message contains ONLY emojis (up to 10).
// If true, the UI renders "Big Emojis" similar to Telegram Desktop.
const isOnlyEmoji = (str: string) => {
  if (!str) return false;
  const cleanStr = str.replace(/\s/g, '');
  if (!cleanStr || cleanStr.length > 10) return false;

  // Regex covering major emoji ranges (Smileys, Symbols, Transport, etc.)
  const emojiRegex = /^(\u2702|\u2705|\u2708|\u2709|\u270A-\u270D|\u270F|\u2712|\u2714|\u2716|\u271D|\u2721|\u2728|\u2733|\u2734|\u2744|\u2747|\u274C|\u274E|\u2753-\u2755|\u2757|\u2763|\u2764|\u2795-\u2797|\u27A1|\u27B0|\u27BF|\u2934|\u2935|\u2B05-\u2B07|\u2B1B|\u2B1C|\u2B50|\u2B55|\u3030|\u303D|\u3297|\u3299|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF]|\uD83D[\uDE00-\uDE4F]|\uD83D[\uDE80-\uDEFF]|\uD83E[\uDD00-\uDDFF])+$/u;
  return emojiRegex.test(cleanStr);
};

// --- UTILITY: FILE SIZE FORMATTING ---
// Converts raw bytes into a human-readable string (e.g., 1.5 MB)
const formatBytes = (bytes: number, decimals = 1) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// --- UTILITY: TIME FORMATTING ---
// Formats seconds into a video/audio duration string like "3:45"
const formatDuration = (seconds?: number) => {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// --- PERSISTENT CACHE: INDEXED DB ---
// Messages with large photos or videos are cached locally to prevent 
// re-downloading them every time the user switches chats.
const DB_NAME = 'TG_Media_Cache';
const STORE_NAME = 'blobs';
const DB_VERSION = 1;

// Opens (or creates) the client-side database
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

// Retrieves a cached Blob (image/video data) by message ID
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
    console.warn('Media Cache Read failed:', e);
    return null;
  }
};

// Saves a downloaded Blob to the local database
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
    console.warn('Media Cache Write failed:', e);
  }
};

// --- COMPONENT: PHOTO MESSAGE ---
// Displays an image with progressive download, blurring, and persistent caching
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

  // Check the browser's IndexedDB for a cached version of this photo on mount
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

  // Initiates the media download from the backend API
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

  // If the media file was previously available but is now deleted (TDLib logic)
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

  // Placeholder state: Shows a blurred thumbnail and a download button
  if (!imageUrl) {
    return (
      <div className="mb-2">
        <div
          className="relative overflow-hidden rounded-xl min-w-[240px] min-h-[180px] cursor-pointer group transition-all border border-gray-200/10 shadow-lg"
          onClick={startDownload}
        >
          {/* STAGE 1: Low-Quality Blurred Placeholder (Base64 from API) */}
          {message.media_thumbnail && (
            <div
              className="absolute inset-0 bg-cover bg-center scale-110 transition-transform duration-500 group-hover:scale-105"
              style={{
                backgroundImage: `url(data:image/jpeg;base64,${message.media_thumbnail})`,
                filter: 'blur(4px) brightness(0.8)'
              }}
            />
          )}

          {!message.media_thumbnail && (
            <div className="absolute inset-0 bg-gradient-to-br from-gray-700/40 to-gray-900/40 flex items-center justify-center opacity-50">
              <ImageIcon className="w-20 h-20 text-white/10 blur-[2px]" />
            </div>
          )}

          {/* STAGE 2: Interactive Download Overlay */}
          <div className="relative z-10 flex flex-col items-center justify-center min-h-[180px] w-full bg-black/5 group-hover:bg-black/10 transition-colors">
            <div className="flex flex-col items-center space-y-3">
              <div className="relative flex items-center justify-center">
                {loading ? (
                  // Circular progress indicator while downloading
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
                  // Static download icon link
                  <div className="w-14 h-14 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-transform border border-white/20">
                    <Download className="w-7 h-7 text-white" />
                  </div>
                )}
              </div>
              <div className="text-center px-4">
                <p className="text-[13px] font-bold text-white drop-shadow-lg">Photo</p>
                {progress && progress.total > 0 && (
                  <p className="text-[11px] text-white font-medium mt-0.5 drop-shadow-md">
                    {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
                  </p>
                )}
                {error && <p className="text-xs text-red-500 mt-1 font-bold tracking-tight">Failed to load. Click to retry.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // STAGE 3: Final High-Resolution Display
  return (
    <div className="mb-2">
      <div className="relative rounded-lg overflow-hidden cursor-pointer group max-w-md shadow-sm border border-black/5 dark:border-white/5">
        <img
          src={imageUrl}
          alt={message.media_file_name || 'Photo'}
          className="w-full h-auto max-h-[450px] object-contain bg-gray-900/50"
          style={{ display: 'block' }}
          onLoad={() => onImageLoad?.()}
        />
        {/* Hover Action: Download to User's computer */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all duration-300">
            <div
              onClick={(e) => {
                e.stopPropagation();
                onDownload(message);
              }}
              className="bg-black/60 hover:bg-black/80 p-3 rounded-full text-white flex items-center justify-center space-x-2 backdrop-blur-sm shadow-xl"
            >
              <Download className="w-5 h-5" />
              <span className="text-xs font-bold uppercase tracking-wider">Save to disk</span>
            </div>
          </div>
        </div>
      </div>
      {message.media_file_name && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 px-1 font-medium">{message.media_file_name}</p>
      )}
    </div>
  );
};

// --- COMPONENT: VIDEO MESSAGE ---
// Handles video playback, buffering states, and persistent storage
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

  // Sync with IndexedDB cache on component initialization
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

  // Request the video binary from the server
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

  // If the video link is broken or expired
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

  // Pre-download state: Shows play button overlay on top of blurred thumbnail
  if (!videoUrl) {
    const durationStr = formatDuration(message.media_duration);

    return (
      <div className="mb-2">
        <div
          className="relative overflow-hidden rounded-xl min-w-[240px] min-h-[180px] cursor-pointer group transition-all border border-purple-500/10 shadow-lg"
          onClick={startDownload}
        >
          {/* Blurred Placeholder */}
          {message.media_thumbnail && (
            <div
              className="absolute inset-0 bg-cover bg-center scale-110 transition-transform duration-500 group-hover:scale-105"
              style={{
                backgroundImage: `url(data:image/jpeg;base64,${message.media_thumbnail})`,
                filter: 'blur(4px) brightness(0.7)'
              }}
            />
          )}

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
                    <span className="absolute text-[11px] font-bold text-white">{progress?.percentage || 0}%</span>
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-transform border border-white/20">
                    <Play className="w-7 h-7 text-white ml-1 fill-white" />
                  </div>
                )}
              </div>
              <div className="text-center px-4">
                <p className="text-[13px] font-bold text-white drop-shadow-lg">Video</p>
                {progress && progress.total > 0 && (
                  <p className="text-[11px] text-white font-medium mt-0.5 drop-shadow-md">
                    {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
                  </p>
                )}
                {error && <p className="text-xs text-red-500 mt-1 font-bold">Failed to load. Click to retry.</p>}
              </div>
            </div>

            {/* Video duration tag (e.g., 0:45) */}
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

  // Final Playback state: HTML5 Video player with controls
  return (
    <div className="mb-2">
      <div className="relative rounded-lg overflow-hidden max-w-md bg-gray-900/50 shadow-sm border border-black/5 dark:border-white/5">
        <video
          src={videoUrl}
          controls
          autoPlay
          onLoadedData={() => onImageLoad?.()}
          loop
          muted
          playsInline
          className="w-full h-auto max-h-[450px] object-contain shadow-2xl"
          style={{ display: 'block' }}
          preload="auto"
        >
          Your browser does not support the video tag.
        </video>
        <div className="absolute top-2 right-2 flex space-x-2">
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(message); }}
            className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white transition-all backdrop-blur-sm"
            title="Save video to system"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>
      {message.media_file_name && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 px-1 font-medium">{message.media_file_name}</p>
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
  // --- UI & INTERACTION STATE ---
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
  const [contextMenu, setContextMenu] = useState<{ message: TelegramMessage; x: number; y: number; showAbove: boolean } | null>(null);
  const [replyMessage, setReplyMessage] = useState<TelegramMessage | null>(null);
  const [forwardMessage, setForwardMessage] = useState<TelegramMessage | null>(null);
  const [reactingToMessageId, setReactingToMessageId] = useState<number | null>(null);
  const [reactionAnchor, setReactionAnchor] = useState<{ x: number; y: number; showAbove: boolean } | null>(null);
  const emojiStrip = ['❤️', '🔥', '👍', '😂', '😍', '🙏'];

  // --- REFS FOR VIRTUALIZATION & SCROLLING ---
  const inputRef = useRef<HTMLInputElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const isAtBottomRef = useRef(true);
  const lastScrolledId = useRef<number | null>(null);
  const initialScrollAnchorRef = useRef<boolean>(true);

  // Close context menu on any window click
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Lock scroll when context menu or reaction picker is open
  useEffect(() => {
    const isActive = !!contextMenu || (!!reactingToMessageId && showEmojiPicker);
    if (isActive) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [contextMenu, reactingToMessageId, showEmojiPicker, reactionAnchor]);

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
    if (reactingToMessageId !== null) {
      if (onReact) onReact(reactingToMessageId, emoji);
      setReactingToMessageId(null);
      setShowEmojiPicker(false);
    } else {
      setNewMessage(prev => prev + emoji);
    }
  };
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showChatProfileModal, setShowChatProfileModal] = useState(false);
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

  // --- UTILITY: MEDIA TYPE DETECTION ---
  const hasPhoto = (message: TelegramMessage) => {
    return message.type === 'photo' ||
      (message.type === 'auto_reply' && message.media_file_name?.match(/\.(jpg|jpeg|png|gif|webp)$/i));
  };

  const hasVideo = (message: TelegramMessage) => {
    return message.type === 'video' ||
      (message.type === 'auto_reply' && message.media_file_name?.match(/\.(mp4|webm|mov|avi)$/i));
  };

  // --- MESSAGE LIST PROCESSING ---
  // Merges real message history with "Virtual Scheduled Bubbles".
  // Virtual bubbles allow the user to see what they have planned in the timeline
  // without waiting for the server to actually send the message.
  const sortedMessages = useMemo(() => {
    // Collect all outgoing text bodies that have already been confirmed by the server
    const sentOutgoingTexts = new Set(messages.filter(m => m.is_outgoing && m.telegram_message_id > 0).map(m => m.original_text?.trim()));

    const virtualScheduled = scheduledMessages
      .filter(sm => {
        // Only show pending tasks
        if (sm.is_sent || sm.is_cancelled) return false;
        // If a real outgoing message with the EXACT same text is already in the chat, 
        // it means the scheduled task just fired. Hide the virtual bubble to avoid duplication.
        if (sentOutgoingTexts.has(sm.message_text?.trim())) return false;
        return true;
      })
      .map(sm => ({
        id: -(sm.id + 900000), // Unique negative ID to avoid conflicts
        scheduled_message_id: sm.id,
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
        is_scheduled_virtual: true, // Special flag to render "Queued" icon
        scheduled_at: sm.scheduled_at,
      } as any));

    return [...messages, ...virtualScheduled].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [messages, scheduledMessages, currentAccount, currentConversation]);

  // --- LIST TRANSFORMATION ---
  // Injects "Date Separators" (e.g., Today, Yesterday, March 5) into the flat array
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
        // New day detected, push separator FIRST
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

  // --- FILE ATTACHMENT HANDLERS ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reject huge files to avoid browser crashes and server timeouts
    if (file.size > 50 * 1024 * 1024) {
      alert('File size must be less than 50MB');
      return;
    }

    setSelectedFile(file);

    // If it's an image, create a local preview URL so the user can see what they are about to send
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
      // Execute the sendMedia callback passed from App.tsx
      await onSendMedia(selectedFile, newMessage);
      // Clean up UI on success
      handleRemoveFile();
      setNewMessage('');
    } catch (error) {
    } finally {
      setUploadingFile(false);
    }
  };

  // --- MEDIA DOWNLOAD LOGIC (STREAMED) ---
  // Downloads photos/videos from the server using the auth token.
  // Uses Streams to track download progress real-time.
  const loadImage = async (
    message: TelegramMessage,
    onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void
  ) => {
    // 1. Return memory-cached URL if already loaded in this session
    if (loadedImages[message.id]) {
      return loadedImages[message.id];
    }

    // 2. Check persistent IndexedDB cache (stored from previous sessions)
    try {
      const cachedBlob = await getCachedMedia(message.id);
      if (cachedBlob) {
        const url = URL.createObjectURL(cachedBlob);
        setLoadedImages(prev => ({ ...prev, [message.id]: url }));
        return url;
      }
    } catch (e) {
      console.warn('Persistent cache lookup failed', e);
    }

    // 3. Fallback: Download from API
    try {
      const token = document.cookie.split('auth_token=')[1]?.split(';')[0];
      const url = `/api/messages/download-media/${message.conversation_id}/${message.id}?telegram_message_id=${message.telegram_message_id}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      // Special handling for 410 Gone: The media file was cleared by TDLib to save server space
      if (response.status === 410) {
        setLoadedImages(prev => ({ ...prev, [message.id]: 'DELETED' }));
        return 'DELETED';
      }

      if (!response.ok || !response.body) throw new Error('Download stream missing or failed');

      const contentLength = +(response.headers.get('Content-Length') || 0);
      const reader = response.body.getReader();
      let loadedValue = 0;
      const chunks: Uint8Array[] = [];

      // Read the stream chunk-by-chunk to update the circular progress UI
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

      // Save to IndexedDB so we don't have to download this again
      await setCachedMedia(message.id, blob);

      // Cache the memory URL so switching between tabs doesn't cause a flicker
      setLoadedImages(prev => ({ ...prev, [message.id]: imageUrl }));

      return imageUrl;
    } catch (error) {
      console.error('Final media fetch failed:', error);
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
      {/* Selection Mode Header Bar - Telegram style: CANCEL (left) | FORWARD DELETE (right) */}
      {isSelectionMode && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-white dark:bg-[#212121] border-b border-gray-100 dark:border-white/5 shadow-sm flex items-center justify-between px-4 py-0" style={{ height: '72px' }}>
          {/* Left side: Cancel as plain text */}
          <button
            onClick={cancelSelection}
            className="flex items-center space-x-2 px-3 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-semibold rounded-md transition-colors uppercase text-[15px] tracking-wide"
          >
            <X className="w-6 h-6 mr-1" />
            <span>Cancel</span>
          </button>

          {/* Right side: Forward + Delete as filled buttons grouped together */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                const msgs = messages.filter(m => selectedMessages.includes(m.id));
                if (msgs.length > 0) setForwardMessage(msgs[0]);
              }}
              disabled={selectedMessages.length === 0}
              className="flex items-center space-x-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-bold rounded-lg transition-colors uppercase text-[13px] tracking-wide disabled:opacity-50 shadow-sm"
            >
              <span>Forward {selectedMessages.length > 0 ? selectedMessages.length : ''}</span>
            </button>
            <button
              onClick={handleDeleteSelected}
              disabled={selectedMessages.length === 0}
              className="flex items-center space-x-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-bold rounded-lg transition-colors uppercase text-[13px] tracking-wide disabled:opacity-50 shadow-sm"
            >
              <span>Delete {selectedMessages.length > 0 ? selectedMessages.length : ''}</span>
            </button>
          </div>
        </div>
      )}

      {/* Reaction Emoji Picker Popover */}
      {reactingToMessageId && showEmojiPicker && (
        <div
          className="fixed z-[300] animate-scale-in"
          style={{
            top: reactionAnchor?.y ? (reactionAnchor.showAbove ? Math.max(80, reactionAnchor.y - 12) : Math.min(window.innerHeight - 420, reactionAnchor.y + 12)) : '50%',
            left: reactionAnchor?.x || '50%',
            transform: reactionAnchor?.showAbove ? 'translate(-50%, -100%)' : 'translate(-50%, 0)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white dark:bg-[#212121] border border-gray-100 dark:border-white/10 rounded-2xl shadow-2xl w-[320px] h-[400px] flex flex-col overflow-hidden">
            <div className="p-3 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">Reactions</span>
              <button onClick={() => { setShowEmojiPicker(false); setReactingToMessageId(null); setReactionAnchor(null); }} className="hover:bg-gray-100 dark:hover:bg-white/5 p-1 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 grid grid-cols-6 gap-2 custom-scrollbar">
              {emojis.flatMap(g => g.items).map((emoji, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (onReact) onReact(reactingToMessageId, emoji);
                    setReactingToMessageId(null);
                    setShowEmojiPicker(false);
                    setReactionAnchor(null);
                    setContextMenu(null);
                  }}
                  className="w-11 h-11 flex items-center justify-center text-2xl hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-all hover:scale-125"
                >
                  {emoji}
                </button>
              ))}
            </div>
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
          className="fixed z-[200] flex flex-col items-center animate-scale-in"
          style={{
            top: contextMenu.showAbove ? contextMenu.y - 4 : contextMenu.y + 12,
            left: contextMenu.x,
            transform: contextMenu.showAbove ? 'translate(-50%, -100%)' : 'translate(-50%, 0)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Reaction Bubble (Above) */}
          <div className="relative mb-2 px-1.5 py-1.5 bg-white dark:bg-[#212121] border border-gray-100 dark:border-white/10 rounded-full shadow-xl flex items-center space-x-1">
            {emojiStrip.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  if (onReact) onReact(contextMenu.message.id, emoji);
                  setContextMenu(null);
                }}
                className="w-10 h-10 flex items-center justify-center text-[24px] hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-all hover:scale-125"
              >
                {emoji}
              </button>
            ))}
            <button
              onClick={() => {
                const mid = contextMenu.message.id;
                setReactionAnchor({ x: contextMenu.x, y: contextMenu.y, showAbove: contextMenu.showAbove });
                setReactingToMessageId(mid);
                setShowEmojiPicker(true);
                setContextMenu(null);
              }}
              className="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-white/10 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
            >
              <ChevronDown className="w-5 h-5" />
            </button>

            {/* Pointer / Tail for reaction bubble (only when showing above) */}
            {contextMenu.showAbove && (
              <div className="absolute -bottom-1.5 right-6 w-3 h-3 bg-white dark:bg-[#212121] border-r border-b border-gray-100 dark:border-white/10 rotate-45" />
            )}
            {!contextMenu.showAbove && (
              <div className="absolute -top-1.5 right-6 w-3 h-3 bg-white dark:bg-[#212121] border-l border-t border-gray-100 dark:border-white/10 rotate-45" />
            )}
          </div>

          {/* Main Action Menu */}
          <div className="w-[220px] bg-white dark:bg-[#212121] border border-gray-100 dark:border-white/10 rounded-[20px] shadow-2xl overflow-hidden py-1">
            {/* Reply */}
            <button
              onClick={() => {
                setReplyMessage(contextMenu.message);
                setContextMenu(null);
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              className="w-full px-4 py-2.5 flex items-center space-x-4 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group"
            >
              <Reply className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-white" />
              <span className="text-[15px] font-medium">Reply</span>
            </button>


            {/* Copy Text */}
            <button
              onClick={() => {
                const text = contextMenu.message.translated_text || contextMenu.message.original_text || '';
                navigator.clipboard.writeText(text).catch(() => { });
                setContextMenu(null);
              }}
              className="w-full px-4 py-2.5 flex items-center space-x-4 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group"
            >
              <Copy className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-white" />
              <span className="text-[15px] font-medium">Copy Text</span>
            </button>

            {/* Forward */}
            <button
              onClick={() => {
                setForwardMessage(contextMenu.message);
                setContextMenu(null);
              }}
              className="w-full px-4 py-2.5 flex items-center space-x-4 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group"
            >
              <Forward className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-white" />
              <span className="text-[15px] font-medium">Forward</span>
            </button>

            {/* Save Image (conditional) */}
            {(contextMenu.message.type === 'photo' || contextMenu.message.type === 'video') && (
              <button
                onClick={() => {
                  handleDownloadMedia(contextMenu.message);
                  setContextMenu(null);
                }}
                className="w-full px-4 py-2.5 flex items-center space-x-4 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group"
              >
                <Download className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-white" />
                <span className="text-[15px] font-medium">{contextMenu.message.type === 'video' ? 'Save Video' : 'Save Image'}</span>
              </button>
            )}

            {/* Delete */}
            <button
              onClick={() => {
                setSelectedMessages([contextMenu.message.id]);
                setShowDeleteConfirm(true);
                setContextMenu(null);
              }}
              className="w-full px-4 py-2.5 flex items-center space-x-4 text-[#e53935] hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors group"
            >
              <Trash className="w-5 h-5 text-[#e53935]/70 group-hover:text-[#e53935]" />
              <span className="text-[15px] font-medium">Delete</span>
            </button>

            <div className="my-1 border-t border-gray-100 dark:border-white/5 mx-2" />

            {/* Select */}
            <button
              onClick={() => {
                setIsSelectionMode(true);
                setSelectedMessages([contextMenu.message.id]);
                setContextMenu(null);
              }}
              className="w-full px-4 py-2.5 flex items-center space-x-4 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group"
            >
              <CheckCircle2 className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-white" />
              <span className="text-[15px] font-medium">Select</span>
            </button>
          </div>
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
      )
      }

      {/* --- SECTION: CHAT HEADER --- */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 shadow-sm z-10 transition-colors duration-200 relative min-h-[72px]">
        {/* In selection mode, the absolute overlay above covers the header */}
        {isSelectionMode ? (
          <div className="flex items-center space-x-6 animate-fade-in">
            <span className="text-[17px] font-semibold text-gray-900 dark:text-white">
              {selectedMessages.length} message{selectedMessages.length !== 1 && 's'} selected
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between animate-fade-in">
            <div className="flex-1">
              <div 
                className="flex items-center space-x-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 p-1.5 -ml-1.5 rounded-2xl transition-all duration-200 group w-fit pr-6"
                onClick={() => setShowChatProfileModal(true)}
                title="View Profile Information"
              >
                <div className="transform transition-transform group-hover:scale-105">
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
                </div>
                <div className="flex-1 min-w-0">
                  {/* [FEATURE: Advanced Username Handling] 
                      Automatically display the @username in the chat header if the conversation title is just a phone number. */}
                  <h2 className="text-[17px] font-semibold text-gray-900 dark:text-white truncate">
                    {currentConversation?.username && (!currentConversation?.title || currentConversation?.title.startsWith('+'))
                      ? `@${currentConversation.username}`
                      : (currentConversation?.title || 'Translation Chat')}
                  </h2>
                  <div className="flex items-center space-x-2">
                    {currentConversation?.username && currentConversation.title && !currentConversation.title.startsWith('+') && (
                      <span className="text-xs text-[#4da2d9] font-medium opacity-80">@{currentConversation.username}</span>
                    )}
                    {currentAccount && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {targetLanguage === 'auto' ? 'Auto-detect' : targetLanguage.toUpperCase()} → {sourceLanguage === 'auto' ? 'Auto-detect' : sourceLanguage.toUpperCase()}
                      </p>
                    )}
                  </div>
                </div>
                {/* Compact display of pending tasks for this chat */}
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
            
            {/* Conversation Settings Menu (Delete/Leave) */}
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
                    {/* Private Chat Options: Allows full deletion */}
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

                    {/* Group/Channel Options: Allows leaving */}
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
            
            {/* [FEATURE: Contact CRM] - Link to external or internal contact data */}
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
      <div className={`flex-1 relative overflow-hidden dark:bg-[#0E1621] chat-telegram-bg ${(!!contextMenu || (!!reactingToMessageId && showEmojiPicker)) ? 'pointer-events-none !overflow-hidden' : ''}`}>
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
          <>
            {/* --- PHASE 2: VIRTUALIZED LIST --- */}
            {/* This ensures only visible messages are rendered, keeping the list perfectly smooth. */}
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

                // --- RENDERER: SYSTEM ANNOUNCEMENT ---
                const message = item.data;
                if (message.type === 'system') {
                  return (
                    <div key={message.id} className="flex justify-center mb-4 px-6">
                      <div className="px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg max-w-2xl">
                        <p className="text-xs text-yellow-300 text-center font-medium leading-relaxed">{message.original_text}</p>
                        <p className="text-[10px] text-gray-500 text-center mt-1 uppercase tracking-wider">{new Date(message.created_at).toLocaleString()}</p>
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
                    className={`relative flex ${isOutgoing ? 'justify-end' : 'justify-start'} mb-1 group pl-14 pr-6 py-1.5 transition-colors duration-200 cursor-auto ${isSelected ? 'bg-[#419FD9]/10 dark:bg-[#419FD9]/15' : isSelectionMode ? 'hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer' : ''
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
                      e.stopPropagation();
                      if (isSelectionMode) {
                        toggleMessageSelection(message.id);
                      } else {
                        // Find the message bubble (standard or emoji-only)
                        const bubble = e.currentTarget.querySelector('.px-3.py-2, .py-1.px-1');
                        const bubbleRect = bubble?.getBoundingClientRect();

                        let x = e.clientX;
                        let y = e.clientY;
                        const menuWidth = 220;
                        let showAbove = y > window.innerHeight / 2;
                        // Forced downward if near the top (header)
                        if (y - 320 < 72) showAbove = false;

                        if (bubbleRect) {
                          // Empty Side Logic:
                          // Incoming (Left bubble) -> Empty side is RIGHT
                          // Outgoing (Right bubble) -> Empty side is LEFT
                          if (isOutgoing) {
                            // Place menu to the LEFT of the bubble
                            x = bubbleRect.left - (menuWidth / 2) - 12;
                          } else {
                            // Place menu to the RIGHT of the bubble
                            x = bubbleRect.right + (menuWidth / 2) + 12;
                          }
                        } else {
                          // Fallback to cursor center-clamping if bubble not found
                          if (isOutgoing) x = window.innerWidth * 0.3;
                          else x = window.innerWidth * 0.7;
                        }

                        // Safety clamping to screen edges
                        if (x + menuWidth / 2 > window.innerWidth - 12) x = window.innerWidth - menuWidth / 2 - 12;
                        if (x - menuWidth / 2 < 12) x = menuWidth / 2 + 12;

                        setContextMenu({ message, x, y, showAbove });
                      }
                    }}
                  >
                    {/* Selection Checkbox - left side, outside the bubble */}
                    {isSelectionMode && (
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center z-10 pointer-events-none">
                        <div className={`w-[22px] h-[22px] rounded-full border-[2px] flex items-center justify-center transition-all duration-200 ${isSelected
                          ? 'bg-[#419FD9] border-[#419FD9] scale-105'
                          : 'border-blue-400 dark:border-blue-400/60 bg-transparent'
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
                              {message.sender_username && (!message.sender_name || message.sender_name.startsWith('+'))
                                ? `@${message.sender_username}`
                                : (message.sender_name || 'Unknown User')}
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
          </>
        )}
      </div>

      {/* Message input */}
      <div id="chat-input-area" className={`bg-white dark:bg-[#1c2733] border-t border-gray-200 dark:border-white/5 transition-colors duration-300 ${isSelectionMode ? 'p-2' : 'px-4 pt-3 pb-4'}`}>
        {isSelectionMode ? (
          <div className="h-14 flex items-center justify-center">
            <p className="text-[13px] text-gray-400">{selectedMessages.length} selected &mdash; use buttons above to forward or delete</p>
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

              {/* --- INPUT AREA: UNJOINED STATE --- */}
              {/* If user is viewing a public chat they haven't joined yet */}
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
                // --- INPUT AREA: CHANNEL (READ-ONLY) ---
                <div className="flex bg-white dark:bg-[#1c2733] rounded-xl overflow-hidden shadow-sm border border-gray-200 dark:border-white/5">
                  <button
                    onClick={() => conversationId && onToggleMute?.(conversationId)}
                    className="flex-1 py-3 text-[#419FD9] font-bold uppercase tracking-widest hover:bg-gray-50 dark:hover:bg-white/5 transition-all active:scale-[0.99]"
                  >
                    {currentConversation.is_muted ? 'Unmute' : 'Mute'}
                  </button>
                </div>
              ) : (
                // --- INPUT AREA: STANDARD CHAT ---
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
                      onClick={() => {
                        setReactingToMessageId(null);
                        setShowEmojiPicker(!showEmojiPicker);
                      }}
                      className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                      title="Emojis"
                    >
                      <Smile className="w-5 h-5" />
                    </button>
                    {translating && <Languages className="w-4 h-4 text-blue-400 animate-pulse" />}
                  </div>

                  {/* Emoji Picker Overlay (Input focus) */}
                  {showEmojiPicker && !reactingToMessageId && (
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

            <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
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
        isOpen={!!forwardMessage}
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
      <ChatProfileModal
        isOpen={showChatProfileModal}
        onClose={() => setShowChatProfileModal(false)}
        chat={currentConversation}
        accountId={currentAccount?.id}
      />
    </div >
  );
}