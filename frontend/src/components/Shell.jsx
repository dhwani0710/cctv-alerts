import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, dashboardFor } from '../context/AuthContext.jsx';
import { MOCK_ALERTS, initials } from '../data/mockData.js';
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
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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

export default function Shell({ active, dark = false, title, children }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const clock = useClock();
  const [toast, setToast] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const settingsIconRef = useRef(null);
  const settingsMenuRef = useRef(null);

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

  const hasHighAlert = MOCK_ALERTS.some((a) => a.sev === 'high');
  const isAdmin = session.role === 'admin';

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function closeSettingsMenu() {
  setSettingsMenuOpen(false);
  navigate('/settings');
}

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', to: dashboardFor(session.role) },
    ...(isAdmin ? [{ key: 'employees', label: 'Employees', to: '/admin-employees' }] : []),
    { key: 'cameras', label: 'Cameras & Alerts', to: '/cameras-alerts' },
    { key: 'records', label: 'Records', to: '/records' },
    ...(isAdmin ? [{ key: 'attendance', label: 'Attendance', to: '/attendance' }] : []),
    { key: 'settings', label: 'Settings', to: '/settings' },
  ];

  const settingsTabItems = [
    { key: 'notifications', label: 'Notifications' },
    { key: 'thresholds', label: 'Alert thresholds' },
    { key: 'security', label: 'Security' },
    { key: 'account', label: 'Account' },
    ...(isAdmin ? [{ key: 'system', label: 'System' }] : []),
  ];

  return (
    <div className="shell">
      {toast && <div className="toast">That page isn't available for your account.</div>}
      <nav className="rail">
        <div className="rail-brand"><HallmarkStamp alert={hasHighAlert} /></div>
        {navItems.map((item) =>
          item.key === 'settings' ? (
            <div key={item.key} style={{ position: 'relative' }} ref={settingsIconRef}>
              <button
                type="button"
                className={`rail-link ${active === item.key ? 'active' : ''}`}
                onClick={() => setSettingsMenuOpen((v) => !v)}
              >
                {NAV_ICONS[item.key]}
                <span className="tip">{item.label}</span>
              </button>

              {settingsMenuOpen && (
                <div className="settings-menu" ref={settingsMenuRef} role="menu">
                  <div className="settings-menu-group">
                    {settingsTabItems.map((t) => (
                      <button
                        key={t.key}
                        className="settings-menu-item"
                        role="menuitem"
                        onClick={() => closeSettingsMenu()}
                      >
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>

                  {isAdmin && (
                    <>
                      <div className="settings-menu-divider" />
                      <div className="settings-menu-group">
                        <button
                          className="settings-menu-item settings-menu-item-danger"
                          role="menuitem"
                          onClick={() => {
                            closeSettingsMenu();
                            navigate('/settings?tab=system');
                          }}
                        >
                          <span>Danger zone</span>
                        </button>
                      </div>
                    </>
                  )}

                  <div className="settings-menu-divider" />
                  <div className="settings-menu-group">
                    <button
                      className="settings-menu-item settings-menu-item-foot"
                      role="menuitem"
                      onClick={() => goToSettingsTab('account')}
                    >
                      <span className="settings-menu-avatar">{session.name?.[0] || '?'}</span>
                      <span>{session.name}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link key={item.key} to={item.to} className={`rail-link ${active === item.key ? 'active' : ''}`}>
              {NAV_ICONS[item.key]}
              <span className="tip">{item.label}</span>
            </Link>
          )
        )}
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
    </div>
  );
}