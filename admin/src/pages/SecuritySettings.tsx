/**
 * ADMIN SECURITY SETTINGS PAGE
 * 
 * Manages system-wide security features, primarily message encryption.
 * Features:
 * 1. Toggle AES-256-GCM encryption for all incoming/outgoing messages
 * 2. Monitor encryption statistics (Total messages vs Encrypted messages)
 * 3. View encryption timeline (When it was enabled/disabled)
 * 4. Verification of encryption service availability
 */
import { useState, useEffect } from 'react';
import { Shield, Lock, Unlock, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { adminApi } from '../services/api';

interface EncryptionSettings {
  encryption_enabled: boolean;
  encryption_enabled_at: string | null;
  encryption_disabled_at: string | null;
  updated_at: string;
  encryption_service_available: boolean;
  total_messages: number;
  encrypted_messages: number;
}

export default function SecuritySettings() {
  const [settings, setSettings] = useState<EncryptionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApi.getEncryptionSettings();
      setSettings(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load encryption settings');
    } finally {
      setLoading(false);
    }
  };

  const toggleEncryption = async () => {
    if (!settings) return;

    const newState = !settings.encryption_enabled;
    const confirmMessage = newState
      ? 'Enable encryption? All new messages will be encrypted with AES-256.'
      : 'Disable encryption? New messages will be stored in plain text. Existing encrypted messages will remain encrypted.';

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setUpdating(true);
      setError(null);
      setSuccess(null);

      await adminApi.updateEncryptionSettings({ encryption_enabled: newState });

      setSuccess(
        newState
          ? 'Encryption enabled successfully. All new messages will be encrypted.'
          : 'Encryption disabled successfully. New messages will be stored in plain text.'
      );

      // Refresh settings
      await fetchSettings();

      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update encryption settings');
    } finally {
      setUpdating(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const getEncryptionPercentage = () => {
    if (!settings || settings.total_messages === 0) return 0;
    return Math.round((settings.encrypted_messages / settings.total_messages) * 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading security settings...</div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Failed to load settings</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Shield className="w-7 h-7" />
          Security Settings
        </h1>
        <p className="text-gray-600 mt-1">
          Manage message encryption and security features
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-800 font-medium">Error</p>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Success Alert */}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-green-800 font-medium">Success</p>
            <p className="text-green-700 text-sm">{success}</p>
          </div>
        </div>
      )}

      {/* Service Status Warning */}
      {!settings.encryption_service_available && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-yellow-800 font-medium">Encryption Service Unavailable</p>
            <p className="text-yellow-700 text-sm">
              The AES encryption key is not configured. Please set the AES_ENCRYPTION_KEY in your .env file to enable encryption.
            </p>
          </div>
        </div>
      )}

      {/* Encryption Toggle Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              {settings.encryption_enabled ? (
                <Lock className="w-6 h-6 text-green-600" />
              ) : (
                <Unlock className="w-6 h-6 text-gray-400" />
              )}
              <h2 className="text-xl font-semibold text-gray-900">
                Message Encryption
              </h2>
            </div>
            <p className="text-gray-600 mb-4">
              {settings.encryption_enabled
                ? 'All new messages are being encrypted with AES-256-GCM before storage.'
                : 'New messages are stored in plain text. Enable encryption to secure message content.'}
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span className={`px-3 py-1 rounded-full font-medium ${settings.encryption_enabled
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-700'
                }`}>
                {settings.encryption_enabled ? 'Enabled' : 'Disabled'}
              </span>
              {settings.encryption_service_available && (
                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                  Service Ready
                </span>
              )}
            </div>
          </div>
          <button
            onClick={toggleEncryption}
            disabled={updating || !settings.encryption_service_available}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${settings.encryption_enabled
                ? 'bg-red-600 hover:bg-red-700 text-white disabled:bg-red-300'
                : 'bg-green-600 hover:bg-green-700 text-white disabled:bg-green-300'
              } disabled:cursor-not-allowed`}
          >
            {updating ? (
              'Updating...'
            ) : settings.encryption_enabled ? (
              'Disable Encryption'
            ) : (
              'Enable Encryption'
            )}
          </button>
        </div>
      </div>

      {/* Statistics Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Encryption Statistics</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Total Messages</div>
            <div className="text-2xl font-bold text-gray-900">
              {settings.total_messages.toLocaleString()}
            </div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Encrypted Messages</div>
            <div className="text-2xl font-bold text-green-600">
              {settings.encrypted_messages.toLocaleString()}
            </div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Encryption Rate</div>
            <div className="text-2xl font-bold text-blue-600">
              {getEncryptionPercentage()}%
            </div>
          </div>
        </div>
      </div>

      {/* Timeline Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Encryption Timeline</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <span className="text-gray-600">Last Updated</span>
            <span className="font-medium text-gray-900">{formatDate(settings.updated_at)}</span>
          </div>
          {settings.encryption_enabled_at && (
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Encryption Enabled At</span>
              <span className="font-medium text-green-600">{formatDate(settings.encryption_enabled_at)}</span>
            </div>
          )}
          {settings.encryption_disabled_at && (
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Encryption Disabled At</span>
              <span className="font-medium text-red-600">{formatDate(settings.encryption_disabled_at)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Information Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-blue-900 mb-2">How Encryption Works</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Messages are encrypted using AES-256-GCM (Advanced Encryption Standard)</li>
              <li>• Only message content (original and translated text) is encrypted</li>
              <li>• Encryption is applied before storing messages in the database</li>
              <li>• Messages are automatically decrypted when retrieved for display</li>
              <li>• Existing messages are not affected when toggling encryption on/off</li>
              <li>• The encryption key must be kept secure and backed up</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
