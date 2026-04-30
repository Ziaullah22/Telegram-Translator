import { MessageCircle, LogOut, User, Zap, HelpCircle, Sun, Moon, BarChart2, ShoppingBag, Settings, ShieldAlert, Instagram, Menu, X, ChevronDown, Flame } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useState } from 'react';

interface HeaderProps {
  onStartTour: () => void;
}

export default function Header({ onStartTour }: HeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navItems = [
    { path: '/', label: 'Chat', icon: <MessageCircle className="w-3.5 h-3.5" /> },
    { path: '/auto-responder', label: 'Auto-Responder', icon: <Zap className="w-3.5 h-3.5" /> },
    { path: '/analytics', label: 'Performance', icon: <BarChart2 className="w-3.5 h-3.5" /> },
    { path: '/crm', label: 'CRM / Leads', icon: <User className="w-3.5 h-3.5 text-green-500" />, id: 'nav-crm' },
    { path: '/campaigns', label: 'Campaigns', icon: <Zap className={`w-3.5 h-3.5 ${location.pathname !== '/campaigns' ? 'text-orange-500' : ''}`} />, id: 'nav-campaigns' },
    { path: '/products', label: 'Store', icon: <ShoppingBag className="w-3.5 h-3.5 text-blue-500" /> },
    { path: '/instagram-leads', label: 'IG Scraper', icon: <Instagram className="w-3.5 h-3.5 text-pink-500" /> },
    { path: '/instagram-warming', label: 'IG Warmer', icon: <Flame className="w-3.5 h-3.5 text-orange-500" /> },
    { path: '/advanced-settings', label: 'Advanced', icon: <Settings className="w-3.5 h-3.5 text-blue-600" /> },
  ];

  return (
    <>
      {user?.impersonated_by && (
        <div className="bg-purple-600 text-white px-4 sm:px-8 py-2 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-4 h-4" />
            <span className="truncate">⚠️ Admin Shadow Mode: You are currently logged in as <span className="underline decoration-2 underline-offset-4">{user.username}</span></span>
          </div>
          <button 
            onClick={() => logout()}
            className="bg-white/20 hover:bg-white/30 px-4 py-1 rounded-full transition-all border border-white/20 ml-2 shrink-0"
          >
            Stop
          </button>
        </div>
      )}
      <header className="bg-[#f0f9ff] dark:bg-[#0f172a] border-b border-blue-100 dark:border-white/5 px-4 sm:px-8 py-4 sticky top-0 z-[50000] transition-colors duration-300 shadow-sm">
        <div className="relative z-[60] flex items-center justify-between">
          <div className="flex items-center space-x-4 xl:space-x-10">
            {/* Logo */}
            <div id="app-logo" className="flex items-center space-x-3 cursor-pointer group shrink-0" onClick={() => navigate('/')}>
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20 transition-transform group-hover:scale-105">
                <MessageCircle className="w-6 h-6" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-black text-gray-900 dark:text-white leading-none uppercase tracking-tight">Telegram</h1>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Strategic Translator</p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden xl:flex items-center gap-1">
              {[
                { path: '/', label: 'Chat', icon: <MessageCircle className="w-3.5 h-3.5" /> },
                { path: '/auto-responder', label: 'Auto-Responder', icon: <Zap className="w-3.5 h-3.5" /> },
                { path: '/campaigns', label: 'Campaigns', icon: <Zap className="w-3.5 h-3.5 text-orange-500" />, id: 'nav-campaigns' },
                { path: '/crm', label: 'CRM', icon: <User className="w-3.5 h-3.5 text-green-500" /> },
                { path: '/analytics', label: 'Performance', icon: <BarChart2 className="w-3.5 h-3.5" /> },
                { path: '/instagram-leads', label: 'IG Scraper', icon: <Instagram className="w-3.5 h-3.5 text-pink-500" /> },
                { path: '/instagram-warming', label: 'IG Warmer', icon: <Flame className="w-3.5 h-3.5 text-orange-500" /> },
              ].map(item => (
                <button
                  key={item.path}
                  id={item.id}
                  onClick={() => navigate(item.path)}
                  className={`flex items-center gap-2 py-2 px-3 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${
                    location.pathname === item.path 
                    ? 'text-blue-600 dark:text-blue-500 bg-blue-50/50 dark:bg-white/5' 
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}


              {/* Manage Dropdown */}
              <div className="relative group ml-1">
                <button id="nav-manage-group" className={`flex items-center gap-1.5 py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${['/products', '/advanced-settings'].includes(location.pathname) ? 'text-blue-600 dark:text-blue-500 bg-blue-50/50 dark:bg-white/5' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                   <Settings className="w-3.5 h-3.5" />
                   <span>Manage</span>
                   <ChevronDown className="w-3 h-3 transition-transform group-hover:rotate-180" />
                </button>
                <div className="absolute top-[80%] right-0 mt-2 w-48 z-[100] bg-white dark:bg-[#1e293b] border border-gray-100 dark:border-white/5 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform translate-y-2 group-hover:translate-y-0 overflow-hidden py-1">
                  {[
                    { path: '/products', label: 'Store', icon: <ShoppingBag className="w-3.5 h-3.5 text-blue-500" />, id: 'nav-store' },
                    { path: '/advanced-settings', label: 'Advanced Settings', icon: <Settings className="w-3.5 h-3.5 text-blue-600" />, id: 'nav-advanced' }
                  ].map(item => (
                    <button
                      key={item.path}
                      id={item.id}
                      onClick={() => navigate(item.path)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all hover:bg-gray-50 dark:hover:bg-white/5 ${
                        location.pathname === item.path ? 'text-blue-600 dark:text-blue-500 bg-blue-50/50 dark:bg-blue-500/10' : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </nav>

          </div>

          <div className="flex items-center space-x-2 md:space-x-4">
            {/* Tour Button - Hidden on small mobile */}
            <button
              onClick={onStartTour}
              className="hidden lg:flex items-center gap-2 px-4 py-2 hover:text-blue-500 rounded-xl transition-all text-gray-400 group"
              title="Quick Tour"
            >
              <HelpCircle className="w-4 h-4 transition-colors" />
              <span className="text-[10px] font-black uppercase tracking-widest transition-colors">Tour</span>
            </button>

            <div className="hidden md:block w-px h-6 bg-gray-200 dark:bg-white/10 mx-1" />

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

            <div className="hidden md:block w-px h-6 bg-gray-200 dark:bg-white/10 mx-1" />

            {/* User Profile - Shown only on large screens */}
            <div className="hidden xl:flex items-center space-x-3 text-gray-600 dark:text-gray-300 bg-white dark:bg-white/10 px-4 py-2 rounded-xl border border-gray-100 dark:border-white/5">
              <div className="w-6 h-6 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <User className="w-4 h-4 text-blue-500" />
              </div>
              <span className="text-xs font-black uppercase tracking-tight">{user?.username}</span>
            </div>

            {/* Logout - Shown only on large screens */}
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="hidden xl:flex w-10 h-10 items-center justify-center text-gray-400 hover:text-red-500 transition-all"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>

            {/* Mobile Menu Button - 3 Liner */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="xl:hidden w-10 h-10 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-all"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Backdrop */}
        <div 
          className={`
            fixed top-[73px] left-0 right-0 bottom-0 bg-black/40 backdrop-blur-sm z-[10000] xl:hidden transition-all duration-300
            ${isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
          `}
          onClick={() => setIsMenuOpen(false)}
        />

        {/* Mobile Navigation Menu */}
        <div className={`
          absolute top-full left-0 w-full bg-white dark:bg-[#0f172a] border-b border-blue-100 dark:border-white/5 shadow-2xl transition-all duration-300 xl:hidden overflow-y-auto transform origin-top z-[10001] max-h-[calc(100vh-73px)]
          ${isMenuOpen ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-4 opacity-0 scale-95 pointer-events-none'}
        `}>
          <div className="p-4 flex flex-col gap-2">
            {/* User info on mobile - Visible whenever hamburger is active */}
            <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-white/5 rounded-xl mb-2">
              <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <User className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none mb-1">Signed in as</p>
                <p className="text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white">{user?.username}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-1">
              {navItems.map(item => (
                <button
                  key={item.path}
                  id={item.id + '-mobile'}
                  onClick={() => {
                    navigate(item.path);
                    setIsMenuOpen(false);
                  }}
                  className={`flex items-center gap-4 py-3 px-4 rounded-xl transition-all ${
                    location.pathname === item.path 
                    ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-500' 
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${location.pathname === item.path ? 'bg-blue-100 dark:bg-blue-500/20' : 'bg-gray-100 dark:bg-white/5'}`}>
                    {item.icon}
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest">{item.label}</span>
                </button>
              ))}
            </div>

            <div className="h-px bg-gray-100 dark:bg-white/5 my-2" />

            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="flex items-center gap-4 py-3 px-4 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
            >
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-500/10">
                <LogOut className="w-4 h-4" />
              </div>
              <span className="text-xs font-black uppercase tracking-widest">Sign Out</span>
            </button>
          </div>
        </div>
      </header>
    </>
  );
}