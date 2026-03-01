import { useState, useEffect, useRef } from 'react';
import { X, HelpCircle, ArrowRight, MousePointer2, ArrowLeft } from 'lucide-react';

interface TourStep {
    title: string;
    description: string;
    targetId: string;
    requirement?: 'accounts' | 'conversation' | 'modal_open' | 'modal_close' | 'crm_open' | 'crm_close' | 'is_auto_responder';
    group?: 'main' | 'auto-responder';
    placement?: 'left' | 'right' | 'top' | 'bottom';
}

interface UserGuideTourProps {
    isOpen: boolean;
    onClose: () => void;
    hasAccounts: boolean;
    hasConversation: boolean;
    currentStep: number;
    onStepChange: (step: number) => void;
}

export const allTourSteps: TourStep[] = [
    {
        title: "Welcome to Telegram Translator",
        description: "Connect multiple Telegram accounts and translate messages in real-time. Let's take a quick look around.",
        targetId: 'app-logo',
        group: 'main'
    },
    {
        title: "Account Management",
        description: "Connect and manage your Telegram profiles. You can add more accounts at any time.",
        targetId: 'add-account-btn',
        requirement: 'accounts',
        group: 'main'
    },
    {
        title: "Upload Session",
        description: "Upload your Telegram session file (TData in Zip/Rar format). This allows us to securely connect to your account.",
        targetId: 'tdata-upload-box',
        requirement: 'modal_open',
        group: 'main'
    },
    {
        title: "Identify Your Account",
        description: "Give this account a nickname (e.g., 'Work', 'Personal') to easily identify it in the sidebar.",
        targetId: 'display-name-input',
        group: 'main'
    },
    {
        title: "Language Preferences",
        description: "Crucially, set your 'Source' and 'Target' languages. We'll translate between these in real-time.",
        targetId: 'language-selection-container',
        group: 'main'
    },
    {
        title: "Finalize Setup",
        description: "Click here to process the file and connect. Don't worry, your connection is encrypted and private.",
        targetId: 'modal-add-btn',
        group: 'main'
    },
    {
        title: "Close to Continue",
        description: "Setup complete! Now, click the close button to return to the main chat dashboard and continue the tour.",
        targetId: 'modal-close-btn',
        requirement: 'modal_close',
        group: 'main'
    },
    {
        title: "Edit Account",
        description: "Click the ✏️ pencil icon to edit an account's name, source/target languages, or other settings at any time.",
        targetId: 'account-edit-btn',
        group: 'main'
    },
    {
        title: "Delete Account",
        description: "Click the 🗑️ trash icon to remove an account from the list. This won't delete your Telegram data.",
        targetId: 'account-delete-btn',
        group: 'main'
    },
    {
        title: "Online / Offline Toggle",
        description: "Use the WiFi icon to connect or disconnect a Telegram account. Green = Connected, Red = Offline.",
        targetId: 'account-online-btn',
        group: 'main'
    },
    {
        title: "Chat History",
        description: "View your active conversations for the selected account. New messages bring chats to the top automatically.",
        targetId: 'conversation-list',
        requirement: 'conversation',
        group: 'main',
        placement: 'left'
    },
    {
        title: "Live Translation Chat",
        description: "Type in your language, and we'll translate it to the contact's language. Incoming messages are translated back to you instantly.",
        targetId: 'chat-window',
        group: 'main'
    },
    {
        title: "Smart Tools",
        description: "Use Emojis (movable!), send files, and schedule messages for later.",
        targetId: 'chat-input-area',
        group: 'main'
    },
    {
        title: "CRM Relationship System",
        description: "Click this CRM button to manage detailed relationship profiles. It allows you to store metadata, identify multi-platform handles, track commercial logistics, and manage fulfillment notes all in one place.",
        targetId: 'chat-crm-btn',
        requirement: 'crm_open',
        group: 'main',
        placement: 'left'
    },
    {
        title: "Comprehensive Contact Profile",
        description: "This advanced CRM modal combines Personal Metadata, Business Logistics, Shipping Details, and Strategic Internal Notes. Use it to build deep relationship maps and track your business deal lifecycle effectively.",
        targetId: 'crm-modal-container',
        group: 'main'
    },
    {
        title: "Close CRM Profile",
        description: "Great! Now close the profile to return to chat. We're almost finished!",
        targetId: 'crm-modal-close-btn',
        requirement: 'crm_close',
        group: 'main'
    },
    {
        title: "Auto-Responder",
        description: "Switch to the Auto-Responder page to automate your business with keyword-based replies.",
        targetId: 'nav-auto-responder',
        requirement: 'is_auto_responder',
        group: 'main'
    },
    {
        title: "Automation Dashboard",
        description: "Here you can see all your active and inactive automated response rules.",
        targetId: 'ar-rules-list',
        group: 'auto-responder'
    },
    {
        title: "Create Auto-Rules",
        description: "Click 'Add Rule' to create a new trigger. You can set keywords, priority, and even attach media like photos or videos!",
        targetId: 'ar-add-rule-btn',
        group: 'auto-responder'
    },
    {
        title: "Tour Complete!",
        description: "You're all set to use Telegram Translator. Connect your accounts and start translating!",
        targetId: 'app-logo',
        group: 'auto-responder'
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
    const [popupPos, setPopupPos] = useState({ top: 100, left: 100 });
    const [filteredSteps, setFilteredSteps] = useState<TourStep[]>(allTourSteps);

    const prevModalOpen = useRef(false);
    const prevCrmOpen = useRef(false);
    const prevIsAutoResponder = useRef(false);

    const isAutoResponderPage = window.location.pathname === '/auto-responder';
    const isModalInDOM = !!document.getElementById('tdata-upload-box');
    const isCrmOpen = !!document.getElementById('crm-modal-profile');
    const isConversationListInDOM = !!document.getElementById('conversation-list');

    // Filter steps on initial open based on starting page
    useEffect(() => {
        if (isOpen) {
            const isAuto = window.location.pathname === '/auto-responder';
            if (isAuto) {
                setFilteredSteps(allTourSteps.filter(s => s.group === 'auto-responder'));
            } else {
                setFilteredSteps(allTourSteps);
            }
        }
    }, [isOpen]);

    const step = filteredSteps[currentStep] || filteredSteps[0];

    // Logic for dynamic descriptions and blocking
    let isBlocked = false;
    let activeTitle = step.title;
    let activeDescription = step.description;
    let activeTargetId = step.targetId;
    let badgeText = "Action Required";

    // Auto-advance logic for skipping setup steps
    useEffect(() => {
        if (!isOpen) return;

        const timeout = setTimeout(() => {
            // If we are at the Add Account step and already have accounts, we don't block
            // but we allow manual 'Next' to skip to step 7 (Edit Account).
        }, 300);
        return () => clearTimeout(timeout);
    }, [isOpen, activeTargetId, hasAccounts, isModalInDOM, currentStep, onStepChange]);

    // Reactive transitions for Action Required steps
    useEffect(() => {
        if (!isOpen) return;

        // Use activeTargetId for comparison
        const stepTargetId = step.targetId;

        // Modal triggers
        if (!prevModalOpen.current && isModalInDOM && stepTargetId === 'add-account-btn') {
            onStepChange(currentStep + 1);
        } else if (prevModalOpen.current && !isModalInDOM && stepTargetId === 'modal-close-btn') {
            onStepChange(currentStep + 1);
        }

        // CRM triggers
        if (!prevCrmOpen.current && isCrmOpen && stepTargetId === 'chat-crm-btn') {
            onStepChange(currentStep + 1);
        } else if (prevCrmOpen.current && !isCrmOpen && stepTargetId === 'crm-modal-close-btn') {
            onStepChange(currentStep + 1);
        }

        // Auto-Responder trigger
        if (!prevIsAutoResponder.current && isAutoResponderPage && stepTargetId === 'nav-auto-responder') {
            onStepChange(currentStep + 1);
        }

        // Chat Select trigger
        if (hasConversation && stepTargetId === 'conversation-list') {
            onStepChange(currentStep + 1);
        }

        prevModalOpen.current = isModalInDOM;
        prevCrmOpen.current = isCrmOpen;
        prevIsAutoResponder.current = isAutoResponderPage;
    }, [isOpen, isModalInDOM, isCrmOpen, isAutoResponderPage, hasConversation, step.targetId, currentStep, onStepChange]);

    // Position Calculation
    useEffect(() => {
        if (!isOpen) return;

        const updateRect = () => {
            const element = document.getElementById(activeTargetId);
            if (element) {
                const rect = element.getBoundingClientRect();
                setTargetRect(rect);

                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                const popupWidth = 360;
                const popupHeight = 240;

                let top = rect.top;
                let left = rect.right + 30;

                // Explicit Placement Logic
                if (step.placement === 'left') {
                    left = rect.left - popupWidth - 30;
                } else if (step.placement === 'right') {
                    left = rect.right + 30;
                } else {
                    // Default logic (flip if doesn't fit)
                    if (left + popupWidth > viewportWidth - 20) {
                        left = rect.left - popupWidth - 30;
                    }
                }

                if (left < 20 || left + popupWidth > viewportWidth - 20) {
                    left = Math.max(20, Math.min(viewportWidth - popupWidth - 20, rect.left + rect.width / 2 - popupWidth / 2));
                    top = rect.bottom + 30;
                }

                if (top + popupHeight > viewportHeight - 20) {
                    top = rect.top - popupHeight - 30;
                }

                top = Math.max(20, Math.min(viewportHeight - popupHeight - 20, top));
                left = Math.max(20, Math.min(viewportWidth - popupWidth - 20, left));

                setPopupPos({ top, left });
            } else {
                setTargetRect(null);
                setPopupPos({
                    top: window.innerHeight / 2 - 120,
                    left: window.innerWidth / 2 - 180
                });
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
    }, [currentStep, isOpen, activeTargetId, filteredSteps, step.placement]);

    // Requirements logic
    if (activeTargetId === 'conversation-list') {
        if (!isConversationListInDOM) {
            isBlocked = true;
            activeTargetId = 'sidebar-accounts';
            activeTitle = "Select Account First";
            activeDescription = "Please click on any account in the sidebar to load your chats.";
            badgeText = "Click on an account";
        } else if (!hasConversation) {
            isBlocked = true;
            activeTargetId = 'conversation-list';
            activeTitle = "Select a Chat";
            activeDescription = "Great! Now select any active chat to proceed with the tour.";
            badgeText = "Click on a chat";
        }
    }

    if (step.requirement === 'crm_open' && !isCrmOpen) {
        isBlocked = true;
        badgeText = "Click the CRM button";
    } else if (step.requirement === 'crm_close' && isCrmOpen) {
        isBlocked = true;
        badgeText = "Close the CRM Profile";
    }

    if (step.requirement === 'is_auto_responder' && !isAutoResponderPage) {
        isBlocked = true;
        badgeText = "Switch to Auto-Responder";
    }

    if (step.requirement === 'accounts') {
        // We don't block this step anymore to allow clicking 'Next' to skip
        badgeText = "Click to Setup Account";
    } else if (step.requirement === 'modal_close' && isModalInDOM) {
        isBlocked = true;
        badgeText = "Close the modal";
    }

    if (!isOpen) return null;

    const handleNext = () => {
        // Special skip logic for Add Account step
        if (activeTargetId === 'add-account-btn') {
            onStepChange(7); // Jump to "Edit Account"
            return;
        }

        if (isBlocked) return;

        if (currentStep < filteredSteps.length - 1) {
            onStepChange(currentStep + 1);
        } else {
            onClose();
            onStepChange(0);
        }
    };

    const handlePrev = () => {
        // If we skipped to step 7, 'Back' should take us to step 1
        if (currentStep === 7 && !isModalInDOM) {
            onStepChange(1);
            return;
        }
        if (currentStep > 0) onStepChange(currentStep - 1);
    };

    return (
        <div className="fixed inset-0 z-[10000] pointer-events-none overflow-hidden font-sans select-none antialiased">
            <div className="absolute inset-0 bg-black/40 transition-opacity duration-500 pointer-events-none" />

            {targetRect && (
                <div
                    className="absolute border-2 border-blue-500 rounded-2xl transition-all duration-300 z-[10001] bg-white/5 shadow-[0_0_0_9999px_rgba(10,10,15,0.7)]"
                    style={{
                        top: targetRect.top - 6,
                        left: targetRect.left - 6,
                        width: targetRect.width + 12,
                        height: targetRect.height + 12,
                        pointerEvents: 'none'
                    }}
                >
                    {isBlocked && (
                        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white text-[9px] font-black px-4 py-2 rounded-full shadow-2xl animate-bounce uppercase tracking-widest whitespace-nowrap border border-blue-400/50 flex items-center space-x-2">
                            <MousePointer2 className="w-3.5 h-3.5 fill-white" />
                            <span>{badgeText}</span>
                        </div>
                    )}
                </div>
            )}

            <div
                className="absolute w-[360px] bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-[24px] shadow-[0_30px_80px_-15px_rgba(0,0,0,0.4)] p-6 pointer-events-auto transition-all duration-500 transform animate-fade-in z-[10002]"
                style={{
                    top: popupPos.top,
                    left: popupPos.left
                }}
            >
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center space-x-3">
                        <div className="bg-blue-600/10 dark:bg-blue-600/20 p-2 rounded-xl">
                            <HelpCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none">Step {currentStep + 1} of {filteredSteps.length}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-red-500 transition-all p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex items-start space-x-3 mb-6 min-h-[70px]">
                    <div className={`mt-1.5 h-3 w-3 rounded-full flex-shrink-0 ${isBlocked ? 'bg-amber-500 animate-pulse' : 'bg-blue-500'}`} />
                    <div className="flex-1 min-w-0">
                        <h3 className={`text-xl font-black leading-tight mb-2 tracking-tighter ${isBlocked ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>{activeTitle}</h3>
                        <p className={`text-[12px] leading-relaxed font-bold ${isBlocked ? 'text-amber-800/80 dark:text-amber-200/80' : 'text-gray-600 dark:text-gray-400'}`}>
                            {activeDescription}
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-50 dark:border-gray-800">
                    <div className="flex-1 mr-4">
                        <div className="h-1 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-500 transition-all duration-500"
                                style={{ width: `${((currentStep + 1) / filteredSteps.length) * 100}%` }}
                            />
                        </div>
                    </div>

                    <div className="flex items-center space-x-2">
                        {currentStep > 0 && (
                            <button
                                onClick={handlePrev}
                                className="px-3 py-2 text-[9px] font-black text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all uppercase tracking-widest flex items-center space-x-1"
                            >
                                <ArrowLeft className="w-3 h-3" />
                                <span>Back</span>
                            </button>
                        )}
                        <button
                            onClick={handleNext}
                            disabled={isBlocked}
                            className={`flex items-center space-x-2 px-5 py-2 rounded-xl transition-all font-black ${isBlocked
                                ? 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-700 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30 active:scale-95'
                                }`}
                        >
                            <span className="text-[10px] uppercase tracking-wider">{currentStep === filteredSteps.length - 1 ? 'Finish' : 'Next'}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
