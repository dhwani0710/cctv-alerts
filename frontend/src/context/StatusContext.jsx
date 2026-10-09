import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext.jsx';

const StatusContext = createContext(null);

// Roles allowed by the backend on /status and /cameras (require_guard)
const POLLING_ROLES = ['owner', 'ceo', 'guard'];

export function StatusProvider({ children }) {
  const { apiFetch, session } = useAuth();
  const [status, setStatus] = useState({ recent_alerts: [], currently_detected: [] });
  const [cameras, setCameras] = useState([]);

  const role = String(session?.role || '').toLowerCase();
  const canPoll = !!session && POLLING_ROLES.includes(role);

  const poll = useCallback(async () => {
    if (!canPoll) return;
    try {
      const [statusRes, camRes] = await Promise.all([
        apiFetch('/status'),
        apiFetch('/cameras'),
      ]);
      if (statusRes.ok) setStatus(await statusRes.json());
      if (camRes.ok) setCameras(await camRes.json());
    } catch {}
  }, [apiFetch, canPoll]);

  const refreshCameras = useCallback(async () => {
    if (!canPoll) return;
    try {
      const res = await apiFetch('/cameras');
      if (res.ok) setCameras(await res.json());
    } catch {}
  }, [apiFetch, canPoll]);

  useEffect(() => {
    if (!canPoll) return;
    poll();
    const t = setInterval(poll, 10000);
    return () => clearInterval(t);
  }, [poll, canPoll]);

  const recentAlerts = status.recent_alerts || [];
  const hasHighAlert = recentAlerts.some((a) => a.priority === 'high');

  return (
    <StatusContext.Provider value={{ status, recentAlerts, hasHighAlert, currentlyDetected: status.currently_detected || [], cameras, refreshCameras }}>
      {children}
    </StatusContext.Provider>
  );
}

export function useStatus() {
  const ctx = useContext(StatusContext);
  if (!ctx) throw new Error('useStatus must be used within StatusProvider');
  return ctx;
}