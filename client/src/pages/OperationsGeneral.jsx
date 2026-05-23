import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../config/api';
import { getOperationsSocket } from '../utils/operationsSocket';
import { useAuth } from '../context/AuthContext';
import OperationsTargetSection from '../components/OperationsTargetSection';
import { ORDER_TYPE_FILTERS } from '../utils/operationsOrderTypes';

const DELIVERY_STATUSES = ['Pending', 'Rider Assigned', 'Dispatched', 'Delivered', 'Returned to Farm'];

const ORDER_TYPE_OPTIONS = ORDER_TYPE_FILTERS;

const SLOT_OPTIONS = ['SLOT 1', 'SLOT 2', 'SLOT 3'];
const DAY_OPTIONS = ['Day 1', 'Day 2', 'Day 3'];

function pct(a, b) {
  if (!b) return '0%';
  return `${Math.round((a / b) * 100)}%`;
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="od-stat-card" style={{
      background: '#fff', border: '1px solid #e8e8e8',
      borderRadius: '14px', padding: '16px 18px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
      borderLeft: `4px solid ${accent || '#FF5722'}`,
      display: 'flex', flexDirection: 'column', gap: '4px',
      height: '100%', boxSizing: 'border-box',
    }}>
      <div style={{ fontSize: '10px', color: '#888', fontWeight: '500' }}>{label}</div>
      <div style={{ fontSize: '26px', fontWeight: '700', color: '#222', lineHeight: 1 }}>{value ?? '—'}</div>
      <div style={{ fontSize: '10px', color: '#aaa', minHeight: '14px', lineHeight: 1.4 }}>{sub || ''}</div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h3 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: '600', color: '#333' }}>{children}</h3>
  );
}

