import { orderEffectiveYearExpr } from "./yearFilter.js";

/** Only orders in this business year are included in Operations Management. */
export const OPERATIONS_YEAR = 2026;

/** SQL predicate: order row qualifies for operations (alias default `o`). */
export function opsOrderYearWhere(alias = "o") {
  return `${orderEffectiveYearExpr(alias)} = ${OPERATIONS_YEAR}`;
}

/**
 * @param {{ booking_date?: string|null, order_id?: string|null }} order
 */
export function orderOperationsYear(order) {
  const bd = order?.booking_date;
  if (bd) {
    const y = new Date(bd).getFullYear();
    if (y === 2026) return 2026;
    if (y === 2024) return 2024;
    return 2025;
  }
  const m = String(order?.order_id || "").match(/-(\d{4})$/);
  if (m) {
    const y = parseInt(m[1], 10);
    if (y === 2026) return 2026;
    if (y === 2024) return 2024;
    return 2025;
  }
  return 2025;
}

export function qualifiesForOperations(order) {
  return orderOperationsYear(order) === OPERATIONS_YEAR;
}
