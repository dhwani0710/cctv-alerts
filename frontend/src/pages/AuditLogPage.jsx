import React, { useState, useEffect, useCallback } from 'react';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';

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
  const { session, apiFetch } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [lightboxImg, setLightboxImg] = useState(null);

  const token = session?.token || '';

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
    <Shell active="audit-logs" title="System Audit">
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <span className="eyebrow">Owner Security Console</span>
          <h1>System Audit Log</h1>
          <p>
            Immutable audit trail tracking all modifications, security events, Guard alert acknowledgments, and operational entries across CEO, HR, and Guard roles.
          </p>
        </div>

        <div className="no-print" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn btn-outline"
            title="Print or export PDF report"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>🖨️</span>
            <span>Print Report</span>
          </button>
          <button
            type="button"
            onClick={loadAuditLogs}
            disabled={loading}
            className="btn btn-outline"
            title="Refresh audit trail"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>🔄</span>
            <span>{loading ? 'Refreshing...' : 'Refresh Logs'}</span>
          </button>
        </div>
      </div>

      <div className="filter-bar no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>
            Role:
          </span>
          {['', 'ceo', 'hr', 'guard', 'owner'].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setSelectedRole(r)}
              className={`btn btn-sm ${selectedRole === r ? 'btn-brass' : 'btn-outline'}`}
              style={{ height: 34, padding: '0 10px', display: 'inline-flex', alignItems: 'center' }}
            >
              {r === '' ? 'All Roles' : r.toUpperCase()}
            </button>
          ))}
        </div>

        <select
          value={selectedModule}
          onChange={(e) => setSelectedModule(e.target.value)}
          style={{ height: 34, padding: '0 10px' }}
        >
          <option value="">All Modules</option>
          <option value="Alerts">🚨 Alerts & Protocols</option>
          <option value="Employees">👥 Employees</option>
          <option value="Users">👤 User Management</option>
          <option value="Settings">⚙️ Settings</option>
          <option value="Cameras">📹 Cameras</option>
          <option value="Auth">🔑 Authentication</option>
        </select>

        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={{ height: 34, padding: '0 10px' }}
        />

        <input
          type="text"
          placeholder="Search user, action, details..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ minWidth: 220, height: 34, padding: '0 10px' }}
        />

        {(selectedRole || selectedModule || selectedDate || searchTerm) && (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={handleClearFilters}
            style={{ height: 34, padding: '0 10px', display: 'inline-flex', alignItems: 'center' }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Clear metadata bar with no negative margins or overlapping */}
      <div
        className="mono no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: '12px 0 14px',
          fontSize: '12px',
          color: 'var(--text-muted)',
          lineHeight: '1.4',
        }}
      >
        <span>
          <strong style={{ color: 'var(--text)' }}>{logs.length}</strong> {logs.length === 1 ? 'audit record' : 'audit records'}
        </span>
        <span style={{ fontSize: '11px', letterSpacing: '0.04em' }}>
          Status: <span style={{ color: 'var(--brass-dim)' }}>Append-Only Immutable Ledger</span>
        </span>
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap audit-table-container">
          <table className="records" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface)' }}>
                <th style={{ width: 140, padding: '12px 14px' }}>Timestamp</th>
                <th style={{ width: 130, padding: '12px 14px' }}>Actor / Role</th>
                <th style={{ width: 170, padding: '12px 14px' }}>Action & Module</th>
                <th style={{ padding: '12px 14px' }}>Details & Inspection Log</th>
                <th style={{ width: 110, textAlign: 'center', padding: '12px 14px' }}>Verified Proof</th>
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? (
                logs.map((log) => {
                  const dateObj = new Date(log.timestamp);
                  const dateStr = dateObj.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  });
                  const timeStr = dateObj.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  });
                  const proofUrl = log.proof_image
                    ? (log.proof_image.startsWith('http')
                        ? log.proof_image
                        : `http://localhost:8000${log.proof_image}?token=${encodeURIComponent(token)}`)
                    : null;
                  const roleLower = (log.user_role || '').toLowerCase();

                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }} className="mono">
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{timeStr}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dateStr}</div>
                      </td>

                      <td style={{ padding: '12px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{log.username || 'system'}</div>
                        <div style={{ marginTop: 3 }}>
                          <span className={`audit-pill ${roleLower}`}>
                            {log.user_role || 'SYSTEM'}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '12px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--brass-dim)' }}>
                          {log.action}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <span>{MODULE_ICONS[log.target_module] || '📁'}</span>
                          <span>{log.target_module}</span>
                        </div>
                      </td>

                      <td style={{ padding: '12px 14px', verticalAlign: 'top', fontSize: 12.5, lineHeight: 1.5 }}>
                        <div style={{ color: 'var(--text)', wordBreak: 'break-word' }}>
                          {log.details}
                        </div>
                      </td>

                      <td style={{ padding: '12px 14px', verticalAlign: 'top', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {proofUrl ? (
                          <button
                            type="button"
                            onClick={() => setLightboxImg(proofUrl)}
                            className="btn btn-outline btn-sm"
                            style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '4px 8px' }}
                            title="Click to view verified inspection photo"
                          >
                            <img
                              src={proofUrl}
                              alt="Proof"
                              style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 3, border: '1px solid var(--border)' }}
                            />
                            <span style={{ fontSize: 10, color: 'var(--brass)' }}>View Photo</span>
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
                    {loading ? 'Loading audit records...' : 'No audit log records matching the current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {lightboxImg && (
        <div
          className="cam-lightbox-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setLightboxImg(null); }}
        >
          <div className="panel" style={{ maxWidth: 640, width: '100%', padding: 20 }}>
            <div className="panel-head" style={{ marginBottom: 12 }}>
              <h2>Audit Verification Proof</h2>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setLightboxImg(null)}
              >
                ✕ Close
              </button>
            </div>
            <div style={{ background: 'var(--chrome)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
              <img
                src={lightboxImg}
                alt="Audit Verification Proof"
                style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain', borderRadius: 4 }}
              />
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
};

export default AuditLogPage;
