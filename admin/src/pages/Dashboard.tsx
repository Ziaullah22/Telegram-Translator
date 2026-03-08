/**
 * --- ADMIN DASHBOARD PAGE ---
 * 
 * Provides an bird's-eye view of the entire system's activity.
 * This is the first screen administrators see after logging in.
 */
import { useEffect, useState } from 'react';
import { Users, MessageSquare, UserCheck, Activity } from 'lucide-react';
import { adminApi } from '../services/api';

// --- DATA STRUCTURE: SYSTEM STATISTICS ---
interface Statistics {
  total_users: number;       // All colleague accounts in the DB
  active_users: number;      // Colleagues with 'is_active' set to true
  total_accounts: number;    // All connected Telegram phone numbers
  total_messages: number;    // Aggregate count of processed messages
  total_conversations: number;
}

const Dashboard = () => {
  // --- STATE MANAGEMENT ---
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);

  // --- LIFECYCLE: DATA FETCHING ---
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await adminApi.getStatistics();
        setStats(response.data);
      } catch (error) {
        console.error('Final statistics fetch failed:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  // --- UI: LOADING STATE ---
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // --- CONFIGURATION: STATISTIC CARDS ---
  // Definition of the top metrics grid for easy rendering and maintenance
  const statCards = [
    {
      title: 'Total Colleagues',
      value: stats?.total_users || 0,
      icon: Users,
      color: 'bg-blue-500', // Blue represents the general user base
    },
    {
      title: 'Active Colleagues',
      value: stats?.active_users || 0,
      icon: UserCheck,
      color: 'bg-green-500', // Green represents healthy/active status
    },
    {
      title: 'Telegram Accounts',
      value: stats?.total_accounts || 0,
      icon: Activity,
      color: 'bg-purple-500', // Purple represents system integrations
    },
    {
      title: 'Total Messages',
      value: stats?.total_messages || 0,
      icon: MessageSquare,
      color: 'bg-orange-500', // Orange represents high-volume traffic
    },
  ];

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <h1 className="text-3xl font-bold text-gray-900 mb-8">System Overview</h1>

      {/* --- METRICS GRID --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 hover:shadow-md transition-shadow cursor-default"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{card.title}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{card.value}</p>
                </div>
                {/* Visual Accent for the metric */}
                <div className={`${card.color} p-3 rounded-lg shadow-sm shadow-black/10`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* --- INFORMATION SECTION --- */}
      <div className="mt-8 bg-white rounded-xl shadow-sm p-8 border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4 border-b pb-4">Welcome to Admin Control</h2>
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <p className="text-gray-600 mb-4 leading-relaxed">
              This centralized dashboard allows you to oversee all field operations and communication streams.
              As an administrator, you have full control over user lifecycle and message auditing.
            </p>
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3 shadow-sm shadow-blue-500/50"></span>
                Provision and deactivate colleague accounts
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3 shadow-sm shadow-blue-500/50"></span>
                Audit Telegram account health and connectivity
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3 shadow-sm shadow-blue-500/50"></span>
                Real-time message monitoring across the organization
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3 shadow-sm shadow-blue-500/50"></span>
                Global encryption and security parameters management
              </li>
            </ul>
          </div>

          {/* Action Callouts */}
          <div className="bg-gray-50 rounded-lg p-6 border border-gray-100 flex flex-col justify-center">
            <h3 className="font-semibold text-gray-800 mb-2">Need to manage colleagues?</h3>
            <p className="text-sm text-gray-500 mb-4">Go to the "Colleagues" tab to add new members or reset credentials.</p>
            <div className="h-px bg-gray-200 my-2" />
            <h3 className="font-semibold text-gray-800 mb-2 mt-2">Suspicious activity?</h3>
            <p className="text-sm text-gray-500">Use "Message Review" to filter and audit specific conversations.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
