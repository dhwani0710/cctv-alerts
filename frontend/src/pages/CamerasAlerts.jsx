import React from 'react';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { MOCK_CAMERAS, MOCK_ALERTS } from '../data/mockData.js';

export default function CamerasAlerts() {
  const { session } = useAuth();
  const isAdmin = session.role === 'admin';

  return (
    <Shell active="cameras" dark title="Cameras & Alerts">
      <div className="page-head">
        <span className="eyebrow">Live Monitoring</span>
        <h1>Cameras & alerts</h1>
        <p>Six zones, monitored continuously. Feeds shown here are illustrative.</p>
      </div>
      <div className="two-col">
        <div>
          <div className="panel-head" style={{ marginBottom: 14 }}><h2>Camera feeds</h2></div>
          <div className="cam-grid">
            {MOCK_CAMERAS.map((c) => (
              <div className="cam-tile" key={c.id}>
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
                  {isAdmin && <button className="btn btn-outline btn-sm">Settings</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Alerts</h2>
            <span className="eyebrow">{MOCK_ALERTS.length} today</span>
          </div>
          {MOCK_ALERTS.map((a, i) => (
            <div className="alert-item" key={i}>
              <div className={`alert-sev ${a.sev === 'low' ? 'low' : ''}`} />
              <div className="alert-body">
                <div className="t">{a.title}</div>
                <div className="d">{a.desc}</div>
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
    </Shell>
  );
}
