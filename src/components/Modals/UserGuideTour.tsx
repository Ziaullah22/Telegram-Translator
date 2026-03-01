import { useState, useEffect, useRef } from 'react';
import { X, HelpCircle, ArrowRight, AlertCircle, MousePointer2 } from 'lucide-react';

interface TourStep {
    title: string;
    description: string;
    targetId: string;
    requirement?: 'accounts' | 'conversation' | 'modal_open' | 'modal_close';
    guideTitle?: string;
    guideDescription?: string;
}

interface UserGuideTourProps {
    isOpen: boolean;
    onClose: () => void;
    hasAccounts: boolean;
    hasConversation: boolean;
    currentStep: number;
    onStepChange: (step: number) => void;
}

export const tourSteps: TourStep[] = [
    {
        title: "Welcome to Telegram Translator",
        description: "Connect multiple Telegram accounts and translate messages in real-time. Let's take a quick look around.",
        targetId: 'app-logo'
    },
    {
        title: "Account Management",
        description: "Connect and manage your Telegram profiles. You can add more accounts at any time.",
        targetId: 'add-account-btn',
        requirement: 'accounts',
        guideTitle: "Step 1: Add or Select Account",
        guideDescription: "To continue, click 'Add Account' OR click on an existing account in the sidebar."
    },
    {
        title: "Upload Session",
        description: "Upload your Telegram session file (TData in Zip/Rar format). This allows us to securely connect to your account.",
        targetId: 'tdata-upload-box',
        requirement: 'modal_open'
    },
    {
        title: "Identify Your Account",
        description: "Give this account a nickname (e.g., 'Work', 'Personal') to easily identify it in the sidebar.",
        targetId: 'display-name-input'
    },
    {
        title: "Finalize Setup",
        description: "Click here to process the file and connect. Don't worry, your connection is encrypted and private.",
        targetId: 'modal-add-btn'
    },
    {
        title: "Close to Continue",
        description: "Setup complete! Now, click the close button to return to the main chat dashboard and continue the tour.",
        targetId: 'modal-close-btn',
        requirement: 'modal_close',
        guideTitle: "Action Required: Close Modal",
        guideDescription: "Setup finished! Please click the 'X' button or Close to return to the chat interface."
    },
    {
        title: "Chat History",
        description: "View your active conversations for the selected account. New messages bring chats to the top automatically.",
        targetId: 'conversation-list',
        requirement: 'conversation',
        guideTitle: "Action Required: Select a Chat",
        guideDescription: "Now simply click on any chat from this list to open your translation window and start the tour!"
    },
    {
        title: "Live Translation Chat",
        description: "Type in your language, and we'll translate it to the contact's language. Incoming messages are translated back to you instantly.",
        targetId: 'chat-window'
    },
    {
        title: "Smart Tools",
        description: "Use Emojis (movable just like Desktop!), send files, and schedule messages for later.",
        targetId: 'chat-input-area'
    },
    {
        title: "Auto-Responder",
        description: "Automate your business. Set up rules to automatically reply to messages when you're away.",
        targetId: 'nav-auto-responder'
    }
];

