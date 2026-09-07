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
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { useAuth } from '../context/AuthContext';

export const Attendance = () => {
  const { apiFetch, user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isStaff = isAdmin || user?.role === 'manager';

  // Date range state (default to current date)
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);

  // Filter state
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedZone, setSelectedZone] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Dropdown options
  const [employees, setEmployees] = useState([]);
  const [cameras, setCameras] = useState([]);

  // Table & Pagination state
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message }

  // Manual Override Modal state
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [overrideForm, setOverrideForm] = useState({
    employee_id: '',
    date: todayStr,
    first_seen_at: '09:00',
    last_seen_at: '18:00',
    status: 'present',
    reason: '',
    zone_id: 'Manual Entry'
  });
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);

  // Time format helper
  const formatDisplayTime = (isoOrTime) => {
    if (!isoOrTime) return '—';
    try {
      if (isoOrTime.includes('T')) {
        return new Date(isoOrTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return isoOrTime;
    } catch {
      return isoOrTime;
    }
  };

  // Load employees and cameras for filter dropdowns
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [empRes, camRes] = await Promise.all([
          apiFetch('/employees'),
          apiFetch('/cameras')
        ]);
        if (empRes.ok) {
          const empData = await empRes.json();
          setEmployees(empData || []);
        }
        if (camRes.ok) {
          const camData = await camRes.json();
          setCameras(camData || []);
        }
      } catch (err) {
        console.error('Failed to load filter metadata:', err);
      }
    };
    fetchMetadata();
  }, [apiFetch]);

  // Load paginated attendance records
  const loadAttendance = useCallback(async (targetPage = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (selectedEmployee) params.append('employee_id', selectedEmployee);
      if (selectedZone) params.append('zone_id', selectedZone);
      if (selectedStatus) params.append('status', selectedStatus);
      if (searchTerm) params.append('search', searchTerm);
      params.append('page', targetPage.toString());
      params.append('limit', limit.toString());

      const res = await apiFetch(`/api/attendance?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        setTotal(data.total || 0);
        setPage(data.page || 1);
        setTotalPages(data.total_pages || 1);
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('Attendance fetch error:', err);
      }
    } catch (err) {
      console.error('Failed to load attendance:', err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, startDate, endDate, selectedEmployee, selectedZone, selectedStatus, searchTerm, page, limit]);

  // Trigger load when filters or pagination changes
  useEffect(() => {
    loadAttendance(page);
  }, [page, limit, startDate, endDate, selectedEmployee, selectedZone, selectedStatus, loadAttendance]);

  // Quick Date Range Presets
  const handlePreset = (preset) => {
    const now = new Date();
    if (preset === 'today') {
      const d = now.toISOString().split('T')[0];
      setStartDate(d);
      setEndDate(d);
    } else if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const d = y.toISOString().split('T')[0];
      setStartDate(d);
      setEndDate(d);
    } else if (preset === 'last7') {
      const past = new Date(now);
      past.setDate(past.getDate() - 6);
      setStartDate(past.toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    } else if (preset === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      setStartDate(firstDay);
      setEndDate(now.toISOString().split('T')[0]);
    }
    setPage(1);
  };

  // Export CSV Handler
  const handleExportCSV = async () => {
    setExporting(true);
    setFeedback(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (selectedEmployee) params.append('employee_id', selectedEmployee);
      if (selectedZone) params.append('zone_id', selectedZone);
      if (selectedStatus) params.append('status', selectedStatus);
      if (searchTerm) params.append('search', searchTerm);
      params.append('format', 'csv');

      const res = await apiFetch(`/api/attendance/export?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Export request failed');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = `attendance_report_${startDate || 'all'}_to_${endDate || 'today'}.csv`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setFeedback({ type: 'success', message: `Report exported successfully as ${filename}` });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      console.error('Export error:', err);
      setFeedback({ type: 'error', message: 'Failed to export CSV. Please try again.' });
    } finally {
      setExporting(false);
    }
  };

  // Open Override Modal
  const openOverrideModal = (rec = null) => {
    if (rec) {
      // Extract HH:MM from ISO if available
      let inTime = '09:00';
      let outTime = '18:00';
      if (rec.first_seen_at && rec.first_seen_at.includes('T')) {
        inTime = rec.first_seen_at.split('T')[1].slice(0, 5);
      }
      if (rec.last_seen_at && rec.last_seen_at.includes('T')) {
        outTime = rec.last_seen_at.split('T')[1].slice(0, 5);
      }

      setOverrideForm({
        employee_id: rec.employee_id || '',
        date: rec.attendance_date || todayStr,
        first_seen_at: inTime,
        last_seen_at: outTime,
        status: rec.status || 'present',
        reason: rec.override_reason || 'Manual manager review adjustment',
        zone_id: rec.zone_id || 'Manual Entry'
      });
    } else {
      setOverrideForm({
        employee_id: employees.length > 0 ? employees[0].id : '',
        date: todayStr,
        first_seen_at: '09:00',
        last_seen_at: '18:00',
        status: 'present',
        reason: '',
        zone_id: 'Manual Entry'
      });
    }
    setIsOverrideModalOpen(true);
  };

  // Submit Override Reconciliation
  const handleOverrideSubmit = async (e) => {
    e.preventDefault();
    if (!overrideForm.employee_id) {
      setFeedback({ type: 'error', message: 'Please select an employee' });
      return;
    }
    if (!overrideForm.date) {
      setFeedback({ type: 'error', message: 'Please select an attendance date' });
      return;
    }

    setOverrideSubmitting(true);
    setFeedback(null);
    try {
      const res = await apiFetch('/api/attendance/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: parseInt(overrideForm.employee_id, 10),
          date: overrideForm.date,
          first_seen_at: overrideForm.first_seen_at,
          last_seen_at: overrideForm.last_seen_at,
          status: overrideForm.status,
          reason: overrideForm.reason || 'Manual reconciliation',
          zone_id: overrideForm.zone_id || 'Manual Entry'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.detail || data.message || 'Failed to submit override');
      }

      setFeedback({ type: 'success', message: data.message || 'Attendance reconciled successfully!' });
      setIsOverrideModalOpen(false);
      loadAttendance(page);
      setTimeout(() => setFeedback(null), 4500);
    } catch (err) {
      console.error('Override error:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to reconcile attendance' });
    } finally {
      setOverrideSubmitting(false);
    }
  };

  // Aggregate Metrics for Active View
  const metrics = useMemo(() => {
    const presentCount = records.filter(r => (r.status || '').toLowerCase() === 'present').length;
    const overrideCount = records.filter(r => r.is_override).length;
    const totalHours = records.reduce((acc, r) => acc + (parseFloat(r.total_hours) || 0), 0);
    const avgHours = records.length > 0 ? (totalHours / records.length).toFixed(1) : '0.0';
    return { presentCount, overrideCount, avgHours };
  }, [records]);

  return (
    <div className="h-screen flex overflow-hidden bg-[var(--bg-page)] text-[var(--text-primary)]">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Attendance & Reconciliation" />

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {/* Header Action Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold tracking-wider text-[var(--accent)] uppercase">
                  Automated Security Intelligence
                </span>
                <span className="text-[10px] bg-[var(--bg-panel-3)] border border-[var(--border-color)] px-2 py-0.5 rounded text-[var(--text-muted)] font-mono">
                  Live Sync
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-1">
                Attendance Management & Reports
              </h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                CCTV biometric time-clock entries, date-range filters, and manual discrepancy overrides.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {isStaff && (
                <button
                  onClick={() => openOverrideModal()}
                  className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold px-4 py-2 rounded-lg transition flex items-center gap-2 shadow-sm"
                  title="Manual reconciliation or mark present"
                >
                  <span className="text-base leading-none">✏️</span>
                  <span>Manual Override</span>
                </button>
              )}

              <button
                onClick={handleExportCSV}
                disabled={exporting}
                className="border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] text-xs font-semibold px-4 py-2 rounded-lg transition flex items-center gap-2 disabled:opacity-50"
                title="Download report as CSV/Excel"
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
                onClick={() => loadAttendance(page)}
                disabled={loading}
                className="border border-[var(--border-color)] hover:border-[var(--accent)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs px-3 py-2 rounded-lg transition flex items-center gap-1.5"
                title="Reload current records"
              >
                <span className={loading ? 'animate-spin' : ''}>🔄</span>
                <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {/* Feedback Banner */}
          {feedback && (
            <div
              className={`p-3 rounded-lg text-xs font-medium flex items-center justify-between border transition ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              }`}
            >
              <span>{feedback.message}</span>
              <button
                onClick={() => setFeedback(null)}
                className="text-xs opacity-75 hover:opacity-100 ml-4 font-mono"
              >
                ✕
              </button>
            </div>
          )}

          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Total Logs
              </span>
              <div className="text-2xl font-bold font-mono text-[var(--text-primary)] mt-1">{total}</div>
              <span className="text-[10px] text-[var(--text-muted)]">In selected period</span>
            </div>

            <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Present On-Page
              </span>
              <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{metrics.presentCount}</div>
              <span className="text-[10px] text-[var(--text-muted)]">Active recognized</span>
            </div>

            <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Manual Overrides
              </span>
              <div className="text-2xl font-bold font-mono text-amber-400 mt-1">{metrics.overrideCount}</div>
              <span className="text-[10px] text-[var(--text-muted)]">Reconciled by admin</span>
            </div>

            <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Avg Shift Duration
              </span>
              <div className="text-2xl font-bold font-mono text-[var(--accent)] mt-1">{metrics.avgHours} hrs</div>
              <span className="text-[10px] text-[var(--text-muted)]">Across loaded items</span>
            </div>
          </div>

          {/* Filter Bar Panel */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl p-4 space-y-3 shadow-sm">
            {/* Quick Date Range Presets */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
              <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-medium">
                <span>Range Presets:</span>
                <button
                  type="button"
                  onClick={() => handlePreset('today')}
                  className="px-2.5 py-1 rounded bg-[var(--bg-panel-3)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] transition text-[11px]"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => handlePreset('yesterday')}
                  className="px-2.5 py-1 rounded bg-[var(--bg-panel-3)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] transition text-[11px]"
                >
                  Yesterday
                </button>
                <button
                  type="button"
                  onClick={() => handlePreset('last7')}
                  className="px-2.5 py-1 rounded bg-[var(--bg-panel-3)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] transition text-[11px]"
                >
                  Last 7 Days
                </button>
                <button
                  type="button"
                  onClick={() => handlePreset('month')}
                  className="px-2.5 py-1 rounded bg-[var(--bg-panel-3)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] transition text-[11px]"
                >
                  This Month
                </button>
              </div>

              <div className="text-[11px] text-[var(--text-muted)] font-mono">
                {startDate === endDate ? `Date: ${startDate}` : `${startDate} → ${endDate}`}
              </div>
            </div>

            {/* Filter Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-1">
              {/* Start Date */}
              <div>
                <label className="block text-[10px] font-semibold uppercase text-[var(--text-muted)] mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-[10px] font-semibold uppercase text-[var(--text-muted)] mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>

              {/* Employee Selector */}
              <div>
                <label className="block text-[10px] font-semibold uppercase text-[var(--text-muted)] mb-1">
                  Employee
                </label>
                <select
                  value={selectedEmployee}
                  onChange={(e) => {
                    setSelectedEmployee(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                >
                  <option value="">All Employees</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.designation || 'Staff'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Zone / Location Selector */}
              <div>
                <label className="block text-[10px] font-semibold uppercase text-[var(--text-muted)] mb-1">
                  Zone / Camera
                </label>
                <select
                  value={selectedZone}
                  onChange={(e) => {
                    setSelectedZone(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                >
                  <option value="">All Zones</option>
                  {cameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>
                      {cam.name} ({cam.location || cam.id})
                    </option>
                  ))}
                  <option value="Manual Entry">Manual Entry</option>
                </select>
              </div>

              {/* Status Selector */}
              <div>
                <label className="block text-[10px] font-semibold uppercase text-[var(--text-muted)] mb-1">
                  Status
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                >
                  <option value="">All Statuses</option>
                  <option value="present">Present</option>
                  <option value="half-day">Half Day</option>
                  <option value="on-duty">On Duty</option>
                  <option value="approved">Approved</option>
                </select>
              </div>

              {/* Search by Name */}
              <div>
                <label className="block text-[10px] font-semibold uppercase text-[var(--text-muted)] mb-1">
                  Search Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Type name..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(1);
                    }}
                    className="w-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-[var(--text-muted)]"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setPage(1);
                      }}
                      className="absolute right-2 top-1.5 text-xs text-[var(--text-muted)] hover:text-white"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Attendance Table Panel */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-color)] bg-[var(--bg-panel-3)]/60 text-[var(--text-muted)] uppercase tracking-wider text-[11px]">
                    <th className="px-4 py-3 font-semibold">Employee</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">First Seen (In)</th>
                    <th className="px-4 py-3 font-semibold">Last Seen (Out)</th>
                    <th className="px-4 py-3 font-semibold">Duration</th>
                    <th className="px-4 py-3 font-semibold">Zone / Point</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Method</th>
                    {isStaff && <th className="px-4 py-3 font-semibold text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {records.length > 0 ? (
                    records.map((r, i) => (
                      <tr key={r.id || i} className="hover:bg-[var(--bg-panel-3)]/40 transition">
                        {/* Employee Name & Role */}
                        <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] flex items-center justify-center font-mono text-xs text-[var(--accent)]">
                              {(r.name || '?').slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-100">{r.name}</div>
                              <div className="text-[10px] text-[var(--text-muted)]">
                                {r.designation || 'Staff'} {r.employee_id ? `(#${r.employee_id})` : ''}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3 font-mono text-[var(--text-muted)]">
                          {r.attendance_date}
                        </td>

                        {/* First Seen (Clock In) */}
                        <td className="px-4 py-3 font-mono text-emerald-400 font-semibold">
                          {formatDisplayTime(r.first_seen_at || r.first_seen)}
                        </td>

                        {/* Last Seen (Clock Out) */}
                        <td className="px-4 py-3 font-mono text-amber-400 font-semibold">
                          {formatDisplayTime(r.last_seen_at || r.last_seen)}
                        </td>

                        {/* Total Hours */}
                        <td className="px-4 py-3 font-mono text-[var(--text-primary)] font-medium">
                          {r.total_hours ? `${r.total_hours} hrs` : '—'}
                        </td>

                        {/* Zone / Location */}
                        <td className="px-4 py-3 text-[var(--text-muted)]">
                          <span className="inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
                            <span>{r.zone_id || 'Front Door'}</span>
                          </span>
                        </td>

                        {/* Status Badge */}
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 capitalize">
                            {r.status || 'present'}
                          </span>
                        </td>

                        {/* Reconciliation Method */}
                        <td className="px-4 py-3">
                          {r.is_override ? (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-amber-950/40 border border-amber-500/40 text-amber-300 font-mono"
                              title={r.override_reason || 'Manual manager override'}
                            >
                              <span>✏️</span>
                              <span>Override</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700 text-slate-300 font-mono">
                              <span>📹</span>
                              <span>CCTV</span>
                            </span>
                          )}
                        </td>

                        {/* Row Actions */}
                        {isStaff && (
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => openOverrideModal(r)}
                              className="border border-[var(--border-color)] hover:border-[var(--accent)] text-[var(--text-muted)] hover:text-[var(--accent)] rounded px-2.5 py-1 text-[11px] transition"
                              title="Reconcile or override this entry"
                            >
                              Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={isStaff ? 9 : 8} className="text-center py-12 text-[var(--text-muted)]">
                        {loading ? (
                          <div className="flex flex-col items-center justify-center gap-2">
                            <span className="animate-spin text-xl">⏳</span>
                            <span>Loading attendance logs...</span>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="text-base">📋 No attendance records found</div>
                            <div className="text-[11px]">
                              Try adjusting your date range or filters, or use &quot;Manual Override&quot; to record attendance.
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-[var(--border-color)] bg-[var(--bg-panel-3)]/30 text-xs">
              <div className="text-[var(--text-muted)]">
                Showing{' '}
                <span className="font-mono text-[var(--text-primary)] font-semibold">
                  {records.length > 0 ? (page - 1) * limit + 1 : 0}
                </span>{' '}
                to{' '}
                <span className="font-mono text-[var(--text-primary)] font-semibold">
                  {Math.min(page * limit, total)}
                </span>{' '}
                of <span className="font-mono text-[var(--text-primary)] font-semibold">{total}</span> records
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--text-muted)] text-[11px]">Page size:</span>
                  <select
                    value={limit}
                    onChange={(e) => {
                      setLimit(parseInt(e.target.value, 10));
                      setPage(1);
                    }}
                    className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none"
                  >
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="50">50</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                    className="px-2.5 py-1 rounded border border-[var(--border-color)] hover:border-[var(--accent)] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none transition"
                  >
                    Previous
                  </button>

                  <span className="font-mono text-xs px-2 text-[var(--text-primary)]">
                    {page} / {totalPages || 1}
                  </span>

                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || loading}
                    className="px-2.5 py-1 rounded border border-[var(--border-color)] hover:border-[var(--accent)] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Attendance Override Modal */}
      {isOverrideModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-panel-3)]/50">
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  Manual Attendance Override
                </h2>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Record or reconcile clock-in/out times for employee records
                </p>
              </div>
              <button
                onClick={() => setIsOverrideModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel-3)] transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleOverrideSubmit} className="p-6 space-y-4 text-xs">
              {/* Employee Selection */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-1">
                  Employee <span className="text-rose-400">*</span>
                </label>
                <select
                  value={overrideForm.employee_id}
                  onChange={(e) => setOverrideForm({ ...overrideForm, employee_id: e.target.value })}
                  required
                  className="w-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                >
                  <option value="">Select Employee...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.designation || 'Staff'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-1">
                  Date <span className="text-rose-400">*</span>
                </label>
                <input
                  type="date"
                  value={overrideForm.date}
                  onChange={(e) => setOverrideForm({ ...overrideForm, date: e.target.value })}
                  required
                  className="w-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>

              {/* Time In and Time Out */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-1">
                    First Seen (Clock In)
                  </label>
                  <input
                    type="time"
                    step="1"
                    value={overrideForm.first_seen_at}
                    onChange={(e) => setOverrideForm({ ...overrideForm, first_seen_at: e.target.value })}
                    required
                    className="w-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-1">
                    Last Seen (Clock Out)
                  </label>
                  <input
                    type="time"
                    step="1"
                    value={overrideForm.last_seen_at}
                    onChange={(e) => setOverrideForm({ ...overrideForm, last_seen_at: e.target.value })}
                    required
                    className="w-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
              </div>

              {/* Status and Zone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-1">
                    Status
                  </label>
                  <select
                    value={overrideForm.status}
                    onChange={(e) => setOverrideForm({ ...overrideForm, status: e.target.value })}
                    className="w-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  >
                    <option value="present">Present</option>
                    <option value="half-day">Half Day</option>
                    <option value="on-duty">On Duty</option>
                    <option value="approved">Approved</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-1">
                    Zone / Location
                  </label>
                  <input
                    type="text"
                    value={overrideForm.zone_id}
                    onChange={(e) => setOverrideForm({ ...overrideForm, zone_id: e.target.value })}
                    placeholder="e.g. Front Entrance, Vault, Manual"
                    className="w-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
              </div>

              {/* Reason / Notes */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-1">
                  Reason for Override <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={2}
                  value={overrideForm.reason}
                  onChange={(e) => setOverrideForm({ ...overrideForm, reason: e.target.value })}
                  required
                  placeholder="e.g. Biometric recognition failure, approved manager exception, offsite duty..."
                  className="w-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setIsOverrideModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border-color)] hover:bg-[var(--bg-panel-3)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={overrideSubmitting}
                  className="px-5 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] font-semibold transition disabled:opacity-50 flex items-center gap-2"
                >
                  {overrideSubmitting ? (
                    <>
                      <span className="animate-spin text-sm">⏳</span>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Confirm Override</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
