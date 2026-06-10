import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyChallanPatchToGroups,
  markSkipSocketRefresh,
} from '../utils/operationsGroupPatch';
import { OpsSearchIcon } from '../components/OpsFilters';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SharedChallanModal from '../components/SharedChallanModal';
import SearchableRiderFilter from '../components/SearchableRiderFilter';
import { API_BASE } from '../config/api';
import { useOperationsSocketRefresh } from '../utils/useOperationsSocketRefresh';
import { formatRiderCompact } from '../utils/riderFormat';
import {
  getDescriptionText,
  getOrderTag,
  getChallanRowHighlight,
  isAffluentOrder,
  isSpecialRequestOrder,
} from '../utils/orderTags';
import { buildDeliveriesGroupsQuery, DELIVERIES_PAGE_SIZE, sortChallanRowsForPrint } from '../utils/deliveriesGroupsApi';
import { useOperationsBatch } from '../utils/useOperationsBatch';
import OrderDescriptionCell from '../components/OrderDescriptionCell';
import {
  ORDER_TYPE_FILTERS,
  buildSummaryStatCards,
  computeModalTotals,
  formatTotalHissa,
  HISSA_COUNT_TABLE_HEADERS,
  getTableHissaCounts,
  hissaCountCellValues,
} from '../utils/operationsOrderTypes';

