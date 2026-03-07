import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, AlertCircle } from 'lucide-react';
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
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={handleClose}>
      <div className="bg-white dark:bg-[#212121] rounded-xl max-w-md w-full shadow-xl overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-white/5">
          <h3 className="text-[19px] font-medium text-gray-900 dark:text-white">Edit Account</h3>
          <button onClick={handleClose} disabled={loading} className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-full transition-colors">
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
            <label className="text-[11px] text-gray-400 font-medium ml-1 uppercase tracking-wider">Display Name</label>
            <input
              {...register('displayName', { required: 'Display name is required' })}
              type="text"
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#3390ec] text-sm transition-all"
              placeholder="e.g., Work Account"
              disabled={loading}
            />
            {errors.displayName && <p className="mt-1 text-xs text-red-500">{errors.displayName.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] text-gray-400 font-medium ml-1 uppercase tracking-wider">Source</label>
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
              <label className="text-[11px] text-gray-400 font-medium ml-1 uppercase tracking-wider">Target</label>
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
              disabled={loading}
              className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide flex items-center justify-center min-w-[120px]"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-[#3390ec]/30 border-t-[#3390ec] rounded-full animate-spin" />
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


