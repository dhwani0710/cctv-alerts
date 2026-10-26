import React from 'react';
import useAbort from '../hooks/useAbort.js';

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, loading, onConfirm, onCancel }) {
  const { next, abort } = useAbort();
  if (!open) return null;

  function handleCancel() {
    abort();
    onCancel();
  }

  return (
    <div
      className="cam-lightbox-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
    >
      <div className="panel" style={{ maxWidth: 380, width: '100%' }}>
        <div className="panel-head"><h2>{title}</h2></div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13.5, marginBottom: 20 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={handleCancel}>Cancel</button>
          <button className={danger ? 'btn btn-danger' : 'btn btn-brass'} onClick={() => onConfirm(next())} disabled={loading}>
            {loading ? <><span className="spinner" /> Working…</> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}