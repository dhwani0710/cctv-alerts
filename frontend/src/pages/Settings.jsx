import React, { useMemo, useState } from 'react';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { MOCK_ALERTS } from '../data/mockData.js';

export default function Settings() {
  const { session } = useAuth();

  const isAdmin = session?.role === 'admin';
  const canSeeThresholds = session?.role !== 'employee';

  /* =====================================================
     SETTINGS CATEGORIES
     ===================================================== */

  const CATEGORIES = [
    {
      key: 'notifications',
      label: 'Notifications',
    },

    ...(canSeeThresholds
      ? [
          {
            key: 'thresholds',
            label: 'Alert thresholds',
          },
        ]
      : []),

    {
      key: 'security',
      label: 'Security',
    },

    {
      key: 'account',
      label: 'Account',
    },

    ...(isAdmin
      ? [
          {
            key: 'system',
            label: 'System',
          },
        ]
      : []),
  ];

  /* =====================================================
     STATE
     ===================================================== */

  const [activeCategory, setActiveCategory] =
    useState('notifications');

  const [search, setSearch] = useState('');

  /* Notifications */
  const [notifyMotion, setNotifyMotion] = useState(true);
  const [notifyPerson, setNotifyPerson] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);

  /* Alert thresholds */
  const [sensitivity, setSensitivity] =
    useState('medium');

  const [afterHoursStart, setAfterHoursStart] =
    useState('21:00');

  const [afterHoursEnd, setAfterHoursEnd] =
    useState('08:00');

  const [doorHeldSeconds, setDoorHeldSeconds] =
    useState(30);

  /* Security */
  const [currentPassword, setCurrentPassword] =
    useState('');

  const [newPassword, setNewPassword] =
    useState('');

  const [confirmPassword, setConfirmPassword] =
    useState('');

  /* System */
  const [confirmClear, setConfirmClear] =
    useState(false);

  const [confirmReset, setConfirmReset] =
    useState(false);

  /* Message */
  const [message, setMessage] = useState('');

  /* =====================================================
     ALERT COUNTS
     ===================================================== */

  const motionAlertCount = useMemo(() => {
    return MOCK_ALERTS.filter((alert) =>
      /motion/i.test(
        alert.title ||
        alert.t ||
        alert.type ||
        ''
      )
    ).length;
  }, []);

  const personAlertCount = useMemo(() => {
    return MOCK_ALERTS.filter((alert) =>
      /face|person|unrecognized/i.test(
        alert.title ||
        alert.t ||
        alert.type ||
        ''
      )
    ).length;
  }, []);

  /* =====================================================
     MESSAGE
     ===================================================== */

  function showMessage(text) {
    setMessage(text);

    setTimeout(() => {
      setMessage('');
    }, 2500);
  }

  /* =====================================================
     SAVE NOTIFICATIONS
     ===================================================== */

  function saveNotifications(event) {
    event.preventDefault();

    showMessage(
      'Notification preferences saved successfully.'
    );
  }

  /* =====================================================
     SAVE THRESHOLDS
     ===================================================== */

  function saveThresholds(event) {
    event.preventDefault();

    showMessage(
      'Alert thresholds saved successfully.'
    );
  }

  /* =====================================================
     CHANGE PASSWORD
     ===================================================== */

  function changePassword(event) {
    event.preventDefault();

    if (
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      showMessage(
        'Please fill in all password fields.'
      );

      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage(
        'New password and confirmation do not match.'
      );

      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');

    showMessage(
      'Password updated successfully.'
    );
  }

  /* =====================================================
     CLEAR RECORDS
     ===================================================== */

  function clearRecords() {
    setConfirmClear(false);

    showMessage(
      'All records cleared (mock).'
    );
  }

  /* =====================================================
     RESET DEMO
     ===================================================== */

  function resetDemoData() {
    setConfirmReset(false);

    showMessage(
      'Demo data reset successfully (mock).'
    );
  }

  /* =====================================================
     SEARCH INDEX
     ===================================================== */

  const searchIndex = [
    {
      category: 'notifications',
      title: 'Motion alerts',
      description:
        'Notifications for motion detected on cameras.',
    },

    {
      category: 'notifications',
      title: 'Person-detected alerts',
      description:
        'Notifications when a person or face is detected.',
    },

    {
      category: 'notifications',
      title: 'Daily email summary',
      description:
        'Receive a daily summary of alerts and activity.',
    },

    ...(canSeeThresholds
      ? [
          {
            category: 'thresholds',
            title: 'Default motion sensitivity',
            description:
              'Default sensitivity used for motion detection.',
          },

          {
            category: 'thresholds',
            title: 'After-hours window',
            description:
              'Configure the after-hours monitoring period.',
          },

          {
            category: 'thresholds',
            title: 'Door-held-open threshold',
            description:
              'Configure how long a door can remain open.',
          },
        ]
      : []),

    {
      category: 'security',
      title: 'Change password',
      description:
        'Change your account password.',
    },

    {
      category: 'account',
      title: 'Name',
      description:
        'View your account name.',
    },

    {
      category: 'account',
      title: 'Role',
      description:
        'View your assigned system role.',
    },

    ...(isAdmin
      ? [
          {
            category: 'system',
            title: 'Integrations',
            description:
              'Manage system integrations.',
          },

          {
            category: 'system',
            title: 'Clear all records',
            description:
              'Remove all access and alert records.',
          },

          {
            category: 'system',
            title: 'Reset demo data',
            description:
              'Restore the original mock data.',
          },
        ]
      : []),
  ];

  /* =====================================================
     SEARCH RESULTS
     ===================================================== */

  const searchResults = search.trim()
    ? searchIndex.filter((item) =>
        (
          item.title +
          ' ' +
          item.description
        )
          .toLowerCase()
          .includes(
            search.trim().toLowerCase()
          )
      )
    : [];

  function openSearchResult(category) {
    setActiveCategory(category);
    setSearch('');
  }

  /* =====================================================
     CURRENT CATEGORY TITLE
     ===================================================== */

  const currentCategory =
    CATEGORIES.find(
      (category) =>
        category.key === activeCategory
    );

  /* =====================================================
     UI
     ===================================================== */

  return (
    <Shell
      active="settings"
      title="Settings"
    >
      <div className="vscode-settings">

        {/* =================================================
            TOP BAR
            ================================================= */}

        <div className="vscode-settings-topbar">

          {/* Search */}
          <div className="vscode-search">

            <span className="vscode-search-icon">
              ⌕
            </span>

            <input
              type="text"
              value={search}
              placeholder="Search settings"
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />

          </div>

          <div className="vscode-topbar-space" />

          {/* Backup button */}
          <button
            type="button"
            className="vscode-backup-btn"
            onClick={() =>
              showMessage(
                'Settings backed up successfully (mock).'
              )
            }
          >
            Backup and Sync Settings
          </button>

        </div>


        {/* =================================================
            SEARCH RESULTS
            ================================================= */}

        {search.trim() ? (

          <div className="vscode-search-results">

            {searchResults.length === 0 && (
              <div className="vscode-no-results">
                No settings found for "{search}"
              </div>
            )}

            {searchResults.map(
              (result, index) => (
                <button
                  key={`${result.category}-${index}`}
                  type="button"
                  className="vscode-search-result"
                  onClick={() =>
                    openSearchResult(
                      result.category
                    )
                  }
                >

                  <div>
                    <span>
                      {result.title}
                    </span>

                    <div
                      style={{
                        marginTop: '4px',
                        color: '#858b95',
                        fontSize: '11px',
                      }}
                    >
                      {result.description}
                    </div>
                  </div>

                  <small>
                    {
                      CATEGORIES.find(
                        (category) =>
                          category.key ===
                          result.category
                      )?.label
                    }
                  </small>

                </button>
              )
            )}

          </div>

        ) : (

          /* =================================================
             SETTINGS BODY
             ================================================= */

          <div className="vscode-settings-body">

            {/* =================================================
                LEFT SIDEBAR
                ================================================= */}

            <aside className="vscode-settings-sidebar">

              <div className="vscode-sidebar-title">
                Settings
              </div>

              {CATEGORIES.map(
                (category) => (
                  <button
                    key={category.key}
                    type="button"
                    className={
                      activeCategory ===
                      category.key
                        ? 'active'
                        : ''
                    }
                    onClick={() =>
                      setActiveCategory(
                        category.key
                      )
                    }
                  >
                    {category.label}
                  </button>
                )
              )}

            </aside>


            {/* =================================================
                RIGHT CONTENT
                ================================================= */}

            <main className="vscode-settings-content">

              {message && (
                <div className="vscode-saved">
                  {message}
                </div>
              )}

              <h1>
                {currentCategory?.label}
              </h1>


              {/* =================================================
                  NOTIFICATIONS
                  ================================================= */}

              {activeCategory ===
                'notifications' && (

                <form
                  onSubmit={
                    saveNotifications
                  }
                >

                  {/* Motion alerts */}

                  <div className="vscode-setting-row">

                    <div>
                      <h3>
                        Motion alerts
                      </h3>

                      <p>
                        Notify on any motion
                        detected on camera —
                        {' '}
                        {motionAlertCount}
                        {' '}
                        sent this week
                      </p>
                    </div>

                    <input
                      type="checkbox"
                      checked={
                        notifyMotion
                      }
                      onChange={(event) =>
                        setNotifyMotion(
                          event.target.checked
                        )
                      }
                    />

                  </div>


                  {/* Person alerts */}

                  <div className="vscode-setting-row">

                    <div>
                      <h3>
                        Person-detected alerts
                      </h3>

                      <p>
                        Notify when a face is
                        identified or
                        unrecognized —
                        {' '}
                        {personAlertCount}
                        {' '}
                        sent this week
                      </p>
                    </div>

                    <input
                      type="checkbox"
                      checked={
                        notifyPerson
                      }
                      onChange={(event) =>
                        setNotifyPerson(
                          event.target.checked
                        )
                      }
                    />

                  </div>


                  {/* Email */}

                  <div className="vscode-setting-row">

                    <div>
                      <h3>
                        Daily email summary
                      </h3>

                      <p>
                        A recap of alerts and
                        activity, once a day
                      </p>
                    </div>

                    <input
                      type="checkbox"
                      checked={
                        notifyEmail
                      }
                      onChange={(event) =>
                        setNotifyEmail(
                          event.target.checked
                        )
                      }
                    />

                  </div>


                  <br />

                  <button
                    type="submit"
                    className="vscode-primary-btn"
                  >
                    Save notifications
                  </button>

                </form>
              )}


              {/* =================================================
                  ALERT THRESHOLDS
                  ================================================= */}

              {activeCategory ===
                'thresholds' &&
                canSeeThresholds && (

                <form
                  onSubmit={
                    saveThresholds
                  }
                >

                  <p className="vscode-description">
                    These are the default detection
                    settings applied across cameras.
                    Individual cameras can still be
                    overridden from their own Settings.
                  </p>


                  {/* Sensitivity */}

                  <div className="vscode-field">

                    <label>
                      Default motion sensitivity
                    </label>

                    <select
                      value={
                        sensitivity
                      }
                      onChange={(event) =>
                        setSensitivity(
                          event.target.value
                        )
                      }
                    >

                      <option value="low">
                        Low
                      </option>

                      <option value="medium">
                        Medium
                      </option>

                      <option value="high">
                        High
                      </option>

                    </select>

                  </div>


                  {/* After hours */}

                  <div className="vscode-two-fields">

                    <div className="vscode-field">

                      <label>
                        After-hours window start
                      </label>

                      <input
                        type="time"
                        value={
                          afterHoursStart
                        }
                        onChange={(event) =>
                          setAfterHoursStart(
                            event.target.value
                          )
                        }
                      />

                    </div>


                    <div className="vscode-field">

                      <label>
                        After-hours window end
                      </label>

                      <input
                        type="time"
                        value={
                          afterHoursEnd
                        }
                        onChange={(event) =>
                          setAfterHoursEnd(
                            event.target.value
                          )
                        }
                      />

                    </div>

                  </div>


                  {/* Door threshold */}

                  <div className="vscode-field">

                    <label>
                      Door-held-open threshold
                      (seconds)
                    </label>

                    <input
                      type="number"
                      min="5"
                      max="300"
                      value={
                        doorHeldSeconds
                      }
                      onChange={(event) =>
                        setDoorHeldSeconds(
                          event.target.value
                        )
                      }
                    />

                  </div>


                  <button
                    type="submit"
                    className="vscode-primary-btn"
                  >
                    Save thresholds
                  </button>

                </form>
              )}


              {/* =================================================
                  SECURITY
                  ================================================= */}

              {activeCategory ===
                'security' && (

                <form
                  onSubmit={
                    changePassword
                  }
                >

                  <div className="vscode-field">

                    <label>
                      Current password
                    </label>

                    <input
                      type="password"
                      value={
                        currentPassword
                      }
                      onChange={(event) =>
                        setCurrentPassword(
                          event.target.value
                        )
                      }
                    />

                  </div>


                  <div className="vscode-two-fields">

                    <div className="vscode-field">

                      <label>
                        New password
                      </label>

                      <input
                        type="password"
                        value={
                          newPassword
                        }
                        onChange={(event) =>
                          setNewPassword(
                            event.target.value
                          )
                        }
                      />

                    </div>


                    <div className="vscode-field">

                      <label>
                        Confirm new password
                      </label>

                      <input
                        type="password"
                        value={
                          confirmPassword
                        }
                        onChange={(event) =>
                          setConfirmPassword(
                            event.target.value
                          )
                        }
                      />

                    </div>

                  </div>


                  <button
                    type="submit"
                    className="vscode-primary-btn"
                  >
                    Update password
                  </button>

                </form>
              )}


              {/* =================================================
                  ACCOUNT
                  ================================================= */}

              {activeCategory ===
                'account' && (

                <div>

                  <div className="vscode-field">

                    <label>
                      Name
                    </label>

                    <input
                      value={
                        session?.name || ''
                      }
                      disabled
                    />

                  </div>


                  <div className="vscode-field">

                    <label>
                      Role
                    </label>

                    <input
                      value={
                        session?.role || ''
                      }
                      disabled
                    />

                  </div>

                </div>
              )}


              {/* =================================================
                  SYSTEM — ADMIN ONLY
                  ================================================= */}

              {activeCategory ===
                'system' &&
                isAdmin && (

                <div>

                  {/* Integrations */}

                  <section
                    className="vscode-section"
                  >

                    <h2>
                      Integrations
                    </h2>

                    <p>
                      Camera retention, staff
                      access levels, and
                      integration keys will live
                      here once connected to a
                      real backend.
                    </p>

                    <button
                      type="button"
                      className="vscode-outline-btn"
                      disabled
                    >
                      Manage integrations —
                      coming soon
                    </button>

                  </section>


                  {/* Danger Zone */}

                  <section
                    className="vscode-danger-section"
                  >

                    <h2>
                      Danger zone
                    </h2>


                    {/* Clear records */}

                    <div
                      className="vscode-danger-row"
                    >

                      <div>

                        <h3>
                          Clear all records
                        </h3>

                        <p>
                          Permanently removes
                          all logged access
                          and alert records.
                        </p>

                      </div>


                      {!confirmClear ? (

                        <button
                          type="button"
                          className="vscode-danger-btn"
                          onClick={() =>
                            setConfirmClear(
                              true
                            )
                          }
                        >
                          Clear records
                        </button>

                      ) : (

                        <div
                          className="vscode-confirm"
                        >

                          <span>
                            Are you sure?
                          </span>

                          <button
                            type="button"
                            className="vscode-danger-btn"
                            onClick={
                              clearRecords
                            }
                          >
                            Yes, clear
                          </button>

                          <button
                            type="button"
                            className="vscode-outline-btn"
                            onClick={() =>
                              setConfirmClear(
                                false
                              )
                            }
                          >
                            Cancel
                          </button>

                        </div>

                      )}

                    </div>


                    {/* Reset demo */}

                    <div
                      className="vscode-danger-row"
                    >

                      <div>

                        <h3>
                          Reset demo data
                        </h3>

                        <p>
                          Restores cameras,
                          staff, and alerts
                          to their original
                          mock state.
                        </p>

                      </div>


                      {!confirmReset ? (

                        <button
                          type="button"
                          className="vscode-danger-btn"
                          onClick={() =>
                            setConfirmReset(
                              true
                            )
                          }
                        >
                          Reset data
                        </button>

                      ) : (

                        <div
                          className="vscode-confirm"
                        >

                          <span>
                            Are you sure?
                          </span>

                          <button
                            type="button"
                            className="vscode-danger-btn"
                            onClick={
                              resetDemoData
                            }
                          >
                            Yes, reset
                          </button>

                          <button
                            type="button"
                            className="vscode-outline-btn"
                            onClick={() =>
                              setConfirmReset(
                                false
                              )
                            }
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