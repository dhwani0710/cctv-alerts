import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Shell from '../components/Shell.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import AddCameraModal from '../components/AddCameraModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useStatus } from '../context/StatusContext.jsx';
import { GuardAckModal } from '../components/GuardAckModal';

const API_BASE = import.meta.env.VITE_API_BASE || `http://${window.location.hostname}:8000`;

const ALERT_TYPE_LABELS = {
  stranger: 'Unrecognized face',
  camera_offline: 'Camera offline',
  camera_tamper: 'Possible camera tampering',
  early_arrival: 'Early arrival',
  overstay: 'Overstay',
};
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const ZONE_COLORS = ['#C2703D', '#4F8FBF', '#57795F', '#9B6BC2', '#B8902F', '#BF4F7A'];
const STATUS_LABEL = { online: 'LIVE', offline: 'OFFLINE', tampered: 'TAMPERED' };

const GRID_GAP = 12;
const AUTO_MIN_TILE = 300; // preferred tile width for "Auto"
const COL_CHOICES = [1, 2, 3, 4]; // always shown, never hidden

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function alertTitle(a) {
  if (a.person_name && a.person_name.startsWith('Unknown@')) {
    return `Stranger - ${a.person_name.split('@')[1]}`;
  }
  return `${a.person_name} — ${ALERT_TYPE_LABELS[a.alert_type] || a.alert_type}`;
}

function zoneColor(zone = '') {
  let h = 0;
  for (const ch of zone) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ZONE_COLORS[h % ZONE_COLORS.length];
}

function camStatus(c) {
  return c.status || (c.live ? 'online' : 'offline');
}

function fmtTime(v) {
  return new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* measures the real width of an element, so Auto adapts to the space
   it actually has (phone, iPad portrait/landscape, desktop) */
function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}

function StatusBadge({ status }) {
  return (
    <div className={`cam-live ${status !== 'online' ? 'offline' : ''} cag-st-${status}`}>
      <span className="rec-dot" />{STATUS_LABEL[status]}
    </div>
  );
}

function StatusOverlay({ status }) {
  if (status === 'online') return null;
  return (
    <div className={`cag-overlay ${status}`}>
      {status === 'offline' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M2 2l20 20" /><rect x="2.5" y="7" width="14" height="11" rx="2" /><path d="M16.5 10.5 21 8v9" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17.5v.01" />
        </svg>
      )}
      {status === 'offline' ? 'Camera offline' : 'View blocked / tampered'}
    </div>
  );
}

