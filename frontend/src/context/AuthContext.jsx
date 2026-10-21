import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);
const SESSION_KEY = 'vaultwatch_session';
const OFFICE_KEY = 'vaultwatch_office';
const API_BASE = import.meta.env.VITE_API_BASE || (window.location.protocol === 'https:' ? `https://${window.location.hostname}:8443` : `http://${window.location.hostname}:8000`);

// Roles that see every office. Only guard is locked to one office. Keep in sync with auth.py.
export const SUPER_ADMIN_ROLES = ['owner', 'ceo', 'hr'];

export function dashboardFor(role) {
  if (role === 'ceo' || role === 'owner') return '/admin-dashboard';
  if (role === 'hr') return '/hr-dashboard';
  if (role === 'guard') return '/guard-dashboard';
  return '/login';
}

function loadSession() {
  try {
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
  const [offices, setOffices] = useState([]);
  const [selectedOffice, setSelectedOfficeState] = useState(
    () => localStorage.getItem(OFFICE_KEY) || 'all'
  );

  function setSelectedOffice(v) {
    const val = String(v);
    localStorage.setItem(OFFICE_KEY, val);
    setSelectedOfficeState(val);
  }

  async function login(username, password, rememberMe = false) {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, remember_me: rememberMe }),
      });

      // A cold-starting or crashed backend answers with 5xx (often HTML), which is
      // a server problem, not a wrong password.
      if (res.status >= 500) return { ok: false, network: true };

      const data = await res.json();
      if (!data.ok) return { ok: false };

      const next = {
        username: data.username,
        role: data.role,
        token: data.token,
        officeId: data.office_id ?? null,
        officeName: data.office_name ?? null,
        loggedInAt: Date.now(),
      };
      const store = rememberMe ? localStorage : sessionStorage;
      store.setItem(SESSION_KEY, JSON.stringify(next));
      setSession(next);
      return { ok: true, session: next };
    } catch (err) {
      return { ok: false, network: true };
    }
  }

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  function updateSession(updates) {
    if (!session) return;
    const next = { ...session, ...updates };
    const store = localStorage.getItem(SESSION_KEY) ? localStorage : sessionStorage;
    store.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
  }

  const token = session?.token;
  const role = String(session?.role || '').toLowerCase();
  const isGuard = role === 'guard';

  const apiFetch = useCallback(async (path, options = {}) => {
    const headers = {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Guard: server ignores this and forces the guard's own office.
      ...(!isGuard && selectedOffice !== 'all' ? { 'X-Office-Id': selectedOffice } : {}),
    };
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (res.status === 401) logout();
    return res;
  }, [token, logout, isGuard, selectedOffice]);

  useEffect(() => {
    if (!token) { setOffices([]); return; }
    fetch(`${API_BASE}/offices`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then(setOffices)
      .catch(() => setOffices([]));
  }, [token]);

  const isSuperAdmin = !!session && SUPER_ADMIN_ROLES.includes(role);
  const officeId = session?.officeId ?? null;

  // UI-level check only. The backend enforces the real rule.
  const canAccessOffice = useCallback(
    (id) => isSuperAdmin || (officeId != null && String(officeId) === String(id)),
    [isSuperAdmin, officeId]
  );

  const value = useMemo(
    () => ({
      session,
      user: session,
      login,
      logout,
      updateSession,
      apiFetch,
      isSuperAdmin,
      isGuard,
      officeId,
      canAccessOffice,
      offices,
      selectedOffice,
      setSelectedOffice,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, apiFetch, isSuperAdmin, isGuard, officeId, canAccessOffice, logout, offices, selectedOffice]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}