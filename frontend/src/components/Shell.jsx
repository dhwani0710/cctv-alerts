import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, dashboardFor } from '../context/AuthContext.jsx';
import { MOCK_ALERTS, initials } from '../data/mockData.js';
import HallmarkStamp from './HallmarkStamp.jsx';

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

  const hasHighAlert = MOCK_ALERTS.some((a) => a.sev === 'high');
  const isAdmin = session.role === 'admin';

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', to: dashboardFor(session.role) },
    ...(isAdmin ? [{ key: 'employees', label: 'Employees', to: '/admin-employees' }] : []),
    { key: 'cameras', label: 'Cameras & Alerts', to: '/cameras-alerts' },
    { key: 'records', label: 'Records', to: '/records' },
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
            <button className="logout-btn" onClick={handleLogout}>Sign out</button>
          </div>
        </header>
        <main className={`content ${dark ? 'dark' : ''}`}>{children}</main>
      </div>
    </div>
  );
}
