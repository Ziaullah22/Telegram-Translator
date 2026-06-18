import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Loader, CheckCircle } from 'lucide-react';
import { telegramAPI } from '../../services/api';

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: number;
  onChannelCreated: (channel: any) => void;
}

export default function CreateChannelModal({
  isOpen,
  onClose,
  accountId,
  onChannelCreated,
}: CreateChannelModalProps) {
  const [title, setTitle] = useState('');
  const [about, setAbout] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setAbout('');
      setIsPublic(false);
      setUsername('');
      setError(null);
      setSuccess(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Channel title is required');
      return;
    }

    if (isPublic) {
      const clean = username.trim().replace('@', '');
      if (clean.length < 5) {
        setError('Public username must be at least 5 characters long');
        return;
      }
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await telegramAPI.createChannel(accountId, {
        title: title.trim(),
        about: about.trim(),
        is_public: isPublic,
        username: isPublic ? username.trim() : undefined,
      });
      setSuccess('Channel created successfully!');
      onChannelCreated(result);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create channel');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[99999] animate-fade-in" onClick={onClose}>
      <div 
        className="bg-white dark:bg-[#1e293b] rounded-[2rem] max-w-md w-full shadow-2xl overflow-hidden animate-scale-in border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4 flex items-center justify-between border-b border-gray-100 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900 dark:text-white">Create Channel</h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Broadcast Channel</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/10 text-red-500 text-xs font-semibold">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3.5 rounded-xl bg-green-500/10 border border-green-500/10 text-green-500 text-xs font-semibold flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {success}
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
              Channel Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. My Telegram Channel"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-transparent text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
              Channel Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${
                  !isPublic
                    ? 'bg-blue-600/10 border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-gray-200 dark:border-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                }`}
              >
                Private Link
              </button>
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${
                  isPublic
                    ? 'bg-blue-600/10 border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-gray-200 dark:border-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                }`}
              >
                Public Username
              </button>
            </div>
          </div>

          {isPublic && (
            <div className="space-y-1 animate-fade-in">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                Public Username
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-sm font-semibold text-gray-400 dark:text-gray-500 select-none">
                  t.me/
                </span>
                <input
                  type="text"
                  required={isPublic}
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="channel_username"
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-transparent text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Must be at least 5 characters (a-z, 0-9, and underscores).
              </p>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
              About / Description (Optional)
            </label>
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="Provide a description for your channel..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-transparent text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-gray-200 dark:border-white/5 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="w-3.5 h-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Channel'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
