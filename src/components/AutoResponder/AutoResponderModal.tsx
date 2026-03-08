import { useState, useRef, useEffect } from 'react';
import { X, Plus, Trash2, Image, Video, Loader } from 'lucide-react';
import { autoResponderAPI } from '../../services/api';
import type { AutoResponderRule } from '../../types';

interface AutoResponderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  rule?: AutoResponderRule | null;
}

export default function AutoResponderModal({
  isOpen,
  onClose,
  onSuccess,
  rule,
}: AutoResponderModalProps) {
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState<string[]>(['']);
  const [responseText, setResponseText] = useState('');
  const [language, setLanguage] = useState('en');
  const [priority, setPriority] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [existingMedia, setExistingMedia] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setKeywords(rule.keywords.length > 0 ? rule.keywords : ['']);
      setResponseText(rule.response_text);
      setLanguage(rule.language || 'en');
      setPriority(rule.priority);
      setIsActive(rule.is_active);
      setExistingMedia(rule.media_type || null);
    } else {
      // Reset for new rule
      setName('');
      setKeywords(['']);
      setResponseText('');
      setLanguage('en');
      setPriority(0);
      setIsActive(true);
      setMediaFile(null);
      setExistingMedia(null);
    }
    setError(null);
  }, [rule, isOpen]);

  const handleAddKeyword = () => {
    setKeywords([...keywords, '']);
  };

  const handleRemoveKeyword = (index: number) => {
    if (keywords.length > 1) {
      setKeywords(keywords.filter((_, i) => i !== index));
    }
  };

  const handleKeywordChange = (index: number, value: string) => {
    const newKeywords = [...keywords];
    newKeywords[index] = value;
    setKeywords(newKeywords);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setMediaFile(e.target.files[0]);
      setExistingMedia(null);
    }
  };

  const handleRemoveMedia = async () => {
    if (rule && existingMedia) {
      try {
        await autoResponderAPI.deleteMedia(rule.id);
        setExistingMedia(null);
      } catch (err) {
        console.error('Failed to delete media:', err);
      }
    }
    setMediaFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    const validKeywords = keywords.filter(k => k.trim() !== '');
    if (validKeywords.length === 0) {
      setError('Please add at least one keyword');
      return;
    }

    if (!responseText.trim()) {
      setError('Please enter a response text');
      return;
    }

    setLoading(true);

    try {
      let ruleId: number;

      if (rule) {
        // Update existing rule
        const updated = await autoResponderAPI.updateRule(rule.id, {
          name: name.trim(),
          keywords: validKeywords,
          response_text: responseText.trim(),
          language,
          priority,
          is_active: isActive,
        });
        ruleId = updated.id;
      } else {
        // Create new rule
        const created = await autoResponderAPI.createRule({
          name: name.trim(),
          keywords: validKeywords,
          response_text: responseText.trim(),
          language,
          priority,
          is_active: isActive,
        });
        ruleId = created.id;
      }

      // Upload media if provided
      if (mediaFile) {
        setUploadingMedia(true);
        try {
          await autoResponderAPI.uploadMedia(ruleId, mediaFile);
        } catch (err) {
          console.error('Failed to upload media:', err);
          setError('Rule created but media upload failed');
        } finally {
          setUploadingMedia(false);
        }
      }

      onSuccess();
    } catch (err: any) {
      console.error('Failed to save rule:', err);
      setError(err.response?.data?.detail || 'Failed to save rule');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-[2rem] max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl transition-all duration-300">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">
            {rule ? 'Edit Auto-Responder Rule' : 'Create Auto-Responder Rule'}
          </h2>
          <button
            id="ar-modal-close"
            onClick={onClose}
            disabled={loading || uploadingMedia}
            className="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 p-2 rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Name */}
          <div id="ar-modal-name">
            <label className="block text-sm font-black text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider">
              Rule Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="e.g., Price Question"
              required
              disabled={loading || uploadingMedia}
            />
          </div>

          {/* Keywords */}
          <div id="ar-modal-keywords">
            <label className="block text-sm font-black text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider">
              Keywords * (case-insensitive)
            </label>
            <div className="space-y-2">
              {keywords.map((keyword, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => handleKeywordChange(index, e.target.value)}
                    className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="e.g., price, how much, cost"
                    disabled={loading || uploadingMedia}
                  />
                  {keywords.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(index)}
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                      disabled={loading || uploadingMedia}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleAddKeyword}
              className="mt-2 flex items-center space-x-2 text-sm text-blue-400 hover:text-blue-300"
              disabled={loading || uploadingMedia}
            >
              <Plus className="w-4 h-4" />
              <span>Add Keyword</span>
            </button>
            <p className="mt-1 text-xs text-gray-400">
              Message will match if it contains any of these keywords
            </p>
          </div>

          {/* Response Text */}
          <div id="ar-modal-response">
            <label className="block text-sm font-black text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider">
              Response Text *
            </label>
            <textarea
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all"
              placeholder="e.g., $50 per item"
              rows={4}
              required
              disabled={loading || uploadingMedia}
            />
          </div>

          {/* Language */}
          <div id="ar-modal-language">
            <label className="block text-sm font-black text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider">
              Language *
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              disabled={loading || uploadingMedia}
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="ja">Japanese</option>
              <option value="ru">Russian</option>
              <option value="zh">Chinese</option>
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Language of keywords and response. Incoming messages will be translated to this language for matching.
            </p>
          </div>

          {/* Media Upload */}
          <div id="ar-modal-media">
            <label className="block text-sm font-black text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider">
              Attach Media (Optional)
            </label>

            {existingMedia && !mediaFile && (
              <div className="mb-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl flex items-center justify-between border border-gray-100 dark:border-gray-600">
                <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
                  {existingMedia === 'photo' ? (
                    <Image className="w-4 h-4" />
                  ) : (
                    <Video className="w-4 h-4" />
                  )}
                  <span>Current: {existingMedia}</span>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveMedia}
                  className="text-red-500 hover:text-red-400"
                  disabled={loading || uploadingMedia}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}

            {mediaFile && (
              <div className="mb-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl flex items-center justify-between border border-gray-100 dark:border-gray-600">
                <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
                  {mediaFile.type.startsWith('image/') ? (
                    <Image className="w-4 h-4" />
                  ) : (
                    <Video className="w-4 h-4" />
                  )}
                  <span>{mediaFile.name}</span>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveMedia}
                  className="text-red-500 hover:text-red-400"
                  disabled={loading || uploadingMedia}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              accept="image/*,video/*"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-blue-600 file:text-white file:text-sm hover:file:bg-blue-700 transition-all cursor-pointer"
              disabled={loading || uploadingMedia}
            />
            <p className="mt-1 text-xs text-gray-400">
              Upload an image or video to send with the response
            </p>
          </div>

          {/* Priority */}
          <div id="ar-modal-priority">
            <label className="block text-sm font-black text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider">
              Priority (higher = checked first)
            </label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              min="0"
              disabled={loading || uploadingMedia}
            />
          </div>

          {/* Active Toggle */}
          <div className="flex items-center space-x-3" id="ar-modal-active">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-5 h-5 text-blue-600 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 rounded focus:ring-blue-500 accent-blue-600 transition-all cursor-pointer"
              disabled={loading || uploadingMedia}
            />
            <label htmlFor="isActive" className="text-sm font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer">
              Active (rule will trigger automatically)
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              disabled={loading || uploadingMedia}
              className="px-6 py-2.5 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all font-black text-[10px] uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              id="ar-modal-save"
              type="submit"
              disabled={loading || uploadingMedia}
              className="flex items-center space-x-2 px-8 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all shadow-lg shadow-blue-600/20 font-black text-[10px] uppercase tracking-widest active:scale-95"
            >
              {(loading || uploadingMedia) && <Loader className="w-4 h-4 animate-spin" />}
              <span>{loading || uploadingMedia ? 'Saving...' : rule ? 'Update Rule' : 'Create Rule'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
