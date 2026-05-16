import { useState, useEffect, useRef } from 'react';
import { X, Shield, Plus, Trash2, Upload, AlertCircle, Loader, CheckCircle } from 'lucide-react';
import { instagramAPI } from '../../services/api';

interface Proxy {
  id: number;
  host: string;
  port: number;
  username?: string;
  password?: string;
  proxy_type: string;
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
        {/* Header */}
        <div className="p-8 pb-4 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-2xl">
              <Shield className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Proxy Management</h2>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Global Instagram Shield</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors">
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="px-8 pb-4 shrink-0">
          <div className="flex flex-col md:flex-row gap-4">
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-3 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-500/20 active:scale-95 transition-all hover:brightness-110"
            >
              <Upload className="w-5 h-5" />
              Upload Proxies (.txt)
            </button>
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".txt" 
              className="hidden" 
              onChange={handleFileUpload}
            />
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-bold">{error}</p>
            </div>
          )}

          {success && (
            <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center gap-3 text-green-500">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-bold">{success}</p>
            </div>
          )}
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
                        <p className="text-sm font-black text-gray-900 dark:text-white truncate">
                          {proxy.host}:{proxy.port}
                        </p>
                        <p className="text-[10px] font-medium text-gray-400 truncate">
                          {proxy.username ? `Auth: ${proxy.username}` : 'No Auth'}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDeleteProxy(proxy.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
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
