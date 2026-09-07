import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Shell from '../components/Shell.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { initials } from '../data/mockData.js';

export default function AdminEmployees() {
  const { session, apiFetch } = useAuth();
  const isAdmin = session.role === 'ceo' || session.role === 'owner';

  const [staff, setStaff] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [photos, setPhotos] = useState([]);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [shiftFilter, setShiftFilter] = useState('');

  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editPhoto, setEditPhoto] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadStaff = useCallback(async () => {
    const res = await apiFetch('/employees');
    if (res.ok) {
      const data = await res.json();
      setStaff(data.map((e) => ({
        id: e.id,
        name: e.name,
        role: e.designation || 'Staff',
        shift_start: e.shift_start,
        shift_end: e.shift_end,
        shift: `${e.shift_start} – ${e.shift_end}`,
      })));
    }
  }, [apiFetch]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const roles = useMemo(() => Array.from(new Set(staff.map((s) => s.role))), [staff]);
  const shifts = useMemo(() => Array.from(new Set(staff.map((s) => s.shift))), [staff]);

  const filteredStaff = useMemo(
    () =>
      staff.filter(
        (s) =>
          (!roleFilter || s.role === roleFilter) &&
          (!shiftFilter || s.shift === shiftFilter) &&
          (!search || s.name.toLowerCase().includes(search.toLowerCase()))
      ),
    [staff, search, roleFilter, shiftFilter]
  );

  async function handleSubmit(e) {
    e.preventDefault();
    const formData = new FormData();
    formData.append('name', name);
    formData.append('designation', role);
    formData.append('shift_start', start);
    formData.append('shift_end', end);
    for (let i = 0; i < photos.length; i++) formData.append('photos', photos[i]);

    const res = await apiFetch('/employees', { method: 'POST', body: formData });
    const data = await res.json();
    if (res.ok && !data.error) {
      setName(''); setRole(''); setStart(''); setEnd(''); setPhotos([]);
      setShowAdd(false);
      loadStaff();
    } else {
      alert(data.error || 'Failed to add employee');
    }
  }

  function openEdit(s) {
    setEditTarget(s);
    setEditName(s.name);
    setEditStart(s.shift_start);
    setEditEnd(s.shift_end);
    setEditPhoto(null);
  }

  async function confirmEdit() {
    const formData = new FormData();
    formData.append('name', editName);
    formData.append('designation', editTarget.role);
    formData.append('shift_start', editStart);
    formData.append('shift_end', editEnd);
    if (editPhoto) formData.append('photo', editPhoto);

    const res = await apiFetch(`/employees/${editTarget.id}`, { method: 'PUT', body: formData });
    const data = await res.json();
    if (res.ok && !data.error) {
      setEditTarget(null);
      loadStaff();
    } else {
      alert(data.error || 'Failed to update employee');
    }
  }

  async function confirmDelete() {
    await apiFetch(`/employees/${deleteTarget.id}`, { method: 'DELETE' });
    setDeleteTarget(null);
    loadStaff();
  }

  return (
    <Shell active="employees" title="Employees">
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1>Staff roster</h1>
          <p>{isAdmin ? 'Add staff, set shift hours, and manage store access.' : 'View who’s on the team and their shift hours.'}</p>
        </div>
        {isAdmin && (
          <button className="btn btn-brass" onClick={() => setShowAdd((v) => !v)}>+ Add employee</button>
        )}
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value)}>
          <option value="">All shifts</option>
          {shifts.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {isAdmin && showAdd && (
        <div className="panel" style={{ marginBottom: 22 }}>
          <div className="panel-head"><h2>New employee</h2></div>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field"><label>Full name</label><input value={name} onChange={(e) => setName(e.target.value)} required /></div>
            <div className="field"><label>Role</label><input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Sales Associate" required /></div>
            <div className="field"><label>Shift start</label><input type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></div>
            <div className="field"><label>Shift end</label><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></div>
            <div className="field" style={{ gridColumn: '1/-1' }}><label>Photo (for face match)</label><input type="file" accept="image/*" multiple required onChange={(e) => setPhotos(e.target.files)} /></div>
            <div style={{ gridColumn: '1/-1', display: 'flex', gap: 10 }}>
              <button type="submit" className="btn btn-brass">Save employee</button>
              <button type="button" className="btn btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="results-count mono">
        {filteredStaff.length} {filteredStaff.length === 1 ? 'employee' : 'employees'}
      </div>

      <div className="staff-grid">
        {filteredStaff.map((s) => (
          <div className="staff-card" key={s.id}>
            <div className="avatar">{initials(s.name)}</div>
            <div className="name">{s.name}</div>
            <div className="role">{s.role}</div>
            <div className="row"><span>Shift</span><span>{s.shift}</span></div>
            {isAdmin && (
              <div className="actions">
                <button className="btn btn-outline btn-sm" onClick={() => openEdit(s)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(s)}>Remove</button>
              </div>
            )}
          </div>
        ))}
        {filteredStaff.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No staff match that search.</p>
        )}
      </div>

      {editTarget && (
        <div className="cam-lightbox-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setEditTarget(null); }}>
          <div className="panel" style={{ maxWidth: 420, width: '100%' }}>
            <div className="panel-head"><h2>Edit employee</h2></div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div className="field"><label>Full name</label><input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="field"><label>Shift start</label><input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} /></div>
                <div className="field"><label>Shift end</label><input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} /></div>
              </div>
              <div className="field"><label>New photo (optional)</label><input type="file" accept="image/*" onChange={(e) => setEditPhoto(e.target.files[0] || null)} /></div>
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
        title="Remove employee"
        message={deleteTarget ? `Are you sure you want to remove ${deleteTarget.name}? This cannot be undone.` : ''}
        confirmLabel="Remove"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Shell>
  );
}