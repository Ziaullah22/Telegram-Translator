import { useState, useEffect } from 'react';
import { X, HelpCircle, ArrowRight, MousePointer2, ArrowLeft, AlertTriangle, RefreshCw } from 'lucide-react';

interface TourStep {
    title: string;
    description: string;
    targetId: string;
    requirement?: 'must_open_modal' | 'modal_open' | 'modal_close' | 'crm_open' | 'crm_close' | 'is_auto_responder' | 'ar_modal_open' | 'ar_modal_close' | 'account_selected' | 'chat_selected' | 'search_visible' | 'templates_menu_open' | 'templates_modal_open' | 'templates_modal_close' | 'schedule_modal_open' | 'schedule_modal_close' | 'profile_modal_open' | 'profile_modal_close' | 'sessions_modal_open' | 'sessions_modal_close' | 'is_analytics';
    group?: 'main' | 'auto-responder' | 'analytics';
    // placement: where to put popup relative to the highlighted element
    placement: 'left' | 'right' | 'top' | 'bottom';
    scrollIntoView?: boolean; // auto-scroll el into view
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
    // ── STEP 0: Welcome ──────────────────────────────────────────────────────
    {
        title: "Welcome to Telegram Translator",
        description: "A professional multi-account Telegram client with real-time AI translation. Let's explore every feature together.",
        targetId: 'app-logo',
        group: 'main',
        placement: 'bottom'
    },
    // ── STEP 1: Add Account ──────────────────────────────────────────────────
    // requirement 'must_open_modal' → ALWAYS blocks Next until user clicks the button and modal opens
    {
        title: "Add a Telegram Account",
        description: "ACTION REQUIRED: Click the 'Add Account' button to open the setup wizard. The tour will automatically continue once the form is open.",
        targetId: 'add-account-btn',
        requirement: 'must_open_modal',
        group: 'main',
        placement: 'right'
    },
    // ── STEP 2: TData Upload (modal) ─────────────────────────────────────────
    {
        title: "Upload Your TData",
        description: "Drag & drop or click to upload your Telegram TData archive (ZIP or RAR). Your session is processed securely on your machine.",
        targetId: 'tdata-upload-box',
        requirement: 'modal_open',
        group: 'main',
        placement: 'bottom',
        scrollIntoView: true
    },
    // ── STEP 3: Display Name (modal) ─────────────────────────────────────────
    {
        title: "Set a Display Name",
        description: "Give this account a friendly label (e.g. 'Business Account') to tell it apart from others in the sidebar.",
        targetId: 'display-name-input',
        group: 'main',
        placement: 'bottom',
        scrollIntoView: true
    },
    // ── STEP 4: Language Selection (modal) ───────────────────────────────────
    {
        title: "Configure Translation",
        description: "Set your source and target languages. Every incoming and outgoing message will be automatically translated.",
        targetId: 'language-selection-container',
        group: 'main',
        placement: 'bottom',
        scrollIntoView: true
    },
    // ── STEP 5: Add/Connect Button (modal) ───────────────────────────────────
    {
        title: "Finalize & Connect",
        description: "Click 'Add Account' to save your settings. The account will connect automatically in the background.",
        targetId: 'modal-add-btn',
        group: 'main',
        placement: 'top',
        scrollIntoView: true
    },
    // ── STEP 6: Close Setup Modal ────────────────────────────────────────────
    {
        title: "Setup Complete — Close Window",
        description: "Your account has been added! Click the X to close this setup window and return to the dashboard.",
        targetId: 'modal-close-btn',
        requirement: 'modal_close',
        group: 'main',
        placement: 'bottom'
    },
    // ── STEP 8: Edit Account ────────────────────────────────────────────────
    {
        title: "Edit Account Settings",
        description: "Click the pencil icon to safely rename your account or change its source and target translation languages.",
        targetId: 'account-edit-btn',
        group: 'main',
        placement: 'right'
    },
    // ── STEP 9: Remove Account ──────────────────────────────────────────────
    {
        title: "Remove Account",
        description: "Click the red trash bin to completely disconnect and remove this account from the dashboard.",
        targetId: 'account-delete-btn',
        group: 'main',
        placement: 'right'
    },
    // ── STEP 10: Profile Management ───────────────────────────────────────────
    {
        title: "Manage Your Profile",
        description: "ACTION REQUIRED: Click the Blue User icon to open your Telegram Profile settings. You can update your bio, photo, and security from here.",
        targetId: 'account-profile-btn',
        requirement: 'profile_modal_open',
        group: 'main',
        placement: 'right'
    },
    // ── Inside Profile Modal ────────────────────────────────────────────────
    {
        title: "Section 1: Profile Info",
        description: "Update your First Name, Last Name, and public Bio. You can also change your profile photo by clicking the camera icon.",
        targetId: 'profile-tab-info',
        group: 'main',
        placement: 'bottom',
        scrollIntoView: true
    },
    {
        title: "Section 2: Privacy Settings",
        description: "Control who can see your phone number. Set it to 'Nobody' for maximum privacy during business operations.",
        targetId: 'profile-tab-privacy',
        group: 'main',
        placement: 'bottom',
        scrollIntoView: true
    },
    {
        title: "Section 3: 2FA Security",
        description: "Strengthen your account by setting or updating your Two-Step Verification password here. This protects your account from unauthorized logins.",
        targetId: 'profile-tab-2fa',
        group: 'main',
        placement: 'bottom',
        scrollIntoView: true
    },
    {
        title: "Close Profile Settings",
        description: "ACTION REQUIRED: Click the X to close your profile settings and return to the sidebar.",
        targetId: 'profile-modal-close-btn',
        requirement: 'profile_modal_close',
        group: 'main',
        placement: 'bottom'
    },
    // ── STEP 10: Active Sessions ─────────────────────────────────────────────
    {
        title: "Active Device Sessions",
        description: "ACTION REQUIRED: Click the Amber Shield icon to see all devices currently logged into this Telegram account.",
        targetId: 'account-sessions-btn',
        requirement: 'sessions_modal_open',
        group: 'main',
        placement: 'right'
    },
    // ── Inside Sessions Modal ──────────────────────────────────────────────
    {
        title: "Security Audit",
        description: "Review all active devices. If you see a device you don't recognize, you can terminate its session immediately to secure your account.",
        targetId: 'sessions-modal-container',
        group: 'main',
        placement: 'right'
    },
    {
        title: "Close Sessions Audit",
        description: "ACTION REQUIRED: Click the X to close the sessions window.",
        targetId: 'sessions-modal-close-btn',
        requirement: 'sessions_modal_close',
        group: 'main',
        placement: 'bottom'
    },
    // ── STEP 11: Online/Offline Toggle (sidebar) ──────────────────────────────
    {
        title: "Connection Status Toggle",
        description: "Click the WiFi icon to instantly connect or disconnect an account. Green = Online, Red = Offline.",
        targetId: 'account-online-btn',
        group: 'main',
        placement: 'right'
    },
    // ── STEP 12: Search Bar (conversation list) ───────────────────────────────
    {
        title: "Global Smart Search",
        description: "Type any username or name to search across all your chats and the wider Telegram user directory simultaneously.",
        targetId: 'search-container',
        requirement: 'search_visible',
        group: 'main',
        placement: 'right'
    },
    // ── STEP 10: Conversation List ────────────────────────────────────────────
    {
        title: "Conversation List",
        description: "All active chats for the selected account appear here, sorted by latest message. Unread message counts are shown as badges.",
        targetId: 'conversation-list',
        requirement: 'account_selected',
        group: 'main',
        placement: 'right'
    },
    // ── STEP 11: Live Translation Window ─────────────────────────────────────
    {
        title: "Live Translation Window",
        description: "This is the live chat area. Messages are auto-translated in real-time — you type in your language, your contact reads in theirs.",
        targetId: 'chat-window',
        requirement: 'chat_selected',
        group: 'main',
        placement: 'left'
    },
    // ── STEP 12: Message Input ────────────────────────────────────────────────
    {
        title: "Message Controls",
        description: "Type messages here. You can also attach images, files, or voice messages. All will be delivered with translation applied.",
        targetId: 'chat-input-area',
        group: 'main',
        placement: 'top'
    },
    // ── STEP 13: Message Templates ──────────────────────────────────────────
    {
        title: "Quick Templates",
        description: "ACTION REQUIRED: Click here to see your list of saved message templates. (If nothing happens, it means you have no templates yet! The tour will auto-continue).",
        targetId: 'chat-templates-btn',
        requirement: 'templates_menu_open',
        group: 'main',
        placement: 'top'
    },
    // ── STEP 14: Template Management ────────────────────────────────────────
    {
        title: "Manage Templates",
        description: "ACTION REQUIRED: Click 'Manage' to open the template manager, where you can create, edit, or delete custom message templates.",
        targetId: 'chat-templates-manage-btn',
        requirement: 'templates_modal_open',
        group: 'main',
        placement: 'top'
    },
    // ── Inside Templates Modal ──────────────────────────────────────────────
    {
        title: "Template Manager",
        description: "Here you can view and manage all your templates. These templates sync across all your connected accounts for quick access.",
        targetId: 'templates-modal-container',
        group: 'main',
        placement: 'right'
    },
    {
        title: "Create a Template",
        description: "You can click here to add a new template. Templates allow you to respond instantly to common questions without retyping them.",
        targetId: 'templates-modal-create-btn',
        group: 'main',
        placement: 'bottom'
    },
    // ── Close Templates Modal ──────────────────────────────────────────────
    {
        title: "Close Template Manager",
        description: "ACTION REQUIRED: Click the X to close the template manager before continuing to the next step.",
        targetId: 'templates-modal-close-btn',
        requirement: 'templates_modal_close',
        group: 'main',
        placement: 'bottom'
    },
    // ── STEP 15: Message Scheduling ─────────────────────────────────────────
    {
        title: "Smart Scheduling",
        description: "ACTION REQUIRED: To enable this button, you first need to type something in the message box! Once enabled, click the Clock icon to open the message scheduler.",
        targetId: 'chat-schedule-btn',
        requirement: 'schedule_modal_open',
        group: 'main',
        placement: 'top'
    },
    // ── Inside Schedule Modal ──────────────────────────────────────────────
    {
        title: "Schedule Message",
        description: "Set the number of days, hours, and minutes to delay the message.",
        targetId: 'schedule-modal-content',
        group: 'main',
        placement: 'left'
    },
    {
        title: "Delivery Time",
        description: "Verify exactly when the message will be delivered here. If the contact replies before the countdown finishes, this automation is automatically cancelled to prevent out-of-context replies.",
        targetId: 'schedule-modal-time-preview',
        group: 'main',
        placement: 'top'
    },
    // ── Close Schedule Modal ──────────────────────────────────────────────
    {
        title: "Cancel / Close Scheduler",
        description: "ACTION REQUIRED: Click 'Cancel' to close the scheduler.",
        targetId: 'schedule-modal-close-btn',
        requirement: 'schedule_modal_close',
        group: 'main',
        placement: 'bottom'
    },
    // ── STEP 13: CRM — single step highlighting full CRM modal ───────────────
    {
        title: "Integrated Contact CRM",
        description: "Click the CRM icon in the chat header to open this panel. Track contact details, shipping addresses, order notes, and relationship history — all in one place. Close it when done.",
        targetId: 'chat-crm-btn',
        requirement: 'crm_open',
        group: 'main',
        placement: 'bottom'
    },
    // ── STEP 14: Force close CRM before navigating away ────────────────────
    {
        title: "Close CRM to Continue",
        description: "Great! Now close the CRM panel to continue the tour — next we'll explore the powerful Marketing Automation features.",
        targetId: 'crm-modal-close-btn',
        requirement: 'crm_close',
        group: 'main',
        placement: 'left'
    },
    // ── STEP 15: Auto-Responder Nav ───────────────────────────────────────────
    {
        title: "Marketing Automation",
        description: "Click 'Auto-Responder' in the top navigation to configure keyword-triggered automated reply rules.",
        targetId: 'nav-auto-responder',
        requirement: 'is_auto_responder',
        group: 'main',
        placement: 'bottom'
    },
    // ─── AUTO-RESPONDER PAGE ─────────────────────────────────────────────────
    {
        title: "Automation Rules Dashboard",
        description: "All your active keyword auto-reply rules live here. You can enable, disable, or delete them at any time.",
        targetId: 'ar-rules-list',
        group: 'auto-responder',
        placement: 'right'
    },
    {
        title: "Create a New Rule",
        description: "Click 'Add Rule' to open the rule editor and define a new automated response.",
        targetId: 'ar-add-rule-btn',
        requirement: 'ar_modal_open',
        group: 'auto-responder',
        placement: 'bottom'
    },
    // ── AR Modal sections (auto-scroll as tour progresses) ────────────────────
    {
        title: "Rule Name",
        description: "Give your rule a descriptive name so you can identify it easily in the dashboard.",
        targetId: 'ar-modal-name',
        group: 'auto-responder',
        placement: 'right',
        scrollIntoView: true
    },
    {
        title: "Trigger Keywords",
        description: "Enter the keywords that will trigger this rule. E.g. 'price', 'cost', 'how much' — separated by commas.",
        targetId: 'ar-modal-keywords',
        group: 'auto-responder',
        placement: 'right',
        scrollIntoView: true
    },
    {
        title: "Automated Response Message",
        description: "Write the reply message that will be sent automatically when a keyword is matched.",
        targetId: 'ar-modal-response',
        group: 'auto-responder',
        placement: 'right',
        scrollIntoView: true
    },
    {
        title: "Language Setting",
        description: "Choose which language account this rule applies to, or set it to apply across all connected accounts.",
        targetId: 'ar-modal-language',
        group: 'auto-responder',
        placement: 'right',
        scrollIntoView: true
    },
    {
        title: "Attach Media (Optional)",
        description: "You can attach an image or file that will be sent alongside your automated text reply.",
        targetId: 'ar-modal-media',
        group: 'auto-responder',
        placement: 'right',
        scrollIntoView: true
    },
    {
        title: "Priority Level",
        description: "Set the priority of this rule. Higher priority rules take precedence when multiple keywords match.",
        targetId: 'ar-modal-priority',
        group: 'auto-responder',
        placement: 'right',
        scrollIntoView: true
    },
    {
        title: "Enable / Disable Rule",
        description: "Toggle this switch to immediately activate or deactivate the rule without deleting it.",
        targetId: 'ar-modal-active',
        group: 'auto-responder',
        placement: 'right',
        scrollIntoView: true
    },
    {
        title: "Save & Activate Rule",
        description: "Click Save to deploy this rule instantly. It will start auto-replying to matching messages right away.",
        targetId: 'ar-modal-save',
        group: 'auto-responder',
        placement: 'top',
        scrollIntoView: true
    },
    {
        title: "Close Rule Editor",
        description: "Click the X to close the editor. Your rule is now live and running across all connected accounts.",
        targetId: 'ar-modal-close',
        requirement: 'ar_modal_close',
        group: 'auto-responder',
        placement: 'bottom'
    },
    // ── STEP: Navigate to Performance ─────────────────────────────────────────
    {
        title: "Team Performance & Analytics",
        description: "ACTION REQUIRED: Click 'Performance' in the top navigation to view response times and team analytics.",
        targetId: 'nav-analytics',
        requirement: 'is_analytics',
        group: 'auto-responder',
        placement: 'bottom'
    },
    // ── ANALYTICS PAGE ────────────────────────────────────────────────────────
    {
        title: "Performance Dashboard",
        description: "Welcome to the Analytics layout! This page gives you a bird's-eye view of your team's response times and message volume.",
        targetId: 'analytics-header',
        group: 'analytics',
        placement: 'bottom'
    },
    {
        title: "Select User or Target",
        description: "Use this filter menu to view statistics for a specific colleague or a particular connected target account.",
        targetId: 'analytics-filter-btn',
        group: 'analytics',
        placement: 'bottom'
    },
    {
        title: "Active Focus",
        description: "This card shows you exactly whose statistics you are currently viewing.",
        targetId: 'analytics-active-focus',
        group: 'analytics',
        placement: 'bottom'
    },
    {
        title: "Performance Leaderboard",
        description: "See exactly which team members or connected accounts are responding the fastest. Use this table to instantly identify bottlenecks and reward your top performers.",
        targetId: 'analytics-stats-table',
        group: 'analytics',
        placement: 'top'
    },
    {
        title: "🎉 Tour Complete!",
        description: "You're now a Telegram Translator expert! All features are at your fingertips. Happy translating!",
        targetId: 'app-logo',
        group: 'analytics',
        placement: 'bottom'
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
    const [showTourEndedNotice, setShowTourEndedNotice] = useState(false);

    // ── DOM state checks (re-evaluated every render) ─────────────────────────
    const isAutoResponderPage = window.location.pathname === '/auto-responder';
    const isAnalyticsPage = window.location.pathname === '/analytics';
    const isModalInDOM = !!document.getElementById('tdata-upload-box');
    const isArModalInDOM = !!document.getElementById('ar-modal-name');
    const isCrmOpen = !!document.getElementById('crm-modal-container');
    const isProfileModalInDOM = !!document.getElementById('profile-modal-container');
    const isSessionsModalInDOM = !!document.getElementById('sessions-modal-container');
    const isConvListInDOM = !!document.getElementById('conversation-list');
    const isSearchInDOM = !!document.getElementById('search-container');
    const isTemplatesMenuOpen = !!document.getElementById('templates-menu-state-open');
    const isTemplatesModalInDOM = !!document.getElementById('templates-modal-container');
    const isScheduleModalInDOM = !!document.getElementById('schedule-modal-container');

    // Filter steps when tour opens based on starting page
    useEffect(() => {
        if (isOpen) {
            const pathname = window.location.pathname;
            if (pathname === '/auto-responder') {
                setFilteredSteps(allTourSteps.filter(s => s.group === 'auto-responder' || s.group === 'analytics'));
            } else if (pathname === '/analytics') {
                setFilteredSteps(allTourSteps.filter(s => s.group === 'analytics'));
            } else {
                setFilteredSteps(allTourSteps);
            }
        }
    }, [isOpen]);

    const step = filteredSteps[currentStep] || filteredSteps[0];

    // ── REQUIREMENT RESOLUTION ────────────────────────────────────────────────
    // Must run BEFORE the position useEffect so activeTargetId is correct.
    let isBlocked = false;
    let activeTitle = step.title;
    let activeDesc = step.description;
    let activeTargetId = step.targetId;
    let activePlacement = step.placement;
    let badgeText = '';

    if (step.requirement === 'must_open_modal' && !isModalInDOM) {
        // ALWAYS block: user must physically click Add Account
        isBlocked = true;
        badgeText = "Click 'Add Account' to Continue";
        activeTitle = "Action Required: Open Setup";
        activeDesc = "You must click the 'Add Account' button to open the setup wizard. The tour will automatically advance once it opens.";

    } else if (step.requirement === 'modal_open' && !isModalInDOM) {
        isBlocked = true;
        badgeText = "Open the Setup Modal First";

    } else if (step.requirement === 'modal_close' && isModalInDOM) {
        isBlocked = true;
        badgeText = "Finish Setup & Close This Window";

    } else if (step.requirement === 'profile_modal_open' && !isProfileModalInDOM) {
        isBlocked = true;
        badgeText = "Click User Icon to Open Profile";
        activeTitle = "Action Required: Open Profile";
        activeDesc = "Please click the blue User icon for the selected account to open the Profile Settings. The tour will automatically continue.";

    } else if (step.requirement === 'profile_modal_close' && isProfileModalInDOM) {
        isBlocked = true;
        badgeText = "Close Profile Modal First";

    } else if (step.requirement === 'sessions_modal_open' && !isSessionsModalInDOM) {
        isBlocked = true;
        badgeText = "Click Shield Icon to Open Sessions";
        activeTitle = "Action Required: Open Sessions";
        activeDesc = "Please click the amber Shield icon for the selected account to open the Active Sessions list. The tour will automatically continue.";

    } else if (step.requirement === 'sessions_modal_close' && isSessionsModalInDOM) {
        isBlocked = true;
        badgeText = "Close Sessions Modal First";

    } else if (step.requirement === 'is_auto_responder' && !isAutoResponderPage) {
        isBlocked = true;
        activeTargetId = 'nav-auto-responder';
        activePlacement = 'bottom';
        activeTitle = "Action Required: Open Auto-Responder";
        activeDesc = "Please click the 'Auto-Responder' button in the navigation bar to proceed to the next area.";
        badgeText = "Click 'Auto-Responder'";

    } else if (step.requirement === 'is_analytics' && !isAnalyticsPage) {
        isBlocked = true;
        activeTargetId = 'nav-analytics';
        activePlacement = 'bottom';
        activeTitle = "Action Required: Go to Performance";
        activeDesc = "Please click the 'Performance' button in the navigation bar to proceed to the Dashboard.";
        badgeText = "Click 'Performance'";

    } else if (step.requirement === 'account_selected' && !isConvListInDOM) {
        // Chat list not visible → ask user to click an account card
        isBlocked = true;
        activeTargetId = 'sidebar-accounts';
        activePlacement = 'right';
        activeTitle = "Select an Account";
        activeDesc = "Click on an account card in the sidebar to load its chat history and unlock this part of the tour.";
        badgeText = "Click an Account Card";

    } else if (step.requirement === 'search_visible' && !isSearchInDOM) {
        // Search bar only renders when an account is selected
        isBlocked = true;
        activeTargetId = 'sidebar-accounts';
        activePlacement = 'right';
        activeTitle = "Select an Account First";
        activeDesc = "The search bar appears after you select an account. Click any account card in the sidebar to reveal it.";
        badgeText = "Click an Account Card";

    } else if (step.requirement === 'chat_selected' && !hasConversation) {
        // Chat window empty → redirect to conversation list
        isBlocked = true;
        activeTargetId = 'conversation-list';
        activePlacement = 'right';   // popup goes RIGHT into the chat area, not left into sidebar
        activeTitle = "Select a Conversation";
        activeDesc = "Click on any conversation in the list to open it, then we'll show you the live translation window.";
        badgeText = "Click a Conversation";

    } else if (step.requirement === 'crm_open' && !isCrmOpen) {
        // CRM not open yet → point to button, block
        isBlocked = true;
        badgeText = "Click the CRM Icon to Open";
        activeTitle = "Open the CRM Panel";
        activeDesc = "Click the CRM icon in the chat header to open the contact profile and unlock this tour step.";

    } else if (step.requirement === 'crm_open' && isCrmOpen) {
        // CRM IS open → highlight the whole container and explain everything
        activeTargetId = 'crm-modal-container';
        activePlacement = 'left';   // CRM panel is on the right side → popup goes left
        activeTitle = "Integrated Contact CRM";
        activeDesc = "This panel shows everything about your contact: name, username, phone, shipping address, order history, and your private notes. Fill in details to keep track of every business relationship. Click Next when done.";

    } else if (step.requirement === 'crm_close' && isCrmOpen) {
        // CRM still open on the "close" step → block, point to X button
        isBlocked = true;
        activeTargetId = 'crm-modal-close-btn';
        activePlacement = 'left';
        activeTitle = "Close the CRM Panel";
        activeDesc = "Please click the X button to close the CRM panel before continuing. The next section covers Marketing Automation.";
        badgeText = "Close CRM to Continue";

    } else if (step.requirement === 'ar_modal_open' && !isArModalInDOM) {
        isBlocked = true;
        badgeText = "Click 'Add Rule' to Open Editor";

    } else if (step.requirement === 'ar_modal_close' && isArModalInDOM) {
        isBlocked = true;
        badgeText = "Close the Rule Editor First";

    } else if (step.requirement === 'templates_menu_open' && !isTemplatesMenuOpen) {
        isBlocked = true;
        badgeText = "Click 'Templates' to Open Quick Menu";

    } else if (step.requirement === 'templates_modal_open' && !isTemplatesModalInDOM) {
        isBlocked = true;
        badgeText = "Click 'Manage' to Open Editor";

    } else if (step.requirement === 'templates_modal_close' && isTemplatesModalInDOM) {
        isBlocked = true;
        badgeText = "Close Template Manager First";

    } else if (step.requirement === 'schedule_modal_open' && !isScheduleModalInDOM) {
        isBlocked = true;
        badgeText = "Click Clock Icon to Open Scheduler";

    } else if (step.requirement === 'schedule_modal_close' && isScheduleModalInDOM) {
        isBlocked = true;
        badgeText = "Close Scheduler First";

    } else if (step.requirement === 'is_auto_responder' && !isAutoResponderPage) {
        isBlocked = true;
        badgeText = "Click 'Auto-Responder' in the Header";
    }

    // ── POSITION CALCULATION ──────────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return;

        const POPUP_W = 360;
        const POPUP_H = 290;
        const GAP = 18;   // gap between highlighted element and popup edge

        const calc = () => {
            const el = document.getElementById(activeTargetId);
            if (!el) {
                setTargetRect(null);
                setPopupPos({
                    top: window.innerHeight / 2 - POPUP_H / 2,
                    left: window.innerWidth / 2 - POPUP_W / 2
                });
                return;
            }

            // Auto-scroll the element into view if step requests it
            if (step.scrollIntoView) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }

            const r = el.getBoundingClientRect();
            setTargetRect(r);

            const vw = window.innerWidth;
            const vh = window.innerHeight;

            let top: number;
            let left: number;

            switch (activePlacement) {
                case 'right':
                    left = r.right + GAP;
                    top = r.top + r.height / 2 - POPUP_H / 2;
                    break;
                case 'left':
                    left = r.left - POPUP_W - GAP;
                    top = r.top + r.height / 2 - POPUP_H / 2;
                    break;
                case 'bottom':
                    top = r.bottom + GAP;
                    left = r.left + r.width / 2 - POPUP_W / 2;
                    break;
                case 'top':
                    top = r.top - POPUP_H - GAP;
                    left = r.left + r.width / 2 - POPUP_W / 2;
                    break;
            }

            // Guard: keep popup fully inside viewport
            if (left < 16) left = 16;
            if (left + POPUP_W > vw - 16) left = vw - POPUP_W - 16;
            if (top < 16) top = 16;
            if (top + POPUP_H > vh - 16) top = vh - POPUP_H - 16;

            // Final guard: if popup still overlaps the highlighted element, flip side
            const overlapH = left < r.right && left + POPUP_W > r.left;
            const overlapV = top < r.bottom && top + POPUP_H > r.top;
            if (overlapH && overlapV) {
                // Try flipping
                if (activePlacement === 'right') left = r.left - POPUP_W - GAP;
                if (activePlacement === 'left') left = r.right + GAP;
                if (activePlacement === 'top') top = r.bottom + GAP;
                if (activePlacement === 'bottom') top = r.top - POPUP_H - GAP;
                // Clamp again
                if (left < 16) left = 16;
                if (left + POPUP_W > vw - 16) left = vw - POPUP_W - 16;
                if (top < 16) top = 16;
                if (top + POPUP_H > vh - 16) top = vh - POPUP_H - 16;
            }

            setPopupPos({ top, left });
        };

