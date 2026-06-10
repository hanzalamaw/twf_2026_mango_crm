import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { API_BASE as API } from '../config/api';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 50;

const DELIVERY_STATUS_OPTIONS = ['Pending', 'Dispatched', 'Delivered', 'Cancelled'];

const COLUMNS = [
  { key: 'customer_id',     label: 'Customer ID'     },
  { key: 'order_id',        label: 'Order ID'        },
  { key: 'name',            label: 'Name'            },
  { key: 'phone_number',    label: 'Contact'         },
  { key: 'alt_contact',     label: 'Alt Contact'     },
  { key: 'type',            label: 'Type'            },
  { key: 'address',         label: 'Address'         },
  { key: 'area',            label: 'Area'            },
  { key: 'weight',          label: 'Weight'          },
  { key: 'quantity',        label: 'Quantity'        },
  { key: 'batch',           label: 'Batch'           },
  { key: 'booking_date',    label: 'Booking Date'    },
  { key: 'total_amount',    label: 'Total Amount'    },
  { key: 'bank',            label: 'Bank (TWF)'            },
  { key: 'bank_tw_traders', label: 'Bank (TW Traders)'     },
  { key: 'cash',            label: 'Cash'            },
  { key: 'received',        label: 'Received'        },
  { key: 'pending',         label: 'Pending'         },
  { key: 'source',          label: 'Source'          },
  { key: 'description',     label: 'Description'     },
  { key: 'delivery_status', label: 'Delivery Status' },
  { key: 'payment_status',  label: 'Payment Status'  },
];

const AMOUNT_KEYS = ['total_amount', 'bank', 'bank_tw_traders', 'cash', 'received', 'pending'];

const EDIT_LABELS = {
  order_id: 'Order ID',
  customer_id: 'Customer ID',
  name: 'Name',
  phone_number: 'Contact',
  alt_contact: 'Alt Contact',
  address: 'Address',
  area: 'Area',
  type: 'Type',
  weight: 'Weight',
  quantity: 'Quantity',
  batch: 'Batch',
  booking_date: 'Booking Date',
  total_amount: 'Total Amount',
  received: 'Received',
  pending: 'Pending',
  source: 'Source',
  delivery_status: 'Delivery Status',
};

function formatAmount(val) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  return Math.round(n).toLocaleString('en-PK');
}

function formatDate(val) {
  if (val == null || val === '') return '—';
  const s = String(val);
  return s.includes('T') ? s.split('T')[0] : s;
}

function StatusPill({ status }) {
  const isPending = status === 'Pending';
  return (
    <span style={{
      display: 'inline-block', minWidth: '72px', height: '22px', padding: '0 10px',
      borderRadius: '4px', fontSize: '10px', fontWeight: '600', whiteSpace: 'nowrap',
      border: '1px solid', textAlign: 'center', lineHeight: '20px', boxSizing: 'border-box',
      ...(isPending
        ? { color: '#C30730', background: '#FBEDF0', borderColor: '#C30730' }
        : { color: '#07C339', background: '#E6F9EB', borderColor: '#07C339' }),
    }}>
      {isPending ? 'Pending' : (status === 'Paid' ? 'Paid' : (status || '—'))}
    </span>
  );
}

const defaultEditRow = () => ({
  order_id: '', customer_id: '', name: '', phone_number: '', alt_contact: '',
  address: '', area: '', type: '', weight: '', quantity: '', batch: '',
  booking_date: '', total_amount: '', received: '', pending: '',
  source: '', delivery_status: 'Pending', description: '',
});

const EDIT_FIELD_KEYS = [
  'order_id', 'customer_id', 'name', 'phone_number', 'alt_contact',
  'address', 'area', 'type', 'weight', 'quantity', 'batch',
  'booking_date', 'total_amount', 'received', 'pending', 'source',
];

function validateAmountsRealtime(row) {
  const errors = {};
  const total = Number(row.total_amount);
  const received = Number(row.received);
  if (row.total_amount !== '' && (Number.isNaN(total) || total < 0)) errors.total_amount = 'Total must be ≥ 0';
  if (row.received !== '' && (Number.isNaN(received) || received < 0)) errors.received = 'Received must be ≥ 0';
  if (row.total_amount !== '' && row.received !== '' && !Number.isNaN(total) && !Number.isNaN(received) && total < received) {
    errors.total_amount = 'Total cannot be less than received';
  }
  return errors;
}

