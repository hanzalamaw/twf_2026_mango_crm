import { useCallback, useEffect, useState } from 'react';
import { API_BASE as API } from '../config/api';
import { LINE_ANIMAL_TYPES, LINE_DAYS, animalTypeLabel, sumCowStats, sumGoatStats } from '../utils/lineTypes';

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

function formatStatPair({ start, end }) {
  return `${start} / ${end}`;
}

export default function LineDashboard() {
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
  const [savingRecord, setSavingRecord] = useState(false);
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
      const res = await fetch(`${API}/operations/line/dashboard?day=${day}`, { headers: { Authorization: `Bearer ${token}` } });
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
      const res = await fetch(`${API}/operations/line/next-number?day=${day}&type=${encodeURIComponent(type)}`, {
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
        `${API}/operations/line/pending-number?day=${day}&group_id=${group.group_id}&type=${encodeURIComponent(type)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setEndNumber(data.animal_number || '');
      }
    } catch { /* ignore */ }
  };

  const openAddRecord = async (group) => {
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

  const openEndRecord = async (group) => {
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
      const res = await fetch(`${API}/operations/line/groups`, {
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

  const submitRecord = async () => {
    if (!addModal) return;
    setSavingRecord(true);
    setAddError('');
    try {
      const res = await fetch(`${API}/operations/line/records`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          day,
          group_id: addModal.group_id,
          animal_type: addType,
          animal_number: addNumber.trim() || undefined,
          recorded_time: addTime,
        }),
      });
      if (res.ok) {
        setAddModal(null);
        fetchDashboard();
      } else {
        const data = await res.json().catch(() => ({}));
        const msg = data.message || 'Could not add record';
        if (res.status === 409) setAddError(msg);
        else setError(msg);
      }
    } catch {
      setAddError('Could not add record');
    } finally {
      setSavingRecord(false);
    }
  };

  const submitEndRecord = async () => {
    if (!endModal) return;
    setSavingEnd(true);
    setEndError('');
    try {
      const res = await fetch(`${API}/operations/line/records/end`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          day,
          group_id: endModal.group_id,
          animal_type: endType,
          animal_number: endNumber.trim() || undefined,
          recorded_end_time: endTime,
        }),
      });
      if (res.ok) {
        setEndModal(null);
        fetchDashboard();
      } else {
        const data = await res.json().catch(() => ({}));
        const msg = data.message || 'Could not record end';
        if (res.status === 409 || res.status === 404) setEndError(msg);
        else setError(msg);
      }
    } catch {
      setEndError('Could not record end');
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
        `${API}/operations/line/groups/${group.group_id}/records?day=${day}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setListRows(Array.isArray(data.records) ? data.records : []);
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
      const res = await fetch(`${API}/operations/line/records-list?${params}`, {
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
    setEditTime(row.recorded_time ? String(row.recorded_time).slice(0, 16) : nowLocalInput());
    setEditEndTime(row.recorded_end_time ? String(row.recorded_end_time).slice(0, 16) : '');
    setEditError('');
  };

  const saveEdit = async () => {
    if (!editRow) return;
    setSavingEdit(true);
    setEditError('');
    try {
      const res = await fetch(`${API}/operations/line/records/${editRow.record_id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          animal_type: editType,
          animal_number: editNumber.trim(),
          recorded_time: editTime,
          recorded_end_time: editEndTime || null,
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

  const deleteRecord = async (id) => {
    if (!window.confirm('Delete this record?')) return;
    try {
      const res = await fetch(`${API}/operations/line/records/${id}`, {
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
    <div className="ln-root">
      <style>{`
        .ln-root { padding: 16px 20px 32px; font-family: 'Plus Jakarta Sans', 'Poppins', sans-serif; max-width: 1200px; margin: 0 auto; }
        .ln-toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 20px; }
        .ln-day-tabs { display: flex; gap: 8px; }
        .ln-day-btn { padding: 8px 16px; border-radius: 8px; border: 1px solid #ddd; background: #fff; cursor: pointer; font-size: 13px; font-weight: 600; }
        .ln-day-btn.active { background: #C62828; color: #fff; border-color: #C62828; }
        .ln-add-group { margin-left: auto; padding: 10px 18px; background: #C62828; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px; }
        .ln-add-group:hover { background: #B71C1C; }
        .ln-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
        .ln-card { background: #fff; border-radius: 12px; border: 1px solid #eee; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
        .ln-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
        .ln-card-title { font-size: 16px; font-weight: 700; color: #222; margin: 0; flex: 1; min-width: 0; background: none; border: none; padding: 0; padding-right: 4px; text-align: left; cursor: pointer; line-height: 1.3; }
        .ln-card-title:hover { color: #C62828; text-decoration: underline; }
        .ln-edit-btn { padding: 5px 12px; border-radius: 6px; border: 1px solid #ddd; background: #fff; font-size: 11px; font-weight: 600; cursor: pointer; color: #555; flex-shrink: 0; margin-left: auto; }
        .ln-edit-btn:hover { border-color: #C62828; color: #C62828; }
        .ln-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; margin-bottom: 14px; }
        .ln-stat { font-size: 12px; color: #555; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .ln-stat strong { color: #C62828; white-space: nowrap; text-align: right; }
        .ln-stat-sub { font-size: 10px; color: #999; font-weight: 500; }
        .ln-sums { margin-top: 4px; padding-top: 10px; border-top: 1px solid #f0f0f0; display: flex; flex-direction: row; gap: 12px; grid-column: 1 / -1; }
        .ln-sum { flex: 1; font-size: 13px; font-weight: 700; color: #222; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .ln-sum strong { color: #C62828; font-size: 13px; }
        .ln-card-actions { display: flex; flex-wrap: wrap; gap: 6px; }
        .ln-btn { flex: 1; min-width: 0; padding: 8px 6px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; border: 1px solid #ddd; background: #fff; }
        .ln-btn-primary { background: #FFEBEE; border-color: #EF9A9A; color: #C62828; }
        .ln-btn-end { background: #E8F5E9; border-color: #A5D6A7; color: #2E7D32; }
        .ln-empty { text-align: center; padding: 48px 20px; color: #888; font-size: 14px; }
        .ln-error { background: #FFEBEE; color: #C62828; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
        .ln-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
        .ln-modal { background: #fff; border-radius: 12px; width: 100%; max-width: 420px; max-height: 90vh; overflow-y: auto; padding: 20px; }
        .ln-modal-wide { max-width: 720px; }
        .ln-modal h3 { margin: 0 0 16px; font-size: 17px; }
        .ln-field { margin-bottom: 14px; }
        .ln-field label { display: block; font-size: 12px; color: #666; margin-bottom: 4px; font-weight: 600; }
        .ln-field input, .ln-field select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box; }
        .ln-modal-actions { display: flex; gap: 10px; margin-top: 18px; }
        .ln-modal-actions button { flex: 1; padding: 10px; border-radius: 8px; font-weight: 600; cursor: pointer; border: none; }
        .ln-confirm { background: #C62828; color: #fff; }
        .ln-confirm-green { background: #2E7D32; color: #fff; }
        .ln-cancel { background: #f0f0f0; color: #333; }
        .ln-modal-error { background: #FFEBEE; color: #C62828; padding: 8px 12px; border-radius: 8px; font-size: 12px; margin-bottom: 12px; }
        .ln-list-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
        .ln-list-row:last-child { border-bottom: none; }
        .ln-list-meta { color: #888; font-size: 11px; }
        .ln-list-btns { display: flex; gap: 6px; }
        .ln-list-btns button { padding: 4px 10px; font-size: 11px; border-radius: 6px; border: 1px solid #ddd; background: #fff; cursor: pointer; }
        .ln-view-filter { margin-bottom: 14px; }
        .ln-view-table-wrap { overflow-x: auto; border: 1px solid #eee; border-radius: 8px; }
        .ln-view-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .ln-view-table th, .ln-view-table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #f0f0f0; }
        .ln-view-table th { background: #fafafa; font-weight: 600; color: #555; font-size: 11px; }
        @media (max-width: 767px) {
          .ln-root { padding: 16px 12px 24px; }
          .ln-toolbar { flex-direction: column; align-items: stretch; }
          .ln-add-group { margin-left: 0; width: 100%; }
          .ln-day-tabs { flex-wrap: wrap; }
          .ln-day-btn { flex: 1; min-width: 0; text-align: center; }
          .ln-grid { grid-template-columns: 1fr; }
          .ln-card { padding: 14px; }
          .ln-card-title { font-size: 15px; }
          .ln-stats { grid-template-columns: 1fr; gap: 8px; }
          .ln-stat {
            padding: 10px 12px;
            background: #fafafa;
            border-radius: 8px;
            border: 1px solid #f0f0f0;
            font-size: 13px;
          }
          .ln-stat strong { font-size: 13px; }
          .ln-sums {
            flex-direction: column;
            gap: 8px;
            grid-column: 1;
            margin-top: 0;
            padding-top: 0;
            border-top: none;
          }
          .ln-sum {
            padding: 10px 12px;
            background: #f5f5f5;
            border-radius: 8px;
            border: 1px solid #eee;
          }
          .ln-card-actions { flex-direction: column; }
          .ln-btn { flex: none; width: 100%; font-size: 12px; padding: 10px 12px; }
        }
      `}</style>

      <div className="ln-toolbar">
        <div className="ln-day-tabs">
          {LINE_DAYS.map((d) => (
            <button
              key={d.value}
              type="button"
              className={`ln-day-btn${day === d.value ? ' active' : ''}`}
              onClick={() => setDay(d.value)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <button type="button" className="ln-add-group" onClick={() => { setGroupName(''); setGroupModal(true); }}>
          Add Line Group
        </button>
      </div>

      {error && <div className="ln-error">{error}</div>}

      {loading ? (
        <div className="ln-empty">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="ln-empty">No line groups for {LINE_DAYS.find((d) => d.value === day)?.label}. Add one to get started.</div>
      ) : (
        <div className="ln-grid">
          {groups.map((g) => {
            const stats = g.stats || {};
            const cowTotals = sumCowStats(stats);
            const goatTotals = sumGoatStats(stats);
            return (
              <div key={g.group_id} className="ln-card">
                <div className="ln-card-head">
                  <button type="button" className="ln-card-title" onClick={() => openViewModal(g)}>
                    {g.group_name}
                  </button>
                  <button type="button" className="ln-edit-btn" onClick={() => openListModal(g)}>Edit</button>
                </div>
                <div className="ln-stats">
                  {LINE_ANIMAL_TYPES.map((t) => {
                    const { start, end } = statPair(g, t.key);
                    return (
                      <div key={t.key} className="ln-stat">
                        <span>{t.label}</span>
                        <strong>
                          {start} <span className="ln-stat-sub">start</span>
                          {' / '}
                          {end} <span className="ln-stat-sub">end</span>
                        </strong>
                      </div>
                    );
                  })}
                  <div className="ln-sums">
                    <div className="ln-sum">
                      <span>Cows Hissa</span>
                      <strong>{formatStatPair(cowTotals)}</strong>
                    </div>
                    <div className="ln-sum">
                      <span>Goats</span>
                      <strong>{formatStatPair(goatTotals)}</strong>
                    </div>
                  </div>
                </div>
                <div className="ln-card-actions">
                  <button type="button" className="ln-btn ln-btn-primary" onClick={() => openAddRecord(g)}>
                    + Cow/Goat Start
                  </button>
                  <button type="button" className="ln-btn ln-btn-end" onClick={() => openEndRecord(g)}>
                    + Cow/Goat End
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {groupModal && (
        <div className="ln-overlay ops-sheet-overlay" onClick={() => setGroupModal(false)} role="presentation">
          <div className="ln-modal ops-sheet-panel" onClick={(e) => e.stopPropagation()} role="dialog">
            <h3>Add Line Group</h3>
            <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>
              Group ID is assigned automatically. Creating for {LINE_DAYS.find((d) => d.value === day)?.label}.
            </p>
            <div className="ln-field">
              <label>Group name</label>
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Line A" />
            </div>
            <div className="ln-modal-actions">
              <button type="button" className="ln-cancel" onClick={() => setGroupModal(false)}>Cancel</button>
              <button type="button" className="ln-confirm" disabled={savingGroup || !groupName.trim()} onClick={submitGroup}>
                {savingGroup ? 'Saving…' : 'Add group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {addModal && (
        <div className="ln-overlay ops-sheet-overlay" onClick={() => setAddModal(null)} role="presentation">
          <div className="ln-modal ops-sheet-panel" onClick={(e) => e.stopPropagation()} role="dialog">
            <h3>Cow/Goat Start — {addModal.group_name}</h3>
            <div className="ln-field">
              <label>Type</label>
              <select value={addType} onChange={(e) => onAddTypeChange(e.target.value)}>
                {LINE_ANIMAL_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            {addError && <div className="ln-modal-error">{addError}</div>}
            <div className="ln-field">
              <label>Number (editable)</label>
              <input
                value={addNumber}
                onChange={(e) => { setAddNumber(e.target.value); setAddError(''); }}
                placeholder="P1, S1, GE1, GS-1…"
              />
            </div>
            <div className="ln-field">
              <label>Start time</label>
              <input type="datetime-local" value={addTime} onChange={(e) => setAddTime(e.target.value)} />
            </div>
            <div className="ln-modal-actions">
              <button type="button" className="ln-cancel" onClick={() => setAddModal(null)}>Cancel</button>
              <button type="button" className="ln-confirm" disabled={savingRecord} onClick={submitRecord}>
                {savingRecord ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {endModal && (
        <div className="ln-overlay ops-sheet-overlay" onClick={() => setEndModal(null)} role="presentation">
          <div className="ln-modal ops-sheet-panel" onClick={(e) => e.stopPropagation()} role="dialog">
            <h3>Cow/Goat End — {endModal.group_name}</h3>
            <div className="ln-field">
              <label>Type</label>
              <select value={endType} onChange={(e) => onEndTypeChange(e.target.value)}>
                {LINE_ANIMAL_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            {endError && <div className="ln-modal-error">{endError}</div>}
            <div className="ln-field">
              <label>Number (editable)</label>
              <input
                value={endNumber}
                onChange={(e) => { setEndNumber(e.target.value); setEndError(''); }}
                placeholder="First pending start number"
              />
            </div>
            <div className="ln-field">
              <label>End time</label>
              <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
            <div className="ln-modal-actions">
              <button type="button" className="ln-cancel" onClick={() => setEndModal(null)}>Cancel</button>
              <button type="button" className="ln-confirm-green" disabled={savingEnd} onClick={submitEndRecord}>
                {savingEnd ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {listModal && (
        <div className="ln-overlay ops-sheet-overlay" onClick={() => { setListModal(null); setEditRow(null); }} role="presentation">
          <div className="ln-modal ops-sheet-panel" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()} role="dialog">
            <h3>Edit — {listModal.group_name}</h3>
            {editRow ? (
              <>
                {editError && <div className="ln-modal-error">{editError}</div>}
                <div className="ln-field">
                  <label>Type</label>
                  <select value={editType} onChange={(e) => { setEditType(e.target.value); setEditError(''); }}>
                    {LINE_ANIMAL_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="ln-field">
                  <label>Number</label>
                  <input value={editNumber} onChange={(e) => { setEditNumber(e.target.value); setEditError(''); }} />
                </div>
                <div className="ln-field">
                  <label>Start time</label>
                  <input type="datetime-local" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                </div>
                <div className="ln-field">
                  <label>End time (optional)</label>
                  <input type="datetime-local" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)} />
                </div>
                <div className="ln-modal-actions">
                  <button type="button" className="ln-cancel" onClick={() => setEditRow(null)}>Back</button>
                  <button type="button" className="ln-confirm" disabled={savingEdit} onClick={saveEdit}>
                    {savingEdit ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            ) : listLoading ? (
              <p style={{ color: '#888', fontSize: 13 }}>Loading…</p>
            ) : listRows.length === 0 ? (
              <p style={{ color: '#888', fontSize: 13 }}>No entries recorded for this group.</p>
            ) : (
              listRows.map((row) => (
                <div key={row.record_id} className="ln-list-row">
                  <div>
                    <div><strong>{row.animal_number}</strong> — {animalTypeLabel(row.animal_type)}</div>
                    <div className="ln-list-meta">
                      Start: {formatTime12Hour(row.recorded_time)}
                      {row.recorded_end_time ? ` · End: ${formatTime12Hour(row.recorded_end_time)}` : ''}
                    </div>
                  </div>
                  <div className="ln-list-btns">
                    <button type="button" onClick={() => startEdit(row)}>Edit</button>
                    <button type="button" onClick={() => deleteRecord(row.record_id)}>Delete</button>
                  </div>
                </div>
              ))
            )}
            {!editRow && (
              <div className="ln-modal-actions" style={{ marginTop: 12 }}>
                <button type="button" className="ln-cancel" style={{ flex: 1 }} onClick={() => setListModal(null)}>Close</button>
              </div>
            )}
          </div>
        </div>
      )}

      {viewModal && (
        <div className="ln-overlay ops-sheet-overlay" onClick={() => setViewModal(null)} role="presentation">
          <div className="ln-modal ln-modal-wide ops-sheet-panel" onClick={(e) => e.stopPropagation()} role="dialog">
            <h3>{viewModal.group_name} — {LINE_DAYS.find((d) => d.value === day)?.label}</h3>
            <div className="ln-view-filter ln-field">
              <label>Type filter</label>
              <select value={viewTypeFilter} onChange={(e) => setViewTypeFilter(e.target.value)}>
                <option value="">All types</option>
                {LINE_ANIMAL_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="ln-view-table-wrap">
              {viewLoading ? (
                <p style={{ padding: 16, color: '#888', fontSize: 13 }}>Loading…</p>
              ) : viewRows.length === 0 ? (
                <p style={{ padding: 16, color: '#888', fontSize: 13 }}>No records for this group.</p>
              ) : (
                <table className="ln-view-table">
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
                      <tr key={row.record_id}>
                        <td>{row.animal_number}</td>
                        <td>{animalTypeLabel(row.animal_type)}</td>
                        <td>{formatTime12Hour(row.recorded_time)}</td>
                        <td>{formatTime12Hour(row.recorded_end_time)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="ln-modal-actions" style={{ marginTop: 12 }}>
              <button type="button" className="ln-cancel" style={{ flex: 1 }} onClick={() => setViewModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
