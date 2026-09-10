import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

export const GuardAckModal = ({ alert, onClose, onSuccess }) => {
  const { user, apiFetch } = useAuth();
  const [notes, setNotes] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const role = (user?.role || '').toLowerCase();
  const isGuard = role === 'guard';

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setProofFile(file);
      const url = URL.createObjectURL(file);
      setProofPreview(url);
    }
  };

  const handleRemovePhoto = () => {
    setProofFile(null);
    if (proofPreview) {
      URL.revokeObjectURL(proofPreview);
      setProofPreview(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!notes.trim()) {
      setError('Please provide event details/inspection notes.');
      return;
    }

    if (isGuard && !proofFile) {
      setError('Guard Alert Protocol: Mandatory proof image upload is required to acknowledge this event.');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('notes', notes.trim());
      if (proofFile) {
        formData.append('proof', proofFile);
      }

      const res = await apiFetch(`/alerts/${alert.id}/acknowledge`, {
        method: 'POST',
        body: formData,
      });

      let data = {};
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        if (!res.ok) {
          throw new Error(`Server returned error (${res.status}): ${text.slice(0, 100)}`);
        }
        throw new Error('Failed to parse server response');
      }

      if (!res.ok || data.ok === false) {
        throw new Error(data.detail || data.error || 'Failed to acknowledge alert');
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Acknowledgment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-amber-500 animate-pulse"></span>
            <h3 className="font-semibold text-base text-slate-100">
              {isGuard ? 'Guard Alert Protocol Acknowledgment' : 'Acknowledge Security Alert'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-slate-200 text-lg leading-none p-1 rounded hover:bg-[var(--bg-panel-3)] transition"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Alert Summary Box */}
          <div className="bg-[var(--bg-page)] border border-[var(--border-color)] rounded-lg p-3.5 space-y-1 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-mono text-[var(--text-muted)] uppercase tracking-wider">Event ID #{alert.id}</span>
              <span className="uppercase px-2 py-0.5 rounded font-bold text-[10px] bg-red-500/10 text-red-400 border border-red-500/20">
                {alert.priority || 'High'} Priority
              </span>
            </div>
            <div className="text-sm font-medium text-slate-100 mt-1">{alert.message}</div>
            <div className="text-[11px] text-[var(--text-muted)]">
              {alert.person_name && <span>Target: <b>{alert.person_name}</b> • </span>}
              <span>Detected: {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg text-xs border border-red-500/40 bg-red-500/10 text-red-400">
              {error}
            </div>
          )}

          {isGuard && (
            <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-center gap-2">
              <span>🛡️</span>
              <span><strong>Guard Protocol Enforced:</strong> You must attach a verified photo proof and incident findings before dismissing.</span>
            </div>
          )}

          {/* Proof Photo Upload */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Proof of Inspection / Verification Photo {isGuard && <span className="text-amber-400">*</span>}
            </label>
            
            {proofPreview ? (
              <div className="relative rounded-lg overflow-hidden border border-[var(--border-color)] bg-black max-h-48 flex items-center justify-center">
                <img src={proofPreview} alt="Proof Preview" className="max-h-48 w-full object-contain" />
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs shadow-lg transition"
                  title="Remove image"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[var(--border-color)] hover:border-amber-500/60 rounded-lg p-5 text-center cursor-pointer transition bg-[var(--bg-page)]/50 hover:bg-[var(--bg-panel-3)]"
              >
                <div className="text-2xl mb-1">📷</div>
                <div className="text-xs font-medium text-slate-200">
                  Click to upload proof photo from camera or gallery
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mt-1">PNG, JPG or JPEG up to 10MB</div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Action Notes / Description */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Action Taken / Inspection Findings <span className="text-amber-400">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="E.g., Inspected front display counter. Verified employee credentials / all secure."
              className="w-full bg-[var(--bg-page)] border border-[var(--border-color)] rounded-lg p-3 text-xs text-slate-100 outline-none focus:border-amber-500 transition resize-none placeholder:text-slate-500"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg border border-[var(--border-color)] text-xs text-[var(--text-muted)] hover:text-slate-200 hover:bg-[var(--bg-panel-3)] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-xs transition shadow flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="w-3 h-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                  <span>Verifying...</span>
                </>
              ) : (
                <span>Submit & Acknowledge</span>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
