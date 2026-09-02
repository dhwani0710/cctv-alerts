import React from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell.jsx';
import { MOCK_ALERTS, MOCK_RECORDS } from '../data/mockData.js';

const DUPLICATE_EVENTS = ['Face flagged', 'Camera offline', 'After-hours motion'];
const activityRecords = MOCK_RECORDS.filter((r) => !DUPLICATE_EVENTS.includes(r.event));

export default function EmployeeDashboard() {
  return (
    <Shell active="dashboard" dark title="Overview">
      <div className="page-head">
        <span className="eyebrow">Staff</span>
        <h1>Welcome back</h1>
        <p>Your shift overview and the store's current status.</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="eyebrow">Your shift</span>
          <div className="value">9–17</div>
          <div className="delta">Clocked in at 09:15</div>
        </div>
        <div className="stat-card good">
          <span className="eyebrow">Cameras live</span>
          <div className="value">5 / 6</div>
          <div className="delta">Stock Room offline since 07:58</div>
        </div>
        <div className="stat-card warn">
          <span className="eyebrow">Active alerts</span>
          <div className="value">2</div>
          <div className="delta">Visible on Cameras & Alerts</div>
        </div>
      </div>

      <div className="alerts-activity-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>Recent alerts</h2>
            <Link className="link-btn" to="/cameras-alerts">View all →</Link>
          </div>
          {MOCK_ALERTS.map((a, i) => (
            <div className="log-row" key={i}>
              <div className={`log-dot ${a.sev === 'high' ? 'alert' : 'info'}`} />
              <div className="log-time">{a.time}</div>
              <div className="log-text">{a.title}</div>
              <div className="log-tag">{a.sev === 'high' ? 'High' : 'Low'}</div>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Activity log</h2>
            <Link className="link-btn" to="/records">Full records →</Link>
          </div>
          {activityRecords.map((r, i) => (
            <div className="log-row" key={i}>
              <div className={`log-dot ${r.status === 'flag' ? 'alert' : r.status === 'review' ? 'info' : ''}`} />
              <div className="log-time">{r.time}</div>
              <div className="log-text">{r.event} — {r.camera}</div>
              <div className="log-tag">{r.person}</div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}