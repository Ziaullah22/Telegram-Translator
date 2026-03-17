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
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-[#0f172a]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-gray-400 font-black uppercase tracking-widest text-xs">Loading rules...</p>
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
              <span className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30">
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
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/25 font-bold text-sm"
          >
            <Plus className="w-4 h-4" />
            New Rule
          </button>
        </div>

        {/* ── Error Message ── */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-between">
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
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl border-2 border-dashed border-gray-200 dark:border-white/5 p-12 text-center">
              <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className="text-lg font-black text-gray-900 dark:text-white mb-1">No Rules Yet</h3>
              <p className="text-gray-400 text-sm mb-6 max-w-xs mx-auto">
                Create your first automated response rule to handle messages while you're away.
              </p>
              <button
                id="ar-create-first-rule-btn"
                onClick={handleCreate}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-600/20"
              >
                <Plus className="w-4 h-4" /> Setup First Rule
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5 hover:border-blue-500/30 dark:hover:border-blue-500/30 transition-all duration-200 shadow-sm hover:shadow-md ${!rule.is_active ? 'opacity-60 grayscale' : ''}`}
                >
                  <div className="p-5 flex flex-wrap items-center justify-between gap-4">

                    {/* Left: Icon + Name + Badges */}
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
                        <Zap className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="text-base font-black text-gray-900 dark:text-white leading-none truncate">
                            {rule.name}
                          </h3>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            rule.is_active
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-300'
                          }`}>
                            {rule.is_active ? 'Active' : 'Inactive'}
                          </span>
                          <span className="px-2.5 py-1 bg-purple-500/10 text-purple-500 text-[10px] font-black uppercase tracking-widest rounded-full border border-purple-500/10">
                            {rule.language.toUpperCase()}
                          </span>
                          {rule.priority > 0 && (
                            <span className="px-2.5 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-full border border-blue-500/10">
                              Priority {rule.priority}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 italic truncate max-w-xs">
                          "{rule.response_text?.substring(0, 60) || ''}..."
                        </p>
                      </div>
                    </div>

                    {/* Center: Keywords */}
                    <div className="flex items-center gap-6 flex-wrap">
                      <div className="flex flex-wrap gap-1.5 max-w-[240px]">
                        {rule.keywords.slice(0, 4).map((keyword, idx) => (
                          <span key={idx} className="px-2.5 py-1 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 text-[10px] font-bold rounded-lg border border-gray-200 dark:border-white/5">
                            {keyword}
                          </span>
                        ))}
                        {rule.keywords.length > 4 && (
                          <span className="px-2.5 py-1 bg-gray-100 dark:bg-white/5 text-gray-500 text-[10px] font-bold rounded-lg border border-gray-200 dark:border-white/5">
                            +{rule.keywords.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2">
                      {rule.media_type && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 text-orange-500 rounded-lg text-[10px] font-black uppercase tracking-widest shrink-0">
                          {rule.media_type === 'photo' ? <Image className="w-3 h-3" /> : <Video className="w-3 h-3" />}
                          <span className="hidden sm:inline">{rule.media_type}</span>
                        </div>
                      )}
                      <button
                        onClick={() => handleToggleActive(rule)}
                        title={rule.is_active ? 'Deactivate' : 'Activate'}
                        className={`p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 transition-all ${
                          rule.is_active
                            ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
                            : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                        }`}
                      >
                        {rule.is_active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleEdit(rule)}
                        title="Edit"
                        className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        title="Delete"
                        className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
