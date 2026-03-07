import { useState, useMemo } from 'react';
import { Search, Lock } from 'lucide-react';
import { messagesAPI } from '../../services/api';
import type { TelegramChat, TelegramMessage } from '../../types';
import PeerAvatar from '../Common/PeerAvatar';

interface ForwardMessageModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedMessageIds: number[];
    previewMessage?: TelegramMessage | null;
    conversations: TelegramChat[];
    sourceConversationId: number | null;
    currentAccountId?: number;
}

export default function ForwardMessageModal({
    isOpen,
    onClose,
    selectedMessageIds,
    previewMessage,
    conversations,
    sourceConversationId,
    currentAccountId,
}: ForwardMessageModalProps) {
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const filteredConversations = useMemo(() => {
        const q = search.toLowerCase().trim();
        return conversations.filter(c =>
            !q || (c.title || '').toLowerCase().includes(q)
        );
    }, [conversations, search]);

    const isDisabled = (conv: TelegramChat) => {
        // Channels (broadcast) don't allow regular users to send messages
        return conv.type === 'channel';
    };

    const handleSend = async () => {
        if (!selectedId || !sourceConversationId || selectedMessageIds.length === 0) return;
        setSending(true);
        setError(null);
        try {
            await messagesAPI.forwardMessages(sourceConversationId, selectedId, selectedMessageIds);
            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                setSelectedId(null);
                setSearch('');
                onClose();
            }, 1000);
        } catch (e: any) {
            setError(e?.response?.data?.detail || 'Failed to forward messages');
        } finally {
            setSending(false);
        }
    };

    const handleClose = () => {
        setSearch('');
        setSelectedId(null);
        setError(null);
        setSuccess(false);
        onClose();
    };

    if (!isOpen || selectedMessageIds.length === 0) return null;

    const isMultiple = selectedMessageIds.length > 1;
    const hasMedia = previewMessage?.type === 'photo' || previewMessage?.type === 'video' || previewMessage?.type === 'document' || previewMessage?.type === 'voice';
    const previewText = isMultiple
        ? `${selectedMessageIds.length} messages selected`
        : (previewMessage?.original_text || (hasMedia ? `📎 ${previewMessage?.media_file_name || previewMessage?.type}` : ''));

    return (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[90] p-4 animate-fade-in" onClick={handleClose}>
            <div className="bg-white dark:bg-[#212121] rounded-xl w-full max-w-sm shadow-xl overflow-hidden animate-scale-in flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="p-6 pb-2">
                    <h3 className="text-[19px] font-medium text-gray-900 dark:text-white mb-1">
                        Forward {isMultiple ? 'messages' : 'message'}
                    </h3>
                    <p className="text-gray-500 text-[13px]">
                        Choose a conversation to forward to
                    </p>
                </div>

                {/* Message preview */}
                <div className="mx-6 mb-4 px-3 py-2 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-100 dark:border-white/10 flex-shrink-0">
                    {previewText ? (
                        <p className={`text-[13px] ${isMultiple ? 'text-[#3390ec] font-medium' : 'text-gray-600 dark:text-gray-300'} leading-relaxed line-clamp-1`}>{previewText}</p>
                    ) : (
                        <p className="text-[13px] text-gray-400 italic">Media message</p>
                    )}
                </div>

                {/* Search */}
                <div className="px-6 pb-2 flex-shrink-0">
                    <div className="flex items-center space-x-2 bg-gray-50 dark:bg-white/5 rounded-lg px-3 py-2 border border-gray-100 dark:border-white/5">
                        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search..."
                            autoFocus
                            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none"
                        />
                    </div>
                </div>

                {/* Conversation List */}
                <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-[200px] custom-scrollbar">
                    {filteredConversations.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-8">No conversations found</p>
                    ) : (
                        filteredConversations.map(conv => {
                            const disabled = isDisabled(conv);
                            const isSelected = selectedId === conv.id;
                            return (
                                <button
                                    key={conv.id}
                                    onClick={() => !disabled && setSelectedId(isSelected ? null : conv.id)}
                                    disabled={disabled}
                                    className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-all text-left group ${disabled
                                        ? 'opacity-40 cursor-not-allowed'
                                        : isSelected
                                            ? 'bg-[#3390ec]/10'
                                            : 'hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer'
                                        }`}
                                >
                                    <div className="relative flex-shrink-0">
                                        <PeerAvatar
                                            accountId={currentAccountId}
                                            peerId={conv.telegram_peer_id}
                                            name={conv.title || 'Unknown'}
                                            className="w-10 h-10 rounded-full text-sm font-medium uppercase"
                                        />
                                        {isSelected && (
                                            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-[#3390ec] rounded-full flex items-center justify-center shadow-sm border-2 border-white dark:border-[#212121]">
                                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-[14px] font-medium truncate ${isSelected ? 'text-[#3390ec]' : 'text-gray-900 dark:text-white'}`}>
                                            {conv.title || 'Unknown'}
                                        </p>
                                        <p className="text-[12px] text-gray-400 truncate capitalize">
                                            {conv.type}
                                        </p>
                                    </div>
                                    {disabled && (
                                        <Lock className="w-3.5 h-3.5 text-gray-400" />
                                    )}
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 pt-2 pb-5 flex-shrink-0 border-t border-gray-100 dark:border-white/5 mt-auto">
                    {error && (
                        <div className="mb-3 p-2 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-xs rounded-lg border border-red-500/20">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="mb-3 p-2 bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 text-xs rounded-lg text-center font-medium">
                            ✓ Message forwarded!
                        </div>
                    )}
                    <div className="flex items-center justify-end space-x-1 mt-1">
                        <button
                            onClick={handleClose}
                            disabled={sending}
                            className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={!selectedId || sending}
                            className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide flex items-center justify-center min-w-[100px]"
                        >
                            {sending ? (
                                <div className="w-4 h-4 border-2 border-[#3390ec]/30 border-t-[#3390ec] rounded-full animate-spin" />
                            ) : (
                                "Forward"
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
