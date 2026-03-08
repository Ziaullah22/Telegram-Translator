import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { MessageCircle, AlertCircle, Loader, Eye, EyeOff, Lock, User, Mail, CheckCircle, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';

interface RegisterFormData {
  username: string;
  password: string;
  confirmPassword: string;
  email?: string;
}

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

export default function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { register: authRegister } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>();

  const password = watch('password');

  const onSubmit = async (data: RegisterFormData) => {
    setLoading(true);
    setError(null);
    try {
      await authRegister(data.username, data.password, data.email);
      setSuccess(true);
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.response?.data?.detail || err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0d1117] flex items-center justify-center p-4 transition-colors duration-300">

      {/* Theme Toggle in Corner */}
      <div className="absolute top-6 right-6 z-20">
        <button
          onClick={toggleTheme}
          className="p-3 bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/20 rounded-2xl transition-all duration-300 shadow-sm"
          title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {theme === 'light' ? (
            <Moon className="w-5 h-5 text-indigo-600" />
          ) : (
            <Sun className="w-5 h-5 text-amber-400" />
          )}
        </button>
      </div>

      {/* Subtle animated background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-white/10 rounded-3xl shadow-2xl shadow-black/5 dark:shadow-black/40 overflow-hidden">

          {/* Top gradient bar */}
          <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-500" />

          <div className="p-8">
            {/* Success State */}
            {success ? (
              <div className="text-center py-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-500/10 dark:bg-green-500/20 mb-5">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-3 tracking-tight">
                  Account Created!
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-7 leading-relaxed">
                  Your account has been created successfully.<br />You can now sign in.
                </p>
                <button
                  onClick={onSwitchToLogin}
                  className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-black text-sm rounded-xl transition-all shadow-lg shadow-blue-600/30"
                >
                  Continue to Sign In
                </button>
              </div>
            ) : (
              <>
                {/* Logo & Title */}
                <div className="text-center mb-7">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 dark:bg-indigo-500/20 mb-4 shadow-inner">
                    <MessageCircle className="w-8 h-8 text-indigo-500" />
                  </div>
                  <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight mb-1">
                    Create Account
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Get started with Telegram Translator
                  </p>
                </div>

                {/* Error */}
                {error && (
                  <div className="mb-5 p-3.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl flex items-center gap-3 text-red-600 dark:text-red-400">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  {/* Username */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">
                      Username
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <User className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                      </div>
                      <input
                        {...register('username', {
                          required: 'Username is required',
                          minLength: { value: 3, message: 'Minimum 3 characters' },
                        })}
                        type="text"
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm"
                        placeholder="Choose a username"
                        disabled={loading}
                      />
                    </div>
                    {errors.username && (
                      <p className="mt-1.5 text-xs text-red-500 dark:text-red-400 font-medium">{errors.username.message}</p>
                    )}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">
                      Email{' '}
                      <span className="text-[10px] text-gray-400 dark:text-gray-600 normal-case tracking-normal font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Mail className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                      </div>
                      <input
                        {...register('email', {
                          pattern: {
                            value: /^\S+@\S+$/i,
                            message: 'Please enter a valid email address',
                          },
                        })}
                        type="email"
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm"
                        placeholder="your@email.com"
                        disabled={loading}
                      />
                    </div>
                    {errors.email && (
                      <p className="mt-1.5 text-xs text-red-500 dark:text-red-400 font-medium">{errors.email.message}</p>
                    )}
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Lock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                      </div>
                      <input
                        {...register('password', {
                          required: 'Password is required',
                          minLength: { value: 6, message: 'Minimum 6 characters' },
                        })}
                        type={showPassword ? 'text' : 'password'}
                        className="w-full pl-10 pr-11 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm"
                        placeholder="Create a password"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="mt-1.5 text-xs text-red-500 dark:text-red-400 font-medium">{errors.password.message}</p>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Lock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                      </div>
                      <input
                        {...register('confirmPassword', {
                          required: 'Please confirm your password',
                          validate: (value) => value === password || 'Passwords do not match',
                        })}
                        type={showConfirmPassword ? 'text' : 'password'}
                        className="w-full pl-10 pr-11 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm"
                        placeholder="Confirm your password"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="mt-1.5 text-xs text-red-500 dark:text-red-400 font-medium">{errors.confirmPassword.message}</p>
                    )}
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 flex items-center justify-center gap-2.5 py-3.5 px-6 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-white font-black text-sm rounded-xl transition-all shadow-lg shadow-indigo-600/30"
                  >
                    {loading ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        <span>Creating account...</span>
                      </>
                    ) : (
                      <span>Create Account</span>
                    )}
                  </button>
                </form>

                {/* Switch to Login */}
                <div className="mt-6 pt-5 border-t border-gray-100 dark:border-white/10 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Already have an account?{' '}
                    <button
                      onClick={() => {
                        onSwitchToLogin();
                        navigate('/login');
                      }}
                      className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-bold transition-colors"
                    >
                      Sign in
                    </button>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer text */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-6">
          © {new Date().getFullYear()} Telegram Translator — All rights reserved
        </p>
      </div>
    </div>
  );
}