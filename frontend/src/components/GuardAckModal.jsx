import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

export const GuardAckModal = ({ alert, onClose, onSuccess }) => {
  const { session: user, apiFetch } = useAuth();
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
    <div
      className="cam-lightbox-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ backdropFilter: 'blur(2px)' }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
          overflow: 'hidden',
          animation: 'fadeIn 0.18s ease-out',
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '18px 22px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(193, 67, 46, 0.12)',
              border: '1px solid rgba(193, 67, 46, 0.35)',
              color: 'var(--brick)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 17,
                fontWeight: 600,
                color: 'var(--text)',
                margin: 0,
                lineHeight: 1.25,
              }}
            >
              {isGuard ? 'Guard Alert Acknowledgment' : 'Acknowledge Security Alert'}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Confirm inspection before dismissing this event
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* EVENT SUMMARY */}
          <div
            style={{
              background: 'var(--bg-soft)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11.5,
                  letterSpacing: '0.04em',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                }}
              >
                Event #{alert.id}
              </span>
              <span
                style={{
                  background: 'rgba(193, 67, 46, 0.12)',
                  color: 'var(--brick)',
                  border: '1px solid rgba(193, 67, 46, 0.3)',
                  padding: '2px 9px',
                  borderRadius: 999,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                {alert.priority || 'High'} priority
              </span>
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>
              {alert.message}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12.5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {alert.person_name && (
                <span>Target: <b style={{ color: 'var(--text)' }}>{alert.person_name}</b></span>
              )}
              <span>&bull; Detected {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>
          </div>

          {error && (
            <div
              style={{
                background: 'rgba(193, 67, 46, 0.1)',
                border: '1px solid rgba(193, 67, 46, 0.3)',
                color: 'var(--brick)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {isGuard && (
            <div
              style={{
                background: 'rgba(176, 141, 87, 0.1)',
                borderLeft: '3px solid var(--brass)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                fontSize: 12.5,
                color: 'var(--text)',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--brass)" strokeWidth="2" style={{ marginTop: 1, flexShrink: 0 }}>
                <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" />
              </svg>
              <span>
                <b style={{ color: 'var(--brass)' }}>Protocol required —</b> attach a verified photo and note your inspection findings before dismissing.
              </span>
            </div>
          )}

          {/* PHOTO PROOF */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                marginBottom: 8,
                fontWeight: 600,
              }}
            >
              Proof photo {isGuard && <span style={{ color: 'var(--brass)' }}>*</span>}
            </label>

            {proofPreview ? (
              <div
                style={{
                  position: 'relative',
                  background: '#000',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  height: 170,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                <img src={proofPreview} alt="Proof preview" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  title="Remove image"
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.65)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '1.5px dashed var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  padding: '26px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'var(--bg-soft)',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; e.currentTarget.style.background = 'rgba(176, 141, 87, 0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.background = 'var(--bg-soft)'; }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    margin: '0 auto 10px',
                    borderRadius: '50%',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                  Click to upload proof photo
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
                  PNG, JPG or JPEG — up to 10MB
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>

          {/* NOTES */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                marginBottom: 8,
                fontWeight: 600,
              }}
            >
              Inspection findings <span style={{ color: 'var(--brass)' }}>*</span>
            </label>
            <textarea
              required
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Inspected front display counter — verified employee credentials, all secure."
              className="field"
              style={{
                width: '100%',
                minHeight: 78,
                resize: 'vertical',
                borderRadius: 'var(--radius-md)',
              }}
            />
          </div>

          {/* ACTIONS */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
              marginTop: 4,
              paddingTop: 16,
              borderTop: '1px solid var(--border)',
            }}
          >
            <button type="button" onClick={onClose} disabled={loading} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn btn-brass">
              {loading ? 'Verifying…' : 'Submit & Acknowledge'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};