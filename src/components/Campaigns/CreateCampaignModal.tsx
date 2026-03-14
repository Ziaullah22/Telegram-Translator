import React, { useState, useRef, useEffect } from 'react';
import { X, Rocket, FileText, CheckCircle2, AlertCircle, Loader2, ChevronDown, Timer, Zap, ShieldOff, Pencil, Plus, Minus, Trash2, Check, Clock, MessageSquare } from 'lucide-react';
import { campaignsAPI } from '../../services/api';
import ConfirmModal from '../Common/ConfirmModal';

interface CreateCampaignModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    editCampaignId?: number | null;
}

// --- Custom Dropdown Component (Fixed to handle screen positioning) ---
const JumpSelect = ({ value, onChange, totalSteps, currentStep }: { value: number | undefined, onChange: (val: number | undefined) => void, totalSteps: number, currentStep: number }) => {
    const [showMenu, setShowMenu] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dropDirection, setDropDirection] = useState<'down' | 'up'>('down');

    const jumpOptions = Array.from({ length: totalSteps }, (_, i) => ({
        label: `➔ Jump to Step ${i + 1}`,
        value: i + 1
    })).filter(o => o.value !== currentStep);

    useEffect(() => {
        if (showMenu && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            // If less than 350px below, flip it up to ensure items fit
            setDropDirection(spaceBelow < 350 ? 'up' : 'down');
        }
    }, [showMenu]);

    const currentLabel = value
        ? jumpOptions.find(o => o.value === value)?.label || `➔ Jump to Step ${value}`
        : "➡️ Normal: Just go to the next step";

    // If no other steps exist to jump to, just show a static "Normal" display
    if (jumpOptions.length === 0) {
        return (
            <div className="w-full bg-gray-50 dark:bg-black/10 border-2 border-gray-100 dark:border-white/5 rounded-2xl px-5 py-4 text-base font-bold text-gray-400/60 flex items-center gap-2 select-none">
                <span>{currentLabel}</span>
            </div>
        );
    }

    return (
        <div className="relative" ref={containerRef}>
            <div
                onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(!showMenu);
                }}
                className="w-full flex items-center justify-between bg-white dark:bg-black/20 border-2 border-gray-200 dark:border-white/10 rounded-2xl px-5 py-4 text-base font-bold focus:border-blue-500 outline-none appearance-none cursor-pointer transition-all hover:bg-gray-50 dark:hover:bg-white/5"
            >
                <span className={value !== undefined ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"}>
                    {currentLabel}
                </span>
                <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${showMenu ? 'rotate-180' : ''}`} />
            </div>

            {showMenu && (
                <>
                    <div className="fixed inset-0 z-[10001] bg-transparent" onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                    }} />
                    <div
                        className={`absolute left-0 right-0 z-[10002] bg-white dark:bg-[#1e293b] border border-gray-100 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-${dropDirection === 'down' ? 'top' : 'bottom'}-2 duration-200 ${dropDirection === 'down' ? 'top-full mt-2' : 'bottom-full mb-2'}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="max-h-80 overflow-y-auto py-1 custom-scrollbar">
                            <div
                                onClick={() => { onChange(undefined); setShowMenu(false); }}
                                className={`w-full text-left px-5 py-4 text-base font-bold cursor-pointer transition-colors ${value === undefined ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                            >
                                ➡️ Normal: Just go to the next step
                            </div>
                            {jumpOptions.map((opt, i) => (
                                <div
                                    key={i}
                                    onClick={() => { onChange(opt.value); setShowMenu(false); }}
                                    className={`w-full text-left px-5 py-4 text-base font-bold cursor-pointer transition-colors ${value === opt.value ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                >
                                    {opt.label}
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

// --- Animated wrapper: slides + fades in each new follow-up card ---
const AnimatedCard = ({ children }: { children: React.ReactNode }) => {
    const cardRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = cardRef.current;
        if (!el) return;
        el.style.opacity = "0";
        el.style.transform = "translateY(-24px) scale(0.97)";
        el.style.transition = "none";
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                el.style.transition = "opacity 0.4s cubic-bezier(0.16,1,0.3,1), transform 0.4s cubic-bezier(0.16,1,0.3,1), max-height 0.4s cubic-bezier(0.16,1,0.3,1)";
                el.style.opacity = "1";
                el.style.transform = "translateY(0) scale(1)";
            });
        });
    }, []);
    return <div ref={cardRef}>{children}</div>;
};

// Helper to convert days/hours/minutes to total hours (float)
const toTotalHours = (days: number, hours: number, minutes: number) =>
    (days * 24) + hours + (minutes / 60);

const DRAFT_KEY = 'campaign_creation_draft';

const KeywordReplyManager = ({ items, onChange, title, description, showTitle = true, totalSteps = 0, currentStep = 0 }: { items: any[], onChange: (items: any[]) => void, title?: string, description?: string, showTitle?: boolean, totalSteps?: number, currentStep?: number }) => {
    return (
        <div className="flex flex-col gap-5">
            {showTitle && (
                <div className="flex flex-col gap-1">
                    <h4 className="text-[11px] font-black text-gray-500 uppercase tracking-widest">{title}</h4>
                    <p className="text-[10px] font-bold text-gray-400">{description}</p>
                </div>
            )}
            
            <div className="flex flex-col gap-4">
                {items.map((item, i) => (
                    <div key={i} className="bg-white dark:bg-white/5 p-6 rounded-[32px] border-2 border-gray-100 dark:border-white/10 flex flex-col gap-5 group relative shadow-sm">
                        <div className="absolute -top-3 -left-3 w-9 h-9 rounded-full bg-purple-600 text-white flex items-center justify-center font-black text-xs shadow-lg ring-4 ring-purple-600/20">
                            {i + 1}
                        </div>
                        <button 
                            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                            className="absolute top-5 right-5 p-2 rounded-xl text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>

                        <div className="flex flex-col gap-5">
                            <div className="flex flex-col gap-3">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                    IF Lead says these keywords...
                                </label>
                                <input 
                                    placeholder="ex: yes, yeah, yup, ok"
                                    value={item.keywords || ''}
                                    onChange={(e) => {
                                        const newItems = [...items];
                                        newItems[i].keywords = e.target.value;
                                        onChange(newItems);
                                    }}
                                    className="w-full bg-gray-50 dark:bg-black/40 border-2 border-gray-100 dark:border-white/10 rounded-2xl px-5 py-3.5 text-sm font-bold outline-none focus:border-purple-500 transition-all text-gray-900 dark:text-white"
                                />
                            </div>
                            
                            <div className="flex flex-col gap-3">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                    THEN automatically reply with this...
                                </label>
                                <textarea 
                                    placeholder="Enter the message to send back..."
                                    rows={3}
                                    value={item.reply}
                                    onChange={(e) => {
                                        const newItems = [...items];
                                        newItems[i].reply = e.target.value;
                                        onChange(newItems);
                                    }}
                                    className="w-full bg-gray-50 dark:bg-black/40 border-2 border-gray-100 dark:border-white/10 rounded-2xl px-5 py-3.5 text-sm font-medium outline-none focus:border-blue-500 resize-none transition-all text-gray-900 dark:text-white"
                                />
                            </div>

                            <div className="flex flex-col gap-3">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                    AND THEN jumping to...
                                </label>
                                <JumpSelect
                                    value={item.next_step}
                                    onChange={(val) => {
                                        const newItems = [...items];
                                        newItems[i].next_step = val;
                                        onChange(newItems);
                                    }}
                                    totalSteps={totalSteps}
                                    currentStep={currentStep}
                                />
                            </div>
                        </div>
                    </div>
                ))}
                
                <button 
                    onClick={() => onChange([...items, { keywords: '', reply: '', next_step: null }])}
                    className="flex items-center justify-center gap-3 py-6 border-2 border-dashed border-gray-200 dark:border-white/10 rounded-[32px] text-xs font-black text-gray-400 uppercase tracking-[0.2em] hover:border-purple-400 hover:text-purple-600 transition-all bg-gray-50/50 dark:bg-transparent hover:scale-[1.01] active:scale-[0.99]"
                >
                    <Plus className="w-5 h-5" />
                    Add Keyword Response Rule
                </button>
            </div>
        </div>
    );
};

