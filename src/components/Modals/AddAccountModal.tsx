import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { X, Upload, Loader, AlertCircle } from 'lucide-react';
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60] transition-opacity duration-300">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden transform transition-all animate-scale-in">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
          <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Add Telegram Account</h2>
          <button
            id="modal-close-btn"
            onClick={handleClose}
            disabled={loading}
            className="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-gray-700 p-2 rounded-xl transition-all duration-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-8 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-2xl flex items-center space-x-3 text-red-600 dark:text-red-400 animate-shake">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-bold">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
              TData Archive (Zip/Rar)
            </label>
            <div id="tdata-upload-box" className="relative group">
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => handleFileChange(e.target.files)}
                className="w-full px-4 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-blue-600 file:text-white file:text-[10px] file:font-black file:uppercase file:tracking-widest hover:file:bg-blue-700 transition-all focus:ring-4 focus:ring-blue-500/10 disabled:opacity-50"
                accept=".zip,.rar"
                disabled={loading || validating}
              />
              {validating && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Loader className="w-5 h-5 animate-spin text-blue-500" />
                </div>
              )}
            </div>
            {validating && (
              <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">
                Validating session...
              </p>
            )}
            {validationInfo && !error && (
              <p className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-widest flex items-center">
                <span className="mr-1.5 text-lg">✓</span> Session found: {validationInfo.accountName}
              </p>
            )}
            {!validating && !validationInfo && !error && (
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                Upload your Telegram TData folder as a zip archive
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
              Account Display Name
            </label>
            <input
              {...register('displayName', { required: 'Display name is required' })}
              id="display-name-input"
              type="text"
              className="w-full px-6 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-sm"
              placeholder="e.g., Marketing Team"
              disabled={loading}
            />
            {errors.displayName && (
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest ml-1">{errors.displayName.message}</p>
            )}
          </div>

          <div id="language-selection-container" className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
                Source
              </label>
              <select
                {...register('sourceLanguage')}
                className="w-full px-4 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-sm appearance-none cursor-pointer"
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

            <div className="space-y-2">
              <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
                Target
              </label>
              <select
                {...register('targetLanguage')}
                className="w-full px-4 py-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl text-gray-900 dark:text-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-sm appearance-none cursor-pointer"
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

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-4 py-4 text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="modal-add-btn"
              disabled={loading}
              className="flex-1 px-4 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-2xl shadow-xl shadow-blue-600/30 transition-all font-black uppercase tracking-widest text-[10px] flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  <span>Connect Account</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}