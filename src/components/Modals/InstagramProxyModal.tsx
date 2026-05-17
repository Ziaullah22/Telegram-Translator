import { useState, useEffect, useRef } from 'react';
import { X, Shield, Plus, Trash2, Upload, AlertCircle, Loader, CheckCircle, Info } from 'lucide-react';
import { instagramAPI } from '../../services/api';

interface Proxy {
  id: number;
  host: string;
  port: number;
  username?: string;
  password?: string;
  proxy_type: string;
  is_admin_assigned: boolean;
}

interface InstagramProxyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InstagramProxyModal({ isOpen, onClose }: InstagramProxyModalProps) {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadProxies();
      setError(null);
      setSuccess(null);
    }
  }, [isOpen]);

  // Auto-clear success/error messages
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        if (success) setSuccess(null);
        if (error) setError(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  const loadProxies = async () => {
    try {
      setLoading(true);
      const list = await instagramAPI.getProxies();
      setProxies(list);
    } catch (err: any) {
      console.error('Failed to load proxies:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Use raw fetch for bulk upload to handle FormData correctly
      const Cookies = (await import('js-cookie')).default;
      const token = Cookies.get('auth_token');
      
      const res = await fetch('/api/instagram/bulk-proxies-file', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`✅ Successfully added ${data.success} proxies!`);
        loadProxies();
      } else {
        setError(data.detail || 'Failed to upload proxies');
      }
    } catch (err: any) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteProxy = async (id: number) => {
    if (!confirm('Remove this proxy? Accounts using it will lose connection.')) return;
    
    try {
      setLoading(true);
      await instagramAPI.deleteProxy(id);
      setProxies(prev => prev.filter(p => p.id !== id));
      setSuccess('Proxy removed.');
    } catch (err: any) {
      setError('Failed to delete proxy.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[99999] animate-fade-in" onClick={onClose}>
      <div 
        className="bg-white dark:bg-[#1e293b] rounded-[2.5rem] max-w-2xl w-full shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[85vh] border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Section */}
        <div className="p-8 pb-4 shrink-0">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-gray-900 dark:text-white">Managed Proxies</h2>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Global Connection Pool</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4">
            <div className="flex gap-3">
              <Info className="w-5 h-5 text-blue-500 shrink-0" />
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed font-bold">
                These proxies are automatically assigned to your accounts by the administrator. <span className="text-blue-600">Users cannot modify these settings.</span>
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar">
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-4 sticky top-0 bg-white dark:bg-[#1e293b] py-2 z-10">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Active Proxies ({proxies.length})</span>
              <p className="text-[10px] text-gray-400 italic">Format: host:port:user:pass</p>
            </div>

            {proxies.length === 0 && !loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 dark:border-white/5 rounded-[2rem]">
                <Shield className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-sm font-bold">No Proxies Uploaded</p>
                <p className="text-[10px] mt-1">Upload a .txt file to start rotating</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {proxies.map((proxy) => (
                  <div 
                    key={proxy.id}
                    className="group flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 border border-transparent hover:border-blue-500/30 rounded-2xl transition-all hover:translate-x-1"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold text-xs shrink-0">
                        {proxy.proxy_type.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-gray-900 dark:text-white truncate">
                            {proxy.host}:{proxy.port}
                          </p>
                          {proxy.is_admin_assigned && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-blue-500 text-white uppercase tracking-tighter">Managed</span>
                          )}
                        </div>
                        <p className="text-[10px] font-medium text-gray-400 truncate">
                          {proxy.username ? `Auth: ${proxy.username}` : 'No Auth'}
                        </p>
                      </div>
                    </div>
                    {!proxy.is_admin_assigned && (
                      <button 
                        onClick={() => handleDeleteProxy(proxy.id)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="p-8 pt-4 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/10 shrink-0">
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-blue-500/10 rounded-lg shrink-0">
              <Plus className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <p className="text-[10px] font-medium text-gray-400 leading-relaxed">
              <strong className="text-gray-900 dark:text-white uppercase tracking-tighter">Round-Robin Logic:</strong> When you upload bulk accounts, they will be automatically distributed across these proxies. If you have 1 proxy, all accounts use it. If you have 10, they will rotate 1-by-1.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
