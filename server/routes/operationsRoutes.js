import { log, logError } from "../utils/logger.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { opsOrderYearWhere, OPERATIONS_YEAR } from "../utils/operationsYear.js";
import {
  emptyDeliveriesGroupsPayload,
  filterSortPaginateDeliveryGroups,
  parseDeliveriesGroupsQuery,
} from "../utils/deliveryGroupFilters.js";
import {
  buildWeightQtyLabel,
  sumOrdersTotalQuantity,
  sumOrdersTotalWeightKg,
} from "../utils/mangoWeightQty.js";

const ALLOWED_STATUSES = ["Pending", "Rider Assigned", "Dispatched", "Delivered", "Returned to Farm", "Returned"];

function mapDeliveryStatusForClient(status) {
  const s = String(status || "Pending").trim();
  if (s === "Returned") return "Returned to Farm";
  return s || "Pending";
}

function normalizeDeliveryStatusForDb(status) {
  const s = String(status || "").trim();
  if (s === "Returned" || s === "Returned to Farm") return "Returned to Farm";
  return s;
}

function normalizeBatch(b) {
  return String(b || "").trim();
}

async function fetchRoleOpsFlags(db, userId) {
  const [rows] = await db.execute(
    `SELECT r.operation_management, r.operation_rider_management, r.operation_deliveries_management
     FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?`,
    [userId]
  );
  return rows[0] || {};
}

function requireOperationParent(res, flags) {
  const ok =
    !!flags.operation_management ||
    !!flags.operation_rider_management ||
    !!flags.operation_deliveries_management;
  if (!ok) {
    res.status(403).json({ message: "Operations access denied" });
    return false;
  }
  return true;
}

function uniqueRiderIdsFromOrders(orders = []) {
  return [...new Set(orders.map((o) => o.rider_id).filter((id) => id != null && Number(id) > 0))];
}

function deriveGroupStatus(orders) {
  const statuses = orders.map((o) => mapDeliveryStatusForClient(o.delivery_status));
  if (statuses.length === 0) return "Pending";
  if (statuses.every((s) => s === "Delivered")) return "Delivered";
  if (statuses.some((s) => s === "Returned to Farm")) return "Returned to Farm";
  if (statuses.some((s) => s === "Dispatched")) return "Dispatched";
  if (statuses.some((s) => s === "Rider Assigned")) return "Rider Assigned";
  return "Pending";
}

async function fetchRiderById(db, riderId) {
  const [rows] = await db.execute(
    `SELECT rider_id, rider_name, contact, vehicle, number_plate, availability
     FROM riders WHERE rider_id = ? AND (status = 'active' OR status IS NULL)`,
    [riderId]
  );
  return rows[0] || null;
}

async function resolveLatestBatch(db) {
  const [rows] = await db.execute(
    `SELECT batch FROM orders o
     WHERE TRIM(COALESCE(o.batch, '')) != '' AND ${opsOrderYearWhere("o")}
     ORDER BY o.created_at DESC LIMIT 1`
  );
  return rows[0]?.batch ? normalizeBatch(rows[0].batch) : null;
}

