import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';

/* ------------------------------------------------------------------ */
/*  Config: edit these lists to change filters and colours             */
/* ------------------------------------------------------------------ */

const ROLES = [
  { value: '', label: 'All roles' },
  { value: 'owner', label: 'Owner' },
  { value: 'ceo', label: 'CEO' },
  { value: 'hr', label: 'HR' },
  { value: 'guard', label: 'Guard' },
];

// value must match backend target_module exactly
const MODULES = [
  { value: 'Alerts', label: 'Alerts & protocols' },
  { value: 'Cameras', label: 'Cameras' },
  { value: 'Attendance', label: 'Attendance' },
  { value: 'Employees', label: 'Employees' },
  { value: 'Schedules', label: 'Shifts & schedules' },
  { value: 'Faces', label: 'Face reference photos' },
  { value: 'Users', label: 'User management' },
  { value: 'Settings', label: 'Settings & store hours' },
  { value: 'Auth', label: 'Authentication' },
  { value: 'Reports', label: 'Reports & exports' },
];

const ROLE_TONE = { owner: 'brass', ceo: 'info', hr: 'ok', guard: 'slate', system: 'muted' };
const ROLE_LABEL = { owner: 'Owner', ceo: 'CEO', hr: 'HR', guard: 'Guard', system: 'System' };
const roleColor = (role) => `var(--ad-${ROLE_TONE[role] || 'muted'})`;

// Only exceptions get colour. Routine activity stays neutral.
const actionTone = (action = '') => {
  const a = String(action).toUpperCase();
  if (/DELETE|REMOVE|FAIL|DENIED|REJECT|LOCK/.test(a)) return 'danger';
  if (/ALERT|ACK|ESCALAT|INTRUD|TAMPER|OFFLINE/.test(a)) return 'warn';
  if (/CREATE|ADD|ENROLL|UPLOAD/.test(a)) return 'ok';
  if (/UPDATE|EDIT|CHANGE|MODIFY|SAVE/.test(a)) return 'info';
  return 'muted';
};

const controlStyle = { height: 34, padding: '0 10px' };
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD, local time

const PAGE_SIZES = [10, 25, 50, 100];

// 1 ... 4 5 6 ... 100 style page list
const buildPages = (current, totalPages) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) pages.push('…');
  for (let i = start; i <= end; i += 1) pages.push(i);
  if (end < totalPages - 1) pages.push('…');
  pages.push(totalPages);
  return pages;
};

/* ------------------------------------------------------------------ */
/*  Line icons (no emoji)                                              */
/* ------------------------------------------------------------------ */

