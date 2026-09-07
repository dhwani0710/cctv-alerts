import React, { useState } from 'react';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const ROLES = ['ceo', 'owner', 'guard', 'hr'];

export default function AdminUsers() {
  const { apiFetch } = useAuth();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('guard');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Could not create user.');
        return;
      }
      setSuccess(`User "${username}" created.`);
      setUsername(''); setPassword(''); setConfirmPassword(''); setRole('guard');
    } catch (err) {
      setError('Network error — could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell active="users" title="Users">
      <div className="page-head">
        <h1>Create login</h1>
        <p>Set up a username and password for a new staff login.</p>
      </div>

      <div className="panel" style={{ maxWidth: 440 }}>
        {error && <div className="form-error show">{error}</div>}
        {success && (
          <div
            className="form-error show"
            style={{ borderColor: 'var(--sage)', color: 'var(--sage)', background: 'rgba(87,121,95,.1)' }}
          >
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="field">
            <label>Confirm password</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-brass" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create user'}
          </button>
        </form>
      </div>
    </Shell>
  );
}