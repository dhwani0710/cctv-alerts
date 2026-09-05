import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);
<<<<<<< Updated upstream
const SESSION_KEY = 'vaultwatch_session';
const API_BASE = 'http://localhost:8000';
=======

// Demo-only credentials. Replace with a real fetch('/api/login') call
// once a backend exists. Role-based UI hiding here is NOT real security —
// the backend must independently reject unauthorized roles.
const DEMO_USERS = [
  { username: 'admin', password: 'admin123', role: 'admin', name: 'S. Kapoor' },
  { username: 'employee', password: 'employee123', role: 'employee', name: 'R. Verma' },
  { username: 'hr', password: 'hr123', role: 'hr', name: 'N. Rao' },
  { username: 'guard', password: 'guard123', role: 'guard', name: 'V. Singh' },
];
>>>>>>> Stashed changes

export function dashboardFor(role) {
  if (role === 'admin') return '/admin-dashboard';
  if (role === 'hr') return '/hr-dashboard';
  if (role === 'guard') return '/guard-dashboard';
  return '/employee-dashboard';
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem('vaultwatch_session');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession);

<<<<<<< Updated upstream
  async function login(username, password) {
    try {
      const res = await fetch(`${API_BASE}/login`, {
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
=======
  function login(username, password) {
    const match = DEMO_USERS.find(
      (u) => u.username === username && u.password === password
    );
    if (!match) return { ok: false };
    const nextSession = { role: match.role, name: match.name };
    sessionStorage.setItem('vaultwatch_session', JSON.stringify(nextSession));
    setSession(nextSession);
    return { ok: true, session: nextSession };
>>>>>>> Stashed changes
  }

  function logout() {
    sessionStorage.removeItem('vaultwatch_session');
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
<<<<<<< Updated upstream
  return useContext(AuthContext);
=======
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
>>>>>>> Stashed changes
}