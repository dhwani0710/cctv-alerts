import React, { useEffect, useState, useCallback } from 'react';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { buildEmployeeCsv, downloadCsv } from '../utils/attendanceCsv.js';

function monthRange(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const start = `${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const endDay = isCurrentMonth ? today.getDate() : lastDay;
  const end = `${monthStr}-${String(endDay).padStart(2, '0')}`;
  return { start, end };
}

function fmtTime(value) {
  return value
    ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';
}

const STATUS_PILL = { present: 'clear', late: 'late', pending: 'review' };
const STATUS_TEXT = { present: 'Present', late: 'Late', pending: 'Not yet due' };

export default function Attendance() {
  const { apiFetch } = useAuth();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [exportError, setExportError] = useState('');

  const load = useCallback(async () => {
    const { start, end } = monthRange(month);
    const res = await apiFetch(`/attendance?start_date=${start}&end_date=${end}&limit=1000`);
    if (res.ok) {
      const data = await res.json();
      setRecords(data.records || []);
    }
  }, [apiFetch, month]);

  useEffect(() => { load(); }, [load]);

  // old export error goes away when the filter changes
  useEffect(() => { setExportError(''); }, [search, month]);

  const query = search.toLowerCase();

  const filteredRecords = records.filter((r) =>
    (r.name || '').toLowerCase().includes(query)
  );

  const suggestions = search
    ? records
        .filter((r) => (r.name || '').toLowerCase().includes(query))
        .map((r) => r.name)
        .filter((name, idx, arr) => arr.indexOf(name) === idx)
        .slice(0, 5)
    : [];

  function handleExport() {
    if (!search.trim()) {
      setExportError('Search one employee first. Each file holds one person.');
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
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />

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
          title="Exports the searched employee for this month"
        >
          Export CSV
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
              <th className="tight">First seen</th>
              <th className="tight">Last seen</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map((r, i) => (
              <tr key={i}>
                <td className="mono tight" data-label="Date">{r.attendance_date}</td>
                <td data-label="Staff">{r.name}</td>
                <td className="mono tight" data-label="First seen">{fmtTime(r.first_seen)}</td>
                <td className="mono tight" data-label="Last seen">{fmtTime(r.last_seen)}</td>
                <td data-label="Status">
                  <span className={`pill ${STATUS_PILL[r.status] || 'flag'}`}>
                    {STATUS_TEXT[r.status] || 'Absent'}
                  </span>
                </td>
              </tr>
            ))}
            {filteredRecords.length === 0 && (
              <tr>
                <td colSpan={5} className="table-empty-state">No attendance records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}