import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext.jsx';

const StatusContext = createContext(null);

export function StatusProvider({ children }) {
  const { apiFetch, session } = useAuth();
  const [status, setStatus] = useState({ recent_alerts: [], currently_detected: [] });
  const [cameras, setCameras] = useState([]);

  const poll = useCallback(async () => {
    try {
      const [statusRes, camRes] = await Promise.all([
        apiFetch('/status'),
        apiFetch('/cameras'),
      ]);
      if (statusRes.ok) setStatus(await statusRes.json());
      if (camRes.ok) setCameras(await camRes.json());
    } catch {}
  }, [apiFetch]);

  const refreshCameras = useCallback(async () => {
    try {
      const res = await apiFetch('/cameras');
      if (res.ok) setCameras(await res.json());
    } catch {}
  }, [apiFetch]);

  useEffect(() => {
    if (!session) return;
    poll();
    const t = setInterval(poll, 10000);
    return () => clearInterval(t);
  }, [poll, session]);

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