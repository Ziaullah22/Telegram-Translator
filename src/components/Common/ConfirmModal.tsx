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
            bg: 'bg-red-50 dark:bg-red-900/20',
            text: 'text-red-600 dark:text-red-400',
            iconBg: 'bg-red-100 dark:bg-red-900/40',
            btnBg: 'bg-red-600 hover:bg-red-700 shadow-red-600/25',
            icon: <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
        },
        warning: {
            bg: 'bg-orange-50 dark:bg-orange-900/20',
            text: 'text-orange-600 dark:text-orange-400',
            iconBg: 'bg-orange-100 dark:bg-orange-900/40',
            btnBg: 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/25',
            icon: <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
        },
        info: {
            bg: 'bg-blue-50 dark:bg-blue-900/20',
            text: 'text-blue-600 dark:text-blue-400',
            iconBg: 'bg-blue-100 dark:bg-blue-900/40',
            btnBg: 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/25',
            icon: <Info className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        },
        success: {
            bg: 'bg-green-50 dark:bg-green-900/20',
            text: 'text-green-600 dark:text-green-400',
            iconBg: 'bg-green-100 dark:bg-green-900/40',
            btnBg: 'bg-green-600 hover:bg-green-700 shadow-green-600/25',
            icon: <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
        }
    };

    const currentStyle = styles[type];

    return (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
            <div 
                className="bg-white dark:bg-[#1a222c] w-full max-w-md rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-white/5 overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header/Banner */}
                <div className={`p-8 pb-4 flex flex-col items-center text-center space-y-4`}>
                    <div className={`w-16 h-16 rounded-3xl ${currentStyle.iconBg} flex items-center justify-center`}>
                        {currentStyle.icon}
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">{title}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                            {description}
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="p-8 pt-6 flex space-x-3">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="flex-1 px-6 py-4 rounded-2xl bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-gray-400 font-black uppercase tracking-widest text-xs hover:bg-gray-100 dark:hover:bg-white/10 transition-all disabled:opacity-50"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={`flex-[1.5] px-6 py-4 rounded-2xl ${currentStyle.btnBg} text-white font-black uppercase tracking-widest text-xs transition-all shadow-lg disabled:opacity-50 flex items-center justify-center`}
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
