import React, { useEffect, useState, useCallback } from 'react';
import Shell from '../components/Shell.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const STATUS_LABEL = { high: 'Flagged', medium: 'Review', low: 'Clear' };
const STATUS_PILL = { high: 'flag', medium: 'review', low: 'clear' };

// Small helper so every fetch on this page reports a consistent, readable
// error instead of a raw status code or a swallowed network exception.
async function describeFetchError(res, fallback) {
  try {
    const body = await res.json();
    if (body?.detail) return body.detail;
  } catch {
    // response wasn't JSON — fall through to the generic message
  }
  return `${fallback} (${res.status})`;
}

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

  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordsError, setRecordsError] = useState(null);
  const [camerasError, setCamerasError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  function toggleSelectAll(e) {
    const pageIds = records.map((r) => r.id);
    if (e.target.checked) {
      setSelectedIds((prev) => [...new Set([...prev, ...pageIds])]);
    } else {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    }
  }

  function toggleSelectOne(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await apiFetch(`/records/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await describeFetchError(res, 'Failed to delete record'));
      setDeleteTarget(null);
      await loadRecords();
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete the record. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  async function deleteSelected() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const results = await Promise.allSettled(
        selectedIds.map((id) => apiFetch(`/records/${id}`, { method: 'DELETE' }))
      );
      const failedCount = results.filter(
        (r) => r.status === 'rejected' || !r.value?.ok
      ).length;
      if (failedCount > 0) {
        setDeleteError(
          failedCount === selectedIds.length
            ? 'Could not delete the selected records. Please try again.'
            : `${failedCount} of ${selectedIds.length} selected record(s) could not be deleted.`
        );
      }
      setSelectedIds([]);
      setConfirmBulkDelete(false);
      await loadRecords();
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete the selected records. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const params = new URLSearchParams();
      if (camera) params.append('camera', camera);
      if (status) params.append('status', status);
      if (date) params.append('date', date);
      const res = await apiFetch(`/records/export?${params}`);
      if (!res.ok) throw new Error(await describeFetchError(res, 'Export failed'));
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'records.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err.message || 'Failed to export records. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  const loadCameras = useCallback(async () => {
    setCamerasError(null);
    try {
      const res = await apiFetch('/cameras');
      if (!res.ok) throw new Error(await describeFetchError(res, 'Failed to load cameras'));
      setCameras(await res.json());
    } catch (err) {
      setCameras([]);
      setCamerasError(err.message || 'Camera list unavailable — filter by camera is disabled.');
    }
  }, [apiFetch]);

  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadRecords = useCallback(async () => {
    setLoadingRecords(true);
    setRecordsError(null);
    try {
      const params = new URLSearchParams();
      if (camera) params.append('camera', camera);
      if (status) params.append('status', status);
      if (date) params.append('date', date);
      params.append('page', page);
      params.append('limit', pageSize);
      const res = await apiFetch(`/records?${params}`);
      if (!res.ok) throw new Error(await describeFetchError(res, 'Failed to load records'));
      const data = await res.json();
      setRecords(data.records || []);
      setTotal(data.total || 0);
    } catch (err) {
      setRecords([]);
      setTotal(0);
      setRecordsError(err.message || 'Failed to load records. Please try again.');
    } finally {
      setLoadingRecords(false);
    }
  }, [apiFetch, camera, status, date, page]);

  useEffect(() => { loadCameras(); }, [loadCameras]);
  useEffect(() => { loadRecords(); }, [loadRecords]);
  useEffect(() => { setPage(1); }, [camera, status, date]);

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
      {camerasError && (
        <div className="banner banner-error">
          <span>{camerasError}</span>
          <button onClick={loadCameras}>Retry</button>
        </div>
      )}
      {deleteError && (
        <div className="banner banner-error">
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)}>Dismiss</button>
        </div>
      )}
      {exportError && (
        <div className="banner banner-error">
          <span>{exportError}</span>
          <button onClick={handleExport}>Retry</button>
        </div>
      )}

      <div className="filter-bar">
        <select value={camera} onChange={(e) => setCamera(e.target.value)} disabled={!!camerasError}>
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
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
            <input
              type="checkbox"
              checked={records.length > 0 && records.every((r) => selectedIds.includes(r.id))}
              onChange={toggleSelectAll}
              disabled={loadingRecords || records.length === 0}
            />
            Select all
          </label>
          {selectedIds.length > 0 && (
            <button className="btn btn-outline" onClick={() => setConfirmBulkDelete(true)} disabled={deleting}>
              {deleting ? <><span className="spinner" /> Deleting…</> : `Delete selected (${selectedIds.length})`}
            </button>
          )}
          {isAdmin && (
            <button className="btn btn-brass" onClick={handleExport} disabled={exporting}>
              {exporting ? <><span className="spinner" /> Exporting…</> : 'Export CSV'}
            </button>
          )}
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
                    checked={records.length > 0 && records.every((r) => selectedIds.includes(r.id))}
                    onChange={toggleSelectAll}
                    disabled={loadingRecords || records.length === 0}
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
              </tr>
            </thead>
            <tbody>
              {loadingRecords && (
                <tr>
                  <td colSpan={9} className="table-empty-state">
                    <span className="spinner" /> Loading records…
                  </td>
                </tr>
              )}
              {!loadingRecords && recordsError && (
                <tr>
                  <td colSpan={9} className="table-empty-state">
                    <div className="banner banner-error" style={{ margin: '0 auto', display: 'inline-flex' }}>
                      <span>{recordsError}</span>
                      <button onClick={loadRecords}>Retry</button>
                    </div>
                  </td>
                </tr>
              )}
              {!loadingRecords && !recordsError && records.map((r) => (
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
                  <td>{r.camera_name}</td>
                  <td>{r.zone_name || '-'}</td>
                  <td>{r.person_name.replace('@front', '')}</td>
                  <td>{r.person_name === 'Unknown@front' ? 'Detect outside the store' : r.message.replace(/^\[.*?\]\s*/, '').replace(/^\S+\s*present\s*/i, '')}</td>
                  <td className="mono">{r.occurrences}</td>
                  <td><span className={`pill ${STATUS_PILL[r.priority]}`}>{STATUS_LABEL[r.priority]}</span></td>
                </tr>
              ))}
              {!loadingRecords && !recordsError && records.length === 0 && (
                <tr><td colSpan={9} className="table-empty-state">No records match these filters.</td></tr>
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
      <ConfirmDialog
        open={confirmBulkDelete}
        title="Delete selected records"
        message={`Permanently delete ${selectedIds.length} selected record${selectedIds.length === 1 ? '' : 's'}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={deleteSelected}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </Shell>
  );
}