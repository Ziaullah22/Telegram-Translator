import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Power, PowerOff, Image, Video, X } from 'lucide-react';
import { autoResponderAPI } from '../../services/api';
import type { AutoResponderRule } from '../../types';
import AutoResponderModal from './AutoResponderModal.tsx';

export default function AutoResponderPage() {
  const [rules, setRules] = useState<AutoResponderRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoResponderRule | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const handleDelete = async (ruleId: number) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    try {
      await autoResponderAPI.deleteRule(ruleId);
      await loadRules();
    } catch (err: any) {
      console.error('Failed to delete rule:', err);
      alert('Failed to delete rule');
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
    <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 overflow-hidden transition-colors duration-300">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Auto-Responder</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Automatically respond to messages with keywords
            </p>
          </div>
          <button
            id="ar-add-rule-btn"
            onClick={handleCreate}
            className="flex items-center space-x-2 px-4 py-2 bg-[#419FD9] hover:bg-[#3a8fc4] text-white rounded-lg transition-colors shadow-md shadow-[#419FD9]/20"
          >
            <Plus className="w-5 h-5" />
            <span>Add Rule</span>
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg flex items-center justify-between">
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 dark:hover:text-red-300">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Rules List */}
      <div className="flex-1 overflow-y-auto p-6" id="ar-rules-list">
        {rules.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-gray-400 dark:text-gray-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No auto-responder rules</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Create your first rule to automatically respond to messages
            </p>
            <button
              id="ar-create-first-rule-btn"
              onClick={handleCreate}
              className="px-4 py-2 bg-[#419FD9] hover:bg-[#3a8fc4] text-white rounded-lg transition-colors"
            >
              Create First Rule
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`bg-gray-50 dark:bg-gray-800 border rounded-lg p-4 transition-all ${rule.is_active
                  ? 'border-gray-200 dark:border-gray-700'
                  : 'border-gray-100 dark:border-gray-700/50 opacity-60'
                  }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2 flex-wrap gap-y-1">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{rule.name}</h3>
                      {rule.is_active ? (
                        <span className="px-2 py-1 bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 text-xs rounded-full">Active</span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs rounded-full">Inactive</span>
                      )}
                      {rule.priority > 0 && (
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs rounded-full">
                          Priority: {rule.priority}
                        </span>
                      )}
                      <span className="px-2 py-1 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 text-xs rounded-full">
                        {rule.language.toUpperCase()}
                      </span>
                    </div>

                    {/* Keywords */}
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Keywords:</p>
                      <div className="flex flex-wrap gap-2">
                        {rule.keywords.map((keyword, idx) => (
                          <span key={idx} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Response */}
                    <div className="mb-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Response:</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/50 p-2 rounded">
                        {rule.response_text}
                      </p>
                    </div>

                    {/* Media */}
                    {rule.media_type && (
                      <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                        {rule.media_type === 'photo' ? <Image className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                        <span>With {rule.media_type}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => handleToggleActive(rule)}
                      className={`p-2 rounded-lg transition-colors ${rule.is_active
                        ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-500/30'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      title={rule.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {rule.is_active ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={() => handleEdit(rule)}
                      className="p-2 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-500/30 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="p-2 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-500/30 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <AutoResponderModal
          isOpen={showModal}
          onClose={() => { setShowModal(false); setEditingRule(null); }}
          onSuccess={handleModalSuccess}
          rule={editingRule}
        />
      )}
    </div>
  );
}
