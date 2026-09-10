import React, { createContext, useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext(null);

function loadUser() {
  const token = localStorage.getItem('cctv_auth_token');
  const role = localStorage.getItem('cctv_user_role');
  const username = localStorage.getItem('cctv_username');
  if (!token || !role) return null;
  return { token, role, username };
}

export function dashboardFor(role) {
  const r = (role || '').toLowerCase();
  if (r === 'hr' || r === 'manager') return '/attendance';
  return '/dashboard';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadUser);
  const navigate = useNavigate();

  const login = async (username, password) => {
    let res;
    try {
      res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
    } catch (netErr) {
      throw new Error('Could not connect to backend server. Please check if backend is running on port 8000.');
    }

    let data = {};
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      if (!res.ok) {
        throw new Error(`Server returned error (${res.status}): ${text.slice(0, 100)}`);
      }
      throw new Error('Invalid response format from server');
    }

    if (!res.ok || !data.ok) {
      throw new Error(data.error || data.detail || 'Authentication failed: Incorrect credentials');
    }

    const authData = {
      token: data.token,
      role: (data.role || '').toLowerCase(),
      username: data.username,
      name: data.name,
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

  const apiFetch = async (url, options = {}) => {
    const headers = {
      ...(options.headers || {}),
      ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) logout();
    return res;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, apiFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
