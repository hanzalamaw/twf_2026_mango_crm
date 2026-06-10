import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Filter dropdown: pick a rider by id, with search on name / contact / vehicle / plate.
 */
export default function SearchableRiderFilter({ value, onChange, riders = [], inputStyle, width = 180 }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState(null);
  const containerRef = useRef(null);

  const selected = riders.find((r) => String(r.rider_id) === String(value));
  const label = selected
    ? [selected.rider_name, selected.contact, selected.vehicle].filter(Boolean).join(' · ')
    : 'All';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
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
    const menuWidth = Math.min(Math.max(rect.width, 220), 360);
    const menuHeight = 260;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - menuWidth - 8);
    const top = Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 8);
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
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target) && !e.target.closest?.('[data-rider-filter-menu="true"]')) {
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

  const baseInput = inputStyle || { width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px', background: '#fff' };

  return (
    <div ref={containerRef} style={{ width, minWidth: width, position: 'relative' }}>
      <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Rider</label>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setQuery(''); }}
        style={{
          ...baseInput,
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          fontWeight: value ? 600 : 400,
          color: value ? '#333' : '#555',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{label}</span>
        <span style={{ fontSize: '8px', opacity: 0.5, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && menuStyle && (
        <div data-rider-filter-menu="true" style={menuStyle}>
          <div style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
            <input
              autoFocus
              type="text"
              placeholder="Search name, contact, vehicle…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}
            />
          </div>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            <div
              role="option"
              onMouseDown={(e) => { e.preventDefault(); onChange(''); setOpen(false); setQuery(''); }}
              style={{ padding: '8px 12px', fontSize: '11px', cursor: 'pointer', background: !value ? '#FFF4F0' : 'transparent', fontWeight: 600 }}
            >
              All
            </div>
            {filtered.map((r) => (
              <div
                key={r.rider_id}
                role="option"
                onMouseDown={(e) => { e.preventDefault(); onChange(String(r.rider_id)); setOpen(false); setQuery(''); }}
                style={{
                  padding: '8px 12px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  borderTop: '1px solid #f5f5f5',
                  background: String(r.rider_id) === String(value) ? '#FFF4F0' : 'transparent',
                }}
              >
                <div style={{ fontWeight: 600 }}>{r.rider_name}</div>
                <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>{[r.contact, r.vehicle, r.number_plate].filter(Boolean).join(' · ')}</div>
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding: '12px', fontSize: '11px', color: '#999', textAlign: 'center' }}>No riders match</div>}
          </div>
        </div>
      )}
    </div>
  );
}
