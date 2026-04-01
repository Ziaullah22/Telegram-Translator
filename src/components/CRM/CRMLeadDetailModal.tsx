import React from 'react';
import {
  X, User, Tag, Phone, MessageSquare, Package, CreditCard,
  Truck, CheckCircle2, Circle, FileText, MapPin, Star, Calendar
} from 'lucide-react';
import type { ContactInfo } from '../../types';

interface CRMLeadDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: ContactInfo | null;
}

const PIPELINE_STAGES = ['Lead', 'Qualified', 'Negotiating', 'Ordered', 'Won', 'Lost'];

const getStageColor = (stage: string) => {
  switch (stage?.toLowerCase()) {
    case 'lead':        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    case 'qualified':   return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'negotiating': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    case 'ordered':     return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'won':         return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 ring-1 ring-green-500/30';
    case 'lost':        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    default:            return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
};

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value?: string | null }> = ({ icon, label, value }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-50 dark:border-white/5 last:border-0">
      <div className="mt-0.5 shrink-0 w-8 h-8 bg-blue-50 dark:bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-500">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
        <p className="text-sm font-semibold text-gray-800 dark:text-white mt-0.5">{value}</p>
      </div>
    </div>
  );
};

const CRMLeadDetailModal: React.FC<CRMLeadDetailModalProps> = ({ isOpen, onClose, contact }) => {
  if (!isOpen || !contact) return null;

  const displayName = contact.name || contact.telegram_id || 'Unnamed Contact';
  const initials = displayName[0]?.toUpperCase() || '?';

  return (
    <div className="fixed inset-x-0 bottom-0 top-[73px] z-[10000] flex items-center justify-center p-0 bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="bg-white dark:bg-[#111827] w-full h-full flex flex-col overflow-hidden">

        {/* ── HEADER ── */}
        <div className="border-b border-blue-100 dark:border-white/5 bg-[#f0f9ff] dark:bg-[#0f172a] z-20 shrink-0 shadow-sm transition-colors">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">

            {/* Left: Contact Identity */}
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-blue-600/20">
                {initials}
              </div>
              <div className="flex flex-col">
                <h2 className="text-lg font-black text-gray-900 dark:text-white leading-none uppercase tracking-tight">
                  {displayName}
                </h2>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                  CRM Lead Profile
                </p>
              </div>
            </div>

            {/* Right: Stage Badge + Close */}
            <div className="flex items-center gap-6">
              <div className="hidden md:flex items-center gap-1 bg-white/50 dark:bg-black/30 p-1 px-4 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm">
                <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${getStageColor(contact.pipeline_stage || 'Lead')}`}>
                  {contact.pipeline_stage || 'Lead'}
                </span>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all text-gray-400 hover:text-red-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50 dark:bg-[#111827] custom-scrollbar">
          <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* LEFT: Main Info */}
            <div className="lg:col-span-2 space-y-6">

              {/* Pipeline Progress */}
              <div className="bg-white dark:bg-[#1e293b] rounded-2xl p-5 border border-gray-100 dark:border-white/5 shadow-sm">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-blue-500 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Sales Pipeline Stage
                </h3>
                <div className="flex flex-wrap gap-2">
                  {PIPELINE_STAGES.map(stage => {
                    const isActive = (contact.pipeline_stage || 'Lead') === stage;
                    return (
                      <div
                        key={stage}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all ${
                          isActive
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-105'
                            : 'bg-gray-50 dark:bg-[#2b3d4f] text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/5'
                        }`}
                      >
                        {isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5 opacity-30" />}
                        {stage}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Contact Details */}
              <div className="bg-white dark:bg-[#1e293b] rounded-2xl p-5 border border-gray-100 dark:border-white/5 shadow-sm">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-blue-500 mb-4 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Contact Information
                </h3>
                <InfoRow icon={<User className="w-4 h-4" />} label="Full Name" value={contact.name} />
                <InfoRow icon={<Phone className="w-4 h-4" />} label="Telephone" value={contact.telephone} />
                <InfoRow icon={<MessageSquare className="w-4 h-4" />} label="Telegram Handle" value={contact.telegram_id ? `@${contact.telegram_id}` : undefined} />
                <InfoRow icon={<MessageSquare className="w-4 h-4" />} label="Telegram Alt" value={contact.telegram_id2 ? `@${contact.telegram_id2}` : undefined} />
                <InfoRow icon={<Phone className="w-4 h-4" />} label="Signal ID" value={contact.signal_id} />
                <InfoRow icon={<Phone className="w-4 h-4" />} label="Signal Alt" value={contact.signal_id2} />
                <InfoRow icon={<MapPin className="w-4 h-4" />} label="Address" value={contact.address} />
              </div>

              {/* Business & Logistics */}
              <div className="bg-white dark:bg-[#1e293b] rounded-2xl p-5 border border-gray-100 dark:border-white/5 shadow-sm">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-blue-500 mb-4 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Business & Logistics
                </h3>
                <InfoRow icon={<Package className="w-4 h-4" />} label="Product Interest" value={contact.product_interest} />
                <InfoRow icon={<Star className="w-4 h-4" />} label="Sales Volume" value={contact.sales_volume} />
                <InfoRow icon={<CreditCard className="w-4 h-4" />} label="Payment Method" value={contact.payment_method} />
                <InfoRow icon={<Truck className="w-4 h-4" />} label="Delivery Method" value={contact.delivery_method} />
                {contact.ready_for_sample !== undefined && (
                  <div className="flex items-center gap-3 py-3 border-b border-gray-50 dark:border-white/5 last:border-0">
                    <div className="shrink-0 w-8 h-8 bg-blue-50 dark:bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-500">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Sample Eligibility</p>
                      <p className={`text-sm font-bold mt-0.5 ${contact.ready_for_sample ? 'text-green-500' : 'text-gray-400'}`}>
                        {contact.ready_for_sample ? '✅ Ready for Sample' : '❌ Not eligible yet'}
                      </p>
                    </div>
                  </div>
                )}
                <InfoRow icon={<Package className="w-4 h-4" />} label="Sample Recipient Info" value={contact.sample_recipient_info} />
                <InfoRow icon={<Star className="w-4 h-4" />} label="Sample Feedback" value={contact.sample_feedback} />
              </div>
            </div>

            {/* RIGHT: Tags + Notes + Meta */}
            <div className="space-y-6">

              {/* Tags */}
              <div className="bg-white dark:bg-[#1e293b] rounded-2xl p-5 border border-gray-100 dark:border-white/5 shadow-sm">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-green-500 mb-3 flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Customer Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Array.isArray(contact.tags) && contact.tags.length > 0 ? (
                    contact.tags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-500/10 dark:bg-green-500/15 text-green-600 dark:text-green-400 rounded-full text-xs font-black border border-green-500/20"
                      >
                        <Tag className="w-3 h-3" />
                        {tag}
                      </span>
                    ))
                  ) : (
                    <p className="text-xs text-gray-400 italic">No tags added yet.</p>
                  )}
                </div>
              </div>

              {/* Notes */}
              {contact.note && (
                <div className="bg-white dark:bg-[#1e293b] rounded-2xl p-5 border border-gray-100 dark:border-white/5 shadow-sm">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-amber-500 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Internal Notes
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{contact.note}</p>
                </div>
              )}

              {/* Meta */}
              <div className="bg-white dark:bg-[#1e293b] rounded-2xl p-5 border border-gray-100 dark:border-white/5 shadow-sm">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Record Info
                </h3>
                <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex justify-between">
                    <span className="font-bold uppercase tracking-wider">Created</span>
                    <span>{new Date(contact.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                  {contact.updated_at && (
                    <div className="flex justify-between">
                      <span className="font-bold uppercase tracking-wider">Last Updated</span>
                      <span>{new Date(contact.updated_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="font-bold uppercase tracking-wider">CRM ID</span>
                    <span className="font-mono">#{contact.id}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="p-4 bg-gray-50 dark:bg-black/20 border-t border-gray-100 dark:border-white/5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center mt-auto">
          CRM Lead Profile • To edit this contact, open the chat and click the contact info button
        </div>
      </div>
    </div>
  );
};

export default CRMLeadDetailModal;
