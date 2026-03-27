import { useState, useEffect } from 'react';
import { 
  Settings, 
  MessageSquare, 
  Type, 
  Languages, 
  ShieldAlert, 
  Save, 
  RotateCcw,
  Plus,
  Smartphone,
  AlertCircle,
  BellOff,
  Bell,
  Check,
  X
} from 'lucide-react';
import React, { useRef } from 'react';
import { salesAPI, telegramAPI } from '../../services/api';
import type { TelegramAccount } from '../../types';


interface AdvancedSettingsData {
  system_labels: Record<string, string>;
  system_prompts: Record<string, string>;
  protected_words: string[];
  ignored_languages: string[];
}

export default function AdvancedSettings({ accounts, onAccountUpdate }: { accounts: TelegramAccount[], onAccountUpdate: (acc: TelegramAccount) => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [settings, setSettings] = useState<AdvancedSettingsData>({
    system_labels: {},
    system_prompts: {},
    protected_words: [],
    ignored_languages: []
  });

  const [activeTab, setActiveTab] = useState<'branding' | 'notifications' | 'logic'>('branding');
  const [newProtectedWord, setNewProtectedWord] = useState('');
  const [newIgnoredLang, setNewIgnoredLang] = useState('');

  // Hardcoded defaults to show in UI if not overridden
  const defaultLabels: Record<string, string> = {
    'ORDER_SUMMARY_TITLE': 'ORDER SUMMARY',
    'PRODUCT_LABEL': 'Product:',
    'QUANTITY_LABEL': 'Quantity:',
    'PRICE_LABEL': 'Price:',
    'TOTAL_LABEL': 'Total Amount:',
    'INVOICE_FOOTER_REPLY': 'Reply',
    'INVOICE_FOOTER_CONFIRM': 'to confirm',
    'INVOICE_FOOTER_DISCARD': 'to discard',
    'CONFIRM_BTN': 'CONFIRM',
    'CANCEL_BTN': 'CANCEL',
    'DELIVERY_METHOD_LABEL': 'Delivery Method:',
    'ADDRESS_LABEL': 'Address:',
    'TIME_SLOT_LABEL': 'Time Slot:',
    'INSTRUCTIONS_LABEL': 'Instructions:',
  };

  const defaultPrompts: Record<string, string> = {
    'DELIVERY_METHOD_PROMPT': "Please choose your delivery method:\n\n1. 📬 Mailing\n2. 🤝 Hand-to-Hand Meetup\n\nReply with '1' or '2'.",
    'ADDRESS_PROMPT': "Please provide your delivery address:",
    'TIME_SLOT_PROMPT': "Please provide your preferred time slot for meetup:",
    'INSTRUCTIONS_PROMPT': "Any special instructions? (Reply 'none' if none):",
    'CONFIRMATION_PENDING': "Please review your order summary above and type 'CONFIRM' to proceed or 'CANCEL' to discard.",
    'HAND_TO_HAND_LABEL': "Hand-to-Hand Meetup",
    'MAILING_LABEL': "Mailing"
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const resp = await salesAPI.getSettings();
      setSettings({
        system_labels: resp.system_labels || {},
        system_prompts: resp.system_prompts || {},
        protected_words: resp.protected_words || [],
        ignored_languages: resp.ignored_languages || []
      });
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Get all current sales settings first to avoid overwriting other fields
      const current = await salesAPI.getSettings();
      await salesAPI.updateSettings({
        ...current,
        system_labels: settings.system_labels,
        system_prompts: settings.system_prompts,
        protected_words: settings.protected_words,
        ignored_languages: settings.ignored_languages
      } as any);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const toggleNotification = async (account: TelegramAccount) => {
    try {
      const updated = await telegramAPI.updateAccount(account.id, {
        notifications_enabled: !account.notificationsEnabled
      });
      onAccountUpdate(updated);
    } catch (err) {
      console.error('Failed to toggle notifications:', err);
    }
  };

  const addProtectedWord = () => {
    if (newProtectedWord.trim() && !settings.protected_words.includes(newProtectedWord.trim())) {
      setSettings({
        ...settings,
        protected_words: [...settings.protected_words, newProtectedWord.trim()]
      });
      setNewProtectedWord('');
    }
  };

  const removeProtectedWord = (word: string) => {
    setSettings({
      ...settings,
      protected_words: settings.protected_words.filter(w => w !== word)
    });
  };

  const addIgnoredLang = () => {
    if (newIgnoredLang.trim() && !settings.ignored_languages.includes(newIgnoredLang.trim())) {
      setSettings({
        ...settings,
        ignored_languages: [...settings.ignored_languages, newIgnoredLang.trim()]
      });
      setNewIgnoredLang('');
    }
  };

  const removeIgnoredLang = (lang: string) => {
    setSettings({
      ...settings,
      ignored_languages: settings.ignored_languages.filter(l => l !== lang)
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-[#0f172a]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0f172a] p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
              <Settings className="w-8 h-8 text-blue-600" />
              Advanced Control Center
            </h2>
            <p className="text-sm text-gray-500 font-bold uppercase tracking-widest mt-1">
              Branding, System Voice & Logic
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all font-black uppercase tracking-widest text-xs shadow-lg ${
              success 
              ? 'bg-green-600 text-white shadow-green-600/20' 
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
            }`}
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin rounded-full" />
            ) : success ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {success ? 'Saved!' : 'Save Progress'}
          </button>
        </div>

        {/* Dynamic Tabs */}
        <div className="flex gap-2 mb-8 bg-white/50 dark:bg-white/5 p-1 rounded-2xl border border-gray-100 dark:border-white/5 w-fit">
          <button
            onClick={() => setActiveTab('branding')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest ${
              activeTab === 'branding' 
              ? 'bg-white dark:bg-white/10 text-blue-600 dark:text-blue-500 shadow-sm' 
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
            }`}
          >
            <Type className="w-4 h-4" />
            Branding & Voice
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest ${
              activeTab === 'notifications' 
              ? 'bg-white dark:bg-white/10 text-blue-600 dark:text-blue-500 shadow-sm' 
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
            }`}
          >
            <Bell className="w-4 h-4" />
            Account Notifications
          </button>
          <button
            onClick={() => setActiveTab('logic')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest ${
              activeTab === 'logic' 
              ? 'bg-white dark:bg-white/10 text-blue-600 dark:text-blue-500 shadow-sm' 
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            Translation Shield
          </button>
        </div>

        {activeTab === 'branding' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            {/* System Message Templates */}
            <section className="bg-white dark:bg-[#1e293b] rounded-3xl border border-gray-100 dark:border-white/5 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5">
                <h3 className="font-black text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-500" />
                  System Voice Control (Branded Prompts)
                </h3>
              </div>
              <div className="p-8 space-y-8">
                {Object.entries(defaultPrompts).map(([key, defValue]) => {
                  const val = settings.system_prompts[key] !== undefined ? settings.system_prompts[key] : defValue;
                  return (
                    <div key={key} className="space-y-3">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
                          {key.replace(/_/g, ' ')}
                        </label>
                        <button 
                          onClick={() => {
                            const newPrompts = { ...settings.system_prompts };
                            delete newPrompts[key];
                            setSettings({ ...settings, system_prompts: newPrompts });
                          }}
                          className="text-[10px] text-gray-400 hover:text-blue-500 font-bold uppercase transition-colors"
                        >
                          Reset to Original
                        </button>
                      </div>
                      <AutoHeightTextarea
                        value={val}
                        onChange={(newVal) => {
                          setSettings({
                            ...settings,
                            system_prompts: {
                              ...settings.system_prompts,
                              [key]: newVal
                            }
                          });
                        }}
                        placeholder={defValue}
                      />
                    </div>
                  );
                })}
              </div>
            </section>

            {/* System UI Labels */}
            <section className="bg-white dark:bg-[#1e293b] rounded-3xl border border-gray-100 dark:border-white/5 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5 flex items-center justify-between">
                <h3 className="font-black text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <Type className="w-4 h-4 text-indigo-500" />
                  Invoice & UI Terminology Override
                </h3>
              </div>
              <div className="p-8 space-y-8">
                {/* Add Custom Label */}
                <div className="bg-blue-500/5 p-6 rounded-2xl border border-blue-500/10 mb-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-4">
                    Add New Manual Label Override
                  </p>
                  <div className="flex flex-col md:flex-row gap-3">
                    <input 
                      type="text" 
                      id="new-label-key"
                      placeholder="KEY (e.g. CUSTOM_FOOTER)"
                      className="flex-1 bg-white dark:bg-black/40 border border-gray-100 dark:border-white/5 rounded-xl px-4 py-3 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                    <input 
                      type="text" 
                      id="new-label-value"
                      placeholder="Display Value"
                      className="flex-1 bg-white dark:bg-black/40 border border-gray-100 dark:border-white/5 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                    <button 
                      onClick={() => {
                        const kEl = document.getElementById('new-label-key') as HTMLInputElement;
                        const vEl = document.getElementById('new-label-value') as HTMLInputElement;
                        const k = kEl?.value?.trim()?.toUpperCase();
                        const v = vEl?.value?.trim();
                        if (k && v) {
                          setSettings({
                            ...settings,
                            system_labels: {
                              ...settings.system_labels,
                              [k]: v
                            }
                          });
                          if (kEl) kEl.value = '';
                          if (vEl) vEl.value = '';
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl transition-all shadow-lg font-black uppercase text-[10px] tracking-widest"
                    >
                      Add Label
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Merge defaults and custom ones for display */}
                  {Array.from(new Set([...Object.keys(defaultLabels), ...Object.keys(settings.system_labels)])).map((key) => {
                    const defValue = defaultLabels[key] || '';
                    const isCustom = !defaultLabels[key];
                    
                    return (
                      <div key={key} className={`space-y-2 p-4 rounded-2xl transition-all ${isCustom ? 'bg-indigo-500/5 border border-indigo-500/10' : ''}`}>
                        <div className="flex justify-between items-center px-1">
                          <label className="text-[10px] font-black uppercase tracking-tight text-gray-600 dark:text-gray-400 flex items-center gap-2">
                            {key.replace(/_/g, ' ')}
                            {isCustom && <span className="bg-indigo-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase">Custom</span>}
                          </label>
                        </div>
                        <div className="relative group">
                          <input
                            type="text"
                            value={settings.system_labels[key] !== undefined ? settings.system_labels[key] : defValue}
                            onChange={(e) => {
                              setSettings({
                                ...settings,
                                system_labels: {
                                  ...settings.system_labels,
                                  [key]: e.target.value
                                }
                              });
                            }}
                            className="w-full bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                            placeholder={defValue}
                          />
                          {(settings.system_labels[key] !== undefined || isCustom) && (
                            <button 
                              onClick={() => {
                                const newLabels = { ...settings.system_labels };
                                delete newLabels[key];
                                setSettings({ ...settings, system_labels: newLabels });
                              }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              {isCustom ? <X className="w-3.5 h-3.5" /> : <RotateCcw className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="animate-in fade-in slide-in-from-bottom-4">
            <section className="bg-white dark:bg-[#1e293b] rounded-3xl border border-gray-100 dark:border-white/5 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5">
                <h3 className="font-black text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <Bell className="w-4 h-4 text-blue-500" />
                  Telegram Account Notification Center
                </h3>
              </div>
              <div className="p-0 divide-y divide-gray-100 dark:divide-white/5">
                {accounts.map((account) => (
                  <div key={account.id} className="p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${account.isConnected ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                        <Smartphone className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-black text-sm text-gray-900 dark:text-white uppercase tracking-tight">
                          {account.displayName || account.accountName}
                        </h4>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">
                          {account.accountName} • {account.isConnected ? 'Active & Connected' : 'Offline'}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleNotification(account)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest ${
                        account.notificationsEnabled === false
                        ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20'
                        : 'bg-green-500/10 text-green-600 hover:bg-green-500/20'
                      }`}
                    >
                      {account.notificationsEnabled === false ? (
                        <>
                          <BellOff className="w-3.5 h-3.5" />
                          Notifications Disabled
                        </>
                      ) : (
                        <>
                          <Bell className="w-3.5 h-3.5" />
                          Notifications Enabled
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'logic' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            {/* Protected Words */}
            <section className="bg-white dark:bg-[#1e293b] rounded-3xl border border-gray-100 dark:border-white/5 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5">
                <h3 className="font-black text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                  Protected Brand Keywords (Do Not Translate)
                </h3>
              </div>
              <div className="p-8 space-y-6">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newProtectedWord}
                    onChange={(e) => setNewProtectedWord(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addProtectedWord()}
                    placeholder="Enter word/code (e.g. NIKE, BB-100)"
                    className="flex-1 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  />
                  <button 
                    onClick={addProtectedWord}
                    className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl transition-all shadow-lg shadow-blue-600/20"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {settings.protected_words.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No protected words defined yet.</p>
                  ) : (
                    settings.protected_words.map(word => (
                      <span key={word} className="flex items-center gap-2 bg-gray-100 dark:bg-white/5 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 group">
                        {word}
                        <button onClick={() => removeProtectedWord(word)} className="text-gray-400 hover:text-red-500 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 font-bold leading-relaxed">
                    Words in this list will be ignored by the translation engine. Use this for Brand names, Product Codes, or specialized terminology that should stay original.
                  </p>
                </div>
              </div>
            </section>

            {/* Ignored Languages */}
            <section className="bg-white dark:bg-[#1e293b] rounded-3xl border border-gray-100 dark:border-white/5 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5">
                <h3 className="font-black text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <Languages className="w-4 h-4 text-purple-500" />
                  Skip Translation for Specific Languages
                </h3>
              </div>
              <div className="p-8 space-y-6">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newIgnoredLang}
                    onChange={(e) => setNewIgnoredLang(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addIgnoredLang()}
                    placeholder="Enter language code (e.g. en, zh-cn)"
                    className="flex-1 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  />
                  <button 
                    onClick={addIgnoredLang}
                    className="bg-purple-600 hover:bg-purple-700 text-white p-3 rounded-xl transition-all shadow-lg shadow-purple-600/20"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {settings.ignored_languages.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No ignored languages defined yet.</p>
                  ) : (
                    settings.ignored_languages.map(lang => (
                      <span key={lang} className="flex items-center gap-2 bg-purple-100 dark:bg-purple-500/10 px-3 py-1.5 rounded-lg text-xs font-bold text-purple-600 dark:text-purple-400 group border border-purple-500/20">
                        {lang.toUpperCase()}
                        <button onClick={() => removeIgnoredLang(lang)} className="text-purple-400 hover:text-red-500 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function AutoHeightTextarea({ value, onChange, placeholder }: { value: string, onChange: (v: string) => void, placeholder: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = (el.scrollHeight + 4) + 'px';
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  // Handle window resize or visibility changes
  useEffect(() => {
    window.addEventListener('resize', adjustHeight);
    // Initial adjust
    setTimeout(adjustHeight, 50); 
    return () => window.removeEventListener('resize', adjustHeight);
  }, []);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-2xl px-5 py-4 text-base font-medium focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-gray-400 min-h-[100px] resize-none overflow-hidden"
      placeholder={placeholder}
    />
  );
}
