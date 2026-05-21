import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { API_BASE as API } from '../config/api';
import { useAuth } from '../context/AuthContext';
const PAGE_SIZE = 50;
const HIDDEN_TYPES_BOOKING = ['Cow', 'Fancy Cow', 'Goat'];
const CONFIRM_ORDER_TYPES_BOOKING = ['Hissa - Standard', 'Hissa - Premium', 'Hissa - Waqf', 'Goat (Hissa)'];
const CONFIRM_ORDER_TYPES_FARM = ['Fancy Cow', 'Goat'];
const CLOSED_BY_OPTIONS = ['Ashhad Bhai', 'Ammar Bhai', 'Ashhal', 'Abuzar', 'Omer', 'Abdullah', 'Huzaifa', 'Hanzala', 'External'];
const DAYS = ['DAY 1', 'DAY 2', 'DAY 3'];
const ORDER_TYPE_PRESET_AMOUNTS = { 'Hissa - Standard': '25000', 'Hissa - Premium': '30000', 'Hissa - Waqf': '21000' };
const GOAT_NUMBER_PATTERN = /^G[1-9]\d*$/;

const COLUMNS = [
  { key: 'lead_id',          label: 'Lead ID'          },
  { key: 'customer_id',      label: 'Customer ID'      },
  { key: 'booking_name',     label: 'Booking Name'     },
  { key: 'shareholder_name', label: 'Shareholder Name' },
  { key: 'phone_number',     label: 'Phone Number'     },
  { key: 'alt_phone',        label: 'Alt. Phone'       },
  { key: 'address',          label: 'Address'          },
  { key: 'area',             label: 'Area'             },
  { key: 'day',              label: 'Day'              },
  { key: 'type',             label: 'Type'             },
  { key: 'booking_date',     label: 'Booking Date'     },
  { key: 'total_amount',     label: 'Total Amount'     },
  { key: 'source',           label: 'Source'           },
  { key: 'reference',        label: 'Reference'        },
  { key: 'query_by',         label: 'Query By'         },
  { key: 'description',      label: 'Description'      },
  { key: 'created_at',       label: 'Created'          },
];
const BOOKING_VISIBLE_COLUMN_KEYS = new Set([
  'lead_id',
  'booking_name',
  'phone_number',
  'booking_date',
  'source',
  'reference',
  'query_by',
  'description',
  'created_at',
]);

const AMOUNT_KEYS = ['total_amount'];
const BOOKING_SLOTS = ['SLOT 1', 'SLOT 2', 'SLOT 3', 'SLOT WAQF'];
const FARM_SLOTS = ['SLOT 1', 'SLOT 2', 'SLOT 3', 'SLOT GOAT', 'SLOT WAQF'];

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
/** YYYY-MM-DD or null for API bodies (farm confirm uses lead date without showing the field). */
function apiDateFromLead(val) {
  if (val == null || val === '') return null;
  const s = String(val);
  if (s.includes('T')) return s.split('T')[0];
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}
function formatCreated(val) {
  if (val == null || val === '') return '—';
  try { return new Date(val).toLocaleString(); } catch { return String(val); }
}
function cellVal(col, row) {
  const val = row[col.key];
  if (AMOUNT_KEYS.includes(col.key)) return formatAmount(val);
  if (col.key === 'booking_date') return formatDate(val);
  if (col.key === 'created_at') return formatCreated(val);
  if (col.key === 'query_by') return val != null && String(val).trim() !== '' ? String(val) : '—';
  return val != null ? String(val) : '—';
}

export default function QueryManagement() {
  const { user, authFetch } = useAuth();
  const [leads, setLeads] = useState([]);
  const [filters, setFilters] = useState({ order_types: [], days: [], references: [] });
  const [search, setSearch] = useState('');
  const [orderType, setOrderType] = useState('');
  const [day, setDay] = useState('');
  const [reference, setReference] = useState('');
  const [yearFilter, setYearFilter] = useState('2026');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [confirmingLeadId, setConfirmingLeadId] = useState(null);
  const [confirmModalLead, setConfirmModalLead] = useState(null);
  const [confirmForm, setConfirmForm] = useState({
    order_type: '',
    total_amount: '',
    address: '',
    area: '',
    day: '',
    closed_by: '',
    shareholder_name: '',
    order_id: '',
    slot: '',
    booking_date: '',
    cow_number: '',
    hissa_number: ''
  });
  const [confirmDuplicateError, setConfirmDuplicateError] = useState(null);
  const [confirmFormErrors, setConfirmFormErrors] = useState({});
  const confirmDuplicateCheckTimeoutRef = useRef(null);
  const [area, setArea] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editPreviousRow, setEditPreviousRow] = useState(null);
  const [editErrors, setEditErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const token = localStorage.getItem('token');
  const location = useLocation();
  const isFarm = location.pathname.startsWith('/farm');
  const slotOptions = isFarm ? FARM_SLOTS : BOOKING_SLOTS;
  const isRestrictedBookingRole = ['Staff - Bookings', 'Co-Manager - Bookings'].includes(user?.role);
  const hideConfirmOrder = !isFarm;
  const hideDeleteAction = !isFarm && isRestrictedBookingRole;
  const visibleColumns = isFarm ? COLUMNS : COLUMNS.filter((c) => BOOKING_VISIBLE_COLUMN_KEYS.has(c.key));
  const visibleOrderTypes = (filters.order_types || []).filter((t) => (isFarm ? true : !HIDDEN_TYPES_BOOKING.includes(t)));
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;

  const fetchFilters = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      if (isFarm) params.set('source', 'Farm');
      if (!isFarm) params.set('omit_hidden_types', '1');
      const url = `${API}/booking/leads/filters${params.toString() ? `?${params}` : ''}`;
      const res = await authFetch(url);
      if (res.ok) { const data = await res.json(); setFilters(data); }
    } catch (e) { console.error(e); }
  }, [authFetch, yearFilter, isFarm]);

  const fetchLeads = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (isFarm && orderType) params.set('order_type', orderType);
      if (day) params.set('day', day);
      if (reference) params.set('reference', reference);
      if (isFarm && area) params.set('area', area);