export default function UserGuideTour({
    isOpen,
    onClose,
    hasAccounts,
    hasConversation,
    currentStep,
    onStepChange
}: UserGuideTourProps) {
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const prevModalOpen = useRef(false);

    const step = tourSteps[currentStep];
    const isModalInDOM = !!document.getElementById('tdata-upload-box');
    const isConversationListInDOM = !!document.getElementById('conversation-list');

    // Logic for dynamic descriptions and blocking
    let isBlocked = false;
    let activeTitle = step.title;
    let activeDescription = step.description;
    let activeTargetId = step.targetId;
    let badgeText = "Perform This Action to Continue";

    // --- Step 6 Behavioral Logic (Chat History Requirement) ---
    if (currentStep === 6) {
        if (!isConversationListInDOM) {
            // CASE: No account selected yet
            isBlocked = true;
            activeTargetId = 'sidebar-accounts';
            activeTitle = "Action Required: Select Account";
            activeDescription = "Please click on any of your connected accounts in the sidebar to load your conversation list.";
            badgeText = "Please click on any active account to continue";
        } else if (!hasConversation) {
            // CASE: Account selected, but no chat clicked yet
            isBlocked = true;
            activeTargetId = 'conversation-list';
            activeTitle = "Action Required: Select a Chat";
            activeDescription = "Great! Your chats are loaded. Now simply click on any active chat to continue.";
            badgeText = "Please click on any active chat to continue";
        }
    }

    // --- Step 1 Behavioral Logic (Accounts Requirement) ---
    if (step.requirement === 'accounts' && !hasAccounts) {
        isBlocked = true;
        badgeText = "Please click on 'Add Account' Button";
    }

    // --- Modal Closing Logic ---
    else if (step.requirement === 'modal_close' && isModalInDOM) {
        isBlocked = true;
        badgeText = "Please click Close to continue the Tour";
    }

    // Reactive step transitions based on UI state
    useEffect(() => {
        if (!isOpen) return;

        // Detect Modal Opening: From Step 1 -> Step 2
        if (!prevModalOpen.current && isModalInDOM && currentStep === 1) {
            onStepChange(2);
        }
        // Detect Modal Closing: From Step 5 -> Step 6
        else if (prevModalOpen.current && !isModalInDOM && currentStep === 5) {
            onStepChange(6);
        }
        // Detect Account Selection: Transitioning from No-List to List (if already at step 6)
        // No auto-advance here usually, but we want the highlight to shift, handled by state update anyway.

        // Detect Chat Selection: From Step 6 -> Step 7
        if (hasConversation && currentStep === 6) {
            setTimeout(() => onStepChange(7), 400);
        }

        prevModalOpen.current = isModalInDOM;
    }, [isOpen, isModalInDOM, currentStep, hasConversation, onStepChange]);

    useEffect(() => {
        if (isOpen) {
            const updateRect = () => {
                const element = document.getElementById(activeTargetId);
                if (element) {
                    const rect = element.getBoundingClientRect();
                    setTargetRect(rect);

                    if (!isBlocked && !targetRect) {
                        if (!activeTargetId.startsWith('modal') && activeTargetId !== 'tdata-upload-box' && activeTargetId !== 'display-name-input') {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }
                } else {
                    setTargetRect(null);
                }
            };

            updateRect();
            const interval = setInterval(updateRect, 300);
            window.addEventListener('resize', updateRect);
            window.addEventListener('scroll', updateRect, true);

            return () => {
                clearInterval(interval);
                window.removeEventListener('resize', updateRect);
                window.removeEventListener('scroll', updateRect, true);
            };
        } else {
            setTargetRect(null);
        }
    }, [currentStep, isOpen, activeTargetId, isBlocked]);

    if (!isOpen) return null;

    const handleNext = () => {
        if (isBlocked) return;

        if (currentStep === 1 && hasAccounts) {
            onStepChange(6);
            return;
        }

        if (currentStep < tourSteps.length - 1) {
            onStepChange(currentStep + 1);
        } else {
            onClose();
            onStepChange(0);
        }
    };

    const handlePrev = () => {
        if (currentStep === 6) {
            onStepChange(1);
            return;
        }

        if (currentStep > 0) {
            onStepChange(currentStep - 1);
        }
    };

    return (
        <div className="fixed inset-0 z-[10000] pointer-events-none overflow-hidden font-sans select-none antialiased">
            {targetRect && (
                <div
                    className="absolute border-2 border-blue-500 rounded-2xl transition-all duration-300 z-[10001] bg-blue-500/5 shadow-[0_0_0_9999px_rgba(10,10,15,0.7)]"
                    style={{
                        top: targetRect.top - 8,
                        left: targetRect.left - 8,
                        width: targetRect.width + 16,
                        height: targetRect.height + 16,
                        pointerEvents: 'none'
                    }}
                >
                    {isBlocked && (
                        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white text-[11px] font-black px-6 py-2.5 rounded-full shadow-2xl animate-bounce uppercase tracking-widest whitespace-nowrap border border-blue-400/50 flex items-center space-x-2">
                            <MousePointer2 className="w-4 h-4 fill-white" />
                            <span>{badgeText}</span>
                        </div>
                    )}
                </div>
            )}

            {!targetRect && <div className="absolute inset-0 bg-black/70 pointer-events-auto" />}

            {/* Tour Dialogue Card */}
            <div
                className="absolute top-26 right-10 w-[420px] bg-gray-900 border border-gray-800 rounded-[32px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] p-7 pointer-events-auto transform transition-all duration-300 animate-fade-in z-[10002]"
            >
                <div className="flex items-center justify-between mb-5 pb-5 border-b border-gray-800">
                    <div className="flex items-center space-x-3">
                        <div className="bg-blue-600/20 p-2.5 rounded-2xl">
                            <HelpCircle className="w-5 h-5 text-blue-400" />
                        </div>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Tour Step • {currentStep + 1}/{tourSteps.length}</span>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-all p-2 hover:bg-gray-800 rounded-full">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex items-start space-x-4 mb-5">
                    <div className={`mt-1.5 h-3 w-3 rounded-full flex-shrink-0 ${isBlocked ? 'bg-amber-500 animate-pulse shadow-amber-500/50' : 'bg-green-500 shadow-green-500/20'}`} />
                    <div className="flex-1 min-w-0">
                        <h3 className={`text-2xl font-black leading-tight mb-2 ${isBlocked ? 'text-amber-400' : 'text-white'}`}>{activeTitle}</h3>
                        <div className={`p-4 rounded-3xl border transition-all duration-500 ${isBlocked ? 'bg-amber-500/10 border-amber-500/20 shadow-inner' : 'bg-gray-800/40 border-gray-700/30'}`}>
                            <p className={`${isBlocked ? 'text-amber-200' : 'text-gray-300'} text-[13px] leading-relaxed font-bold`}>
                                {activeDescription}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between mt-6">
                    <div className="flex space-x-1.5 flex-1 mr-4">
                        {tourSteps.map((_, idx) => (
                            <div
                                key={idx}
                                className={`h-1.5 rounded-full transition-all duration-700 ${idx === currentStep ? 'bg-blue-500 w-8 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-gray-800 w-1.5'}`}
                            />
                        ))}
                    </div>
                    <div className="flex items-center space-x-3 flex-shrink-0">
                        {currentStep > 0 && (
                            <button
                                onClick={handlePrev}
                                className="px-3 py-2 text-[10px] font-black text-gray-400 hover:text-white transition-all uppercase tracking-widest"
                            >
                                Back
                            </button>
                        )}
                        <button
                            onClick={handleNext}
                            disabled={isBlocked}
                            className={`flex items-center space-x-2 px-6 py-2.5 rounded-2xl transition-all font-black shadow-xl ${isBlocked
                                    ? 'bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700/50 shadow-none'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/30 transform active:scale-95'
                                }`}
                        >
                            <span className="text-[11px] uppercase tracking-wider">{currentStep === tourSteps.length - 1 ? 'Finish' : 'Next'}</span>
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
