import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { useAuth } from '../context/AuthContext';

export const SettingsPage = () => {
  const { apiFetch } = useAuth();
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('21:00');
  const [saved, setSaved] = useState(false);

  const loadSettings = useCallback(async () => {
    const res = await apiFetch('/settings');
    if (res.ok) {
      const data = await res.json();
      setOpenTime(data.store_open_time || '09:00');
      setCloseTime(data.store_close_time || '21:00');
    }
  }, [apiFetch]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSave = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('store_open_time', openTime);
    formData.append('store_close_time', closeTime);
    const res = await apiFetch('/settings', { method: 'POST', body: formData });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      alert('Failed to save settings');
    }
  };

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Settings" />
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-md mx-auto">
            <h2 className="text-base font-bold mb-1">Store Operating Hours</h2>
            <p className="text-[var(--text-muted)] text-xs mb-4">
              Used to decide whether an unrecognized face is a customer or a threat.
            </p>
            <form onSubmit={handleSave} className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Opening Time</label>
                <input
                  type="time"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                  className="w-full bg-[var(--input-bg)] rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Closing Time</label>
                <input
                  type="time"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                  className="w-full bg-[var(--input-bg)] rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>
              <button
                type="submit"
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] font-semibold px-6 py-2 rounded-lg text-sm transition"
              >
                Save
              </button>
              {saved && <span className="text-xs text-emerald-400 ml-3">Saved</span>}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};