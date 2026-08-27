import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { useAuth } from '../context/AuthContext';

export const AdminPage = () => {
  const { user, apiFetch } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isStaff = isAdmin || user?.role === 'manager';

  // Employee State
  const [employees, setEmployees] = useState([]);
  const [empName, setEmpName] = useState('');
  const [shiftStart, setShiftStart] = useState('');
  const [shiftEnd, setShiftEnd] = useState('');
  const [photos, setPhotos] = useState([]);
  const [isAddingEmp, setIsAddingEmp] = useState(false);

  // Modals State
  const [deleteModal, setDeleteModal] = useState(null); // { id, name }
  const [editModal, setEditModal] = useState(null); // { id, name, shiftStart, shiftEnd }
  const [editPhoto, setEditPhoto] = useState(null);

  // User Management State (Admin Only)
  const [users, setUsers] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('guard');

  const loadEmployees = useCallback(async () => {
    try {
      const res = await apiFetch('/employees');
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      }
    } catch (err) {
      console.error('Error loading employees:', err);
    }
  }, [apiFetch]);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await apiFetch('/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Error loading users:', err);
    }
  }, [apiFetch, isAdmin]);

  useEffect(() => {
    loadEmployees();
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin, loadEmployees, loadUsers]);

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (photos.length === 0) {
      alert('At least one face photo is required.');
      return;
    }

    setIsAddingEmp(true);
    const formData = new FormData();
    formData.append('name', empName);
    formData.append('shift_start', shiftStart);
    formData.append('shift_end', shiftEnd);
    for (let i = 0; i < photos.length; i++) {
      formData.append('photos', photos[i]);
    }

    try {
      const res = await apiFetch('/employees', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        setEmpName('');
        setShiftStart('');
        setShiftEnd('');
        setPhotos([]);
        e.target.reset();
        loadEmployees();
      } else {
        alert(data.error || 'Failed to add employee');
      }
    } catch (err) {
      alert('Error adding employee');
    } finally {
      setIsAddingEmp(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal) return;
    try {
      await apiFetch(`/employees/${deleteModal.id}`, { method: 'DELETE' });
      setDeleteModal(null);
      loadEmployees();
    } catch (err) {
      alert('Failed to remove employee');
    }
  };

  const handleSaveEdit = async () => {
    if (!editModal) return;
    const formData = new FormData();
    formData.append('name', editModal.name);
    formData.append('shift_start', editModal.shiftStart);
    formData.append('shift_end', editModal.shiftEnd);
    if (editPhoto) {
      formData.append('photo', editPhoto);
    }

    try {
      const res = await apiFetch(`/employees/${editModal.id}`, {
        method: 'PUT',
        body: formData
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        setEditModal(null);
        setEditPhoto(null);
        loadEmployees();
      } else {
        alert(data.error || 'Failed to update employee');
      }
    } catch (err) {
      alert('Error updating employee');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole
        })
      });
      const data = await res.json();
      if (res.ok) {
        setNewUsername('');
        setNewPassword('');
        loadUsers();
      } else {
        alert(data.detail || 'Failed to create user');
      }
    } catch (err) {
      alert('Error creating user');
    }
  };

  const handleDeleteUser = async (id, username) => {
    if (!confirm(`Are you sure you want to delete user account '${username}'?`)) return;
    try {
      const res = await apiFetch(`/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadUsers();
      } else {
        const data = await res.json();
        alert(data.detail || 'Failed to delete user');
      }
    } catch (err) {
      alert('Error deleting user');
    }
  };

  const isOvernight = (start, end) => end <= start;

  const roleBadges = {
    admin: <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-xs uppercase font-semibold">Admin</span>,
    manager: <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded text-xs uppercase font-semibold">Manager</span>,
    guard: <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-xs uppercase font-semibold">Guard</span>,
  };

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Employees" />
        <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-6">

        {/* Employee Setup Form */}
        <div>
          <div className="mb-3">
            <h2 className="text-base font-bold text-slate-100">Staff & Face Recognition Setup</h2>
            <p className="text-[var(--text-muted)] text-xs">
              Register employee shifts and facial images for automated CCTV detection.
            </p>
          </div>

          <form
            onSubmit={handleAddEmployee}
            className="bg-[var(--bg-panel)] rounded-xl p-4 shadow-lg space-y-3 border border-[var(--border-color)]"
          >
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Employee Name</label>
              <input
                type="text"
                required
                placeholder="e.g. John Doe"
                value={empName}
                onChange={(e) => setEmpName(e.target.value)}
                className="w-full bg-[var(--input-bg)] rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Shift Start</label>
                <input
                  type="time"
                  required
                  value={shiftStart}
                  onChange={(e) => setShiftStart(e.target.value)}
                  className="w-full bg-[var(--input-bg)] rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Shift End</label>
                <input
                  type="time"
                  required
                  value={shiftEnd}
                  onChange={(e) => setShiftEnd(e.target.value)}
                  className="w-full bg-[var(--input-bg)] rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                Face Photo(s) (clear portrait)
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                required
                onChange={(e) => setPhotos(e.target.files)}
                className="w-full text-sm text-[var(--text-muted)]"
              />
            </div>
            <button
              type="submit"
              disabled={isAddingEmp}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] font-semibold px-6 py-2 rounded-lg transition text-sm"
            >
              {isAddingEmp ? 'Adding...' : 'Add Employee'}
            </button>
          </form>

          <h3 className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-semibold mt-6 mb-3">
            Registered Employees
          </h3>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
            {employees.length > 0 ? (
              employees.map((e) => (
                <div
                  key={e.id}
                  className="flex justify-between items-center bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[var(--bg-panel-3)] border border-[var(--border-color)] flex items-center justify-center text-xs font-mono text-[var(--accent)]">
                      {e.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <span className="font-medium text-[var(--text-primary)]">{e.name}</span>
                      <span className="text-[var(--text-muted)] text-xs ml-2">
                        {e.shift_start} – {e.shift_end}
                      </span>
                      {isOvernight(e.shift_start, e.shift_end) && (
                        <span className="text-[var(--accent)] text-[10px] ml-2 border border-[var(--accent)]/40 rounded px-1.5 py-0.5">
                          overnight
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-4 shrink-0">
                    <button
                      onClick={() =>
                        setEditModal({
                          id: e.id,
                          name: e.name,
                          shiftStart: e.shift_start,
                          shiftEnd: e.shift_end
                        })
                      }
                      className="text-[var(--accent)] hover:text-[var(--accent-hover)] text-sm font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteModal({ id: e.id, name: e.name })}
                      className="text-red-500 hover:text-red-400 text-sm font-medium"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-[var(--text-muted)] py-4 text-center">
                No employees registered yet.
              </div>
            )}
          </div>
        </div>

        {/* User Management Section (Admin Only) */}
        {isAdmin && (
          <div className="pt-4 border-t border-[var(--border-color)]">
            <div className="mb-3">
              <h2 className="text-base font-bold text-slate-100">👑 User Management (RBAC)</h2>
              <p className="text-[var(--text-muted)] text-xs">
                Create user credentials and assign roles for system access.
              </p>
            </div>

            {/* Add User Form */}
            <form
              onSubmit={handleCreateUser}
              className="bg-[var(--bg-panel)] rounded-xl p-4 shadow-lg border border-[var(--border-color)] mb-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Username</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. guard_day"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full bg-[var(--input-bg)] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Password</label>
                  <input
                    type="password"
                    required
                    placeholder="Minimum 4 chars"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-[var(--input-bg)] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full bg-[var(--input-bg)] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500 text-sm text-slate-200"
                  >
                    <option value="guard">Security Guard (Live Feed)</option>
                    <option value="manager">Manager (Staff & Logs)</option>
                    <option value="admin">Administrator (Full Access)</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold px-4 py-2 rounded-lg transition text-sm"
                  >
                    Create User
                  </button>
                </div>
              </div>
            </form>

            {/* Users List */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex justify-between items-center bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg px-4 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-200">{u.username}</span>
                    {roleBadges[u.role] || <span className="text-xs text-slate-400">{u.role}</span>}
                    <span className="text-[10px] text-slate-500">
                      {new Date(u.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div>
                    {u.username === user.username ? (
                      <span className="text-xs text-slate-500 italic">Current User</span>
                    ) : (
                      <button
                        onClick={() => handleDeleteUser(u.id, u.username)}
                        className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded bg-red-950/30 hover:bg-red-900/40 border border-red-800/40 transition"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl p-6 w-96 space-y-4 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-100">Remove Employee</h2>
            <p className="text-[var(--text-muted)] text-sm">
              Are you sure you want to remove{' '}
              <span className="text-[var(--text-primary)] font-medium">{deleteModal.name}</span>? This cannot be
              undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeleteModal(null)} className="text-[var(--text-muted)] text-sm px-4 py-2">
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="bg-red-500 hover:bg-red-400 text-white font-semibold px-4 py-2 rounded-lg text-sm"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl p-6 w-96 space-y-4 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-100">Edit Employee</h2>
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-1">Employee Name</label>
              <input
                type="text"
                required
                value={editModal.name}
                onChange={(e) => setEditModal({ ...editModal, name: e.target.value })}
                className="w-full bg-[var(--input-bg)] rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-1">Shift Start</label>
                <input
                  type="time"
                  required
                  value={editModal.shiftStart}
                  onChange={(e) => setEditModal({ ...editModal, shiftStart: e.target.value })}
                  className="w-full bg-[var(--input-bg)] rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-1">Shift End</label>
                <input
                  type="time"
                  required
                  value={editModal.shiftEnd}
                  onChange={(e) => setEditModal({ ...editModal, shiftEnd: e.target.value })}
                  className="w-full bg-[var(--input-bg)] rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-1">
                New Photo (optional — leave blank to keep current)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setEditPhoto(e.target.files[0] || null)}
                className="w-full text-sm text-[var(--text-muted)]"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditModal(null)} className="text-[var(--text-muted)] text-sm px-4 py-2">
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] font-semibold px-4 py-2 rounded-lg text-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
      </div>
    </div>
  );
};
