import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import { useLocation } from 'react-router-dom';
import { API_BASE as API } from '../config/api';

const EXPENSE_COLUMNS = [
  { key: 'expense_id', label: 'Expense ID' },
  { key: 'done_at', label: 'Date' },
  { key: 'description', label: 'Description' },
  { key: 'category_name', label: 'Category' },
  { key: 'sub_category_name', label: 'Sub-Category' },
  { key: 'bank', label: 'Bank' },
  { key: 'cash', label: 'Cash' },
  { key: 'total', label: 'Total' },
  { key: 'done_by', label: 'Done By' },
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

// ─── Budget Badge ────────────────────────────────────────────────────────────
function BudgetBadge({ spent, budget, label }) {
  if (!budget || budget <= 0) return null;
  const pct = Math.min(100, Math.round((spent / budget) * 100));
  const over = spent > budget;
  const warn = pct >= 80 && !over;
  const bg = over ? '#fef2f2' : warn ? '#fffbeb' : '#f0fdf4';
  const color = over ? '#b91c1c' : warn ? '#92400e' : '#166534';
  const border = over ? '#fecaca' : warn ? '#fde68a' : '#bbf7d0';
  const icon = over ? '⚠️' : warn ? '🔶' : '✅';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: bg, border: `1px solid ${border}`, borderRadius: '8px', fontSize: '10px', color, fontWeight: 500, marginTop: '8px' }}>
      <span>{icon}</span>
      <span>
        {label}: <strong>{formatAmount(spent)}</strong> spent of <strong>{formatAmount(budget)}</strong> budget
        {over
          ? ` — exceeding by ${formatAmount(spent - budget)}`
          : ` (${100 - pct}% remaining)`}
      </span>
    </div>
  );
}

