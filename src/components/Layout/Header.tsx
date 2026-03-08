import { MessageCircle, LogOut, User, Zap, HelpCircle, Sun, Moon, BarChart2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';

interface HeaderProps {
  onStartTour: () => void;
}

/**
 * ---------------------------------------------------------
 * APPLICATION HEADER (src/components/Layout/Header.tsx)
 * ---------------------------------------------------------
 * Provides primary navigation and global user controls.
 * 
 * COMPONENTS:
 * 1. Global Navigation: Direct links to Chat, Auto-Responder, and Performance.
 * 2. Theme Toggle: Switches between light and dark modes across the app.
 * 3. User Identity: Displays session status and username.
 * 4. Help Link: Direct entry point for the interactive user tour.
 */
export default function Header({ onStartTour }: HeaderProps) {

  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="bg-telegram-side-list-light dark:bg-telegram-side-list-dark border-b border-gray-100 dark:border-white/5 px-6 py-4 transition-colors duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div id="app-logo" className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('/')}>
            <MessageCircle className="w-8 h-8 text-blue-500" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Telegram Translator</h1>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center space-x-2">
            <button
              onClick={() => navigate('/')}
              className={`px-4 py-2 rounded-lg transition-all duration-300 ${location.pathname === '/'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-gray-600 dark:text-gray-300 hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark'
                }`}
            >
              <div className="flex items-center space-x-2 font-medium">
                <MessageCircle className="w-4 h-4" />
                <span>Chat</span>
              </div>
            </button>
            <button
              id="nav-auto-responder"
              onClick={() => navigate('/auto-responder')}
              className={`px-4 py-2 rounded-lg transition-all duration-300 ${location.pathname === '/auto-responder'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-gray-600 dark:text-gray-300 hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark'
                }`}
            >
              <div className="flex items-center space-x-2 font-medium">
                <Zap className="w-4 h-4" />
                <span>Auto-Responder</span>
              </div>
            </button>

            <button
              id="nav-analytics"
              onClick={() => navigate('/analytics')}
              className={`px-4 py-2 rounded-lg transition-all duration-300 ${location.pathname === '/analytics'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-gray-600 dark:text-gray-300 hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark'
                }`}
            >
              <div className="flex items-center space-x-2 font-medium">
                <BarChart2 className="w-4 h-4" />
                <span>Performance</span>
              </div>
            </button>

            <button
              onClick={onStartTour}
              className="px-4 py-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark transition-all duration-300 flex items-center space-x-2 font-medium"
              title="Quick Tour"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Take a Tour</span>
            </button>
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-2 text-gray-500 dark:text-gray-400 hover:bg-telegram-hover-light dark:hover:bg-telegram-hover-dark rounded-lg transition-all duration-300 group"
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {theme === 'light' ? (
              <Moon className="w-5 h-5 group-hover:text-indigo-600" />
            ) : (
              <Sun className="w-5 h-5 group-hover:text-amber-400" />
            )}
          </button>

          <div className="h-6 w-px bg-gray-100 dark:bg-white/10 mx-2" />

          <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-300">
            <User className="w-4 h-4" />
            <span className="text-sm font-medium">{user?.username}</span>
          </div>

          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-telegram-hover-dark rounded-lg transition-all duration-300"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}