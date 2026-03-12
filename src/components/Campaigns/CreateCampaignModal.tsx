import React, { useState, useRef } from 'react';
import { X, Rocket, FileText, CheckCircle2, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { campaignsAPI } from '../../services/api';

interface CreateCampaignModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

// --- Custom Dropdown Component (Defined outside to prevent state reset on parent rerender) ---
const JumpSelect = ({ value, onChange }: { value: number | undefined, onChange: (val: number | undefined) => void }) => {
    const [showMenu, setShowMenu] = useState(false);
    
    const jumpOptions = [
        { label: "Loop to Start (Initial Message)", value: 0 },
        { label: "Jump to Step 1", value: 1 },
        { label: "Jump to Step 2", value: 2 },
        { label: "Jump to Step 3", value: 3 },
        { label: "Jump to Step 4", value: 4 },
        { label: "Jump to Step 5", value: 5 },
        { label: "Jump to Step 6", value: 6 },
        { label: "Loop back to Step 1", value: 1 }
    ];

    const currentLabel = value === 0 
        ? "Loop to Start (Initial Message)"
        : value === 1 
            ? "Loop back to Step 1"
            : value 
                ? jumpOptions.find(o => o.value === value)?.label || `Jump to Step ${value}`
                : "Next Sequential Step";

    return (
        <div className="relative">
            <div
                onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(!showMenu);
                }}
                className="w-full flex items-center justify-between bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold focus:border-blue-500 outline-none appearance-none cursor-pointer transition-all hover:bg-gray-50 dark:hover:bg-white/5"
            >
                <span className={value ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"}>
                    {currentLabel}
                </span>
                <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${showMenu ? 'rotate-180' : ''}`} />
            </div>

            {showMenu && (
                <>
                    <div className="fixed inset-0 z-[10001] bg-transparent" onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                    }} />
                    <div 
                        className="absolute top-full left-0 right-0 mt-2 z-[10002] bg-white dark:bg-[#1e293b] border border-gray-100 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="max-h-60 overflow-y-auto py-1">
                            <div
                                onClick={() => { onChange(undefined); setShowMenu(false); }}
                                className={`w-full text-left px-4 py-3 text-xs font-bold cursor-pointer transition-colors ${!value ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                            >
                                Next Sequential Step
                            </div>
                            {jumpOptions.map((opt, i) => (
                                <div
                                    key={i}
                                    onClick={() => { onChange(opt.value); setShowMenu(false); }}
                                    className={`w-full text-left px-4 py-3 text-xs font-bold cursor-pointer transition-colors ${value === opt.value ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
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

    // Helper to convert days/hours/minutes to total hours (float)
    const toTotalHours = (days: number, hours: number, minutes: number) =>
        days * 24 + hours + minutes / 60;
    const fileInputRef = useRef<HTMLInputElement>(null);

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

            // 5. Reset ALL state FIRST while component is still mounted
            setName('');
            setInitialMessage('');
            setNegativeKeywords('');
            setKillSwitchEnabled(true);
            setCsvFile(null);
            setSteps([]);
            setStep(1);
            setIsSubmitting(false);
            setError(null);

            // 6. NOW close the modal and refresh - component state is already clean
            onSuccess();
            onClose();

        } catch (err: any) {
            setIsSubmitting(false);
            const detail = err.response?.data?.detail;
            if (typeof detail === 'string') {
                setError(detail);
            } else if (Array.isArray(detail)) {
                // FastAPI 422 returns detail as array of {msg, loc, type} objects
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
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
            <div className="bg-white dark:bg-[#1a222c] w-full max-w-xl rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.5)] overflow-hidden border border-gray-100 dark:border-white/5">

                {/* Modal Header */}
                <div className="relative h-32 bg-gradient-to-br from-blue-600 to-indigo-700 p-8">
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                    <div className="flex items-center space-x-4">
                        <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white border border-white/20 shadow-xl">
                            <Rocket className="w-8 h-8" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white tracking-tight">New Campaign</h2>
                            <p className="text-blue-100 font-bold uppercase text-[10px] tracking-widest leading-none">Initialize outreach engine</p>
                        </div>
                    </div>
                </div>

                <div className="p-8">
                    {/* Progress Indicator */}
                    <div className="flex items-center space-x-2 mb-8">
                        {[1, 2, 3, 4].map((s) => (
                            <div key={s} className="flex-1 flex items-center space-x-2">
                                <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${step >= s ? 'bg-blue-600' : 'bg-gray-100 dark:bg-gray-800'}`} />
                            </div>
                        ))}
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start space-x-3 text-red-500 animate-shake">
                            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                            <p className="text-sm font-bold">{error}</p>
                        </div>
                    )}

                    {/* STEP 1: Name & Initial Message */}
                    {step === 1 && (
                        <div className="space-y-6 animate-slide-right">
                            <div>
                                <label className="block text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Campaign Identity</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g., Spring 2024 Outreach"
                                    className="w-full bg-gray-50 dark:bg-black/20 border-2 border-gray-100 dark:border-white/5 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white focus:border-blue-500 transition-all outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Initial outreach message (Step 2)</label>
                                <textarea
                                    rows={4}
                                    value={initialMessage}
                                    onChange={(e) => setInitialMessage(e.target.value)}
                                    placeholder="Hello, I saw your profile and wanted to connect..."
                                    className="w-full bg-gray-50 dark:bg-black/20 border-2 border-gray-100 dark:border-white/5 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 dark:text-white focus:border-blue-500 transition-all outline-none resize-none"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Kill Switch: Abort Keywords (comma separated)</label>
                                <input
                                    type="text"
                                    value={negativeKeywords}
                                    onChange={(e) => setNegativeKeywords(e.target.value)}
                                    placeholder="not interested, stop, scam, bad, f*** off"
                                    disabled={!killSwitchEnabled}
                                    className={`w-full bg-gray-50 dark:bg-black/20 border-2 border-gray-100 dark:border-white/5 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white focus:border-blue-500 transition-all outline-none ${!killSwitchEnabled ? 'opacity-50 grayscale' : ''}`}
                                />
                                <div className="flex items-center justify-between mt-2">
                                    <p className="text-[10px] text-gray-400 italic">Sequence will automatically stop if the lead says any of these.</p>
                                    <label className="flex items-center cursor-pointer group">
                                        <span className="text-[10px] font-black uppercase text-gray-400 mr-2 group-hover:text-blue-500 transition-colors">Enabled</span>
                                        <div className="relative">
                                            <input 
                                                type="checkbox" 
                                                className="sr-only" 
                                                checked={killSwitchEnabled}
                                                onChange={(e) => setKillSwitchEnabled(e.target.checked)}
                                            />
                                            <div className={`block w-8 h-4 rounded-full transition-colors ${killSwitchEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}></div>
                                            <div className={`absolute left-1 top-1 bg-white w-2 h-2 rounded-full transition-transform ${killSwitchEnabled ? 'translate-x-4' : ''}`}></div>
                                        </div>
                                    </label>
                                </div>
                            </div>
                            <button
                                onClick={() => (name && initialMessage) ? setStep(2) : setError("Identity and message are required.")}
                                className="w-full py-4 bg-gray-900 dark:bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-blue-600/20"
                            >
                                Continue to Lead Upload
                            </button>
                        </div>
                    )}

                    {/* STEP 2: CSV Lead Upload */}
                    {step === 2 && (
                        <div className="space-y-6 animate-slide-right">
                            <div>
                                <label className="block text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Lead Database (Step 1)</label>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`border-4 border-dashed rounded-3xl p-10 text-center transition-all cursor-pointer ${csvFile ? 'border-green-500/40 bg-green-500/5' : 'border-gray-100 dark:border-white/10 hover:border-blue-500/40 hover:bg-blue-500/5'}`}
                                >
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        accept=".csv"
                                        className="hidden"
                                    />
                                    {csvFile ? (
                                        <div className="animate-pop-in">
                                            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                                            <p className="text-gray-900 dark:text-white font-black">{csvFile.name}</p>
                                            <p className="text-gray-500 text-xs mt-1">Ready to import leads</p>
                                        </div>
                                    ) : (
                                        <>
                                            <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                                            <p className="text-gray-900 dark:text-white font-black text-sm">Upload Leads CSV</p>
                                            <p className="text-gray-500 text-xs mt-1">One Telegram username per line</p>
                                            <button className="mt-4 px-4 py-2 bg-gray-100 dark:bg-white/5 rounded-lg text-[10px] font-black uppercase text-gray-400 tracking-widest hover:bg-gray-200 dark:hover:bg-white/10 transition-all">Browse Files</button>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="flex space-x-3">
                                <button
                                    onClick={() => setStep(1)}
                                    className="flex-1 py-4 bg-gray-100 dark:bg-white/5 text-gray-500 rounded-2xl font-black uppercase tracking-widest text-sm transition-all"
                                >
                                    Back
                                </button>
                                <button
                                    disabled={!csvFile}
                                    onClick={() => setStep(3)}
                                    className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-blue-600/20"
                                >
                                    Define AI Intelligence
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: AI Intelligence & Keywords */}
                    {step === 3 && (
                        <div className="space-y-6 animate-slide-right max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                            <div className="flex justify-between items-center mb-4">
                                <label className="block text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">AI & Keyword Responses</label>
                                <button
                                    onClick={() => setSteps([...steps, { step_number: steps.length + 1, wait_days: 0, wait_hours: 0, wait_minutes: 0, keywords: '', response_text: '', keyword_response_text: '' }])}
                                    className="text-[10px] font-black uppercase text-blue-500 hover:text-blue-600"
                                >
                                    + Add Follow-up Step
                                </button>
                            </div>

                            {steps.length === 0 ? (
                                <div className="p-8 text-center bg-gray-50 dark:bg-white/5 rounded-3xl border-2 border-dashed border-gray-100 dark:border-white/5">
                                    <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                    <p className="text-xs font-bold text-gray-500">No Intelligence steps added.<br />Only the initial message will be sent.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {steps.map((s, idx) => (
                                        <div key={idx} className="p-5 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5 relative group">
                                            <button
                                                onClick={() => setSteps(steps.filter((_, i) => i !== idx))}
                                                className="absolute top-4 right-4 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>

                                            <div className="mb-3">
                                                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Step {s.step_number} — Wait Time Before Follow-up</label>
                                                <div className="grid grid-cols-3 gap-2">
                                                    <div>
                                                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Days</label>
                                                        <input
                                                            type="number" min="0"
                                                            value={s.wait_days ?? 1}
                                                            onChange={(e) => {
                                                                const newSteps = [...steps];
                                                                newSteps[idx].wait_days = parseInt(e.target.value) || 0;
                                                                setSteps(newSteps);
                                                            }}
                                                            className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-xs font-bold focus:border-blue-500 outline-none text-center"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Hours</label>
                                                        <input
                                                            type="number" min="0" max="23"
                                                            value={s.wait_hours ?? 0}
                                                            onChange={(e) => {
                                                                const newSteps = [...steps];
                                                                newSteps[idx].wait_hours = parseInt(e.target.value) || 0;
                                                                setSteps(newSteps);
                                                            }}
                                                            className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-xs font-bold focus:border-blue-500 outline-none text-center"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Minutes</label>
                                                        <input
                                                            type="number" min="0" max="59"
                                                            value={s.wait_minutes ?? 0}
                                                            onChange={(e) => {
                                                                const newSteps = [...steps];
                                                                newSteps[idx].wait_minutes = parseInt(e.target.value) || 0;
                                                                setSteps(newSteps);
                                                            }}
                                                            className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-xs font-bold focus:border-blue-500 outline-none text-center"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mb-4">
                                                <div className="flex justify-between items-center mb-1">
                                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Trigger Keywords (comma separated)</label>
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder="price, cost, info, details"
                                                    value={Array.isArray(s.keywords) ? s.keywords.join(', ') : s.keywords}
                                                    onChange={(e) => {
                                                        const newSteps = [...steps];
                                                        newSteps[idx].keywords = e.target.value;
                                                        setSteps(newSteps);
                                                    }}
                                                    className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-xs font-medium focus:border-blue-500 outline-none"
                                                />
                                            </div>                                            <div className="flex-1 space-y-1">
                                                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Intelligent Jump Target</label>
                                                <JumpSelect 
                                                    value={s.next_step}
                                                    onChange={(val) => {
                                                        const newSteps = [...steps];
                                                        newSteps[idx].next_step = val;
                                                        setSteps(newSteps);
                                                    }}
                                                />
                                                <p className="text-[8px] text-gray-400 mt-1 italic">If a lead hits any keywords, they move here instead of the next step.</p>
                                            </div>



                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-1 flex items-center">
                                                        <FileText className="w-2.5 h-2.5 mr-1" />
                                                        Follow-up Message (Sent by Timer)
                                                    </label>
                                                    <textarea
                                                        rows={2}
                                                        value={s.response_text}
                                                        onChange={(e) => {
                                                            const newSteps = [...steps];
                                                            newSteps[idx].response_text = e.target.value;
                                                            setSteps(newSteps);
                                                        }}
                                                        placeholder="Step Message (Sent if lead is silent)..."
                                                        className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs font-medium focus:border-blue-500 outline-none resize-none"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-[9px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest mb-1 flex items-center">
                                                        <Rocket className="w-2.5 h-2.5 mr-1" />
                                                        Keyword Match Response (AI Instant Reply)
                                                    </label>
                                                    <textarea
                                                        rows={2}
                                                        value={s.keyword_response_text}
                                                        onChange={(e) => {
                                                            const newSteps = [...steps];
                                                            newSteps[idx].keyword_response_text = e.target.value;
                                                            setSteps(newSteps);
                                                        }}
                                                        placeholder="AI Reply (Sent only if lead says a keyword)..."
                                                        className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs font-medium focus:border-purple-500 outline-none resize-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex space-x-3 mt-8">
                                <button
                                    onClick={() => setStep(2)}
                                    className="flex-1 py-4 bg-gray-100 dark:bg-white/5 text-gray-500 rounded-2xl font-black uppercase tracking-widest text-sm transition-all"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={() => setStep(4)}
                                    className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-blue-600/20"
                                >
                                    Review Engine Setup
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: Final Review & Deploy */}
                    {step === 4 && (
                        <div className="space-y-6 animate-slide-right">
                            <div className="bg-gray-50 dark:bg-white/5 rounded-3xl p-6 space-y-4">
                                <div className="flex justify-between items-center border-b border-gray-200 dark:border-white/5 pb-4">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Campaign Name</span>
                                    <span className="text-sm font-bold text-gray-900 dark:text-white">{name}</span>
                                </div>
                                <div className="flex justify-between items-center border-b border-gray-200 dark:border-white/5 pb-4">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Leads for Upload</span>
                                    <span className="text-sm font-bold text-blue-500">{csvFile?.name}</span>
                                </div>
                                <div>
                                    <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Opener Logic</span>
                                    <div className="bg-white dark:bg-black/40 rounded-xl p-4 text-xs italic text-gray-600 dark:text-gray-400 border border-gray-100 dark:border-white/5">
                                        "{initialMessage}"
                                    </div>
                                </div>
                            </div>

                            <div className="flex space-x-3">
                                <button
                                    onClick={() => setStep(3)}
                                    className="flex-1 py-4 bg-gray-100 dark:bg-white/5 text-gray-500 rounded-2xl font-black uppercase tracking-widest text-sm transition-all"
                                >
                                    Edit
                                </button>
                                <button
                                    disabled={isSubmitting}
                                    onClick={handleSubmit}
                                    className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-blue-600/20 flex items-center justify-center space-x-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            <span>Deploying Engine...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Rocket className="w-5 h-5" />
                                            <span>Launch Campaign</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CreateCampaignModal;
