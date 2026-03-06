import React from 'react';
import { X, Search } from 'lucide-react';
import type { TelegramChat } from '../../types';

interface ForwardModalProps {
    isOpen: boolean;
    onClose: () => void;
    conversations: TelegramChat[];
    onSelectConversation: (conversationId: number) => void;
}

export default function ForwardModal({ isOpen, onClose, conversations, onSelectConversation }: ForwardModalProps) {
    const [search, setSearch] = React.useState('');

    if (!isOpen) return null;

    const filteredConversations = conversations.filter(c =>
        (c.title || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="bg-white dark:bg-[#1c1c1c] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Forward to...</h3>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="p-4">
                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search conversations..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-white/5 border-none rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-1 focus:ring-[#419FD9] transition-all"
                            autoFocus
                        />
                    </div>

                    <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                        {filteredConversations.length > 0 ? (
                            filteredConversations.map((chat) => (
                                <button
                                    key={chat.id}
                                    onClick={() => onSelectConversation(chat.id)}
                                    className="w-full flex items-center space-x-3 p-3 hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl transition-all group active:scale-[0.98]"
                                >
                                    <div className="w-10 h-10 rounded-full bg-[#419FD9]/10 flex items-center justify-center text-[#419FD9] font-bold">
                                        {(chat.title || '?')[0].toUpperCase()}
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-[#419FD9] transition-colors">
                                            {chat.title || 'Unknown Chat'}
                                        </p>
                                        <p className="text-xs text-gray-400 capitalize">{chat.type}</p>
                                    </div>
                                </button>
                            ))
                        ) : (
                            <div className="py-8 text-center">
                                <p className="text-sm text-gray-500">No conversations found</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-3 border-t border-gray-100 dark:border-white/5 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
