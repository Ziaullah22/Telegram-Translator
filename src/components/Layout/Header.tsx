import { MessageCircle, LogOut, User, Zap, HelpCircle, Sun, Moon, BarChart2, ShoppingBag, Settings } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';

interface HeaderProps {
  onStartTour: () => void;
}

export default function Header({ onStartTour }: HeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="bg-[#f0f9ff] dark:bg-[#0f172a] border-b border-blue-100 dark:border-white/5 px-8 py-4 sticky top-0 z-[50] transition-colors duration-300 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-10">
          <div id="app-logo" className="flex items-center space-x-3 cursor-pointer group" onClick={() => navigate('/')}>
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20 transition-transform group-hover:scale-105">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-black text-gray-900 dark:text-white leading-none uppercase tracking-tight">Telegram</h1>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Strategic Translator</p>
            </div>
          </div>

          {/* Navigation Links (Minimal Style) */}
          <nav className="flex items-center gap-2">
            {[
              { path: '/', label: 'Chat', icon: <MessageCircle className="w-3.5 h-3.5" /> },
              { path: '/auto-responder', label: 'Auto-Responder', icon: <Zap className="w-3.5 h-3.5" /> },
              { path: '/analytics', label: 'Performance', icon: <BarChart2 className="w-3.5 h-3.5" /> },
              { path: '/crm', label: 'CRM / Leads', icon: <User className="w-3.5 h-3.5 text-green-500" />, id: 'nav-crm' },
              { path: '/campaigns', label: 'Campaigns', icon: <Zap className={`w-3.5 h-3.5 ${location.pathname !== '/campaigns' ? 'text-orange-500' : ''}`} />, id: 'nav-campaigns' },
              { path: '/products', label: 'Store', icon: <ShoppingBag className="w-3.5 h-3.5 text-blue-500" /> },
              { path: '/advanced-settings', label: 'Advanced', icon: <Settings className="w-3.5 h-3.5 text-blue-600" /> },
            ].map(item => (
              <button
                key={item.path}
                id={item.id}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-2 py-2 px-4 text-[10px] font-black uppercase tracking-widest transition-all ${
                  location.pathname === item.path 
                  ? 'text-blue-600 dark:text-blue-500' 
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={onStartTour}
            className="hidden lg:flex items-center gap-2 px-4 py-2 hover:text-blue-500 rounded-xl transition-all text-gray-400 group"
            title="Quick Tour"
          >
            <HelpCircle className="w-4 h-4 transition-colors" />
            <span className="text-[10px] font-black uppercase tracking-widest transition-colors">Tour</span>
          </button>

          <div className="w-px h-6 bg-gray-200 dark:bg-white/10 mx-1" />

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="w-10 h-10 flex items-center justify-center text-gray-400 rounded-xl transition-all group"
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {theme === 'light' ? (
              <Moon className="w-5 h-5 group-hover:text-indigo-600" />
            ) : (
              <Sun className="w-5 h-5 group-hover:text-amber-400" />
            )}
          </button>

          <div className="w-px h-6 bg-gray-200 dark:bg-white/10 mx-1" />

          <div className="flex items-center space-x-3 text-gray-600 dark:text-gray-300 bg-white/50 dark:bg-white/5 px-4 py-2 rounded-xl border border-gray-100 dark:border-white/5">
            <div className="w-6 h-6 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <User className="w-4 h-4 text-blue-500" />
            </div>
            <span className="text-xs font-black uppercase tracking-tight">{user?.username}</span>
          </div>

          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-red-500 transition-all"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}