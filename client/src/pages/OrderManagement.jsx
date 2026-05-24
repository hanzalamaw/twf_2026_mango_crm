import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { API_BASE as API } from '../config/api';
import { useAuth } from '../context/AuthContext';
const PAGE_SIZE = 50;
const HIDDEN_TYPES_BOOKING = ['Cow', 'Fancy Cow', 'Goat'];

const COLUMNS = [
  { key: 'customer_id',    label: 'Customer ID'    },
  { key: 'order_id',       label: 'Order ID'       },
  { key: 'cow',            label: 'Cow'            },
  { key: 'hissa',          label: 'Hissa'          },
  { key: 'slot',           label: 'Slot'           },
  { key: 'booking_name',   label: 'Booking Name'   },
  { key: 'shareholder_name', label: 'Shareholder Name' },
  { key: 'phone_number',   label: 'Phone Number'   },
  { key: 'alt_phone',      label: 'Alt. Phone'     },
  { key: 'address',        label: 'Address'        },
  { key: 'area',           label: 'Area'           },
  { key: 'day',            label: 'Day'            },
  { key: 'type',           label: 'Type'           },
  { key: 'booking_date',   label: 'Booking Date'   },
  { key: 'total_amount',   label: 'Total Amount'   },
  { key: 'bank',           label: 'Bank'           },
  { key: 'cash',           label: 'Cash'           },
  { key: 'received',       label: 'Received'       },
  { key: 'pending',        label: 'Pending'        },
  { key: 'source',         label: 'Source'         },
  { key: 'reference',      label: 'Reference'      },
  { key: 'closed_by',      label: 'Closed By'      },
  { key: 'description',    label: 'Description'    },
  { key: 'payment_status', label: 'Payment Status' },
];

const AMOUNT_KEYS = ['total_amount', 'bank', 'cash', 'received', 'pending'];

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
      {isPending ? 'Pending' : (status ? 'Received' : '—')}
    </span>
  );
}

const defaultEditRow = () => ({
  order_id: '', customer_id: '', cow: '', hissa: '', slot: '',
  booking_name: '', shareholder_name: '', phone_number: '', alt_phone: '',
  address: '', area: '', day: '', type: '', booking_date: '',
  total_amount: '', received: '', pending: '', source: '', reference: '', closed_by: '', description: '',
});

const EDIT_FIELD_KEYS_BOOKING = ['order_id', 'customer_id', 'cow', 'hissa', 'slot', 'booking_name', 'shareholder_name', 'phone_number', 'alt_phone', 'address', 'area', 'day', 'type', 'booking_date', 'total_amount', 'received', 'pending', 'source', 'reference', 'closed_by'];
const EDIT_FIELD_KEYS_FARM = ['order_id', 'customer_id', 'slot', 'booking_name', 'shareholder_name', 'phone_number', 'alt_phone', 'address', 'area', 'day', 'type', 'booking_date', 'total_amount', 'received', 'pending', 'source', 'reference', 'closed_by'];

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
  if (!trim(row.customer_id))     errors.customer_id     = 'Customer ID is required';
  if (!trim(row.booking_name))    errors.booking_name    = 'Booking name is required';
  if (!trim(row.shareholder_name)) errors.shareholder_name = 'Shareholder name is required';
  const phone = trim(row.phone_number);
  if (!phone) errors.phone_number = 'Phone number is required';
  else if (!/^[\d\s\-+()]{7,20}$/.test(phone)) errors.phone_number = 'Enter a valid phone number (7–20 digits/symbols)';
  const dateStr = trim(row.booking_date);
  if (dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) errors.booking_date = 'Date must be YYYY-MM-DD';
    else if (Number.isNaN(new Date(dateStr).getTime())) errors.booking_date = 'Invalid date';
  }
  const total    = Number(trim(row.total_amount));
  const received = Number(trim(row.received));
  const pending  = Number(trim(row.pending));
  if (trim(row.total_amount) !== '' && (Number.isNaN(total)    || total    < 0)) errors.total_amount = 'Total must be a number ≥ 0';
  if (trim(row.received)     !== '' && (Number.isNaN(received) || received < 0)) errors.received     = 'Received must be a number ≥ 0';
  if (trim(row.pending)      !== '' && (Number.isNaN(pending)  || pending  < 0)) errors.pending      = 'Pending must be a number ≥ 0';
  if (!Number.isNaN(total) && !Number.isNaN(received) && total < received) errors.total_amount = 'Total amount cannot be less than received amount';
  return errors;
}

