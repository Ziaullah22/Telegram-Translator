import { useState, useEffect } from 'react';
import { X, Plus, Edit2, Trash2, Save } from 'lucide-react';
import { templatesAPI } from '../../services/api';
import type { MessageTemplate } from '../../types';

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

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      setLoading(true);
      setError(null);
      await templatesAPI.deleteTemplate(id);
      setTemplates(templates.filter(t => t.id !== id));
    } catch (err) {
      console.error('Failed to delete template:', err);
      setError('Failed to delete template');
    } finally {
      setLoading(false);
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
    <div id="templates-modal-container" className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 transition-all duration-300">
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-[2.5rem] w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-gray-50 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="flex items-center space-x-4">
            <div className="bg-blue-600/10 dark:bg-blue-600/20 p-2.5 rounded-2xl">
              <Plus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Message Templates</h2>
          </div>
          <button
            id="templates-modal-close-btn"
            onClick={onClose}
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

          {/* Create New Button */}
          {!isCreating && !editingId && (
            <button
              id="templates-modal-create-btn"
              onClick={() => setIsCreating(true)}
              className="w-full mb-6 p-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-3xl text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all flex flex-col items-center justify-center space-y-2 group"
            >
              <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-2xl group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-all">
                <Plus className="w-6 h-6" />
              </div>
              <span className="font-black uppercase tracking-widest text-[11px]">Create New Template</span>
            </button>
          )}

          {/* Create Form */}
          {isCreating && (
            <div className="mb-8 p-6 bg-gray-50 dark:bg-gray-900/50 rounded-3xl border border-gray-100 dark:border-gray-800 animate-slide-up">
              <h3 className="text-gray-900 dark:text-white font-black uppercase tracking-widest text-[10px] mb-4">New Request Template</h3>
              <input
                type="text"
                placeholder="Template Title (e.g., Support Replay)"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full mb-4 px-6 py-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-sm"
              />
              <textarea
                placeholder="Your message content here..."
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                rows={4}
                className="w-full mb-4 px-6 py-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-sm resize-none scrollbar-hide"
              />
              <div className="flex space-x-3">
                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="flex-1 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl transition-all font-black uppercase tracking-widest text-[10px] flex items-center justify-center space-x-2 shadow-lg shadow-blue-600/20"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Template</span>
                </button>
                <button
                  onClick={cancelEdit}
                  className="px-6 py-3.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-2xl transition-all font-black uppercase tracking-widest text-[10px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Templates List */}
          {loading && templates.length === 0 ? (
            <div className="text-center py-12 flex flex-col items-center">
              <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mb-4" />
              <span className="text-sm font-black text-gray-400 uppercase tracking-widest">Fetching Templates...</span>
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-gray-400 font-bold">
              No templates found. Create one to speed up your workflow!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((template) => (
                <div key={template.id} className="group p-6 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-3xl hover:border-blue-500 hover:shadow-xl transition-all duration-300 animate-fade-in relative overflow-hidden">
                  {editingId === template.id ? (
                    <div className="space-y-4">
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white font-bold text-sm"
                      />
                      <textarea
                        value={formData.content}
                        onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                        rows={4}
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white font-bold text-sm resize-none"
                      />
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleUpdate(template.id)}
                          className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase tracking-widest text-[9px] transition-all"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-black uppercase tracking-widest text-[9px]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1 mr-4">
                          <h4 className="text-gray-900 dark:text-white font-black text-lg group-hover:text-blue-600 transition-colors truncate">{template.name}</h4>
                          <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">{template.content.length} characters</span>
                        </div>
                        <div className="flex space-x-1">
                          <button
                            onClick={() => startEdit(template)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700 rounded-xl transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(template.id)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-gray-700 rounded-xl transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="p-4 bg-gray-50/50 dark:bg-gray-900/30 rounded-2xl border border-gray-50 dark:border-gray-800 mb-4 h-32 overflow-y-auto scrollbar-hide">
                        <p className="text-gray-600 dark:text-gray-300 text-sm font-medium leading-relaxed italic">"{template.content}"</p>
                      </div>
                      <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-tighter text-gray-400">
                        <span>Updated {new Date(template.updated_at).toLocaleDateString()}</span>
                        <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">ID: #{template.id}</span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
