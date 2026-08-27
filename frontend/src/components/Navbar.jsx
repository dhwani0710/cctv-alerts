import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Navbar = ({ title = "Jewellery Store Security", subtitle = "" }) => {
  const { user, logout, theme, toggleTheme } = useAuth();
  const location = useLocation();

  const role = (user?.role || '').toLowerCase();

  const navLinks = [];
  if (role === 'admin') {
    navLinks.push({ label: 'Admin & Setup', path: '/admin' });
    navLinks.push({ label: 'Attendance', path: '/attendance' });
    navLinks.push({ label: 'Live Camera', path: '/dashboard' });
  } else if (role === 'manager') {
    navLinks.push({ label: 'Staff Setup', path: '/admin' });
    navLinks.push({ label: 'Attendance', path: '/attendance' });
    navLinks.push({ label: 'Live Camera', path: '/dashboard' });
  } else if (role === 'guard') {
    navLinks.push({ label: 'Live Camera', path: '/dashboard' });
  }

  const roleBadges = {
    admin: <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-xs uppercase font-semibold">Admin</span>,
    manager: <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded text-xs uppercase font-semibold">Manager</span>,
    guard: <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-xs uppercase font-semibold">Guard</span>,
  };

  return (
    <div className="flex flex-wrap justify-between items-center gap-4 pb-3 border-b border-[var(--border-color)] mb-6 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-2xl">💎</span>
        <div>
          <h1 className="text-lg font-bold">{title}</h1>
          {subtitle && <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          {navLinks.map(link => {
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`text-sm transition ${
                  isActive
                    ? 'text-amber-400 font-semibold underline decoration-amber-500 underline-offset-4'
                    : 'text-slate-300 hover:text-amber-300'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="h-4 w-px bg-slate-700 mx-1"></div>

        {user && (
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-200">{user.username}</div>
              <div>{roleBadges[role] || <span className="text-xs text-slate-400">{role}</span>}</div>
            </div>
            <button
              onClick={logout}
              className="ml-2 text-xs bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-800/40 px-2.5 py-1 rounded transition"
              title="Log Out"
            >
              Logout
            </button>
          </div>
        )}

        <button
          onClick={toggleTheme}
          className="border border-[var(--border-color)] rounded-lg px-2.5 py-1 text-xs hover:border-amber-500 transition"
        >
          {theme === 'light' ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>
    </div>
  );
};
