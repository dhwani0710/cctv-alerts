import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Shell from '../components/Shell.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { initials } from '../data/mockData.js';

const ROLE_OPTIONS = ['ceo', 'owner', 'guard', 'hr'];

export default function AdminUsers() {
  const { session, apiFetch } = useAuth();
  const isAdmin = session.role === 'ceo' || session.role === 'owner';

  const [users, setUsers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('guard');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [addError, setAddError] = useState('');

  const [roleFilter, setRoleFilter] = useState('');

  const [editTarget, setEditTarget] = useState(null);
  const [editRole, setEditRole] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editError, setEditError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  const loadUsers = useCallback(async () => {
    const res = await apiFetch('/users');
    if (res.ok) {
      const data = await res.json();
      setUsers(data);
    }
  }, [apiFetch]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const roles = useMemo(() => Array.from(new Set(users.map((u) => u.role))), [users]);

  const filteredUsers = useMemo(
    () => users.filter((u) => !roleFilter || u.role === roleFilter),
    [users, roleFilter]
  );
  async function handleSubmit(e) {
    e.preventDefault();
    setAddError('');

    if (password !== confirmPassword) {
      setAddError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setAddError('Password must be at least 6 characters.');
      return;
    }

    const res = await apiFetch('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password, role }),
    });
    const data = await res.json();
    if (res.ok) {
      setUsername(''); setPassword(''); setConfirmPassword(''); setRole('guard');
      setShowAdd(false);
      loadUsers();
    } else {
      setAddError(data.detail || 'Failed to create user');
    }
  }

  function openEdit(u) {
    setEditTarget(u);
    setEditRole(u.role);
    setEditPassword('');
    setEditError('');
  }

  async function confirmEdit() {
    setEditError('');
    const body = { role: editRole };
    if (editPassword) {
      if (editPassword.length < 6) {
        setEditError('Password must be at least 6 characters.');
        return;
      }
      body.password = editPassword;
    }

    const res = await apiFetch(`/users/${editTarget.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      setEditTarget(null);
      loadUsers();
    } else {
      setEditError(data.detail || 'Failed to update user');
    }
  }

  async function confirmDelete() {
    setDeleteError('');
    const res = await apiFetch(`/users/${deleteTarget.id}`, { method: 'DELETE' });
    if (res.ok) {
      setDeleteTarget(null);
      loadUsers();
    } else {
      const data = await res.json();
      setDeleteError(data.detail || 'Failed to delete user');
      setDeleteTarget(null);
    }
  }

  return (
    <Shell active="users" title="Users">
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1>Login accounts</h1>
          <p>Create logins and manage roles for admin, hr, and guard accounts.</p>
        </div>
        {isAdmin && (
          <button className="btn btn-brass" onClick={() => setShowAdd((v) => !v)}>+ Create user</button>
        )}
      </div>

      <div className="filter-bar">
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {isAdmin && showAdd && (
        <div className="panel" style={{ marginBottom: 22 }}>
          <div className="panel-head"><h2>New user</h2></div>
          {addError && <div className="form-error show">{addError}</div>}
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field"><label>Username</label><input value={username} onChange={(e) => setUsername(e.target.value)} required /></div>
            <div className="field">
              <label>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <div className="field"><label>Confirm password</label><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></div>
            <div style={{ gridColumn: '1/-1', display: 'flex', gap: 10 }}>
              <button type="submit" className="btn btn-brass">Create user</button>
              <button type="button" className="btn btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {deleteError && <div className="form-error show" style={{ marginBottom: 16 }}>{deleteError}</div>}

      <div className="results-count mono">
        {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'}
      </div>

      <div className="staff-grid">
        {filteredUsers.map((u) => (
          <div className="staff-card" key={u.id}>
            <div className="avatar">{initials(u.name || u.username)}</div>
            <div className="name">{u.username}</div>
            <div className="role">{u.role}</div>
            <div className="row"><span>Created</span><span>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</span></div>
            {isAdmin && (
              <div className="actions">
                <button className="btn btn-outline btn-sm" onClick={() => openEdit(u)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(u)}>Remove</button>
              </div>
            )}
          </div>
        ))}
        {filteredUsers.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No users match that search.</p>
        )}
      </div>

      {editTarget && (
        <div className="cam-lightbox-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setEditTarget(null); }}>
          <div className="panel" style={{ maxWidth: 420, width: '100%' }}>
            <div className="panel-head"><h2>Edit user</h2></div>
            {editError && <div className="form-error show">{editError}</div>}
            <div style={{ display: 'grid', gap: 14 }}>
              <div className="field">
                <label>Role</label>
                <select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                  {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="field"><label>New password (optional)</label><input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Leave blank to keep current password" /></div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={() => setEditTarget(null)}>Cancel</button>
                <button className="btn btn-brass" onClick={confirmEdit}>Save changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove user"
        message={deleteTarget ? `Are you sure you want to remove "${deleteTarget.username}"? This cannot be undone.` : ''}
        confirmLabel="Remove"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Shell>
  );
}