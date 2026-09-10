import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { useAuth } from '../context/AuthContext';

export const AttendancePage = () => {
  const { apiFetch } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  const formatTime = (iso) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  const loadAttendance = useCallback(async (date) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/attendance?date=${encodeURIComponent(date)}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      }
    } catch (err) {
      console.error('Failed to load attendance:', err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadAttendance(selectedDate);
  }, [selectedDate, loadAttendance]);

  const handleExportCSV = () => {
    if (!records || records.length === 0) {
      alert('No attendance records to export for this date.');
      return;
    }

    const headers = ['Date', 'Employee', 'First Seen', 'Last Seen', 'Status'];
    const rows = records.map((r) => [
      `="${selectedDate}"`,
      `"${(r.name || '').replace(/"/g, '""')}"`,
      `="${formatTime(r.first_seen)}"`,
      `="${formatTime(r.last_seen)}"`,
      '"Present"'
    ].join(','));

    // Prepend UTF-8 BOM (\uFEFF) so Excel parses all text properly
    const csvContent = '\uFEFF' + headers.join(',') + '\r\n' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${selectedDate}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Attendance" />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">

            <div>
              <h1 className="text-2xl font-bold text-slate-100 tracking-tight font-serif">Attendance</h1>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Staff attendance based on camera first-seen / last-seen detection.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportCSV}
                  className="text-xs bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold rounded-lg px-3.5 py-2 transition flex items-center gap-1.5 shadow"
                  title="Export current attendance records to CSV"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  <span>Export CSV</span>
                </button>
                <button
                  onClick={() => loadAttendance(selectedDate)}
                  disabled={loading}
                  className="text-xs border border-[var(--border-color)] hover:border-amber-500 rounded-lg px-3 py-2 text-slate-300 hover:text-amber-400 transition flex items-center gap-1.5"
                >
                  <span>🔄</span>
                  <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              </div>
            </div>

            <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] overflow-hidden shadow-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-color)] bg-slate-900/40">
                    <th className="px-5 py-3.5 font-semibold">STAFF</th>
                    <th className="px-5 py-3.5 font-semibold">FIRST SEEN</th>
                    <th className="px-5 py-3.5 font-semibold">LAST SEEN</th>
                    <th className="px-5 py-3.5 font-semibold">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length > 0 ? (
                    records.map((r, i) => (
                      <tr
                        key={i}
                        className="border-b border-[var(--border-color)] last:border-0 hover:bg-slate-800/20 transition"
                      >
                        <td className="px-5 py-3.5 font-medium text-slate-100">{r.name}</td>
                        <td className="px-5 py-3.5 text-slate-300 font-mono text-xs">{formatTime(r.first_seen)}</td>
                        <td className="px-5 py-3.5 text-slate-300 font-mono text-xs">{formatTime(r.last_seen)}</td>
                        <td className="px-5 py-3.5">
                          <span className="inline-block px-2.5 py-0.5 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                            Present
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : null}
                </tbody>
              </table>
              {records.length === 0 && !loading && (
                <div className="text-center text-[var(--text-muted)] py-12 text-xs">
                  No attendance records found for this date.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
