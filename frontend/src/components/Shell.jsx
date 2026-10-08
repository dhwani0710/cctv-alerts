import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, dashboardFor } from '../context/AuthContext.jsx';
import { initials } from '../data/mockData.js';
import { useStatus } from '../context/StatusContext.jsx';
import HallmarkStamp from './HallmarkStamp.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const NAV_ICONS = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
    </svg>
  ),

  employees: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="8" r="2.4" />
      <path d="M15.5 14.2c2.6.4 4.5 2.7 4.5 5.8" />
    </svg>
  ),

  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
    </svg>
  ),

  cameras: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="7" width="14" height="11" rx="2" />
      <path d="M16.5 10.5 21 8v9l-4.5-2.5" />
    </svg>
  ),

  records: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),

  recordings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polygon points="10 8.5 16 12 10 15.5" />
    </svg>
  ),

  'audit-logs': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M2 15h10" />
      <path d="m9 18 3-3-3-3" />
    </svg>
  ),

  attendance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9h16" />
      <circle cx="8" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
      <path d="M8 13h4M8 16h8" />
    </svg>
  ),

  'my-attendance': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
    </svg>
  ),

  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),

  menu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  ),
};

function useClock() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => {
      const currentTime = new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      setTime(`${currentTime} IST`);
    };

    tick();

    const id = setInterval(tick, 1000);

    return () => clearInterval(id);
  }, []);

  return time;
}

/* ---------------- MAIN SHELL ---------------- */

export default function Shell({
  active,
  dark = false,
  title,
  children,
}) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const clock = useClock();
  const [toast, setToast] = useState(false);
  const [navOpen, setNavOpen] = useState(false); // drawer (phone) / expanded rail (tablet, touch)

  const { hasHighAlert } = useStatus();

  const role = session?.role || 'employee';
  const name = session?.username || 'User';

  const isAdmin = role === 'ceo' || role === 'owner';
  const isGuard = role === 'guard';
  const isHr = role === 'hr';
  const isOwner = role === 'owner';

  // These permission values can also be used in other components.
  const canManageEmployees =
    role === 'ceo' ||
    role === 'owner' ||
    role === 'hr';

  const canManageUsers =
    role === 'ceo' ||
    role === 'owner';

  useEffect(() => {
    if (params.get('denied') === '1') {
      setToast(true);

      const timeoutId = setTimeout(() => {
        setToast(false);
      }, 3500);

      const nextParams = new URLSearchParams(params);
      nextParams.delete('denied');

      setParams(nextParams, { replace: true });

      return () => clearTimeout(timeoutId);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // close the menu whenever the page changes
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  // close the menu with the Escape key
  useEffect(() => {
    if (!navOpen) return undefined;

    const onKey = (e) => {
      if (e.key === 'Escape') setNavOpen(false);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const navItems = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      to: dashboardFor(role),
    },

    ...((isAdmin || isGuard)
      ? [
          {
            key: 'cameras',
            label: 'Cameras & Alerts',
            to: '/cameras-alerts',
          },
          {
            key: 'recordings',
            label: 'Video Recordings',
            to: '/recordings',
          },
        ]
      : []),

    ...((isAdmin || isHr)
      ? [
          {
            key: 'attendance',
            label: 'Attendance',
            to: '/attendance',
          },
        ]
      : []),

    ...((isAdmin || isGuard)
      ? [
          {
            key: 'records',
            label: 'Records',
            to: '/records',
          },
        ]
      : []),

    ...(canManageEmployees
      ? [
          {
            key: 'employees',
            label: 'Employees',
            to: '/admin-employees',
          },
        ]
      : []),

    ...(canManageUsers
      ? [
          {
            key: 'users',
            label: 'Users',
            to: '/admin-users',
          },
        ]
      : []),

    ...(isOwner
      ? [
          {
            key: 'audit-logs',
            label: 'System Audit',
            to: '/audit-logs',
          },
        ]
      : []),
  ];

  return (
    <div className="shell">
      {toast && (
        <div className="toast">
          That page isn't available for your account.
        </div>
      )}

      <nav
        className={`rail ${navOpen ? 'open' : ''}`}
        aria-label="Main navigation"
      >
        <div className="rail-brand">
          <HallmarkStamp alert={hasHighAlert} />
        </div>

        {navItems.map((item) => (
          <Link
            key={item.key}
            to={item.to}
            onClick={() => setNavOpen(false)}
            className={`rail-link ${
              active === item.key ? 'active' : ''
            }`}
          >
            {NAV_ICONS[item.key]}
            <span className="tip">{item.label}</span>
          </Link>
        ))}

        <Link
          to="/settings"
          onClick={() => setNavOpen(false)}
          className={`rail-link ${
            active === 'settings' ? 'active' : ''
          }`}
        >
          {NAV_ICONS.settings}
          <span className="tip">Settings</span>
        </Link>

        <div className="rail-spacer" />
      </nav>

      {/* dim layer behind the drawer (phone / tablet / touch only) */}
      <div
        className={`rail-backdrop ${navOpen ? 'show' : ''}`}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="hamburger"
              aria-label={navOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={navOpen}
              onClick={() => setNavOpen((o) => !o)}
            >
              {NAV_ICONS.menu}
            </button>

            <div className="topbar-title">
              {title}
            </div>
          </div>

          <div className="topbar-right">
            <span className="topbar-clock mono">
              {clock}
            </span>

            <span
              className={`role-badge ${
                isAdmin ? 'admin' : ''
              }`}
            >
              {role}
            </span>

            <div className="user-chip">
              <div className="avatar">
                {initials(name)}
              </div>

              <span className="name">
                {name}
              </span>
            </div>

            <ThemeToggle />

            <button
              type="button"
              className="logout-btn"
              onClick={handleLogout}
            >
              Sign out
            </button>
          </div>
        </header>

        <main className={`content ${dark ? 'dark' : ''}`}>
          {children}
        </main>
      </div>
    </div>
  );
}