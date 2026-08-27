import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);

  const { login, getDefaultRedirect } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAlert(null);

    if (!username.trim() || !password) {
      setAlert({ message: 'Please enter both username and password.', type: 'error' });
      return;
    }

    setLoading(true);

    try {
      const authData = await login(username.trim(), password);
      const from = location.state?.from?.pathname || getDefaultRedirect(authData.role);
      navigate(from, { replace: true });
    } catch (err) {
      setAlert({ message: err.message || 'Authentication failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header / Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-3xl mb-4 shadow-inner">
            💎
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">Jewellery Store Security</h1>
          <p className="text-slate-400 text-sm mt-1">Role-Based Access Control & CCTV Monitoring</p>
        </div>

        {/* Login Card */}
        <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-2xl p-7 shadow-2xl glow-gold backdrop-blur">
          {alert && (
            <div
              className={`mb-5 p-3.5 rounded-xl text-sm border flex items-center gap-2.5 transition ${
                alert.type === 'error'
                  ? 'bg-red-950/60 border-red-800/60 text-red-300'
                  : 'bg-amber-950/60 border-amber-800/60 text-amber-300'
              }`}
            >
              <span>{alert.type === 'error' ? '⚠️' : 'ℹ️'}</span>
              <span>{alert.message}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  autoComplete="username"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[var(--input-bg)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-sm transition"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Password
                </label>
              </div>
              <div className="relative">
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[var(--input-bg)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-sm transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-3 rounded-xl shadow-lg shadow-amber-500/20 transition duration-200 transform hover:-translate-y-0.5 active:translate-y-0 text-sm flex items-center justify-center gap-2"
            >
              <span>{loading ? 'Signing In...' : 'Sign In'}</span>
              {loading && <span className="animate-spin">⌛</span>}
            </button>
          </form>

          {/* System Roles Info */}
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
              Available System Roles
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-amber-950/30 border border-amber-800/30 text-amber-300 py-1.5 rounded-lg">
                👑 <b>Admin</b>
                <div className="text-[10px] text-amber-400/70">Full System</div>
              </div>
              <div className="bg-blue-950/30 border border-blue-800/30 text-blue-300 py-1.5 rounded-lg">
                👔 <b>Manager</b>
                <div className="text-[10px] text-blue-400/70">Staff & Logs</div>
              </div>
              <div className="bg-emerald-950/30 border border-emerald-800/30 text-emerald-300 py-1.5 rounded-lg">
                🛡️ <b>Guard</b>
                <div className="text-[10px] text-emerald-400/70">Live Feed</div>
              </div>
            </div>
          </div>

          {/* Quick Hint */}
          <div className="mt-4 p-2.5 bg-slate-800/40 rounded-lg text-xs text-slate-400 text-center border border-slate-800">
            Default Super Admin: <span className="font-mono text-amber-300">admin</span> /{' '}
            <span className="font-mono text-amber-300">admin123</span>
          </div>
        </div>
      </div>
    </div>
  );
};
