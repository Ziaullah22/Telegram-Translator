import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { X, Loader, AlertCircle } from 'lucide-react';
import { telegramAPI } from '../../services/api';

interface AddAccountFormData {
  displayName: string;
  sourceLanguage: string;
  targetLanguage: string;
}

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddAccountModal({ isOpen, onClose, onSuccess }: AddAccountModalProps) {
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tdataFile, setTdataFile] = useState<FileList | null>(null);
  const [validationInfo, setValidationInfo] = useState<{
    accountName: string;
    exists: boolean;
    isActive: boolean;
    currentDisplayName?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddAccountFormData>();

  // Reset all state when modal opens
  useEffect(() => {
    if (isOpen) {
      reset();
      setTdataFile(null);
      setError(null);
      setValidationInfo(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen, reset]);

  const handleFileChange = async (files: FileList | null) => {
    setTdataFile(files);
    setError(null);
    setValidationInfo(null);

    if (!files || files.length === 0) {
      return;
    }

    setValidating(true);
    try {
      const result = await telegramAPI.validateTData(files[0]);
      setValidationInfo({
        accountName: result.account_name,
        exists: result.exists,
        isActive: result.is_active,
        currentDisplayName: result.current_display_name,
      });

      // Show warning if account exists and is active
      if (result.exists && result.is_active) {
        setError(`Account "${result.account_name}" already exists with display name "${result.current_display_name}". Please use a different TData file.`);
        setTdataFile(null);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Invalid TData archive';
      setError(errorMessage);
      setTdataFile(null);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setValidating(false);
    }
  };

  const onSubmit = async (data: AddAccountFormData) => {
    if (!tdataFile || tdataFile.length === 0) {
      setError('Please select a TData file');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('displayName', data.displayName);
      formData.append('sourceLanguage', data.sourceLanguage);
      formData.append('targetLanguage', data.targetLanguage);
      formData.append('tdata', tdataFile[0]);

      await telegramAPI.addAccount(formData);

      reset();
      setTdataFile(null);
      setValidationInfo(null);
      setError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error adding account:', err);
      const errorMessage = err.response?.data?.detail || err.response?.data?.error || 'Failed to add account';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading && !validating) {
      reset();
      setTdataFile(null);
      setError(null);
      setValidationInfo(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[99999] animate-fade-in overflow-y-auto" onClick={handleClose}>
      <div className="bg-white dark:bg-[#212121] rounded-xl max-w-md w-full shadow-2xl overflow-hidden animate-scale-in my-auto mt-16 md:mt-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-white/5">
          <h3 className="text-[19px] font-medium text-gray-900 dark:text-white">Add Telegram Account</h3>
          <button
            id="modal-close-btn"
            onClick={handleClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg flex items-center space-x-2 text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[11px] text-gray-400 font-medium ml-1 uppercase tracking-wider">
              TData Archive (Zip/Rar)
            </label>
            <div id="tdata-upload-box" className="relative">
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => handleFileChange(e.target.files)}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-gray-900 dark:text-white file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-[#3390ec]/20 file:text-[#3390ec] file:text-[11px] file:font-medium transition-all focus:ring-1 focus:ring-[#3390ec] disabled:opacity-50 text-sm"
                accept=".zip,.rar"
                disabled={loading || validating}
              />
              {validating && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader className="w-4 h-4 animate-spin text-[#3390ec]" />
                </div>
              )}
            </div>
            {validationInfo && !error && (
              <p className="text-[11px] font-medium text-green-500 ml-1">
                ✓ Session found: {validationInfo.accountName}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-gray-400 font-medium ml-1 uppercase tracking-wider">
              Account Display Name
            </label>
            <input
              {...register('displayName', { required: 'Display name is required' })}
              id="display-name-input"
              type="text"
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#3390ec] text-sm transition-all"
              placeholder="e.g., Marketing Team"
              disabled={loading}
            />
            {errors.displayName && (
              <p className="text-[11px] text-red-500 ml-1">{errors.displayName.message}</p>
            )}
          </div>

          <div id="language-selection-container" className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] text-gray-400 font-medium ml-1 uppercase tracking-wider">
                Source
              </label>
              <select
                {...register('sourceLanguage')}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#3390ec] text-sm appearance-none cursor-pointer"
                disabled={loading}
              >
                <option value="auto">Auto-detect</option>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="ja">Japanese</option>
                <option value="ru">Russian</option>
                <option value="zh-cn">Chinese</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-gray-400 font-medium ml-1 uppercase tracking-wider">
                Target
              </label>
              <select
                {...register('targetLanguage')}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#3390ec] text-sm appearance-none cursor-pointer"
                disabled={loading}
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="ja">Japanese</option>
                <option value="ru">Russian</option>
                <option value="zh-cn">Chinese</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="modal-add-btn"
              disabled={loading}
              className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide flex items-center justify-center min-w-[120px]"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-[#3390ec]/30 border-t-[#3390ec] rounded-full animate-spin" />
              ) : (
                "Connect Account"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}