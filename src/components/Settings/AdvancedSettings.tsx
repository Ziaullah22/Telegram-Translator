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
  AlertCircle,
  Check,
  X,
  ChevronDown,
  Search,
  Trash2
} from 'lucide-react';
import { useRef } from 'react';
import { salesAPI } from '../../services/api';


interface AdvancedSettingsData {
  system_labels: Record<string, string>;
  system_prompts: Record<string, string>;
  protected_words: string[];
  ignored_languages: string[];
  language_expert_packs: Record<string, Record<string, string>>;
}

export default function AdvancedSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [settings, setSettings] = useState<AdvancedSettingsData>({
    system_labels: {},
    system_prompts: {},
    protected_words: [],
    ignored_languages: [],
    language_expert_packs: {}
  });

  const [initialSettings, setInitialSettings] = useState<AdvancedSettingsData | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const [activeTab, setActiveTab] = useState<'branding' | 'shield' | 'expert_packs'>('branding');
  const [newProtectedWord, setNewProtectedWord] = useState('');
  const [activePackLang, setActivePackLang] = useState<string | null>(null);
  const [newExpertKey, setNewExpertKey] = useState('');
  const [newExpertVal, setNewExpertVal] = useState('');
  const [langSearch, setLangSearch] = useState('');
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const commonLanguages = [
    { code: 'af', name: 'Afrikaans' },
    { code: 'sq', name: 'Albanian' },
    { code: 'am', name: 'Amharic' },
    { code: 'ar', name: 'Arabic' },
    { code: 'hy', name: 'Armenian' },
    { code: 'az', name: 'Azerbaijani' },
    { code: 'eu', name: 'Basque' },
    { code: 'be', name: 'Belarusian' },
    { code: 'bn', name: 'Bengali' },
    { code: 'bs', name: 'Bosnian' },
    { code: 'bg', name: 'Bulgarian' },
    { code: 'ca', name: 'Catalan' },
    { code: 'ceb', name: 'Cebuano' },
    { code: 'ny', name: 'Chichewa' },
    { code: 'zh', name: 'Chinese (Simplified)' },
    { code: 'zh-tw', name: 'Chinese (Traditional)' },
    { code: 'co', name: 'Corsican' },
    { code: 'hr', name: 'Croatian' },
    { code: 'cs', name: 'Czech' },
    { code: 'da', name: 'Danish' },
    { code: 'nl', name: 'Dutch' },
    { code: 'en', name: 'English' },
    { code: 'eo', name: 'Esperanto' },
    { code: 'et', name: 'Estonian' },
    { code: 'tl', name: 'Filipino' },
    { code: 'fi', name: 'Finnish' },
    { code: 'fr', name: 'French' },
    { code: 'fy', name: 'Frisian' },
    { code: 'gl', name: 'Galician' },
    { code: 'ka', name: 'Georgian' },
    { code: 'de', name: 'German' },
    { code: 'el', name: 'Greek' },
    { code: 'gu', name: 'Gujarati' },
    { code: 'ht', name: 'Haitian Creole' },
    { code: 'ha', name: 'Hausa' },
    { code: 'haw', name: 'Hawaiian' },
    { code: 'iw', name: 'Hebrew' },
    { code: 'hi', name: 'Hindi' },
    { code: 'hmn', name: 'Hmong' },
    { code: 'hu', name: 'Hungarian' },
    { code: 'is', name: 'Icelandic' },
    { code: 'ig', name: 'Igbo' },
    { code: 'id', name: 'Indonesian' },
    { code: 'ga', name: 'Irish' },
    { code: 'it', name: 'Italian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'jw', name: 'Javanese' },
    { code: 'kn', name: 'Kannada' },
    { code: 'kk', name: 'Kazakh' },
    { code: 'km', name: 'Khmer' },
    { code: 'rw', name: 'Kinyarwanda' },
    { code: 'ko', name: 'Korean' },
    { code: 'ku', name: 'Kurdish (Kurmanji)' },
    { code: 'ky', name: 'Kyrgyz' },
    { code: 'lo', name: 'Lao' },
    { code: 'la', name: 'Latin' },
    { code: 'lv', name: 'Latvian' },
    { code: 'lt', name: 'Lithuanian' },
    { code: 'lb', name: 'Luxembourgish' },
    { code: 'mk', name: 'Macedonian' },
    { code: 'mg', name: 'Malagasy' },
    { code: 'ms', name: 'Malay' },
    { code: 'ml', name: 'Malayalam' },
    { code: 'mt', name: 'Maltese' },
    { code: 'mi', name: 'Maori' },
    { code: 'mr', name: 'Marathi' },
    { code: 'mn', name: 'Mongolian' },
    { code: 'my', name: 'Myanmar (Burmese)' },
    { code: 'ne', name: 'Nepali' },
    { code: 'no', name: 'Norwegian' },
    { code: 'or', name: 'Odia (Oriya)' },
    { code: 'ps', name: 'Pashto' },
    { code: 'fa', name: 'Persian' },
    { code: 'pl', name: 'Polish' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'pa', name: 'Punjabi' },
    { code: 'ro', name: 'Romanian' },
    { code: 'ru', name: 'Russian' },
    { code: 'sm', name: 'Samoan' },
    { code: 'gd', name: 'Scots Gaelic' },
    { code: 'sr', name: 'Serbian' },
    { code: 'st', name: 'Sesotho' },
    { code: 'sn', name: 'Shona' },
    { code: 'sd', name: 'Sindhi' },
    { code: 'si', name: 'Sinhala' },
    { code: 'sk', name: 'Slovak' },
    { code: 'sl', name: 'Slovenian' },
    { code: 'so', name: 'Somali' },
    { code: 'es', name: 'Spanish' },
    { code: 'su', name: 'Sundanese' },
    { code: 'sw', name: 'Swahili' },
    { code: 'sv', name: 'Swedish' },
    { code: 'tg', name: 'Tajik' },
    { code: 'ta', name: 'Tamil' },
    { code: 'tt', name: 'Tatar' },
    { code: 'te', name: 'Telugu' },
    { code: 'th', name: 'Thai' },
    { code: 'tr', name: 'Turkish' },
    { code: 'tk', name: 'Turkmen' },
    { code: 'uk', name: 'Ukrainian' },
    { code: 'ur', name: 'Urdu' },
    { code: 'ug', name: 'Uyghur' },
    { code: 'uz', name: 'Uzbek' },
    { code: 'vi', name: 'Vietnamese' },
    { code: 'cy', name: 'Welsh' },
    { code: 'xh', name: 'Xhosa' },
    { code: 'yi', name: 'Yiddish' },
    { code: 'yo', name: 'Yoruba' },
    { code: 'zu', name: 'Zulu' }
  ];

  const filteredLangs = commonLanguages.filter(l => 
    l.name.toLowerCase().includes(langSearch.toLowerCase()) || 
    l.code.toLowerCase().includes(langSearch.toLowerCase())
  );

  // Hardcoded defaults to show in UI if not overridden
  const defaultLabels: Record<string, string> = {
    'ORDER_SUMMARY_TITLE': 'ORDER SUMMARY',
    'PRODUCT_LABEL': 'Product:',
    'QUANTITY_LABEL': 'Quantity:',
    'PRICE_LABEL': 'Price:',
    'DESCRIPTION_LABEL': 'Description:',
    'TOTAL_LABEL': 'Total Amount:',
    'RECEIPT_RECEIVED_LABEL': 'Screenshot Received:',
    'ORDER_INSTRUCTION': 'To order, please reply:',
    'QTY_HINT': '[quantity]',
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
    'DELIVERY_PREF_BOTH': "Great! Do you prefer this product to be Mailed to you, or delivered Hand-to-Hand? (Reply 'Mail' or 'Hand')",
    'ADDRESS_MAILING': "Great! Please provide your full mailing address.",
    'ADDRESS_HAND': "Great! Please provide your preferred meetup/delivery address.",
    'INVALID_DELIVERY_PREF': "Please reply with either 'Mail' or 'Hand'.",
    'TIME_SLOT': "What is your preferred time slot for the delivery?",
    'INSTRUCTIONS': "Do you have any extra delivery instructions? (Reply 'None' if not)",
    'EXTRA_INSTRUCTIONS': "Any extra delivery instructions we should know about? (Reply 'None' if not)",
    'CONFIRMATION_PENDING': "Please review your order summary above and type 'CONFIRM' to proceed or 'CANCEL' to discard.",
    'SCREENSHOT_RECEIVED': "✅ Thank you for the screenshot! We have received it for Order {order_id} and will verify it shortly. 🙏",
    'ORDER_CANCELLED': "❌ Order cancelled.",
    'PRODUCT_NOT_FOUND': "Sorry, I couldn't find a product matching '{product_query}'.",
    'OUT_OF_STOCK': "Sorry, {product_name} is currently out of stock.",
    'PRODUCT_NOT_FOUND_CANCEL': "Product not found. Order cancelled.",
    'INSUFFICIENT_STOCK_CANCEL': "Insufficient stock. Order cancelled.",
    'THANKS_FOR_BUSINESS': "Thank you for your business! 🙏",
    'HAND_TO_HAND_LABEL': "Hand-to-Hand Meetup",
    'MAILING_LABEL': "Mailing"
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const resp = await salesAPI.getSettings();
      const data = {
        system_labels: resp.system_labels || {},
        system_prompts: resp.system_prompts || {},
        protected_words: resp.protected_words || [],
        ignored_languages: resp.ignored_languages || [],
        language_expert_packs: resp.language_expert_packs || {}
      };
      setSettings(data);
      setInitialSettings(data);
      setHasChanges(false);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialSettings) return;
    const changed = JSON.stringify(settings) !== JSON.stringify(initialSettings);
    setHasChanges(changed);
  }, [settings, initialSettings]);

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
        ignored_languages: settings.ignored_languages,
        language_expert_packs: settings.language_expert_packs
      } as any);
      setInitialSettings(settings);
      setHasChanges(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
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


  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-[#0f172a]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0f172a] p-8 pt-0">
      <div className="max-w-5xl mx-auto">
        {/* Sticky Header and Tabs */}
        <div className="sticky top-0 z-[60] bg-gray-50/80 dark:bg-[#0f172a]/80 backdrop-blur-md pt-8 pb-4">
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
                : hasChanges 
                  ? 'bg-amber-500 text-white animate-pulse-amber' 
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

          <div className="flex flex-wrap gap-2 bg-white/50 dark:bg-white/5 p-1 rounded-2xl border border-gray-100 dark:border-white/5 w-fit">
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
              onClick={() => setActiveTab('shield')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest ${
                activeTab === 'shield' 
                  ? 'bg-white dark:bg-[#1e293b] text-blue-600 shadow-sm ring-1 ring-gray-100 dark:ring-white/5' 
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              Privacy Shield
            </button>

            <button
              onClick={() => setActiveTab('expert_packs')}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all duration-300 ${
                activeTab === 'expert_packs' 
                  ? 'bg-white dark:bg-[#1e293b] text-blue-600 shadow-sm ring-1 ring-gray-100 dark:ring-white/5' 
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Languages className="w-4 h-4" />
              Expert Overrides
            </button>
          </div>
        </div>

        {activeTab === 'branding' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
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
                  
                  // REQUIRED Keywords/Variables for each key
                  const promptGuides: Record<string, string> = {
                    'DELIVERY_PREF_BOTH': "Requires: 'Mail' and 'Hand'",
                    'INVALID_DELIVERY_PREF': "Requires: 'Mail' and 'Hand'",
                    'INSTRUCTIONS': "Suggested: '(Reply None if not)'",
                    'EXTRA_INSTRUCTIONS': "Suggested: '(Reply None if not)'",
                    'CONFIRMATION_PENDING': "Requires: 'CONFIRM' and 'CANCEL'",
                    'SCREENSHOT_RECEIVED': "Variable: {order_id}",
                    'PRODUCT_NOT_FOUND': "Variable: {product_query}",
                    'OUT_OF_STOCK': "Variable: {product_name}",
                  };

                  return (
                    <div key={key} className="space-y-3">
                      <div className="flex justify-between items-center px-1">
                        <div className="flex items-center gap-3">
                          <label className="text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
                            {key.replace(/_/g, ' ')}
                          </label>
                          {promptGuides[key] && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[9px] font-black uppercase tracking-tighter">
                              {promptGuides[key]}
                            </span>
                          )}
                        </div>
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
        {activeTab === 'shield' && (
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

          </div>
        )}

        {activeTab === 'expert_packs' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            {/* Multi-Language Expert Packs */}
            <section className="bg-white dark:bg-[#1e293b] rounded-3xl border border-gray-100 dark:border-white/5 shadow-xl relative z-10">
              <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5">
                <h3 className="font-black text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <Languages className="w-4 h-4 text-blue-500" />
                  Multi-Language Expert Packs (Human-Perfect Translation)
                </h3>
              </div>
              <div className="p-8 space-y-8">
                {/* Pack Selection Bar */}
                <div className="bg-blue-500/5 p-6 rounded-2xl border border-blue-500/10">
                {/* Existing Packs Quick Access */}
                {Object.keys(settings.language_expert_packs || {}).length > 0 && (
                  <div className="mb-6 flex flex-wrap items-center gap-3 p-4 bg-blue-600/[0.03] dark:bg-blue-600/[0.05] rounded-[24px] border border-blue-600/10 border-dashed">
                     <p className="text-[9px] font-black text-blue-600/70 dark:text-blue-400/60 uppercase tracking-[0.2em] w-full mb-1 pl-1 italic">Your Created Expert Packs:</p>
                     {Object.keys(settings.language_expert_packs || {}).map(langCode => (
                       <button
                         key={langCode}
                         onClick={() => setActivePackLang(langCode)}
                         className={`inline-flex items-center gap-2.5 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                           activePackLang === langCode
                           ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20 scale-105'
                           : 'bg-white/80 dark:bg-[#1e293b]/50 border-gray-100 dark:border-white/5 text-gray-500 dark:text-gray-400 hover:border-blue-500/30'
                         }`}
                       >
                         <div className={`w-1.5 h-1.5 rounded-full ${activePackLang === langCode ? 'bg-white animate-pulse' : 'bg-green-500 animate-pulse'}`}></div>
                         {commonLanguages.find(l => l.code === langCode)?.name || langCode.toUpperCase()}
                       </button>
                     ))}
                  </div>
                )}

                <div className="bg-[#f8fafc] dark:bg-black/20 p-8 rounded-[32px] border border-blue-500/10 shadow-sm mb-6 relative z-20">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
                    {/* Column 1: Language Dropdown */}
                    <div className="lg:col-span-4 space-y-3 relative">
                      <label className="text-[11px] font-black uppercase text-blue-600 dark:text-blue-400 ml-1 tracking-wider">1. Target Language Pack</label>
                      <div className="relative">
                        <button
                          onClick={() => setShowLangDropdown(!showLangDropdown)}
                          className="w-full bg-white dark:bg-black/40 border-2 border-blue-500/20 rounded-2xl px-5 py-4 text-sm font-bold shadow-sm flex items-center justify-between hover:border-blue-500/40 transition-all outline-none"
                        >
                          <span className={activePackLang ? "text-gray-900 dark:text-white" : "text-gray-400"}>
                            {activePackLang ? commonLanguages.find(l => l.code === activePackLang)?.name : "Select Language..."}
                          </span>
                          <div className="flex items-center gap-2">
                            <Languages className="w-4 h-4 text-gray-400" />
                            <ChevronDown className={`w-4 h-4 text-blue-500 transition-transform ${showLangDropdown ? 'rotate-180' : ''}`} />
                          </div>
                        </button>

                        {showLangDropdown && (
                          <div className="absolute top-0 left-0 right-0 -translate-y-[calc(100%+8px)] lg:top-full lg:translate-y-2 lg:mt-0 bg-white dark:bg-[#1e293b] border border-gray-100 dark:border-white/10 rounded-2xl shadow-2xl z-[100] !overflow-visible shadow-blue-600/10 flex flex-col">
                            <div className="p-3 border-b border-gray-50 dark:border-white/5 bg-gray-50/50 dark:bg-black/20 flex items-center gap-3 rounded-t-2xl">
                              <Search className="w-4 h-4 text-gray-400" />
                              <input 
                                type="text"
                                value={langSearch}
                                onChange={(e) => setLangSearch(e.target.value)}
                                placeholder="Search languages..."
                                className="bg-transparent text-xs font-bold w-full outline-none"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-1">
                              {filteredLangs.map((lang) => (
                                <button
                                  key={lang.code}
                                  onClick={() => {
                                    setActivePackLang(lang.code);
                                    setShowLangDropdown(false);
                                  }}
                                  className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-between group ${activePackLang === lang.code ? 'bg-blue-600 text-white' : 'hover:bg-blue-50 dark:hover:bg-white/5 text-gray-600 dark:text-gray-300'}`}
                                >
                                  <div className="flex items-center gap-3">
                                    {settings.language_expert_packs?.[lang.code] && (
                                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-sm shadow-green-500/40 shrink-0"></div>
                                    )}
                                    <span>{lang.name}</span>
                                  </div>
                                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg ${activePackLang === lang.code ? 'bg-white/20' : 'bg-gray-100 dark:bg-black/40 text-gray-400'}`}>{lang.code}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Column 2: Original Word */}
                    <div className="lg:col-span-4 space-y-3">
                      <label className="text-[11px] font-black uppercase text-gray-500 ml-1 tracking-wider">2. Original Phrase (English)</label>
                      <input
                        type="text"
                        value={newExpertKey}
                        onChange={(e) => setNewExpertKey(e.target.value)}
                        placeholder="e.g. Hand-to-Hand"
                        className="w-full bg-white dark:bg-black/40 border border-gray-100 dark:border-white/5 rounded-2xl px-5 py-4 text-sm font-bold shadow-sm focus:ring-4 focus:ring-blue-600/10 outline-none transition-all"
                      />
                    </div>

                    {/* Column 3: Override Word */}
                    <div className="lg:col-span-4 space-y-3">
                      <label className="text-[11px] font-black uppercase text-gray-500 ml-1 tracking-wider">3. Custom Override</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newExpertVal}
                          onChange={(e) => setNewExpertVal(e.target.value)}
                          placeholder="e.g. Mano a mano"
                          className="w-full bg-white dark:bg-black/40 border border-gray-100 dark:border-white/5 rounded-2xl px-5 py-4 text-sm font-bold shadow-sm focus:ring-4 focus:ring-blue-600/10 outline-none transition-all"
                        />
                        <button
                           disabled={saving}
                           onClick={async () => {
                             if (newExpertKey && newExpertVal && activePackLang) {
                                const currentPacks = settings.language_expert_packs || {};
                                const updatedPack = { 
                                  ...(currentPacks[activePackLang] || {}),
                                  [newExpertKey]: newExpertVal
                                };
                                const updatedPacks = {
                                  ...currentPacks,
                                  [activePackLang]: updatedPack
                                };
                                
                                const updatedSettings = {
                                  ...settings,
                                  language_expert_packs: updatedPacks
                                };
                                
                                setSettings(updatedSettings);
                                setNewExpertKey('');
                                setNewExpertVal('');

                                // AUTO-SAVE to backend
                                setSaving(true);
                                try {
                                  const currentFull = await salesAPI.getSettings();
                                  await salesAPI.updateSettings({
                                    ...currentFull,
                                    language_expert_packs: updatedPacks
                                  });
                                  setInitialSettings(updatedSettings);
                                  setHasChanges(false);
                                } catch (err) {
                                  console.error('Auto-save failed:', err);
                                } finally {
                                  setSaving(false);
                                }
                             }
                           }}
                           className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-2xl transition-all shadow-lg shadow-blue-600/20 group shrink-0 flex items-center justify-center min-w-[56px]"
                         >
                           {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white animate-spin rounded-full" /> : <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform" />}
                         </button>
                      </div>
                    </div>
                  </div>
                </div>

                {activePackLang && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center justify-between px-2">
                      <h4 className="font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/40"></div>
                        Stored Overrides for {commonLanguages.find(l => l.code === activePackLang)?.name}
                      </h4>
                      <div className="h-[1px] flex-1 mx-6 bg-gradient-to-r from-gray-100 dark:from-white/5 to-transparent"></div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            if (activePackLang) {
                              setShowDeleteConfirm(true);
                            }
                          }}
                          className="flex items-center gap-2 text-[9px] font-black text-red-500 hover:text-white uppercase tracking-widest bg-red-500/10 hover:bg-red-500 px-3 py-1.5 rounded-lg border border-red-500/10 transition-all shadow-sm"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete Pack
                        </button>
                        <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest bg-blue-600/10 px-3 py-1 rounded-lg border border-blue-600/10 whitespace-nowrap">
                          {Object.keys(settings.language_expert_packs[activePackLang] || {}).length} TERMS
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar p-2">
                      {Object.keys(settings.language_expert_packs[activePackLang] || {}).length === 0 ? (
                        <div className="col-span-full py-12 text-center bg-gray-50/50 dark:bg-black/10 rounded-[28px] border border-dashed border-gray-200 dark:border-white/10 opacity-50">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] italic">No overrides currently saved</p>
                        </div>
                      ) : (
                        Object.entries(settings.language_expert_packs[activePackLang] || {}).map(([key, value]) => (
                          <div key={key} className="p-4 flex items-center justify-between bg-white dark:bg-[#1e293b] border border-gray-100 dark:border-white/10 rounded-2xl hover:border-blue-500/30 transition-all group shadow-sm">
                            <div className="flex items-center gap-4 flex-1">
                              <div className="space-y-0.5">
                                <p className="text-[8px] font-black uppercase text-gray-400 tracking-tighter">Original</p>
                                <p className="font-bold text-xs text-gray-900 dark:text-white uppercase truncate max-w-[120px]">{key}</p>
                              </div>
                              <div className="flex items-center text-blue-400/30">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                   <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-[8px] font-black uppercase text-blue-600 dark:text-blue-400 tracking-tighter">Override</p>
                                <p className="font-black text-xs text-blue-600 dark:text-blue-400 uppercase">{value}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                if (activePackLang) {
                                  const newPacks = { ...settings.language_expert_packs };
                                  const updatedPack = { ...newPacks[activePackLang] };
                                  delete updatedPack[key];
                                  newPacks[activePackLang] = updatedPack;
                                  setSettings({ ...settings, language_expert_packs: newPacks });
                                }
                              }}
                              className="bg-red-500/5 text-red-500 p-2 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
                              title="Delete Override"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
                </div>

                <div className="bg-blue-500/5 border border-blue-500/10 p-5 rounded-2xl flex gap-4 mt-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center shrink-0">
                    <Check className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-black text-[10px] text-blue-600 dark:text-blue-400 uppercase tracking-widest">Expert Packs take Priority</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold leading-relaxed mt-0.5">
                      Terms in your Language Packs skip Google Translate entirely. This gives you total control over how critical business words sound in key markets.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Custom Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
             <div className="bg-white dark:bg-[#1e293b] rounded-[32px] p-8 max-w-sm w-full shadow-2xl border border-gray-100 dark:border-white/5 animate-in zoom-in-95 duration-300">
                <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                   <Trash2 className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-center text-gray-900 dark:text-white uppercase tracking-tight mb-2">Delete Language Pack?</h3>
                <p className="text-sm text-center text-gray-500 dark:text-gray-400 font-bold mb-8 leading-relaxed px-2">
                   This will permanently remove all human-perfect overrides for the <span className="text-red-600 dark:text-red-400 font-black">{commonLanguages.find(l => l.code === activePackLang)?.name}</span> pack.
                </p>
                <div className="flex gap-3">
                   <button 
                     onClick={() => {
                        setShowDeleteConfirm(false);
                        // Make sure to unselect so we don't have errors if it rerenders before state update
                        setActivePackLang(null);
                     }}
                     className="flex-1 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all"
                   >
                     Cancel
                   </button>
                   <button 
                     disabled={saving}
                     onClick={async () => {
                       if (activePackLang) {
                         const currentPacks = settings.language_expert_packs || {};
                         const updatedPacks = { ...currentPacks };
                         delete updatedPacks[activePackLang];
                         
                         // Update state
                         const updatedSettings = { ...settings, language_expert_packs: updatedPacks };
                         setSettings(updatedSettings);
                         
                         // Close modal and deselect
                         setShowDeleteConfirm(false);
                         setActivePackLang(null);
                         
                         // Immediate auto-save to backend
                         setSaving(true);
                         try {
                           const currentFull = await salesAPI.getSettings();
                           await salesAPI.updateSettings({
                             ...currentFull,
                             language_expert_packs: updatedPacks
                           });
                           setInitialSettings(updatedSettings);
                           setHasChanges(false);
                           setSuccess(true);
                           setTimeout(() => setSuccess(false), 3000);
                         } catch (err) {
                           console.error('Auto-save failed:', err);
                         } finally {
                           setSaving(false);
                         }
                       }
                     }}
                     className={`flex-1 ${saving ? 'bg-gray-400' : 'bg-red-500 hover:bg-red-600'} text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-red-500/20 flex items-center justify-center`}
                   >
                     {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin rounded-full" /> : 'Confirm'}
                   </button>
                </div>
             </div>
          </div>
        )}
      </div>

      {/* Floating Save Progress Button with Blinking Effect */}
      <style>{`
        @keyframes pulse-amber {
          0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.6); transform: scale(1); }
          50% { box-shadow: 0 0 0 15px rgba(245, 158, 11, 0); transform: scale(1.05); }
          100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); transform: scale(1); }
        }
        .animate-pulse-amber {
          animation: pulse-amber 2s infinite cubic-bezier(0.4, 0, 0.6, 1);
        }
      `}</style>

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
