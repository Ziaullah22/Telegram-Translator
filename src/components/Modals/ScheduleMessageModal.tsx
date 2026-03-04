import { useState } from 'react';
import { X, Clock, Send } from 'lucide-react';
import { scheduledMessagesAPI } from '../../services/api';

interface ScheduleMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: number | null;
  messageText: string;
  onScheduled: () => void;
}

export default function ScheduleMessageModal({
  isOpen,
  onClose,
  conversationId,
  messageText,
  onScheduled,
}: ScheduleMessageModalProps) {
  const [daysDelay, setDaysDelay] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSchedule = async () => {
    if (!conversationId) {
      setError('No conversation selected');
      return;
    }

    if (!messageText.trim()) {
      setError('Message text is required');
      return;
    }

    if (daysDelay < 1) {
      setError('Days delay must be at least 1');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await scheduledMessagesAPI.createScheduledMessage(conversationId, messageText, daysDelay);
      setDaysDelay(1);
      onScheduled();
      onClose();
    } catch (err) {
      console.error('Failed to schedule message:', err);
      setError('Failed to schedule message');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setDaysDelay(1);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div id="schedule-modal-container" className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 transition-all duration-300">
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-gray-50 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="flex items-center space-x-4">
            <div className="bg-blue-600/10 dark:bg-blue-600/20 p-2.5 rounded-2xl">
              <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Schedule Message</h2>
          </div>
          <button
            id="schedule-modal-close-btn"
            onClick={handleClose}
            className="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-gray-700 p-2 rounded-xl transition-all duration-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-2xl text-red-600 dark:text-red-400 text-sm font-bold flex items-center space-x-3 animate-shake">
              <X className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-6">
            {/* Message Preview */}
            <div className="space-y-2">
              <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
                Message Preview
              </label>
              <div className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-2xl text-gray-700 dark:text-gray-300 text-sm font-medium italic min-h-[100px] leading-relaxed">
                {messageText || <span className="text-gray-400 dark:text-gray-600">No message content entered...</span>}
              </div>
            </div>

            {/* Days Delay */}
            <div className="space-y-2">
              <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
                Send After (Days)
              </label>
              <div className="relative group">
                <input
                  type="number"
                  min="1"
                  value={daysDelay}
                  onChange={(e) => setDaysDelay(parseInt(e.target.value) || 1)}
                  className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-black text-lg"
                />
                <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400 uppercase tracking-widest pointer-events-none">
                  Days
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 font-bold ml-1">
                ✓ Message will be automatically sent in {daysDelay} {daysDelay === 1 ? 'day' : 'days'}
              </p>
            </div>

            {/* Info */}
            <div className="p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-2xl">
              <p className="text-[12px] text-blue-700 dark:text-blue-300 font-bold leading-relaxed">
                <span className="uppercase tracking-widest text-[9px] block mb-1">Important Note</span>
                Scheduled messages are temporary. If the contact replies before the countdown finishes, this automation will be cancelled to prevent confusion.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-8 bg-gray-50/50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-6 py-3.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-2xl transition-all font-black uppercase tracking-widest text-[10px]"
          >
            Cancel
          </button>
          <button
            onClick={handleSchedule}
            disabled={loading || !messageText.trim()}
            className="flex-1 max-w-[220px] px-6 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-2xl shadow-xl shadow-blue-600/30 transition-all font-black uppercase tracking-widest text-[10px] flex items-center justify-center space-x-2"
          >
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
            <span>{loading ? 'Processing...' : 'Schedule message'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
