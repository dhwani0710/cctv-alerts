/* ============================================================
   APP.JS — shared mock data + shell wiring
   Swap MOCK_* below for real fetch() calls to your FastAPI
   backend once the endpoints exist.
   ============================================================ */

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

  document.querySelectorAll('[data-stamp]').forEach((el) => {
    el.innerHTML = stampSVG();
    el.classList.toggle('is-alert', false);
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