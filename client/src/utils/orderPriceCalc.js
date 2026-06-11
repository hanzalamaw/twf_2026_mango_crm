/** @param {Array<{ order_type: string, price_5kg: number, price_10kg: number }>} prices */
export function buildPriceLookup(prices) {
  const map = new Map();
  for (const row of prices || []) {
    map.set(row.order_type, row);
  }
  return map;
}

/** Unit price for 5 KG or 10 KG presets; null if not calculable (custom weight / missing data). */
export function getUnitPrice(priceLookup, orderType, weightKg) {
  if (!orderType || !priceLookup?.has(orderType)) return null;
  const row = priceLookup.get(orderType);
  const w = Number(weightKg);
  if (w === 5) return Number(row.price_5kg) || 0;
  if (w === 10) return Number(row.price_10kg) || 0;
  return null;
}

/** Total = unit price × quantity when weight is 5 or 10 KG; otherwise null. */
export function calcOrderTotal(priceLookup, orderType, weightKg, quantity) {
  const unit = getUnitPrice(priceLookup, orderType, weightKg);
  if (unit == null) return null;
  const qty = Number(quantity);
  if (!qty || qty <= 0) return null;
  return Math.round(unit * qty * 100) / 100;
}
