import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useStatus } from '../context/StatusContext.jsx';
import Loader from '../components/Loader.jsx';

const ALERT_TYPE_LABELS = {
  stranger: 'Unrecognized face',
  camera_offline: 'Camera offline',
  camera_tamper: 'Possible camera tampering',
  early_arrival: 'Early arrival',
  overstay: 'Overstay',
};

// local-time "today" as YYYY-MM-DD (toISOString would use UTC, which is still
// yesterday in India between midnight and 5:30 am)
function localTodayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatIncident(a) {
  const label = ALERT_TYPE_LABELS[a.alert_type] || a.alert_type;
  const name = a.person_name || '';
  const who = name.startsWith('Unknown@') ? 'Unknown person' : name;
  return who ? `${label} — ${who}` : label;
}

function formatTime(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '–';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function GuardOverview() {
  const { apiFetch } = useAuth();
  const { status, cameras } = useStatus();
  const [incidents, setIncidents] = useState([]);
  const [entryLog, setEntryLog] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = localTodayStr();

  const load = useCallback(async () => {
    try {
      const [incRes, attRes] = await Promise.all([
        apiFetch('/incidents?status=new&limit=1000'),
        apiFetch(`/attendance?date=${today}&limit=1000`),
      ]);
      if (incRes.ok) setIncidents(await incRes.json());
      if (attRes.ok) {
        const data = await attRes.json();
        const seen = (data.records || [])
          .filter((r) => r.first_seen && (r.status === 'present' || r.status === 'late'))
          .sort((a, b) => new Date(b.last_seen || 0) - new Date(a.last_seen || 0));
        setEntryLog(seen);
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch, today]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const camerasLive = cameras.filter((c) => c.live).length;

  // "Inside" if seen in the last 3 minutes, else show last-seen time as exit
  const isInside = (r) =>
    r.last_seen && Date.now() - new Date(r.last_seen).getTime() < 3 * 60 * 1000;

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
          <span className="eyebrow">Employees in today</span>
          <div className="value">{loading ? '–' : entryLog.length}</div>
        </div>

        <Link to="/hardware-alerts" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="stat-card good">
            <span className="eyebrow">Hardware alerts</span>
            <div className="value">Sensors Live</div>
            <div className="delta">Door, PIR & Sonar →</div>
          </div>
        </Link>
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
          {loading && <Loader compact />}
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

          {!loading && incidents.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No active alerts.</p>
          )}
        </div>

        <div className="panel" style={{ minWidth: 0 }}>
          <div className="panel-head">
            <h2>Entry &amp; exit log</h2>
          </div>
          {loading && <Loader compact />}
          {entryLog.slice(0, 6).map((r, i) => (
            <div className="log-row" key={`${r.employee_id}-${i}`}>
              <div className={`log-dot ${isInside(r) ? 'info' : ''}`} />
              <div className="log-time">{formatTime(r.first_seen)}</div>
              <div className="log-text">
                {r.name}{' '}
                <span className="mono" style={{ color: 'var(--text-muted)' }}>
                  {isInside(r) ? 'inside' : `out ${formatTime(r.last_seen)}`}
                </span>
              </div>
              <div className="log-tag">{r.zone_name || ''}</div>
            </div>
          ))}

          {!loading && entryLog.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No employee entries yet today.</p>
          )}
        </div>
      </div>
    </>
  );
}

function StaffAttendanceOverview() {
  const { apiFetch } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = localTodayStr();

  const loadAttendance = useCallback(async () => {
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

  // Attendance rows can also be "pending" (shift not started) or absent.
  // Only people who have actually been seen count as present.
  const present = records
    .filter((r) => r.status === 'present' || r.status === 'late')
    .sort((a, b) => new Date(b.last_seen || 0) - new Date(a.last_seen || 0));

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
          <div className="value">{loading ? '–' : present.length}</div>
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
          {loading && <Loader compact />}
          {present.slice(0, 5).map((r, i) => (
            <div className="log-row" key={i}>
              <div className="log-dot info" />
              <div className="log-time">{formatTime(r.last_seen)}</div>
              <div className="log-text">{r.name}</div>
              <div className="log-tag">{r.status === 'late' ? 'Late' : 'Present'}</div>
            </div>
          ))}

          {present.length === 0 && !loading && (
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