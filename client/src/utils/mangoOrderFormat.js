/** Mango order display helpers (modal, PDF, deliveries). */

export function formatMangoWeight(weight) {
  const n = Number(weight);
  if (!Number.isFinite(n)) return String(weight ?? '').trim();
  return Number.isInteger(n) ? String(n) : String(n);
}

/** e.g. "Mango - Sindhri (10 KG)" from order_type + weight */
export function formatMangoOrderLabel(order) {
  const type = String(order?.order_type || '').trim() || 'Mango';
  const w = formatMangoWeight(order?.weight);
  if (!w) return type;
  return `${type} (${w} KG)`;
}

export function parseMangoVarietyKey(orderType) {
  const t = String(orderType || '').toLowerCase();
  if (t.includes('chaunsa')) return 'chaunsa';
  if (t.includes('sindhri')) return 'sindhri';
  if (t.includes('anwar') || t.includes('ratol')) return 'anwar';
  return null;
}

export function parseMangoWeightKey(weight) {
  const w = Number(weight);
  if (w === 10) return '10';
  if (w === 5) return '5';
  return 'other';
}

export const MANGO_VARIETY_OPTIONS = [
  { key: 'chaunsa', label: 'Chaunsa' },
  { key: 'sindhri', label: 'Sindhri' },
  { key: 'anwar', label: 'Anwer Ratol' },
];

export const MANGO_WEIGHT_OPTIONS = [
  { key: '10', label: '10 KG' },
  { key: '5', label: '5 KG' },
  { key: 'other', label: 'Other:' },
];

/** Per-unit weight × qty, grouped by weight tier — e.g. "5 KG x 2, 10 KG x 5". */
export function buildMangoWeightQtyLabel(source) {
  const orders = Array.isArray(source?.orders) ? source.orders : null;
  if (orders?.length) {
    return buildMangoWeightQtyLabelFromOrders(orders);
  }
  if (source?.weight_qty_label) {
    return String(source.weight_qty_label).trim() || '—';
  }
  return '—';
}

export function buildMangoWeightQtyLabelFromOrders(orders = []) {
  const byWeight = new Map();
  for (const o of orders) {
    const w = Number(o.weight);
    const q = Number(o.quantity) || 0;
    if (!Number.isFinite(w) || w <= 0 || q <= 0) continue;
    byWeight.set(w, (byWeight.get(w) || 0) + q);
  }
  const parts = [...byWeight.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([w, q]) => `${formatMangoWeight(w)} KG x ${q}`);
  return parts.length ? parts.join(', ') : '—';
}

export function sumMangoOrdersTotalBoxes(orders = []) {
  return orders.reduce((s, o) => s + (Number(o.quantity) || 0), 0);
}

export function sumMangoOrdersTotalWeightKg(orders = []) {
  return orders.reduce((s, o) => s + (Number(o.weight) || 0) * (Number(o.quantity) || 0), 0);
}
