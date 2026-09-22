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
  const label = ALERT_TYPE_LABELS[a.alert_type] || a.alert_type;
  const who = a.person_name.startsWith('Unknown@') ? 'Unknown person' : a.person_name;
  return `${label} — ${who}`;
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function GuardOverview() {
  const { apiFetch } = useAuth();
  const { status, cameras } = useStatus();
  const [incidents, setIncidents] = useState([]);
  const [entryLog, setEntryLog] = useState([]);
  const [recordsToday, setRecordsToday] = useState(0);

  const today = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    const [incRes, recRes] = await Promise.all([
      apiFetch('/incidents?status=new&limit=1000'),
      apiFetch(`/records?date=${today}&limit=6`),
    ]);
    if (incRes.ok) setIncidents(await incRes.json());
    if (recRes.ok) {
      const data = await recRes.json();
      setEntryLog(data.records || []);
      setRecordsToday(data.total || 0);
    }
  }, [apiFetch, today]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const camerasLive = cameras.filter((c) => c.live).length;

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Guard</span>
        <h1>Welcome back</h1>
        <p>Live security status and today's entry activity.</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card good">
          <span className="eyebrow">Cameras live</span>
          <div className="value">{camerasLive} / {cameras.length}</div>
        </div>

        <div className="stat-card">
          <span className="eyebrow">Currently detected</span>
          <div className="value">{status.currently_detected.length}</div>
          <div className="delta">people on camera now</div>
        </div>

        <div className="stat-card">
          <span className="eyebrow">Entries today</span>
          <div className="value">{recordsToday}</div>
        </div>
      </div>

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
        <div className="panel" style={{ minWidth: 0 }}>
          <div className="panel-head">
            <h2>Active alerts</h2>
            <Link className="link-btn" to="/cameras-alerts">View all →</Link>
          </div>

          {incidents.slice(0, 5).map((a) => (
            <div className="log-row" key={a.id}>
              <div className={`log-dot ${a.priority === 'high' ? 'alert' : 'info'}`} />
              <div className="log-time">{formatTime(a.last_seen)}</div>
              <div className="log-text">
                {formatIncident(a)} <span className="mono" style={{ color: 'var(--text-muted)' }}>×{a.alert_count}</span>
              </div>
              <div className="log-tag">{a.priority}</div>
            </div>
          ))}

          {incidents.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No active alerts.</p>
          )}
        </div>

        <div className="panel" style={{ minWidth: 0 }}>
          <div className="panel-head">
            <h2>Entry &amp; exit log</h2>
            <Link className="link-btn" to="/records">Full records →</Link>
          </div>

          {entryLog.map((r) => (
            <div className="log-row" key={r.id}>
              <div className={`log-dot ${r.priority === 'high' ? 'alert' : r.priority === 'medium' ? 'info' : ''}`} />
              <div className="log-time">{formatTime(r.timestamp)}</div>
              <div className="log-text">{r.person_name.replace('@front', '')}</div>
              <div className="log-tag">{r.camera_name}</div>
            </div>
          ))}

          {entryLog.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No entries logged yet today.</p>
          )}
        </div>
      </div>
    </>
  );
}

function StaffAttendanceOverview() {
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
    const interval = setInterval(loadAttendance, 30000);
    return () => clearInterval(interval);
  }, [loadAttendance]);

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Staff</span>
        <h1>Welcome back</h1>
        <p>Today's employee attendance overview.</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card good">
          <span className="eyebrow">Employees present</span>
          <div className="value">{records.length}</div>
          <div className="delta">As of {formatTime(new Date().toISOString())}</div>
        </div>
      </div>

      <div
        className="alerts-activity-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          width: '100%',
        }}
      >
        <div className="panel">
          <div className="panel-head">
            <h2>Currently present</h2>
            <Link className="link-btn" to="/attendance">View all →</Link>
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

        <div className="panel">
          <div className="panel-head">
            <h2>Attendance log</h2>
            <Link className="link-btn" to="/attendance">Full records →</Link>
          </div>

          <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>
            See Attendance for full first-seen / last-seen history.
          </p>
        </div>
      </div>
    </>
  );
}

export default function EmployeeDashboard() {
  const { session } = useAuth();
  const isGuard = session?.role === 'guard';

  return (
    <Shell active="dashboard" dark title="Overview">
      {isGuard ? <GuardOverview /> : <StaffAttendanceOverview />}
    </Shell>
  );
}