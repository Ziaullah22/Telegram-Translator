import { useState, useRef, useEffect } from 'react';
import { X, Plus, Trash2, Image, Video, Loader2, Zap, Target, MessageSquare, AlertCircle, Sparkles, Languages } from 'lucide-react';
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
  const scrollRef = useRef<HTMLDivElement>(null);

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
      onClose();
    } catch (err: any) {
      console.error('Failed to save rule:', err);
      setError(err.response?.data?.detail || 'Failed to save rule');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 top-[73px] z-[10000] flex items-center justify-center p-0">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" 
        onClick={onClose}
      />

      <div className="relative w-full h-full flex flex-col bg-white dark:bg-[#1a222c] overflow-hidden animate-fade-in">
        
        <div className="border-b border-blue-100 dark:border-white/5 bg-[#f0f9ff] dark:bg-[#0f172a] z-20 shrink-0 shadow-sm transition-colors">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-white leading-none uppercase tracking-tight">
                  {rule ? 'Edit Auto-Responder Rule' : 'Create Auto-Responder Rule'}
                </h2>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Setup Rules & Automated Responses</p>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <button 
                onClick={onClose} 
                className="w-10 h-10 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all text-gray-400 hover:text-red-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50/50 dark:bg-[#111827]"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
            <form onSubmit={handleSubmit} className="flex flex-col gap-8 sm:gap-10">
              {error && (
                <div className="p-4 sm:p-5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4 text-red-500 animate-shake">
                  <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
                  <p className="text-sm sm:text-base font-bold">{error}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
                <div className="flex flex-col gap-8">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                       <Target className="w-4 h-4 text-blue-500" />
                       Rule Configuration
                    </h3>
                  </div>

                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Rule Name *</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Price Inquiry"
                        className="w-full bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-2xl px-5 py-3 text-sm font-bold text-gray-900 dark:text-white focus:border-blue-500 transition-all outline-none shadow-sm"
                        required
                        disabled={loading || uploadingMedia}
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Language *</label>
                      <div className="relative group">
                         <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 transition-colors group-hover:text-blue-500">
                           <Languages className="w-4 h-4" />
                         </div>
                         <select
                           value={language}
                           onChange={(e) => setLanguage(e.target.value)}
                           className="w-full bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-2xl pl-12 pr-5 py-3 text-sm font-bold text-gray-900 dark:text-white focus:border-blue-500 transition-all outline-none shadow-sm appearance-none cursor-pointer"
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
                         <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                           <X className="w-3 h-3 rotate-45 transform" />
                         </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-4">
                      <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Priority & Status</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                          <input
                            title="Priority (higher = checked first)"
                            type="number"
                            value={priority}
                            onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
                            className="w-full bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-2xl px-5 py-3 text-sm font-bold text-gray-900 dark:text-white focus:border-blue-500 transition-all outline-none shadow-sm"
                            min="0"
                            placeholder="Priority (0)"
                            disabled={loading || uploadingMedia}
                          />
                          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest pl-2">higher = checked first</p>
                        </div>
                        <div 
                          onClick={() => !loading && !uploadingMedia && setIsActive(!isActive)}
                          className={`flex items-center justify-center gap-3 rounded-2xl border transition-all cursor-pointer font-black text-[10px] uppercase tracking-widest h-[46px] ${
                            isActive 
                            ? 'bg-blue-600/5 border-blue-600/20 text-blue-600' 
                            : 'bg-gray-100 dark:bg-white/5 border-transparent text-gray-400'
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-blue-600 animate-pulse' : 'bg-gray-400'}`} />
                          {isActive ? 'Active' : 'Inactive'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-8">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                       <Sparkles className="w-4 h-4 text-purple-500" />
                       Keywords *
                    </h3>
                  </div>

                  <div className="flex flex-col gap-5">
                    <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Match Patterns (case-insensitive)</label>
                    <div className="grid grid-cols-1 gap-3">
                      {keywords.map((keyword, index) => (
                        <div key={index} className="flex items-center gap-3 group">
                          <div className="flex-1 relative">
                            <input
                              type="text"
                              value={keyword}
                              onChange={(e) => handleKeywordChange(index, e.target.value)}
                              className="w-full bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-2xl px-5 py-3 text-sm font-bold text-gray-900 dark:text-white focus:border-purple-500 transition-all outline-none shadow-sm"
                              placeholder="e.g., price, how much, cost"
                              disabled={loading || uploadingMedia}
                            />
                            <div className="absolute top-1/2 -translate-y-1/2 left-[-20px] w-1.5 h-1.5 rounded-full bg-purple-500/20 group-focus-within:bg-purple-500 transition-colors" />
                          </div>
                          {keywords.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveKeyword(index)}
                              className="w-11 h-11 flex items-center justify-center rounded-2xl bg-red-50 dark:bg-red-500/10 text-red-500 hover:bg-red-100 dark:hover:bg-red-500/20 transition-all opacity-0 group-hover:opacity-100"
                              disabled={loading || uploadingMedia}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={handleAddKeyword}
                        className="flex items-center justify-center gap-3 py-4 border-2 border-dashed border-gray-200 dark:border-white/10 rounded-2xl text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] hover:border-purple-400 hover:text-purple-600 transition-all bg-white dark:bg-transparent hover:scale-[1.01] active:scale-[0.99]"
                        disabled={loading || uploadingMedia}
                      >
                        <Plus className="w-4 h-4" />
                        Add Keyword Pattern
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-8 bg-white dark:bg-[#1e293b] p-8 rounded-[32px] border border-gray-100 dark:border-white/5 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                       <MessageSquare className="w-5 h-5 text-blue-500" />
                       Response Text *
                    </h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="flex flex-col gap-3">
                    <textarea
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-3xl px-6 py-5 text-base font-medium text-gray-900 dark:text-white focus:border-blue-500 transition-all outline-none resize-none min-h-[200px]"
                      placeholder="e.g., $50 per item"
                      required
                      disabled={loading || uploadingMedia}
                    />
                  </div>

                  <div className="flex flex-col gap-3">
                    <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Attach Media (Optional)</label>
                    <div className="flex-1 flex flex-col gap-4">
                      <div className="flex-1 bg-gray-50 dark:bg-black/40 border-2 border-dashed border-gray-200 dark:border-white/10 rounded-[32px] overflow-hidden flex flex-col items-center justify-center p-6 transition-all hover:border-blue-400 group relative">
                        {(mediaFile || existingMedia) ? (
                          <div className="flex flex-col items-center gap-4 animate-pop-in">
                            <div className="w-20 h-20 rounded-3xl bg-blue-600/10 flex items-center justify-center text-blue-600">
                              {(mediaFile?.type.startsWith('video/') || existingMedia === 'video') ? (
                                <Video className="w-10 h-10" />
                              ) : (
                                <Image className="w-10 h-10" />
                              )}
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <p className="text-sm font-black text-gray-900 dark:text-white max-w-[200px] truncate">
                                {mediaFile ? mediaFile.name : `Current: ${existingMedia}`}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={handleRemoveMedia}
                              className="mt-2 px-5 py-2 rounded-xl bg-red-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 active:scale-95"
                              disabled={loading || uploadingMedia}
                            >
                              Remove file
                            </button>
                          </div>
                        ) : (
                          <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="flex flex-col items-center gap-3 cursor-pointer"
                          >
                            <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-400 group-hover:scale-110 transition-all group-hover:text-blue-500 group-hover:bg-blue-50 dark:group-hover:bg-blue-500/10">
                              <Plus className="w-6 h-6" />
                            </div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Upload Image or Video</p>
                          </div>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          onChange={handleFileChange}
                          accept="image/*,video/*"
                          className="hidden"
                          disabled={loading || uploadingMedia}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="h-20" />
            </form>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-white/95 dark:bg-[#1a222c]/95 backdrop-blur-xl border-t border-gray-100 dark:border-white/5 p-4 sm:py-5 sm:px-10 flex items-center justify-center gap-3 sm:gap-5 z-40 transition-all">
          <button
            type="button"
            onClick={onClose}
            disabled={loading || uploadingMedia}
            className="flex-1 sm:flex-none sm:w-40 py-3 sm:py-4 bg-transparent border-2 border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 rounded-2xl sm:rounded-3xl font-black uppercase tracking-widest text-[10px] sm:text-[11px] transition-all hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || uploadingMedia}
            className="flex-[2] sm:flex-none sm:w-80 py-3 sm:py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl sm:rounded-3xl font-black uppercase tracking-[0.1em] sm:tracking-[0.2em] text-[10px] sm:text-[11px] transition-all shadow-2xl shadow-blue-600/40 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 sm:gap-3"
          >
            {loading || uploadingMedia ? (
               <Loader2 className="w-4 h-4 animate-spin" />
            ) : null}
            <span>{loading || uploadingMedia ? 'Saving...' : rule ? 'Update Rule' : 'Create Rule'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
