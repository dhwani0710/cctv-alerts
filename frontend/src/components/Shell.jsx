import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, dashboardFor } from '../context/AuthContext.jsx';
import { initials } from '../data/mockData.js';
import { useStatus } from '../context/StatusContext.jsx';
import HallmarkStamp from './HallmarkStamp.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const NAV_ICONS = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
    </svg>
  ),

  employees: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="8" r="2.4" />
      <path d="M15.5 14.2c2.6.4 4.5 2.7 4.5 5.8" />
    </svg>
  ),

  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
    </svg>
  ),

  cameras: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="7" width="14" height="11" rx="2" />
      <path d="M16.5 10.5 21 8v9l-4.5-2.5" />
    </svg>
  ),

  records: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),

  attendance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9h16" />
      <circle cx="8" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
      <path d="M8 13h4M8 16h8" />
    </svg>
  ),

  'my-attendance': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
    </svg>
  ),

  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

const SETTINGS_ICONS = {
  notifications: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2Z" />
      <path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16l-2-2Z" />
    </svg>
  ),

  thresholds: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 12h4l2 6 4-14 2 8h6" />
    </svg>
  ),

  security: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z" />
    </svg>
  ),

  account: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
    </svg>
  ),

  system: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
    </svg>
  ),
};

function useClock() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => {
      const currentTime = new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      setTime(`${currentTime} IST`);
    };

    tick();

    const id = setInterval(tick, 1000);

    return () => clearInterval(id);
  }, []);

  return time;
}

/* ---------------- SETTINGS WINDOW ---------------- */

