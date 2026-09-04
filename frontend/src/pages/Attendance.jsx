import React from 'react';
import Shell from '../components/Shell.jsx';
import { MOCK_ATTENDANCE } from '../data/mockData.js';

export default function Attendance() {
  return (
    <Shell active="attendance" title="Attendance">
      <div className="page-head">
        <h1>Attendance</h1>
        <p>Staff attendance based on camera first-seen / last-seen detection.</p>
      </div>

      <div className="table-wrap">
        <table className="records">
          <thead>
            <tr>
              <th>Staff</th>
              <th>Role</th>
              <th>First seen</th>
              <th>Last seen</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_ATTENDANCE.map((a, i) => (
              <tr key={i}>
                <td>{a.name}</td>
                <td>{a.role}</td>
                <td className="mono">{a.firstSeen}</td>
                <td className="mono">{a.lastSeen}</td>
                <td>{a.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}