import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext.jsx';

const StatusContext = createContext(null);

export function StatusProvider({ children }) {
  const { apiFetch, session } = useAuth();
  const [status, setStatus] = useState({ recent_alerts: [], currently_detected: [] });
  const [cameras, setCameras] = useState([]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    async function poll() {
      try {
        const [statusRes, camRes] = await Promise.all([
          apiFetch('/status'),
          apiFetch('/cameras'),
        ]);
        if (!cancelled) {
          if (statusRes.ok) setStatus(await statusRes.json());
          if (camRes.ok) setCameras(await camRes.json());
        }
      } catch {}
    }
    poll();
    const t = setInterval(poll, 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, [apiFetch, session]);

  const recentAlerts = status.recent_alerts || [];
  const hasHighAlert = recentAlerts.some((a) => a.priority === 'high');

  return (
    <StatusContext.Provider value={{ status, recentAlerts, hasHighAlert, currentlyDetected: status.currently_detected || [], cameras }}>
      {children}
    </StatusContext.Provider>
  );
}

export function useStatus() {
  const ctx = useContext(StatusContext);
  if (!ctx) throw new Error('useStatus must be used within StatusProvider');
  return ctx;
}