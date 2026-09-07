import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);
const SESSION_KEY = 'vaultwatch_session';

// Demo-only credentials. Replace with a real fetch('/api/login') call
// once a backend exists. Role-based UI hiding here is NOT real security —
// the backend must independently reject unauthorized roles.
const DEMO_USERS = [
  { username: 'admin', password: 'admin123', role: 'admin', name: 'S. Kapoor' },
  { username: 'employee', password: 'employee123', role: 'employee', name: 'R. Verma' },
  { username: 'hr', password: 'hr123', role: 'hr', name: 'N. Rao' },
  { username: 'guard', password: 'guard123', role: 'guard', name: 'V. Singh' },
];

export function dashboardFor(role) {
  if (role === 'admin') return '/admin-dashboard';
  if (role === 'hr') return '/hr-dashboard';
  if (role === 'guard') return '/guard-dashboard';
  return '/employee-dashboard';
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

  function login(username, password) {
    const match = DEMO_USERS.find(
      (u) => u.username === username.trim() && u.password === password
    );
    if (!match) {
      return { ok: false };
    }
    const nextSession = { role: match.role, name: match.name };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    return { ok: true, session: nextSession };
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
  }

  return (
    <AuthContext.Provider value={{ session, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}