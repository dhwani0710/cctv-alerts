import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function AdminDashboard() {
  const { apiFetch } = useAuth();

  const [status, setStatus] = useState({
    recent_alerts: [],
    currently_detected: [],
  });

  const [employeeCount, setEmployeeCount] = useState(0);

  const [cameraCount, setCameraCount] = useState({
    live: 0,
    total: 0,
  });

  const [records, setRecords] = useState([]);

  const load = useCallback(async () => {
    try {
      const [statusRes, empRes, camRes, recRes] = await Promise.all([
        apiFetch('/status'),
        apiFetch('/employees'),
        apiFetch('/cameras'),
        apiFetch('/records?limit=10'),
      ]);

      if (statusRes.ok) {
        setStatus(await statusRes.json());
      }

      if (empRes.ok) {
        setEmployeeCount((await empRes.json()).length);
      }

      if (camRes.ok) {
        const cams = await camRes.json();

        setCameraCount({
          live: cams.filter((c) => c.live).length,
          total: cams.length,
        });
      }

      if (recRes.ok) {
        setRecords(await recRes.json());
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  }, [apiFetch]);

  useEffect(() => {
    load();

    const t = setInterval(load, 5000);

    return () => clearInterval(t);
  }, [load]);

  const highAlerts = status.recent_alerts.filter(
    (a) => a.priority === 'high'
  ).length;

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
          RECENT ALERTS + ACTIVITY LOG
          SIDE BY SIDE
          ===================================================== */}

      <div
        className="alerts-activity-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: '12px',
          width: '100%',
          alignItems: 'stretch',
        }}
      >

        {/* =================================================
            RECENT ALERTS
            ================================================= */}

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


          {status.recent_alerts.slice(0, 5).map((a, i) => (

            <div
              className="log-row"
              key={i}
            >

              <div
                className={`log-dot ${
                  a.priority === 'high'
                    ? 'alert'
                    : 'info'
                }`}
              />

              <div className="log-time">
                {new Date(a.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>

              <div className="log-text">
                {a.message}
              </div>

              <div className="log-tag">
                {a.priority}
              </div>

            </div>

          ))}


          {status.recent_alerts.length === 0 && (

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


        {/* =================================================
            ACTIVITY LOG
            ================================================= */}

        <div
          className="panel"
          style={{
            minWidth: 0,
          }}
        >

          <div className="panel-head">

            <h2>Activity log</h2>

            <Link
              className="link-btn"
              to="/records"
            >
              Full records →
            </Link>

          </div>


          {records.slice(0, 5).map((r) => (

            <div
              className="log-row"
              key={r.id}
            >

              <div
                className={`log-dot ${
                  r.priority === 'high'
                    ? 'alert'
                    : r.priority === 'medium'
                    ? 'info'
                    : ''
                }`}
              />

              <div className="log-time">
                {new Date(r.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>

              <div className="log-text">
                {r.alert_type} — {r.camera_id}
              </div>

              <div className="log-tag">
                {r.person_name}
              </div>

            </div>

          ))}


          {records.length === 0 && (

            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: 13.5,
              }}
            >
              No records.
            </p>

          )}

        </div>

      </div>

    </Shell>
  );
}