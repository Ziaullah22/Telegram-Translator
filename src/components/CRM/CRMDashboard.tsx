import { useState, useEffect, useMemo } from 'react';
import { User, Search, Filter, Tag as TagIcon, Building2, Phone, Calendar, Trash2 } from 'lucide-react';
import { contactsAPI } from '../../services/api';
import ConfirmModal from '../Modals/ConfirmModal';
import CRMLeadDetailModal from './CRMLeadDetailModal';
import type { ContactInfo } from '../../types';

export default function CRMDashboard() {
  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState<string>('All');
  const [selectedTag, setSelectedTag] = useState<string>('All');
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [selectedContact, setSelectedContact] = useState<ContactInfo | null>(null);

  // Load Data
  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      setIsLoading(true);
      const data = await contactsAPI.getAllContacts();
      setContacts(data);
    } catch (e) {
      console.error('Failed to load contacts', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteContact = async (contactId: number) => {
    setDeleteConfirmId(contactId);
  };

  const executeDelete = async () => {
    if (!deleteConfirmId) return;

    try {
      await contactsAPI.deleteContactInfo(deleteConfirmId);
      setContacts(prev => prev.filter(c => c.id !== deleteConfirmId));
    } catch (e) {
      console.error('Failed to delete contact', e);
      alert('Failed to delete contact. Please try again.');
    } finally {
      setDeleteConfirmId(null);
    }
  };

  // Extract unique stages & tags for the filter dropdowns
  const availableStages = useMemo(() => {
    const stages = new Set(contacts.map(c => c.pipeline_stage).filter(Boolean));
    return ['All', ...Array.from(stages)];
  }, [contacts]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    contacts.forEach(c => {
      if (Array.isArray(c.tags)) c.tags.forEach(t => tags.add(t));
    });
    return ['All', ...Array.from(tags)];
  }, [contacts]);

  // Apply filters
  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const matchSearch =
        (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.telegram_id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.note || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchStage = selectedStage === 'All' || c.pipeline_stage === selectedStage;
      const matchTag = selectedTag === 'All' || (Array.isArray(c.tags) && c.tags.includes(selectedTag));

      return matchSearch && matchStage && matchTag;
    });
  }, [contacts, searchQuery, selectedStage, selectedTag]);

  // Color mapping for pipeline stages
  const getStageColor = (stage: string) => {
    switch (stage?.toLowerCase()) {
      case 'lead': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
      case 'qualified': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'negotiating': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'ordered': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'won': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 ring-1 ring-green-500/30';
      case 'lost': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0f172a] p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8 animate-fade-in">

          {/* Header Section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
                <span className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30 flex-shrink-0">
                  <User className="w-5 h-5 text-white" />
                </span>
                CRM & Leads
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-2 text-xs sm:text-sm font-medium leading-relaxed max-w-xl">
                Manage your customer relationships, track sales pipeline progress, and organize leads with custom tags.
              </p>
            </div>
            <div className="flex flex-row items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0 bg-white dark:bg-white/5 p-3 rounded-2xl sm:p-0 sm:bg-transparent border border-gray-100 dark:border-white/5 sm:border-0 shadow-sm sm:shadow-none">
              <div className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">{filteredContacts.length}</div>
              <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-gray-400">Total Contacts</div>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">Customer List</h2>

              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full lg:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium outline-none focus:border-blue-500 transition-all w-full text-gray-900 dark:text-white shadow-sm"
                  />
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="relative flex-1 sm:flex-initial">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 flex items-center justify-center">
                      <Filter className="w-3.5 h-3.5" />
                    </div>
                    <select
                      value={selectedStage}
                      onChange={(e) => setSelectedStage(e.target.value)}
                      className="w-full pl-9 pr-8 py-2.5 bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-xl text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-200 appearance-none outline-none focus:border-blue-500 transition-all cursor-pointer shadow-sm"
                    >
                      {availableStages.map(stage => (
                        <option key={stage} value={stage}>{stage === 'All' ? 'All Stages' : stage}</option>
                      ))}
                    </select>
                  </div>

                  <div className="relative flex-1 sm:flex-initial">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 flex items-center justify-center">
                      <TagIcon className="w-3.5 h-3.5" />
                    </div>
                    <select
                      value={selectedTag}
                      onChange={(e) => setSelectedTag(e.target.value)}
                      className="w-full pl-9 pr-8 py-2.5 bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-xl text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-200 appearance-none outline-none focus:border-blue-500 transition-all cursor-pointer shadow-sm"
                    >
                      {availableTags.map(tag => (
                        <option key={tag} value={tag}>{tag === 'All' ? 'All Tags' : tag}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Data Table */}
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden">
              {isLoading ? (
                <div className="py-20 text-center">
                  <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-sm font-medium text-gray-500">Loading contacts...</p>
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="py-20 text-center px-6">
                  <Building2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No contacts found</h3>
                  <p className="text-sm text-gray-500">Try adjusting your filters or search query.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px] lg:min-w-0">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-[#0f141a] border-b border-gray-100 dark:border-white/5">
                        <th className="px-4 sm:px-6 py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-gray-400">Customer Details</th>
                        <th className="px-4 sm:px-6 py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-gray-400">Pipeline Stage</th>
                        <th className="px-4 sm:px-6 py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-gray-400">Tags</th>
                        <th className="px-4 sm:px-6 py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-gray-400 w-1/4">Notes / Info</th>
                        <th className="px-4 sm:px-6 py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-gray-400 text-right">Added</th>
                        <th className="px-4 sm:px-6 py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-gray-400 text-right w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                      {filteredContacts.map(contact => (
                        <tr key={contact.id} onClick={() => setSelectedContact(contact)} className="hover:bg-blue-500/5 dark:hover:bg-blue-500/5 transition-colors group cursor-pointer">
                          <td className="px-4 sm:px-6 py-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/40 dark:to-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-base sm:text-lg border border-white dark:border-gray-800 shadow-sm flex-shrink-0">
                                {(contact.name || contact.telegram_id || '?')[0].toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-gray-900 dark:text-white text-sm sm:text-[15px] truncate max-w-[120px] sm:max-w-none">
                                  {contact.name || 'Unnamed Contact'}
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 mt-0.5 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                                  {contact.telegram_id && <span className="font-mono truncate">@{contact.telegram_id}</span>}
                                  {contact.telephone && <span className="flex items-center gap-1 mt-0.5 sm:mt-0"><Phone className="w-3 h-3" /> {contact.telephone}</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 sm:px-6 py-4">
                            <span className={`inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider ${getStageColor(contact.pipeline_stage || 'Lead')}`}>
                              {contact.pipeline_stage || 'Lead'}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4">
                            <div className="flex flex-wrap gap-1">
                              {Array.isArray(contact.tags) && contact.tags.length > 0 ? (
                                contact.tags.map(tag => (
                                  <span key={tag} className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-gray-100 text-gray-600 dark:bg-[#2a3441] dark:text-gray-300">
                                    {tag}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-gray-400 italic">No tags</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 sm:px-6 py-4">
                            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 line-clamp-2 max-w-[200px]">
                              {contact.note || contact.product_interest || <span className="text-gray-400 italic">No notes</span>}
                            </p>
                          </td>
                          <td className="px-4 sm:px-6 py-4 text-right">
                            <div className="flex items-center justify-end space-x-1 text-[10px] sm:text-xs font-medium text-gray-500">
                              <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              <span className="whitespace-nowrap">{new Date(contact.created_at).toLocaleDateString()}</span>
                            </div>
                          </td>
                          <td className="px-4 sm:px-6 py-4 text-right">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteContact(contact.id); }}
                              className="p-2 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                              title="Delete Contact"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <CRMLeadDetailModal
        isOpen={selectedContact !== null}
        onClose={() => setSelectedContact(null)}
        contact={selectedContact}
      />
      <ConfirmModal
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={executeDelete}
        title="Delete Contact"
        message="Are you sure you want to delete this contact? This will remove their complete CRM profile and sales data."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </>
  );
}
