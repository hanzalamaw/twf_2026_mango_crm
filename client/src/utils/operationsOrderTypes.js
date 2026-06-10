/** Operations order types — mango UI + shared challan PDF helpers. */

import { buildMangoWeightQtyLabel, sumMangoOrdersTotalBoxes, sumMangoOrdersTotalWeightKg } from './mangoOrderFormat';

export const GOAT_HISSA_SUPER = 'Super Goat(Hissa)';
export const GOAT_HISSA_PREMIUM = 'Premium Goat(Hissa)';
export const GOAT_HISSA_EXCLUSIVE = 'Exclusive Goat(Hissa)';

export const HISSA_COUNT_TABLE_HEADERS = ['Order Types'];

export function normalizeOrderType(value) {
  const lower = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (lower === 'hissa - standard' || lower === 'hissa standard') return 'Hissa - Standard';
  if (lower === 'hissa premium' || lower === 'hissa - premium') return 'Hissa Premium';
  if (lower === 'hissa - waqf' || lower === 'hissa waqf') return 'Hissa - Waqf';
  if (lower === 'hissa - exclusive' || lower === 'hissa exclusive') return 'Hissa - Exclusive';
  if (lower === 'super goat(hissa)' || lower === 'super goat (hissa)') return GOAT_HISSA_SUPER;
  if (lower === 'premium goat(hissa)' || lower === 'premium goat (hissa)') return GOAT_HISSA_PREMIUM;
  if (lower === 'exclusive goat(hissa)' || lower === 'exclusive goat (hissa)') return GOAT_HISSA_EXCLUSIVE;
  if (lower === 'goat(hissa)' || lower === 'goat (hissa)' || lower === 'goat hissa') return GOAT_HISSA_SUPER;
  return String(value || '').trim();
}

export function normalizeOrderTypeKey(value) {
  return normalizeOrderType(value).toLowerCase();
}

export const ALLOWED_ORDER_TYPES = [];

export const ORDER_TYPE_FILTERS = [];

export function getGroupTypeCounts(g) {
  const orders = g?.orders || [];
  const types = new Set();
  let qty = Number(g?.total_quantity ?? 0);
  let weight = Number(g?.total_weight ?? 0);
  if (orders.length) {
    qty = 0;
    weight = 0;
    for (const o of orders) {
      const t = normalizeOrderType(o.order_type);
      if (t) types.add(t);
      qty += Number(o.quantity) || 0;
      weight += (Number(o.weight) || 0) * (Number(o.quantity) || 0);
    }
  } else if (Array.isArray(g?.order_types)) {
    g.order_types.forEach((t) => {
      const n = normalizeOrderType(t);
      if (n) types.add(n);
    });
  }
  return { types: [...types], qty, weight, orderCount: orders.length || Number(g?.order_count ?? 0) };
}

export function getTableHissaCounts(row) {
  const c = getGroupTypeCounts(row);
  return {
    typesLabel: c.types.length ? c.types.join(', ') : '—',
    total: c.qty || c.orderCount || 0,
    qty: c.qty,
    weight: c.weight,
    weightQtyLabel: buildMangoWeightQtyLabel(row),
  };
}

export function hissaCountCellValues(counts) {
  return [counts.typesLabel];
}

export function buildSummaryStatCards(summary = {}) {
  return [
    ['Challans', summary.totalChallans ?? 0],
    ['Total Orders', summary.totalOrders ?? 0],
    ['Total Quantity', summary.totalQuantity ?? 0],
    ['Total Weight (kg)', summary.totalWeight ?? 0],
  ];
}

export function formatTotalHissa(total, opts = {}) {
  const qty = Number(opts.qty ?? total ?? 0);
  const weight = Number(opts.weight ?? 0);
  if (weight > 0) return `${qty} qty · ${weight} kg`;
  return String(qty || 0);
}

export function computeModalTotals(challan, orders) {
  const list = Array.isArray(orders) ? orders : [];
  const qty = sumMangoOrdersTotalBoxes(list);
  const weight = sumMangoOrdersTotalWeightKg(list);
  return {
    total: qty,
    qty,
    weight,
    orderCount: list.length,
    weightQtyLabel: buildMangoWeightQtyLabel({ orders: list, weight_qty_label: challan?.weight_qty_label }),
  };
}

export function groupMatchesOrderTypeFilter(g, filterOrderType) {
  const selected = Array.isArray(filterOrderType) ? filterOrderType : filterOrderType ? [filterOrderType] : [];
  if (!selected.length) return true;
  const types = getGroupTypeCounts(g).types;
  return selected.some((f) => types.includes(normalizeOrderType(f)));
}

export function partitionOrdersForChallanPrint(orders) {
  return { cow: [], goat: [], other: orders || [] };
}

const GOAT_HISSA_ORDER_TYPES = [GOAT_HISSA_SUPER, GOAT_HISSA_PREMIUM, GOAT_HISSA_EXCLUSIVE];

export function isGoatHissaOrderType(value) {
  return GOAT_HISSA_ORDER_TYPES.includes(normalizeOrderType(value));
}
