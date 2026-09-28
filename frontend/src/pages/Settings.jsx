import React, { useEffect, useState } from 'react';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const API_URL = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

const DEFAULT_NOTIFICATIONS = { notifyMotion: true, notifyPerson: true };

const DEFAULT_THRESHOLDS = {
  minMatchingPhotos: 2,
  matchDistanceThreshold: '',
  overstayLow: 30,
  overstayMedium: 60,
  alertDedupeWindow: 60,
  escalationLowToMedium: 1800,
  escalationMediumToHigh: 3600,
};

const DEFAULT_STORE_HOURS = { storeOpenTime: '10:00', storeCloseTime: '21:00' };

const thresholdPairs = (t) => [
  ['min_matching_photos', t.minMatchingPhotos],
  ['match_distance_threshold', t.matchDistanceThreshold],
  ['overstay_low_threshold_min', t.overstayLow],
  ['overstay_medium_threshold_min', t.overstayMedium],
  ['alert_dedupe_window_sec', t.alertDedupeWindow],
  ['escalation_low_to_medium_sec', t.escalationLowToMedium],
  ['escalation_medium_to_high_sec', t.escalationMediumToHigh],
];

export default function Settings() {
  const { session, updateSession } = useAuth();
  const token = session?.token;

  const isAdmin = session?.role === 'ceo' || session?.role === 'owner';
  const isHRorGuard = session?.role === 'hr' || session?.role === 'guard';
  const canSeeThresholds = session?.role !== 'employee' && !isHRorGuard;

  const CATEGORIES = isHRorGuard
    ? [
        { key: 'security', label: 'Security' },
        { key: 'account', label: 'Account' },
      ]
    : [
        { key: 'notifications', label: 'Notifications' },
        ...(canSeeThresholds ? [{ key: 'thresholds', label: 'Alert thresholds' }] : []),
        ...(isAdmin ? [{ key: 'store-hours', label: 'Store hours' }] : []),
        { key: 'security', label: 'Security' },
        { key: 'account', label: 'Account' },
        ...(isAdmin ? [{ key: 'system', label: 'System' }] : []),
      ];

  const [activeCategory, setActiveCategory] = useState(isHRorGuard ? 'security' : 'notifications');
  const [search, setSearch] = useState('');

  // Notifications
  const [notifyMotion, setNotifyMotion] = useState(true);
  const [notifyPerson, setNotifyPerson] = useState(true);

  // Alert thresholds
  const [minMatchingPhotos, setMinMatchingPhotos] = useState(2);
  const [matchDistanceThreshold, setMatchDistanceThreshold] = useState('');
  const [overstayLow, setOverstayLow] = useState(30);
  const [overstayMedium, setOverstayMedium] = useState(60);
  const [alertDedupeWindow, setAlertDedupeWindow] = useState(60);
  const [escalationLowToMedium, setEscalationLowToMedium] = useState(1800);
  const [escalationMediumToHigh, setEscalationMediumToHigh] = useState(3600);

  // Store hours
  const [storeOpenTime, setStoreOpenTime] = useState('10:00');
  const [storeCloseTime, setStoreCloseTime] = useState('21:00');
  const [storeHoursLoaded, setStoreHoursLoaded] = useState(false);
  const [storeHoursError, setStoreHoursError] = useState(false);
  const [storeHoursRetryCount, setStoreHoursRetryCount] = useState(0);

  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Clear records
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearingRecords, setClearingRecords] = useState(false);

  // Account
  const [accountName, setAccountName] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);

  useEffect(() => {
    if (session?.username) setAccountName(session.username);
  }, [session?.username]);

  // Messages and loading
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsError, setSettingsError] = useState(false);
  const [settingsRetryCount, setSettingsRetryCount] = useState(0);

  // Reset confirmations
  const [confirmResetNotifications, setConfirmResetNotifications] = useState(false);
  const [confirmResetThresholds, setConfirmResetThresholds] = useState(false);
  const [confirmResetStoreHours, setConfirmResetStoreHours] = useState(false);

  // Lock forms while loading or after a failed load
  const settingsLocked = !settingsLoaded || settingsError;
  const storeHoursLocked = !storeHoursLoaded || storeHoursError;

  function showMessage(text, isError = false) {
    setMessage(text);
    setMessageIsError(isError);
    setTimeout(() => setMessage(''), 2500);
  }

  // ---------- LOAD APP SETTINGS ----------
  useEffect(() => {
    async function loadSettings() {
      if (isHRorGuard) {
        setSettingsLoaded(true);
        return;
      }

      setSettingsLoaded(false);
      setSettingsError(false);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await fetch(`${API_URL}/app-settings`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
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
        showMessage(
          err.name === 'AbortError'
            ? 'Loading settings timed out.'
            : err.message || 'Could not load settings from server.',
          true
        );
        setSettingsError(true);
      } finally {
        clearTimeout(timeoutId);
        setSettingsLoaded(true);
      }
    }

    if (token) {
      loadSettings();
    } else {
      setSettingsLoaded(true);
    }
  }, [token, settingsRetryCount]);

  // ---------- LOAD STORE HOURS ----------
  useEffect(() => {
    async function loadStoreHours() {
      if (!isAdmin || !token) {
        setStoreHoursLoaded(true);
        return;
      }

      setStoreHoursLoaded(false);
      setStoreHoursError(false);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await fetch(`${API_URL}/settings`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
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
        showMessage(
          err.name === 'AbortError'
            ? 'Loading store hours timed out.'
            : err.message || 'Could not load store hours from server.',
          true
        );
        setStoreHoursError(true);
      } finally {
        clearTimeout(timeoutId);
        setStoreHoursLoaded(true);
      }
    }

    loadStoreHours();
  }, [token, isAdmin, storeHoursRetryCount]);

  // ---------- API HELPERS ----------
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

  async function postStoreHours(open, close) {
    const body = new FormData();
    body.append('store_open_time', open);
    body.append('store_close_time', close);

    const res = await fetch(`${API_URL}/settings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to save store hours: ${res.status}`);
    }
  }

  // Shows success only after the server confirms the save
  function runSave(promise, successText, failText) {
    promise
      .then(() => showMessage(successText))
      .catch((err) => {
        console.error(err);
        showMessage(err.message || failText, true);
      });
  }

  // ---------- RESET ----------
  function resetNotifications() {
    setNotifyMotion(DEFAULT_NOTIFICATIONS.notifyMotion);
    setNotifyPerson(DEFAULT_NOTIFICATIONS.notifyPerson);
    setConfirmResetNotifications(false);

    runSave(
      Promise.all([
        saveSetting('notify_motion', DEFAULT_NOTIFICATIONS.notifyMotion),
        saveSetting('notify_person', DEFAULT_NOTIFICATIONS.notifyPerson),
      ]),
      'Notifications reset to default.',
      'Failed to reset notifications.'
    );
  }

  function resetThresholds() {
    setMinMatchingPhotos(DEFAULT_THRESHOLDS.minMatchingPhotos);
    setMatchDistanceThreshold(DEFAULT_THRESHOLDS.matchDistanceThreshold);
    setOverstayLow(DEFAULT_THRESHOLDS.overstayLow);
    setOverstayMedium(DEFAULT_THRESHOLDS.overstayMedium);
    setAlertDedupeWindow(DEFAULT_THRESHOLDS.alertDedupeWindow);
    setEscalationLowToMedium(DEFAULT_THRESHOLDS.escalationLowToMedium);
    setEscalationMediumToHigh(DEFAULT_THRESHOLDS.escalationMediumToHigh);
    setConfirmResetThresholds(false);

    runSave(
      Promise.all(thresholdPairs(DEFAULT_THRESHOLDS).map(([k, v]) => saveSetting(k, v))),
      'Alert thresholds reset to default.',
      'Failed to reset thresholds.'
    );
  }

  function resetStoreHours() {
    setStoreOpenTime(DEFAULT_STORE_HOURS.storeOpenTime);
    setStoreCloseTime(DEFAULT_STORE_HOURS.storeCloseTime);
    setConfirmResetStoreHours(false);

    runSave(
      postStoreHours(DEFAULT_STORE_HOURS.storeOpenTime, DEFAULT_STORE_HOURS.storeCloseTime),
      'Store hours reset to default.',
      'Failed to reset store hours.'
    );
  }

  // ---------- SAVE ----------
  function saveNotifications(event) {
    event.preventDefault();

    runSave(
      Promise.all([
        saveSetting('notify_motion', notifyMotion),
        saveSetting('notify_person', notifyPerson),
      ]),
      'Notification preferences saved successfully.',
      'Failed to save notification preferences.'
    );
  }

  function saveThresholds(event) {
    event.preventDefault();

    runSave(
      Promise.all(
        thresholdPairs({
          minMatchingPhotos,
          matchDistanceThreshold,
          overstayLow,
          overstayMedium,
          alertDedupeWindow,
          escalationLowToMedium,
          escalationMediumToHigh,
        }).map(([k, v]) => saveSetting(k, v))
      ),
      'Alert thresholds saved successfully.',
      'Failed to save alert thresholds.'
    );
  }

  function saveStoreHours(event) {
    event.preventDefault();

    runSave(
      postStoreHours(storeOpenTime, storeCloseTime),
      'Store hours saved successfully.',
      'Failed to save store hours.'
    );
  }

  // ---------- PASSWORD / ACCOUNT / CLEAR RECORDS ----------
  async function changePassword(event) {
    event.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      showMessage('Please fill in all password fields.', true);
      return;
    }
    if (newPassword !== confirmPassword) {
      showMessage('New password and confirmation do not match.', true);
      return;
    }
    if (newPassword.length < 8) {
      showMessage('New password must be at least 8 characters.', true);
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
      showMessage(err.message || 'Failed to change password.', true);
    } finally {
      setChangingPassword(false);
    }
  }

  async function saveAccount(event) {
    event.preventDefault();

    if (!accountName.trim()) {
      showMessage('Name cannot be empty.', true);
      return;
    }

    setSavingAccount(true);

    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: accountName.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to update account');
      }

      const data = await res.json();
      updateSession({ username: data.username, token: data.token });
      showMessage('Account updated successfully.');
    } catch (err) {
      console.error(err);
      showMessage(err.message || 'Failed to update account.', true);
    } finally {
      setSavingAccount(false);
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
      showMessage(err.message || 'Failed to clear records.', true);
    } finally {
      setClearingRecords(false);
    }
  }

  // ---------- SEARCH ----------
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

  // ---------- UI ----------
  return (
    <Shell active="settings" title="Settings">
      <div className="vscode-settings">
        {/* TOP BAR */}
        <div className="vscode-settings-topbar">
          <div className="vscode-search">
            <span className="vscode-search-icon">⌕</span>
            <input
              type="text"
              value={search}
              placeholder="Search settings"
              aria-label="Search settings"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="vscode-topbar-space" />
        </div>

        {/* SEARCH RESULTS */}
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
                <small>{CATEGORIES.find((c) => c.key === result.category)?.label}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className="vscode-settings-body">
            {/* SIDEBAR */}
            <aside className="vscode-settings-sidebar">
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

            {/* CONTENT */}
            <main className="vscode-settings-content">
              {message && (
                <div role="status" className={`vscode-saved${messageIsError ? ' is-error' : ''}`}>
                  {message}
                </div>
              )}

              <h1>{currentCategory?.label}</h1>

              {(activeCategory === 'notifications' || activeCategory === 'thresholds') && (
                <>
                  {!settingsLoaded && (
                    <p className="vscode-description">
                      <span className="spinner" />
                      Loading settings…
                    </p>
                  )}

                  {settingsError && settingsLoaded && (
                    <div className="banner banner-error" role="alert">
                      <span>Couldn't load settings. Check that the backend is running, then retry.</span>
                      <button type="button" onClick={() => setSettingsRetryCount((n) => n + 1)}>
                        Retry
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* NOTIFICATIONS */}
              {activeCategory === 'notifications' && (
                <form onSubmit={saveNotifications}>
                  <div className="vscode-setting-row">
                    <div>
                      <h3>Camera alerts</h3>
                      <p>Notify when a camera is tampered with, obstructed, or goes offline.</p>
                    </div>
                    <input
                      type="checkbox"
                      aria-label="Camera alerts"
                      checked={notifyMotion}
                      disabled={settingsLocked}
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
                      aria-label="Person alerts"
                      checked={notifyPerson}
                      disabled={settingsLocked}
                      onChange={(event) => setNotifyPerson(event.target.checked)}
                    />
                  </div>

                  <div className="vscode-form-actions">
                    {!confirmResetNotifications ? (
                      <button
                        type="button"
                        className="vscode-outline-btn"
                        disabled={settingsLocked}
                        onClick={() => setConfirmResetNotifications(true)}
                      >
                        Reset to default
                      </button>
                    ) : (
                      <div className="vscode-confirm-group">
                        <span className="vscode-confirm-text">Reset notifications to default?</span>
                        <button type="button" className="vscode-danger-btn" onClick={resetNotifications}>
                          Yes, reset
                        </button>
                        <button
                          type="button"
                          className="vscode-outline-btn"
                          onClick={() => setConfirmResetNotifications(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    <button type="submit" className="vscode-primary-btn" disabled={settingsLocked}>
                      Save notifications
                    </button>
                  </div>
                </form>
              )}

              {/* ALERT THRESHOLDS */}
              {activeCategory === 'thresholds' && canSeeThresholds && (
                <form onSubmit={saveThresholds}>
                  <p className="vscode-description">
                    These control the actual face-recognition matching, overstay severity, incident
                    deduplication, and escalation timing used by the backend.
                  </p>

                  <div className="vscode-two-fields">
                    <div className="vscode-field">
                      <label>Minimum matching photos</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={minMatchingPhotos}
                        disabled={settingsLocked}
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
                        disabled={settingsLocked}
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
                        disabled={settingsLocked}
                        onChange={(event) => setOverstayLow(event.target.value)}
                      />
                    </div>

                    <div className="vscode-field">
                      <label>Overstay — medium threshold (minutes)</label>
                      <input
                        type="number"
                        min="0"
                        value={overstayMedium}
                        disabled={settingsLocked}
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
                      disabled={settingsLocked}
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
                        disabled={settingsLocked}
                        onChange={(event) => setEscalationLowToMedium(event.target.value)}
                      />
                    </div>

                    <div className="vscode-field">
                      <label>Escalate medium → high after (seconds)</label>
                      <input
                        type="number"
                        min="0"
                        value={escalationMediumToHigh}
                        disabled={settingsLocked}
                        onChange={(event) => setEscalationMediumToHigh(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="vscode-form-actions">
                    {!confirmResetThresholds ? (
                      <button
                        type="button"
                        className="vscode-outline-btn"
                        disabled={settingsLocked}
                        onClick={() => setConfirmResetThresholds(true)}
                      >
                        Reset to default
                      </button>
                    ) : (
                      <div className="vscode-confirm-group">
                        <span className="vscode-confirm-text">Reset thresholds to default?</span>
                        <button type="button" className="vscode-danger-btn" onClick={resetThresholds}>
                          Yes, reset
                        </button>
                        <button
                          type="button"
                          className="vscode-outline-btn"
                          onClick={() => setConfirmResetThresholds(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    <button type="submit" className="vscode-primary-btn" disabled={settingsLocked}>
                      Save thresholds
                    </button>
                  </div>
                </form>
              )}

              {/* STORE HOURS */}
              {activeCategory === 'store-hours' && isAdmin && (
                <form onSubmit={saveStoreHours}>
                  <p className="vscode-description">
                    Used to determine after-hours detection — an unrecognized person seen outside these
                    hours triggers a high-priority stranger alert.
                  </p>

                  {!storeHoursLoaded && (
                    <p className="vscode-description">
                      <span className="spinner" />
                      Loading store hours…
                    </p>
                  )}

                  {storeHoursError && storeHoursLoaded && (
                    <div className="banner banner-error" role="alert">
                      <span>Couldn't load store hours.</span>
                      <button type="button" onClick={() => setStoreHoursRetryCount((n) => n + 1)}>
                        Retry
                      </button>
                    </div>
                  )}

                  <div className="vscode-two-fields">
                    <div className="vscode-field">
                      <label>Store opens</label>
                      <input
                        type="time"
                        value={storeOpenTime}
                        disabled={storeHoursLocked}
                        onChange={(event) => setStoreOpenTime(event.target.value)}
                      />
                    </div>

                    <div className="vscode-field">
                      <label>Store closes</label>
                      <input
                        type="time"
                        value={storeCloseTime}
                        disabled={storeHoursLocked}
                        onChange={(event) => setStoreCloseTime(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="vscode-form-actions">
                    {!confirmResetStoreHours ? (
                      <button
                        type="button"
                        className="vscode-outline-btn"
                        disabled={storeHoursLocked}
                        onClick={() => setConfirmResetStoreHours(true)}
                      >
                        Reset to default
                      </button>
                    ) : (
                      <div className="vscode-confirm-group">
                        <span className="vscode-confirm-text">Reset store hours to default?</span>
                        <button type="button" className="vscode-danger-btn" onClick={resetStoreHours}>
                          Yes, reset
                        </button>
                        <button
                          type="button"
                          className="vscode-outline-btn"
                          onClick={() => setConfirmResetStoreHours(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    <button type="submit" className="vscode-primary-btn" disabled={storeHoursLocked}>
                      Save store hours
                    </button>
                  </div>
                </form>
              )}

              {/* SECURITY */}
              {activeCategory === 'security' && (
                <form onSubmit={changePassword}>
                  <div className="vscode-field">
                    <label>Current password</label>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                    />
                  </div>

                  <div className="vscode-two-fields">
                    <div className="vscode-field">
                      <label>New password</label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                      />
                    </div>

                    <div className="vscode-field">
                      <label>Confirm new password</label>
                      <input
                        type="password"
                        autoComplete="new-password"
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

              {/* ACCOUNT */}
              {activeCategory === 'account' && (
                <form onSubmit={saveAccount}>
                  <div className="vscode-field">
                    <label>Name</label>
                    <input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
                  </div>

                  <div className="vscode-field">
                    <label>Role</label>
                    <input value={session?.role || ''} disabled />
                  </div>

                  <button type="submit" className="vscode-primary-btn" disabled={savingAccount}>
                    {savingAccount ? 'Saving…' : 'Save changes'}
                  </button>
                </form>
              )}

              {/* SYSTEM */}
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
                        <button
                          type="button"
                          className="vscode-danger-btn"
                          onClick={() => setConfirmClear(true)}
                        >
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
                          <button
                            type="button"
                            className="vscode-outline-btn"
                            onClick={() => setConfirmClear(false)}
                          >
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