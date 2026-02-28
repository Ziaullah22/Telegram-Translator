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
  const [success, setSuccess] = useState(false);

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
      setSuccess(false);

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
    setSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center space-x-2">
            <User className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-semibold text-white">Contact CRM Information</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500 rounded-lg text-green-400 text-sm">
              Contact information saved successfully!
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Name
              </label>
              <input
                type="text"
                value={contactInfo.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Contact name"
              />
            </div>

            {/* Telephone */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Telephone
              </label>
              <input
                type="text"
                value={contactInfo.telephone || ''}
                onChange={(e) => handleChange('telephone', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="+1234567890"
              />
            </div>

            {/* Telegram ID */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Telegram ID
              </label>
              <input
                type="text"
                value={contactInfo.telegram_id || ''}
                onChange={(e) => handleChange('telegram_id', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="@username"
              />
            </div>

            {/* Telegram ID 2 */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Telegram ID 2
              </label>
              <input
                type="text"
                value={contactInfo.telegram_id2 || ''}
                onChange={(e) => handleChange('telegram_id2', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="@username2"
              />
            </div>

            {/* Signal ID */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Signal ID
              </label>
              <input
                type="text"
                value={contactInfo.signal_id || ''}
                onChange={(e) => handleChange('signal_id', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Signal username"
              />
            </div>

            {/* Signal ID 2 */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Signal ID 2
              </label>
              <input
                type="text"
                value={contactInfo.signal_id2 || ''}
                onChange={(e) => handleChange('signal_id2', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Signal username 2"
              />
            </div>

            {/* Sales Volume */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Sales Volume
              </label>
              <input
                type="text"
                value={contactInfo.sales_volume || ''}
                onChange={(e) => handleChange('sales_volume', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., $10,000/month"
              />
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Payment Method
              </label>
              <input
                type="text"
                value={contactInfo.payment_method || ''}
                onChange={(e) => handleChange('payment_method', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Wire Transfer, PayPal"
              />
            </div>

            {/* Delivery Method */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Delivery Method
              </label>
              <input
                type="text"
                value={contactInfo.delivery_method || ''}
                onChange={(e) => handleChange('delivery_method', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., DHL, FedEx"
              />
            </div>

            {/* Ready for Sample */}
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={contactInfo.ready_for_sample || false}
                onChange={(e) => handleChange('ready_for_sample', e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
              />
              <label className="ml-2 text-sm font-medium text-gray-300">
                Ready for Sample
              </label>
            </div>

            {/* Address - Full Width */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Address
              </label>
              <textarea
                value={contactInfo.address || ''}
                onChange={(e) => handleChange('address', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Full address"
              />
            </div>

            {/* Product Interest - Full Width */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Product Interest
              </label>
              <textarea
                value={contactInfo.product_interest || ''}
                onChange={(e) => handleChange('product_interest', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Products they're interested in"
              />
            </div>

            {/* Sample Recipient Info - Full Width */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Sample Recipient Info
              </label>
              <textarea
                value={contactInfo.sample_recipient_info || ''}
                onChange={(e) => handleChange('sample_recipient_info', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Sample shipping details"
              />
            </div>

            {/* Sample Feedback - Full Width */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Sample Feedback
              </label>
              <textarea
                value={contactInfo.sample_feedback || ''}
                onChange={(e) => handleChange('sample_feedback', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Feedback on samples sent"
              />
            </div>

            {/* Note - Full Width */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Note
              </label>
              <textarea
                value={contactInfo.note || ''}
                onChange={(e) => handleChange('note', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Additional notes"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-700">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>{loading ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
