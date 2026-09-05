import React, { useMemo, useState } from 'react';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { MOCK_ALERTS } from '../data/mockData.js';

export default function Settings() {
  const { session } = useAuth();
  const isAdmin = session.role === 'admin';
  const canSeeThresholds = session.role !== 'employee';

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
        <p>Manage notifications, security, and your account.</p>
      </div>

      <div className="settings-stack">
        {saved && <div className="settings-flash">{saved}</div>}

        {/* ---------------- NOTIFICATIONS ---------------- */}
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

        {/* ---------------- ALERT THRESHOLDS (hidden for employees) ---------------- */}
        {canSeeThresholds && (
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

        {/* ---------------- ACCOUNT ---------------- */}
        <div className="panel settings-panel">
          <div className="panel-head"><h2>Account</h2></div>
          <div className="field"><label>Name</label><input value={session.name} disabled /></div>
          <div className="field" style={{ marginBottom: 0 }}><label>Role</label><input value={session.role} disabled /></div>
        </div>

        {/* ---------------- SYSTEM (admin only) ---------------- */}
        {isAdmin && (
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

            <div className="panel settings-panel settings-danger">
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
    </Shell>
  );
}