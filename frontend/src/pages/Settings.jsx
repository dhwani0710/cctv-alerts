import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { MOCK_ALERTS } from '../data/mockData.js';

function Icon({ path }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
      {path}
    </svg>
  );
}

const TABS = [
  { key: 'notifications', label: 'Notifications', icon: <><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2Z" /><path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16l-2-2Z" /></> },
  { key: 'thresholds', label: 'Alert thresholds', icon: <><path d="M3 12h4l2 6 4-14 2 8h6" /></> },
  { key: 'security', label: 'Security', icon: <><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z" /></> },
  { key: 'account', label: 'Account', icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" /></> },
];

export default function Settings() {
  const { session } = useAuth();
  const isAdmin = session.role === 'admin';
  const tabs = isAdmin ? [...TABS, { key: 'system', label: 'System', icon: <><rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="13.5" width="7" height="7" rx="1" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" /></> }] : TABS;

  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'notifications');

  // ---- Notifications ----
  const [notifyMotion, setNotifyMotion] = useState(true);
  const [notifyPerson, setNotifyPerson] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);

  const motionAlertCount = useMemo(() => MOCK_ALERTS.filter((a) => /motion/i.test(a.title || a.t || '')).length, []);
  const personAlertCount = useMemo(() => MOCK_ALERTS.filter((a) => /face|person|unrecognized/i.test(a.title || a.t || '')).length, []);

  // ---- Alert thresholds ----
  const [sensitivity, setSensitivity] = useState('medium');
  const [afterHoursStart, setAfterHoursStart] = useState('21:00');
  const [afterHoursEnd, setAfterHoursEnd] = useState('08:00');
  const [doorHeldSeconds, setDoorHeldSeconds] = useState(30);

  // ---- Security ----
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [twoFA, setTwoFA] = useState(false);

  // ---- Danger zone ----
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const [saved, setSaved] = useState('');

  function flashSaved(label) {
    setSaved(label);
    setTimeout(() => setSaved(''), 2000);
  }

  function handleSaveNotifications(e) { e.preventDefault(); flashSaved('Notification preferences saved.'); }
  function handleSaveThresholds(e) { e.preventDefault(); flashSaved('Alert thresholds saved.'); }
  function handleChangePassword(e) {
    e.preventDefault();
    if (!currentPw || !newPw || newPw !== confirmPw) {
      flashSaved('Passwords do not match or are incomplete.');
      return;
    }
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
    flashSaved('Password updated.');
  }

  function handleClearRecords() {
    setConfirmingClear(false);
    flashSaved('All records cleared (mock — no data was actually deleted).');
  }

  function handleResetDemo() {
    setConfirmingReset(false);
    flashSaved('Demo data reset (mock — nothing was actually changed).');
  }

  return (
    <Shell active="settings" title="Settings">
      <div className="page-head">
        <h1>Settings</h1>
        <p>Manage notifications, alert behavior, security, and your account.</p>
      </div>

      <div className="settings-layout">
        <nav className="settings-tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`settings-tab ${activeTab === t.key ? 'active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              <Icon path={t.icon} />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {saved && <div className="settings-flash">{saved}</div>}

          {/* ---------------- NOTIFICATIONS ---------------- */}
          {activeTab === 'notifications' && (
            <form onSubmit={handleSaveNotifications} className="panel settings-panel">
              <div className="panel-head"><h2>Notifications</h2></div>

              <label className="settings-toggle-row">
                <div>
                  <div className="settings-toggle-t">Motion alerts</div>
                  <div className="settings-toggle-d">Notify on any motion detected on camera — {motionAlertCount} sent this week</div>
                </div>
                <input type="checkbox" checked={notifyMotion} onChange={(e) => setNotifyMotion(e.target.checked)} />
              </label>

              <label className="settings-toggle-row">
                <div>
                  <div className="settings-toggle-t">Person-detected alerts</div>
                  <div className="settings-toggle-d">Notify when a face is identified or unrecognized — {personAlertCount} sent this week</div>
                </div>
                <input type="checkbox" checked={notifyPerson} onChange={(e) => setNotifyPerson(e.target.checked)} />
              </label>

              <label className="settings-toggle-row" style={{ borderBottom: 'none' }}>
                <div>
                  <div className="settings-toggle-t">Daily email summary</div>
                  <div className="settings-toggle-d">A recap of alerts and activity, once a day</div>
                </div>
                <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} />
              </label>

              <button type="submit" className="btn btn-brass" style={{ marginTop: 18 }}>Save notifications</button>
            </form>
          )}

          {/* ---------------- ALERT THRESHOLDS ---------------- */}
          {activeTab === 'thresholds' && (
            <form onSubmit={handleSaveThresholds} className="panel settings-panel">
              <div className="panel-head"><h2>Alert thresholds</h2></div>
              <p className="settings-note">
                These are the default detection settings applied across cameras. Individual
                cameras can still be overridden from their own Settings.
              </p>

              <div className="field">
                <label>Default motion sensitivity</label>
                <select value={sensitivity} onChange={(e) => setSensitivity(e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="settings-two-field">
                <div className="field">
                  <label>After-hours window start</label>
                  <input type="time" value={afterHoursStart} onChange={(e) => setAfterHoursStart(e.target.value)} />
                </div>
                <div className="field">
                  <label>After-hours window end</label>
                  <input type="time" value={afterHoursEnd} onChange={(e) => setAfterHoursEnd(e.target.value)} />
                </div>
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label>Door-held-open threshold (seconds)</label>
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={doorHeldSeconds}
                  onChange={(e) => setDoorHeldSeconds(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-brass" style={{ marginTop: 18 }}>Save thresholds</button>
            </form>
          )}

          {/* ---------------- SECURITY ---------------- */}
          {activeTab === 'security' && (
            <>
              <form onSubmit={handleChangePassword} className="panel settings-panel">
                <div className="panel-head"><h2>Change password</h2></div>
                <div className="field">
                  <label>Current password</label>
                  <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
                </div>
                <div className="settings-two-field">
                  <div className="field">
                    <label>New password</label>
                    <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Confirm new password</label>
                    <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
                  </div>
                </div>
                <button type="submit" className="btn btn-brass" style={{ marginTop: 4 }}>Update password</button>
              </form>

              <div className="panel settings-panel" style={{ marginTop: 16 }}>
                <div className="panel-head"><h2>Two-factor authentication</h2></div>
                <label className="settings-toggle-row" style={{ borderBottom: 'none' }}>
                  <div>
                    <div className="settings-toggle-t">Require a code at sign-in</div>
                    <div className="settings-toggle-d">Adds a second verification step when signing in — coming soon</div>
                  </div>
                  <input type="checkbox" checked={twoFA} onChange={(e) => setTwoFA(e.target.checked)} disabled />
                </label>
              </div>

              <div className="panel settings-panel" style={{ marginTop: 16 }}>
                <div className="panel-head"><h2>Session</h2></div>
                <div className="settings-session-row">
                  <div>
                    <div className="settings-toggle-t">This device</div>
                    <div className="settings-toggle-d">Signed in as {session.name} ({session.role})</div>
                  </div>
                  <span className="pill clear">Active</span>
                </div>
              </div>
            </>
          )}

          {/* ---------------- ACCOUNT ---------------- */}
          {activeTab === 'account' && (
            <div className="panel settings-panel">
              <div className="panel-head"><h2>Account</h2></div>
              <div className="field"><label>Name</label><input value={session.name} disabled /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>Role</label><input value={session.role} disabled /></div>
            </div>
          )}

          {/* ---------------- SYSTEM (admin only) ---------------- */}
          {activeTab === 'system' && isAdmin && (
            <>
              <div className="panel settings-panel">
                <div className="panel-head">
                  <h2>Integrations</h2>
                  <span className="eyebrow">Admin only</span>
                </div>
                <p className="settings-note">
                  Camera retention, staff access levels, and integration keys will live
                  here once connected to a real backend.
                </p>
                <button type="button" className="btn btn-outline" disabled>Manage integrations — coming soon</button>
              </div>

              <div className="panel settings-panel settings-danger" style={{ marginTop: 16 }}>
                <div className="panel-head">
                  <h2>Danger zone</h2>
                </div>

                <div className="settings-danger-row">
                  <div>
                    <div className="settings-toggle-t">Clear all records</div>
                    <div className="settings-toggle-d">Permanently removes all logged access/alert records</div>
                  </div>
                  {!confirmingClear ? (
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmingClear(true)}>Clear records</button>
                  ) : (
                    <div className="settings-confirm">
                      <span>Are you sure?</span>
                      <button type="button" className="btn btn-danger btn-sm" onClick={handleClearRecords}>Yes, clear</button>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmingClear(false)}>Cancel</button>
                    </div>
                  )}
                </div>

                <div className="settings-danger-row" style={{ borderBottom: 'none' }}>
                  <div>
                    <div className="settings-toggle-t">Reset demo data</div>
                    <div className="settings-toggle-d">Restores cameras, staff, and alerts to their original mock state</div>
                  </div>
                  {!confirmingReset ? (
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmingReset(true)}>Reset data</button>
                  ) : (
                    <div className="settings-confirm">
                      <span>Are you sure?</span>
                      <button type="button" className="btn btn-danger btn-sm" onClick={handleResetDemo}>Yes, reset</button>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmingReset(false)}>Cancel</button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}