if (isFarm) params.set('source', 'Farm');
if (!isFarm) params.set('omit_hidden_types', '1');
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      const res = await authFetch(`${API}/booking/leads?${params}`);
      if (res.ok) {
        const json = await res.json();
        const raw = Array.isArray(json) ? json : json?.data;
        const data = Array.isArray(raw) ? raw : [];
        const total = typeof json.total === 'number' ? json.total : data.length;
        setLeads(data);
        setTotalCount(total);
      } else { setError('Failed to load queries'); }
    } catch (e) { setError('Failed to load queries'); }
    finally { setLoading(false); }
  }, [authFetch, search, orderType, day, reference, area, yearFilter, page, isFarm]);

  useEffect(() => { fetchFilters(); }, [fetchFilters]);
  useEffect(() => { setPage(1); }, [search, orderType, day, reference, area, yearFilter, isFarm]);
  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  useEffect(() => {
    if (!confirmModalLead || !token) return;
    const ot = confirmForm.order_type || '';
    const d = confirmForm.day || '';
    const ds = formatDate(confirmForm.booking_date || confirmModalLead.booking_date) || '';
    const genOrder = async () => {
      if (!ot) return;
      try {
        const res = await authFetch(`${API}/booking/generate-order-id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_type: ot }) });
        if (res.ok) { const d2 = await res.json(); setConfirmForm((p) => ({ ...p, order_id: d2.order_id || '' })); }
      } catch (e) { console.error(e); }
    };
    const getCowHissa = async () => {
      if (!ot || isFarm) return;
      try {
        const res = await authFetch(`${API}/booking/get-available-cow-hissa`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_type: ot, day: d || null, booking_date: ds || null }) });
        if (res.ok) { const d2 = await res.json(); setConfirmForm((p) => ({ ...p, cow_number: d2.cow_number || '', hissa_number: d2.hissa_number || '' })); }
      } catch (e) { console.error(e); }
    };
    genOrder();
    if (isFarm) {
      setConfirmForm((p) => ({ ...p, cow_number: '0', hissa_number: '0' }));
    } else {
      getCowHissa();
    }
  }, [confirmModalLead, token, confirmForm.order_type, confirmForm.booking_date, authFetch, isFarm]);

  const toggleSelect = (id) => setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => selectedIds.size === leads.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(leads.map((r) => r.lead_id)));
  const handleResetFilters = () => { setSearch(''); setOrderType(''); setDay(''); setReference(''); setArea(''); setYearFilter('2026'); setSelectedIds(new Set()); setError(''); setSuccess(''); };

  const shouldSkip = (ot, c, h) => {
    if (ot !== 'Goat (Hissa)') return false;
    const cv = String(c ?? '').trim().toUpperCase();
    return !GOAT_NUMBER_PATTERN.test(cv);
  };

  const checkDup = useCallback(async (c, h, ot, d, bd) => {
    if (!c || !h || !ot || !token || shouldSkip(ot, c, h)) return null;
    try {
      const res = await authFetch(`${API}/booking/check-cow-hissa`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cow_number: c, hissa_number: h, order_type: ot, day: d || null, booking_date: bd || null }) });
      if (res.ok) { const d2 = await res.json(); return d2.exists ? d2 : null; }
    } catch (e) { console.error(e); }
    return null;
  }, [authFetch, token]);

  useEffect(() => {
    if (!confirmModalLead || !token || isFarm) return;
    const { cow_number: c, hissa_number: h, booking_date: bd } = confirmForm;
    const ot = confirmForm.order_type || ''; const d = confirmForm.day || '';
    if (!(c || '').trim() || !(h || '').trim() || !ot || shouldSkip(ot, c, h)) { setConfirmDuplicateError(null); return; }
    if (confirmDuplicateCheckTimeoutRef.current) clearTimeout(confirmDuplicateCheckTimeoutRef.current);
    confirmDuplicateCheckTimeoutRef.current = setTimeout(async () => {
      const dup = await checkDup((c || '').trim(), (h || '').trim(), ot, d, (bd || '').trim() || null);
      setConfirmDuplicateError(dup || null);
    }, 400);
    return () => { if (confirmDuplicateCheckTimeoutRef.current) clearTimeout(confirmDuplicateCheckTimeoutRef.current); };
  }, [confirmForm.cow_number, confirmForm.hissa_number, confirmForm.booking_date, confirmForm.day, confirmModalLead, token, checkDup, isFarm]);

  const handleConfirmClick = (lead) => {
    setConfirmModalLead(lead); setConfirmDuplicateError(null); setConfirmFormErrors({});
    const presetAmount = ORDER_TYPE_PRESET_AMOUNTS[lead.type || ''] || '';
    setConfirmForm({
      order_type: lead.type || '',
      total_amount: lead.total_amount != null && String(lead.total_amount).trim() !== '' ? String(lead.total_amount) : (isFarm ? presetAmount : ''),
      address: lead.address || '',
      area: lead.area || '',
      day: isFarm ? '' : (lead.day || ''),
      closed_by: '',
      shareholder_name: isFarm ? '-' : (lead.shareholder_name || ''),
      order_id: '',
      slot: '',
      booking_date: isFarm ? (apiDateFromLead(lead.booking_date) || '') : (formatDate(lead.booking_date) === '—' ? '' : formatDate(lead.booking_date)),
      cow_number: isFarm ? '0' : '',
      hissa_number: isFarm ? '0' : ''
    });
  };

  const closeConfirmModal = () => {
    if (confirmingLeadId) return;
    setConfirmModalLead(null);
    setConfirmForm({ order_type: '', total_amount: '', address: '', area: '', day: '', closed_by: '', shareholder_name: '', order_id: '', slot: '', booking_date: '', cow_number: '', hissa_number: '' });
    setConfirmDuplicateError(null);
    setConfirmFormErrors({});
  };

  const handleConfirmOrder = async () => {
    if (!confirmModalLead) return;
    const lead = confirmModalLead; const ot = (confirmForm.order_type || '').trim(); const d = (confirmForm.day || '').trim();
    const bd = (confirmForm.booking_date || '').trim();
    const totalAmount = Number(confirmForm.total_amount);
    const c = (confirmForm.cow_number || '').trim();
    const h = (confirmForm.hissa_number || '').trim();
    const normalizedGoatNumber = c.toUpperCase();
    const fe = {};
    if (!ot) fe.order_type = 'Order type is required';
    if (!(confirmForm.total_amount || '').toString().trim()) fe.total_amount = 'Total amount is required';
    else if (!Number.isFinite(totalAmount) || totalAmount < 0) fe.total_amount = 'Total amount must be a valid positive number';
    if (!(confirmForm.address || '').trim()) fe.address = 'Address is required';
    if (!(confirmForm.area || '').trim()) fe.area = 'Area is required';
    if (!(confirmForm.closed_by || '').trim()) fe.closed_by = 'Closed by is required';
    if (!(confirmForm.order_id || '').trim()) fe.order_id = 'Order ID is required';
    if (isFarm) {
      if (!bd) fe.booking_date = 'Booking date is required';
    } else {
      if (!d) fe.day = 'Day is required';
      if (!(confirmForm.shareholder_name || '').trim()) fe.shareholder_name = 'Shareholder name is required';
      if (!(confirmForm.slot || '').trim()) fe.slot = 'Slot is required';
      if (!bd) fe.booking_date = 'Booking date is required';
      if (!c) fe.cow_number = 'Cow number is required';
      if (!h) fe.hissa_number = 'Hissa number is required';
    }
    if (Object.keys(fe).length > 0) { setConfirmFormErrors(fe); return; }
    if (!isFarm && ot === 'Goat (Hissa)' && !GOAT_NUMBER_PATTERN.test(normalizedGoatNumber)) {
      setConfirmFormErrors((p) => ({ ...p, cow_number: 'Goat number must be in G1, G2 format' }));
      return;
    }
    setConfirmFormErrors({});
    if (!isFarm && c && h && ot && !shouldSkip(ot, c, h)) {
      const dup = await checkDup(c, h, ot, d, bd);
      if (dup) { setConfirmDuplicateError(dup); return; }
    }
    setConfirmDuplicateError(null); setConfirmingLeadId(lead.lead_id); setError(''); setSuccess('');
    try {
      const res = await authFetch(`${API}/booking/leads/${encodeURIComponent(lead.lead_id)}/confirm-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isFarm ? {
          order_type: ot,
          total_amount: totalAmount,
          address: (confirmForm.address || '').trim(),
          area: (confirmForm.area || '').trim(),
          day: null,
          closed_by: (confirmForm.closed_by || '').trim(),
          shareholder_name: '-',
          order_id: (confirmForm.order_id || '').trim(),
          slot: null,
          booking_date: bd || null,
          cow_number: '0',
          hissa_number: '0'
        } : {
          order_type: ot,
          total_amount: totalAmount,
          address: (confirmForm.address || '').trim(),
          area: (confirmForm.area || '').trim(),
          day: d,
          closed_by: (confirmForm.closed_by || '').trim(),
          shareholder_name: (confirmForm.shareholder_name || '').trim(),
          order_id: (confirmForm.order_id || '').trim(),
          slot: (confirmForm.slot || '').trim() || null,
          booking_date: bd || null,
          cow_number: ot === 'Goat (Hissa)' ? normalizedGoatNumber : (c || null),
          hissa_number: ot === 'Goat (Hissa)' ? '0' : (h || null)
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.order_id) {
        setConfirmModalLead(null);
        setConfirmForm({ order_type: '', total_amount: '', address: '', area: '', day: '', closed_by: '', shareholder_name: '', order_id: '', slot: '', booking_date: '', cow_number: '', hissa_number: '' });
        setConfirmDuplicateError(null); setConfirmFormErrors({});
        setSelectedIds((p) => { const n = new Set(p); n.delete(lead.lead_id); return n; });
        setSuccess(`Order ${data.order_id} saved successfully.`);
        setTimeout(() => setSuccess(''), 3000);
        fetchLeads();
      } else setError(data.message || 'Failed to confirm order');
    } catch (e) { setError('Failed to confirm order'); }
    finally { setConfirmingLeadId(null); }
  };

  const handleEditLead = (row) => {
    const init = {
      lead_id: row.lead_id, customer_id: row.customer_id ?? '', phone_number: row.phone_number ?? '',
      alt_phone: row.alt_phone ?? '', type: row.type ?? '', booking_name: row.booking_name ?? '',
      shareholder_name: row.shareholder_name ?? '', address: row.address ?? '', area: row.area ?? '',
      day: row.day ?? '', booking_date: formatDate(row.booking_date), total_amount: row.total_amount ?? '',
      source: row.source ?? '', reference: row.reference ?? '', query_by: row.query_by ?? '', description: row.description ?? ''
    };
    setEditPreviousRow(init); setEditRow({ ...init }); setEditErrors({}); setEditOpen(true);
  };

  const validateEdit = (row) => {
    const err = {}; const trim = (v) => (v == null ? '' : String(v).trim());
    if (!trim(row.booking_name)) err.booking_name = 'Booking name is required';
    if (!trim(row.shareholder_name)) err.shareholder_name = 'Shareholder name is required';
    const ph = trim(row.phone_number);
    if (!ph) err.phone_number = 'Phone number is required';
    else if (!/^[\d\s\-+()]{7,20}$/.test(ph)) err.phone_number = 'Enter a valid phone number (7–20 digits/symbols)';
    const ds = trim(row.booking_date);
    if (ds) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) err.booking_date = 'Date must be YYYY-MM-DD';
      else if (Number.isNaN(new Date(ds).getTime())) err.booking_date = 'Invalid date';
    }
    const tot = trim(row.total_amount);
    if (tot !== '') { const n = Number(tot); if (Number.isNaN(n) || n < 0) err.total_amount = 'Must be a number ≥ 0'; }
    return err;
  };

  const handleSaveEdit = async () => {
    if (!editRow) return;
    const err = validateEdit(editRow);
    if (Object.keys(err).length > 0) { setEditErrors(err); return; }
    setEditErrors({}); setSaving(true);
    try {
      const payload = { ...editRow }; delete payload.lead_id;
      if (payload.booking_date) payload.booking_date = String(payload.booking_date).split('T')[0] || payload.booking_date;
      const res = await authFetch(`${API}/booking/leads/${encodeURIComponent(editRow.lead_id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setEditOpen(false); setEditRow(null); setEditPreviousRow(null); fetchLeads(); }
      else setEditErrors({ submit: data.message || 'Failed to update lead' });
    } catch (e) { setEditErrors({ submit: 'Failed to update lead' }); }
    finally { setSaving(false); }
  };

  const handleDeleteLead = async () => {
    if (!deleteConfirm) return;
    const id = deleteConfirm.lead_id; setDeleteConfirm(null);
    try {
      const res = await authFetch(`${API}/booking/leads/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setSelectedIds((p) => { const n = new Set(p); n.delete(id); return n; }); fetchLeads(); }
      else setError(data.message || 'Failed to delete lead');
    } catch (e) { setError('Failed to delete lead'); }
  };

  const handleExport = async () => {
    const ids = Array.from(selectedIds);
    let allLeads = [];
    const limit = 100;
    let pageNum = 1;
    do {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (isFarm && orderType) params.set('order_type', orderType);
if (day) params.set('day', day);
if (reference) params.set('reference', reference);
if (isFarm && area) params.set('area', area);
if (isFarm) params.set('source', 'Farm');
if (!isFarm) params.set('omit_hidden_types', '1');
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      params.set('page', String(pageNum));
      params.set('limit', String(limit));
      const res = await authFetch(`${API}/booking/leads?${params}`);
      if (!res.ok) { setError('Failed to load queries for export'); return; }
      const json = await res.json();
      const raw = Array.isArray(json) ? json : json?.data;
      const chunk = Array.isArray(raw) ? raw : [];
      const total = typeof json.total === 'number' ? json.total : chunk.length;
      allLeads = allLeads.concat(chunk);
      if (chunk.length < limit || allLeads.length >= total) break;
      pageNum++;
    } while (true);
    const toExport = ids.length ? allLeads.filter((r) => ids.includes(r.lead_id)) : allLeads;
    if (!toExport.length) { alert('Select at least one row to export, or leave none selected to export all.'); return; }
    const headers = COLUMNS.map((c) => c.label);
    const rows = toExport.map((row) => COLUMNS.map((col) => {
      const val = row[col.key];
      if (AMOUNT_KEYS.includes(col.key)) { const n = Number(val); return Number.isFinite(n) ? n : (val ?? ''); }
      if (col.key === 'booking_date') return formatDate(val);
      if (col.key === 'created_at') return formatCreated(val);
      return val != null ? String(val) : '—';
    }));
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Queries');
    XLSX.writeFile(wb, `queries-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
    try {
      const af = {};
      if (search?.trim()) af.search = search.trim();
if (isFarm && area) af.area = area;
if (isFarm && orderType) af.order_type = orderType;
if (day) af.day = day;
      if (reference) af.reference = reference; if (yearFilter) af.year = yearFilter;
      await authFetch(`${API}/booking/leads/export-audit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: toExport.length, ...(Object.keys(af).length > 0 && { filters: af }), ...(ids.length > 0 && { lead_ids: ids }) })
      });
    } catch (e) { console.error('Export audit failed', e); }
  };

  const miStyle = (hasErr) => ({
    width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px',
    border: hasErr ? '1px solid #dc2626' : '1px solid #e0e0e0', fontSize: '13px'
  });

  /* ─── render ─── */
  return (
    <>
      <style>{`
        @keyframes modalSheetInUp {
          from { opacity: 0; transform: translate3d(0, 100%, 0); }
          to   { opacity: 1; transform: translate3d(0, 0, 0); }
        }

        @media (max-width: 767px) {
          /* align page heading with fixed mobile menu button */
          .qm-root               { padding: 16px 12px 24px !important; overflow: auto !important; }
          .qm-header             { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; margin-bottom: 12px !important; }
          .qm-header h2          {
            min-height: 55px !important; display: flex !important; align-items: center !important; box-sizing: border-box !important;
            margin: 0 !important; padding: 0 !important;
            font-size: clamp(15px, 4.3vw, 17px) !important; font-weight: 600 !important; color: #333 !important; line-height: 1.25 !important;
          }
          .qm-filter-desktop     { display: none !important; }
          .qm-filter-toggle-row  { display: flex !important; }
          .qm-filter-mobile-panel{ display: block !important; }
          .qm-table-wrap         { display: block !important; }
          .qm-cards              { display: none !important; }
          .qm-pagination         { flex-direction: column !important; align-items: flex-start !important; }
          .qm-modal-overlay      { align-items: flex-end !important; justify-content: center !important; padding: 0 !important; }
          .qm-modal-box          {
            padding: 20px 16px max(24px, env(safe-area-inset-bottom, 0px)) !important;
            border-radius: 20px 20px 0 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            max-height: 92dvh !important;
            margin: 0 !important;
            overflow-y: auto !important;
            animation: modalSheetInUp 0.38s cubic-bezier(0.25, 0.8, 0.25, 1) both !important;
          }
          .qm-cow-grid           { grid-template-columns: 1fr !important; }
          .qm-confirm-grid       { grid-template-columns: 1fr !important; }
          .qm-edit-grid          { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="qm-root" style={{ padding: '19px', fontFamily: "'Poppins','Inter',sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>

        {/* Header */}
        <div className="qm-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333', whiteSpace: 'nowrap' }}>Query Management</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '10px', color: '#666', whiteSpace: 'nowrap' }}>Year</label>
            <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px', minWidth: '112px' }}>
              <option value="all">All</option>
              <option value="2026">Year 2026</option>
              <option value="2025">Year 2025</option>
              <option value="2024">Before 2025</option>
            </select>
          </div>
        </div>

        {/* Desktop filter bar */}
        <div className="qm-filter-desktop" style={{ display: 'flex', flexWrap: 'nowrap', gap: '10px', marginBottom: '16px', alignItems: 'flex-end', overflowX: 'auto', minWidth: 0, flexShrink: 0 }}>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Search (name, phone, address)</label>
            <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchLeads()}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }} />
          </div>
          {[
  ...(isFarm ? [
    { label: 'Area', val: area, set: setArea, opts: filters.areas || [], w: 88 },
    { label: 'Type', val: orderType, set: setOrderType, opts: visibleOrderTypes, w: 104 },
  ] : []),
  { label: 'Day',  val: day,  set: setDay,  opts: filters.days || [], w: 80 },
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
            <button type="button" onClick={fetchLeads} style={{ padding: '6px 13px', height: '29px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Apply</button>
            <button type="button" onClick={handleResetFilters} style={{ padding: '6px 13px', height: '29px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Reset</button>
            <button type="button" onClick={handleExport} style={{ padding: '6px 13px', height: '29px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Export</button>
          </div>
        </div>

        {/* Mobile: search + filters toggle */}
        <div className="qm-filter-toggle-row" style={{ display: 'none', gap: '8px', marginBottom: '8px', flexShrink: 0, alignItems: 'center' }}>
          <input type="text" placeholder="Search…" value={search}
            onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchLeads()}
            style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px' }} />
          <button type="button" onClick={() => setMobileFiltersOpen((v) => !v)}
            style={{ padding: '9px 12px', borderRadius: '8px', border: `1px solid ${mobileFiltersOpen ? '#FF5722' : '#e0e0e0'}`, background: mobileFiltersOpen ? '#fff4f0' : '#fff', color: mobileFiltersOpen ? '#FF5722' : '#555', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            ⚙ Filters
          </button>
          <button type="button" onClick={handleExport}
            style={{ padding: '9px 12px', borderRadius: '8px', background: '#7c3aed', color: '#fff', border: 'none', fontSize: '13px', cursor: 'pointer' }}>
            Export
          </button>
        </div>

        {/* Mobile filter panel */}
        <div className="qm-filter-mobile-panel" style={{ display: 'none' }}>
          {mobileFiltersOpen && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
  ...(isFarm ? [
    { label: 'Area', val: area, set: setArea, opts: filters.areas || [] },
    { label: 'Type', val: orderType, set: setOrderType, opts: visibleOrderTypes },
  ] : []),
  { label: 'Day',  val: day,  set: setDay,  opts: filters.days || [] },
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
                <button type="button" onClick={() => { fetchLeads(); setMobileFiltersOpen(false); }}
                  style={{ flex: 1, padding: '10px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Apply</button>
                <button type="button" onClick={() => { handleResetFilters(); setMobileFiltersOpen(false); }}
                  style={{ flex: 1, padding: '10px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Reset</button>
              </div>
            </div>
          )}
        </div>

        {error && <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', flexShrink: 0, fontSize: '10px' }}>{error}</div>}
        {success && <div style={{ padding: '10px', background: '#F0FDF4', color: '#166534', borderRadius: '6px', marginBottom: '13px', flexShrink: 0, fontSize: '10px', border: '1px solid #BBF7D0' }}>{success}</div>}

        {/* Desktop table */}
        <div className="qm-table-wrap" style={{ flex: 1, minHeight: '304px', overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: '6px', background: '#fff' }}>
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading queries...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', tableLayout: 'auto' }}>
              <thead>
                <tr style={{ background: '#f5f5f5' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap', width: '40px' }}>
                    <input type="checkbox" checked={leads.length > 0 && selectedIds.size === leads.length} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                  </th>
                  {!hideConfirmOrder && (
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap', width: '120px' }}>Confirm Order</th>
                  )}
                  {visibleColumns.map((col) => (
                    <th key={col.key} style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>{col.label}</th>
                  ))}
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr><td colSpan={visibleColumns.length + (hideConfirmOrder ? 2 : 3)} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>No queries found.</td></tr>
                ) : leads.map((row) => (
                  <tr key={row.lead_id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}><input type="checkbox" checked={selectedIds.has(row.lead_id)} onChange={() => toggleSelect(row.lead_id)} style={{ cursor: 'pointer' }} /></td>
                    {!hideConfirmOrder && (
                      <td style={{ padding: '8px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                        <button type="button" onClick={() => handleConfirmClick(row)} disabled={confirmingLeadId === row.lead_id}
                          style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '600', background: confirmingLeadId === row.lead_id ? '#e0e0e0' : '#166534', color: '#fff', border: 'none', borderRadius: '6px', cursor: confirmingLeadId === row.lead_id ? 'not-allowed' : 'pointer' }}>
                          {confirmingLeadId === row.lead_id ? '...' : 'Confirm'}
                        </button>
                      </td>
                    )}
                    {visibleColumns.map((col) => (
                      <td key={col.key} style={{ padding: '8px', whiteSpace: 'nowrap' }}>{cellVal(col, row)}</td>
                    ))}
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => handleEditLead(row)} title="Edit" style={{ marginRight: '8px', padding: '4px', cursor: 'pointer', background: 'none', border: 'none', verticalAlign: 'middle' }}><img src="/icons/edit.png" alt="Edit" style={{ width: '15px', height: '15px', display: 'block' }} /></button>
                      {!hideDeleteAction && (
                        <button type="button" onClick={() => setDeleteConfirm(row)} title="Delete" style={{ padding: '4px', cursor: 'pointer', background: 'none', border: 'none', verticalAlign: 'middle' }}><img src="/icons/delete.png" alt="Delete" style={{ width: '18px', height: '18px', display: 'block' }} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Confirm modal */}
        {confirmModalLead && (
          <div className="qm-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1001, padding: '16px', overflowY: 'auto' }} onClick={closeConfirmModal}>
            <div className="qm-modal-box" style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '760px', width: '100%', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', margin: 'auto 0' }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Confirm order</h3>
              <p style={{ margin: '0 0 16px 0', color: '#555', fontSize: '13px' }}>Create order from lead &quot;{confirmModalLead.booking_name || confirmModalLead.lead_id}&quot;.</p>
              <div className="qm-confirm-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>Order Type <span style={{ color: '#dc2626' }}>*</span></label>
                  <select
                    value={confirmForm.order_type}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      const preset = ORDER_TYPE_PRESET_AMOUNTS[nextType];
                      const isGoatType = nextType === 'Goat (Hissa)';
                      setConfirmForm((p) => ({
                        ...p,
                        order_type: nextType,
                        total_amount: preset || '0',
                        order_id: '',
                        cow_number: isFarm ? '0' : (isGoatType ? p.cow_number : ''),
                        hissa_number: isFarm ? '0' : (isGoatType ? '0' : '')
                      }));
                      setConfirmDuplicateError(null);
                      setConfirmFormErrors((p) => ({ ...p, order_type: undefined }));
                    }}
                    style={miStyle(confirmFormErrors.order_type)}
                  >
                    <option value="">Select Order Type</option>
                    {(isFarm ? CONFIRM_ORDER_TYPES_FARM : CONFIRM_ORDER_TYPES_BOOKING).map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {confirmFormErrors.order_type && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>{confirmFormErrors.order_type}</div>}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>Total Amount <span style={{ color: '#dc2626' }}>*</span></label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={confirmForm.total_amount}
                    onChange={(e) => { setConfirmForm((p) => ({ ...p, total_amount: e.target.value })); setConfirmFormErrors((p) => ({ ...p, total_amount: undefined })); }}
                    style={miStyle(confirmFormErrors.total_amount)}
                  />
                  {confirmFormErrors.total_amount && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>{confirmFormErrors.total_amount}</div>}
                </div>
                {!isFarm && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>Shareholder Name <span style={{ color: '#dc2626' }}>*</span></label>
                  <input
                    value={confirmForm.shareholder_name}
                    onChange={(e) => { setConfirmForm((p) => ({ ...p, shareholder_name: e.target.value })); setConfirmFormErrors((p) => ({ ...p, shareholder_name: undefined })); }}
                    style={miStyle(confirmFormErrors.shareholder_name)}
                  />
                  {confirmFormErrors.shareholder_name && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>{confirmFormErrors.shareholder_name}</div>}
                </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>Area <span style={{ color: '#dc2626' }}>*</span></label>
                  <input
                    value={confirmForm.area}
                    onChange={(e) => { setConfirmForm((p) => ({ ...p, area: e.target.value })); setConfirmFormErrors((p) => ({ ...p, area: undefined })); }}
                    style={miStyle(confirmFormErrors.area)}
                  />
                  {confirmFormErrors.area && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>{confirmFormErrors.area}</div>}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>Address <span style={{ color: '#dc2626' }}>*</span></label>
                  <textarea
                    rows={2}
                    value={confirmForm.address}
                    onChange={(e) => { setConfirmForm((p) => ({ ...p, address: e.target.value })); setConfirmFormErrors((p) => ({ ...p, address: undefined })); }}
                    style={{ ...miStyle(confirmFormErrors.address), resize: 'vertical', fontFamily: 'inherit' }}
                  />
                  {confirmFormErrors.address && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>{confirmFormErrors.address}</div>}
                </div>
                {!isFarm && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>Day <span style={{ color: '#dc2626' }}>*</span></label>
                  <select
                    value={confirmForm.day}
                    onChange={(e) => {
                      const nextDay = e.target.value;
                      setConfirmForm((p) => ({
                        ...p,
                        day: nextDay,
                        cow_number: p.order_type === 'Goat (Hissa)' ? p.cow_number : '',
                        hissa_number: p.order_type === 'Goat (Hissa)' ? '0' : '',
                      }));
                      setConfirmDuplicateError(null);
                      setConfirmFormErrors((p) => ({ ...p, day: undefined }));
                    }}
                    style={miStyle(confirmFormErrors.day)}
                  >
                    <option value="">Select Day</option>
                    {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  {confirmFormErrors.day && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>{confirmFormErrors.day}</div>}
                </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>Closed By <span style={{ color: '#dc2626' }}>*</span></label>
                  <select
                    value={confirmForm.closed_by}
                    onChange={(e) => { setConfirmForm((p) => ({ ...p, closed_by: e.target.value })); setConfirmFormErrors((p) => ({ ...p, closed_by: undefined })); }}
                    style={miStyle(confirmFormErrors.closed_by)}
                  >
                    <option value="">Select Closed By</option>
                    {CLOSED_BY_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {confirmFormErrors.closed_by && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>{confirmFormErrors.closed_by}</div>}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>Order ID <span style={{ color: '#dc2626' }}>*</span></label>
                  <input value={confirmForm.order_id} readOnly placeholder="Auto-generated" style={{ ...miStyle(confirmFormErrors.order_id), background: '#f5f5f5', cursor: 'not-allowed', color: '#555' }} />
                  {confirmFormErrors.order_id && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>{confirmFormErrors.order_id}</div>}
                </div>
                {!isFarm && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>Slot <span style={{ color: '#dc2626' }}>*</span></label>
                  <select value={confirmForm.slot} onChange={(e) => { setConfirmForm((p) => ({ ...p, slot: e.target.value })); setConfirmFormErrors((p) => ({ ...p, slot: undefined })); }} style={miStyle(confirmFormErrors.slot)}>
                    <option value="">Select Slot</option>
                    {slotOptions.map((s) => (
  <option key={s} value={s}>{s}</option>
))}
                  </select>
                  {confirmFormErrors.slot && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>{confirmFormErrors.slot}</div>}
                </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>Booking Date <span style={{ color: '#dc2626' }}>*</span></label>
                  <input type="date" value={confirmForm.booking_date} onChange={(e) => {
                    const nd = e.target.value;
                    setConfirmForm((p) => ({ ...p, booking_date: nd }));
                    setConfirmFormErrors((p) => ({ ...p, booking_date: undefined }));
                    if (!isFarm && confirmForm.order_type && token) {
                      authFetch(`${API}/booking/get-available-cow-hissa`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_type: confirmForm.order_type, day: confirmForm.day || null, booking_date: nd || null }) })
                        .then((r) => r.ok ? r.json() : {})
                        .then((d2) => { if (d2 && (d2.cow_number != null || d2.hissa_number != null)) setConfirmForm((p) => ({ ...p, cow_number: d2.cow_number || '', hissa_number: d2.hissa_number || '' })); })
                        .catch(() => {});
                    }
                  }} style={miStyle(confirmFormErrors.booking_date)} />
                  {confirmFormErrors.booking_date && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>{confirmFormErrors.booking_date}</div>}
                </div>
                {!isFarm && (
                <div className="qm-cow-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>{confirmForm.order_type === 'Goat (Hissa)' ? 'Goat Number' : 'Cow Number'} <span style={{ color: '#dc2626' }}>*</span></label>
                    <input value={confirmForm.cow_number}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const nextValue = confirmForm.order_type === 'Goat (Hissa)'
                          ? (raw.toUpperCase().replace(/[^G0-9]/g, '').startsWith('G')
                            ? `G${raw.toUpperCase().replace(/[^G0-9]/g, '').slice(1).replace(/G/g, '')}`
                            : raw.toUpperCase().replace(/[^G0-9]/g, '').replace(/G/g, ''))
                          : raw;
                        setConfirmForm((p) => ({ ...p, cow_number: nextValue, hissa_number: p.order_type === 'Goat (Hissa)' ? '0' : p.hissa_number }));
                        setConfirmDuplicateError(null);
                        setConfirmFormErrors((p) => ({ ...p, cow_number: undefined }));
                      }}
                      onBlur={async () => { if (!confirmModalLead) return; const { cow_number: c, hissa_number: h, booking_date: bd, order_type: ot, day: d } = confirmForm; if (c && h && ot && !shouldSkip(ot, c, h)) { const dup = await checkDup(c, h, ot, d, bd); if (dup) setConfirmDuplicateError(dup); } }}
                      placeholder="Auto-generated" style={miStyle(confirmFormErrors.cow_number || confirmDuplicateError)} />
                    {confirmFormErrors.cow_number && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>{confirmFormErrors.cow_number}</div>}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>Hissa Number <span style={{ color: '#dc2626' }}>*</span></label>
                    <input value={confirmForm.order_type === 'Goat (Hissa)' ? '0' : confirmForm.hissa_number}
                      onChange={(e) => { setConfirmForm((p) => ({ ...p, hissa_number: e.target.value })); setConfirmDuplicateError(null); setConfirmFormErrors((p) => ({ ...p, hissa_number: undefined })); }}
                      onBlur={async () => { if (!confirmModalLead) return; const { cow_number: c, hissa_number: h, booking_date: bd, order_type: ot, day: d } = confirmForm; if (c && h && ot && !shouldSkip(ot, c, h)) { const dup = await checkDup(c, h, ot, d, bd); if (dup) setConfirmDuplicateError(dup); } }}
                      placeholder="Auto-generated" style={miStyle(confirmFormErrors.hissa_number || confirmDuplicateError)} disabled={confirmForm.order_type === 'Goat (Hissa)'} />
                    {confirmFormErrors.hissa_number && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>{confirmFormErrors.hissa_number}</div>}
                  </div>
                </div>
                )}
                {!isFarm && confirmDuplicateError && (
                  <div style={{ gridColumn: '1 / -1', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '12px', color: '#991b1b' }}>
                    ⚠️ Duplicate: Order {confirmDuplicateError.order_id} already uses this cow/hissa combination.
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={closeConfirmModal} disabled={!!confirmingLeadId} style={{ padding: '8px 16px', background: '#f5f5f5', border: 'none', borderRadius: '8px', cursor: confirmingLeadId ? 'not-allowed' : 'pointer', fontSize: '13px' }}>Cancel</button>
                <button type="button" onClick={handleConfirmOrder} disabled={!!confirmingLeadId} style={{ padding: '8px 16px', background: '#166534', color: '#fff', border: 'none', borderRadius: '8px', cursor: confirmingLeadId ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}>{confirmingLeadId ? '…' : 'Confirm'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit modal */}
        {editOpen && editRow && (
          <div className="qm-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => !saving && (setEditOpen(false), setEditRow(null), setEditPreviousRow(null))}>
            <div className="qm-modal-box" style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', width: 'min(680px, 95vw)', maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Edit Lead</h3>
              {(editErrors.submit || Object.keys(editErrors).some((k) => k !== 'submit' && editErrors[k])) && (
                <div style={{ marginBottom: '10px', padding: '8px', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px', fontSize: '12px' }}>{editErrors.submit || 'Please fix the errors below.'}</div>
              )}
              <div className="qm-edit-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                {['customer_id', 'phone_number', 'alt_phone', 'type', 'booking_name', 'shareholder_name', 'address', 'area', 'day', 'booking_date', 'total_amount', 'source', 'reference', 'query_by'].map((key) => {
                  const isDisabled = key === 'lead_id' || key === 'customer_id';
                  return (
                    <div key={key}>
                      <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>{key.replace(/_/g, ' ')}</label>
                      <input disabled={isDisabled} value={editRow[key] ?? ''}
                        onChange={(e) => { setEditRow((p) => ({ ...p, [key]: e.target.value })); if (editErrors[key]) setEditErrors((p) => ({ ...p, [key]: undefined })); }}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: editErrors[key] ? '1px solid #dc2626' : '1px solid #e0e0e0', fontSize: '13px', ...(isDisabled && { backgroundColor: '#f5f5f5', cursor: 'not-allowed' }) }} />
                      {editErrors[key] && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>{editErrors[key]}</div>}
                    </div>
                  );
                })}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>description</label>
                  <textarea value={editRow.description ?? ''} onChange={(e) => setEditRow((p) => ({ ...p, description: e.target.value }))} rows={2} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '13px' }} />
                </div>
              </div>
              <div style={{ marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditOpen(false)} disabled={saving} style={{ padding: '6px 14px', fontSize: '13px', background: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Close</button>
                <button type="button" onClick={handleSaveEdit} disabled={saving} style={{ padding: '6px 14px', fontSize: '13px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Delete confirm modal */}
        {deleteConfirm && (
          <div className="qm-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: '16px' }}>
            <div className="qm-modal-box" style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '100%' }}>
              <p style={{ margin: '0 0 16px 0', fontSize: '14px' }}>Delete this lead permanently? This cannot be undone.</p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setDeleteConfirm(null)} style={{ padding: '8px 16px', background: '#f5f5f5', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                <button type="button" onClick={handleDeleteLead} style={{ padding: '8px 16px', background: '#c62828', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Delete</button>
              </div>
            </div>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalCount > 0 && (
          <div className="qm-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '12px 0', borderTop: '1px solid #e0e0e0', marginTop: '8px', flexShrink: 0 }}>
            <span style={{ fontSize: '13px', color: '#666' }}>Showing {leads.length} of {totalCount} queries</span>
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

      </div>
    </>
  );
}