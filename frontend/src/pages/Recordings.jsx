import React, { useEffect, useState } from 'react';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Recordings() {
  const { session, apiFetch } = useAuth();
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);

  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    loadRecordings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function loadRecordings() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/recordings?page=${page}&limit=${pageSize}`);
      if (!res.ok) throw new Error('Failed to load recordings');
      const data = await res.json();
      setRecordings(data.recordings || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || 'Error loading recordings.');
      setRecordings([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  return (
    <Shell active="recordings" title="Video Recordings">
      <div className="page-head">
        <span className="eyebrow">Video Recordings</span>
        <h1>Recordings</h1>
        <p>Recent automated video clips triggered by unknown persons.</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
        <button className="btn btn-outline btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
        <span style={{ alignSelf: 'center', fontSize: 13.5 }}>Page {page} of {totalPages}</span>
        <button className="btn btn-outline btn-sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        <button className="btn btn-brass btn-sm" onClick={loadRecordings} disabled={loading} style={{ marginLeft: 8 }}>
          {loading ? <><span className="spinner" /> Refreshing...</> : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="banner banner-error">
          <span>{error}</span>
          <button onClick={loadRecordings}>Retry</button>
        </div>
      )}

      <div className="panel">
        <div className="table-wrap">
          <table className="records" style={{ width: '100%', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px' }}>Timestamp</th>
                <th style={{ padding: '12px' }}>Camera</th>
                <th style={{ padding: '12px' }}>Zone</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {recordings.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '32px', color: '#666' }}>
                    {loading ? 'Loading...' : 'No recordings found.'}
                  </td>
                </tr>
              ) : (
                recordings.map((rec) => (
                  <tr key={rec.id}>
                    <td style={{ padding: '12px' }}>{formatDateTime(rec.timestamp)}</td>
                    <td style={{ padding: '12px' }}>{rec.camera_name}</td>
                    <td style={{ padding: '12px', textTransform: 'capitalize' }}>{rec.zone_name || '-'}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => setSelectedVideo(rec)}
                      >
                        Play Video
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedVideo && (
        <div className="cam-lightbox-backdrop" onClick={() => setSelectedVideo(null)}>
          <div className="panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%' }}>
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Recording - {selectedVideo.camera_name} ({formatDateTime(selectedVideo.timestamp)})</h2>
              <button className="btn btn-outline btn-sm" onClick={() => setSelectedVideo(null)}>
                Close
              </button>
            </div>
            <div style={{ padding: '16px', background: '#000', borderBottomLeftRadius: 6, borderBottomRightRadius: 6 }}>
              <video
                src={selectedVideo.video_url}
                controls
                autoPlay
                style={{ width: '100%', maxHeight: '70vh', display: 'block' }}
              >
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
