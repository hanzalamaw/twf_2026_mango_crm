import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OpsSearchIcon } from '../components/OpsFilters';
import { useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { useAuth } from '../context/AuthContext';
import SharedChallanModal from '../components/SharedChallanModal';
import SearchableRiderFilter from '../components/SearchableRiderFilter';
import { API_BASE } from '../config/api';
import { useOperationsSocketRefresh } from '../utils/useOperationsSocketRefresh';
import { formatRiderCompact } from '../utils/riderFormat';
import { getDescriptionText, isAffluentOrder, normalizeForCompare } from '../utils/orderTags';
import {
  buildSlotFilterOptions,
  getGroupSlots,
  getSlotsForItem,
  itemMatchesDay,
  itemMatchesSlots,
  pruneSlotFilter,
  slotFilterValuesKey,
} from '../utils/operationsFilters';
import { useOperationsBatchDay } from '../utils/useOperationsBatchDay';
import OrderDescriptionCell from '../components/OrderDescriptionCell';
import {
  ALLOWED_ORDER_TYPES,
  ORDER_TYPE_FILTERS,
  buildSummaryStatCards,
  computeModalTotals,
  formatTotalHissa,
  groupMatchesOrderTypeFilter,
  normalizeOrderType,
  summarizeDeliveryGroups,
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

function sumOrders(orders, field) {
  return (orders || []).reduce((total, order) => total + Number(order?.[field] || 0), 0);
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

const PAGE_SIZE = 50;

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

export default function OperationsAffluent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { authFetch } = useAuth();

  const {
    dayBatches,
    selectedDay,
    setSelectedDay,
    selectedBatch,
    setSelectedBatch,
    loadBatches,
    DAY_OPTIONS,
  } = useOperationsBatchDay(authFetch);

  const [groups,        setGroups]        = useState([]);
  const [riders,        setRiders]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [err,           setErr]           = useState('');
  const [modal,         setModal]         = useState(null);
  const [saving,        setSaving]        = useState(false);

  const [search,          setSearch]          = useState('');
  const [challanSearch,   setChallanSearch]   = useState('');
  const [filterDay, setFilterDay] = useState('Day 1');
  const [filterSlots,     setFilterSlots]     = useState([]);
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
  const [slotDropdownOpen,   setSlotDropdownOpen]   = useState(false);

  const scannerRef     = useRef(null);
  const groupsRef      = useRef(groups);
  const slotDropdownRef = useRef(null);

  useEffect(() => { groupsRef.current = groups; }, [groups]);

  // close slot dropdown on outside click
  useEffect(() => {
    if (!slotDropdownOpen) return;
    const handler = (e) => {
      if (slotDropdownRef.current && !slotDropdownRef.current.contains(e.target)) {
        setSlotDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [slotDropdownOpen]);

  useEffect(() => {
    if (selectedDay) setFilterDay(selectedDay);
  }, [selectedDay]);

  const load = useCallback(async () => {
    setErr(''); setLoading(true);
    try {
      // NOTE: we do NOT pass day/slot filters to the backend.
      // All filtering is done client-side so day+slot combos always work
      // against the full dataset regardless of casing differences in the DB.
      const qs = selectedBatch ? `?batch_id=${selectedBatch}` : '';
      const [gRes, rRes] = await Promise.all([
        authFetch(`${API_BASE}/operations/deliveries/groups${qs}`),
        authFetch(`${API_BASE}/operations/riders`),
      ]);
      if (!gRes.ok) throw new Error((await gRes.json().catch(() => ({}))).message || 'Failed to load deliveries');
      const gData = await gRes.json();
      setGroups(gData.groups || []);
      if (rRes.ok) setRiders(await rRes.json());
      else setRiders([]);
    } catch (e) {
      setErr(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [authFetch, selectedBatch]);

  useEffect(() => { if (selectedBatch !== null) load(); }, [load, selectedBatch]);

  useOperationsSocketRefresh(() => {
    loadBatches();
    if (selectedBatch !== null) load();
  }, [load, loadBatches, selectedBatch]);

  const slotFilterOptions = useMemo(
    () => buildSlotFilterOptions(groups, filterDay),
    [groups, filterDay]
  );

  const slotOptionsKey = useMemo(
    () => slotFilterValuesKey(slotFilterOptions),
    [slotFilterOptions]
  );

  useEffect(() => {
    setFilterSlots((prev) => pruneSlotFilter(prev, slotFilterOptions.map((o) => o.value)));
  }, [filterDay, slotOptionsKey]);

  const orderTypeOptions = ORDER_TYPE_FILTERS;
  const statusOptions = useMemo(() => STATUSES.map((s) => ({ value: s, label: s })), []);

  // ── filter + sort ────────────────────────────────────────────
  // All string comparisons go through normalizeForCompare so that
  // "DAY 1" / "Day 1" / "day 1" and "SLOT 1" / "Slot 1" all match.
  /** All affluent groups in the batch (no table filters) — for empty state and “X of Y” denominator. */
  const affluentGroups = useMemo(() => groups.filter((g) => isAffluentOrder(g)), [groups]);

  /**
   * Same filter + sort pipeline as Deliveries: start from all groups in the batch.
   * Summary totals use this list so amounts match Deliveries for the same batch/filters (includes non-affluent).
   */
  const filteredSortedAllGroups = useMemo(() => {
    let list = groups;

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((g) =>
        [g.address, g.area, g.day, ...(g.shareholder_names||[]), ...(g.booking_names||[]), ...(g.contacts||[]), ...(g.customer_ids||[]).map(String)]
          .filter(Boolean).join(' ').toLowerCase().includes(q)
      );
    }

    const challanQ = challanSearch.trim().toLowerCase();
    if (challanQ) {
      list = list.filter((g) => String(g.challan_id || '').toLowerCase().includes(challanQ));
    }

    if (filterDay) list = list.filter((g) => itemMatchesDay(g, filterDay));
    if (filterSlots.length) list = list.filter((g) => itemMatchesSlots(g, filterSlots, filterDay));
    if (filterStatus.length) list = list.filter((g) => filterStatus.includes(g.derived_status || 'Pending'));
    if (filterRider) list = list.filter((g) => String(g.rider_id || '') === filterRider);
    if (filterOrderType.length) list = list.filter((g) => groupMatchesOrderTypeFilter(g, filterOrderType));
    if (scanMatchToken) list = list.filter((g) => g.qr_token === scanMatchToken);

    list = [...list].sort((a, b) => {
      const dayA = normalizeForCompare(a.day);
      const dayB = normalizeForCompare(b.day);
      if (dayA !== dayB) return dayA.localeCompare(dayB);
      const slotA = normalizeForCompare(getSlotsForItem(a, filterDay)[0] || '');
      const slotB = normalizeForCompare(getSlotsForItem(b, filterDay)[0] || '');
      if (slotA !== slotB) return slotA.localeCompare(slotB, undefined, { numeric: true });
      return String(a.address || '').trim().toLowerCase()
        .localeCompare(String(b.address || '').trim().toLowerCase());
    });

    return list;
  }, [groups, search, challanSearch, filterDay, filterSlots, filterStatus, filterRider, filterOrderType, scanMatchToken]);

  /** Table rows: affluent only, same filters as above. */
  const displayGroups = useMemo(
    () => filteredSortedAllGroups.filter((g) => isAffluentOrder(g)),
    [filteredSortedAllGroups]
  );

  /** Amounts/totals in Affluent must use affluent rows only (with active filters). */
  const summary = useMemo(() => summarizeDeliveryGroups(displayGroups), [displayGroups]);
  const summaryCards = useMemo(() => buildSummaryStatCards(summary), [summary]);

  const totalPages  = Math.max(1, Math.ceil(displayGroups.length / PAGE_SIZE));
  const pagedGroups = useMemo(() => displayGroups.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE), [displayGroups, page]);

  useEffect(() => { setPage(1); }, [search, challanSearch, filterDay, filterSlots, filterStatus, filterRider, filterOrderType, scanMatchToken, selectedBatch]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const rowDomId = (g) => `dlv-${g.challan_id || g.group_key}`;

  useEffect(() => {
    if (!scanMatchToken) return;
    const first = displayGroups[0]; if (!first) return;
    document.getElementById(rowDomId(first))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [scanMatchToken, displayGroups]);

  const openChallanModal = useCallback(async (token) => {
    if (!token) return;
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/by-token/${encodeURIComponent(token)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Challan not found');
      setModal(data);
    } catch (e) { setErr(e.message || 'Failed to open challan'); }
  }, [authFetch]);

  const challanParam = searchParams.get('challan');
  useEffect(() => { if (challanParam) openChallanModal(challanParam); }, [challanParam, openChallanModal]);
  const closeModal = () => { setModal(null); const next = new URLSearchParams(searchParams); next.delete('challan'); setSearchParams(next, { replace: true }); };

  const modalCustomerIds = useMemo(() => {
    if (!modal) return [];
    const ids = (modal.orders || [])
      .map((o) => o.customer_id)
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
      .map((v) => String(v).trim());
    return [...new Set(ids)];
  }, [modal]);

  const modalRiderDetails = useMemo(() => {
    if (!modal) return getRiderDetails(null);
    return getRiderDetails(
      modal.rider,
      modal.challan?.rider_count > 1 ? 'Multiple Riders' : 'Unassigned'
    );
  }, [modal]);

  const modalDescription = useMemo(() => getDescriptionText({ ...(modal?.challan || {}), orders: modal?.orders || [] }), [modal]);

  const modalTotals = useMemo(
    () => computeModalTotals(modal?.challan, modal?.orders),
    [modal]
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
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/${modal.challan.challan_id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delivery_status }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      await openChallanModal(modal.challan.qr_token); await load();
    } catch (e) { setErr(e.message || 'Update failed'); } finally { setSaving(false); }
  };

  const updateModalRider = async (rider_id) => {
    if (!modal?.challan?.challan_id) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/${modal.challan.challan_id}/rider`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rider_id: rider_id === '' ? null : Number(rider_id) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      await openChallanModal(modal.challan.qr_token); await load();
    } catch (e) { setErr(e.message || 'Update failed'); } finally { setSaving(false); }
  };

  const patchGroupRider = async (challanId, rider_id) => {
    if (!challanId) return; setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/${challanId}/rider`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rider_id: rider_id === '' ? null : Number(rider_id) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      await load();
    } catch (e) { setErr(e.message || 'Update failed'); } finally { setSaving(false); }
  };

  const patchGroupStatus = async (challanId, delivery_status) => {
    if (!challanId) return; setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/${challanId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delivery_status }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      await load();
    } catch (e) { setErr(e.message || 'Update failed'); } finally { setSaving(false); }
  };

  const resetFilters = () => {
    setSearch(''); setChallanSearch(''); setFilterDay(''); setFilterSlots([]); setFilterStatus([]);
    setFilterRider(''); setFilterOrderType([]); setSlotDropdownOpen(false); setScanMatchToken('');
  };

  const toggleSlot = (slot) => {
    // Toggle by normalized key so "SLOT 1" and "Slot 1" are treated as the same
    const normSlot = normalizeForCompare(slot);
    setFilterSlots((prev) => {
      const alreadySelected = prev.some((s) => normalizeForCompare(s) === normSlot);
      return alreadySelected
        ? prev.filter((s) => normalizeForCompare(s) !== normSlot)
        : [...prev, slot];
    });
  };

  const isSlotSelected = (slot) =>
    filterSlots.some((s) => normalizeForCompare(s) === normalizeForCompare(slot));

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .om-root { padding: 16px 12px 24px !important; overflow: auto !important; }
          .om-table-wrap     { display: block !important; }
        }
      `}</style>

      <div className="om-root" style={{ padding: '19px', fontFamily: "'Poppins','Inter',sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>Affluent Management</h2>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#888', fontWeight: '500', lineHeight: 1.45, maxWidth: '720px' }}>
              Delivery groups with 3+ non-waqf hissa (total minus waqf) or a description containing PRIORITY. Excludes special-request rows. Assign riders and update status.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {saving && <span style={{ fontSize: '10px', color: '#999', fontWeight: '600' }}>Saving…</span>}
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

        {/* Day selector — toggleable, empty string = all days */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', width: '100%', gap: '8px', marginBottom: '12px' }}>
          {DAY_OPTIONS.map((d) => (
            <button key={d} type="button"
              onClick={() => { setSelectedDay(d); setFilterDay(d); }}
              style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid #e0e0e0', background: normalizeForCompare(selectedDay) === normalizeForCompare(d) ? '#FF5722' : '#fff', color: normalizeForCompare(selectedDay) === normalizeForCompare(d) ? '#fff' : '#333', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>{d}</button>
          ))}
        </div>

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

          {/* Slot multi-select dropdown */}
          <div ref={slotDropdownRef} style={{ minWidth: 180, maxWidth: 240, position: 'relative' }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Slots</label>
            <button
              type="button"
              onClick={() => setSlotDropdownOpen((v) => !v)}
              style={{ width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: '6px', border: `1px solid ${slotDropdownOpen ? '#FF5722' : '#e0e0e0'}`, background: '#fff', fontSize: '11px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', color: filterSlots.length ? '#FF5722' : '#555', fontWeight: filterSlots.length ? '600' : '400' }}
            >
              <span>{filterSlots.length ? `${filterSlots.length} slot(s) selected` : 'All slots'}</span>
              <span style={{ fontSize: '8px', opacity: 0.5 }}>{slotDropdownOpen ? '▲' : '▼'}</span>
            </button>
            {slotDropdownOpen && (
              <div style={{ position: 'absolute', zIndex: 50, left: 0, top: 'calc(100% + 4px)', minWidth: '100%', width: 'max-content', maxWidth: '260px', maxHeight: '200px', overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff', padding: '6px 4px', boxShadow: '0 6px 18px rgba(0,0,0,0.1)' }}>
                {slotFilterOptions.length === 0 ? (
                  <div style={{ padding: '8px 10px', fontSize: '10px', color: '#aaa' }}>No slots for this day</div>
                ) : (
                  <>
                    {filterSlots.length > 0 && (
                      <div
                        onClick={() => setFilterSlots([])}
                        style={{ padding: '5px 10px', fontSize: '10px', color: '#FF5722', cursor: 'pointer', fontWeight: '600', borderBottom: '1px solid #f5f5f5', marginBottom: '2px' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#fff4f0'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        Clear selection
                      </div>
                    )}
                    {slotFilterOptions.map(({ value: s }) => (
                      <label
                        key={s}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', fontSize: '10px', cursor: 'pointer', borderRadius: '5px', background: isSlotSelected(s) ? '#FFF4F0' : 'transparent', color: isSlotSelected(s) ? '#FF5722' : '#333', fontWeight: isSlotSelected(s) ? '600' : '400' }}
                        onMouseEnter={(e) => { if (!isSlotSelected(s)) e.currentTarget.style.background = '#fafafa'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = isSlotSelected(s) ? '#FFF4F0' : 'transparent'; }}
                      >
                        <input
                          type="checkbox"
                          checked={isSlotSelected(s)}
                          onChange={() => toggleSlot(s)}
                          style={{ cursor: 'pointer', accentColor: '#FF5722' }}
                        />
                        {s}
                      </label>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <MultiSelectDropdown label="Status" options={statusOptions} values={filterStatus} onChange={setFilterStatus} placeholder="All status" width={150} />
          <MultiSelectDropdown label="Order Type" options={orderTypeOptions} values={filterOrderType} onChange={setFilterOrderType} placeholder="All types" width={160} />
          <SearchableRiderFilter value={filterRider} onChange={setFilterRider} riders={riders} inputStyle={inputStyle} width={230} />
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setScanOpen(true)} style={{ padding: '6px 13px', height: '29px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Scan QR</button>
            <button type="button" onClick={load} style={{ padding: '6px 13px', height: '29px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>Refresh</button>
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
          <button type="button" onClick={() => setScanOpen(true)} style={{ padding: '9px 12px', borderRadius: '8px', background: '#FF5722', color: '#fff', border: 'none', fontSize: '13px', cursor: 'pointer' }}>Scan</button>
        </div>
        <div className="om-filter-mobile" style={{ display: 'none' }}>
          {mobileFiltersOpen && (
            <div className="ops-filter-mobile-panel">
              <div>
                <label style={{ display:'block', fontSize:'11px', color:'#666', marginBottom:'4px' }}>Challan No.</label>
                <input type="text" value={challanSearch} onChange={(e)=>setChallanSearch(e.target.value)} placeholder="Search challan no…" style={{ width:'100%', padding:'9px 12px', borderRadius:'8px', border:'1px solid #e0e0e0', fontSize:'13px' }} />
              </div>
              <MultiSelectDropdown label="Slots" options={slotFilterOptions} values={filterSlots} onChange={setFilterSlots} placeholder="All slots" width={280} />
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
        {!loading && <div style={{ fontSize:'10px', color:'#999', marginBottom:'8px', flexShrink:0 }}>Showing {displayGroups.length} of {affluentGroups.length} affluent groups</div>}

        {/* Table */}
        <div className="om-table-wrap" style={{ flex:1, minHeight:0, overflow:'auto', borderRadius:'10px', border:'1px solid #ececec' }}>
          {loading ? (
            <div style={{ padding:'40px', textAlign:'center', color:'#666', fontSize:'11px' }}>Loading…</div>
          ) : displayGroups.length === 0 ? (
            <div style={{ padding:'40px', textAlign:'center', color:'#666', fontSize:'11px' }}>{affluentGroups.length===0 ? 'No affluent challans for this batch.' : 'No affluent rows match the current filters.'}</div>
          ) : (
            <table className="ops-data-table" style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px', tableLayout:'auto' }}>
              
              <thead style={{ position:'sticky', top:0, zIndex:1 }}>
                <tr style={{ background:'#fafafa' }}>
                  {['No.', 'Status', 'Rider', 'Description', 'Booking Name', ...HISSA_COUNT_TABLE_HEADERS, 'Total Hissa', 'Day / Slot', 'Area', 'Contact', 'Address', 'Customer ID'].map((h) => (
                    <th key={h} style={{ textAlign:'left', padding:'10px 10px', borderBottom:'1px solid #e0e0e0', color:'#555', fontWeight:'600', whiteSpace:'nowrap', fontSize:'10px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedGroups.map((g, idx) => {
                  const st = g.derived_status || 'Pending';
                  const rowIsAffluent = isAffluentOrder(g);
                  const rowCounts = getTableHissaCounts(g);
                  const isScanHit = scanMatchToken && g.qr_token === scanMatchToken;
                  return (
                    <tr
                      key={g.group_key || g.challan_id}
                      id={rowDomId(g)}
                      style={{ borderBottom:'1px solid #f3f3f3', background: isScanHit ? '#FFF8E1' : (rowIsAffluent ? '#FFF7F7' : (idx%2===0 ? '#fff' : '#FAFAFA')), borderLeft: rowIsAffluent ? '3px solid #D32F2F' : '3px solid transparent', cursor:'pointer' }}
                      onClick={() => g.qr_token && openChallanModal(g.qr_token)}
                      onMouseEnter={(e)=>{ if(!isScanHit) e.currentTarget.style.background='#f5f9ff'; }}
                      onMouseLeave={(e)=>{ e.currentTarget.style.background = isScanHit ? '#FFF8E1' : (rowIsAffluent ? '#FFF7F7' : (idx%2===0 ? '#fff' : '#FAFAFA')); }}
                    >
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
                        <OrderDescriptionCell source={g} totalField="hissa_count" waqfField="waqf_hissa_count" />
                      </td>
                      <td className="ops-cell-wrap" style={{ padding:'9px 10px', fontWeight:'500', color:'#333', verticalAlign:'top' }}>{(g.booking_names||[]).join(', ')||'—'}</td>
                      {hissaCountCellValues(rowCounts).map((v, i) => (
                        <td key={HISSA_COUNT_TABLE_HEADERS[i]} style={{ padding:'9px 10px', color:'#555' }}>{v}</td>
                      ))}
                      <td style={{ padding:'9px 10px', color:'#555', fontWeight:'600' }}>{rowCounts.total}</td>
                      <td style={{ padding:'9px 10px', color:'#555', whiteSpace:'nowrap' }}>
                        <div>{g.day||'—'}</div>
                        {getGroupSlots(g, filterDay).length > 0 && <div style={{ fontSize:'9px', color:'#aaa' }}>{getGroupSlots(g, filterDay).join(', ')}</div>}
                      </td>
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
{!loading && displayGroups.length > 0 && (
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
      Showing {pagedGroups.length} of {displayGroups.length} groups
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
          affluent={isAffluentOrder({ ...(modal?.challan || {}), orders: modal?.orders || [] }, 'total_hissa', 'total_waqf_hissa')}
          statusBadge={<StatusBadge status={modal.challan?.derived_status} />}
          onClose={closeModal}
          maxWidth="1240px"
          infoRows={[
            ['Address', modal.challan?.address || '—'],
            ['Booking Name', modal.challan?.booking_name || [...new Set((modal.orders || []).map((o) => o.booking_name).filter(Boolean))].join(', ') || '—'],
            ['Area', modal.challan?.area || '—'],
            ['Day', modal.challan?.day || '—'],
            ['Slot', modal.challan?.slot || '—'],
            ['Rider', modalRiderDetails.name],
                        ['Total Hissa', formatTotalHissa(modalTotals.total || 0, modalTotals)],
          ]}
          orders={(modal.orders || []).filter((o) => ALLOWED_ORDER_TYPES.includes(normalizeOrderType(o.order_type)))}
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