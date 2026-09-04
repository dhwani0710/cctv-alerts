import React, { useEffect, useState } from 'react';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { MOCK_CAMERAS, MOCK_ALERTS } from '../data/mockData.js';

const PANEL_HEIGHT = 620;

export default function CamerasAlerts() {
  const { session } = useAuth();
  const isAdmin = session.role === 'admin';
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') setSelected(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Shell active="cameras" dark title="Cameras & Alerts">
      <div className="page-head">
        <span className="eyebrow">Live Monitoring</span>
        <h1>Cameras & alerts</h1>
        <p>Six zones, monitored continuously. Click a camera to enlarge it.</p>
      </div>

      <div className="two-col" style={{ gridTemplateColumns: '1fr 340px' }}>
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: PANEL_HEIGHT }}>
          <div className="panel-head" style={{ flexShrink: 0 }}><h2>Camera feeds</h2></div>
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
            <div className="cam-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {MOCK_CAMERAS.map((c) => (
                <div className="cam-tile" key={c.id} onClick={() => setSelected(c)}>
                  <div className="cam-feed">
                    <div className="noise-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <rect x="2.5" y="7" width="14" height="11" rx="2" /><path d="M16.5 10.5 21 8v9l-4.5-2.5" />
                      </svg>
                    </div>
                    <div className={`cam-live ${c.live ? '' : 'offline'}`}>
                      <span className="rec-dot" />{c.live ? 'LIVE' : 'OFFLINE'}
                    </div>
                    <div className="cam-time mono">{c.id}</div>
                  </div>
                  <div className="cam-meta">
                    <div>
                      <div className="name">{c.name}</div>
                      <div className="zone">{c.zone}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: PANEL_HEIGHT }}>
          <div className="panel-head" style={{ flexShrink: 0 }}>
            <h2>Alerts</h2>
            <span className="eyebrow">{MOCK_ALERTS.length} today</span>
          </div>
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
            {MOCK_ALERTS.map((a, i) => (
              <div className="alert-item" key={i}>
                <div className={`alert-sev ${a.sev === 'low' ? 'low' : ''}`} />
                <div className="alert-body" style={{ minWidth: 0 }}>
                  <div className="t" style={{ overflowWrap: 'break-word' }}>{a.title}</div>
                  <div className="d" style={{ overflowWrap: 'break-word' }}>{a.desc}</div>
                  {isAdmin && (
                    <div className="alert-actions">
                      <button className="btn btn-outline btn-sm">Acknowledge</button>
                      <button className="btn btn-danger btn-sm">Dismiss</button>
                    </div>
                  )}
                </div>
                <div className="alert-time mono">{a.time}</div>
              </div>
            ))}
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
              <div className="noise-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="2.5" y="7" width="14" height="11" rx="2" /><path d="M16.5 10.5 21 8v9l-4.5-2.5" />
                </svg>
              </div>
              <div className={`cam-live ${selected.live ? '' : 'offline'}`}>
                <span className="rec-dot" />{selected.live ? 'LIVE' : 'OFFLINE'}
              </div>
              <div className="cam-time mono">{selected.id}</div>
            </div>
            <div className="cam-lightbox-head">
              <div>
                <div className="name">{selected.name}</div>
                <div className="zone">{selected.zone}</div>
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
    </Shell>
  );
}