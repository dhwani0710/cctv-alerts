import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);
const SESSION_KEY = 'vaultwatch_session';

/*
 * DEMO / MOCK AUTH ONLY. Replace `login()` below with a real fetch()
 * to your backend when it's ready — see the comment inside it.
 * IMPORTANT: the backend must independently reject an employee's
 * token on any admin-only endpoint. This context only controls what
 * the UI shows; it can't stop someone calling an admin API route
 * directly. Real enforcement belongs on the server.
 */
const DEMO_USERS = [
  { username: 'admin', password: 'admin123', role: 'admin', name: 'S. Kapoor' },
  { username: 'employee', password: 'employee123', role: 'employee', name: 'R. Verma' },
];

function readSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function dashboardFor(role) {
  return role === 'admin' ? '/admin-dashboard' : '/employee-dashboard';
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession);

  function login(username, password) {
    // TO WIRE UP A REAL BACKEND:
    //   const res = await fetch('/api/login', { method:'POST',
    //     headers:{'Content-Type':'application/json'},
    //     body: JSON.stringify({ username, password }) });
    //   const data = await res.json();
    //   if (!data.ok) return { ok:false };
    //   store data.token instead of a plain session object.
    const match = DEMO_USERS.find(
      (u) => u.username === username.trim() && u.password === password
    );
    if (!match) return { ok: false };
    const next = { username: match.username, role: match.role, name: match.name, loggedInAt: Date.now() };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
    return { ok: true, session: next };
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
  return useContext(AuthContext);
}
