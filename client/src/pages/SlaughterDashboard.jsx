import { useCallback, useEffect, useState } from 'react';
import { API_BASE as API } from '../config/api';
import { SLAUGHTER_ANIMAL_TYPES, SLAUGHTER_DAYS, animalTypeLabel } from '../utils/slaughterTypes';

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

  const [listModal, setListModal] = useState(null);
  const [listRows, setListRows] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editType, setEditType] = useState('premium_cow');
  const [editNumber, setEditNumber] = useState('');
  const [editTime, setEditTime] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

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

  const startEdit = (row) => {
    setEditRow(row);
    setEditType(row.animal_type);
    setEditNumber(row.animal_number);
    setEditTime(row.slaughter_time ? String(row.slaughter_time).slice(0, 16) : nowLocalInput());
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

  const statCount = (group, typeKey) => Number(group.stats?.[typeKey] || 0);

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
        .sl-card-title { font-size: 16px; font-weight: 700; color: #222; margin-bottom: 12px; }
        .sl-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; margin-bottom: 14px; }
        .sl-stat { font-size: 12px; color: #555; display: flex; justify-content: space-between; }
        .sl-stat strong { color: #C62828; }
        .sl-card-actions { display: flex; gap: 8px; }
        .sl-btn { flex: 1; padding: 8px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #ddd; background: #fff; }
        .sl-btn-primary { background: #FFEBEE; border-color: #EF9A9A; color: #C62828; }
        .sl-btn-danger { background: #fff; color: #666; }
        .sl-empty { text-align: center; padding: 48px 20px; color: #888; font-size: 14px; }
        .sl-error { background: #FFEBEE; color: #C62828; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
        .sl-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
        .sl-modal { background: #fff; border-radius: 12px; width: 100%; max-width: 420px; max-height: 90vh; overflow-y: auto; padding: 20px; }
        .sl-modal h3 { margin: 0 0 16px; font-size: 17px; }
        .sl-field { margin-bottom: 14px; }
        .sl-field label { display: block; font-size: 12px; color: #666; margin-bottom: 4px; font-weight: 600; }
        .sl-field input, .sl-field select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box; }
        .sl-modal-actions { display: flex; gap: 10px; margin-top: 18px; }
        .sl-modal-actions button { flex: 1; padding: 10px; border-radius: 8px; font-weight: 600; cursor: pointer; border: none; }
        .sl-confirm { background: #C62828; color: #fff; }
        .sl-cancel { background: #f0f0f0; color: #333; }
        .sl-modal-error { background: #FFEBEE; color: #C62828; padding: 8px 12px; border-radius: 8px; font-size: 12px; margin-bottom: 12px; }
        .sl-list-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
        .sl-list-row:last-child { border-bottom: none; }
        .sl-list-meta { color: #888; font-size: 11px; }
        .sl-list-btns { display: flex; gap: 6px; }
        .sl-list-btns button { padding: 4px 10px; font-size: 11px; border-radius: 6px; border: 1px solid #ddd; background: #fff; cursor: pointer; }
        @media (max-width: 767px) {
          .sl-root { padding: 16px 12px 24px; }
          .sl-toolbar { flex-direction: column; align-items: stretch; }
          .sl-add-group { margin-left: 0; width: 100%; }
          .sl-day-tabs { flex-wrap: wrap; }
          .sl-day-btn { flex: 1; min-width: 0; text-align: center; }
          .sl-grid { grid-template-columns: 1fr; }
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
              <div className="sl-card-title">{g.group_name}</div>
              <div className="sl-stats">
                {SLAUGHTER_ANIMAL_TYPES.map((t) => (
                  <div key={t.key} className="sl-stat">
                    <span>{t.label}</span>
                    <strong>{statCount(g, t.key)}</strong>
                  </div>
                ))}
              </div>
              <div className="sl-card-actions">
                <button type="button" className="sl-btn sl-btn-primary" onClick={() => openAddSlaughter(g)}>
                  + Slaughter
                </button>
                <button type="button" className="sl-btn sl-btn-danger" onClick={() => openListModal(g)}>
                  Remove slaughter
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
            <h3>Add slaughter — {addModal.group_name}</h3>
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
                placeholder="P1, S1, GS-1…"
              />
            </div>
            <div className="sl-field">
              <label>Time</label>
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

      {listModal && (
        <div className="sl-overlay ops-sheet-overlay" onClick={() => { setListModal(null); setEditRow(null); }} role="presentation">
          <div className="sl-modal ops-sheet-panel" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()} role="dialog">
            <h3>Slaughters — {listModal.group_name}</h3>
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
                  <label>Time</label>
                  <input type="datetime-local" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
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
                    <div className="sl-list-meta">{formatTime(row.slaughter_time)}</div>
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
    </div>
  );
}
