import { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { API_BASE } from '../config/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSessionAndLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setUser(null);
    window.location.href = '/login';
  };

  /** Fetch with auth: on 401 tries refresh once; if refresh fails, redirects to login. */
  const authFetch = useCallback(async (url, options = {}) => {
    const token = localStorage.getItem('token');
    const headers = { ...options.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    let res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        clearSessionAndLogout();
        return res;
      }
      const refreshRes = await fetch(`${API_BASE}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!refreshRes.ok) {
        clearSessionAndLogout();
        return res;
      }
      const data = await refreshRes.json().catch(() => ({}));
      if (!data?.token) {
        clearSessionAndLogout();
        return res;
      }
      localStorage.setItem('token', data.token);
      res = await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${data.token}` } });
    }
    return res;
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        /* ignore */
      }
    }

    const tryMe = (accessToken) =>
      fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${accessToken}` } });

    let cancelled = false;
    tryMe(token)
      .then((res) => {
        if (res.status === 401) {
          const refreshToken = localStorage.getItem('refreshToken');
          if (!refreshToken) {
            clearSessionAndLogout();
            return null;
          }
          return fetch(`${API_BASE}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          })
            .then((r) => {
              if (!r.ok) {
                clearSessionAndLogout();
                return null;
              }
              return r.json();
            })
            .then((data) => {
              if (!data?.token) {
                clearSessionAndLogout();
                return null;
              }
              localStorage.setItem('token', data.token);
              return tryMe(data.token);
            });
        }
        return res;
      })
      .then((res) => {
        if (!res) return null;
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (cancelled || !data?.user) return;
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      })
      .catch(() => {
        /* keep cached user on network errors */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = (userData, token, refreshToken = null) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    if (refreshToken != null) localStorage.setItem('refreshToken', refreshToken);
    setUser(userData);
  };

  const logout = async () => {
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');

    try {
      await fetch(`${API_BASE}/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(refreshToken ? { refreshToken } : {})
      });
    } catch (error) {
      console.error('Logout API call failed:', error);
    }

    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