function validateOrderEdit(row) {
  const errors = {};
  const trim = (v) => (v == null ? '' : String(v).trim());
  if (!trim(row.customer_id)) errors.customer_id = 'Customer ID is required';
  if (!trim(row.name)) errors.name = 'Name is required';
  const phone = trim(row.phone_number);
  if (!phone) errors.phone_number = 'Phone number is required';
  else if (!/^[\d\s\-+()]{7,20}$/.test(phone)) errors.phone_number = 'Enter a valid phone number (7–20 digits/symbols)';
  const dateStr = trim(row.booking_date);
  if (dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) errors.booking_date = 'Date must be YYYY-MM-DD';
    else if (Number.isNaN(new Date(dateStr).getTime())) errors.booking_date = 'Invalid date';
  }
  const total = Number(trim(row.total_amount));
  const received = Number(trim(row.received));
  const pending = Number(trim(row.pending));
  if (trim(row.total_amount) !== '' && (Number.isNaN(total) || total < 0)) errors.total_amount = 'Total must be a number ≥ 0';
  if (trim(row.received) !== '' && (Number.isNaN(received) || received < 0)) errors.received = 'Received must be a number ≥ 0';
  if (trim(row.pending) !== '' && (Number.isNaN(pending) || pending < 0)) errors.pending = 'Pending must be a number ≥ 0';
  if (!Number.isNaN(total) && !Number.isNaN(received) && total < received) errors.total_amount = 'Total amount cannot be less than received amount';
  return errors;
}

