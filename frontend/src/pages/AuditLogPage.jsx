import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import useOffices from '../hooks/useOffices.js';
const API_BASE = import.meta.env.VITE_API_BASE || (window.location.protocol === 'https:' ? `https://${window.location.hostname}:8443` : `http://${window.location.hostname}:8000`);

/* ------------------------------------------------------------------ */
/*  Config: edit these lists to change filters and colours             */
/* ------------------------------------------------------------------ */

const ROLES = [
  { value: '', label: 'All roles' },
  { value: 'owner', label: 'Owner' },
  { value: 'ceo', label: 'CEO' },
  { value: 'hr', label: 'HR' },
  { value: 'guard', label: 'Guard' },
];

// value must match backend target_module exactly
const MODULES = [
  { value: 'Alerts', label: 'Alerts & protocols' },
  { value: 'Cameras', label: 'Cameras' },
  { value: 'Attendance', label: 'Attendance' },
  { value: 'Employees', label: 'Employees' },
  { value: 'Schedules', label: 'Shifts & schedules' },
  { value: 'Faces', label: 'Face reference photos' },
  { value: 'Users', label: 'User management' },
  { value: 'Settings', label: 'Settings & store hours' },
  { value: 'Auth', label: 'Authentication' },
  { value: 'Reports', label: 'Reports & exports' },
];

const ROLE_TONE = { owner: 'brass', ceo: 'info', hr: 'ok', guard: 'slate', system: 'muted' };
const ROLE_LABEL = { owner: 'Owner', ceo: 'CEO', hr: 'HR', guard: 'Guard', system: 'System' };
const roleColor = (role) => `var(--ad-${ROLE_TONE[role] || 'muted'})`;

// Only exceptions get colour. Routine activity stays neutral.
const actionTone = (action = '') => {
  const a = String(action).toUpperCase();
  if (/DELETE|REMOVE|FAIL|DENIED|REJECT|LOCK/.test(a)) return 'danger';
  if (/ALERT|ACK|ESCALAT|INTRUD|TAMPER|OFFLINE/.test(a)) return 'warn';
  if (/CREATE|ADD|ENROLL|UPLOAD/.test(a)) return 'ok';
  if (/UPDATE|EDIT|CHANGE|MODIFY|SAVE/.test(a)) return 'info';
  return 'muted';
};

// height comes from CSS (34px on desktop, 42px on touch screens)
const controlStyle = { padding: '0 10px' };
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD, local time

const PAGE_SIZES = [10, 25, 50, 100];

// 1 ... 4 5 6 ... 100 style page list
const buildPages = (current, totalPages) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) pages.push('…');
  for (let i = start; i <= end; i += 1) pages.push(i);
  if (end < totalPages - 1) pages.push('…');
  pages.push(totalPages);
  return pages;
};

/* ------------------------------------------------------------------ */
/*  Line icons (no emoji)                                              */
/* ------------------------------------------------------------------ */

