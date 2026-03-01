import { MessageCircle, LogOut, User, Zap, HelpCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';

interface HeaderProps {
  onStartTour: () => void;
}

export default function Header({ onStartTour }: HeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="bg-gray-900 border-b border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div id="app-logo" className="flex items-center space-x-3">
            <MessageCircle className="w-8 h-8 text-blue-500" />
            <h1 className="text-xl font-bold text-white">Telegram Translator</h1>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center space-x-2">
            <button
              onClick={() => navigate('/')}
              className={`px-4 py-2 rounded-lg transition-colors ${location.pathname === '/'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-800'
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
              className={`px-4 py-2 rounded-lg transition-colors ${location.pathname === '/auto-responder'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-800'
                }`}
            >
              <div className="flex items-center space-x-2 font-medium">
                <Zap className="w-4 h-4" />
                <span>Auto-Responder</span>
              </div>
            </button>

            <button
              onClick={onStartTour}
              className="px-4 py-2 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-gray-800 transition-colors flex items-center space-x-2 font-medium"
              title="Quick Tour"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Take a Tour</span>
            </button>
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-gray-300">
            <User className="w-4 h-4" />
            <span className="text-sm">{user?.username}</span>
          </div>

          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}