function MultiSelectDropdown({
  label, options = [], values = [], onChange, placeholder = 'All', width = 170,
  searchable = false, searchPlaceholder = 'Search…',
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef(null);
  const selectedValues = Array.isArray(values) ? values : [];
  const selectedCount = selectedValues.length;

  const filteredOptions = useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((opt) =>
      String(opt.label || opt.value || '').toLowerCase().includes(q)
    );
  }, [options, search, searchable]);

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  const toggleValue = (value) => {
    onChange(selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value]);
  };

  useEffect(() => {
    if (open && searchable) {
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open, searchable]);

  return (
    <div style={{ width, minWidth: width, position: 'relative' }}>
      {label && <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>{label}</label>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: '8px',
          border: `1px solid ${open ? '#FF5722' : '#e0e0e0'}`, background: '#fff', fontSize: '11px',
          cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px',
          color: selectedCount ? '#FF5722' : '#555', fontWeight: selectedCount ? '600' : '400',
        }}
      >
        <span>{selectedCount ? `${selectedCount} selected` : placeholder}</span>
        <span style={{ fontSize: '8px', opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 70 }}
            onClick={close}
            aria-hidden
          />
          <div style={{
            position: 'absolute', zIndex: 80, left: 0, top: 'calc(100% + 4px)', minWidth: '100%',
            width: 'max-content', maxWidth: '280px', maxHeight: '260px', display: 'flex', flexDirection: 'column',
            border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff', padding: '6px 4px',
            boxShadow: '0 6px 18px rgba(0,0,0,0.1)',
          }}>
            {searchable && (
              <div style={{ padding: '2px 4px 6px', flexShrink: 0 }}>
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder={searchPlaceholder}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '6px',
                    border: '1px solid #e0e0e0', fontSize: '10px', outline: 'none',
                  }}
                />
              </div>
            )}
            <div style={{ overflow: 'auto', maxHeight: searchable ? '200px' : '220px' }}>
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '5px 10px', fontSize: '10px', color: '#FF5722', cursor: 'pointer',
                  fontWeight: '600', marginBottom: '2px',
                  background: 'transparent', border: 'none', borderBottom: '1px solid #f5f5f5',
                }}
              >
                Clear selection
              </button>
            )}
            {options.length === 0 ? (
              <div style={{ padding: '8px 10px', fontSize: '10px', color: '#aaa' }}>No options available</div>
            ) : filteredOptions.length === 0 ? (
              <div style={{ padding: '8px 10px', fontSize: '10px', color: '#aaa' }}>No matches</div>
            ) : filteredOptions.map((opt) => {
              const isSelected = selectedValues.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', fontSize: '10px',
                    cursor: 'pointer', borderRadius: '5px',
                    background: isSelected ? '#FFF4F0' : 'transparent',
                    color: isSelected ? '#FF5722' : '#333', fontWeight: isSelected ? '600' : '400',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleValue(opt.value)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ accentColor: '#FF5722' }}
                  />
                  {opt.label}
                </label>
              );
            })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SlotToggleButtons({ values = [], onChange }) {
  const toggle = (slot) => {
    onChange(values.includes(slot) ? values.filter((s) => s !== slot) : [...values, slot]);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <label style={{ display: 'block', fontSize: '10px', color: '#666' }}>Slot</label>
      <div style={{ display: 'flex', gap: '6px' }}>
        {SLOT_OPTIONS.map((slot) => {
          const on = values.includes(slot);
          return (
            <button
              key={slot}
              type="button"
              onClick={() => toggle(slot)}
              style={{
                padding: '8px 12px', borderRadius: '8px', border: '1px solid #e0e0e0',
                background: on ? '#FF5722' : '#fff', color: on ? '#fff' : '#333',
                fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {slot.replace('SLOT ', 'Slot ')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function OperationsDashboard() {
  const { authFetch } = useAuth();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');
  const firstLoad = useRef(true);

  const [dayFilter, setDayFilter] = useState('Day 1');
  const [filterAreas, setFilterAreas] = useState([]);
  const [filterOrderTypes, setFilterOrderTypes] = useState([]);
  const [filterSlots, setFilterSlots] = useState([]);
  const [filterStatuses, setFilterStatuses] = useState(['Delivered']);

  const load = useCallback(async () => {
    setErr('');
    const isInitial = firstLoad.current;
    if (isInitial) setLoading(true);
    else setRefreshing(true);
    try {
      const qs = new URLSearchParams();
      if (dayFilter) qs.set('day', dayFilter);
      filterAreas.forEach((a) => qs.append('area', a));
      filterOrderTypes.forEach((t) => qs.append('order_type', t));
      filterSlots.forEach((s) => qs.append('slot', s));
      filterStatuses.forEach((s) => qs.append('delivery_status', s));

      const res = await authFetch(
        `${API_BASE}/operations/dashboard/stats${qs.toString() ? `?${qs}` : ''}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to load stats');
      setStats(data);
    } catch (e) {
      setErr(e.message || 'Load failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
      firstLoad.current = false;
    }
  }, [authFetch, dayFilter, filterAreas, filterOrderTypes, filterSlots, filterStatuses]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = getOperationsSocket();
    const refresh = () => load();
    socket.on('operations:changed', refresh);
    socket.on('challans:changed', refresh);
    socket.on('riders:changed', refresh);
    return () => {
      socket.off('operations:changed', refresh);
      socket.off('challans:changed', refresh);
      socket.off('riders:changed', refresh);
    };
  }, [load]);

  const s = stats || {};
  const areas = s.areas || [];
  const riderSummary = s.rider_summary || [];
  const slaughter = s.slaughter || {};
  const packing = s.packing || {};
  const targetData = s.target_achievement || {};

  const areaOptions = useMemo(
    () => (s.areas_list || []).map((a) => ({ value: a, label: a })),
    [s.areas_list]
  );

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .od-root { padding: 16px 12px 24px !important; overflow: auto !important; }
          .od-stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .od-stat-grid-centered { grid-template-columns: repeat(2, 1fr) !important; }
          .od-stat-grid-centered .od-stat-card-wrap { grid-column: auto !important; }
          .od-filters-row { flex-direction: column !important; align-items: stretch !important; }
          .od-area-table { font-size: 10px !important; }
          .od-rider-grid { grid-template-columns: 1fr !important; }
          .ops-target-grid { grid-template-columns: 1fr !important; }
        }
        .ops-target-card { background:#fff; border:1px solid #f1f1f1; border-radius:10px; padding:14px; margin-bottom:24px; box-shadow:0 2px 8px rgba(0,0,0,0.04); }
        .ops-target-title { text-align:center; font-size:13px; font-weight:600; color:#333; margin-bottom:12px; cursor:pointer; user-select:none; }
        .ops-target-chevron { font-size:10px; margin-left:6px; color:#999; }
        .ops-status-filters { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:8px; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid #f0f0f0; }
        .ops-status-filters-label { font-size:10px; color:#666; font-weight:600; }
        .ops-status-chip { display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border-radius:999px; border:1px solid #e0e0e0; font-size:10px; cursor:pointer; background:#fff; color:#555; }
        .ops-status-chip-on { border-color:#FF5722; background:#FFF4F0; color:#FF5722; font-weight:600; }
        .ops-status-chip input { accent-color:#FF5722; }
        .ops-target-grid { display:grid; grid-template-columns:240px 1fr; gap:16px; align-items:center; }
        .ops-donut-wrap { display:flex; justify-content:center; }
        .ops-donut-center { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; pointer-events:none; }
        .ops-donut-small { font-size:11px; color:#374151; }
        .ops-donut-big { font-size:26px; font-weight:600; color:#1f2937; }
        .ops-donut-big-bold { font-size:32px; font-weight:700; }
        .ops-donut-sub { font-size:11px; color:#b91c1c; font-style:italic; }
        .ops-progress-wrap { display:flex; flex-direction:column; gap:10px; }
        .ops-target-row-shell { display:flex; align-items:stretch; gap:8px; }
        .ops-target-expand-spacer { width:24px; min-width:24px; display:inline-block; }
        .ops-target-expand {
          width:24px; min-width:24px; border:1px solid #e5e7eb; border-radius:6px;
          background:#fff; color:#6b7280; cursor:pointer; align-self:center;
          transition:all .15s ease; font-size:10px; padding:0;
        }
        .ops-target-expand:hover { background:#fff4f0; border-color:#FF5722; color:#FF5722; }
        .ops-target-expand-open { transform:rotate(90deg); }
        .ops-target-child { margin-left:32px; }
        .ops-progress-row { flex:1; cursor:pointer; padding:6px 8px; border-radius:8px; border:1px solid transparent; transition:background .15s; }
        .ops-progress-row-active { background:#fafafa; border-color:#e5e7eb; }
        .ops-progress-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-size:11px; }
        .ops-progress-label { display:flex; align-items:center; gap:6px; color:#374151; font-weight:500; }
        .ops-progress-dot { width:8px; height:8px; border-radius:50%; }
        .ops-progress-val { font-weight:600; color:#111827; }
        .ops-progress-pct { font-weight:400; color:#9ca3af; }
        .ops-progress-track { height:6px; background:#eee; border-radius:3px; overflow:hidden; }
        .ops-progress-fill { height:100%; border-radius:3px; transition:width .4s ease; }
        .od-stat-grid { align-items: stretch; }
        .od-stat-grid-centered { align-items: stretch; }
        .od-stat-card-wrap { min-height: 0; height: 100%; display: flex; }
        .od-stat-card-wrap .od-stat-card { flex: 1; }
      `}</style>

      <div className="od-root" style={{
        padding: '19px', fontFamily: "'Poppins','Inter',sans-serif",
        display: 'flex', flexDirection: 'column', minHeight: 0,
        height: '100%', overflow: 'hidden', boxSizing: 'border-box',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: '20px',
          flexWrap: 'wrap', gap: '12px', flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>
              Operations Dashboard
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#888', fontWeight: '500', lineHeight: 1.45 }}>
              Live delivery overview for the current operation.
              {refreshing && <span style={{ marginLeft: '8px', color: '#FF5722' }}>Updating…</span>}
            </p>
          </div>
          <button type="button" onClick={load} style={{
            padding: '7px 13px', background: '#fff', color: '#555',
            border: '1px solid #e0e0e0', borderRadius: '6px',
            fontSize: '11px', fontWeight: '600', cursor: 'pointer',
          }}>Refresh</button>
        </div>

        <div style={{ borderTop: '1px solid #e6e6e6', marginBottom: '12px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', width: '100%', gap: '8px', marginBottom: '12px' }}>
          {DAY_OPTIONS.map((d) => (
            <button key={d} type="button" onClick={() => setDayFilter(d)} style={{
              width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid #e0e0e0',
              background: dayFilter === d ? '#FF5722' : '#fff', color: dayFilter === d ? '#fff' : '#333', fontWeight: 600,
            }}>{d}</button>
          ))}
        </div>

        <div className="od-filters-row" style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          gap: '12px', marginBottom: '20px', flexShrink: 0, width: '100%', flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <MultiSelectDropdown
              label="Area / Zone"
              options={areaOptions}
              values={filterAreas}
              onChange={setFilterAreas}
              placeholder="All areas"
              width={200}
              searchable
              searchPlaceholder="Search areas…"
            />
            <MultiSelectDropdown label="Order type" options={ORDER_TYPE_OPTIONS} values={filterOrderTypes} onChange={setFilterOrderTypes} placeholder="All types" width={220} />
          </div>
          <SlotToggleButtons values={filterSlots} onChange={setFilterSlots} />
        </div>

        {err && (
          <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', flexShrink: 0, fontSize: '10px', fontWeight: '600' }}>
            {err}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', opacity: refreshing ? 0.85 : 1, transition: 'opacity .15s' }}>
          {loading && !stats ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading…</div>
          ) : (
            <>
              <div className="od-stat-grid" style={{
                display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                width: '100%', gap: '12px', marginBottom: '12px', alignItems: 'stretch',
              }}>
                <StatCard label="Total Hissa" value={s.total_hissas} accent="#607D8B" />
                <StatCard label="Pending" value={s.pending} accent="#F57C00" />
                <StatCard label="Rider Assigned" value={s.rider_assigned} accent="#1565C0" />
                <StatCard label="Dispatched" value={s.in_transit} accent="#4527A0" />
                <StatCard label="Delivered" value={s.delivered} accent="#2E7D32" sub={pct(s.delivered, s.total_hissas) + ' complete'} />
                <StatCard label="Returned to Farm" value={s.returned} accent="#C62828" />
              </div>

              <OperationsTargetSection
                achieved={Number(targetData.achieved || 0)}
                target={Number(targetData.target || 2000)}
                breakdown={targetData.breakdown || []}
                statusOptions={DELIVERY_STATUSES}
                selectedStatuses={filterStatuses}
                onStatusChange={setFilterStatuses}
              />

              <div className="od-stat-grid od-stat-grid-centered" style={{
                display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                width: '100%', gap: '12px', marginBottom: '24px', alignItems: 'stretch',
              }}>
                <div className="od-stat-card-wrap" style={{ gridColumn: 2 }}>
                  <StatCard label="Total Cows Slaughtered" value={slaughter.cows_slaughtered} accent="#795548" />
                </div>
                <div className="od-stat-card-wrap" style={{ gridColumn: 3 }}>
                  <StatCard label="Total Goats Slaughtered" value={slaughter.goats_slaughtered} accent="#8D6E63" />
                </div>
                <div className="od-stat-card-wrap" style={{ gridColumn: 4 }}>
                  <StatCard label="Total Hissa Packed" value={packing.hissa_packed} accent="#009688" />
                </div>
                <div className="od-stat-card-wrap" style={{ gridColumn: 5 }}>
                  <StatCard label="Total Goats Packed" value={packing.goats_packed} accent="#00796B" />
                </div>
              </div>

              {areas.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <SectionTitle>Area-wise Delivery Breakdown</SectionTitle>
                  <div className="od-area-table" style={{ border: '1px solid #ececec', borderRadius: '10px', overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                      <thead>
                        <tr style={{ background: '#fafafa' }}>
                          {['Area', 'Total', 'Delivered', 'Pending', 'In Transit', 'Returned', 'Completion'].map((h) => (
                            <th key={h} style={{ textAlign: 'left', padding: '9px 12px', borderBottom: '1px solid #e0e0e0', color: '#555', fontWeight: '600', fontSize: '10px', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {areas.map((a, idx) => (
                          <tr key={a.area || idx} style={{ borderBottom: '1px solid #f3f3f3', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ padding: '9px 12px', fontWeight: '500', color: '#333' }}>{a.area || 'Unknown'}</td>
                            <td style={{ padding: '9px 12px', color: '#555' }}>{a.total}</td>
                            <td style={{ padding: '9px 12px', color: '#2E7D32', fontWeight: '600' }}>{a.delivered}</td>
                            <td style={{ padding: '9px 12px', color: '#F57C00' }}>{a.pending}</td>
                            <td style={{ padding: '9px 12px', color: '#4527A0' }}>{a.in_transit}</td>
                            <td style={{ padding: '9px 12px', color: '#C62828' }}>{a.returned}</td>
                            <td style={{ padding: '9px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ flex: 1, height: '6px', background: '#eee', borderRadius: '3px', overflow: 'hidden', minWidth: '60px' }}>
                                  <div style={{ height: '100%', background: '#2E7D32', width: pct(a.delivered, a.total), borderRadius: '3px' }} />
                                </div>
                                <span style={{ fontSize: '10px', color: '#555', whiteSpace: 'nowrap' }}>{pct(a.delivered, a.total)}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {riderSummary.length > 0 && (
                <div>
                  <SectionTitle>Rider Summary</SectionTitle>
                  <div className="od-rider-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '10px',
                  }}>
                    {riderSummary.map((r) => (
                      <div key={r.rider_id} style={{
                        background: '#fff', border: '1px solid #e8e8e8',
                        borderRadius: '10px', padding: '12px 14px',
                        display: 'flex', alignItems: 'center', gap: '12px',
                      }}>
                        <div style={{
                          width: '36px', height: '36px', borderRadius: '50%',
                          background: '#FBE9E7', color: '#FF5722',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '13px', fontWeight: '700', flexShrink: 0,
                        }}>
                          {(r.rider_name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.rider_name}
                          </div>
                          <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                            {r.availability || 'Available'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '14px', flexShrink: 0 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: '#2E7D32' }}>{r.delivered}</div>
                            <div style={{ fontSize: '9px', color: '#aaa' }}>Done</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: '#F57C00' }}>{r.pending}</div>
                            <div style={{ fontSize: '9px', color: '#aaa' }}>Left</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