const CreateCampaignModal: React.FC<CreateCampaignModalProps> = ({ isOpen, onClose, onSuccess, editCampaignId }) => {
    const [step, setStep] = useState(1);
    const [name, setName] = useState('');
    const [initialMessage, setInitialMessage] = useState('');
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [negativeKeywords, setNegativeKeywords] = useState('');
    const [killSwitchEnabled, setKillSwitchEnabled] = useState(true);
    const [steps, setSteps] = useState<any[]>([]); // Strategic Sequence Steps
    
    // Popup Error State
    const [showErrorPopup, setShowErrorPopup] = useState(false);
    const [popupMessage, setPopupMessage] = useState('');
    const [failedStepIdx, setFailedStepIdx] = useState<number | null>(null);
    const [viewingStepDetail, setViewingStepDetail] = useState<{idx: number, step: any} | null>(null);
    const [isEditingAll, setIsEditingAll] = useState(false); // Global edit mode for summary
    const [editSnapshot, setEditSnapshot] = useState<any>(null); // To revert changes if cancelled
    const [globalAutoReplies, setGlobalAutoReplies] = useState<any[]>([]);
    const [showAddStepPopup, setShowAddStepPopup] = useState(false);
    const [tempNewStep, setTempNewStep] = useState<any>({
        wait_days: 1, wait_hours: 0, wait_minutes: 0,
        keywords: '', response_text: '', keyword_response_text: '',
        auto_replies: []
    });

    // --- Draft Persistence & Edit Logic ---
    useEffect(() => {
        if (!isOpen) return;
        
        const loadEditData = async () => {
            if (editCampaignId) {
                try {
                    const campaign = await campaignsAPI.getCampaign(editCampaignId);
                    const campaignSteps = await campaignsAPI.getSteps(editCampaignId);
                    
                    setName(campaign.name || '');
                    setInitialMessage(campaign.initial_message || '');
                    setNegativeKeywords((campaign.negative_keywords || []).join(', '));
                    setKillSwitchEnabled(campaign.kill_switch_enabled ?? true);
                    setGlobalAutoReplies(campaign.auto_replies || []);
                    
                    const formattedSteps = campaignSteps.map(s => ({
                        ...s,
                        wait_days: Math.floor(s.wait_time_hours / 24),
                        wait_hours: Math.floor(s.wait_time_hours % 24),
                        wait_minutes: Math.round((s.wait_time_hours % 1) * 60),
                        keywords: (s.keywords || []).join(', ')
                    }));
                    setSteps(formattedSteps);
                    
                    setStep(4); // Jump directly to summary step
                    setIsEditingAll(true);
                } catch (error) {
                    console.error("Failed to load edit campaign data:", error);
                    setError("Failed to load campaign data for editing.");
                }
            } else {
                // New campaign -> load draft
                const savedDraft = localStorage.getItem(DRAFT_KEY);
                if (savedDraft) {
                    try {
                        const draft = JSON.parse(savedDraft);
                        setName(draft.name || '');
                        setInitialMessage(draft.initialMessage || '');
                        setNegativeKeywords(draft.negativeKeywords || '');
                        setKillSwitchEnabled(draft.killSwitchEnabled ?? true);
                        setSteps(draft.steps || []);
                        setGlobalAutoReplies(draft.globalAutoReplies || []);
                        if (draft.step) setStep(draft.step);
                    } catch (e) {
                        console.error("Failed to load draft:", e);
                    }
                }
            }
        };

        loadEditData();
    }, [isOpen, editCampaignId]);

    useEffect(() => {
        if (!isOpen) return;
        try {
            const draft = {
                name,
                initialMessage,
                negativeKeywords,
                killSwitchEnabled,
                steps,
                globalAutoReplies,
                step
            };
            localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        } catch (error) {
            console.warn("Could not save draft to local storage (quota exceeded or disabled).", error);
        }
    }, [name, initialMessage, negativeKeywords, killSwitchEnabled, steps, globalAutoReplies, step, isOpen]);

    const clearDraft = () => {
        localStorage.removeItem(DRAFT_KEY);
    };


    const handleCloseErrorPopup = () => {
        setShowErrorPopup(false);
        if (failedStepIdx !== null) {
            // Give a tiny timeout for modal to fade out
            setTimeout(() => {
                const el = document.getElementById(`step-card-${failedStepIdx}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Highlight effect
                    el.classList.add('ring-4', 'ring-blue-500/30');
                    setTimeout(() => el.classList.remove('ring-4', 'ring-blue-500/30'), 2000);
                }
            }, 100);
        }
    };
        
    const fileInputRef = useRef<HTMLInputElement>(null);
    const newCardRef = useRef<HTMLDivElement>(null);

    // Reset state when opening (Only if no draft exists or user explicitly wants fresh)
    useEffect(() => {
        if (isOpen) {
            // We don't auto-reset anymore to keep drafts alive
            // But we do clear the file as it can't be saved in localStorage
            setCsvFile(null);
            setIsSubmitting(false);
            setError(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!name || !initialMessage || (!csvFile && !editCampaignId)) {
            const missing = [];
            if (!name) missing.push("Campaign Name");
            if (!initialMessage) missing.push("Initial Message");
            if (!csvFile && !editCampaignId) missing.push("CSV Lead File");
            
            const errMsg = `Please provide: ${missing.join(', ')}.`;
            setError(errMsg);
            setPopupMessage(errMsg);
            setShowErrorPopup(true);
            console.error("Validation failed:", errMsg);
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);

            const payloadSteps = steps.map(s => ({
                step_number: s.step_number,
                wait_time_hours: toTotalHours(s.wait_days || 0, s.wait_hours || 0, s.wait_minutes || 0),
                keywords: typeof s.keywords === 'string' ? s.keywords.split(',').map((k: string) => k.trim()).filter((k: string) => k) : s.keywords,
                response_text: s.response_text || "Checking in!", 
                keyword_response_text: s.keyword_response_text,
                next_step: s.next_step,
                auto_replies: (s.auto_replies || []).map((r: any) => ({
                    ...r,
                    keywords: typeof r.keywords === 'string' ? r.keywords.split(',').map((k: string) => k.trim()).filter((k: string) => k) : r.keywords
                }))
            }));

            if (editCampaignId) {
                // EDIT MODE
                await campaignsAPI.updateCampaignFull(editCampaignId, {
                    name,
                    initial_message: initialMessage,
                    negative_keywords: negativeKeywords.split(',').map(k => k.trim()).filter(k => k),
                    kill_switch_enabled: killSwitchEnabled,
                    auto_replies: globalAutoReplies.map(r => ({
                        ...r,
                        keywords: typeof r.keywords === 'string' ? r.keywords.split(',').map((k: string) => k.trim()).filter((k: string) => k) : r.keywords
                    })),
                    steps: payloadSteps
                });
            } else {
                // CREATE MODE
                // 1. Create the campaign
                const campaign = await campaignsAPI.createCampaign({
                    name,
                    initial_message: initialMessage,
                    negative_keywords: negativeKeywords.split(',').map(k => k.trim()).filter(k => k),
                    kill_switch_enabled: killSwitchEnabled,
                    auto_replies: globalAutoReplies.map(r => ({
                        ...r,
                        keywords: typeof r.keywords === 'string' ? r.keywords.split(',').map((k: string) => k.trim()).filter((k: string) => k) : r.keywords
                    }))
                });

                // 2. Upload the leads
                if (csvFile) {
                    await campaignsAPI.uploadLeads(campaign.id, csvFile);
                }

                // 3. Create AI Steps (Keywords & Responses)
                for (const s of payloadSteps) {
                    await campaignsAPI.createStep(campaign.id, s);
                }

                // 4. Launch the campaign
                try {
                    await campaignsAPI.resumeCampaign(campaign.id);
                } catch (resumeErr: any) {
                    console.error("Failed to resume campaign after creation:", resumeErr);
                }
            }

            // 5. Success cleanup
            clearDraft();
            setName('');
            setInitialMessage('');
            setNegativeKeywords('');
            setKillSwitchEnabled(true);
            setCsvFile(null);
            setSteps([]);
            setStep(1);
            setIsSubmitting(false);
            setError(null);

            onSuccess();
            onClose();

        } catch (err: any) {
            setIsSubmitting(false);
            const detail = err.response?.data?.detail;
            if (typeof detail === 'string') {
                setError(detail);
            } else if (Array.isArray(detail)) {
                setError(detail.map((d: any) => d.msg || JSON.stringify(d)).join(', '));
            } else {
                setError("An unexpected error occurred. Please check all fields and try again.");
            }
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setCsvFile(e.target.files[0]);
            setError(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[10000] flex flex-col bg-white dark:bg-[#1a222c] animate-fade-in">

            {/* ── HEADER ── */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-6 lg:px-8 py-5 shrink-0 shadow-lg">
                <div className="max-w-6xl mx-auto w-full flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center text-white border border-white/20 shadow-xl shrink-0">
                            <Rocket className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-2xl font-black text-white tracking-tight leading-none">Create a Campaign</h2>
                            <p className="text-blue-100 font-bold uppercase text-[10px] tracking-widest leading-none mt-1">Campaign Builder</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white/60 hover:text-white transition-colors shrink-0">
                        <X className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* ── SCROLLABLE BODY ── */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50 dark:bg-[#0f172a]">
                <div className="max-w-6xl mx-auto w-full px-6 lg:px-8 py-8">

                    {/* Progress Bar — 4 equal segments */}
                    <div className="flex items-center gap-3 mb-10">
                        {[1, 2, 3, 4].map((s) => (
                            <div key={s} className={`flex-1 h-3 rounded-full transition-all duration-500 ${step >= s ? 'bg-blue-600' : 'bg-gray-100 dark:bg-gray-800'}`} />
                        ))}
                    </div>

                    {/* Error banner */}
                    {error && (
                        <div className="mb-8 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4 text-red-500 animate-shake">
                            <AlertCircle className="w-6 h-6 shrink-0" />
                            <p className="text-base font-bold">{error}</p>
                        </div>
                    )}

                    {/* STEP 1: Name, Message, Stop words */}
                    {step === 1 && (
                        <div className="flex flex-col gap-8 animate-slide-right">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">1. What do you want to call your campaign?</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="e.g., My Spring Sales Campaign"
                                        className="w-full bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:border-blue-500 transition-all outline-none"
                                    />
                                    <p className="text-sm text-gray-400 italic">Pick any name — just so you can find it later.</p>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">3. Stop words — if someone says these, the campaign goes quiet</label>
                                    <input
                                        type="text"
                                        value={negativeKeywords}
                                        onChange={(e) => setNegativeKeywords(e.target.value)}
                                        placeholder="e.g. stop, no, leave me alone, not interested"
                                        disabled={!killSwitchEnabled}
                                        className={`w-full bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:border-blue-500 transition-all outline-none ${!killSwitchEnabled ? 'opacity-50 grayscale' : ''}`}
                                    />
                                    <div className="flex items-center justify-between gap-4">
                                        <p className="text-sm text-gray-400 italic">Campaign stops if they say any of these words.</p>
                                        <label className="flex items-center gap-3 cursor-pointer group shrink-0">
                                            <span className="text-sm font-black uppercase text-gray-400 group-hover:text-blue-500 transition-colors">Enabled</span>
                                            <div className="relative">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only"
                                                    checked={killSwitchEnabled}
                                                    onChange={(e) => setKillSwitchEnabled(e.target.checked)}
                                                />
                                                <div className={`block w-12 h-6 rounded-full transition-colors ${killSwitchEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`} />
                                                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full shadow transition-transform ${killSwitchEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">2. What's the very first thing your campaign should say?</label>
                                <textarea
                                    rows={6}
                                    value={initialMessage}
                                    onChange={(e) => setInitialMessage(e.target.value)}
                                    placeholder="e.g. Hey! I came across your profile and thought I'd reach out..."
                                    className="w-full bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 dark:text-white focus:border-blue-500 transition-all outline-none resize-none"
                                />
                                <p className="text-sm text-gray-400 italic">This message will be sent automatically to every person on your list.</p>
                            </div>

                            <div className="flex justify-end mt-4">
                                <button
                                    onClick={() => (name && initialMessage) ? setStep(editCampaignId ? 3 : 2) : setError("Please give your campaign a name and write a first message!")}
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-600/20"
                                >
                                    {editCampaignId ? "Next: Configure Follow-ups →" : "Next: Who should the campaign talk to? →"}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: CSV Upload */}
                    {step === 2 && (
                        <div className="flex flex-col gap-8 animate-slide-right">
                            <div className="flex flex-col gap-3">
                                <label className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">4. Upload your list of people to message</label>
                                <p className="text-base text-gray-400 italic">This is a CSV file with all the Telegram usernames you want your campaign to reach out to.</p>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`border-2 border-dashed rounded-2xl py-12 text-center transition-all cursor-pointer ${csvFile ? 'border-green-500/40 bg-green-500/5' : 'border-gray-200 dark:border-white/10 hover:border-blue-500/40 hover:bg-blue-500/5'}`}
                                >
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        accept=".csv"
                                        className="hidden"
                                    />
                                    {csvFile ? (
                                        <div className="flex flex-col items-center gap-4 animate-pop-in">
                                            <CheckCircle2 className="w-16 h-16 text-green-500" />
                                            <p className="text-gray-900 dark:text-white font-black text-xl">{csvFile.name}</p>
                                            <p className="text-gray-500 text-base font-bold uppercase tracking-widest">Your list is loaded and ready!</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-4">
                                            <FileText className="w-16 h-16 text-gray-300 dark:text-gray-600" />
                                            <p className="text-gray-900 dark:text-white font-black text-xl">Tap here to pick your CSV file</p>
                                            <p className="text-gray-500 text-base">One Telegram username per line</p>
                                            <button className="mt-2 px-10 py-4 bg-blue-600 text-white rounded-full text-sm font-black uppercase tracking-widest hover:scale-110 transition-all shadow-lg shadow-blue-600/20">Choose File</button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setStep(1)}
                                    className="flex-1 py-4 bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 rounded-xl font-black uppercase tracking-widest text-sm transition-all hover:bg-gray-200 dark:hover:bg-white/10"
                                >
                                    ← Back
                                </button>
                                <button
                                    disabled={!csvFile}
                                    onClick={() => setStep(3)}
                                    className="flex-[2] py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-blue-600/20"
                                >
                                    Next: Teach the campaign how to reply →
                                </button>
                            </div>
                        </div>
                    )}

            {/* STEP 3: Follow-up Rules */}
            {step === 3 && (
                <div className="flex flex-col gap-8 animate-slide-right pb-32">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Build your Sequence</h2>
                        <p className="text-base font-bold text-gray-400 uppercase tracking-widest">Step-by-step follow-up strategy</p>
                    </div>

                            {steps.length === 0 ? (
                                <div className="flex flex-col items-center gap-4 py-20 bg-gray-50 dark:bg-white/5 rounded-3xl border-2 border-dashed border-gray-200 dark:border-white/10">
                                    <AlertCircle className="w-14 h-14 text-gray-300" />
                                    <p className="text-lg font-bold text-gray-500 text-center">No follow-up rules added yet.<br />That's okay — the campaign will still send the first message!</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-8">
                                    {steps.map((s, idx) => (
                                        <AnimatedCard key={idx}>
                                            <div ref={idx === steps.length - 1 ? newCardRef : null} />
                                            <div id={`step-card-${idx}`} className="bg-white dark:bg-black/20 rounded-2xl border-2 border-gray-100 dark:border-white/5 overflow-hidden shadow-sm transition-all duration-500">
                                                <div className="flex items-center justify-between gap-4 bg-gray-50 dark:bg-white/5 px-6 py-4 border-b-2 border-gray-100 dark:border-white/5">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-black shadow-lg shadow-blue-600/30 shrink-0">
                                                            {idx + 1}
                                                        </div>
                                                        <span className="text-base font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Follow-up Rule {idx + 1}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setSteps(steps.filter((_, i) => i !== idx))}
                                                        className="w-11 h-11 rounded-full bg-gray-100 dark:bg-white/5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center justify-center transition-all shrink-0"
                                                    >
                                                        <X className="w-5 h-5" />
                                                    </button>
                                                </div>

                                                <div className="p-6 flex flex-col gap-6">
                                                    <div className="flex flex-col gap-3">
                                                        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                                            <Rocket className="w-4 h-4 shrink-0" />
                                                            <span className="text-sm font-black uppercase tracking-widest">1. How long should the campaign wait before doing this?</span>
                                                        </div>
                                                        <div className="flex items-stretch gap-0 bg-gray-50 dark:bg-white/5 rounded-2xl border-2 border-gray-100 dark:border-white/5 overflow-hidden">
                                                            <div className="flex-1 flex flex-col gap-1 px-6 py-5">
                                                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Days</label>
                                                                <input type="number" min="0" value={s.wait_days ?? 0} onChange={(e) => { const n = [...steps]; n[idx].wait_days = parseInt(e.target.value) || 0; setSteps(n); }} className="w-full bg-transparent text-2xl font-black text-gray-900 dark:text-white focus:text-blue-500 outline-none" />
                                                            </div>
                                                            <div className="w-px bg-gray-200 dark:bg-white/10 self-stretch" />
                                                            <div className="flex-1 flex flex-col gap-1 px-6 py-5">
                                                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Hours</label>
                                                                <input type="number" min="0" max="23" value={s.wait_hours ?? 0} onChange={(e) => { const n = [...steps]; n[idx].wait_hours = parseInt(e.target.value) || 0; setSteps(n); }} className="w-full bg-transparent text-2xl font-black text-gray-900 dark:text-white focus:text-blue-500 outline-none" />
                                                            </div>
                                                            <div className="w-px bg-gray-200 dark:bg-white/10 self-stretch" />
                                                            <div className="flex-1 flex flex-col gap-1 px-6 py-5">
                                                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Minutes</label>
                                                                <input type="number" min="0" max="59" value={s.wait_minutes ?? 0} onChange={(e) => { const n = [...steps]; n[idx].wait_minutes = parseInt(e.target.value) || 0; setSteps(n); }} className="w-full bg-transparent text-2xl font-black text-gray-900 dark:text-white focus:text-blue-500 outline-none" />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                                        <div className="flex flex-col gap-4">
                                                            <div className="flex items-center gap-2 text-gray-400">
                                                                <AlertCircle className="w-4 h-4 shrink-0" />
                                                                <span className="text-sm font-black uppercase tracking-widest">😶 If they haven't replied...</span>
                                                            </div>
                                                            <div className="relative">
                                                                <textarea
                                                                    rows={5}
                                                                    value={s.response_text}
                                                                    onChange={(e) => { const n = [...steps]; n[idx].response_text = e.target.value; setSteps(n); }}
                                                                    placeholder="Send this message to nudge them. e.g. Hey, just following up!"
                                                                    className="w-full bg-blue-50/30 dark:bg-blue-500/5 border-2 border-blue-200 dark:border-blue-500/20 focus:border-blue-500 rounded-2xl px-5 py-4 text-base font-medium outline-none resize-none transition-all min-h-[150px] text-gray-900 dark:text-white"
                                                                />
                                                                <div className="absolute top-4 right-4 opacity-20"><FileText className="w-5 h-5" /></div>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col gap-4">
                                                            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                                                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                                                                <span className="text-sm font-black uppercase tracking-widest">💬 If they wrote back...</span>
                                                            </div>
                                                            <div className="bg-purple-50/30 dark:bg-purple-500/5 p-5 rounded-[28px] border-2 border-transparent">
                                                                <KeywordReplyManager
                                                                    showTitle={false}
                                                                    items={Array.isArray(s.auto_replies) ? s.auto_replies : []}
                                                                    onChange={(newItems) => { const n = [...steps]; n[idx].auto_replies = newItems; setSteps(n); }}
                                                                    totalSteps={steps.length}
                                                                    currentStep={idx + 1}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </AnimatedCard>
                                    ))}
                                </div>
                            )}

                            {/* Sticky bottom bar for Step 3 */}
                            <div className="sticky bottom-0 left-0 right-0 bg-white dark:bg-[#1a222c] border-t-2 border-gray-100 dark:border-white/5 pt-4 pb-6 flex items-center gap-4 z-10">
                                <button
                                    onClick={() => setStep(editCampaignId ? 1 : 2)}
                                    className="flex-1 py-4 bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 rounded-xl font-black uppercase tracking-widest text-sm transition-all hover:bg-gray-200 dark:hover:bg-white/10"
                                >
                                    ← Back
                                </button>
                                <button
                                    onClick={() => {
                                        setSteps(prev => [...prev, { step_number: prev.length + 1, wait_days: 0, wait_hours: 0, wait_minutes: 0, keywords: '', response_text: '', keyword_response_text: '' }]);
                                        setTimeout(() => newCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                                    }}
                                    className="shrink-0 flex items-center gap-2 px-6 py-4 bg-white dark:bg-white/5 border-2 border-blue-500 text-blue-600 dark:text-blue-400 rounded-xl font-black uppercase tracking-widest text-sm hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all shadow-lg"
                                >
                                    <span className="text-xl leading-none font-black">+</span>
                                    <span>Add Follow-up</span>
                                </button>
                                <button
                                    onClick={() => {
                                        const emptyStepIdx = steps.findIndex(s => !s.response_text?.trim() && !s.keyword_response_text?.trim());
                                        if (emptyStepIdx !== -1) {
                                            setPopupMessage(`Follow-up Step ${emptyStepIdx + 1} is empty! Please write a message or remove the step before continuing.`);
                                            setFailedStepIdx(emptyStepIdx);
                                            setShowErrorPopup(true);
                                            return;
                                        }
                                        setError(null);
                                        setFailedStepIdx(null);
                                        setStep(4);
                                    }}
                                    className="flex-[2] py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-blue-600/20"
                                >
                                    Next: Check everything & save →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: Full Summary & Launch */}
                    {step === 4 && (
                        <div className="flex flex-col gap-10 animate-slide-right pb-10">

                            {/* Header */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
                                <div className="flex flex-col gap-2">
                                    <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Campaign Overview</h2>
                                    <p className="text-sm font-bold text-gray-400 tracking-widest uppercase">Review and edit anything below before launching.</p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    {isEditingAll && (
                                        <button
                                            onClick={() => {
                                                if (editSnapshot) {
                                                    setName(editSnapshot.name);
                                                    setInitialMessage(editSnapshot.initialMessage);
                                                    setNegativeKeywords(editSnapshot.negativeKeywords);
                                                    setGlobalAutoReplies(editSnapshot.globalAutoReplies || []);
                                                    setSteps(editSnapshot.steps);
                                                }
                                                setIsEditingAll(false);
                                                setEditSnapshot(null);
                                            }}
                                            className="px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-sm transition-all bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            if (!isEditingAll) {
                                                setEditSnapshot({
                                                    name,
                                                    initialMessage,
                                                    negativeKeywords,
                                                    globalAutoReplies: JSON.parse(JSON.stringify(globalAutoReplies)),
                                                    steps: JSON.parse(JSON.stringify(steps))
                                                });
                                                setIsEditingAll(true);
                                            } else {
                                                setIsEditingAll(false);
                                                setEditSnapshot(null);
                                            }
                                        }}
                                        className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-sm transition-all shadow-lg ${
                                            isEditingAll 
                                            ? "bg-green-600 text-white hover:bg-green-700 shadow-green-600/20" 
                                            : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20"
                                        }`}
                                    >
                                        {isEditingAll ? (
                                            <>
                                                <Check className="w-5 h-5" />
                                                <span>Save Changes</span>
                                            </>
                                        ) : (
                                            <>
                                                <Pencil className="w-4 h-4" />
                                                <span>Edit Strategy</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">

                                {/* Left Side: Editable Stats */}
                                <div className="lg:col-span-1 flex flex-col gap-6">
                                    <div className="bg-blue-600 rounded-2xl p-6 text-white shadow-2xl shadow-blue-600/30 flex flex-col gap-6">

                                        {/* Campaign Name — Editable */}
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-1">Campaign Name</span>
                                            {isEditingAll ? (
                                                <input
                                                    value={name}
                                                    onChange={e => setName(e.target.value)}
                                                    className="w-full bg-white/10 border border-white/30 rounded-xl px-3 py-2 text-white font-bold text-base outline-none focus:border-white/60 placeholder-white/40"
                                                />
                                            ) : (
                                                <p className="text-2xl font-black break-all leading-tight">{name}</p>
                                            )}
                                        </div>

                                        <div className="h-px bg-white/20" />

                                        {/* File info */}
                                        <div className="flex items-start gap-4">
                                            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center shrink-0"><FileText className="w-6 h-6 text-white" /></div>
                                            <div className="flex flex-col gap-1 min-w-0 flex-1 pt-1">
                                                <span className="text-xs font-black text-blue-200 uppercase tracking-widest leading-none truncate block">Target Audience</span>
                                                <span className="text-lg font-bold break-all leading-tight block">{editCampaignId ? "Active Campaign Leads" : csvFile?.name}</span>
                                            </div>
                                        </div>

                                        {/* Steps count */}
                                        <div className="flex items-center gap-4 mt-2">
                                            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center shrink-0"><Zap className="w-6 h-6 text-white" /></div>
                                            <div className="flex flex-col gap-1 min-w-0 flex-1">
                                                <span className="text-xs font-black text-blue-200 uppercase tracking-widest leading-none truncate block">Total Message Sequence</span>
                                                <span className="text-lg font-bold block">{steps.length} follow-up step{steps.length !== 1 ? 's' : ''}</span>
                                            </div>
                                        </div>
                                    </div>


                                    {/* Safety Words — Editable */}
                                    <div className="bg-white dark:bg-black/20 rounded-3xl p-6 border-2 border-gray-100 dark:border-white/5 shadow-sm">
                                        <div className="flex items-center gap-2 mb-3">
                                            <ShieldOff className="w-4 h-4 text-red-500" />
                                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Stop Words</span>
                                        </div>
                                        {isEditingAll ? (
                                            <input
                                                value={negativeKeywords}
                                                onChange={e => setNegativeKeywords(e.target.value)}
                                                placeholder="e.g. stop, no thanks"
                                                className="w-full bg-gray-50 dark:bg-white/5 border-2 border-red-300 dark:border-red-500/40 rounded-2xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-red-500 transition-all"
                                            />
                                        ) : (
                                            <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-100 dark:border-red-900/20">
                                                <p className="text-sm font-bold text-red-600 dark:text-red-400 leading-relaxed italic">
                                                    {killSwitchEnabled
                                                        ? `Stops if lead says: "${negativeKeywords || 'No stop words set yet'}"`
                                                        : 'Stop words are disabled.'}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Global Auto-Replies Summary/Edit */}
                                    <div className="bg-white dark:bg-black/20 rounded-3xl p-6 border-2 border-gray-100 dark:border-white/5 shadow-sm">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Zap className="w-4 h-4 text-orange-500" />
                                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Global Auto-Replies</span>
                                        </div>
                                        {isEditingAll ? (
                                            <KeywordReplyManager 
                                                title="Edit Global Rules"
                                                description="These apply to all messages."
                                                items={globalAutoReplies}
                                                onChange={setGlobalAutoReplies}
                                            />
                                        ) : (
                                            <div className="flex flex-col gap-3">
                                                {globalAutoReplies.length === 0 ? (
                                                    <p className="text-[11px] font-bold text-gray-400 italic">No global rules defined.</p>
                                                ) : (
                                                    globalAutoReplies.map((r, i) => (
                                                        <div key={i} className="flex flex-col gap-1 border-b border-gray-100 dark:border-white/5 pb-2 last:border-0">
                                                            <div className="flex flex-wrap gap-1">
                                                                {r.keywords.map((kw: string, ki: number) => (
                                                                    <span key={ki} className="text-[9px] font-black text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded uppercase">{kw}</span>
                                                                ))}
                                                            </div>
                                                            <p className="text-[11px] text-gray-500 italic line-clamp-2">"{r.reply}"</p>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right Side: Message Timeline */}
                                <div className="lg:col-span-2 flex flex-col gap-6">

                                    {/* The Opening Message — Editable inline */}
                                    <div className="flex gap-6">
                                        <div className="flex flex-col items-center shrink-0">
                                            <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-black z-10 shadow-lg">
                                                <Rocket className="w-5 h-5" />
                                            </div>
                                            <div className="w-1 flex-1 bg-gray-100 dark:bg-white/5 my-2" />
                                        </div>
                                        <div className="flex-1 pb-10">
                                            <div className="bg-white dark:bg-black/20 rounded-3xl p-6 border-2 border-gray-100 dark:border-white/5 shadow-sm">
                                                <div className="flex items-center justify-between mb-4">
                                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Initial Greeting</span>
                                                    <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 text-[10px] font-black uppercase rounded-full tracking-tighter">Instant Delivery</span>
                                                </div>
                                                {isEditingAll ? (
                                                    <textarea
                                                        rows={5}
                                                        value={initialMessage}
                                                        onChange={e => setInitialMessage(e.target.value)}
                                                        className="w-full bg-gray-50 dark:bg-white/5 border-2 border-blue-300 dark:border-blue-500/40 rounded-2xl px-4 py-3 text-sm font-medium text-gray-900 dark:text-white outline-none resize-none focus:border-blue-500 transition-all"
                                                    />
                                                ) : (
                                                    <p className="text-sm font-bold text-gray-600 dark:text-gray-300 italic break-words leading-relaxed line-clamp-4">"{initialMessage}"</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Follow-up Steps */}
                                    {steps.map((s, idx) => (
                                        <React.Fragment key={idx}>
                                        <div className="flex gap-6">
                                            <div className="flex flex-col items-center shrink-0 w-12">
                                                <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-black z-10 shadow-lg ring-4 ring-white dark:ring-[#1e293b] shrink-0">
                                                    {idx + 1}
                                                </div>
                                                {idx < steps.length - 1 && (
                                                    <div className="w-1 flex-1 bg-gradient-to-b from-blue-600/50 to-transparent -mt-2 mb-2 rounded-full z-0" />
                                                )}
                                            </div>
                                            <div className="flex-1 pb-6">
                                                <div className="flex flex-col gap-4">

                                                    {/* Editable Wait Time */}
                                                    {isEditingAll ? (
                                                        <div className="flex items-center gap-2 bg-white dark:bg-black/30 border-2 border-blue-400 rounded-2xl px-4 py-3">
                                                            <Timer className="w-4 h-4 text-blue-500 shrink-0" />
                                                            <span className="text-xs font-black text-gray-400 uppercase tracking-wider mr-2">Wait:</span>
                                                            <input type="number" min="0" value={s.wait_days ?? 0}
                                                                onChange={e => { const n = [...steps]; n[idx].wait_days = parseInt(e.target.value) || 0; setSteps(n); }}
                                                                className="w-14 bg-transparent text-center font-black text-gray-900 dark:text-white outline-none text-sm border-b border-gray-300"
                                                            />
                                                            <span className="text-xs text-gray-400 font-bold">d</span>
                                                            <input type="number" min="0" max="23" value={s.wait_hours ?? 0}
                                                                onChange={e => { const n = [...steps]; n[idx].wait_hours = parseInt(e.target.value) || 0; setSteps(n); }}
                                                                className="w-14 bg-transparent text-center font-black text-gray-900 dark:text-white outline-none text-sm border-b border-gray-300"
                                                            />
                                                            <span className="text-xs text-gray-400 font-bold">h</span>
                                                            <input type="number" min="0" max="59" value={s.wait_minutes ?? 0}
                                                                onChange={e => { const n = [...steps]; n[idx].wait_minutes = parseInt(e.target.value) || 0; setSteps(n); }}
                                                                className="w-14 bg-transparent text-center font-black text-gray-900 dark:text-white outline-none text-sm border-b border-gray-300"
                                                            />
                                                            <span className="text-xs text-gray-400 font-bold">m</span>
                                                        </div>
                                                    ) : (
                                                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-white/5 rounded-full self-start border border-gray-200 dark:border-white/10">
                                                            <Timer className="w-3.5 h-3.5 text-gray-400" />
                                                            <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                                                Wait Period: {s.wait_days || 0}d {s.wait_hours || 0}h {s.wait_minutes || 0}m
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* Step Card */}
                                                    <div className="bg-white dark:bg-black/20 rounded-3xl border-2 border-gray-100 dark:border-white/5 shadow-sm overflow-hidden flex flex-col">

                                                        {/* Step header with specific Subtract button */}
                                                        <div className="flex items-center justify-between px-6 py-3 bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5">
                                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Sequence Step {idx + 1}</span>
                                                            <button
                                                                onClick={() => {
                                                                    const updated = steps.filter((_, i) => i !== idx).map((st, i) => ({ ...st, step_number: i + 1 }));
                                                                    setSteps(updated);
                                                                }}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all uppercase tracking-widest border border-transparent hover:border-red-100"
                                                            >
                                                                <Minus className="w-3 h-3" />
                                                                Subtract
                                                            </button>
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-px items-stretch flex-1 bg-gray-100 dark:bg-white/5">

                                                            {/* Path A: Fallback */}
                                                            <div className="p-6 bg-white dark:bg-black/20 flex flex-col gap-3">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center border border-blue-100 dark:border-blue-800/50">
                                                                        <AlertCircle className="w-3 h-3 text-blue-600" />
                                                                    </div>
                                                                    <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">If No Reply</span>
                                                                </div>
                                                                {isEditingAll ? (
                                                                    <textarea
                                                                        rows={3}
                                                                        value={s.response_text}
                                                                        onChange={e => { const n = [...steps]; n[idx].response_text = e.target.value; setSteps(n); }}
                                                                        className="w-full bg-blue-50/50 dark:bg-blue-500/5 border-2 border-blue-300 dark:border-blue-500/30 rounded-2xl px-4 py-3 text-sm font-medium text-gray-900 dark:text-white outline-none resize-none focus:border-blue-500 transition-all"
                                                                    />
                                                                ) : (
                                                                    <div className="flex flex-col gap-2 p-3 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5 text-left">
                                                                        <p className="text-sm font-bold text-gray-700 dark:text-gray-200 break-words leading-relaxed line-clamp-3">
                                                                            "{s.response_text || 'No message set'}"
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Path B: Keyword Match Rule List */}
                                                            <div className="p-6 bg-white dark:bg-black/20 flex flex-col gap-4">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-7 h-7 rounded-lg bg-purple-600/10 flex items-center justify-center border border-purple-600/20">
                                                                        <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                                                                    </div>
                                                                    <h5 className="text-[11px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest">Keyword Match Responses</h5>
                                                                </div>

                                                                {isEditingAll ? (
                                                                    <div className="mt-2">
                                                                        <KeywordReplyManager 
                                                                            showTitle={false}
                                                                            items={s.auto_replies || []}
                                                                            onChange={(newItems) => {
                                                                                const n = [...steps];
                                                                                n[idx].auto_replies = newItems;
                                                                                setSteps(n);
                                                                            }}
                                                                        />
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex flex-col gap-3">
                                                                        {(!s.auto_replies || s.auto_replies.length === 0) && (
                                                                            <div className="px-5 py-4 bg-gray-50/50 dark:bg-white/5 rounded-2xl border border-dashed border-gray-200 dark:border-white/5">
                                                                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest italic text-center">No keyword rules defined</p>
                                                                            </div>
                                                                        )}
                                                                        {(s.auto_replies || []).map((r: any, ri: number) => (
                                                                            <div key={ri} className="p-5 bg-purple-50/20 dark:bg-purple-900/10 rounded-3xl border border-purple-100 dark:border-purple-900/20 text-left flex flex-col gap-3 relative overflow-hidden group">
                                                                                <div className="absolute top-0 right-0 px-3 py-1 bg-purple-600/10 text-purple-600 text-[8px] font-black uppercase rounded-bl-xl tracking-tighter">
                                                                                    Rule {ri + 1}
                                                                                </div>
                                                                                <div className="flex flex-wrap gap-1.5 pr-10">
                                                                                    {(typeof r.keywords === 'string' ? r.keywords.split(',') : (Array.isArray(r.keywords) ? r.keywords : [])).map((rk: string, rki: number) => {
                                                                                        const trimmed = rk.trim();
                                                                                        if (!trimmed) return null;
                                                                                        return (
                                                                                            <span key={rki} className="text-[9px] font-black text-purple-600 bg-white dark:bg-purple-950 px-2 py-0.5 rounded-md border border-purple-100 dark:border-purple-800 uppercase shadow-sm">{trimmed}</span>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                                <p className="text-sm font-bold text-gray-700 dark:text-gray-200 break-words leading-relaxed pl-1 border-l-2 border-purple-300 dark:border-purple-700">
                                                                                    "{r.reply}"
                                                                                </p>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* View Detail Button */}
                                                        <button
                                                            onClick={() => setViewingStepDetail({ idx, step: s })}
                                                            className="w-full py-3.5 bg-blue-600 text-white font-black uppercase tracking-[0.2em] text-[10px] hover:bg-blue-700 transition-all flex items-center justify-center gap-3 border-t border-white/10"
                                                        >
                                                            <span>🔎 View Full Detail</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </React.Fragment>
                                ))}

                                    {/* Simple Add/Subtract Controls (Always Visible & Aligned) */}
                                    <div className="flex gap-6 mt-4">
                                        <div className="flex flex-col items-center shrink-0 w-12">
                                            <div className="w-1 flex-1 bg-gray-100 dark:bg-white/5 mb-2 h-8" />
                                            <div className="w-10 h-10 rounded-full border-2 border-dashed border-gray-200 dark:border-white/10 flex items-center justify-center text-gray-300">
                                                <Plus className="w-5 h-5" />
                                            </div>
                                        </div>
                                        <div className="flex-1 self-center">
                                            <button
                                                onClick={() => {
                                                    setTempNewStep({
                                                        wait_days: 1, wait_hours: 0, wait_minutes: 0,
                                                        keywords: '', response_text: '', keyword_response_text: '',
                                                        auto_replies: []
                                                    });
                                                    setShowAddStepPopup(true);
                                                }}
                                                className="w-full flex items-center justify-center gap-3 py-4 bg-blue-600 text-white rounded-3xl font-black uppercase tracking-[0.15em] text-[11px] hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/25"
                                            >
                                                <Plus className="w-4 h-4" />
                                                Add Step
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Final Launch Button Fixed at Bottom */}
                            <div className="sticky bottom-0 left-0 right-0 bg-white dark:bg-[#1a222c] border-t-2 border-gray-100 dark:border-white/5 pt-4 pb-6 flex items-center gap-4 z-20">
                                <button
                                    onClick={() => setStep(1)}
                                    className="flex-1 py-4 bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 rounded-xl font-black uppercase tracking-widest text-sm transition-all hover:bg-gray-200 dark:hover:bg-white/10"
                                >
                                    ← Edit Campaign
                                </button>
                                <button
                                    disabled={isSubmitting}
                                    onClick={handleSubmit}
                                    className="flex-[2] py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl flex items-center justify-center gap-3"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="w-6 h-6 animate-spin shrink-0" />
                                            <span>{editCampaignId ? "Saving..." : "Building..."}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Rocket className="w-6 h-6 shrink-0" />
                                            <span>{editCampaignId ? "Save Changes" : "Launch Campaign! 🚀"}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Error Popup Modal */}
            <ConfirmModal
                isOpen={showErrorPopup}
                onClose={handleCloseErrorPopup}
                onConfirm={handleCloseErrorPopup}
                title="Wait a second!"
                description={popupMessage}
                confirmText="I'll fix it"
                cancelText="Close"
                type="info"
            />

            {/* Step Detail Focus Popup */}
            {viewingStepDetail && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in" onClick={() => setViewingStepDetail(null)} />
                    <div className="bg-white dark:bg-[#1e293b] w-full max-w-5xl rounded-[40px] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-200 border border-white/10">
                        <div className="p-8 pb-4 flex items-center justify-between border-b border-gray-100 dark:border-white/5">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-purple-600 text-white flex items-center justify-center font-black text-xl shadow-lg ring-4 ring-purple-500/20">
                                    {viewingStepDetail.idx + 1}
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 dark:text-white">Step Strategy Details</h3>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Full Logic Configuration</p>
                                </div>
                            </div>
                            <button onClick={() => setViewingStepDetail(null)} className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-500 hover:rotate-90 transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar flex flex-col gap-6">
                            {/* Detailed Path A */}
                            <div className="p-6 bg-blue-50/50 dark:bg-blue-500/5 rounded-[32px] border-2 border-blue-100 dark:border-blue-900/20">
                                <div className="flex flex-col gap-1 mb-6">
                                    <div className="flex items-center gap-3">
                                        <AlertCircle className="w-5 h-5 text-blue-600" />
                                        <span className="text-xs font-black text-blue-600 uppercase tracking-widest">Scenario A: Silent Lead</span>
                                    </div>
                                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 leading-relaxed pl-8">
                                        This is your safety net. The system sends this message if the lead completely ignores you.
                                    </p>
                                </div>
                                <div className="space-y-4">
                                    <div className="p-5 bg-white dark:bg-black/40 rounded-2xl border border-blue-200 dark:border-white/5">
                                        <p className="text-gray-700 dark:text-gray-300 font-bold leading-relaxed">"{viewingStepDetail.step.response_text}"</p>
                                    </div>
                                </div>
                            </div>

                            {/* Scenario B: Keyword Specific Responses */}
                            <div className="p-8 bg-purple-50/50 dark:bg-purple-500/5 rounded-[40px] border-2 border-purple-100 dark:border-purple-900/10">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-600/30 ring-4 ring-purple-500/10">
                                        <CheckCircle2 className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">Scenario B: Keyword Target Match</h4>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-1">
                                            INSTANT REPLIES FOR SPECIFIC KEYWORDS
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="flex flex-col gap-4">
                                    {(!viewingStepDetail.step.auto_replies || viewingStepDetail.step.auto_replies.length === 0) ? (
                                        <div className="p-8 bg-white dark:bg-black/40 rounded-[32px] border-2 border-dashed border-gray-200 dark:border-white/10 flex flex-col items-center justify-center gap-2 opacity-60">
                                            <p className="text-sm font-black text-gray-400 uppercase tracking-widest">No keyword rules</p>
                                        </div>
                                    ) : (
                                        viewingStepDetail.step.auto_replies.map((r: any, ri: number) => (
                                            <div key={ri} className="bg-white dark:bg-black/40 p-8 rounded-[40px] border-2 border-purple-200/50 dark:border-white/5 flex flex-col gap-5 relative shadow-sm">
                                                <div className="flex flex-col gap-3">
                                                    <div className="flex items-center gap-2 px-3 py-1 bg-purple-600/10 text-purple-600 rounded-lg w-fit">
                                                        <span className="text-[10px] font-black uppercase tracking-tighter">Rule {ri + 1}</span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {(typeof r.keywords === 'string' ? r.keywords.split(',') : (Array.isArray(r.keywords) ? r.keywords : [])).map((rk: string, rki: number) => {
                                                            const trimmed = rk.trim();
                                                            if (!trimmed) return null;
                                                            return (
                                                                <span key={rki} className="px-3 py-1 bg-purple-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md">
                                                                    {trimmed}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                <div className="p-6 bg-gray-50 dark:bg-white/5 rounded-3xl border border-gray-100 dark:border-white/5">
                                                    <p className="text-gray-700 dark:text-gray-300 font-bold leading-relaxed">
                                                        "{r.reply}"
                                                    </p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-gray-50/50 dark:bg-white/5 flex items-center justify-center">
                            <button 
                                onClick={() => setViewingStepDetail(null)}
                                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-blue-700 hover:scale-[1.02] transition-all shadow-xl"
                            >
                                Back to Strategy Map
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* NEW: Add Step Configuration Popup */}
            {showAddStepPopup && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in" onClick={() => setShowAddStepPopup(false)} />
                    <div className="bg-white dark:bg-[#1e293b] w-full max-w-4xl rounded-[40px] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-200 border border-white/10">
                        <div className="p-8 pb-4 flex items-center justify-between border-b border-gray-100 dark:border-white/5">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-xl shadow-lg ring-4 ring-blue-500/20">
                                    +
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 dark:text-white">Configure New Follow-up</h3>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Setup Step {steps.length + 1}</p>
                                </div>
                            </div>
                            <button onClick={() => setShowAddStepPopup(false)} className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-500 hover:rotate-90 transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar flex flex-col gap-6">
                            {/* Wait Time Configuration */}
                            <div className="flex flex-col gap-3">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Wait Period before Sending</label>
                                <div className="flex items-stretch gap-0 bg-gray-50 dark:bg-white/5 rounded-2xl border-2 border-gray-100 dark:border-white/5 overflow-hidden w-full max-w-md">
                                    <div className="flex-1 flex flex-col items-center justify-center p-3 border-r-2 border-gray-100 dark:border-white/5">
                                        <input type="number" value={tempNewStep.wait_days} onChange={e => setTempNewStep({...tempNewStep, wait_days: parseInt(e.target.value) || 0})} className="w-full text-center bg-transparent text-xl font-black outline-none" min="0" />
                                        <span className="text-[10px] font-black uppercase text-gray-400">Days</span>
                                    </div>
                                    <div className="flex-1 flex flex-col items-center justify-center p-3 border-r-2 border-gray-100 dark:border-white/5">
                                        <input type="number" value={tempNewStep.wait_hours} onChange={e => setTempNewStep({...tempNewStep, wait_hours: parseInt(e.target.value) || 0})} className="w-full text-center bg-transparent text-xl font-black outline-none" min="0" max="23" />
                                        <span className="text-[10px] font-black uppercase text-gray-400">Hours</span>
                                    </div>
                                    <div className="flex-1 flex flex-col items-center justify-center p-3">
                                        <input type="number" value={tempNewStep.wait_minutes} onChange={e => setTempNewStep({...tempNewStep, wait_minutes: parseInt(e.target.value) || 0})} className="w-full text-center bg-transparent text-xl font-black outline-none" min="0" max="59" />
                                        <span className="text-[10px] font-black uppercase text-gray-400">Min</span>
                                    </div>
                                </div>
                            </div>

                            {/* Step Logic Flow - Unified If/Else System */}
                            <div className="flex flex-col gap-6">
                                <div className="flex items-center gap-3 px-2">
                                    <div className="w-1 h-8 bg-blue-600 rounded-full" />
                                    <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Step Logic Flow</h4>
                                </div>

                                <div className="flex flex-col gap-4 relative">
                                    {/* Connection Line */}
                                    <div className="absolute left-8 top-16 bottom-16 w-1 bg-gray-100 dark:bg-white/5 z-0" />

                                    {/* 1. The Fallback Rule (Mandatory) */}
                                    <div className="bg-white dark:bg-white/5 p-8 rounded-[40px] border-2 border-blue-500/20 shadow-xl relative z-10">
                                        <div className="flex items-center gap-4 mb-6">
                                            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30">
                                                <Clock className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded">Primary Rule</span>
                                                </div>
                                                <h5 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">IF Lead hasn't replied...</h5>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-5">
                                            <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-black/20 rounded-[28px] border border-gray-100 dark:border-white/5 w-fit">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">WAIT FOR</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="px-3 py-1 bg-white dark:bg-white/10 rounded-xl text-xs font-black text-blue-600">{tempNewStep.wait_days}d</span>
                                                    <span className="px-3 py-1 bg-white dark:bg-white/10 rounded-xl text-xs font-black text-blue-600">{tempNewStep.wait_hours}h</span>
                                                </div>
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">THEN SEND</span>
                                            </div>

                                            <textarea
                                                rows={4}
                                                placeholder="Enter the primary follow-up message..."
                                                value={tempNewStep.response_text}
                                                onChange={e => setTempNewStep({...tempNewStep, response_text: e.target.value})}
                                                className="w-full bg-gray-50 dark:bg-black/40 border-2 border-gray-100 dark:border-white/10 rounded-[32px] px-8 py-6 text-base font-medium outline-none resize-none focus:border-blue-500 transition-all text-gray-900 dark:text-white shadow-inner"
                                            />
                                        </div>
                                    </div>

                                    {/* 2. The Multi-Reply Keyword Rules */}
                                    <div className="bg-white dark:bg-white/5 p-8 rounded-[40px] border-2 border-purple-500/20 shadow-xl relative z-10">
                                        <div className="flex items-center gap-4 mb-8">
                                            <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-600/30">
                                                <MessageSquare className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded">Keyword Rules</span>
                                                </div>
                                                <h5 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">IF Lead replies with specific words...</h5>
                                            </div>
                                        </div>

                                        <KeywordReplyManager 
                                            showTitle={false}
                                            items={tempNewStep.auto_replies || []}
                                            onChange={(newItems) => setTempNewStep({...tempNewStep, auto_replies: newItems})}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-gray-50/50 dark:bg-white/5 flex items-center gap-4">
                            <button 
                                onClick={() => setShowAddStepPopup(false)}
                                className="flex-1 py-4 bg-gray-100 dark:bg-white/5 text-gray-500 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-gray-200"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => {
                                    setSteps(prev => [...prev, {
                                        ...tempNewStep,
                                        step_number: prev.length + 1
                                    }]);
                                    setShowAddStepPopup(false);
                                }}
                                className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-blue-700 hover:scale-[1.02] transition-all shadow-xl"
                            >
                                Add to Strategy
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CreateCampaignModal;