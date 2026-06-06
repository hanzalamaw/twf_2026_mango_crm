import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE as API } from '../config/api';

const ORDER_TYPES = ['Mango - Chaunsa', 'Mango - Sindhri', 'Mango - Anwar Ratol'];
const ORDER_SOURCES = ['Tele-Sales', 'Social Media (Organic)', 'Social Media (Ads)', 'Previous Customer', 'Website', 'Reference', 'Walk-in', 'International Calling'];
const WEIGHT_PRESETS = ['10', '5', 'custom'];
const QUANTITY_PRESETS = ['1', '2', '3', '4', '5', 'custom'];

const EMPTY_FORM = {
  order_id: '', customer_id: '', contact: '', order_type: '', name: '',
  address: '', area: '', weight: '', quantity: '', booking_date: '',
  total_amount: '', source: '', description: '', batch: '',
};

const labelStyle = { display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px', fontWeight: '500' };

const Field = ({ label, children, wide }) => (
  <div style={wide ? { gridColumn: '1 / -1' } : undefined}>
    <label style={labelStyle}>{label}</label>
    {children}
  </div>
);

const NewOrder = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [keepFormData, setKeepFormData] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [batches, setBatches] = useState([]);
  const [weightMode, setWeightMode] = useState('10');
  const [weightCustom, setWeightCustom] = useState('');
  const [quantityMode, setQuantityMode] = useState('1');
  const [quantityCustom, setQuantityCustom] = useState('');
  const latestBatchRef = useRef('');

  const syncWeightToForm = useCallback((mode, custom) => {
    const val = mode === 'custom' ? custom : mode;
    setFormData((p) => ({ ...p, weight: val }));
  }, []);

  const syncQuantityToForm = useCallback((mode, custom) => {
    const val = mode === 'custom' ? custom : mode;
    setFormData((p) => ({ ...p, quantity: val }));
  }, []);

  useEffect(() => {
    syncWeightToForm('10', '');
    syncQuantityToForm('1', '');
  }, [syncWeightToForm, syncQuantityToForm]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${API}/batches?created_year=2026`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : { data: [] })
      .then((data) => {
        const list = Array.isArray(data.data) ? data.data : [];
        setBatches(list);
        if (list.length) {
          const latest = list.reduce((best, row) => {
            const n = parseInt(row.batch_number, 10);
            const bn = parseInt(best.batch_number, 10);
            if (!Number.isNaN(n) && (Number.isNaN(bn) || n > bn)) return row;
            if (Number.isNaN(n) && Number.isNaN(bn)) return row.batch_number > best.batch_number ? row : best;
            return best;
          }, list[0]);
          latestBatchRef.current = latest.batch_number;
          setFormData((p) => ({ ...p, batch: latest.batch_number }));
        }
      })
      .catch(console.error);
  }, []);

  const generateCustomerIdRef = useCallback(async (contact) => {
    if (!contact || contact.length < 3) { setFormData((p) => ({ ...p, customer_id: '' })); return; }
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${API}/booking/generate-customer-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ contact }),
      });
      if (res.ok) { const d = await res.json(); setFormData((p) => ({ ...p, customer_id: d.customer_id })); }
    } catch (err) { console.error(err); }
  }, []);

  const debounceTimeoutRef = useRef(null);
  const generateCustomerId = useCallback((contact) => {
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => generateCustomerIdRef(contact), 500);
  }, [generateCustomerIdRef]);

  const generateOrderId = useCallback(async (orderType) => {
    if (!orderType) { setFormData((p) => ({ ...p, order_id: '' })); return; }
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${API}/booking/generate-order-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_type: orderType }),
      });
      if (res.ok) { const d = await res.json(); setFormData((p) => ({ ...p, order_id: d.order_id })); }
    } catch (err) { console.error(err); }
  }, []);

  const handleContactChange = (e) => {
    const v = e.target.value;
    setFormData((p) => ({ ...p, contact: v }));
    generateCustomerId(v);
  };

  const handleOrderTypeChange = (e) => {
    const v = e.target.value;
    setFormData((p) => ({ ...p, order_type: v }));
    generateOrderId(v);
  };

  const handleWeightModeChange = (e) => {
    const mode = e.target.value;
    setWeightMode(mode);
    syncWeightToForm(mode, weightCustom);
  };

  const handleWeightCustomChange = (e) => {
    const v = e.target.value;
    setWeightCustom(v);
    if (weightMode === 'custom') syncWeightToForm('custom', v);
  };

  const handleQuantityModeChange = (e) => {
    const mode = e.target.value;
    setQuantityMode(mode);
    syncQuantityToForm(mode, quantityCustom);
  };

  const handleQuantityCustomChange = (e) => {
    const v = e.target.value;
    setQuantityCustom(v);
    if (quantityMode === 'custom') syncQuantityToForm('custom', v);
  };

  const resetFormPreservingBatch = () => {
    const batch = latestBatchRef.current || formData.batch;
    setFormData({ ...EMPTY_FORM, batch });
    setWeightMode('10');
    setWeightCustom('');
    setQuantityMode('1');
    setQuantityCustom('');
    syncWeightToForm('10', '');
    syncQuantityToForm('1', '');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const weightVal = weightMode === 'custom' ? weightCustom : weightMode;
    const qtyVal = quantityMode === 'custom' ? quantityCustom : quantityMode;
    if (!weightVal || Number(weightVal) <= 0) {
      setError('Please enter a valid weight');
      return;
    }
    if (!qtyVal || Number(qtyVal) <= 0) {
      setError('Please enter a valid quantity');
      return;
    }
    setLoading(true);
    const token = localStorage.getItem('token');
    if (!token) { setError('You must be logged in'); setLoading(false); return; }
    const payload = { ...formData, weight: weightVal, quantity: qtyVal };
    try {
      const res = await fetch(`${API}/booking/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Order created successfully!');
        if (keepFormData) {
          generateOrderId(formData.order_type);
          setFormData((p) => ({ ...p, order_id: '', customer_id: '', contact: '', name: '', address: '', area: '', description: '', total_amount: '' }));
          setTimeout(() => setSuccess(''), 2000);
        } else {
          resetFormPreservingBatch();
          setTimeout(() => setSuccess(''), 3000);
        }
      } else {
        setError(data.message || 'Failed to create order');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: '6px',
    border: '1px solid #e0e0e0', fontSize: '12px', outline: 'none',
    background: '#FFFFFF', boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const textareaStyle = { ...inputStyle, minHeight: '100px', resize: 'vertical' };
  const sectionStyle = { background: '#FFFFFF', borderRadius: '8px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };
  const sectionTitleStyle = { fontSize: '12px', fontWeight: '600', color: '#FF5722', marginBottom: '14px', paddingBottom: '8px', borderBottom: '1px solid #e0e0e0' };

  return (
    <div style={{ padding: '19px', fontFamily: "'Poppins', 'Inter', sans-serif", background: '#F9FAFB', minHeight: '100%' }}>
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#333', margin: 0 }}>New Order</h2>
        <button type="button" onClick={() => navigate('/bookings/orders')}
          style={{ padding: '6px 13px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', color: '#666', fontSize: '11px', cursor: 'pointer' }}>
          Back to Orders
        </button>
      </div>

      {error && <div style={{ background: '#FFF5F2', color: '#FF5722', padding: '8px 11px', borderRadius: '6px', marginBottom: '13px', fontSize: '11px', border: '1px solid #FFE0D6' }}>{error}</div>}
      {success && <div style={{ background: '#F0FDF4', color: '#166534', padding: '8px 11px', borderRadius: '6px', marginBottom: '13px', fontSize: '11px', border: '1px solid #BBF7D0' }}>{success}</div>}

      <form onSubmit={handleSubmit}>
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Order Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
            <Field label="Order Type *">
              <select style={inputStyle} value={formData.order_type} onChange={handleOrderTypeChange} required>
                <option value="">Select mango type</option>
                {ORDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Order ID">
              <input style={{ ...inputStyle, background: '#f9f9f9' }} value={formData.order_id} readOnly placeholder="Auto-generated" />
            </Field>
            <Field label="Batch *">
              <select style={inputStyle} value={formData.batch} onChange={(e) => setFormData((p) => ({ ...p, batch: e.target.value }))} required>
                <option value="">Select batch</option>
                {batches.map((b) => <option key={b.batch_id} value={b.batch_number}>Batch {b.batch_number}</option>)}
              </select>
            </Field>
            <Field label="Booking Date">
              <input type="date" style={inputStyle} value={formData.booking_date} onChange={(e) => setFormData((p) => ({ ...p, booking_date: e.target.value }))} />
            </Field>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Customer</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
            <Field label="Contact *">
              <input style={inputStyle} value={formData.contact} onChange={handleContactChange} required placeholder="03XX-XXXXXXX" />
            </Field>
            <Field label="Customer ID">
              <input style={{ ...inputStyle, background: '#f9f9f9' }} value={formData.customer_id} readOnly />
            </Field>
            <Field label="Name *">
              <input style={inputStyle} value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} required />
            </Field>
            <Field label="Address">
              <input style={inputStyle} value={formData.address} onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))} />
            </Field>
            <Field label="Area" wide>
              <textarea style={textareaStyle} value={formData.area} onChange={(e) => setFormData((p) => ({ ...p, area: e.target.value }))} placeholder="Delivery area details" />
            </Field>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Product & Payment</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
            <Field label="Weight (KG) *">
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select style={{ ...inputStyle, flex: weightMode === 'custom' ? '0 0 100px' : 1 }} value={weightMode} onChange={handleWeightModeChange}>
                  {WEIGHT_PRESETS.map((w) => (
                    <option key={w} value={w}>{w === 'custom' ? 'Custom' : `${w} KG`}</option>
                  ))}
                </select>
                {weightMode === 'custom' && (
                  <input type="number" min="0.1" step="0.1" style={{ ...inputStyle, flex: 1 }} value={weightCustom}
                    onChange={handleWeightCustomChange} placeholder="Enter KG" />
                )}
              </div>
            </Field>
            <Field label="Quantity *">
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select style={{ ...inputStyle, flex: quantityMode === 'custom' ? '0 0 100px' : 1 }} value={quantityMode} onChange={handleQuantityModeChange}>
                  {QUANTITY_PRESETS.map((q) => (
                    <option key={q} value={q}>{q === 'custom' ? 'Custom' : q}</option>
                  ))}
                </select>
                {quantityMode === 'custom' && (
                  <input type="number" min="1" style={{ ...inputStyle, flex: 1 }} value={quantityCustom}
                    onChange={handleQuantityCustomChange} placeholder="Qty" />
                )}
              </div>
            </Field>
            <Field label="Total Amount (PKR)">
              <input type="number" min="0" style={inputStyle} value={formData.total_amount} onChange={(e) => setFormData((p) => ({ ...p, total_amount: e.target.value }))} />
            </Field>
            <Field label="Source">
              <select style={inputStyle} value={formData.source} onChange={(e) => setFormData((p) => ({ ...p, source: e.target.value }))}>
                <option value="">Select source</option>
                {ORDER_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Description" wide>
              <textarea style={textareaStyle} value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} placeholder="Order notes or special instructions" />
            </Field>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <input type="checkbox" id="keepForm" checked={keepFormData} onChange={(e) => setKeepFormData(e.target.checked)} />
          <label htmlFor="keepForm" style={{ fontSize: '11px', color: '#666' }}>Keep form data after submit</label>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="submit" disabled={loading}
            style={{ padding: '10px 24px', borderRadius: '6px', border: 'none', background: '#FF5722', color: '#fff', fontSize: '12px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Creating…' : 'Create Order'}
          </button>
          <button type="button" onClick={() => navigate('/bookings/orders')}
            style={{ padding: '10px 24px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', color: '#666', fontSize: '12px', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewOrder;
