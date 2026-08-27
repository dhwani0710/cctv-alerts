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

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Attendance" />
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-3xl mx-auto space-y-4">

            <div className="flex items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Select Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <button
                onClick={() => loadAttendance(selectedDate)}
                className="text-xs border border-[var(--border-color)] hover:border-amber-500 rounded-lg px-3 py-1.5 text-slate-300 hover:text-amber-400 transition flex items-center gap-1.5"
              >
                <span>🔄</span>
                <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>

            <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] overflow-hidden shadow-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[var(--text-muted)] border-b border-[var(--border-color)] bg-slate-900/40">
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">First Seen (In)</th>
                    <th className="px-4 py-3">Last Seen (Out)</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length > 0 ? (
                    records.map((r, i) => (
                      <tr
                        key={i}
                        className="border-b border-[var(--border-color)] last:border-0 hover:bg-slate-800/20 transition"
                      >
                        <td className="px-4 py-3 font-semibold text-slate-100">{r.name}</td>
                        <td className="px-4 py-3 text-emerald-400 font-mono text-xs">{formatTime(r.first_seen)}</td>
                        <td className="px-4 py-3 text-amber-400 font-mono text-xs">{formatTime(r.last_seen)}</td>
                      </tr>
                    ))
                  ) : null}
                </tbody>
              </table>
              {records.length === 0 && !loading && (
                <div className="text-center text-[var(--text-muted)] py-10 text-xs">
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