function SettingsWindow({ onClose, session, alerts = [] }) {
  const role = session?.role || 'employee';

  const isAdmin = role === 'ceo' || role === 'owner';
  const canSeeThresholds = role !== 'employee';

  const categories = [
    { key: 'notifications', label: 'Notifications' },

    ...(canSeeThresholds
      ? [{ key: 'thresholds', label: 'Alert thresholds' }]
      : []),

    { key: 'security', label: 'Security' },
    { key: 'account', label: 'Account' },

    ...(isAdmin ? [{ key: 'system', label: 'System' }] : []),
  ];

  const [activeCategory, setActiveCategory] = useState('notifications');
  const [query, setQuery] = useState('');

  const [notifyMotion, setNotifyMotion] = useState(true);
  const [notifyPerson, setNotifyPerson] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);

  const motionAlertCount = useMemo(
    () =>
      alerts.filter(
        (alert) =>
          alert.alert_type === 'stranger' ||
          alert.alert_type === 'camera_tamper'
      ).length,
    [alerts]
  );

  const personAlertCount = useMemo(
    () =>
      alerts.filter(
        (alert) =>
          alert.alert_type === 'overstay' ||
          alert.alert_type === 'early_arrival'
      ).length,
    [alerts]
  );

  const [sensitivity, setSensitivity] = useState('medium');
  const [afterHoursStart, setAfterHoursStart] = useState('21:00');
  const [afterHoursEnd, setAfterHoursEnd] = useState('08:00');
  const [doorHeldSeconds, setDoorHeldSeconds] = useState(30);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const [confirmingClear, setConfirmingClear] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const [flash, setFlash] = useState('');

  function flashMsg(message) {
    setFlash(message);

    setTimeout(() => {
      setFlash('');
    }, 2000);
  }

  const searchIndex = [
    { category: 'notifications', label: 'Motion alerts' },
    { category: 'notifications', label: 'Person-detected alerts' },
    { category: 'notifications', label: 'Daily email summary' },

    ...(canSeeThresholds
      ? [
          {
            category: 'thresholds',
            label: 'Default motion sensitivity',
          },
          {
            category: 'thresholds',
            label: 'After-hours window',
          },
          {
            category: 'thresholds',
            label: 'Door-held-open threshold',
          },
        ]
      : []),

    { category: 'security', label: 'Change password' },
    { category: 'account', label: 'Name' },
    { category: 'account', label: 'Role' },

    ...(isAdmin
      ? [
          { category: 'system', label: 'Integrations' },
          { category: 'system', label: 'Clear all records' },
          { category: 'system', label: 'Reset demo data' },
        ]
      : []),
  ];

  const searchResults = query.trim()
    ? searchIndex.filter((item) =>
        item.label.toLowerCase().includes(query.trim().toLowerCase())
      )
    : [];

  function jumpTo(category) {
    setActiveCategory(category);
    setQuery('');
  }

  function handleEscape(event) {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  return (
    <div
      className="settings-window-backdrop"
      onKeyDown={handleEscape}
    >
      <div
        className="settings-window"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="settings-window-titlebar">
          <span className="settings-window-title">Settings</span>

          <button
            type="button"
            className="settings-window-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="settings-window-search">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            width="15"
            height="15"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>

          <input
            type="text"
            placeholder="Search settings"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
        </div>

        {query.trim() ? (
          <div className="settings-window-results">
            {searchResults.length === 0 && (
              <div className="settings-window-noresults">
                No settings found for "{query}"
              </div>
            )}

            {searchResults.map((result, index) => (
              <button
                type="button"
                key={`${result.category}-${index}`}
                className="settings-window-result"
                onClick={() => jumpTo(result.category)}
              >
                <span className="settings-window-result-label">
                  {result.label}
                </span>

                <span className="settings-window-result-cat">
                  {
                    categories.find(
                      (category) => category.key === result.category
                    )?.label
                  }
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="settings-window-body">
            <nav className="settings-window-sidebar">
              {categories.map((category) => (
                <button
                  type="button"
                  key={category.key}
                  className={`settings-window-navitem ${
                    activeCategory === category.key ? 'active' : ''
                  }`}
                  onClick={() => setActiveCategory(category.key)}
                >
                  {SETTINGS_ICONS[category.key]}
                  {category.label}
                </button>
              ))}
            </nav>

            <div className="settings-window-content">
              {flash && (
                <div className="settings-flash">
                  {flash}
                </div>
              )}

              {activeCategory === 'notifications' && (
                <div className="settings-window-section">
                  <h3>Notifications</h3>

                  <label className="settings-toggle-row">
                    <div>
                      <div className="settings-toggle-t">
                        Motion alerts
                      </div>

                      <div className="settings-toggle-d">
                        Notify on any motion detected on camera —{' '}
                        {motionAlertCount} sent this week
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={notifyMotion}
                      onChange={(event) =>
                        setNotifyMotion(event.target.checked)
                      }
                    />
                  </label>

                  <label className="settings-toggle-row">
                    <div>
                      <div className="settings-toggle-t">
                        Person-detected alerts
                      </div>

                      <div className="settings-toggle-d">
                        Notify when a face is identified or unrecognized —{' '}
                        {personAlertCount} sent this week
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={notifyPerson}
                      onChange={(event) =>
                        setNotifyPerson(event.target.checked)
                      }
                    />
                  </label>

                  <label
                    className="settings-toggle-row"
                    style={{ borderBottom: 'none' }}
                  >
                    <div>
                      <div className="settings-toggle-t">
                        Daily email summary
                      </div>

                      <div className="settings-toggle-d">
                        A recap of alerts and activity, once a day
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={notifyEmail}
                      onChange={(event) =>
                        setNotifyEmail(event.target.checked)
                      }
                    />
                  </label>

                  <button
                    type="button"
                    className="btn btn-brass"
                    style={{ marginTop: 16 }}
                    onClick={() =>
                      flashMsg('Notification preferences saved.')
                    }
                  >
                    Save notifications
                  </button>
                </div>
              )}

              {activeCategory === 'thresholds' && canSeeThresholds && (
                <div className="settings-window-section">
                  <h3>Alert thresholds</h3>

                  <p className="settings-note">
                    These are the default detection settings applied across
                    cameras. Individual cameras can still be overridden from
                    their own Settings.
                  </p>

                  <div className="field">
                    <label>Default motion sensitivity</label>

                    <select
                      value={sensitivity}
                      onChange={(event) =>
                        setSensitivity(event.target.value)
                      }
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div className="settings-two-field">
                    <div className="field">
                      <label>After-hours window start</label>

                      <input
                        type="time"
                        value={afterHoursStart}
                        onChange={(event) =>
                          setAfterHoursStart(event.target.value)
                        }
                      />
                    </div>

                    <div className="field">
                      <label>After-hours window end</label>

                      <input
                        type="time"
                        value={afterHoursEnd}
                        onChange={(event) =>
                          setAfterHoursEnd(event.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div
                    className="field"
                    style={{ marginBottom: 0 }}
                  >
                    <label>
                      Door-held-open threshold (seconds)
                    </label>

                    <input
                      type="number"
                      min="5"
                      max="300"
                      value={doorHeldSeconds}
                      onChange={(event) =>
                        setDoorHeldSeconds(event.target.value)
                      }
                    />
                  </div>

                  <button
                    type="button"
                    className="btn btn-brass"
                    style={{ marginTop: 16 }}
                    onClick={() =>
                      flashMsg('Alert thresholds saved.')
                    }
                  >
                    Save thresholds
                  </button>
                </div>
              )}

              {activeCategory === 'security' && (
                <div className="settings-window-section">
                  <h3>Change password</h3>

                  <div className="field">
                    <label>Current password</label>

                    <input
                      type="password"
                      value={currentPw}
                      onChange={(event) =>
                        setCurrentPw(event.target.value)
                      }
                    />
                  </div>

                  <div className="settings-two-field">
                    <div className="field">
                      <label>New password</label>

                      <input
                        type="password"
                        value={newPw}
                        onChange={(event) =>
                          setNewPw(event.target.value)
                        }
                      />
                    </div>

                    <div className="field">
                      <label>Confirm new password</label>

                      <input
                        type="password"
                        value={confirmPw}
                        onChange={(event) =>
                          setConfirmPw(event.target.value)
                        }
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-brass"
                    onClick={() => {
                      if (
                        !currentPw ||
                        !newPw ||
                        newPw !== confirmPw
                      ) {
                        flashMsg(
                          'Passwords do not match or are incomplete.'
                        );
                        return;
                      }

                      setCurrentPw('');
                      setNewPw('');
                      setConfirmPw('');

                      flashMsg('Password updated.');
                    }}
                  >
                    Update password
                  </button>
                </div>
              )}

              {activeCategory === 'account' && (
                <div className="settings-window-section">
                  <h3>Account</h3>

                  <div className="field">
                    <label>Name</label>

                    <input
                      value={session?.name || ''}
                      disabled
                    />
                  </div>

                  <div
                    className="field"
                    style={{ marginBottom: 0 }}
                  >
                    <label>Role</label>

                    <input
                      value={session?.role || ''}
                      disabled
                    />
                  </div>
                </div>
              )}

              {activeCategory === 'system' && isAdmin && (
                <div className="settings-window-section">
                  <h3>Integrations</h3>

                  <p className="settings-note">
                    Camera retention, staff access levels, and integration
                    keys will live here once connected to a real backend.
                  </p>

                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled
                  >
                    Manage integrations — coming soon
                  </button>

                  <h3
                    style={{
                      marginTop: 26,
                      color: 'var(--brick)',
                    }}
                  >
                    Danger zone
                  </h3>

                  <div className="settings-danger-row">
                    <div>
                      <div className="settings-toggle-t">
                        Clear all records
                      </div>

                      <div className="settings-toggle-d">
                        Permanently removes all logged access/alert records
                      </div>
                    </div>

                    {!confirmingClear ? (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setConfirmingClear(true)}
                      >
                        Clear records
                      </button>
                    ) : (
                      <div className="settings-confirm">
                        <span>Are you sure?</span>

                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => {
                            setConfirmingClear(false);
                            flashMsg(
                              'All records cleared (mock).'
                            );
                          }}
                        >
                          Yes, clear
                        </button>

                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setConfirmingClear(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  <div
                    className="settings-danger-row"
                    style={{ borderBottom: 'none' }}
                  >
                    <div>
                      <div className="settings-toggle-t">
                        Reset demo data
                      </div>

                      <div className="settings-toggle-d">
                        Restores cameras, staff, and alerts to their
                        original mock state
                      </div>
                    </div>

                    {!confirmingReset ? (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setConfirmingReset(true)}
                      >
                        Reset data
                      </button>
                    ) : (
                      <div className="settings-confirm">
                        <span>Are you sure?</span>

                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => {
                            setConfirmingReset(false);
                            flashMsg(
                              'Demo data reset (mock).'
                            );
                          }}
                        >
                          Yes, reset
                        </button>

                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setConfirmingReset(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- MAIN SHELL ---------------- */

export default function Shell({
  active,
  dark = false,
  title,
  children,
}) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const clock = useClock();
  const [toast, setToast] = useState(false);

  const { hasHighAlert } = useStatus();

  const role = session?.role || 'employee';
  const name = session?.name || 'User';

  const isAdmin = role === 'ceo' || role === 'owner';
  const isGuard = role === 'guard';
  const isHr = role === 'hr';

  // These permission values can also be used in other components.
  const canManageEmployees =
    role === 'ceo' ||
    role === 'owner' ||
    role === 'hr';

  const canManageUsers =
    role === 'ceo' ||
    role === 'owner';

  useEffect(() => {
    if (params.get('denied') === '1') {
      setToast(true);

      const timeoutId = setTimeout(() => {
        setToast(false);
      }, 3500);

      const nextParams = new URLSearchParams(params);
      nextParams.delete('denied');

      setParams(nextParams, { replace: true });

      return () => clearTimeout(timeoutId);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const navItems = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      to: dashboardFor(role),
    },

    ...((isAdmin || isGuard)
      ? [
          {
            key: 'cameras',
            label: 'Cameras & Alerts',
            to: '/cameras-alerts',
          },
        ]
      : []),

    ...((isAdmin || isHr)
      ? [
          {
            key: 'attendance',
            label: 'Attendance',
            to: '/attendance',
          },
        ]
      : []),

    ...((isAdmin || isGuard)
      ? [
          {
            key: 'records',
            label: 'Records',
            to: '/records',
          },
        ]
      : []),

    ...(canManageEmployees
      ? [
          {
            key: 'employees',
            label: 'Employees',
            to: '/admin-employees',
          },
        ]
      : []),

    ...(canManageUsers
      ? [
          {
            key: 'users',
            label: 'Users',
            to: '/admin-users',
          },
        ]
      : []),
  ];

  return (
    <div className="shell">
      {toast && (
        <div className="toast">
          That page isn't available for your account.
        </div>
      )}

      <nav className="rail">
        <div className="rail-brand">
          <HallmarkStamp alert={hasHighAlert} />
        </div>

        {navItems.map((item) => (
          <Link
            key={item.key}
            to={item.to}
            className={`rail-link ${
              active === item.key ? 'active' : ''
            }`}
          >
            {NAV_ICONS[item.key]}
            <span className="tip">{item.label}</span>
          </Link>
        ))}

        <Link
          to="/settings"
          className={`rail-link ${
            active === 'settings' ? 'active' : ''
          }`}
        >
          {NAV_ICONS.settings}
          <span className="tip">Settings</span>
        </Link>

        <div className="rail-spacer" />
      </nav>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">
            {title}
          </div>

          <div className="topbar-right">
            <span className="topbar-clock mono">
              {clock}
            </span>

            <span
              className={`role-badge ${
                isAdmin ? 'admin' : ''
              }`}
            >
              {role}
            </span>

            <div className="user-chip">
              <div className="avatar">
                {initials(name)}
              </div>

              <span className="name">
                {name}
              </span>
            </div>

            <ThemeToggle />

            <button
              type="button"
              className="logout-btn"
              onClick={handleLogout}
            >
              Sign out
            </button>
          </div>
        </header>

        <main className={`content ${dark ? 'dark' : ''}`}>
          {children}
        </main>
      </div>
    </div>
  );
}