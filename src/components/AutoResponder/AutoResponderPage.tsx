/**
 * AUTO-RESPONDER PAGE
 * 
 * Manages automated message rules for the user side.
 * Features:
 * 1. Create rules based on keywords (Exact match or contains)
 * 2. Set responses with optional media (Video/Photo)
 * 3. Priority system for multiple matching rules
 * 4. Language-specific responding
 */
import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Power, PowerOff, Image, Video, X, Zap } from 'lucide-react';
import { autoResponderAPI } from '../../services/api';
import type { AutoResponderRule } from '../../types';
import AutoResponderModal from './AutoResponderModal.tsx';
import ConfirmModal from '../Modals/ConfirmModal';

export default function AutoResponderPage() {
  const [rules, setRules] = useState<AutoResponderRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoResponderRule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ruleToDelete, setRuleToDelete] = useState<number | null>(null);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      setLoading(true);
      const data = await autoResponderAPI.getRules();
      setRules(data);
    } catch (err: any) {
      console.error('Failed to load rules:', err);
      setError('Failed to load auto-responder rules');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingRule(null);
    setShowModal(true);
  };

  const handleEdit = (rule: AutoResponderRule) => {
    setEditingRule(rule);
    setShowModal(true);
  };

  const handleDelete = (ruleId: number) => {
    setRuleToDelete(ruleId);
  };

  const confirmDelete = async () => {
    if (ruleToDelete === null) return;
    try {
      await autoResponderAPI.deleteRule(ruleToDelete);
      await loadRules();
    } catch (err: any) {
      console.error('Failed to delete rule:', err);
      alert('Failed to delete rule');
    } finally {
      setRuleToDelete(null);
    }
  };

  const handleToggleActive = async (rule: AutoResponderRule) => {
    try {
      await autoResponderAPI.updateRule(rule.id, { is_active: !rule.is_active });
      await loadRules();
    } catch (err: any) {
      console.error('Failed to toggle rule:', err);
      alert('Failed to toggle rule');
    }
  };

  const handleModalSuccess = () => {
    setShowModal(false);
    setEditingRule(null);
    loadRules();
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900 transition-colors duration-300">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#419FD9] mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading auto-responder rules...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0f172a] p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
              <span className="w-10 h-10 bg-[#419FD9] rounded-xl flex items-center justify-center shadow-lg shadow-[#419FD9]/30">
                <Zap className="w-5 h-5 text-white" />
              </span>
              Auto-Responder Rules
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">
              Automatically respond to incoming messages using smart keyword rules.
            </p>
          </div>
          <button
            id="ar-add-rule-btn"
            onClick={handleCreate}
            className="flex items-center gap-2 bg-[#419FD9] hover:bg-[#3a8fc4] text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-[#419FD9]/25 font-bold text-sm"
          >
            <Plus className="w-5 h-5" />
            <span>New Rule</span>
          </button>
        </div>

        {/* ── Error Message ── */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-between animate-shake">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                <X className="w-5 h-5 text-red-500" />
              </div>
              <p className="text-red-600 dark:text-red-400 font-bold text-sm">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="p-2 hover:bg-white/50 dark:hover:bg-white/5 rounded-lg transition-colors">
              <X className="w-5 h-5 text-red-400" />
            </button>
          </div>
        )}

        {/* ── Rules List ── */}
        <div id="ar-rules-list">
          {rules.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-[#1e293b] rounded-3xl border-2 border-dashed border-gray-100 dark:border-white/5">
              <div className="w-20 h-20 bg-gray-50 dark:bg-black/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Zap className="w-10 h-10 text-gray-300 dark:text-gray-600" />
              </div>
              <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2">No responder rules yet</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm mx-auto font-medium">
                Create your first automated response rule to handle messages while you're away.
              </p>
              <button
                id="ar-create-first-rule-btn"
                onClick={handleCreate}
                className="inline-flex items-center gap-2 bg-[#419FD9] hover:bg-[#3a8fc4] text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-sm transition-all shadow-xl shadow-[#419FD9]/20"
              >
                <Plus className="w-5 h-5" />
                Setup First Rule
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`group bg-white dark:bg-[#1e293b] border-2 rounded-[32px] p-6 transition-all duration-300 hover:shadow-xl hover:shadow-[#419FD9]/5 ${rule.is_active
                    ? 'border-gray-100 dark:border-white/5'
                    : 'border-transparent opacity-60 grayscale'
                    }`}
                >
                  <div className="flex flex-col h-full">
                    {/* Card Header */}
                    <div className="flex items-start justify-between mb-6">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">{rule.name}</h3>
                          {rule.is_active ? (
                            <span className="w-2 h-2 rounded-full bg-green-500 shadow-lg shadow-green-500/50" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-gray-400" />
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="px-2.5 py-1 bg-purple-500/10 text-purple-500 text-[10px] font-black uppercase tracking-widest rounded-lg border border-purple-500/10">
                            {rule.language.toUpperCase()}
                          </span>
                          {rule.priority > 0 && (
                            <span className="px-2.5 py-1 bg-blue-500/10 text-blue-500 text-[10px] font-black uppercase tracking-widest rounded-lg border border-blue-500/10">
                              Priority: {rule.priority}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleActive(rule)}
                          className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${rule.is_active
                            ? 'bg-green-500/10 text-green-500 hover:bg-green-500'
                            : 'bg-gray-100 dark:bg-white/5 text-gray-400 hover:bg-gray-200'
                            } hover:text-white`}
                          title={rule.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {rule.is_active ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
                        </button>
                        <button
                          onClick={() => handleEdit(rule)}
                          className="w-10 h-10 flex items-center justify-center bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white rounded-xl transition-all"
                          title="Edit"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          className="w-10 h-10 flex items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all"
                          title="Delete"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Keywords Section */}
                    <div className="bg-gray-50/50 dark:bg-black/20 rounded-2xl p-4 mb-4 border border-gray-100 dark:border-white/5">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Target Keywords</p>
                      <div className="flex flex-wrap gap-2">
                        {rule.keywords.map((keyword, idx) => (
                          <span key={idx} className="px-3 py-1 bg-white dark:bg-white/10 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-xl shadow-sm border border-gray-100 dark:border-white/5">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Response Section */}
                    <div className="flex-1 space-y-3">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Auto-Response Message</p>
                      <div className="relative">
                        <p className="text-sm font-bold text-gray-700 dark:text-gray-300 italic leading-relaxed pl-4 border-l-4 border-[#419FD9]">
                          "{rule.response_text}"
                        </p>
                      </div>
                    </div>

                    {/* Media Footer */}
                    {rule.media_type && (
                      <div className="mt-6 flex items-center gap-2 px-4 py-2 bg-orange-500/10 text-orange-500 rounded-xl w-fit">
                        {rule.media_type === 'photo' ? <Image className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                        <span className="text-[10px] font-black uppercase tracking-widest">With Attached {rule.media_type}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showModal && (
        <AutoResponderModal
          isOpen={showModal}
          onClose={() => { setShowModal(false); setEditingRule(null); }}
          onSuccess={handleModalSuccess}
          rule={editingRule}
        />
      )}
      <ConfirmModal
        isOpen={ruleToDelete !== null}
        onClose={() => setRuleToDelete(null)}
        onConfirm={confirmDelete}
        title="Delete Rule"
        message="Are you sure you want to delete this auto-responder rule? This action cannot be undone."
        confirmText="Delete Rule"
        type="danger"
      />
    </div>
  );
}
