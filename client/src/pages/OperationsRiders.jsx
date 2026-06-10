import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../config/api';

const RIDER_STATUSES = ['Available', 'On Delivery', 'Off Duty', 'Suspended'];

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 11px',
  borderRadius: '8px',
  border: '1px solid #e0e0e0',
  fontSize: '12px',
  background: '#fff',
};

const compactSelectStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid #e0e0e0',
  fontSize: '11px',
  background: '#FAFAFA',
  color: '#333',
};

function money(n) {
  return `Rs. ${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function riderStatusBadge(status) {
  const st = status || 'Available';
  const map = {
    Available: { bg: '#E8F5E9', fg: '#2E7D32' },
    'On Delivery': { bg: '#E3F2FD', fg: '#1565C0' },
    'Off Duty': { bg: '#FFF8E1', fg: '#F57C00' },
    Suspended: { bg: '#FFEBEE', fg: '#C62828' },
  };
  const { bg, fg } = map[st] || map.Available;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: '999px',
        fontSize: '10px',
        fontWeight: 600,
        background: bg,
        color: fg,
        whiteSpace: 'nowrap',
      }}
    >
      {st}
    </span>
  );
}

export default function OperationsRiders() {
  const [riders, setRiders] = useState([]);
  const [batches, setBatches] = useState([]);
  const [batch, setBatch] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    rider_name: '', contact: '', vehicle: '', cnic: '', number_plate: '', amount_per_delivery: '',
  });
  const [ordersModal, setOrdersModal] = useState(null);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const token = () => localStorage.getItem('token');

  const loadBatches = useCallback(async () => {
    const res = await fetch(`${API_BASE}/operations/batches`, { headers: { Authorization: `Bearer ${token()}` } });
    const data = await res.json().catch(() => ({}));
    const list = Array.isArray(data.batches) ? data.batches : [];
    setBatches(list);
    if (!batch && list.length) setBatch(list[0]);
  }, [batch]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const q = batch ? `?batch=${encodeURIComponent(batch)}` : '';
      const res = await fetch(`${API_BASE}/operations/riders/details${q}`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to load riders');
      setRiders(Array.isArray(data.riders) ? data.riders : []);
    } catch (e) {
      setErr(e.message || 'Error loading riders');
    } finally {
      setLoading(false);
    }
  }, [batch]);

  useEffect(() => { loadBatches(); }, [loadBatches]);
  useEffect(() => { load(); }, [load]);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('');
  };

  const filteredRiders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return riders.filter((r) => {
      if (statusFilter && (r.availability || 'Available') !== statusFilter) return false;
      if (!q) return true;
      return [r.rider_name, r.contact, r.vehicle, r.number_plate].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [riders, search, statusFilter]);

  const patchRider = async (riderId, patch) => {
    setSavingId(riderId);
    setErr('');
    try {
      const res = await fetch(`${API_BASE}/operations/riders/${riderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      await load();
    } catch (e) {
      setErr(e.message || 'Update failed');
    } finally {
      setSavingId(null);
    }
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    setSavingId(-1);
    setErr('');
    try {
      const res = await fetch(`${API_BASE}/operations/riders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Create failed');
      setAddOpen(false);
      setForm({ rider_name: '', contact: '', vehicle: '', cnic: '', number_plate: '', amount_per_delivery: '' });
      load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSavingId(null);
    }
  };

  const openOrders = async (rider) => {
    setOrdersModal({ rider, orders: [], loadError: null });
    setOrdersLoading(true);
    setErr('');
    try {
      const qs = new URLSearchParams();
      if (batch) qs.set('batch', batch);
      const res = await fetch(
        `${API_BASE}/operations/riders/${rider.rider_id}/orders${qs.toString() ? `?${qs}` : ''}`,
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to load rider orders');
      setOrdersModal({
        rider: data.rider || rider,
        orders: Array.isArray(data.orders) ? data.orders : [],
        loadError: null,
      });
    } catch (e) {
      const msg = e.message || 'Failed to load rider orders';
      setErr(msg);
      setOrdersModal((prev) => (prev ? { ...prev, orders: [], loadError: msg } : prev));
    } finally {
      setOrdersLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: '20px 24px',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        background: '#F7F7F8',
      }}
    >
      <Link
        to="/operations"
        style={{ fontSize: '12px', fontWeight: 600, color: '#FF5722', textDecoration: 'none', marginBottom: '14px', display: 'inline-block' }}
      >
        ← Operations modules
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#222' }}>Rider Management</h1>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#666', maxWidth: '760px', lineHeight: 1.5 }}>
            Register riders, track availability, update operational status, and monitor delivery earnings and assigned orders (2026 orders only).
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {savingId != null && savingId > 0 && (
            <span style={{ fontSize: '10px', color: '#999', fontWeight: 600 }}>Saving…</span>
          )}
          <button
            type="button"
            onClick={load}
            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #e0e0e0', background: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: '#555' }}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#FF5722', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            Add Rider
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: '16px',
          alignItems: 'flex-end',
        }}
      >
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>
            Search (name, phone, vehicle)
          </label>
          <input
            type="text"
            placeholder="Search rider…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, padding: '8px 10px', fontSize: '11px' }}
          />
        </div>
        <div style={{ width: 140 }}>
          <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Rider status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, padding: '8px 10px', fontSize: '11px' }}>
            <option value="">All</option>
            {RIDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ width: 120 }}>
          <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Batch</label>
          <select value={batch} onChange={(e) => setBatch(e.target.value)} style={{ ...inputStyle, padding: '8px 10px', fontSize: '11px' }}>
            <option value="">All</option>
            {batches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={resetFilters}
          style={{
            padding: '8px 14px',
            height: '35px',
            background: '#fff',
            color: '#555',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Reset
        </button>
      </div>

      {err && (
        <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '8px', marginBottom: '12px', fontSize: '11px', fontWeight: 600 }}>
          {err}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '12px' }}>Loading…</div>
        ) : filteredRiders.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#888', fontSize: '12px', border: '1px solid #e8e8e8', borderRadius: '10px', background: '#fff' }}>
            {riders.length === 0 ? 'No riders found.' : 'No riders match the current filters.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
            {filteredRiders.map((r) => (
              <div
                key={r.rider_id}
                style={{
                  background: '#fff',
                  border: '1px solid #e8e8e8',
                  borderRadius: '14px',
                  padding: '14px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#333', lineHeight: 1.3 }}>
                      {r.rider_name}
                    </h3>
                    <p style={{ margin: '5px 0 0', fontSize: '11px', color: '#777', lineHeight: 1.5 }}>
                      {[r.contact, r.vehicle, r.number_plate].filter(Boolean).join(' • ') || 'No phone'}
                    </p>
                    <p style={{ margin: '6px 0 0', fontSize: '10px', color: '#999', lineHeight: 1.45 }}>
                      Average delivery time:{' '}
                      <span style={{ color: '#1565C0', fontWeight: 600 }}>—</span>
                    </p>
                  </div>
                  {riderStatusBadge(r.availability)}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '10px',
                    background: '#FAFAFA',
                    borderRadius: '10px',
                    padding: '10px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Delivered</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#333' }}>{r.deliveries_completed || 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Pending</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#333' }}>{r.pending_deliveries ?? 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Per delivery</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#333' }}>{money(r.amount_per_delivery)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Total made</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#333' }}>{money(r.total_amount_made)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Total paid</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#333' }}>{money(r.total_paid)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Balance due</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: (r.balance_due || 0) > 0 ? '#C62828' : '#2E7D32' }}>
                      {money(r.balance_due)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '4px' }}>Change status</label>
                    <select
                      value={r.availability || 'Available'}
                      onChange={(e) => patchRider(r.rider_id, { availability: e.target.value })}
                      style={compactSelectStyle}
                      disabled={savingId === r.rider_id}
                    >
                      {RIDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '4px' }}>Amount / delivery</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      key={`amt-${r.rider_id}-${r.amount_per_delivery}`}
                      defaultValue={r.amount_per_delivery || 0}
                      onBlur={(e) => {
                        const next = Number(e.target.value || 0);
                        if (Number(next) !== Number(r.amount_per_delivery || 0)) {
                          patchRider(r.rider_id, { amount_per_delivery: next });
                        }
                      }}
                      style={compactSelectStyle}
                      disabled={savingId === r.rider_id}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '4px' }}>Total paid</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      key={`paid-${r.rider_id}-${r.total_paid}`}
                      defaultValue={r.total_paid || 0}
                      onBlur={(e) => {
                        const next = Number(e.target.value || 0);
                        if (Number(next) !== Number(r.total_paid || 0)) {
                          patchRider(r.rider_id, { total_paid: next });
                        }
                      }}
                      style={compactSelectStyle}
                      disabled={savingId === r.rider_id}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => openOrders(r)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #e0e0e0',
                        background: '#fff',
                        color: '#333',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      View assigned orders
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {addOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => setAddOpen(false)}>
          <form onSubmit={submitAdd} onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '14px', padding: '20px', width: '100%', maxWidth: '440px', boxShadow: '0 12px 40px rgba(0,0,0,0.15)' }}>
            <h2 style={{ margin: '0 0 14px', fontSize: '16px', fontWeight: 600 }}>Add Rider</h2>
            {['rider_name', 'contact', 'vehicle', 'cnic', 'number_plate', 'amount_per_delivery'].map((key) => (
              <div key={key} style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', color: '#666', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</label>
                <input
                  required={key === 'rider_name'}
                  type={key === 'amount_per_delivery' ? 'number' : 'text'}
                  min={key === 'amount_per_delivery' ? 0 : undefined}
                  value={form[key]}
                  onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                  style={{ ...inputStyle, marginTop: '4px' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" onClick={() => setAddOpen(false)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
              <button type="submit" disabled={savingId === -1} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#FF5722', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '12px' }}>
                {savingId === -1 ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {ordersModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '24px 16px', overflowY: 'auto' }}
          onClick={() => setOrdersModal(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: '14px', padding: '20px', width: '100%', maxWidth: '900px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.15)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                  {ordersModal.rider?.rider_name} — Assigned orders
                </h2>
                <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#777' }}>
                  {[ordersModal.rider?.contact, ordersModal.rider?.vehicle].filter(Boolean).join(' • ') || 'No phone'}
                  {batch ? ` • Batch: ${batch}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setOrdersModal(null)} style={{ background: 'none', border: 'none', fontSize: '24px', color: '#888', cursor: 'pointer' }}>×</button>
            </div>

            {ordersLoading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#888' }}>Loading orders…</div>
            ) : ordersModal.loadError ? (
              <div style={{ padding: '16px', color: '#C62828', fontSize: '12px' }}>{ordersModal.loadError}</div>
            ) : ordersModal.orders.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#888', fontSize: '12px' }}>No assigned orders for this batch.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      {['Challan', 'Order ID', 'Name', 'Batch', 'Area', 'Qty', 'Status'].map((h) => (
                        <th key={h} style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600, color: '#555' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ordersModal.orders.map((o) => (
                      <tr key={o.order_id}>
                        <td style={{ padding: '10px', borderBottom: '1px solid #f0f0f0' }}>#{o.challan_id}</td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #f0f0f0' }}>{o.order_id}</td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #f0f0f0' }}>{o.name || '—'}</td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #f0f0f0' }}>{o.batch || '—'}</td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #f0f0f0' }}>{o.order_area || o.area || '—'}</td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #f0f0f0' }}>{o.quantity ?? '—'}</td>
                        <td style={{ padding: '10px', borderBottom: '1px solid #f0f0f0' }}>{o.delivery_status || 'Pending'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
