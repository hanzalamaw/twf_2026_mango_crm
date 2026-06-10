/** Mango CRM — per-unit weight × quantity helpers. */

export function formatUnitWeightKg(weight) {
  const n = Number(weight);
  if (!Number.isFinite(n)) return String(weight ?? "").trim();
  return Number.isInteger(n) ? String(n) : String(n);
}

export function orderLineTotalWeightKg(order) {
  return (Number(order?.weight) || 0) * (Number(order?.quantity) || 0);
}

export function sumOrdersTotalQuantity(orders = []) {
  return orders.reduce((s, o) => s + (Number(o.quantity) || 0), 0);
}

export function sumOrdersTotalWeightKg(orders = []) {
  return orders.reduce((s, o) => s + orderLineTotalWeightKg(o), 0);
}

/** e.g. "5 KG x 2, 10 KG x 5" — weight is per box/unit, quantity is box count. */
export function buildWeightQtyLabel(orders = []) {
  const byWeight = new Map();
  for (const o of orders) {
    const w = Number(o.weight);
    const q = Number(o.quantity) || 0;
    if (!Number.isFinite(w) || w <= 0 || q <= 0) continue;
    byWeight.set(w, (byWeight.get(w) || 0) + q);
  }
  const parts = [...byWeight.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([w, q]) => `${formatUnitWeightKg(w)} KG x ${q}`);
  return parts.length ? parts.join(", ") : "—";
}
