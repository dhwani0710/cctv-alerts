import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, getDefaultRedirect } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Enter both username and password.');
      return;
    }
    setLoading(true);
    try {
      const authData = await login(username.trim(), password);
      const from = location.state?.from?.pathname || getDefaultRedirect(authData.role);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between bg-[var(--bg-page)] text-[var(--text-primary)] p-11 relative overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full border-2 border-[var(--accent)] flex items-center justify-center text-2xl">◆</div>
          <div>
            <div className="text-lg font-semibold">Store Security Console</div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Monitoring & Access Control</div>
          </div>
        </div>
        <div>
          <h1 className="text-3xl font-medium leading-tight mb-3 max-w-sm">Every door, every hour, on record.</h1>
          <p className="text-[var(--text-muted)] text-sm max-w-sm leading-relaxed">
            Sign in to view live camera feeds, respond to alerts, and review the store's access log.
          </p>
        </div>
        <div className="flex gap-8 font-mono">
          <div><b className="block text-lg text-[var(--accent)]">24/7</b><span className="text-[10px] text-[var(--text-muted)] uppercase">Monitoring</span></div>
          <div><b className="block text-lg text-[var(--accent)]">3</b><span className="text-[10px] text-[var(--text-muted)] uppercase">Roles</span></div>
        </div>
      </div>

      <div className="flex items-center justify-center p-8 bg-[var(--bg-page)]">
        <div className="w-full max-w-sm">
          <span className="text-xs uppercase tracking-widest text-[var(--accent)] font-mono">Secure Access</span>
          <h2 className="text-2xl font-medium mt-1 mb-6">Sign in</h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm border border-[var(--danger)] bg-[var(--danger)]/10 text-[var(--danger)]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg px-4 py-2.5 outline-none focus:border-[var(--accent)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg px-4 py-2.5 outline-none focus:border-[var(--accent)] text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] font-semibold py-2.5 rounded-lg transition text-sm"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};