import { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useSocket } from './hooks/useSocket';

// Components
import LoginForm from './components/Auth/LoginForm';
import RegisterForm from './components/Auth/RegisterForm';
import Logout from './components/Auth/Logout';
import Header from './components/Layout/Header';
import Sidebar from './components/Layout/Sidebar';
import ChatWindow from './components/Chat/ChatWindow';
import ConversationList from './components/Layout/ConversationList';
import AnalyticsPage from './components/Analytics/AnalyticsPage';
import AddAccountModal from './components/Modals/AddAccountModal';
import EditAccountModal from './components/Modals/EditAccountModal';
import ConfirmModal from './components/Modals/ConfirmModal';
import AutoResponderPage from './components/AutoResponder/AutoResponderPage';
import UserGuideTour from './components/Modals/UserGuideTour';
import ProfileModal from './components/Modals/ProfileModal';
import ActiveSessionsModal from './components/Modals/ActiveSessionsModal';
import CampaignPage from './components/Campaigns/CampaignPage';
import ProductsPage from './components/Products/ProductsPage';
import AdvancedSettings from './components/Settings/AdvancedSettings';
import CRMDashboard from './components/CRM/CRMDashboard';
import InstagramLeadGenerator from './components/Instagram/InstagramLeadGenerator';

// Services
import { telegramAPI, conversationsAPI, messagesAPI } from './services/api';
import { Zap, X } from 'lucide-react';

// Types
import type { TelegramAccount, TelegramMessage, TelegramChat, ScheduledMessage } from './types';

/**
 * MAIN ENTRANCE OF THE APPLICATION (USER SIDE)
 * 
 * This file handles:
 * 1. Global state management (Accounts, Conversations, Messages)
 * 2. Routing (Chat, Analytics, Auto Responder)
 * 3. Real-time communication via WebSockets
 * 4. Notifications (Native and In-app)
 * 5. Memory management for chat data
 */
