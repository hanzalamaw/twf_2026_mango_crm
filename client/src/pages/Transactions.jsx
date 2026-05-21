import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { API_BASE as API } from '../config/api';

const HIDDEN_TYPES_BOOKING = ['Cow', 'Fancy Cow', 'Goat'];

const ORDER_COLUMNS = [
  { key: 'customer_id', label: 'Customer ID' },
  { key: 'order_id', label: 'Order ID' },
  { key: 'type', label: 'Type' },
  { key: 'booking_name', label: 'Booking Name' },
  { key: 'shareholder_name', label: 'Shareholder Name' },
  { key: 'phone_number', label: 'Phone' },
  { key: 'total_amount', label: 'Total Amount' },
  { key: 'bank', label: 'Bank' },
  { key: 'cash', label: 'Cash' },
  { key: 'received', label: 'Received' },
  { key: 'pending', label: 'Pending' },
  { key: 'reference', label: 'Reference' },
  { key: 'payment_status', label: 'Status' },
];

const AMOUNT_KEYS = ['total_amount', 'bank', 'cash', 'received', 'pending'];

const TYPE_COLORS = {
  'Hissa - Premium':  { bg: '#fff4f0', color: '#FF5722' },
  'Hissa - Standard': { bg: '#e8f4ff', color: '#2196F3' },
  'Hissa - Waqf':     { bg: '#edfbee', color: '#4CAF50' },
  'Goat (Hissa)':     { bg: '#fff8e8', color: '#FF9800' },
};

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

function StatusPill({ status }) {
  const isPending = status === 'Pending';
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: '72px',
        height: '22px',
        padding: '0 10px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: '600',
        whiteSpace: 'nowrap',
        border: '1px solid',
        textAlign: 'center',
        lineHeight: '20px',
        boxSizing: 'border-box',
        ...(isPending
          ? { color: '#C30730', background: '#FBEDF0', borderColor: '#C30730' }
          : { color: '#07C339', background: '#E6F9EB', borderColor: '#07C339' }),
      }}
    >
      {isPending ? 'Pending' : (status ? 'Received' : '—')}
    </span>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const PAGE_SIZE = 50;

