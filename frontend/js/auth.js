/* ============================================================
   AUTH.JS
   -------------------------------------------------------------
   DEMO / MOCK AUTH ONLY.
   This checks username+password against a hardcoded list below
   and stores the result in sessionStorage. That is enough to
   drive the UI (which dashboard to show, which nav links appear)
   but it is NOT real security — anyone can open devtools and
   edit sessionStorage directly.
   TO WIRE UP YOUR REAL FASTAPI BACKEND:
   1. Replace the body of `attemptLogin()` with a fetch() call to
      your login endpoint, e.g.
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ username, password })
        });
      Have the backend return { ok, role, name, token }.
   2. Store the token (e.g. a JWT) instead of a plain flag, and
      send it as an Authorization header on every API call.
   3. IMPORTANT: the backend must independently check the role/
      token on every admin-only endpoint. The redirect logic
      below only hides pages in the UI — it can't stop someone
      from calling an admin API endpoint directly. Real
      "employee can never access admin data" guarantees have to
      be enforced there, not just in this JS file.
   ============================================================ */
const CCTV_SESSION_KEY = 'vaultwatch_session';
// Demo credential store — replace with a real API call, see above.
const DEMO_USERS = [
  { username: 'admin',    password: 'admin123',    role: 'admin',    name: 'S. Kapoor' },
  { username: 'employee', password: 'employee123', role: 'employee', name: 'R. Verma' },
];
function attemptLogin(username, password) {
  const match = DEMO_USERS.find(
    (u) => u.username === username.trim() && u.password === password
  );
  if (!match) return { ok: false };
  const session = {
    username: match.username,
    role: match.role,
    name: match.name,
    loggedInAt: Date.now(),
  };
  sessionStorage.setItem(CCTV_SESSION_KEY, JSON.stringify(session));
  return { ok: true, session };
}
function getSession() {
  const raw = sessionStorage.getItem(CCTV_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function logout() {
  sessionStorage.removeItem(CCTV_SESSION_KEY);
  window.location.href = 'login.html';
}
function dashboardFor(role) {
  return role === 'admin' ? 'admin-dashboard.html' : 'employee-dashboard.html';
}
/**
 * Call at the top of every protected page.
 * allowedRoles: array like ['admin'] or ['admin','employee']
 */
function requireAuth(allowedRoles) {
  const session = getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  if (!allowedRoles.includes(session.role)) {
    // Authenticated, but not allowed on this page — send them
    // back to their own dashboard rather than to login.
    window.location.href = dashboardFor(session.role) + '?denied=1';
    return null;
  }
  return session;
}
function showDeniedToastIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('denied') === '1') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = "That page isn't available for your account.";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
    params.delete('denied');
    const clean =
      window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState({}, '', clean);
  }
}