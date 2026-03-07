import { useState, useEffect } from 'react';
import { X, Monitor, Smartphone, Tablet, Globe, Loader2, Trash2, Info } from 'lucide-react';
import { telegramAPI } from '../../services/api';
import type { TelegramAccount } from '../../types';
import ConfirmModal from './ConfirmModal';

interface SessionData {
    hash: string;
    device_model: string;
    platform: string;
    system_version: string;
    app_name: string;
    app_version: string;
    date_created: string | null;
    date_active: string | null;
    ip: string;
    country: string;
    region: string;
    current: boolean;
    password_pending: boolean;
}

interface ActiveSessionsModalProps {
    isOpen: boolean;
    account: TelegramAccount | null;
    onClose: () => void;
}

export default function ActiveSessionsModal({ isOpen, account, onClose }: ActiveSessionsModalProps) {
    const [sessions, setSessions] = useState<SessionData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [terminatingHash, setTerminatingHash] = useState<string | null>(null);
    const [terminatingAll, setTerminatingAll] = useState(false);
    const [sessionToTerminate, setSessionToTerminate] = useState<SessionData | null>(null);
    const [showTerminateAllConfirm, setShowTerminateAllConfirm] = useState(false);

    useEffect(() => {
        if (isOpen && account) {
            loadSessions();
        }
    }, [isOpen, account]);

    const loadSessions = async () => {
        if (!account) return;
        setLoading(true);
        setError('');
        try {
            const data = await telegramAPI.getSessions(account.id);
            setSessions(data);
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Failed to load sessions. Make sure account is connected.');
        } finally {
            setLoading(false);
        }
    };

    const handleTerminate = (session: SessionData) => {
        if (!account || session.current) return;
        setSessionToTerminate(session);
    };

    const confirmTerminate = async () => {
        if (!account || !sessionToTerminate) return;
        setTerminatingHash(sessionToTerminate.hash);
        try {
            await telegramAPI.terminateSession(account.id, sessionToTerminate.hash);
            setSessions(prev => prev.filter(s => s.hash !== sessionToTerminate.hash));
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Failed to terminate session.');
        } finally {
            setTerminatingHash(null);
            setSessionToTerminate(null);
        }
    };

    const handleTerminateAll = () => {
        const otherSessions = sessions.filter(s => !s.current);
        if (!account || otherSessions.length === 0) return;
        setShowTerminateAllConfirm(true);
    };

    const confirmTerminateAll = async () => {
        if (!account) return;
        setTerminatingAll(true);
        try {
            await telegramAPI.terminateAllSessions(account.id);
            setSessions(prev => prev.filter(s => s.current));
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Failed to terminate all sessions.');
        } finally {
            setTerminatingAll(false);
            setShowTerminateAllConfirm(false);
        }
    };

    const getDeviceIcon = (device: string, platform: string) => {
        const d = (device + platform).toLowerCase();
        if (d.includes('android') || d.includes('phone') || d.includes('mobile')) return <Smartphone className="w-6 h-6 text-green-500" />;
        if (d.includes('ipad') || d.includes('tablet')) return <Tablet className="w-6 h-6 text-blue-500" />;
        if (d.includes('desktop') || d.includes('windows') || d.includes('mac') || d.includes('linux')) return <Monitor className="w-6 h-6 text-blue-500" />;
        return <Globe className="w-6 h-6 text-gray-500" />;
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'Unknown';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 2) return 'Just now';
        if (diffMins < 60) return `${diffMins} minutes ago`;
        if (diffHours < 24) return `${diffHours} hours ago`;
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    if (!isOpen) return null;

    const currentSession = sessions.find(s => s.current);
    const otherSessions = sessions.filter(s => !s.current);

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-[#212121] rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden animate-scale-in flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-white/5">
                    <h3 className="text-[19px] font-medium text-gray-900 dark:text-white">Active Sessions</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg text-sm text-red-600 dark:text-red-400">{error}</div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-8 h-8 animate-spin text-[#3390ec]" />
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <p>No active sessions found</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Security Note */}
                            <div className="p-4 bg-[#3390ec]/5 border border-[#3390ec]/10 rounded-lg flex gap-3 text-[13px] text-gray-600 dark:text-gray-300 leading-relaxed">
                                <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#3390ec]" />
                                <p>
                                    You can terminate other active sessions to keep your account secure. Your current session is highlighted below.
                                </p>
                            </div>

                            {/* Current Session */}
                            {currentSession && (
                                <div>
                                    <h3 className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2.5 ml-1">Current Session</h3>
                                    <div className="p-4 bg-[#3390ec]/10 border border-[#3390ec]/20 rounded-lg">
                                        <div className="flex items-start gap-4">
                                            <div className="flex-shrink-0 mt-0.5 text-[#3390ec]">{getDeviceIcon(currentSession.device_model, currentSession.platform)}</div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-gray-900 dark:text-white text-[15px]">{currentSession.device_model}</p>
                                                <p className="text-[13px] text-gray-400 mt-0.5">{currentSession.app_name} {currentSession.app_version}</p>
                                                <div className="flex items-center gap-3 mt-2">
                                                    <span className="text-[11px] font-medium text-[#3390ec] uppercase tracking-wider">Online</span>
                                                    {currentSession.country && (
                                                        <span className="text-[12px] text-gray-500 truncate">
                                                            {currentSession.region ? `${currentSession.region}, ` : ''}{currentSession.country}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Other Sessions */}
                            {otherSessions.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between mb-2 px-1">
                                        <h3 className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Other Sessions</h3>
                                        <button
                                            onClick={handleTerminateAll}
                                            disabled={terminatingAll}
                                            className="text-[11px] font-medium text-red-500 uppercase tracking-wider hover:underline"
                                        >
                                            Terminate All Others
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {otherSessions.map(session => (
                                            <div key={session.hash} className="p-4 bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 rounded-lg flex items-start gap-4 hover:border-gray-200 dark:hover:border-white/10 transition-all">
                                                <div className="flex-shrink-0 mt-0.5 text-gray-400">{getDeviceIcon(session.device_model, session.platform)}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <p className="font-medium text-gray-900 dark:text-white text-[14px]">{session.device_model}</p>
                                                        <button
                                                            onClick={() => handleTerminate(session)}
                                                            disabled={terminatingHash === session.hash}
                                                            className="text-red-500 hover:text-red-600 p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                                                            title="Terminate"
                                                        >
                                                            {terminatingHash === session.hash ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                        </button>
                                                    </div>
                                                    <p className="text-[12px] text-gray-400 mt-0.5">{session.app_name} {session.app_version}</p>
                                                    <p className="text-[12px] text-gray-500 mt-1">
                                                        Active {formatDate(session.date_active)}
                                                        {session.country && ` • ${session.country}`}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex justify-end pt-6 mt-2">
                        <button
                            onClick={loadSessions}
                            disabled={loading}
                            className="px-4 py-2 text-[#3390ec] hover:bg-[#3390ec]/10 font-medium rounded-md transition-colors uppercase text-sm tracking-wide flex items-center gap-2 min-w-[140px] justify-center"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh List"}
                        </button>
                    </div>
                </div>
            </div>

            <ConfirmModal
                isOpen={!!sessionToTerminate}
                onClose={() => setSessionToTerminate(null)}
                onConfirm={confirmTerminate}
                title="Terminate Session"
                message={`Are you sure you want to terminate the session on ${sessionToTerminate?.device_model}?`}
                confirmText="Terminate"
                type="danger"
            />

            <ConfirmModal
                isOpen={showTerminateAllConfirm}
                onClose={() => setShowTerminateAllConfirm(false)}
                onConfirm={confirmTerminateAll}
                title="Terminate All Other Sessions"
                message="Are you sure you want to log out all other devices? This will terminate all sessions except the one you are currently using."
                confirmText="Terminate All"
                type="danger"
            />
        </div>
    );
}
