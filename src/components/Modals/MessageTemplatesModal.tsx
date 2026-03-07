import { useState, useEffect } from 'react';
import { X, Plus, Edit2, Trash2 } from 'lucide-react';
import { templatesAPI } from '../../services/api';
import type { MessageTemplate } from '../../types';
import ConfirmModal from './ConfirmModal';

interface MessageTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MessageTemplatesModal({ isOpen, onClose }: MessageTemplatesModalProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({ name: '', content: '' });
  const [error, setError] = useState<string | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await templatesAPI.getTemplates();
      setTemplates(data);
    } catch (err) {
      console.error('Failed to load templates:', err);
      setError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.content.trim()) {
      setError('Name and content are required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const newTemplate = await templatesAPI.createTemplate(formData.name, formData.content);
      setTemplates([...templates, newTemplate]);
      setFormData({ name: '', content: '' });
      setIsCreating(false);
    } catch (err) {
      console.error('Failed to create template:', err);
      setError('Failed to create template');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id: number) => {
    if (!formData.name.trim() || !formData.content.trim()) {
      setError('Name and content are required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const updated = await templatesAPI.updateTemplate(id, formData);
      setTemplates(templates.map(t => t.id === id ? updated : t));
      setEditingId(null);
      setFormData({ name: '', content: '' });
    } catch (err) {
      console.error('Failed to update template:', err);
      setError('Failed to update template');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: number) => {
    setTemplateToDelete(id);
  };

  const confirmDelete = async () => {
    if (templateToDelete === null) return;
    try {
      setLoading(true);
      setError(null);
      await templatesAPI.deleteTemplate(templateToDelete);
      setTemplates(templates.filter(t => t.id !== templateToDelete));
    } catch (err) {
      console.error('Failed to delete template:', err);
      setError('Failed to delete template');
    } finally {
      setLoading(false);
      setTemplateToDelete(null);
    }
  };

  const startEdit = (template: MessageTemplate) => {
    setEditingId(template.id);
    setFormData({ name: template.name, content: template.content });
    setIsCreating(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormData({ name: '', content: '' });
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div id="templates-modal-container" className="fixed inset-0 bg-black/30 flex items-center justify-center z-[70] p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-[#212121] rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-white/5">
          <h3 className="text-[19px] font-medium text-gray-900 dark:text-white">
            Message Templates
          </h3>
          <button
            id="templates-modal-close-btn"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg text-red-600 dark:text-red-400 text-sm font-medium flex items-center space-x-2">
              <X className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Create Form */}
          {(isCreating || editingId) && (
            <div className="mb-6 p-5 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/10 animate-fade-in">
              <h4 className="text-gray-900 dark:text-white font-medium text-sm mb-4">
                {editingId ? 'Edit Template' : 'New Request Template'}
              </h4>
              <input
                type="text"
                placeholder="Template Title (e.g., Support Replay)"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full mb-3 px-4 py-2.5 bg-white dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#3390ec] transition-colors text-sm"
              />
              <textarea
                placeholder="Your message content here..."
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                rows={4}
                className="w-full mb-4 px-4 py-2.5 bg-white dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#3390ec] transition-colors text-sm resize-none"
              />
              <div className="flex justify-end space-x-2">
                <button
                  onClick={cancelEdit}
                  className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide"
                >
                  Cancel
                </button>
                <button
                  onClick={editingId ? () => handleUpdate(editingId) : handleCreate}
                  disabled={loading}
                  className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide flex items-center justify-center min-w-[80px]"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-[#3390ec]/30 border-t-[#3390ec] rounded-full animate-spin" />
                  ) : "Save"}
                </button>
              </div>
            </div>
          )}

          {/* Create New Button */}
          {!isCreating && !editingId && (
            <button
              id="templates-modal-create-btn"
              onClick={() => setIsCreating(true)}
              className="w-full mb-6 p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-500 dark:text-gray-400 hover:text-[#3390ec] dark:hover:text-[#3390ec] hover:border-[#3390ec] hover:bg-[#3390ec]/5 transition-all flex flex-col items-center justify-center space-y-2 group"
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center group-hover:bg-[#3390ec]/10 transition-colors">
                <Plus className="w-5 h-5" />
              </div>
              <span className="font-medium text-sm">Create New Template</span>
            </button>
          )}

          {/* Templates List */}
          {loading && templates.length === 0 ? (
            <div className="text-center py-12 flex flex-col items-center">
              <div className="w-8 h-8 border-2 border-[#3390ec]/20 border-t-[#3390ec] rounded-full animate-spin mb-3" />
              <span className="text-sm text-gray-400">Fetching Templates...</span>
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm italic">
              No templates found. Create one to speed up your workflow!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((template) => (
                <div key={template.id} className="group p-5 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-xl hover:border-[#3390ec]/30 hover:shadow-lg transition-all duration-300 relative overflow-hidden">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 mr-4 min-w-0">
                      <h4 className="text-gray-900 dark:text-white font-medium text-[16px] truncate group-hover:text-[#3390ec] transition-colors">{template.name}</h4>
                    </div>
                    <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(template)}
                        className="p-1.5 text-gray-400 hover:text-[#3390ec] hover:bg-[#3390ec]/10 rounded-lg transition-all"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(template.id)}
                        className="p-1.5 text-gray-400 hover:text-[#e53935] hover:bg-[#e53935]/10 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50/50 dark:bg-black/20 rounded-lg border border-gray-50 dark:border-white/5 mb-3 h-24 overflow-y-auto scrollbar-hide">
                    <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed italic line-clamp-3 group-hover:line-clamp-none transition-all">"{template.content}"</p>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-400 font-medium">
                    <span>{template.content.length} chars</span>
                    <span>{new Date(template.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ConfirmModal
        isOpen={templateToDelete !== null}
        onClose={() => setTemplateToDelete(null)}
        onConfirm={confirmDelete}
        title="Delete Template"
        message="Are you sure you want to delete this message template? This action cannot be undone."
        confirmText="Delete"
        type="danger"
      />
    </div>
  );
}
