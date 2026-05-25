import { useCallback, useEffect, useState } from 'react';
import { API_BASE as API } from '../config/api';
import { SLAUGHTER_ANIMAL_TYPES, SLAUGHTER_DAYS, animalTypeLabel } from '../utils/slaughterTypes';

function nowLocalInput() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTime12Hour(val) {
  if (!val) return '—';
  const s = String(val);
  const iso = s.includes('T') ? s : s.replace(' ', 'T');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function statPair(group, typeKey) {
  const raw = group.stats?.[typeKey];
  if (raw && typeof raw === 'object') {
    return { start: Number(raw.start) || 0, end: Number(raw.end) || 0 };
  }
  const n = Number(raw) || 0;
  return { start: n, end: n };
}

export default function SlaughterDashboard() {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [day, setDay] = useState(1);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [groupModal, setGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);

  const [addModal, setAddModal] = useState(null);
  const [addType, setAddType] = useState('premium_cow');
  const [addNumber, setAddNumber] = useState('');
  const [addTime, setAddTime] = useState(nowLocalInput());
  const [savingSlaughter, setSavingSlaughter] = useState(false);
  const [addError, setAddError] = useState('');

  const [endModal, setEndModal] = useState(null);
  const [endType, setEndType] = useState('premium_cow');
  const [endNumber, setEndNumber] = useState('');
  const [endTime, setEndTime] = useState(nowLocalInput());
  const [savingEnd, setSavingEnd] = useState(false);
  const [endError, setEndError] = useState('');

  const [listModal, setListModal] = useState(null);
  const [listRows, setListRows] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editType, setEditType] = useState('premium_cow');
  const [editNumber, setEditNumber] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  const [viewModal, setViewModal] = useState(null);
  const [viewTypeFilter, setViewTypeFilter] = useState('');
  const [viewRows, setViewRows] = useState([]);
  const [viewLoading, setViewLoading] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/operations/slaughter/dashboard?day=${day}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        setError('Failed to load dashboard');
        return;
      }
      const data = await res.json();
      setGroups(Array.isArray(data.groups) ? data.groups : []);
    } catch {
      setError('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [token, day]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const fetchNextNumber = async (type) => {
    try {
      const res = await fetch(`${API}/operations/slaughter/next-number?day=${day}&type=${encodeURIComponent(type)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAddNumber(data.animal_number || '');
      }
    } catch { /* ignore */ }
  };

  const fetchPendingNumber = async (group, type) => {
    try {
      const res = await fetch(
        `${API}/operations/slaughter/pending-number?day=${day}&group_id=${group.group_id}&type=${encodeURIComponent(type)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setEndNumber(data.animal_number || '');
      }
    } catch { /* ignore */ }
  };

  const openAddSlaughter = async (group) => {
    setAddModal(group);
    setAddType('premium_cow');
    setAddTime(nowLocalInput());
    setAddNumber('');
    setAddError('');
    await fetchNextNumber('premium_cow');
  };

  const onAddTypeChange = async (type) => {
    setAddType(type);
    setAddError('');
    await fetchNextNumber(type);
  };

  const openEndSlaughter = async (group) => {
    setEndModal(group);
    setEndType('premium_cow');
    setEndTime(nowLocalInput());
    setEndError('');
    await fetchPendingNumber(group, 'premium_cow');
  };

  const onEndTypeChange = async (type) => {
    setEndType(type);
    setEndError('');
    if (endModal) await fetchPendingNumber(endModal, type);
  };

  const submitGroup = async () => {
    const name = groupName.trim();
    if (!name) return;
    setSavingGroup(true);
    try {
      const res = await fetch(`${API}/operations/slaughter/groups`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ group_name: name, day }),
      });
      if (res.ok) {
        setGroupModal(false);
        setGroupName('');
        fetchDashboard();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || 'Could not create group');
      }
    } catch {
      setError('Could not create group');
    } finally {
      setSavingGroup(false);
    }
  };

  const submitSlaughter = async () => {
    if (!addModal) return;
    setSavingSlaughter(true);
    setAddError('');
    try {
      const res = await fetch(`${API}/operations/slaughter/slaughters`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          day,
          group_id: addModal.group_id,
          animal_type: addType,
          animal_number: addNumber.trim() || undefined,
          slaughter_time: addTime,
        }),
      });
      if (res.ok) {
        setAddModal(null);
        fetchDashboard();
      } else {
        const data = await res.json().catch(() => ({}));
        const msg = data.message || 'Could not add slaughter';
        if (res.status === 409) setAddError(msg);
        else setError(msg);
      }
    } catch {
      setAddError('Could not add slaughter');
    } finally {
      setSavingSlaughter(false);
    }
  };

  const submitEndSlaughter = async () => {
    if (!endModal) return;
    setSavingEnd(true);
    setEndError('');
    try {
      const res = await fetch(`${API}/operations/slaughter/slaughters/end`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          day,
          group_id: endModal.group_id,
          animal_type: endType,
          animal_number: endNumber.trim() || undefined,
          slaughter_end_time: endTime,
        }),
      });
      if (res.ok) {
        setEndModal(null);
        fetchDashboard();
      } else {
        const data = await res.json().catch(() => ({}));
        const msg = data.message || 'Could not record slaughter end';
        if (res.status === 409 || res.status === 404) setEndError(msg);
        else setError(msg);
      }
    } catch {
      setEndError('Could not record slaughter end');
    } finally {
      setSavingEnd(false);
    }
  };

  const openListModal = async (group) => {
    setListModal(group);
    setEditRow(null);
    setListLoading(true);
    try {
      const res = await fetch(
        `${API}/operations/slaughter/groups/${group.group_id}/slaughters?day=${day}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setListRows(Array.isArray(data.slaughters) ? data.slaughters : []);
      } else setListRows([]);
    } catch {
      setListRows([]);
    } finally {
      setListLoading(false);
    }
  };

  const fetchViewRows = useCallback(async () => {
    if (!viewModal) return;
    setViewLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('day', String(day));
      params.set('group_id', String(viewModal.group_id));
      params.set('limit', '200');
      if (viewTypeFilter) params.set('type', viewTypeFilter);
      const res = await fetch(`${API}/operations/slaughter/records?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setViewRows(Array.isArray(data.data) ? data.data : []);
      } else setViewRows([]);
    } catch {
      setViewRows([]);
    } finally {
      setViewLoading(false);
    }
  }, [token, day, viewModal, viewTypeFilter]);

  useEffect(() => {
    if (viewModal) fetchViewRows();
  }, [viewModal, fetchViewRows]);

  const openViewModal = (group) => {
    setViewModal(group);
    setViewTypeFilter('');
  };

  const startEdit = (row) => {
    setEditRow(row);
    setEditType(row.animal_type);
    setEditNumber(row.animal_number);
    setEditTime(row.slaughter_time ? String(row.slaughter_time).slice(0, 16) : nowLocalInput());
    setEditEndTime(row.slaughter_end_time ? String(row.slaughter_end_time).slice(0, 16) : '');
    setEditError('');
  };

  const saveEdit = async () => {
    if (!editRow) return;
    setSavingEdit(true);
    setEditError('');
    try {
      const res = await fetch(`${API}/operations/slaughter/slaughters/${editRow.slaughter_id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          animal_type: editType,
          animal_number: editNumber.trim(),
          slaughter_time: editTime,
          slaughter_end_time: editEndTime || null,
        }),
      });
      if (res.ok) {
        setEditRow(null);
        openListModal(listModal);
        fetchDashboard();
      } else {
        const data = await res.json().catch(() => ({}));
        setEditError(data.message || 'Could not save changes');
      }
    } catch {
      setEditError('Could not save changes');
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteSlaughter = async (id) => {
    if (!window.confirm('Delete this slaughter record?')) return;
    try {
      const res = await fetch(`${API}/operations/slaughter/slaughters/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        openListModal(listModal);
        fetchDashboard();
      }
    } catch { /* ignore */ }
  };

  return (
    <div className="sl-root">
      <style>{`
        .sl-root { padding: 16px 20px 32px; font-family: 'Plus Jakarta Sans', 'Poppins', sans-serif; max-width: 1200px; margin: 0 auto; }
        .sl-toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 20px; }
        .sl-day-tabs { display: flex; gap: 8px; }
        .sl-day-btn { padding: 8px 16px; border-radius: 8px; border: 1px solid #ddd; background: #fff; cursor: pointer; font-size: 13px; font-weight: 600; }
        .sl-day-btn.active { background: #C62828; color: #fff; border-color: #C62828; }
        .sl-add-group { margin-left: auto; padding: 10px 18px; background: #C62828; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px; }
        .sl-add-group:hover { background: #B71C1C; }
        .sl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
        .sl-card { background: #fff; border-radius: 12px; border: 1px solid #eee; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
        .sl-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
        .sl-card-title { font-size: 16px; font-weight: 700; color: #222; margin: 0; flex: 1; min-width: 0; background: none; border: none; padding: 0; padding-right: 4px; text-align: left; cursor: pointer; line-height: 1.3; }
        .sl-card-title:hover { color: #C62828; text-decoration: underline; }
        .sl-edit-btn { padding: 5px 12px; border-radius: 6px; border: 1px solid #ddd; background: #fff; font-size: 11px; font-weight: 600; cursor: pointer; color: #555; flex-shrink: 0; margin-left: auto; }
        .sl-edit-btn:hover { border-color: #C62828; color: #C62828; }
        .sl-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; margin-bottom: 14px; }
        .sl-stat { font-size: 12px; color: #555; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .sl-stat strong { color: #C62828; white-space: nowrap; text-align: right; }
        .sl-stat-sub { font-size: 10px; color: #999; font-weight: 500; }
        .sl-card-actions { display: flex; flex-wrap: wrap; gap: 6px; }
        .sl-btn { flex: 1; min-width: 0; padding: 8px 6px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; border: 1px solid #ddd; background: #fff; }
        .sl-btn-primary { background: #FFEBEE; border-color: #EF9A9A; color: #C62828; }
        .sl-btn-end { background: #E8F5E9; border-color: #A5D6A7; color: #2E7D32; }
        .sl-empty { text-align: center; padding: 48px 20px; color: #888; font-size: 14px; }
        .sl-error { background: #FFEBEE; color: #C62828; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
        .sl-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
        .sl-modal { background: #fff; border-radius: 12px; width: 100%; max-width: 420px; max-height: 90vh; overflow-y: auto; padding: 20px; }
        .sl-modal-wide { max-width: 720px; }
        .sl-modal h3 { margin: 0 0 16px; font-size: 17px; }
        .sl-field { margin-bottom: 14px; }
        .sl-field label { display: block; font-size: 12px; color: #666; margin-bottom: 4px; font-weight: 600; }
        .sl-field input, .sl-field select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box; }
        .sl-modal-actions { display: flex; gap: 10px; margin-top: 18px; }
        .sl-modal-actions button { flex: 1; padding: 10px; border-radius: 8px; font-weight: 600; cursor: pointer; border: none; }
        .sl-confirm { background: #C62828; color: #fff; }
        .sl-confirm-green { background: #2E7D32; color: #fff; }
        .sl-cancel { background: #f0f0f0; color: #333; }
        .sl-modal-error { background: #FFEBEE; color: #C62828; padding: 8px 12px; border-radius: 8px; font-size: 12px; margin-bottom: 12px; }
        .sl-list-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
        .sl-list-row:last-child { border-bottom: none; }
        .sl-list-meta { color: #888; font-size: 11px; }
        .sl-list-btns { display: flex; gap: 6px; }
        .sl-list-btns button { padding: 4px 10px; font-size: 11px; border-radius: 6px; border: 1px solid #ddd; background: #fff; cursor: pointer; }
        .sl-view-filter { margin-bottom: 14px; }
        .sl-view-table-wrap { overflow-x: auto; border: 1px solid #eee; border-radius: 8px; }
        .sl-view-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .sl-view-table th, .sl-view-table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #f0f0f0; }
        .sl-view-table th { background: #fafafa; font-weight: 600; color: #555; font-size: 11px; }
        @media (max-width: 767px) {
          .sl-root { padding: 16px 12px 24px; }
          .sl-toolbar { flex-direction: column; align-items: stretch; }
          .sl-add-group { margin-left: 0; width: 100%; }
          .sl-day-tabs { flex-wrap: wrap; }
          .sl-day-btn { flex: 1; min-width: 0; text-align: center; }
          .sl-grid { grid-template-columns: 1fr; }
          .sl-card { padding: 14px; }
          .sl-card-title { font-size: 15px; }
          .sl-stats { grid-template-columns: 1fr; gap: 8px; }
          .sl-stat {
            padding: 10px 12px;
            background: #fafafa;
            border-radius: 8px;
            border: 1px solid #f0f0f0;
            font-size: 13px;
          }
          .sl-stat strong { font-size: 13px; }
          .sl-card-actions { flex-direction: column; }
          .sl-btn { flex: none; width: 100%; font-size: 12px; padding: 10px 12px; }
        }
      `}</style>

      <div className="sl-toolbar">
        <div className="sl-day-tabs">
          {SLAUGHTER_DAYS.map((d) => (
            <button
              key={d.value}
              type="button"
              className={`sl-day-btn${day === d.value ? ' active' : ''}`}
              onClick={() => setDay(d.value)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <button type="button" className="sl-add-group" onClick={() => { setGroupName(''); setGroupModal(true); }}>
          Add Qassai Group
        </button>
      </div>

      {error && <div className="sl-error">{error}</div>}

      {loading ? (
        <div className="sl-empty">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="sl-empty">No qassai groups for {SLAUGHTER_DAYS.find((d) => d.value === day)?.label}. Add one to get started.</div>
      ) : (
        <div className="sl-grid">
          {groups.map((g) => (
            <div key={g.group_id} className="sl-card">
              <div className="sl-card-head">
                <button type="button" className="sl-card-title" onClick={() => openViewModal(g)}>
                  {g.group_name}
                </button>
                <button type="button" className="sl-edit-btn" onClick={() => openListModal(g)}>Edit</button>
              </div>
              <div className="sl-stats">
                {SLAUGHTER_ANIMAL_TYPES.map((t) => {
                  const { start, end } = statPair(g, t.key);
                  return (
                    <div key={t.key} className="sl-stat">
                      <span>{t.label}</span>
                      <strong>
                        {start} <span className="sl-stat-sub">start</span>
                        {' / '}
                        {end} <span className="sl-stat-sub">end</span>
                      </strong>
                    </div>
                  );
                })}
              </div>
              <div className="sl-card-actions">
                <button type="button" className="sl-btn sl-btn-primary" onClick={() => openAddSlaughter(g)}>
                  + Slaughter Start
                </button>
                <button type="button" className="sl-btn sl-btn-end" onClick={() => openEndSlaughter(g)}>
                  + Slaughter End
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {groupModal && (
        <div className="sl-overlay ops-sheet-overlay" onClick={() => setGroupModal(false)} role="presentation">
          <div className="sl-modal ops-sheet-panel" onClick={(e) => e.stopPropagation()} role="dialog">
            <h3>Add Qassai Group</h3>
            <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>
              Group ID is assigned automatically. Creating for {SLAUGHTER_DAYS.find((d) => d.value === day)?.label}.
            </p>
            <div className="sl-field">
              <label>Group name</label>
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Qassai Team A" />
            </div>
            <div className="sl-modal-actions">
              <button type="button" className="sl-cancel" onClick={() => setGroupModal(false)}>Cancel</button>
              <button type="button" className="sl-confirm" disabled={savingGroup || !groupName.trim()} onClick={submitGroup}>
                {savingGroup ? 'Saving…' : 'Add group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {addModal && (
        <div className="sl-overlay ops-sheet-overlay" onClick={() => setAddModal(null)} role="presentation">
          <div className="sl-modal ops-sheet-panel" onClick={(e) => e.stopPropagation()} role="dialog">
            <h3>Slaughter Start — {addModal.group_name}</h3>
            <div className="sl-field">
              <label>Type</label>
              <select value={addType} onChange={(e) => onAddTypeChange(e.target.value)}>
                {SLAUGHTER_ANIMAL_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            {addError && <div className="sl-modal-error">{addError}</div>}
            <div className="sl-field">
              <label>Cow / goat number (editable)</label>
              <input
                value={addNumber}
                onChange={(e) => { setAddNumber(e.target.value); setAddError(''); }}
                placeholder="P1, S1, GE1, GS-1…"
              />
            </div>
            <div className="sl-field">
              <label>Start time</label>
              <input type="datetime-local" value={addTime} onChange={(e) => setAddTime(e.target.value)} />
            </div>
            <div className="sl-modal-actions">
              <button type="button" className="sl-cancel" onClick={() => setAddModal(null)}>Cancel</button>
              <button type="button" className="sl-confirm" disabled={savingSlaughter} onClick={submitSlaughter}>
                {savingSlaughter ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {endModal && (
        <div className="sl-overlay ops-sheet-overlay" onClick={() => setEndModal(null)} role="presentation">
          <div className="sl-modal ops-sheet-panel" onClick={(e) => e.stopPropagation()} role="dialog">
            <h3>Slaughter End — {endModal.group_name}</h3>
            <div className="sl-field">
              <label>Type</label>
              <select value={endType} onChange={(e) => onEndTypeChange(e.target.value)}>
                {SLAUGHTER_ANIMAL_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            {endError && <div className="sl-modal-error">{endError}</div>}
            <div className="sl-field">
              <label>Cow / goat number (editable)</label>
              <input
                value={endNumber}
                onChange={(e) => { setEndNumber(e.target.value); setEndError(''); }}
                placeholder="First pending start number"
              />
            </div>
            <div className="sl-field">
              <label>End time</label>
              <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
            <div className="sl-modal-actions">
              <button type="button" className="sl-cancel" onClick={() => setEndModal(null)}>Cancel</button>
              <button type="button" className="sl-confirm-green" disabled={savingEnd} onClick={submitEndSlaughter}>
                {savingEnd ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {listModal && (
        <div className="sl-overlay ops-sheet-overlay" onClick={() => { setListModal(null); setEditRow(null); }} role="presentation">
          <div className="sl-modal ops-sheet-panel" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()} role="dialog">
            <h3>Edit — {listModal.group_name}</h3>
            {editRow ? (
              <>
                {editError && <div className="sl-modal-error">{editError}</div>}
                <div className="sl-field">
                  <label>Type</label>
                  <select value={editType} onChange={(e) => { setEditType(e.target.value); setEditError(''); }}>
                    {SLAUGHTER_ANIMAL_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="sl-field">
                  <label>Number</label>
                  <input value={editNumber} onChange={(e) => { setEditNumber(e.target.value); setEditError(''); }} />
                </div>
                <div className="sl-field">
                  <label>Start time</label>
                  <input type="datetime-local" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                </div>
                <div className="sl-field">
                  <label>End time (optional)</label>
                  <input type="datetime-local" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)} />
                </div>
                <div className="sl-modal-actions">
                  <button type="button" className="sl-cancel" onClick={() => setEditRow(null)}>Back</button>
                  <button type="button" className="sl-confirm" disabled={savingEdit} onClick={saveEdit}>
                    {savingEdit ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            ) : listLoading ? (
              <p style={{ color: '#888', fontSize: 13 }}>Loading…</p>
            ) : listRows.length === 0 ? (
              <p style={{ color: '#888', fontSize: 13 }}>No slaughters recorded for this group.</p>
            ) : (
              listRows.map((row) => (
                <div key={row.slaughter_id} className="sl-list-row">
                  <div>
                    <div><strong>{row.animal_number}</strong> — {animalTypeLabel(row.animal_type)}</div>
                    <div className="sl-list-meta">
                      Start: {formatTime12Hour(row.slaughter_time)}
                      {row.slaughter_end_time ? ` · End: ${formatTime12Hour(row.slaughter_end_time)}` : ''}
                    </div>
                  </div>
                  <div className="sl-list-btns">
                    <button type="button" onClick={() => startEdit(row)}>Edit</button>
                    <button type="button" onClick={() => deleteSlaughter(row.slaughter_id)}>Delete</button>
                  </div>
                </div>
              ))
            )}
            {!editRow && (
              <div className="sl-modal-actions" style={{ marginTop: 12 }}>
                <button type="button" className="sl-cancel" style={{ flex: 1 }} onClick={() => setListModal(null)}>Close</button>
              </div>
            )}
          </div>
        </div>
      )}

      {viewModal && (
        <div className="sl-overlay ops-sheet-overlay" onClick={() => setViewModal(null)} role="presentation">
          <div className="sl-modal sl-modal-wide ops-sheet-panel" onClick={(e) => e.stopPropagation()} role="dialog">
            <h3>{viewModal.group_name} — {SLAUGHTER_DAYS.find((d) => d.value === day)?.label}</h3>
            <div className="sl-view-filter sl-field">
              <label>Type filter</label>
              <select value={viewTypeFilter} onChange={(e) => setViewTypeFilter(e.target.value)}>
                <option value="">All types</option>
                {SLAUGHTER_ANIMAL_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="sl-view-table-wrap">
              {viewLoading ? (
                <p style={{ padding: 16, color: '#888', fontSize: 13 }}>Loading…</p>
              ) : viewRows.length === 0 ? (
                <p style={{ padding: 16, color: '#888', fontSize: 13 }}>No records for this group.</p>
              ) : (
                <table className="sl-view-table">
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Type</th>
                      <th>Start</th>
                      <th>End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewRows.map((row) => (
                      <tr key={row.slaughter_id}>
                        <td>{row.animal_number}</td>
                        <td>{animalTypeLabel(row.animal_type)}</td>
                        <td>{formatTime12Hour(row.slaughter_time)}</td>
                        <td>{formatTime12Hour(row.slaughter_end_time)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="sl-modal-actions" style={{ marginTop: 12 }}>
              <button type="button" className="sl-cancel" style={{ flex: 1 }} onClick={() => setViewModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