export default function Transactions() {
  const [summary, setSummary] = useState(null);
  const [ordersSummary, setOrdersSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [amountVisible, setAmountVisible] = useState(false);
  const [filterMode, setFilterMode] = useState('onHand');
  const [modalOrder, setModalOrder] = useState(null);
  const [addBank, setAddBank] = useState('');
  const [addCash, setAddCash] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [paymentErrors, setPaymentErrors] = useState({});
  const [yearFilter, setYearFilter] = useState('2026');
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [appliedTypes, setAppliedTypes] = useState([]);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [filters, setFilters] = useState({ order_types: [] });
  const [searchQuery, setSearchQuery] = useState('');
  /** Debounced so we search the full dataset via API without firing every keystroke */
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const typeDropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const token = localStorage.getItem('token');
  const location = useLocation();
  const isFarm = location.pathname.startsWith('/farm');
  const isProcurement = location.pathname.startsWith('/procurement');
  const activeColumns = isProcurement
    ? [
        { key: 'order_id', label: 'Procurement ID' },
        { key: 'type', label: 'Type' },
        { key: 'booking_date', label: 'Date' },
        { key: 'total_amount', label: 'Total Amount' },
        { key: 'bank', label: 'Bank' },
        { key: 'cash', label: 'Cash' },
        { key: 'received', label: 'Received' },
        { key: 'pending', label: 'Pending' },
        { key: 'payment_status', label: 'Status' },
      ]
    : ORDER_COLUMNS;

  const onHandAvailable = yearFilter === '2026';
  const effectiveFilterMode = !onHandAvailable ? 'actual' : (appliedTypes.length > 0 ? 'actual' : filterMode);

  const fetchFilters = useCallback(async () => {
    try {
      const endpoint = isProcurement ? `${API}/procurement/filters` : `${API}/booking/orders/filters`;
      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setFilters(isProcurement ? { order_types: data.types || [] } : data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [token, isProcurement]);

  const fetchSummary = useCallback(async () => {
    try {
      const endpoint = isProcurement
        ? `${API}/procurement/transactions`
        : isFarm
          ? `${API}/farm/transactions`
          : `${API}/booking/transactions`;
      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary || null);
      }
    } catch (e) {
      console.error(e);
    }
  }, [token, isProcurement, isFarm]);

  const BOOKING_SUMMARY_TYPES = ['Hissa - Premium', 'Hissa - Standard', 'Hissa - Waqf', 'Goat (Hissa)'];

  const fetchOrdersSummary = useCallback(async () => {
    try {
      if (isProcurement) {
        const res = await fetch(`${API}/procurement/transactions`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setOrdersSummary({
            totalBank: Number(data?.summary?.totalBank ?? 0),
            totalCash: Number(data?.summary?.totalCash ?? 0),
          });
        }
        return;
      }
      if (isFarm) {
        const res = await fetch(`${API}/farm/orders/summary`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setOrdersSummary({
            totalBank: Number(data?.totalBank ?? 0),
            totalCash: Number(data?.totalCash ?? 0),
          });
        }
        return;
      }
      const params = new URLSearchParams();
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      BOOKING_SUMMARY_TYPES.forEach((t) => params.append('order_type', t));
      const res = await fetch(`${API}/booking/orders/summary?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setOrdersSummary(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [token, yearFilter, isFarm, isProcurement]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      appliedTypes.forEach((t) => params.append('order_type', t));
      if (isFarm && appliedTypes.length === 0) {
        params.append('order_type', 'Fancy Cow');
        params.append('order_type', 'Goat');
      }
      if (isProcurement && appliedTypes.length > 0) params.set('type', appliedTypes[0]);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (isProcurement) params.delete('order_type');

      if (debouncedSearch) params.set('search', debouncedSearch);
      if (paymentStatusFilter === 'pending' || paymentStatusFilter === 'received') {
        params.set('payment_status', paymentStatusFilter);
      }
      if (!isProcurement && !isFarm) params.set('omit_hidden_types', '1');

      const endpoint = isProcurement ? `${API}/procurement/transactions/list?${params.toString()}` : `${API}/booking/orders?${params.toString()}`;
      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.data) ? data.data : [];
        const filtered = list.filter((row) => {
          if (isProcurement) return true;
          if (isFarm) return ['Fancy Cow', 'Goat'].includes(row.type);
          return !HIDDEN_TYPES_BOOKING.includes(row.type);
        });
        setOrders(filtered);
        setTotalCount(typeof data.total === 'number' ? data.total : filtered.length);
      } else {
        setError('Failed to load orders');
      }
    } catch (e) {
      setError('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [token, yearFilter, appliedTypes, page, isFarm, isProcurement, debouncedSearch, paymentStatusFilter]);

  useEffect(() => { fetchFilters(); }, [fetchFilters]);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchOrdersSummary(); }, [fetchOrdersSummary]);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => { setPage(1); }, [yearFilter, appliedTypes, debouncedSearch, paymentStatusFilter]);

  useEffect(() => {
    if (onHandAvailable) {
      setFilterMode('actual');
    }
  }, [onHandAvailable]);

  useEffect(() => {
    if (!typeDropdownOpen) return;
    const onDocClick = (e) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target)) setTypeDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [typeDropdownOpen]);

  /* Search + payment status are applied in SQL (full dataset), then page/limit — not on the current page only */
  const openModal = (order) => {
    setModalOrder(order);
    setAddBank('');
    setAddCash('');
    setPaymentErrors({});
  };

  const toggleSelect = (id) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleSelectAll = () =>
    selectedIds.size === orders.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(orders.map((r) => r.order_id)));

  const handleExport = async () => {
    const ids = Array.from(selectedIds);
    try {
      const params = new URLSearchParams();
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      appliedTypes.forEach((t) => params.append('order_type', t));
      if (isFarm && appliedTypes.length === 0) {
        params.append('order_type', 'Fancy Cow');
        params.append('order_type', 'Goat');
      }
      if (isProcurement && appliedTypes.length > 0) params.set('type', appliedTypes[0]);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (paymentStatusFilter === 'pending' || paymentStatusFilter === 'received') {
        params.set('payment_status', paymentStatusFilter);
      }
      if (!isProcurement && !isFarm) params.set('omit_hidden_types', '1');
      if (isProcurement) params.delete('order_type');

      const limit = 200;
      let p = 1;
      let all = [];
      let total = 0;
      do {
        params.set('page', String(p));
        params.set('limit', String(limit));
        const endpoint = isProcurement
          ? `${API}/procurement/transactions/list?${params.toString()}`
          : `${API}/booking/orders?${params.toString()}`;
        const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          alert('Failed to load data for export');
          return;
        }
        const data = await res.json();
        const list = Array.isArray(data.data) ? data.data : [];
        total = typeof data.total === 'number' ? data.total : 0;
        all = all.concat(list);
        if (list.length < limit || all.length >= total) break;
        p += 1;
      } while (true);

      const filtered = all.filter((row) => {
        if (isProcurement) return true;
        if (isFarm) return ['Fancy Cow', 'Goat'].includes(row.type);
        return !HIDDEN_TYPES_BOOKING.includes(row.type);
      });
      const toExport = ids.length > 0 ? filtered.filter((r) => ids.includes(r.order_id)) : filtered;
      if (!toExport.length) {
        alert('No data to export');
        return;
      }

      const headers = activeColumns.map((c) => c.label);
      const amountKeys = ['total_amount', 'bank', 'cash', 'received', 'pending'];
      const rows = toExport.map((row) =>
        activeColumns.map((col) => {
          const val = row[col.key];
          if (amountKeys.includes(col.key)) {
            const n = Number(val);
            return Number.isFinite(n) ? n : val ?? '';
          }
          if (col.key === 'booking_date') return formatDate(val);
          if (col.key === 'payment_status') {
            return val === 'Pending' ? 'Pending' : val ? 'Received' : '—';
          }
          return val != null ? String(val) : '—';
        })
      );
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, isProcurement ? 'Procurement' : 'Transactions');
      XLSX.writeFile(wb, `transactions-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      alert('Export failed');
    }
  };

  const getPaymentRealtimeError = useCallback(() => {
    if (!modalOrder) return null;
    const bankVal = parseFloat(addBank);
    const cashVal = parseFloat(addCash);
    if (!Number.isNaN(bankVal) && bankVal < 0) return 'Amount cannot be negative.';
    if (!Number.isNaN(cashVal) && cashVal < 0) return 'Amount cannot be negative.';
    const pendingAmount = Number(modalOrder.pending) || 0;
    const addB = Math.max(0, Number.isNaN(bankVal) ? 0 : bankVal);
    const addC = Math.max(0, Number.isNaN(cashVal) ? 0 : cashVal);
    if (addB + addC > pendingAmount) return `Total added (Bank + Cash) cannot exceed pending (${formatAmount(pendingAmount)}).`;
    return null;
  }, [modalOrder, addBank, addCash]);

  const validatePayment = () => {
    const err = {};
    const bank = parseFloat(addBank);
    const cash = parseFloat(addCash);
    const addB = Math.max(0, Number.isNaN(bank) ? 0 : bank);
    const addC = Math.max(0, Number.isNaN(cash) ? 0 : cash);
    if (!Number.isNaN(bank) && bank < 0) err.addBank = 'Amount cannot be negative.';
    if (!Number.isNaN(cash) && cash < 0) err.addCash = 'Amount cannot be negative.';
    if (addB + addC === 0) err.add = 'Enter at least one amount (Add Bank or Add Cash ≥ 0).';
    const totalAmountVal = Number(modalOrder?.total_amount) || 0;
    const currentReceivedVal = Number(modalOrder?.received) || 0;
    const newReceivedVal = currentReceivedVal + addB + addC;
    if (newReceivedVal > totalAmountVal) err.add = err.add || `Total received cannot exceed total amount (${formatAmount(totalAmountVal)}).`;
    const pendingAmount = Number(modalOrder?.pending) || 0;
    if (addB + addC > pendingAmount) err.add = err.add || `Total added (Bank + Cash) cannot exceed pending (${formatAmount(pendingAmount)}).`;
    setPaymentErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSubmitPayment = async () => {
    if (!modalOrder) return;
    if (!validatePayment()) return;
    const bank = Math.max(0, parseFloat(addBank) || 0);
    const cash = Math.max(0, parseFloat(addCash) || 0);
    if (bank === 0 && cash === 0) return;
    setSubmitting(true);
    try {
      const endpoint = isProcurement
        ? `${API}/procurement/${encodeURIComponent(modalOrder.order_id)}/payments`
        : `${API}/booking/orders/${encodeURIComponent(modalOrder.order_id)}/payments`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bank, cash }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setModalOrder(null);
        setAddBank('');
        setAddCash('');
        fetchSummary();
        fetchOrders();
      } else {
        setError(data.message || 'Failed to add payment');
      }
    } catch (e) {
      setError('Failed to add payment');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && orders.length === 0) {
    return (
      <div style={{ padding: '19px', fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif" }}>
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '16px' }}>{isProcurement ? 'Procurement Transactions' : 'Transactions'}</h2>
        <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading...</div>
      </div>
    );
  }

  const typeOptions = (
    filters.order_types && filters.order_types.length > 0
      ? filters.order_types
      : [...new Set(orders.map((o) => o.type).filter(Boolean))].sort()
  ).filter((t) => (isProcurement ? true : (isFarm ? ['Fancy Cow', 'Goat'].includes(t) : !HIDDEN_TYPES_BOOKING.includes(t))));

  const s = summary || {};
  const totalExpensesBank = Number(s.totalExpensesBank) ?? 0;
  const totalExpensesCash = Number(s.totalExpensesCash) ?? 0;
  const os = ordersSummary || {};
  const fullDataTotalBank = Number(os.totalBank) ?? 0;
  const fullDataTotalCash = Number(os.totalCash) ?? 0;
  const bankOnlyAmount = effectiveFilterMode === 'onHand' ? fullDataTotalBank - totalExpensesBank : fullDataTotalBank;
  const cashAmount = effectiveFilterMode === 'onHand' ? fullDataTotalCash - totalExpensesCash : fullDataTotalCash;

  const currentBank = modalOrder ? Number(modalOrder.bank) || 0 : 0;
  const currentCash = modalOrder ? Number(modalOrder.cash) || 0 : 0;
  const newBank = currentBank + Math.max(0, parseFloat(addBank) || 0);
  const newCash = currentCash + Math.max(0, parseFloat(addCash) || 0);
  const currentReceived = modalOrder ? Number(modalOrder.received) || 0 : 0;
  const addTotal = Math.max(0, parseFloat(addBank) || 0) + Math.max(0, parseFloat(addCash) || 0);
  const newReceived = currentReceived + addTotal;
  const totalAmount = modalOrder ? Number(modalOrder.total_amount) || 0 : 0;
  const newPending = Math.max(0, totalAmount - newReceived);

  const isOnHandDisabled = !onHandAvailable || appliedTypes.length > 0;

  return (
    <>
      <style>{`
        @keyframes modalSheetInUp {
          from { opacity: 0; transform: translate3d(0, 100%, 0); }
          to   { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @media (max-width: 767px) {
          .txn-root              { padding: 16px 12px 24px !important; overflow: auto !important; }

          /* Top bar — same mobile title treatment as other pages (55px min, FAB clearance) */
          .txn-topbar           { flex-wrap: nowrap !important; gap: 8px !important; margin-bottom: 12px !important; align-items: center !important; min-height: 55px !important; padding-right: 0 !important; box-sizing: border-box !important; }
          .txn-topbar h2        {
            flex: 1 !important; min-width: 0 !important;
            padding: 0 clamp(48px, 14vw, 56px) 0 0 !important; margin: 0 !important;
            font-size: clamp(15px, 4.3vw, 17px) !important; font-weight: 600 !important; color: #333 !important;
            line-height: 1.25 !important; display: flex !important; align-items: center !important; box-sizing: border-box !important;
          }
          .txn-topbar-controls  { display: none !important; }
          .txn-mobile-fab-spacer { display: block !important; flex-shrink: 0 !important; }

          /* One row: Year + Filters (left) + Hide (right), vertically centered */
          .txn-mobile-toolbar-above    { display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 10px !important; margin-bottom: 10px !important; width: 100% !important; flex-wrap: nowrap !important; min-height: 40px !important; box-sizing: border-box !important; }
          .txn-mobile-toolbar-above-left { display: flex !important; align-items: center !important; gap: 8px !important; flex: 1 !important; min-width: 0 !important; flex-wrap: wrap !important; }
          .txn-mobile-toolbar-above .txn-mobile-year-lbl { font-size: 11px !important; color: #666 !important; white-space: nowrap !important; flex-shrink: 0 !important; }
          .txn-mobile-toolbar-above select { height: 38px !important; box-sizing: border-box !important; }
          .txn-mobile-toolbar-above .txn-mobile-filters-btn { height: 38px !important; box-sizing: border-box !important; display: inline-flex !important; align-items: center !important; }
          .txn-mobile-toolbar-above .txn-mobile-hide-btn  { height: 38px !important; min-width: 38px !important; padding: 0 10px !important; box-sizing: border-box !important; flex-shrink: 0 !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; }
          .txn-mobile-filter-shell     { display: block !important; width: 100% !important; }

          /* Summary cards — compact side by side */
          .txn-cards            { gap: 8px !important; margin-bottom: 12px !important; }
          .txn-card             { min-width: 0 !important; flex: 1 1 calc(50% - 4px) !important; padding: 10px 10px !important; }
          .txn-card-icon-wrap   { width: 44px !important; height: 44px !important; }
          .txn-card-icon-wrap img { width: 36px !important; height: 36px !important; }
          .txn-card-label       { font-size: 10px !important; }
          .txn-card-amount      { font-size: 13px !important; }
          .txn-card-amount span { min-width: unset !important; padding: 4px 6px !important; }

          /* Search + status */
          .txn-search-row                 { flex-direction: row !important; align-items: center !important; flex-wrap: nowrap !important; gap: 8px !important; margin-bottom: 10px !important; }
          .txn-search-bar                 { flex: 1 1 0 !important; min-width: 0 !important; max-width: none !important; }
          .txn-search-bar input           { font-size: 13px !important; padding: 10px 32px 10px 34px !important; border-radius: 8px !important; }
          .txn-status-wrap                { flex-shrink: 0 !important; width: auto !important; gap: 0 !important; }
          .txn-status-wrap label          { display: none !important; }
          .txn-status-wrap select         { padding: 10px 8px !important; font-size: 12px !important; min-width: 88px !important; max-width: 100px !important; border-radius: 8px !important; width: auto !important; cursor: pointer !important; }

          /* Hide chips + count on mobile */
          .txn-filter-chips     { display: none !important; }
          .txn-result-count     { display: none !important; }

          /* Table shown */
          .txn-table-wrap       { display: block !important; }
          .txn-mobile-cards     { display: none !important; }

          /* Pagination */
          .txn-pagination       { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }

          /* Payment modal — bottom sheet */
          .txn-modal-wrap       { align-items: flex-end !important; padding: 0 !important; }
          .txn-modal-box        {
            border-radius: 20px 20px 0 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            max-height: 92dvh !important;
            padding: 20px 16px 36px !important;
            animation: modalSheetInUp 0.38s cubic-bezier(0.25, 0.8, 0.25, 1) both !important;
          }
          .txn-modal-grid       { grid-template-columns: 1fr 1fr !important; gap: 8px 12px !important; font-size: 12px !important; }
          .txn-modal-input-grid { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
          .txn-modal-summary    { grid-template-columns: 1fr 1fr !important; }
          .txn-modal-actions    { gap: 10px !important; }
          .txn-modal-actions button { flex: 1 !important; padding: 13px !important; font-size: 13px !important; border-radius: 10px !important; }
          .txn-drag-handle      { display: block !important; }
        }
      `}</style>

    <div className="txn-root" style={{ padding: '19px', fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>

      {/* ── Top bar ── */}
      <div className="txn-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0, flexWrap: 'nowrap', gap: '10px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333', flexShrink: 0 }}>{isProcurement ? 'Procurement Transactions' : 'Transactions'}</h2>
        <div className="txn-topbar-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', marginLeft: 'auto' }} ref={typeDropdownRef}>

          {/* Year filter */}
          <label style={{ fontSize: '10px', color: '#666', whiteSpace: 'nowrap' }}>Year</label>
          <select
            value={yearFilter}
            onChange={(e) => {
              setYearFilter(e.target.value);
              setAppliedTypes([]);
              setSelectedTypes([]);
            }}
            style={{ padding: '6px 10px', fontSize: '10px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', minWidth: '96px', cursor: 'pointer' }}
          >
            <option value="all">All</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>

          {/* Type multi-select */}
          <label style={{ fontSize: '12px', color: '#666', whiteSpace: 'nowrap' }}>Type</label>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setTypeDropdownOpen((v) => !v)}
              style={{ padding: '6px 10px', fontSize: '10px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', minWidth: '112px', maxWidth: '160px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: selectedTypes.length === 0 ? '10px' : '13px' }}>
                {selectedTypes.length === 0 ? 'Select types...' : selectedTypes.length === 1 ? selectedTypes[0] : `${selectedTypes.length} selected`}
              </span>
              <span style={{ flexShrink: 0 }}>{typeDropdownOpen ? '▲' : '▼'}</span>
            </button>
            {typeDropdownOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '3px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px', boxShadow: '0 3px 10px rgba(0,0,0,0.12)', padding: '6px', minWidth: '144px', zIndex: 100 }}>
                {typeOptions.length === 0 ? (
                  <div style={{ padding: '6px', color: '#666', fontSize: '10px' }}>No types in this year</div>
                ) : (
                  typeOptions.map((t) => (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 6px', cursor: 'pointer', borderRadius: '3px', fontSize: '10px' }}>
                      <input
                        type="checkbox"
                        checked={selectedTypes.includes(t)}
                        onChange={() => setSelectedTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}
                      />
                      <span>{t}</span>
                    </label>
                  ))
                )}
                <div style={{ borderTop: '1px solid #eee', marginTop: '6px', paddingTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setAppliedTypes([...selectedTypes]); setTypeDropdownOpen(false); }}
                    style={{ width: '100%', padding: '5px 10px', fontSize: '10px', fontWeight: '500', background: '#166534', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Amount / On Hand filter */}
          <label style={{ fontSize: '10px', color: isOnHandDisabled ? '#bbb' : '#666', whiteSpace: 'nowrap' }}>Amount</label>
          <select
            value={effectiveFilterMode}
            onChange={(e) => setFilterMode(e.target.value)}
            disabled={isOnHandDisabled}
            style={{
              padding: '6px 10px',
              fontSize: '10px',
              borderRadius: '6px',
              border: '1px solid #e0e0e0',
              background: isOnHandDisabled ? '#f5f5f5' : '#fff',
              minWidth: '80px',
              cursor: isOnHandDisabled ? 'not-allowed' : 'pointer',
              color: isOnHandDisabled ? '#aaa' : undefined,
            }}
          >
            <option value="onHand" disabled={isOnHandDisabled}>On Hand</option>
            <option value="actual">Actual</option>
          </select>

          <button
            type="button"
            onClick={handleExport}
            style={{ padding: '6px 13px', fontSize: '10px', fontWeight: '600', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Export
          </button>

          {/* Show/hide amounts — desktop */}
          <button
            type="button"
            onClick={() => setAmountVisible((v) => !v)}
            title={amountVisible ? 'Hide' : 'Show'}
            style={{ padding: '6px 8px', fontSize: '10px', fontWeight: '500', background: '#f0f0f0', color: '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <img src={amountVisible ? '/icons/hide.png' : '/icons/show.png'} alt={amountVisible ? 'Hide' : 'Show'} style={{ width: '18px', height: '18px', display: 'block' }} />
          </button>
        </div>

        <div className="txn-mobile-fab-spacer" aria-hidden style={{ display: 'none', width: 46, height: 46, flexShrink: 0 }} />
      </div>

      {error && (
        <div style={{ padding: '12px', background: '#FFF5F2', color: '#C62828', borderRadius: '8px', marginBottom: '16px', flexShrink: 0 }}>{error}</div>
      )}

      {/* Mobile: Year + Filters + Hide on one row (aligned) */}
      <div className="txn-mobile-toolbar-above" style={{ display: 'none', flexShrink: 0 }}>
        <div className="txn-mobile-toolbar-above-left">
          <span className="txn-mobile-year-lbl">Year</span>
          <select
            value={yearFilter}
            onChange={(e) => { setYearFilter(e.target.value); setAppliedTypes([]); setSelectedTypes([]); }}
            style={{ padding: '0 10px', fontSize: '12px', borderRadius: '8px', border: '1px solid #e0e0e0', background: '#fff', minWidth: '88px', cursor: 'pointer' }}
          >
            <option value="all">All</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>
          <button
            type="button"
            className="txn-mobile-filters-btn"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            style={{ padding: '0 12px', borderRadius: '8px', border: `1px solid ${mobileFiltersOpen ? '#FF5722' : '#e0e0e0'}`, background: mobileFiltersOpen ? '#fff4f0' : '#fff', color: mobileFiltersOpen ? '#FF5722' : '#555', fontSize: '12px', fontWeight: '500', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            ⚙ Filters
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button type="button" onClick={handleExport} style={{ padding: '0 10px', height: 38, fontSize: '11px', fontWeight: '600', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
            Export
          </button>
        <button
          type="button"
          className="txn-mobile-hide-btn"
          onClick={() => setAmountVisible((v) => !v)}
          title={amountVisible ? 'Hide' : 'Show'}
          style={{ fontSize: '10px', fontWeight: '500', background: '#f0f0f0', color: '#333', border: '1px solid #e0e0e0', borderRadius: '8px', cursor: 'pointer' }}
        >
          <img src={amountVisible ? '/icons/hide.png' : '/icons/show.png'} alt={amountVisible ? 'Hide' : 'Show'} style={{ width: '18px', height: '18px', display: 'block' }} />
        </button>
        </div>
      </div>

      <div className="txn-mobile-filter-shell" style={{ display: 'none', flexShrink: 0 }}>
        {mobileFiltersOpen && (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '6px', fontWeight: '500' }}>Order Type</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {typeOptions.length === 0 ? (
                  <div style={{ color: '#999', fontSize: '12px' }}>No types available</div>
                ) : typeOptions.map((t) => {
                  const tc = TYPE_COLORS[t] || { bg: '#f3f4f6', color: '#374151' };
                  const checked = selectedTypes.includes(t);
                  return (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${checked ? tc.color : '#e5e7eb'}`, background: checked ? tc.bg : '#fafafa', cursor: 'pointer' }}>
                      <input type="checkbox" checked={checked} onChange={() => setSelectedTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])} style={{ accentColor: tc.color }} />
                      <span style={{ fontSize: '13px', fontWeight: checked ? '600' : '400', color: checked ? tc.color : '#374151' }}>{t}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '6px', fontWeight: '500' }}>Amount Mode</label>
              <select
                value={effectiveFilterMode}
                onChange={(e) => setFilterMode(e.target.value)}
                disabled={isOnHandDisabled}
                style={{ width: '100%', padding: '10px 12px', fontSize: '13px', borderRadius: '8px', border: '1px solid #e0e0e0', background: isOnHandDisabled ? '#f5f5f5' : '#fff', color: isOnHandDisabled ? '#aaa' : '#333' }}
              >
                <option value="onHand" disabled={isOnHandDisabled}>On Hand</option>
                <option value="actual">Actual</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => { setAppliedTypes([...selectedTypes]); setMobileFiltersOpen(false); }}
                style={{ flex: 1, padding: '11px', background: '#166534', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => { setSelectedTypes([]); setAppliedTypes([]); setMobileFiltersOpen(false); }}
                style={{ flex: 1, padding: '11px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Summary cards ── */}
      <div className="txn-cards" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px', flexShrink: 0 }}>
        {/* Bank Only card */}
        <div className="txn-card" style={{ flex: '1 1 160px', minWidth: '160px', padding: '14px 12px', borderRadius: '10px', border: '1px solid #f1f1f1', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '8px', position: 'relative', overflow: 'hidden' }}>
          <div className="txn-card-icon-wrap" style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src="/icons/total_orders_amount.png" alt="" style={{ width: '50px', height: '50px', objectFit: 'contain' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px' }}>
            <div className="txn-card-label" style={{ fontSize: '11px', fontWeight: '400', color: '#6b7280' }}>Bank Only</div>
            <div className="txn-card-amount" style={{ fontSize: '18px', fontWeight: '600', color: '#111827', lineHeight: '1.2' }}>
              {amountVisible
                ? <span>{formatAmount(bankOnlyAmount)}</span>
                : <span style={{ filter: 'blur(6px)', userSelect: 'none', display: 'inline-block', minWidth: '120px', background: 'rgba(0,0,0,0.03)', borderRadius: '10px', padding: '6px 10px' }}>{formatAmount(bankOnlyAmount)}</span>}
            </div>
          </div>
        </div>

        {/* Cash card */}
        <div className="txn-card" style={{ flex: '1 1 160px', minWidth: '160px', padding: '14px 12px', borderRadius: '10px', border: '1px solid #f1f1f1', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '8px', position: 'relative', overflow: 'hidden' }}>
          <div className="txn-card-icon-wrap" style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src="/icons/total_orders_amount.png" alt="" style={{ width: '50px', height: '50px', objectFit: 'contain' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px' }}>
            <div className="txn-card-label" style={{ fontSize: '11px', fontWeight: '400', color: '#6b7280' }}>Cash</div>
            <div className="txn-card-amount" style={{ fontSize: '18px', fontWeight: '600', color: '#111827', lineHeight: '1.2' }}>
              {amountVisible
                ? <span>{formatAmount(cashAmount)}</span>
                : <span style={{ filter: 'blur(6px)', userSelect: 'none', display: 'inline-block', minWidth: '120px', background: 'rgba(0,0,0,0.03)', borderRadius: '10px', padding: '6px 10px' }}>{formatAmount(cashAmount)}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Search + Status filter row ── */}
      <div className="txn-search-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {/* Search bar */}
        <div className="txn-search-bar" style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px', maxWidth: '380px' }}>
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
            <SearchIcon />
          </span>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '7px 32px 7px 30px',
              fontSize: '10px',
              borderRadius: '6px',
              border: '1px solid #e0e0e0',
              background: '#fff',
              outline: 'none',
              color: '#333',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
              style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
            >
              <XIcon />
            </button>
          )}
        </div>

        {/* Payment status filter */}
        <div className="txn-status-wrap" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '10px', color: '#666', whiteSpace: 'nowrap' }}>Status</label>
          <select
            value={paymentStatusFilter}
            onChange={(e) => { setPaymentStatusFilter(e.target.value); setPage(1); }}
            style={{ padding: '7px 10px', fontSize: '10px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', minWidth: '130px', cursor: 'pointer' }}
          >
            <option value="all">All</option>
            <option value="received">Received Payments</option>
            <option value="pending">Pending Payments</option>
          </select>
        </div>

        {/* Active filter chips */}
        {(searchQuery || paymentStatusFilter !== 'all') && (
          <div className="txn-filter-chips" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {searchQuery && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: '#EFF6FF', color: '#1D4ED8', borderRadius: '4px', fontSize: '10px', fontWeight: '500' }}>
                "{searchQuery}"
                <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, color: '#1D4ED8' }}>×</button>
              </span>
            )}
            {paymentStatusFilter !== 'all' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: paymentStatusFilter === 'pending' ? '#FBEDF0' : '#E6F9EB', color: paymentStatusFilter === 'pending' ? '#C30730' : '#07C339', borderRadius: '4px', fontSize: '10px', fontWeight: '500' }}>
                {paymentStatusFilter === 'pending' ? 'Pending Payments' : 'Received Payments'}
                <button type="button" onClick={() => setPaymentStatusFilter('all')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, color: 'inherit' }}>×</button>
              </span>
            )}
          </div>
        )}

        {/* Result count when filtered */}
        {(debouncedSearch || paymentStatusFilter !== 'all') && (
          <span className="txn-result-count" style={{ fontSize: '10px', color: '#888', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {totalCount} matching order{totalCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Table (desktop + mobile) ── */}
      <div className="txn-table-wrap" style={{ flex: 1, minHeight: '260px', overflow: 'auto' }}>
        <div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap', width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={orders.length > 0 && selectedIds.size === orders.length}
                      onChange={toggleSelectAll}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  {activeColumns.map((col) => (
                    <th
                      key={col.key}
                      style={{
                        padding: '10px 8px',
                        textAlign: ['total_amount', 'bank', 'cash', 'received', 'pending'].includes(col.key) ? 'right' : 'left',
                        fontWeight: '600',
                        color: '#333',
                        borderBottom: '2px solid #e0e0e0',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={activeColumns.length + 1} style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>
                      {debouncedSearch || paymentStatusFilter !== 'all' ? 'No orders match your filters.' : 'No orders.'}
                    </td>
                  </tr>
                ) : (
                  orders.map((row) => (
                    <tr
                      key={row.order_id}
                      onClick={() => openModal(row)}
                      style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#fafafa'}
                      onMouseLeave={(e) => e.currentTarget.style.background = ''}
                    >
                      <td
                        style={{ padding: '6px', whiteSpace: 'nowrap', fontSize: '11px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.order_id)}
                          onChange={() => toggleSelect(row.order_id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      {activeColumns.map((col) => (
                        <td
                          key={col.key}
                          style={{
                            padding: '8px',
                            textAlign: ['total_amount', 'bank', 'cash', 'received', 'pending'].includes(col.key) ? 'right' : 'left',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {col.key === 'payment_status' ? (
                            <StatusPill status={row[col.key]} />
                          ) : ['total_amount', 'bank', 'cash', 'received', 'pending'].includes(col.key) ? (
                            formatAmount(row[col.key])
                          ) : (
                            row[col.key] != null ? String(row[col.key]) : '—'
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Pagination ── */}
      {!loading && totalCount > 0 && Math.ceil(totalCount / PAGE_SIZE) > 1 && (
        <div className="txn-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '12px 0', borderTop: '1px solid #e0e0e0', marginTop: '8px' }}>
          <span style={{ fontSize: '13px', color: '#666' }}>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount} orders
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{ padding: '6px 12px', fontSize: '10px', background: page <= 1 ? '#f0f0f0' : '#fff', color: page <= 1 ? '#999' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
            >
              Previous
            </button>
            {(() => {
              const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
              const showPages = 5;
              let start = Math.max(1, page - Math.floor(showPages / 2));
              let end = Math.min(totalPages, start + showPages - 1);
              if (end - start + 1 < showPages) start = Math.max(1, end - showPages + 1);
              const pages = [];
              for (let i = start; i <= end; i++) pages.push(i);
              return pages.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  style={{ minWidth: '32px', padding: '6px 10px', fontSize: '10px', background: p === page ? '#FF5722' : '#fff', color: p === page ? '#fff' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', fontWeight: p === page ? 600 : 400 }}
                >
                  {p}
                </button>
              ));
            })()}
            <button
              type="button"
              disabled={page >= Math.ceil(totalCount / PAGE_SIZE)}
              onClick={() => setPage((p) => Math.min(Math.ceil(totalCount / PAGE_SIZE) || 1, p + 1))}
              style={{ padding: '6px 12px', fontSize: '10px', background: page >= Math.ceil(totalCount / PAGE_SIZE) ? '#f0f0f0' : '#fff', color: page >= Math.ceil(totalCount / PAGE_SIZE) ? '#999' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: page >= Math.ceil(totalCount / PAGE_SIZE) ? 'not-allowed' : 'pointer' }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ── Payment modal ── */}
      {modalOrder && (
        <div
          className="txn-modal-wrap"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => !submitting && setModalOrder(null)}
        >
          <div
            className="txn-modal-box"
            style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', width: 'min(520px, 95vw)', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="txn-drag-handle" style={{ display: 'none', width: '40px', height: '4px', background: '#e0e0e0', borderRadius: '2px', margin: '0 auto 16px' }} />

            <h3 style={{ margin: '0 0 13px 0', fontSize: '13px', fontWeight: '600' }}>Update Transaction</h3>

            <div style={{ fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Previous (current state)</div>
            <div className="txn-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: '13px', fontSize: '10px', padding: '8px 10px', background: '#f5f5f5', borderRadius: '6px', border: '1px solid #e8e8e8' }}>
              <div><span style={{ color: '#666' }}>Customer ID</span><div style={{ fontWeight: '600' }}>{modalOrder.customer_id ?? '—'}</div></div>
              <div><span style={{ color: '#666' }}>Order ID</span><div style={{ fontWeight: '600' }}>{modalOrder.order_id ?? '—'}</div></div>
              <div><span style={{ color: '#666' }}>Name</span><div style={{ fontWeight: '600' }}>{modalOrder.shareholder_name ?? modalOrder.booking_name ?? '—'}</div></div>
              <div><span style={{ color: '#666' }}>Contact</span><div style={{ fontWeight: '600' }}>{modalOrder.phone_number ?? '—'}</div></div>
              <div><span style={{ color: '#666' }}>Booking Date</span><div style={{ fontWeight: '600' }}>{formatDate(modalOrder.booking_date)}</div></div>
              <div><span style={{ color: '#666' }}>Total Price</span><div style={{ fontWeight: '600' }}>{formatAmount(modalOrder.total_amount)}</div></div>
              <div><span style={{ color: '#666' }}>Current Bank</span><div style={{ fontWeight: '600' }}>{formatAmount(modalOrder.bank)}</div></div>
              <div><span style={{ color: '#666' }}>Current Cash</span><div style={{ fontWeight: '600' }}>{formatAmount(modalOrder.cash)}</div></div>
              <div><span style={{ color: '#666' }}>Current Received</span><div style={{ fontWeight: '600' }}>{formatAmount(modalOrder.received)}</div></div>
              <div><span style={{ color: '#666' }}>Current Pending</span><div style={{ fontWeight: '600' }}>{formatAmount(modalOrder.pending)}</div></div>
            </div>

            {(getPaymentRealtimeError() || paymentErrors.add || paymentErrors.addBank || paymentErrors.addCash) && (
              <div style={{ marginBottom: '10px', padding: '6px', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px', fontSize: '10px' }}>
                {getPaymentRealtimeError()}
                {!getPaymentRealtimeError() && paymentErrors.add}
                {paymentErrors.addBank && <div>Add Bank: {paymentErrors.addBank}</div>}
                {paymentErrors.addCash && <div>Add Cash: {paymentErrors.addCash}</div>}
              </div>
            )}

            <div className="txn-modal-input-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Add Cash</label>
                <input
                  type="number" min="0" step="0.01" value={addCash}
                  onChange={(e) => { setAddCash(e.target.value); setPaymentErrors((p) => ({ ...p, addCash: undefined, addBank: undefined, add: undefined })); }}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: (getPaymentRealtimeError() || paymentErrors.addCash) ? '1px solid #dc2626' : '1px solid #e0e0e0' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Add Bank</label>
                <input
                  type="number" min="0" step="0.01" value={addBank}
                  onChange={(e) => { setAddBank(e.target.value); setPaymentErrors((p) => ({ ...p, addBank: undefined, addCash: undefined, add: undefined })); }}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: (getPaymentRealtimeError() || paymentErrors.addBank) ? '1px solid #dc2626' : '1px solid #e0e0e0' }}
                />
              </div>
            </div>

            <div className="txn-modal-summary" style={{ padding: '10px', background: '#f9fafb', borderRadius: '6px', marginBottom: '13px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '10px' }}>
              <div><span style={{ color: '#666' }}>New Bank Total</span><div style={{ fontWeight: '600' }}>{formatAmount(newBank)}</div></div>
              <div><span style={{ color: '#666' }}>New Cash Total</span><div style={{ fontWeight: '600' }}>{formatAmount(newCash)}</div></div>
              <div><span style={{ color: '#666' }}>New Received Total</span><div style={{ fontWeight: '600' }}>{formatAmount(newReceived)}</div></div>
              <div><span style={{ color: '#666' }}>New Pending</span><div style={{ fontWeight: '600' }}>{formatAmount(newPending)}</div></div>
            </div>

            <div className="txn-modal-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => !submitting && setModalOrder(null)} disabled={submitting} style={{ padding: '8px 16px', background: '#e0e0e0', color: '#333', border: 'none', borderRadius: '8px', cursor: submitting ? 'not-allowed' : 'pointer' }}>Close</button>
              <button
                type="button"
                onClick={handleSubmitPayment}
                disabled={submitting || !!getPaymentRealtimeError() || ((parseFloat(addBank) || 0) === 0 && (parseFloat(addCash) || 0) === 0)}
                style={{ padding: '8px 16px', background: '#166534', color: '#fff', border: 'none', borderRadius: '8px', cursor: submitting ? 'not-allowed' : 'pointer' }}
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}