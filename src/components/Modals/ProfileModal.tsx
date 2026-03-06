import { useState, useEffect, useRef } from 'react';
import { X, Camera, User, Phone, AtSign, FileText, Lock, Shield, Loader2, Check } from 'lucide-react';
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
}

export default function ProfileModal({ isOpen, account, onClose }: ProfileModalProps) {
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'info' | 'privacy' | '2fa'>('info');

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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[800] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#1c2431] rounded-2xl shadow-2xl w-full max-w-lg mx-4 border border-gray-100 dark:border-white/10 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/10 bg-gradient-to-r from-blue-600/10 to-blue-400/5">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <User className="w-5 h-5 text-blue-500" />
                        Telegram Profile
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100 dark:border-white/10">
                    {(['info', 'privacy', '2fa'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => { setActiveTab(tab); setError(''); setSuccess(''); }}
                            className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === tab
                                ? 'text-blue-500 border-b-2 border-blue-500'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                        >
                            {tab === 'info' ? 'Profile Info' : tab === 'privacy' ? 'Privacy' : '2FA Security'}
                        </button>
                    ))}
                </div>

                <div className="p-6 max-h-[60vh] overflow-y-auto">
                    {/* Alerts */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-sm text-red-600 dark:text-red-400">{error}</div>
                    )}
                    {success && (
                        <div className="mb-4 p-3 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-xl text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                            <Check className="w-4 h-4" />{success}
                        </div>
                    )}

                    {/* Profile Info Tab */}
                    {activeTab === 'info' && (
                        <div>
                            {loading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    {/* Avatar */}
                                    <div className="flex items-center gap-5">
                                        <div className="relative flex-shrink-0">
                                            {profile?.photo_url ? (
                                                <img src={profile.photo_url} alt="Profile" className="w-20 h-20 rounded-full object-cover border-4 border-blue-100 dark:border-blue-900/50" />
                                            ) : (
                                                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-3xl font-black">
                                                    {(firstName || '?').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="absolute -bottom-1 -right-1 w-7 h-7 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg transition-colors"
                                                title="Change photo"
                                            >
                                                <Camera className="w-3.5 h-3.5" />
                                            </button>
                                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900 dark:text-white text-lg">{firstName} {lastName}</p>
                                            {profile?.username && <p className="text-sm text-blue-500">@{profile.username}</p>}
                                            {profile?.phone && <p className="text-xs text-gray-400 flex items-center gap-1 mt-1"><Phone className="w-3 h-3" />{profile.phone}</p>}
                                        </div>
                                    </div>

                                    {/* Fields */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">First Name</label>
                                            <input
                                                value={firstName}
                                                onChange={e => setFirstName(e.target.value)}
                                                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                                                placeholder="First name"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Last Name</label>
                                            <input
                                                value={lastName}
                                                onChange={e => setLastName(e.target.value)}
                                                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                                                placeholder="Last name"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="flex items-center gap-1 text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                                            <AtSign className="w-3 h-3" />Username (read-only)
                                        </label>
                                        <input
                                            value={profile?.username || ''}
                                            disabled
                                            className="w-full px-3 py-2.5 bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-500 dark:text-gray-400 cursor-not-allowed"
                                        />
                                    </div>

                                    <div>
                                        <label className="flex items-center gap-1 text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                                            <FileText className="w-3 h-3" />Bio
                                        </label>
                                        <textarea
                                            value={bio}
                                            onChange={e => setBio(e.target.value)}
                                            rows={3}
                                            maxLength={70}
                                            className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition resize-none"
                                            placeholder="A few words about yourself..."
                                        />
                                        <p className="text-xs text-gray-400 mt-1 text-right">{bio.length}/70</p>
                                    </div>

                                    <button
                                        onClick={handleSaveInfo}
                                        disabled={saving}
                                        className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                                    >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                        Save Changes
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Privacy Tab */}
                    {activeTab === 'privacy' && (
                        <div className="space-y-5">
                            <div>
                                <label className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white mb-1">
                                    <Phone className="w-4 h-4 text-blue-500" />
                                    Who can see my phone number
                                </label>
                                <p className="text-xs text-gray-500 mb-4">Control who can see your phone number in your Telegram profile</p>
                                <div className="space-y-2">
                                    {[
                                        { value: 'everybody', label: 'Everybody', desc: 'All Telegram users' },
                                        { value: 'contacts', label: 'My Contacts', desc: 'Only people in your contacts' },
                                        { value: 'nobody', label: 'Nobody', desc: 'No one can see it' },
                                    ].map(opt => (
                                        <label key={opt.value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${phonePrivacy === opt.value ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                                            <input
                                                type="radio"
                                                name="phone_privacy"
                                                value={opt.value}
                                                checked={phonePrivacy === (opt.value as typeof phonePrivacy)}
                                                onChange={() => setPhonePrivacy(opt.value as typeof phonePrivacy)}
                                                className="accent-blue-500"
                                            />
                                            <div>
                                                <p className="font-semibold text-sm text-gray-900 dark:text-white">{opt.label}</p>
                                                <p className="text-xs text-gray-500">{opt.desc}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <button
                                onClick={handleSavePrivacy}
                                disabled={saving}
                                className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                                Save Privacy Settings
                            </button>
                        </div>
                    )}

                    {/* 2FA Tab */}
                    {activeTab === '2fa' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-500/10 rounded-xl border border-blue-200 dark:border-blue-500/30">
                                <Lock className="w-5 h-5 text-blue-500 flex-shrink-0" />
                                <p className="text-sm text-blue-700 dark:text-blue-300">
                                    Two-Factor Authentication adds an extra layer of security to your Telegram account.
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Current Password (leave empty if none)</label>
                                <input
                                    type="password"
                                    value={currentPass}
                                    onChange={e => setCurrentPass(e.target.value)}
                                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition"
                                    placeholder="Current 2FA password"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">New Password</label>
                                <input
                                    type="password"
                                    value={newPass}
                                    onChange={e => setNewPass(e.target.value)}
                                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition"
                                    placeholder="New 2FA password"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Confirm New Password</label>
                                <input
                                    type="password"
                                    value={confirmPass}
                                    onChange={e => setConfirmPass(e.target.value)}
                                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition"
                                    placeholder="Confirm new password"
                                />
                            </div>
                            <button
                                onClick={handleChange2FA}
                                disabled={saving || !newPass}
                                className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                                Update 2FA Password
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
