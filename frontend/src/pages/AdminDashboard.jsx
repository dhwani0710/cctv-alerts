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

const ALERT_GRID = '10px 80px minmax(0, 1fr) 140px 100px 70px';

const PRIORITY_COLORS = {
  high: '#e5604d',
  medium: '#f2994a',
  low: '#f2c94c',
};

function formatIncident(a) {
  if (a.person_name.startsWith('Unknown@')) {
    return `Stranger - ${a.person_name.split('@')[1]}`;
  }
  const label = ALERT_TYPE_LABELS[a.alert_type] || a.alert_type;
  return `${label} — ${a.person_name}`;
}

export default function AdminDashboard() {
  const { apiFetch } = useAuth();
  const { status, cameras } = useStatus();
  const [employeeCount, setEmployeeCount] = useState(0);

  const [cameraCount, setCameraCount] = useState({
    live: 0,
    total: 0,
  });

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

      {/* PAGE HEADER */}
      <div className="page-head">
        <h1>Good to see you</h1>
      </div>


      {/* STAT CARDS */}
      <div className="stat-grid">

        <div className="stat-card good">
          <span className="eyebrow">Cameras live</span>

          <div className="value">
            {cameraCount.live} / {cameraCount.total}
          </div>
        </div>


        <div className="stat-card warn">
          <span className="eyebrow">Active alerts</span>

          <div className="value">
            {status.recent_alerts.length}
          </div>

          <div className="delta">
            {highAlerts} high severity
          </div>
        </div>


        <div className="stat-card">
          <span className="eyebrow">Staff on shift</span>

          <div className="value">
            {status.currently_detected.length}
          </div>

          <div className="delta">
            of {employeeCount} total employees
          </div>
        </div>


        <div className="stat-card">
          <span className="eyebrow">Records today</span>

          <div className="value">
            {records.length}
          </div>
        </div>

      </div>


      {/* =====================================================
          RECENT ALERTS
          ===================================================== */}

      <div
        className="alerts-activity-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: '12px',
          width: '100%',
          alignItems: 'stretch',
        }}
      >

        <div
          className="panel"
          style={{
            minWidth: 0,
          }}
        >

          <div className="panel-head">

            <h2>Recent alerts</h2>

            <Link
              className="link-btn"
              to="/cameras-alerts"
            >
              View all →
            </Link>

          </div>


          {incidents.length > 0 && (
            <div
              className="log-row"
              style={{
                gridTemplateColumns: ALERT_GRID,
                borderTop: 'none',
                fontSize: 11,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              <div />
              <div>Time</div>
              <div>Alert</div>
              <div>Camera</div>
              <div>Zone</div>
              <div style={{ textAlign: 'right' }}>Priority</div>
            </div>
          )}

          {incidents.slice(0, 5).map((a) => (

            <div
              className="log-row"
              key={a.id}
              style={{ gridTemplateColumns: ALERT_GRID }}
            >

              <div
                className="log-dot"
                style={{ background: PRIORITY_COLORS[a.priority] || 'var(--text-muted)' }}
              />

              <div className="log-time">
                {new Date(a.last_seen).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>

              <div className="log-text">
                {formatIncident(a)} <span className="mono" style={{ color: 'var(--text-muted)' }}>×{a.alert_count}</span>
              </div>

              <div className="log-text">
                {a.camera_name || '-'}
              </div>

              <div className="log-text">
                {a.zone_name || '-'}
              </div>

              <div
                className="log-tag"
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: PRIORITY_COLORS[a.priority] || 'var(--text)',
                  textTransform: 'capitalize',
                  textAlign: 'right',
                }}
              >
                {a.priority}
              </div>

            </div>

          ))}


          {incidents.length === 0 && (

            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: 13.5,
              }}
            >
              No alerts.
            </p>

          )}

        </div>

      </div>

    </Shell>
  );
}