import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import { useLocation } from 'react-router-dom';
import { API_BASE as API } from '../config/api';

const EXPENSE_COLUMNS = [
  { key: 'expense_id', label: 'Expense ID' },
  { key: 'done_at', label: 'Date' },
  { key: 'description', label: 'Description' },
  { key: 'bank', label: 'Bank' },
  { key: 'cash', label: 'Cash' },
  { key: 'total', label: 'Total' },
  { key: 'done_by', label: 'Done By' },
  { key: 'created_by', label: 'Created By' },
];

function formatAmount(val) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  return `Rs ${Math.round(n).toLocaleString('en-PK')}`;
}

function formatDate(val) {
  if (val == null || val === '') return '—';
  const s = String(val);
  if (s.includes('T')) return s.split('T')[0];
  return s;
}

function displayCreatedBy(row) {
  return row?.created_by_name || row?.createdByName || row?.creator_name || row?.creatorName || row?.created_by || '—';
}

export default function Expenses() {
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [amountVisible, setAmountVisible] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addBank, setAddBank] = useState('');
  const [addCash, setAddCash] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [addErrors, setAddErrors] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editExpense, setEditExpense] = useState(null);
  const [editBank, setEditBank] = useState('');
  const [editCash, setEditCash] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editErrors, setEditErrors] = useState({});
  const [deleteConfirmExpense, setDeleteConfirmExpense] = useState(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [addDate, setAddDate] = useState('');
  const [addDoneBy, setAddDoneBy] = useState('');
  const [nextExpenseId, setNextExpenseId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDoneBy, setEditDoneBy] = useState('');

  const PAGE_SIZE = 50;
  const { authFetch } = useAuth();
  const token = localStorage.getItem('token');
  const location = useLocation();
  const isFarm = location.pathname.startsWith('/farm');
  const isProcurement = location.pathname.startsWith('/procurement');
  const expenseBasePath = isProcurement
    ? `${API}/procurement/expenses`
    : (isFarm ? `${API}/farm/expenses` : `${API}/booking/expenses`);

  const toggleSelect = (expenseId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(expenseId)) next.delete(expenseId);
      else next.add(expenseId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === expenses.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(expenses.map((r) => r.expense_id)));
  };

  const fetchSummary = useCallback(async () => {
    try {
      const res = await authFetch(`${expenseBasePath}/summary`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [authFetch, token, expenseBasePath]);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch(`${expenseBasePath}?page=${page}&limit=${PAGE_SIZE}`, { headers: { Authorization: `Bearer ${token}` } });
      let data;
      try { data = await res.json(); } catch (_) { data = {}; }
      if (res.ok) {
        setExpenses(Array.isArray(data.data) ? data.data : []);
        setTotalCount(typeof data.total === 'number' ? data.total : (Array.isArray(data.data) ? data.data.length : 0));
      } else {
        setExpenses([]);
        setError(data.message || 'Failed to load expenses');
      }
    } catch (e) {
      setExpenses([]);
      setError('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [authFetch, token, page, expenseBasePath]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const openAddModal = async () => {
    setAddBank(''); setAddCash(''); setAddDescription('');
    setAddDate(''); setAddDoneBy(''); setAddErrors({});
    try {
      const res = await authFetch(`${expenseBasePath}/next-id`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      setNextExpenseId(res.ok ? data.expense_id : '');
    } catch (e) {
      console.error(e);
      setNextExpenseId('');
    }
    setAddModalOpen(true);
  };

  const openEditModal = (row) => {
    setEditExpense(row);
    setEditBank(String(row.bank ?? ''));
    setEditCash(String(row.cash ?? ''));
    setEditDescription(String(row.description ?? ''));
    setEditDate(row.done_at ? row.done_at.split('T')[0] : '');
    setEditDoneBy(String(row.done_by ?? ''));
    setEditErrors({});
  };

  const validateEdit = () => {
    const err = {};
    const bank = parseFloat(editBank);
    const cash = parseFloat(editCash);
    const addB = Math.max(0, Number.isNaN(bank) ? 0 : bank);
    const addC = Math.max(0, Number.isNaN(cash) ? 0 : cash);
    if (!Number.isNaN(bank) && bank < 0) err.editBank = 'Must be ≥ 0';
    if (!Number.isNaN(cash) && cash < 0) err.editCash = 'Must be ≥ 0';
    if (addB + addC === 0) err.edit = 'Enter at least one amount (Bank or Cash ≥ 0).';
    setEditErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSaveEdit = async () => {
    if (!editExpense || !validateEdit()) return;
    const bank = Math.max(0, parseFloat(editBank) || 0);
    const cash = Math.max(0, parseFloat(editCash) || 0);
    if (bank === 0 && cash === 0) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`${expenseBasePath}/${encodeURIComponent(editExpense.expense_id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bank, cash, description: editDescription.trim(), done_at: editDate || null, done_by: editDoneBy.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setEditExpense(null); fetchSummary(); fetchExpenses(); }
      else setError(data.message || 'Failed to update expense');
    } catch (e) {
      setError('Failed to update expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row) => {
    setSubmitting(true);
    try {
      const res = await authFetch(`${expenseBasePath}/${encodeURIComponent(row.expense_id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDeleteConfirmExpense(null);
        if (editExpense?.expense_id === row.expense_id) setEditExpense(null);
        setSelectedIds((prev) => { const next = new Set(prev); next.delete(row.expense_id); return next; });
        fetchSummary(); fetchExpenses();
      } else setError(data.message || 'Failed to delete expense');
    } catch (e) {
      setError('Failed to delete expense');
    } finally {
      setSubmitting(false);
    }
  };

  const validateAdd = () => {
    const err = {};
    const bank = parseFloat(addBank);
    const cash = parseFloat(addCash);
    const addB = Math.max(0, Number.isNaN(bank) ? 0 : bank);
    const addC = Math.max(0, Number.isNaN(cash) ? 0 : cash);
    if (!Number.isNaN(bank) && bank < 0) err.addBank = 'Must be ≥ 0';
    if (!Number.isNaN(cash) && cash < 0) err.addCash = 'Must be ≥ 0';
    if (addB + addC === 0) err.add = 'Enter at least one amount (Bank or Cash ≥ 0).';
    setAddErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleAddExpense = async () => {
    if (!validateAdd()) return;
    const bank = Math.max(0, parseFloat(addBank) || 0);
    const cash = Math.max(0, parseFloat(addCash) || 0);
    if (bank === 0 && cash === 0) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`${expenseBasePath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bank, cash, description: addDescription.trim(), done_at: addDate || null, done_by: addDoneBy.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setAddModalOpen(false); fetchSummary(); fetchExpenses(); }
      else setError(data.message || 'Failed to add expense');
    } catch (e) {
      setError('Failed to add expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = async () => {
    let allExpenses = [];
    const limit = 100;
    let pageNum = 1;
    let total = 0;
    do {
      const res = await authFetch(`${expenseBasePath}?page=${pageNum}&limit=${limit}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setError('Failed to load expenses for export'); return; }
      const data = await res.json();
      total = typeof data.total === 'number' ? data.total : 0;
      const chunk = Array.isArray(data.data) ? data.data : [];
      allExpenses = allExpenses.concat(chunk);
      if (chunk.length < limit || allExpenses.length >= total) break;
      pageNum += 1;
    } while (true);

    const toExport = selectedIds.size > 0 ? allExpenses.filter((e) => selectedIds.has(e.expense_id)) : allExpenses;
    if (toExport.length === 0) { alert(selectedIds.size > 0 ? 'No selected expenses to export.' : 'No expenses to export.'); return; }
    const exportedIds = toExport.map((e) => e.expense_id);
    const headers = EXPENSE_COLUMNS.map((c) => c.label);
    const rows = toExport.map((row) =>
      EXPENSE_COLUMNS.map((col) => {
        const val = row[col.key];
        if (['bank', 'cash', 'total'].includes(col.key)) { const n = Number(val); return Number.isFinite(n) ? n : (val ?? ''); }
        if (col.key === 'done_at') return formatDate(val);
        if (col.key === 'created_by') return displayCreatedBy(row);
        return val != null ? String(val) : '—';
      })
    );
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
    XLSX.writeFile(wb, `expenses-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
    try {
      await authFetch(`${expenseBasePath}/export-audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ count: toExport.length, expense_ids: exportedIds }),
      });
    } catch (e) { console.error('Export audit failed', e); }
  };

  const fullDataTotalBank = summary?.totalBank ?? 0;
  const fullDataTotalCash = summary?.totalCash ?? 0;

  if (loading && expenses.length === 0) {
    return (
      <div className="exp-root" style={{ padding: '19px', fontFamily: "'Poppins', 'Inter', sans-serif" }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '16px' }}>Expenses</h2>
        <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading...</div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes modalSheetInUp {
          from { opacity: 0; transform: translate3d(0, 100%, 0); }
          to   { opacity: 1; transform: translate3d(0, 0, 0); }
        }

        @media (max-width: 767px) {
          .exp-root                { padding: 16px 12px 24px !important; overflow: auto !important; }

          /* Top bar — same as Query/Order management mobile headings */
          .exp-topbar               { margin-bottom: 12px !important; align-items: center !important; min-height: 55px !important; box-sizing: border-box !important; }
          .exp-topbar h2            {
            flex: 1 !important; min-width: 0 !important;
            padding: 0 clamp(48px, 14vw, 56px) 0 0 !important; margin: 0 !important;
            font-size: clamp(15px, 4.3vw, 17px) !important; font-weight: 600 !important; color: #333 !important;
            line-height: 1.25 !important; display: flex !important; align-items: center !important; box-sizing: border-box !important;
          }

          .exp-export-desktop       { display: none !important; }
          .exp-mobile-fab-spacer    { display: block !important; }
          /* Hide above cards; Export + Add below cards */
          .exp-mobile-hide-above    { display: flex !important; justify-content: flex-end !important; margin-bottom: 10px !important; }
          .exp-mobile-below-cards   { display: flex !important; flex-direction: row !important; align-items: center !important; justify-content: flex-end !important; flex-wrap: wrap !important; gap: 8px !important; width: 100% !important; margin-bottom: 12px !important; }
          .exp-add-btn-row-desktop  { display: none !important; }

          /* Show/hide toggle — desktop only */
          .exp-showhide-wrap        { display: none !important; }

          /* Summary cards — side by side compact */
          .exp-cards                { gap: 8px !important; margin-bottom: 10px !important; }
          .exp-card                 { min-width: 0 !important; flex: 1 1 calc(50% - 4px) !important; padding: 10px 10px !important; }
          .exp-card-icon-wrap       { width: 44px !important; height: 44px !important; }
          .exp-card-icon-wrap img   { width: 36px !important; height: 36px !important; }
          .exp-card-label           { font-size: 10px !important; }
          .exp-card-amount          { font-size: 13px !important; }
          .exp-card-amount span     { min-width: unset !important; padding: 4px 6px !important; }

          /* Table shown on mobile */
          .exp-table-wrap           { display: block !important; }
          .exp-mobile-cards         { display: none !important; }

          /* Pagination */
          .exp-pagination           { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }

          /* Modals — bottom sheet */
          .exp-modal-wrap           { align-items: flex-end !important; padding: 0 !important; }
          .exp-modal-box            {
            border-radius: 20px 20px 0 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            max-height: 92dvh !important;
            padding: 20px 16px 36px !important;
            overflow-y: auto !important;
            animation: modalSheetInUp 0.38s cubic-bezier(0.25, 0.8, 0.25, 1) both !important;
          }
          .exp-modal-box h3         { font-size: 15px !important; }
          .exp-modal-grid           { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
          .exp-modal-label          { font-size: 12px !important; margin-bottom: 4px !important; }
          .exp-modal-input          { font-size: 13px !important; padding: 10px 12px !important; border-radius: 8px !important; height: auto !important; }
          .exp-modal-actions        { gap: 10px !important; margin-top: 4px !important; }
          .exp-modal-actions button { flex: 1 !important; padding: 13px !important; font-size: 13px !important; border-radius: 10px !important; }
          .exp-drag-handle          { display: block !important; }

          /* Delete confirm modal */
          .exp-delete-modal-box     {
            border-radius: 20px 20px 0 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            padding: 20px 16px 36px !important;
            animation: modalSheetInUp 0.38s cubic-bezier(0.25, 0.8, 0.25, 1) both !important;
          }
          .exp-delete-modal-box h3  { font-size: 15px !important; }
          .exp-delete-modal-box p   { font-size: 13px !important; }
          .exp-delete-actions       { gap: 10px !important; }
          .exp-delete-actions button { flex: 1 !important; padding: 13px !important; font-size: 13px !important; border-radius: 10px !important; }
        }
      `}</style>

    <div className="exp-root" style={{ padding: '19px', fontFamily: "'Poppins', 'Inter', sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>

      {/* ── Top bar ── */}
      <div className="exp-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0, flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333', flexShrink: 0 }}>Expenses</h2>
        <div className="exp-topbar-right" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
          <button type="button" className="exp-export-desktop" onClick={handleExport} style={{ padding: '6px 13px', fontSize: '11px', fontWeight: '600', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Export
          </button>
          <div className="exp-mobile-fab-spacer" aria-hidden style={{ display: 'none', width: 46, height: 46, flexShrink: 0 }} />
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', flexShrink: 0, fontSize: '10px' }}>{error}</div>
      )}

      {/* ── Show/hide toggle (desktop only) ── */}
      <div className="exp-showhide-wrap" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px', flexShrink: 0 }}>
        <button type="button" onClick={() => setAmountVisible((v) => !v)} title={amountVisible ? 'Hide' : 'Show'} style={{ padding: '6px 8px', fontSize: '10px', fontWeight: '500', background: '#f0f0f0', color: '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={amountVisible ? '/icons/hide.png' : '/icons/show.png'} alt={amountVisible ? 'Hide' : 'Show'} style={{ width: '18px', height: '18px', display: 'block' }} />
        </button>
      </div>

      {/* Mobile: hide amounts — above Bank/Cash cards */}
      <div className="exp-mobile-hide-above" style={{ display: 'none', justifyContent: 'flex-end', marginBottom: '10px', flexShrink: 0 }}>
        <button type="button" onClick={() => setAmountVisible((v) => !v)} title={amountVisible ? 'Hide' : 'Show'} style={{ padding: '6px 8px', fontSize: '10px', fontWeight: '500', background: '#f0f0f0', color: '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={amountVisible ? '/icons/hide.png' : '/icons/show.png'} alt="" style={{ width: '18px', height: '18px', display: 'block' }} />
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="exp-cards" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px', flexShrink: 0, alignItems: 'flex-start' }}>
        {/* Bank card */}
        <div className="exp-card" style={{ flex: '1 1 160px', minWidth: '160px', padding: '14px 12px', borderRadius: '10px', border: '1px solid #f1f1f1', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '8px', position: 'relative', overflow: 'hidden' }}>
          <div className="exp-card-icon-wrap" style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src="/icons/pending_payments_amount.png" alt="" style={{ width: '50px', height: '50px', objectFit: 'contain' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px' }}>
            <div className="exp-card-label" style={{ fontSize: '11px', fontWeight: '400', color: '#6b7280' }}>Bank</div>
            <div className="exp-card-amount" style={{ fontSize: '18px', fontWeight: '600', color: '#111827', lineHeight: '1.2' }}>
              {amountVisible
                ? <span>{formatAmount(fullDataTotalBank)}</span>
                : <span style={{ filter: 'blur(6px)', userSelect: 'none', display: 'inline-block', minWidth: '120px', background: 'rgba(0,0,0,0.03)', borderRadius: '10px', padding: '6px 10px' }}>{formatAmount(fullDataTotalBank)}</span>}
            </div>
          </div>
        </div>

        {/* Cash card */}
        <div className="exp-card" style={{ flex: '1 1 160px', minWidth: '160px', padding: '14px 12px', borderRadius: '10px', border: '1px solid #f1f1f1', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '8px', position: 'relative', overflow: 'hidden' }}>
          <div className="exp-card-icon-wrap" style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src="/icons/pending_payments_amount.png" alt="" style={{ width: '50px', height: '50px', objectFit: 'contain' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px' }}>
            <div className="exp-card-label" style={{ fontSize: '11px', fontWeight: '400', color: '#6b7280' }}>Cash</div>
            <div className="exp-card-amount" style={{ fontSize: '18px', fontWeight: '600', color: '#111827', lineHeight: '1.2' }}>
              {amountVisible
                ? <span>{formatAmount(fullDataTotalCash)}</span>
                : <span style={{ filter: 'blur(6px)', userSelect: 'none', display: 'inline-block', minWidth: '120px', background: 'rgba(0,0,0,0.03)', borderRadius: '10px', padding: '6px 10px' }}>{formatAmount(fullDataTotalCash)}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: Export + Add below amount cards */}
      <div className="exp-mobile-below-cards" style={{ display: 'none', width: '100%', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginBottom: '12px', boxSizing: 'border-box' }}>
        <button type="button" onClick={handleExport} style={{ padding: '6px 13px', fontSize: '11px', fontWeight: '600', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Export
        </button>
        <button type="button" onClick={openAddModal} style={{ padding: '6px 13px', fontSize: '11px', fontWeight: '600', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Add Expense
        </button>
      </div>

      <div className="exp-add-btn-row exp-add-btn-row-desktop" style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginTop: '4px', marginBottom: '16px' }}>
        <button type="button" onClick={openAddModal} style={{ padding: '6px 13px', fontSize: '11px', fontWeight: '600', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Add Expense
        </button>
      </div>

      {/* ── Table ── */}
      <div className="exp-table-wrap" style={{ flex: 1, minHeight: '400px', overflow: 'auto' }}>
        <div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap', width: '40px' }}>
                    <input type="checkbox" checked={expenses.length > 0 && selectedIds.size === expenses.length} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                  </th>
                  {EXPENSE_COLUMNS.map((col) => (
                    <th key={col.key} style={{ padding: '10px 8px', textAlign: ['bank', 'cash', 'total'].includes(col.key) ? 'right' : 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>{col.label}</th>
                  ))}
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap', width: '80px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr><td colSpan={EXPENSE_COLUMNS.length + 2} style={{ padding: '19px', textAlign: 'center', color: '#666', fontSize: '11px' }}>No expenses.</td></tr>
                ) : (
                  expenses.map((row) => (
                    <tr
                      key={row.expense_id}
                      style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                      onClick={(e) => { if (!e.target.closest('input[type="checkbox"]') && !e.target.closest('button')) openEditModal(row); }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#fafafa'}
                      onMouseLeave={(e) => e.currentTarget.style.background = ''}
                    >
                      <td style={{ padding: '8px', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(row.expense_id)} onChange={() => toggleSelect(row.expense_id)} style={{ cursor: 'pointer' }} />
                      </td>
                      {EXPENSE_COLUMNS.map((col) => (
                        <td key={col.key} style={{ padding: '8px', textAlign: ['bank', 'cash', 'total'].includes(col.key) ? 'right' : 'left', whiteSpace: 'nowrap' }}>
                          {['bank', 'cash', 'total'].includes(col.key)
                            ? formatAmount(row[col.key])
                            : col.key === 'done_at'
                              ? formatDate(row[col.key])
                              : col.key === 'created_by'
                                ? displayCreatedBy(row)
                                : (row[col.key] != null ? String(row[col.key]) : '—')}
                        </td>
                      ))}
                      <td style={{ padding: '8px', textAlign: 'center', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => setDeleteConfirmExpense(row)} disabled={submitting} title="Delete" style={{ padding: '4px', cursor: submitting ? 'not-allowed' : 'pointer', background: 'none', border: 'none', verticalAlign: 'middle', opacity: submitting ? 0.6 : 1 }}>
                          <img src="/icons/delete.png" alt="Delete" style={{ width: '18px', height: '18px', display: 'block' }} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Pagination ── */}
      {!loading && totalCount > 0 && (
        <div className="exp-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '12px 0', borderTop: '1px solid #e0e0e0', marginTop: '8px' }}>
          <span style={{ fontSize: '13px', color: '#666' }}>Showing {expenses.length} of {totalCount} expenses</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ padding: '6px 12px', fontSize: '10px', background: page <= 1 ? '#f0f0f0' : '#fff', color: page <= 1 ? '#999' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>Previous</button>
            {(() => {
              const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
              const showPages = 5;
              let start = Math.max(1, page - Math.floor(showPages / 2));
              let end = Math.min(totalPages, start + showPages - 1);
              if (end - start + 1 < showPages) start = Math.max(1, end - showPages + 1);
              const pages = [];
              for (let i = start; i <= end; i++) pages.push(i);
              return pages.map((p) => (
                <button key={p} type="button" onClick={() => setPage(p)} style={{ minWidth: '32px', padding: '6px 10px', fontSize: '10px', background: p === page ? '#2563eb' : '#fff', color: p === page ? '#fff' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', fontWeight: p === page ? 600 : 400 }}>{p}</button>
              ));
            })()}
            <button type="button" disabled={page >= Math.ceil(totalCount / PAGE_SIZE)} onClick={() => setPage((p) => Math.min(Math.ceil(totalCount / PAGE_SIZE) || 1, p + 1))} style={{ padding: '6px 12px', fontSize: '10px', background: page >= Math.ceil(totalCount / PAGE_SIZE) ? '#f0f0f0' : '#fff', color: page >= Math.ceil(totalCount / PAGE_SIZE) ? '#999' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: page >= Math.ceil(totalCount / PAGE_SIZE) ? 'not-allowed' : 'pointer' }}>Next</button>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {deleteConfirmExpense && (
        <div className="exp-modal-wrap" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => !submitting && setDeleteConfirmExpense(null)}>
          <div className="exp-delete-modal-box" style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', width: 'min(380px, 95vw)', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
            <div className="exp-drag-handle" style={{ display: 'none', width: '40px', height: '4px', background: '#e0e0e0', borderRadius: '2px', margin: '0 auto 16px' }} />
            <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: '600', color: '#333' }}>Delete expense?</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#666' }}>Delete expense <strong>{deleteConfirmExpense.expense_id}</strong>? This cannot be undone.</p>
            <div className="exp-delete-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => !submitting && setDeleteConfirmExpense(null)} disabled={submitting} style={{ padding: '6px 13px', background: '#e0e0e0', color: '#333', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '10px' }}>Cancel</button>
              <button type="button" onClick={() => handleDelete(deleteConfirmExpense)} disabled={submitting} style={{ padding: '6px 13px', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '10px' }}>{submitting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit modal ── */}
      {editExpense && (
        <div className="exp-modal-wrap" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => !submitting && setEditExpense(null)}>
          <div className="exp-modal-box" style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', width: 'min(420px, 95vw)', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
            <div className="exp-drag-handle" style={{ display: 'none', width: '40px', height: '4px', background: '#e0e0e0', borderRadius: '2px', margin: '0 auto 16px' }} />
            <h3 style={{ margin: '0 0 13px 0', fontSize: '13px', fontWeight: '600' }}>Edit Expense</h3>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '10px' }}>Expense ID: {editExpense.expense_id} · Date: {formatDate(editExpense.done_at)}</div>
            {(editErrors.edit || editErrors.editBank || editErrors.editCash) && (
              <div style={{ marginBottom: '10px', padding: '6px', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px', fontSize: '10px' }}>
                {editErrors.edit}
                {editErrors.editBank && <div>Bank: {editErrors.editBank}</div>}
                {editErrors.editCash && <div>Cash: {editErrors.editCash}</div>}
              </div>
            )}
            <div className="exp-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '13px' }}>
              <div>
                <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Bank (Rs)</label>
                <input className="exp-modal-input" type="number" min="0" step="0.01" value={editBank} onChange={(e) => { setEditBank(e.target.value); setEditErrors((p) => ({ ...p, editBank: undefined, editCash: undefined, edit: undefined })); }} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: editErrors.editBank ? '1px solid #dc2626' : '1px solid #e0e0e0', fontSize: '10px' }} />
              </div>
              <div>
                <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Cash (Rs)</label>
                <input className="exp-modal-input" type="number" min="0" step="0.01" value={editCash} onChange={(e) => { setEditCash(e.target.value); setEditErrors((p) => ({ ...p, editCash: undefined, editBank: undefined, edit: undefined })); }} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: editErrors.editCash ? '1px solid #dc2626' : '1px solid #e0e0e0', fontSize: '10px' }} />
              </div>
            </div>
            <div style={{ marginBottom: '13px' }}>
              <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Description (optional)</label>
              <input className="exp-modal-input" type="text" value={editDescription} onChange={(e) => { setEditDescription(e.target.value); setEditErrors((p) => ({ ...p, edit: undefined })); }} placeholder="e.g. Fuel, stationery" style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '10px' }} />
            </div>
            <div className="exp-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '13px' }}>
              <div>
                <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Date</label>
                <input className="exp-modal-input" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '10px', height: '30px' }} />
              </div>
              <div>
                <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Done By</label>
                <input className="exp-modal-input" type="text" value={editDoneBy} onChange={(e) => setEditDoneBy(e.target.value)} placeholder="Staff name" style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '10px', height: '30px' }} />
              </div>
            </div>
            <div className="exp-modal-actions" style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => !submitting && setEditExpense(null)} disabled={submitting} style={{ padding: '6px 13px', background: '#e0e0e0', color: '#333', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '10px' }}>Close</button>
              <button type="button" onClick={handleSaveEdit} disabled={submitting || ((parseFloat(editBank) || 0) === 0 && (parseFloat(editCash) || 0) === 0)} style={{ padding: '6px 13px', background: '#166534', color: '#fff', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '10px' }}>{submitting ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add modal ── */}
      {addModalOpen && (
        <div className="exp-modal-wrap" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => !submitting && setAddModalOpen(false)}>
          <div className="exp-modal-box" style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', width: 'min(420px, 95vw)', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
            <div className="exp-drag-handle" style={{ display: 'none', width: '40px', height: '4px', background: '#e0e0e0', borderRadius: '2px', margin: '0 auto 16px' }} />
            <h3 style={{ margin: '0', fontSize: '13px', fontWeight: '600' }}>Add Expense</h3>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '13px' }}>Expense ID: {nextExpenseId || 'Loading...'}</div>
            {(addErrors.add || addErrors.addBank || addErrors.addCash) && (
              <div style={{ marginBottom: '10px', padding: '6px', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px', fontSize: '10px' }}>
                {addErrors.add}
                {addErrors.addBank && <div>Bank: {addErrors.addBank}</div>}
                {addErrors.addCash && <div>Cash: {addErrors.addCash}</div>}
              </div>
            )}
            <div className="exp-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '13px' }}>
              <div>
                <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Bank (Rs)</label>
                <input className="exp-modal-input" type="number" min="0" step="0.01" value={addBank} onChange={(e) => { setAddBank(e.target.value); setAddErrors((p) => ({ ...p, addBank: undefined, addCash: undefined, add: undefined })); }} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: addErrors.addBank ? '1px solid #dc2626' : '1px solid #e0e0e0', fontSize: '10px' }} />
              </div>
              <div>
                <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Cash (Rs)</label>
                <input className="exp-modal-input" type="number" min="0" step="0.01" value={addCash} onChange={(e) => { setAddCash(e.target.value); setAddErrors((p) => ({ ...p, addCash: undefined, addBank: undefined, add: undefined })); }} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: addErrors.addCash ? '1px solid #dc2626' : '1px solid #e0e0e0', fontSize: '10px' }} />
              </div>
            </div>
            <div style={{ marginBottom: '13px' }}>
              <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Description (optional)</label>
              <input className="exp-modal-input" type="text" value={addDescription} onChange={(e) => setAddDescription(e.target.value)} placeholder="e.g. Fuel, stationery" style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '10px' }} />
            </div>
            <div className="exp-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '13px' }}>
              <div>
                <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Date</label>
                <input className="exp-modal-input" type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '10px', height: '30px' }} />
              </div>
              <div>
                <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Done By</label>
                <input className="exp-modal-input" type="text" value={addDoneBy} onChange={(e) => setAddDoneBy(e.target.value)} placeholder="Staff name" style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '10px', height: '30px' }} />
              </div>
            </div>
            <div className="exp-modal-actions" style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => !submitting && setAddModalOpen(false)} disabled={submitting} style={{ padding: '6px 13px', background: '#e0e0e0', color: '#333', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '10px' }}>Close</button>
              <button type="button" onClick={handleAddExpense} disabled={submitting || ((parseFloat(addBank) || 0) === 0 && (parseFloat(addCash) || 0) === 0)} style={{ padding: '6px 13px', background: '#166534', color: '#fff', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '10px' }}>{submitting ? 'Submitting...' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}