const ICONS = {
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  camera: (
    <>
      <path d="M3 7h4l2-3h6l2 3h4v13H3z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
};

const Icon = ({ name, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ flex: 'none' }}
  >
    {ICONS[name]}
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Styles (scoped with .ad- prefix, uses your existing CSS variables) */
/* ------------------------------------------------------------------ */

const AD_CSS = `
.ad-root {
  --ad-brass: var(--brass, #c9a36b);
  --ad-surface: var(--surface, #1b1f27);
  --ad-border: var(--border, rgba(255,255,255,.10));
  --ad-text: var(--text, #e6e8ec);
  --ad-muted: var(--text-muted, #8b93a1);
  --ad-ok: #4f9d7d;
  --ad-warn: #c9993f;
  --ad-danger: #cf5c5c;
  --ad-info: #6f93c6;
  --ad-slate: #8c96ab;
}
.ad-root .tone-brass  { --tone: var(--ad-brass); }
.ad-root .tone-ok     { --tone: var(--ad-ok); }
.ad-root .tone-warn   { --tone: var(--ad-warn); }
.ad-root .tone-danger { --tone: var(--ad-danger); }
.ad-root .tone-info   { --tone: var(--ad-info); }
.ad-root .tone-slate  { --tone: var(--ad-slate); }
.ad-root .tone-muted  { --tone: var(--ad-muted); }

.ad-ellip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

/* Filter row: refresh sits in line with the other buttons */
.ad-search { flex: 1 1 220px; min-width: 0; }
.ad-btn-row { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.ad-btn-row .btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  white-space: nowrap;
}

/* Summary strip: one connected panel, hairline dividers */
.ad-stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 1px;
  background: var(--ad-border);
  border: 1px solid var(--ad-border);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 16px;
}
.ad-stat { padding: 16px 18px; background: var(--ad-surface); min-width: 0; }
.ad-stat-top {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  color: var(--ad-muted); font-size: 12px; font-weight: 500;
}
.ad-stat-value {
  margin-top: 8px; font-size: 26px; font-weight: 600; line-height: 1.1;
  color: var(--ad-text); font-variant-numeric: tabular-nums;
}
.ad-stat-value.is-danger { color: var(--ad-danger); }
.ad-stat-hint { margin-top: 4px; font-size: 11.5px; color: var(--ad-muted); }

/* Chart cards */
.ad-charts {
  display: grid;
  grid-template-columns: 1.7fr 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}
.ad-card {
  background: var(--ad-surface);
  border: 1px solid var(--ad-border);
  border-radius: 8px;
  padding: 16px 18px;
  min-width: 0;
}
.ad-card h3 { margin: 0; font-size: 13.5px; font-weight: 600; color: var(--ad-text); }
.ad-sub { font-size: 12px; color: var(--ad-muted); margin: 2px 0 14px; }
.ad-empty { color: var(--ad-muted); font-size: 12.5px; margin: 8px 0 0; }

.ad-hours {
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  grid-template-rows: 100%;
  gap: 3px;
  height: 120px;
}
.ad-hour { display: flex; align-items: flex-end; }
.ad-hour-bar {
  width: 100%;
  border-radius: 2px 2px 0 0;
  background: color-mix(in srgb, var(--ad-brass) 45%, transparent);
  transition: height .3s ease;
}
.ad-hour.peak .ad-hour-bar { background: var(--ad-brass); }
.ad-hour.empty .ad-hour-bar { background: color-mix(in srgb, var(--ad-text) 10%, transparent); }
.ad-hour-axis {
  display: grid; grid-template-columns: repeat(24, 1fr); gap: 3px;
  margin-top: 6px; font-size: 10px; color: var(--ad-muted); text-align: center;
}

.ad-rows { display: flex; flex-direction: column; gap: 12px; }
.ad-row {
  display: grid; grid-template-columns: minmax(0, 112px) 1fr auto;
  gap: 10px; align-items: center; font-size: 12.5px; color: var(--ad-text);
}
.ad-track {
  height: 6px; border-radius: 99px; overflow: hidden;
  background: color-mix(in srgb, var(--ad-text) 8%, transparent);
}
.ad-fill { display: block; height: 100%; border-radius: 99px; background: color-mix(in srgb, var(--ad-brass) 80%, transparent); }
.ad-count { min-width: 24px; text-align: right; color: var(--ad-muted); font-variant-numeric: tabular-nums; }

.ad-donut-wrap { display: flex; align-items: center; gap: 16px; }
.ad-donut { position: relative; width: 104px; height: 104px; flex: none; }
.ad-donut-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
  display: block;
}
.ad-donut-center {
  position: absolute; inset: 0; z-index: 1;
  display: grid; place-items: center; text-align: center; line-height: 1.15;
  pointer-events: none;
}
.ad-donut-total { font-size: 18px; font-weight: 600; color: var(--ad-text); font-variant-numeric: tabular-nums; }
.ad-donut-cap { font-size: 10.5px; color: var(--ad-muted); }
.ad-legend { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0; font-size: 12.5px; color: var(--ad-text); }
.ad-legend-item { display: flex; align-items: center; gap: 8px; }
.ad-dot { width: 8px; height: 8px; border-radius: 2px; flex: none; }

/* Ledger table, grouped by day */
.ad-ledger-head {
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;
  padding: 14px 18px; border-bottom: 1px solid var(--ad-border);
}
.ad-ledger-head .ad-sub { margin: 2px 0 0; }
.ad-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ad-muted); }
.ad-scroll { max-height: 620px; overflow: auto; }
.ad-loading { opacity: .55; transition: opacity .2s; }
.ad-table { width: 100%; border-collapse: separate; border-spacing: 0; }
.ad-table th {
  position: sticky; top: 0; z-index: 3;
  height: 38px; box-sizing: border-box; padding: 0 14px;
  background: var(--ad-surface);
  text-align: left; font-size: 12px; font-weight: 600; color: var(--ad-muted);
  border-bottom: 1px solid var(--ad-border);
}
.ad-table td {
  padding: 10px 14px; vertical-align: middle; font-size: 12.5px; color: var(--ad-text);
  border-bottom: 1px solid color-mix(in srgb, var(--ad-border) 55%, transparent);
}
.ad-item:hover td { background: color-mix(in srgb, var(--ad-text) 3.5%, transparent); }

.ad-day td {
  position: sticky; top: 38px; z-index: 2;
  padding: 7px 14px;
  background: color-mix(in srgb, var(--ad-text) 4%, var(--ad-surface));
  border-bottom: 1px solid var(--ad-border);
}
.ad-day-inner { display: flex; align-items: baseline; gap: 10px; font-weight: 600; font-size: 12px; color: var(--ad-text); }
.ad-day-count { font-weight: 400; font-size: 11.5px; color: var(--ad-muted); }

.ad-time { font-weight: 500; white-space: nowrap; }
.ad-actor-name { font-size: 13px; font-weight: 600; line-height: 1.25; }
.ad-role { font-size: 11.5px; color: var(--ad-muted); line-height: 1.3; }

.ad-tag {
  display: inline-block; white-space: nowrap;
  padding: 2px 8px; border-radius: 4px;
  font-size: 11.5px; font-weight: 600; letter-spacing: .01em;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--tone) 38%, transparent);
}
.ad-module { color: var(--ad-muted); white-space: nowrap; }
.ad-details { line-height: 1.5; word-break: break-word; }

.ad-proof {
  width: 36px; height: 36px; padding: 0; overflow: hidden; cursor: pointer;
  background: none; border: 1px solid var(--ad-border); border-radius: 4px;
}
.ad-proof img { display: block; width: 100%; height: 100%; object-fit: cover; }
.ad-proof:hover { border-color: var(--ad-brass); }
.ad-proof:focus-visible { outline: 2px solid var(--ad-brass); outline-offset: 2px; }

.ad-pager {
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
  padding: 12px 18px; border-top: 1px solid var(--ad-border);
  font-size: 12px; color: var(--ad-muted);
}
.ad-pager-left, .ad-pager-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ad-pager-left { gap: 16px; }
.ad-page-btn {
  min-width: 32px; height: 32px; padding: 0 10px; cursor: pointer;
  border-radius: 6px; border: 1px solid var(--ad-border);
  background: transparent; color: var(--ad-text); font-size: 12px;
}
.ad-page-btn:hover:not(:disabled) { border-color: var(--ad-brass); }
.ad-page-btn:focus-visible { outline: 2px solid var(--ad-brass); outline-offset: 2px; }
.ad-page-btn.active {
  border-color: var(--ad-brass); color: var(--ad-brass); font-weight: 600;
  background: color-mix(in srgb, var(--ad-brass) 14%, transparent);
}
.ad-page-btn:disabled { opacity: .4; cursor: not-allowed; }
.ad-page-gap { padding: 0 2px; }
.ad-page-of { display: none; font-size: 12px; color: var(--ad-muted); }

.ad-lightbox-img {
  max-width: 100%;
  max-height: 72vh;
  max-height: calc(100dvh - 190px);
  object-fit: contain;
  border-radius: 4px;
}

@media (max-width: 1100px) {
  .ad-charts { grid-template-columns: 1fr 1fr; }
  .ad-charts > .ad-card:first-child { grid-column: 1 / -1; }
}
@media (max-width: 899px) {
  .ad-stats { grid-template-columns: repeat(2, 1fr); }
  .ad-stat:last-child:nth-child(odd) { grid-column: 1 / -1; }
}
@media (max-width: 767px) {
  .ad-charts { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .ad-hour-bar, .ad-loading { transition: none; }
}

/* ================================================================== */
/*  Responsive: filters, iPad table, touch targets, phone cards        */
/* ================================================================== */
.ad-root .filter-bar select,
.ad-root .filter-bar input,
.ad-root .filter-bar .btn { height: 34px; }

@media (min-width: 768px) {
  .ad-table { min-width: 760px; }
}

@media (pointer: coarse) {
  .ad-root .filter-bar select,
  .ad-root .filter-bar input,
  .ad-root .filter-bar .btn { height: 42px; }
  .ad-page-btn { min-width: 40px; height: 40px; }
  .ad-proof { width: 44px; height: 44px; }
}

/* phone portrait */
@media screen and (max-width: 767px) {
  .ad-date, .ad-search, .ad-btn-row { flex: 1 1 100%; margin-left: 0; }
  .ad-btn-row .btn { flex: 1 1 0; padding-left: 8px; padding-right: 8px; }

  .ad-stat { padding: 12px 14px; }
  .ad-stat-value { font-size: 22px; }
  .ad-card { padding: 14px; }
  .ad-ledger-head, .ad-pager { padding-left: 14px; padding-right: 14px; }
  .ad-pager-left, .ad-pager-right { width: 100%; justify-content: center; }
  .ad-page-num, .ad-page-gap { display: none; }
  .ad-page-of { display: inline; padding: 0 6px; }
  .ad-pager-right { justify-content: space-between; }

  /* the page scrolls, not a box inside the page */
  .ad-scroll { max-height: none; overflow: visible; }

  /* every ledger row becomes a card */
  .ad-table { min-width: 0; }
  .ad-table, .ad-table tbody, .ad-table tr, .ad-table td { display: block; width: 100%; }
  .ad-table thead { display: none; }

  .ad-day td { position: static; padding: 8px 14px; }

  .ad-item { padding: 12px 14px; border-bottom: 1px solid var(--ad-border); }
  .ad-item td {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 4px 0; border-bottom: none; text-align: right;
  }
  .ad-item td::before {
    content: attr(data-label);
    flex-shrink: 0; text-align: left;
    font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
    color: var(--ad-muted);
  }
  .ad-item td.ad-details { display: block; text-align: left; }
  .ad-item td.ad-details::before { display: block; margin-bottom: 2px; }
  .ad-item:hover td { background: none; }
}

/* phone / small tablet in landscape: little height, so use the width */
@media (orientation: landscape) and (max-height: 500px) and (min-width: 640px) {
  .ad-stats { grid-template-columns: repeat(5, 1fr); }
  .ad-stat:last-child:nth-child(odd) { grid-column: auto; }
  .ad-stat { padding: 10px 12px; }
  .ad-stat-value { font-size: 20px; margin-top: 4px; }
  .ad-charts { grid-template-columns: repeat(3, 1fr); }
  .ad-charts > .ad-card:first-child { grid-column: auto; }
}
@media (orientation: landscape) and (max-height: 500px) and (min-width: 768px) {
  .ad-scroll { max-height: calc(100dvh - 110px); }
}
`;

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export const AuditLogPage = () => {
  const { session, apiFetch } = useAuth();
  return null;
};