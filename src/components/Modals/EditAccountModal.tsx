import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Loader, AlertCircle, Save } from 'lucide-react';
import { telegramAPI } from '../../services/api';
import type { TelegramAccount } from '../../types';

interface EditAccountFormData {
  displayName: string;
  sourceLanguage: string;
  targetLanguage: string;
}

interface EditAccountModalProps {
  isOpen: boolean;
  account: TelegramAccount | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditAccountModal({ isOpen, account, onClose, onSuccess }: EditAccountModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<EditAccountFormData>({
    values: {
      displayName: account?.displayName || account?.accountName || '',
      sourceLanguage: account?.sourceLanguage || 'auto',
      targetLanguage: account?.targetLanguage || 'en',
    },
  });

  const onSubmit = async (data: EditAccountFormData) => {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      await telegramAPI.updateAccount(account.id, {
        displayName: data.displayName,
        sourceLanguage: data.sourceLanguage,
        targetLanguage: data.targetLanguage,
      });
      onSuccess();
      onClose();
      reset();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update account');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      reset();
      setError(null);
      onClose();
    }
  };

  if (!isOpen || !account) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl max-w-md w-full shadow-2xl transition-colors duration-300">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Account</h2>
          <button onClick={handleClose} disabled={loading} className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-3 text-red-500 dark:text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Display Name</label>
            <input
              {...register('displayName', { required: 'Display name is required' })}
              type="text"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
              placeholder="e.g., Work Account"
              disabled={loading}
            />
            {errors.displayName && <p className="mt-1 text-sm text-red-500 dark:text-red-400">{errors.displayName.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Source Language</label>
              <select
                {...register('sourceLanguage')}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Target Language</label>
              <select
                {...register('targetLanguage')}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
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
            <button type="button" onClick={handleClose} disabled={loading} className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors font-medium">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center space-x-2 font-medium shadow-lg shadow-blue-600/20">
              {loading ? (<><Loader className="w-4 h-4 animate-spin" /><span>Saving...</span></>) : (<><Save className="w-4 h-4" /><span>Save</span></>)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


