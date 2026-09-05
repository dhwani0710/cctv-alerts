import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, dashboardFor } from '../context/AuthContext.jsx';
import { initials } from '../data/mockData.js';
import HallmarkStamp from './HallmarkStamp.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const NAV_ICONS = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" />
    </svg>
  ),
  employees: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="8" r="2.4" /><path d="M15.5 14.2c2.6.4 4.5 2.7 4.5 5.8" />
    </svg>
  ),
  cameras: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="7" width="14" height="11" rx="2" /><path d="M16.5 10.5 21 8v9l-4.5-2.5" />
    </svg>
  ),
  records: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  attendance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
    </svg>
  ),
  'my-attendance': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

const SETTINGS_ICONS = {
  notifications: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2Z" />
      <path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16l-2-2Z" />
    </svg>
  ),
  thresholds: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 12h4l2 6 4-14 2 8h6" />
    </svg>
  ),
  security: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z" />
    </svg>
  ),
  account: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
    </svg>
  ),
  system: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" />
    </svg>
  ),
};

function useClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' IST');
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

/* ---------------- SETTINGS WINDOW (VS Code style modal) ---------------- */
function SettingsWindow({ onClose, session }) {
  const isAdmin = session.role === 'admin';
  const canSeeThresholds = session.role !== 'employee';

  const categories = [
    { key: 'notifications', label: 'Notifications' },
    ...(canSeeThresholds ? [{ key: 'thresholds', label: 'Alert thresholds' }] : []),
    { key: 'security', label: 'Security' },
    { key: 'account', label: 'Account' },
    ...(isAdmin ? [{ key: 'system', label: 'System' }] : []),
  ];

  const [activeCategory, setActiveCategory] = useState('notifications');
  const [query, setQuery] = useState('');

  // ---- Notifications ----
  const [notifyMotion, setNotifyMotion] = useState(true);
  const [notifyPerson, setNotifyPerson] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const motionAlertCount = useMemo(() => MOCK_ALERTS.filter((a) => /motion/i.test(a.title || '')).length, []);
  const personAlertCount = useMemo(() => MOCK_ALERTS.filter((a) => /face|person|unrecognized/i.test(a.title || '')).length, []);

  // ---- Alert thresholds ----
  const [sensitivity, setSensitivity] = useState('medium');
  const [afterHoursStart, setAfterHoursStart] = useState('21:00');
  const [afterHoursEnd, setAfterHoursEnd] = useState('08:00');
  const [doorHeldSeconds, setDoorHeldSeconds] = useState(30);

  // ---- Security ----
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  // ---- Danger zone ----
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const [flash, setFlash] = useState('');
  function flashMsg(msg) {
    setFlash(msg);
    setTimeout(() => setFlash(''), 2000);
  }

  // Every searchable setting item, tagged with which category it belongs to.
  // Typing in the search box filters this list and jumps to matches.
  const searchIndex = [
    { category: 'notifications', label: 'Motion alerts' },
    { category: 'notifications', label: 'Person-detected alerts' },
    { category: 'notifications', label: 'Daily email summary' },
    ...(canSeeThresholds ? [
      { category: 'thresholds', label: 'Default motion sensitivity' },
      { category: 'thresholds', label: 'After-hours window' },
      { category: 'thresholds', label: 'Door-held-open threshold' },
    ] : []),
    { category: 'security', label: 'Change password' },
    { category: 'account', label: 'Name' },
    { category: 'account', label: 'Role' },
    ...(isAdmin ? [
      { category: 'system', label: 'Integrations' },
      { category: 'system', label: 'Clear all records' },
      { category: 'system', label: 'Reset demo data' },
    ] : []),
  ];

  const searchResults = query.trim()
    ? searchIndex.filter((i) => i.label.toLowerCase().includes(query.trim().toLowerCase()))
    : [];

  function jumpTo(category) {
    setActiveCategory(category);
    setQuery('');
  }

  function handleEscape(e) {
    if (e.key === 'Escape') onClose();
  }

  return (
    <div className="settings-window-backdrop" onKeyDown={handleEscape}>
      <div className="settings-window" role="dialog" aria-label="Settings">
        <div className="settings-window-titlebar">
          <span className="settings-window-title">Settings</span>
          <button className="settings-window-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="settings-window-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="15" height="15">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search settings"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {query.trim() ? (
          <div className="settings-window-results">
            {searchResults.length === 0 && (
              <div className="settings-window-noresults">No settings found for "{query}"</div>
            )}
            {searchResults.map((r, i) => (
              <button key={i} className="settings-window-result" onClick={() => jumpTo(r.category)}>
                <span className="settings-window-result-label">{r.label}</span>
                <span className="settings-window-result-cat">
                  {categories.find((c) => c.key === r.category)?.label}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="settings-window-body">
            <nav className="settings-window-sidebar">
              {categories.map((c) => (
                <button
                  key={c.key}
                  className={`settings-window-navitem ${activeCategory === c.key ? 'active' : ''}`}
                  onClick={() => setActiveCategory(c.key)}
                >
                  {SETTINGS_ICONS[c.key]}
                  {c.label}
                </button>
              ))}
            </nav>

            <div className="settings-window-content">
              {flash && <div className="settings-flash">{flash}</div>}

              {activeCategory === 'notifications' && (
                <div className="settings-window-section">
                  <h3>Notifications</h3>

                  <label className="settings-toggle-row">
                    <div>
                      <div className="settings-toggle-t">Motion alerts</div>
                      <div className="settings-toggle-d">Notify on any motion detected on camera — {motionAlertCount} sent this week</div>
                    </div>
                    <input type="checkbox" checked={notifyMotion} onChange={(e) => setNotifyMotion(e.target.checked)} />
                  </label>

                  <label className="settings-toggle-row">
                    <div>
                      <div className="settings-toggle-t">Person-detected alerts</div>
                      <div className="settings-toggle-d">Notify when a face is identified or unrecognized — {personAlertCount} sent this week</div>
                    </div>
                    <input type="checkbox" checked={notifyPerson} onChange={(e) => setNotifyPerson(e.target.checked)} />
                  </label>

                  <label className="settings-toggle-row" style={{ borderBottom: 'none' }}>
                    <div>
                      <div className="settings-toggle-t">Daily email summary</div>
                      <div className="settings-toggle-d">A recap of alerts and activity, once a day</div>
                    </div>
                    <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} />
                  </label>

                  <button type="button" className="btn btn-brass" style={{ marginTop: 16 }} onClick={() => flashMsg('Notification preferences saved.')}>
                    Save notifications
                  </button>
                </div>
              )}

              {activeCategory === 'thresholds' && canSeeThresholds && (
                <div className="settings-window-section">
                  <h3>Alert thresholds</h3>
                  <p className="settings-note">
                    These are the default detection settings applied across cameras. Individual
                    cameras can still be overridden from their own Settings.
                  </p>

                  <div className="field">
                    <label>Default motion sensitivity</label>
                    <select value={sensitivity} onChange={(e) => setSensitivity(e.target.value)}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div className="settings-two-field">
                    <div className="field">
                      <label>After-hours window start</label>
                      <input type="time" value={afterHoursStart} onChange={(e) => setAfterHoursStart(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>After-hours window end</label>
                      <input type="time" value={afterHoursEnd} onChange={(e) => setAfterHoursEnd(e.target.value)} />
                    </div>
                  </div>

                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Door-held-open threshold (seconds)</label>
                    <input
                      type="number"
                      min="5"
                      max="300"
                      value={doorHeldSeconds}
                      onChange={(e) => setDoorHeldSeconds(e.target.value)}
                    />
                  </div>

                  <button type="button" className="btn btn-brass" style={{ marginTop: 16 }} onClick={() => flashMsg('Alert thresholds saved.')}>
                    Save thresholds
                  </button>
                </div>
              )}

              {activeCategory === 'security' && (
                <div className="settings-window-section">
                  <h3>Change password</h3>
                  <div className="field">
                    <label>Current password</label>
                    <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
                  </div>
                  <div className="settings-two-field">
                    <div className="field">
                      <label>New password</label>
                      <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Confirm new password</label>
                      <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-brass"
                    onClick={() => {
                      if (!currentPw || !newPw || newPw !== confirmPw) {
                        flashMsg('Passwords do not match or are incomplete.');
                        return;
                      }
                      setCurrentPw(''); setNewPw(''); setConfirmPw('');
                      flashMsg('Password updated.');
                    }}
                  >
                    Update password
                  </button>
                </div>
              )}

              {activeCategory === 'account' && (
                <div className="settings-window-section">
                  <h3>Account</h3>
                  <div className="field"><label>Name</label><input value={session.name} disabled /></div>
                  <div className="field" style={{ marginBottom: 0 }}><label>Role</label><input value={session.role} disabled /></div>
                </div>
              )}

              {activeCategory === 'system' && isAdmin && (
                <div className="settings-window-section">
                  <h3>Integrations</h3>
                  <p className="settings-note">
                    Camera retention, staff access levels, and integration keys will live
                    here once connected to a real backend.
                  </p>
                  <button type="button" className="btn btn-outline" disabled>Manage integrations — coming soon</button>

                  <h3 style={{ marginTop: 26, color: 'var(--brick)' }}>Danger zone</h3>

                  <div className="settings-danger-row">
                    <div>
                      <div className="settings-toggle-t">Clear all records</div>
                      <div className="settings-toggle-d">Permanently removes all logged access/alert records</div>
                    </div>
                    {!confirmingClear ? (
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmingClear(true)}>Clear records</button>
                    ) : (
                      <div className="settings-confirm">
                        <span>Are you sure?</span>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => { setConfirmingClear(false); flashMsg('All records cleared (mock).'); }}>Yes, clear</button>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmingClear(false)}>Cancel</button>
                      </div>
                    )}
                  </div>

                  <div className="settings-danger-row" style={{ borderBottom: 'none' }}>
                    <div>
                      <div className="settings-toggle-t">Reset demo data</div>
                      <div className="settings-toggle-d">Restores cameras, staff, and alerts to their original mock state</div>
                    </div>
                    {!confirmingReset ? (
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmingReset(true)}>Reset data</button>
                    ) : (
                      <div className="settings-confirm">
                        <span>Are you sure?</span>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => { setConfirmingReset(false); flashMsg('Demo data reset (mock).'); }}>Yes, reset</button>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmingReset(false)}>Cancel</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Shell({ active, dark = false, title, children }) {
  const { session, logout, apiFetch } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const clock = useClock();
  const [toast, setToast] = useState(false);
<<<<<<< Updated upstream
  const [hasHighAlert, setHasHighAlert] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkAlerts() {
      try {
        const res = await apiFetch('/status');
        if (res.ok && !cancelled) {
          const data = await res.json();
          setHasHighAlert((data.recent_alerts || []).some((a) => a.priority === 'high'));
        }
      } catch {}
    }
    checkAlerts();
    const t = setInterval(checkAlerts, 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, [apiFetch]);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const settingsIconRef = useRef(null);
  const settingsMenuRef = useRef(null);
=======
  const [settingsWindowOpen, setSettingsWindowOpen] = useState(false);
>>>>>>> Stashed changes

  useEffect(() => {
    if (params.get('denied') === '1') {
      setToast(true);
      const t = setTimeout(() => setToast(false), 3500);
      const next = new URLSearchParams(params);
      next.delete('denied');
      setParams(next, { replace: true });
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

<<<<<<< Updated upstream
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        settingsMenuRef.current &&
        !settingsMenuRef.current.contains(e.target) &&
        settingsIconRef.current &&
        !settingsIconRef.current.contains(e.target)
      ) {
        setSettingsMenuOpen(false);
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setSettingsMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

=======
  const hasHighAlert = MOCK_ALERTS.some((a) => a.sev === 'high');
>>>>>>> Stashed changes
  const isAdmin = session.role === 'admin';
  const isHr = session.role === 'hr';
  const isGuard = session.role === 'guard';
  const isEmployee = session.role === 'employee';

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', to: dashboardFor(session.role) },
    ...(isAdmin ? [{ key: 'employees', label: 'Employees', to: '/admin-employees' }] : []),
    ...((isAdmin || isGuard) ? [{ key: 'cameras', label: 'Cameras & Alerts', to: '/cameras-alerts' }] : []),
    ...((isAdmin || isGuard) ? [{ key: 'records', label: 'Records', to: '/records' }] : []),
    ...((isAdmin || isHr) ? [{ key: 'attendance', label: 'Attendance', to: '/attendance' }] : []),
  ];

  return (
    <div className="shell">
      {toast && <div className="toast">That page isn't available for your account.</div>}
      <nav className="rail">
        <div className="rail-brand"><HallmarkStamp alert={hasHighAlert} /></div>

        {navItems.map((item) => (
          <Link key={item.key} to={item.to} className={`rail-link ${active === item.key ? 'active' : ''}`}>
            {NAV_ICONS[item.key]}
            <span className="tip">{item.label}</span>
          </Link>
        ))}

        <button
          type="button"
          className={`rail-link ${active === 'settings' ? 'active' : ''}`}
          onClick={() => setSettingsWindowOpen(true)}
        >
          {NAV_ICONS.settings}
          <span className="tip">Settings</span>
        </button>

        <div className="rail-spacer" />
      </nav>
      <div className="main">
        <header className="topbar">
          <div className="topbar-title">{title}</div>
          <div className="topbar-right">
            <span className="topbar-clock mono">{clock}</span>
            <span className={`role-badge ${isAdmin ? 'admin' : ''}`}>{session.role}</span>
            <div className="user-chip">
              <div className="avatar">{initials(session.name)}</div>
              <span className="name">{session.name}</span>
            </div>
            <ThemeToggle />
            <button className="logout-btn" onClick={handleLogout}>Sign out</button>
          </div>
        </header>
        <main className={`content ${dark ? 'dark' : ''}`}>{children}</main>
      </div>

      {settingsWindowOpen && (
        <SettingsWindow session={session} onClose={() => setSettingsWindowOpen(false)} />
      )}
    </div>
  );
}