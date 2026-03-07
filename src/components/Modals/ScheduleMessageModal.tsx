import { useState } from 'react';
import { scheduledMessagesAPI } from '../../services/api';

interface ScheduleMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: number | null;
  messageText: string;
  onScheduled: () => void;
}

type DelayUnit = 'minutes' | 'hours' | 'days';

export default function ScheduleMessageModal({
  isOpen,
  onClose,
  conversationId,
  messageText,
  onScheduled,
}: ScheduleMessageModalProps) {
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState<DelayUnit>('hours');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Convert to fractional days for the API
  const toDays = (): number => {
    if (unit === 'minutes') return amount / (60 * 24);
    if (unit === 'hours') return amount / 24;
    return amount;
  };

  const getScheduledLabel = () => {
    if (unit === 'minutes') return `${amount} minute${amount !== 1 ? 's' : ''}`;
    if (unit === 'hours') return `${amount} hour${amount !== 1 ? 's' : ''}`;
    return `${amount} day${amount !== 1 ? 's' : ''}`;
  };

  const getScheduledTime = () => {
    const now = new Date();
    if (unit === 'minutes') now.setMinutes(now.getMinutes() + amount);
    else if (unit === 'hours') now.setHours(now.getHours() + amount);
    else now.setDate(now.getDate() + amount);
    return now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const handleSchedule = async () => {
    if (!conversationId) { setError('No conversation selected'); return; }
    if (!messageText.trim()) { setError('Message text is required'); return; }
    if (amount < 1) { setError('Value must be at least 1'); return; }

    try {
      setLoading(true);
      setError(null);
      const days = toDays();
      await scheduledMessagesAPI.createScheduledMessage(conversationId, messageText, days);
      setAmount(1);
      setUnit('hours');
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
    setAmount(1);
    setUnit('hours');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  const units: { value: DelayUnit; label: string }[] = [
    { value: 'minutes', label: 'Minutes' },
    { value: 'hours', label: 'Hours' },
    { value: 'days', label: 'Days' },
  ];

  return (
    <div id="schedule-modal-container" className="fixed inset-0 bg-black/30 flex items-center justify-center z-[70] p-4 animate-fade-in" onClick={handleClose}>
      <div className="bg-white dark:bg-[#212121] rounded-xl w-full max-w-[320px] shadow-xl overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 pb-2">
          <h3 className="text-[19px] font-medium text-gray-900 dark:text-white mb-2">
            Schedule message
          </h3>
          <p className="text-gray-600 dark:text-gray-300 text-[15px] mb-4">
            Select when you want to send this message.
          </p>
          {error && (
            <div className="mb-4 text-xs text-red-500 bg-red-500/10 p-2 rounded-lg border border-red-500/20">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          {/* Unit selector */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 mb-4 bg-gray-50 dark:bg-white/5">
            {units.map((u) => (
              <button
                key={u.value}
                onClick={() => { setUnit(u.value); setAmount(u.value === 'minutes' ? 15 : 1); }}
                className={`flex-1 py-1.5 text-[13px] font-medium transition-colors ${unit === u.value
                  ? 'bg-[#3390ec] text-white'
                  : 'bg-transparent text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
              >
                {u.label}
              </button>
            ))}
          </div>

          {/* Amount input */}
          <div className="mb-4">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setAmount(a => Math.max(1, a - 1))}
                className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 flex items-center justify-center text-gray-700 dark:text-white text-xl font-medium transition-colors"
              >−</button>
              <div className="flex-1 relative">
                <input
                  type="number"
                  min={1}
                  max={unit === 'minutes' ? 59 : unit === 'hours' ? 23 : 365}
                  value={amount}
                  onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full text-center text-[22px] font-semibold bg-transparent text-gray-900 dark:text-white outline-none py-1 no-spin"
                />
                <div className="text-center text-[10px] text-gray-400 dark:text-gray-500 -mt-1 uppercase tracking-widest">{unit}</div>
              </div>
              <button
                onClick={() => setAmount(a => a + 1)}
                className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 flex items-center justify-center text-gray-700 dark:text-white text-xl font-medium transition-colors"
              >+</button>
            </div>
          </div>

          {/* Preview time */}
          <div className="mb-6 flex flex-col items-center justify-center text-[12px] text-gray-500 dark:text-gray-400 text-center leading-relaxed">
            <span>Sent in <strong className="text-gray-900 dark:text-white">{getScheduledLabel()}</strong></span>
            <span>at <strong className="text-gray-900 dark:text-white">{getScheduledTime()}</strong></span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-1 mt-2">
            <button
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide"
            >
              Cancel
            </button>
            <button
              onClick={handleSchedule}
              disabled={loading || !messageText.trim()}
              className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide flex items-center justify-center min-w-[100px]"
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
