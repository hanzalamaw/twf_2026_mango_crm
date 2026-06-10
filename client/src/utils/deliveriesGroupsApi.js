/** Query params for GET /operations/deliveries/groups (server-side filter + pagination). */

export const DELIVERIES_PAGE_SIZE = 50;

export function buildDeliveriesGroupsQuery({
  batch,
  page = 1,
  limit = DELIVERIES_PAGE_SIZE,
  search = '',
  challan = '',
  statuses = [],
  riderId = '',
  orderTypes = [],
  qrToken = '',
} = {}) {
  const qs = new URLSearchParams();
  if (batch != null && batch !== '') qs.set('batch', String(batch));
  qs.set('page', String(page));
  qs.set('limit', String(limit));
  const q = String(search || '').trim();
  if (q) qs.set('search', q);
  const cq = String(challan || '').trim();
  if (cq) qs.set('challan', cq);
  (statuses || []).forEach((s) => qs.append('status', s));
  if (riderId !== '' && riderId != null) qs.set('rider_id', String(riderId));
  (orderTypes || []).forEach((t) => qs.append('order_type', t));
  if (qrToken) qs.set('qr_token', qrToken);
  return qs;
}

export function sortChallanRowsForPrint(rows) {
  return [...(rows || [])].sort((a, b) => {
    const areaA = String(a.area || '').trim().toLowerCase();
    const areaB = String(b.area || '').trim().toLowerCase();
    if (areaA !== areaB) return areaA.localeCompare(areaB);
    const addrCmp = String(a.address || '')
      .trim()
      .toLowerCase()
      .localeCompare(String(b.address || '').trim().toLowerCase());
    if (addrCmp !== 0) return addrCmp;
    return Number(a.challan_id || 0) - Number(b.challan_id || 0);
  });
}
