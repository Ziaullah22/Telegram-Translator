import React, { useState, useEffect } from 'react';
import { CreditCard, Save, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { salesAPI } from '../../services/api';

const SettingsTab: React.FC = () => {
  const [paymentDetails, setPaymentDetails] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const data = await salesAPI.getSettings();
      setPaymentDetails(data.payment_details || '');
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
      await salesAPI.updateSettings({ payment_details: paymentDetails });
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
        <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="bg-white dark:bg-[#1e293b] rounded-[32px] border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden p-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-600 border border-blue-500/20">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Payment Instructions</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Automated Assistant response after order confirmation.</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
              Payment Details (e.g. Bank Transfer, USDT, PayPal)
            </label>
            <textarea
              value={paymentDetails}
              onChange={(e) => setPaymentDetails(e.target.value)}
              placeholder="e.g. USDT (TRC20): T...&#10;Bank: My Bank (123-456-789)"
              className="w-full bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-white/10 rounded-2xl p-5 text-sm font-medium outline-none focus:border-blue-500 transition-all min-h-[200px] text-gray-900 dark:text-white leading-relaxed"
            />
            <div className="mt-4 p-4 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-500/20 rounded-xl flex items-start gap-3">
              <Info className="w-4 h-4 text-blue-600 mt-0.5" />
              <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                These details will be automatically sent to the customer by the Assistant once they confirm their order with the **CONFIRM** keyword.
              </p>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-2xl font-black text-sm transition-all shadow-lg shadow-blue-600/25 disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : showSuccess ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            {isSaving ? 'Saving...' : showSuccess ? 'Saved Successfully!' : 'Save Payment Details'}
          </button>
        </div>
      </div>

    </div>
  );
};

export default SettingsTab;
