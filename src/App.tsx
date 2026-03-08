import { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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

// Services
import { telegramAPI, conversationsAPI, messagesAPI } from './services/api';
import { Zap, X } from 'lucide-react';

// Types
import type { TelegramAccount, TelegramMessage, TelegramChat, ScheduledMessage } from './types';

function App() {
  /**
   * AUTHENTICATION STATE
   * Manages user login status and whether they are currently viewing the login or register form.
   */
  const { isAuthenticated, isLoading } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  /**
   * REAL-TIME UPDATES (WEBSOCKET)
   * Connects to the backend via WebSocket to receive instant updates like new messages.
   */
  const { onMessage } = useSocket();

  /**
   * APPLICATION DATA STATE
   * Tracks Telegram accounts, active conversations, message history, and UI visibility.
   */
  const [accounts, setAccounts] = useState<TelegramAccount[]>([]);
  const [currentAccount, setCurrentAccount] = useState<TelegramAccount | null>(null);
  const [conversations, setConversations] = useState<TelegramChat[]>([]);
  const [currentConversation, setCurrentConversation] = useState<TelegramChat | null>(null);
  const [messages, setMessages] = useState<TelegramMessage[]>([]);

  // Modal visibility states
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [showEditAccountModal, setShowEditAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<TelegramAccount | null>(null);

  // Unread badge tracking for accounts and conversations
  const [unreadCounts, setUnreadCounts] = useState<Record<number, Record<number, number>>>({});

  // Flash notifications (toasts)
  const [notification, setNotification] = useState<{ title: string; message: string; id: number; accountId: number; conversationId: number; avatar?: string } | null>(null);

  // Interactive User Tour state
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  // Pagination and auxiliary states
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileAccount, setProfileAccount] = useState<TelegramAccount | null>(null);
  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [sessionsAccount, setSessionsAccount] = useState<TelegramAccount | null>(null);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [accountToDelete, setAccountToDelete] = useState<TelegramAccount | null>(null);

  // Refs for audio and persistent tracking
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const processedMessageIds = useRef<Set<number>>(new Set());

  // --- FEATURE: SMART MEMORY MANAGEMENT (PHASE 3) ---
  // This unloads old chat data and keeps only the most recent 5 chats in memory 
  // to maintain high performance even with thousands of messages.
  const messageCache = useRef<Record<number, { messages: TelegramMessage[], hasMore: boolean, lastViewed: number }>>({});
  const MAX_CACHE_SIZE = 5;

  /**
   * STATE REFS
   * Used to access the latest state within WebSocket handlers to avoid stale closures.
   */
  const currentAccountRef = useRef<TelegramAccount | null>(currentAccount);
  const currentConversationRef = useRef<TelegramChat | null>(currentConversation);
  const conversationsRef = useRef<TelegramChat[]>(conversations);

  useEffect(() => { currentAccountRef.current = currentAccount; }, [currentAccount]);
  useEffect(() => { currentConversationRef.current = currentConversation; }, [currentConversation]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  /**
   * INITIALIZATION
   * Loads Telegram accounts after the user is authenticated.
   */
  useEffect(() => {
    if (isAuthenticated) loadAccounts();
  }, [isAuthenticated]);

  /**
   * NOTIFICATION SYSTEM SETUP
   * Pre-loads the sound effect and requests permission for browser push notifications.
   */
  useEffect(() => {
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
  }, []);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Helper to play notification sound
  const playNotificationSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.log('Audio play blocked:', e));
    }
  }, []);

  /**
   * NOTIFICATION CLICK HANDLER
   * When a notification is clicked, this switches to the corresponding account and chat automatically.
   */
  const handleNotificationClick = useCallback(async (accId: number, convId: number) => {
    const acc = accounts.find(a => Number(a.id) === accId);
    if (!acc) return;
    if (!currentAccountRef.current || Number(currentAccountRef.current.id) !== accId) {
      setCurrentAccount(acc);
      setMessages([]);
      setCurrentConversation(null);
      setConversations([]);
      if (acc.isConnected) {
        try {
          const convs = await conversationsAPI.getConversations(accId);
          setConversations(convs);
          const target = convs.find(c => Number(c.id) === convId);
          if (target) {
            setCurrentConversation(target);
          }
        } catch (e) { console.error(e); }
      }
    } else {
      const target = conversationsRef.current.find(c => Number(c.id) === convId);
      if (target) setCurrentConversation(target);
    }
    setNotification(null);
  }, [accounts]);

  // Triggers native browser push notifications
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

  /**
   * WS MESSAGE LISTENER (CORE REAL-TIME LOGIC)
   * Listens for all incoming events from the backend (new messages, reactions, deletions).
   */
  useEffect(() => {
    const unsubscribe = onMessage((data: any) => {
      // HANDLE NEW MESSAGE EVENT
      if (data?.type === 'new_message' && data.message) {
        const incomingAccountId = Number(data.account_id);
        const incomingConversationId = Number(data.message.conversation_id);
        const activeAcc = currentAccountRef.current;
        const activeConv = currentConversationRef.current;
        const activeAccountId = activeAcc ? Number(activeAcc.id) : null;
        const activeConversationId = activeConv ? Number(activeConv.id) : null;

        // Prevent duplicate processing
        if (data.message.id && processedMessageIds.current.has(data.message.id)) return;
        if (data.message.id) {
          processedMessageIds.current.add(data.message.id);
          if (processedMessageIds.current.size > 500) {
            const first = processedMessageIds.current.values().next().value;
            if (first !== undefined) processedMessageIds.current.delete(first);
          }
        }

        const isActiveConv = activeAccountId === incomingAccountId && activeConversationId === incomingConversationId;

        // Handle incoming unread messages (sounds, notifications, counters)
        if (!data.message.is_outgoing) {
          const isMuted = conversationsRef.current.some(c => Number(c.id) === incomingConversationId && c.is_muted);
          if (!isMuted) {
            playNotificationSound();
            if (!isActiveConv) {
              const title = data.message.sender_name || data.message.peer_title || 'New Message';
              const body = data.message.original_text || 'Sent an attachment';
              const avatar = data.message.sender_avatar || undefined;
              setNotification({ title, message: body, id: Date.now(), accountId: incomingAccountId, conversationId: incomingConversationId, avatar });
              if (!document.hasFocus()) showNativeNotification(title, body, incomingAccountId, incomingConversationId, avatar);
              setTimeout(() => setNotification(null), 8000);
            }
          }
        }

        // Update global unread counters
        setUnreadCounts(prev => {
          const next = { ...prev };
          const byConv = { ...(next[incomingAccountId] || {}) };
          if (!isActiveConv) byConv[incomingConversationId] = (byConv[incomingConversationId] || 0) + 1;
          else byConv[incomingConversationId] = 0;
          next[incomingAccountId] = byConv;
          return next;
        });

        // Update conversation list snapshot (move chat to top if new message arrived)
        if (activeAccountId === incomingAccountId) {
          setConversations(prev => {
            const index = prev.findIndex(c => Number(c.id) === incomingConversationId);
            if (index === -1) return [{ id: incomingConversationId, title: data.message.peer_title || 'Unknown', type: 'private', lastMessage: data.message }, ...prev] as TelegramChat[];
            const updated = [...prev];
            const conversation = { ...updated[index], lastMessage: data.message };
            updated.splice(index, 1);
            return [conversation, ...updated];
          });

          // If viewing this chat, push message directly to the screen
          if (activeConversationId === incomingConversationId) {
            setMessages(prev => {
              const isDuplicate = prev.some(msg => Number(msg.id) === Number(data.message.id) || (Number(msg.telegram_message_id) === Number(data.message.telegram_message_id) && Number(msg.telegram_message_id) !== 0));
              if (isDuplicate) return prev;
              const filtered = prev.filter(msg => !(msg.id < 0 && msg.original_text === data.message.original_text));
              return [...filtered, data.message];
            });
          }
        }

        // Update the Phase 3 memory cache
        if (messageCache.current[incomingConversationId]) {
          const cached = messageCache.current[incomingConversationId];
          const isDup = cached.messages.some((msg: TelegramMessage) => Number(msg.id) === Number(data.message.id) || (Number(msg.telegram_message_id) === Number(data.message.telegram_message_id) && Number(msg.telegram_message_id) !== 0));
          if (!isDup) {
            const filt = cached.messages.filter((msg: TelegramMessage) => !(msg.id < 0 && msg.original_text === data.message.original_text));
            messageCache.current[incomingConversationId] = { ...cached, messages: [...filt, data.message] };
          }
        }
      }

      // HANDLE REACTIONS
      if (data?.type === 'message_reaction') {
        const messageId = Number(data.message_id);
        const reactions = data.reactions;
        setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, reactions } : msg));
      }

      // HANDLE DELETIONS
      if (data?.type === 'conversation_deleted') {
        const delId = Number(data.conversation_id);
        setConversations(prev => prev.filter(c => c.id !== delId));
        if (currentConversationRef.current?.id === delId) { setCurrentConversation(null); setMessages([]); }
      }
      if (data?.type === 'messages_deleted') {
        const delId = Number(data.conversation_id);
        const delIds = data.message_ids as number[];
        if (currentConversationRef.current?.id === delId) setMessages(prev => prev.filter(msg => !delIds.includes(msg.id)));
      }
    });
    return unsubscribe;
  }, [onMessage, playNotificationSound, showNativeNotification]);

  /**
   * DATA FETCHING HELPERS
   */
  const loadAccounts = async () => {
    try {
      const list = await telegramAPI.getAccounts();
      setAccounts(list);
      // Synchronize current active account if it was already selected
      setCurrentAccount(prev => prev ? list.find(a => a.id === prev.id) || prev : null);
    } catch (e) { console.error(e); }
  };

  const loadConversations = async (accountId: number) => {
    try {
      const convs = await conversationsAPI.getConversations(accountId);
      setConversations(convs);

      // Sync unread badge counts from backend data
      setUnreadCounts(prev => {
        const next = { ...prev };
        const counts: Record<number, number> = {};
        convs.forEach(c => { if (c.unreadCount) counts[c.id] = c.unreadCount; });
        next[accountId] = counts;
        return next;
      });
    } catch (e) { console.error(e); }
  };

  /**
   * MEMORY CACHE UTILITY
   * Part of Phase 3 performance scaling. Prevents memory leaks by capping the number of chats stored.
   */
  const updateMessageCache = (id: number, msgs: TelegramMessage[], hasMore: boolean) => {
    messageCache.current[id] = { messages: msgs, hasMore, lastViewed: Date.now() };
    const entries = Object.entries(messageCache.current);
    if (entries.length > MAX_CACHE_SIZE) {
      const oldestId = entries.sort(([, a], [, b]) => a.lastViewed - b.lastViewed)[0][0];
      delete messageCache.current[Number(oldestId)];
    }
  };

  /**
   * MESSAGE LOADING (CORE)
   * Fetches the first page of messages for a chat, or pulls them from memory cache if available.
   */
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

  /**
   * INFINITE SCROLL (PHASE 1)
   * Fetches older messages incrementally as the user scrolls up.
   */
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

  const messagesRef = useRef<TelegramMessage[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  /**
   * UI ACTION HANDLERS
   */
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

    // Clear unread count locally for instant feedback
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
    // Mark as read in backend
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

    // Create optimistic temporary message for instant UI feedback
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
      const res = await messagesAPI.sendMessage(currentConversation.id, text, true, replyId);
      // Replace optimistic message with the real one from backend
      if (res && res.id) setMessages(prev => prev.map(m => m.id === temp.id ? res : m));
    } catch (e) {
      // Rollback on failure
      setMessages(prev => prev.filter(m => m.id !== temp.id));
      alert('Failed to send message');
    }
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
      const fd = new FormData();
      fd.append('file', file);
      fd.append('conversation_id', currentConversation.id.toString());
      fd.append('caption', caption);
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
    try {
      await messagesAPI.deleteMessages(id, mids, revoke);
      setMessages(prev => prev.filter(m => !mids.includes(m.id)));
    } catch (e) { throw e; }
  };

  /**
   * RENDER LOGIC
   * Splits UI between Loading state, Guest/Auth forms, and the main Dashboard.
   */
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
        <Routes>
          <Route path="/auto-responder" element={<AutoResponderPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/" element={
            <div className="flex-1 flex overflow-hidden">
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
              />

              {currentAccount && (
                <ConversationList
                  conversations={conversations}
                  currentConversation={currentConversation}
                  onConversationSelect={handleConversationSelect}
                  onDeleteConversation={handleDeleteConversation}
                  isConnected={currentAccount.isConnected}
                  unreadCounts={unreadCounts[currentAccount.id] || {}}
                  accountId={currentAccount.id}
                  onConversationCreated={() => loadConversations(currentAccount.id)}
                />
              )}

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
                      // Fallback refresh for server lag
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
                onDeleteConversation={handleDeleteConversation}
                onDeleteMessages={handleDeleteMessages}
                hasMoreMessages={hasMoreMessages}
                onLoadMoreMessages={currentConversation ? () => loadMoreMessages(currentConversation.id) : undefined}
                onReact={handleReact}
                scheduledMessages={scheduledMessages}
                setScheduledMessages={setScheduledMessages}
                conversations={conversations}
              />
            </div>
          } />
        </Routes>

        {/* Global Modals for Management */}
        <AddAccountModal isOpen={showAddAccountModal} onClose={() => setShowAddAccountModal(false)} onSuccess={loadAccounts} />
        <EditAccountModal isOpen={showEditAccountModal} account={editingAccount} onClose={() => { setShowEditAccountModal(false); setEditingAccount(null); }} onSuccess={loadAccounts} />
        <ProfileModal isOpen={showProfileModal} account={profileAccount} onClose={() => { setShowProfileModal(false); setProfileAccount(null); }} />
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

        {/* Real-time Toast Notifications */}
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