async function buildDeliveriesGroupsForBatch(db, batch, { challanId = null } = {}) {
  const batchVal = normalizeBatch(batch);
  if (!batchVal) return { groups: [], batch: null };

  let challanSql = `SELECT c.challan_id, c.qr_token, c.batch, c.address, c.area, c.names, c.description,
                           c.total_quantity, c.total_weight, c.challan_date
                    FROM challan c
                    WHERE c.batch = ?
                      AND EXISTS (
                        SELECT 1 FROM challan_orders co0
                        INNER JOIN orders o0 ON o0.order_id = co0.order_id
                        WHERE co0.challan_id = c.challan_id AND ${opsOrderYearWhere("o0")}
                      )`;
  const challanParams = [batchVal];

  if (challanId) {
    challanSql += ` AND c.challan_id = ?`;
    challanParams.push(Number(challanId));
  }
  challanSql += ` ORDER BY c.area, c.address, c.challan_id`;

  const [challans] = await db.execute(challanSql, challanParams);
  if (!challans.length) return { groups: [], batch: batchVal };

  const challanIds = challans.map((c) => c.challan_id);
  const placeholders = challanIds.map(() => "?").join(",");

  const [orderRows] = await db.execute(
    `SELECT co.challan_id, o.order_id, o.customer_id, o.contact, o.alt_contact, o.name,
            o.address, o.area, o.order_type, o.weight, o.quantity, o.description,
            o.delivery_status, o.rider_id, o.batch
     FROM challan_orders co
     INNER JOIN orders o ON o.order_id = co.order_id
     WHERE co.challan_id IN (${placeholders}) AND ${opsOrderYearWhere("o")}
     ORDER BY co.challan_id, o.order_id`,
    challanIds
  );

  const ordersByChallan = new Map();
  for (const o of orderRows) {
    if (!ordersByChallan.has(o.challan_id)) ordersByChallan.set(o.challan_id, []);
    ordersByChallan.get(o.challan_id).push(o);
  }

  const riderIds = [...new Set(orderRows.map((o) => o.rider_id).filter(Boolean))];
  const ridersMap = new Map();
  if (riderIds.length) {
    const rph = riderIds.map(() => "?").join(",");
    const [riders] = await db.execute(
      `SELECT rider_id, rider_name, contact, vehicle, number_plate FROM riders WHERE rider_id IN (${rph})`,
      riderIds
    );
    for (const r of riders) ridersMap.set(r.rider_id, r);
  }

  let groups = challans.map((c) => {
    const orders = ordersByChallan.get(c.challan_id) || [];
    if (!orders.length) return null;
    const riderIdsOnGroup = uniqueRiderIdsFromOrders(orders);
    const riderId = riderIdsOnGroup.length === 1 ? riderIdsOnGroup[0] : null;
    const rider = riderId ? ridersMap.get(riderId) : null;
    const totalQty = sumOrdersTotalQuantity(orders);
    const totalWeight = sumOrdersTotalWeightKg(orders);
    const bookingNames = [...new Set(orders.map((x) => String(x.name || "").trim()).filter(Boolean))];
    const names = bookingNames.join(", ");
    const orderTypes = [...new Set(orders.map((x) => String(x.order_type || "").trim()).filter(Boolean))];
    return {
      group_key: String(c.challan_id),
      challan_id: c.challan_id,
      qr_token: c.qr_token,
      batch: c.batch,
      address: c.address,
      area: c.area,
      names: names || c.names,
      booking_names: bookingNames,
      description: c.description,
      total_quantity: totalQty,
      total_weight: totalWeight,
      weight_qty_label: buildWeightQtyLabel(orders),
      rider_id: riderId,
      rider_count: riderIdsOnGroup.length,
      rider,
      derived_status: deriveGroupStatus(orders),
      orders,
      order_types: orderTypes,
      contacts: [...new Set(orders.map((x) => x.contact).filter(Boolean))],
      alt_contacts: [...new Set(orders.map((x) => x.alt_contact).filter(Boolean))],
      customer_ids: [...new Set(orders.map((x) => x.customer_id).filter(Boolean))],
    };
  }).filter(Boolean);

  return { groups, batch: batchVal };
}

/**
 * @param {object} app
 * @param {import('mysql2/promise').Pool} db
 * @param {Function} verifyToken
 */
