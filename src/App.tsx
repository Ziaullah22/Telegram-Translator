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
import AddAccountModal from './components/Modals/AddAccountModal';
import EditAccountModal from './components/Modals/EditAccountModal';
import AutoResponderPage from './components/AutoResponder/AutoResponderPage';
import UserGuideTour from './components/Modals/UserGuideTour';
import ProfileModal from './components/Modals/ProfileModal';
import ActiveSessionsModal from './components/Modals/ActiveSessionsModal';

// Services
import { telegramAPI, conversationsAPI, messagesAPI } from './services/api';
import { Zap, X } from 'lucide-react';

// Types
import type { TelegramAccount, TelegramMessage, TelegramChat } from './types';

function App() {
  // Auth state
  const { isAuthenticated, isLoading } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Socket connection
  const { onMessage } = useSocket();

  // App state
  const [accounts, setAccounts] = useState<TelegramAccount[]>([]);
  const [currentAccount, setCurrentAccount] = useState<TelegramAccount | null>(null);
  const [conversations, setConversations] = useState<TelegramChat[]>([]);
  const [currentConversation, setCurrentConversation] = useState<TelegramChat | null>(null);
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [showEditAccountModal, setShowEditAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<TelegramAccount | null>(null);
  // unreadCounts[accountId][conversationId] = count
  const [unreadCounts, setUnreadCounts] = useState<Record<number, Record<number, number>>>({});
  const [notification, setNotification] = useState<{ title: string; message: string; id: number; accountId: number; conversationId: number; avatar?: string } | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileAccount, setProfileAccount] = useState<TelegramAccount | null>(null);
  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [sessionsAccount, setSessionsAccount] = useState<TelegramAccount | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const processedMessageIds = useRef<Set<number>>(new Set());

  // Load accounts on mount
  useEffect(() => {
    if (isAuthenticated) {
      loadAccounts();
    }
  }, [isAuthenticated]);

  // Refs for current state to be used in the socket listener without stale closures
  const currentAccountRef = useRef<TelegramAccount | null>(currentAccount);
  const currentConversationRef = useRef<TelegramChat | null>(currentConversation);
  const conversationsRef = useRef<TelegramChat[]>(conversations);

  useEffect(() => {
    currentAccountRef.current = currentAccount;
  }, [currentAccount]);

  useEffect(() => {
    currentConversationRef.current = currentConversation;
  }, [currentConversation]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Handle notification sound
  useEffect(() => {
    // Create audio once
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
  }, []);

  // Hook into native notifications
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const playNotificationSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.log('Audio play blocked:', e));
    }
  }, []);

  const showNativeNotification = useCallback((title: string, body: string, accountId: number, conversationId: number, icon?: string) => {
    if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification(title, {
        body: body,
        icon: icon || '/logo192.png',
        tag: `chat-${conversationId}`,
        // @ts-ignore - renotify is supported by modern browsers
        renotify: true,
        requireInteraction: true // Keep it showing like Telegram
      });

      n.onclick = (e) => {
        e.preventDefault();
        window.focus();
        // Force focus for Chrome/Edge
        if (window.opener) {
          window.opener.focus();
        }
        handleNotificationClick(accountId, conversationId);
        n.close();
      };
    }
  }, []);

  // Socket event listeners
  useEffect(() => {
    const unsubscribe = onMessage((data: any) => {
      // DEBUG: console.log('WebSocket Event:', data);

      if (data?.type === 'new_message' && data.message) {
        // Force to numbers for robust comparison
        const incomingAccountId = Number(data.account_id);
        const incomingConversationId = Number(data.message.conversation_id);

        // Use refs to get absolute latest values
        const activeAcc = currentAccountRef.current;
        const activeConv = currentConversationRef.current;
        const activeAccountId = activeAcc ? Number(activeAcc.id) : null;
        const activeConversationId = activeConv ? Number(activeConv.id) : null;

        console.log(`Real-time match check: Incoming(Acc:${incomingAccountId}, Conv:${incomingConversationId}) vs Active(Acc:${activeAccountId}, Conv:${activeConversationId})`);

        // Deduplicate using the permanent message ID
        if (data.message.id && processedMessageIds.current.has(data.message.id)) {
          return;
        }
        if (data.message.id) {
          processedMessageIds.current.add(data.message.id);
          // Keep set size manageable
          if (processedMessageIds.current.size > 500) {
            const firstElement = processedMessageIds.current.values().next().value;
            if (firstElement !== undefined) processedMessageIds.current.delete(firstElement);
          }
        }

        // Calculate total unread count for UI if needed
        const isActiveConv = activeAccountId === incomingAccountId && activeConversationId === incomingConversationId;

        // Play sound and show notification for incoming messages
        if (!data.message.is_outgoing) {
          const isMuted = conversationsRef.current.some(c => Number(c.id) === incomingConversationId && c.is_muted);

          if (!isMuted) {
            playNotificationSound();

            if (!isActiveConv) {
              const title = data.message.sender_name || data.message.peer_title || 'New Message';
              const body = data.message.original_text || 'Sent an attachment';
              const avatar = data.message.sender_avatar || undefined;

              setNotification({
                title: title,
                message: body,
                id: Date.now(),
                accountId: incomingAccountId,
                conversationId: incomingConversationId,
                avatar: avatar
              });

              // Show native notification if window is blurred
              if (!document.hasFocus()) {
                showNativeNotification(title, body, incomingAccountId, incomingConversationId, avatar);
              }

              // Auto hide in-app notification
              setTimeout(() => setNotification(null), 8000);
            }
          }
        }

        // Update central unreadCounts map
        setUnreadCounts(prev => {
          const next = { ...prev };
          const byConv = { ...(next[incomingAccountId] || {}) };

          if (!isActiveConv) {
            byConv[incomingConversationId] = (byConv[incomingConversationId] || 0) + 1;
            next[incomingAccountId] = byConv;
          } else {
            byConv[incomingConversationId] = 0;
            next[incomingAccountId] = byConv;
          }
          return next;
        });

        // If message belongs to the currently selected account
        if (activeAccountId === incomingAccountId) {
          setConversations(prev => {
            const index = prev.findIndex(c => Number(c.id) === incomingConversationId);

            if (index === -1) {
              // New conversation, add to top
              return [{
                id: incomingConversationId,
                title: data.message.peer_title || 'Unknown',
                type: 'private',
                lastMessage: data.message,
              }, ...prev] as TelegramChat[];
            }

            // Existing conversation, update and move to top
            const updated = [...prev];
            const conversation = {
              ...updated[index],
              lastMessage: data.message,
            };
            updated.splice(index, 1); // remove from old position
            return [conversation, ...updated]; // add to top
          });

          // If current view is the same conversation, append message
          if (activeConversationId === incomingConversationId) {
            setMessages(prev => {
              // Check if message already exists
              const isDuplicate = prev.some(msg =>
                Number(msg.id) === Number(data.message.id) ||
                (Number(msg.telegram_message_id) === Number(data.message.telegram_message_id) && Number(msg.telegram_message_id) !== 0)
              );
              if (isDuplicate) return prev;

              // Filter out the optimistic temp message for the same text
              const filtered = prev.filter(msg =>
                !(msg.id < 0 && msg.original_text === data.message.original_text)
              );
              return [...filtered, data.message];
            });
          }
        }
      }

      if (data?.type === 'conversation_deleted') {
        const deletedConversationId = Number(data.conversation_id);
        setConversations(prev => prev.filter(c => c.id !== deletedConversationId));
        if (currentConversationRef.current?.id === deletedConversationId) {
          setCurrentConversation(null);
          setMessages([]);
        }
      }

      if (data?.type === 'messages_deleted') {
        const deletedConversationId = Number(data.conversation_id);
        const deletedIds = data.message_ids as number[];

        // If current view is the same conversation, remove messages
        if (currentConversationRef.current?.id === deletedConversationId) {
          setMessages(prev => prev.filter(msg => !deletedIds.includes(msg.id)));
        }
      }

      if (data?.type === 'account_deleted') {
        const deletedAccountId = Number(data.account_id);
        setAccounts(prev => prev.filter(acc => acc.id !== deletedAccountId));
        if (currentAccountRef.current?.id === deletedAccountId) {
          setCurrentAccount(null);
          setConversations([]);
          setMessages([]);
        }
      }

      // Handle connection/disconnection status updates
      if (data?.type === 'account_connected' && typeof data.account_id === 'number') {
        const accId = Number(data.account_id);
        setAccounts(prev => prev.map(acc => acc.id === accId ? { ...acc, isConnected: true } : acc));
      }
      if (data?.type === 'account_disconnected' && typeof data.account_id === 'number') {
        const accId = Number(data.account_id);
        setAccounts(prev => prev.map(acc => acc.id === accId ? { ...acc, isConnected: false } : acc));
      }
      if (data?.type === 'account_updated' && data.account) {
        const updatedAcc = data.account;
        // Map backend snake_case to frontend camelCase if necessary (check types)
        const camelAcc = {
          ...updatedAcc,
          isConnected: updatedAcc.is_connected // backend uses is_connected
        };

        setAccounts(prev => prev.map(acc => acc.id === updatedAcc.id ? { ...acc, ...camelAcc } : acc));
        if (currentAccountRef.current?.id === updatedAcc.id) {
          setCurrentAccount(prev => prev ? { ...prev, ...camelAcc } : null);
        }
      }
    });

    return unsubscribe;
  }, [onMessage]); // Removed currentAccount/currentConversation from deps to avoid frequent listener resets

  const loadAccounts = async () => {
    try {
      const accountsList = await telegramAPI.getAccounts();
      setAccounts(accountsList);

      // CRITICAL: Update currentAccount if it's already selected to ensure UI updates instantly
      setCurrentAccount(prev => {
        if (!prev) return null;
        const updated = accountsList.find(a => a.id === prev.id);
        return updated || prev;
      });

      // Initialize unreadCounts for all accounts based on total count from backend
      setUnreadCounts(prev => {
        const next = { ...prev };
        accountsList.forEach(acc => {
          // Use a special key -1 to store the initial total unread count for each account
          // This will be replaced by real per-conversation counts once an account is selected.
          const currentTotal = Object.values(next[acc.id] || {}).reduce((s, n) => s + (n || 0), 0);
          if (acc.unreadCount && acc.unreadCount > 0 && currentTotal === 0) {
            next[acc.id] = { [-1]: acc.unreadCount };
          }
        });
        return next;
      });
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  const loadConversations = async (accountId: number) => {
    try {
      const conversations = await conversationsAPI.getConversations(accountId);
      setConversations(conversations);

      // Update unread counts in state
      setUnreadCounts(prev => {
        const next = { ...prev };
        const accCounts: Record<number, number> = {};
        conversations.forEach(c => {
          if (c.unreadCount) accCounts[c.id] = c.unreadCount;
        });
        next[accountId] = accCounts;
        return next;
      });
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const loadMessages = async (conversationId: number) => {
    try {
      const messages = await messagesAPI.getMessages(conversationId, 30);
      setMessages(messages);
      setHasMoreMessages(messages.length === 30);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const loadMoreMessages = async (conversationId: number) => {
    if (!hasMoreMessages) return;
    try {
      // Find the oldest message ID currently loaded
      const oldestId = messages.length > 0 ? Math.min(...messages.map((m: any) => m.id)) : undefined;
      const older = await messagesAPI.getMessages(conversationId, 30, oldestId);
      if (older.length === 0) {
        setHasMoreMessages(false);
        return;
      }
      setMessages(prev => [...older, ...prev]);
      setHasMoreMessages(older.length === 30);
    } catch (error) {
      console.error('Failed to load more messages:', error);
    }
  };

  const handleAccountSelect = (account: TelegramAccount) => {
    setCurrentAccount(account);
    setMessages([]); // Clear messages when switching accounts
    setCurrentConversation(null); // Clear current conversation
    setConversations([]); // Clear conversations

    // Only load conversations if the account is connected
    if (account.isConnected) {
      loadConversations(account.id);
    }
  };

  const handleConversationSelect = (conversation: TelegramChat) => {
    setCurrentConversation(conversation);
    setMessages([]); // Clear messages when switching conversations

    // Reset unread count in central map for this conversation
    if (currentAccount) {
      setUnreadCounts(prev => {
        const next = { ...prev };
        const byConv = { ...(next[currentAccount.id] || {}) };
        if (byConv[conversation.id]) byConv[conversation.id] = 0;
        next[currentAccount.id] = byConv;
        return next;
      });
    }

    // Load messages regardless of hidden status
    loadMessages(conversation.id);

    // Mark as read in backend
    messagesAPI.markAsRead(conversation.id).catch(err =>
      console.error('Failed to mark as read:', err)
    );
  };

  const handleNotificationClick = async (accountId: number, conversationId: number) => {
    // 1. Find the account
    const targetAccount = accounts.find(a => Number(a.id) === accountId);
    if (!targetAccount) return;

    // 2. Select account if it's not the current one
    if (!currentAccount || Number(currentAccount.id) !== accountId) {
      setCurrentAccount(targetAccount);
      setMessages([]);
      setCurrentConversation(null);
      setConversations([]);

      // Load target account conversations
      if (targetAccount.isConnected) {
        try {
          const convs = await conversationsAPI.getConversations(accountId);
          setConversations(convs);

          // Find conversation in newly loaded list
          const targetConv = convs.find(c => Number(c.id) === conversationId);
          if (targetConv) {
            handleConversationSelect(targetConv);
          }
        } catch (error) {
          console.error('Failed to load convs during notification click:', error);
        }
      }
    } else {
      // Already on the right account, find and select conversation
      const targetConv = conversations.find(c => Number(c.id) === conversationId);
      if (targetConv) {
        handleConversationSelect(targetConv);
      } else {
        // Fallback: reload conversations and try to find the target
        try {
          const convs = await conversationsAPI.getConversations(accountId);
          setConversations(convs);
          const freshTarget = convs.find(c => Number(c.id) === conversationId);
          if (freshTarget) {
            handleConversationSelect(freshTarget);
          }
        } catch (error) {
          console.error('Failed to find conversation during refresh:', error);
        }
      }
    }
    setNotification(null); // Clear notification after click
  };

  const handleConnectAccount = async (account: TelegramAccount) => {
    try {
      await telegramAPI.connectAccount(account.id);
      await loadAccounts();

      // If this is the current account, load its conversations
      if (currentAccount && currentAccount.id === account.id) {
        loadConversations(account.id);
      }
    } catch (error: any) {
      console.error('Failed to connect account:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to connect to Telegram';
      alert(errorMessage);
    }
  };

  const handleDisconnectAccount = async (account: TelegramAccount) => {
    try {
      await telegramAPI.disconnectAccount(account.id);
      await loadAccounts();

      // If this is the current account, clear conversations
      if (currentAccount && currentAccount.id === account.id) {
        setConversations([]);
        setCurrentConversation(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to disconnect account:', error);
    }
  };

  const handleEditAccount = (account: TelegramAccount) => {
    setEditingAccount(account);
    setShowEditAccountModal(true);
  };

  const handleHardDelete = async (account: TelegramAccount) => {
    if (!confirm(`Delete "${account.displayName || account.accountName}"? This cannot be undone.`)) return;
    try {
      await telegramAPI.deleteAccount(account.id);
      // If this was the active account, clear UI
      if (currentAccount?.id === account.id) {
        setCurrentAccount(null);
        setCurrentConversation(null);
        setConversations([]);
        setMessages([]);
      }
      await loadAccounts();
    } catch (error) {
      console.error('Failed to delete account:', error);
      alert('Failed to delete account.');
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!currentAccount || !currentAccount.isConnected || !currentConversation) return;

    // Create an optimistic local message
    const tempMessage: TelegramMessage = {
      id: -Date.now(), // Negative ID for temporary message
      conversation_id: currentConversation.id,
      telegram_message_id: 0,
      sender_name: currentAccount.displayName || currentAccount.accountName,
      sender_username: currentAccount.accountName,
      peer_title: currentConversation.title || 'Chat',
      type: 'text',
      original_text: text,
      translated_text: text,
      source_language: currentAccount.targetLanguage, // Local is usually target
      target_language: currentAccount.sourceLanguage,
      created_at: new Date().toISOString(),
      is_outgoing: true,
    };

    // Add instantly to UI
    setMessages(prev => [...prev, tempMessage]);

    try {
      // Send message to backend
      const response = await messagesAPI.sendMessage(
        currentConversation.id,
        text,
        true // translate the message
      );

      // Replace temp message with server message
      if (response && response.id) {
        setMessages(prev =>
          prev.map(msg => msg.id === tempMessage.id ? response : msg)
        );
      }

      console.log('Message sent successfully:', response);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Remove temp message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
      alert('Failed to send message. Please check your connection.');
    }
  };

  const handleSendMedia = async (file: File, caption: string) => {
    if (!currentAccount || !currentAccount.isConnected || !currentConversation) return;

    const tempId = -Date.now();
    const tempMessage: TelegramMessage = {
      id: tempId,
      conversation_id: currentConversation.id,
      telegram_message_id: 0,
      sender_name: currentAccount.displayName || currentAccount.accountName,
      sender_username: currentAccount.accountName,
      peer_title: currentConversation.title || 'Chat',
      type: file.type.startsWith('image/') ? 'photo' : (file.type.startsWith('video/') ? 'video' : 'document'),
      original_text: caption,
      translated_text: caption,
      created_at: new Date().toISOString(),
      is_outgoing: true,
      has_media: true,
      media_file_name: file.name
    };

    setMessages(prev => [...prev, tempMessage]);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('conversation_id', currentConversation.id.toString());
      formData.append('caption', caption);

      const response = await messagesAPI.sendMedia(formData);

      if (response && response.id) {
        setMessages(prev =>
          prev.map(msg => msg.id === tempId ? response : msg)
        );
      }
    } catch (error) {
      console.error('Failed to send media:', error);
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      alert('Failed to send media. Please check your connection.');
    }
  };

  const handleLeaveConversation = async (conversationId: number) => {
    try {
      await telegramAPI.leaveConversation(conversationId);
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      if (currentConversation?.id === conversationId) {
        setCurrentConversation(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to leave conversation:', error);
    }
  };

  const handleDeleteConversation = async (conversationId: number) => {
    try {
      await telegramAPI.deleteConversation(conversationId);
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      if (currentConversation?.id === conversationId) {
        setCurrentConversation(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const handleDeleteMessages = async (conversationId: number, messageIds: number[], revoke: boolean) => {
    try {
      await messagesAPI.deleteMessages(conversationId, messageIds, revoke);
      // Remove already handled by WebSocket normally, but we can do it optimistically
      setMessages(prev => prev.filter(msg => !messageIds.includes(msg.id)));
    } catch (error) {
      console.error('Failed to delete messages:', error);
      throw error;
    }
  };

  // Loading screen
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

  // Authentication screens
  if (!isAuthenticated) {
    return (
      <Router>
        <Routes>
          <Route
            path="/login"
            element={
              <LoginForm onSwitchToRegister={() => setAuthMode('register')} />
            }
          />
          <Route path="/logout" element={<Logout />} />
          <Route
            path="/register"
            element={
              <RegisterForm onSwitchToLogin={() => setAuthMode('login')} />
            }
          />
          <Route
            path="*"
            element={
              authMode === 'login' ? (
                <LoginForm onSwitchToRegister={() => setAuthMode('register')} />
              ) : (
                <RegisterForm onSwitchToLogin={() => setAuthMode('login')} />
              )
            }
          />
        </Routes>
      </Router>
    );
  }

  // Main application
  return (
    <Router>
      <div className="h-screen flex flex-col bg-telegram-side-list-light dark:bg-telegram-side-list-dark transition-colors duration-500 text-gray-900 dark:text-white">
        <Header onStartTour={() => setShowTour(true)} />

        <Routes>
          {/* Auto-Responder Page */}
          <Route path="/auto-responder" element={<AutoResponderPage />} />

          {/* Main Chat Interface */}
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
                      // Update current conversation state to reflect it's no longer hidden
                      setCurrentConversation(prev => prev && prev.id === id ? { ...prev, is_hidden: false } : prev);
                      // Immediately load any already-saved messages
                      loadMessages(id);
                      // Backend fetches history in background (with translation), reload after 5s to catch them
                      setTimeout(() => loadMessages(id), 5000);
                    }
                  } catch (error) {
                    console.error('Failed to join conversation:', error);
                  }
                }}
                onToggleMute={async (id) => {
                  try {
                    const result = await telegramAPI.toggleMute(id);
                    setCurrentConversation(prev => prev && prev.id === id ? { ...prev, is_muted: result.is_muted } : prev);
                    setConversations(prev => prev.map(c => c.id === id ? { ...c, is_muted: result.is_muted } : c));
                  } catch (error) {
                    console.error('Failed to toggle mute:', error);
                  }
                }}
                onLeaveConversation={handleLeaveConversation}
                onDeleteMessages={handleDeleteMessages}
                hasMoreMessages={hasMoreMessages}
                onLoadMoreMessages={currentConversation ? () => loadMoreMessages(currentConversation.id) : undefined}
              />
            </div>
          } />
        </Routes>

        {/* Modals */}
        <AddAccountModal
          isOpen={showAddAccountModal}
          onClose={() => setShowAddAccountModal(false)}
          onSuccess={loadAccounts}
        />
        <EditAccountModal
          isOpen={showEditAccountModal}
          account={editingAccount}
          onClose={() => { setShowEditAccountModal(false); setEditingAccount(null); }}
          onSuccess={loadAccounts}
        />

        <ProfileModal
          isOpen={showProfileModal}
          account={profileAccount}
          onClose={() => { setShowProfileModal(false); setProfileAccount(null); }}
        />

        <ActiveSessionsModal
          isOpen={showSessionsModal}
          account={sessionsAccount}
          onClose={() => { setShowSessionsModal(false); setSessionsAccount(null); }}
        />

        {/* User Guide Tour */}
        <UserGuideTour
          isOpen={showTour}
          onClose={() => setShowTour(false)}
          hasAccounts={accounts.length > 0}
          hasConversation={!!currentConversation}
          currentStep={tourStep}
          onStepChange={setTourStep}
        />

        {/* Real-time notification popup - Refined Telegram Style */}
        {notification && (
          <div className="fixed bottom-8 right-8 z-[9000] animate-slide-up pointer-events-none">
            <div
              onClick={() => handleNotificationClick(notification.accountId, notification.conversationId)}
              className="bg-white dark:bg-[#1c242d] border border-gray-100 dark:border-gray-700/30 shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)] rounded-2xl p-4 w-[360px] pointer-events-auto cursor-pointer border-l-4 border-l-blue-500 hover:translate-y-[-2px] transition-all duration-300 group"
            >
              <div className="flex items-center space-x-4">
                <div className="relative flex-shrink-0">
                  {notification.avatar ? (
                    <img
                      src={notification.avatar}
                      alt=""
                      className="w-14 h-14 rounded-full object-cover border-2 border-gray-100 dark:border-gray-700"
                    />
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