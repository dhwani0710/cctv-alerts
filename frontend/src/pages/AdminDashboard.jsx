import React from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell.jsx';
import { MOCK_ALERTS, MOCK_RECORDS } from '../data/mockData.js';

export default function AdminDashboard() {
  return (
    <Shell active="dashboard" dark title="Overview">
      <div className="page-head">
        <span className="eyebrow">Admin</span>
        <h1>Good to see you</h1>
        <p>Here's what the store looked like today.</p>
      </div>
      <div className="stat-grid">
        <div className="stat-card good">
          <span className="eyebrow">Cameras live</span>
          <div className="value">5 / 6</div>
          <div className="delta">Stock Room offline since 07:58</div>
        </div>
        <div className="stat-card warn">
          <span className="eyebrow">Active alerts</span>
          <div className="value">2</div>
          <div className="delta">1 high severity, unreviewed</div>
        </div>
        <div className="stat-card">
          <span className="eyebrow">Staff on shift</span>
          <div className="value">2</div>
          <div className="delta">of 3 total employees</div>
        </div>
        <div className="stat-card">
          <span className="eyebrow">Records today</span>
          <div className="value">18</div>
          <div className="delta">entries logged since 00:00</div>
        </div>
      </div>
      <div className="two-col">
        <div className="panel">
          <div className="panel-head">
            <h2>Recent alerts</h2>
            <Link className="link-btn" to="/cameras-alerts">View all →</Link>
          </div>
          {MOCK_ALERTS.slice(0, 3).map((a, i) => (
            <div className="alert-item" key={i}>
              <div className={`alert-sev ${a.sev === 'low' ? 'low' : ''}`} />
              <div className="alert-body">
                <div className="t">{a.title}</div>
                <div className="d">{a.desc}</div>
              </div>
              <div className="alert-time mono">{a.time}</div>
            </div>
          ))}
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Activity log</h2>
            <Link className="link-btn" to="/records">Full records →</Link>
          </div>
          {MOCK_RECORDS.slice(0, 5).map((r, i) => (
            <div className="log-row" key={i}>
              <div className={`log-dot ${r.status === 'flag' ? 'alert' : r.status === 'review' ? 'info' : ''}`} />
              <div className="log-time">{r.time.split(' · ').pop().split(' ').pop()}</div>
              <div className="log-text">{r.event} — {r.camera}</div>
              <div className="log-tag">{r.person === '—' ? 'system' : r.person}</div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
