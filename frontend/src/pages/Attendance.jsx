import React, { useEffect, useState, useCallback } from 'react';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const tightCell = { padding: '11px 6px' };

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

export default function Attendance() {
  const { apiFetch } = useAuth();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const load = useCallback(async () => {
    const { start, end } = monthRange(month);
    const res = await apiFetch(`/attendance?start_date=${start}&end_date=${end}&limit=1000`);
    if (res.ok) {
      const data = await res.json();
      setRecords(data.records || []);
    }
  }, [apiFetch, month]);

  useEffect(() => { load(); }, [load]);

  async function handleExport() {
    const { start, end } = monthRange(month);
    const res = await apiFetch(`/attendance/export?start_date=${start}&end_date=${end}`);
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-${month}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    }
  }

  const filteredRecords = records.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  const suggestions = search
    ? records
        .filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
        .map((r) => r.name)
        .filter((name, idx, arr) => arr.indexOf(name) === idx)
        .slice(0, 5)
    : [];

  return (
    <Shell active="attendance" title="Attendance">
      <div className="page-head">
        <h1>Attendance</h1>
        <p>Staff attendance based on camera first-seen / last-seen detection.</p>
      </div>

      <div className="filter-bar" style={{ gap: 12, display: 'flex', alignItems: 'center', position: 'relative' }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />

        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Search employee..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
              background: 'var(--panel, #1a1a1a)', border: '1px solid #333',
              listStyle: 'none', margin: 0, padding: '4px 0', borderRadius: 6
            }}>
              {suggestions.map((name) => (
                <li
                  key={name}
                  onMouseDown={() => { setSearch(name); setShowSuggestions(false); }}
                  style={{ padding: '6px 10px', cursor: 'pointer' }}
                >
                  {name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <button className="btn btn-brass" style={{ marginLeft: 'auto' }} onClick={handleExport}>Export CSV</button>
      </div>

      <div className="table-wrap">
        <table className="records">
          <thead>
            <tr>
              <th style={tightCell}>Date</th>
              <th>Staff</th>
              <th style={tightCell}>First seen</th>
              <th style={tightCell}>Last seen</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map((r, i) => (
              <tr key={i}>
                <td className="mono" style={tightCell}>{r.attendance_date}</td>
                <td>{r.name}</td>
                <td className="mono" style={tightCell}>{r.first_seen ? new Date(r.first_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td className="mono" style={tightCell}>{r.last_seen ? new Date(r.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td><span className={`pill ${r.status === 'present' ? 'clear' : r.status === 'late' ? 'late' : r.status === 'pending' ? 'review' : 'flag'}`}>{r.status === 'present' ? 'Present' : r.status === 'late' ? 'Late' : r.status === 'pending' ? 'Not yet due' : 'Absent'}</span></td>
              </tr>
            ))}
            {filteredRecords.length === 0 && (
              <tr><td colSpan={5} style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No attendance records found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}