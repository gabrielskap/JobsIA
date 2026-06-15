import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, clearToken, getToken, setToken } from '../lib/api';
import type { Profile } from '../types/database';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  profile: Profile | null;
  loading: boolean;
  login: (user: AuthUser, token: string) => void;
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
      .then(({ user: u, profile: p }) => { setUser(u); setProfile(p); })
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  function login(u: AuthUser, token: string) {
    setToken(token);
    setUser(u);
  }

  function signOut() {
    clearToken();
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
