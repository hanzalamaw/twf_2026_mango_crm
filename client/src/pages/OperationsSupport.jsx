import { useCallback, useEffect, useMemo, useState } from 'react';
import { OpsSearchIcon } from '../components/OpsFilters';
import { API_BASE } from '../config/api';
import { getOperationsSocket } from '../utils/operationsSocket';
import { useAuth } from '../context/AuthContext';
import SharedChallanModal from '../components/SharedChallanModal';
import SearchableRiderFilter from '../components/SearchableRiderFilter';
import { formatRiderCompact } from '../utils/riderFormat';
import {
  getDescriptionText,
  getOrderTag,
  getChallanRowHighlight,
  isAffluentOrder,
  isSpecialRequestOrder,
} from '../utils/orderTags';
import { useOperationsBatchDay } from '../utils/useOperationsBatchDay';
import OrderDescriptionCell from '../components/OrderDescriptionCell';

const ALL_STATUSES = ['Pending', 'Rider Assigned', 'Dispatched', 'Delivered', 'Returned to Farm'];
const GOAT_HISSA_SUPER = 'Super Goat(Hissa)';
const GOAT_HISSA_PREMIUM = 'Premium Goat(Hissa)';
const ALLOWED_ORDER_TYPES = ['Hissa - Standard', 'Hissa Premium', 'Hissa - Waqf', GOAT_HISSA_SUPER, GOAT_HISSA_PREMIUM];
const ORDER_TYPE_FILTERS = [
  { value: 'Hissa - Standard', label: 'Hissa Standard' },
  { value: 'Hissa Premium', label: 'Premium' },
  { value: 'Hissa - Waqf', label: 'Waqf' },
  { value: GOAT_HISSA_SUPER, label: 'Super Goat' },
  { value: GOAT_HISSA_PREMIUM, label: 'Premium Goat' },
];
function normalizeOrderType(value) {
  const lower = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (lower === 'hissa - standard' || lower === 'hissa standard') return 'Hissa - Standard';
  if (lower === 'hissa premium' || lower === 'hissa - premium') return 'Hissa Premium';
  if (lower === 'hissa - waqf' || lower === 'hissa waqf') return 'Hissa - Waqf';
  if (lower === 'super goat(hissa)' || lower === 'super goat (hissa)') return GOAT_HISSA_SUPER;
  if (lower === 'premium goat(hissa)' || lower === 'premium goat (hissa)') return GOAT_HISSA_PREMIUM;
  if (lower === 'goat(hissa)' || lower === 'goat (hissa)' || lower === 'goat hissa') return GOAT_HISSA_SUPER;
  return '';
}
function normalizeForCompare(value) { return String(value || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function groupMatchesOrderType(g, filterOrderType) {
  if (!filterOrderType) return true;
  return (g.orders || []).some((o) => normalizeOrderType(o.order_type) === filterOrderType);
}
function formatTotalHissa(total, opts = {}) {
  const premium = Number(opts.premium || 0);
  const standard = Number(opts.standard || 0);
  const waqf = Number(opts.waqf || 0);
  let superGoat = Number(opts.superGoat ?? opts.super_goat ?? 0);
  let premiumGoat = Number(opts.premiumGoat ?? opts.premium_goat ?? 0);
  const legacyGoat = Number(opts.goat || 0);
  if (superGoat === 0 && premiumGoat === 0 && legacyGoat > 0) superGoat = legacyGoat;
  const cleanTotal = Number(total ?? (premium + standard + waqf + superGoat + premiumGoat));
  const parts = [];
  if (premium > 0) parts.push(`${premium} Premium`);
  if (standard > 0) parts.push(`${standard} Standard`);
  if (waqf > 0) parts.push(`${waqf} Waqf`);
  if (superGoat > 0) parts.push(`${superGoat} Super Goat`);
  if (premiumGoat > 0) parts.push(`${premiumGoat} Premium Goat`);
  return parts.length ? `${cleanTotal} (${parts.join(', ')})` : String(cleanTotal || 0);
}

const STATUS_STYLES = {
  Pending:            { bg: '#F5F5F5', fg: '#666' },
  'Rider Assigned':   { bg: '#FFF8E1', fg: '#F57C00' },
  Dispatched:         { bg: '#E3F2FD', fg: '#1565C0' },
  Delivered:          { bg: '#E8F5E9', fg: '#2E7D32' },
  'Returned to Farm': { bg: '#FFEBEE', fg: '#C62828' },
};

function StatusBadge({ status }) {
  const st = status || 'Pending';
  const { bg, fg } = STATUS_STYLES[st] || STATUS_STYLES.Pending;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: '600', background: bg, color: fg, whiteSpace: 'nowrap' }}>
      {st}
    </span>
  );
}


