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
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { useAuth } from '../context/AuthContext';

export const Records = () => {
  const { apiFetch } = useAuth();

  // Filter states
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Dropdown options
  const [cameras, setCameras] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Snapshot modal
  const [activeSnapshot, setActiveSnapshot] = useState(null);

  const statusLabel = { high: 'Flagged', medium: 'Needs Review', low: 'Clear' };
  const statusBadgeColor = {
    high: 'bg-rose-950/60 border-rose-500/40 text-rose-300',
    medium: 'bg-amber-950/60 border-amber-500/40 text-amber-300',
    low: 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
  };

  // Fetch cameras for dropdown
  useEffect(() => {
    const fetchCameras = async () => {
      try {
        const res = await apiFetch('/cameras');
        if (res.ok) {
          const data = await res.json();
          setCameras(data || []);
        }
      } catch (err) {
        console.error('Failed to load cameras:', err);
      }
    };
    fetchCameras();
  }, [apiFetch]);

  // Load records
  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedDate) params.append('date', selectedDate);
      if (selectedCamera) params.append('camera', selectedCamera);
      if (selectedStatus) params.append('status', selectedStatus);
      params.append('limit', '100');

      const res = await apiFetch(`/api/records?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data || []);
      }
    } catch (err) {
      console.error('Failed to load records:', err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, selectedDate, selectedCamera, selectedStatus]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // Filter records by search term client-side
  const filteredRecords = useMemo(() => {
    if (!searchTerm.trim()) return records;
    const term = searchTerm.toLowerCase();
    return records.filter(
      (r) =>
        (r.person_name && r.person_name.toLowerCase().includes(term)) ||
        (r.message && r.message.toLowerCase().includes(term)) ||
        (r.camera_id && r.camera_id.toLowerCase().includes(term))
    );
  }, [records, searchTerm]);

  // Summary counts
  const summary = useMemo(() => {
    const high = filteredRecords.filter((r) => r.priority === 'high').length;
    const medium = filteredRecords.filter((r) => r.priority === 'medium').length;
    const low = filteredRecords.filter((r) => r.priority === 'low').length;
    return { total: filteredRecords.length, high, medium, low };
  }, [filteredRecords]);

  // Export CSV
  const handleExportCSV = async () => {
    setExporting(true);
    setFeedback(null);
    try {
      const params = new URLSearchParams();
      if (selectedDate) params.append('date', selectedDate);
      if (selectedCamera) params.append('camera', selectedCamera);
      if (selectedStatus) params.append('status', selectedStatus);

      const res = await apiFetch(`/api/records/export?${params.toString()}`);
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = `security_records_${selectedDate || 'all'}.csv`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setFeedback({ type: 'success', message: `Exported ${filename} successfully` });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      console.error('Records export error:', err);
      setFeedback({ type: 'error', message: 'Failed to export records CSV' });
    } finally {
      setExporting(false);
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return ts;
    }
  };

  return (
    <div className="h-screen flex overflow-hidden bg-[var(--bg-page)] text-[var(--text-primary)]">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Security & Alert Records" />

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold tracking-wider text-[var(--accent)] uppercase">
                  Audit Ledger
                </span>
                <span className="text-[10px] bg-[var(--bg-panel-3)] border border-[var(--border-color)] px-2 py-0.5 rounded text-[var(--text-muted)] font-mono">
                  Event History
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-1">
                Access & Alert Records
              </h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Full chronological ledger of face detections, unrecognized alerts, and system security flags.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleExportCSV}
                disabled={exporting}
                className="border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] text-xs font-semibold px-4 py-2 rounded-lg transition flex items-center gap-2 disabled:opacity-50"
              >
                {exporting ? (
                  <>
                    <span className="animate-spin text-sm">⏳</span>
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <span>📥</span>
                    <span>Export CSV</span>
                  </>
                )}
              </button>

              <button
                onClick={loadRecords}
                disabled={loading}
                className="border border-[var(--border-color)] hover:border-[var(--accent)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs px-3 py-2 rounded-lg transition flex items-center gap-1.5"
              >
                <span className={loading ? 'animate-spin' : ''}>🔄</span>
                <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {/* Feedback banner */}
          {feedback && (
            <div
              className={`p-3 rounded-lg text-xs font-medium flex items-center justify-between border transition ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              }`}
            >
              <span>{feedback.message}</span>
              <button onClick={() => setFeedback(null)} className="text-xs opacity-75 hover:opacity-100 font-mono">
                ✕
              </button>
            </div>
          )}

          {/* KPI Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Total Events
              </span>
              <div className="text-2xl font-bold font-mono text-[var(--text-primary)] mt-1">{summary.total}</div>
            </div>

            <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Flagged (High)
              </span>
              <div className="text-2xl font-bold font-mono text-rose-400 mt-1">{summary.high}</div>
            </div>

            <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Review (Medium)
              </span>
              <div className="text-2xl font-bold font-mono text-amber-400 mt-1">{summary.medium}</div>
            </div>

            <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Clear (Low)
              </span>
              <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{summary.low}</div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl p-4 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Date */}
              <div>
                <label className="block text-[10px] font-semibold uppercase text-[var(--text-muted)] mb-1">
                  Filter Date
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  />
                  {selectedDate && (
                    <button
                      onClick={() => setSelectedDate('')}
                      className="px-2 bg-[var(--bg-panel-3)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-muted)] hover:text-white"
                      title="Clear date"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Camera */}
              <div>
                <label className="block text-[10px] font-semibold uppercase text-[var(--text-muted)] mb-1">
                  Camera
                </label>
                <select
                  value={selectedCamera}
                  onChange={(e) => setSelectedCamera(e.target.value)}
                  className="w-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                >
                  <option value="">All Cameras</option>
                  {cameras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.location || c.id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-[10px] font-semibold uppercase text-[var(--text-muted)] mb-1">
                  Status
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                >
                  <option value="">All Statuses</option>
                  <option value="flag">Flagged</option>
                  <option value="review">Needs Review</option>
                  <option value="clear">Clear</option>
                </select>
              </div>

              {/* Search */}
              <div>
                <label className="block text-[10px] font-semibold uppercase text-[var(--text-muted)] mb-1">
                  Search Person / Event
                </label>
                <input
                  type="text"
                  placeholder="Filter name or message..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-[var(--text-muted)]"
                />
              </div>
            </div>
          </div>

          {/* Records Table */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-color)] bg-[var(--bg-panel-3)]/60 text-[var(--text-muted)] uppercase tracking-wider text-[11px]">
                    <th className="px-4 py-3 font-semibold">Time</th>
                    <th className="px-4 py-3 font-semibold">Camera</th>
                    <th className="px-4 py-3 font-semibold">Person</th>
                    <th className="px-4 py-3 font-semibold">Event Message</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Snapshot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {filteredRecords.length > 0 ? (
                    filteredRecords.map((r, i) => (
                      <tr key={i} className="hover:bg-[var(--bg-panel-3)]/40 transition">
                        <td className="px-4 py-3 font-mono text-[var(--text-muted)]">
                          <div>{formatTimestamp(r.timestamp)}</div>
                          <div className="text-[10px] opacity-70">
                            {r.timestamp ? r.timestamp.split('T')[0] : ''}
                          </div>
                        </td>

                        <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            <span>{r.camera_id || 'Front Door'}</span>
                          </span>
                        </td>

                        <td className="px-4 py-3 font-semibold text-slate-100">
                          {r.person_name || 'Unknown'}
                        </td>

                        <td className="px-4 py-3 text-[var(--text-muted)] max-w-xs truncate">
                          {r.message}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              statusBadgeColor[r.priority] || statusBadgeColor.low
                            }`}
                          >
                            {statusLabel[r.priority] || r.priority}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right">
                          {r.snapshot_filename ? (
                            <button
                              onClick={() => setActiveSnapshot(r.snapshot_filename)}
                              className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1 ml-auto font-medium"
                            >
                              <span>📷</span>
                              <span>View</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-[var(--text-muted)]">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-[var(--text-muted)]">
                        {loading ? (
                          <div className="flex flex-col items-center justify-center gap-2">
                            <span className="animate-spin text-xl">⏳</span>
                            <span>Loading records...</span>
                          </div>
                        ) : (
                          'No security alert records matching criteria.'
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Snapshot Preview Modal */}
      {activeSnapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-2xl max-w-xl w-full p-4 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <span className="text-sm font-bold text-[var(--text-primary)]">Snapshot Capture</span>
              <button
                onClick={() => setActiveSnapshot(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center border border-[var(--border-color)]">
              <img
                src={`/snapshots/${activeSnapshot}`}
                alt="Alert Snapshot"
                className="max-h-[60vh] object-contain w-full"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" fill="%23666"><text x="50%" y="50%" text-anchor="middle" fill="%23aaa">Snapshot unavailable</text></svg>';
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Records;
