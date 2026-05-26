import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../config/api';
import { getOperationsSocket } from '../utils/operationsSocket';
import { useAuth } from '../context/AuthContext';
import { Link, useLocation } from 'react-router-dom';
import { getDescriptionText, getOrderTag, getChallanRowHighlight } from '../utils/orderTags';
import {
  GOAT_HISSA_EXCLUSIVE,
  GOAT_HISSA_PREMIUM,
  GOAT_HISSA_SUPER,
  normalizeOrderType,
  HISSA_COUNT_TABLE_HEADERS,
  getTableHissaCounts,
  hissaCountCellValues,
} from '../utils/operationsOrderTypes';
import {
  OpsFilterSearch,
  OpsFilterSelect,
  OpsFilterToggleRow,
  OpsFilterToggleBtn,
  OpsFilterMobile,
} from '../components/OpsFilters';
import RiderAttendanceModal from '../components/RiderAttendanceModal';

const RIDER_STATUSES = ['Available', 'On Delivery', 'Off Duty', 'Suspended'];

function riderStatusBadge(status) {
  const st = status || 'Available';
  const map = {
    Available: { bg: '#E8F5E9', fg: '#2E7D32' },
    'On Delivery': { bg: '#E3F2FD', fg: '#1565C0' },
    'Off Duty': { bg: '#FFF8E1', fg: '#F57C00' },
    Suspended: { bg: '#FFEBEE', fg: '#C62828' },
  };
  const { bg, fg } = map[st] || map.Available;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '999px',
        fontSize: '10px',
        fontWeight: '600',
        background: bg,
        color: fg,
        whiteSpace: 'nowrap',
      }}
    >
      {st}
    </span>
  );
}

