/* ============================================================
   APP.JS — shared mock data + shell wiring
   Swap MOCK_* below for real fetch() calls to your FastAPI
   backend once the endpoints exist.
   ============================================================ */

const MOCK_CAMERAS = [
  { id: 'CAM-01', name: 'Front Entrance', zone: 'Storefront', live: true },
  { id: 'CAM-02', name: 'Display Case 1–4', zone: 'Sales Floor', live: true },
  { id: 'CAM-03', name: 'Display Case 5–8', zone: 'Sales Floor', live: true },
  { id: 'CAM-04', name: 'Back Entrance', zone: 'Rear Access', live: true },
  { id: 'CAM-05', name: 'Vault Room', zone: 'Restricted', live: true },
  { id: 'CAM-06', name: 'Stock Room', zone: 'Restricted', live: false },
];

const MOCK_ALERTS = [
  { sev: 'high', title: 'Unrecognized face — Display Case 3', time: '09:41', desc: 'No match in staff roster, flagged for review' },
  { sev: 'high', title: 'Vault Room motion — after hours', time: '23:12', desc: 'Detected outside scheduled store hours' },
  { sev: 'low', title: 'Back Entrance door held open', time: '14:03', desc: 'Open for 47s, above 30s threshold' },
  { sev: 'low', title: 'Camera offline — Stock Room', time: '07:58', desc: 'Signal lost, last frame cached' },
];

const MOCK_RECORDS = [
  { time: '09:41:07', camera: 'Display Case 3', person: 'Unrecognized', event: 'Face flagged', status: 'flag' },
  { time: '09:15:44', camera: 'Front Entrance', person: 'R. Verma', event: 'Clocked in', status: 'clear' },
  { time: '08:52:10', camera: 'Vault Room', person: 'S. Kapoor', event: 'Vault access', status: 'clear' },
  { time: '07:58:02', camera: 'Stock Room', person: '—', event: 'Camera offline', status: 'review' },
  { time: 'Yesterday · 23:12', camera: 'Vault Room', person: 'Unrecognized', event: 'After-hours motion', status: 'flag' },
  { time: 'Yesterday · 18:30', camera: 'Front Entrance', person: 'S. Kapoor', event: 'Clocked out', status: 'clear' },
];

const MOCK_STAFF = [
  { name: 'S. Kapoor', role: 'Admin', shift: '9:00 – 18:00', added: 'Mar 2025' },
  { name: 'R. Verma', role: 'Sales Associate', shift: '9:00 – 17:00', added: 'Jun 2025' },
  { name: 'A. Iyer', role: 'Sales Associate', shift: '12:00 – 20:00', added: 'Jan 2026' },
];

const MOCK_ATTENDANCE = [
  { name: 'S. Kapoor', date: '2026-08-10', clockIn: '09:02', clockOut: '18:06', hours: '9h 04m', status: 'present' },
  { name: 'R. Verma', date: '2026-08-10', clockIn: '09:15', clockOut: '—', hours: '—', status: 'present' },
  { name: 'A. Iyer', date: '2026-08-10', clockIn: '—', clockOut: '—', hours: '—', status: 'absent' },

  { name: 'S. Kapoor', date: '2026-08-09', clockIn: '08:58', clockOut: '17:59', hours: '9h 01m', status: 'present' },
  { name: 'R. Verma', date: '2026-08-09', clockIn: '09:41', clockOut: '17:02', hours: '7h 21m', status: 'late' },
  { name: 'A. Iyer', date: '2026-08-09', clockIn: '12:05', clockOut: '20:10', hours: '8h 05m', status: 'late' },

  { name: 'S. Kapoor', date: '2026-08-08', clockIn: '09:00', clockOut: '18:00', hours: '9h 00m', status: 'present' },
  { name: 'R. Verma', date: '2026-08-08', clockIn: '09:05', clockOut: '17:00', hours: '7h 55m', status: 'present' },
  { name: 'A. Iyer', date: '2026-08-08', clockIn: '—', clockOut: '—', hours: '—', status: 'absent' },
];

function initials(name) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function stampSVG() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z"/><path d="m8.5 12 2.3 2.3L15.5 9.5"/></svg>';
}

/**
 * Wires topbar name/role/clock, rail active state, logout, and
 * the hallmark-stamp alert indicator. Call after requireAuth().
 */
function initShell(session, activePage) {
  document.querySelectorAll('.rail-link').forEach((el) => {
    el.classList.toggle('active', el.dataset.page === activePage);
  });

  const nameEl = document.querySelector('[data-user-name]');
  const avatarEl = document.querySelector('[data-user-avatar]');
  const roleEl = document.querySelector('[data-role-badge]');
  if (nameEl) nameEl.textContent = session.name;
  if (avatarEl) avatarEl.textContent = initials(session.name);
  if (roleEl) {
    roleEl.textContent = session.role;
    roleEl.classList.toggle('admin', session.role === 'admin');
  }

  const logoutBtn = document.querySelector('[data-logout]');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  const clockEl = document.querySelector('[data-clock]');
  if (clockEl) {
    const tick = () => {
      clockEl.textContent = new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }) + ' IST';
    };
    tick();
    setInterval(tick, 1000);
  }

  const hasHighAlert = MOCK_ALERTS.some((a) => a.sev === 'high');
  document.querySelectorAll('[data-stamp]').forEach((el) => {
    el.innerHTML = stampSVG();
    el.classList.toggle('is-alert', hasHighAlert);
  });

  // Shared pages (Cameras & Alerts, Records) render admin-only controls
  // in the markup but hide them here for non-admins. Remember: this is
  // a UI convenience, not enforcement — the backend must reject an
  // employee's token on any admin-only endpoint regardless of what the
  // UI shows. See the note at the top of auth.js.
  document.querySelectorAll('[data-admin-only]').forEach((el) => {
    el.style.display = session.role === 'admin' ? '' : 'none';
  });

  showDeniedToastIfNeeded();
}

/**
 * Applies saved theme on load and wires the topbar toggle button.
 * Call after initShell().
 */
function initTheme() {
  const saved = localStorage.getItem('vaultwatch_theme');
  if (saved === 'light') document.body.classList.add('light-theme');

  const btn = document.querySelector('[data-theme-toggle]');
  if (btn) {
    btn.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      localStorage.setItem(
        'vaultwatch_theme',
        document.body.classList.contains('light-theme') ? 'light' : 'dark'
      );
    });
  }
}