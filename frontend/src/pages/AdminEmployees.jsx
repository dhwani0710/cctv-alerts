import React, { useMemo, useState } from 'react';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { MOCK_STAFF_INITIAL, initials } from '../data/mockData.js';

export default function AdminEmployees() {
  const { session } = useAuth();
  const isAdmin = session.role === 'admin';

  const [staff, setStaff] = useState(MOCK_STAFF_INITIAL);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const roles = useMemo(() => Array.from(new Set(staff.map((s) => s.role))), [staff]);

  const filteredStaff = useMemo(
    () =>
      staff.filter(
        (s) =>
          (!roleFilter || s.role === roleFilter) &&
          (!search || s.name.toLowerCase().includes(search.toLowerCase()))
      ),
    [staff, search, roleFilter]
  );

  function handleSubmit(e) {
    e.preventDefault();
    setStaff([...staff, { name, role, shift: start && end ? `${start} – ${end}` : '—', added: 'Today' }]);
    setName(''); setRole(''); setStart(''); setEnd('');
    setShowAdd(false);
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
      </div>

      {isAdmin && showAdd && (
        <div className="panel" style={{ marginBottom: 22 }}>
          <div className="panel-head"><h2>New employee</h2></div>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field"><label>Full name</label><input value={name} onChange={(e) => setName(e.target.value)} required /></div>
            <div className="field"><label>Role</label><input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Sales Associate" required /></div>
            <div className="field"><label>Shift start</label><input type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></div>
            <div className="field"><label>Shift end</label><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></div>
            <div className="field" style={{ gridColumn: '1/-1' }}><label>Photo (for face match)</label><input type="file" accept="image/*" /></div>
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
        {filteredStaff.map((s, i) => (
          <div className="staff-card" key={i}>
            <div className="avatar">{initials(s.name)}</div>
            <div className="name">{s.name}</div>
            <div className="role">{s.role}</div>
            <div className="row"><span>Shift</span><span>{s.shift}</span></div>
            <div className="row"><span>Added</span><span>{s.added}</span></div>
            {isAdmin && (
              <div className="actions">
                <button className="btn btn-outline btn-sm">Edit</button>
                <button className="btn btn-danger btn-sm">Remove</button>
              </div>
            )}
          </div>
        ))}
        {filteredStaff.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No staff match that search.</p>
        )}
      </div>
    </Shell>
  );
}