export default function OrderManagement() {
  const [orders,      setOrders]      = useState([]);
  const [filters,     setFilters]     = useState({ slots: [], order_types: [], days: [], references: [] });
  const [search,      setSearch]      = useState('');
  const [slot,        setSlot]        = useState('');
  const [orderType,   setOrderType]   = useState('');
  const [day,         setDay]         = useState('');
  const [reference,   setReference]   = useState('');
  const [cowNumber,   setCowNumber]   = useState('');
  const [yearFilter,  setYearFilter]  = useState('2026');
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editOpen,    setEditOpen]    = useState(false);
  const [editRow,     setEditRow]     = useState(defaultEditRow);
  const [editPreviousRow, setEditPreviousRow] = useState(null);
  const [editErrors,  setEditErrors]  = useState({});
  const [saving,      setSaving]      = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(null);
  const [page,        setPage]        = useState(1);
  const [totalCount,  setTotalCount]  = useState(0);
  const [mobileFiltersOpen,  setMobileFiltersOpen]  = useState(false);
  const [editDuplicateError, setEditDuplicateError] = useState(null);
  const editDuplicateCheckTimeoutRef = useRef(null);

  const { authFetch } = useAuth();
  const token = localStorage.getItem('token');
  const location = useLocation();
  const isFarm = location.pathname.startsWith('/farm');
  // Farm view must show DB order_type 'Cow' and 'Fancy Cow' as 'Fancy Cow', plus exact 'Goat'.
  // Backend expands Fancy Cow to include legacy Cow only when farm_order_management=1.
  const FARM_ORDER_TYPES = ['Fancy Cow', 'Goat'];
  const visibleOrderTypes = (filters.order_types || []).filter((t) => (
    isFarm ? FARM_ORDER_TYPES.includes(t) : !HIDDEN_TYPES_BOOKING.includes(t)
  ));
  const applyFarmOrderScope = (params) => {
    if (!isFarm) return;
    params.set('farm_order_management', '1');
    if (orderType) {
      params.set('order_type', orderType);
      return;
    }
    FARM_ORDER_TYPES.forEach((type) => params.append('order_type', type));
  };
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;

  /* ── fetch ── */
  const fetchFilters = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      const url = `${API}/booking/orders/filters${params.toString() ? `?${params}` : ''}`;
      const res = await authFetch(url);
      if (res.ok) { const data = await res.json(); setFilters(data); }
    } catch (e) { console.error(e); }
  }, [authFetch, yearFilter, isFarm]);

  const fetchOrders = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim())      params.set('search',     search.trim());
      if (!isFarm) {
        if (slot)             params.set('slot',        slot);
        if (day)              params.set('day',         day);
        if (cowNumber.trim()) params.set('cow_number',  cowNumber.trim());
      }
      if (isFarm) {
        applyFarmOrderScope(params);
      } else {
        if (orderType)        params.set('order_type',  orderType);
        params.set('omit_hidden_types', '1');
      }
      if (reference)          params.set('reference',   reference);
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      params.set('page',  String(page));
      params.set('limit', String(PAGE_SIZE));
      const res = await authFetch(`${API}/booking/orders?${params}`);
      if (res.ok) {
        const json  = await res.json();
        const data  = Array.isArray(json) ? json : json.data;
        const total = typeof json.total === 'number' ? json.total : (data?.length ?? 0);
        const filtered = (Array.isArray(data) ? data : []).filter((r) => {
          if (isFarm) {
            return FARM_ORDER_TYPES.includes(r.type);
          }
          return !HIDDEN_TYPES_BOOKING.includes(r.type);
        });
        setOrders(filtered);
        setTotalCount(total);
      } else { setError('Failed to load orders'); }
    } catch (e) { setError('Failed to load orders'); }
    finally { setLoading(false); }
  }, [authFetch, token, search, slot, orderType, day, reference, cowNumber, yearFilter, page, isFarm]);

  useEffect(() => { fetchFilters(); }, [fetchFilters]);
  useEffect(() => { setPage(1); }, [search, slot, orderType, day, reference, cowNumber, yearFilter]);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const GOAT_NUMBER_PATTERN = /^G[1-9]\d*$/;
  const shouldSkipCowHissaDup = (type, c) => {
    if (type !== 'Goat (Hissa)') return false;
    const cv = String(c ?? '').trim().toUpperCase();
    return !GOAT_NUMBER_PATTERN.test(cv);
  };

  const checkCowHissaDuplicate = useCallback(async (c, h, type, d, bd, excludeId) => {
    if (!c || !h || !type || !token || shouldSkipCowHissaDup(type, c)) return null;
    try {
      const cowNorm = type === 'Goat (Hissa)' ? String(c).trim().toUpperCase() : String(c).trim();
      const hissaNorm = type === 'Goat (Hissa)' ? '0' : String(h).trim();
      const res = await authFetch(`${API}/booking/check-cow-hissa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cow_number: cowNorm, hissa_number: hissaNorm, order_type: type, day: d || null, booking_date: bd || null }),
      });
      if (res.ok) { const d2 = await res.json(); if (d2.exists && d2.order_id !== excludeId) return d2; }
    } catch (e) { console.error(e); }
    return null;
  }, [authFetch, token]);

  useEffect(() => {
    if (!editOpen || isFarm) return;
    const { cow, hissa, type, day: d, booking_date: bd, order_id } = editRow || {};
    if (!(cow || '').trim() || !type || shouldSkipCowHissaDup(type, cow)) { setEditDuplicateError(null); return; }
    if (editDuplicateCheckTimeoutRef.current) clearTimeout(editDuplicateCheckTimeoutRef.current);
    editDuplicateCheckTimeoutRef.current = setTimeout(async () => {
      const dup = await checkCowHissaDuplicate(String(cow).trim(), String(hissa ?? '').trim(), type, d, bd, order_id);
      setEditDuplicateError(dup || null);
      editDuplicateCheckTimeoutRef.current = null;
    }, 400);
    return () => { if (editDuplicateCheckTimeoutRef.current) clearTimeout(editDuplicateCheckTimeoutRef.current); };
  }, [editRow?.cow, editRow?.hissa, editRow?.type, editRow?.day, editRow?.booking_date, editOpen, isFarm, checkCowHissaDuplicate]);

  /* ── handlers ── */
  const toggleSelect    = (id)  => setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = ()    => selectedIds.size === orders.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(orders.map((r) => r.order_id)));

  const handleEdit = (row) => {
    const init = {
      order_id: row.order_id, customer_id: row.customer_id ?? '',
      ...(isFarm ? {} : { cow: row.cow ?? '', hissa: row.hissa ?? '' }),
      slot: row.slot ?? '', booking_name: row.booking_name ?? '', shareholder_name: row.shareholder_name ?? '',
      phone_number: row.phone_number ?? '', alt_phone: row.alt_phone ?? '', address: row.address ?? '',
      area: row.area ?? '', day: row.day ?? '', type: row.type ?? '', booking_date: formatDate(row.booking_date),
      total_amount: row.total_amount ?? '', received: row.received ?? '', pending: row.pending ?? '',
      source: row.source ?? '', reference: row.reference ?? '', closed_by: row.closed_by ?? '', description: row.description ?? '',
    };
    setEditPreviousRow(init); setEditRow({ ...defaultEditRow(), ...init }); setEditErrors({}); setEditDuplicateError(null); setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    const errors = validateOrderEdit(editRow);
    if (Object.keys(errors).length > 0) { setEditErrors(errors); return; }
    if (!isFarm && editDuplicateError) return;
    setEditErrors({}); setSaving(true);
    try {
      const payload = isFarm ? { ...editRow, cow: '0', hissa: '0' } : { ...editRow };
      if (payload.booking_date) {
        const s = String(payload.booking_date);
        payload.booking_date = s.includes('T') ? s.split('T')[0] : (s.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || s);
      }
      const res = await authFetch(`${API}/booking/orders/${encodeURIComponent(editRow.order_id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) { setEditOpen(false); setEditPreviousRow(null); fetchOrders(); }
      else { const data = await res.json().catch(() => ({})); alert(data.message || 'Failed to update order'); }
    } finally { setSaving(false); }
  };

  const handleInvoice = async (customerId) => {
    try {
      const res = await authFetch(`${API}/booking/invoice/${encodeURIComponent(customerId)}`);
      if (!res.ok) { const data = await res.json().catch(() => ({})); alert(data.message || 'Failed to generate invoice'); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `Invoice-${customerId}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) { alert('Failed to generate invoice'); }
  };

  const handleCancelConfirm = async () => {
    if (!cancelConfirm) return;
    try {
      const res = await authFetch(`${API}/booking/orders/${encodeURIComponent(cancelConfirm.order_id)}/cancel`, { method: 'POST' });
      if (res.ok) { setCancelConfirm(null); fetchOrders(); setSelectedIds((p) => { const n = new Set(p); n.delete(cancelConfirm.order_id); return n; }); }
      else { const data = await res.json().catch(() => ({})); alert(data.message || 'Failed to cancel order'); }
    } finally { setCancelConfirm(null); }
  };

  const handleResetFilters = () => { setSearch(''); setSlot(''); setOrderType(''); setDay(''); setReference(''); setCowNumber(''); setYearFilter('2026'); setSelectedIds(new Set()); setError(''); };

  const handleExport = async () => {
    try {
      const ids = Array.from(selectedIds);
      const limit = 100;
      let pageNum = 1;
      let allOrders = [];
      do {
        const params = new URLSearchParams();
        if (search?.trim()) params.set('search', search.trim());
        if (!isFarm) {
          if (slot) params.set('slot', slot);
          if (day) params.set('day', day);
          if (cowNumber?.trim()) params.set('cow_number', cowNumber.trim());
        }
        if (isFarm) {
          applyFarmOrderScope(params);
        } else {
          if (orderType) params.set('order_type', orderType);
          params.set('omit_hidden_types', '1');
        }
        if (reference) params.set('reference', reference);
        if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
        params.set('page', String(pageNum));
        params.set('limit', String(limit));
        const res = await authFetch(`${API}/booking/orders?${params}`);
        if (!res.ok) { alert('Failed to load data for export'); return; }
        const json = await res.json();
        const data = Array.isArray(json) ? json : json.data;
        const rawChunk = Array.isArray(data) ? data : [];
        const chunk = rawChunk.filter((r) =>
          isFarm ? FARM_ORDER_TYPES.includes(r.type) : !HIDDEN_TYPES_BOOKING.includes(r.type)
        );
        allOrders = allOrders.concat(chunk);
        if (rawChunk.length < limit) break;
        pageNum++;
      } while (true);
      const toExport = ids.length > 0 ? allOrders.filter((r) => ids.includes(r.order_id)) : allOrders;
      if (!toExport.length) { alert('No data to export'); return; }
      const headers = COLUMNS.map((c) => c.label);
      const rows    = toExport.map((row) => COLUMNS.map((col) => {
        const val = row[col.key];
        if (AMOUNT_KEYS.includes(col.key)) { const n = Number(val); return Number.isFinite(n) ? n : (val ?? ''); }
        if (col.key === 'booking_date')    return formatDate(val);
        if (col.key === 'payment_status')  return val || '—';
        return val != null ? String(val) : '—';
      }));
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]); const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Orders');
      XLSX.writeFile(wb, `orders-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
      try {
        const af = {};
        if (search?.trim()) af.search = search.trim();
        if (!isFarm) {
          if (slot) af.slot = slot;
          if (day) af.day = day;
          if (cowNumber?.trim()) af.cow_number = cowNumber.trim();
        }
        if (orderType) af.order_type = orderType;
        if (reference) af.reference = reference;
        if (yearFilter)        af.year        = yearFilter;
        await authFetch(`${API}/booking/orders/export-audit`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count: toExport.length, ...(Object.keys(af).length > 0 && { filters: af }), ...(ids.length > 0 && { order_ids: ids }) }),
        });
      } catch (e) { console.error('Audit log failed:', e); }
    } catch (e) { alert('Export failed'); }
  };

  /* ─────────────────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        @keyframes modalSheetInUp {
          from { opacity: 0; transform: translate3d(0, 100%, 0); }
          to   { opacity: 1; transform: translate3d(0, 0, 0); }
        }

        @media (max-width: 767px) {
          /* align page heading with fixed mobile menu button */
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
          .om-cards           { display: none !important; }
          .om-pagination      { flex-direction: column !important; align-items: flex-start !important; }

          /* ── Edit modal mobile overrides ── */
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

        {/* ── Header ── */}
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

        {/* ── Desktop filter bar ── */}
        <div className="om-filter-desktop" style={{ display: 'flex', flexWrap: 'nowrap', gap: '10px', marginBottom: '16px', alignItems: 'flex-end', overflowX: 'auto', minWidth: 0, flexShrink: 0 }}>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Search (name, phone, area, address)</label>
            <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchOrders()} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }} />
          </div>
          {!isFarm && (
          <div style={{ width: 88, minWidth: 88, flexShrink: 0 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px', whiteSpace: 'nowrap' }}>Cow number</label>
            <input type="text" placeholder="Cow #" value={cowNumber} onChange={(e) => setCowNumber(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchOrders()} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }} />
          </div>
          )}
          {[
            ...(!isFarm ? [{ label: 'Slot', val: slot, set: setSlot, opts: filters.slots || [], w: 104 }] : []),
            { label: 'Type', val: orderType, set: setOrderType, opts: visibleOrderTypes, w: 104 },
            ...(!isFarm ? [{ label: 'Day', val: day, set: setDay, opts: filters.days || [], w: 80 }] : []),
            { label: 'Reference', val: reference, set: setReference, opts: filters.references || [], w: 88 },
          ].map(({ label, val, set, opts, w }) => (
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

        {/* ── Mobile: search + toggle ── */}
        <div className="om-filter-toggle" style={{ display: 'none', gap: '8px', marginBottom: '8px', flexShrink: 0, alignItems: 'center' }}>
          <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchOrders()}
            style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px' }} />
          <button type="button" onClick={() => setMobileFiltersOpen((v) => !v)}
            style={{ padding: '9px 12px', borderRadius: '8px', border: `1px solid ${mobileFiltersOpen ? '#FF5722' : '#e0e0e0'}`, background: mobileFiltersOpen ? '#fff4f0' : '#fff', color: mobileFiltersOpen ? '#FF5722' : '#555', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            ⚙ Filters
          </button>
          <button type="button" onClick={handleExport} style={{ padding: '9px 12px', borderRadius: '8px', background: '#7c3aed', color: '#fff', border: 'none', fontSize: '13px', cursor: 'pointer' }}>Export</button>
        </div>

        {/* ── Mobile filter panel ── */}
        <div className="om-filter-mobile" style={{ display: 'none' }}>
          {mobileFiltersOpen && (
            <div className="ops-filter-mobile-panel">
              {!isFarm && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Cow Number</label>
                <input type="text" placeholder="Cow #" value={cowNumber} onChange={(e) => setCowNumber(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px' }} />
              </div>
              )}
              {[
                ...(!isFarm ? [{ label: 'Slot', val: slot, set: setSlot, opts: filters.slots || [] }] : []),
                { label: 'Type', val: orderType, set: setOrderType, opts: visibleOrderTypes },
                ...(!isFarm ? [{ label: 'Day', val: day, set: setDay, opts: filters.days || [] }] : []),
                { label: 'Reference', val: reference, set: setReference, opts: filters.references || [] },
              ].map(({ label, val, set, opts }) => (
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

        {/* ── Desktop table ── */}
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
                        {col.key === 'payment_status' ? <StatusPill status={row[col.key]} />
                          : AMOUNT_KEYS.includes(col.key) ? formatAmount(row[col.key])
                          : col.key === 'booking_date' ? formatDate(row[col.key])
                          : (row[col.key] != null ? String(row[col.key]) : '—')}
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

        {/* ── Pagination ── */}
        {!loading && totalCount > 0 && (
          <div className="om-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '12px 0', borderTop: '1px solid #e0e0e0', marginTop: '8px', flexShrink: 0 }}>
            <span style={{ fontSize: '13px', color: '#666' }}>Showing {orders.length} of {totalCount} orders</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ padding: '6px 12px', fontSize: '10px', background: page <= 1 ? '#f0f0f0' : '#fff', color: page <= 1 ? '#999' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>Previous</button>
              {(() => {
                const sp = 5; let start = Math.max(1, page - Math.floor(sp / 2)); let end = Math.min(totalPages, start + sp - 1);
                if (end - start + 1 < sp) start = Math.max(1, end - sp + 1);
                const pages = []; for (let i = start; i <= end; i++) pages.push(i);
                return pages.map((p) => (
                  <button key={p} type="button" onClick={() => setPage(p)} style={{ minWidth: '32px', padding: '6px 10px', fontSize: '10px', background: p === page ? '#FF5722' : '#fff', color: p === page ? '#fff' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', fontWeight: p === page ? 600 : 400 }}>{p}</button>
                ));
              })()}
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={{ padding: '6px 12px', fontSize: '10px', background: page >= totalPages ? '#f0f0f0' : '#fff', color: page >= totalPages ? '#999' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>Next</button>
            </div>
          </div>
        )}

        {/* ── Edit modal ── */}
        {editOpen && (
          <div
            className="om-edit-modal-wrap"
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
            onClick={() => !saving && (setEditErrors({}), setEditDuplicateError(null), setEditOpen(false), setEditPreviousRow(null))}
          >
            <div
              className="om-edit-modal-box"
              style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', width: 'min(680px, 95vw)', maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Mobile drag handle — hidden on desktop via CSS */}
              <div
                className="om-edit-drag-handle"
                style={{ display: 'none', width: '40px', height: '4px', background: '#e0e0e0', borderRadius: '2px', margin: '0 auto 16px' }}
              />

              <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Edit Order</h3>

              {Object.keys(editErrors).length > 0 && (
                <div style={{ marginBottom: '10px', padding: '8px 10px', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px', fontSize: '12px' }}>Please fix the errors below before saving.</div>
              )}

              <div style={{ fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>Update to</div>

              <div className="om-edit-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                {(isFarm ? EDIT_FIELD_KEYS_FARM : EDIT_FIELD_KEYS_BOOKING).map((key) => {
                  const isReadOnly = key === 'order_id' || key === 'customer_id' || key === 'received' || key === 'pending';
                  const isCowHissaErr = !isFarm && (key === 'cow' || key === 'hissa') && editDuplicateError;
                  return (
                    <div key={key} style={{ minWidth: 0 }}>
                      <label className="om-edit-field-label" style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>{key.replace(/_/g, ' ')}</label>
                      <input
                        disabled={isReadOnly}
                        readOnly={isReadOnly}
                        value={editRow[key] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditRow((prev) => {
                            const next = { ...prev, [key]: val };
                            if (key === 'total_amount') {
                              const total    = parseFloat(val) || 0;
                              const received = parseFloat(prev.received) || 0;
                              next.pending   = Math.max(0, total - received).toFixed(2);
                            }
                            const reErr = validateAmountsRealtime(next);
                            setEditErrors((pe) => { const u = { ...pe }; delete u.total_amount; delete u.received; return { ...u, ...reErr }; });
                            return next;
                          });
                        }}
                        className="om-edit-field-input"
                        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: (editErrors[key] || isCowHissaErr) ? '1px solid #dc2626' : '1px solid #e0e0e0', fontSize: '10px', ...(isReadOnly && { backgroundColor: '#f5f5f5', cursor: 'not-allowed' }) }}
                      />
                      {editErrors[key] && <div className="om-edit-field-error" style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>{editErrors[key]}</div>}
                    </div>
                  );
                })}

                {!isFarm && editDuplicateError && (
                  <div style={{ gridColumn: '1 / -1', padding: '8px 12px', background: '#FEE2E2', borderRadius: '6px', border: '1px solid #FECACA', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ fontSize: '16px', lineHeight: '1' }}>⚠️</span>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#DC2626', marginBottom: '2px' }}>Duplicate Cow/Hissa Combination</div>
                      <div style={{ fontSize: '10px', color: '#7F1D1D' }}>
                        This cow + hissa combination is already used by Order <strong>{editDuplicateError.order_id}</strong>
                        {editDuplicateError.booking_name ? ` (${editDuplicateError.booking_name})` : ''}
                        {editDuplicateError.shareholder_name ? ` — ${editDuplicateError.shareholder_name}` : ''}. Please use a different combination.
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ minWidth: 0, gridColumn: '1 / -1' }}>
                  <label className="om-edit-field-label" style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>description</label>
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
                <button type="button" onClick={() => { setEditDuplicateError(null); setEditOpen(false); }} disabled={saving} style={{ padding: '5px 11px', fontSize: '10px', background: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Close</button>
                <button type="button" onClick={handleSaveEdit} disabled={saving} style={{ padding: '5px 11px', fontSize: '10px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Cancel confirm modal ── */}
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