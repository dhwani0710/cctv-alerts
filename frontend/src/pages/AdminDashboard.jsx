import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useStatus } from '../context/StatusContext.jsx';

export default function AdminDashboard() {
  const { apiFetch } = useAuth();
  const { status, cameras } = useStatus();
  const [employeeCount, setEmployeeCount] = useState(0);
  const [cameraCount, setCameraCount] = useState({ live: 0, total: 0 });
  const [records, setRecords] = useState([]);

  const load = useCallback(async () => {
    const [empRes, recRes] = await Promise.all([
      apiFetch('/employees'),
      apiFetch('/records?limit=10'),
    ]);
    if (empRes.ok) setEmployeeCount((await empRes.json()).length);
    if (recRes.ok) setRecords(await recRes.json());
  }, [apiFetch]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    setCameraCount({ live: cameras.filter((c) => c.live).length, total: cameras.length });
  }, [cameras]);

  const highAlerts = status.recent_alerts.filter((a) => a.priority === 'high').length;

  return (
    <Shell active="dashboard" dark title="Overview">
      <div className="page-head">
        <h1>Good to see you</h1>
      </div>

      <div className="stat-grid">
        <div className="stat-card good">
          <span className="eyebrow">Cameras live</span>
          <div className="value">{cameraCount.live} / {cameraCount.total}</div>
        </div>
        <div className="stat-card warn">
          <span className="eyebrow">Active alerts</span>
          <div className="value">{status.recent_alerts.length}</div>
          <div className="delta">{highAlerts} high severity</div>
        </div>
        <div className="stat-card">
          <span className="eyebrow">Staff on shift</span>
          <div className="value">{status.currently_detected.length}</div>
          <div className="delta">of {employeeCount} total employees</div>
        </div>
        <div className="stat-card">
          <span className="eyebrow">Records today</span>
          <div className="value">{records.length}</div>
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
          {records.slice(0, 5).map((r) => (
            <div className="log-row" key={r.id}>
              <div className={`log-dot ${r.priority === 'high' ? 'alert' : r.priority === 'medium' ? 'info' : ''}`} />
              <div className="log-time">{new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              <div className="log-text">{r.alert_type} — {r.camera_id}</div>
              <div className="log-tag">{r.person_name}</div>
            </div>
          ))}
          {records.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No records.</p>}
        </div>
      </div>
    </Shell>
  );
}