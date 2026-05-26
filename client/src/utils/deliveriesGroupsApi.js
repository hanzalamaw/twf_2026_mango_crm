/** Query params for GET /operations/deliveries/groups (server-side filter + pagination). */

export const DELIVERIES_PAGE_SIZE = 50;

export function buildDeliveriesGroupsQuery({
  batchId,
  day,
  page = 1,
  limit = DELIVERIES_PAGE_SIZE,
  search = '',
  challan = '',
  slots = [],
  statuses = [],
  riderId = '',
  orderTypes = [],
  groupKind = 'all',
  qrToken = '',
} = {}) {
  const qs = new URLSearchParams();
  if (batchId != null && batchId !== '') qs.set('batch_id', String(batchId));
  if (day) qs.set('day', day);
  qs.set('page', String(page));
  qs.set('limit', String(limit));
  const q = String(search || '').trim();
  if (q) qs.set('search', q);
  const cq = String(challan || '').trim();
  if (cq) qs.set('challan', cq);
  (slots || []).forEach((s) => qs.append('slot', s));
  (statuses || []).forEach((s) => qs.append('status', s));
  if (riderId !== '' && riderId != null) qs.set('rider_id', String(riderId));
  (orderTypes || []).forEach((t) => qs.append('order_type', t));
  if (groupKind && groupKind !== 'all') qs.set('group_kind', groupKind);
  if (qrToken) qs.set('qr_token', qrToken);
  return qs;
}
