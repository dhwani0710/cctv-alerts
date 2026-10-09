const HEADERS = ['Date', 'Staff', 'First seen', 'Last seen', 'Status'];
const STATUS_TEXT = { present: 'Present', late: 'Late', pending: 'Not yet due' };
const MAX_ROWS = 5000;
const MAX_BYTES = 1024 * 1024; // 1 MB

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

// Stops spreadsheet formula injection and breaks no CSV rules
function safeCell(value) {
  let s = value == null ? '' : String(value);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function hhmm(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function slug(name) {
  const s = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'employee';
}

/**
 * One employee per file. Checks everything before returning a file.
 * Returns { ok: true, csv, filename, rowCount } or { ok: false, error }.
 */
export function buildEmployeeCsv({ records, month }) {
  if (!Array.isArray(records) || records.length === 0) {
    return { ok: false, error: 'No records to export.' };
  }
  if (records.length > MAX_ROWS) {
    return { ok: false, error: `Too many rows (${records.length}). Limit is ${MAX_ROWS}.` };
  }
  if (!MONTH_RE.test(String(month || ''))) {
    return { ok: false, error: 'Month is invalid.' };
  }

  const names = new Set(records.map((r) => String(r.name || '').trim().toLowerCase()));
  if (names.has('')) {
    return { ok: false, error: 'Some records have no employee name.' };
  }
  if (names.size > 1) {
    return {
      ok: false,
      error: `${names.size} employees match. Type one full name to export.`,
    };
  }

  const badDates = records.filter((r) => !DATE_RE.test(String(r.attendance_date || ''))).length;
  if (badDates > 0) {
    return { ok: false, error: `${badDates} record(s) have an invalid date.` };
  }

  const rows = [...records]
    .sort((a, b) => String(a.attendance_date).localeCompare(String(b.attendance_date)))
    .map((r) => [
      r.attendance_date,
      String(r.name).trim(),
      hhmm(r.first_seen),
      hhmm(r.last_seen),
      STATUS_TEXT[r.status] || 'Absent',
    ]);

  const lines = [HEADERS, ...rows].map((row) => row.map(safeCell).join(','));
  const csv = lines.join('\r\n') + '\r\n';

  if (new Blob([csv]).size > MAX_BYTES) {
    return { ok: false, error: 'File is too large to export.' };
  }

  return {
    ok: true,
    csv,
    rowCount: rows.length,
    filename: `attendance-${slug(records[0].name)}-${month}.csv`,
  };
}

export function downloadCsv(csv, filename) {
  // BOM keeps Excel happy with UTF-8 names
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}