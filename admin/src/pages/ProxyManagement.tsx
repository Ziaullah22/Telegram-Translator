import { useEffect, useState } from 'react';
import { Globe, Plus, RefreshCw, Trash2, CheckCircle, XCircle, Search, Info, Upload } from 'lucide-react';
import { adminApi } from '../services/api';

interface GlobalProxy {
  id: number;
  host: string;
  port: number;
  username?: string;
  password?: string;
  proxy_type: string;
  is_working: boolean;
  created_at: string;
}

const ProxyManagement = () => {
  const [proxies, setProxies] = useState<GlobalProxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const fetchProxies = async () => {
    try {
      setLoading(true);
      const response = await adminApi.getGlobalProxies();
      setProxies(response.data);
    } catch (error) {
      console.error('Failed to fetch global proxies:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProxies();
  }, []);

  const handleDeleteProxy = async (id: number) => {
    if (!confirm('Are you sure you want to delete this proxy? The system will automatically rebalance all users.')) return;
    
    try {
      setIsRebalancing(true);
      setStatusMessage(null);
      await adminApi.deleteGlobalProxy(id);
      setStatusMessage({ type: 'success', text: 'Proxy deleted and system rebalanced.' });
      fetchProxies();
    } catch (error) {
      console.error('Delete failed:', error);
      setStatusMessage({ type: 'error', text: 'Failed to delete proxy.' });
    } finally {
      setIsRebalancing(false);
    }
  };

  const filteredProxies = proxies.filter(p => 
    p.host.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <Globe className="w-8 h-8 mr-3 text-blue-600" />
            Global Proxy Pool
          </h1>
          <p className="mt-2 text-gray-600">
            Manage administrative proxies distributed across all users automatically.
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className={`mb-6 p-4 rounded-lg flex items-center ${
          statusMessage.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle className="w-5 h-5 mr-3" /> : <XCircle className="w-5 h-5 mr-3" />}
          {statusMessage.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Bulk Upload Section */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Upload className="w-5 h-5 mr-2 text-blue-600" />
              Bulk Import
            </h2>
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
              <div className="flex">
                <Info className="h-5 w-5 text-blue-400 mr-3" />
                <p className="text-xs text-blue-700">
                  Upload a <strong>.txt</strong> file with proxies (one per line).<br/>
                  Format: host:port:user:pass
                </p>
              </div>
            </div>

            <input
              type="file"
              id="proxy-upload"
              className="hidden"
              accept=".txt"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = async (event) => {
                  const text = event.target?.result as string;
                  if (!text) return;

                  try {
                    setIsUploading(true);
                    setStatusMessage(null);
                    const response = await adminApi.bulkUploadGlobalProxies(text);
                    
                    if (response.data.status === 'success') {
                      setStatusMessage({ 
                        type: 'success', 
                        text: `Successfully imported ${response.data.results.success} global proxies!` 
                      });
                      fetchProxies();
                    }
                  } catch (error) {
                    console.error('Import failed:', error);
                    setStatusMessage({ type: 'error', text: 'Failed to import proxies. Check file format.' });
                  } finally {
                    setIsUploading(false);
                    // Reset input
                    e.target.value = '';
                  }
                };
                reader.readAsText(file);
              }}
            />

            <button
              onClick={() => document.getElementById('proxy-upload')?.click()}
              disabled={isUploading}
              className="w-full flex items-center justify-center py-4 px-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:text-blue-600 hover:border-blue-500 hover:bg-blue-50 transition-all group disabled:opacity-50"
            >
              {isUploading ? (
                <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              ) : (
                <div className="flex flex-col items-center">
                  <Upload className="w-8 h-8 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="font-bold">Choose .txt File</span>
                  <span className="text-[10px] mt-1 opacity-60 uppercase tracking-widest">Maximum Stability</span>
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Proxy List Table */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h2 className="font-semibold text-gray-700">Current Pool ({proxies.length})</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search proxies..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-4 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
            
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Host</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Port</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Added</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                        Loading proxies...
                      </td>
                    </tr>
                  ) : filteredProxies.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        No proxies found in the pool.
                      </td>
                    </tr>
                  ) : filteredProxies.map((proxy) => (
                    <tr key={proxy.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{proxy.host}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{proxy.port}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{proxy.username || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {proxy.is_working ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" /> Working
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <XCircle className="w-3 h-3 mr-1" /> Failing
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {new Date(proxy.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleDeleteProxy(proxy.id)}
                          className="text-red-600 hover:text-red-900 transition-colors"
                          title="Delete Proxy"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProxyManagement;
