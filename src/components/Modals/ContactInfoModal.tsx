import { useState, useEffect } from 'react';
import { X, Tag, Plus, CheckCircle2, Circle, AlertCircle } from 'lucide-react';
import { contactsAPI } from '../../services/api';
import type { ContactInfo } from '../../types';
import PeerAvatar from '../Common/PeerAvatar';

interface ContactInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: number | null;
  accountId?: number;
  peerId?: number;
  contactName?: string;
  onSaved?: () => void;
}

const PIPELINE_STAGES = ['Lead', 'Qualified', 'Negotiating', 'Ordered', 'Won', 'Lost'];

export default function ContactInfoModal({
  isOpen,
  onClose,
  conversationId,
  accountId,
  peerId,
  contactName,
  onSaved,
}: ContactInfoModalProps) {
  const [contactInfo, setContactInfo] = useState<Partial<ContactInfo>>({
    ready_for_sample: false,
  });
  const [existingId, setExistingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');


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
        setContactInfo({
          ...data,
          tags: data.tags || [],
          pipeline_stage: data.pipeline_stage || 'Lead'
        });
        setExistingId(data.id);
      } else {
        setContactInfo({ ready_for_sample: false, tags: [], pipeline_stage: 'Lead' });
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

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;

    const currentTags = contactInfo.tags || [];
    if (!currentTags.includes(trimmed)) {
      handleChange('tags', [...currentTags, trimmed]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    handleChange('tags', (contactInfo.tags || []).filter(t => t !== tagToRemove));
  };

  const handleClose = () => {
    setContactInfo({ ready_for_sample: false });
    setExistingId(null);
    setError(null);

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-end md:items-center justify-center z-[70] md:p-4 animate-fade-in" onClick={handleClose}>
      <div id="crm-modal-container" className="bg-white dark:bg-[#212121] rounded-t-2xl md:rounded-xl w-full md:max-w-2xl h-[95vh] md:h-auto md:max-h-[90vh] shadow-xl overflow-hidden flex flex-col animate-scale-in transition-all" onClick={(e) => e.stopPropagation()}>
        {/* Mobile Drag Handle */}
        <div className="md:hidden flex justify-center py-2 bg-white dark:bg-[#212121]">
          <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-100 dark:border-white/5">
          <div className="flex items-center space-x-3" id="crm-modal-profile">
            <PeerAvatar
              accountId={accountId}
              peerId={peerId}
              name={contactName || 'Unknown'}
              className="w-10 h-10 rounded-full flex-shrink-0 text-lg font-medium shadow-sm object-cover"
            />
            <div>
              <h3 className="text-[19px] font-medium text-gray-900 dark:text-white leading-none">Contact Profile</h3>
              <p className="text-[12px] text-gray-400 mt-1">{contactName}</p>
            </div>
          </div>
          <button
            id="crm-modal-close-btn"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg text-red-600 dark:text-red-400 text-sm font-medium flex items-center space-x-2">
              <X className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-6">
            {/* --- SECTION: Pipeline Status --- */}
            <div className="bg-gray-50 dark:bg-black/20 p-4 rounded-xl border border-gray-100 dark:border-white/5 shadow-inner">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[13px] font-bold text-blue-500 uppercase tracking-widest flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Sales Pipeline Status
                </h4>
                <span className="text-[10px] bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">
                  Current: {contactInfo.pipeline_stage || 'Lead'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {PIPELINE_STAGES.map((stage) => {
                  const isActive = (contactInfo.pipeline_stage || 'Lead') === stage;
                  return (
                    <button
                      key={stage}
                      onClick={() => handleChange('pipeline_stage', stage)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${isActive
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-105'
                        : 'bg-white dark:bg-[#2b3d4f] text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/5 hover:border-blue-400 dark:hover:border-blue-500/50'
                        }`}
                    >
                      {isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5 opacity-30" />}
                      {stage}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* --- SECTION: Tags --- */}
            <div className="space-y-4">
              <h4 className="text-[13px] font-medium text-[#3390ec] uppercase tracking-wider mb-2 flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Customer Tags
              </h4>
              <div className="flex flex-wrap gap-2 mb-3">
                {(contactInfo.tags || []).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/10 dark:bg-green-500/20 text-green-600 dark:text-green-400 rounded-full text-xs font-black border border-green-500/20 animate-fade-in"
                  >
                    #{tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-red-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {(contactInfo.tags || []).length === 0 && (
                  <p className="text-xs text-gray-400 italic py-1">No tags added yet...</p>
                )}
              </div>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#3390ec]"
                    placeholder="Type a tag (e.g. VIP, HighVolume) and press Enter"
                  />
                  <Tag className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                </div>
                <button
                  onClick={handleAddTag}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all flex items-center gap-1.5 text-sm font-bold shadow-lg shadow-blue-600/20"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>
            </div>

            {/* --- SECTION: Personal Information --- */}
            <div className="space-y-4" id="crm-personal-section">
              <h4 className="text-[13px] font-medium text-[#3390ec] uppercase tracking-wider mb-3">Personal Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-400 font-medium ml-1">Full Name</label>
                  <input
                    type="text"
                    value={contactInfo.name || ''}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#3390ec] text-sm transition-all"
                    placeholder="Enter full name"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-400 font-medium ml-1">Telephone</label>
                  <input
                    type="text"
                    value={contactInfo.telephone || ''}
                    onChange={(e) => handleChange('telephone', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#3390ec] text-sm transition-all"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
              </div>
            </div>

            {/* --- SECTION: Communication Channels --- */}
            <div className="space-y-4" id="crm-channels-section">
              <h4 className="text-[13px] font-medium text-[#3390ec] uppercase tracking-wider mb-3">Channels</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-400 font-medium ml-1">Telegram Handle</label>
                  <input
                    type="text"
                    value={contactInfo.telegram_id || ''}
                    onChange={(e) => handleChange('telegram_id', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-gray-900 dark:text-white text-sm"
                    placeholder="@username"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-400 font-medium ml-1">Signal ID</label>
                  <input
                    type="text"
                    value={contactInfo.signal_id || ''}
                    onChange={(e) => handleChange('signal_id', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-gray-900 dark:text-white text-sm"
                    placeholder="Signal Username"
                  />
                </div>
              </div>
            </div>

            {/* --- SECTION: Logistics --- */}
            <div className="space-y-4" id="crm-logistics-section">
              <h4 className="text-[13px] font-medium text-[#3390ec] uppercase tracking-wider mb-3">Business & Logistics</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-400 font-medium ml-1">Sales Volume</label>
                  <input
                    type="text"
                    value={contactInfo.sales_volume || ''}
                    onChange={(e) => handleChange('sales_volume', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-gray-900 dark:text-white text-sm"
                    placeholder="e.g. $5k/Mo"
                  />
                </div>
                <div className="flex items-center h-[56px] pt-2">
                  <label className="flex items-center cursor-pointer group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={contactInfo.ready_for_sample || false}
                        onChange={(e) => handleChange('ready_for_sample', e.target.checked)}
                        className="sr-only"
                      />
                      <div className={`w-10 h-5 rounded-full transition-colors ${contactInfo.ready_for_sample ? 'bg-[#3390ec]' : 'bg-gray-300 dark:bg-gray-600'}`} />
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${contactInfo.ready_for_sample ? 'translate-x-5' : ''}`} />
                    </div>
                    <span className="ml-3 text-[12px] text-gray-500 dark:text-gray-400 group-hover:text-[#3390ec] transition-colors">Sample Eligibility</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="space-y-4 pb-4">
              <h4 className="text-[13px] font-medium text-[#3390ec] uppercase tracking-wider mb-3">Internal Notes</h4>
              <textarea
                value={contactInfo.note || ''}
                onChange={(e) => handleChange('note', e.target.value)}
                rows={3}
                className="w-full px-4 py-2 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-gray-900 dark:text-white text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#3390ec]"
                placeholder="Private notes for team"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2 p-4 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-[#1a242f]/50">
          <button
            onClick={handleClose}
            disabled={loading}
            className="flex-1 md:flex-none px-4 py-2.5 md:py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide"
          >
            Discard
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 md:flex-none px-4 py-2.5 md:py-2 bg-[#3390ec] hover:bg-[#2879c9] text-white font-medium rounded-md transition-colors uppercase text-sm tracking-wide flex items-center justify-center min-w-[120px] shadow-sm"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

