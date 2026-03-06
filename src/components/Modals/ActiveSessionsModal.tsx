import { useState, useEffect } from 'react';
import { X, Monitor, Smartphone, Tablet, Globe, Loader2, Trash2, Shield, MapPin } from 'lucide-react';
import { telegramAPI } from '../../services/api';
import type { TelegramAccount } from '../../types';

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

    const handleTerminate = async (session: SessionData) => {
        if (!account || session.current) return;
        if (!confirm(`Terminate session on ${session.device_model}?`)) return;
        setTerminatingHash(session.hash);
        try {
            await telegramAPI.terminateSession(account.id, session.hash);
            setSessions(prev => prev.filter(s => s.hash !== session.hash));
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Failed to terminate session.');
        } finally {
            setTerminatingHash(null);
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
        <div className="fixed inset-0 z-[800] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#1c2431] rounded-2xl shadow-2xl w-full max-w-lg mx-4 border border-gray-100 dark:border-white/10 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/10 bg-gradient-to-r from-blue-600/10 to-blue-400/5">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Shield className="w-5 h-5 text-blue-500" />
                        Active Sessions
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 max-h-[65vh] overflow-y-auto">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-sm text-red-600 dark:text-red-400">{error}</div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p>No sessions found</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Current Session */}
                            {currentSession && (
                                <div>
                                    <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">This Device</h3>
                                    <div className="p-4 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-xl">
                                        <div className="flex items-start gap-3">
                                            <div className="flex-shrink-0 mt-0.5">{getDeviceIcon(currentSession.device_model, currentSession.platform)}</div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-gray-900 dark:text-white text-sm">{currentSession.device_model}</p>
                                                <p className="text-xs text-gray-500">{currentSession.app_name} {currentSession.app_version}</p>
                                                <p className="text-xs text-gray-400 mt-1">{currentSession.platform} {currentSession.system_version}</p>
                                                <div className="flex items-center gap-2 mt-1.5">
                                                    <span className="text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-500/20 px-2 py-0.5 rounded-full">Current</span>
                                                    {currentSession.country && (
                                                        <span className="text-xs text-gray-400 flex items-center gap-0.5">
                                                            <MapPin className="w-3 h-3" />{currentSession.region ? `${currentSession.region}, ` : ''}{currentSession.country}
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
                                <div>
                                    <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">
                                        Other Sessions ({otherSessions.length})
                                    </h3>
                                    <div className="space-y-2">
                                        {otherSessions.map(session => (
                                            <div key={session.hash} className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl flex items-start gap-3 group">
                                                <div className="flex-shrink-0 mt-0.5">{getDeviceIcon(session.device_model, session.platform)}</div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-gray-900 dark:text-white text-sm">{session.device_model}</p>
                                                    <p className="text-xs text-gray-500">{session.app_name} {session.app_version}</p>
                                                    <p className="text-xs text-gray-400 mt-0.5">{session.platform} {session.system_version}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-xs text-gray-400">Active {formatDate(session.date_active)}</span>
                                                        {session.country && (
                                                            <span className="text-xs text-gray-400 flex items-center gap-0.5">
                                                                <MapPin className="w-3 h-3" />{session.country}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleTerminate(session)}
                                                    disabled={terminatingHash === session.hash}
                                                    className="flex-shrink-0 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Terminate session"
                                                >
                                                    {terminatingHash === session.hash
                                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                                        : <Trash2 className="w-4 h-4" />
                                                    }
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-6 pb-6">
                    <button
                        onClick={loadSessions}
                        disabled={loading}
                        className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                        Refresh Sessions
                    </button>
                </div>
            </div>
        </div>
    );
}
