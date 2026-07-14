const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function setToken(token: string): void {
  localStorage.setItem('auth_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('auth_token');
}

export function getRefreshToken(): string | null {
  return localStorage.getItem('auth_refresh_token');
}

export function setRefreshToken(token: string): void {
  localStorage.setItem('auth_refresh_token', token);
}

export function clearRefreshToken(): void {
  localStorage.removeItem('auth_refresh_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && !path.startsWith('/auth/')) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json() as { token: string; refreshToken: string };
          setToken(data.token);
          setRefreshToken(data.refreshToken);
          
          headers['Authorization'] = `Bearer ${data.token}`;
          res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
        } else {
          clearToken();
          clearRefreshToken();
          window.location.href = '/login';
        }
      } catch (err) {
        clearToken();
        clearRefreshToken();
        window.location.href = '/login';
      }
    } else {
      clearToken();
      clearRefreshToken();
      window.location.href = '/login';
    }
  }

  if (res.status === 204) return undefined as T;
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || res.statusText);
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
