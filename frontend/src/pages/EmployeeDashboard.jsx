import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function EmployeeDashboard() {
  const { apiFetch } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/attendance?date=${today}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      }
    } catch (err) {
      console.error('Failed to load attendance:', err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, today]);

  useEffect(() => {
    loadAttendance();
    const interval = setInterval(loadAttendance, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [loadAttendance]);

  const formatTime = (iso) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  return (
    <Shell active="dashboard" dark title="Overview">

      {/* PAGE HEADER */}
      <div className="page-head">
        <span className="eyebrow">Staff</span>
        <h1>Welcome back</h1>
        <p>Today's employee attendance overview.</p>
      </div>

      {/* STAT CARDS */}
      <div className="stat-grid">
        <div className="stat-card good">
          <span className="eyebrow">Employees present</span>
          <div className="value">{records.length}</div>
          <div className="delta">As of {formatTime(new Date().toISOString())}</div>
        </div>
      </div>

      {/* CURRENTLY PRESENT + ATTENDANCE LOG */}
      <div
        className="alerts-activity-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          width: '100%',
        }}
      >

        {/* CURRENTLY PRESENT */}
        <div className="panel">

          <div className="panel-head">
            <h2>Currently present</h2>
            <Link className="link-btn" to="/attendance">
              View all →
            </Link>
          </div>

          {records.slice(0, 5).map((r, i) => (
            <div className="log-row" key={i}>
              <div className="log-dot info" />
              <div className="log-time">{formatTime(r.last_seen)}</div>
              <div className="log-text">{r.name}</div>
              <div className="log-tag">Present</div>
            </div>
          ))}

          {records.length === 0 && !loading && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>
              No one checked in yet today.
            </p>
          )}

        </div>

        {/* ATTENDANCE LOG */}
        <div className="panel">

          <div className="panel-head">
            <h2>Attendance log</h2>
            <Link className="link-btn" to="/attendance">
              Full records →
            </Link>
          </div>

          <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>
            See Attendance for full first-seen / last-seen history.
          </p>

        </div>

      </div>

    </Shell>
  );

}