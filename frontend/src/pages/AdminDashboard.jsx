 import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useStatus } from '../context/StatusContext.jsx';

const ALERT_TYPE_LABELS = {
  stranger: 'Unrecognized face',
  camera_offline: 'Camera offline',
  camera_tamper: 'Possible camera tampering',
  early_arrival: 'Early arrival',
  overstay: 'Overstay',
};

function formatIncident(a) {
  const name = a.person_name || '';
  if (name.startsWith('Unknown@')) {
    return `Stranger - ${name.split('@')[1]}`;
  }
  const label = ALERT_TYPE_LABELS[a.alert_type] || a.alert_type;
  return `${label} — ${name}`;
}

function formatTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ---------- icons + stat card ---------- */
const svg = (children) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const icons = {
  camera: svg(<><rect x="2" y="6" width="13" height="12" rx="2" /><path d="m22 8-7 4 7 4z" /></>),
  bell: svg(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>),
  users: svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  records: svg(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h8" /></>),
};

function StatCard({ icon, label, value, sub, tone = '' }) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-icon">{icon}</div>
      <div>
        <div className="stat-label">{label}</div>
        <div className="value">{value}</div>
        {sub && <div className="delta">{sub}</div>}
      </div>
    </div>
  );
}

/* ---------- page ---------- */
export default function AdminDashboard() {
  const { apiFetch } = useAuth();
  const { status, cameras } = useStatus();

  const [employeeCount, setEmployeeCount] = useState(0);
  const [cameraCount, setCameraCount] = useState({ live: 0, total: 0 });
  const [records, setRecords] = useState([]);
  const [incidents, setIncidents] = useState([]);

  const load = useCallback(async () => {
    const [empRes, recRes, incRes] = await Promise.all([
      apiFetch('/employees'),
      apiFetch('/records?limit=10'),
      apiFetch('/incidents?status=new'),
    ]);
    if (empRes.ok) setEmployeeCount((await empRes.json()).length);
    if (recRes.ok) setRecords((await recRes.json()).records || []);
    if (incRes.ok) setIncidents(await incRes.json());
  }, [apiFetch]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    setCameraCount({ live: cameras.filter((c) => c.live).length, total: cameras.length });
  }, [cameras]);

  const highAlerts = incidents.filter((a) => a.priority === 'high').length;

  return (
    <Shell active="dashboard" dark title="Overview">
      <div className="page-head">
        <h1>Good to see you</h1>
        <p>Here's what's happening at your store today.</p>
      </div>

      <div className="stat-grid">
        <StatCard
          icon={icons.camera}
          label="Cameras live"
          value={`${cameraCount.live} / ${cameraCount.total}`}
          tone="good"
        />
        <StatCard
          icon={icons.bell}
          label="Active alerts"
          value={incidents.length}
          sub={`${highAlerts} high severity`}
          tone={highAlerts > 0 ? 'warn' : ''}
        />
        <StatCard
          icon={icons.users}
          label="Staff on shift"
          value={status.currently_detected.length}
          sub={`of ${employeeCount} total employees`}
        />
        <StatCard icon={icons.records} label="Records today" value={records.length} />
      </div>

      {/* ---------- RECENT ALERTS ---------- */}
      <div className="panel">
        <div className="panel-head">
          <h2>Recent alerts</h2>
          <Link className="link-btn" to="/cameras-alerts">View all →</Link>
        </div>

        {incidents.length > 0 ? (
          <div className="table-wrap">
            <table className="records">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Alert</th>
                  <th>Camera</th>
                  <th>Zone</th>
                  <th style={{ textAlign: 'right' }}>Priority</th>
                </tr>
              </thead>
              <tbody>
                {incidents.slice(0, 5).map((a) => (
                  <tr key={a.id}>
                    <td className="alert-time-cell mono">
                      <span className={`log-dot p-${a.priority}`} />
                      {formatTime(a.last_seen)}
                    </td>
                    <td className="cell-ellipsis">
                      {formatIncident(a)}
                      <span className="alert-count">×{a.alert_count}</span>
                    </td>
                    <td>{a.camera_name || '-'}</td>
                    <td>{a.zone_name || '-'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`pill p-${a.priority}`}>{a.priority}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-note">No alerts.</p>
        )}
      </div>
    </Shell>
  );
}