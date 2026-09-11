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
  const [selectedIds, setSelectedIds] = useState([]);

  function toggleSelectAll(e) {
    setSelectedIds(e.target.checked ? records.map((r) => r.id) : []);
  }

  function toggleSelectOne(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function deleteSelected() {
    for (const id of selectedIds) {
      await apiFetch(`/records/${id}`, { method: 'DELETE' });
    }
    setSelectedIds([]);
    loadRecords();
  }

  const loadCameras = useCallback(async () => {
    const res = await apiFetch('/cameras');
    if (res.ok) setCameras(await res.json());
  }, [apiFetch]);

  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadRecords = useCallback(async () => {
    const params = new URLSearchParams();
    if (camera) params.append('camera', camera);
    if (status) params.append('status', status);
    if (date) params.append('date', date);
    params.append('page', page);
    params.append('limit', pageSize);
    const res = await apiFetch(`/records?${params}`);
    if (res.ok) {
      const data = await res.json();
      setRecords(data.records || []);
      setTotal(data.total || 0);
    }
  }, [apiFetch, camera, status, date, page]);

  useEffect(() => { loadCameras(); }, [loadCameras]);
  useEffect(() => { loadRecords(); }, [loadRecords]);
  useEffect(() => { setPage(1); }, [camera, status, date]);

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
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
        <button className="btn btn-outline btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
        <span style={{ alignSelf: 'center', fontSize: 13.5 }}>Page {page} of {totalPages}</span>
        <button className="btn btn-outline btn-sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {selectedIds.length > 0 && (
            <button className="btn btn-outline" onClick={deleteSelected}>
              Delete selected ({selectedIds.length})
            </button>
          )}
          {isAdmin && <button className="btn btn-brass">Export CSV</button>}
        </div>
      </div>
      <div className="panel">
        <div className="table-wrap">
          <table className="records" style={{ tableLayout: 'fixed', width: '100%', textAlign: 'center' }}>
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={records.length > 0 && selectedIds.length === records.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th style={{ textAlign: 'center' }}>Date</th>
                <th style={{ textAlign: 'center' }}>Time</th>
                <th style={{ textAlign: 'center' }}>Camera</th>
                <th style={{ textAlign: 'center' }}>Zone</th>
                <th style={{ textAlign: 'center' }}>Person</th>
                <th style={{ textAlign: 'center' }}>Event</th>
                <th style={{ textAlign: 'center' }}>Count</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(r.id)}
                      onChange={() => toggleSelectOne(r.id)}
                    />
                  </td>
                  <td className="mono">{new Date(r.timestamp).toLocaleDateString()}</td>
                  <td className="mono">{new Date(r.timestamp).toLocaleTimeString()}</td>
                  <td>{r.camera_id}</td>
                  <td>{r.zone_name || '-'}</td>
                  <td>{r.person_name.replace('@front', '')}</td>
                  <td>{r.person_name === 'Unknown@front' ? 'Detect outside the store' : r.message.replace(/^\[.*?\]\s*/, '').replace(/^\S+\s*present\s*/i, '')}</td>
                  <td className="mono">{r.occurrences}</td>
                  <td><span className={`pill ${STATUS_PILL[r.priority]}`}>{STATUS_LABEL[r.priority]}</span></td>
                  {isAdmin && <td><button className="btn btn-outline btn-sm" onClick={() => setDeleteTarget(r)}>Delete</button></td>}
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={isAdmin ? 10 : 9} style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No records match these filters.</td></tr>
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