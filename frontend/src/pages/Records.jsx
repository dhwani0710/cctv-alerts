import React, { useEffect, useState, useCallback } from 'react';
import Shell from '../components/Shell.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const STATUS_LABEL = { high: 'Flagged', medium: 'Review', low: 'Clear' };
const STATUS_PILL = { high: 'flag', medium: 'review', low: 'clear' };

export default function Records() {
  const { session, apiFetch } = useAuth();
  const isAdmin = session.role === 'ceo' || session.role === 'owner';
  const [camera, setCamera] = useState('');
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [records, setRecords] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadCameras = useCallback(async () => {
    const res = await apiFetch('/cameras');
    if (res.ok) setCameras(await res.json());
  }, [apiFetch]);

  const loadRecords = useCallback(async () => {
    const params = new URLSearchParams();
    if (camera) params.append('camera', camera);
    if (status) params.append('status', status);
    if (date) params.append('date', date);
    const res = await apiFetch(`/records?${params}`);
    if (res.ok) setRecords(await res.json());
  }, [apiFetch, camera, status, date]);

  useEffect(() => { loadCameras(); }, [loadCameras]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  async function confirmDelete() {
    await apiFetch(`/records/${deleteTarget.id}`, { method: 'DELETE' });
    setDeleteTarget(null);
    loadRecords();
  }

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
          {cameras.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="clear">Clear</option>
          <option value="flag">Flagged</option>
          <option value="review">Needs review</option>
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{new Date(r.timestamp).toLocaleString()}</td>
                  <td>{r.camera_id}</td>
                  <td>{r.person_name}</td>
                  <td>{r.message}</td>
                  <td><span className={`pill ${STATUS_PILL[r.priority]}`}>{STATUS_LABEL[r.priority]}</span></td>
                  {isAdmin && <td><button className="btn btn-outline btn-sm" onClick={() => setDeleteTarget(r)}>Delete</button></td>}
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={isAdmin ? 6 : 5} style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No records match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete record"
        message={deleteTarget ? `Permanently delete this record for ${deleteTarget.person_name}?` : ''}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Shell>
  );
}
