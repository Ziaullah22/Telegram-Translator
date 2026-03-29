import { useState, useEffect, useRef } from 'react';
import { X, Camera, Loader2, Check, Bell, BellOff } from 'lucide-react';
import { telegramAPI } from '../../services/api';
import type { TelegramAccount } from '../../types';

interface ProfileData {
    id: number;
    first_name: string;
    last_name: string;
    username: string;
    phone: string;
    bio: string;
    photo_url: string | null;
    phone_privacy?: 'everybody' | 'contacts' | 'nobody';
}

interface ProfileModalProps {
    isOpen: boolean;
    account: TelegramAccount | null;
    onClose: () => void;
    onAccountUpdate?: (updated: TelegramAccount) => void;
}

export default function ProfileModal({ isOpen, account, onClose, onAccountUpdate }: ProfileModalProps) {
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'info' | 'privacy' | '2fa' | 'notifications'>('info');

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [bio, setBio] = useState('');
    const [phonePrivacy, setPhonePrivacy] = useState<'everybody' | 'contacts' | 'nobody'>('contacts');

    const [currentPass, setCurrentPass] = useState('');
    const [newPass, setNewPass] = useState('');
    const [confirmPass, setConfirmPass] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && account) {
            loadProfile();
        }
    }, [isOpen, account]);

    const loadProfile = async () => {
        if (!account) return;
        setLoading(true);
        setError('');
        try {
            const data = await telegramAPI.getProfile(account.id);
            setProfile(data);
            setFirstName(data.first_name || '');
            setLastName(data.last_name || '');
            setBio(data.bio || '');
            if (data.phone_privacy) {
                setPhonePrivacy(data.phone_privacy);
            }
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Failed to load profile. Make sure account is connected.');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveInfo = async () => {
        if (!account) return;
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            await telegramAPI.updateProfile(account.id, { first_name: firstName, last_name: lastName, bio });
            setSuccess('Profile updated successfully!');
            setTimeout(() => setSuccess(''), 3000);
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Failed to update profile.');
        } finally {
            setSaving(false);
        }
    };

    const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !account) return;
        setSaving(true);
        setError('');
        try {
            await telegramAPI.uploadProfilePhoto(account.id, file);
            setSuccess('Profile photo updated!');
            setTimeout(() => setSuccess(''), 3000);
            loadProfile();
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Failed to upload photo.');
        } finally {
            setSaving(false);
        }
    };

    const handleSavePrivacy = async () => {
        if (!account) return;
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            await telegramAPI.setPhonePrivacy(account.id, phonePrivacy);
            setSuccess('Privacy settings updated!');
            setTimeout(() => setSuccess(''), 3000);
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Failed to update privacy.');
        } finally {
            setSaving(false);
        }
    };

    const handleChange2FA = async () => {
        if (!account) return;
        if (newPass !== confirmPass) {
            setError('New passwords do not match.');
            return;
        }
        if (!newPass) {
            setError('New password cannot be empty.');
            return;
        }
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            await telegramAPI.change2FA(account.id, currentPass, newPass);
            setSuccess('2FA password updated successfully!');
            setCurrentPass('');
            setNewPass('');
            setConfirmPass('');
            setTimeout(() => setSuccess(''), 3000);
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Failed to change 2FA password.');
        } finally {
            setSaving(false);
        }
    };

    const toggleNotification = async () => {
        if (!account) return;
        setSaving(true);
        setError('');
        try {
            const updated = await telegramAPI.updateAccount(account.id, {
                notifications_enabled: !account.notificationsEnabled
            });
            if (onAccountUpdate) onAccountUpdate(updated);
            setSuccess(updated.notificationsEnabled ? 'Notifications enabled' : 'Notifications muted');
            setTimeout(() => setSuccess(''), 3000);
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Failed to toggle notifications.');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 animate-fade-in" onClick={onClose}>
            <div id="profile-modal-container" className="bg-white dark:bg-[#212121] rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden animate-scale-in flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-white/5">
                    <h3 className="text-[19px] font-medium text-gray-900 dark:text-white">
                        Telegram Profile
                    </h3>
                    <button id="profile-modal-close-btn" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex px-2 border-b border-gray-100 dark:border-white/5 flex-shrink-0">
                    {(['info', 'privacy', '2fa', 'notifications'] as const).map(tab => (
                        <button
                            key={tab}
                            id={`profile-tab-${tab}`}
                            onClick={() => { setActiveTab(tab); setError(''); setSuccess(''); }}
                            className={`flex-1 py-3.5 text-[14px] font-medium transition-all relative ${activeTab === tab
                                ? 'text-[#3390ec]'
                                : 'text-gray-500 hover:text-gray-700 dark:hover:text-white'
                                }`}
                        >
                            {tab === 'info' ? 'Info' : tab === 'privacy' ? 'Privacy' : tab === '2fa' ? '2FA' : 'Notifications'}
                            {activeTab === tab && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3390ec] rounded-t-full" />
                            )}
                        </button>
                    ))}
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                    {/* Alerts */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg text-sm text-red-600 dark:text-red-400">{error}</div>
                    )}
                    {success && (
                        <div className="mb-4 p-3 bg-green-50 dark:bg-green-500/10 border border-green-100 dark:border-green-500/20 rounded-lg text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                            <Check className="w-4 h-4" />{success}
                        </div>
                    )}

                    {/* Profile Info Tab */}
                    {activeTab === 'info' && (
                        <div>
                            {loading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-7 h-7 animate-spin text-[#3390ec]" />
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* Avatar */}
                                    <div className="flex items-center gap-5 pb-2">
                                        <div className="relative flex-shrink-0 group">
                                            {profile?.photo_url ? (
                                                <img src={profile.photo_url} alt="Profile" className="w-20 h-20 rounded-full object-cover shadow-sm" />
                                            ) : (
                                                <div className="w-20 h-20 rounded-full bg-[#3390ec] flex items-center justify-center text-white text-3xl font-black">
                                                    {(firstName || '?').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="absolute bottom-0 right-0 w-7 h-7 bg-[#3390ec] text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white dark:border-[#212121] transition-transform group-hover:scale-110"
                                                title="Change photo"
                                            >
                                                <Camera className="w-3.5 h-3.5" />
                                            </button>
                                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-medium text-gray-900 dark:text-white text-lg truncate">{firstName} {lastName}</p>
                                            {profile?.username && <p className="text-[14px] text-[#3390ec]">@{profile.username}</p>}
                                            {profile?.phone && <p className="text-[13px] text-gray-400 mt-1">{profile.phone}</p>}
                                        </div>
                                    </div>

                                    {/* Fields */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider ml-1">First Name</label>
                                            <input
                                                value={firstName}
                                                onChange={e => setFirstName(e.target.value)}
                                                className="w-full px-4 py-2 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-[14px] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#3390ec] transition"
                                                placeholder="First name"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider ml-1">Last Name</label>
                                            <input
                                                value={lastName}
                                                onChange={e => setLastName(e.target.value)}
                                                className="w-full px-4 py-2 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-[14px] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#3390ec] transition"
                                                placeholder="Last name"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider ml-1">Bio</label>
                                        <textarea
                                            value={bio}
                                            onChange={e => setBio(e.target.value)}
                                            rows={3}
                                            maxLength={70}
                                            className="w-full px-4 py-2 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-[14px] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#3390ec] transition resize-none"
                                            placeholder="A few words about yourself..."
                                        />
                                        <div className="flex justify-between items-center mt-1">
                                            <span className="text-[11px] text-gray-400 ml-1">Public description</span>
                                            <span className="text-[11px] text-gray-400">{bio.length}/70</span>
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-2">
                                        <button
                                            onClick={handleSaveInfo}
                                            disabled={saving}
                                            className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide flex items-center gap-2 min-w-[120px] justify-center"
                                        >
                                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Profile"}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Privacy Tab */}
                    {activeTab === 'privacy' && (
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <h4 className="text-[14px] font-medium text-gray-900 dark:text-white mb-1">Phone Number</h4>
                                    <p className="text-[13px] text-gray-500">Control who can see your phone number</p>
                                </div>
                                <div className="space-y-2">
                                    {[
                                        { value: 'everybody', label: 'Everybody', desc: 'All users' },
                                        { value: 'contacts', label: 'Contacts', desc: 'People in your contacts' },
                                        { value: 'nobody', label: 'Nobody', desc: 'No one' },
                                    ].map(opt => (
                                        <label key={opt.value} className={`flex items-center gap-3 p-3.5 rounded-lg border cursor-pointer transition-all ${phonePrivacy === opt.value ? 'border-[#3390ec] bg-[#3390ec]/5' : 'border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                                            <input
                                                type="radio"
                                                name="phone_privacy"
                                                value={opt.value}
                                                checked={phonePrivacy === (opt.value as typeof phonePrivacy)}
                                                onChange={() => setPhonePrivacy(opt.value as typeof phonePrivacy)}
                                                className="accent-[#3390ec]"
                                            />
                                            <div>
                                                <p className={`font-medium text-[14px] ${phonePrivacy === opt.value ? 'text-[#3390ec]' : 'text-gray-900 dark:text-white'}`}>{opt.label}</p>
                                                <p className="text-[12px] text-gray-500">{opt.desc}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="flex justify-end pt-2">
                                <button
                                    onClick={handleSavePrivacy}
                                    disabled={saving}
                                    className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide flex items-center gap-2 min-w-[140px] justify-center"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update Privacy"}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 2FA Tab */}
                    {activeTab === '2fa' && (
                        <form
                            onSubmit={(e) => { e.preventDefault(); handleChange2FA(); }}
                            className="space-y-5"
                            autoComplete="off"
                        >
                            <div className="p-4 bg-[#3390ec]/5 rounded-lg border border-[#3390ec]/10">
                                <p className="text-[13px] text-gray-600 dark:text-gray-300 leading-relaxed">
                                    Two-Step Verification adds an extra layer of security. You will be asked for this password when you log in on a new device.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider ml-1">Current Password</label>
                                    <input
                                        type="password"
                                        value={currentPass}
                                        onChange={e => setCurrentPass(e.target.value)}
                                        autoComplete="off"
                                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#3390ec] transition"
                                        placeholder="Old password (if any)"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider ml-1">New Password</label>
                                    <input
                                        type="password"
                                        value={newPass}
                                        onChange={e => setNewPass(e.target.value)}
                                        autoComplete="new-password"
                                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#3390ec] transition"
                                        placeholder="Enter new password"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider ml-1">Confirm New Password</label>
                                    <input
                                        type="password"
                                        value={confirmPass}
                                        onChange={e => setConfirmPass(e.target.value)}
                                        autoComplete="new-password"
                                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-[#2b3d4f] border border-gray-200 dark:border-white/5 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#3390ec] transition"
                                        placeholder="Repeat new password"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end pt-2">
                                <button
                                    type="submit"
                                    disabled={saving || !newPass}
                                    className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide flex items-center gap-2 min-w-[140px] justify-center"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set Password"}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Notifications Tab */}
                    {activeTab === 'notifications' && (
                        <div className="space-y-6">
                            <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 flex items-center gap-4">
                                <div className={`p-3 rounded-xl ${account?.notificationsEnabled ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-white/10 text-gray-400'}`}>
                                    {account?.notificationsEnabled ? <Bell className="w-6 h-6" /> : <BellOff className="w-6 h-6" />}
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-gray-900 dark:text-white">Account Notifications</h4>
                                    <p className="text-sm text-gray-500">Enable or disable alerts for this specific session</p>
                                </div>
                                <button
                                    onClick={toggleNotification}
                                    disabled={saving}
                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                        account?.notificationsEnabled ? 'bg-[#3390ec]' : 'bg-gray-200 dark:bg-gray-700'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                            account?.notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            <div className="pt-4 border-t border-gray-100 dark:border-white/5">
                                <p className="text-xs text-center text-gray-400">
                                    When muted, you won't receive sound or native notifications for new messages on this account.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