export default function Expenses() {
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [amountVisible, setAmountVisible] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const searchDebounce = useRef(null);

  // ── Categories ──
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);  // all sub-cats, filtered by selected cat
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catLoading, setCatLoading] = useState(false);

  // Category management state
  const [catList, setCatList] = useState([]);                // full list for manage modal
  const [subCatList, setSubCatList] = useState([]);          // full sub-cat list for manage modal
  const [selectedManageCat, setSelectedManageCat] = useState(null); // which cat is expanded in manage modal

  const [newCatName, setNewCatName] = useState('');
  const [newCatBudget, setNewCatBudget] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [newSubBudget, setNewSubBudget] = useState('');
  const [editCatInline, setEditCatInline] = useState(null);  // { id, name, budget }
  const [editSubInline, setEditSubInline] = useState(null);  // { id, name, budget, category_id }

  // ── Add modal ──
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addBank, setAddBank] = useState('');
  const [addCash, setAddCash] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [addDate, setAddDate] = useState('');
  const [addDoneBy, setAddDoneBy] = useState('');
  const [addCategoryId, setAddCategoryId] = useState('');
  const [addSubCategoryId, setAddSubCategoryId] = useState('');
  const [addErrors, setAddErrors] = useState({});
  const [nextExpenseId, setNextExpenseId] = useState('');
  const [addCatSpent, setAddCatSpent] = useState(0);
  const [addSubSpent, setAddSubSpent] = useState(0);

  // ── Edit modal ──
  const [editExpense, setEditExpense] = useState(null);
  const [editBank, setEditBank] = useState('');
  const [editCash, setEditCash] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDoneBy, setEditDoneBy] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editSubCategoryId, setEditSubCategoryId] = useState('');
  const [editErrors, setEditErrors] = useState({});
  const [editCatSpent, setEditCatSpent] = useState(0);
  const [editSubSpent, setEditSubSpent] = useState(0);

  // ── Delete ──
  const [deleteConfirmExpense, setDeleteConfirmExpense] = useState(null);

  const PAGE_SIZE = 50;
  const { authFetch, user } = useAuth();
  const token = localStorage.getItem('token');
  const location = useLocation();
  const isFarm = location.pathname.startsWith('/farm');
  const isProcurement = location.pathname.startsWith('/procurement');
  const expenseBasePath = isProcurement
    ? `${API}/procurement/expenses`
    : (isFarm ? `${API}/farm/expenses` : `${API}/accounting/expenses`);

  const storedUser = (() => {
    try { return JSON.parse(localStorage.getItem('user') || localStorage.getItem('authUser') || '{}'); }
    catch (_) { return {}; }
  })();
  const loggedInUserName = user?.name || user?.full_name || user?.fullName || user?.username || user?.email || storedUser?.name || storedUser?.full_name || storedUser?.fullName || storedUser?.username || storedUser?.email || '';

  // ─── Fetch helpers ────────────────────────────────────────────────────────

  const fetchSummary = useCallback(async () => {
    try {
      const res = await authFetch(`${expenseBasePath}/summary`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setSummary(await res.json());
    } catch (e) { console.error(e); }
  }, [authFetch, token, expenseBasePath]);

  const fetchExpenses = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page, limit: PAGE_SIZE });
      if (searchQuery) params.set('search', searchQuery);
      const res = await authFetch(`${expenseBasePath}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      let data;
      try { data = await res.json(); } catch (_) { data = {}; }
      if (res.ok) {
        setExpenses(Array.isArray(data.data) ? data.data : []);
        setTotalCount(typeof data.total === 'number' ? data.total : (Array.isArray(data.data) ? data.data.length : 0));
      } else {
        setExpenses([]); setError(data.message || 'Failed to load expenses');
      }
    } catch (e) { setExpenses([]); setError('Failed to load expenses'); }
    finally { setLoading(false); }
  }, [authFetch, token, page, expenseBasePath, searchQuery]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await authFetch(`${expenseBasePath}/categories`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setCategories(Array.isArray(data.categories) ? data.categories : []);
        setSubCategories(Array.isArray(data.sub_categories) ? data.sub_categories : []);
      }
    } catch (e) { console.error(e); }
  }, [authFetch, token, expenseBasePath]);

  const fetchCategoriesForManage = useCallback(async () => {
    setCatLoading(true);
    try {
      const res = await authFetch(`${expenseBasePath}/categories`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setCatList(Array.isArray(data.categories) ? data.categories : []);
        setSubCatList(Array.isArray(data.sub_categories) ? data.sub_categories : []);
        setCategories(Array.isArray(data.categories) ? data.categories : []);
        setSubCategories(Array.isArray(data.sub_categories) ? data.sub_categories : []);
      }
    } catch (e) { console.error(e); }
    finally { setCatLoading(false); }
  }, [authFetch, token, expenseBasePath]);

  const fetchCategorySpent = useCallback(async (categoryId, subCategoryId, setter1, setter2) => {
    if (!categoryId) { setter1(0); setter2(0); return; }
    try {
      const res = await authFetch(`${expenseBasePath}/category-spent?category_id=${categoryId}${subCategoryId ? `&sub_category_id=${subCategoryId}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setter1(data.category_spent ?? 0);
        setter2(data.sub_category_spent ?? 0);
      }
    } catch (e) { console.error(e); }
  }, [authFetch, token, expenseBasePath]);

  useEffect(() => { fetchSummary(); fetchCategories(); }, [fetchSummary, fetchCategories]);
  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);
  useEffect(() => {
    setAddDoneBy((prev) => prev || loggedInUserName);
  }, [loggedInUserName]);
  useEffect(() => {
    let ignore = false;
    const loadNextId = async () => {
      try {
        const res = await authFetch(`${expenseBasePath}/next-id`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => ({}));
        if (!ignore) setNextExpenseId(res.ok ? data.expense_id : '');
      } catch (_) {
        if (!ignore) setNextExpenseId('');
      }
    };
    loadNextId();
    return () => { ignore = true; };
  }, [authFetch, expenseBasePath, token]);

  // ─── Search debounce ──────────────────────────────────────────────────────
  const handleSearchChange = (val) => {
    setSearchInput(val);
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setSearchQuery(val);
      setPage(1);
    }, 400);
  };

  // ─── Selection ────────────────────────────────────────────────────────────
  const toggleSelect = (id) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => {
    if (selectedIds.size === expenses.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(expenses.map((r) => r.expense_id)));
  };

  // ─── Add modal ────────────────────────────────────────────────────────────
  const openAddModal = async () => {
    setAddBank(''); setAddCash(''); setAddDescription('');
    setAddDate(''); setAddDoneBy(loggedInUserName); setAddErrors({});
    setAddCategoryId(''); setAddSubCategoryId('');
    setAddCatSpent(0); setAddSubSpent(0);
    try {
      const res = await authFetch(`${expenseBasePath}/next-id`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      setNextExpenseId(res.ok ? data.expense_id : '');
    } catch (e) { setNextExpenseId(''); }
    setAddModalOpen(true);
  };

  const handleAddCategoryChange = async (catId) => {
    setAddCategoryId(catId);
    setAddSubCategoryId('');
    setAddCatSpent(0); setAddSubSpent(0);
    if (catId) await fetchCategorySpent(catId, '', setAddCatSpent, setAddSubSpent);
  };

  const handleAddSubCategoryChange = async (subId) => {
    setAddSubCategoryId(subId);
    setAddSubSpent(0);
    if (subId) await fetchCategorySpent(addCategoryId, subId, setAddCatSpent, setAddSubSpent);
  };

  const validateAdd = () => {
    const err = {};
    const bank = parseFloat(addBank), cash = parseFloat(addCash);
    const b = Math.max(0, Number.isNaN(bank) ? 0 : bank);
    const c = Math.max(0, Number.isNaN(cash) ? 0 : cash);
    if (!Number.isNaN(bank) && bank < 0) err.addBank = 'Must be ≥ 0';
    if (!Number.isNaN(cash) && cash < 0) err.addCash = 'Must be ≥ 0';
    if (b + c === 0) err.add = 'Enter at least one amount (Bank or Cash ≥ 0).';
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
      const res = await authFetch(expenseBasePath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bank, cash,
          description: addDescription.trim(),
          done_at: addDate || null,
          done_by: addDoneBy.trim() || loggedInUserName || null,
          category_id: addCategoryId || null,
          sub_category_id: addSubCategoryId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAddModalOpen(false);
        setAddBank(''); setAddCash(''); setAddDescription(''); setAddDate(''); setAddDoneBy(loggedInUserName); setAddCategoryId(''); setAddSubCategoryId(''); setAddErrors({});
        fetchSummary(); fetchExpenses();
        try {
          const nextRes = await authFetch(`${expenseBasePath}/next-id`, { headers: { Authorization: `Bearer ${token}` } });
          const nextData = await nextRes.json().catch(() => ({}));
          setNextExpenseId(nextRes.ok ? nextData.expense_id : '');
        } catch (_) { setNextExpenseId(''); }
      }
      else setError(data.message || 'Failed to add expense');
    } catch (e) { setError('Failed to add expense'); }
    finally { setSubmitting(false); }
  };

  // ─── Edit modal ───────────────────────────────────────────────────────────
  const openEditModal = async (row) => {
    setEditExpense(row);
    setEditBank(String(row.bank ?? ''));
    setEditCash(String(row.cash ?? ''));
    setEditDescription(String(row.description ?? ''));
    setEditDate(row.done_at ? row.done_at.split('T')[0] : '');
    setEditDoneBy(String(row.done_by ?? ''));
    setEditCategoryId(row.category_id ? String(row.category_id) : '');
    setEditSubCategoryId(row.sub_category_id ? String(row.sub_category_id) : '');
    setEditErrors({});
    setEditCatSpent(0); setEditSubSpent(0);
    if (row.category_id) await fetchCategorySpent(row.category_id, row.sub_category_id || '', setEditCatSpent, setEditSubSpent);
  };

  const handleEditCategoryChange = async (catId) => {
    setEditCategoryId(catId);
    setEditSubCategoryId('');
    setEditCatSpent(0); setEditSubSpent(0);
    if (catId) await fetchCategorySpent(catId, '', setEditCatSpent, setEditSubSpent);
  };

  const handleEditSubCategoryChange = async (subId) => {
    setEditSubCategoryId(subId);
    setEditSubSpent(0);
    if (subId) await fetchCategorySpent(editCategoryId, subId, setEditCatSpent, setEditSubSpent);
  };

  const validateEdit = () => {
    const err = {};
    const bank = parseFloat(editBank), cash = parseFloat(editCash);
    const b = Math.max(0, Number.isNaN(bank) ? 0 : bank);
    const c = Math.max(0, Number.isNaN(cash) ? 0 : cash);
    if (!Number.isNaN(bank) && bank < 0) err.editBank = 'Must be ≥ 0';
    if (!Number.isNaN(cash) && cash < 0) err.editCash = 'Must be ≥ 0';
    if (b + c === 0) err.edit = 'Enter at least one amount (Bank or Cash ≥ 0).';
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
        body: JSON.stringify({
          bank, cash,
          description: editDescription.trim(),
          done_at: editDate || null,
          done_by: editDoneBy.trim() || loggedInUserName || null,
          category_id: editCategoryId || null,
          sub_category_id: editSubCategoryId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setEditExpense(null); fetchSummary(); fetchExpenses(); }
      else setError(data.message || 'Failed to update expense');
    } catch (e) { setError('Failed to update expense'); }
    finally { setSubmitting(false); }
  };

  // ─── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async (row) => {
    setSubmitting(true);
    try {
      const res = await authFetch(`${expenseBasePath}/${encodeURIComponent(row.expense_id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDeleteConfirmExpense(null);
        if (editExpense?.expense_id === row.expense_id) setEditExpense(null);
        setSelectedIds((prev) => { const n = new Set(prev); n.delete(row.expense_id); return n; });
        fetchSummary(); fetchExpenses();
      } else setError(data.message || 'Failed to delete expense');
    } catch (e) { setError('Failed to delete expense'); }
    finally { setSubmitting(false); }
  };

  // ─── Export ───────────────────────────────────────────────────────────────
  const handleExport = async () => {
    let all = [];
    const limit = 100; let pageNum = 1; let total = 0;
    do {
      const params = new URLSearchParams({ page: pageNum, limit });
      if (searchQuery) params.set('search', searchQuery);
      const res = await authFetch(`${expenseBasePath}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setError('Failed to load expenses for export'); return; }
      const data = await res.json();
      total = typeof data.total === 'number' ? data.total : 0;
      const chunk = Array.isArray(data.data) ? data.data : [];
      all = all.concat(chunk);
      if (chunk.length < limit || all.length >= total) break;
      pageNum += 1;
    } while (true);

    const toExport = selectedIds.size > 0 ? all.filter((e) => selectedIds.has(e.expense_id)) : all;
    if (toExport.length === 0) { alert(selectedIds.size > 0 ? 'No selected expenses to export.' : 'No expenses to export.'); return; }
    const headers = EXPENSE_COLUMNS.map((c) => c.label);
    const rows = toExport.map((row) =>
      EXPENSE_COLUMNS.map((col) => {
        const val = row[col.key];
        if (['bank', 'cash', 'total'].includes(col.key)) { const n = Number(val); return Number.isFinite(n) ? n : (val ?? ''); }
        if (col.key === 'done_at') return formatDate(val);
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
        body: JSON.stringify({ count: toExport.length, expense_ids: toExport.map((e) => e.expense_id) }),
      });
    } catch (e) { console.error('Export audit failed', e); }
  };

  // ─── Category management CRUD ─────────────────────────────────────────────
  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`${expenseBasePath}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newCatName.trim(), budget: parseFloat(newCatBudget) || 0 }),
      });
      if (res.ok) { setNewCatName(''); setNewCatBudget(''); fetchCategoriesForManage(); }
    } catch (e) { console.error(e); }
    finally { setSubmitting(false); }
  };

  const handleAddSubCategory = async (catId) => {
    if (!newSubName.trim()) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`${expenseBasePath}/categories/${catId}/sub-categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newSubName.trim(), budget: parseFloat(newSubBudget) || 0 }),
      });
      if (res.ok) { setNewSubName(''); setNewSubBudget(''); fetchCategoriesForManage(); }
    } catch (e) { console.error(e); }
    finally { setSubmitting(false); }
  };

  const handleSaveCategory = async (cat) => {
    setSubmitting(true);
    try {
      const res = await authFetch(`${expenseBasePath}/categories/${cat.category_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: editCatInline.name.trim(), budget: parseFloat(editCatInline.budget) || 0 }),
      });
      if (res.ok) { setEditCatInline(null); fetchCategoriesForManage(); }
    } catch (e) { console.error(e); }
    finally { setSubmitting(false); }
  };

  const handleSaveSubCategory = async (sub) => {
    setSubmitting(true);
    try {
      const res = await authFetch(`${expenseBasePath}/categories/${sub.category_id}/sub-categories/${sub.sub_category_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: editSubInline.name.trim(), budget: parseFloat(editSubInline.budget) || 0 }),
      });
      if (res.ok) { setEditSubInline(null); fetchCategoriesForManage(); }
    } catch (e) { console.error(e); }
    finally { setSubmitting(false); }
  };

  const handleDeleteCategory = async (catId) => {
    if (!window.confirm('Delete this category? Sub-categories and expense links will be removed.')) return;
    setSubmitting(true);
    try {
      await authFetch(`${expenseBasePath}/categories/${catId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      fetchCategoriesForManage();
      if (selectedManageCat === catId) setSelectedManageCat(null);
    } catch (e) { console.error(e); }
    finally { setSubmitting(false); }
  };

  const handleDeleteSubCategory = async (catId, subId) => {
    if (!window.confirm('Delete this sub-category?')) return;
    setSubmitting(true);
    try {
      await authFetch(`${expenseBasePath}/categories/${catId}/sub-categories/${subId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      fetchCategoriesForManage();
    } catch (e) { console.error(e); }
    finally { setSubmitting(false); }
  };

  // ─── Derived ──────────────────────────────────────────────────────────────
  const fullDataTotalBank = summary?.totalBank ?? 0;
  const fullDataTotalCash = summary?.totalCash ?? 0;
  const addSubsForCat = subCategories.filter((s) => String(s.category_id) === String(addCategoryId));
  const editSubsForCat = subCategories.filter((s) => String(s.category_id) === String(editCategoryId));
  const selectedAddCat = categories.find((c) => String(c.category_id) === String(addCategoryId));
  const selectedAddSub = subCategories.find((s) => String(s.sub_category_id) === String(addSubCategoryId));
  const selectedEditCat = categories.find((c) => String(c.category_id) === String(editCategoryId));
  const selectedEditSub = subCategories.find((s) => String(s.sub_category_id) === String(editSubCategoryId));

  if (loading && expenses.length === 0) {
    return (
      <div className="exp-root" style={{ padding: '19px', fontFamily: "'Poppins', 'Inter', sans-serif" }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '16px' }}>Expenses</h2>
        <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading...</div>
      </div>
    );
  }

  // ─── Input style helper ───────────────────────────────────────────────────
  const inputStyle = (hasErr) => ({
    width: '100%', boxSizing: 'border-box', padding: '6px 10px',
    borderRadius: '6px', border: hasErr ? '1px solid #dc2626' : '1px solid #e0e0e0', fontSize: '10px',
  });

  return (
    <>
      <style>{`
        @keyframes modalSheetInUp {
          from { opacity: 0; transform: translate3d(0, 100%, 0); }
          to   { opacity: 1; transform: translate3d(0, 0, 0); }
        }

        .exp-search-input::placeholder { color: #aaa; }
        .exp-search-input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.12); }

        @media (max-width: 767px) {
          .exp-root                { padding: 16px 12px 24px !important; overflow: auto !important; }
          .exp-topbar               { margin-bottom: 12px !important; align-items: center !important; min-height: 55px !important; box-sizing: border-box !important; }
          .exp-topbar h2            {
            flex: 1 !important; min-width: 0 !important;
            padding: 0 clamp(48px, 14vw, 56px) 0 0 !important; margin: 0 !important;
            font-size: clamp(15px, 4.3vw, 17px) !important; font-weight: 600 !important; color: #333 !important;
            line-height: 1.25 !important; display: flex !important; align-items: center !important; box-sizing: border-box !important;
          }
          .exp-export-desktop       { display: none !important; }
          .exp-mobile-fab-spacer    { display: block !important; }
          .exp-mobile-hide-above    { display: flex !important; justify-content: flex-end !important; margin-bottom: 10px !important; }
          .exp-mobile-below-cards   { display: flex !important; flex-direction: row !important; align-items: center !important; justify-content: flex-end !important; flex-wrap: wrap !important; gap: 8px !important; width: 100% !important; margin-bottom: 12px !important; }
          .exp-add-btn-row-desktop  { display: none !important; }
          .exp-showhide-wrap        { display: none !important; }
          .exp-cards                { gap: 8px !important; margin-bottom: 10px !important; }
          .exp-card                 { min-width: 0 !important; flex: 1 1 calc(50% - 4px) !important; padding: 10px 10px !important; }
          .exp-card-icon-wrap       { width: 44px !important; height: 44px !important; }
          .exp-card-icon-wrap img   { width: 36px !important; height: 36px !important; }
          .exp-card-label           { font-size: 10px !important; }
          .exp-card-amount          { font-size: 13px !important; }
          .exp-card-amount span     { min-width: unset !important; padding: 4px 6px !important; }
          .exp-table-wrap           { display: block !important; }
          .exp-pagination           { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
          .exp-modal-wrap           { align-items: flex-end !important; padding: 0 !important; }
          .exp-modal-box            {
            border-radius: 20px 20px 0 0 !important;
            width: 100vw !important; max-width: 100vw !important;
            max-height: 92dvh !important; padding: 20px 16px 36px !important;
            overflow-y: visible !important;
            animation: modalSheetInUp 0.38s cubic-bezier(0.25, 0.8, 0.25, 1) both !important;
          }
          .exp-modal-box h3         { font-size: 15px !important; }
          .exp-modal-grid           { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
          .exp-modal-label          { font-size: 12px !important; margin-bottom: 4px !important; }
          .exp-modal-input          { font-size: 13px !important; padding: 10px 12px !important; border-radius: 8px !important; height: auto !important; }
          .exp-modal-actions        { gap: 10px !important; margin-top: 4px !important; }
          .exp-modal-actions button { flex: 1 !important; padding: 13px !important; font-size: 13px !important; border-radius: 10px !important; }
          .exp-drag-handle          { display: block !important; }
          .exp-delete-modal-box     {
            border-radius: 20px 20px 0 0 !important; width: 100vw !important; max-width: 100vw !important;
            padding: 20px 16px 36px !important;
            animation: modalSheetInUp 0.38s cubic-bezier(0.25, 0.8, 0.25, 1) both !important;
          }
          .exp-delete-modal-box h3  { font-size: 15px !important; }
          .exp-delete-modal-box p   { font-size: 13px !important; }
          .exp-delete-actions       { gap: 10px !important; }
          .exp-delete-actions button { flex: 1 !important; padding: 13px !important; font-size: 13px !important; border-radius: 10px !important; }
          .exp-search-bar           { width: 100% !important; max-width: 100% !important; }
        }
      `}</style>

      <div className="exp-root" style={{ padding: '19px', fontFamily: "'Poppins', 'Inter', sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, boxSizing: 'border-box' }}>

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

        {/* ── Show/hide toggle (desktop) ── */}
        <div className="exp-showhide-wrap" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px', flexShrink: 0 }}>
          <button type="button" onClick={() => setAmountVisible((v) => !v)} title={amountVisible ? 'Hide' : 'Show'} style={{ padding: '6px 8px', fontSize: '10px', fontWeight: '500', background: '#f0f0f0', color: '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={amountVisible ? '/icons/hide.png' : '/icons/show.png'} alt={amountVisible ? 'Hide' : 'Show'} style={{ width: '18px', height: '18px', display: 'block' }} />
          </button>
        </div>

        {/* Mobile: hide/show toggle above cards */}
        <div className="exp-mobile-hide-above" style={{ display: 'none', justifyContent: 'flex-end', marginBottom: '10px', flexShrink: 0 }}>
          <button type="button" onClick={() => setAmountVisible((v) => !v)} title={amountVisible ? 'Hide' : 'Show'} style={{ padding: '6px 8px', fontSize: '10px', fontWeight: '500', background: '#f0f0f0', color: '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={amountVisible ? '/icons/hide.png' : '/icons/show.png'} alt="" style={{ width: '18px', height: '18px', display: 'block' }} />
          </button>
        </div>

        {/* ── Summary cards ── */}
        <div className="exp-cards" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px', flexShrink: 0, alignItems: 'flex-start' }}>
          {[{ label: 'Bank', val: fullDataTotalBank }, { label: 'Cash', val: fullDataTotalCash }].map(({ label, val }) => (
            <div key={label} className="exp-card" style={{ flex: '1 1 160px', minWidth: '160px', padding: '14px 12px', borderRadius: '10px', border: '1px solid #f1f1f1', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
              <div className="exp-card-icon-wrap" style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <img src="/icons/pending_payments_amount.png" alt="" style={{ width: '50px', height: '50px', objectFit: 'contain' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px' }}>
                <div className="exp-card-label" style={{ fontSize: '11px', fontWeight: '400', color: '#6b7280' }}>{label}</div>
                <div className="exp-card-amount" style={{ fontSize: '18px', fontWeight: '600', color: '#111827', lineHeight: '1.2' }}>
                  {amountVisible
                    ? <span>{formatAmount(val)}</span>
                    : <span style={{ filter: 'blur(6px)', userSelect: 'none', display: 'inline-block', minWidth: '120px', background: 'rgba(0,0,0,0.03)', borderRadius: '10px', padding: '6px 10px' }}>{formatAmount(val)}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Mobile: Export + Add below cards */}
        <div className="exp-mobile-below-cards" style={{ display: 'none', width: '100%', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginBottom: '12px', boxSizing: 'border-box' }}>
          <button type="button" onClick={handleExport} style={{ padding: '6px 13px', fontSize: '11px', fontWeight: '600', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Export</button>
          <button type="button" onClick={() => { setCatModalOpen(true); fetchCategoriesForManage(); }} style={{ padding: '6px 13px', fontSize: '11px', fontWeight: '600', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Manage Categories & Budget</button>
        </div>

        {/* ── Search + Action Buttons Row (desktop) ── */}
        <div className="exp-add-btn-row exp-add-btn-row-desktop" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          {/* Search */}
          <div className="exp-search-bar" style={{ position: 'relative', flex: '1 1 220px', maxWidth: '320px' }}>
            <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="9" r="7" /><line x1="14.65" y1="14.65" x2="19" y2="19" />
              </svg>
            </span>
            <input
              className="exp-search-input"
              type="text"
              placeholder="Search expenses..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', paddingLeft: '28px', paddingRight: '8px', paddingTop: '6px', paddingBottom: '6px', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', color: '#333', background: '#fff', transition: 'border-color 0.15s, box-shadow 0.15s' }}
            />
          </div>
          {/* Right-side buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
            <button type="button" onClick={() => { setCatModalOpen(true); fetchCategoriesForManage(); }} style={{ padding: '6px 13px', fontSize: '11px', fontWeight: '600', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Manage Categories &amp; Budget
            </button>
          </div>
        </div>


        {/* ── Inline Add Expense Form ── */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', background: '#fff', padding: '12px', marginBottom: '12px', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#333' }}>Add Expense</h3>
              <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>Expense ID: {nextExpenseId || 'Auto generated'}</div>
            </div>
          </div>

          {(addErrors.add || addErrors.addBank || addErrors.addCash) && (
            <div style={{ marginBottom: '10px', padding: '6px', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px', fontSize: '10px' }}>
              {addErrors.add}
              {addErrors.addBank && <div>Bank: {addErrors.addBank}</div>}
              {addErrors.addCash && <div>Cash: {addErrors.addCash}</div>}
            </div>
          )}

          <div className="exp-modal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(120px, 1fr))', gap: '10px', alignItems: 'end' }}>
            <div>
              <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Bank (Rs)</label>
              <input className="exp-modal-input" type="number" min="0" step="0.01" value={addBank}
                onChange={(e) => { setAddBank(e.target.value); setAddErrors((p) => ({ ...p, addBank: undefined, add: undefined })); }}
                style={{ ...inputStyle(addErrors.addBank), height: '30px' }} />
            </div>
            <div>
              <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Cash (Rs)</label>
              <input className="exp-modal-input" type="number" min="0" step="0.01" value={addCash}
                onChange={(e) => { setAddCash(e.target.value); setAddErrors((p) => ({ ...p, addCash: undefined, add: undefined })); }}
                style={{ ...inputStyle(addErrors.addCash), height: '30px' }} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Description (optional)</label>
              <input className="exp-modal-input" type="text" value={addDescription}
                onChange={(e) => setAddDescription(e.target.value)}
                placeholder="e.g. Fuel, stationery" style={{ ...inputStyle(false), height: '30px' }} />
            </div>
            <div>
              <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Date</label>
              <input className="exp-modal-input" type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} style={{ ...inputStyle(false), height: '30px' }} />
            </div>
            <div>
              <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Done By</label>
              <input className="exp-modal-input" type="text" value={addDoneBy} onChange={(e) => setAddDoneBy(e.target.value)} placeholder="Logged-in user" style={{ ...inputStyle(false), height: '30px' }} />
            </div>
            <div>
              <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Category</label>
              <select value={addCategoryId} onChange={(e) => handleAddCategoryChange(e.target.value)} style={{ ...inputStyle(false), height: '30px', cursor: 'pointer' }}>
                <option value="">— None —</option>
                {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Sub-Category</label>
              <select value={addSubCategoryId} onChange={(e) => handleAddSubCategoryChange(e.target.value)} disabled={!addCategoryId || addSubsForCat.length === 0} style={{ ...inputStyle(false), height: '30px', cursor: addCategoryId ? 'pointer' : 'not-allowed', opacity: (!addCategoryId || addSubsForCat.length === 0) ? 0.5 : 1 }}>
                <option value="">— None —</option>
                {addSubsForCat.map((s) => <option key={s.sub_category_id} value={s.sub_category_id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'end', gap: '6px' }}>
              <button type="button" onClick={handleAddExpense} disabled={submitting || ((parseFloat(addBank) || 0) === 0 && (parseFloat(addCash) || 0) === 0)} style={{ width: '100%', padding: '7px 13px', background: '#166534', color: '#fff', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 600 }}>{submitting ? 'Submitting...' : 'Add'}</button>
            </div>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="exp-table-wrap" style={{ flex: 1, minHeight: '400px', overflow: 'auto' }}>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', width: '40px' }}>
                      <input type="checkbox" checked={expenses.length > 0 && selectedIds.size === expenses.length} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                    </th>
                    {EXPENSE_COLUMNS.map((col) => (
                      <th key={col.key} style={{ padding: '10px 8px', textAlign: ['bank', 'cash', 'total'].includes(col.key) ? 'right' : 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>{col.label}</th>
                    ))}
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', width: '80px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.length === 0 ? (
                    <tr><td colSpan={EXPENSE_COLUMNS.length + 2} style={{ padding: '19px', textAlign: 'center', color: '#666', fontSize: '11px' }}>
                      {searchQuery ? `No expenses found for "${searchQuery}".` : 'No expenses.'}
                    </td></tr>
                  ) : (
                    expenses.map((row) => (
                      <tr key={row.expense_id} style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
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

        {/* ════════════════════════════════════════════════════════
            ── Delete confirm modal ──
        ════════════════════════════════════════════════════════ */}
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

        {/* ════════════════════════════════════════════════════════
            ── Edit modal ──
        ════════════════════════════════════════════════════════ */}
        {editExpense && (
          <div className="exp-modal-wrap" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => !submitting && setEditExpense(null)}>
            <div className="exp-modal-box" style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', width: 'min(460px, 95vw)', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
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

              {/* Bank + Cash */}
              <div className="exp-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Bank (Rs)</label>
                  <input className="exp-modal-input" type="number" min="0" step="0.01" value={editBank}
                    onChange={(e) => { setEditBank(e.target.value); setEditErrors((p) => ({ ...p, editBank: undefined, edit: undefined })); }}
                    style={inputStyle(editErrors.editBank)} />
                </div>
                <div>
                  <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Cash (Rs)</label>
                  <input className="exp-modal-input" type="number" min="0" step="0.01" value={editCash}
                    onChange={(e) => { setEditCash(e.target.value); setEditErrors((p) => ({ ...p, editCash: undefined, edit: undefined })); }}
                    style={inputStyle(editErrors.editCash)} />
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: '10px' }}>
                <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Description (optional)</label>
                <input className="exp-modal-input" type="text" value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="e.g. Fuel, stationery" style={inputStyle(false)} />
              </div>

              {/* Date + Done By */}
              <div className="exp-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Date</label>
                  <input className="exp-modal-input" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} style={{ ...inputStyle(false), height: '30px' }} />
                </div>
                <div>
                  <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Done By</label>
                  <input className="exp-modal-input" type="text" value={editDoneBy} onChange={(e) => setEditDoneBy(e.target.value)} placeholder="Staff name" style={{ ...inputStyle(false), height: '30px' }} />
                </div>
              </div>

              {/* Category + Sub-category */}
              <div className="exp-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '6px' }}>
                <div>
                  <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Category</label>
                  <select value={editCategoryId} onChange={(e) => handleEditCategoryChange(e.target.value)} style={{ ...inputStyle(false), height: '30px', cursor: 'pointer' }}>
                    <option value="">— None —</option>
                    {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Sub-Category</label>
                  <select value={editSubCategoryId} onChange={(e) => handleEditSubCategoryChange(e.target.value)} disabled={!editCategoryId || editSubsForCat.length === 0} style={{ ...inputStyle(false), height: '30px', cursor: editCategoryId ? 'pointer' : 'not-allowed', opacity: (!editCategoryId || editSubsForCat.length === 0) ? 0.5 : 1 }}>
                    <option value="">— None —</option>
                    {editSubsForCat.map((s) => <option key={s.sub_category_id} value={s.sub_category_id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Budget badges */}

              <div className="exp-modal-actions" style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '13px' }}>
                <button type="button" onClick={() => !submitting && setEditExpense(null)} disabled={submitting} style={{ padding: '6px 13px', background: '#e0e0e0', color: '#333', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '10px' }}>Close</button>
                <button type="button" onClick={handleSaveEdit} disabled={submitting || ((parseFloat(editBank) || 0) === 0 && (parseFloat(editCash) || 0) === 0)} style={{ padding: '6px 13px', background: '#166534', color: '#fff', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '10px' }}>{submitting ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            ── Add modal ──
        ════════════════════════════════════════════════════════ */}
        {addModalOpen && (
          <div className="exp-modal-wrap" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => !submitting && setAddModalOpen(false)}>
            <div className="exp-modal-box" style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', width: 'min(460px, 95vw)', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
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

              {/* Bank + Cash */}
              <div className="exp-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Bank (Rs)</label>
                  <input className="exp-modal-input" type="number" min="0" step="0.01" value={addBank}
                    onChange={(e) => { setAddBank(e.target.value); setAddErrors((p) => ({ ...p, addBank: undefined, add: undefined })); }}
                    style={inputStyle(addErrors.addBank)} />
                </div>
                <div>
                  <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Cash (Rs)</label>
                  <input className="exp-modal-input" type="number" min="0" step="0.01" value={addCash}
                    onChange={(e) => { setAddCash(e.target.value); setAddErrors((p) => ({ ...p, addCash: undefined, add: undefined })); }}
                    style={inputStyle(addErrors.addCash)} />
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: '10px' }}>
                <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Description (optional)</label>
                <input className="exp-modal-input" type="text" value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  placeholder="e.g. Fuel, stationery" style={inputStyle(false)} />
              </div>

              {/* Date + Done By */}
              <div className="exp-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Date</label>
                  <input className="exp-modal-input" type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} style={{ ...inputStyle(false), height: '30px' }} />
                </div>
                <div>
                  <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Done By</label>
                  <input className="exp-modal-input" type="text" value={addDoneBy} onChange={(e) => setAddDoneBy(e.target.value)} placeholder="Staff name" style={{ ...inputStyle(false), height: '30px' }} />
                </div>
              </div>

              {/* Category + Sub-category */}
              <div className="exp-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '6px' }}>
                <div>
                  <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Category</label>
                  <select value={addCategoryId} onChange={(e) => handleAddCategoryChange(e.target.value)} style={{ ...inputStyle(false), height: '30px', cursor: 'pointer' }}>
                    <option value="">— None —</option>
                    {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="exp-modal-label" style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Sub-Category</label>
                  <select value={addSubCategoryId} onChange={(e) => handleAddSubCategoryChange(e.target.value)} disabled={!addCategoryId || addSubsForCat.length === 0} style={{ ...inputStyle(false), height: '30px', cursor: addCategoryId ? 'pointer' : 'not-allowed', opacity: (!addCategoryId || addSubsForCat.length === 0) ? 0.5 : 1 }}>
                    <option value="">— None —</option>
                    {addSubsForCat.map((s) => <option key={s.sub_category_id} value={s.sub_category_id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Budget badges */}

              <div className="exp-modal-actions" style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '13px' }}>
                <button type="button" onClick={() => !submitting && setAddModalOpen(false)} disabled={submitting} style={{ padding: '6px 13px', background: '#e0e0e0', color: '#333', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '10px' }}>Close</button>
                <button type="button" onClick={handleAddExpense} disabled={submitting || ((parseFloat(addBank) || 0) === 0 && (parseFloat(addCash) || 0) === 0)} style={{ padding: '6px 13px', background: '#166534', color: '#fff', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '10px' }}>{submitting ? 'Submitting...' : 'Add'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            ── Manage Categories & Budget modal ──
        ════════════════════════════════════════════════════════ */}
        {catModalOpen && (
          <div className="exp-modal-wrap" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setCatModalOpen(false)}>
            <div className="exp-modal-box" style={{ background: '#fff', borderRadius: '12px', padding: '0', width: 'min(580px, 95vw)', boxShadow: '0 10px 40px rgba(0,0,0,0.2)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>

              {/* Modal header */}
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#1e1e2e' }}>Manage Categories &amp; Budget</h3>
                <button type="button" onClick={() => setCatModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#999', padding: '2px 6px', borderRadius: '4px' }}>✕</button>
              </div>

              {/* Scrollable body */}
              <div style={{ overflowY: 'visible', padding: '16px 18px', flex: 1 }}>
                {catLoading ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading...</div>
                ) : (
                  <>
                    {/* ── Add new category ── */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>Add New Category</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: '8px', alignItems: 'center' }}>
                        <input type="text" placeholder="Category name" value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                          style={{ ...inputStyle(false), height: '30px' }} />
                        <input type="number" min="0" placeholder="Budget (Rs)" value={newCatBudget} onChange={(e) => setNewCatBudget(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                          style={{ ...inputStyle(false), height: '30px' }} />
                        <button type="button" onClick={handleAddCategory} disabled={submitting || !newCatName.trim()}
                          style={{ padding: '5px 13px', background: newCatName.trim() ? '#2563eb' : '#e0e0e0', color: newCatName.trim() ? '#fff' : '#999', border: 'none', borderRadius: '6px', cursor: newCatName.trim() ? 'pointer' : 'not-allowed', fontSize: '10px', fontWeight: '600', whiteSpace: 'nowrap', height: '30px' }}>
                          + Add
                        </button>
                      </div>
                    </div>

                    {/* ── Category list ── */}
                    {catList.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#aaa', fontSize: '11px', padding: '20px 0' }}>No categories yet. Add one above.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {catList.map((cat) => {
                          const catSubs = subCatList.filter((s) => s.category_id === cat.category_id);
                          const isExpanded = selectedManageCat === cat.category_id;
                          const isEditingCat = editCatInline?.category_id === cat.category_id;

                          return (
                            <div key={cat.category_id} style={{ border: '1px solid #e8e8e8', borderRadius: '8px', overflow: 'hidden' }}>
                              {/* Category row */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#fafafa', borderBottom: isExpanded ? '1px solid #e8e8e8' : 'none' }}>
                                {/* Expand toggle */}
                                <button type="button" onClick={() => setSelectedManageCat(isExpanded ? null : cat.category_id)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', fontSize: '11px', color: '#666', flexShrink: 0, width: '16px', textAlign: 'center' }}>
                                  {isExpanded ? '▾' : '▸'}
                                </button>

                                {isEditingCat ? (
                                  <>
                                    <input type="text" value={editCatInline.name} onChange={(e) => setEditCatInline((p) => ({ ...p, name: e.target.value }))}
                                      style={{ ...inputStyle(false), height: '26px', flex: 1, fontSize: '10px' }} autoFocus />
                                    <input type="number" min="0" placeholder="Budget" value={editCatInline.budget} onChange={(e) => setEditCatInline((p) => ({ ...p, budget: e.target.value }))}
                                      style={{ ...inputStyle(false), height: '26px', width: '110px', fontSize: '10px' }} />
                                    <button type="button" onClick={() => handleSaveCategory(cat)} disabled={submitting}
                                      style={{ padding: '3px 10px', background: '#166534', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '10px' }}>Save</button>
                                    <button type="button" onClick={() => setEditCatInline(null)}
                                      style={{ padding: '3px 8px', background: '#e0e0e0', color: '#333', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '10px' }}>✕</button>
                                  </>
                                ) : (
                                  <>
                                    <span style={{ flex: 1, fontSize: '11px', fontWeight: '600', color: '#1e1e2e' }}>{cat.name}</span>
                                    {cat.budget > 0 && (
                                      <span style={{ fontSize: '10px', color: '#6b7280', background: '#f0f0f0', padding: '2px 7px', borderRadius: '20px' }}>
                                        Budget: {formatAmount(cat.budget)}
                                      </span>
                                    )}
                                    <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '2px' }}>{catSubs.length} sub{catSubs.length !== 1 ? 's' : ''}</span>
                                    <button type="button" title="Edit" onClick={() => setEditCatInline({ category_id: cat.category_id, name: cat.name, budget: cat.budget ?? '' })}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px', fontSize: '12px', color: '#2563eb' }}>✎</button>
                                    <button type="button" title="Delete" onClick={() => handleDeleteCategory(cat.category_id)}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px', fontSize: '12px', color: '#b91c1c' }}>🗑</button>
                                  </>
                                )}
                              </div>

                              {/* Sub-categories (expanded) */}
                              {isExpanded && (
                                <div style={{ padding: '10px 12px 12px 32px', background: '#fff' }}>
                                  {catSubs.length === 0 && (
                                    <div style={{ fontSize: '10px', color: '#aaa', marginBottom: '8px' }}>No sub-categories yet.</div>
                                  )}
                                  {catSubs.map((sub) => {
                                    const isEditingSub = editSubInline?.sub_category_id === sub.sub_category_id;
                                    return (
                                      <div key={sub.sub_category_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
                                        <span style={{ fontSize: '10px', color: '#94a3b8', flexShrink: 0 }}>└</span>
                                        {isEditingSub ? (
                                          <>
                                            <input type="text" value={editSubInline.name} onChange={(e) => setEditSubInline((p) => ({ ...p, name: e.target.value }))}
                                              style={{ ...inputStyle(false), height: '24px', flex: 1, fontSize: '10px' }} autoFocus />
                                            <input type="number" min="0" placeholder="Budget" value={editSubInline.budget} onChange={(e) => setEditSubInline((p) => ({ ...p, budget: e.target.value }))}
                                              style={{ ...inputStyle(false), height: '24px', width: '100px', fontSize: '10px' }} />
                                            <button type="button" onClick={() => handleSaveSubCategory(sub)} disabled={submitting}
                                              style={{ padding: '2px 8px', background: '#166534', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>Save</button>
                                            <button type="button" onClick={() => setEditSubInline(null)}
                                              style={{ padding: '2px 6px', background: '#e0e0e0', color: '#333', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>✕</button>
                                          </>
                                        ) : (
                                          <>
                                            <span style={{ flex: 1, fontSize: '10px', color: '#374151' }}>{sub.name}</span>
                                            {sub.budget > 0 && (
                                              <span style={{ fontSize: '9px', color: '#6b7280', background: '#f0f0f0', padding: '1px 6px', borderRadius: '20px' }}>
                                                {formatAmount(sub.budget)}
                                              </span>
                                            )}
                                            <button type="button" title="Edit" onClick={() => setEditSubInline({ sub_category_id: sub.sub_category_id, category_id: sub.category_id, name: sub.name, budget: sub.budget ?? '' })}
                                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 5px', fontSize: '11px', color: '#2563eb' }}>✎</button>
                                            <button type="button" title="Delete" onClick={() => handleDeleteSubCategory(sub.category_id, sub.sub_category_id)}
                                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 5px', fontSize: '11px', color: '#b91c1c' }}>🗑</button>
                                          </>
                                        )}
                                      </div>
                                    );
                                  })}

                                  {/* Add sub-category inline */}
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: '6px', alignItems: 'center', marginTop: '8px' }}>
                                    <input type="text" placeholder="Sub-category name" value={newSubName} onChange={(e) => setNewSubName(e.target.value)}
                                      onKeyDown={(e) => e.key === 'Enter' && handleAddSubCategory(cat.category_id)}
                                      style={{ ...inputStyle(false), height: '26px', fontSize: '10px' }} />
                                    <input type="number" min="0" placeholder="Budget" value={newSubBudget} onChange={(e) => setNewSubBudget(e.target.value)}
                                      style={{ ...inputStyle(false), height: '26px', fontSize: '10px' }} />
                                    <button type="button" onClick={() => handleAddSubCategory(cat.category_id)} disabled={submitting || !newSubName.trim()}
                                      style={{ padding: '3px 10px', background: newSubName.trim() ? '#2563eb' : '#e0e0e0', color: newSubName.trim() ? '#fff' : '#999', border: 'none', borderRadius: '5px', cursor: newSubName.trim() ? 'pointer' : 'not-allowed', fontSize: '10px', whiteSpace: 'nowrap', height: '26px' }}>
                                      + Add
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Modal footer */}
              <div style={{ padding: '12px 18px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                <button type="button" onClick={() => setCatModalOpen(false)} style={{ padding: '6px 16px', background: '#e0e0e0', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '10px', fontWeight: '600' }}>Done</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}