const ICONS = {
  print: (
    <>
      <path d="M6 9V3h12v6" />
      <rect x="6" y="14" width="12" height="7" />
      <path d="M6 18H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  camera: (
    <>
      <path d="M3 7h4l2-3h6l2 3h4v13H3z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
};

const Icon = ({ name, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ flex: 'none' }}
  >
    {ICONS[name]}
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Styles (scoped with .ad- prefix, uses your existing CSS variables) */
/* ------------------------------------------------------------------ */

const AD_CSS = `
.ad-root {
  --ad-brass: var(--brass, #c9a36b);
  --ad-surface: var(--surface, #1b1f27);
  --ad-border: var(--border, rgba(255,255,255,.10));
  --ad-text: var(--text, #e6e8ec);
  --ad-muted: var(--text-muted, #8b93a1);
  --ad-ok: #4f9d7d;
  --ad-warn: #c9993f;
  --ad-danger: #cf5c5c;
  --ad-info: #6f93c6;
  --ad-slate: #8c96ab;
}
.ad-root .tone-brass  { --tone: var(--ad-brass); }
.ad-root .tone-ok     { --tone: var(--ad-ok); }
.ad-root .tone-warn   { --tone: var(--ad-warn); }
.ad-root .tone-danger { --tone: var(--ad-danger); }
.ad-root .tone-info   { --tone: var(--ad-info); }
.ad-root .tone-slate  { --tone: var(--ad-slate); }
.ad-root .tone-muted  { --tone: var(--ad-muted); }

.ad-ellip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

/* Summary strip: one connected panel, hairline dividers */
.ad-stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 1px;
  background: var(--ad-border);
  border: 1px solid var(--ad-border);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 16px;
}
.ad-stat { padding: 16px 18px; background: var(--ad-surface); min-width: 0; }
.ad-stat-top {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  color: var(--ad-muted); font-size: 12px; font-weight: 500;
}
.ad-stat-value {
  margin-top: 8px; font-size: 26px; font-weight: 600; line-height: 1.1;
  color: var(--ad-text); font-variant-numeric: tabular-nums;
}
.ad-stat-value.is-danger { color: var(--ad-danger); }
.ad-stat-hint { margin-top: 4px; font-size: 11.5px; color: var(--ad-muted); }

/* Chart cards */
.ad-charts {
  display: grid;
  grid-template-columns: 1.7fr 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}
.ad-card {
  background: var(--ad-surface);
  border: 1px solid var(--ad-border);
  border-radius: 8px;
  padding: 16px 18px;
  min-width: 0;
}
.ad-card h3 { margin: 0; font-size: 13.5px; font-weight: 600; color: var(--ad-text); }
.ad-sub { font-size: 12px; color: var(--ad-muted); margin: 2px 0 14px; }
.ad-empty { color: var(--ad-muted); font-size: 12.5px; margin: 8px 0 0; }

.ad-hours {
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  grid-template-rows: 100%;
  gap: 3px;
  height: 120px;
}
.ad-hour { display: flex; align-items: flex-end; }
.ad-hour-bar {
  width: 100%;
  border-radius: 2px 2px 0 0;
  background: color-mix(in srgb, var(--ad-brass) 45%, transparent);
  transition: height .3s ease;
}
.ad-hour.peak .ad-hour-bar { background: var(--ad-brass); }
.ad-hour.empty .ad-hour-bar { background: color-mix(in srgb, var(--ad-text) 10%, transparent); }
.ad-hour-axis {
  display: grid; grid-template-columns: repeat(24, 1fr); gap: 3px;
  margin-top: 6px; font-size: 10px; color: var(--ad-muted); text-align: center;
}

.ad-rows { display: flex; flex-direction: column; gap: 12px; }
.ad-row {
  display: grid; grid-template-columns: minmax(0, 112px) 1fr auto;
  gap: 10px; align-items: center; font-size: 12.5px; color: var(--ad-text);
}
.ad-track {
  height: 6px; border-radius: 99px; overflow: hidden;
  background: color-mix(in srgb, var(--ad-text) 8%, transparent);
}
.ad-fill { display: block; height: 100%; border-radius: 99px; background: color-mix(in srgb, var(--ad-brass) 80%, transparent); }
.ad-count { min-width: 24px; text-align: right; color: var(--ad-muted); font-variant-numeric: tabular-nums; }

.ad-donut-wrap { display: flex; align-items: center; gap: 16px; }
.ad-donut { position: relative; width: 104px; height: 104px; flex: none; border-radius: 50%; }
.ad-donut::after {
  content: ''; position: absolute; inset: 14px; border-radius: 50%;
  background: var(--ad-surface);
}
.ad-donut-center {
  position: absolute; inset: 0; z-index: 1;
  display: grid; place-items: center; text-align: center; line-height: 1.15;
}
.ad-donut-total { font-size: 18px; font-weight: 600; color: var(--ad-text); font-variant-numeric: tabular-nums; }
.ad-donut-cap { font-size: 10.5px; color: var(--ad-muted); }
.ad-legend { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0; font-size: 12.5px; color: var(--ad-text); }
.ad-legend-item { display: flex; align-items: center; gap: 8px; }
.ad-dot { width: 8px; height: 8px; border-radius: 2px; flex: none; }

/* Ledger table, grouped by day */
.ad-ledger-head {
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;
  padding: 14px 18px; border-bottom: 1px solid var(--ad-border);
}
.ad-ledger-head .ad-sub { margin: 2px 0 0; }
.ad-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ad-muted); }
.ad-scroll { max-height: 620px; overflow: auto; }
.ad-loading { opacity: .55; transition: opacity .2s; }
.ad-table { width: 100%; border-collapse: separate; border-spacing: 0; }
.ad-table th {
  position: sticky; top: 0; z-index: 3;
  height: 38px; box-sizing: border-box; padding: 0 14px;
  background: var(--ad-surface);
  text-align: left; font-size: 12px; font-weight: 600; color: var(--ad-muted);
  border-bottom: 1px solid var(--ad-border);
}
.ad-table td {
  padding: 10px 14px; vertical-align: middle; font-size: 12.5px; color: var(--ad-text);
  border-bottom: 1px solid color-mix(in srgb, var(--ad-border) 55%, transparent);
}
.ad-item:hover td { background: color-mix(in srgb, var(--ad-text) 3.5%, transparent); }

.ad-day td {
  position: sticky; top: 38px; z-index: 2;
  padding: 7px 14px;
  background: color-mix(in srgb, var(--ad-text) 4%, var(--ad-surface));
  border-bottom: 1px solid var(--ad-border);
}
.ad-day-inner { display: flex; align-items: baseline; gap: 10px; font-weight: 600; font-size: 12px; color: var(--ad-text); }
.ad-day-count { font-weight: 400; font-size: 11.5px; color: var(--ad-muted); }

.ad-time { font-weight: 500; white-space: nowrap; }
.ad-actor-name { font-size: 13px; font-weight: 600; line-height: 1.25; }
.ad-role { font-size: 11.5px; color: var(--ad-muted); line-height: 1.3; }

.ad-tag {
  display: inline-block; white-space: nowrap;
  padding: 2px 8px; border-radius: 4px;
  font-size: 11.5px; font-weight: 600; letter-spacing: .01em;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--tone) 38%, transparent);
}
.ad-module { color: var(--ad-muted); white-space: nowrap; }
.ad-details { line-height: 1.5; word-break: break-word; }

.ad-proof {
  width: 36px; height: 36px; padding: 0; overflow: hidden; cursor: pointer;
  background: none; border: 1px solid var(--ad-border); border-radius: 4px;
}
.ad-proof img { display: block; width: 100%; height: 100%; object-fit: cover; }
.ad-proof:hover { border-color: var(--ad-brass); }
.ad-proof:focus-visible { outline: 2px solid var(--ad-brass); outline-offset: 2px; }

.ad-pager {
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
  padding: 12px 18px; border-top: 1px solid var(--ad-border);
  font-size: 12px; color: var(--ad-muted);
}
.ad-pager-left, .ad-pager-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ad-pager-left { gap: 16px; }
.ad-page-btn {
  min-width: 32px; height: 32px; padding: 0 10px; cursor: pointer;
  border-radius: 6px; border: 1px solid var(--ad-border);
  background: transparent; color: var(--ad-text); font-size: 12px;
}
.ad-page-btn:hover:not(:disabled) { border-color: var(--ad-brass); }
.ad-page-btn:focus-visible { outline: 2px solid var(--ad-brass); outline-offset: 2px; }
.ad-page-btn.active {
  border-color: var(--ad-brass); color: var(--ad-brass); font-weight: 600;
  background: color-mix(in srgb, var(--ad-brass) 14%, transparent);
}
.ad-page-btn:disabled { opacity: .4; cursor: not-allowed; }
.ad-page-gap { padding: 0 2px; }

@media (max-width: 1100px) {
  .ad-stats { grid-template-columns: repeat(2, 1fr); }
  .ad-stat:last-child:nth-child(odd) { grid-column: 1 / -1; }
  .ad-charts { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .ad-hour-bar, .ad-loading { transition: none; }
}
@media print {
  .ad-scroll { max-height: none; overflow: visible; }
  .ad-table th, .ad-day td { position: static; }
  .ad-pager { display: none; }
}
`;

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export const AuditLogPage = () => {
  const { session, apiFetch } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [lightboxImg, setLightboxImg] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const scrollRef = useRef(null);

  const token = session?.token || '';

  const loadAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedRole) params.append('role', selectedRole);
      if (selectedModule) params.append('module', selectedModule);
      if (selectedDate) params.append('date', selectedDate);
      if (searchTerm.trim()) params.append('search', searchTerm.trim());

      const res = await apiFetch(`/audit-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data || []);
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, selectedRole, selectedModule, selectedDate, searchTerm]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  const handleClearFilters = () => {
    setSelectedRole('');
    setSelectedModule('');
    setSelectedDate('');
    setSearchTerm('');
  };

  const hasFilters = Boolean(selectedRole || selectedModule || selectedDate || searchTerm);

  /* ---- dashboard numbers, computed from the loaded (filtered) logs ---- */
  const stats = useMemo(() => {
    const today = dayKey(new Date());
    const hours = Array(24).fill(0);
    const modules = {};
    const roles = {};
    const actors = new Set();
    let todayCount = 0;
    let alerts = 0;
    let proof = 0;

    logs.forEach((log) => {
      const d = new Date(log.timestamp);
      if (!isNaN(d)) {
        hours[d.getHours()] += 1;
        if (dayKey(d) === today) todayCount += 1;
      }
      if (log.target_module === 'Alerts') alerts += 1;
      if (log.proof_image) proof += 1;
      if (log.username) actors.add(log.username);

      const m = log.target_module || 'Other';
      modules[m] = (modules[m] || 0) + 1;

      const r = (log.user_role || 'system').toLowerCase();
      roles[r] = (roles[r] || 0) + 1;
    });

    const maxHour = Math.max(...hours);
    const moduleList = Object.entries(modules).sort((a, b) => b[1] - a[1]).slice(0, 6);

    return {
      hours,
      maxHour,
      peakHour: maxHour > 0 ? hours.indexOf(maxHour) : -1,
      modules: moduleList,
      moduleMax: moduleList.length ? moduleList[0][1] : 1,
      roles: Object.entries(roles).sort((a, b) => b[1] - a[1]),
      today: todayCount,
      alerts,
      actors: actors.size,
      proof,
    };
  }, [logs]);

  /* ---- pagination (client side, over loaded logs) ---- */
  const total = logs.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pagedLogs = useMemo(
    () => logs.slice(pageStart, pageStart + pageSize),
    [logs, pageStart, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [selectedRole, selectedModule, selectedDate, searchTerm, pageSize]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [safePage, pageSize]);

  /* ---- group current page rows by day (keeps server order) ---- */
  const groups = useMemo(() => {
    const map = new Map();
    pagedLogs.forEach((log) => {
      const d = new Date(log.timestamp);
      const valid = !isNaN(d);
      const key = valid ? dayKey(d) : 'unknown';
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: valid
            ? d.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })
            : 'Unknown date',
          items: [],
        });
      }
      map.get(key).items.push(log);
    });
    return Array.from(map.values());
  }, [pagedLogs]);

  /* donut gradient */
  let acc = 0;
  const donutStops = stats.roles.map(([role, count]) => {
    const from = (acc / total) * 100;
    acc += count;
    return `${roleColor(role)} ${from}% ${(acc / total) * 100}%`;
  });
  const donutBg = total
    ? `conic-gradient(${donutStops.join(', ')})`
    : 'conic-gradient(var(--ad-border) 0% 100%)';

  const statCells = [
    { key: 'total', icon: 'list', label: 'Audit records', hint: 'In current view', value: total },
    {
      key: 'today', icon: 'calendar', label: 'Events today',
      hint: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      value: stats.today,
    },
    { key: 'alerts', icon: 'alert', label: 'Alert events', hint: 'Alerts & protocols', value: stats.alerts, danger: stats.alerts > 0 },
    { key: 'actors', icon: 'users', label: 'Active users', hint: 'Distinct accounts', value: stats.actors },
    { key: 'proof', icon: 'camera', label: 'With photo proof', hint: 'Attached evidence', value: stats.proof },
  ];

  return (
    <Shell active="audit-logs" title="System Audit">
      <style>{AD_CSS}</style>

      <div className="ad-root">
        {/* ---------- Header ---------- */}
        <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <span className="eyebrow">Owner Security Console</span>
            <h1>System Audit Log</h1>
            <p>
              Immutable audit trail tracking all modifications, security events, Guard alert acknowledgments, and operational entries across CEO, HR, and Guard roles.
            </p>
          </div>

          <div className="no-print" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => window.print()}
              className="btn btn-outline"
              title="Print or export PDF report"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Icon name="print" />
              <span>Print report</span>
            </button>
            <button
              type="button"
              onClick={loadAuditLogs}
              disabled={loading}
              className="btn btn-outline"
              title="Refresh audit trail"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Icon name="refresh" />
              <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* ---------- Filters ---------- */}
        <div className="filter-bar no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 16px' }}>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            style={controlStyle}
            aria-label="Filter by role"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.value === '' ? 'All roles' : `Role: ${r.label}`}
              </option>
            ))}
          </select>

          <select
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value)}
            style={controlStyle}
            aria-label="Filter by module"
          >
            <option value="">All modules</option>
            {MODULES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={controlStyle}
            aria-label="Filter by date"
          />

          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setSelectedDate(dayKey(new Date()))}
            style={{ ...controlStyle, display: 'inline-flex', alignItems: 'center' }}
          >
            Today
          </button>

          <input
            type="text"
            placeholder="Search user, action, details..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...controlStyle, minWidth: 220 }}
          />

          {hasFilters && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={handleClearFilters}
              style={{ ...controlStyle, display: 'inline-flex', alignItems: 'center' }}
            >
              Clear
            </button>
          )}
        </div>

        {/* ---------- Summary strip ---------- */}
        <div className="ad-stats">
          {statCells.map((s) => (
            <div className="ad-stat" key={s.key}>
              <div className="ad-stat-top">
                <span className="ad-ellip">{s.label}</span>
                <Icon name={s.icon} size={15} />
              </div>
              <div className={`ad-stat-value${s.danger ? ' is-danger' : ''}`}>
                {s.value.toLocaleString('en-IN')}
              </div>
              <div className="ad-stat-hint ad-ellip">{s.hint}</div>
            </div>
          ))}
        </div>

        {/* ---------- Charts ---------- */}
        <div className="ad-charts">
          <div className="ad-card">
            <h3>Activity by hour</h3>
            <p className="ad-sub">When events happen across the day</p>
            <div className="ad-hours" role="img" aria-label="Events per hour of day">
              {stats.hours.map((count, h) => (
                <div
                  key={h}
                  className={`ad-hour${h === stats.peakHour ? ' peak' : ''}${count === 0 ? ' empty' : ''}`}
                  title={`${pad(h)}:00 to ${pad((h + 1) % 24)}:00, ${count} ${count === 1 ? 'event' : 'events'}`}
                >
                  <div
                    className="ad-hour-bar"
                    style={{ height: stats.maxHour ? `${Math.max((count / stats.maxHour) * 100, 3)}%` : '3%' }}
                  />
                </div>
              ))}
            </div>
            <div className="ad-hour-axis">
              {stats.hours.map((_, h) => (
                <span key={h}>{h % 3 === 0 ? pad(h) : ''}</span>
              ))}
            </div>
            <p className="ad-sub" style={{ margin: '10px 0 0' }}>
              {stats.peakHour >= 0
                ? `Busiest hour: ${pad(stats.peakHour)}:00 to ${pad((stats.peakHour + 1) % 24)}:00 with ${stats.maxHour} ${stats.maxHour === 1 ? 'event' : 'events'}`
                : 'No activity to chart yet.'}
            </p>
          </div>

          <div className="ad-card">
            <h3>Events by module</h3>
            <p className="ad-sub">Top areas of activity</p>
            {stats.modules.length ? (
              <div className="ad-rows">
                {stats.modules.map(([name, count]) => (
                  <div className="ad-row" key={name}>
                    <span className="ad-ellip">{name}</span>
                    <span className="ad-track">
                      <span className="ad-fill" style={{ width: `${(count / stats.moduleMax) * 100}%` }} />
                    </span>
                    <span className="ad-count">{count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ad-empty">No records to summarise.</p>
            )}
          </div>

          <div className="ad-card">
            <h3>Events by role</h3>
            <p className="ad-sub">Who is generating activity</p>
            <div className="ad-donut-wrap">
              <div className="ad-donut" style={{ background: donutBg }} role="img" aria-label="Events by role">
                <div className="ad-donut-center">
                  <div>
                    <div className="ad-donut-total">{total}</div>
                    <div className="ad-donut-cap">events</div>
                  </div>
                </div>
              </div>
              <div className="ad-legend">
                {stats.roles.length ? (
                  stats.roles.map(([role, count]) => (
                    <div className="ad-legend-item" key={role}>
                      <span className="ad-dot" style={{ background: roleColor(role) }} />
                      <span className="ad-ellip" style={{ flex: 1 }}>{ROLE_LABEL[role] || role}</span>
                      <span className="ad-count">{count}</span>
                    </div>
                  ))
                ) : (
                  <span className="ad-empty" style={{ margin: 0 }}>No roles yet.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ---------- Ledger ---------- */}
        <div className="ad-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="ad-ledger-head">
            <div>
              <h3>Event ledger</h3>
              <p className="ad-sub">
                {total} {total === 1 ? 'audit record' : 'audit records'}, grouped by day
              </p>
            </div>
            <span className="ad-status">
              <Icon name="lock" size={14} />
              Append-only ledger
            </span>
          </div>

          <div ref={scrollRef} className={`ad-scroll${loading && total > 0 ? ' ad-loading' : ''}`}>
            <table className="ad-table">
              <thead>
                <tr>
                  <th style={{ width: 96 }}>Time</th>
                  <th style={{ width: 160 }}>Actor</th>
                  <th style={{ width: 190 }}>Action</th>
                  <th style={{ width: 150 }}>Module</th>
                  <th>Details</th>
                  <th style={{ width: 84, textAlign: 'center' }}>Proof</th>
                </tr>
              </thead>
              <tbody>
                {groups.length > 0 ? (
                  groups.map((g) => (
                    <React.Fragment key={g.key}>
                      <tr className="ad-day">
                        <td colSpan={6}>
                          <div className="ad-day-inner">
                            <span>{g.label}</span>
                            <span className="ad-day-count">
                              {g.items.length} {g.items.length === 1 ? 'event' : 'events'}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {g.items.map((log) => {
                        const d = new Date(log.timestamp);
                        const valid = !isNaN(d);
                        const timeStr = valid
                          ? d.toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              hour12: false,
                            })
                          : '--:--:--';
                        const fullDate = valid ? d.toLocaleString('en-IN') : '';
                        const proofUrl = log.proof_image
                          ? (log.proof_image.startsWith('http')
                              ? log.proof_image
                              : `http://localhost:8000${log.proof_image}?token=${encodeURIComponent(token)}`)
                          : null;
                        const role = (log.user_role || 'system').toLowerCase();
                        const name = log.username || 'system';

                        return (
                          <tr className="ad-item" key={log.id}>
                            <td className="ad-time mono" title={fullDate}>{timeStr}</td>

                            <td>
                              <div className="ad-actor-name">{name}</div>
                              <div className="ad-role">{ROLE_LABEL[role] || log.user_role}</div>
                            </td>

                            <td>
                              <span className={`ad-tag mono tone-${actionTone(log.action)}`}>{log.action}</span>
                            </td>

                            <td className="ad-module">{log.target_module}</td>

                            <td className="ad-details">{log.details}</td>

                            <td style={{ textAlign: 'center' }}>
                              {proofUrl ? (
                                <button
                                  type="button"
                                  className="ad-proof"
                                  onClick={() => setLightboxImg(proofUrl)}
                                  title="View photo proof"
                                >
                                  <img src={proofUrl} alt="Proof" />
                                </button>
                              ) : (
                                <span style={{ color: 'var(--ad-muted)' }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--ad-muted)' }}>
                      {loading
                        ? 'Loading audit records...'
                        : 'No audit records match these filters. Clear a filter to see more.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {total > 0 && (
            <div className="ad-pager no-print">
              <div className="ad-pager-left">
                <span>
                  Showing {pageStart + 1} to {Math.min(pageStart + pageSize, total)} of {total}
                </span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span>Rows per page</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    style={{ height: 32, padding: '0 8px' }}
                    aria-label="Rows per page"
                  >
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="ad-pager-right">
                <button
                  type="button"
                  className="ad-page-btn"
                  onClick={() => setPage(safePage - 1)}
                  disabled={safePage <= 1}
                >
                  Previous
                </button>
                {buildPages(safePage, totalPages).map((p, i) =>
                  p === '…' ? (
                    <span key={`gap-${i}`} className="ad-page-gap">…</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      className={`ad-page-btn${p === safePage ? ' active' : ''}`}
                      onClick={() => setPage(p)}
                      aria-current={p === safePage ? 'page' : undefined}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  type="button"
                  className="ad-page-btn"
                  onClick={() => setPage(safePage + 1)}
                  disabled={safePage >= totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------- Proof lightbox ---------- */}
      {lightboxImg && (
        <div
          className="cam-lightbox-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setLightboxImg(null); }}
        >
          <div className="panel" style={{ maxWidth: 640, width: '100%', padding: 20 }}>
            <div className="panel-head" style={{ marginBottom: 12 }}>
              <h2>Audit verification proof</h2>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setLightboxImg(null)}
              >
                Close
              </button>
            </div>
            <div style={{ background: 'var(--chrome)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
              <img
                src={lightboxImg}
                alt="Audit verification proof"
                style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain', borderRadius: 4 }}
              />
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
};

export default AuditLogPage;