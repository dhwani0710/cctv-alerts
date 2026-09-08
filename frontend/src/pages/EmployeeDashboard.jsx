import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useStatus } from '../context/StatusContext.jsx';

export default function EmployeeDashboard() {
  const { apiFetch } = useAuth();
  const { status, cameras } = useStatus();
  const [cameraCount, setCameraCount] = useState({ live: 0, total: 0 });

  useEffect(() => {
    setCameraCount({ live: cameras.filter((c) => c.live).length, total: cameras.length });
  }, [cameras]);

  return (
    <Shell active="dashboard" dark title="Overview">
      <div className="page-head">
        <span className="eyebrow">Staff</span>
        <h1>Welcome back</h1>
        <p>Your shift overview and the store's current status.</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card good">
          <span className="eyebrow">Cameras live</span>
          <div className="value">{cameraCount.live} / {cameraCount.total}</div>
        </div>
        <div className="stat-card warn">
          <span className="eyebrow">Active alerts</span>
          <div className="value">{status.recent_alerts.length}</div>
          <div className="delta">Visible on Cameras & Alerts</div>
        </div>
        <div className="stat-card">
          <span className="eyebrow">Currently detected</span>
          <div className="value">{status.currently_detected.length}</div>
        </div>
      </div>

      <div className="alerts-activity-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>Recent alerts</h2>
            <Link className="link-btn" to="/cameras-alerts">View all →</Link>
          </div>
          {status.recent_alerts.slice(0, 5).map((a, i) => (
            <div className="log-row" key={i}>
              <div className={`log-dot ${a.priority === 'high' ? 'alert' : 'info'}`} />
              <div className="log-time">{new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              <div className="log-text">{a.message}</div>
              <div className="log-tag">{a.priority}</div>
            </div>
          ))}
          {status.recent_alerts.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No alerts.</p>}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Activity log</h2>
            <Link className="link-btn" to="/records">Full records →</Link>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>See Records for full history.</p>
        </div>
      </div>
    </Shell>
  );
}