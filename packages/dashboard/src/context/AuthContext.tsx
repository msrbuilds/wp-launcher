import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSettings } from './SettingsContext';

interface User {
  id: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  logout: () => {},
  isAuthenticated: false,
  isAdmin: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { appMode, loading: settingsLoading } = useSettings();
  const [user, setUser] = useState<User | null>(null);

  // Auto-login for local mode
  useEffect(() => {
    if (settingsLoading) return;
    if (appMode === 'local' && !user) {
      fetch('/api/auth/local-token', { method: 'POST', credentials: 'include' })
        .then((res) => res.json())
        .then((data) => setUser(data.user))
        .catch(() => {});
    }
  }, [appMode, settingsLoading]);

  // Validate auth on mount via httpOnly cookie
  useEffect(() => {
    if (settingsLoading) return;
    if (appMode === 'local') return;

    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Invalid session');
        return res.json();
      })
      .then((data) => setUser(data))
      .catch(() => setUser(null));
  }, [settingsLoading, appMode]);

  function login(newUser: User) {
    setUser(newUser);
  }

  function logout() {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
