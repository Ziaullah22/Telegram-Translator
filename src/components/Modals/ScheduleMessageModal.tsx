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

const QUICK_PRESETS = [
  { label: '5 min', minutes: 5 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '3 hours', minutes: 180 },
  { label: '1 day', minutes: 1440 },
];

export default function ScheduleMessageModal({
  isOpen,
  onClose,
  conversationId,
  messageText,
  onScheduled,
}: ScheduleMessageModalProps) {
  const [unit, setUnit] = useState<'minutes' | 'hours' | 'days'>('hours');
  const [value, setValue] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getTotalMinutes = () => {
    if (unit === 'minutes') return value;
    if (unit === 'hours') return value * 60;
    return value * 1440;
  };

  const getDaysDelay = () => {
    const mins = getTotalMinutes();
    // Backend uses days_delay, we pass fractional days (minimum rounded to nearest fraction)
    return Math.max(mins / 1440, 1 / 1440);
  };

  const getPreviewText = () => {
    const mins = getTotalMinutes();
    if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''}`;
    if (mins < 1440) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `${h}h ${m}m` : `${h} hour${h !== 1 ? 's' : ''}`;
    }
    const d = Math.floor(mins / 1440);
    return `${d} day${d !== 1 ? 's' : ''}`;
  };

  const handlePreset = (minutes: number) => {
    if (minutes < 60) { setUnit('minutes'); setValue(minutes); }
    else if (minutes < 1440) { setUnit('hours'); setValue(minutes / 60); }
    else { setUnit('days'); setValue(minutes / 1440); }
  };

  const handleSchedule = async () => {
    if (!conversationId) { setError('No conversation selected'); return; }
    if (!messageText.trim()) { setError('Message text is required'); return; }
    const mins = getTotalMinutes();
    if (mins < 1) { setError('Must be at least 1 minute'); return; }

    try {
      setLoading(true);
      setError(null);
      await scheduledMessagesAPI.createScheduledMessage(conversationId, messageText, getDaysDelay());
      setValue(1);
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
    setValue(1);
    setUnit('hours');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div id="schedule-modal-container" className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white dark:bg-[#212121] border border-gray-100 dark:border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/10">
          <div className="flex items-center space-x-3">
            <Clock className="w-5 h-5 text-[#3390ec]" />
            <h2 className="text-[17px] font-semibold text-gray-900 dark:text-white">Schedule Message</h2>
          </div>
          <button
            id="schedule-modal-close-btn"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Error */}
          {error && (
            <div className="px-4 py-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Message Preview */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Message</p>
            <div className="px-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-xl text-gray-700 dark:text-gray-300 text-sm leading-relaxed min-h-[60px]">
              {messageText || <span className="text-gray-400 italic">No message entered...</span>}
            </div>
          </div>

          {/* Quick Presets */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Quick select</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handlePreset(p.minutes)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 dark:bg-white/10 hover:bg-[#3390ec] hover:text-white dark:text-gray-300 dark:hover:bg-[#3390ec] transition-all"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Time Input */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Custom delay</p>
            <div className="flex items-center space-x-3">
              <input
                type="number"
                min="1"
                value={value}
                onChange={(e) => setValue(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24 px-4 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white text-center font-semibold text-lg focus:outline-none focus:border-[#3390ec] transition-colors"
              />
              <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-white/10">
                {(['minutes', 'hours', 'days'] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors capitalize ${unit === u
                        ? 'bg-[#3390ec] text-white'
                        : 'bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10'
                      }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              Message will send in <span className="font-semibold text-[#3390ec]">{getPreviewText()}</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2 px-6 py-4 border-t border-gray-100 dark:border-white/10">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-lg transition-colors uppercase text-sm tracking-wide"
          >
            Cancel
          </button>
          <button
            onClick={handleSchedule}
            disabled={loading || !messageText.trim()}
            className="flex items-center space-x-2 px-5 py-2 bg-[#3390ec] hover:bg-[#2980d9] disabled:opacity-50 text-white rounded-lg transition-colors font-medium text-sm"
          >
            {loading
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Send className="w-4 h-4" />
            }
            <span>{loading ? 'Scheduling...' : 'Schedule'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
