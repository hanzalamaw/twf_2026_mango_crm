import { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { API_BASE as API } from '../config/api';
import { LINE_ANIMAL_TYPES, LINE_DAYS, animalTypeLabel, animalTypeMultiplier, dayLabel } from '../utils/lineTypes';

const COLUMNS = [
  { key: 'record_id', label: 'ID' },
  { key: 'day', label: 'Day' },
  { key: 'group_name', label: 'Line Group' },
  { key: 'animal_type', label: 'Type' },
  { key: 'animal_number', label: 'Number' },
  { key: 'units', label: 'Units' },
  { key: 'recorded_time', label: 'Time' },
];

const PAGE_SIZE = 50;

function formatTime(val) {
  if (val == null || val === '') return '—';
  const s = String(val);
  if (s.includes('T')) {
    const [d, t] = s.split('T');
    return `${d} ${(t || '').slice(0, 5)}`;
  }
  return s;
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export default function LineManagement() {
  const token = localStorage.getItem('token');
  const [rows, setRows] = useState([]);
  const [filterGroups, setFilterGroups] = useState([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchInputRef = useRef(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const resetFilters = () => {
    setDayFilter('');
    setTypeFilter('');
    setGroupFilter('');
    setSearchQuery('');
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchFilters = useCallback(async () => {
    try {
      const res = await fetch(`${API}/operations/line/filters`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFilterGroups(Array.isArray(data.groups) ? data.groups : []);
      }
    } catch { /* ignore */ }
  }, [token]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (dayFilter) params.set('day', dayFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (groupFilter) params.set('group_id', groupFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await fetch(`${API}/operations/line/records-list?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRows(Array.isArray(data.data) ? data.data : []);
        setTotalCount(typeof data.total === 'number' ? data.total : 0);
      } else {
        setError('Failed to load records');
      }
    } catch {
      setError('Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [token, page, dayFilter, typeFilter, groupFilter, debouncedSearch]);

  useEffect(() => { fetchFilters(); }, [fetchFilters]);
  useEffect(() => { setPage(1); }, [dayFilter, typeFilter, groupFilter, debouncedSearch]);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const exportExcel = async () => {
    const all = [];
    let p = 1;
    let total = 0;
    do {
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('limit', '200');
      if (dayFilter) params.set('day', dayFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (groupFilter) params.set('group_id', groupFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await fetch(`${API}/operations/line/records-list?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) break;
      const data = await res.json();
      const chunk = Array.isArray(data.data) ? data.data : [];
      all.push(...chunk);
      total = data.total ?? 0;
      p += 1;
    } while (all.length < total && p <= 50);

    const header = COLUMNS.map((c) => c.label);
    const body = all.map((r) => [
      r.record_id,
      dayLabel(r.day),
      r.group_name,
      animalTypeLabel(r.animal_type),
      r.animal_number,
      r.units ?? animalTypeMultiplier(r.animal_type),
      formatTime(r.recorded_time),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Line');
    XLSX.writeFile(wb, `line-records-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const cellValue = (r, key) => {
    if (key === 'day') return dayLabel(r.day);
    if (key === 'animal_type') return animalTypeLabel(r.animal_type);
    if (key === 'units') return r.units ?? animalTypeMultiplier(r.animal_type);
    if (key === 'recorded_time') return formatTime(r.recorded_time);
    return r[key] ?? '—';
  };

  return (
    <div className="lnm-root">
      <style>{`
        .lnm-root { padding: 16px 20px 32px; font-family: 'Plus Jakarta Sans', 'Poppins', sans-serif; }
        .lnm-head { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 16px; }
        .lnm-head h1 { margin: 0; font-size: 20px; font-weight: 700; flex: 1; min-width: 160px; }
        .lnm-filters { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; align-items: center; }
        .lnm-filters select, .lnm-search-wrap input { padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; }
        .lnm-search-wrap { display: flex; align-items: center; gap: 8px; border: 1px solid #ddd; border-radius: 8px; padding: 0 10px; background: #fff; flex: 1; min-width: 180px; max-width: 320px; }
        .lnm-search-wrap input { border: none; flex: 1; padding: 8px 0; outline: none; }
        .lnm-export { padding: 8px 14px; background: #C62828; color: #fff; border: none; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; }
        .lnm-table-wrap { overflow-x: auto; background: #fff; border-radius: 12px; border: 1px solid #eee; }
        .lnm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .lnm-table th, .lnm-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #f0f0f0; }
        .lnm-table th { background: #fafafa; font-weight: 600; color: #555; font-size: 11px; text-transform: uppercase; }
        .lnm-empty { padding: 32px; text-align: center; color: #888; }
        .lnm-error { background: #FFEBEE; color: #C62828; padding: 10px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; }
        .lnm-pager { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; font-size: 13px; color: #666; }
        .lnm-pager button { padding: 6px 12px; border: 1px solid #ddd; border-radius: 6px; background: #fff; cursor: pointer; margin-left: 6px; }
        .lnm-pager button:disabled { opacity: 0.4; cursor: not-allowed; }
        @media (max-width: 767px) {
          .lnm-root { padding: 16px 12px 24px !important; }
          .lnm-head { flex-direction: column; align-items: stretch; }
          .lnm-head h1 { font-size: 18px; }
          .lnm-export { width: 100%; }
          .lnm-filter-desktop { display: none !important; }
          .lnm-filter-toggle { display: flex !important; }
          .lnm-filter-mobile { display: block !important; }
          .lnm-table { font-size: 12px; }
          .lnm-table th, .lnm-table td { padding: 8px; }
          .lnm-pager { flex-direction: column; gap: 10px; align-items: stretch; }
          .lnm-pager > div { display: flex; justify-content: center; }
        }
      `}</style>

      <div className="lnm-head">
        <h1>Line Management</h1>
        <button type="button" className="lnm-export" onClick={exportExcel}>Export Excel</button>
      </div>

      <div className="lnm-filter-desktop lnm-filters">
        <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} aria-label="Day filter">
          <option value="">All days</option>
          {LINE_DAYS.map((d) => (
            <option key={d.value} value={String(d.value)}>{d.label}</option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Type filter">
          <option value="">All types</option>
          {LINE_ANIMAL_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} aria-label="Group filter">
          <option value="">All line groups</option>
          {filterGroups.map((g) => (
            <option key={`${g.group_id}-${g.day}`} value={String(g.group_id)}>
              {g.group_name} ({dayLabel(g.day)})
            </option>
          ))}
        </select>
        <div className="lnm-search-wrap">
          <SearchIcon />
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Search group, number, ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="lnm-filter-toggle ops-filter-toggle" style={{ display: 'none' }}>
        <div className="lnm-search-wrap ops-filter-search-wrap" style={{ flex: 1, minWidth: 0, maxWidth: 'none' }}>
          <SearchIcon />
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Search group, number, ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ fontSize: '13px' }}
          />
        </div>
        <button
          type="button"
          className={`ops-filter-toggle-btn${mobileFiltersOpen ? ' is-open' : ''}`}
          onClick={() => setMobileFiltersOpen((v) => !v)}
        >
          Filters
        </button>
      </div>
      <div className="lnm-filter-mobile" style={{ display: 'none' }}>
        {mobileFiltersOpen && (
          <div className="ops-filter-mobile-panel">
            <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} aria-label="Day filter" className="ops-filter-select">
              <option value="">All days</option>
              {LINE_DAYS.map((d) => (
                <option key={d.value} value={String(d.value)}>{d.label}</option>
              ))}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Type filter" className="ops-filter-select">
              <option value="">All types</option>
              {LINE_ANIMAL_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} aria-label="Group filter" className="ops-filter-select">
              <option value="">All line groups</option>
              {filterGroups.map((g) => (
                <option key={`${g.group_id}-${g.day}`} value={String(g.group_id)}>
                  {g.group_name} ({dayLabel(g.day)})
                </option>
              ))}
            </select>
            <div className="ops-filter-mobile-actions">
              <button type="button" className="ops-filter-mobile-done" onClick={() => setMobileFiltersOpen(false)}>Done</button>
              <button type="button" className="ops-filter-mobile-reset" onClick={() => { resetFilters(); setMobileFiltersOpen(false); }}>Reset</button>
            </div>
          </div>
        )}
      </div>

      {error && <div className="lnm-error">{error}</div>}

      <div className="lnm-table-wrap">
        {loading ? (
          <div className="lnm-empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="lnm-empty">No records match your filters.</div>
        ) : (
          <table className="lnm-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.record_id}>
                  {COLUMNS.map((c) => (
                    <td key={c.key}>{cellValue(r, c.key)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="lnm-pager">
        <span>
          {totalCount === 0 ? '0 records' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalCount)} of ${totalCount}`}
        </span>
        <div>
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}


