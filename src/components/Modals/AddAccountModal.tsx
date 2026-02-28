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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Add Telegram Account</h2>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-gray-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-3 text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              TData File (Zip/Rar) *
            </label>
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => handleFileChange(e.target.files)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-sm hover:file:bg-blue-700 transition-colors"
                accept=".zip,.rar"
                disabled={loading || validating}
              />
              {validating && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader className="w-5 h-5 animate-spin text-blue-400" />
                </div>
              )}
            </div>
            {validating && (
              <p className="mt-1 text-xs text-blue-400">
                Validating TData archive...
              </p>
            )}
            {validationInfo && !error && (
              <p className="mt-1 text-xs text-green-400">
                ✓ Valid TData archive for account: {validationInfo.accountName}
              </p>
            )}
            {!validating && !validationInfo && !error && (
              <p className="mt-1 text-xs text-gray-400">
                Upload your Telegram session file (Zip or Rar format)
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Display Name *
            </label>
            <input
              {...register('displayName', { required: 'Display name is required' })}
              type="text"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              placeholder="e.g., Work Account"
              disabled={loading}
            />
            {errors.displayName && (
              <p className="mt-1 text-sm text-red-400">{errors.displayName.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Source Language
              </label>
              <select
                {...register('sourceLanguage')}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
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

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Target Language
              </label>
              <select
                {...register('targetLanguage')}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
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
              className="flex-1 px-4 py-2 text-gray-300 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Add & Connect</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}