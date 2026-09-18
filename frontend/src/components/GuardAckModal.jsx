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
    <div className="cam-lightbox-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel" style={{ maxWidth: 500, width: '100%', padding: '0', animation: 'fadeIn 0.2s ease-out' }}>
        
        <div className="panel-head" style={{ padding: '16px 20px', flexShrink: 0 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '16px' }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--brand)' }}></span>
            {isGuard ? 'Guard Alert Protocol Acknowledgment' : 'Acknowledge Security Alert'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
          
          <div style={{ background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Event ID #{alert.id}</span>
              <span style={{ background: 'rgba(255, 77, 77, 0.1)', color: '#ff4d4d', border: '1px solid rgba(255, 77, 77, 0.2)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                {alert.priority || 'High'} Priority
              </span>
            </div>
            <div style={{ fontSize: '14px', fontWeight: '500', color: '#fff', marginBottom: 4 }}>{alert.message}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              {alert.person_name && <span>Target: <b>{alert.person_name}</b> &bull; </span>}
              <span>Detected: {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(255, 77, 77, 0.1)', border: '1px solid rgba(255, 77, 77, 0.3)', color: '#ff4d4d', padding: '10px', borderRadius: '6px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          {isGuard && (
            <div style={{ background: 'rgba(255, 183, 0, 0.1)', border: '1px solid rgba(255, 183, 0, 0.3)', color: '#ffb700', padding: '12px', borderRadius: '6px', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '16px' }}>🛡️</span>
              <div>
                <strong>Guard Protocol Enforced:</strong> You must attach a verified photo proof and incident findings before dismissing.
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 'bold' }}>
              Proof of Inspection / Verification Photo {isGuard && <span style={{ color: '#ffb700' }}>*</span>}
            </label>
            
            {proofPreview ? (
              <div style={{ position: 'relative', background: '#000', border: '1px solid var(--border)', borderRadius: '6px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <img src={proofPreview} alt="Proof Preview" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  style={{ position: 'absolute', top: '8px', right: '8px', width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255, 0, 0, 0.8)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}
                  title="Remove image"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{ border: '1px dashed var(--border)', borderRadius: '6px', padding: '32px 16px', textAlign: 'center', cursor: 'pointer', background: 'var(--bg-page)', transition: 'border-color 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--brand)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>📷</div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#fff' }}>Click to upload proof photo from camera or gallery</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>PNG, JPG or JPEG up to 10MB</div>
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

          <div>
            <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 'bold' }}>
              Action Taken / Inspection Findings <span style={{ color: '#ffb700' }}>*</span>
            </label>
            <textarea
              required
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="E.g., Inspected front display counter. Verified employee credentials / all secure."
              className="field"
              style={{ width: '100%', minHeight: '80px', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-brass"
            >
              {loading ? 'Verifying...' : 'Submit & Acknowledge'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
