import { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { useAuth } from '../context/AuthContext';

const PRIORITY_COLOR = {
  low: 'border-yellow-500 bg-yellow-500/10 text-yellow-500',
  medium: 'border-orange-500 bg-orange-500/10 text-orange-500',
  high: 'border-red-500 bg-red-500/10 text-red-500'
};

export const DashboardPage = () => {
  const { user, apiFetch } = useAuth();
  const [detected, setDetected] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [toastAlert, setToastAlert] = useState(null);
  const lastToastedRef = useRef(null);
  const toastTimerRef = useRef(null);

  const token = user?.token || '';
  const videoSrc = token ? `/video_feed/cam1?token=${encodeURIComponent(token)}` : '';

  const showToast = useCallback((alert) => {
    setToastAlert(alert);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastAlert(null);
    }, 6000);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/status');
      if (!res.ok) return;
      const data = await res.json();
      setDetected(data.currently_detected || []);
      setAlerts(data.recent_alerts || []);

      if (data.recent_alerts && data.recent_alerts.length > 0) {
        const newest = data.recent_alerts[0];
        if (newest.timestamp !== lastToastedRef.current) {
          lastToastedRef.current = newest.timestamp;
          showToast(newest);
        }
      }
    } catch (err) {
      console.error('Error fetching dashboard status:', err);
    }
  }, [apiFetch, showToast]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => {
      clearInterval(interval);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [fetchStatus]);

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Cameras & Alerts" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0 p-4">
          {/* Live Camera View */}
          <div className="md:col-span-2 relative bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] overflow-hidden flex items-center justify-center">
            {videoSrc ? (
              <img
                src={videoSrc}
                alt="Live Camera Feed"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-slate-500">Connecting to stream...</div>
            )}

            {toastAlert && (
              <div
                className={`absolute top-3 left-3 right-3 border-l-4 rounded px-3 py-2 shadow-lg backdrop-blur-sm z-10 transition ${PRIORITY_COLOR[toastAlert.priority] || PRIORITY_COLOR.low
                  }`}
              >
                <span className="font-semibold uppercase text-xs mr-2">{toastAlert.priority}</span>
                <span>{toastAlert.message}</span>
              </div>
            )}
          </div>

          {/* Right Sidebar: Active Detection & Alerts */}
          <div className="flex flex-col gap-3 min-h-0">
            {/* Currently Detected */}
            <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] p-3 shrink-0">
              <h2 className="font-semibold mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Currently Detected
              </h2>
              <div className="space-y-1 text-sm max-h-32 overflow-y-auto">
                {detected.length > 0 ? (
                  detected.map((d, i) => (
                    <div
                      key={i}
                      className="bg-[var(--bg-page)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs flex justify-between"
                    >
                      <span>{d.name}</span>
                      <span className="text-slate-500">{d.camera}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-[var(--text-muted)] text-xs">No one detected in view</div>
                )}
              </div>
            </div>

            {/* Monitoring Info */}
            <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] p-3 text-sm text-[var(--text-muted)] shrink-0">
              <div>Store hours: Monitored 24/7</div>
            </div>

            {/* Live Alerts */}
            <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] p-3 flex-1 min-h-0 flex flex-col">
              <h2 className="font-semibold mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)] shrink-0">
                Live Alerts
              </h2>
              <div className="space-y-1 overflow-y-auto text-sm flex-1">
                {alerts.length > 0 ? (
                  alerts.map((a, i) => {
                    const time = new Date(a.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                    const snapshotUrl = a.snapshot_filename
                      ? (a.snapshot_filename.startsWith('http') ? a.snapshot_filename : `${a.snapshot_filename}?token=${encodeURIComponent(token)}`)
                      : null;

                    return (
                      <div
                        key={i}
                        className={`border-l-4 ${PRIORITY_COLOR[a.priority] || 'border-slate-500'
                          } rounded px-3 py-2 flex justify-between items-center gap-2`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {snapshotUrl && (
                            <img
                              src={snapshotUrl}
                              alt="Snapshot"
                              className="w-10 h-10 object-cover rounded cursor-pointer shrink-0"
                              onClick={() => window.open(snapshotUrl, '_blank')}
                            />
                          )}
                          <div className="min-w-0">
                            <span className="text-[10px] text-[var(--text-muted)] block">{time}</span>
                            <span className="text-xs text-slate-200">{a.message}</span>
                          </div>
                        </div>
                        <span className="uppercase text-[10px] font-semibold shrink-0">{a.priority}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-[var(--text-muted)] text-xs">No active security alerts</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
