import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Shell from '../components/Shell.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { initials } from '../data/mockData.js';
import Loader from '../components/Loader.jsx';

const ROLE_OPTIONS = ['ceo', 'owner', 'guard', 'hr'];

// Select values are strings; ids from the API may be numbers.
const toId = (v) => (v === '' || v == null ? null : Number.isNaN(Number(v)) ? v : Number(v));

export default function AdminUsers() {
  const { session, apiFetch, isSuperAdmin, officeId: myOfficeId } = useAuth();
  const isAdmin = session.role === 'ceo' || session.role === 'owner';

  const [users, setUsers] = useState([]);
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('guard');
  const [newOfficeId, setNewOfficeId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [addError, setAddError] = useState('');

  const [roleFilter, setRoleFilter] = useState('');
  const [officeFilter, setOfficeFilter] = useState('');

  const [editTarget, setEditTarget] = useState(null);
  const [editRole, setEditRole] = useState('');
  const [editOfficeId, setEditOfficeId] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editError, setEditError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  const loadUsers = useCallback(async () => {
    try {
      const res = await apiFetch('/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  const loadOffices = useCallback(async () => {
    try {
      const res = await apiFetch('/offices');
      if (res.ok) setOffices(await res.json());
    } catch {
      /* offices stay empty; forms fall back to the user's own office */
    }
  }, [apiFetch]);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { loadOffices(); }, [loadOffices]);

  const officeName = useCallback(
    (id) => {
      if (id == null || id === '') return 'All offices';
      const found = offices.find((o) => String(o.id) === String(id));
      if (found) return found.name;
      if (String(id) === String(myOfficeId) && session.officeName) return session.officeName;
      return `Office ${id}`;
    },
    [offices, myOfficeId, session.officeName]
  );

  const roles = useMemo(() => Array.from(new Set(users.map((u) => u.role))), [users]);

  const filteredUsers = useMemo(
    () => users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (officeFilter) {
        if (officeFilter === 'all') return u.office_id == null;
        if (String(u.office_id) !== officeFilter) return false;
      }
      return true;
    }),
    [users, roleFilter, officeFilter]
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

    // Only guard is tied to an office. Every other role sees all offices.
    const targetOffice = isSuperAdmin ? toId(newOfficeId) : myOfficeId;
    if (role === 'guard' && targetOffice == null) {
      setAddError('Select an office for this guard.');
      return;
    }

    const res = await apiFetch('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.trim(),
        password,
        role,
        office_id: role === 'guard' ? targetOffice : null,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setUsername(''); setPassword(''); setConfirmPassword(''); setRole('guard'); setNewOfficeId('');
      setShowAdd(false);
      loadUsers();
    } else {
      setAddError(data.detail || 'Failed to create user');
    }
  }

  function openEdit(u) {
    setEditTarget(u);
    setEditRole(u.role);
    setEditOfficeId(u.office_id == null ? '' : String(u.office_id));
    setEditPassword('');
    setEditError('');
  }

  async function confirmEdit() {
    setEditError('');
    const body = { role: editRole };

    if (isSuperAdmin) {
      const targetOffice = toId(editOfficeId);
      if (editRole === 'guard' && targetOffice == null) {
        setEditError('Select an office for this guard.');
        return;
      }
      body.office_id = editRole === 'guard' ? targetOffice : null;
    }

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
      <div className="page-head">
        <h1>Login accounts</h1>
        <p>Create logins and manage roles. Guards are tied to one office. All other roles see all offices.</p>
      </div>

      <div className="filter-bar">
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

        {isSuperAdmin && (
          <select value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)}>
            <option value="">All offices</option>
            {offices.map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
            <option value="all">All-office roles (no office)</option>
          </select>
        )}

        {isAdmin && (
          <button className="btn btn-brass filter-end" onClick={() => setShowAdd((v) => !v)}>+ Create user</button>
        )}
      </div>

      {isAdmin && showAdd && (
        <div className="panel" style={{ marginBottom: 22 }}>
          <div className="panel-head"><h2>New user</h2></div>
          {addError && <div className="form-error show">{addError}</div>}
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="field"><label>Username</label><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} required /></div>
            <div className="field">
              <label>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Office</label>
              {isSuperAdmin ? (
                <select value={newOfficeId} onChange={(e) => setNewOfficeId(e.target.value)} disabled={role !== 'guard'}>
                  <option value="">{role !== 'guard' ? 'All offices' : 'Select office…'}</option>
                  {offices.map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
                </select>
              ) : (
                <input value={officeName(myOfficeId)} disabled readOnly />
              )}
            </div>
            <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required /></div>
            <div className="field"><label>Confirm password</label><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required /></div>
            <div className="span-all form-actions">
              <button type="submit" className="btn btn-brass">Create user</button>
              <button type="button" className="btn btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {deleteError && <div className="form-error show" style={{ marginBottom: 16 }}>{deleteError}</div>}

      <div className="results-count mono" style={{ visibility: loading ? 'hidden' : 'visible' }}>
        {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'}
      </div>

      <div className="staff-grid">
        {filteredUsers.map((u) => (
          <div className="staff-card" key={u.id}>
            <div className="avatar">{initials(u.username)}</div>
            <div className="name">{u.username}</div>
            <div className="role">{u.role}</div>
            <div className="row"><span>Office</span><span>{officeName(u.office_id)}</span></div>
            <div className="row"><span>Created</span><span>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</span></div>
            {isAdmin && (
              <div className="actions">
                <button className="btn btn-outline btn-sm" onClick={() => openEdit(u)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(u)}>Remove</button>
              </div>
            )}
          </div>
        ))}
        {loading && <div style={{ gridColumn: '1 / -1' }}><Loader /></div>}
        {!loading && filteredUsers.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No users match that search.</p>
        )}
      </div>

      {editTarget && (
        <div className="cam-lightbox-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setEditTarget(null); }}>
          <div className="panel modal-panel">
            <div className="panel-head"><h2>Edit user</h2></div>
            {editError && <div className="form-error show">{editError}</div>}
            <div style={{ display: 'grid', gap: 14 }}>
              <div className="field">
                <label>Role</label>
                <select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                  {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Office</label>
                {isSuperAdmin ? (
                  <select value={editOfficeId} onChange={(e) => setEditOfficeId(e.target.value)} disabled={editRole !== 'guard'}>
                    <option value="">{editRole !== 'guard' ? 'All offices' : 'Select office…'}</option>
                    {offices.map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
                  </select>
                ) : (
                  <input value={officeName(editTarget.office_id)} disabled readOnly />
                )}
              </div>
              <div className="field"><label>New password (optional)</label><input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Leave blank to keep current password" autoComplete="new-password" /></div>
              <div className="modal-actions">
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