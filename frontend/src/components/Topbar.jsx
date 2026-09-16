import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export const Topbar = ({ title }) => {
  const { user, session, logout } = useAuth();
  let themeContext = {};
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    themeContext = useTheme();
  } catch {
    // fallback if outside ThemeProvider
  }
  const { theme, toggleTheme } = themeContext;
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const currentUser = user || session;
  const role = (currentUser?.role || '').toLowerCase();

  return (
    <header className="h-16 shrink-0 bg-[var(--bg-panel)] border-b border-[var(--border-color)] flex items-center justify-between px-6">
      <div className="text-base font-semibold">{title}</div>
      <div className="flex items-center gap-4">
        <span className="font-mono text-xs text-[var(--text-muted)]">{time}</span>
        <span className="font-mono text-[11px] uppercase tracking-wide px-2.5 py-1 rounded border border-[var(--border-color)] text-[var(--text-muted)]">
          {role}
        </span>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] flex items-center justify-center text-xs font-mono text-[var(--accent)]">
            {(currentUser?.username || '?').slice(0, 2).toUpperCase()}
          </div>
          <span className="text-xs font-medium">{currentUser?.username}</span>
        </div>
        {logout && (
          <button
            onClick={logout}
            className="text-xs border border-[var(--border-color)] hover:border-[var(--danger)] hover:text-[var(--danger)] text-[var(--text-muted)] px-3 py-1.5 rounded transition"
          >
            Sign out
          </button>
        )}
        {toggleTheme && (
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded border border-[var(--border-color)] flex items-center justify-center hover:border-[var(--accent)] text-[var(--text-muted)] hover:text-[var(--accent)] transition"
          >
            {theme === 'light' ? '☀' : '☾'}
          </button>
        )}
      </div>
    </header>
  );
};

export default Topbar;
