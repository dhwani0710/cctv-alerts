import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, dashboardFor } from '../context/AuthContext.jsx';

export default function Login() {
  const { login, session } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState(false);

  React.useEffect(() => {
    if (session) navigate(dashboardFor(session.role), { replace: true });
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(e) {
    e.preventDefault();
    const result = login(username, password);
    if (!result.ok) { setError(true); return; }
    setError(false);
    navigate(dashboardFor(result.session.role));
  }

  return (
    <div className="login-wrap">
      <div className="login-glow" />

      <div className="login-hero">
        <div className="login-hero-top">
          <div className="brand-mark">e</div>
          <div>
            <div className="brandname">eSamyak</div>
            <div className="brandsub">Security Intelligence</div>
          </div>
        </div>

        <div className="login-hero-mid">
          <span className="eyebrow">AI Security Command Center</span>
          <h1>Protect what<br />matters <span className="accent">most.</span></h1>
          <p>Unified CCTV intelligence, incident detection and people analytics for modern retail security.</p>
        </div>

        <div className="login-features">
          <div className="feature-row">
            <span className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z" />
                <path d="m8.5 12 2.3 2.3L15.5 9.5" />
              </svg>
            </span>
            <div>
              <div className="feature-t">AI-powered monitoring</div>
              <div className="feature-d">Real-time person detection & verification</div>
            </div>
          </div>
          <div className="feature-row">
            <span className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M3 12h4l2 6 4-14 2 8h6" />
              </svg>
            </span>
            <div>
              <div className="feature-t">24/7 security intelligence</div>
              <div className="feature-d">One command center for every camera</div>
            </div>
          </div>
        </div>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <div className="login-card-top">
            <span className="eyebrow">Authorized Access</span>
            <span className="secure-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z" />
                <path d="m8.5 12 2.3 2.3L15.5 9.5" />
              </svg>
              Secure
            </span>
          </div>

          <h2>Sign in</h2>
          <p className="sub">Access your security command center.</p>

          {error && <div className="form-error show">Incorrect Security ID or password. Try again.</div>}

          <form onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label htmlFor="username">Security ID</label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin@esamyak.com"
                autoComplete="username"
                required
              />
            </div>

            <div className="field">
              <div className="field-label-row">
                <label htmlFor="password">Password</label>
                <button type="button" className="show-toggle" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />
            </div>

            <div className="field-row">
              <label className="checkbox">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember this device
              </label>
              <a href="#" className="forgot-link" onClick={(e) => e.preventDefault()}>Forgot password?</a>
            </div>

            <button type="submit" className="login-submit">
              Enter Command Center
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
            </button>
          </form>

          <div className="demo-note">
            <b>Demo credentials</b> — replace with your real login API when ready.<br />
            Admin&nbsp;&nbsp;→ admin / admin123<br />
            Staff&nbsp;&nbsp;&nbsp;&nbsp;→ employee / employee123
          </div>

          <div className="login-card-foot">
            <span className="status-dot" /> All systems operational <span className="dot-sep">·</span> Encrypted connection
          </div>
        </div>
      </div>

      <div className="login-footer">
        eSamyak Jewels Technology Pvt. Ltd. <span className="dot-sep">•</span> Enterprise Security Platform
      </div>
    </div>
  );
}