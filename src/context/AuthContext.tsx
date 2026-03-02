import React, { createContext, useContext, useState, useEffect } from 'react';
import Cookies from 'js-cookie';
import { authAPI } from '../services/api';
import type { User, AuthState } from '../types';

interface AuthContextType extends AuthState {
    login: (username: string, password: string) => Promise<void>;
    register: (username: string, password: string, email?: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [authState, setAuthState] = useState<AuthState>({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: true,
    });

    useEffect(() => {
        const initAuth = async () => {
            const token = Cookies.get('auth_token');
            if (token) {
                // Set token immediately so the app can start (interceptor will use it)
                setAuthState(prev => ({ ...prev, token, isAuthenticated: true }));

                try {
                    const user: User = await authAPI.me();
                    setAuthState({
                        user,
                        token,
                        isAuthenticated: true,
                        isLoading: false,
                    });
                } catch (error) {
                    console.error("Auth initialization failed:", error);
                    Cookies.remove('auth_token', { path: '/' });
                    setAuthState({
                        user: null,
                        token: null,
                        isAuthenticated: false,
                        isLoading: false,
                    });
                }
            } else {
                setAuthState(prev => ({ ...prev, isLoading: false }));
            }
        };

        initAuth();
    }, []);

    const login = async (username: string, password: string): Promise<void> => {
        try {
            const { access_token } = await authAPI.login(username, password);
            // ALWAYS use path: '/' to ensure cookie is available across the entire site
            Cookies.set('auth_token', access_token, { expires: 7, path: '/' });

            const user = await authAPI.me();

            setAuthState({
                user,
                token: access_token,
                isAuthenticated: true,
                isLoading: false,
            });

            // Navigate to home after state is set
            window.location.href = '/';
        } catch (error) {
            throw error;
        }
    };

    const register = async (username: string, password: string, email?: string): Promise<void> => {
        try {
            const { access_token } = await authAPI.register(username, password, email);
            Cookies.set('auth_token', access_token, { expires: 7, path: '/' });

            const user = await authAPI.me();

            setAuthState({
                user,
                token: access_token,
                isAuthenticated: true,
                isLoading: false,
            });

            window.location.href = '/';
        } catch (error) {
            throw error;
        }
    };

    const logout = (): void => {
        Cookies.remove('auth_token', { path: '/' });
        setAuthState({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
        });
        window.location.href = '/login';
    };

    return (
        <AuthContext.Provider value={{ ...authState, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
