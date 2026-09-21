import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);
const SESSION_KEY = 'vaultwatch_session';
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

export function dashboardFor(role) {
  if (role === 'ceo' || role === 'owner') return '/admin-dashboard';
  if (role === 'hr') return '/hr-dashboard';
  if (role === 'guard') return '/guard-dashboard';
  return '/login';
}

function loadSession() {
  try {
    // Check localStorage first (set when user chose "Remember this device"),
    // then fall back to sessionStorage (standard tab-scoped session).
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession);

  async function login(username, password, rememberMe = false) {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, remember_me: rememberMe }),
      });
      const data = await res.json();
      if (!data.ok) return { ok: false };

      const next = {
        username: data.username,
        role: data.role,
        token: data.token,
        loggedInAt: Date.now(),
      };
      // Persist to the appropriate store based on user choice
      const store = rememberMe ? localStorage : sessionStorage;
      store.setItem(SESSION_KEY, JSON.stringify(next));
      setSession(next);
      return { ok: true, session: next };
    } catch (err) {
      return { ok: false };
    }
  }

  function logout() {
    // Clear both stores — covers both remembered and non-remembered sessions
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
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
    <AuthContext.Provider value={{ session, user: session, login, logout, apiFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}