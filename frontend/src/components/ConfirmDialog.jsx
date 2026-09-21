import React from 'react';

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div
      className="cam-lightbox-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="panel" style={{ maxWidth: 380, width: '100%' }}>
        <div className="panel-head"><h2>{title}</h2></div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13.5, marginBottom: 20 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
          <button className={danger ? 'btn btn-danger' : 'btn btn-brass'} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}