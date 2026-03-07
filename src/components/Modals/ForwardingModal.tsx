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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 animate-fade-in" onClick={onClose}>
            <div
                className="bg-white dark:bg-[#212121] w-full max-w-md rounded-xl shadow-xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-white/5">
                    <h3 className="text-[19px] font-medium text-gray-900 dark:text-white">Forward Message</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 border-b border-gray-100 dark:border-white/5">
                    <div className="relative group">
                        <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${search ? 'text-[#3390ec]' : 'text-gray-400'}`} />
                        <input
                            type="text"
                            placeholder="Search conversations..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-[14px] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#3390ec] transition-all"
                            autoFocus
                        />
                    </div>
                </div>

                <div className="max-h-[350px] overflow-y-auto custom-scrollbar p-2">
                    {filteredConversations.length > 0 ? (
                        filteredConversations.map((chat) => (
                            <button
                                key={chat.id}
                                onClick={() => onSelectConversation(chat.id)}
                                className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-all group active:scale-[0.98]"
                            >
                                <div className="w-10 h-10 rounded-full bg-[#3390ec]/10 flex items-center justify-center text-[#3390ec] font-bold">
                                    {(chat.title || '?')[0].toUpperCase()}
                                </div>
                                <div className="flex-1 text-left min-w-0">
                                    <p className="text-[14px] font-medium text-gray-900 dark:text-white group-hover:text-[#3390ec] transition-colors truncate">
                                        {chat.title || 'Unknown Chat'}
                                    </p>
                                    <p className="text-[12px] text-gray-500 capitalize">{chat.type}</p>
                                </div>
                            </button>
                        ))
                    ) : (
                        <div className="py-20 text-center opacity-40">
                            <p className="text-[15px] text-gray-500 px-10">No conversations found</p>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-white/5 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