function money(n) {
  return `Rs. ${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDurationSeconds(sec) {
  const s = Number(sec);
  if (!Number.isFinite(s) || s < 0) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return r > 0 ? `${m}m ${r}s` : `${m}m`;
  return `${r}s`;
}

function formatAvgDispatchToDeliver(r) {
  const delivered = Number(r.deliveries_completed || 0);
  if (delivered <= 0) return '—';
  const avg = r.avg_dispatch_to_deliver_seconds;
  if (avg == null || !Number.isFinite(avg)) {
    return 'No timing data yet';
  }
  return formatDurationSeconds(Math.round(avg));
}

function normalizedSupervisorId(rider) {
  const v = rider?.supervisor_id;
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 11px',
  borderRadius: '8px',
  border: '1px solid #e0e0e0',
  fontSize: '12px',
  background: '#fff',
};

const compactSelectStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid #e0e0e0',
  fontSize: '11px',
  background: '#FAFAFA',
  color: '#333',
};

const CHALLAN_STATUS_STYLES = {
  Pending: { bg: '#F5F5F5', fg: '#666' },
  'Rider Assigned': { bg: '#FFF8E1', fg: '#F57C00' },
  Dispatched: { bg: '#E3F2FD', fg: '#1565C0' },
  Delivered: { bg: '#E8F5E9', fg: '#2E7D32' },
  'Returned to Farm': { bg: '#FFEBEE', fg: '#C62828' },
};

function ChallanDeliveryStatusBadge({ status }) {
  const st = status || 'Pending';
  const { bg, fg } = CHALLAN_STATUS_STYLES[st] || CHALLAN_STATUS_STYLES.Pending;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 9px',
        borderRadius: '999px',
        fontSize: '10px',
        fontWeight: '600',
        background: bg,
        color: fg,
        whiteSpace: 'nowrap',
      }}
    >
      {st}
    </span>
  );
}

function NoBadge({ value }) {
  const text = value != null && value !== '' ? String(value) : '—';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 9px',
        borderRadius: '999px',
        fontSize: '10px',
        fontWeight: '700',
        background: '#F5F5F5',
        color: '#666',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

function splitUniqueCsvValues(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [values])
        .flatMap((v) => (Array.isArray(v) ? v : String(v || '').split(',')))
        .map((v) => String(v || '').trim())
        .filter(Boolean)
    ),
  ];
}

function MultiLineCell({ values, empty = '—' }) {
  const list = splitUniqueCsvValues(values);
  return list.length ? (
    <div style={{ whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.45 }}>
      {list.map((v, i) => (
        <div key={`${v}-${i}`}>{v}</div>
      ))}
    </div>
  ) : (
    <span style={{ color: '#ccc' }}>{empty}</span>
  );
}

function deriveChallanStatusFromOrders(orders) {
  const statuses = (orders || [])
    .filter((o) => o && typeof o === 'object')
    .map((o) => o.delivery_status || 'Pending');
  const allDelivered = statuses.length > 0 && statuses.every((s) => s === 'Delivered');
  const anyReturned = statuses.some((s) => s === 'Returned to Farm');
  const anyDispatched = statuses.some((s) => s === 'Dispatched');
  const anyRiderAssigned = statuses.some((s) => s === 'Rider Assigned');
  let derivedStatus = 'Pending';
  if (allDelivered) derivedStatus = 'Delivered';
  else if (anyReturned) derivedStatus = 'Returned to Farm';
  else if (anyDispatched) derivedStatus = 'Dispatched';
  else if (anyRiderAssigned) derivedStatus = 'Rider Assigned';
  return derivedStatus;
}

function groupRiderAssignedOrdersByChallan(flatOrders) {
  if (!Array.isArray(flatOrders) || flatOrders.length === 0) return [];
  const rows = flatOrders.filter((o) => o && typeof o === 'object');
  if (rows.length === 0) return [];
  const byC = new Map();
  for (const o of rows) {
    const cid = o.challan_id;
    if (!byC.has(cid)) byC.set(cid, []);
    byC.get(cid).push(o);
  }
  const groups = [];
  for (const [, orders] of byC) {
    const first = orders[0];
    let std = 0;
    let prem = 0;
    let waqf = 0;
    let exc = 0;
    let sg = 0;
    let pg = 0;
    let eg = 0;
    for (const o of orders) {
      const t = normalizeOrderType(o.order_type);
      if (t === 'Hissa - Standard') std += 1;
      else if (t === 'Hissa Premium') prem += 1;
      else if (t === 'Hissa - Waqf') waqf += 1;
      else if (t === 'Hissa - Exclusive') exc += 1;
      else if (t === GOAT_HISSA_SUPER) sg += 1;
      else if (t === GOAT_HISSA_PREMIUM) pg += 1;
      else if (t === GOAT_HISSA_EXCLUSIVE) eg += 1;
    }
    const bookingNames = [...new Set(orders.map((x) => x.booking_name).filter(Boolean))];
    const customerIds = [...new Set(orders.map((x) => x.customer_id).filter(Boolean))];
    const contacts = [...new Set(orders.map((x) => x.contact).filter(Boolean))];
    const altContacts = [...new Set(orders.map((x) => x.alt_contact).filter(Boolean))];
    const slots = new Set();
    for (const o of orders) {
      String(o.slot || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => slots.add(s));
    }
    const slotsArr = [...slots].sort();
    const gid = first.challan_id != null ? String(first.challan_id) : `unknown-${groups.length}`;
    groups.push({
      group_key: gid,
      challan_id: first.challan_id,
      derived_status: deriveChallanStatusFromOrders(orders),
      booking_names: bookingNames,
      standard_hissa_count: std,
      premium_hissa_count: prem,
      waqf_hissa_count: waqf,
      exclusive_hissa_count: exc,
      super_goat_hissa_count: sg,
      premium_goat_hissa_count: pg,
      exclusive_goat_hissa_count: eg,
      goat_hissa_count: sg + pg + eg,
      hissa_count: std + prem + waqf + exc + sg + pg + eg,
      day: first.day,
      slots: slotsArr,
      slot: first.slot,
      area: first.area,
      address: first.address,
      contacts,
      alt_contacts: altContacts,
      customer_ids: customerIds,
      description: first.challan_description ?? null,
      orders,
    });
  }
  groups.sort((a, b) => {
    const da = String(a.day || '');
    const db = String(b.day || '');
    if (da !== db) return da.localeCompare(db);
    const na = Number(a.challan_id);
    const nb = Number(b.challan_id);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a.challan_id ?? '').localeCompare(String(b.challan_id ?? ''));
  });
  return groups;
}

export default function OperationsRiders() {
  const { authFetch } = useAuth();
  const location = useLocation();

  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [err, setErr] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [supervisorFilter, setSupervisorFilter] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRider, setEditRider] = useState(null);
  const [editForm, setEditForm] = useState({
    rider_name: '',
    contact: '',
    vehicle: '',
    cnic: '',
    number_plate: '',
    availability: 'Available',
    amount_per_delivery: '',
    total_paid: '',
    supervisor_id: '',
  });
  const [ordersModal, setOrdersModal] = useState(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [attendanceRider, setAttendanceRider] = useState(null);

  const [adminTab, setAdminTab] = useState('riders');
  const [supervisors, setSupervisors] = useState([]);
  const [supLoading, setSupLoading] = useState(false);
  const [addSupOpen, setAddSupOpen] = useState(false);
  const [supForm, setSupForm] = useState({ supervisor_name: '', phone: '', user_id: '' });
  const [userCandidates, setUserCandidates] = useState([]);
  const [supDetailOpen, setSupDetailOpen] = useState(false);
  const [supDetail, setSupDetail] = useState(null);
  const [supDetailLoading, setSupDetailLoading] = useState(false);
  const [supervisorOptions, setSupervisorOptions] = useState([]);
  const [editSupOpen, setEditSupOpen] = useState(false);
  const [editSupSaving, setEditSupSaving] = useState(false);
  const [editSupId, setEditSupId] = useState(null);
  const [editSupForm, setEditSupForm] = useState({ supervisor_name: '', phone: '', user_id: '' });
  const [editSupUserList, setEditSupUserList] = useState([]);

  const [form, setForm] = useState({
    rider_name: '',
    contact: '',
    vehicle: '',
    cnic: '',
    number_plate: '',
    amount_per_delivery: '',
  });

  const assignedOrderGroups = useMemo(() => {
    try {
      return groupRiderAssignedOrdersByChallan(ordersModal?.orders);
    } catch (e) {
      console.error('[OperationsRiders] group assigned orders', e);
      return [];
    }
  }, [ordersModal?.orders]);

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (dayFilter) qs.set('day', dayFilter);

      const [res, supRes] = await Promise.all([
        authFetch(`${API_BASE}/operations/riders/details${qs.toString() ? `?${qs.toString()}` : ''}`),
        authFetch(`${API_BASE}/operations/supervisors`),
      ]);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to load riders');

      setRiders(data.riders || []);
      const supData = await supRes.json().catch(() => ({}));
      if (supRes.ok) setSupervisorOptions(supData.supervisors || []);
    } catch (e) {
      setErr(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [authFetch, dayFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const loadSupervisors = useCallback(async () => {
    setSupLoading(true);
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/supervisors`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to load supervisors');
      setSupervisors(data.supervisors || []);
      const ucRes = await authFetch(`${API_BASE}/operations/supervisors/user-candidates`);
      const ucData = await ucRes.json().catch(() => ({}));
      if (ucRes.ok) setUserCandidates(ucData.users || []);
    } catch (e) {
      setErr(e.message || 'Supervisors load failed');
    } finally {
      setSupLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    const isSupervisorTab = location.pathname.startsWith('/operations/riders/supervisors');
    setAdminTab(isSupervisorTab ? 'supervisors' : 'riders');
  }, [location.pathname]);

  useEffect(() => {
    if (adminTab === 'supervisors') loadSupervisors();
  }, [adminTab, loadSupervisors]);

  useEffect(() => {
    const socket = getOperationsSocket();
    const refresh = (payload) => {
      const event = payload?.event;
      // riders/supervisors mutations affect supervisor tab data too.
      if (event === 'riders:changed' || event === 'supervisors:changed') {
        loadSupervisors();
      }
      load();
    };
    socket.on('operations:changed', refresh);
    return () => {
      socket.off('operations:changed', refresh);
    };
  }, [load, loadSupervisors]);

  const filteredRiders = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = riders;

    if (q) {
      list = list.filter((r) => {
        const hay = [
          r.rider_name,
          r.contact,
          r.vehicle,
          r.number_plate,
          r.cnic,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }

    if (statusFilter) {
      list = list.filter((r) => (r.availability || 'Available') === statusFilter);
    }

    if (supervisorFilter === '__unassigned__') {
      list = list.filter((r) => normalizedSupervisorId(r) == null);
    } else if (supervisorFilter) {
      const want = Number(supervisorFilter);
      if (Number.isFinite(want) && want > 0) {
        list = list.filter((r) => normalizedSupervisorId(r) === want);
      }
    }

    return list;
  }, [riders, search, statusFilter, supervisorFilter]);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setDayFilter('');
    setSupervisorFilter('');
  };

  const patchRider = async (riderId, payload) => {
    setSavingId(riderId);
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/riders/${riderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      await load();
    } catch (e) {
      setErr(e.message || 'Update failed');
    } finally {
      setSavingId(null);
    }
  };

  const openEditRider = (rider) => {
    setEditRider(rider);
    setEditForm({
      rider_name: rider.rider_name || '',
      contact: rider.contact || '',
      vehicle: rider.vehicle || '',
      cnic: rider.cnic || '',
      number_plate: rider.number_plate || '',
      availability: rider.availability || 'Available',
      amount_per_delivery: rider.amount_per_delivery ?? '',
      total_paid: rider.total_paid ?? '',
      supervisor_id: rider.supervisor_id != null && rider.supervisor_id !== '' ? String(rider.supervisor_id) : '',
    });
    setEditOpen(true);
  };

  const closeEditRider = () => {
    setEditOpen(false);
    setEditRider(null);
  };

  const submitEditRider = async (e) => {
    e.preventDefault();
    if (!editRider?.rider_id) return;
    setSavingId(editRider.rider_id);
    setErr('');
    try {
      const payload = {
        rider_name: editForm.rider_name,
        contact: editForm.contact || null,
        vehicle: editForm.vehicle || null,
        cnic: editForm.cnic || null,
        number_plate: editForm.number_plate || null,
        availability: editForm.availability || 'Available',
        amount_per_delivery: editForm.amount_per_delivery === '' ? 0 : Number(editForm.amount_per_delivery),
        total_paid: editForm.total_paid === '' ? 0 : Number(editForm.total_paid),
        supervisor_id: editForm.supervisor_id === '' ? null : Number(editForm.supervisor_id),
      };
      const res = await authFetch(`${API_BASE}/operations/riders/${editRider.rider_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      closeEditRider();
      await load();
    } catch (e2) {
      setErr(e2.message || 'Update failed');
    } finally {
      setSavingId(null);
    }
  };

  const deleteRider = async () => {
    if (!editRider?.rider_id) return;
    const ok = window.confirm(`Delete rider "${editRider.rider_name || 'this rider'}"? This will remove the rider from active operations.`);
    if (!ok) return;
    setSavingId(editRider.rider_id);
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/riders/${editRider.rider_id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Delete failed');
      closeEditRider();
      await load();
    } catch (e2) {
      setErr(e2.message || 'Delete failed');
    } finally {
      setSavingId(null);
    }
  };

  const openOrders = async (rider) => {
    setOrdersModal({ rider, orders: [], loadError: null });
    setOrdersLoading(true);
    setErr('');
    try {
      const qs = new URLSearchParams();
      if (dayFilter) qs.set('day', dayFilter);

      const res = await authFetch(
        `${API_BASE}/operations/riders/${rider.rider_id}/orders${qs.toString() ? `?${qs.toString()}` : ''}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to load rider orders');

      setOrdersModal({
        rider: data.rider || rider,
        orders: Array.isArray(data.orders) ? data.orders : [],
        loadError: null,
      });
    } catch (e) {
      const msg = e.message || 'Failed to load rider orders';
      setErr(msg);
      setOrdersModal((prev) => (prev ? { ...prev, orders: [], loadError: msg } : prev));
    } finally {
      setOrdersLoading(false);
    }
  };

  const openSupervisorDetail = async (s) => {
    setSupDetailOpen(true);
    setSupDetail(null);
    setSupDetailLoading(true);
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/supervisors/${s.supervisor_id}/riders`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to load supervisor');
      setSupDetail(data);
    } catch (e) {
      setErr(e.message || 'Failed to load supervisor');
    } finally {
      setSupDetailLoading(false);
    }
  };

  const submitSupervisor = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/supervisors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supervisor_name: supForm.supervisor_name.trim(),
          phone: supForm.phone.trim() || null,
          user_id: Number(supForm.user_id),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Create failed');
      setAddSupOpen(false);
      setSupForm({ supervisor_name: '', phone: '', user_id: '' });
      await loadSupervisors();
      await load();
    } catch (e2) {
      setErr(e2.message || 'Create failed');
    }
  };

  const openEditSupervisor = async (s, e) => {
    e?.stopPropagation?.();
    setErr('');
    setEditSupId(s.supervisor_id);
    setEditSupForm({
      supervisor_name: s.supervisor_name || '',
      phone: s.phone || '',
      user_id: s.user_id != null ? String(s.user_id) : '',
    });
    setEditSupOpen(true);
    try {
      const res = await authFetch(
        `${API_BASE}/operations/supervisors/user-candidates?for_supervisor_id=${encodeURIComponent(s.supervisor_id)}`
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) setEditSupUserList(data.users || []);
      else setEditSupUserList([]);
    } catch {
      setEditSupUserList([]);
    }
  };

  const submitEditSupervisor = async (e) => {
    e.preventDefault();
    if (!editSupId) return;
    const patchedId = editSupId;
    setEditSupSaving(true);
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/supervisors/${patchedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supervisor_name: editSupForm.supervisor_name.trim(),
          phone: editSupForm.phone.trim() || null,
          user_id: Number(editSupForm.user_id),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      setEditSupOpen(false);
      setEditSupId(null);
      setEditSupForm({ supervisor_name: '', phone: '', user_id: '' });
      await loadSupervisors();
      await load();
      if (supDetailOpen && Number(supDetail?.supervisor?.supervisor_id) === Number(patchedId)) {
        setSupDetailOpen(false);
        setSupDetail(null);
      }
    } catch (e2) {
      setErr(e2.message || 'Update failed');
    } finally {
      setEditSupSaving(false);
    }
  };

  const deleteSupervisor = async (s, e) => {
    e?.stopPropagation?.();
    const label = `${s.supervisor_name || '—'} (${s.supervisor_code || s.supervisor_id})`;
    const ok = window.confirm(
      `Delete supervisor "${label}"?\n\nRiders assigned to this supervisor will be unassigned (supervisor cleared). This cannot be undone.`
    );
    if (!ok) return;
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/supervisors/${s.supervisor_id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Delete failed');
      await loadSupervisors();
      await load();
      if (supDetailOpen && supDetail?.supervisor?.supervisor_id === s.supervisor_id) {
        setSupDetailOpen(false);
        setSupDetail(null);
      }
    } catch (e2) {
      setErr(e2.message || 'Delete failed');
    }
  };

  const submitAddRider = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/riders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rider_name: form.rider_name,
          contact: form.contact || null,
          vehicle: form.vehicle || null,
          cnic: form.cnic || null,
          number_plate: form.number_plate || null,
          amount_per_delivery: form.amount_per_delivery === '' ? 0 : Number(form.amount_per_delivery),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to create rider');

      setForm({
        rider_name: '',
        contact: '',
        vehicle: '',
        cnic: '',
        number_plate: '',
        amount_per_delivery: '',
      });
      setAddOpen(false);
      await load();
    } catch (e2) {
      setErr(e2.message || 'Failed to create rider');
    }
  };

  return (
    <>
      <style>{`
        .or-back-to-ops,
        .or-back-to-ops:visited {
          color: #000;
        }
        @keyframes orModalSheetInUp {
          from { opacity: 0; transform: translate3d(0, 100%, 0); }
          to   { opacity: 1; transform: translate3d(0, 0, 0); }
        }

        @media (max-width: 767px) {
          .or-root { padding: 16px 12px 24px !important; overflow: auto !important; }
          .or-header { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; margin-bottom: 12px !important; padding-right: 58px !important; box-sizing: border-box !important; }
          .or-header h2 {
            min-height: 55px !important;
            display: flex !important;
            align-items: center !important;
            margin: 0 !important;
            font-size: clamp(15px, 4.3vw, 17px) !important;
            font-weight: 600 !important;
            color: #333 !important;
            line-height: 1.25 !important;
          }
          .or-filter-desktop { display: none !important; }
          .or-filter-toggle { display: flex !important; }
          .or-filter-mobile { display: block !important; }
          .or-grid {
            grid-template-columns: 1fr !important;
          }

          /* Rider modals — slide up from bottom (booking management style) */
          .ops-sheet-overlay.or-rider-modal-overlay {
            align-items: flex-end !important;
            justify-content: center !important;
            padding: 0 !important;
          }
          .ops-sheet-panel.or-rider-modal-panel {
            border-radius: 20px 20px 0 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            max-height: 92dvh !important;
            margin: 0 !important;
            padding: 20px 16px 32px !important;
            overflow-y: auto !important;
            overflow-x: visible !important;
            animation: orModalSheetInUp 0.38s cubic-bezier(0.25, 0.8, 0.25, 1) both !important;
          }
          .or-modal-subtitle { display: none !important; }
          .or-modal-form-grid { grid-template-columns: 1fr !important; }
          .or-modal-actions-row {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .or-modal-actions-row > div { width: 100% !important; display: flex !important; flex-direction: column !important; gap: 8px !important; }
          .or-modal-actions-row button { width: 100% !important; }
        }
      `}</style>

      <div
        className="or-root"
        style={{
          padding: '19px',
          fontFamily: "'Poppins','Inter',sans-serif",
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          height: '100%',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <div
          className="or-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            flexWrap: 'wrap',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          <div>
            <Link
              to="/operations"
              className="or-back-to-ops"
              style={{
                display: 'inline-block',
                marginBottom: '8px',
                fontSize: '12px',
                fontWeight: 600,
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
              }}
            >
              ← Operations modules
            </Link>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333', whiteSpace: 'nowrap' }}>
              Rider Management
            </h2>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '11px',
                color: '#888',
                fontWeight: '500',
                lineHeight: 1.45,
                maxWidth: '760px',
              }}
            >
              Register riders, track availability, update operational status, and monitor delivery earnings and assigned orders.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {savingId && adminTab === 'riders' && (
              <span style={{ fontSize: '10px', color: '#999', fontWeight: '600', alignSelf: 'center' }}>
                Saving…
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                load();
                loadSupervisors();
              }}
              style={{
                padding: '7px 13px',
                background: '#fff',
                color: '#555',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Refresh
            </button>
            {adminTab === 'riders' && (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                style={{
                  padding: '7px 13px',
                  background: '#FF5722',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Add Rider
              </button>
            )}
            {adminTab === 'supervisors' && (
              <button
                type="button"
                onClick={() => {
                  setSupForm({ supervisor_name: '', phone: '', user_id: '' });
                  setAddSupOpen(true);
                }}
                style={{
                  padding: '7px 13px',
                  background: '#FF5722',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Add Supervisor
              </button>
            )}
          </div>
        </div>

        {adminTab === 'riders' && (
        <>
        <div
          className="or-filter-desktop"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            marginBottom: '16px',
            alignItems: 'flex-end',
            minWidth: 0,
            flexShrink: 0,
          }}
        >
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>
              Search (name, phone, vehicle)
            </label>
            <input
              type="text"
              placeholder="Search rider…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, padding: '6px 10px', fontSize: '11px' }}
            />
          </div>

          <div style={{ width: 140 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>
              Rider status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ ...inputStyle, padding: '6px 10px', fontSize: '11px' }}
            >
              <option value="">All</option>
              {RIDER_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div style={{ width: 110 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>
              Day
            </label>
            <select
              value={dayFilter}
              onChange={(e) => setDayFilter(e.target.value)}
              style={{ ...inputStyle, padding: '6px 10px', fontSize: '11px' }}
            >
              <option value="">All</option>
              <option value="Day 1">Day 1</option>
              <option value="Day 2">Day 2</option>
              <option value="Day 3">Day 3</option>
            </select>
          </div>

          <div style={{ flex: '1 1 200px', minWidth: 160, maxWidth: 280 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>
              Supervisor
            </label>
            <select
              value={supervisorFilter}
              onChange={(e) => setSupervisorFilter(e.target.value)}
              style={{ ...inputStyle, padding: '6px 10px', fontSize: '11px' }}
            >
              <option value="">All supervisors</option>
              <option value="__unassigned__">Unassigned</option>
              {supervisorOptions.map((s) => (
                <option key={s.supervisor_id} value={String(s.supervisor_id)}>
                  {s.supervisor_name || '—'}
                  {s.supervisor_code ? ` (${s.supervisor_code})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={resetFilters}
              style={{
                padding: '6px 13px',
                height: '29px',
                background: '#fff',
                color: '#555',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Reset
            </button>
          </div>
        </div>

        <OpsFilterToggleRow className="or-filter-toggle">
          <OpsFilterSearch value={search} onChange={setSearch} placeholder="Search rider…" />
          <OpsFilterToggleBtn open={mobileFiltersOpen} onClick={() => setMobileFiltersOpen((v) => !v)} />
        </OpsFilterToggleRow>

        <OpsFilterMobile
          className="or-filter-mobile"
          open={mobileFiltersOpen}
          onDone={() => setMobileFiltersOpen(false)}
          onReset={() => { resetFilters(); setMobileFiltersOpen(false); }}
        >
          <OpsFilterSelect value={statusFilter} onChange={setStatusFilter} ariaLabel="Rider status">
            <option value="">All statuses</option>
            {RIDER_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
          </OpsFilterSelect>
          <OpsFilterSelect value={dayFilter} onChange={setDayFilter} ariaLabel="Day">
            <option value="">All days</option>
            <option value="Day 1">Day 1</option>
            <option value="Day 2">Day 2</option>
            <option value="Day 3">Day 3</option>
          </OpsFilterSelect>
          <OpsFilterSelect value={supervisorFilter} onChange={setSupervisorFilter} ariaLabel="Supervisor">
            <option value="">All supervisors</option>
            <option value="__unassigned__">Unassigned</option>
            {supervisorOptions.map((s) => (
              <option key={s.supervisor_id} value={String(s.supervisor_id)}>
                {s.supervisor_name || '—'}{s.supervisor_code ? ` (${s.supervisor_code})` : ''}
              </option>
            ))}
          </OpsFilterSelect>
        </OpsFilterMobile>

        {err && (
          <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', flexShrink: 0, fontSize: '10px', fontWeight: '600' }}>
            {err}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>
              Loading…
            </div>
          ) : filteredRiders.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#666', fontSize: '11px', border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff' }}>
              {riders.length === 0 ? 'No riders found.' : 'No riders match the current filters.'}
            </div>
          ) : (
            <div
              className="or-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '14px',
              }}
            >
              {filteredRiders.map((r) => (
                <div
                  key={r.rider_id}
                  onClick={() => openEditRider(r)}
                  title="Click to edit rider"
                  style={{
                    background: '#fff',
                    border: '1px solid #e8e8e8',
                    borderRadius: '14px',
                    padding: '14px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#333', lineHeight: 1.3 }}>
                        {r.rider_name}
                      </h3>
                      <p style={{ margin: '5px 0 0', fontSize: '11px', color: '#777', lineHeight: 1.5 }}>
                        {r.contact || 'No phone'} {r.vehicle ? `• ${r.vehicle}` : ''} {r.number_plate ? `• ${r.number_plate}` : ''}
                      </p>
                      <p style={{ margin: '6px 0 0', fontSize: '10px', color: '#999', lineHeight: 1.4 }}>
                        Supervisor:{' '}
                        <span style={{ color: '#555', fontWeight: 600 }}>
                          {r.supervisor_name || r.supervisor_code
                            ? `${r.supervisor_name || '—'}${r.supervisor_code ? ` (${r.supervisor_code})` : ''}`
                            : '—'}
                        </span>
                      </p>
                      <p style={{ margin: '6px 0 0', fontSize: '10px', color: '#999', lineHeight: 1.45 }}>
                        Average delivery time:{' '}
                        <span style={{ color: '#1565C0', fontWeight: 600 }}>{formatAvgDispatchToDeliver(r)}</span>
                      </p>
                    </div>
                    {riderStatusBadge(r.availability)}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: '10px',
                      background: '#FAFAFA',
                      borderRadius: '10px',
                      padding: '10px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Delivered hissa</div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>{r.deliveries_completed || 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Pending hissa</div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>{r.pending_hissa_count ?? r.pending_deliveries ?? 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Per delivery</div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>{money(r.amount_per_delivery)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Total made</div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>{money(r.total_amount_made)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Total paid</div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>{money(r.total_paid)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Balance due</div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: r.balance_due > 0 ? '#C62828' : '#2E7D32' }}>
                        {money(r.balance_due)}
                      </div>
                    </div>
                  </div>

                  <div onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '4px' }}>
                        Change status
                      </label>
                      <select
                        value={r.availability || 'Available'}
                        onChange={(e) => patchRider(r.rider_id, { availability: e.target.value })}
                        style={compactSelectStyle}
                        disabled={savingId === r.rider_id}
                      >
                        {RIDER_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '4px' }}>
                        Amount / delivery
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={r.amount_per_delivery || 0}
                        onBlur={(e) => {
                          const next = Number(e.target.value || 0);
                          if (Number(next) !== Number(r.amount_per_delivery || 0)) {
                            patchRider(r.rider_id, { amount_per_delivery: next });
                          }
                        }}
                        style={compactSelectStyle}
                        disabled={savingId === r.rider_id}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '4px' }}>
                        Total paid
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={r.total_paid || 0}
                        onBlur={(e) => {
                          const next = Number(e.target.value || 0);
                          if (Number(next) !== Number(r.total_paid || 0)) {
                            patchRider(r.rider_id, { total_paid: next });
                          }
                        }}
                        style={compactSelectStyle}
                        disabled={savingId === r.rider_id}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => openOrders(r)}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #e0e0e0',
                          background: '#fff',
                          color: '#333',
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer',
                        }}
                      >
                        View assigned orders
                      </button>
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                      <button
                        type="button"
                        onClick={() => setAttendanceRider(r)}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: 'none',
                          background: '#FF5722',
                          color: '#fff',
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer',
                        }}
                      >
                        Mark Attendance
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </>
        )}

        {adminTab === 'supervisors' && (
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {supLoading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading…</div>
            ) : (
              <div className="ops-table-scroll" style={{ border: '1px solid #e8e8e8', borderRadius: '12px', overflow: 'auto', background: '#fff' }}>
                <table className="ops-data-table" style={{ borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: '#FAFAFA' }}>
                      {['Code', 'Name', 'Phone', 'User', 'Riders', 'Actions'].map((h) => (
                        <th key={h} style={{ textAlign: h === 'Actions' ? 'right' : 'left', padding: '10px', borderBottom: '1px solid #eee', color: '#555', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {supervisors.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#888' }}>
                          No supervisors yet. Use &quot;Add Supervisor&quot; to create one and link a login user.
                        </td>
                      </tr>
                    ) : (
                      supervisors.map((s) => (
                        <tr
                          key={s.supervisor_id}
                          onClick={() => openSupervisorDetail(s)}
                          style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#f9f9ff'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
                        >
                          <td style={{ padding: '10px', fontWeight: 700, color: '#E65100' }}>{s.supervisor_code}</td>
                          <td style={{ padding: '10px' }}>{s.supervisor_name}</td>
                          <td style={{ padding: '10px' }}>{s.phone || '—'}</td>
                          <td style={{ padding: '10px' }}>{s.username || s.email || '—'}</td>
                          <td style={{ padding: '10px', fontWeight: 600 }}>{s.rider_count ?? 0}</td>
                          <td
                            style={{ padding: '10px', textAlign: 'right', whiteSpace: 'nowrap' }}
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => openSupervisorDetail(s)}
                              style={{
                                marginRight: 6,
                                padding: '4px 10px',
                                fontSize: '10px',
                                fontWeight: 600,
                                border: '1px solid #e0e0e0',
                                borderRadius: '6px',
                                background: '#fff',
                                color: '#FF5722',
                                cursor: 'pointer',
                              }}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={(ev) => openEditSupervisor(s, ev)}
                              style={{
                                marginRight: 6,
                                padding: '4px 10px',
                                fontSize: '10px',
                                fontWeight: 600,
                                border: '1px solid #e0e0e0',
                                borderRadius: '6px',
                                background: '#fff',
                                color: '#333',
                                cursor: 'pointer',
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={(ev) => deleteSupervisor(s, ev)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '10px',
                                fontWeight: 600,
                                border: '1px solid #FFCDD2',
                                borderRadius: '6px',
                                background: '#FFEBEE',
                                color: '#C62828',
                                cursor: 'pointer',
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {editSupOpen && (
        <div
          className="ops-sheet-overlay or-rider-modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1040,
            padding: '16px',
          }}
          onClick={() => { if (!editSupSaving) { setEditSupOpen(false); setEditSupId(null); } }}
          role="presentation"
        >
          <div
            className="ops-sheet-panel or-rider-modal-panel"
            style={{
              background: '#fff',
              borderRadius: '16px',
              border: '1px solid #eee',
              padding: '18px',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Edit supervisor"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>Edit supervisor</h3>
              <button
                type="button"
                disabled={editSupSaving}
                onClick={() => { setEditSupOpen(false); setEditSupId(null); }}
                style={{ background: 'none', border: 'none', fontSize: '22px', color: '#888', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
            <form onSubmit={submitEditSupervisor}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Supervisor name</label>
                  <input
                    required
                    value={editSupForm.supervisor_name}
                    onChange={(e) => setEditSupForm((p) => ({ ...p, supervisor_name: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Phone</label>
                  <input
                    value={editSupForm.phone}
                    onChange={(e) => setEditSupForm((p) => ({ ...p, phone: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>User account</label>
                  <select
                    required
                    value={editSupForm.user_id}
                    onChange={(e) => setEditSupForm((p) => ({ ...p, user_id: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">Select user…</option>
                    {editSupUserList.map((u) => (
                      <option key={u.user_id} value={String(u.user_id)}>
                        {u.username} {u.email ? `(${u.email})` : ''}
                      </option>
                    ))}
                  </select>
                  <p style={{ margin: '6px 0 0', fontSize: '10px', color: '#999' }}>
                    Users already linked to another supervisor are hidden. Current login stays available.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button
                  type="button"
                  disabled={editSupSaving}
                  onClick={() => { setEditSupOpen(false); setEditSupId(null); }}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e0e0e0', background: '#fff', fontSize: '12px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSupSaving}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: 'none', background: '#FF5722', color: '#fff', fontSize: '12px', fontWeight: '600', cursor: 'pointer', opacity: editSupSaving ? 0.7 : 1 }}
                >
                  {editSupSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {addSupOpen && (
        <div
          className="ops-sheet-overlay or-rider-modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1040,
            padding: '16px',
          }}
          onClick={() => setAddSupOpen(false)}
          role="presentation"
        >
          <div
            className="ops-sheet-panel or-rider-modal-panel"
            style={{
              background: '#fff',
              borderRadius: '16px',
              border: '1px solid #eee',
              padding: '18px',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Add supervisor"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>Add supervisor</h3>
              <button type="button" onClick={() => setAddSupOpen(false)} style={{ background: 'none', border: 'none', fontSize: '22px', color: '#888', cursor: 'pointer' }}>×</button>
            </div>
            <form onSubmit={submitSupervisor}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Supervisor name</label>
                  <input
                    required
                    value={supForm.supervisor_name}
                    onChange={(e) => setSupForm((p) => ({ ...p, supervisor_name: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Phone</label>
                  <input
                    value={supForm.phone}
                    onChange={(e) => setSupForm((p) => ({ ...p, phone: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>User account</label>
                  <select
                    required
                    value={supForm.user_id}
                    onChange={(e) => setSupForm((p) => ({ ...p, user_id: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">Select user…</option>
                    {userCandidates.map((u) => (
                      <option key={u.user_id} value={String(u.user_id)}>
                        {u.username} {u.email ? `(${u.email})` : ''}
                      </option>
                    ))}
                  </select>
                  <p style={{ margin: '6px 0 0', fontSize: '10px', color: '#999' }}>Only users not already linked to a supervisor are listed.</p>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" onClick={() => setAddSupOpen(false)} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e0e0e0', background: '#fff', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '10px 14px', borderRadius: '8px', border: 'none', background: '#FF5722', color: '#fff', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {supDetailOpen && (
        <div
          className="ops-sheet-overlay or-rider-modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1040,
            padding: '16px',
          }}
          onClick={() => { setSupDetailOpen(false); setSupDetail(null); }}
          role="presentation"
        >
          <div
            className="ops-sheet-panel or-rider-modal-panel"
            style={{
              background: '#fff',
              borderRadius: '16px',
              border: '1px solid #eee',
              padding: '18px',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '85vh',
              overflow: 'auto',
              boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Supervisor detail</h3>
              <button type="button" onClick={() => { setSupDetailOpen(false); setSupDetail(null); }} style={{ background: 'none', border: 'none', fontSize: '22px', color: '#888', cursor: 'pointer' }}>×</button>
            </div>
            {supDetailLoading ? (
              <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: '#666' }}>Loading…</div>
            ) : supDetail?.supervisor ? (
              <>
                <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#555' }}>
                  <strong>{supDetail.supervisor.supervisor_code}</strong> — {supDetail.supervisor.supervisor_name}
                </p>
                <p style={{ margin: '0 0 16px', fontSize: '11px', color: '#888' }}>Phone: {supDetail.supervisor.phone || '—'}</p>
                <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: '#333' }}>Assigned riders</h4>
                {(supDetail.riders || []).length === 0 ? (
                  <p style={{ fontSize: '11px', color: '#999' }}>No riders assigned to this supervisor.</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11px', color: '#444' }}>
                    {(supDetail.riders || []).map((r) => (
                      <li key={r.rider_id} style={{ marginBottom: '4px' }}>{r.rider_name} {r.contact ? `· ${r.contact}` : ''}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p style={{ fontSize: '11px', color: '#999' }}>No data.</p>
            )}
          </div>
        </div>
      )}

      {addOpen && (
        <div
          className="ops-sheet-overlay or-rider-modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => setAddOpen(false)}
          role="presentation"
        >
          <div
            className="ops-sheet-panel or-rider-modal-panel"
            style={{
              background: '#fff',
              borderRadius: '16px',
              border: '1px solid #eee',
              padding: '18px',
              width: '100%',
              maxWidth: '520px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Add rider"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>Add new rider</h3>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '22px', color: '#888', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <form onSubmit={submitAddRider}>
              <div className="or-modal-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Rider name</label>
                  <input
                    type="text"
                    required
                    value={form.rider_name}
                    onChange={(e) => setForm((p) => ({ ...p, rider_name: e.target.value }))}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Phone</label>
                  <input
                    type="text"
                    value={form.contact}
                    onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Vehicle</label>
                  <input
                    type="text"
                    value={form.vehicle}
                    onChange={(e) => setForm((p) => ({ ...p, vehicle: e.target.value }))}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>CNIC</label>
                  <input
                    type="text"
                    value={form.cnic}
                    onChange={(e) => setForm((p) => ({ ...p, cnic: e.target.value }))}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Vehicle number</label>
                  <input
                    type="text"
                    value={form.number_plate}
                    onChange={(e) => setForm((p) => ({ ...p, number_plate: e.target.value }))}
                    style={inputStyle}
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Amount per delivery</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount_per_delivery}
                    onChange={(e) => setForm((p) => ({ ...p, amount_per_delivery: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0',
                    background: '#fff',
                    color: '#555',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#FF5722',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Save rider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editOpen && editRider && (
        <div
          className="ops-sheet-overlay or-rider-modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1050,
            padding: '16px',
          }}
          onClick={closeEditRider}
          role="presentation"
        >
          <div
            className="ops-sheet-panel or-rider-modal-panel"
            style={{
              background: '#fff',
              borderRadius: '16px',
              border: '1px solid #eee',
              padding: '18px',
              width: '100%',
              maxWidth: '620px',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Edit rider"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>Edit rider</h3>
                <p className="or-modal-subtitle" style={{ margin: '5px 0 0', fontSize: '11px', color: '#777' }}>Update rider profile, status, payment rate, or delete rider.</p>
              </div>
              <button
                type="button"
                onClick={closeEditRider}
                style={{ background: 'none', border: 'none', fontSize: '22px', color: '#888', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <form onSubmit={submitEditRider}>
              <div className="or-modal-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Rider name</label>
                  <input type="text" required value={editForm.rider_name} onChange={(e) => setEditForm((p) => ({ ...p, rider_name: e.target.value }))} style={inputStyle} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Phone</label>
                  <input type="text" value={editForm.contact} onChange={(e) => setEditForm((p) => ({ ...p, contact: e.target.value }))} style={inputStyle} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Vehicle</label>
                  <input type="text" value={editForm.vehicle} onChange={(e) => setEditForm((p) => ({ ...p, vehicle: e.target.value }))} style={inputStyle} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>CNIC</label>
                  <input type="text" value={editForm.cnic} onChange={(e) => setEditForm((p) => ({ ...p, cnic: e.target.value }))} style={inputStyle} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Vehicle number</label>
                  <input type="text" value={editForm.number_plate} onChange={(e) => setEditForm((p) => ({ ...p, number_plate: e.target.value }))} style={inputStyle} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Availability</label>
                  <select value={editForm.availability} onChange={(e) => setEditForm((p) => ({ ...p, availability: e.target.value }))} style={inputStyle}>
                    {RIDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Amount per delivery</label>
                  <input type="number" min="0" step="0.01" value={editForm.amount_per_delivery} onChange={(e) => setEditForm((p) => ({ ...p, amount_per_delivery: e.target.value }))} style={inputStyle} />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Total paid</label>
                  <input type="number" min="0" step="0.01" value={editForm.total_paid} onChange={(e) => setEditForm((p) => ({ ...p, total_paid: e.target.value }))} style={inputStyle} />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Supervisor</label>
                  <select
                    value={editForm.supervisor_id}
                    onChange={(e) => setEditForm((p) => ({ ...p, supervisor_id: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">— Unassigned —</option>
                    {supervisorOptions.map((s) => (
                      <option key={s.supervisor_id} value={String(s.supervisor_id)}>
                        {s.supervisor_code} — {s.supervisor_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="or-modal-actions-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={deleteRider}
                  disabled={savingId === editRider.rider_id}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #ffcdd2',
                    background: '#fff5f5',
                    color: '#C62828',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: savingId === editRider.rider_id ? 'not-allowed' : 'pointer',
                  }}
                >
                  Delete rider
                </button>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={closeEditRider}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #e0e0e0',
                      background: '#fff',
                      color: '#555',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingId === editRider.rider_id}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      background: savingId === editRider.rider_id ? '#ffab91' : '#FF5722',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: savingId === editRider.rider_id ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Save changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {ordersModal && (
        <div
          className="ops-sheet-overlay or-rider-modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px',
          }}
          onClick={() => setOrdersModal(null)}
          role="presentation"
        >
          <div
            className="ops-sheet-panel or-rider-modal-panel"
            style={{
              background: '#fff',
              borderRadius: '16px',
              border: '1px solid #eee',
              padding: '18px',
              width: '100%',
              maxWidth: '1200px',
              maxHeight: '88vh',
              overflowY: 'auto',
              overflowX: 'visible',
              boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Assigned rider orders"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>
                  {ordersModal.rider?.rider_name} — Assigned orders
                </h3>
                <p className="or-modal-subtitle" style={{ margin: '5px 0 0', fontSize: '11px', color: '#777' }}>
                  {ordersModal.rider?.contact || 'No phone'} {ordersModal.rider?.vehicle ? `• ${ordersModal.rider.vehicle}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOrdersModal(null)}
                style={{ background: 'none', border: 'none', fontSize: '22px', color: '#888', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {ordersLoading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#666', fontSize: '12px' }}>Loading…</div>
            ) : ordersModal.loadError ? (
              <div style={{ padding: '16px', background: '#FFF5F2', color: '#C62828', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>
                {ordersModal.loadError}
              </div>
            ) : assignedOrderGroups.length ? (
              <div className="ops-modal-table-wrap modal-table-scroll" style={{ border: '1px solid #ececec', borderRadius: '10px' }}>
                <table className="ops-data-table" style={{ borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr style={{ background: '#fafafa' }}>
                      {['No.', 'Status', 'Booking Name', ...HISSA_COUNT_TABLE_HEADERS, 'Total Hissa', 'Day / Slot', 'Area', 'Contact', 'Address', 'Customer ID'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 10px', borderBottom: '1px solid #e0e0e0', color: '#555', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '10px' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {assignedOrderGroups.map((g, idx) => {
                      const st = g.derived_status || 'Pending';
                      const rowHighlight = getChallanRowHighlight(getOrderTag(g, 'hissa_count', 'waqf_hissa_count'));
                      const rowCounts = getTableHissaCounts(g);
                      return (
                        <tr
                          key={g.group_key || g.challan_id}
                          style={{
                            borderBottom: '1px solid #f3f3f3',
                            background: rowHighlight.background || (idx % 2 === 0 ? '#fff' : '#FAFAFA'),
                            borderLeft: rowHighlight.borderLeft,
                          }}
                        >
                          <td style={{ padding: '9px 10px' }}>
                            <NoBadge value={g.challan_id} />
                          </td>
                          <td style={{ padding: '9px 10px' }}>
                            <ChallanDeliveryStatusBadge status={st} />
                          </td>
                          <td className="ops-cell-wrap" style={{ padding: '9px 10px', fontWeight: '500', color: '#333', verticalAlign: 'top' }}>
                            {(g.booking_names || []).filter(Boolean).map(String).join(', ') || '—'}
                          </td>
                          {hissaCountCellValues(rowCounts).map((v, i) => (
                            <td key={HISSA_COUNT_TABLE_HEADERS[i]} style={{ padding: '9px 10px', color: '#555' }}>{v}</td>
                          ))}
                          <td style={{ padding: '9px 10px', color: '#555', fontWeight: '600' }}>{rowCounts.total}</td>
                          <td style={{ padding: '9px 10px', color: '#555', whiteSpace: 'nowrap' }}>
                            <div>{g.day != null && g.day !== '' ? String(g.day) : '—'}</div>
                            {Array.isArray(g.slots) && g.slots.length > 0 && (
                              <div style={{ fontSize: '9px', color: '#aaa' }}>{g.slots.map(String).join(', ')}</div>
                            )}
                          </td>
                          <td className="ops-cell-wrap" style={{ padding: '9px 10px', color: '#555', verticalAlign: 'top' }}>
                            {g.area != null && g.area !== '' ? String(g.area) : '—'}
                          </td>
                          <td className="ops-cell-wrap" style={{ padding: '9px 10px', color: '#555' }}>
                            <MultiLineCell values={[g.contacts || [], g.alt_contacts || []]} />
                          </td>
                          <td className="ops-cell-wrap" style={{ padding: '9px 10px', color: '#555', verticalAlign: 'top' }}>
                            <div>{g.address != null && g.address !== '' ? String(g.address) : '—'}</div>
                          </td>
                          <td style={{ padding: '9px 10px', color: '#777', fontWeight: '500' }}>
                            <MultiLineCell values={g.customer_ids || []} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', color: '#666', fontSize: '12px' }}>
                No assigned orders found.
              </div>
            )}
          </div>
        </div>
      )}

      {attendanceRider && (
        <RiderAttendanceModal
          rider={attendanceRider}
          authFetch={authFetch}
          onClose={() => setAttendanceRider(null)}
        />
      )}
    </>
  );
}