function getRiderDetails(rider, fallbackName = 'Unassigned') {
  return {
    name: formatRiderCompact(rider, fallbackName),
  };
}

function getUniqueValues(values) {
  return [...new Set((values || []).map((v) => String(v || '').trim()).filter(Boolean))];
}

function getUniqueDescriptionValues(values) {
  return [...new Set((values || []).map((v) => String(v || '').trim()).filter(Boolean))];
}

function NoBadge({ number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: '700', background: '#F5F5F5', color: '#666', whiteSpace: 'nowrap' }}>
      {number || '—'}
    </span>
  );
}

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px', background: '#fff' };

function MultiSelectDropdown({ label, options = [], values = [], onChange, placeholder = 'All', width = 170 }) {
  const [open, setOpen] = useState(false);
  const selectedValues = Array.isArray(values) ? values : [];
  const toggleValue = (value) => onChange(selectedValues.includes(value) ? selectedValues.filter((v) => v !== value) : [...selectedValues, value]);
  return (
    <div style={{ width, minWidth: width, position: 'relative' }}>
      {label && <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>{label}</label>}
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: '6px', border: `1px solid ${open ? '#FF5722' : '#e0e0e0'}`, background: '#fff', fontSize: '11px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', color: selectedValues.length ? '#FF5722' : '#555', fontWeight: selectedValues.length ? '600' : '400' }}>
        <span>{selectedValues.length ? `${selectedValues.length} selected` : placeholder}</span><span style={{ fontSize: '8px', opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ position: 'absolute', zIndex: 80, left: 0, top: 'calc(100% + 4px)', minWidth: '100%', width: 'max-content', maxWidth: '280px', maxHeight: '220px', overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff', padding: '6px 4px', boxShadow: '0 6px 18px rgba(0,0,0,0.1)' }}>
        {selectedValues.length > 0 && <div onClick={() => onChange([])} style={{ padding: '5px 10px', fontSize: '10px', color: '#FF5722', cursor: 'pointer', fontWeight: '600', borderBottom: '1px solid #f5f5f5', marginBottom: '2px' }}>Clear selection</div>}
        {options.length === 0 ? <div style={{ padding: '8px 10px', fontSize: '10px', color: '#aaa' }}>No options available</div> : options.map((opt) => {
          const isSelected = selectedValues.includes(opt.value);
          return <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', fontSize: '10px', cursor: 'pointer', borderRadius: '5px', background: isSelected ? '#FFF4F0' : 'transparent', color: isSelected ? '#FF5722' : '#333', fontWeight: isSelected ? '600' : '400' }}>
            <input type="checkbox" checked={isSelected} onChange={() => toggleValue(opt.value)} style={{ cursor: 'pointer', accentColor: '#FF5722' }} />{opt.label}
          </label>;
        })}
      </div>}
    </div>
  );
}
function splitUniqueCsvValues(values) { return [...new Set((Array.isArray(values) ? values : [values]).flatMap((v) => Array.isArray(v) ? v : String(v || '').split(',')).map((v) => String(v || '').trim()).filter(Boolean))]; }
function MultiLineCell({ values, empty = '—' }) { const list = splitUniqueCsvValues(values); return list.length ? <div style={{ whiteSpace:'normal', wordBreak:'break-word', overflowWrap:'anywhere', lineHeight:1.45 }}>{list.map((v,i)=><div key={`${v}-${i}`}>{v}</div>)}</div> : <span style={{ color:'#ccc' }}>{empty}</span>; }
function getGroupSlots(g) { const slots = new Set(); (g.slots || []).forEach((v)=>{ if(String(v||'').trim()) slots.add(String(v).trim()); }); String(g.slot || '').split(',').map((v)=>v.trim()).filter(Boolean).forEach((v)=>slots.add(v)); (g.orders || []).forEach((o)=>{ if(String(o.slot||'').trim()) slots.add(String(o.slot).trim()); }); return [...slots]; }
function getGroupOrderTypes(g) {
  const direct = [...new Set((g.orders || []).map((o) => normalizeOrderType(o.order_type)).filter(Boolean))];
  if (direct.length) return direct;
  const inferred = [];
  if (Number(g.standard_hissa_count || 0) > 0) inferred.push('Hissa - Standard');
  if (Number(g.premium_hissa_count || 0) > 0) inferred.push('Hissa Premium');
  if (Number(g.waqf_hissa_count || 0) > 0) inferred.push('Hissa - Waqf');
  const sg = Number(g.super_goat_hissa_count ?? 0);
  const pg = Number(g.premium_goat_hissa_count ?? 0);
  const leg = Number(g.goat_hissa_count ?? 0);
  if (sg > 0) inferred.push(GOAT_HISSA_SUPER);
  if (pg > 0) inferred.push(GOAT_HISSA_PREMIUM);
  if (sg === 0 && pg === 0 && leg > 0) inferred.push(GOAT_HISSA_SUPER);
  return inferred;
}