const STATUSES = ['Pending', 'Rider Assigned', 'Dispatched', 'Delivered', 'Returned to Farm'];
const STATUS_STYLES = {
  Pending:            { bg: '#F5F5F5',  fg: '#666' },
  'Rider Assigned':   { bg: '#FFF8E1',  fg: '#F57C00' },
  Dispatched:         { bg: '#E3F2FD',  fg: '#1565C0' },
  Delivered:          { bg: '#E8F5E9',  fg: '#2E7D32' },
  'Returned to Farm': { bg: '#FFEBEE',  fg: '#C62828' },
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

function extractChallanToken(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  try { const u = new URL(t); const q = u.searchParams.get('challan'); if (q) return q.trim(); } catch { /* not absolute URL */ }
  if (t.includes('challan=')) { const m = t.match(/[?&]challan=([^&]+)/i); if (m) { try { return decodeURIComponent(m[1]).trim(); } catch { return m[1].trim(); } } }
  return t;
}

const selectStyle = { fontSize: '10px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #E0E0E0', background: '#FAFAFA', color: '#333', maxWidth: '140px' };
const inputStyle  = { width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px', background: '#fff' };

function MultiSelectDropdown({ label, options = [], values = [], onChange, placeholder = 'All', width = 170 }) {
  const [open, setOpen] = useState(false);
  const selectedValues = Array.isArray(values) ? values : [];
  const selectedCount = selectedValues.length;
  const toggleValue = (value) => {
    onChange(selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value]
    );
  };
  return (
    <div style={{ width, minWidth: width, position: 'relative' }}>
      {label && <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>{label}</label>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: '6px', border: `1px solid ${open ? '#FF5722' : '#e0e0e0'}`, background: '#fff', fontSize: '11px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', color: selectedCount ? '#FF5722' : '#555', fontWeight: selectedCount ? '600' : '400' }}
      >
        <span>{selectedCount ? `${selectedCount} selected` : placeholder}</span>
        <span style={{ fontSize: '8px', opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 80, left: 0, top: 'calc(100% + 4px)', minWidth: '100%', width: 'max-content', maxWidth: '280px', maxHeight: '220px', overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff', padding: '6px 4px', boxShadow: '0 6px 18px rgba(0,0,0,0.1)' }}>
          {selectedCount > 0 && (
            <div
              onClick={() => onChange([])}
              style={{ padding: '5px 10px', fontSize: '10px', color: '#FF5722', cursor: 'pointer', fontWeight: '600', borderBottom: '1px solid #f5f5f5', marginBottom: '2px' }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#fff4f0'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Clear selection
            </div>
          )}
          {options.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: '10px', color: '#aaa' }}>No options available</div>
          ) : options.map((opt) => {
            const isSelected = selectedValues.includes(opt.value);
            return (
              <label
                key={opt.value}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', fontSize: '10px', cursor: 'pointer', borderRadius: '5px', background: isSelected ? '#FFF4F0' : 'transparent', color: isSelected ? '#FF5722' : '#333', fontWeight: isSelected ? '600' : '400' }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#fafafa'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? '#FFF4F0' : 'transparent'; }}
              >
                <input type="checkbox" checked={isSelected} onChange={() => toggleValue(opt.value)} style={{ cursor: 'pointer', accentColor: '#FF5722' }} />
                {opt.label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}


function splitUniqueCsvValues(values) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .flatMap((v) => Array.isArray(v) ? v : String(v || '').split(','))
    .map((v) => String(v || '').trim())
    .filter(Boolean))];
}

function MultiLineCell({ values, empty = '—', style = {} }) {
  const list = splitUniqueCsvValues(values);
  if (!list.length) return <span style={{ color: '#ccc' }}>{empty}</span>;
  return (
    <div style={{ whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.45, ...style }}>
      {list.map((v, i) => <div key={`${v}-${i}`}>{v}</div>)}
    </div>
  );
}

const PAGE_SIZE = DELIVERIES_PAGE_SIZE;

function SearchableRiderSelect({ value, disabled, onChange, riders, title, menuPlacement = 'above', fallbackLabel, fullWidth = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState(null);
  const containerRef = useRef(null);
  const selected = riders.find((r) => String(r.rider_id) === String(value));
  const label = selected ? formatRiderCompact(selected) : (fallbackLabel || '— Unassigned');

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return riders;
    return riders.filter((r) =>
      (r.rider_name || '').toLowerCase().includes(q) ||
      (r.contact || '').toLowerCase().includes(q) ||
      (r.vehicle || '').toLowerCase().includes(q) ||
      (r.number_plate || '').toLowerCase().includes(q)
    );
  }, [riders, query]);

  const updateMenuPosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const menuWidth = fullWidth ? Math.min(Math.max(rect.width, 260), 360) : 260;
    const menuHeight = 250;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - menuWidth - 8);
    const preferredTop = menuPlacement === 'below' ? rect.bottom + 4 : rect.top - menuHeight - 4;
    const top = Math.min(Math.max(8, preferredTop), window.innerHeight - menuHeight - 8);
    setMenuStyle({
      position: 'fixed',
      zIndex: 5000,
      top,
      left,
      width: `${menuWidth}px`,
      background: '#fff',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
      overflow: 'hidden',
    });
  }, [menuPlacement, fullWidth]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target) && !e.target.closest?.('[data-rider-menu="true"]')) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', updateMenuPosition, true);
    window.addEventListener('resize', updateMenuPosition);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', updateMenuPosition, true);
      window.removeEventListener('resize', updateMenuPosition);
    };
  }, [open, updateMenuPosition]);

  return (
    <div ref={containerRef} style={{ position: 'relative', minWidth: '130px', maxWidth: fullWidth ? '100%' : '160px', width: fullWidth ? '100%' : undefined }}>
      <button type="button" disabled={disabled} title={title} onClick={() => { if (!disabled) { setOpen((v) => !v); setQuery(''); } }}
        style={{ width: '100%', textAlign: 'left', fontSize: '10px', padding: fullWidth ? '10px 12px' : '5px 8px', borderRadius: fullWidth ? '8px' : '6px', border: '1px solid #E0E0E0', background: disabled ? '#F5F5F5' : '#FAFAFA', color: disabled ? '#aaa' : '#333', cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', boxSizing: 'border-box' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{label}</span>
        <span style={{ fontSize: '8px', flexShrink: 0, opacity: 0.5 }}>▼</span>
      </button>
      {open && menuStyle && (
        <div data-rider-menu="true" style={menuStyle}>
          <div style={{ padding: '8px' }}>
            <input autoFocus type="text" placeholder="Search name, phone, vehicle…" value={query} onChange={(e) => setQuery(e.target.value)} onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '10px', outline: 'none' }} />
          </div>
          <div style={{ maxHeight: '190px', overflowY: 'auto' }}>
            <div style={{ padding: '7px 12px', fontSize: '10px', color: '#888', cursor: 'pointer', borderTop: '1px solid #f5f5f5' }}
              onMouseDown={(e) => { e.preventDefault(); onChange(''); setOpen(false); setQuery(''); }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#fafafa'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>— Unassigned</div>
            {filtered.map((r) => (
              <div key={r.rider_id} onMouseDown={(e) => { e.preventDefault(); onChange(String(r.rider_id)); setOpen(false); setQuery(''); }}
                style={{ padding: '7px 12px', fontSize: '10px', cursor: 'pointer', background: String(r.rider_id) === String(value) ? '#FFF4F0' : 'transparent', color: String(r.rider_id) === String(value) ? '#FF5722' : '#333', borderTop: '1px solid #f5f5f5' }}
                onMouseEnter={(e) => { if (String(r.rider_id) !== String(value)) e.currentTarget.style.background = '#fafafa'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = String(r.rider_id) === String(value) ? '#FFF4F0' : 'transparent'; }}>
                <div style={{ fontWeight: '500' }}>{r.rider_name}</div>
                <div style={{ fontSize: '9px', color: '#999', marginTop: '1px' }}>{[r.contact, r.vehicle, r.number_plate].filter(Boolean).join(' · ')}</div>
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding: '10px 12px', fontSize: '10px', color: '#aaa', textAlign: 'center' }}>No riders found</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchableStatusSelect({ value, disabled, onChange, menuPlacement = 'below', fullWidth = true }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const containerRef = useRef(null);
  const selected = value || 'Pending';

  const updateMenuPosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const menuWidth = fullWidth ? Math.min(Math.max(rect.width, 220), 360) : 220;
    const menuHeight = 220;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - menuWidth - 8);
    const preferredTop = menuPlacement === 'below' ? rect.bottom + 4 : rect.top - menuHeight - 4;
    const top = Math.min(Math.max(8, preferredTop), window.innerHeight - menuHeight - 8);
    setMenuStyle({
      position: 'fixed',
      zIndex: 5000,
      top,
      left,
      width: `${menuWidth}px`,
      background: '#fff',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
      overflow: 'hidden',
    });
  }, [menuPlacement, fullWidth]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target) && !e.target.closest?.('[data-status-menu="true"]')) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', updateMenuPosition, true);
    window.addEventListener('resize', updateMenuPosition);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', updateMenuPosition, true);
      window.removeEventListener('resize', updateMenuPosition);
    };
  }, [open, updateMenuPosition]);

  return (
    <div ref={containerRef} style={{ width: fullWidth ? '100%' : undefined, minWidth: fullWidth ? undefined : '140px' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: fullWidth ? '10px 12px' : '6px 10px',
          borderRadius: fullWidth ? '8px' : '6px',
          border: '1px solid #E0E0E0',
          background: disabled ? '#F5F5F5' : '#FAFAFA',
          color: disabled ? '#aaa' : '#333',
          fontSize: '10px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '4px',
          boxSizing: 'border-box',
        }}
      >
        <span>{selected}</span>
        <span style={{ fontSize: '8px', flexShrink: 0, opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && menuStyle && (
        <div data-status-menu="true" style={menuStyle}>
          {STATUSES.map((s) => (
            <div
              key={s}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s);
                setOpen(false);
              }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: '11px',
                background: s === selected ? '#FFF4F0' : 'transparent',
                color: s === selected ? '#FF5722' : '#333',
                borderTop: '1px solid #f5f5f5',
                fontWeight: s === selected ? '600' : '400',
              }}
              onMouseEnter={(e) => { if (s !== selected) e.currentTarget.style.background = '#fafafa'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = s === selected ? '#FFF4F0' : 'transparent'; }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────

export default function OperationsDeliveries() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { authFetch } = useAuth();

  const {
    batches,
    selectedBatch,
    setSelectedBatch,
    loadBatches,
    ready: batchReady,
  } = useOperationsBatch(authFetch);

  const [groups,        setGroups]        = useState([]);
  const [totalGroups,   setTotalGroups]   = useState(0);
  const [listSummary,   setListSummary]   = useState(null);
  const [riders,        setRiders]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [err,           setErr]           = useState('');
  const [modal,         setModal]         = useState(null);
  const [saving,        setSaving]        = useState(false);
  const [printing,      setPrinting]      = useState(false);
  const [selectedIds,   setSelectedIds]   = useState(() => new Set());

  const [search,          setSearch]          = useState('');
  const [challanSearch,   setChallanSearch]   = useState('');
  const [filterStatus,    setFilterStatus]    = useState([]);
  const [filterRider,     setFilterRider]     = useState('');
  const [filterOrderType, setFilterOrderType] = useState([]);
  const [page,            setPage]            = useState(1);
  const [scanMatchToken,  setScanMatchToken]  = useState('');
  const [scanOpen,        setScanOpen]        = useState(false);
  const [scanErr,         setScanErr]         = useState('');
  const [scanStatus,      setScanStatus]      = useState('Starting camera…');
  const [scanSuccess,     setScanSuccess]     = useState(false);
  const [mobileFiltersOpen,  setMobileFiltersOpen]  = useState(false);

  const scannerRef     = useRef(null);
  const groupsRef      = useRef(groups);
  const skipSocketRefreshUntilRef = useRef(0);

  useEffect(() => { groupsRef.current = groups; }, [groups]);

  const [searchDebounced, setSearchDebounced] = useState('');
  const [challanDebounced, setChallanDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    const t = setTimeout(() => setChallanDebounced(challanSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [challanSearch]);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!batchReady || !selectedBatch) return;
    if (!silent) setErr('');
    if (!silent && groups.length === 0) setLoading(true);
    try {
      const qs = buildDeliveriesGroupsQuery({
        batch: selectedBatch,
        page,
        limit: PAGE_SIZE,
        search: searchDebounced,
        challan: challanDebounced,
        statuses: filterStatus,
        riderId: filterRider,
        orderTypes: filterOrderType,
        qrToken: scanMatchToken,
      });
      const [gRes, rRes] = await Promise.all([
        authFetch(`${API_BASE}/operations/deliveries/groups?${qs}`),
        authFetch(`${API_BASE}/operations/riders`),
      ]);
      if (!gRes.ok) throw new Error((await gRes.json().catch(() => ({}))).message || 'Failed to load deliveries');
      const gData = await gRes.json();
      setGroups(gData.groups || []);
      setTotalGroups(typeof gData.total === 'number' ? gData.total : (gData.groups || []).length);
      setListSummary(gData.summary || null);
      if (rRes.ok) setRiders(await rRes.json());
      else setRiders([]);
    } catch (e) {
      setErr(e.message || 'Load failed');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [
    authFetch,
    batchReady,
    selectedBatch,
    page,
    searchDebounced,
    challanDebounced,
    filterStatus,
    filterRider,
    filterOrderType,
    scanMatchToken,
    groups.length,
  ]);

  useEffect(() => {
    if (batchReady && selectedBatch) load();
  }, [load, batchReady, selectedBatch]);

  useOperationsSocketRefresh(
    (payload) => {
      if (!selectedBatch) return;

      const action = payload?.action;
      const challanId = payload?.challan_id ?? payload?.id;

      // Regeneration changes many rows at once; safest to reload.
      if (action !== 'status' && action !== 'rider') {
        load({ silent: true });
        return;
      }

      if (!Number.isFinite(Number(challanId))) {
        load({ silent: true });
        return;
      }

      const targetId = Number(challanId);
      const exists = groupsRef.current?.some((g) => Number(g.challan_id) === targetId);
      if (!exists) {
        // If the changed row isn’t on the current page, reload to keep totals consistent.
        load({ silent: true });
        return;
      }

      const patch = {};
      if (action === 'status') patch.delivery_status = payload.delivery_status;
      if (action === 'rider') patch.rider_id = payload.rider_id ?? null;

      setGroups((prev) => applyChallanPatchToGroups(prev, targetId, patch));
    },
    [load, selectedBatch],
    1200,
    skipSocketRefreshUntilRef
  );

  const orderTypeOptions = ORDER_TYPE_FILTERS;
  const statusOptions = useMemo(() => STATUSES.map((s) => ({ value: s, label: s })), []);

  const summary = listSummary || {};
  const summaryCards = useMemo(() => buildSummaryStatCards(summary), [listSummary]);

  const totalPages = Math.max(1, Math.ceil(totalGroups / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [searchDebounced, challanDebounced, filterStatus, filterRider, filterOrderType, scanMatchToken, selectedBatch]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const rowDomId = (g) => `dlv-${g.challan_id || g.group_key}`;

  useEffect(() => {
    if (!scanMatchToken) return;
    const first = groups[0]; if (!first) return;
    document.getElementById(rowDomId(first))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [scanMatchToken, groups]);

  const openChallanModal = useCallback(async (token) => {
    if (!token) return;
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/by-token/${encodeURIComponent(token)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Challan not found');
      const group = data.challan || data.group || data;
      setModal({
        ...data,
        challan: group,
        orders: data.orders || group.orders || [],
        rider: data.rider ?? group.rider ?? null,
      });
    } catch (e) { setErr(e.message || 'Failed to open challan'); }
  }, [authFetch]);

  const challanParam = searchParams.get('challan');
  useEffect(() => { if (challanParam) openChallanModal(challanParam); }, [challanParam, openChallanModal]);
  const closeModal = () => { setModal(null); const next = new URLSearchParams(searchParams); next.delete('challan'); setSearchParams(next, { replace: true }); };

  const modalOrders = useMemo(() => {
    if (!modal) return [];
    return modal.orders || modal.challan?.orders || modal.group?.orders || [];
  }, [modal]);

  const modalCustomerIds = useMemo(() => {
    if (!modal) return [];
    const ids = modalOrders
      .map((o) => o.customer_id)
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
      .map((v) => String(v).trim());
    return [...new Set(ids)];
  }, [modal, modalOrders]);

  const modalRiderDetails = useMemo(() => {
    if (!modal) return getRiderDetails(null);
    return getRiderDetails(
      modal.rider || modal.challan?.rider,
      modal.challan?.rider_count > 1 ? 'Multiple Riders' : 'Unassigned'
    );
  }, [modal]);

  const modalDescription = useMemo(
    () => getDescriptionText({ ...(modal?.challan || {}), orders: modalOrders }),
    [modal, modalOrders]
  );

  const modalTotals = useMemo(
    () => computeModalTotals(modal?.challan, modalOrders),
    [modal, modalOrders]
  );

  const stopScanner = useCallback(async () => {
    const inst = scannerRef.current; scannerRef.current = null;
    if (!inst) return;
    try { await inst.stop(); } catch { /* already stopped */ }
    try { inst.clear(); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!scanOpen) return undefined;
    setScanErr('');
    setScanSuccess(false);
    setScanStatus('Starting camera…');
    const regionId = 'qr-reader-deliveries';
    let cancelled = false;
    (async () => {
      await new Promise((r) => setTimeout(r, 100));
      if (cancelled) return;
      const mount = document.getElementById(regionId); if (mount) mount.innerHTML = '';
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const html5 = new Html5Qrcode(regionId);
        scannerRef.current = html5;
        setScanStatus('Camera ready. Keep the challan QR inside the box.');
        await html5.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 260 } },
          (decodedText) => {
            const token = extractChallanToken(decodedText);
            if (!token) {
              setScanSuccess(false);
              setScanStatus('QR detected, but challan token was not found. Try again.');
              return;
            }

            setScanSuccess(true);
            setScanStatus('Valid challan QR detected. Opening challan…');
            setScanOpen(false);
            setScanMatchToken('');
            stopScanner();

            // Backend is the source of truth. Do not block valid QR codes
            // just because the current filtered page has not loaded that row.
            openChallanModal(token);
          },
          () => {
            setScanSuccess(false);
            setScanStatus('Scanning… keep the QR code steady inside the box.');
          }
        );
      } catch (e) {
        if (!cancelled) {
          setScanErr(e.message || 'Could not start camera');
          setScanSuccess(false);
          setScanStatus('Camera could not start. Check camera permission and try again.');
        }
      }
    })();
    return () => { cancelled = true; stopScanner(); };
  }, [scanOpen, stopScanner, openChallanModal]);

  const updateModalStatus = async (delivery_status) => {
    if (!modal?.challan?.challan_id) return;
    const challanId = modal.challan.challan_id;
    const token = modal.challan.qr_token;
    const snapshot = groups;
    setSaving(true);
    markSkipSocketRefresh(skipSocketRefreshUntilRef);
    setGroups((list) => applyChallanPatchToGroups(list, challanId, { delivery_status }));
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/${challanId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delivery_status }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      if (token) await openChallanModal(token);
    } catch (e) {
      setGroups(snapshot);
      setErr(e.message || 'Update failed');
    } finally { setSaving(false); }
  };

  const updateModalRider = async (rider_id) => {
    if (!modal?.challan?.challan_id) return;
    const challanId = modal.challan.challan_id;
    const token = modal.challan.qr_token;
    const snapshot = groups;
    setSaving(true);
    markSkipSocketRefresh(skipSocketRefreshUntilRef);
    setGroups((list) => applyChallanPatchToGroups(list, challanId, { rider_id }));
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/${challanId}/rider`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rider_id: rider_id === '' ? null : Number(rider_id) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      if (token) await openChallanModal(token);
    } catch (e) {
      setGroups(snapshot);
      setErr(e.message || 'Update failed');
    } finally { setSaving(false); }
  };

  const patchGroupRider = async (challanId, rider_id) => {
    if (!challanId) return;
    const snapshot = groups;
    setSaving(true);
    markSkipSocketRefresh(skipSocketRefreshUntilRef);
    setGroups((list) => applyChallanPatchToGroups(list, challanId, { rider_id }));
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/${challanId}/rider`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rider_id: rider_id === '' ? null : Number(rider_id) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
    } catch (e) {
      setGroups(snapshot);
      setErr(e.message || 'Update failed');
    } finally { setSaving(false); }
  };

  const patchGroupStatus = async (challanId, delivery_status) => {
    if (!challanId) return;
    const snapshot = groups;
    setSaving(true);
    markSkipSocketRefresh(skipSocketRefreshUntilRef);
    setGroups((list) => applyChallanPatchToGroups(list, challanId, { delivery_status }));
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/${challanId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delivery_status }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
    } catch (e) {
      setGroups(snapshot);
      setErr(e.message || 'Update failed');
    } finally { setSaving(false); }
  };

  const resetFilters = () => {
    setSearch('');
    setChallanSearch('');
    setFilterStatus([]);
    setFilterRider('');
    setFilterOrderType([]);
    setScanMatchToken('');
    setSelectedIds(new Set());
  };

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allSel = groups.length > 0 && groups.every((g) => selectedIds.has(g.challan_id));
    setSelectedIds(allSel ? new Set() : new Set(groups.map((g) => g.challan_id)));
  };

  const allPageSelected = groups.length > 0 && groups.every((g) => selectedIds.has(g.challan_id));

  const onPrintPdf = async () => {
    if (!selectedBatch) return alert('Select a batch first.');
    const printAll = selectedIds.size === 0;
    let rowsToPrint = printAll
      ? groups
      : groups.filter((g) => selectedIds.has(g.challan_id));

    if (printAll) {
      const qs = buildDeliveriesGroupsQuery({
        batch: selectedBatch,
        page: 1,
        limit: 1000000,
        search: searchDebounced,
        challan: challanDebounced,
        statuses: filterStatus,
        riderId: filterRider,
        orderTypes: filterOrderType,
      });
      const res = await authFetch(`${API_BASE}/operations/deliveries/groups?${qs}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.message || 'Failed to load challans for printing');
        return;
      }
      rowsToPrint = Array.isArray(data.groups) ? data.groups : [];
    }

    if (!rowsToPrint.length) {
      return alert(
        printAll
          ? 'No challans match the current batch and filters.'
          : 'Select at least one visible challan to print, or clear selection to print all filtered challans.'
      );
    }

    setPrinting(true);
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/bulk-detail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch: selectedBatch,
          challan_ids: sortChallanRowsForPrint(rowsToPrint).map((c) => c.challan_id),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not build PDF');
      if (!Array.isArray(data.items) || data.items.length === 0) throw new Error('No data to print');
      const { generateChallanPdf } = await import('../utils/challanPdf');
      await generateChallanPdf(data.items, { includeSlotDividers: false });
    } catch (e) {
      setErr(e.message || 'PDF generation failed');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .om-root { padding: 16px 12px 24px !important; overflow: auto !important; }
          .om-table-wrap     { display: block !important; }
        }
      `}</style>

      <div className="om-root" style={{ padding: '19px', fontFamily: "'Poppins','Inter',sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>

        <Link
          to="/operations"
          style={{ fontSize: '12px', fontWeight: 600, color: '#FF5722', textDecoration: 'none', marginBottom: '14px', display: 'inline-block', flexShrink: 0 }}
        >
          ← Operations modules
        </Link>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>Deliveries Management</h2>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#888', fontWeight: '500', lineHeight: 1.45, maxWidth: '720px' }}>
              Challan-based delivery groups. Assign riders and update status. Click a row for full details.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {(saving || printing) && (
              <span style={{ fontSize: '10px', color: '#999', fontWeight: '600' }}>
                {printing ? 'Generating PDF…' : 'Saving…'}
              </span>
            )}
            {batches.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '11px', color: '#666', whiteSpace: 'nowrap' }}>Batch:</label>
                <select
                  value={selectedBatch ?? ''}
                  onChange={(e) => setSelectedBatch(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #e0e0e0', background: '#fff', fontSize: '11px', fontWeight: '600', color: '#333', cursor: 'pointer' }}
                >
                  {batches.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', marginBottom: '12px' }}>
          {summaryCards.map(([k, v]) => (
            <div key={k} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '10px' }}>
              <div style={{ fontSize: '10px', color: '#777' }}>{k}</div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #e6e6e6', marginBottom: '12px' }} />

        {/* Desktop filters */}
        <div className="om-filter-desktop" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', alignItems: 'flex-end', flexShrink: 0 }}>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Search</label>
            <input type="text" placeholder="Address, area, shareholders…" value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: '0 1 180px', minWidth: 150 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Challan No.</label>
            <input type="text" placeholder="Search challan no…" value={challanSearch} onChange={(e) => setChallanSearch(e.target.value)} style={inputStyle} />
          </div>

          <MultiSelectDropdown label="Status" options={statusOptions} values={filterStatus} onChange={setFilterStatus} placeholder="All status" width={150} />
          <MultiSelectDropdown label="Order Type" options={orderTypeOptions} values={filterOrderType} onChange={setFilterOrderType} placeholder="All types" width={160} />
          <SearchableRiderFilter value={filterRider} onChange={setFilterRider} riders={riders} inputStyle={inputStyle} width={230} />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={printing || saving}
              onClick={onPrintPdf}
              title={selectedIds.size ? `Print ${selectedIds.size} selected challan(s)` : `Print all ${totalGroups} challan(s) matching current batch and filters`}
              style={{ padding: '6px 13px', height: '29px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
            >
              Print PDF{selectedIds.size ? ` (${selectedIds.size})` : ''}
            </button>
            <button type="button" onClick={() => setScanOpen(true)} style={{ padding: '6px 13px', height: '29px', background: '#fff', color: '#FF5722', border: '1px solid #FFCCBC', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Scan QR</button>
            <button type="button" onClick={() => { loadBatches(); load(); }} style={{ padding: '6px 13px', height: '29px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>Refresh</button>
            <button type="button" onClick={resetFilters} style={{ padding: '6px 13px', height: '29px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>Reset</button>
          </div>
        </div>

        {/* Mobile filter toggle */}
        <div className="om-filter-toggle" style={{ display: 'none', gap: '8px', marginBottom: '8px', flexShrink: 0, alignItems: 'center' }}>
          <div className="ops-filter-search-wrap" style={{ flex: 1, minWidth: 0, maxWidth: 'none' }}>
            <OpsSearchIcon />
            <input type="search" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button type="button" className={`ops-filter-toggle-btn${mobileFiltersOpen ? ' is-open' : ''}`} onClick={() => setMobileFiltersOpen((v) => !v)}>⚙ Filters</button>
          <button type="button" disabled={printing} onClick={onPrintPdf} style={{ padding: '9px 12px', borderRadius: '8px', background: '#FF5722', color: '#fff', border: 'none', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Print PDF{selectedIds.size ? ` (${selectedIds.size})` : ''}</button>
          <button type="button" onClick={() => setScanOpen(true)} style={{ padding: '9px 12px', borderRadius: '8px', background: '#fff', color: '#FF5722', border: '1px solid #FFCCBC', fontSize: '13px', cursor: 'pointer' }}>Scan</button>
        </div>
        <div className="om-filter-mobile" style={{ display: 'none' }}>
          {mobileFiltersOpen && (
            <div className="ops-filter-mobile-panel">
              <div>
                <label style={{ display:'block', fontSize:'11px', color:'#666', marginBottom:'4px' }}>Challan No.</label>
                <input type="text" value={challanSearch} onChange={(e)=>setChallanSearch(e.target.value)} placeholder="Search challan no…" style={{ width:'100%', padding:'9px 12px', borderRadius:'8px', border:'1px solid #e0e0e0', fontSize:'13px' }} />
              </div>
              <MultiSelectDropdown label="Status" options={statusOptions} values={filterStatus} onChange={setFilterStatus} placeholder="All status" width={280} />
              <MultiSelectDropdown label="Order Type" options={orderTypeOptions} values={filterOrderType} onChange={setFilterOrderType} placeholder="All types" width={280} />
              <SearchableRiderFilter value={filterRider} onChange={setFilterRider} riders={riders} width={280} inputStyle={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px', background: '#fff' }} />
              <div className="ops-filter-mobile-actions">
                <button type="button" className="ops-filter-mobile-done" onClick={()=>setMobileFiltersOpen(false)}>Done</button>
                <button type="button" className="ops-filter-mobile-reset" onClick={()=>{ resetFilters(); setMobileFiltersOpen(false); }}>Reset</button>
              </div>
            </div>
          )}
        </div>

        {scanMatchToken && (
          <div style={{ padding:'10px 12px', background:'#E8F5E9', border:'1px solid #C8E6C9', borderRadius:'6px', marginBottom:'12px', flexShrink:0, fontSize:'11px', color:'#2E7D32', fontWeight:'600', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', flexWrap:'wrap' }}>
            <span>Showing the delivery group for the scanned challan QR.</span>
            <button type="button" onClick={()=>setScanMatchToken('')} style={{ padding:'5px 12px', borderRadius:'6px', border:'1px solid #81C784', background:'#fff', color:'#2E7D32', fontSize:'10px', fontWeight:'600', cursor:'pointer' }}>Clear scan filter</button>
          </div>
        )}
        {err && <div style={{ padding:'10px', background:'#FFF5F2', color:'#C62828', borderRadius:'6px', marginBottom:'13px', flexShrink:0, fontSize:'10px', fontWeight:'600' }}>{err}</div>}
        {!loading && <div style={{ fontSize:'10px', color:'#999', marginBottom:'8px', flexShrink:0 }}>Showing {groups.length} of {totalGroups} groups matching filters</div>}

        {/* Table */}
        <div className="om-table-wrap" style={{ flex:1, minHeight:0, overflow:'auto', borderRadius:'10px', border:'1px solid #ececec' }}>
          {loading ? (
            <div style={{ padding:'40px', textAlign:'center', color:'#666', fontSize:'11px' }}>Loading…</div>
          ) : groups.length === 0 ? (
            <div style={{ padding:'40px', textAlign:'center', color:'#666', fontSize:'11px' }}>{totalGroups===0 && !searchDebounced && !challanDebounced && !filterStatus.length && !filterRider && !filterOrderType.length && !scanMatchToken ? 'No challans for this batch.' : 'No rows match the current filters.'}</div>
          ) : (
            <table className="ops-data-table" style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px', tableLayout:'auto' }}>
              
              <thead style={{ position:'sticky', top:0, zIndex:1 }}>
                <tr style={{ background:'#fafafa' }}>
                  <th style={{ textAlign:'left', padding:'10px 8px', borderBottom:'1px solid #e0e0e0', width:'32px' }}>
                    <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} style={{ cursor:'pointer', accentColor:'#FF5722' }} title="Select all on this page" />
                  </th>
                  {['No.', 'Status', 'Rider', 'Description', 'Customer Name', ...HISSA_COUNT_TABLE_HEADERS, 'Boxes', 'Batch', 'Area', 'Contact', 'Address', 'Customer ID'].map((h) => (
                    <th key={h} style={{ textAlign:'left', padding:'10px 10px', borderBottom:'1px solid #e0e0e0', color:'#555', fontWeight:'600', whiteSpace:'nowrap', fontSize:'10px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g, idx) => {
                  const st = g.derived_status || 'Pending';
                  const rowTag = getOrderTag(g);
                  const rowHighlight = getChallanRowHighlight(rowTag);
                  const rowCounts = getTableHissaCounts(g);
                  const isScanHit = scanMatchToken && g.qr_token === scanMatchToken;
                  const baseBg = isScanHit ? '#FFF8E1' : (rowHighlight.background || (idx % 2 === 0 ? '#fff' : '#FAFAFA'));
                  return (
                    <tr
                      key={g.group_key || g.challan_id}
                      id={rowDomId(g)}
                      style={{ borderBottom:'1px solid #f3f3f3', background: baseBg, borderLeft: rowHighlight.borderLeft, cursor:'pointer' }}
                      onClick={() => g.qr_token && openChallanModal(g.qr_token)}
                      onMouseEnter={(e)=>{ if(!isScanHit) e.currentTarget.style.background='#f5f9ff'; }}
                      onMouseLeave={(e)=>{ e.currentTarget.style.background = baseBg; }}
                    >
                      <td style={{ padding:'9px 8px' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(g.challan_id)}
                          onChange={() => toggleOne(g.challan_id)}
                          style={{ cursor:'pointer', accentColor:'#FF5722' }}
                        />
                      </td>
                      <td style={{ padding:'9px 10px' }}>
                        <NoBadge number={g.challan_id} />
                      </td>
                      <td style={{ padding:'9px 10px' }} onClick={(e)=>e.stopPropagation()}>
                        <select value={st} onChange={(e)=>patchGroupStatus(g.challan_id, e.target.value)} style={selectStyle}>
                          {STATUSES.map((s)=><option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{ padding:'9px 10px' }} onClick={(e)=>e.stopPropagation()}>
                        <SearchableRiderSelect value={g.rider_id??''} riders={riders} fallbackLabel={g.rider_count > 1 ? 'Multiple Riders' : undefined} onChange={(rid)=>patchGroupRider(g.challan_id, rid)} />
                      </td>
                      <td className="ops-cell-wrap" style={{ padding:'9px 10px', color:'#555', verticalAlign:'top' }}>
                        <OrderDescriptionCell source={g} />
                      </td>
                      <td className="ops-cell-wrap" style={{ padding:'9px 10px', fontWeight:'500', color:'#333', verticalAlign:'top' }}>{(g.booking_names||[]).join(', ')||'—'}</td>
                      {hissaCountCellValues(rowCounts).map((v, i) => (
                        <td key={HISSA_COUNT_TABLE_HEADERS[i]} style={{ padding:'9px 10px', color:'#555' }}>{v}</td>
                      ))}
                      <td style={{ padding:'9px 10px', color:'#555', fontWeight:'600' }}>{rowCounts.weightQtyLabel}</td>
                      <td style={{ padding:'9px 10px', color:'#555', whiteSpace:'nowrap' }}>{g.batch || '—'}</td>
                      <td className="ops-cell-wrap" style={{ padding:'9px 10px', color:'#555', verticalAlign:'top' }}>{g.area||'—'}</td>
                      <td className="ops-cell-wrap" style={{ padding:'9px 10px', color:'#555' }}><MultiLineCell values={[g.contacts || [], g.alt_contacts || []]} /></td>
                      <td className="ops-cell-wrap" style={{ padding:'9px 10px', color:'#555', verticalAlign:'top' }}>
                        <div>{g.address||'—'}</div>
                      </td>
                      <td style={{ padding:'9px 10px', color:'#777', fontWeight:'500' }}><MultiLineCell values={g.customer_ids || []} /></td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {/* Pagination */}
{!loading && totalGroups > 0 && (
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
      Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalGroups)} of {totalGroups} groups
    </span>

    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      
      {/* Previous */}
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

      {/* Page Numbers */}
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

      {/* Next */}
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

      {/* Scan QR modal */}
      {scanOpen && (
        <div className="ops-sheet-overlay" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100, padding:'16px' }} onClick={()=>setScanOpen(false)} role="presentation">
          <div className="ops-sheet-panel" style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e0e0e0', padding:'18px', maxWidth:'400px', width:'100%', boxShadow:'0 10px 40px rgba(0,0,0,0.15)' }} onClick={(e)=>e.stopPropagation()} role="dialog">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
              <h3 style={{ margin:0, fontSize:'15px', fontWeight:'600', color:'#333' }}>Scan challan QR</h3>
              <button type="button" onClick={()=>setScanOpen(false)} style={{ border:'none', background:'none', fontSize:'22px', color:'#888', cursor:'pointer', lineHeight:1 }}>×</button>
            </div>
            <p style={{ margin:'0 0 12px', fontSize:'11px', color:'#666', lineHeight:1.5 }}>Point the camera at the challan QR code.</p>
            <div id="qr-reader-deliveries" style={{ borderRadius:'10px', overflow:'hidden', minHeight:'240px', background:'#111' }} />
            <div style={{ marginTop:'10px', padding:'8px 10px', background: scanSuccess ? '#E8F5E9' : '#FFF8E1', color: scanSuccess ? '#2E7D32' : '#F57C00', borderRadius:'6px', fontSize:'10px', fontWeight:'600' }}>{scanStatus}</div>
            {scanErr && <div style={{ marginTop:'10px', padding:'8px 10px', background:'#FFF5F2', color:'#C62828', borderRadius:'6px', fontSize:'10px', fontWeight:'600' }}>{scanErr}</div>}
          </div>
        </div>
      )}

      {/* Challan detail modal */}
      {modal && (
        <SharedChallanModal
          challanId={modal.challan?.challan_id}
          customerId={modalCustomerIds.length ? modalCustomerIds.join(', ') : '—'}
          description={modalDescription}
          affluent={isAffluentOrder({ ...(modal?.challan || {}), orders: modalOrders }, 'total_hissa', 'total_waqf_hissa')}
          specialRequest={isSpecialRequestOrder({ ...(modal?.challan || {}), orders: modalOrders }, 'total_hissa', 'total_waqf_hissa')}
          variant="mango"
          statusBadge={<StatusBadge status={modal.challan?.derived_status} />}
          onClose={closeModal}
          maxWidth="1240px"
          infoRows={[
            ['Address', modal.challan?.address || '—'],
            ['Customer Name', modal.challan?.booking_name || [...new Set(modalOrders.map((o) => o.name || o.booking_name).filter(Boolean))].join(', ') || '—'],
            ['Area', modal.challan?.area || '—'],
            ['Batch', modal.challan?.batch || '—'],
            ['Rider', modalRiderDetails.name],
            ['Total Boxes', modalTotals.weightQtyLabel || formatTotalHissa(modalTotals.total || 0, modalTotals)],
          ]}
          orders={modalOrders}
          renderOrderStatus={(o) => <StatusBadge status={o.delivery_status} />}
        >
          <label style={{ display:'block', fontSize:'12px', fontWeight:'600', marginBottom:'4px', color:'#333' }}>Update Status (all orders)</label>
          <div style={{ width:'100%', marginBottom:'12px' }}>
            <SearchableStatusSelect
              value={modal.challan?.derived_status || 'Pending'}
              disabled={saving}
              onChange={(val)=>updateModalStatus(val)}
              menuPlacement="below"
              fullWidth
            />
          </div>

          <label style={{ display:'block', fontSize:'12px', fontWeight:'600', marginBottom:'4px', color:'#333' }}>Assign Rider</label>
          <div style={{ width:'100%', marginBottom:'14px' }}>
            <SearchableRiderSelect
              value={modal.challan?.rider_id??''}
              disabled={saving}
              riders={riders}
              fallbackLabel={modal.challan?.rider_count > 1 ? 'Multiple Riders' : undefined}
              onChange={(rid)=>updateModalRider(rid)}
              menuPlacement="below"
              fullWidth
            />
          </div>
        </SharedChallanModal>
      )}
    </>
  );
}