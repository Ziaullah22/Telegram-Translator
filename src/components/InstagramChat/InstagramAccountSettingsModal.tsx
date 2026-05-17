import { useState } from 'react';
import { X, Save, Languages, Shield } from 'lucide-react';
import type { InstagramAccount } from '../../types';
import { instagramAPI } from '../../services/api';

const COMMON_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh-cn', name: 'Chinese' }
];

interface InstagramAccountSettingsModalProps {
  account: InstagramAccount;
  onClose: () => void;
  onSave: (updatedAccount: InstagramAccount) => void;
}

export default function InstagramAccountSettingsModal({ account, onClose, onSave }: InstagramAccountSettingsModalProps) {
  const [isTranslationEnabled, setIsTranslationEnabled] = useState(account.is_translation_enabled !== false);
  const [sourceLanguage, setSourceLanguage] = useState(account.source_language || 'auto');
  const [targetLanguage, setTargetLanguage] = useState(account.target_language || 'en');
  const [proxy, setProxy] = useState(account.proxy || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await instagramAPI.updateAccountSettings(
        account.id,
        targetLanguage,
        sourceLanguage,
        isTranslationEnabled,
        proxy
      );
      
      onSave({
        ...account,
        is_translation_enabled: isTranslationEnabled,
        source_language: sourceLanguage,
        target_language: targetLanguage,
        proxy: proxy,
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[99999] p-4">
      <div className="bg-white dark:bg-[#1c2733] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-gray-100 dark:border-white/10 animate-fade-in-up">
        <div className="p-4 border-b border-gray-100 dark:border-white/5 flex items-center justify-between bg-gray-50/50 dark:bg-black/10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center shadow-inner">
              <Languages className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Translation Settings</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">@{account.username}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/10">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Enable AI Translation</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Automatically translate Instagram chats</p>
            </div>
            <button
              type="button"
              onClick={() => setIsTranslationEnabled(!isTranslationEnabled)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isTranslationEnabled ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isTranslationEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className={`space-y-4 transition-all duration-300 ${!isTranslationEnabled ? 'opacity-50 pointer-events-none filter grayscale' : ''}`}>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
                My Language (Target)
              </label>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-[#242f3d] border border-gray-200 dark:border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 dark:text-white transition-shadow"
              >
                {COMMON_LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-500 mt-1">Incoming messages will be translated TO this language.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
                Their Language (Source)
              </label>
              <select
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-[#242f3d] border border-gray-200 dark:border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 dark:text-white transition-shadow"
              >
                <option value="auto">Auto-Detect</option>
                {COMMON_LANGUAGES.map(lang => (
                   <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-500 mt-1">Outgoing messages will be translated TO this language. Incoming messages will be translated FROM this language.</p>
            </div>

            <div className="pt-4 border-t border-gray-100 dark:border-white/5">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-3 h-3 text-blue-500" />
                Manual Proxy Configuration
              </label>
              <input
                type="text"
                value={proxy}
                onChange={(e) => setProxy(e.target.value)}
                placeholder="username:password:host:port"
                className="w-full px-4 py-2.5 bg-white dark:bg-[#242f3d] border border-gray-200 dark:border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 dark:text-white transition-shadow font-mono"
              />
              <p className="text-[10px] text-gray-500 mt-1.5">
                Format: <code className="bg-gray-100 dark:bg-black/20 px-1 py-0.5 rounded text-blue-600 dark:text-blue-400">user:pass:host:port</code>
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/10 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl shadow-sm hover:shadow transition-all flex items-center disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
