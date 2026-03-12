import React from 'react';
import { AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

export type ModalType = 'danger' | 'warning' | 'info' | 'success';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    type?: ModalType;
    isLoading?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    type = 'warning',
    isLoading = false
}) => {
    if (!isOpen) return null;

    const styles: Record<ModalType, { bg: string, text: string, iconBg: string, btnBg: string, icon: React.ReactNode }> = {
        danger: {
            bg: 'bg-red-50 dark:bg-red-900/10',
            text: 'text-red-500',
            iconBg: 'bg-red-100 dark:bg-red-500/10',
            btnBg: 'bg-red-500 hover:bg-red-600 shadow-red-500/20',
            icon: <AlertTriangle className="w-6 h-6 text-red-500" />
        },
        warning: {
            bg: 'bg-orange-50 dark:bg-orange-900/10',
            text: 'text-orange-500',
            iconBg: 'bg-orange-100 dark:bg-orange-500/10',
            btnBg: 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/20',
            icon: <AlertTriangle className="w-6 h-6 text-orange-500" />
        },
        info: {
            bg: 'bg-blue-50 dark:bg-blue-900/10',
            text: 'text-blue-500',
            iconBg: 'bg-blue-100 dark:bg-blue-500/10',
            btnBg: 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20',
            icon: <Info className="w-6 h-6 text-blue-500" />
        },
        success: {
            bg: 'bg-green-50 dark:bg-green-900/10',
            text: 'text-green-500',
            iconBg: 'bg-green-100 dark:bg-green-500/10',
            btnBg: 'bg-green-500 hover:bg-green-600 shadow-green-500/20',
            icon: <CheckCircle2 className="w-6 h-6 text-green-500" />
        }
    };

    const currentStyle = styles[type];

    return (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
            <div 
                className="bg-white dark:bg-[#1a222c] w-full max-w-md rounded-3xl shadow-2xl border border-gray-100 dark:border-white/5 overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header Section */}
                <div className="p-8 pb-4 flex flex-col items-center text-center">
                    <div className={`w-16 h-16 rounded-2xl ${currentStyle.iconBg} flex items-center justify-center mb-4`}>
                        {currentStyle.icon}
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-none mb-3">{title}</h3>
                        <p className="text-sm font-bold text-gray-500 dark:text-gray-400 leading-relaxed">
                            {description}
                        </p>
                    </div>
                </div>

                {/* Action Section */}
                <div className="p-8 pt-4 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="flex-1 px-6 py-4 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 font-black uppercase tracking-widest text-xs hover:bg-gray-200 dark:hover:bg-white/10 transition-all disabled:opacity-50"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={`flex-[1.5] px-6 py-4 rounded-xl ${currentStyle.btnBg} text-white font-black uppercase tracking-widest text-xs transition-all shadow-xl disabled:opacity-50 flex items-center justify-center`}
                    >
                        {isLoading ? (
                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                            confirmText
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
