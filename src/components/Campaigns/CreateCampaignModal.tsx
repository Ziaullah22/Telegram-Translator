import React, { useState, useRef, useEffect } from 'react';
import { X, Rocket, FileText, CheckCircle2, AlertCircle, Loader2, ChevronDown, Timer, Zap } from 'lucide-react';
import { campaignsAPI } from '../../services/api';
import ConfirmModal from '../Common/ConfirmModal';

interface CreateCampaignModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
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

const CreateCampaignModal: React.FC<CreateCampaignModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [step, setStep] = useState(1);
    const [name, setName] = useState('');
    const [initialMessage, setInitialMessage] = useState('');
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [negativeKeywords, setNegativeKeywords] = useState('');
    const [killSwitchEnabled, setKillSwitchEnabled] = useState(true);
    const [steps, setSteps] = useState<any[]>([]); // AI Intelligence Steps
    
    // Popup Error State
    const [showErrorPopup, setShowErrorPopup] = useState(false);
    const [popupMessage, setPopupMessage] = useState('');
    const [failedStepIdx, setFailedStepIdx] = useState<number | null>(null);

    // Helper to convert days/hours/minutes to total hours (float)
    const toTotalHours = (days: number, hours: number, minutes: number) =>
        (days * 24) + hours + (minutes / 60);

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

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!name || !initialMessage || !csvFile) {
            setError("Please fill in all fields and upload a CSV lead file.");
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);

            // 1. Create the campaign
            const campaign = await campaignsAPI.createCampaign({
                name,
                initial_message: initialMessage,
                negative_keywords: negativeKeywords.split(',').map(k => k.trim()).filter(k => k),
                kill_switch_enabled: killSwitchEnabled
            });

            // 2. Upload the leads
            await campaignsAPI.uploadLeads(campaign.id, csvFile);

            // 3. Create AI Steps (Keywords & Responses)
            for (const s of steps) {
                await campaignsAPI.createStep(campaign.id, {
                    step_number: s.step_number,
                    wait_time_hours: toTotalHours(s.wait_days || 0, s.wait_hours || 0, s.wait_minutes || 0),
                    keywords: typeof s.keywords === 'string' ? s.keywords.split(',').map((k: string) => k.trim()).filter((k: string) => k) : s.keywords,
                    response_text: s.response_text,
                    keyword_response_text: s.keyword_response_text,
                    next_step: s.next_step
                });
            }

            // 4. Launch the campaign
            try {
                await campaignsAPI.resumeCampaign(campaign.id);
            } catch (resumeErr: any) {
                console.error("Failed to resume campaign after creation:", resumeErr);
            }

            // 5. Reset state
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
                                    onClick={() => (name && initialMessage) ? setStep(2) : setError("Please give your campaign a name and write a first message!")}
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-600/20"
                                >
                                    Next: Who should the campaign talk to? →
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
                                <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Teach your campaign to reply</h2>
                                <p className="text-base font-bold text-gray-400 uppercase tracking-widest">What should it do after the first message?</p>
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
                                                            <div className="flex flex-col gap-4 bg-purple-50/30 dark:bg-purple-500/5 p-5 rounded-[28px] border-2 border-transparent hover:border-purple-500/10 transition-all">
                                                                <div className="flex flex-col gap-2">
                                                                    <label className="text-xs font-black text-purple-400 uppercase tracking-widest">Watch for these words in their reply</label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="e.g. price, info, yes, how much..."
                                                                        value={Array.isArray(s.keywords) ? s.keywords.join(', ') : s.keywords}
                                                                        onChange={(e) => { const n = [...steps]; n[idx].keywords = e.target.value; setSteps(n); }}
                                                                        className="w-full bg-white dark:bg-black/20 border-2 border-purple-200 dark:border-purple-500/20 rounded-xl px-4 py-3 text-base font-bold outline-none focus:border-purple-500 text-gray-900 dark:text-white"
                                                                    />
                                                                </div>
                                                                <div className="flex flex-col gap-2">
                                                                    <label className="text-xs font-black text-purple-400 uppercase tracking-widest">Then instantly reply with this</label>
                                                                    <textarea
                                                                        rows={3}
                                                                        value={s.keyword_response_text}
                                                                        onChange={(e) => { const n = [...steps]; n[idx].keyword_response_text = e.target.value; setSteps(n); }}
                                                                        placeholder="e.g. Great question! Here's the info you asked for..."
                                                                        className="w-full bg-white dark:bg-black/20 border-2 border-purple-200 dark:border-purple-500/20 rounded-xl px-4 py-3 text-base font-medium outline-none resize-none focus:border-purple-500 text-gray-900 dark:text-white"
                                                                    />
                                                                </div>
                                                                <div className="flex flex-col gap-2">
                                                                    <label className="text-xs font-black text-purple-400 uppercase tracking-widest">After that, what should the campaign do next?</label>
                                                                    <JumpSelect
                                                                        value={s.next_step}
                                                                        onChange={(val) => { const n = [...steps]; n[idx].next_step = val; setSteps(n); }}
                                                                        totalSteps={steps.length}
                                                                        currentStep={idx + 1}
                                                                    />
                                                                </div>
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
                                    onClick={() => setStep(2)}
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
                            
                            <div className="flex flex-col gap-2">
                                <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Final Check-up</h2>
                                <p className="text-sm font-bold text-gray-400 tracking-widest uppercase">Everything looks good! Review your campaign's brain below.</p>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
                                
                                {/* Left Side: Essential Stats */}
                                <div className="lg:col-span-1 flex flex-col gap-6">
                                    <div className="bg-blue-600 rounded-2xl p-6 text-white shadow-2xl shadow-blue-600/30 flex flex-col gap-6">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] font-black text-blue-200 uppercase tracking-widest">Campaign Identity</span>
                                            <p className="text-2xl font-black truncate">{name}</p>
                                        </div>
                                        <div className="h-px bg-white/20" />
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center"><FileText className="w-6 h-6 text-white" /></div>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs font-black text-blue-200 uppercase tracking-widest leading-none">Target Audience</span>
                                                <span className="text-lg font-bold truncate">{csvFile?.name}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center"><Zap className="w-6 h-6 text-white" /></div>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs font-black text-blue-200 uppercase tracking-widest leading-none">Total Message Sequence</span>
                                                <span className="text-lg font-bold">{steps.length} steps configured</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Safety Words Card */}
                                    <div className="bg-red-50 dark:bg-red-900/10 rounded-[32px] p-6 border-2 border-red-100 dark:border-red-900/20">
                                        <span className="text-xs font-black text-red-500 uppercase tracking-widest block mb-3">Safety Mode</span>
                                        <p className="text-sm font-bold text-red-600/80 dark:text-red-400 leading-relaxed italic">
                                            {killSwitchEnabled 
                                                ? `The campaign will stop talking if it hears: "${negativeKeywords || 'No stop words set'}"`
                                                : "Safety mode is disabled. The campaign will keep talking no matter what."
                                            }
                                        </p>
                                    </div>
                                </div>

                                {/* Right Side: Message Timeline */}
                                <div className="lg:col-span-2 flex flex-col gap-6">
                                    
                                    {/* The Hook (Instant Message) */}
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
                                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">The Intro Message</span>
                                                    <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 text-[10px] font-black uppercase rounded-full tracking-tighter">Send Instantly</span>
                                                </div>
                                                <p className="text-gray-600 dark:text-gray-300 italic font-medium">"{initialMessage}"</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Intelligence Steps */}
                                    {steps.map((s, idx) => (
                                        <div className="flex gap-6" key={idx}>
                                            <div className="flex flex-col items-center shrink-0">
                                                <div className="w-12 h-12 rounded-full bg-purple-600 text-white flex items-center justify-center font-black z-10 shadow-lg">{idx + 1}</div>
                                                {idx < steps.length - 1 && <div className="w-1 flex-1 bg-gray-100 dark:bg-white/5 my-2" />}
                                            </div>
                                            <div className="flex-1 pb-10">
                                                <div className="bg-white dark:bg-black/20 rounded-3xl p-6 border-2 border-gray-100 dark:border-white/5 shadow-sm">
                                                    <div className="flex items-center gap-3 mb-6">
                                                        <Timer className="w-4 h-4 text-purple-600" />
                                                        <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Waits {s.wait_days || 0}d {s.wait_hours || 0}h {s.wait_minutes || 0}m then:</span>
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl flex flex-col gap-1">
                                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">If Silent...</span>
                                                            <p className="text-xs font-bold truncate text-gray-600 dark:text-gray-400">"{s.response_text}"</p>
                                                        </div>
                                                        <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-2xl flex flex-col gap-1">
                                                            <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">If Keyword "{Array.isArray(s.keywords) ? s.keywords[0] : s.keywords.split(',')[0]}"...</span>
                                                            <p className="text-xs font-bold truncate text-purple-600 dark:text-purple-400">"{s.keyword_response_text}"</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Final Launch Button Fixed at Bottom */}
                            <div className="sticky bottom-0 left-0 right-0 bg-white dark:bg-[#1a222c] border-t-2 border-gray-100 dark:border-white/5 pt-4 pb-6 flex items-center gap-4 z-20">
                                <button
                                    onClick={() => setStep(3)}
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
                                            <span>Building...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Rocket className="w-6 h-6 shrink-0" />
                                            <span>Launch Campaign! 🚀</span>
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
        </div>
    );
};

export default CreateCampaignModal;