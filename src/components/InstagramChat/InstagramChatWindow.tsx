import React, { useState, useRef, useEffect } from 'react';
import { Send, ChevronLeft, MoreVertical, Smartphone, User, Shield, Info } from 'lucide-react';
import { format } from 'date-fns';
import type { InstagramChat, InstagramMessage, InstagramAccount } from '../../types';

interface Props {
  messages: InstagramMessage[];
  currentConversation: InstagramChat | null;
  currentAccount: InstagramAccount | null;
  onSendMessage: (text: string) => void;
  onBack: () => void;
}

export default function InstagramChatWindow({
  messages,
  currentConversation,
  currentAccount,
  onSendMessage,
  onBack
}: Props) {
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (inputText.trim()) {
      onSendMessage(inputText);
      setInputText('');
    }
  };

  if (!currentConversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-[#0e1621] opacity-50">
        <div className="bg-white dark:bg-[#17212b] p-8 rounded-3xl shadow-xl flex flex-col items-center max-w-sm text-center">
          <div className="w-20 h-20 bg-gradient-to-tr from-purple-500 via-pink-500 to-orange-500 rounded-3xl flex items-center justify-center mb-6 shadow-lg rotate-3">
            <Send className="w-10 h-10 text-white -rotate-12" />
          </div>
          <h2 className="text-xl font-black mb-2">Instagram Direct</h2>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Select a conversation to start messaging. Your Instagram session is protected by Ghost Engine.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 dark:bg-[#0e1621] relative overflow-hidden">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 bg-white/80 dark:bg-[#17212b]/80 backdrop-blur-xl border-b border-gray-100 dark:border-white/5 z-10">
        <div className="flex items-center space-x-3">
          <button 
            onClick={onBack}
            className="xl:hidden p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="relative">
            {currentConversation.photo_url ? (
              <img src={currentConversation.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                {currentConversation.title.charAt(0)}
              </div>
            )}
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-[#17212b] rounded-full" />
          </div>
          <div>
            <h3 className="font-bold text-sm leading-tight">{currentConversation.title}</h3>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
              @{currentConversation.username || 'instagram_user'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors text-gray-400">
            <Info className="w-5 h-5" />
          </button>
          <button className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors text-gray-400">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar"
      >
        <div className="flex flex-col items-center py-8 opacity-40">
          <Shield className="w-8 h-8 mb-2" />
          <p className="text-[10px] font-black uppercase tracking-[0.2em]">Encrypted Session Active</p>
        </div>

        {messages.map((msg, idx) => {
          const isMe = msg.is_outgoing;
          const showAvatar = !isMe && (idx === messages.length - 1 || messages[idx + 1].sender_id !== msg.sender_id);

          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} items-end space-x-2`}>
              {!isMe && (
                <div className="w-8 h-8 shrink-0">
                  {showAvatar && (
                    currentConversation.photo_url ? (
                      <img src={currentConversation.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 bg-blue-500/20 text-blue-500 rounded-full flex items-center justify-center text-[10px] font-bold">
                        {msg.sender_name.charAt(0)}
                      </div>
                    )
                  )}
                </div>
              )}
              
              <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm shadow-sm transition-all duration-300 hover:shadow-md ${
                isMe 
                  ? 'bg-blue-600 text-white rounded-br-none' 
                  : 'bg-white dark:bg-[#182533] text-gray-800 dark:text-gray-100 rounded-bl-none border border-gray-100 dark:border-white/5'
              }`}>
                {msg.translated_text && msg.translated_text !== msg.original_text ? (
                  <div className="flex flex-col space-y-1">
                    <p className="whitespace-pre-wrap break-words font-medium">{msg.translated_text}</p>
                    <p className={`whitespace-pre-wrap break-words text-[11px] pt-1 mt-1 border-t ${isMe ? 'border-white/20 text-white/70' : 'border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400'}`}>
                      {msg.original_text}
                    </p>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                )}
                
                <div className={`text-[9px] mt-1 flex justify-end ${isMe ? 'text-white/60' : 'text-gray-400'}`}>
                  {format(new Date(msg.created_at), 'HH:mm')}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="p-4 bg-white dark:bg-[#17212b] border-t border-gray-100 dark:border-white/5">
        <div className="flex items-center space-x-2 max-w-4xl mx-auto">
          <div className="flex-1 relative">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Message..."
              className="w-full bg-gray-100 dark:bg-[#0e1621] border-none rounded-2xl py-3 px-4 text-sm focus:ring-2 focus:ring-blue-500/20 transition-all resize-none max-h-32"
              rows={1}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!inputText.trim()}
            className={`p-3 rounded-xl transition-all duration-300 ${
              inputText.trim() 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 scale-100' 
                : 'bg-gray-100 dark:bg-white/5 text-gray-400 scale-95'
            }`}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
