import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { useAuth } from '../context/AuthContext';

const ROLE_BADGES = {
  owner: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  ceo: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  admin: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  hr: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  manager: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  guard: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
};

const MODULE_ICONS = {
  Alerts: '🚨',
  Employees: '👥',
  Users: '👤',
  Settings: '⚙️',
  Cameras: '📹',
  Attendance: '⏱️',
  Auth: '🔑',
};

export const AuditLogPage = () => {
  const { user, apiFetch } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [lightboxImg, setLightboxImg] = useState(null);

  const token = user?.token || '';

  const loadAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedRole) params.append('role', selectedRole);
      if (selectedModule) params.append('module', selectedModule);
      if (selectedDate) params.append('date', selectedDate);
      if (searchTerm.trim()) params.append('search', searchTerm.trim());

      const res = await apiFetch(`/audit-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data || []);
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, selectedRole, selectedModule, selectedDate, searchTerm]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  const handleClearFilters = () => {
    setSelectedRole('');
    setSelectedModule('');
    setSelectedDate('');
    setSearchTerm('');
  };

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="System Audit Log (Owner Exclusive)" />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">🛡️</span>
                  <h1 className="text-2xl font-bold text-slate-100 tracking-tight font-serif">
                    System Audit Log
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Owner Access Only
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1.5 max-w-2xl">
                  Immutable audit trail tracking all modifications, security events, Guard alert acknowledgments, and operational entries across CEO, HR, and Guard roles.
                </p>
              </div>

              <button
                onClick={loadAuditLogs}
                disabled={loading}
                className="px-3.5 py-2 rounded-lg border border-[var(--border-color)] hover:border-amber-500/60 text-xs text-slate-300 hover:text-amber-400 transition flex items-center gap-1.5 shadow"
              >
                <span>🔄</span>
                <span>{loading ? 'Refreshing...' : 'Refresh Logs'}</span>
              </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mr-1">
                  Filter Role:
                </span>
                {['', 'ceo', 'hr', 'guard', 'owner'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setSelectedRole(r)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                      selectedRole === r
                        ? 'bg-amber-600 text-slate-950 font-bold shadow'
                        : 'bg-[var(--bg-page)] text-[var(--text-muted)] hover:text-slate-200 border border-[var(--border-color)]'
                    }`}
                  >
                    {r === '' ? 'All Roles' : r.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {/* Module Select */}
                <div>
                  <select
                    value={selectedModule}
                    onChange={(e) => setSelectedModule(e.target.value)}
                    className="w-full bg-[var(--bg-page)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                  >
                    <option value="">All Modules</option>
                    <option value="Alerts">🚨 Alerts & Guard Protocols</option>
                    <option value="Employees">👥 Employees & Faces</option>
                    <option value="Users">👤 User Management</option>
                    <option value="Settings">⚙️ Store Settings</option>
                    <option value="Cameras">📹 Cameras</option>
                    <option value="Auth">🔑 Authentication & Logins</option>
                  </select>
                </div>

                {/* Date Input */}
                <div>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full bg-[var(--bg-page)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                  />
                </div>

                {/* Search Box */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search user, action, details..."
                    className="flex-1 bg-[var(--bg-page)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-500 placeholder:text-slate-500"
                  />
                  {(selectedRole || selectedModule || selectedDate || searchTerm) && (
                    <button
                      onClick={handleClearFilters}
                      className="px-2.5 py-1 text-xs text-red-400 hover:text-red-300 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition"
                      title="Clear all filters"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Audit Log Table */}
            <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-color)] bg-slate-900/50 text-[var(--text-muted)] uppercase tracking-wider text-[11px]">
                      <th className="px-4 py-3.5 font-semibold">Timestamp</th>
                      <th className="px-4 py-3.5 font-semibold">Actor / Role</th>
                      <th className="px-4 py-3.5 font-semibold">Action & Module</th>
                      <th className="px-4 py-3.5 font-semibold">Details & Inspection Log</th>
                      <th className="px-4 py-3.5 font-semibold text-center">Verified Proof</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]">
                    {logs.length > 0 ? (
                      logs.map((log) => {
                        const dateObj = new Date(log.timestamp);
                        const dateStr = dateObj.toLocaleDateString();
                        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        const proofUrl = log.proof_image
                          ? (log.proof_image.startsWith('http') ? log.proof_image : `${log.proof_image}?token=${encodeURIComponent(token)}`)
                          : null;

                        return (
                          <tr key={log.id} className="hover:bg-slate-800/20 transition">
                            {/* Timestamp */}
                            <td className="px-4 py-3.5 whitespace-nowrap font-mono text-slate-300">
                              <div>{timeStr}</div>
                              <div className="text-[10px] text-[var(--text-muted)]">{dateStr}</div>
                            </td>

                            {/* User & Role */}
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <div className="font-semibold text-slate-100">{log.username}</div>
                              <span className={`inline-block mt-0.5 px-2 py-0.2 text-[9px] font-bold uppercase rounded border ${
                                ROLE_BADGES[log.user_role?.toLowerCase()] || 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}>
                                {log.user_role}
                              </span>
                            </td>

                            {/* Action & Module */}
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <div className="font-mono text-xs font-semibold text-amber-400">
                                {log.action}
                              </div>
                              <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                                <span>{MODULE_ICONS[log.target_module] || '📁'}</span>
                                <span>{log.target_module}</span>
                              </div>
                            </td>

                            {/* Details */}
                            <td className="px-4 py-3.5 text-slate-200 min-w-[280px]">
                              <p className="leading-relaxed break-words">{log.details}</p>
                            </td>

                            {/* Proof Image */}
                            <td className="px-4 py-3.5 text-center whitespace-nowrap">
                              {proofUrl ? (
                                <button
                                  type="button"
                                  onClick={() => setLightboxImg(proofUrl)}
                                  className="group inline-flex flex-col items-center gap-1"
                                >
                                  <img
                                    src={proofUrl}
                                    alt="Audit Proof"
                                    className="w-10 h-10 object-cover rounded border border-amber-500/40 group-hover:scale-105 transition shadow"
                                  />
                                  <span className="text-[10px] text-amber-400 group-hover:underline">View Photo</span>
                                </button>
                              ) : (
                                <span className="text-slate-600 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-xs text-[var(--text-muted)]">
                          {loading ? 'Loading audit records...' : 'No audit log records matching the current filters.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Proof Photo Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-150"
          onClick={() => setLightboxImg(null)}
        >
          <div className="relative max-w-3xl max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxImg}
              alt="Audit Verification Proof"
              className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain border border-amber-500/30"
            />
            <button
              onClick={() => setLightboxImg(null)}
              className="absolute -top-3 -right-3 bg-red-600 hover:bg-red-700 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold shadow-xl transition"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
