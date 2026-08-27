import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('cctv_auth_token');
    const role = localStorage.getItem('cctv_user_role');
    const username = localStorage.getItem('cctv_username');
    if (!token) return null;
    return { token, role, username };
  });

  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const login = async (username, password) => {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || data.detail || 'Authentication failed');
    }

    const authData = {
      token: data.token,
      role: data.role.toLowerCase(),
      username: data.username
    };

    localStorage.setItem('cctv_auth_token', authData.token);
    localStorage.setItem('cctv_user_role', authData.role);
    localStorage.setItem('cctv_username', authData.username);

    setUser(authData);
    return authData;
  };

  const logout = () => {
    localStorage.removeItem('cctv_auth_token');
    localStorage.removeItem('cctv_user_role');
    localStorage.removeItem('cctv_username');
    setUser(null);
    navigate('/login');
  };

  const getDefaultRedirect = (role) => {
    const r = (role || '').toLowerCase();
    if (r === 'guard') return '/dashboard';
    return '/admin';
  };

  const apiFetch = async (url, options = {}) => {
    const headers = {
      ...(options.headers || {}),
      ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {})
    };

    try {
      const res = await fetch(url, { ...options, headers });
      if (res.status === 401) {
        logout();
      }
      return res;
    } catch (err) {
      console.error('API Fetch error:', err);
      throw err;
    }
  };

  return (
    <AuthContext.Provider value={{ user, theme, toggleTheme, login, logout, getDefaultRedirect, apiFetch }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
