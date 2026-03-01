import { useState, useEffect } from 'react';
import { X, User, Save } from 'lucide-react';
import { contactsAPI } from '../../services/api';
import type { ContactInfo } from '../../types';

interface ContactInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: number | null;
  onSaved?: () => void;
}

export default function ContactInfoModal({
  isOpen,
  onClose,
  conversationId,
  onSaved,
}: ContactInfoModalProps) {
  const [contactInfo, setContactInfo] = useState<Partial<ContactInfo>>({
    ready_for_sample: false,
  });
  const [existingId, setExistingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    if (isOpen && conversationId) {
      loadContactInfo();
    }
  }, [isOpen, conversationId]);

  const loadContactInfo = async () => {
    if (!conversationId) return;

    try {
      setLoading(true);
      const data = await contactsAPI.getContactInfo(conversationId);
      if (data) {
        setContactInfo(data);
        setExistingId(data.id);
      } else {
        setContactInfo({ ready_for_sample: false });
        setExistingId(null);
      }
    } catch (err) {
      console.error('Failed to load contact info:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!conversationId) return;

    try {
      setLoading(true);
      setError(null);


      if (existingId) {
        // Update existing
        await contactsAPI.updateContactInfo(existingId, contactInfo);
      } else {
        // Create new
        const newContact = await contactsAPI.createContactInfo({
          ...contactInfo,
          conversation_id: conversationId,
        });
        setExistingId(newContact.id);
      }

      // Call onSaved callback and close modal
      if (onSaved) {
        onSaved();
      }
      handleClose();
    } catch (err: any) {
      console.error('Failed to save contact info:', err);
      setError(err.response?.data?.detail || 'Failed to save contact info');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof ContactInfo, value: any) => {
    setContactInfo(prev => ({ ...prev, [field]: value }));
  };

  const handleClose = () => {
    setContactInfo({ ready_for_sample: false });
    setExistingId(null);
    setError(null);

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 transition-all duration-300">
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-[2.5rem] w-full max-w-4xl max-h-[85vh] shadow-2xl overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-gray-50 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="flex items-center space-x-4">
            <div className="bg-blue-600/10 dark:bg-blue-600/20 p-2.5 rounded-2xl">
              <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-none">Contact Profile</h2>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1.5">Manage CRM & Relationship Details</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-gray-700 p-2 rounded-xl transition-all duration-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-2xl text-red-600 dark:text-red-400 text-sm font-bold flex items-center space-x-3 animate-shake">
              <X className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-8">
            {/* --- SECTION: Personal Information --- */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.2em] border-b border-blue-50 dark:border-blue-900/30 pb-2">Personal Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">FullName</label>
                  <input
                    type="text"
                    value={contactInfo.name || ''}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-sm"
                    placeholder="Enter full name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Primary Telephone</label>
                  <input
                    type="text"
                    value={contactInfo.telephone || ''}
                    onChange={(e) => handleChange('telephone', e.target.value)}
                    className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-sm"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
              </div>
            </div>

            {/* --- SECTION: Communication Channels --- */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.2em] border-b border-blue-50 dark:border-blue-900/30 pb-2">Communication Channels</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Telegram Handle 1</label>
                  <input
                    type="text"
                    value={contactInfo.telegram_id || ''}
                    onChange={(e) => handleChange('telegram_id', e.target.value)}
                    className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white font-bold text-sm"
                    placeholder="@username"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Telegram Handle 2</label>
                  <input
                    type="text"
                    value={contactInfo.telegram_id2 || ''}
                    onChange={(e) => handleChange('telegram_id2', e.target.value)}
                    className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white font-bold text-sm"
                    placeholder="@optional_backup"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Signal ID 1</label>
                  <input
                    type="text"
                    value={contactInfo.signal_id || ''}
                    onChange={(e) => handleChange('signal_id', e.target.value)}
                    className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white font-bold text-sm"
                    placeholder="Signal Username"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Signal ID 2</label>
                  <input
                    type="text"
                    value={contactInfo.signal_id2 || ''}
                    onChange={(e) => handleChange('signal_id2', e.target.value)}
                    className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white font-bold text-sm"
                    placeholder="@backup_signal"
                  />
                </div>
              </div>
            </div>

            {/* --- SECTION: Business Details --- */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.2em] border-b border-blue-50 dark:border-blue-900/30 pb-2">Business Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Est. Sales Volume</label>
                  <input
                    type="text"
                    value={contactInfo.sales_volume || ''}
                    onChange={(e) => handleChange('sales_volume', e.target.value)}
                    className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white font-bold text-sm"
                    placeholder="e.g. $5k/Mo"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Preferred Payment</label>
                  <input
                    type="text"
                    value={contactInfo.payment_method || ''}
                    onChange={(e) => handleChange('payment_method', e.target.value)}
                    className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white font-bold text-sm"
                    placeholder="Crypto, Wire, etc"
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Product Interests</label>
                  <textarea
                    value={contactInfo.product_interest || ''}
                    onChange={(e) => handleChange('product_interest', e.target.value)}
                    rows={2}
                    className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white font-bold text-sm resize-none"
                    placeholder="What products are they looking for?"
                  />
                </div>
              </div>
            </div>

            {/* --- SECTION: Logistics --- */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.2em] border-b border-blue-50 dark:border-blue-900/30 pb-2">Logistics & Shipping</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Preferred Carrier</label>
                  <input
                    type="text"
                    value={contactInfo.delivery_method || ''}
                    onChange={(e) => handleChange('delivery_method', e.target.value)}
                    className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white font-bold text-sm"
                    placeholder="FedEx, UPS, etc"
                  />
                </div>
                <div className="flex items-center h-[56px] pt-4">
                  <label className="flex items-center cursor-pointer group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={contactInfo.ready_for_sample || false}
                        onChange={(e) => handleChange('ready_for_sample', e.target.checked)}
                        className="sr-only"
                      />
                      <div className={`w-12 h-6 rounded-full transition-colors ${contactInfo.ready_for_sample ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                      <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${contactInfo.ready_for_sample ? 'translate-x-6' : ''}`} />
                    </div>
                    <span className="ml-3 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 group-hover:text-blue-500 transition-colors">Sample Eligibility</span>
                  </label>
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Primary Delivery Address</label>
                  <textarea
                    value={contactInfo.address || ''}
                    onChange={(e) => handleChange('address', e.target.value)}
                    rows={2}
                    className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white font-bold text-sm resize-none"
                    placeholder="Street, City, State, Country, Postal Code"
                  />
                </div>
              </div>
            </div>

            {/* --- SECTION: Samples & Notes --- */}
            <div className="space-y-4 pb-4">
              <h3 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.2em] border-b border-blue-50 dark:border-blue-900/30 pb-2">Samples & Relationship Notes</h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Sample Recipient Details</label>
                  <textarea
                    value={contactInfo.sample_recipient_info || ''}
                    onChange={(e) => handleChange('sample_recipient_info', e.target.value)}
                    rows={2}
                    className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white font-bold text-sm resize-none"
                    placeholder="Specific info for samples"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Sample Feedback</label>
                  <textarea
                    value={contactInfo.sample_feedback || ''}
                    onChange={(e) => handleChange('sample_feedback', e.target.value)}
                    rows={2}
                    className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white font-bold text-sm resize-none"
                    placeholder="Customer feedback on previous samples"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Strategic Internal Notes</label>
                  <textarea
                    value={contactInfo.note || ''}
                    onChange={(e) => handleChange('note', e.target.value)}
                    rows={3}
                    className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-3xl text-gray-900 dark:text-white font-bold text-sm resize-none"
                    placeholder="Private notes for team"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-8 bg-gray-50/50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-8 py-3.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-2xl transition-all font-black uppercase tracking-widest text-[10px]"
          >
            Discard Changes
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 max-w-[200px] px-8 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl shadow-xl shadow-blue-600/30 transition-all font-black uppercase tracking-widest text-[10px] flex items-center justify-center space-x-2"
          >
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{loading ? 'Processing...' : 'Sync Information'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
