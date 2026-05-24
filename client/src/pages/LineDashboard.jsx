import { useCallback, useEffect, useState } from 'react';
import { API_BASE as API } from '../config/api';
import { LINE_ANIMAL_TYPES, LINE_DAYS, animalTypeLabel, sumCowStats, sumGoatStats } from '../utils/lineTypes';

function nowLocalInput() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTime(val) {
  if (!val) return '—';
  const s = String(val);
  if (s.includes('T')) {
    const [, t] = s.split('T');
    return t ? t.slice(0, 5) : s;
  }
  return s.length >= 16 ? s.slice(11, 16) : s;
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
  const [addType, setAddType] = useState('cow');
  const [addNumber, setAddNumber] = useState('');
  const [addTime, setAddTime] = useState(nowLocalInput());
  const [savingRecord, setSavingRecord] = useState(false);
  const [addError, setAddError] = useState('');

  const [listModal, setListModal] = useState(null);
  const [listRows, setListRows] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editType, setEditType] = useState('cow');
  const [editNumber, setEditNumber] = useState('');
  const [editTime, setEditTime] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

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

  const startEdit = (row) => {
    setEditRow(row);
    setEditType(row.animal_type);
    setEditNumber(row.animal_number);
    setEditTime(row.recorded_time ? String(row.recorded_time).slice(0, 16) : nowLocalInput());
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
        .ln-card-title { font-size: 16px; font-weight: 700; color: #222; margin-bottom: 12px; }
        .ln-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; margin-bottom: 14px; }
        .ln-stat { font-size: 12px; color: #555; display: flex; justify-content: space-between; }
        .ln-stat strong { color: #C62828; }
        .ln-sums { margin-top: 4px; padding-top: 10px; border-top: 1px solid #f0f0f0; display: flex; flex-direction: row; gap: 12px; grid-column: 1 / -1; }
        .ln-sum { flex: 1; font-size: 13px; font-weight: 700; color: #222; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .ln-sum strong { color: #C62828; font-size: 15px; }
        .ln-card-actions { display: flex; gap: 8px; }
        .ln-btn { flex: 1; padding: 8px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #ddd; background: #fff; }
        .ln-btn-primary { background: #FFEBEE; border-color: #EF9A9A; color: #C62828; }
        .ln-btn-danger { background: #fff; color: #666; }
        .ln-empty { text-align: center; padding: 48px 20px; color: #888; font-size: 14px; }
        .ln-error { background: #FFEBEE; color: #C62828; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
        .ln-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
        .ln-modal { background: #fff; border-radius: 12px; width: 100%; max-width: 420px; max-height: 90vh; overflow-y: auto; padding: 20px; }
        .ln-modal h3 { margin: 0 0 16px; font-size: 17px; }
        .ln-field { margin-bottom: 14px; }
        .ln-field label { display: block; font-size: 12px; color: #666; margin-bottom: 4px; font-weight: 600; }
        .ln-field input, .ln-field select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box; }
        .ln-modal-actions { display: flex; gap: 10px; margin-top: 18px; }
        .ln-modal-actions button { flex: 1; padding: 10px; border-radius: 8px; font-weight: 600; cursor: pointer; border: none; }
        .ln-confirm { background: #C62828; color: #fff; }
        .ln-cancel { background: #f0f0f0; color: #333; }
        .ln-modal-error { background: #FFEBEE; color: #C62828; padding: 8px 12px; border-radius: 8px; font-size: 12px; margin-bottom: 12px; }
        .ln-list-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
        .ln-list-row:last-child { border-bottom: none; }
        .ln-list-meta { color: #888; font-size: 11px; }
        .ln-list-btns { display: flex; gap: 6px; }
        .ln-list-btns button { padding: 4px 10px; font-size: 11px; border-radius: 6px; border: 1px solid #ddd; background: #fff; cursor: pointer; }
        @media (max-width: 767px) {
          .ln-root { padding: 16px 12px 24px; }
          .ln-toolbar { flex-direction: column; align-items: stretch; }
          .ln-add-group { margin-left: 0; width: 100%; }
          .ln-day-tabs { flex-wrap: wrap; }
          .ln-day-btn { flex: 1; min-width: 0; text-align: center; }
          .ln-grid { grid-template-columns: 1fr; }
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
            return (
              <div key={g.group_id} className="ln-card">
                <div className="ln-card-title">{g.group_name}</div>
                <div className="ln-stats">
                  {LINE_ANIMAL_TYPES.map((t) => (
                    <div key={t.key} className="ln-stat">
                      <span>{t.label}</span>
                      <strong>{Number(stats[t.key]) || 0}</strong>
                    </div>
                  ))}
                  <div className="ln-sums">
                    <div className="ln-sum">
                      <span>Cows Hissa</span>
                      <strong>{sumCowStats(stats)}</strong>
                    </div>
                    <div className="ln-sum">
                      <span>Goats</span>
                      <strong>{sumGoatStats(stats)}</strong>
                    </div>
                  </div>
                </div>
                <div className="ln-card-actions">
                  <button type="button" className="ln-btn ln-btn-primary" onClick={() => openAddRecord(g)}>
                    + Cow/Goat
                  </button>
                  <button type="button" className="ln-btn ln-btn-danger" onClick={() => openListModal(g)}>
                    Remove entry
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
            <h3>Add Cow/Goat — {addModal.group_name}</h3>
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
                placeholder="P1, S1, GP1, GS-1…"
              />
            </div>
            <div className="ln-field">
              <label>Time</label>
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

      {listModal && (
        <div className="ln-overlay ops-sheet-overlay" onClick={() => { setListModal(null); setEditRow(null); }} role="presentation">
          <div className="ln-modal ops-sheet-panel" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()} role="dialog">
            <h3>Entries — {listModal.group_name}</h3>
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
                  <label>Time</label>
                  <input type="datetime-local" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
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
                    <div className="ln-list-meta">{formatTime(row.recorded_time)}</div>
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
    </div>
  );
}




