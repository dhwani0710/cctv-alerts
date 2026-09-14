import React, { useEffect, useState } from 'react';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const API_URL = 'http://localhost:8000';

export default function Settings() {
  const { session } = useAuth();
  const token = session?.token;

  // FIXED: your system has no role literally called "admin" —
  // only ceo, owner, hr, guard. Admin-equivalent = ceo or owner.
  const isAdmin = session?.role === 'ceo' || session?.role === 'owner';
  const canSeeThresholds = session?.role !== 'employee';

  const CATEGORIES = [
    { key: 'notifications', label: 'Notifications' },
    ...(canSeeThresholds ? [{ key: 'thresholds', label: 'Alert thresholds' }] : []),
    ...(isAdmin ? [{ key: 'store-hours', label: 'Store hours' }] : []),
    { key: 'security', label: 'Security' },
    { key: 'account', label: 'Account' },
    ...(isAdmin ? [{ key: 'system', label: 'System' }] : []),
  ];

  const [activeCategory, setActiveCategory] = useState('notifications');
  const [search, setSearch] = useState('');

  // Notifications — real toggles, gate which alert categories push to Telegram
  const [notifyMotion, setNotifyMotion] = useState(true);
  const [notifyPerson, setNotifyPerson] = useState(true);

  // Alert thresholds — every field here maps to a setting the backend actually reads
  const [minMatchingPhotos, setMinMatchingPhotos] = useState(2);
  const [matchDistanceThreshold, setMatchDistanceThreshold] = useState('');
  const [overstayLow, setOverstayLow] = useState(30);
  const [overstayMedium, setOverstayMedium] = useState(60);
  const [alertDedupeWindow, setAlertDedupeWindow] = useState(60);
  const [escalationLowToMedium, setEscalationLowToMedium] = useState(1800);
  const [escalationMediumToHigh, setEscalationMediumToHigh] = useState(3600);

  // Store hours — drives is_within_store_hours() in alerts.py (after-hours stranger detection)
  const [storeOpenTime, setStoreOpenTime] = useState('10:00');
  const [storeCloseTime, setStoreCloseTime] = useState('21:00');
  const [savingStoreHours, setSavingStoreHours] = useState(false);
  const [storeHoursLoaded, setStoreHoursLoaded] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [confirmClear, setConfirmClear] = useState(false);
  const [clearingRecords, setClearingRecords] = useState(false);

  const [message, setMessage] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [savingThresholds, setSavingThresholds] = useState(false);

  function showMessage(text) {
    setMessage(text);
    setTimeout(() => setMessage(''), 2500);
  }

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch(`${API_URL}/app-settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `Failed to load settings: ${res.status}`);
        }
        const data = await res.json();

        setNotifyMotion(data.notify_motion === 'true');
        setNotifyPerson(data.notify_person === 'true');

        setMinMatchingPhotos(Number(data.min_matching_photos) || 2);
        setMatchDistanceThreshold(data.match_distance_threshold ?? '');
        setOverstayLow(Number(data.overstay_low_threshold_min) || 30);
        setOverstayMedium(Number(data.overstay_medium_threshold_min) || 60);
        setAlertDedupeWindow(Number(data.alert_dedupe_window_sec) || 60);
        setEscalationLowToMedium(Number(data.escalation_low_to_medium_sec) || 1800);
        setEscalationMediumToHigh(Number(data.escalation_medium_to_high_sec) || 3600);
      } catch (err) {
        console.error('Failed to load settings', err);
        showMessage(err.message || 'Could not load settings from server.');
      } finally {
        setSettingsLoaded(true);
      }
    }

    if (token) {
      loadSettings();
    } else {
      setSettingsLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    async function loadStoreHours() {
      if (!isAdmin || !token) {
        setStoreHoursLoaded(true);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `Failed to load store hours: ${res.status}`);
        }
        const data = await res.json();
        setStoreOpenTime(data.store_open_time ?? '10:00');
        setStoreCloseTime(data.store_close_time ?? '21:00');
      } catch (err) {
        console.error('Failed to load store hours', err);
        showMessage(err.message || 'Could not load store hours from server.');
      } finally {
        setStoreHoursLoaded(true);
      }
    }

    loadStoreHours();
  }, [token, isAdmin]);

  async function saveSetting(key, value) {
    const res = await fetch(`${API_URL}/app-settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ key, value: String(value) }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to save ${key}`);
    }

    return res.json();
  }

  async function saveNotifications(event) {
    event.preventDefault();
    setSavingNotifications(true);
    try {
      await Promise.all([
        saveSetting('notify_motion', notifyMotion),
        saveSetting('notify_person', notifyPerson),
      ]);
      showMessage('Notification preferences saved successfully.');
    } catch (err) {
      console.error(err);
      showMessage(err.message || 'Failed to save notification preferences.');
    } finally {
      setSavingNotifications(false);
    }
  }

  async function saveThresholds(event) {
    event.preventDefault();
    setSavingThresholds(true);
    try {
      await Promise.all([
        saveSetting('min_matching_photos', minMatchingPhotos),
        saveSetting('match_distance_threshold', matchDistanceThreshold),
        saveSetting('overstay_low_threshold_min', overstayLow),
        saveSetting('overstay_medium_threshold_min', overstayMedium),
        saveSetting('alert_dedupe_window_sec', alertDedupeWindow),
        saveSetting('escalation_low_to_medium_sec', escalationLowToMedium),
        saveSetting('escalation_medium_to_high_sec', escalationMediumToHigh),
      ]);
      showMessage('Alert thresholds saved successfully.');
    } catch (err) {
      console.error(err);
      showMessage(err.message || 'Failed to save alert thresholds.');
    } finally {
      setSavingThresholds(false);
    }
  }

  async function saveStoreHours(event) {
    event.preventDefault();
    setSavingStoreHours(true);
    try {
      const body = new FormData();
      body.append('store_open_time', storeOpenTime);
      body.append('store_close_time', storeCloseTime);

      const res = await fetch(`${API_URL}/settings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Failed to save store hours: ${res.status}`);
      }

      showMessage('Store hours saved successfully.');
    } catch (err) {
      console.error(err);
      showMessage(err.message || 'Failed to save store hours.');
    } finally {
      setSavingStoreHours(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      showMessage('Please fill in all password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showMessage('New password and confirmation do not match.');
      return;
    }
    if (newPassword.length < 8) {
      showMessage('New password must be at least 8 characters.');
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to change password');
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showMessage('Password updated successfully.');
    } catch (err) {
      console.error(err);
      showMessage(err.message || 'Failed to change password.');
    } finally {
      setChangingPassword(false);
    }
  }

  async function clearRecords() {
    setClearingRecords(true);
    try {
      const res = await fetch(`${API_URL}/records`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to clear records');
      }

      const data = await res.json();
      setConfirmClear(false);
      showMessage(`Cleared ${data.alerts_deleted} alert(s) and ${data.incidents_deleted} incident(s).`);
    } catch (err) {
      console.error(err);
      showMessage(err.message || 'Failed to clear records.');
    } finally {
      setClearingRecords(false);
    }
  }

  const searchIndex = [
    { category: 'notifications', title: 'Camera alerts', description: 'Notify when a camera is tampered with or goes offline.' },
    { category: 'notifications', title: 'Person alerts', description: 'Notify on unrecognized people, early arrivals, or overstays.' },
    ...(canSeeThresholds
      ? [
          { category: 'thresholds', title: 'Minimum matching photos', description: 'How many photo matches are required to confirm an identity.' },
          { category: 'thresholds', title: 'Match distance threshold', description: 'How close a face match must be to count as a match.' },
          { category: 'thresholds', title: 'Overstay thresholds', description: 'Minutes past shift end before an overstay is flagged low/medium/high.' },
          { category: 'thresholds', title: 'Alert dedupe window', description: 'How long repeated alerts for the same person are grouped into one incident.' },
          { category: 'thresholds', title: 'Escalation thresholds', description: 'How long an unacknowledged incident sits before its priority escalates.' },
        ]
      : []),
    ...(isAdmin
      ? [{ category: 'store-hours', title: 'Store hours', description: 'Configure opening and closing time used for after-hours detection.' }]
      : []),
    { category: 'security', title: 'Change password', description: 'Change your account password.' },
    { category: 'account', title: 'Name', description: 'View your account name.' },
    { category: 'account', title: 'Role', description: 'View your assigned system role.' },
    ...(isAdmin
      ? [{ category: 'system', title: 'Clear all records', description: 'Remove all logged alerts and incidents.' }]
      : []),
  ];

  const searchResults = search.trim()
    ? searchIndex.filter((item) =>
        (item.title + ' ' + item.description).toLowerCase().includes(search.trim().toLowerCase())
      )
    : [];

  function openSearchResult(category) {
    setActiveCategory(category);
    setSearch('');
  }

  const currentCategory = CATEGORIES.find((category) => category.key === activeCategory);

  return (
    <Shell active="settings" title="Settings">
      <div className="vscode-settings">
        <div className="vscode-settings-topbar">
          <div className="vscode-search">
            <span className="vscode-search-icon">⌕</span>
            <input
              type="text"
              value={search}
              placeholder="Search settings"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="vscode-topbar-space" />
        </div>

        {search.trim() ? (
          <div className="vscode-search-results">
            {searchResults.length === 0 && (
              <div className="vscode-no-results">No settings found for "{search}"</div>
            )}
            {searchResults.map((result, index) => (
              <button
                key={`${result.category}-${index}`}
                type="button"
                className="vscode-search-result"
                onClick={() => openSearchResult(result.category)}
              >
                <div>
                  <span>{result.title}</span>
                  <div style={{ marginTop: '4px', color: '#858b95', fontSize: '11px' }}>
                    {result.description}
                  </div>
                </div>
                <small>{CATEGORIES.find((category) => category.key === result.category)?.label}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className="vscode-settings-body">
            <aside className="vscode-settings-sidebar">
              <div className="vscode-sidebar-title">Settings</div>
              {CATEGORIES.map((category) => (
                <button
                  key={category.key}
                  type="button"
                  className={activeCategory === category.key ? 'active' : ''}
                  onClick={() => setActiveCategory(category.key)}
                >
                  {category.label}
                </button>
              ))}
            </aside>

            <main className="vscode-settings-content">
              {message && <div className="vscode-saved">{message}</div>}
              <h1>{currentCategory?.label}</h1>
              {!settingsLoaded && <p className="vscode-description">Loading settings…</p>}

              {activeCategory === 'notifications' && (
                <form onSubmit={saveNotifications}>
                  <div className="vscode-setting-row">
                    <div>
                      <h3>Camera alerts</h3>
                      <p>Notify when a camera is tampered with, obstructed, or goes offline.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifyMotion}
                      onChange={(event) => setNotifyMotion(event.target.checked)}
                    />
                  </div>

                  <div className="vscode-setting-row">
                    <div>
                      <h3>Person alerts</h3>
                      <p>Notify on unrecognized people, early arrivals, and overstays.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifyPerson}
                      onChange={(event) => setNotifyPerson(event.target.checked)}
                    />
                  </div>

                  <br />

                  <button type="submit" className="vscode-primary-btn" disabled={savingNotifications}>
                    {savingNotifications ? 'Saving…' : 'Save notifications'}
                  </button>
                </form>
              )}

              {activeCategory === 'thresholds' && canSeeThresholds && (
                <form onSubmit={saveThresholds}>
                  <p className="vscode-description">
                    These control the actual face-recognition matching, overstay severity,
                    incident deduplication, and escalation timing used by the backend.
                  </p>

                  <div className="vscode-two-fields">
                    <div className="vscode-field">
                      <label>Minimum matching photos</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={minMatchingPhotos}
                        onChange={(event) => setMinMatchingPhotos(event.target.value)}
                      />
                    </div>
                    <div className="vscode-field">
                      <label>Match distance threshold (blank = default)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="e.g. 0.4"
                        value={matchDistanceThreshold}
                        onChange={(event) => setMatchDistanceThreshold(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="vscode-two-fields">
                    <div className="vscode-field">
                      <label>Overstay — low threshold (minutes)</label>
                      <input
                        type="number"
                        min="0"
                        value={overstayLow}
                        onChange={(event) => setOverstayLow(event.target.value)}
                      />
                    </div>
                    <div className="vscode-field">
                      <label>Overstay — medium threshold (minutes)</label>
                      <input
                        type="number"
                        min="0"
                        value={overstayMedium}
                        onChange={(event) => setOverstayMedium(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="vscode-field">
                    <label>Alert dedupe window (seconds)</label>
                    <input
                      type="number"
                      min="0"
                      value={alertDedupeWindow}
                      onChange={(event) => setAlertDedupeWindow(event.target.value)}
                    />
                  </div>

                  <div className="vscode-two-fields">
                    <div className="vscode-field">
                      <label>Escalate low → medium after (seconds)</label>
                      <input
                        type="number"
                        min="0"
                        value={escalationLowToMedium}
                        onChange={(event) => setEscalationLowToMedium(event.target.value)}
                      />
                    </div>
                    <div className="vscode-field">
                      <label>Escalate medium → high after (seconds)</label>
                      <input
                        type="number"
                        min="0"
                        value={escalationMediumToHigh}
                        onChange={(event) => setEscalationMediumToHigh(event.target.value)}
                      />
                    </div>
                  </div>

                  <button type="submit" className="vscode-primary-btn" disabled={savingThresholds}>
                    {savingThresholds ? 'Saving…' : 'Save thresholds'}
                  </button>
                </form>
              )}

              {activeCategory === 'store-hours' && isAdmin && (
                <form onSubmit={saveStoreHours}>
                  <p className="vscode-description">
                    Used to determine after-hours detection — an unrecognized person seen
                    outside these hours triggers a high-priority stranger alert.
                  </p>
                  {!storeHoursLoaded && <p className="vscode-description">Loading store hours…</p>}

                  <div className="vscode-two-fields">
                    <div className="vscode-field">
                      <label>Store opens</label>
                      <input
                        type="time"
                        value={storeOpenTime}
                        onChange={(event) => setStoreOpenTime(event.target.value)}
                      />
                    </div>
                    <div className="vscode-field">
                      <label>Store closes</label>
                      <input
                        type="time"
                        value={storeCloseTime}
                        onChange={(event) => setStoreCloseTime(event.target.value)}
                      />
                    </div>
                  </div>

                  <button type="submit" className="vscode-primary-btn" disabled={savingStoreHours}>
                    {savingStoreHours ? 'Saving…' : 'Save store hours'}
                  </button>
                </form>
              )}

              {activeCategory === 'security' && (
                <form onSubmit={changePassword}>
                  <div className="vscode-field">
                    <label>Current password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                    />
                  </div>

                  <div className="vscode-two-fields">
                    <div className="vscode-field">
                      <label>New password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                      />
                    </div>
                    <div className="vscode-field">
                      <label>Confirm new password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                      />
                    </div>
                  </div>

                  <button type="submit" className="vscode-primary-btn" disabled={changingPassword}>
                    {changingPassword ? 'Updating…' : 'Update password'}
                  </button>
                </form>
              )}

              {activeCategory === 'account' && (
                <div>
                  <div className="vscode-field">
                    <label>Name</label>
                    <input value={session?.name || ''} disabled />
                  </div>
                  <div className="vscode-field">
                    <label>Role</label>
                    <input value={session?.role || ''} disabled />
                  </div>
                </div>
              )}

              {activeCategory === 'system' && isAdmin && (
                <div>
                  <section className="vscode-danger-section">
                    <h2>Danger zone</h2>

                    <div className="vscode-danger-row">
                      <div>
                        <h3>Clear all records</h3>
                        <p>Permanently deletes every logged alert and incident from the database.</p>
                      </div>
                      {!confirmClear ? (
                        <button type="button" className="vscode-danger-btn" onClick={() => setConfirmClear(true)}>
                          Clear records
                        </button>
                      ) : (
                        <div className="vscode-confirm">
                          <span>Are you sure?</span>
                          <button
                            type="button"
                            className="vscode-danger-btn"
                            onClick={clearRecords}
                            disabled={clearingRecords}
                          >
                            {clearingRecords ? 'Clearing…' : 'Yes, clear'}
                          </button>
                          <button type="button" className="vscode-outline-btn" onClick={() => setConfirmClear(false)}>
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )}
            </main>
          </div>
        )}
      </div>
    </Shell>
  );
}