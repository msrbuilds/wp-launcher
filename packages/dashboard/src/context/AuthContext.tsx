import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSettings } from './SettingsContext';
import { apiFetch } from '../utils/api';

interface User {
  id: string;
  email: string;
  role: string;
  name?: string;
  avatarUrl?: string;
  pendingEmail?: string;
}

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
  /**
   * True until the session cookie has been checked against the API. Consumers
   * must not treat `isAuthenticated: false` as "signed out" while this is set —
   * on a page reload the check is in flight and the user simply is not known
   * yet, so acting on it flashes a sign-in prompt at an authenticated user.
   */
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  logout: () => {},
  refreshUser: async () => {},
  isAuthenticated: false,
  isAdmin: false,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { loading: settingsLoading } = useSettings();
  const [user, setUser] = useState<User | null>(null);
  // Starts true and stays true while settings are still loading, because the
  // session check below has not run yet at that point either.
  const [loading, setLoading] = useState(true);

  // Validate auth on mount via httpOnly cookie
  useEffect(() => {
    if (settingsLoading) return;

    apiFetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) throw new Error('Invalid session');
        return res.json();
      })
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [settingsLoading]);

  function login(newUser: User) {
    setUser(newUser);
  }

  // Re-fetch the signed-in user after a profile/avatar/email change so the
  // topbar and account page reflect it without a full reload.
  async function refreshUser() {
    try {
      const res = await apiFetch('/api/auth/me');
      if (res.ok) setUser(await res.json());
    } catch {
      // Leave the current user in place on a transient failure.
    }
  }

  function logout() {
    apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  const isAdmin = user?.role === 'admin' || user?.role === 'owner';

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser, isAuthenticated: !!user, isAdmin, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
