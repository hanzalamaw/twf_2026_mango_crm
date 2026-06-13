import crypto from "crypto";
import { qualifiesForOperations } from "./operationsYear.js";
import { sumOrdersTotalQuantity, sumOrdersTotalWeightKg } from "./mangoWeightQty.js";

/** Normalize address for grouping (batch + address). */
export function normalizeAddress(addr) {
  return String(addr || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Challan grouping key: Self orders each get their own challan. */
function challanAddressNorm(address, orderId) {
  const addrNorm = normalizeAddress(address);
  if (addrNorm === "self") {
    return `self:${String(orderId || "").trim()}`;
  }
  return addrNorm;
}

/**
 * Recompute challan aggregate fields from linked orders.
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} db
 * @param {number} challanId
 */
export async function refreshChallanTotals(db, challanId) {
  const [rows] = await db.execute(
    `SELECT o.name, o.description, o.quantity, o.weight
     FROM orders o
     INNER JOIN challan_orders co ON co.order_id = o.order_id
     WHERE co.challan_id = ?`,
    [challanId]
  );
  if (rows.length === 0) {
    await db.execute(`DELETE FROM challan WHERE challan_id = ?`, [challanId]);
    return null;
  }
  const names = [...new Set(rows.map((r) => String(r.name || "").trim()).filter(Boolean))];
  const descParts = [...new Set(rows.map((r) => String(r.description || "").trim()).filter(Boolean))];
  const totalQty = sumOrdersTotalQuantity(rows);
  const totalWeight = sumOrdersTotalWeightKg(rows);
  await db.execute(
    `UPDATE challan SET names = ?, description = ?, total_quantity = ?, total_weight = ? WHERE challan_id = ?`,
    [names.join(", ") || null, descParts.join("\n") || null, totalQty, totalWeight, challanId]
  );
  return challanId;
}

/**
 * Auto-assign an order to a challan: same batch + normalized address share one challan.
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} db
 * @param {{ order_id: string, booking_date?: string|null, batch?: string|null, address?: string|null, area?: string|null, name?: string|null }} order
 * @returns {Promise<number|null>} challan_id or null if skipped
 */
export async function assignOrderToChallan(db, order) {
  if (!qualifiesForOperations(order)) return null;

  const orderId = String(order.order_id || "").trim();
  const batch = String(order.batch || "").trim();
  const address = String(order.address || "").trim();
  if (!orderId || !batch || !address) return null;

  const addrNorm = challanAddressNorm(address, orderId);
  const area = order.area || null;

  const [existingLink] = await db.execute(
    `SELECT challan_id FROM challan_orders WHERE order_id = ?`,
    [orderId]
  );
  if (existingLink.length > 0) {
    const linkedChallanId = existingLink[0].challan_id;
    if (normalizeAddress(address) !== "self") return linkedChallanId;

    const [[challanRows], [siblingRows]] = await Promise.all([
      db.execute(`SELECT address_norm FROM challan WHERE challan_id = ?`, [linkedChallanId]),
      db.execute(
        `SELECT order_id FROM challan_orders WHERE challan_id = ? AND order_id != ?`,
        [linkedChallanId, orderId]
      ),
    ]);
    const needsSplit =
      challanRows[0]?.address_norm !== addrNorm || siblingRows.length > 0;
    if (!needsSplit) return linkedChallanId;

    await db.execute(`DELETE FROM challan_orders WHERE order_id = ?`, [orderId]);
    await refreshChallanTotals(db, linkedChallanId);
  }

  const [existingChallan] = await db.execute(
    `SELECT challan_id FROM challan
     WHERE batch = ? AND address_norm = ?
     LIMIT 1`,
    [batch, addrNorm]
  );

  let challanId;
  if (existingChallan.length > 0) {
    challanId = existingChallan[0].challan_id;
  } else {
    const qrToken = crypto.randomBytes(24).toString("hex");
    const today = new Date();
    const challanDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const [ins] = await db.execute(
      `INSERT INTO challan (batch, qr_token, address, address_norm, area, names, challan_date, total_quantity, total_weight)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      [batch, qrToken, address, addrNorm, area, order.name || null, challanDate]
    );
    challanId = ins.insertId;
  }

  await db.execute(
    `INSERT INTO challan_orders (challan_id, order_id) VALUES (?, ?)`,
    [challanId, orderId]
  );
  await refreshChallanTotals(db, challanId);
  return challanId;
}

/**
 * Remove order from challan when cancelled; refresh or delete empty challan.
 * @param {import('mysql2/promise').Pool} db
 * @param {string} orderId
 */
/** Refresh aggregate fields on the challan linked to this order (no re-link). */
export async function refreshLinkedChallanForOrder(db, orderId) {
  const [links] = await db.execute(
    `SELECT challan_id FROM challan_orders WHERE order_id = ?`,
    [orderId]
  );
  if (!links.length) return null;
  return refreshChallanTotals(db, links[0].challan_id);
}

/**
 * Unlink order from its current challan and assign again (batch + address grouping).
 * Used when address or batch changes on an existing order.
 */
export async function relinkOrderToChallan(db, order) {
  const orderId = String(order.order_id || "").trim();
  if (!orderId) return null;

  const [links] = await db.execute(
    `SELECT challan_id FROM challan_orders WHERE order_id = ?`,
    [orderId]
  );
  const oldChallanId = links[0]?.challan_id;
  if (oldChallanId) {
    await db.execute(`DELETE FROM challan_orders WHERE order_id = ?`, [orderId]);
    await refreshChallanTotals(db, oldChallanId);
  }

  if (!qualifiesForOperations(order)) return null;
  const batch = String(order.batch || "").trim();
  const address = String(order.address || "").trim();
  if (!batch || !address) return null;

  return assignOrderToChallan(db, order);
}

export async function removeOrderFromChallan(db, orderId) {
  const [links] = await db.execute(
    `SELECT challan_id FROM challan_orders WHERE order_id = ?`,
    [orderId]
  );
  if (!links.length) return;
  const challanId = links[0].challan_id;
  await db.execute(`DELETE FROM challan_orders WHERE order_id = ?`, [orderId]);
  await refreshChallanTotals(db, challanId);
}
