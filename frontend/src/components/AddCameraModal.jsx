import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function AddCameraModal({ onClose, onAdded }) {
  const { apiFetch } = useAuth();
  const [name, setName] = useState('');
  const [rtspUrl, setRtspUrl] = useState('');
  const [location, setLocation] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [zones, setZones] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await apiFetch('/zones');
      if (res.ok) setZones(await res.json());
    })();
  }, [apiFetch]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim() || !rtspUrl.trim()) {
      setError('Camera name and stream address are both required.');
      return;
    }
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    setSaving(true);
    const res = await apiFetch('/cameras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        name: name.trim(),
        rtsp_url: rtspUrl.trim(),
        location: location.trim() || name.trim(),
        zone_id: zoneId || null,
        enabled: true,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.detail || 'Could not add camera.');
      return;
    }
    onAdded();
    onClose();
  }

  return (
    <div className="cam-lightbox-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel" style={{ maxWidth: 420, width: '100%' }}>
        <div className="panel-head"><h2>Add a camera</h2></div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Camera name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Front Door" autoFocus />
          </div>
          <div className="field">
            <label>Location / area</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Entrance, Storeroom" />
          </div>
          <div className="field">
            <label>Zone</label>
            <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              <option value="">No zone</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Camera stream address (RTSP URL)</label>
            <input value={rtspUrl} onChange={(e) => setRtspUrl(e.target.value)} placeholder="rtsp://username:password@camera-ip:554/path" />
          </div>
          {error && <div className="form-error show">{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-brass" disabled={saving}>{saving ? 'Connecting…' : 'Add camera'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}