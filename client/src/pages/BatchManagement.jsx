import { useState, useEffect, useCallback } from 'react';
import { API_BASE as API } from '../config/api';

const EMPTY_FORM = {
  batch_number: '',
  received_in_kgs: '',
  received_in_units: '',
  rotten: '',
  compensation_or_gift: '',
  weight_loss: '',
  description: '',
  received_date: '',
};

function formatKg(val) {
  const n = Number(val);
  if (Number.isNaN(n)) return '—';
  return `${Math.round(n).toLocaleString('en-PK')} KG`;
}

function formatDate(val) {
  if (!val) return '—';
  return String(val).split('T')[0];
}

export default function BatchManagement() {
  const [batches, setBatches] = useState([]);
  const [year, setYear] = useState('2026');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const y = encodeURIComponent(year);
      const res = await fetch(`${API}/batches?year=${y}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to load batches');
      const data = await res.json();
      setBatches(Array.isArray(data.data) ? data.data : []);
    } catch (e) {
      setError(e.message || 'Failed to load batches');
    } finally {
      setLoading(false);
    }
  }, [token, year]);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditId(row.batch_id);
    setForm({
      batch_number: row.batch_number || '',
      received_in_kgs: row.received_in_kgs ?? '',
      received_in_units: row.received_in_units ?? '',
      rotten: row.rotten ?? '',
      compensation_or_gift: row.compensation_or_gift ?? '',
      weight_loss: row.weight_loss ?? '',
      description: row.description || '',
      received_date: formatDate(row.received_date) === '—' ? '' : formatDate(row.received_date),
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.batch_number.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const url = editId ? `${API}/batches/${editId}` : `${API}/batches`;
      const res = await fetch(url, {
        method: editId ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Save failed');
      setModalOpen(false);
      fetchBatches();
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/batches/${deleteTarget.batch_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Delete failed');
      setDeleteTarget(null);
      fetchBatches();
    } catch (e) {
      setError(e.message || 'Delete failed');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e0e0e0',
    fontSize: '12px', boxSizing: 'border-box', fontFamily: 'inherit',
  };

  return (
    <div style={{ padding: '19px', fontFamily: "'Poppins', 'Inter', sans-serif", background: '#F9FAFB', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#333' }}>Batch Management</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: '6px', border: '1px solid #e0e0e0',
              fontSize: '12px', background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
            }}
            aria-label="Filter by year"
          >
            <option value="all">All Year</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>
          <button type="button" onClick={openCreate}
            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#FF5722', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            Add New Batch
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FFF5F2', color: '#FF5722', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '12px', border: '1px solid #FFE0D6' }}>
          {error}
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '12px' }}>Loading…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr style={{ background: '#fafafa', borderBottom: '1px solid #eee' }}>
                {['Batch', 'Received (KG)', 'Units', 'Rotten', 'Comp/Gift', 'Weight Loss', 'Received Date', 'Description', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#666' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: '#999', fontSize: '12px' }}>No batches for {year === 'all' ? 'any year' : year}. Click Add New Batch.</td></tr>
              ) : batches.map((row) => (
                <tr key={row.batch_id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 600 }}>{row.batch_number}</td>
                  <td style={{ padding: '10px 12px', fontSize: '12px' }}>{formatKg(row.received_in_kgs)}</td>
                  <td style={{ padding: '10px 12px', fontSize: '12px' }}>{row.received_in_units ?? '—'}</td>
                  <td style={{ padding: '10px 12px', fontSize: '12px' }}>{formatKg(row.rotten)}</td>
                  <td style={{ padding: '10px 12px', fontSize: '12px' }}>{formatKg(row.compensation_or_gift)}</td>
                  <td style={{ padding: '10px 12px', fontSize: '12px' }}>{formatKg(row.weight_loss)}</td>
                  <td style={{ padding: '10px 12px', fontSize: '12px' }}>{formatDate(row.received_date)}</td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.description || '—'}</td>
                  <td style={{ padding: '10px 12px', fontSize: '12px' }}>
                    <button type="button" onClick={() => openEdit(row)} style={{ marginRight: '8px', padding: '4px 10px', borderRadius: '4px', border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer', fontSize: '11px' }}>Edit</button>
                    <button type="button" onClick={() => setDeleteTarget(row)} style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer', fontSize: '11px' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={() => !submitting && setModalOpen(false)}>
          <div style={{ background: '#fff', borderRadius: '10px', padding: '20px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600 }}>{editId ? 'Edit Batch' : 'Add New Batch'}</h3>
            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '12px' }}>
              <label style={{ fontSize: '11px', color: '#666' }}>
                Batch Number *
                <input style={inputStyle} value={form.batch_number} onChange={(e) => setForm((p) => ({ ...p, batch_number: e.target.value }))} required placeholder="e.g. 01" />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ fontSize: '11px', color: '#666' }}>
                  Received (KG)
                  <input type="number" min="0" step="0.01" style={inputStyle} value={form.received_in_kgs} onChange={(e) => setForm((p) => ({ ...p, received_in_kgs: e.target.value }))} />
                </label>
                <label style={{ fontSize: '11px', color: '#666' }}>
                  Received (Units)
                  <input type="number" min="0" style={inputStyle} value={form.received_in_units} onChange={(e) => setForm((p) => ({ ...p, received_in_units: e.target.value }))} />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <label style={{ fontSize: '11px', color: '#666' }}>
                  Rotten (KG)
                  <input type="number" min="0" step="0.01" style={inputStyle} value={form.rotten} onChange={(e) => setForm((p) => ({ ...p, rotten: e.target.value }))} />
                </label>
                <label style={{ fontSize: '11px', color: '#666' }}>
                  Compensation / Gift (KG)
                  <input type="number" min="0" step="0.01" style={inputStyle} value={form.compensation_or_gift} onChange={(e) => setForm((p) => ({ ...p, compensation_or_gift: e.target.value }))} />
                </label>
                <label style={{ fontSize: '11px', color: '#666' }}>
                  Weight Loss (KG)
                  <input type="number" min="0" step="0.01" style={inputStyle} value={form.weight_loss} onChange={(e) => setForm((p) => ({ ...p, weight_loss: e.target.value }))} />
                </label>
              </div>
              <label style={{ fontSize: '11px', color: '#666' }}>
                Received Date
                <input type="date" style={inputStyle} value={form.received_date} onChange={(e) => setForm((p) => ({ ...p, received_date: e.target.value }))} />
              </label>
              <label style={{ fontSize: '11px', color: '#666' }}>
                Description
                <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              </label>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" onClick={() => setModalOpen(false)} disabled={submitting}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                <button type="submit" disabled={submitting}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#FF5722', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '12px' }}>
                  {submitting ? 'Saving…' : editId ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '10px', padding: '20px', maxWidth: '400px', width: '100%' }}>
            <p style={{ margin: '0 0 16px', fontSize: '13px' }}>Delete batch <strong>{deleteTarget.batch_number}</strong>? This cannot be undone.</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setDeleteTarget(null)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={handleDelete} disabled={submitting} style={{ padding: '8px 14px', borderRadius: '6px', border: 'none', background: '#b91c1c', color: '#fff', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
