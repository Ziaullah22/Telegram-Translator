import { X, AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'info' | 'warning';
}

export default function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    type = 'danger'
}: ConfirmModalProps) {
    if (!isOpen) return null;

    const getColors = () => {
        switch (type) {
            case 'danger':
                return {
                    bg: 'bg-red-50 dark:bg-red-900/20',
                    icon: 'text-red-600 dark:text-red-400',
                    button: 'bg-red-600 hover:bg-red-700 text-white',
                    border: 'border-red-100 dark:border-red-900/30'
                };
            case 'warning':
                return {
                    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
                    icon: 'text-yellow-600 dark:text-yellow-400',
                    button: 'bg-yellow-600 hover:bg-yellow-700 text-white',
                    border: 'border-yellow-100 dark:border-yellow-900/30'
                };
            default:
                return {
                    bg: 'bg-blue-50 dark:bg-blue-900/20',
                    icon: 'text-blue-600 dark:text-blue-400',
                    button: 'bg-blue-600 hover:bg-blue-700 text-white',
                    border: 'border-blue-100 dark:border-blue-900/30'
                };
        }
    };

    const colors = getColors();

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="relative w-full max-w-sm overflow-hidden bg-white dark:bg-[#1c242f] border border-gray-100 dark:border-gray-800 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header/Banner */}
                <div className={`p-6 ${colors.bg} flex flex-col items-center text-center space-y-3`}>
                    <div className={`p-3 rounded-full bg-white dark:bg-gray-800 shadow-md ${colors.icon}`}>
                        <AlertTriangle className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                        {title}
                    </h3>
                </div>

                {/* Content */}
                <div className="p-6 text-center">
                    <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                        {message}
                    </p>
                </div>

                {/* Actions */}
                <div className="p-6 pt-0 flex flex-col space-y-2">
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={`w-full py-3 px-4 rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-black/5 ${colors.button}`}
                    >
                        {confirmText}
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full py-3 px-4 rounded-xl font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all active:scale-95 border border-gray-100 dark:border-gray-800"
                    >
                        {cancelText}
                    </button>
                </div>

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
