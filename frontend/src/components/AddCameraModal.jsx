import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const RTSP_URL_RE = /^rtsps?:\/\/(?:[^\s@]+@)?[a-zA-Z0-9.-]+(?::\d{1,5})?(?:\/[^\s]*)?$/i;

export default function AddCameraModal({ onClose, onAdded, editCamera }) {
  const { apiFetch } = useAuth();
  const isEdit = !!editCamera;
  const [name, setName] = useState(editCamera?.name || '');
  const [rtspUrl, setRtspUrl] = useState('');
  const [zone, setZone] = useState(editCamera?.zone_name || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim() || !rtspUrl.trim()) {
      setError('Camera name and stream address are both required.');
      return;
    }
    if (!RTSP_URL_RE.test(rtspUrl.trim())) {
      setError('Stream address must be a valid RTSP URL, e.g. rtsp://username:password@camera-ip:554/path');
      return;
    }
    const id = isEdit ? editCamera.id : name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    setSaving(true);
    const res = await apiFetch(isEdit ? `/cameras/${editCamera.id}` : '/cameras', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        name: name.trim(),
        rtsp_url: rtspUrl.trim(),
        location: name.trim(),
        zone_name: zone.trim() || null,
        enabled: true,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.detail || `Could not ${isEdit ? 'update' : 'add'} camera.`);
      return;
    }
    onAdded();
    onClose();
  }

  return (
    <div className="cam-lightbox-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel" style={{ maxWidth: 420, width: '100%' }}>
        <div className="panel-head"><h2>{isEdit ? `Edit "${editCamera.name}"` : 'Add a camera'}</h2></div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Camera name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Front Door" autoFocus />
          </div>
          <div className="field">
            <label>Zone</label>
            <input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="e.g. Entrance, Storeroom" />
          </div>
          <div className="field">
            <label>Camera stream address (RTSP URL){isEdit ? ' — re-enter to reconnect' : ''}</label>
            <input value={rtspUrl} onChange={(e) => setRtspUrl(e.target.value)} placeholder="rtsp://username:password@camera-ip:554/path" />
          </div>
          {error && <div className="form-error show">{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-brass" disabled={saving}>
              {saving ? (isEdit ? 'Saving…' : 'Connecting…') : (isEdit ? 'Save changes' : 'Add camera')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
