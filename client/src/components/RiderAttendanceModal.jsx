import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../config/api';

const ATTENDANCE_DAYS = ['Day 1', 'Day 2', 'Day 3'];

function formatTimeAmPm(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatCheckInTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return formatTimeAmPm(d);
}

function dayBadgeStyle(day) {
  const map = {
    'Day 1': { bg: '#E3F2FD', fg: '#1565C0' },
    'Day 2': { bg: '#FFF8E1', fg: '#F57C00' },
    'Day 3': { bg: '#F3E5F5', fg: '#7B1FA2' },
  };
  return map[day] || { bg: '#F5F5F5', fg: '#666' };
}

async function getCameraStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera is not supported in this browser. Use HTTPS or localhost.');
  }
  const constraints = [
    { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: true, audio: false },
  ];
  let lastErr;
  for (const c of constraints) {
    try {
      return await navigator.mediaDevices.getUserMedia(c);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Could not access camera');
}

export default function RiderAttendanceModal({ rider, authFetch, onClose }) {
  const [selectedDay, setSelectedDay] = useState('Day 1');
  const [currentTime, setCurrentTime] = useState(() => formatTimeAmPm(new Date()));
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const riderId = rider?.rider_id;
  const riderName = rider?.rider_name || 'Rider';

  useEffect(() => {
    const tick = () => setCurrentTime(formatTimeAmPm(new Date()));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
    setCameraOpen(false);
    setCameraError('');
  }, []);

  useEffect(() => {
    if (!cameraOpen) return undefined;

    let cancelled = false;

    (async () => {
      setCameraError('');
      setCameraReady(false);
      try {
        const stream = await getCameraStream();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          setCameraReady(true);
        }
      } catch (e) {
        if (!cancelled) {
          setCameraError(e.message || 'Could not open camera. Allow camera permission and try again.');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [cameraOpen]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, []);

  const loadHistory = useCallback(async () => {
    if (!riderId) return;
    setHistoryLoading(true);
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/riders/${riderId}/attendance`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to load attendance');
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message || 'Failed to load attendance');
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [authFetch, riderId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const clearPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const openCamera = () => {
    setCameraError('');
    setCameraOpen(true);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !cameraReady) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      setCameraError('Camera not ready. Wait a moment and try again.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError('Failed to capture photo');
          return;
        }
        if (photoPreview) URL.revokeObjectURL(photoPreview);
        const file = new File([blob], `attendance-${riderId}-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setPhotoFile(file);
        setPhotoPreview(URL.createObjectURL(blob));
        stopCamera();
      },
      'image/jpeg',
      0.92
    );
  };

  const markPresent = async () => {
    if (!riderId) return;
    setSubmitting(true);
    setErr('');
    try {
      const form = new FormData();
      form.append('day_label', selectedDay);
      if (photoFile) form.append('photo', photoFile);

      const res = await authFetch(`${API_BASE}/riders/${riderId}/attendance`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        throw new Error(data.message || `Attendance already marked for ${selectedDay}`);
      }
      if (!res.ok) throw new Error(data.message || 'Failed to mark attendance');

      showToast('Attendance marked successfully');
      clearPhoto();
      await loadHistory();
    } catch (e) {
      setErr(e.message || 'Failed to mark attendance');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteRecord = async (record) => {
    const ok = window.confirm(`Delete attendance for ${record.day_label}?`);
    if (!ok) return;
    setDeletingId(record.id);
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/riders/attendance/${record.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Delete failed');
      showToast('Attendance deleted');
      await loadHistory();
    } catch (e) {
      setErr(e.message || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div
      className="ops-sheet-overlay or-rider-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={handleClose}
      role="presentation"
    >
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: toast.type === 'success' ? '#E8F5E9' : '#FFF5F2',
            color: toast.type === 'success' ? '#2E7D32' : '#C62828',
            padding: '14px 20px',
            borderRadius: '8px',
            border: toast.type === 'success' ? '1px solid #C8E6C9' : '1px solid #FFCDD2',
            fontSize: '11px',
            zIndex: 1300,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            maxWidth: '320px',
          }}
        >
          {toast.message}
        </div>
      )}

      {cameraOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1400,
            background: '#000',
            display: 'flex',
            flexDirection: 'column',
          }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Take attendance photo"
        >
          <div style={{ flex: 1, position: 'relative', minHeight: 0, background: '#111' }}>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: cameraError ? 'none' : 'block',
              }}
            />
            {!cameraReady && !cameraError && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '13px',
                }}
              >
                Opening camera…
              </div>
            )}
            {cameraError && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '24px',
                  color: '#ffcdd2',
                  fontSize: '12px',
                  textAlign: 'center',
                  lineHeight: 1.5,
                }}
              >
                {cameraError}
              </div>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              gap: '10px',
              padding: '14px 16px',
              paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
              background: '#1a1a1a',
            }}
          >
            <button
              type="button"
              onClick={stopCamera}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #444',
                background: 'transparent',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={capturePhoto}
              disabled={!cameraReady}
              style={{
                flex: 2,
                padding: '12px',
                borderRadius: '8px',
                border: 'none',
                background: cameraReady ? '#FF5722' : '#666',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: cameraReady ? 'pointer' : 'not-allowed',
              }}
            >
              Capture photo
            </button>
          </div>
        </div>
      )}

      <div
        className="ops-sheet-panel or-rider-modal-panel"
        style={{
          background: '#fff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
          padding: '18px',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="rider-attendance-title"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
          <h2 id="rider-attendance-title" style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#333' }}>
            Mark Attendance — {riderName}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            style={{
              border: 'none',
              background: '#F5F5F5',
              borderRadius: '8px',
              width: '32px',
              height: '32px',
              cursor: 'pointer',
              fontSize: '16px',
              color: '#666',
            }}
          >
            ×
          </button>
        </div>

        {err && (
          <div
            style={{
              marginBottom: '12px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: '#FFF5F2',
              color: '#C62828',
              fontSize: '11px',
              border: '1px solid #FFCDD2',
            }}
          >
            {err}
          </div>
        )}

        <section style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Mark new attendance
          </h3>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '6px' }}>Day</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {ATTENDANCE_DAYS.map((day) => {
                const active = selectedDay === day;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: active ? '1px solid #FF5722' : '1px solid #e0e0e0',
                      background: active ? '#FFF3E0' : '#fff',
                      color: active ? '#E64A19' : '#444',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '6px' }}>Time</div>
            <input
              type="text"
              readOnly
              value={currentTime}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 11px',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                fontSize: '12px',
                background: '#FAFAFA',
                color: '#333',
              }}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '6px' }}>Photo (optional)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={openCamera}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #e0e0e0',
                  background: '#fff',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: '#333',
                }}
              >
                {photoPreview ? 'Retake photo' : 'Take photo'}
              </button>
              {photoPreview && (
                <img
                  src={photoPreview}
                  alt="Attendance preview"
                  style={{
                    width: '56px',
                    height: '56px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0',
                  }}
                />
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={markPresent}
            disabled={submitting}
            style={{
              width: '100%',
              padding: '11px 14px',
              borderRadius: '8px',
              border: 'none',
              background: submitting ? '#ffab91' : '#FF5722',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Saving…' : 'Mark Present'}
          </button>
        </section>

        <section>
          <h3 style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Attendance history
          </h3>

          {historyLoading ? (
            <div style={{ fontSize: '11px', color: '#888', padding: '8px 0' }}>Loading…</div>
          ) : history.length === 0 ? (
            <div style={{ fontSize: '11px', color: '#888', padding: '8px 0' }}>No attendance records yet.</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {history.map((rec) => {
                const badge = dayBadgeStyle(rec.day_label);
                return (
                  <li
                    key={rec.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #eee',
                      background: '#FAFAFA',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '10px',
                        fontWeight: 600,
                        background: badge.bg,
                        color: badge.fg,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {rec.day_label}
                    </span>
                    <span style={{ fontSize: '11px', color: '#444', fontWeight: 600, minWidth: '72px' }}>
                      {formatCheckInTime(rec.check_in_time)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {rec.photo_url ? (
                        <a href={rec.photo_url} target="_blank" rel="noopener noreferrer" title="View photo">
                          <img
                            src={rec.photo_url}
                            alt=""
                            style={{
                              width: 50,
                              height: 50,
                              objectFit: 'cover',
                              borderRadius: '8px',
                              border: '1px solid #e0e0e0',
                              display: 'block',
                            }}
                          />
                        </a>
                      ) : (
                        <span style={{ fontSize: '10px', color: '#aaa', fontStyle: 'italic' }}>No photo</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteRecord(rec)}
                      disabled={deletingId === rec.id}
                      title={`Delete attendance for ${rec.day_label}`}
                      aria-label={`Delete attendance for ${rec.day_label}`}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#C62828',
                        cursor: deletingId === rec.id ? 'not-allowed' : 'pointer',
                        fontSize: '16px',
                        padding: '4px 8px',
                        lineHeight: 1,
                      }}
                    >
                      {deletingId === rec.id ? '…' : '🗑'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