const PAGE_SIZE = 50;

export default function OperationsCustomerSupport() {
  const { authFetch } = useAuth();

  const {
    dayBatches,
    selectedDay,
    setSelectedDay,
    selectedBatch,
    setSelectedBatch,
    loadBatches,
    ready,
    DAY_OPTIONS,
  } = useOperationsBatchDay(authFetch);

  const [groups,        setGroups]        = useState([]);
  const [riders,        setRiders]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [err,           setErr]           = useState('');

  const [search,       setSearch]       = useState('');
  const [challanSearch, setChallanSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState([]);
  const [riderFilter,  setRiderFilter]  = useState('');
  const [slotFilter,   setSlotFilter]   = useState([]);
  const [orderTypeFilter, setOrderTypeFilter] = useState([]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);

  const [modal,        setModal]        = useState(null);
  const [modalData,    setModalData]    = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  const load = useCallback(async () => {
    if (!ready || selectedBatch === null) return;
    setErr(''); setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set('batch_id', selectedBatch);
      // Load full batch; day/order type filters are client-side like Deliveries.

      const [gRes, ridRes] = await Promise.all([
        authFetch(`${API_BASE}/operations/deliveries/groups?${qs}`),
        authFetch(`${API_BASE}/operations/riders`),
      ]);

      const gData = await gRes.json().catch(() => ({}));
      const ridData = await ridRes.json().catch(() => ([]));

      if (!gRes.ok) throw new Error(gData.message || 'Failed to load groups');

      setGroups(gData.groups || []);
      setRiders(Array.isArray(ridData) ? ridData : (ridData.riders || []));
    } catch (e) {
      setErr(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [authFetch, ready, selectedBatch]);

  useEffect(() => { if (ready && selectedBatch !== null) load(); }, [load, ready, selectedBatch]);

  useEffect(() => {
    const socket = getOperationsSocket();
    const refresh = () => { loadBatches(); if (selectedBatch !== null) load(); };
    socket.on('operations:changed', refresh);
    socket.on('challans:changed', refresh);
    socket.on('riders:changed', refresh);
    return () => {
      socket.off('operations:changed', refresh);
      socket.off('challans:changed', refresh);
      socket.off('riders:changed', refresh);
    };
  }, [load, loadBatches, selectedBatch]);

  const riderMap = useMemo(() => {
    const m = {};
    riders.forEach((r) => { m[r.rider_id] = r.rider_name; });
    return m;
  }, [riders]);

  const riderDetailMap = useMemo(() => {
    const m = {};
    riders.forEach((r) => { m[r.rider_id] = r; });
    return m;
  }, [riders]);

  const modalCustomerIds = useMemo(() => {
    const fromOrders = getUniqueValues((modalData?.orders || []).map((o) => o.customer_id));
    const fromGroup = getUniqueValues(modal?.customer_ids || []);
    return fromOrders.length ? fromOrders : fromGroup;
  }, [modal, modalData]);

  const modalRiderDetails = useMemo(() => {
    if (!modal) return getRiderDetails(null);
    const rider = modalData?.rider || riderDetailMap[modal.rider_id];
    return getRiderDetails(
      rider,
      modal.rider_count > 1 ? 'Multiple Riders' : 'Unassigned'
    );
  }, [modal, modalData, riderDetailMap]);

  const modalDescription = useMemo(() => getDescriptionText({ ...(modalData?.challan || {}), ...(modal || {}), orders: modalData?.orders || [] }), [modal, modalData]);

  const slotOptions = useMemo(() => {
    const seen = new Map();
    groups.forEach((g) => getGroupSlots(g).forEach((slot) => {
      const key = normalizeForCompare(slot);
      if (key && !seen.has(key)) seen.set(key, slot);
    }));
    return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((slot) => ({ value: slot, label: slot }));
  }, [groups]);
  const statusOptions = useMemo(() => ALL_STATUSES.map((status) => ({ value: status, label: status })), []);

  const filteredGroups = useMemo(() => {
    let list = groups;
    if (selectedDay) list = list.filter((g) => normalizeForCompare(g.day) === normalizeForCompare(selectedDay));
    if (slotFilter.length) {
      list = list.filter((g) => {
        const slots = getGroupSlots(g);
        return slotFilter.some((slot) => slots.some((s) => normalizeForCompare(s) === normalizeForCompare(slot)));
      });
    }
    if (statusFilter.length) list = list.filter((g) => statusFilter.includes(g.derived_status || 'Pending'));
    if (riderFilter) list = list.filter((g) => String(g.rider_id || '') === riderFilter);
    if (orderTypeFilter.length) list = list.filter((g) => orderTypeFilter.some((t) => getGroupOrderTypes(g).includes(t)));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((g) => {
        const hay = [
          g.address, g.area, g.day, g.slot, g.description,
          ...(g.booking_names || []),
          ...(g.shareholder_names || []),
          ...(g.contacts || []),
          ...(g.alt_contacts || []),
          ...(g.customer_ids || []).map(String),
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    const challanQ = challanSearch.trim().toLowerCase();
    if (challanQ) {
      list = list.filter((g) => String(g.challan_id || '').toLowerCase().includes(challanQ));
    }
    return list;
  }, [groups, search, challanSearch, selectedDay, slotFilter, statusFilter, riderFilter, orderTypeFilter]);

  const totalPages  = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  const pagedGroups = useMemo(() => filteredGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredGroups, page]);
  useEffect(() => { setPage(1); }, [search, challanSearch, selectedDay, slotFilter, orderTypeFilter, statusFilter, riderFilter, selectedBatch]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const resetFilters = () => {
    setSearch('');
    setChallanSearch('');
    setSelectedDay('Day 1');
    setSlotFilter([]);
    setOrderTypeFilter([]);
    setStatusFilter([]);
    setRiderFilter('');
  };

  const openModal = async (g) => {
    if (!g.qr_token) { setModal(g); setModalData(null); return; }
    setModal(g);
    setModalLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/by-token/${encodeURIComponent(g.qr_token)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setModalData(data);
    } catch { /* silent */ } finally { setModalLoading(false); }
  };


  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .cs-root { padding: 16px 12px 24px !important; overflow: auto !important; }
          .cs-header { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; margin-bottom: 12px !important; }
          .cs-table-wrap { display: block !important; }
          .modal-info-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="cs-root" style={{ padding: '19px', fontFamily: "'Poppins','Inter',sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>

        {/* Header */}
        <div className="cs-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>Customer Support</h2>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#888', fontWeight: '500', lineHeight: 1.45, maxWidth: '760px' }}>
              Look up any challan group, check delivery status, and see which rider is assigned. Click a row to view full details.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" onClick={load} style={{ padding: '7px 13px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Refresh</button>
            {dayBatches.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '11px', color: '#666', whiteSpace: 'nowrap' }}>Batch:</label>
                <select
                  value={selectedBatch ?? ''}
                  onChange={(e) => setSelectedBatch(Number(e.target.value))}
                  style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #e0e0e0', background: '#fff', fontSize: '11px', fontWeight: '600', color: '#333', cursor: 'pointer' }}
                >
                  {dayBatches.map((b) => (
                    <option key={b.batch_id} value={b.batch_id}>{b.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Day selector */}
        <div style={{ borderTop: '1px solid #e6e6e6', marginBottom: '12px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', width: '100%', gap: '8px', marginBottom: '12px' }}>
          {DAY_OPTIONS.map((d) => (
            <button key={d} type="button" onClick={() => setSelectedDay(d)}
              style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid #e0e0e0', background: normalizeForCompare(selectedDay) === normalizeForCompare(d) ? '#FF5722' : '#fff', color: normalizeForCompare(selectedDay) === normalizeForCompare(d) ? '#fff' : '#333', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>
              {d}
            </button>
          ))}
        </div>

        {/* Desktop filters */}
        <div className="cs-filter-desktop" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', alignItems: 'flex-end', minWidth: 0, flexShrink: 0 }}>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Search (name, phone, address, area, customer ID)</label>
            <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: '0 1 180px', minWidth: 150 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Challan No.</label>
            <input type="text" placeholder="Search challan no…" value={challanSearch} onChange={(e) => setChallanSearch(e.target.value)} style={inputStyle} />
          </div>
          <MultiSelectDropdown label="Slots" options={slotOptions} values={slotFilter} onChange={setSlotFilter} placeholder="All slots" width={150} />
          <MultiSelectDropdown label="Status" options={statusOptions} values={statusFilter} onChange={setStatusFilter} placeholder="All status" width={150} />
          <MultiSelectDropdown label="Order Type" options={ORDER_TYPE_FILTERS} values={orderTypeFilter} onChange={setOrderTypeFilter} placeholder="All types" width={160} />
          <SearchableRiderFilter value={riderFilter} onChange={setRiderFilter} riders={riders} inputStyle={inputStyle} width={200} />
          <button type="button" onClick={resetFilters} style={{ padding: '6px 13px', height: '29px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Reset</button>
        </div>

        {/* Mobile filter toggle */}
        <div className="cs-filter-toggle" style={{ display: 'none', gap: '8px', marginBottom: '8px', flexShrink: 0, alignItems: 'center' }}>
          <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px' }} />
          <button type="button" onClick={() => setMobileFiltersOpen((v) => !v)}
            style={{ padding: '9px 12px', borderRadius: '8px', border: `1px solid ${mobileFiltersOpen ? '#FF5722' : '#e0e0e0'}`, background: mobileFiltersOpen ? '#fff4f0' : '#fff', color: mobileFiltersOpen ? '#FF5722' : '#555', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>⚙ Filters</button>
        </div>

        <div className="cs-filter-mobile" style={{ display: 'none' }}>
          {mobileFiltersOpen && (
            <div className="ops-filter-mobile-panel">
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Challan No.</label>
                <input type="text" value={challanSearch} onChange={(e) => setChallanSearch(e.target.value)} placeholder="Search challan no…" style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px' }} />
              </div>
              <MultiSelectDropdown label="Slots" options={slotOptions} values={slotFilter} onChange={setSlotFilter} placeholder="All slots" width={280} />
              <MultiSelectDropdown label="Status" options={statusOptions} values={statusFilter} onChange={setStatusFilter} placeholder="All status" width={280} />
              <MultiSelectDropdown label="Order Type" options={ORDER_TYPE_FILTERS} values={orderTypeFilter} onChange={setOrderTypeFilter} placeholder="All types" width={280} />
              <SearchableRiderFilter value={riderFilter} onChange={setRiderFilter} riders={riders} width={280} inputStyle={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', background: '#fff' }} />
              <div className="ops-filter-mobile-actions">
                <button type="button" className="ops-filter-mobile-done" onClick={() => setMobileFiltersOpen(false)}>Done</button>
                <button type="button" onClick={() => { resetFilters(); setMobileFiltersOpen(false); }} className="ops-filter-mobile-reset">Reset</button>
              </div>
            </div>
          )}
        </div>

        {err && <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', flexShrink: 0, fontSize: '10px', fontWeight: '600' }}>{err}</div>}

        {!loading && (
          <div style={{ fontSize: '10px', color: '#999', marginBottom: '8px', flexShrink: 0 }}>
            Showing {filteredGroups.length} of {groups.length} group{groups.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* Table */}
        <div className="cs-table-wrap" style={{ flex: 1, minHeight: 0, overflow: 'auto', borderRadius: '10px', border: '1px solid #ececec' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading…</div>
          ) : filteredGroups.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>
              {groups.length === 0 ? 'No groups found.' : 'No groups match the current filters.'}
            </div>
          ) : (
            <table className="ops-data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', tableLayout: 'auto' }}>
              
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: '#fafafa' }}>
                  {['No.', 'Status', 'Rider', 'Description', 'Booking Name', 'Standard', 'Premium', 'Waqf', 'Super Goat', 'Premium Goat', 'Total Hissa', 'Day / Slot', 'Area', 'Contact', 'Address', 'Customer ID'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 10px', borderBottom: '1px solid #e0e0e0', color: '#555', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '10px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedGroups.map((g, idx) => {
                  const st = g.derived_status || 'Pending';
                  const rowTag = getOrderTag(g, 'hissa_count', 'waqf_hissa_count');
                  const rowHighlight = getChallanRowHighlight(rowTag);
                  let rowSuperGoat = Number(g.super_goat_hissa_count ?? 0);
                  let rowPremiumGoat = Number(g.premium_goat_hissa_count ?? 0);
                  const rowLegacyGoat = Number(g.goat_hissa_count ?? 0);
                  if (rowSuperGoat === 0 && rowPremiumGoat === 0 && rowLegacyGoat > 0) rowSuperGoat = rowLegacyGoat;
                  const baseBg = rowHighlight.background || (idx % 2 === 0 ? '#fff' : '#FAFAFA');
                  return (
                    <tr key={g.group_key || g.challan_id}
                      style={{ borderBottom: '1px solid #f3f3f3', background: baseBg, borderLeft: rowHighlight.borderLeft, cursor: 'pointer' }}
                      onClick={() => openModal(g)}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f9ff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = baseBg; }}
                    >
                      <td style={{ padding: '9px 10px' }}><NoBadge number={g.challan_id} /></td>
                      <td style={{ padding: '9px 10px' }}><StatusBadge status={st} /></td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>
                        {g.rider_count > 1
                          ? <span style={{ color: '#777', fontWeight: 600 }}>Multiple Riders</span>
                          : (g.rider_id
                            ? (riderMap[g.rider_id] || `Rider #${g.rider_id}`)
                            : <span style={{ color: '#bbb', fontStyle: 'italic' }}>Unassigned</span>)}
                      </td>
                      <td className="ops-cell-wrap" style={{ padding: '9px 10px', color: '#555', verticalAlign:'top' }}>
                        <OrderDescriptionCell source={g} totalField="hissa_count" waqfField="waqf_hissa_count" />
                      </td>
                      <td className="ops-cell-wrap" style={{ padding: '9px 10px', fontWeight: '500', color: '#333', verticalAlign:'top' }}>{(g.booking_names || []).join(', ') || '—'}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{g.standard_hissa_count || 0}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{g.premium_hissa_count || 0}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{g.waqf_hissa_count || 0}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{rowSuperGoat}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{rowPremiumGoat}</td>
                      <td style={{ padding: '9px 10px', color: '#555', fontWeight: '600' }}>{Number(g.hissa_count || 0)}</td>
                      <td style={{ padding: '9px 10px', color: '#555', whiteSpace: 'nowrap' }}>
                        <div>{g.day || '—'}</div>
                        {(g.slots || []).length > 0 && <div style={{ fontSize: '9px', color: '#aaa' }}>{g.slots.join(', ')}</div>}
                      </td>
                      <td className="ops-cell-wrap" style={{ padding: '9px 10px', color: '#555', verticalAlign:'top' }}>{g.area || '—'}</td>
                      <td className="ops-cell-wrap" style={{ padding: '9px 10px', color: '#555' }}><MultiLineCell values={[g.contacts || [], g.alt_contacts || []]} /></td>
                      <td className="ops-cell-wrap" style={{ padding: '9px 10px', color: '#555', verticalAlign:'top' }}>
                        <div>{g.address || '—'}</div>
                      </td>
                      <td style={{ padding: '9px 10px', color: '#777', fontWeight: '500' }}><MultiLineCell values={g.customer_ids || []} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {/* Pagination */}
{!loading && filteredGroups.length > 0 && (
  <div
    className="om-pagination"
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '12px',
      padding: '12px 0',
      borderTop: '1px solid #e0e0e0',
      marginTop: '8px',
      flexShrink: 0,
    }}
  >
    <span style={{ fontSize: '13px', color: '#666' }}>
      Showing {pagedGroups.length} of {filteredGroups.length} groups
    </span>

    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => setPage((p) => Math.max(1, p - 1))}
        style={{
          padding: '6px 12px',
          fontSize: '10px',
          background: page <= 1 ? '#f0f0f0' : '#fff',
          color: page <= 1 ? '#999' : '#333',
          border: '1px solid #e0e0e0',
          borderRadius: '6px',
          cursor: page <= 1 ? 'not-allowed' : 'pointer',
        }}
      >
        Previous
      </button>

      {(() => {
        const sp = 5;
        let start = Math.max(1, page - Math.floor(sp / 2));
        let end = Math.min(totalPages, start + sp - 1);

        if (end - start + 1 < sp) {
          start = Math.max(1, end - sp + 1);
        }

        const pages = [];
        for (let i = start; i <= end; i++) pages.push(i);

        return pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPage(p)}
            style={{
              minWidth: '32px',
              padding: '6px 10px',
              fontSize: '10px',
              background: p === page ? '#FF5722' : '#fff',
              color: p === page ? '#fff' : '#333',
              border: '1px solid #e0e0e0',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: p === page ? 600 : 400,
            }}
          >
            {p}
          </button>
        ));
      })()}

      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        style={{
          padding: '6px 12px',
          fontSize: '10px',
          background: page >= totalPages ? '#f0f0f0' : '#fff',
          color: page >= totalPages ? '#999' : '#333',
          border: '1px solid #e0e0e0',
          borderRadius: '6px',
          cursor: page >= totalPages ? 'not-allowed' : 'pointer',
        }}
      >
        Next
      </button>
    </div>
  </div>
)}
      </div>

      {/* ── Challan detail modal ── */}
      {modal && (
        <SharedChallanModal
          challanId={modalData?.challan?.challan_id || modal.challan_id}
          customerId={(modal.customer_ids || []).join(', ') || modalData?.challan?.customer_ids_csv || '—'}
          description={modalDescription}
          affluent={isAffluentOrder({ ...(modalData?.challan || modal || {}), orders: modalData?.orders || [] }, 'hissa_count', 'waqf_hissa_count')}
          specialRequest={isSpecialRequestOrder({ ...(modalData?.challan || modal || {}), orders: modalData?.orders || [] }, 'hissa_count', 'waqf_hissa_count')}
          statusBadge={<StatusBadge status={modalData?.challan?.derived_status || modal.derived_status} />}
          onClose={() => { setModal(null); setModalData(null); }}
          maxWidth="1240px"
          infoRows={[
            ['Address', modal.address || '—'],
            ['Booking Name', (modal.booking_names || []).join(', ') || '—'],
            ['Area', modal.area || '—'],
            ['Day', modal.day || '—'],
            ['Slot', (modal.slots || []).join(', ') || modal.slot || '—'],
            ['Rider', modalRiderDetails.name],
            ['Total Hissa', formatTotalHissa(
              Number(modalData?.challan?.total_hissa ?? modal.hissa_count ?? 0),
              {
                premium: modalData?.challan?.total_premium_hissa ?? modal.premium_hissa_count,
                standard: modalData?.challan?.total_standard_hissa ?? modal.standard_hissa_count,
                waqf: modalData?.challan?.total_waqf_hissa ?? modal.waqf_hissa_count,
                superGoat: modalData?.challan?.total_super_goat_hissa ?? modal.super_goat_hissa_count,
                premiumGoat: modalData?.challan?.total_premium_goat_hissa ?? modal.premium_goat_hissa_count,
                goat: modalData?.challan?.total_goat_hissa ?? modal.goat_hissa_count,
              }
            )],
          ]}
          orders={(modalData?.orders || []).filter((o) => ALLOWED_ORDER_TYPES.includes(normalizeOrderType(o.order_type)))}
          renderOrderStatus={(o) => <StatusBadge status={o.delivery_status} />}
        />
      )}
    </>
  );
}