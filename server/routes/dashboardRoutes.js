import { logError } from "../utils/logger.js";
import { buildOrderBookingYearWhere, buildBatchReceivedYearWhere, buildOrderYearWhere, batchOrderJoinSql, orderKgExpr } from "../utils/yearFilter.js";

function buildYearWhere(year, params) {
  return buildOrderBookingYearWhere(year, params, "o");
}

function calcUnordered(received, ordered, weightLoss, compensation, rotten) {
  return Number(received || 0) - Number(ordered || 0) - Number(weightLoss || 0) - Number(compensation || 0) - Number(rotten || 0);
}

function slugifyOrderType(value) {
  return String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

export function registerDashboardRoutes(app, db, verifyToken) {
  // GET /api/dashboard/kpis?year=2026|2025|2024|all
  app.get("/api/dashboard/kpis", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;

      const params = [];
      const conditions = buildYearWhere(year, params);
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          COUNT(*) AS totalOrders,
          COALESCE(SUM(COALESCE(o.total_amount, 0)), 0) AS totalSales,
          COALESCE(SUM(COALESCE(o.received_amount, 0)), 0) AS receivedPayments,
          COALESCE(SUM(COALESCE(o.pending_amount, 0)), 0) AS pendingAmount,
          SUM(CASE WHEN COALESCE(o.pending_amount, 0) > 0 THEN 1 ELSE 0 END) AS pendingPaymentsCount,
          SUM(CASE WHEN COALESCE(o.pending_amount, 0) <= 0 THEN 1 ELSE 0 END) AS clearedOrders
        FROM orders o
        ${where}
        `,
        params
      );

      const r = rows?.[0] || {};
      const totalOrders = Number(r.totalOrders || 0);
      const clearedOrders = Number(r.clearedOrders || 0);

      res.json({
        kpis: {
          totalOrders,
          totalSales: Number(r.totalSales || 0),
          receivedPayments: Number(r.receivedPayments || 0),
          pendingAmount: Number(r.pendingAmount || 0),
          pendingPaymentsCount: Number(r.pendingPaymentsCount || 0),
          paymentClearance: totalOrders > 0 ? Math.round((clearedOrders / totalOrders) * 1000) / 10 : 0,
        },
      });
    } catch (e) {
      logError("DASHBOARD", "KPIs error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // GET /api/dashboard/target-achievement?year=...
  app.get("/api/dashboard/target-achievement", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;

      const params = [];
      const conditions = buildYearWhere(year, params);
      conditions.push("(o.order_type IS NOT NULL AND TRIM(o.order_type) != '')");
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          TRIM(o.order_type) AS orderType,
          COUNT(*) AS cnt
        FROM orders o
        ${where}
        GROUP BY TRIM(o.order_type)
        ORDER BY cnt DESC, orderType ASC
        `,
        params
      );

      const breakdown = (rows || []).map((row) => {
        const label = String(row.orderType || "Unknown").trim() || "Unknown";
        const value = Number(row.cnt || 0);
        return { label, value, key: slugifyOrderType(label), orderType: label };
      });

      const achievedTotal = breakdown.reduce((sum, item) => sum + item.value, 0);
      const breakdownWithPct = breakdown.map((item) => ({
        ...item,
        percentage: achievedTotal > 0 ? (item.value / achievedTotal) * 100 : 0,
      }));

      res.json({
        target: {
          targetTotal: achievedTotal,
          achievedTotal,
          achievedForTarget: achievedTotal,
          remaining: 0,
        },
        breakdown: breakdownWithPct,
      });
    } catch (e) {
      logError("DASHBOARD", "Target achievement error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // GET /api/dashboard/day-wise?year=... (deprecated for Mango CRM)
  app.get("/api/dashboard/day-wise", verifyToken, async (_req, res) => {
    res.json({ days: [] });
  });

  // GET /api/dashboard/source-wise?year=...
  app.get("/api/dashboard/source-wise", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;

      const params = [];
      const conditions = buildYearWhere(year, params);
      conditions.push("(o.source IS NOT NULL AND TRIM(o.source) != '')");
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          TRIM(o.source) AS sourceName,
          COUNT(*) AS count
        FROM orders o
        ${where}
        GROUP BY TRIM(o.source)
        ORDER BY count DESC, sourceName ASC
        `,
        params
      );

      const sources = (rows || []).map((r) => ({
        sourceName: r.sourceName || "—",
        count: Number(r.count || 0),
      }));

      res.json({ sources });
    } catch (e) {
      logError("DASHBOARD", "Source-wise error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // GET /api/dashboard/sales-overview?year=... — monthly series
  app.get("/api/dashboard/sales-overview", verifyToken, async (req, res) => {
    try {
      const { year = "2026" } = req.query;

      const params = [];
      const conditions = buildYearWhere(year, params);
      conditions.push("o.booking_date IS NOT NULL");
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          DATE_FORMAT(o.booking_date, '%Y-%m') AS month,
          COUNT(*) AS orders,
          COALESCE(SUM(o.total_amount), 0) AS totalSales,
          COALESCE(SUM(o.received_amount), 0) AS receivedPayments,
          COALESCE(SUM(o.pending_amount), 0) AS pendingPayments,
          COALESCE(SUM(o.quantity), 0) AS totalQuantity
        FROM orders o
        ${where}
        GROUP BY DATE_FORMAT(o.booking_date, '%Y-%m')
        ORDER BY month ASC
        `,
        params
      );

      const series = (rows || []).map((r) => {
        const orders = Number(r.orders || 0);
        const totalSales = Number(r.totalSales || 0);
        return {
          date: r.month ? String(r.month) : "",
          month: r.month ? String(r.month) : "",
          orders,
          totalSales,
          receivedPayments: Number(r.receivedPayments || 0),
          pendingPayments: Number(r.pendingPayments || 0),
          totalQuantity: Number(r.totalQuantity || 0),
          avgOrderValue: orders > 0 ? Math.round(totalSales / orders) : 0,
        };
      });

      res.json({ series });
    } catch (e) {
      logError("DASHBOARD", "Sales overview error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // GET /api/dashboard/area-wise?year=&batch=all|...
  app.get("/api/dashboard/area-wise", verifyToken, async (req, res) => {
    try {
      const { year = "all", batch = "all" } = req.query;

      const params = [];
      const conditions = buildYearWhere(year, params);
      conditions.push("(o.area IS NOT NULL AND TRIM(o.area) != '')");

      const batchValue = String(batch ?? "all").trim();
      if (batchValue && batchValue.toLowerCase() !== "all") {
        conditions.push("TRIM(o.batch) = ?");
        params.push(batchValue);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          TRIM(o.area) AS area,
          COUNT(*) AS total
        FROM orders o
        ${where}
        GROUP BY TRIM(o.area)
        ORDER BY total DESC, area ASC
        `,
        params
      );

      const areas = (rows || []).map((r) => ({
        area: r.area || "—",
        total: Number(r.total || 0),
      }));

      res.json({ areas });
    } catch (e) {
      logError("DASHBOARD", "Area-wise error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // GET /api/dashboard/batches?year=... — batch numbers from batches table (by received_date year)
  app.get("/api/dashboard/batches", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;
      const params = [];
      const yearConditions = buildBatchReceivedYearWhere(year, params);
      const where = yearConditions.length ? `WHERE ${yearConditions.join(" AND ")}` : "";
      const [rows] = await db.execute(
        `SELECT b.batch_number AS batch FROM batches b ${where}
         ORDER BY CAST(b.batch_number AS UNSIGNED) ASC, b.batch_number ASC`,
        params
      );
      const batches = (rows || []).map((r) => String(r.batch || "").trim()).filter(Boolean);
      res.json({ batches });
    } catch (e) {
      logError("DASHBOARD", "Batches error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // GET /api/dashboard/mangoes-summary?year=...
  // Batches filtered by received_date year; order metrics use booking_date year buckets (2026/2024/else 2025).
  app.get("/api/dashboard/mangoes-summary", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;
      const params = [];
      const orderYearConditions = buildOrderYearWhere(year, params, "o");
      const batchConditions = buildBatchReceivedYearWhere(year, params, "b");
      const batchWhere = batchConditions.length ? `WHERE ${batchConditions.join(" AND ")}` : "";
      const orderYearAnd = orderYearConditions.length
        ? ` AND ${orderYearConditions.join(" AND ")}`
        : "";
      const kg = orderKgExpr("o");

      const [rows] = await db.execute(
        `
        SELECT
          b.batch_id,
          b.batch_number,
          b.received_in_kgs,
          b.compensation_or_gift,
          b.rotten,
          b.weight_loss,
          COALESCE(SUM(${kg}), 0) AS ordered_kg,
          COALESCE(SUM(CASE WHEN o.delivery_status = 'Delivered' THEN ${kg} ELSE 0 END), 0) AS delivered_kg,
          COALESCE(SUM(CASE WHEN o.delivery_status = 'Delivered'
            THEN COALESCE(o.pending_amount, 0) ELSE 0 END), 0) AS delivered_pending,
          COALESCE(SUM(CASE WHEN o.delivery_status = 'Pending' THEN ${kg} ELSE 0 END), 0) AS undelivered_kg,
          COALESCE(SUM(CASE WHEN o.delivery_status = 'Pending'
            THEN COALESCE(o.pending_amount, 0) ELSE 0 END), 0) AS undelivered_pending
        FROM batches b
        LEFT JOIN orders o ON ${batchOrderJoinSql("o", "b")}${orderYearAnd}
        ${batchWhere}
        GROUP BY b.batch_id, b.batch_number, b.received_in_kgs, b.compensation_or_gift, b.rotten, b.weight_loss
        ORDER BY CAST(b.batch_number AS UNSIGNED) ASC, b.batch_number ASC
        `,
        params
      );

      const fmtKg = (n) => `${Math.round(Number(n || 0)).toLocaleString("en-PK")} KG`;
      const fmtKgRs = (kg, rs) => `${fmtKg(kg)} - Rs. ${Math.round(Number(rs || 0)).toLocaleString("en-PK")}`;

      const dataRows = (rows || []).map((r) => {
        const received = Number(r.received_in_kgs || 0);
        const compensation = Number(r.compensation_or_gift || 0);
        const rotten = Number(r.rotten || 0);
        const weightLoss = Number(r.weight_loss || 0);
        const ordered = Number(r.ordered_kg || 0);
        const unordered = calcUnordered(received, ordered, weightLoss, compensation, rotten);
        return {
          batch_number: r.batch_number,
          received,
          compensation_or_gift: compensation,
          rotten,
          weight_loss: weightLoss,
          ordered,
          delivered_kg: Number(r.delivered_kg || 0),
          delivered_pending: Number(r.delivered_pending || 0),
          undelivered_kg: Number(r.undelivered_kg || 0),
          undelivered_pending: Number(r.undelivered_pending || 0),
          unordered,
          delivered_pending_label: fmtKgRs(r.delivered_kg, r.delivered_pending),
          undelivered_pending_label: fmtKgRs(r.undelivered_kg, r.undelivered_pending),
        };
      });

      const total = dataRows.reduce(
        (acc, row) => ({
          received: acc.received + row.received,
          compensation_or_gift: acc.compensation_or_gift + row.compensation_or_gift,
          rotten: acc.rotten + row.rotten,
          weight_loss: acc.weight_loss + row.weight_loss,
          ordered: acc.ordered + row.ordered,
          delivered_kg: acc.delivered_kg + row.delivered_kg,
          delivered_pending: acc.delivered_pending + row.delivered_pending,
          undelivered_kg: acc.undelivered_kg + row.undelivered_kg,
          undelivered_pending: acc.undelivered_pending + row.undelivered_pending,
          unordered: acc.unordered + row.unordered,
        }),
        {
          received: 0,
          compensation_or_gift: 0,
          rotten: 0,
          weight_loss: 0,
          ordered: 0,
          delivered_kg: 0,
          delivered_pending: 0,
          undelivered_kg: 0,
          undelivered_pending: 0,
          unordered: 0,
        }
      );

      res.json({
        rows: dataRows,
        total: {
          ...total,
          delivered_pending_label: fmtKgRs(total.delivered_kg, total.delivered_pending),
          undelivered_pending_label: fmtKgRs(total.undelivered_kg, total.undelivered_pending),
        },
      });
    } catch (e) {
      logError("DASHBOARD", "Mangoes summary error", e);
      res.status(500).json({ message: "Server error" });
    }
  });
}
