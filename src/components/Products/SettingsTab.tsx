import React, { useState, useEffect } from 'react';
import { CreditCard, Save, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { salesAPI } from '../../services/api';

const SettingsTab: React.FC = () => {
  const [paymentDetails, setPaymentDetails] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  // Automation settings (High-precision precision scheduling)
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderIntervalDays, setReminderIntervalDays] = useState(0);
  const [reminderIntervalHours, setReminderIntervalHours] = useState(2);
  const [reminderIntervalMinutes, setReminderIntervalMinutes] = useState(0);
  const [reminderCount, setReminderCount] = useState(3);

  // Disapproved Follow-up logic
  const [disapprovedReminderMessage, setDisapprovedReminderMessage] = useState('');
  const [disapprovedIntervalDays, setDisapprovedIntervalDays] = useState(0);
  const [disapprovedIntervalHours, setDisapprovedIntervalHours] = useState(2);
  const [disapprovedIntervalMinutes, setDisapprovedIntervalMinutes] = useState(0);
  const [disapprovedCount, setDisapprovedCount] = useState(3);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const data = await salesAPI.getSettings();
      setPaymentDetails(data.payment_details ?? '');
      setReminderMessage((data as any).payment_reminder_message ?? '');
      setReminderIntervalDays((data as any).payment_reminder_interval_days ?? 0);
      setReminderIntervalHours((data as any).payment_reminder_interval_hours ?? 2);
      setReminderIntervalMinutes((data as any).payment_reminder_interval_minutes ?? 0);
      setReminderCount((data as any).payment_reminder_count ?? 3);

      setDisapprovedReminderMessage((data as any).disapproved_reminder_message ?? "We are still waiting for your updated screenshot for Order {order_id}. Please send it as soon as possible. 🙏");
      setDisapprovedIntervalDays((data as any).disapproved_reminder_interval_days ?? 0);
      setDisapprovedIntervalHours((data as any).disapproved_reminder_interval_hours ?? 2);
      setDisapprovedIntervalMinutes((data as any).disapproved_reminder_interval_minutes ?? 0);
      setDisapprovedCount((data as any).disapproved_reminder_count ?? 3);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await (salesAPI as any).updateSettings({ 
        payment_details: paymentDetails,
        payment_reminder_message: reminderMessage,
        payment_reminder_interval_days: reminderIntervalDays,
        payment_reminder_interval_hours: reminderIntervalHours,
        payment_reminder_interval_minutes: reminderIntervalMinutes,
        payment_reminder_count: reminderCount,
        disapproved_reminder_message: disapprovedReminderMessage,
        disapproved_reminder_interval_days: disapprovedIntervalDays,
        disapproved_reminder_interval_hours: disapprovedIntervalHours,
        disapproved_reminder_interval_minutes: disapprovedIntervalMinutes,
        disapproved_reminder_count: disapprovedCount,
        status_messages: {} // Hardcoded messages used in backend now
      });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5">
        <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-3" />
        <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Syncing automation...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-4xl mx-auto">
      {/* 1. Payment Instructions */}
      <div className="bg-white dark:bg-[#1e293b] rounded-[32px] border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden p-8 transition-all hover:shadow-xl hover:shadow-blue-500/5">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-600 border border-blue-500/20 shadow-inner">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Payment Instructions</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Define your account details for the automatic 'CONFIRM' reply.</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="group">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 group-focus-within:text-blue-500 transition-colors">
              Payment Details (Bank, USDT, PayPal)
            </label>
            <textarea
              value={paymentDetails}
              onChange={(e) => setPaymentDetails(e.target.value)}
              placeholder="e.g. USDT (TRC20): T...&#10;Bank: My Bank (123-456-789)"
              className="w-full bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-white/10 rounded-2xl p-6 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all min-h-[160px] text-gray-900 dark:text-white leading-relaxed"
            />
            <div className="mt-4 p-4 bg-blue-50/30 dark:bg-blue-900/10 border border-blue-100/50 dark:border-blue-500/20 rounded-2xl flex items-start gap-4">
              <span className="shrink-0 w-8 h-8 bg-white dark:bg-white/5 rounded-full flex items-center justify-center shadow-sm">
                <Info className="w-4 h-4 text-blue-600" />
              </span>
              <p className="text-xs font-medium text-blue-700/80 dark:text-blue-300/80 leading-relaxed">
                These details are automatically sent when the customer confirms an order. Status updates (Paid, Packed, Shipped) are also handled automatically with professional templates.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Automated Reminder Flow */}
      <div className="bg-white dark:bg-[#1e293b] rounded-[32px] border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden p-8 transition-all hover:shadow-xl hover:shadow-amber-500/5">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-600 border border-amber-500/20 shadow-inner">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Payment Follow-up Automation</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">The bot will nudge customers who haven't sent a screenshot.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest transition-colors">Interval: Days</label>
                <div className="relative">
                  <input type="number" min="0" value={reminderIntervalDays} onChange={(e) => setReminderIntervalDays(Number(e.target.value))} className="w-full bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-white/10 rounded-2xl px-6 py-5 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" />
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-400 uppercase">Days</span>
                </div>
              </div>
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest transition-colors">Interval: Hours</label>
                <div className="relative">
                  <input type="number" min="0" max="23" value={reminderIntervalHours} onChange={(e) => setReminderIntervalHours(Number(e.target.value))} className="w-full bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-white/10 rounded-2xl px-6 py-5 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" />
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-400 uppercase">Hrs</span>
                </div>
              </div>
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest transition-colors">Interval: Minutes</label>
                <div className="relative">
                  <input type="number" min="0" max="59" value={reminderIntervalMinutes} onChange={(e) => setReminderIntervalMinutes(Number(e.target.value))} className="w-full bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-white/10 rounded-2xl px-6 py-5 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" />
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-400 uppercase">Min</span>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest transition-colors">Max Repeat Attempts</label>
              <div className="relative">
                <input type="number" value={reminderCount} onChange={(e) => setReminderCount(Number(e.target.value))} className="w-full bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-white/10 rounded-2xl px-6 py-5 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" />
                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400 uppercase">Times</span>
              </div>
            </div>
        </div>

        <div className="space-y-4">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest group-focus-within:text-blue-500 transition-colors">Reminder Notification Template</label>
          <textarea 
            value={reminderMessage} 
            onChange={(e) => setReminderMessage(e.target.value)} 
            placeholder="Hello! Just a reminder to send your payment proof for Order {order_id}..."
            className="w-full bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-white/10 rounded-2xl p-6 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all min-h-[120px] text-gray-900 dark:text-white" 
          />
          <div className="flex items-center gap-2">
            <div className="px-2 py-1 bg-amber-500/10 rounded text-[9px] font-black text-amber-600 uppercase tracking-wider border border-amber-500/20">Tip</div>
            <p className="text-[10px] font-medium text-gray-400">Initial reminder sent when no proof is provided. Use {"{order_id}"} as a placeholder.</p>
          </div>
        </div>
      </div>

      {/* 3. Disapproved Follow-up Settings */}
      <div className="bg-white dark:bg-[#1e293b] rounded-[32px] border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden p-8 transition-all hover:shadow-xl hover:shadow-red-500/5">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-600 border border-red-500/20 shadow-inner">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Re-Verification Follow-ups</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Nudge customers to fix their payment proof after you 'Disapprove' it.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest transition-colors">Interval: Days</label>
                <div className="relative">
                  <input type="number" min="0" value={disapprovedIntervalDays} onChange={(e) => setDisapprovedIntervalDays(Number(e.target.value))} className="w-full bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-white/10 rounded-2xl px-6 py-5 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all" />
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-400 uppercase">Days</span>
                </div>
              </div>
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest transition-colors">Interval: Hours</label>
                <div className="relative">
                  <input type="number" min="0" max="23" value={disapprovedIntervalHours} onChange={(e) => setDisapprovedIntervalHours(Number(e.target.value))} className="w-full bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-white/10 rounded-2xl px-6 py-5 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all" />
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-400 uppercase">Hrs</span>
                </div>
              </div>
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest transition-colors">Interval: Minutes</label>
                <div className="relative">
                  <input type="number" min="0" max="59" value={disapprovedIntervalMinutes} onChange={(e) => setDisapprovedIntervalMinutes(Number(e.target.value))} className="w-full bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-white/10 rounded-2xl px-6 py-5 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all" />
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-400 uppercase">Min</span>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest transition-colors">Max Repeat Attempts</label>
              <div className="relative">
                <input type="number" min="0" value={disapprovedCount} onChange={(e) => setDisapprovedCount(Number(e.target.value))} className="w-full bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-white/10 rounded-2xl px-6 py-5 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all" />
                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-400 uppercase">Times</span>
              </div>
            </div>
        </div>

        <div className="space-y-4">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest group-focus-within:text-red-500 transition-colors">Re-Verification Template</label>
          <textarea 
            value={disapprovedReminderMessage} 
            onChange={(e) => setDisapprovedReminderMessage(e.target.value)} 
            placeholder="We are still waiting for your corrected payment proof for Order {order_id}..."
            className="w-full bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-white/10 rounded-2xl p-6 text-sm font-medium outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all min-h-[120px] text-gray-900 dark:text-white" 
          />
          <div className="flex items-center gap-2">
            <div className="px-2 py-1 bg-red-500/10 rounded text-[9px] font-black text-red-600 uppercase tracking-wider border border-red-500/20">Tip</div>
            <p className="text-[10px] font-medium text-gray-400 tracking-tight">Sent after rejection. Remind them to check the reason you provided.</p>
          </div>
        </div>
      </div>

      {/* Global Save Button */}
      <div className="pt-4">
          <button 
            onClick={handleSave} 
            disabled={isSaving} 
            className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 rounded-[32px] font-black uppercase tracking-[0.2em] text-xs transition-all shadow-2xl shadow-blue-600/30 active:scale-[0.98] disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : showSuccess ? (
              <CheckCircle className="w-6 h-6" />
            ) : (
              <Save className="w-6 h-6" />
            )}
            {isSaving ? 'Synchronizing Pipeline...' : showSuccess ? 'Automation Configured!' : 'Update Global Sales Logic'}
          </button>
      </div>
    </div>
  );
};

export default SettingsTab;
