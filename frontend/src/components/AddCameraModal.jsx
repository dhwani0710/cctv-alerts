import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import useOffices from '../hooks/useOffices.js';
import useAbort from '../hooks/useAbort.js';

const RTSP_URL_RE = /^rtsps?:\/\/(?:[^\s@]+@)?[a-zA-Z0-9.-]+(?::\d{1,5})?(?:\/[^\s]*)?$/i;

export default function AddCameraModal({ onClose, onAdded, editCamera, defaultOfficeId }) {
  const { apiFetch, isSuperAdmin, officeId: myOfficeId } = useAuth();
  const { offices, officeName } = useOffices();
  const { next, abort } = useAbort();
  const isEdit = !!editCamera;
  const [name, setName] = useState(editCamera?.name || '');
  const [rtspUrl, setRtspUrl] = useState('');
  const [zone, setZone] = useState(editCamera?.zone_name || '');
  const [officeId, setOfficeId] = useState(
    editCamera?.office_id != null
      ? String(editCamera.office_id)
      : defaultOfficeId != null ? String(defaultOfficeId) : ''
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function handleClose() {
    abort();
    onClose();
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') handleClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    const targetOffice = isSuperAdmin ? officeId : myOfficeId;
    if (!isEdit && (targetOffice == null || targetOffice === '')) {
      setError('Select an office for this camera.');
      return;
    }

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const id = isEdit ? editCamera.id : `${targetOffice}-${slug}`;

    const signal = next();
    setSaving(true);
    try {
      const res = await apiFetch(isEdit ? `/cameras/${editCamera.id}` : '/cameras', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          id,
          name: name.trim(),
          rtsp_url: rtspUrl.trim(),
          location: name.trim(),
          zone_name: zone.trim() || null,
          enabled: true,
          ...(isEdit ? {} : { office_id: isNaN(Number(targetOffice)) ? targetOffice : Number(targetOffice) }),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || `Could not ${isEdit ? 'update' : 'add'} camera.`);
        return;
      }
      onAdded();
      onClose();
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cam-lightbox-backdrop" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="panel" style={{ maxWidth: 420, width: '100%' }}>
        <div className="panel-head"><h2>{isEdit ? `Edit "${editCamera.name}"` : 'Add a camera'}</h2></div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Office</label>
            {isSuperAdmin && !isEdit ? (
              <select value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
                <option value="">Select office…</option>
                {offices.map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
              </select>
            ) : (
              <input
                value={officeName(isEdit ? editCamera.office_id : myOfficeId)}
                disabled
                readOnly
              />
            )}
          </div>
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
            <button type="button" className="btn btn-outline" onClick={handleClose}>Cancel</button>
            <button type="submit" className="btn btn-brass" disabled={saving}>
              {saving ? (isEdit ? 'Saving…' : 'Connecting…') : (isEdit ? 'Save changes' : 'Add camera')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}