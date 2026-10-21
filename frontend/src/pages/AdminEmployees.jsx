import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
} from 'react';

import Shell from '../components/Shell.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import useOffices from '../hooks/useOffices.js';
import { initials } from '../data/mockData.js';
import Loader from '../components/Loader.jsx';

function classifyShift(shift) {
  if (!shift || !shift.includes('–')) return null;

  const startHour = parseInt(
    shift.split('–')[0].trim().split(':')[0],
    10
  );

  if (Number.isNaN(startHour)) return null;

  return startHour >= 5 && startHour < 17 ? 'day' : 'night';
}

export default function AdminEmployees() {
  const { session, apiFetch, isSuperAdmin, officeId: myOfficeId } = useAuth();
  const { offices, officeName } = useOffices();

  const isAdmin =
    session.role === 'ceo' ||
    session.role === 'owner';

  const isHr = session.role === 'hr';

  // CEO, Owner and HR can manage employees
  const canManageEmployees = isAdmin || isHr;

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [photos, setPhotos] = useState([]);
  const [newOfficeId, setNewOfficeId] = useState('');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [shiftFilter, setShiftFilter] = useState('');
  const [officeFilter, setOfficeFilter] = useState('');

  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editPhoto, setEditPhoto] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);

  // Only super admins can switch offices. Everyone else is already scoped by the backend.
  const showOfficePicker = isSuperAdmin && offices.length > 1;

  // With a single office there is nothing to choose, so preselect it.
  useEffect(() => {
    if (isSuperAdmin && offices.length === 1 && !newOfficeId) {
      setNewOfficeId(String(offices[0].id));
    }
  }, [isSuperAdmin, offices, newOfficeId]);

  const loadStaff = useCallback(async () => {
    try {
      const res = await apiFetch('/employees');

      if (res.ok) {
        const data = await res.json();

        setStaff(
          data.map((employee) => ({
            id: employee.id,
            name: employee.name,
            role: employee.designation || 'Staff',
            office_id: employee.office_id ?? null,
            shift_start: employee.shift_start,
            shift_end: employee.shift_end,
            shift: `${employee.shift_start} – ${employee.shift_end}`,
          }))
        );
      } else {
        console.error('Failed to load employees');
      }
    } catch (error) {
      console.error('Error loading employees:', error);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const roles = useMemo(
    () => Array.from(new Set(staff.map((employee) => employee.role))),
    [staff]
  );

  const filteredStaff = useMemo(() => {
    return staff.filter(
      (employee) =>
        (!officeFilter || String(employee.office_id) === officeFilter) &&
        (!roleFilter || employee.role === roleFilter) &&
        (!shiftFilter ||
          classifyShift(employee.shift) === shiftFilter) &&
        (!search ||
          employee.name
            .toLowerCase()
            .includes(search.toLowerCase()))
    );
  }, [staff, search, roleFilter, shiftFilter, officeFilter]);

  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (submitting) return;

    // Non-super-admins can only add employees to their own office.
    const targetOffice = isSuperAdmin ? newOfficeId : myOfficeId;
    if (targetOffice == null || targetOffice === '') {
      alert('Select an office for this employee.');
      return;
    }

    setSubmitting(true);

    const formData = new FormData();

    formData.append('name', name);
    formData.append('designation', role);
    formData.append('shift_start', start);
    formData.append('shift_end', end);
    formData.append('office_id', String(targetOffice));

    for (let index = 0; index < photos.length; index += 1) {
      formData.append('photos', photos[index]);
    }

    try {
      const res = await apiFetch('/employees', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setName('');
        setRole('');
        setStart('');
        setEnd('');
        setPhotos([]);
        setNewOfficeId('');
        setShowAdd(false);

        await loadStaff();
      } else {
        alert(data.detail || 'Failed to add employee');
      }
    } catch (error) {
      console.error('Error adding employee:', error);
      alert('Failed to add employee');
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(employee) {
    setEditTarget(employee);
    setEditName(employee.name);
    setEditStart(employee.shift_start);
    setEditEnd(employee.shift_end);
    setEditPhoto(null);
  }

  async function confirmEdit() {
    if (!editTarget) return;

    const formData = new FormData();

    formData.append('name', editName);
    formData.append('designation', editTarget.role);
    formData.append('shift_start', editStart);
    formData.append('shift_end', editEnd);
    // The office is not sent on edit: moving an employee would orphan their
    // attendance history and face data in the old office.

    if (editPhoto) {
      formData.append('photo', editPhoto);
    }

    try {
      const res = await apiFetch(
        `/employees/${editTarget.id}`,
        {
          method: 'PUT',
          body: formData,
        }
      );

      const data = await res.json();

      if (res.ok) {
        setEditTarget(null);
        await loadStaff();
      } else {
        alert(data.detail || 'Failed to update employee');
      }
    } catch (error) {
      console.error('Error updating employee:', error);
      alert('Failed to update employee');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    try {
      const res = await apiFetch(
        `/employees/${deleteTarget.id}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        setDeleteTarget(null);
        await loadStaff();
      } else {
        alert('Failed to remove employee');
      }
    } catch (error) {
      console.error('Error removing employee:', error);
      alert('Failed to remove employee');
    }
  }

  return (
    <Shell active="employees" title="Employees">
      <div className="page-head">
        <h1>Staff roster</h1>

        <p>
          {canManageEmployees
            ? 'Add employees, manage staff details, and set shift hours.'
            : 'View who’s on the team and their shift hours.'}
        </p>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search by name"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {showOfficePicker && (
          <select
            value={officeFilter}
            onChange={(event) => setOfficeFilter(event.target.value)}
          >
            <option value="">All offices</option>
            {offices.map((o) => (
              <option key={o.id} value={String(o.id)}>
                {o.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
        >
          <option value="">All roles</option>

          {roles.map((employeeRole) => (
            <option key={employeeRole} value={employeeRole}>
              {employeeRole}
            </option>
          ))}
        </select>

        <select
          value={shiftFilter}
          onChange={(event) => setShiftFilter(event.target.value)}
        >
          <option value="">All shifts</option>
          <option value="day">Day shift</option>
          <option value="night">Night shift</option>
        </select>

        {/* HR, CEO and Owner can add employees */}
        {canManageEmployees && (
          <button
            className="btn btn-brass filter-end"
            onClick={() => setShowAdd((value) => !value)}
          >
            + Add employee
          </button>
        )}
      </div>

      {/* Add Employee Form */}
      {canManageEmployees && showAdd && (
        <div
          className="panel"
          style={{ marginBottom: 22 }}
        >
          <div className="panel-head">
            <h2>New employee</h2>
          </div>

          <form onSubmit={handleSubmit} className="form-grid">
            <div className="field">
              <label>Full name</label>

              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>

            <div className="field">
              <label>Role</label>

              <input
                value={role}
                onChange={(event) => setRole(event.target.value)}
                placeholder="Sales Associate"
                required
              />
            </div>

            <div className="field">
              <label>Office</label>

              {isSuperAdmin ? (
                <select
                  value={newOfficeId}
                  onChange={(event) => setNewOfficeId(event.target.value)}
                  required
                >
                  <option value="">Select office…</option>
                  {offices.map((o) => (
                    <option key={o.id} value={String(o.id)}>
                      {o.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={officeName(myOfficeId)} disabled readOnly />
              )}
            </div>

            <div className="field">
              <label>Shift start</label>

              <input
                type="time"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required
              />
            </div>

            <div className="field">
              <label>Shift end</label>

              <input
                type="time"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                required
              />
            </div>

            <div className="field span-all">
              <label>Photo for face match</label>

              <input
                type="file"
                accept="image/*"
                multiple
                required
                onChange={(event) =>
                  setPhotos(event.target.files)
                }
              />
            </div>

            <div className="span-all form-actions">
              <button
                type="submit"
                className="btn btn-brass"
                disabled={submitting}
              >
                {submitting ? 'Saving…' : 'Save employee'}
              </button>

              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowAdd(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="results-count mono" style={{ visibility: loading ? 'hidden' : 'visible' }}>
        {filteredStaff.length}{' '}
        {filteredStaff.length === 1
          ? 'employee'
          : 'employees'}
      </div>

      <div className="staff-grid">
        {filteredStaff.map((employee) => (
          <div
            className="staff-card"
            key={employee.id}
          >
            <div className="avatar">
              {initials(employee.name)}
            </div>

            <div className="name">
              {employee.name}
            </div>

            <div className="role">
              {employee.role}
            </div>

            {showOfficePicker && (
              <div className="row">
                <span>Office</span>
                <span>{officeName(employee.office_id)}</span>
              </div>
            )}

            <div className="row">
              <span>Shift</span>
              <span>{employee.shift}</span>
            </div>

            {canManageEmployees && (
              <div className="actions">
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => openEdit(employee)}
                >
                  Edit
                </button>

                <button
                  className="btn btn-danger btn-sm"
                  onClick={() =>
                    setDeleteTarget(employee)
                  }
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}

        {loading && <div style={{ gridColumn: '1 / -1' }}><Loader /></div>}
        {!loading && filteredStaff.length === 0 && (
          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: 13.5,
            }}
          >
            No staff match that search.
          </p>
        )}
      </div>

      {editTarget && (
        <div
          className="cam-lightbox-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setEditTarget(null);
            }
          }}
        >
          <div className="panel modal-panel">
            <div className="panel-head">
              <h2>Edit employee</h2>
            </div>

            <div
              style={{
                display: 'grid',
                gap: 14,
              }}
            >
              <div className="field">
                <label>Full name</label>

                <input
                  value={editName}
                  onChange={(event) =>
                    setEditName(event.target.value)
                  }
                />
              </div>

              <div className="field">
                <label>Office</label>

                <input value={officeName(editTarget.office_id)} disabled readOnly />
              </div>

              <div className="pair-grid">
                <div className="field">
                  <label>Shift start</label>

                  <input
                    type="time"
                    value={editStart}
                    onChange={(event) =>
                      setEditStart(event.target.value)
                    }
                  />
                </div>

                <div className="field">
                  <label>Shift end</label>

                  <input
                    type="time"
                    value={editEnd}
                    onChange={(event) =>
                      setEditEnd(event.target.value)
                    }
                  />
                </div>
              </div>

              <div className="field">
                <label>New photo optional</label>

                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setEditPhoto(
                      event.target.files[0] || null
                    )
                  }
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setEditTarget(null)}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="btn btn-brass"
                  onClick={confirmEdit}
                >
                  Save changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove employee"
        message={
          deleteTarget
            ? `Are you sure you want to remove ${deleteTarget.name}? This cannot be undone.`
            : ''
        }
        confirmLabel="Remove"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Shell>
  );
}