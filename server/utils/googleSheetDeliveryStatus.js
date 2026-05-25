import { logError } from "./logger.js";

const DEFAULT_WEBAPP_URL =
  "https://script.google.com/macros/s/AKfycbyVkVk_Z9WwUGeuNnZrNfMlz731Kf1hsyN9SFPvw5Mj7ddmV7ka--FlemjKwUatktu_Hg/exec";

function getWebAppUrl() {
  return (process.env.GOOGLE_SHEET_WEBAPP_URL || DEFAULT_WEBAPP_URL).trim();
}

/**
 * Fire-and-forget: tell Google Apps Script to update delivery_status for one order_id.
 * Does not await the response.
 */
export function syncDeliveryStatusToSheet(orderId, deliveryStatus) {
  const id = String(orderId ?? "").trim();
  const status = String(deliveryStatus ?? "").trim();
  if (!id || !status) return;

  const base = getWebAppUrl();
  if (!base) return;

  try {
    const url = new URL(base);
    url.searchParams.set("action", "update_delivery_status");
    url.searchParams.set("order_id", id);
    url.searchParams.set("delivery_status", status);

    void fetch(url.toString(), { method: "GET" }).catch((err) => {
      logError("SHEET_SYNC", `delivery_status sync failed for ${id}`, err);
    });
  } catch (err) {
    logError("SHEET_SYNC", `delivery_status sync URL error for ${id}`, err);
  }
}

/** Sync many orders (each may have a different status). */
export function syncDeliveryStatusBatchToSheet(updates) {
  if (!Array.isArray(updates)) return;
  for (const row of updates) {
    syncDeliveryStatusToSheet(row?.order_id, row?.delivery_status);
  }
}

/** All orders linked to a challan — same delivery_status. */
export async function syncChallanOrdersDeliveryStatusToSheet(db, challanId, deliveryStatus) {
  const [rows] = await db.execute(
    `SELECT o.order_id
     FROM orders o
     INNER JOIN challan_orders co ON co.order_id = o.order_id
     WHERE co.challan_id = ?`,
    [challanId]
  );
  for (const row of rows) {
    syncDeliveryStatusToSheet(row.order_id, deliveryStatus);
  }
}
