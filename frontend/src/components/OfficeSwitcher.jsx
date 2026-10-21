import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function OfficeSwitcher() {
  const { session, isGuard, offices, selectedOffice, setSelectedOffice } = useAuth();
  if (!session) return null;

  if (isGuard) {
    return <span className="mono">{session.officeName || offices[0]?.name || ''}</span>;
  }

  return (
    <select
      value={selectedOffice}
      onChange={(e) => setSelectedOffice(e.target.value)}
      aria-label="Office"
    >
      <option value="all">All offices</option>
      {offices.map((o) => (
        <option key={o.id} value={String(o.id)}>{o.name}</option>
      ))}
    </select>
  );
}