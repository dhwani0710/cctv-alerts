import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useStatus } from '../context/StatusContext.jsx';
import useOffices from '../hooks/useOffices.js';
import Loader from '../components/Loader.jsx';

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
  const { apiFetch, isSuperAdmin } = useAuth();
  const { status, cameras } = useStatus();
  const { offices, officeName } = useOffices();

  const [officeFilter, setOfficeFilter] = useState(''); // '' = all offices
  const [employeeCount, setEmployeeCount] = useState(0);
  const [records, setRecords] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  // Only super admins can switch offices. Everyone else is already scoped by the backend.
  const showOfficePicker = isSuperAdmin && offices.length > 1;
  const showOfficeLabels = showOfficePicker && !officeFilter;

  const load = useCallback(async () => {
    const id = ++reqId.current;
    const officeParam = isSuperAdmin && officeFilter ? `office_id=${encodeURIComponent(officeFilter)}` : '';
    const withOffice = (path) => {
      if (!officeParam) return path;
      return `${path}${path.includes('?') ? '&' : '?'}${officeParam}`;
    };

    try {
      const [empRes, recRes, incRes] = await Promise.all([
        apiFetch(withOffice('/employees')),
        apiFetch(withOffice('/records?limit=10')),
        apiFetch(withOffice('/incidents?status=new')),
      ]);
      const emp = empRes.ok ? await empRes.json() : null;
      const rec = recRes.ok ? await recRes.json() : null;
      const inc = incRes.ok ? await incRes.json() : null;

      // The office was switched while this request was in flight; let the newer one win.
      if (id !== reqId.current) return;

      if (emp) setEmployeeCount(emp.length);
      if (rec) setRecords(rec.records || []);
      if (inc) setIncidents(inc);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [apiFetch, isSuperAdmin, officeFilter]);

  useEffect(() => {
    setLoading(true); // also runs when the office changes, so old numbers never flash
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const visibleCameras = useMemo(
    () => (officeFilter ? cameras.filter((c) => String(c.office_id) === officeFilter) : cameras),
    [cameras, officeFilter]
  );

  const cameraCount = useMemo(
    () => ({ live: visibleCameras.filter((c) => c.live).length, total: visibleCameras.length }),
    [visibleCameras]
  );

  const visibleIncidents = useMemo(
    () => (
      officeFilter
        ? incidents.filter((a) => a.office_id == null || String(a.office_id) === officeFilter)
        : incidents
    ),
    [incidents, officeFilter]
  );

  // /status only reports a camera name per detection, so map camera -> office.
  const cameraOffice = useMemo(() => {
    const m = {};
    cameras.forEach((c) => { m[c.name] = c.office_id; m[c.id] = c.office_id; });
    return m;
  }, [cameras]);

  const staffOnShift = useMemo(() => {
    const list = status.currently_detected || [];
    if (!officeFilter) return list.length;
    return list.filter((d) => String(d.office_id ?? cameraOffice[d.camera]) === officeFilter).length;
  }, [status.currently_detected, officeFilter, cameraOffice]);

  const highAlerts = visibleIncidents.filter((a) => a.priority === 'high').length;

  return (
    <Shell active="dashboard" dark title="Overview">
      <div className="page-head">
        <h1>Good to see you</h1>
        <p>
          {officeFilter
            ? `Here's what's happening at ${officeName(officeFilter)} today.`
            : "Here's what's happening at your store today."}
        </p>
      </div>

      {showOfficePicker && (
        <div className="filter-bar">
          <select value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)}>
            <option value="">All offices</option>
            {offices.map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
          </select>
        </div>
      )}

      {loading ? <Loader /> : (<>
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
            value={visibleIncidents.length}
            sub={`${highAlerts} high severity`}
            tone={highAlerts > 0 ? 'warn' : ''}
          />
          <StatCard
            icon={icons.users}
            label="Staff on shift"
            value={staffOnShift}
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

          {visibleIncidents.length > 0 ? (
            <div className="table-wrap">
              <table className="records compact">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Alert</th>
                    <th className="col-hide-sm">Camera</th>
                    <th className="col-hide-sm">Zone</th>
                    <th style={{ textAlign: 'right' }}>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleIncidents.slice(0, 5).map((a) => {
                    const officePrefix =
                      showOfficeLabels && a.office_id != null ? `${officeName(a.office_id)} · ` : '';
                    return (
                      <tr key={a.id}>
                        <td className="alert-time-cell mono">
                          <span className={`log-dot p-${a.priority}`} />
                          {formatTime(a.last_seen)}
                        </td>
                        <td className="cell-ellipsis">
                          {formatIncident(a)}
                          <span className="alert-count">×{a.alert_count}</span>
                          {/* phone only: camera and zone move under the title */}
                          <span className="alert-sub">
                            {officePrefix}{a.camera_name || '-'} · {a.zone_name || '-'}
                          </span>
                        </td>
                        <td className="col-hide-sm">{officePrefix}{a.camera_name || '-'}</td>
                        <td className="col-hide-sm">{a.zone_name || '-'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={`pill p-${a.priority}`}>{a.priority}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-note">No alerts.</p>
          )}
        </div>
      </>)}
    </Shell>
  );
}