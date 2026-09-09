import React, { useEffect, useState, useCallback } from 'react';
import Shell from '../components/Shell.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useStatus } from '../context/StatusContext.jsx';

const PANEL_HEIGHT = 620;
const API_BASE = 'http://localhost:8000';

export default function CamerasAlerts() {
  const { session, apiFetch } = useAuth();
  const isAdmin = session.role === 'ceo' || session.role === 'owner' || session.role === 'hr';
  const isAdmin = session.role === 'ceo' || session.role === 'owner';
  const { cameras } = useStatus();
  const [selected, setSelected] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [dismissTarget, setDismissTarget] = useState(null);
  const [snapshotView, setSnapshotView] = useState(null);
  const [detected, setDetected] = useState({});

    const loadIncidents = useCallback(async () => {
    const res = await apiFetch('/incidents?status=new');
    if (res.ok) setIncidents(await res.json());
  }, [apiFetch]);

  useEffect(() => {
    loadIncidents();
    const t = setInterval(loadIncidents, 5000);
    return () => clearInterval(t);
  }, [loadIncidents]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') setSelected(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      const res = await apiFetch('/status');
      if (res.ok && !cancelled) {
        const data = await res.json();
        const incoming = (data.currently_detected || []).filter(
          (d) => d.name && d.name.toLowerCase() !== 'unknown'
        );
        setDetected((prev) => {
          const next = { ...prev };
          incoming.forEach((d) => {
            next[`${d.name}|${d.camera}`] = d;
          });
          return next;
        });
      }
    }
    loadStatus();
    const id = setInterval(loadStatus, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [apiFetch]);

  const detectedList = Object.values(detected);

  async function acknowledge(id) {
    await apiFetch(`/incidents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'acknowledged' }),
    });
    loadIncidents();
  }

  async function confirmDismiss() {
    await apiFetch(`/incidents/${dismissTarget.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    });
    setDismissTarget(null);
    loadIncidents();
  }

  return (
    <Shell active="cameras" dark title="Cameras & Alerts">
      <div className="page-head">
        <span className="eyebrow">Live Monitoring</span>
        <h1>Cameras & alerts</h1>
        <p>{cameras.length} camera{cameras.length === 1 ? '' : 's'}, monitored continuously. Click a camera to enlarge it.</p>
      </div>

      <div className="two-col" style={{ gridTemplateColumns: '1fr 340px' }}>
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: PANEL_HEIGHT }}>
          <div className="panel-head" style={{ flexShrink: 0 }}><h2>Camera feeds</h2></div>
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
            <div className="cam-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {cameras.map((c) => (
                <div className="cam-tile" key={c.id} onClick={() => setSelected(c)}>
                  <div className="cam-feed">
                    <img
                      src={`${API_BASE}/video_feed/${c.id}?token=${encodeURIComponent(session.token)}`}
                      alt={c.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <div className={`cam-live ${c.live ? '' : 'offline'}`}>
                      <span className="rec-dot" />{c.live ? 'LIVE' : 'OFFLINE'}
                    </div>
                    <div className="cam-time mono">{c.id}</div>
                  </div>
                  <div className="cam-meta">
                    <div>
                      <div className="name">{c.name}</div>
                      <div className="zone">{c.location}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', height: PANEL_HEIGHT, gap: 20 }}>
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', flex: '0 0 auto' }}>
            <div className="panel-head" style={{ flexShrink: 0 }}>
              <h2>Currently detected</h2>
              <span className="eyebrow">{detectedList.length} on camera now</span>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 114, paddingRight: 4 }}>
              {detectedList.map((d, i) => (
                <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border, #2a2a2a)' }}>
                  {d.name}
                </div>
              ))}
              {detectedList.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No one currently detected.</p>
              )}
            </div>
          </div>

          <div className="panel" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div className="panel-head" style={{ flexShrink: 0 }}>
            <h2>Alerts</h2>
            <span className="eyebrow">{incidents.length} active</span>
          </div>
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
            {incidents.map((a) => (
              <div className="alert-item" key={a.id} onClick={() => a.snapshot_filename && setSnapshotView(a)} style={{ cursor: a.snapshot_filename ? 'pointer' : 'default' }}>
                <div className={`alert-sev ${a.priority === 'low' ? 'low' : ''}`} />
                <div className="alert-body" style={{ minWidth: 0 }}>
                  <div className="t" style={{ overflowWrap: 'break-word' }}>{a.person_name} — {a.alert_type}</div>
                  <div className="d" style={{ overflowWrap: 'break-word' }}>{a.alert_count} occurrence(s)</div>
                  {isAdmin && (
                    <div className="alert-actions">
                      <button className="btn btn-outline btn-sm" onClick={() => acknowledge(a.id)}>Acknowledge</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDismissTarget(a)}>Dismiss</button>
                    </div>
                  )}
                </div>
                <div className="alert-time mono">{new Date(a.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
            {incidents.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No active alerts.</p>}
          </div>
          </div>
        </div>
      </div>

      {selected && (
        <div
          className="cam-lightbox-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          <div className="cam-lightbox">
            <div className="cam-feed">
              <img
                src={`${API_BASE}/video_feed/${selected.id}?token=${encodeURIComponent(session.token)}`}
                alt={selected.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div className={`cam-live ${selected.live ? '' : 'offline'}`}>
                <span className="rec-dot" />{selected.live ? 'LIVE' : 'OFFLINE'}
              </div>
              <div className="cam-time mono">{selected.id}</div>
            </div>
            <div className="cam-lightbox-head">
              <div>
                <div className="name">{selected.name}</div>
                <div className="zone">{selected.location}</div>
              </div>
              <button className="cam-lightbox-close" onClick={() => setSelected(null)} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!dismissTarget}
        title="Dismiss alert"
        message={dismissTarget ? `Dismiss the alert for ${dismissTarget.person_name}? It will be removed from the active list.` : ''}
        confirmLabel="Dismiss"
        danger
        onConfirm={confirmDismiss}
        onCancel={() => setDismissTarget(null)}
      />
      {snapshotView && (
        <div className="cam-lightbox-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setSnapshotView(null); }}>
          <div className="cam-lightbox">
            <img
              src={snapshotView.snapshot_filename.startsWith('http') ? snapshotView.snapshot_filename : `http://localhost:8000${snapshotView.snapshot_filename}?token=${encodeURIComponent(session.token)}`}
              alt="Alert snapshot"
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
            <div className="cam-lightbox-head">
              <div>
                <div className="name">{snapshotView.person_name} — {snapshotView.alert_type}</div>
              </div>
              <button className="cam-lightbox-close" onClick={() => setSnapshotView(null)} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}