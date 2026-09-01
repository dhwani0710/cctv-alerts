import React, { useState } from 'react';
import Shell from '../components/Shell.jsx';
import { MOCK_STAFF_INITIAL, initials } from '../data/mockData.js';

export default function AdminEmployees() {
  const [staff, setStaff] = useState(MOCK_STAFF_INITIAL);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

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
          <span className="eyebrow">Admin only</span>
          <h1>Staff roster</h1>
          <p>Add staff, set shift hours, and manage store access.</p>
        </div>
        <button className="btn btn-brass" onClick={() => setShowAdd((v) => !v)}>+ Add employee</button>
      </div>
      {showAdd && (
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
      <div className="staff-grid">
        {staff.map((s, i) => (
          <div className="staff-card" key={i}>
            <div className="avatar">{initials(s.name)}</div>
            <div className="name">{s.name}</div>
            <div className="role">{s.role}</div>
            <div className="row"><span>Shift</span><span>{s.shift}</span></div>
            <div className="row"><span>Added</span><span>{s.added}</span></div>
            <div className="actions">
              <button className="btn btn-outline btn-sm">Edit</button>
              <button className="btn btn-danger btn-sm">Remove</button>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
