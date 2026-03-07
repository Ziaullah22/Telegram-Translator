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

    const isDanger = type === 'danger';

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-[#212121] rounded-xl shadow-xl w-full max-w-[320px] overflow-hidden animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6">
                    <h3 className="text-[19px] font-medium text-gray-900 dark:text-white mb-2">
                        {title}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300 text-[15px] mb-5">
                        {message}
                    </p>

                    <div className="flex items-center justify-end space-x-2 mt-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={() => {
                                onConfirm();
                                onClose();
                            }}
                            className={`px-4 py-2 ${isDanger ? 'text-[#e53935] hover:bg-[#e53935]/10' : 'text-[#3390ec] hover:bg-[#3390ec]/10'} font-medium rounded-md transition-colors uppercase text-sm tracking-wide`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
