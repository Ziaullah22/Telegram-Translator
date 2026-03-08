import { useState, useEffect, useMemo } from 'react';
import { telegramAPI } from '../../services/api';

interface PeerAvatarProps {
    accountId?: number;
    peerId?: number;
    name: string;
    photoUrl?: string | null; // Pre-fetched photo (skip network call)
    className?: string;
    isActive?: boolean;
}

const getAvatarColor = (name: string) => {
    const colors = [
        '#2b96c7', '#2caef4', '#45bfff', '#3d9be9',
        '#4caf7d', '#45bf8d', '#5bb3a8', '#72b5e5',
        '#e36f6f', '#e37c6f', '#e3a76f', '#e3bc6f',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

const getInitials = (name: string) => {
    const parts = name.split(/[ _-]/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.charAt(0).toUpperCase() || '?';
};

// ---------- Persistent Cache (survives page reload) ----------
const CACHE_VERSION = 'v2'; // bump this to invalidate all cached avatars
const LS_PREFIX = `tg_av_${CACHE_VERSION}_`;

// Wipe old cache version entries on startup
try {
    Object.keys(localStorage).forEach(k => {
        if (k.startsWith('tg_av_') && !k.startsWith(LS_PREFIX)) {
            localStorage.removeItem(k);
        }
    });
} catch { /* ignore */ }

const memCache = new Map<string, string | null>();
const pendingFetches = new Map<string, Promise<string | null>>();

function cacheGet(key: string): string | null | undefined {
    if (memCache.has(key)) return memCache.get(key)!;
    try {
        const raw = localStorage.getItem(LS_PREFIX + key);
        if (raw !== null) {
            const val = raw === '__null__' ? null : raw;
            memCache.set(key, val);
            return val;
        }
    } catch { /* ignore */ }
    return undefined; // not cached
}

function cacheSet(key: string, url: string | null) {
    memCache.set(key, url);
    try { localStorage.setItem(LS_PREFIX + key, url ?? '__null__'); } catch { /* ignore quota */ }
}

// ---------- Public helper: batch prefetch for a list of peers ----------
export function prefetchAvatars(accountId: number, peers: { peerId: number }[]) {
    peers.forEach(({ peerId }) => {
        const key = `${accountId}_${peerId}`;
        if (cacheGet(key) !== undefined) return; // already cached
        if (pendingFetches.has(key)) return;      // already in flight
        const p = telegramAPI.getPeerPhoto(accountId, peerId)
            .then(res => { const u = res.photo_url || null; cacheSet(key, u); return u; })
            .catch(() => { pendingFetches.delete(key); return null; })
            .finally(() => pendingFetches.delete(key));
        pendingFetches.set(key, p);
    });
}

// ------------------------------------------------------------------

export default function PeerAvatar({
    accountId, peerId, name, photoUrl: propPhoto,
    className = '', isActive = false
}: PeerAvatarProps) {
    const cacheKey = accountId && peerId ? `${accountId}_${peerId}` : null;
    const cached = cacheKey ? cacheGet(cacheKey) : undefined;

    // If prop photo provided directly, use it immediately
    const initial = propPhoto !== undefined ? propPhoto : (cached !== undefined ? cached : null);
    const [photoUrl, setPhotoUrl] = useState<string | null>(initial);

    useEffect(() => {
        // If pre-fetched via prop, no network call needed
        if (propPhoto !== undefined) { setPhotoUrl(propPhoto); return; }
        if (!accountId || !peerId || !cacheKey) { setPhotoUrl(null); return; }

        const cached = cacheGet(cacheKey);
        if (cached !== undefined) { setPhotoUrl(cached); return; }

        // Not cached - clear stale image immediately
        setPhotoUrl(null);

        let p = pendingFetches.get(cacheKey);
        if (!p) {
            p = telegramAPI.getPeerPhoto(accountId, peerId)
                .then(res => { const u = res.photo_url || null; cacheSet(cacheKey, u); return u; })
                .catch(() => { pendingFetches.delete(cacheKey); return null; })
                .finally(() => pendingFetches.delete(cacheKey));
            pendingFetches.set(cacheKey, p);
        }

        let mounted = true;
        p.then(url => { if (mounted) setPhotoUrl(url); });
        return () => { mounted = false; };
    }, [accountId, peerId, cacheKey, propPhoto]);

    const backgroundColor = useMemo(() => getAvatarColor(name), [name]);
    const initials = useMemo(() => getInitials(name), [name]);

    if (photoUrl) {
        return <img src={photoUrl} alt={name} className={`object-cover ${className}`} />;
    }

    return (
        <div
            className={`flex items-center justify-center font-bold text-white shadow-sm ${className}`}
            style={{ backgroundColor: isActive ? '#60b4e8' : backgroundColor }}
            title={name}
        >
            {initials}
        </div>
    );
}
