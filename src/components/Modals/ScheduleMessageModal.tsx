import { useState } from 'react';
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
  const [days, setDays] = useState(0);
  const [hours, setHours] = useState(1);
  const [minutes, setMinutes] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Total time in minutes
  const totalMinutes = days * 24 * 60 + hours * 60 + minutes;

  // Convert to fractional days for the API
  const toDays = (): number => totalMinutes / (60 * 24);

  const getScheduledLabel = () => {
    const parts = [];
    if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    return parts.length > 0 ? parts.join(', ') : '0 minutes';
  };

  const getScheduledTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + totalMinutes);
    return now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const handleSchedule = async () => {
    if (!conversationId) { setError('No conversation selected'); return; }
    if (!messageText.trim()) { setError('Message text is required'); return; }
    if (totalMinutes < 1) { setError('Please set at least 1 minute delay'); return; }

    try {
      setLoading(true);
      setError(null);
      const daysVal = toDays();
      await scheduledMessagesAPI.createScheduledMessage(conversationId, messageText, daysVal);
      setDays(0);
      setHours(1);
      setMinutes(0);
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
    setDays(0);
    setHours(1);
    setMinutes(0);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  const spinnerBtn = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 flex items-center justify-center text-gray-700 dark:text-white text-lg font-medium transition-colors select-none"
    >
      {label}
    </button>
  );

  return (
    <div id="schedule-modal-container" className="fixed inset-0 bg-black/30 flex items-center justify-center z-[70] p-4 animate-fade-in" onClick={handleClose}>
      <div className="bg-white dark:bg-[#212121] rounded-xl w-full max-w-[340px] shadow-xl overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 pb-2">
          <h3 className="text-[19px] font-medium text-gray-900 dark:text-white mb-1">
            Schedule message
          </h3>
          <p className="text-gray-600 dark:text-gray-300 text-[14px] mb-3">
            Set the delay before sending.
          </p>
          {error && (
            <div className="mb-3 text-xs text-red-500 bg-red-500/10 p-2 rounded-lg border border-red-500/20">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          {/* Three spinners: Days, Hours, Minutes */}
          <div className="flex items-start justify-between gap-3 mb-5">
            {/* Days */}
            <div className="flex-1 flex flex-col items-center gap-2">
              {spinnerBtn('+', () => setDays(d => d + 1))}
              <div className="text-center">
                <div className="text-[26px] font-semibold text-gray-900 dark:text-white leading-none">
                  {String(days).padStart(2, '0')}
                </div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-0.5">days</div>
              </div>
              {spinnerBtn('−', () => setDays(d => Math.max(0, d - 1)))}
            </div>

            <div className="text-2xl font-bold text-gray-300 dark:text-gray-600 mt-4">:</div>

            {/* Hours */}
            <div className="flex-1 flex flex-col items-center gap-2">
              {spinnerBtn('+', () => setHours(h => (h + 1) % 24))}
              <div className="text-center">
                <div className="text-[26px] font-semibold text-gray-900 dark:text-white leading-none">
                  {String(hours).padStart(2, '0')}
                </div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-0.5">hours</div>
              </div>
              {spinnerBtn('−', () => setHours(h => (h - 1 + 24) % 24))}
            </div>

            <div className="text-2xl font-bold text-gray-300 dark:text-gray-600 mt-4">:</div>

            {/* Minutes */}
            <div className="flex-1 flex flex-col items-center gap-2">
              {spinnerBtn('+', () => setMinutes(m => (m + 1) % 60))}
              <div className="text-center">
                <div className="text-[26px] font-semibold text-gray-900 dark:text-white leading-none">
                  {String(minutes).padStart(2, '0')}
                </div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-0.5">min</div>
              </div>
              {spinnerBtn('−', () => setMinutes(m => (m - 1 + 60) % 60))}
            </div>
          </div>

          {/* Preview time */}
          <div className="mb-5 p-3 bg-gray-50 dark:bg-white/5 rounded-lg text-center">
            <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed">
              Will send in <strong className="text-gray-900 dark:text-white">{getScheduledLabel()}</strong>
            </p>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
              at <strong className="text-gray-900 dark:text-white">{getScheduledTime()}</strong>
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-1">
            <button
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide"
            >
              Cancel
            </button>
            <button
              onClick={handleSchedule}
              disabled={loading || !messageText.trim() || totalMinutes < 1}
              className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide flex items-center justify-center min-w-[100px] disabled:opacity-40"
            >
              {loading
                ? <div className="w-4 h-4 border-2 border-[#3390ec]/30 border-t-[#3390ec] rounded-full animate-spin" />
                : "Schedule"
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