export default function OrderManagement() {
  const [orders, setOrders] = useState([]);
  const [filters, setFilters] = useState({ batches: [], order_types: [] });
  const [search, setSearch] = useState('');
  const [batch, setBatch] = useState('');
  const [orderType, setOrderType] = useState('');
  const [yearFilter, setYearFilter] = useState('2026');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(defaultEditRow);
  const [editErrors, setEditErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [addBank, setAddBank] = useState('');
  const [addBankTwTraders, setAddBankTwTraders] = useState('');
  const [addCash, setAddCash] = useState('');
  const [paymentErrors, setPaymentErrors] = useState({});
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const { authFetch } = useAuth();
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;

  const fetchFilters = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      const url = `${API}/booking/orders/filters${params.toString() ? `?${params}` : ''}`;
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        setFilters(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [authFetch, yearFilter]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (orderType) params.set('order_type', orderType);
      if (batch) params.set('batch', batch);
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      const res = await authFetch(`${API}/booking/orders?${params}`);
      if (res.ok) {
        const json = await res.json();
        const data = Array.isArray(json) ? json : json.data;
        const total = typeof json.total === 'number' ? json.total : (data?.length ?? 0);
        setOrders(Array.isArray(data) ? data : []);
        setTotalCount(total);
      } else {
        setError('Failed to load orders');
      }
    } catch (e) {
      setError('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [authFetch, search, orderType, batch, yearFilter, page]);

  useEffect(() => { fetchFilters(); }, [fetchFilters]);
  useEffect(() => { setPage(1); }, [search, orderType, batch, yearFilter]);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const toggleSelect = (id) => setSelectedIds((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const toggleSelectAll = () => (
    selectedIds.size === orders.length
      ? setSelectedIds(new Set())
      : setSelectedIds(new Set(orders.map((r) => r.order_id)))
  );

  const handleEdit = (row) => {
    const init = {
      order_id: row.order_id,
      customer_id: row.customer_id ?? '',
      name: row.name ?? '',
      phone_number: row.phone_number ?? '',
      alt_contact: row.alt_contact ?? '',
      address: row.address ?? '',
      area: row.area ?? '',
      type: row.type ?? '',
      weight: row.weight ?? '',
      quantity: row.quantity ?? '',
      batch: row.batch ?? '',
      booking_date: formatDate(row.booking_date),
      total_amount: row.total_amount ?? '',
      received: row.received ?? '',
      pending: row.pending ?? '',
      source: row.source ?? '',
      delivery_status: row.delivery_status ?? 'Pending',
      description: row.description ?? '',
    };
    setEditRow({ ...defaultEditRow(), ...init });
    setEditErrors({});
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    const errors = validateOrderEdit(editRow);
    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }
    setEditErrors({});
    setSaving(true);
    try {
      const payload = { ...editRow };
      if (payload.booking_date) {
        const s = String(payload.booking_date);
        payload.booking_date = s.includes('T') ? s.split('T')[0] : (s.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || s);
      }
      const res = await authFetch(`${API}/booking/orders/${encodeURIComponent(editRow.order_id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setEditOpen(false);
        fetchOrders();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || 'Failed to update order');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleInvoice = async (customerId) => {
    try {
      const res = await authFetch(`${API}/booking/invoice/${encodeURIComponent(customerId)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || 'Failed to generate invoice');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice-${customerId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Failed to generate invoice');
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancelConfirm) return;
    try {
      const res = await authFetch(`${API}/booking/orders/${encodeURIComponent(cancelConfirm.order_id)}/cancel`, { method: 'POST' });
      if (res.ok) {
        setCancelConfirm(null);
        fetchOrders();
        setSelectedIds((p) => {
          const n = new Set(p);
          n.delete(cancelConfirm.order_id);
          return n;
        });
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || 'Failed to cancel order');
      }
    } finally {
      setCancelConfirm(null);
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setBatch('');
    setOrderType('');
    setYearFilter('2026');
    setSelectedIds(new Set());
    setError('');
  };

  const openPaymentModal = (order) => {
    setPaymentOrder(order);
    setAddBank('');
    setAddBankTwTraders('');
    setAddCash('');
    setPaymentErrors({});
  };

  const getPaymentRealtimeError = () => {
    if (!paymentOrder) return null;
    const bankVal = parseFloat(addBank);
    const bankTwVal = parseFloat(addBankTwTraders);
    const cashVal = parseFloat(addCash);
    if (!Number.isNaN(bankVal) && bankVal < 0) return 'Amount cannot be negative.';
    if (!Number.isNaN(bankTwVal) && bankTwVal < 0) return 'Amount cannot be negative.';
    if (!Number.isNaN(cashVal) && cashVal < 0) return 'Amount cannot be negative.';
    const pendingAmount = Number(paymentOrder.pending) || 0;
    const addB = Math.max(0, Number.isNaN(bankVal) ? 0 : bankVal);
    const addBT = Math.max(0, Number.isNaN(bankTwVal) ? 0 : bankTwVal);
    const addC = Math.max(0, Number.isNaN(cashVal) ? 0 : cashVal);
    if (addB + addBT + addC > pendingAmount) return `Total added cannot exceed pending (${formatAmount(pendingAmount)}).`;
    return null;
  };

  const validatePayment = () => {
    const err = {};
    const bank = parseFloat(addBank);
    const bankTw = parseFloat(addBankTwTraders);
    const cash = parseFloat(addCash);
    const addB = Math.max(0, Number.isNaN(bank) ? 0 : bank);
    const addBT = Math.max(0, Number.isNaN(bankTw) ? 0 : bankTw);
    const addC = Math.max(0, Number.isNaN(cash) ? 0 : cash);
    if (!Number.isNaN(bank) && bank < 0) err.addBank = 'Amount cannot be negative.';
    if (!Number.isNaN(bankTw) && bankTw < 0) err.addBankTwTraders = 'Amount cannot be negative.';
    if (!Number.isNaN(cash) && cash < 0) err.addCash = 'Amount cannot be negative.';
    if (addB + addBT + addC === 0) err.add = 'Enter at least one amount (Cash, Bank TWF, or Bank TW Traders ≥ 0).';
    const totalAmountVal = Number(paymentOrder?.total_amount) || 0;
    const currentReceivedVal = Number(paymentOrder?.received) || 0;
    if (currentReceivedVal + addB + addBT + addC > totalAmountVal) {
      err.add = err.add || `Total received cannot exceed total amount (${formatAmount(totalAmountVal)}).`;
    }
    const pendingAmount = Number(paymentOrder?.pending) || 0;
    if (addB + addBT + addC > pendingAmount) {
      err.add = err.add || `Total added cannot exceed pending (${formatAmount(pendingAmount)}).`;
    }
    setPaymentErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSubmitPayment = async () => {
    if (!paymentOrder) return;
    if (!validatePayment()) return;
    const bank = Math.max(0, parseFloat(addBank) || 0);
    const bank_tw_traders = Math.max(0, parseFloat(addBankTwTraders) || 0);
    const cash = Math.max(0, parseFloat(addCash) || 0);
    if (bank === 0 && bank_tw_traders === 0 && cash === 0) return;
    setSubmittingPayment(true);
    try {
      const res = await authFetch(`${API}/booking/orders/${encodeURIComponent(paymentOrder.order_id)}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank, bank_tw_traders, cash }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPaymentOrder(null);
        setAddBank('');
        setAddBankTwTraders('');
        setAddCash('');
        fetchOrders();
      } else {
        alert(data.message || 'Failed to add payment');
      }
    } catch (e) {
      alert('Failed to add payment');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleExport = async () => {
    try {
      const ids = Array.from(selectedIds);
      const limit = 100;
      let pageNum = 1;
      let allOrders = [];
      do {
        const params = new URLSearchParams();
        if (search?.trim()) params.set('search', search.trim());
        if (orderType) params.set('order_type', orderType);
        if (batch) params.set('batch', batch);
        if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
        params.set('page', String(pageNum));
        params.set('limit', String(limit));
        const res = await authFetch(`${API}/booking/orders?${params}`);
        if (!res.ok) {
          alert('Failed to load data for export');
          return;
        }
        const json = await res.json();
        const data = Array.isArray(json) ? json : json.data;
        const chunk = Array.isArray(data) ? data : [];
        allOrders = allOrders.concat(chunk);
        if (chunk.length < limit) break;
        pageNum++;
      } while (true);
      const toExport = ids.length > 0 ? allOrders.filter((r) => ids.includes(r.order_id)) : allOrders;
      if (!toExport.length) {
        alert('No data to export');
        return;
      }
      const headers = COLUMNS.map((c) => c.label);
      const rows = toExport.map((row) => COLUMNS.map((col) => {
        const val = row[col.key];
        if (AMOUNT_KEYS.includes(col.key)) {
          const n = Number(val);
          return Number.isFinite(n) ? n : (val ?? '');
        }
        if (col.key === 'booking_date') return formatDate(val);
        if (col.key === 'payment_status') return val || '—';
        return val != null ? String(val) : '—';
      }));
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Orders');
      XLSX.writeFile(wb, `orders-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
      try {
        const af = {};
        if (search?.trim()) af.search = search.trim();
        if (orderType) af.order_type = orderType;
        if (batch) af.batch = batch;
        if (yearFilter) af.year = yearFilter;
        await authFetch(`${API}/booking/orders/export-audit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            count: toExport.length,
            ...(Object.keys(af).length > 0 && { filters: af }),
            ...(ids.length > 0 && { order_ids: ids }),
          }),
        });
      } catch (e) {
        console.error('Audit log failed:', e);
      }
    } catch (e) {
      alert('Export failed');
    }
  };

  const currentBank = paymentOrder ? Number(paymentOrder.bank) || 0 : 0;
  const currentBankTwTraders = paymentOrder ? Number(paymentOrder.bank_tw_traders) || 0 : 0;
  const currentCash = paymentOrder ? Number(paymentOrder.cash) || 0 : 0;
  const newBank = currentBank + Math.max(0, parseFloat(addBank) || 0);
  const newBankTwTraders = currentBankTwTraders + Math.max(0, parseFloat(addBankTwTraders) || 0);
  const newCash = currentCash + Math.max(0, parseFloat(addCash) || 0);
  const currentReceived = paymentOrder ? Number(paymentOrder.received) || 0 : 0;
  const addTotal =
    Math.max(0, parseFloat(addBank) || 0) +
    Math.max(0, parseFloat(addBankTwTraders) || 0) +
    Math.max(0, parseFloat(addCash) || 0);
  const newReceived = currentReceived + addTotal;
  const totalAmount = paymentOrder ? Number(paymentOrder.total_amount) || 0 : 0;
  const newPending = Math.max(0, totalAmount - newReceived);

  const renderCell = (row, col) => {
    const val = row[col.key];
    if (col.key === 'payment_status') return <StatusPill status={val} />;
    if (AMOUNT_KEYS.includes(col.key)) return formatAmount(val);
    if (col.key === 'booking_date') return formatDate(val);
    return val != null && val !== '' ? String(val) : '—';
  };

  const filterSelects = [
    { label: 'Batch', val: batch, set: setBatch, opts: filters.batches || [], w: 104 },
    { label: 'Type', val: orderType, set: setOrderType, opts: filters.order_types || [], w: 120 },
  ];

  return (
    <>
      <style>{`
        @keyframes modalSheetInUp {
          from { opacity: 0; transform: translate3d(0, 100%, 0); }
          to   { opacity: 1; transform: translate3d(0, 0, 0); }
        }

        @media (max-width: 767px) {
          .om-root            { padding: 16px 12px 24px !important; overflow: auto !important; }
          .om-header          { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; margin-bottom: 12px !important; }
          .om-header h2       {
            min-height: 55px !important; display: flex !important; align-items: center !important; box-sizing: border-box !important;
            margin: 0 !important; padding: 0 !important;
            font-size: clamp(15px, 4.3vw, 17px) !important; font-weight: 600 !important; color: #333 !important; line-height: 1.25 !important;
          }
          .om-filter-desktop  { display: none !important; }
          .om-filter-toggle   { display: flex !important; }
          .om-filter-mobile   { display: block !important; }
          .om-table-wrap      { display: block !important; }
          .om-pagination      { flex-direction: column !important; align-items: flex-start !important; }

          .om-edit-modal-wrap { align-items: flex-end !important; padding: 0 !important; }
          .om-edit-modal-box  {
            border-radius: 20px 20px 0 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            max-height: 92dvh !important;
            padding: 20px 16px 36px !important;
            animation: modalSheetInUp 0.38s cubic-bezier(0.25, 0.8, 0.25, 1) both !important;
          }
          .om-modal-box       {
            border-radius: 20px 20px 0 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            max-height: 88dvh !important;
            padding: 20px 16px 32px !important;
            animation: modalSheetInUp 0.38s cubic-bezier(0.25, 0.8, 0.25, 1) both !important;
          }
          .om-cancel-modal-wrap { align-items: flex-end !important; padding: 0 !important; }
          .om-edit-modal-box h3       { font-size: 15px !important; margin-bottom: 14px !important; }
          .om-edit-grid               { grid-template-columns: 1fr 1fr !important; gap: 10px 12px !important; }
          .om-edit-field-label        { font-size: 11px !important; margin-bottom: 3px !important; }
          .om-edit-field-input        { font-size: 13px !important; padding: 10px 12px !important; border-radius: 8px !important; }
          .om-edit-field-textarea     { font-size: 13px !important; padding: 10px 12px !important; border-radius: 8px !important; }
          .om-edit-field-error        { font-size: 10px !important; }
          .om-edit-actions            { padding-top: 14px !important; gap: 10px !important; }
          .om-edit-actions button     { flex: 1 !important; padding: 13px !important; font-size: 13px !important; border-radius: 10px !important; }
          .om-edit-drag-handle        { display: block !important; }
        }
      `}</style>

      <div className="om-root" style={{ padding: '19px', fontFamily: "'Poppins','Inter',sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>

        <div className="om-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333', whiteSpace: 'nowrap' }}>Order Management</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '10px', color: '#666', whiteSpace: 'nowrap' }}>Year</label>
            <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px', minWidth: '112px' }}>
              <option value="all">All</option>
              <option value="2026">Year 2026</option>
              <option value="2025">Year 2025</option>
              <option value="2024">Year 2024</option>
            </select>
          </div>
        </div>

        <div className="om-filter-desktop" style={{ display: 'flex', flexWrap: 'nowrap', gap: '10px', marginBottom: '16px', alignItems: 'flex-end', overflowX: 'auto', minWidth: 0, flexShrink: 0 }}>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Search (name, phone, alt contact, area, address)</label>
            <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchOrders()} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }} />
          </div>
          {filterSelects.map(({ label, val, set, opts, w }) => (
            <div key={label} style={{ width: w, minWidth: w, flexShrink: 0 }}>
              <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px', whiteSpace: 'nowrap' }}>{label}</label>
              <select value={val} onChange={(e) => set(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}>
                <option value="">All</option>
                {opts.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button type="button" onClick={fetchOrders} style={{ padding: '6px 13px', height: '29px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Apply</button>
            <button type="button" onClick={handleResetFilters} style={{ padding: '6px 13px', height: '29px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Reset</button>
            <button type="button" onClick={handleExport} style={{ padding: '6px 13px', height: '29px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Export</button>
          </div>
        </div>

        <div className="om-filter-toggle" style={{ display: 'none', gap: '8px', marginBottom: '8px', flexShrink: 0, alignItems: 'center' }}>
          <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchOrders()}
            style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px' }} />
          <button type="button" onClick={() => setMobileFiltersOpen((v) => !v)}
            style={{ padding: '9px 12px', borderRadius: '8px', border: `1px solid ${mobileFiltersOpen ? '#FF5722' : '#e0e0e0'}`, background: mobileFiltersOpen ? '#fff4f0' : '#fff', color: mobileFiltersOpen ? '#FF5722' : '#555', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            ⚙ Filters
          </button>
          <button type="button" onClick={handleExport} style={{ padding: '9px 12px', borderRadius: '8px', background: '#7c3aed', color: '#fff', border: 'none', fontSize: '13px', cursor: 'pointer' }}>Export</button>
        </div>

        <div className="om-filter-mobile" style={{ display: 'none' }}>
          {mobileFiltersOpen && (
            <div className="ops-filter-mobile-panel">
              {filterSelects.map(({ label, val, set, opts }) => (
                <div key={label}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>{label}</label>
                  <select value={val} onChange={(e) => set(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px' }}>
                    <option value="">All</option>
                    {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => { fetchOrders(); setMobileFiltersOpen(false); }}
                  style={{ flex: 1, padding: '10px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Apply</button>
                <button type="button" onClick={() => { handleResetFilters(); setMobileFiltersOpen(false); }}
                  className="ops-filter-mobile-reset">Reset</button>
              </div>
            </div>
          )}
        </div>

        {error && <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', flexShrink: 0, fontSize: '10px' }}>{error}</div>}

        <div className="om-table-wrap" style={{ flex: 1, minHeight: '304px', overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: '6px', background: '#fff' }}>
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading orders...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', tableLayout: 'auto' }}>
              <thead>
                <tr style={{ background: '#f5f5f5' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap', width: '40px' }}>
                    <input type="checkbox" checked={orders.length > 0 && selectedIds.size === orders.length} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                  </th>
                  {COLUMNS.map((col) => (
                    <th key={col.key} style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>{col.label}</th>
                  ))}
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={COLUMNS.length + 2} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>No orders found.</td></tr>
                ) : orders.map((row) => (
                  <tr key={row.order_id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '6px', whiteSpace: 'nowrap', fontSize: '11px' }}>
                      <input type="checkbox" checked={selectedIds.has(row.order_id)} onChange={() => toggleSelect(row.order_id)} style={{ cursor: 'pointer' }} />
                    </td>
                    {COLUMNS.map((col) => (
                      <td key={col.key} style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                        {renderCell(row, col)}
                      </td>
                    ))}
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => handleEdit(row)} title="Edit" style={{ marginRight: '6px', padding: '4px', cursor: 'pointer', background: 'none', border: 'none', verticalAlign: 'middle' }}><img src="/icons/edit.png" alt="Edit" style={{ width: '15px', height: '15px', display: 'block' }} /></button>
                      <button type="button" onClick={() => handleInvoice(row.customer_id)} title="Invoice" style={{ marginRight: '6px', padding: '4px', cursor: 'pointer', background: 'none', border: 'none', verticalAlign: 'middle' }}><img src="/icons/invoice.png" alt="Invoice" style={{ width: '21px', height: '21px', display: 'block' }} /></button>
                      <button type="button" onClick={() => setCancelConfirm(row)} title="Cancel" style={{ padding: '4px', cursor: 'pointer', background: 'none', border: 'none', verticalAlign: 'middle' }}><img src="/icons/delete.png" alt="Cancel" style={{ width: '18px', height: '18px', display: 'block' }} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!loading && totalCount > 0 && (
          <div className="om-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '12px 0', borderTop: '1px solid #e0e0e0', marginTop: '8px', flexShrink: 0 }}>
            <span style={{ fontSize: '13px', color: '#666' }}>Showing {orders.length} of {totalCount} orders</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ padding: '6px 12px', fontSize: '10px', background: page <= 1 ? '#f0f0f0' : '#fff', color: page <= 1 ? '#999' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>Previous</button>
              {(() => {
                const sp = 5;
                let start = Math.max(1, page - Math.floor(sp / 2));
                let end = Math.min(totalPages, start + sp - 1);
                if (end - start + 1 < sp) start = Math.max(1, end - sp + 1);
                const pages = [];
                for (let i = start; i <= end; i++) pages.push(i);
                return pages.map((p) => (
                  <button key={p} type="button" onClick={() => setPage(p)} style={{ minWidth: '32px', padding: '6px 10px', fontSize: '10px', background: p === page ? '#FF5722' : '#fff', color: p === page ? '#fff' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', fontWeight: p === page ? 600 : 400 }}>{p}</button>
                ));
              })()}
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={{ padding: '6px 12px', fontSize: '10px', background: page >= totalPages ? '#f0f0f0' : '#fff', color: page >= totalPages ? '#999' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>Next</button>
            </div>
          </div>
        )}

        {editOpen && (
          <div
            className="om-edit-modal-wrap"
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
            onClick={() => !saving && (setEditErrors({}), setEditOpen(false))}
          >
            <div
              className="om-edit-modal-box"
              style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', width: 'min(680px, 95vw)', maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="om-edit-drag-handle" style={{ display: 'none', width: '40px', height: '4px', background: '#e0e0e0', borderRadius: '2px', margin: '0 auto 16px' }} />

              <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Edit Order</h3>

              {Object.keys(editErrors).length > 0 && (
                <div style={{ marginBottom: '10px', padding: '8px 10px', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px', fontSize: '12px' }}>Please fix the errors below before saving.</div>
              )}

              <div className="om-edit-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                {EDIT_FIELD_KEYS.map((key) => {
                  const isReadOnly = key === 'order_id' || key === 'customer_id' || key === 'received' || key === 'pending';
                  return (
                    <div key={key} style={{ minWidth: 0 }}>
                      <label className="om-edit-field-label" style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>{EDIT_LABELS[key] || key}</label>
                      <input
                        disabled={isReadOnly}
                        readOnly={isReadOnly}
                        value={editRow[key] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditRow((prev) => {
                            const next = { ...prev, [key]: val };
                            if (key === 'total_amount') {
                              const total = parseFloat(val) || 0;
                              const received = parseFloat(prev.received) || 0;
                              next.pending = Math.max(0, total - received).toFixed(2);
                            }
                            const reErr = validateAmountsRealtime(next);
                            setEditErrors((pe) => {
                              const u = { ...pe };
                              delete u.total_amount;
                              delete u.received;
                              return { ...u, ...reErr };
                            });
                            return next;
                          });
                        }}
                        className="om-edit-field-input"
                        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: editErrors[key] ? '1px solid #dc2626' : '1px solid #e0e0e0', fontSize: '10px', ...(isReadOnly && { backgroundColor: '#f5f5f5', cursor: 'not-allowed' }) }}
                      />
                      {editErrors[key] && <div className="om-edit-field-error" style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>{editErrors[key]}</div>}
                    </div>
                  );
                })}

                <div style={{ minWidth: 0 }}>
                  <label className="om-edit-field-label" style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>{EDIT_LABELS.delivery_status}</label>
                  <select
                    value={editRow.delivery_status ?? 'Pending'}
                    onChange={(e) => setEditRow((p) => ({ ...p, delivery_status: e.target.value }))}
                    className="om-edit-field-input"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '10px' }}
                  >
                    {DELIVERY_STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div style={{ minWidth: 0, gridColumn: '1 / -1' }}>
                  <label className="om-edit-field-label" style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>Description</label>
                  <textarea
                    className="om-edit-field-textarea"
                    value={editRow.description ?? ''}
                    onChange={(e) => setEditRow((p) => ({ ...p, description: e.target.value }))}
                    rows={2}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '13px', resize: 'vertical' }}
                  />
                </div>
              </div>

              <div className="om-edit-actions" style={{ marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditOpen(false)} disabled={saving} style={{ padding: '5px 11px', fontSize: '10px', background: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Close</button>
                <button type="button" onClick={handleSaveEdit} disabled={saving} style={{ padding: '5px 11px', fontSize: '10px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          </div>
        )}

        {paymentOrder && (
          <div
            className="om-edit-modal-wrap"
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
            onClick={() => !submittingPayment && setPaymentOrder(null)}
          >
            <div
              className="om-modal-box"
              style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', width: 'min(640px, 95vw)', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 13px 0', fontSize: '13px', fontWeight: '600' }}>Add Payment</h3>

              <div style={{ fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Current state</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: '13px', fontSize: '10px', padding: '8px 10px', background: '#f5f5f5', borderRadius: '6px', border: '1px solid #e8e8e8' }}>
                <div><span style={{ color: '#666' }}>Customer ID</span><div style={{ fontWeight: '600' }}>{paymentOrder.customer_id ?? '—'}</div></div>
                <div><span style={{ color: '#666' }}>Order ID</span><div style={{ fontWeight: '600' }}>{paymentOrder.order_id ?? '—'}</div></div>
                <div><span style={{ color: '#666' }}>Name</span><div style={{ fontWeight: '600' }}>{paymentOrder.name ?? '—'}</div></div>
                <div><span style={{ color: '#666' }}>Contact</span><div style={{ fontWeight: '600' }}>{paymentOrder.phone_number ?? '—'}</div></div>
                <div><span style={{ color: '#666' }}>Booking Date</span><div style={{ fontWeight: '600' }}>{formatDate(paymentOrder.booking_date)}</div></div>
                <div><span style={{ color: '#666' }}>Total Amount</span><div style={{ fontWeight: '600' }}>{formatAmount(paymentOrder.total_amount)}</div></div>
                <div><span style={{ color: '#666' }}>Current Bank (TWF)</span><div style={{ fontWeight: '600' }}>{formatAmount(paymentOrder.bank)}</div></div>
                <div><span style={{ color: '#666' }}>Current Bank (TW Traders)</span><div style={{ fontWeight: '600' }}>{formatAmount(paymentOrder.bank_tw_traders)}</div></div>
                <div><span style={{ color: '#666' }}>Current Cash</span><div style={{ fontWeight: '600' }}>{formatAmount(paymentOrder.cash)}</div></div>
                <div><span style={{ color: '#666' }}>Current Received</span><div style={{ fontWeight: '600' }}>{formatAmount(paymentOrder.received)}</div></div>
                <div><span style={{ color: '#666' }}>Current Pending</span><div style={{ fontWeight: '600' }}>{formatAmount(paymentOrder.pending)}</div></div>
              </div>

              {(getPaymentRealtimeError() || paymentErrors.add || paymentErrors.addBank || paymentErrors.addBankTwTraders || paymentErrors.addCash) && (
                <div style={{ marginBottom: '10px', padding: '6px', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px', fontSize: '10px' }}>
                  {getPaymentRealtimeError()}
                  {!getPaymentRealtimeError() && paymentErrors.add}
                  {paymentErrors.addBank && <div>Bank (TWF): {paymentErrors.addBank}</div>}
                  {paymentErrors.addBankTwTraders && <div>Bank (TW Traders): {paymentErrors.addBankTwTraders}</div>}
                  {paymentErrors.addCash && <div>Cash: {paymentErrors.addCash}</div>}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Add Cash</label>
                  <input
                    type="number" min="0" step="0.01" value={addCash}
                    onChange={(e) => { setAddCash(e.target.value); setPaymentErrors((p) => ({ ...p, addCash: undefined, addBank: undefined, addBankTwTraders: undefined, add: undefined })); }}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: (getPaymentRealtimeError() || paymentErrors.addCash) ? '1px solid #dc2626' : '1px solid #e0e0e0' }}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Add Bank (TWF)</label>
                  <input
                    type="number" min="0" step="0.01" value={addBank}
                    onChange={(e) => { setAddBank(e.target.value); setPaymentErrors((p) => ({ ...p, addBank: undefined, addBankTwTraders: undefined, addCash: undefined, add: undefined })); }}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: (getPaymentRealtimeError() || paymentErrors.addBank) ? '1px solid #dc2626' : '1px solid #e0e0e0' }}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Add Bank (TW Traders)</label>
                  <input
                    type="number" min="0" step="0.01" value={addBankTwTraders}
                    onChange={(e) => { setAddBankTwTraders(e.target.value); setPaymentErrors((p) => ({ ...p, addBankTwTraders: undefined, addBank: undefined, addCash: undefined, add: undefined })); }}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: (getPaymentRealtimeError() || paymentErrors.addBankTwTraders) ? '1px solid #dc2626' : '1px solid #e0e0e0' }}
                  />
                </div>
              </div>

              <div style={{ padding: '10px', background: '#f9fafb', borderRadius: '6px', marginBottom: '13px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '10px' }}>
                <div><span style={{ color: '#666' }}>New Bank (TWF)</span><div style={{ fontWeight: '600' }}>{formatAmount(newBank)}</div></div>
                <div><span style={{ color: '#666' }}>New Bank (TW Traders)</span><div style={{ fontWeight: '600' }}>{formatAmount(newBankTwTraders)}</div></div>
                <div><span style={{ color: '#666' }}>New Cash Total</span><div style={{ fontWeight: '600' }}>{formatAmount(newCash)}</div></div>
                <div><span style={{ color: '#666' }}>New Received Total</span><div style={{ fontWeight: '600' }}>{formatAmount(newReceived)}</div></div>
                <div><span style={{ color: '#666' }}>New Pending</span><div style={{ fontWeight: '600' }}>{formatAmount(newPending)}</div></div>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => !submittingPayment && setPaymentOrder(null)} disabled={submittingPayment} style={{ padding: '8px 16px', background: '#e0e0e0', color: '#333', border: 'none', borderRadius: '8px', cursor: submittingPayment ? 'not-allowed' : 'pointer' }}>Close</button>
                <button
                  type="button"
                  onClick={handleSubmitPayment}
                  disabled={submittingPayment || !!getPaymentRealtimeError() || ((parseFloat(addBank) || 0) === 0 && (parseFloat(addBankTwTraders) || 0) === 0 && (parseFloat(addCash) || 0) === 0)}
                  style={{ padding: '8px 16px', background: '#166534', color: '#fff', border: 'none', borderRadius: '8px', cursor: submittingPayment ? 'not-allowed' : 'pointer' }}
                >
                  {submittingPayment ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}

        {cancelConfirm && (
          <div className="om-cancel-modal-wrap" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: '16px' }}>
            <div className="om-modal-box" style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '100%' }}>
              <p style={{ margin: '0 0 16px 0', fontSize: '14px' }}>Move this order to cancelled orders? This will remove it from the orders table.</p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setCancelConfirm(null)} style={{ padding: '8px 16px', background: '#f5f5f5', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>No</button>
                <button type="button" onClick={handleCancelConfirm} style={{ padding: '8px 16px', background: '#c62828', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Yes, cancel order</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
