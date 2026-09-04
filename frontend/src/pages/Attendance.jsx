import React from 'react';
import Shell from '../components/Shell.jsx';
import { MOCK_ATTENDANCE } from '../data/mockData.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

function dayOfWeek(dateStr) {
  const [day, monStr, year] = dateStr.split(' ');
  const month = MONTHS[monStr];
  if (month === undefined) return '';
  return DAY_NAMES[new Date(Number(year), month, Number(day)).getDay()];
}

// Assumption: no explicit status field on MOCK_ATTENDANCE, so "Present"
// is derived from firstSeen being set. If your data has a real status
// field, tell me its name and I'll use that instead of this guess.
function attendanceStatus(a) {
  return a.firstSeen ? 'Present' : 'Absent';
}

const tightCell = { padding: '11px 6px' };

export default function Attendance() {
  return (
    <Shell active="attendance" title="Attendance">
      <div className="page-head">
        <h1>Attendance</h1>
        <p>Staff attendance based on camera first-seen / last-seen detection.</p>
      </div>

      <div className="table-wrap">
        <table className="records">
          <colgroup>
            <col style={{ width: '24%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '10%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Staff</th>
              <th style={tightCell}>Role</th>
              <th style={tightCell}>First seen</th>
              <th style={tightCell}>Last seen</th>
              <th>Day</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_ATTENDANCE.map((a, i) => {
              const status = attendanceStatus(a);
              return (
                <tr key={i}>
                  <td>{a.name}</td>
                  <td style={tightCell}>{a.role}</td>
                  <td className="mono" style={tightCell}>{a.firstSeen}</td>
                  <td className="mono" style={tightCell}>{a.lastSeen}</td>
                  <td>{dayOfWeek(a.date)}</td>
                  <td>{a.date}</td>
                  <td>
                    <span className={`pill ${status === 'Present' ? 'clear' : 'flag'}`}>{status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}