import { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { useAuth } from '../context/AuthContext';
import { GuardAckModal } from '../components/GuardAckModal';

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
  const [ackModalAlert, setAckModalAlert] = useState(null);
  const [lightboxImg, setLightboxImg] = useState(null);
  const lastToastedRef = useRef(null);
  const toastTimerRef = useRef(null);

  const token = user?.token || '';
  const videoSrc = token ? `/video_feed/cam1?token=${encodeURIComponent(token)}` : '';
  const role = (user?.role || '').toLowerCase();
  const canAckAlerts = ['owner', 'ceo', 'admin', 'guard'].includes(role);

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
        if (newest.timestamp !== lastToastedRef.current && newest.status !== 'acknowledged') {
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
        <Topbar title="Live Monitoring & Security Feeds" />
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

            <div className="absolute top-3 left-3 bg-red-600/90 text-white text-[11px] font-mono font-bold px-2 py-0.5 rounded shadow flex items-center gap-1.5 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
              <span>LIVE CAM 1</span>
            </div>

            {toastAlert && (
              <div
                className={`absolute bottom-3 left-3 right-3 border-l-4 rounded-lg px-4 py-3 shadow-2xl backdrop-blur-md z-10 transition flex items-center justify-between gap-3 ${
                  PRIORITY_COLOR[toastAlert.priority] || PRIORITY_COLOR.low
                }`}
              >
                <div>
                  <span className="font-bold uppercase text-xs mr-2">{toastAlert.priority} ALERT:</span>
                  <span className="text-xs font-medium">{toastAlert.message}</span>
                </div>
                {canAckAlerts && toastAlert.status !== 'acknowledged' && (
                  <button
                    onClick={() => setAckModalAlert(toastAlert)}
                    className="bg-amber-600 hover:bg-amber-500 text-slate-950 px-3 py-1 rounded text-xs font-bold shrink-0 shadow transition"
                  >
                    Acknowledge
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right Sidebar: Active Detection & Alerts */}
          <div className="flex flex-col gap-3 min-h-0">
            {/* Currently Detected */}
            <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] p-3 shrink-0">
              <h2 className="font-semibold mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)] flex items-center justify-between">
                <span>Currently in View</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              </h2>
              <div className="space-y-1 text-sm max-h-32 overflow-y-auto">
                {detected.length > 0 ? (
                  detected.map((d, i) => (
                    <div
                      key={i}
                      className="bg-[var(--bg-page)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs flex justify-between items-center"
                    >
                      <span className="font-semibold text-slate-100">{d.name}</span>
                      <span className="text-[11px] text-[var(--text-muted)] font-mono">{d.camera}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-[var(--text-muted)] text-xs py-2 text-center">No active detections</div>
                )}
              </div>
            </div>

            {/* Live Alerts List with Proof of Acknowledgment */}
            <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] p-3 flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <h2 className="font-semibold text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  Security Alerts
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg-panel-3)] text-slate-300">
                  {alerts.length} total
                </span>
              </div>

              <div className="space-y-2 overflow-y-auto text-sm flex-1 pr-1">
                {alerts.length > 0 ? (
                  alerts.map((a, i) => {
                    const time = new Date(a.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                    const isAck = a.status === 'acknowledged';
                    const snapshotUrl = a.snapshot_filename
                      ? (a.snapshot_filename.startsWith('http') ? a.snapshot_filename : `${a.snapshot_filename}?token=${encodeURIComponent(token)}`)
                      : null;
                    const proofUrl = a.ack_proof_image
                      ? (a.ack_proof_image.startsWith('http') ? a.ack_proof_image : `${a.ack_proof_image}?token=${encodeURIComponent(token)}`)
                      : null;

                    return (
                      <div
                        key={a.id || i}
                        className={`border-l-4 ${
                          isAck ? 'border-emerald-500 bg-emerald-500/5' : (PRIORITY_COLOR[a.priority] || 'border-slate-500')
                        } rounded-lg p-2.5 transition space-y-2 bg-[var(--bg-page)]/70 border border-[var(--border-color)]`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {snapshotUrl && (
                              <img
                                src={snapshotUrl}
                                alt="Alert snapshot"
                                className="w-11 h-11 object-cover rounded cursor-pointer shrink-0 border border-slate-700 hover:opacity-80 transition"
                                onClick={() => setLightboxImg(snapshotUrl)}
                                title="Click to enlarge detection snapshot"
                              />
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-[var(--text-muted)] font-mono">{time}</span>
                                {isAck && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold uppercase tracking-wider">
                                    ✓ Acknowledged
                                  </span>
                                )}
                              </div>
                              <span className="text-xs font-medium text-slate-100 block truncate">{a.message}</span>
                            </div>
                          </div>
                          
                          <span className="uppercase text-[9px] font-bold shrink-0 px-1.5 py-0.5 rounded border border-slate-700">
                            {a.priority}
                          </span>
                        </div>

                        {/* Acknowledgment Info & Actions */}
                        {isAck ? (
                          <div className="bg-slate-900/60 rounded p-2 text-[11px] border border-slate-800 space-y-1">
                            <div className="flex justify-between text-slate-400 text-[10px]">
                              <span>Guard: <strong className="text-slate-200">{a.acknowledged_by || 'Staff'}</strong></span>
                              <span>{a.acknowledged_at ? new Date(a.acknowledged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                            </div>
                            {a.ack_notes && (
                              <div className="text-slate-300 italic text-[11px]">
                                "{a.ack_notes}"
                              </div>
                            )}
                            {proofUrl && (
                              <div className="pt-1 flex items-center gap-1.5">
                                <span className="text-[10px] text-amber-400 font-medium">Verified Proof:</span>
                                <button
                                  type="button"
                                  onClick={() => setLightboxImg(proofUrl)}
                                  className="text-[10px] text-amber-300 underline hover:text-amber-200"
                                >
                                  View Guard Photo
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          canAckAlerts && (
                            <div className="flex justify-end pt-1">
                              <button
                                onClick={() => setAckModalAlert(a)}
                                className="text-[11px] bg-amber-600 hover:bg-amber-500 text-slate-950 px-2.5 py-1 rounded font-bold transition shadow flex items-center gap-1"
                              >
                                <span>🛡️</span>
                                <span>Acknowledge Protocol</span>
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-[var(--text-muted)] text-xs py-8 text-center">No active security alerts</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Guard Acknowledgment Modal */}
      {ackModalAlert && (
        <GuardAckModal
          alert={ackModalAlert}
          onClose={() => setAckModalAlert(null)}
          onSuccess={fetchStatus}
        />
      )}

      {/* Lightbox Preview */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightboxImg(null)}
        >
          <div className="relative max-w-2xl max-h-[85vh]">
            <img src={lightboxImg} alt="Preview" className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain" />
            <button
              onClick={() => setLightboxImg(null)}
              className="absolute -top-3 -right-3 bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold shadow-lg"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