        const interval = setInterval(calc, 250);
        calc();
        window.addEventListener('resize', calc);
        window.addEventListener('scroll', calc, true);
        return () => {
            clearInterval(interval);
            window.removeEventListener('resize', calc);
            window.removeEventListener('scroll', calc, true);
        };
    }, [currentStep, isOpen, activeTargetId, activePlacement, filteredSteps]);

    // ── AUTO-ADVANCE: react to DOM changes ────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return;

        const tid = step.targetId;

        // Modal opened → auto-advance past Add Account step
        if (isModalInDOM && tid === 'add-account-btn') {
            onStepChange(currentStep + 1);
        }

        // AR modal opened → advance into form sections
        if (isArModalInDOM && tid === 'ar-add-rule-btn') onStepChange(currentStep + 1);
        // AR modal closed → advance past close step
        if (!isArModalInDOM && tid === 'ar-modal-close') onStepChange(currentStep + 1);

        // Profile Modal
        if (isProfileModalInDOM && tid === 'account-profile-btn') onStepChange(currentStep + 1);
        if (!isProfileModalInDOM && tid === 'profile-modal-close-btn') onStepChange(currentStep + 1);

        // Sessions Modal
        if (isSessionsModalInDOM && tid === 'account-sessions-btn') onStepChange(currentStep + 1);
        if (!isSessionsModalInDOM && tid === 'sessions-modal-close-btn') onStepChange(currentStep + 1);

        // Advance past quick templates if clicked
        if (isTemplatesMenuOpen && tid === 'chat-templates-btn') onStepChange(currentStep + 1);

        // Modals opened/closed → advance
        if (isTemplatesModalInDOM && tid === 'chat-templates-manage-btn') onStepChange(currentStep + 1);
        if (!isTemplatesModalInDOM && tid === 'templates-modal-close-btn') onStepChange(currentStep + 1);

        if (isScheduleModalInDOM && tid === 'chat-schedule-btn') onStepChange(currentStep + 1);
        if (!isScheduleModalInDOM && tid === 'schedule-modal-close-btn') onStepChange(currentStep + 1);

        // Navigated to auto-responder page
        if (isAutoResponderPage && tid === 'nav-auto-responder') onStepChange(currentStep + 1);

        // Navigated to analytics page
        if (isAnalyticsPage && tid === 'nav-analytics') onStepChange(currentStep + 1);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, isModalInDOM, isArModalInDOM, isCrmOpen, isProfileModalInDOM, isSessionsModalInDOM, isAutoResponderPage, isAnalyticsPage, isTemplatesMenuOpen, isTemplatesModalInDOM, isScheduleModalInDOM]);

    if (!isOpen && !showTourEndedNotice) return null;

    // ── TOUR-ENDED NOTICE ─────────────────────────────────────────────────────
    if (showTourEndedNotice) {
        return (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center font-sans">
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowTourEndedNotice(false)}
                />
                {/* Card */}
                <div className="relative z-10 w-[420px] bg-white dark:bg-[#1c2330] rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
                    {/* Top accent bar */}
                    <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-500" />

                    <div className="p-8">
                        {/* Icon */}
                        <div className="flex justify-center mb-5">
                            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shadow-inner">
                                <AlertTriangle className="w-8 h-8 text-amber-500" />
                            </div>
                        </div>

                        {/* Text */}
                        <div className="text-center mb-7">
                            <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-3 tracking-tight">
                                Tour Ended
                            </h2>
                            <p className="text-[13.5px] text-gray-500 dark:text-gray-400 leading-relaxed">
                                The setup was closed before an account was added.
                                <br /><br />
                                Please <span className="font-bold text-blue-600 dark:text-blue-400">add a Telegram account</span> first using the{' '}
                                <span className="font-bold text-gray-700 dark:text-gray-300">'Add Account'</span> button,
                                then restart the tour to explore all features.
                            </p>
                        </div>

                        {/* Buttons */}
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => setShowTourEndedNotice(false)}
                                className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-2xl font-black text-sm transition-all shadow-lg shadow-blue-600/30"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Got it — I'll Add an Account
                            </button>
                            <button
                                onClick={() => setShowTourEndedNotice(false)}
                                className="w-full px-6 py-3 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm font-semibold transition-colors"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── NAVIGATION ───────────────────────────────────────────────────────────
    const handleNext = () => {
        if (isBlocked) return;

        // If modal closed mid-setup without adding account → terminate
        if (!isModalInDOM && !hasAccounts && [2, 3, 4, 5, 6].includes(currentStep)) {
            onClose();
            onStepChange(0);
            setShowTourEndedNotice(true);
            return;
        }

        if (currentStep < filteredSteps.length - 1) {
            onStepChange(currentStep + 1);
        } else {
            onClose();
            onStepChange(0);
        }
    };

    const handlePrev = () => {
        // If we skipped setup, Back from step 7 goes to step 1
        if (currentStep === 7 && !isModalInDOM && hasAccounts) {
            onStepChange(1);
            return;
        }
        if (currentStep > 0) onStepChange(currentStep - 1);
    };

    // ── RENDER ────────────────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-[10000] pointer-events-none overflow-hidden font-sans select-none antialiased">
            {/* Dark overlay */}
            <div className="absolute inset-0 bg-black/50 pointer-events-none" />

            {/* Highlighted element cutout */}
            {targetRect && (
                <div
                    className="absolute border-2 border-blue-500 rounded-xl z-[10001] shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                    style={{
                        top: targetRect.top - 5,
                        left: targetRect.left - 5,
                        width: targetRect.width + 10,
                        height: targetRect.height + 10,
                        pointerEvents: 'none'
                    }}
                >
                    {/* Action badge */}
                    {badgeText && (
                        <div className="absolute -top-11 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[9px] font-black px-3 py-1.5 rounded-full shadow-xl animate-bounce uppercase tracking-widest whitespace-nowrap border border-blue-400/60 flex items-center gap-1.5">
                            <MousePointer2 className="w-3 h-3 fill-white flex-shrink-0" />
                            <span>{badgeText}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Tour popup card */}
            <div
                className="absolute w-[360px] bg-white dark:bg-[#1c2330] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl p-6 pointer-events-auto z-[10002] transition-all duration-300"
                style={{ top: popupPos.top, left: popupPos.left }}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100 dark:border-white/10">
                    <div className="flex items-center gap-2.5">
                        <div className="bg-blue-500/10 p-2 rounded-xl">
                            <HelpCircle className="w-5 h-5 text-blue-500" />
                        </div>
                        <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                            Step {currentStep + 1} / {filteredSteps.length}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex gap-3 mb-6 min-h-[72px]">
                    <div className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${isBlocked ? 'bg-amber-500 animate-pulse' : 'bg-blue-500'}`} />
                    <div className="flex-1 min-w-0">
                        <h3 className={`text-[17px] font-black leading-tight mb-1.5 tracking-tight ${isBlocked ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
                            {activeTitle}
                        </h3>
                        <p className={`text-[12.5px] leading-relaxed ${isBlocked ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400'}`}>
                            {activeDesc}
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-white/10">
                    {/* Progress bar */}
                    <div className="flex-1 mr-4 h-1 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-500"
                            style={{ width: `${((currentStep + 1) / filteredSteps.length) * 100}%` }}
                        />
                    </div>

                    {/* Buttons */}
                    <div className="flex items-center gap-2">
                        {currentStep > 0 && (
                            <button
                                onClick={handlePrev}
                                className="flex items-center gap-1 px-3 py-1.5 text-[9px] uppercase tracking-widest font-black text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                                <ArrowLeft className="w-3 h-3" />
                                Back
                            </button>
                        )}
                        <button
                            onClick={handleNext}
                            disabled={isBlocked}
                            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] uppercase tracking-wider font-black transition-all ${isBlocked
                                ? 'bg-gray-100 dark:bg-white/5 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30 active:scale-95'
                                }`}
                        >
                            {currentStep === filteredSteps.length - 1 ? 'Finish' : 'Next'}
                            <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
