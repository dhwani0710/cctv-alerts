import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, dashboardFor } from '../context/AuthContext.jsx';
import HallmarkStamp from '../components/HallmarkStamp.jsx';

export default function Login() {
  const { login, session } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      <div className="login-hero">
        <div className="login-hero-top">
          <HallmarkStamp large />
          <div>
            <div className="brandname">VaultWatch</div>
            <div className="brandsub">Store Security Console</div>
          </div>
        </div>
        <div className="login-hero-mid">
          <h1>Every case, every door, every hour — on record.</h1>
          <p>Sign in to view live camera feeds, respond to alerts and review the store's access log. Admin and staff each see the tools built for their role.</p>
        </div>
        <div className="login-hero-foot">
          <div className="stat"><b>06</b><span>Cameras live</span></div>
          <div className="stat"><b>24/7</b><span>Monitoring</span></div>
          <div className="stat"><b>2</b><span>Roles supported</span></div>
        </div>
      </div>
      <div className="login-panel">
        <div className="login-card">
          <span className="eyebrow">Secure Access</span>
          <h2>Sign in</h2>
          <p className="sub">Enter the username and password issued to you.</p>
          {error && <div className="form-error show">Incorrect username or password. Try again.</div>}
          <form onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label htmlFor="username">Username</label>
              <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </div>
            <button type="submit" className="login-submit">Sign in</button>
          </form>
          <div className="demo-note">
            <b>Demo credentials</b> — replace with your real login API when ready.<br />
            Admin&nbsp;&nbsp;→ admin / admin123<br />
            Staff&nbsp;&nbsp;&nbsp;&nbsp;→ employee / employee123
          </div>
        </div>
      </div>
    </div>
  );
}
