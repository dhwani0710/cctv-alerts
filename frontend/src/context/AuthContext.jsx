import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);
const SESSION_KEY = 'vaultwatch_session';
const API_BASE = 'http://localhost:8000';

export function dashboardFor(role) {
  if (role === 'ceo' || role === 'owner') return '/admin-dashboard';
  if (role === 'hr') return '/hr-dashboard';
  if (role === 'guard') return '/guard-dashboard';
  return '/login';
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.role || !parsed.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession);

  async function login(username, password) {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!data.ok) return { ok: false };

      const next = {
        username: data.username,
        role: data.role,
        name: data.name,
        token: data.token,
        loggedInAt: Date.now(),
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      setSession(next);
      return { ok: true, session: next };
    } catch (err) {
      return { ok: false };
    }
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
  }

  async function apiFetch(path, options = {}) {
    const headers = {
      ...(options.headers || {}),
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
    };
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (res.status === 401) logout();
    return res;
  }

  return (
    <AuthContext.Provider value={{ session, login, logout, apiFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}