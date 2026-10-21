import React, { useEffect, useState, useCallback, useRef } from 'react';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import useOffices from '../hooks/useOffices.js';
import { buildEmployeeCsv, downloadCsv } from '../utils/attendanceCsv.js';
import Loader from '../components/Loader.jsx';

const pad = (n) => String(n).padStart(2, '0');

// local-time helpers (toISOString uses UTC and can be off by a day/month)
function localMonthStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function localDateStr(d = new Date()) {
  return `${localMonthStr(d)}-${pad(d.getDate())}`;
}

// returns null for a future month so nothing is requested
function monthRange(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const currentMonth = localMonthStr();
  if (monthStr > currentMonth) return null;

  const start = `${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const isCurrentMonth = monthStr === currentMonth;
  const endDay = isCurrentMonth ? new Date().getDate() : lastDay;
  const end = `${monthStr}-${pad(endDay)}`;
  return { start, end };
}

function fmtTime(value) {
  return value
    ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';
}

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const STATUS_PILL = { present: 'clear', late: 'late', pending: 'review' };
const STATUS_TEXT = { present: 'Present', late: 'Late', pending: 'Not yet due' };

// wraps a value so commas, quotes and line breaks can't break the CSV
function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// one file, every employee, sorted by name then date
function buildAllEmployeesCsv(
  records,
  month,
  { withOffice = false, officeName = () => '', fileTag = 'all-employees' } = {}
) {
  if (!records.length) {
    return { ok: false, error: 'No attendance records to export for this month.' };
  }

  const sorted = [...records].sort((a, b) => {
    const byName = (a.name || '').localeCompare(b.name || '');
    if (byName !== 0) return byName;
    return String(a.attendance_date || '').localeCompare(String(b.attendance_date || ''));
  });

  const header = [
    'Employee',
    ...(withOffice ? ['Office'] : []),
    'Date',
    'First seen',
    'Last seen',
    'Status',
  ];
  const rows = sorted.map((r) => [
    r.name,
    ...(withOffice ? [r.office_name || officeName(r.office_id)] : []),
    String(r.attendance_date || '').slice(0, 10),
    r.first_seen ? fmtTime(r.first_seen) : '',
    r.last_seen ? fmtTime(r.last_seen) : '',
    STATUS_TEXT[r.status] || 'Absent',
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');

  return { ok: true, csv, filename: `attendance-${fileTag}-${month}.csv` };
}

export default function Attendance() {
  const { apiFetch, isSuperAdmin } = useAuth();
  const { offices, officeName } = useOffices();
  const currentMonth = localMonthStr();
  const [officeFilter, setOfficeFilter] = useState(''); // '' = all offices
  const [month, setMonth] = useState(currentMonth);
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  // Only super admins can switch offices. Everyone else is already scoped by the backend.
  const showOfficePicker = isSuperAdmin && offices.length > 1;
  const showOfficeColumn = showOfficePicker && !officeFilter;
  const colCount = showOfficeColumn ? 6 : 5;
  const officeParam = isSuperAdmin && officeFilter ? `&office_id=${encodeURIComponent(officeFilter)}` : '';

  const load = useCallback(async () => {
    const id = ++reqId.current;
    const range = monthRange(month);
    if (!range) {            // future month: show nothing
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { start, end } = range;
      const res = await apiFetch(
        `/attendance?start_date=${start}&end_date=${end}&limit=1000${officeParam}`
      );
      if (res.ok) {
        const data = await res.json();
        if (id !== reqId.current) return; // a newer request replaced this one
        setRecords(data.records || []);
      }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [apiFetch, month, officeParam]);

  useEffect(() => { load(); }, [load]);

  // old export error goes away when the filter changes
  useEffect(() => { setExportError(''); }, [search, month, officeFilter]);

  const query = search.toLowerCase();

  // never show anything dated after today, even if the backend sends it
  const todayStr = localDateStr();
  const visibleRecords = records.filter(
    (r) => String(r.attendance_date || '').slice(0, 10) <= todayStr
  );

  const filteredRecords = visibleRecords.filter((r) =>
    (r.name || '').toLowerCase().includes(query)
  );

  const suggestions = search
    ? filteredRecords
      .map((r) => r.name)
      .filter((name, idx, arr) => arr.indexOf(name) === idx)
      .slice(0, 5)
    : [];

  function handleMonthChange(e) {
    const value = e.target.value;
    if (!value || value > currentMonth) return; // ignore cleared/future months
    setMonth(value);
  }

  // search box empty -> whole month, all employees (of the selected office, if any)
  async function exportAllEmployees() {
    const range = monthRange(month);
    if (!range) {
      setExportError('No attendance records for a future month.');
      return;
    }

    setExporting(true);
    setExportError('');
    try {
      const { start, end } = range;
      // fresh fetch with a high limit so a big team isn't cut off at 1000 rows
      const res = await apiFetch(
        `/attendance?start_date=${start}&end_date=${end}&limit=10000${officeParam}`
      );
      if (!res.ok) {
        setExportError(`Export failed (${res.status}). Please try again.`);
        return;
      }
      const data = await res.json();
      const all = (data.records || []).filter(
        (r) => String(r.attendance_date || '').slice(0, 10) <= todayStr
      );

      const result = buildAllEmployeesCsv(all, month, {
        withOffice: showOfficeColumn,
        officeName,
        fileTag: officeFilter ? slugify(officeName(officeFilter)) : 'all-employees',
      });
      if (!result.ok) {
        setExportError(result.error);
        return;
      }
      downloadCsv(result.csv, result.filename);
    } catch {
      setExportError('Failed to export attendance. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  function handleExport() {
    // nothing typed: export every employee for the month
    if (!search.trim()) {
      exportAllEmployees();
      return;
    }

    // an exact name wins over partial matches (Ram vs Ramesh)
    const exact = filteredRecords.filter(
      (r) => (r.name || '').trim().toLowerCase() === search.trim().toLowerCase()
    );
    const result = buildEmployeeCsv({
      records: exact.length ? exact : filteredRecords,
      month,
    });
    if (!result.ok) {
      setExportError(result.error);
      return;
    }
    setExportError('');
    downloadCsv(result.csv, result.filename);
  }

  return (
    <Shell active="attendance" title="Attendance">
      <div className="page-head">
        <h1>Attendance</h1>
        <p>Staff attendance based on camera first-seen / last-seen detection.</p>
      </div>

      <div className="filter-bar">
        {showOfficePicker && (
          <select value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)}>
            <option value="">All offices</option>
            {offices.map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
          </select>
        )}

        <input
          type="month"
          value={month}
          max={currentMonth}
          onChange={handleMonthChange}
        />

        <div className="search-wrap">
          <input
            type="text"
            placeholder="Search employee..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul className="suggest-list">
              {suggestions.map((name) => (
                <li
                  key={name}
                  onMouseDown={() => { setSearch(name); setShowSuggestions(false); }}
                >
                  {name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          className="btn btn-brass filter-export"
          onClick={handleExport}
          disabled={exporting}
          title={
            search.trim()
              ? 'Exports the searched employee for this month'
              : officeFilter
                ? 'Exports all employees of this office for this month'
                : 'Exports all employees for this month'
          }
        >
          {exporting ? 'Exporting…' : search.trim() ? 'Export CSV' : 'Export all CSV'}
        </button>
      </div>

      {exportError && (
        <div className="banner banner-error" role="alert">
          <span>{exportError}</span>
          <button type="button" onClick={() => setExportError('')}>Dismiss</button>
        </div>
      )}

      <div className="table-wrap">
        <table className="records stack">
          <thead>
            <tr>
              <th className="tight">Date</th>
              <th>Staff</th>
              {showOfficeColumn && <th>Office</th>}
              <th className="tight">First seen</th>
              <th className="tight">Last seen</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={colCount}><Loader compact /></td></tr>
            )}
            {!loading && filteredRecords.map((r, i) => (
              <tr key={i}>
                <td className="mono tight" data-label="Date">{r.attendance_date}</td>
                <td data-label="Staff">{r.name}</td>
                {showOfficeColumn && (
                  <td data-label="Office">{r.office_name || officeName(r.office_id)}</td>
                )}
                <td className="mono tight" data-label="First seen">{fmtTime(r.first_seen)}</td>
                <td className="mono tight" data-label="Last seen">{fmtTime(r.last_seen)}</td>
                <td data-label="Status">
                  <span className={`pill ${STATUS_PILL[r.status] || 'flag'}`}>
                    {STATUS_TEXT[r.status] || 'Absent'}
                  </span>
                </td>
              </tr>
            ))}
            {!loading && filteredRecords.length === 0 && (
              <tr>
                <td colSpan={colCount} className="table-empty-state">No attendance records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}