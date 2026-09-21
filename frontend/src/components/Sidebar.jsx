import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ICONS = {
  dashboard: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/></svg>,
  cameras: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  records: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  employees: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="8" r="2.4"/><path d="M15.5 14.2c2.6.4 4.5 2.7 4.5 5.8"/></svg>,
  users: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>,
  attendance: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17"/><path d="M8 3v3M16 3v3"/><path d="m8.5 14 2 2 4-4"/></svg>,
  settings: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>,
  audit: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>,
};

export const Sidebar = () => {
  const { session } = useAuth();
  const user = session;
  const role = (user?.role || '').toLowerCase();
  const isOwner = role === 'owner';
  const isCeoOrAdmin = isOwner || ['ceo', 'admin'].includes(role);
  const isHr = ['hr', 'manager'].includes(role);
  const isGuard = role === 'guard';

  const links = [];

  let dashboardPath = '/login';
  if (isCeoOrAdmin) dashboardPath = '/admin-dashboard';
  else if (isGuard) dashboardPath = '/guard-dashboard';
  else if (isHr) dashboardPath = '/hr-dashboard';
  
  if (user) {
    links.push({ path: dashboardPath, label: 'Dashboard', icon: 'dashboard' });
  }

  if (isCeoOrAdmin || isGuard) {
    links.push({ path: '/cameras-alerts', label: 'Cameras & Alerts', icon: 'cameras' });
    links.push({ path: '/records', label: 'Records', icon: 'records' });
  }

  if (isCeoOrAdmin || isHr) {
    links.push({ path: '/admin-employees', label: 'Employees', icon: 'employees' });
    links.push({ path: '/attendance', label: 'Attendance', icon: 'attendance' });
  }

  if (isCeoOrAdmin) {
    links.push({ path: '/admin-users', label: 'Users', icon: 'users' });
    links.push({ path: '/settings', label: 'Settings', icon: 'settings' });
  }

  if (isOwner) {
    links.push({ path: '/audit-logs', label: 'Audit Log', icon: 'audit' });
  }

  return (
    <nav className="w-[76px] shrink-0 bg-[var(--bg-page)] border-r border-[var(--border-color)] flex flex-col items-center py-5 gap-2">
      <div className="w-11 h-11 rounded-full border-2 border-[var(--accent)] flex items-center justify-center text-xl mb-4 font-serif text-[var(--accent)]">◆</div>
      {links.map(l => (
        <NavLink
          key={l.path}
          to={l.path}
          className={({ isActive }) =>
            `w-12 h-12 rounded-lg flex items-center justify-center transition ${
              isActive ? 'bg-[var(--bg-panel-3)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-panel-3)] hover:text-[var(--text-primary)]'
            }`
          }
          title={l.label}
        >
          <span className="w-5 h-5">{ICONS[l.icon]}</span>
        </NavLink>
      ))}
    </nav>
  );
};