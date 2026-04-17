/**
 * ADMIN COLLEAGUE MANAGEMENT PAGE
 * 
 * Provides tools for managing team members (colleagues).
 * Features:
 * 1. Create, Edit, and Delete colleague accounts
 * 2. Toggle active/inactive status
 * 3. Monitor individual colleague metrics (Accounts count, Total messages)
 * 4. Search colleagues by username or email
 */
import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Search, CheckCircle, XCircle, Power, Shield } from 'lucide-react';
import { adminApi } from '../services/api';
import { ColleagueWithAccounts } from '../types';
import ColleagueModal from '../components/ColleagueModal';
import ConfirmDialog from '../components/ConfirmDialog';

const ColleagueManagement = () => {
  const [colleagues, setColleagues] = useState<ColleagueWithAccounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedColleague, setSelectedColleague] = useState<ColleagueWithAccounts | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [colleagueToDelete, setColleagueToDelete] = useState<number | null>(null);

  const fetchColleagues = async () => {
    try {
      const response = await adminApi.getColleagues();
      setColleagues(response.data);
    } catch (error) {
      console.error('Failed to fetch colleagues:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchColleagues();
  }, []);

  const handleCreate = () => {
    setSelectedColleague(null);
    setShowModal(true);
  };

  const handleEdit = (colleague: ColleagueWithAccounts) => {
    setSelectedColleague(colleague);
    setShowModal(true);
  };

  const handleDelete = (id: number) => {
    setColleagueToDelete(id);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!colleagueToDelete) return;

    try {
      await adminApi.deleteColleague(colleagueToDelete);
      await fetchColleagues();
      setShowDeleteDialog(false);
      setColleagueToDelete(null);
    } catch (error) {
      console.error('Failed to delete colleague:', error);
      alert('Failed to delete colleague');
    }
  };

  const handleToggleActive = async (colleague: ColleagueWithAccounts) => {
    try {
      await adminApi.updateColleague(colleague.id, { is_active: !colleague.is_active });
      await fetchColleagues();
    } catch (error) {
      console.error('Failed to toggle colleague status:', error);
      alert('Failed to update colleague status');
    }
  };

  const handleModalClose = async (refresh: boolean) => {
    setShowModal(false);
    setSelectedColleague(null);
    if (refresh) {
      await fetchColleagues();
    }
  };

  const filteredColleagues = colleagues.filter((colleague) =>
    colleague.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    colleague.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Colleague Management</h1>
        <button
          onClick={handleCreate}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Colleague
        </button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search colleagues..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Colleagues Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Username
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Accounts
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Messages
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredColleagues.map((colleague) => (
              <tr key={colleague.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{colleague.username}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500">{colleague.email || '-'}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {colleague.is_active ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      <XCircle className="w-3 h-3 mr-1" />
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {colleague.accounts.length}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {colleague.total_messages}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(colleague.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => handleToggleActive(colleague)}
                    className={`${colleague.is_active ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'} mr-3`}
                    title={colleague.is_active ? 'Deactivate' : 'Activate'}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const response = await adminApi.impersonateColleague(colleague.id);
                        const { access_token } = response.data;
                        // Set the token for the MAIN app
                        const Cookies = (await import('js-cookie')).default;
                        Cookies.set('auth_token', access_token, { expires: 1, path: '/' });
                        // Smart Redirection: Detects if we are Local or in Production
                        const userAppUrl = window.location.hostname === 'localhost' 
                            ? 'http://localhost:5173' 
                            : window.location.protocol + "//" + window.location.hostname;
                        window.open(userAppUrl, '_blank');
                      } catch (error) {
                        console.error('Impersonation failed:', error);
                        alert('Failed to login as colleague');
                      }
                    }}
                    className="text-purple-600 hover:text-purple-900 mr-3"
                    title="Login As Colleague"
                  >
                    <Shield className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleEdit(colleague)}
                    className="text-blue-600 hover:text-blue-900 mr-3"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(colleague.id)}
                    className="text-red-600 hover:text-red-900"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredColleagues.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No colleagues found</p>
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <ColleagueModal
          colleague={selectedColleague}
          onClose={handleModalClose}
        />
      )}

      {showDeleteDialog && (
        <ConfirmDialog
          title="Delete Colleague"
          message="Are you sure you want to delete this colleague? This will also delete all their Telegram accounts and messages."
          onConfirm={confirmDelete}
          onCancel={() => {
            setShowDeleteDialog(false);
            setColleagueToDelete(null);
          }}
        />
      )}
    </div>
  );
};

export default ColleagueManagement;
