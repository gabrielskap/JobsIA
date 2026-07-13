import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, clearToken, getToken, setToken, getRefreshToken, setRefreshToken, clearRefreshToken } from '../lib/api';
import type { Profile } from '../types/database';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  profile: Profile | null;
  loading: boolean;
  login: (user: AuthUser, token: string, refreshToken: string, profile: Profile | null) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  login: () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api.get<{ user: AuthUser; profile: Profile | null }>('/auth/me')
      .then(({ user: u, profile: p }) => {
        setUser(u);
        if (p && u.role) {
          p.role = u.role;
        }
        setProfile(p);
      })
      .catch(() => { clearToken(); clearRefreshToken(); })
      .finally(() => setLoading(false));
  }, []);

  function login(u: AuthUser, token: string, refreshToken: string, p: Profile | null) {
    setToken(token);
    setRefreshToken(refreshToken);
    setUser(u);
    if (p && u.role) {
      p.role = u.role;
    }
    setProfile(p);
  }

  function signOut() {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      // Tentar invalidar no servidor, mas fazer logout localmente de qualquer forma
      api.post('/auth/logout', { refreshToken }).catch(err => {
        console.error('Erro ao realizar logout no servidor:', err);
      });
    }
    clearToken();
    clearRefreshToken();
    setUser(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
