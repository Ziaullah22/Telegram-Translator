import React, { useState, useEffect } from 'react';
import { X, MessageCircle, BellOff, Bell, Phone, LogOut, Users, Trash } from 'lucide-react';
import PeerAvatar from '../Common/PeerAvatar';
import ConfirmModal from './ConfirmModal';
import type { TelegramChat } from '../../types';
import { telegramAPI } from '../../services/api';

interface PeerProfile {
  phone?: string;
  bio?: string;
  type?: string;
  participants_count?: number;
  members?: Array<{
    id: number;
    first_name: string;
    last_name: string;
    username: string;
  }>;
}

interface ChatProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  chat: TelegramChat | null;
  accountId?: number;
}

export default function ChatProfileModal({ isOpen, onClose, chat, accountId }: ChatProfileModalProps) {
  const [profile, setProfile] = useState<PeerProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState(chat?.is_muted || false);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      if (isOpen && chat && accountId) {
        setLoading(true);
        const peerId = chat.telegram_peer_id || chat.id;
        try {
          const data = await telegramAPI.getPeerProfile(accountId, peerId);
          setProfile(data);
        } catch (error) {
          console.error('Failed to fetch profile', error);
        } finally {
          setLoading(false);
        }
      }
    }
    fetchProfile();
    if (chat) setIsMuted(chat.is_muted || false);
  }, [isOpen, chat, accountId]);

  if (!isOpen || !chat) return null;

  // We only show this for private chats, but it can adapt for groups if needed
  const name = chat.title || 'Unknown';
  const peerId = chat.telegram_peer_id || chat.id;
  const username = chat.username;
  const lastSeen = 'last seen recently';
  
  const displayBio = profile?.bio || (username ? `@${username}` : 'No bio given.');
  const displayPhone = profile?.phone || (chat?.title?.startsWith('+') ? chat.title : '');

  const handleToggleMute = async () => {
    if (!chat) return;
    try {
      await telegramAPI.toggleMute(chat.id);
      setIsMuted(!isMuted);
    } catch(e) {
      console.error(e);
    }
  };

  const handleLeaveConfirm = async () => {
    if (!chat) return;
    try {
      await telegramAPI.leaveConversation(chat.id);
      setLeaveModalOpen(false);
      onClose();
    } catch(e) {
      console.error(e);
      alert('Failed to leave chat');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!chat) return;
    try {
      await telegramAPI.deleteConversation(chat.id);
      setDeleteModalOpen(false);
      onClose();
    } catch(e) {
      console.error(e);
      alert('Failed to delete chat');
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-[2px] animate-fade-in" onClick={onClose}>
        <div 
          className="bg-white dark:bg-[#212121] rounded-2xl shadow-2xl w-[400px] overflow-hidden flex flex-col animate-scale-in relative max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button at top right */}
        <div className="absolute top-3 right-3">
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors z-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Section: Avatar & Name */}
        <div className="flex flex-col items-center pt-8 pb-4">
          <PeerAvatar
            accountId={accountId}
            peerId={peerId}
            name={name}
            className="w-[100px] h-[100px] rounded-full text-4xl shadow-md border-2 border-white dark:border-[#212121]"
          />
          <h2 className="text-[20px] font-medium text-gray-900 dark:text-white mt-4 tracking-tight">
            {name}
          </h2>
          <p className="text-[14px] text-gray-400 mt-1">
            {lastSeen}
          </p>
        </div>

        {/* Action Buttons: Message, Mute, Call */}
        <div className="flex justify-center items-center space-x-2 px-6 pb-6">
          <ActionBtn icon={<MessageCircle className="w-6 h-6" />} label="Message" onClick={onClose} />
          
          <ActionBtn 
            icon={isMuted ? <BellOff className="w-6 h-6 text-red-500" /> : <Bell className="w-6 h-6" />} 
            label={isMuted ? "Unmute" : "Mute"} 
            onClick={handleToggleMute} 
          />
          
          {chat.type === 'private' ? (
            <ActionBtn icon={<Phone className="w-6 h-6" />} label="Call" disabled />
          ) : (
            <ActionBtn icon={<LogOut className="w-6 h-6 text-red-500" />} label="Leave" onClick={() => setLeaveModalOpen(true)} />
          )}

          <ActionBtn icon={<Trash className="w-6 h-6 text-red-500" />} label="Delete" onClick={() => setDeleteModalOpen(true)} />
        </div>

        {/* Info Section: Bio, Phone, Members */}
        <div className="bg-gray-50 dark:bg-[#181818] px-6 py-5 border-t border-gray-100 dark:border-white/5 space-y-4 flex-1 overflow-y-auto rounded-b-2xl min-h-[140px]">
          {loading ? (
            <div className="flex justify-center items-center h-full min-h-[100px]">
              <span className="w-6 h-6 border-2 border-gray-400 border-t-[#3390ec] rounded-full animate-spin"></span>
            </div>
          ) : (
            <>
              {chat.type === 'private' && displayPhone && (
                <div>
                  <p className="text-[15px] text-gray-900 dark:text-gray-100 leading-relaxed font-medium">
                    {displayPhone || 'Hidden'}
                  </p>
                  <span className="block text-[13px] text-gray-400 mt-0.5">Phone</span>
                </div>
              )}

              {/* Bio / Description */}
              {displayBio && (
                <div>
                  <p className="text-[15px] text-gray-900 dark:text-gray-100 leading-relaxed max-w-full break-words">
                    {displayBio}
                  </p>
                  <span className="block text-[13px] text-gray-400 mt-0.5">{chat.type === 'private' ? 'Bio' : 'Description'}</span>
                </div>
              )}

              {/* Members List (for groups/channels) */}
              {(chat.type === 'channel' || chat.type === 'group' || chat.type === 'supergroup') && profile && (
                <div className="pt-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">
                      {profile.participants_count || (profile.members?.length || 0)} Members
                    </span>
                  </div>
                  
                  {profile.members && profile.members.length > 0 && (
                    <div className="space-y-3 mt-3 border-t border-gray-200 dark:border-[#2a2a2a] pt-3">
                      {profile.members.map((member) => {
                        const memberName = `${member.first_name} ${member.last_name}`.trim() || 'Unknown';
                        return (
                          <div key={member.id} className="flex items-center gap-3">
                            <PeerAvatar
                              accountId={accountId}
                              peerId={member.id}
                              name={memberName}
                              className="w-[36px] h-[36px] rounded-full text-sm"
                            />
                            <div className="flex flex-col overflow-hidden">
                              <span className="text-[14px] font-medium text-gray-900 dark:text-gray-100 truncate">
                                {memberName}
                              </span>
                              {member.username ? (
                                <span className="text-[12px] text-gray-400 truncate">@{member.username}</span>
                              ) : (
                                <span className="text-[12px] text-gray-400 truncate">No username</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {profile.participants_count && profile.members.length < profile.participants_count && (
                        <p className="text-xs text-center text-gray-400 pt-2">Showing {profile.members.length} recent members</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>

    {/* Leave Modal Confirmation */}
    <ConfirmModal 
      isOpen={leaveModalOpen} 
      onClose={() => setLeaveModalOpen(false)} 
      onConfirm={handleLeaveConfirm} 
      title={`Leave ${chat.type === 'channel' ? 'Channel' : 'Group'}`} 
      message={`Are you sure you want to leave ${name}?`}
      confirmText="Leave"
    />

    {/* Delete Chat Confirmation */}
    <ConfirmModal 
      isOpen={deleteModalOpen} 
      onClose={() => setDeleteModalOpen(false)} 
      onConfirm={handleDeleteConfirm} 
      title="Delete Chat" 
      message={`Are you sure you want to delete this chat with ${name}?`}
      confirmText="Delete"
    />
    </>
  );
}

// Helper for the top rounded square buttons
function ActionBtn({ icon, label, disabled = false, onClick }: { icon: React.ReactNode, label: string, disabled?: boolean, onClick?: () => void }) {
  return (
    <button 
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col items-center justify-center w-[72px] h-[72px] rounded-2xl bg-white dark:bg-[#2c2c2c] shadow-[0_2px_10px_rgba(0,0,0,0.06)] dark:shadow-none border border-gray-100 dark:border-transparent transition-transform hover:scale-105 active:scale-95 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="text-gray-800 dark:text-gray-200 mb-1.5">
        {icon}
      </div>
      <span className="text-[12px] font-medium text-gray-600 dark:text-gray-300">
        {label}
      </span>
    </button>
  );
}
