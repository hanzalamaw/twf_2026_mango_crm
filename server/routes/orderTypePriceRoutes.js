import { log, logError } from "../utils/logger.js";
import { writeAuditLog } from "../utils/auditLog.js";

function normalizePriceRow(row) {
  return {
    price_id: row.price_id,
    order_type: row.order_type,
    price_5kg: Number(row.price_5kg || 0),
    price_10kg: Number(row.price_10kg || 0),
    updated_at: row.updated_at,
  };
}

export function registerOrderTypePriceRoutes(app, db, verifyToken) {
  app.get("/api/order-type-prices", verifyToken, async (_req, res) => {
    try {
      const [rows] = await db.execute(
        `SELECT price_id, order_type, price_5kg, price_10kg, updated_at
         FROM order_type_prices
         ORDER BY price_id ASC`
      );
      res.json({ data: rows.map(normalizePriceRow) });
    } catch (e) {
      logError("ORDER_TYPE_PRICES", "List error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/order-type-prices", verifyToken, async (req, res) => {
    try {
      const items = Array.isArray(req.body?.prices) ? req.body.prices : [];
      if (!items.length) {
        return res.status(400).json({ message: "No prices provided" });
      }

      const [existingRows] = await db.execute("SELECT * FROM order_type_prices");
      const byId = new Map(existingRows.map((r) => [r.price_id, r]));

      for (const item of items) {
        const priceId = parseInt(item.price_id, 10);
        if (!priceId || !byId.has(priceId)) {
          return res.status(400).json({ message: `Invalid price_id: ${item.price_id}` });
        }
        const price5 = Math.max(0, Number(item.price_5kg) || 0);
        const price10 = Math.max(0, Number(item.price_10kg) || 0);
        await db.execute(
          `UPDATE order_type_prices SET price_5kg = ?, price_10kg = ? WHERE price_id = ?`,
          [price5, price10, priceId]
        );
      }

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "UPDATE_ORDER_TYPE_PRICES",
        entity_type: "order_type_prices",
        entity_id: "bulk",
        new_values: items,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      log("ORDER_TYPE_PRICES", "Updated", { count: items.length });
      const [rows] = await db.execute(
        `SELECT price_id, order_type, price_5kg, price_10kg, updated_at
         FROM order_type_prices ORDER BY price_id ASC`
      );
      res.json({ message: "Prices updated", data: rows.map(normalizePriceRow) });
    } catch (e) {
      logError("ORDER_TYPE_PRICES", "Update error", e);
      res.status(500).json({ message: "Server error" });
    }
  });
}