// Small sub-component inside Router context to detect navigation state from Orders page
function NavigationHandler({ onNavigate }: { onNavigate: (accountId: number, peerId: number) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const state = location.state as { openAccountId?: number; openPeerId?: number } | null;
    if (!state?.openAccountId || !state?.openPeerId) return;
    navigate('/', { replace: true, state: {} });
    onNavigate(state.openAccountId, state.openPeerId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);
  return null;
}

function App() {
  // --- AUTHENTICATION STATE ---
  // Tracks if the user is logged in and if the session is still being checked
  const { isAuthenticated, isLoading } = useAuth();
  // Simple toggle between login and register views for guest users
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // --- REAL-TIME COMMUNICATION (WebSocket) ---
  // The onMessage hook provides a listener for incoming server events (new messages, deletions, etc.)
  const { onMessage } = useSocket();

  // --- CORE APPLICATION DATA ---
  const [accounts, setAccounts] = useState<TelegramAccount[]>([]); // The list of all Telegram accounts linked to the user
  const [currentAccount, setCurrentAccount] = useState<TelegramAccount | null>(null); // The specific account currently selected in the sidebar
  const [conversations, setConversations] = useState<TelegramChat[]>([]); // The list of chats (contacts/groups) for the active account
  const [currentConversation, setCurrentConversation] = useState<TelegramChat | null>(null); // The specific chat currently open in the main window
  const [messages, setMessages] = useState<TelegramMessage[]>([]); // The full message history for the currently open chat

  // --- UI & INTERACTION STATE ---
  const [showAddAccountModal, setShowAddAccountModal] = useState(false); // Modal for uploading new TData
  const [showEditAccountModal, setShowEditAccountModal] = useState(false); // Modal for changing account languages/names
  const [editingAccount, setEditingAccount] = useState<TelegramAccount | null>(null); // Reference for the account being edited
  const [unreadCounts, setUnreadCounts] = useState<Record<number, Record<number, number>>>({}); // Nest map: {AccountId: {ConversationId: count}}
  const [notification, setNotification] = useState<{ title: string; message: string; id: number; accountId: number; conversationId: number; avatar?: string } | null>(null); // Active in-app popup
  const [showTour, setShowTour] = useState(false); // Controls the "First time user" guide
  const [tourStep, setTourStep] = useState(0); // Current progress in the guided tour
  const [hasMoreMessages, setHasMoreMessages] = useState(false); // Boolean for infinite scroll (if more older messages exist)
  const [showProfileModal, setShowProfileModal] = useState(false); // Modal to view/edit Telegram Bio/Name
  const [profileAccount, setProfileAccount] = useState<TelegramAccount | null>(null); // Target account for profile editing
  const [showSessionsModal, setShowSessionsModal] = useState(false); // Modal to view active TDLIB sessions/devices
  const [sessionsAccount, setSessionsAccount] = useState<TelegramAccount | null>(null); // Target account for session management
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]); // Local state for pending scheduled messages
  const [accountToDelete, setAccountToDelete] = useState<TelegramAccount | null>(null); // Confirmation ref for account deletion
  const [hideOriginal, setHideOriginal] = useState<boolean>(() => {
    const saved = localStorage.getItem('focusMode');
    return saved ? JSON.parse(saved) : false;
  }); // Global toggle to hide foreign languages

  useEffect(() => {
    localStorage.setItem('focusMode', JSON.stringify(hideOriginal));
  }, [hideOriginal]);


  // --- REFS FOR STABLE STATE ACCESS ---
  // These refs are used inside callbacks/effects that need the most up-to-date state
  // without triggering re-renders or creating stale closures.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const processedMessageIds = useRef<Set<number>>(new Set());

  // --- PHASE 3: SMART MEMORY MANAGEMENT (FRONTEND) ---
  // This unloads old chat data and keeps only the most recent 5 chats in memory.
  const messageCache = useRef<Record<number, { messages: TelegramMessage[], hasMore: boolean, lastViewed: number }>>({});
  const MAX_CACHE_SIZE = 5;

  // Refs for current state
  const currentAccountRef = useRef<TelegramAccount | null>(currentAccount);
  const currentConversationRef = useRef<TelegramChat | null>(currentConversation);
  const conversationsRef = useRef<TelegramChat[]>(conversations);
  const accountsRef = useRef<TelegramAccount[]>(accounts);

  useEffect(() => { currentAccountRef.current = currentAccount; }, [currentAccount]);
  useEffect(() => { currentConversationRef.current = currentConversation; }, [currentConversation]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { accountsRef.current = accounts; }, [accounts]);

  // Load accounts on mount
  useEffect(() => {
    if (isAuthenticated) loadAccounts();
  }, [isAuthenticated]);

  // Handle notification sound
  useEffect(() => {
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
  }, []);

  // Native notifications
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // --- NOTIFICATION HANDLERS ---
  // Plays the default Telegram "Note" sound for new incoming messages
  const playNotificationSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.log('Audio play blocked by browser policy:', e));
    }
  }, []);

  // Handle deep-link navigation from Orders page
  const handleNavigateToConversation = useCallback(async (openAccountId: number, openPeerId: number) => {
    try {
      const acc = accounts.find(a => Number(a.id) === openAccountId);
      if (!acc) return;
      if (!currentAccountRef.current || Number(currentAccountRef.current.id) !== openAccountId) {
        setCurrentAccount(acc);
        setMessages([]);
        setCurrentConversation(null);
        setConversations([]);
      }
      if (acc.isConnected) {
        const convs = await conversationsAPI.getConversations(openAccountId);
        setConversations(convs);
        const target = convs.find((c: any) => Number(c.peer_id) === openPeerId || Number(c.telegram_peer_id) === openPeerId);
        if (target) { setCurrentConversation(target); loadMessages(target.id); }
      }
    } catch(e) { console.error('Failed to navigate to conversation from order:', e); }
  }, [accounts]);

  // Switches the app context (Account and Chat) when a user clicks a notification
  const handleNotificationClick = useCallback(async (accId: number, convId: number) => {
    const acc = accounts.find(a => Number(a.id) === accId);
    if (!acc) return;

    if (!currentAccountRef.current || Number(currentAccountRef.current.id) !== accId) {
      setCurrentAccount(acc);
      setMessages([]);
      setCurrentConversation(null);
      setConversations([]);
    }

    if (acc.isConnected) {
      try {
        const convs = await conversationsAPI.getConversations(accId);
        setConversations(convs);
        const target = convs.find(c => Number(c.id) === convId);
        if (target) {
          setCurrentConversation(target);
          loadMessages(convId);
        }
      } catch (e) { console.error('Failed to switch context via notification:', e); }
    }
    setNotification(null);
  }, [accounts]);

  // Triggers a native OS notification if the app is in the background or hidden
  const showNativeNotification = useCallback((title: string, body: string, accountId: number, conversationId: number, icon?: string) => {
    if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification(title, {
        body: body,
        icon: icon || '/logo192.png',
        tag: `chat-${conversationId}`,
        // @ts-ignore
        renotify: true,
        requireInteraction: true
      });
      n.onclick = (e) => {
        e.preventDefault();
        window.focus();
        handleNotificationClick(accountId, conversationId);
        n.close();
      };
    }
  }, [handleNotificationClick]);

  // --- WEBSOCKET EVENT LISTENER ---
  // This central useEffect listens to all events pushed by the server
  useEffect(() => {
    const unsubscribe = onMessage((data: any) => {
      // HANDLE: New incoming or outgoing message
      if (data?.type === 'new_message' && data.message) {
        const incomingAccountId = Number(data.account_id);
        const incomingConversationId = Number(data.message.conversation_id);
        const activeAcc = currentAccountRef.current;
        const activeConv = currentConversationRef.current;
        const activeAccountId = activeAcc ? Number(activeAcc.id) : null;
        const activeConversationId = activeConv ? Number(activeConv.id) : null;

        const isActiveConv = activeAccountId === incomingAccountId && activeConversationId === incomingConversationId;

        // --- CONTEXT-AWARE DEDUPLICATION ---
        // Catch messages that arrive through multiple events (Sales Bot vs Telethon event)
        const tgId = Number(data.message.telegram_message_id);
        const internalId = Number(data.message.id);
        
        const isDuplicate = (tgId !== 0 && processedMessageIds.current.has(tgId)) || 
                           (internalId > 0 && processedMessageIds.current.has(internalId));

        if (isDuplicate) return;

        // Mark both IDs as processed to block future duplicates
        if (tgId !== 0) processedMessageIds.current.add(tgId);
        if (internalId > 0) processedMessageIds.current.add(internalId);

        // Manage set size to prevent memory bloat
        if (processedMessageIds.current.size > 1000) {
          const iterator = processedMessageIds.current.values();
          for (let i = 0; i < 100; i++) {
            const nextVal = iterator.next().value;
            if (nextVal !== undefined) processedMessageIds.current.delete(nextVal);
          }
        }

        // If it's an incoming message (not sent by us)
        if (!data.message.is_outgoing) {
          const account = accountsRef.current.find(a => Number(a.id) === incomingAccountId);
          const notificationsEnabled = account ? account.notificationsEnabled : true;
          
          const isMuted = conversationsRef.current.some(c => Number(c.id) === incomingConversationId && c.is_muted);
          if (!isMuted && notificationsEnabled) {
            playNotificationSound();
            // Show notifications only if we are NOT already looking at the chat
            if (!isActiveConv) {
              const title = data.message.sender_name || data.message.peer_title || 'New Message';
              const body = data.message.original_text || 'Sent an attachment';
              const avatar = data.message.sender_avatar || undefined;

              // Internal UI notification
              setNotification({ title, message: body, id: Date.now(), accountId: incomingAccountId, conversationId: incomingConversationId, avatar });

              // OS-level notification (if tab is hidden or user away)
              if (!document.hasFocus()) showNativeNotification(title, body, incomingAccountId, incomingConversationId, avatar);

              // Clear UI notification after 8 seconds
              setTimeout(() => setNotification(null), 8000);
            }
          }
        }

        // Increment unread counters for the respective account/chat
        setUnreadCounts(prev => {
          const next = { ...prev };
          const byConv = { ...(next[incomingAccountId] || {}) };
          if (!isActiveConv) byConv[incomingConversationId] = (byConv[incomingConversationId] || 0) + 1;
          else byConv[incomingConversationId] = 0;
          next[incomingAccountId] = byConv;
          return next;
        });

        // Update the conversation list ordering (bring latest chat to the top)
        if (activeAccountId === incomingAccountId) {
          setConversations(prev => {
            const index = prev.findIndex(c => Number(c.id) === incomingConversationId);
            if (index === -1) return [{ id: incomingConversationId, title: data.message.peer_title || 'Unknown', type: 'private', lastMessage: data.message }, ...prev] as TelegramChat[];
            const updated = [...prev];
            const conversation = { ...updated[index], lastMessage: data.message };
            updated.splice(index, 1);
            return [conversation, ...updated];
          });

          // If the message belongs to the current open chat, append it to the view
          if (activeConversationId === incomingConversationId) {
            setMessages(prev => {
              // Final check for duplicates via Telegram Message ID or Database ID
              const isDuplicate = prev.some(msg => 
                (Number(msg.id) > 0 && Number(msg.id) === Number(data.message.id)) || 
                (Number(msg.telegram_message_id) !== 0 && Number(msg.telegram_message_id) === Number(data.message.telegram_message_id))
              );
              if (isDuplicate) return prev;

              // --- ADVANCED DEDUPLICATION (Ghost Message Fix) ---
              // If we have a temporary "Sending..." message (negative ID), 
              // we clear it even if the text changed (due to branding/replacements).
              // For outgoing messages from the same chat, we clear the OLDEST pending message first.
              const filtered = prev.filter(msg => {
                // If it's a real message, keep it.
                if (msg.id >= 0) return true;
                
                // If it's a "Sending..." message for a DIFFERENT chat, keep it.
                if (Number(msg.conversation_id) !== Number(data.message.conversation_id)) return true;
                
                // If the text matches perfectly OR it's been in "sending" for more than 0.5s, 
                // it is likely the server version of the same message.
                const isLikelySame = (msg.original_text === data.message.original_text) || 
                                     (data.message.is_outgoing && msg.id < 0);
                
                return !isLikelySame;
              });
              
              return [...filtered, data.message];
            });
          }
        }

        // --- PHASE 3: CACHE UPDATING ---
        // If this chat's messages are currently cached in memory, update the cache too
        if (messageCache.current[incomingConversationId]) {
          const cached = messageCache.current[incomingConversationId];
          const isDup = cached.messages.some((msg: TelegramMessage) => Number(msg.id) === Number(data.message.id) || (Number(msg.telegram_message_id) === Number(data.message.telegram_message_id) && Number(msg.telegram_message_id) !== 0));
          if (!isDup) {
            const filt = cached.messages.filter((msg: TelegramMessage) => !(msg.id < 0 && msg.original_text === data.message.original_text));
            messageCache.current[incomingConversationId] = { ...cached, messages: [...filt, data.message] };
          }
        }
      }

      // HANDLE: Real-time emoji reaction updates
      if (data?.type === 'message_reaction') {
        const messageId = Number(data.message_id);
        const reactions = data.reactions;
        setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, reactions } : msg));
      }

      // HANDLE: Remote conversation deletion
      if (data?.type === 'conversation_deleted') {
        const delId = Number(data.conversation_id);
        setConversations(prev => prev.filter(c => c.id !== delId));
        if (currentConversationRef.current?.id === delId) { setCurrentConversation(null); setMessages([]); }
      }

      // HANDLE: Remote message deletion (single or bulk)
      if (data?.type === 'messages_deleted') {
        const delId = Number(data.conversation_id);
        const delIds = data.message_ids as number[];
        if (currentConversationRef.current?.id === delId) setMessages(prev => prev.filter(msg => !delIds.includes(msg.id)));
      }

      // HANDLE: New conversation (e.g. secret chat handshake accepted)
      if (data?.type === 'new_conversation' && data.conversation) {
        setConversations(prev => {
          const exists = prev.some(c => Number(c.id) === Number(data.conversation.id));
          if (exists) return prev;
          return [data.conversation, ...prev];
        });
      }
    });
    return unsubscribe;
  }, [onMessage, playNotificationSound, showNativeNotification]);

  const loadAccounts = async () => {
    try {
      const list = await telegramAPI.getAccounts();
      setAccounts(list);
      setCurrentAccount(prev => prev ? list.find(a => a.id === prev.id) || prev : null);
    } catch (e) { console.error(e); }
  };

  const loadConversations = async (accountId: number) => {
    try {
      const convs = await conversationsAPI.getConversations(accountId);
      setConversations(convs);
      setUnreadCounts(prev => {
        const next = { ...prev };
        const counts: Record<number, number> = {};
        convs.forEach(c => { if (c.unreadCount) counts[c.id] = c.unreadCount; });
        next[accountId] = counts;
        return next;
      });
    } catch (e) { console.error(e); }
  };

  // --- PHASE 3: SMART MEMORY FLUSHING ---
  // This removes (flushes) older chats from the memory to prevent the app from getting slow.
  const updateMessageCache = (id: number, msgs: TelegramMessage[], hasMore: boolean) => {
    messageCache.current[id] = { messages: msgs, hasMore, lastViewed: Date.now() };
    const entries = Object.entries(messageCache.current);
    if (entries.length > MAX_CACHE_SIZE) {
      // Find the least recently used chat (oldest timestamp)
      const oldestId = entries.sort(([, a], [, b]) => a.lastViewed - b.lastViewed)[0][0];
      // DELETE it from memory to reclaim space
      delete messageCache.current[Number(oldestId)];
    }
  };

  const loadMessages = async (id: number) => {
    if (messageCache.current[id]) {
      const c = messageCache.current[id];
      setMessages(c.messages);
      setHasMoreMessages(c.hasMore);
      return;
    }
    setMessages([]);
    setHasMoreMessages(true);
    try {
      const data = await messagesAPI.getMessages(id, 20);
      if (currentConversationRef.current?.id !== id) return;
      setMessages(data);
      setHasMoreMessages(data.length === 20);
      updateMessageCache(id, data, data.length === 20);
    } catch (e) { console.error(e); }
  };

  // --- PHASE 1: INCREMENTAL PAGINATION (FRONTEND) ---
  // This triggers when you scroll near the top, loading older messages one slice at a time.
  const loadMoreMessages = async (id: number) => {
    if (!hasMoreMessages) return;
    try {
      const persistent = messagesRef.current.filter((m: any) => m.telegram_message_id > 0);
      if (persistent.length === 0) return;
      const oldest = Math.min(...persistent.map((m: any) => m.telegram_message_id));
      const older = await messagesAPI.getMessages(id, 20, oldest);
      if (currentConversationRef.current?.id !== id) return;
      if (older.length === 0) { setHasMoreMessages(false); return; }
      setMessages(prev => {
        const ids = new Set(prev.map((m: TelegramMessage) => m.id));
        const fresh = older.filter((m: TelegramMessage) => !ids.has(m.id));
        return [...fresh, ...prev];
      });
      setHasMoreMessages(older.length === 20);
    } catch (e) { console.error(e); }
  };

  // Add ref for messages to avoid stale closure in loadMore
  const messagesRef = useRef<TelegramMessage[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const handleAccountSelect = (acc: TelegramAccount) => {
    setCurrentAccount(acc);
    setMessages([]);
    setCurrentConversation(null);
    setConversations([]);
    if (acc.isConnected) loadConversations(acc.id);
  };

  const handleConversationSelect = (conv: TelegramChat) => {
    setCurrentConversation(conv);
    loadMessages(conv.id);
    if (currentAccount) {
      setUnreadCounts(prev => {
        const next = { ...prev };
        const id = Number(currentAccount.id);
        const by = { ...(next[id] || {}) };
        if (by[conv.id]) by[conv.id] = 0;
        next[id] = by;
        return next;
      });
    }
    messagesAPI.markAsRead(conv.id).catch(e => console.error(e));
  };

  const handleConnectAccount = async (acc: TelegramAccount) => {
    try {
      await telegramAPI.connectAccount(acc.id);
      await loadAccounts();
      if (currentAccount?.id === acc.id) loadConversations(acc.id);
    } catch (e: any) { alert(e.response?.data?.detail || e.message); }
  };

  const handleDisconnectAccount = async (acc: TelegramAccount) => {
    try {
      await telegramAPI.disconnectAccount(acc.id);
      await loadAccounts();
      if (currentAccount?.id === acc.id) { setConversations([]); setCurrentConversation(null); setMessages([]); }
    } catch (e) { console.error(e); }
  };

  const handleEditAccount = (acc: TelegramAccount) => { setEditingAccount(acc); setShowEditAccountModal(true); };

  const handleHardDelete = (acc: TelegramAccount) => {
    setAccountToDelete(acc);
  };

  const confirmHardDelete = async () => {
    if (!accountToDelete) return;
    try {
      await telegramAPI.deleteAccount(accountToDelete.id);
      if (currentAccount?.id === accountToDelete.id) {
        setCurrentAccount(null);
        setCurrentConversation(null);
        setConversations([]);
        setMessages([]);
      }
      await loadAccounts();
    } catch (e) {
      console.error(e);
    } finally {
      setAccountToDelete(null);
    }
  };

  const handleReact = async (mid: number, emoji: string) => {
    if (!currentAccount || !currentAccount.isConnected || !currentConversation) return;
    try {
      setMessages(prev => prev.map(m => m.id === mid ? { ...m, reactions: { ...(m.reactions || {}), [emoji]: ((m.reactions || {})[emoji] || 0) + 1 } } : m));
      await messagesAPI.reactToMessage(mid, emoji);
    } catch (e) { console.error(e); }
  };

  const handleSendMessage = async (text: string, replyId?: number) => {
    if (!currentAccount || !currentAccount.isConnected || !currentConversation) return;
    const replied = replyId ? messages.find(m => m.telegram_message_id === replyId) : null;
    const temp: TelegramMessage = {
      id: -Date.now(), conversation_id: currentConversation.id, telegram_message_id: 0,
      sender_name: currentAccount.displayName || currentAccount.accountName,
      sender_username: currentAccount.accountName, peer_title: currentConversation.title || 'Chat',
      type: 'text', original_text: text, translated_text: text,
      source_language: currentAccount.targetLanguage, target_language: currentAccount.sourceLanguage,
      created_at: new Date().toISOString(), is_outgoing: true, reply_to_telegram_id: replyId,
      reply_to_text: replied ? (replied.translated_text || replied.original_text) : undefined,
      reply_to_sender: replied ? replied.sender_name : undefined
    };
    setMessages(prev => [...prev, temp]);
    try {
      const res = await messagesAPI.sendMessage(currentConversation.id, text, currentAccount?.isTranslationEnabled, replyId);
      if (res && res.id) setMessages(prev => prev.map(m => m.id === temp.id ? res : m));
    } catch (e) { setMessages(prev => prev.filter(m => m.id !== temp.id)); alert('Failed'); }
  };

  const handleSendMedia = async (file: File, caption: string) => {
    if (!currentAccount || !currentAccount.isConnected || !currentConversation) return;
    const tid = -Date.now();
    const temp: TelegramMessage = {
      id: tid, conversation_id: currentConversation.id, telegram_message_id: 0,
      sender_name: currentAccount.displayName || currentAccount.accountName,
      sender_username: currentAccount.accountName, peer_title: currentConversation.title || 'Chat',
      type: file.type.startsWith('image/') ? 'photo' : (file.type.startsWith('video/') ? 'video' : 'document'),
      original_text: caption, translated_text: caption, created_at: new Date().toISOString(),
      is_outgoing: true, has_media: true, media_file_name: file.name
    };
    setMessages(prev => [...prev, temp]);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('conversation_id', currentConversation.id.toString()); fd.append('caption', caption);
      const res = await messagesAPI.sendMedia(fd);
      if (res && res.id) setMessages(prev => prev.map(m => m.id === tid ? res : m));
    } catch (e) { setMessages(prev => prev.filter(m => m.id !== tid)); alert('Failed'); }
  };

  const handleLeaveConversation = async (id: number) => {
    try {
      await telegramAPI.leaveConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (messageCache.current[id]) delete messageCache.current[id];
      if (currentConversation?.id === id) { setCurrentConversation(null); setMessages([]); }
    } catch (e) { console.error(e); }
  };

  const handleDeleteConversation = async (id: number) => {
    try {
      await telegramAPI.deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (messageCache.current[id]) delete messageCache.current[id];
      if (currentConversation?.id === id) { setCurrentConversation(null); setMessages([]); }
    } catch (e) { console.error(e); }
  };

  const handleDeleteMessages = async (id: number, mids: number[], revoke: boolean) => {
    try { await messagesAPI.deleteMessages(id, mids, revoke); setMessages(prev => prev.filter(m => !mids.includes(m.id))); } catch (e) { throw e; }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center transition-colors duration-500">
        <div className="text-center animate-fade-in">
          <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 dark:text-gray-500">Initializing Experience</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Router>
        <Routes>
          <Route path="/login" element={<LoginForm onSwitchToRegister={() => setAuthMode('register')} />} />
          <Route path="/logout" element={<Logout />} />
          <Route path="/register" element={<RegisterForm onSwitchToLogin={() => setAuthMode('login')} />} />
          <Route path="*" element={authMode === 'login' ? <LoginForm onSwitchToRegister={() => setAuthMode('register')} /> : <RegisterForm onSwitchToLogin={() => setAuthMode('login')} />} />
        </Routes>
      </Router>
    );
  }

  return (
    <Router>
      <div className="h-screen flex flex-col bg-telegram-side-list-light dark:bg-telegram-side-list-dark transition-colors duration-500 text-gray-900 dark:text-white">
        <Header onStartTour={() => setShowTour(true)} />
        <NavigationHandler onNavigate={handleNavigateToConversation} />
        <Routes>
          <Route path="/auto-responder" element={<AutoResponderPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/campaigns" element={<CampaignPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/advanced-settings" element={<AdvancedSettings />} />
          <Route path="/crm" element={<CRMDashboard />} />
          <Route path="/instagram-leads" element={<InstagramLeadGenerator />} />
          <Route path="/" element={
            <div className="flex-1 flex overflow-hidden relative">
              {/* Step 1: Account Selection (Sidebar) */}
              <div className={`${currentAccount ? 'hidden xl:flex' : 'flex'} w-full xl:w-64 h-full shrink-0 border-r border-gray-100 dark:border-white/5 flex-col`}>
                <Sidebar
                  accounts={accounts}
                  currentAccount={currentAccount}
                  onAccountSelect={handleAccountSelect}
                  onAddAccount={() => setShowAddAccountModal(true)}
                  onConnect={handleConnectAccount}
                  onDisconnect={handleDisconnectAccount}
                  onEdit={handleEditAccount}
                  onDelete={handleHardDelete}
                  onProfile={(account) => { setProfileAccount(account); setShowProfileModal(true); }}
                  onSessions={(account) => { setSessionsAccount(account); setShowSessionsModal(true); }}
                  unreadCounts={unreadCounts}
                  hideOriginal={hideOriginal}
                  onToggleHideOriginal={() => setHideOriginal(!hideOriginal)}
                />
              </div>

              {/* Step 2: Chat Selection (ConversationList) */}
              {currentAccount && (
                <div className={`${currentConversation ? 'hidden xl:flex' : 'flex'} w-full xl:w-[320px] 2xl:w-[360px] h-full shrink-0 border-r border-gray-100 dark:border-white/5 flex-col`}>
                  <ConversationList
                    conversations={conversations}
                    currentConversation={currentConversation}
                    onConversationSelect={handleConversationSelect}
                    onDeleteConversation={handleDeleteConversation}
                    isConnected={currentAccount.isConnected}
                    unreadCounts={unreadCounts[currentAccount.id] || {}}
                    accountId={currentAccount.id}
                    onConversationCreated={() => loadConversations(currentAccount.id)}
                    isTranslationEnabled={currentAccount.isTranslationEnabled}
                    hideOriginal={hideOriginal}
                    onBack={() => setCurrentAccount(null)}
                  />
                </div>
              )}

              {/* Step 3: Message View (ChatWindow) */}
              <div className={`${currentConversation ? 'flex' : 'hidden xl:flex'} flex-1 h-full flex-col`}>
                <ChatWindow
                  messages={messages}
                  currentConversation={currentConversation}
                  currentAccount={currentAccount}
                  isConnected={currentAccount?.isConnected || false}
                  sourceLanguage={currentAccount?.sourceLanguage || 'auto'}
                  targetLanguage={currentAccount?.targetLanguage || 'en'}
                  onSendMessage={handleSendMessage}
                  onSendMedia={handleSendMedia}
                  onJoinConversation={async (id) => {
                    try {
                      await telegramAPI.joinConversation(id);
                      if (currentAccount) {
                        await loadConversations(currentAccount.id);
                        setCurrentConversation(prev => prev && prev.id === id ? { ...prev, is_hidden: false } : prev);
                        loadMessages(id);
                        setTimeout(() => { if (currentConversationRef.current?.id === id) loadMessages(id); }, 5000);
                      }
                    } catch (e) { console.error(e); }
                  }}
                  onToggleMute={async (id) => {
                    try {
                      const result = await telegramAPI.toggleMute(id);
                      setCurrentConversation(prev => prev && prev.id === id ? { ...prev, is_muted: result.is_muted } : prev);
                      setConversations(prev => prev.map(c => c.id === id ? { ...c, is_muted: result.is_muted } : c));
                    } catch (e) { console.error(e); }
                  }}
                  onLeaveConversation={handleLeaveConversation}
                  onDeleteMessages={handleDeleteMessages}
                  hasMoreMessages={hasMoreMessages}
                  onLoadMoreMessages={currentConversation ? () => loadMoreMessages(currentConversation.id) : undefined}
                  onReact={handleReact}
                  scheduledMessages={scheduledMessages}
                  setScheduledMessages={setScheduledMessages}
                  conversations={conversations}
                  isTranslationEnabled={currentAccount?.isTranslationEnabled ?? true}
                  hideOriginal={hideOriginal}
                  onBack={() => setCurrentConversation(null)}
                />
              </div>
            </div>
          } />
        </Routes>

        <AddAccountModal isOpen={showAddAccountModal} onClose={() => setShowAddAccountModal(false)} onSuccess={loadAccounts} />
        <EditAccountModal isOpen={showEditAccountModal} account={editingAccount} onClose={() => { setShowEditAccountModal(false); setEditingAccount(null); }} onSuccess={loadAccounts} />
        <ProfileModal 
          isOpen={showProfileModal} 
          account={profileAccount} 
          onClose={() => { setShowProfileModal(false); setProfileAccount(null); }} 
          onAccountUpdate={(updated) => {
            setAccounts(prev => prev.map(a => Number(a.id) === Number(updated.id) ? updated : a));
            if (currentAccount && Number(currentAccount.id) === Number(updated.id)) {
              setCurrentAccount(updated);
            }
            setProfileAccount(updated);
          }}
        />
        <ActiveSessionsModal isOpen={showSessionsModal} account={sessionsAccount} onClose={() => { setShowSessionsModal(false); setSessionsAccount(null); }} />
        <ConfirmModal
          isOpen={!!accountToDelete}
          onClose={() => setAccountToDelete(null)}
          onConfirm={confirmHardDelete}
          title="Delete Account"
          message={`Are you sure you want to delete "${accountToDelete?.displayName || accountToDelete?.accountName}"? This action cannot be undone.`}
          confirmText="Delete"
          type="danger"
        />
        <UserGuideTour isOpen={showTour} onClose={() => setShowTour(false)} hasAccounts={accounts.length > 0} hasConversation={!!currentConversation} currentStep={tourStep} onStepChange={setTourStep} />

        {notification && (
          <div className="fixed bottom-8 right-8 z-[9000] animate-slide-up pointer-events-none">
            <div
              onClick={() => handleNotificationClick(notification.accountId, notification.conversationId)}
              className="bg-white dark:bg-[#1c242d] border border-gray-100 dark:border-gray-700/30 shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)] rounded-2xl p-4 w-[360px] pointer-events-auto cursor-pointer border-l-4 border-l-blue-500 hover:translate-y-[-2px] transition-all duration-300 group"
            >
              <div className="flex items-center space-x-4">
                <div className="relative flex-shrink-0">
                  {notification.avatar ? (
                    <img src={notification.avatar} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-gray-100 dark:border-gray-700" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-black text-xl shadow-lg border-2 border-gray-100 dark:border-gray-700">
                      {notification.title.charAt(0)}
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-500 rounded-full border-2 border-white dark:border-[#1c242d] flex items-center justify-center">
                    <Zap className="w-3 h-3 text-white fill-white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0 pr-6">
                  <h4 className="text-[17px] font-bold text-gray-900 dark:text-white tracking-tight truncate leading-tight mb-1">{notification.title}</h4>
                  <p className="text-[14px] font-medium text-gray-500 dark:text-gray-400 truncate leading-snug">{notification.message}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setNotification(null); }}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Router>
  );
}

export default App;
