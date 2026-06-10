/**
 * Server-side filter / sort / paginate for operations deliveries/groups (Mango CRM).
 */

function parseList(val) {
  if (Array.isArray(val)) return val.map((s) => String(s).trim()).filter(Boolean);
  if (val != null && String(val).trim() !== "") {
    return String(val)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeOrderType(value) {
  return String(value || "").trim();
}

function groupSearchHaystack(g) {
  return [
    g.address,
    g.area,
    g.batch,
    g.names,
    g.description,
    ...(g.booking_names || []),
    ...(g.contacts || []),
    ...(g.alt_contacts || []),
    ...(g.customer_ids || []).map(String),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function groupMatchesOrderTypeFilter(g, selected) {
  if (!selected.length) return true;
  const types = new Set();
  if (g.order_types?.length) g.order_types.forEach((t) => types.add(normalizeOrderType(t)));
  (g.orders || []).forEach((o) => {
    const t = normalizeOrderType(o.order_type);
    if (t) types.add(t);
  });
  return selected.some((f) => types.has(normalizeOrderType(f)));
}

function sortDeliveryGroups(list) {
  return [...list].sort((a, b) => {
    const areaA = String(a.area || "").trim().toLowerCase();
    const areaB = String(b.area || "").trim().toLowerCase();
    if (areaA !== areaB) return areaA.localeCompare(areaB);
    return String(a.address || "")
      .trim()
      .toLowerCase()
      .localeCompare(String(b.address || "").trim().toLowerCase());
  });
}

function summarizeDeliveryGroups(groups) {
  let totalChallans = 0;
  let totalOrders = 0;
  let totalQuantity = 0;
  let totalWeight = 0;
  for (const g of groups || []) {
    totalChallans += 1;
    totalOrders += Number(g.order_count ?? (g.orders || []).length ?? 0);
    totalQuantity += Number(g.total_quantity ?? 0);
    totalWeight += Number(g.total_weight ?? 0);
  }
  return { totalChallans, totalOrders, totalQuantity, totalWeight };
}

const EMPTY_SUMMARY = summarizeDeliveryGroups([]);

export function parseDeliveriesGroupsQuery(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50));
  return {
    page,
    limit,
    search: query.search ? String(query.search).trim().toLowerCase() : "",
    challan: query.challan ? String(query.challan).trim().toLowerCase() : "",
    statuses: parseList(query.status ?? query.delivery_status),
    riderId: query.rider_id != null && String(query.rider_id).trim() !== "" ? String(query.rider_id).trim() : "",
    orderTypes: parseList(query.order_type),
    qrToken: query.qr_token ? String(query.qr_token).trim() : "",
  };
}

export function filterSortPaginateDeliveryGroups(allGroups, queryOpts, batch) {
  const opts = queryOpts || parseDeliveriesGroupsQuery({});
  let list = allGroups || [];

  if (opts.qrToken) {
    list = list.filter((g) => g.qr_token === opts.qrToken);
  }
  if (opts.search) {
    list = list.filter((g) => groupSearchHaystack(g).includes(opts.search));
  }
  if (opts.challan) {
    list = list.filter((g) => String(g.challan_id || "").toLowerCase().includes(opts.challan));
  }
  if (opts.statuses.length) {
    list = list.filter((g) => opts.statuses.includes(g.derived_status || "Pending"));
  }
  if (opts.riderId) {
    list = list.filter((g) => String(g.rider_id || "") === opts.riderId);
  }
  if (opts.orderTypes.length) {
    list = list.filter((g) => groupMatchesOrderTypeFilter(g, opts.orderTypes));
  }

  list = sortDeliveryGroups(list);

  const total = list.length;
  const summary = summarizeDeliveryGroups(list);
  const offset = (opts.page - 1) * opts.limit;
  const groups = list.slice(offset, offset + opts.limit).map((g) => {
    const { orders, ...rest } = g || {};
    return rest;
  });

  return {
    groups,
    total,
    page: opts.page,
    limit: opts.limit,
    batch,
    summary,
    order_types_list: [],
  };
}

export function emptyDeliveriesGroupsPayload(batch, queryOpts) {
  const opts = queryOpts || parseDeliveriesGroupsQuery({});
  return {
    groups: [],
    total: 0,
    page: opts.page,
    limit: opts.limit,
    batch,
    summary: EMPTY_SUMMARY,
    order_types_list: [],
  };
}
