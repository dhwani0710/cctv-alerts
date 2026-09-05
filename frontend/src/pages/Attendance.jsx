import React, { useEffect, useState, useCallback } from 'react';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const tightCell = { padding: '11px 6px' };

export default function Attendance() {
  const { apiFetch } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [records, setRecords] = useState([]);

  const load = useCallback(async () => {
    const res = await apiFetch(`/attendance?date=${date}`);
    if (res.ok) {
      const data = await res.json();
      setRecords(data.records || []);
    }
  }, [apiFetch, date]);

  useEffect(() => { load(); }, [load]);

  return (
    <Shell active="attendance" title="Attendance">
      <div className="page-head">
        <h1>Attendance</h1>
        <p>Staff attendance based on camera first-seen / last-seen detection.</p>
      </div>

      <div className="filter-bar">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="table-wrap">
        <table className="records">
          <thead>
            <tr>
              <th>Staff</th>
              <th style={tightCell}>First seen</th>
              <th style={tightCell}>Last seen</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td className="mono" style={tightCell}>{new Date(r.first_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td className="mono" style={tightCell}>{new Date(r.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td><span className="pill clear">Present</span></td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr><td colSpan={4} style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No attendance records for this date.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}