export default function CamerasAlerts() {
  const { session, apiFetch } = useAuth();
  const isAdmin = session.role === 'ceo' || session.role === 'owner';
  const canAckAlerts = ['owner', 'ceo', 'admin', 'guard'].includes(session.role);
  const { cameras, refreshCameras } = useStatus();

  const [selected, setSelected] = useState(null);
  const [showAddCamera, setShowAddCamera] = useState(false);
  const [incidents, setIncidents] = useState([]);
  const [dismissTarget, setDismissTarget] = useState(null);
  const [ackModalAlert, setAckModalAlert] = useState(null);
  const [snapshotView, setSnapshotView] = useState(null);
  const [detected, setDetected] = useState({});
  const [deleteCamTarget, setDeleteCamTarget] = useState(null);
  const [editCamTarget, setEditCamTarget] = useState(null);
  const [deletingCam, setDeletingCam] = useState(false);

  const [zoneFilter, setZoneFilter] = useState('all');
  const [cols, setCols] = useState('auto');
  const [ratios, setRatios] = useState({});

  const [gridRef, gridWidth] = useElementWidth();

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
      if (e.key === 'Escape') { setSelected(null); setSnapshotView(null); }
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
        const next = {};
        incoming.forEach((d) => { next[d.name] = d; });
        setDetected(next);
      }
    }
    loadStatus();
    const id = setInterval(loadStatus, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [apiFetch]);

  const detectedList = Object.values(detected);

  const zones = useMemo(
    () => [...new Set(cameras.map((c) => c.zone_name).filter(Boolean))],
    [cameras]
  );
  const filtered = useMemo(
    () => (zoneFilter === 'all' ? cameras : cameras.filter((c) => c.zone_name === zoneFilter)),
    [cameras, zoneFilter]
  );
  const counts = useMemo(() => {
    const c = { online: 0, offline: 0, tampered: 0 };
    cameras.forEach((cam) => { c[camStatus(cam)] += 1; });
    return c;
  }, [cameras]);

  const sortedIncidents = useMemo(
    () => [...incidents].sort((a, b) => {
      const r = (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3);
      return r !== 0 ? r : new Date(b.last_seen) - new Date(a.last_seen);
    }),
    [incidents]
  );

  /* Auto: pick by camera count, capped by width.
     1x / 2x / 3x / 4x: always exactly what the user picked. */
  const autoCap = gridWidth
    ? clamp(Math.floor((gridWidth + GRID_GAP) / (AUTO_MIN_TILE + GRID_GAP)), 1, 4)
    : 4;
  const countCols = filtered.length <= 1 ? 1 : filtered.length <= 4 ? 2 : filtered.length <= 9 ? 3 : 4;
  const autoCols = Math.min(countCols, autoCap);
  const gridCols = cols === 'auto' ? autoCols : cols;

  const setRatio = useCallback((id, r) => {
    setRatios((p) => (Math.abs((p[id] || 0) - r) < 0.01 ? p : { ...p, [id]: r }));
  }, []);

  const feedSrc = (c) => `${API_BASE}/video_feed/${c.id}?token=${encodeURIComponent(session.token)}`;
  const snapSrc = (a) =>
    a.snapshot_filename.startsWith('http')
      ? a.snapshot_filename
      : `${API_BASE}${a.snapshot_filename}?token=${encodeURIComponent(session.token)}`;

  async function confirmDismiss() {
    await apiFetch(`/incidents/${dismissTarget.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    });
    setDismissTarget(null);
    loadIncidents();
  }

  async function confirmDeleteCam() {
    setDeletingCam(true);
    try {
      await apiFetch(`/cameras/${deleteCamTarget.id}`, { method: 'DELETE' });
      setDeleteCamTarget(null);
      refreshCameras();
    } finally {
      setDeletingCam(false);
    }
  }

  return (
    <Shell active="cameras" dark title="Cameras & Alerts">
      <div className="page-head">
        <span className="eyebrow">Live Monitoring</span>
        <h1>Cameras & alerts</h1>
        <p>{cameras.length} camera{cameras.length === 1 ? '' : 's'}, monitored continuously. Tap a camera to enlarge it.</p>
      </div>

      <div className="cag-layout">
        {/* ---------- CAMERA GRID ---------- */}
        <div className="panel cag-main">
          <div className="panel-head" style={{ flexShrink: 0 }}>
            <h2>Camera feeds</h2>
            {isAdmin && (
              <button className="btn btn-brass btn-sm" onClick={() => setShowAddCamera(true)}>
                + Add camera
              </button>
            )}
          </div>

          <div className="cag-toolbar">
            <button className={`cag-chip ${zoneFilter === 'all' ? 'active' : ''}`} onClick={() => setZoneFilter('all')}>
              All zones
            </button>
            {zones.map((z) => (
              <button
                key={z}
                className={`cag-chip ${zoneFilter === z ? 'active' : ''}`}
                onClick={() => setZoneFilter(z)}
              >
                <i style={{ background: zoneColor(z) }} />{z}
              </button>
            ))}
            <span className="cag-sep" />
            <span className="cag-cols">
              <button
                className={`cag-chip ${cols === 'auto' ? 'active' : ''}`}
                onClick={() => setCols('auto')}
                title="Grid columns"
              >
                Auto
              </button>
              {COL_CHOICES.map((n) => (
                <button
                  key={n}
                  className={`cag-chip ${cols === n ? 'active' : ''}`}
                  onClick={() => setCols(n)}
                  title="Grid columns"
                >
                  {n}×
                </button>
              ))}
            </span>
          </div>

          <div className="cag-stats" style={{ marginBottom: 10, flexShrink: 0 }}>
            <span><b>{counts.online}</b> online</span>
            <span className="off"><b>{counts.offline}</b> offline</span>
            <span className="tam"><b>{counts.tampered}</b> tampered</span>
          </div>

          <div className="cag-grid-scroll" ref={gridRef}>
            <div className="cag-grid" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
              {filtered.map((c) => {
                const st = camStatus(c);
                return (
                  <div
                    className={`cam-tile cag-tile ${st === 'tampered' ? 'is-tampered' : ''}`}
                    key={c.id}
                    onClick={() => setSelected(c)}
                  >
                    <div className="cam-feed" style={{ aspectRatio: ratios[c.id] || 16 / 9 }}>
                      {st !== 'offline' && (
                        <img
                          src={feedSrc(c)}
                          alt={c.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onLoad={(e) => {
                            const { naturalWidth: w, naturalHeight: h } = e.target;
                            if (w && h) setRatio(c.id, w / h);
                          }}
                        />
                      )}
                      <StatusOverlay status={st} />
                      <StatusBadge status={st} />
                      {c.zone_name && (
                        <div className="cag-zone-badge" style={{ background: zoneColor(c.zone_name) }}>
                          {c.zone_name}
                        </div>
                      )}
                      <div className="cam-time mono">{c.id}</div>
                    </div>
                    <div className="cam-meta">
                      <div style={{ minWidth: 0 }}>
                        <div className="name">{c.name}</div>
                        <div className="zone">{c.zone_name}</div>
                      </div>
                      {isAdmin && (
                        <div className="cam-actions">
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={(e) => { e.stopPropagation(); setEditCamTarget(c); }}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={(e) => { e.stopPropagation(); setDeleteCamTarget(c); }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {filtered.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No cameras in this zone.</p>
            )}
          </div>
        </div>

        {/* ---------- SIDEBAR ---------- */}
        <div className="cag-side">
          <div className="panel cag-detected">
            <div className="panel-head" style={{ marginBottom: 6 }}>
              <h2>Currently detected</h2>
              <span className="eyebrow">{detectedList.length} now</span>
            </div>
            <div style={{ maxHeight: 84, overflowY: 'auto' }}>
              {detectedList.map((d, i) => (
                <div className="row" key={i}>
                  {d.name} <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>· {d.camera}</span>
                </div>
              ))}
              {detectedList.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 12.5, margin: 0 }}>No one detected.</p>
              )}
            </div>
          </div>

          <div className="panel cag-alerts">
            <div className="panel-head" style={{ flexShrink: 0 }}>
              <h2>Alerts</h2>
              <span className="cag-live-tag"><span className="rec-dot" />LIVE · {incidents.length}</span>
            </div>
            <div className="cag-alerts-list">
              {sortedIncidents.map((a) => (
                <div className={`cag-inc p-${a.priority}`} key={a.id}>
                  {a.snapshot_filename && (
                    <img
                      className="cag-inc-thumb"
                      src={snapSrc(a)}
                      alt="snapshot"
                      onClick={() => setSnapshotView(a)}
                    />
                  )}
                  <div className="cag-inc-body">
                    <div className="cag-inc-top">
                      <span className={`pill p-${a.priority}`}>{a.priority}</span>
                      <span className="mono cag-inc-time">{fmtTime(a.last_seen)}</span>
                    </div>
                    <div className="cag-inc-title">{alertTitle(a)}</div>
                    <div className="cag-inc-meta">
                      {a.camera_name || '-'} · {a.zone_name || '-'} · ×{a.alert_count}
                    </div>
                    <div className="cag-inc-actions">
                      {canAckAlerts && (
                        <button className="btn btn-outline btn-sm" onClick={() => setAckModalAlert(a)}>
                          Acknowledge
                        </button>
                      )}
                      {isAdmin && (
                        <button className="btn btn-danger btn-sm" onClick={() => setDismissTarget(a)}>
                          Dismiss
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {incidents.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No active alerts.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- LIGHTBOX ---------- */}
            {/* ---------- LIGHTBOX ---------- */}
      {selected && (
        <div
          className="cam-lightbox-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          <div className="cam-lightbox">
            <div className="cam-lightbox-stage">
              <div
                className="cam-feed"
                style={{
                  aspectRatio: ratios[selected.id] || 16 / 9,
                  '--r': ratios[selected.id] || 16 / 9,
                }}
              >
                {camStatus(selected) !== 'offline' && (
                  <img
                    src={feedSrc(selected)}
                    alt={selected.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                )}
                <StatusOverlay status={camStatus(selected)} />
                <StatusBadge status={camStatus(selected)} />
                {selected.zone_name && (
                  <div className="cag-zone-badge" style={{ background: zoneColor(selected.zone_name) }}>
                    {selected.zone_name}
                  </div>
                )}
                <div className="cam-time mono">{selected.id}</div>
              </div>
            </div>
            <div className="cam-lightbox-head">
              <div>
                <div className="name">{selected.name}</div>
                <div className="zone">{selected.zone_name}</div>
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
        message={dismissTarget ? `Dismiss the alert for ${alertTitle(dismissTarget)}? It will be removed from the active list.` : ''}
        confirmLabel="Dismiss"
        danger
        onConfirm={confirmDismiss}
        onCancel={() => setDismissTarget(null)}
      />
      <ConfirmDialog
        open={!!deleteCamTarget}
        title="Delete camera"
        message={deleteCamTarget ? `Delete "${deleteCamTarget.name}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        danger
        loading={deletingCam}
        onConfirm={confirmDeleteCam}
        onCancel={() => setDeleteCamTarget(null)}
      />

      {showAddCamera && (
        <AddCameraModal onClose={() => setShowAddCamera(false)} onAdded={refreshCameras} />
      )}
      {editCamTarget && (
        <AddCameraModal
          editCamera={editCamTarget}
          onClose={() => setEditCamTarget(null)}
          onAdded={refreshCameras}
        />
      )}
      {ackModalAlert && (
        <GuardAckModal
          alert={ackModalAlert}
          onClose={() => setAckModalAlert(null)}
          onSuccess={loadIncidents}
        />
      )}
    </Shell>
  );
}