export function registerOperationsRoutes(app, db, verifyToken) {
  const assertSub = async (req, res, checker) => {
    const flags = await fetchRoleOpsFlags(db, req.userId);
    if (!requireOperationParent(res, flags)) return null;
    if (!checker(flags)) {
      res.status(403).json({ message: "Insufficient operations permission" });
      return null;
    }
    return flags;
  };

  // Distinct batches from orders (for deliveries filter)
  app.get("/api/operations/batches", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_deliveries_management || f.operation_rider_management);
      if (!flags) return;
      const [rows] = await db.execute(
        `SELECT DISTINCT TRIM(o.batch) AS batch FROM orders o
         WHERE TRIM(COALESCE(o.batch, '')) != '' AND ${opsOrderYearWhere("o")}
         ORDER BY batch DESC`
      );
      res.json({ batches: rows.map((r) => r.batch) });
    } catch (error) {
      logError("OPERATIONS", "List batches error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Riders ──────────────────────────────────────────────────
  app.get("/api/operations/riders", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management || f.operation_deliveries_management);
      if (!flags) return;
      const [riders] = await db.execute(
        `SELECT rider_id, rider_name, contact, vehicle, number_plate, availability, status
         FROM riders WHERE status = 'active' OR status IS NULL ORDER BY rider_name`
      );
      res.json(riders);
    } catch (error) {
      logError("OPERATIONS", "List riders error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/riders/details", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;
      const batch = normalizeBatch(req.query.batch) || (await resolveLatestBatch(db));
      const [riders] = await db.execute(
        `SELECT rider_id, rider_name, contact, vehicle, cnic, number_plate,
                amount_per_delivery, total_paid,
                COALESCE(NULLIF(TRIM(availability), ''), 'Available') AS availability,
                COALESCE(NULLIF(TRIM(status), ''), 'active') AS status
         FROM riders WHERE status = 'active' OR status IS NULL ORDER BY rider_name`
      );

      const statsMap = new Map();
      if (batch) {
        const [stats] = await db.execute(
          `SELECT o.rider_id,
                  COUNT(DISTINCT c.challan_id) AS challan_count,
                  SUM(o.delivery_status = 'Delivered') AS deliveries_completed,
                  COUNT(o.order_id) - SUM(o.delivery_status = 'Delivered') AS pending_deliveries
           FROM challan c
           INNER JOIN challan_orders co ON co.challan_id = c.challan_id
           INNER JOIN orders o ON o.order_id = co.order_id
           WHERE c.batch = ? AND o.rider_id IS NOT NULL AND ${opsOrderYearWhere("o")}
           GROUP BY o.rider_id`,
          [batch]
        );
        for (const s of stats) statsMap.set(Number(s.rider_id), s);
      }

      const items = riders.map((r) => {
        const s = statsMap.get(Number(r.rider_id)) || {};
        const delivered = Number(s.deliveries_completed || 0);
        const amountPer = Number(r.amount_per_delivery || 0);
        const totalMade = delivered * amountPer;
        const totalPaid = Number(r.total_paid || 0);
        return {
          ...r,
          deliveries_completed: delivered,
          pending_deliveries: Number(s.pending_deliveries || 0),
          challan_count: Number(s.challan_count || 0),
          total_amount_made: Number(totalMade.toFixed(2)),
          balance_due: Number((totalMade - totalPaid).toFixed(2)),
        };
      });
      res.json({ riders: items, batch, operations_year: OPERATIONS_YEAR });
    } catch (error) {
      logError("OPERATIONS", "Rider details error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/operations/riders", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;
      const { rider_name, contact, vehicle, cnic, number_plate, amount_per_delivery } = req.body || {};
      if (!rider_name || !String(rider_name).trim()) {
        return res.status(400).json({ message: "rider_name is required" });
      }
      const amount = amount_per_delivery == null || amount_per_delivery === "" ? 0 : Number(amount_per_delivery);
      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ message: "amount_per_delivery must be a valid non-negative number" });
      }
      const [result] = await db.execute(
        `INSERT INTO riders (rider_name, contact, vehicle, cnic, number_plate, amount_per_delivery, total_paid, availability, status)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'Available', 'active')`,
        [String(rider_name).trim(), contact || null, vehicle || null, cnic || null, number_plate || null, amount]
      );
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "RIDER_CREATE",
        entity_type: "rider",
        entity_id: String(result.insertId),
        new_values: { rider_name: String(rider_name).trim(), contact, vehicle, cnic, number_plate, amount_per_delivery: amount },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      res.status(201).json({ rider_id: result.insertId });
    } catch (error) {
      logError("OPERATIONS", "Create rider error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/riders/:id/orders", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;
      const riderId = Number(req.params.id);
      if (!Number.isFinite(riderId) || riderId <= 0) return res.status(400).json({ message: "Invalid rider id" });

      const [rv] = await db.execute(
        `SELECT rider_id, rider_name, contact, vehicle, number_plate, amount_per_delivery, total_paid,
                COALESCE(NULLIF(TRIM(availability), ''), 'Available') AS availability
         FROM riders WHERE rider_id = ? AND (status = 'active' OR status IS NULL)`,
        [riderId]
      );
      if (!rv.length) return res.status(404).json({ message: "Rider not found" });

      const batch = normalizeBatch(req.query.batch);
      const params = [riderId];
      let sql = `SELECT c.challan_id, c.batch, c.address, c.area,
                        o.order_id, o.name, o.contact, o.order_type, o.quantity, o.weight,
                        o.delivery_status, o.area AS order_area
                 FROM orders o
                 INNER JOIN challan_orders co ON co.order_id = o.order_id
                 INNER JOIN challan c ON c.challan_id = co.challan_id
                 WHERE o.rider_id = ? AND ${opsOrderYearWhere("o")}`;
      if (batch) {
        sql += ` AND c.batch = ?`;
        params.push(batch);
      }
      sql += ` ORDER BY c.batch, c.challan_id, o.order_id`;

      const [rows] = await db.execute(sql, params);
      res.json({ rider: rv[0], orders: rows });
    } catch (error) {
      logError("OPERATIONS", "Rider orders error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/operations/riders/:id", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;
      const riderId = Number(req.params.id);
      if (!Number.isFinite(riderId) || riderId <= 0) return res.status(400).json({ message: "Invalid rider id" });
      const body = req.body || {};
      const fields = [];
      const params = [];
      const allowed = ["rider_name", "contact", "vehicle", "cnic", "number_plate", "amount_per_delivery", "total_paid", "availability", "status"];
      for (const key of allowed) {
        if (body[key] !== undefined) {
          fields.push(`${key} = ?`);
          params.push(body[key]);
        }
      }
      if (!fields.length) return res.status(400).json({ message: "No fields to update" });
      params.push(riderId);
      await db.execute(`UPDATE riders SET ${fields.join(", ")} WHERE rider_id = ?`, params);
      res.json({ message: "Rider updated" });
    } catch (error) {
      logError("OPERATIONS", "Update rider error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/operations/riders/:id", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;
      const riderId = Number(req.params.id);
      await db.execute(`UPDATE riders SET status = 'inactive' WHERE rider_id = ?`, [riderId]);
      res.json({ message: "Rider deactivated" });
    } catch (error) {
      logError("OPERATIONS", "Delete rider error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Deliveries groups ───────────────────────────────────────
  app.get("/api/operations/deliveries/groups", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_deliveries_management);
      if (!flags) return;

      const queryOpts = parseDeliveriesGroupsQuery(req.query);
      let batch = normalizeBatch(req.query.batch || req.query.batch_id);
      if (!batch) batch = await resolveLatestBatch(db);
      if (!batch) {
        return res.json({ ...emptyDeliveriesGroupsPayload(null, queryOpts), operations_year: OPERATIONS_YEAR });
      }

      const built = await buildDeliveriesGroupsForBatch(db, batch);
      const payload = filterSortPaginateDeliveryGroups(built.groups, queryOpts, batch);
      res.json({ ...payload, operations_year: OPERATIONS_YEAR });
    } catch (error) {
      logError("OPERATIONS", "Deliveries groups error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/challans/by-token/:token", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_deliveries_management);
      if (!flags) return;
      const token = String(req.params.token || "").trim();
      const [rows] = await db.execute(`SELECT challan_id, batch FROM challan WHERE qr_token = ?`, [token]);
      if (!rows.length) return res.status(404).json({ message: "Challan not found" });
      const { groups } = await buildDeliveriesGroupsForBatch(db, rows[0].batch, { challanId: rows[0].challan_id });
      if (!groups.length) return res.status(404).json({ message: "Challan not found" });
      const group = groups[0];
      res.json({
        group,
        challan: group,
        orders: group.orders || [],
        rider: group.rider || null,
      });
    } catch (error) {
      logError("OPERATIONS", "Challan by token error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/operations/challans/:id/status", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_deliveries_management);
      if (!flags) return;
      const { delivery_status: rawStatus } = req.body || {};
      const delivery_status = normalizeDeliveryStatusForDb(rawStatus);
      if (!ALLOWED_STATUSES.includes(delivery_status) && !ALLOWED_STATUSES.includes(rawStatus)) {
        return res.status(400).json({ message: "Invalid status", allowed: ALLOWED_STATUSES });
      }
      const id = req.params.id;
      const [ex] = await db.execute(`SELECT challan_id FROM challan WHERE challan_id = ?`, [id]);
      if (!ex.length) return res.status(404).json({ message: "Challan not found" });
      await db.execute(
        `UPDATE orders o
         INNER JOIN challan_orders co ON co.order_id = o.order_id
         SET o.delivery_status = ?
         WHERE co.challan_id = ? AND ${opsOrderYearWhere("o")}`,
        [delivery_status, id]
      );
      res.json({ message: "Updated" });
    } catch (error) {
      logError("OPERATIONS", "Challan status error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/operations/challans/:id/rider", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_deliveries_management);
      if (!flags) return;
      const riderId = req.body?.rider_id;
      const id = req.params.id;
      const [ex] = await db.execute(`SELECT challan_id FROM challan WHERE challan_id = ?`, [id]);
      if (!ex.length) return res.status(404).json({ message: "Challan not found" });

      const nextRiderId = riderId === null || riderId === "" || riderId === undefined ? null : Number(riderId);
      if (nextRiderId !== null) {
        if (!Number.isFinite(nextRiderId) || nextRiderId <= 0) return res.status(400).json({ message: "Invalid rider id" });
        const rider = await fetchRiderById(db, nextRiderId);
        if (!rider) return res.status(400).json({ message: "Rider not found" });
      }

      await db.execute(
        `UPDATE orders o
         INNER JOIN challan_orders co ON co.order_id = o.order_id
         SET o.rider_id = ?
         WHERE co.challan_id = ? AND ${opsOrderYearWhere("o")}`,
        [nextRiderId, id]
      );

      if (nextRiderId !== null) {
        await db.execute(
          `UPDATE orders o
           INNER JOIN challan_orders co ON co.order_id = o.order_id
           SET o.delivery_status = 'Rider Assigned'
           WHERE co.challan_id = ? AND o.delivery_status = 'Pending' AND ${opsOrderYearWhere("o")}`,
          [id]
        );
      }
      res.json({ message: "Rider updated" });
    } catch (error) {
      logError("OPERATIONS", "Challan rider error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/operations/challans/bulk-detail", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_deliveries_management);
      if (!flags) return;
      const batch = normalizeBatch(req.body?.batch || req.body?.batch_id);
      let ids = [];
      if (Array.isArray(req.body?.challan_ids) && req.body.challan_ids.length) {
        ids = [...new Set(req.body.challan_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
      } else if (batch) {
        const [rows] = await db.execute(
          `SELECT c.challan_id FROM challan c
           WHERE c.batch = ?
             AND EXISTS (
               SELECT 1 FROM challan_orders co
               INNER JOIN orders o ON o.order_id = co.order_id
               WHERE co.challan_id = c.challan_id AND ${opsOrderYearWhere("o")}
             )
           ORDER BY c.area, c.address, c.challan_id`,
          [batch]
        );
        ids = rows.map((r) => r.challan_id);
      } else {
        return res.status(400).json({ message: "challan_ids array or batch required" });
      }
      if (!ids.length) return res.status(400).json({ message: "No valid challan ids" });

      const items = [];
      for (const id of ids) {
        const [challans] = await db.execute(`SELECT * FROM challan WHERE challan_id = ?`, [id]);
        if (!challans.length) continue;
        const c = challans[0];
        const [orderRows] = await db.execute(
          `SELECT o.order_id, o.customer_id, o.name, o.contact, o.alt_contact, o.order_type,
                  o.weight, o.quantity, o.address, o.area, o.description, o.delivery_status, o.rider_id, o.batch
           FROM orders o INNER JOIN challan_orders co ON co.order_id = o.order_id
           WHERE co.challan_id = ? AND ${opsOrderYearWhere("o")}
           ORDER BY o.order_id`,
          [id]
        );
        if (!orderRows.length) continue;
        const riderIds = uniqueRiderIdsFromOrders(orderRows);
        const rider = riderIds.length === 1 ? await fetchRiderById(db, riderIds[0]) : null;
        const totalQty = sumOrdersTotalQuantity(orderRows);
        const totalWeight = sumOrdersTotalWeightKg(orderRows);
        items.push({
          challan: {
            ...c,
            rider_id: riderIds.length === 1 ? riderIds[0] : null,
            total_quantity: totalQty,
            total_weight: totalWeight,
          },
          orders: orderRows,
          rider,
        });
      }
      res.json({ items });
    } catch (error) {
      logError("OPERATIONS", "Challan bulk detail error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Backfill challans for existing orders in a batch (admin utility)
  app.post("/api/operations/challans/sync-batch", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_deliveries_management);
      if (!flags) return;
      const batch = normalizeBatch(req.body?.batch);
      if (!batch) return res.status(400).json({ message: "batch is required" });

      const { assignOrderToChallan } = await import("../utils/challanAssign.js");
      const [orders] = await db.execute(
        `SELECT order_id, booking_date, batch, address, area, name FROM orders o
         WHERE TRIM(COALESCE(o.batch, '')) = ? AND TRIM(COALESCE(o.address, '')) != ''
           AND ${opsOrderYearWhere("o")}`,
        [batch]
      );
      let linked = 0;
      for (const o of orders) {
        const cid = await assignOrderToChallan(db, o);
        if (cid) linked++;
      }
      res.json({ message: "Batch synced", orders_processed: orders.length, challans_linked: linked });
    } catch (error) {
      logError("OPERATIONS", "Sync batch error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  log("OPERATIONS", "Operations routes registered");
}
