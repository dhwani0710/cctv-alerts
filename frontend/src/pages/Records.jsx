import React, { useMemo, useState } from 'react';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { MOCK_CAMERAS, MOCK_RECORDS } from '../data/mockData.js';

const STATUS_LABEL = { clear: 'Clear', flag: 'Flagged', review: 'Review' };

export default function Records() {
  const { session } = useAuth();
  const isAdmin = session.role === 'admin';
  const [camera, setCamera] = useState('');
  const [status, setStatus] = useState('');

  const filtered = useMemo(
    () => MOCK_RECORDS.filter((r) => (!camera || r.camera === camera) && (!status || r.status === status)),
    [camera, status]
  );

  return (
    <Shell active="records" title="Records">
      <div className="page-head">
        <span className="eyebrow">Ledger</span>
        <h1>Access & alert records</h1>
        <p>Every entry, exit and flagged event, in order.</p>
      </div>
      <div className="filter-bar">
        <select value={camera} onChange={(e) => setCamera(e.target.value)}>
          <option value="">All cameras</option>
          {MOCK_CAMERAS.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="clear">Clear</option>
          <option value="flag">Flagged</option>
          <option value="review">Needs review</option>
        </select>
        <input type="date" />
        {isAdmin && <button className="btn btn-brass" style={{ marginLeft: 'auto' }}>Export CSV</button>}
      </div>
      <div className="panel">
        <div className="table-wrap">
          <table className="records">
            <thead>
              <tr>
                <th>Time</th><th>Camera</th><th>Person</th><th>Event</th><th>Status</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.time}</td>
                  <td>{r.camera}</td>
                  <td>{r.person}</td>
                  <td>{r.event}</td>
                  <td><span className={`pill ${r.status}`}>{STATUS_LABEL[r.status]}</span></td>
                  {isAdmin && <td><button className="btn btn-outline btn-sm">Delete</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
