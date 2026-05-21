// server/routes/dashboard.js
import { logError } from "../utils/logger.js";

const TYPES = {
  premium: "Hissa - Premium",
  standard: "Hissa - Standard",
  waqf: "Hissa - Waqf",
  exclusive: "Hissa - Exclusive",
  goat: "Goat (Hissa)",
  super_goat: "Super Goat (Hissa)",
  premium_goat: "Premium Goat (Hissa)",
};

/**
 * ✅ Matches your booking APIs behavior:
 * - For 2026/2025: include YEAR(booking_date)=year
 * - For 2024: include booking_date IS NULL OR YEAR(booking_date) < 2025
 * - For all: no filter
 */
function buildYearWhere(year, params) {
  const conditions = [];

  if (year === "2026" || year === "2025") {
    conditions.push("YEAR(o.booking_date) = ?");
    params.push(year);
  } else if (year === "2024") {
    conditions.push("(o.booking_date IS NULL OR YEAR(o.booking_date) < 2025)");
  }

  return conditions;
}

/**
 * Normalize order_type in SQL so even if DB has different spacing/hyphens, we still map correctly.
 * NOTE: Booking dashboard supports hissa + goat sub-types.
 */
const TYPE_KEY_SQL = `
  CASE
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissapremium') THEN 'premium'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissastandard') THEN 'standard'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissawaqf') THEN 'waqf'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissaexclusive') THEN 'exclusive'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('supergoathissa') THEN 'super_goat'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('premiumgoathissa') THEN 'premium_goat'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('goathissa') THEN 'goat'
    ELSE NULL
  END
`;

/**
 * Fixed day mapping to Day 1/2/3 (supports different casing/spaces)
 */
const DAY_KEY_SQL = `
  CASE
    WHEN REPLACE(LOWER(o.day),' ','') IN ('day1','1') THEN 'day1'
    WHEN REPLACE(LOWER(o.day),' ','') IN ('day2','2') THEN 'day2'
    WHEN REPLACE(LOWER(o.day),' ','') IN ('day3','3') THEN 'day3'
    ELSE NULL
  END
`;

/** Maps booking slot strings to slot1 | slot2 | slot3 (matches booking.js normalizeSlot). */
const SLOT_KEY_SQL = `
  CASE
    WHEN REPLACE(UPPER(TRIM(IFNULL(o.slot,''))), ' ', '') IN ('SLOT1','1') THEN 'slot1'
    WHEN REPLACE(UPPER(TRIM(IFNULL(o.slot,''))), ' ', '') IN ('SLOT2','2') THEN 'slot2'
    WHEN REPLACE(UPPER(TRIM(IFNULL(o.slot,''))), ' ', '') IN ('SLOT3','3') THEN 'slot3'
    ELSE NULL
  END
`;

/** 3×3×5 grid: column aliases d1s1_std … d3s3_pg for area-wise tooltip (order type only). */
const AREA_TYPE_GRID_META = (() => {
  const dayKeys = ["day1", "day2", "day3"];
  const slotKeys = ["slot1", "slot2", "slot3"];
  const typeKeys = [
    { key: "standard", as: "std" },
    { key: "premium", as: "prm" },
    { key: "exclusive", as: "exc" },
    { key: "super_goat", as: "sg" },
    { key: "premium_goat", as: "pg" },
  ];
  const dayCode = { day1: "d1", day2: "d2", day3: "d3" };
  const slotCode = { slot1: "s1", slot2: "s2", slot3: "s3" };
  const sqlParts = [];
  const aliases = [];
  for (const dk of dayKeys) {
    for (const sk of slotKeys) {
      for (const { key: tk, as: tas } of typeKeys) {
        const al = `${dayCode[dk]}${slotCode[sk]}_${tas}`;
        aliases.push(al);
        sqlParts.push(
          `SUM(CASE WHEN ${DAY_KEY_SQL} = '${dk}' AND ${SLOT_KEY_SQL} = '${sk}' AND ${TYPE_KEY_SQL} = '${tk}' THEN 1 ELSE 0 END) AS ${al}`
        );
      }
    }
  }
  return { sqlFragment: sqlParts.join(",\n        "), aliases };
})();

const LEAD_TYPE_KEY_SQL = `
  CASE
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(l.order_type),' ',''),'-',''),'(',''),')','') IN ('hissapremium') THEN 'premium'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(l.order_type),' ',''),'-',''),'(',''),')','') IN ('hissastandard') THEN 'standard'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(l.order_type),' ',''),'-',''),'(',''),')','') IN ('hissawaqf') THEN 'waqf'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(l.order_type),' ',''),'-',''),'(',''),')','') IN ('hissaexclusive') THEN 'exclusive'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(l.order_type),' ',''),'-',''),'(',''),')','') IN ('supergoathissa') THEN 'super_goat'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(l.order_type),' ',''),'-',''),'(',''),')','') IN ('premiumgoathissa') THEN 'premium_goat'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(l.order_type),' ',''),'-',''),'(',''),')','') IN ('goathissa') THEN 'goat'
    ELSE NULL
  END
`;

function getOrderTypeFilterList(orderType) {
  const list = Array.isArray(orderType)
    ? orderType
    : orderType
      ? [orderType]
      : ["hissa"];

  return list.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
}

function applyDashboardOrderTypeFilter(orderType, conditions) {
  const list = getOrderTypeFilterList(orderType);
  const allowed = [];

  if (list.includes("hissa")) allowed.push("'standard'", "'premium'", "'waqf'", "'exclusive'");
  if (list.includes("goat")) allowed.push("'goat'", "'super_goat'", "'premium_goat'");

  conditions.push(`${TYPE_KEY_SQL} IN (${allowed.length ? allowed.join(",") : "'standard','premium','waqf','exclusive'"})`);
}

function applyAreaOrderTypeFilter(orderType, conditions) {
  const list = getOrderTypeFilterList(orderType);
  const allowed = [];

  // Area-wise: Hissa = Standard + Premium + Exclusive only (no Waqf). Goat = Super + Premium goat only (not generic Goat (Hissa)).
  if (list.includes("hissa")) allowed.push("'standard'", "'premium'", "'exclusive'");
  if (list.includes("goat")) allowed.push("'super_goat'", "'premium_goat'");

  conditions.push(`${TYPE_KEY_SQL} IN (${allowed.length ? allowed.join(",") : "'standard','premium','exclusive'"})`);
}

function applyLeadOrderTypeFilter(orderType, conditions) {
  const list = getOrderTypeFilterList(orderType);
  const allowed = [];

  if (list.includes("hissa")) allowed.push("'standard'", "'premium'", "'waqf'", "'exclusive'");
  if (list.includes("goat")) allowed.push("'goat'", "'super_goat'", "'premium_goat'");

  conditions.push(`${LEAD_TYPE_KEY_SQL} IN (${allowed.length ? allowed.join(",") : "'standard','premium','waqf','exclusive'"})`);
}

function hasOrderTypeQueryParam(orderType) {
  if (orderType === undefined || orderType === null) return false;
  if (Array.isArray(orderType)) return orderType.some((x) => String(x ?? "").trim() !== "");
  return String(orderType).trim() !== "";
}

export const registerDashboardRoutes = (app, db, verifyToken) => {
  // -----------------------
  // GET: /api/dashboard/kpis?year=2026|2025|2024|all
  //
  // ✅ KPIs for booking order types (incl. Hissa - Exclusive) plus goat sub-types when Goat filter is on
  // ✅ Received Payments = SUM(orders.received_amount)
  // ✅ Cleared Orders = COUNT where pending_amount <= 0
  // ✅ Clearance Rate = clearedOrders / totalOrders * 100
  // -----------------------
  app.get("/api/dashboard/kpis", verifyToken, async (req, res) => {
    try {
      const { year = "all", orderType } = req.query;

      const params = [];
      const conditions = buildYearWhere(year, params);
      applyDashboardOrderTypeFilter(orderType, conditions);
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          COUNT(*) AS totalOrders,

          SUM(CASE WHEN COALESCE(o.pending_amount, 0) <= 0 THEN 1 ELSE 0 END) AS clearedOrders,
          SUM(CASE WHEN COALESCE(o.pending_amount, 0) > 0 THEN 1 ELSE 0 END) AS pendingOrders,

          COALESCE(SUM(COALESCE(o.total_amount, 0)), 0) AS totalSales,
          COALESCE(SUM(COALESCE(o.received_amount, 0)), 0) AS receivedPayments,
          COALESCE(SUM(COALESCE(o.pending_amount, 0)), 0) AS pendingAmount
        FROM orders o
        ${where}
        `,
        params
      );

      const r = rows?.[0] || {};
      const totalOrders = Number(r.totalOrders || 0);
      const clearedOrders = Number(r.clearedOrders || 0);
      const clearanceRate = totalOrders > 0 ? (clearedOrders / totalOrders) * 100 : 0;

      res.json({
        kpis: {
          totalOrders,
          clearedOrders,
          clearanceRate,
          pendingPaymentsCount: Number(r.pendingOrders || 0),
          totalSales: Number(r.totalSales || 0),
          receivedPayments: Number(r.receivedPayments || 0),
          pendingAmount: Number(r.pendingAmount || 0),
        },
      });
    } catch (e) {
      logError("DASHBOARD", "KPIs error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // -----------------------
  // GET: /api/dashboard/target-achievement?year=...&orderType=hissa&orderType=goat
  // Donut + Progress bars (hissa + goat with sub-types). Optional orderType matches booking dashboard toggles.
  // Super Goat + Premium Goat (and generic Goat) counts always use full year totals; hissa rows respect orderType.
  // -----------------------
  app.get("/api/dashboard/target-achievement", verifyToken, async (req, res) => {
    try {
      const { year = "all", orderType } = req.query;

      const map = { premium: 0, standard: 0, waqf: 0, exclusive: 0, goat: 0, super_goat: 0, premium_goat: 0 };

      if (hasOrderTypeQueryParam(orderType)) {
        const paramsFiltered = [];
        const conditionsFiltered = buildYearWhere(year, paramsFiltered);
        applyDashboardOrderTypeFilter(orderType, conditionsFiltered);
        conditionsFiltered.push(`${TYPE_KEY_SQL} IS NOT NULL`);
        const whereFiltered = conditionsFiltered.length ? `WHERE ${conditionsFiltered.join(" AND ")}` : "";

        const [rowsFiltered] = await db.execute(
          `
        SELECT
          ${TYPE_KEY_SQL} AS typeKey,
          COUNT(*) AS cnt
        FROM orders o
        ${whereFiltered}
        GROUP BY typeKey
        `,
          paramsFiltered
        );

        const hissaKeys = ["premium", "standard", "waqf", "exclusive"];
        for (const row of rowsFiltered || []) {
          const k = row.typeKey;
          if (k && hissaKeys.includes(k)) {
            map[k] = Number(row.cnt || 0);
          }
        }

        const paramsGoat = [];
        const conditionsGoat = buildYearWhere(year, paramsGoat);
        conditionsGoat.push(`${TYPE_KEY_SQL} IN ('goat','super_goat','premium_goat')`);
        const whereGoat = conditionsGoat.length ? `WHERE ${conditionsGoat.join(" AND ")}` : "";

        const [rowsGoat] = await db.execute(
          `
        SELECT
          ${TYPE_KEY_SQL} AS typeKey,
          COUNT(*) AS cnt
        FROM orders o
        ${whereGoat}
        GROUP BY typeKey
        `,
          paramsGoat
        );

        const goatKeys = ["goat", "super_goat", "premium_goat"];
        for (const row of rowsGoat || []) {
          const k = row.typeKey;
          if (k && goatKeys.includes(k)) {
            map[k] = Number(row.cnt || 0);
          }
        }
      } else {
        const params = [];
        const conditions = buildYearWhere(year, params);
        conditions.push(`${TYPE_KEY_SQL} IS NOT NULL`);

        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const [rows] = await db.execute(
          `
        SELECT
          ${TYPE_KEY_SQL} AS typeKey,
          COUNT(*) AS cnt
        FROM orders o
        ${where}
        GROUP BY typeKey
        `,
          params
        );

        for (const row of rows || []) {
          if (row.typeKey && map[row.typeKey] !== undefined) {
            map[row.typeKey] = Number(row.cnt || 0);
          }
        }
      }

      const goatTotal = map.goat + map.super_goat + map.premium_goat;
      const achievedTotal = map.premium + map.standard + map.waqf + map.exclusive + goatTotal;
      const achievedForTarget = map.premium + map.standard + map.waqf + map.exclusive;
      const targetTotal = year === "2024" ? 500 : year === "2025" ? 1000 : 2000;

      const breakdown = [
        { key: "premium", label: TYPES.premium, value: map.premium },
        { key: "standard", label: TYPES.standard, value: map.standard },
        { key: "waqf", label: TYPES.waqf, value: map.waqf },
        { key: "exclusive", label: TYPES.exclusive, value: map.exclusive },
        { key: "goat", label: TYPES.goat, value: goatTotal },
        { key: "super_goat", label: TYPES.super_goat, value: map.super_goat },
        { key: "premium_goat", label: TYPES.premium_goat, value: map.premium_goat },
      ].map((b) => ({
        ...b,
        percentage: achievedTotal > 0 ? (b.value / achievedTotal) * 100 : 0,
      }));

      res.json({
        target: {
          targetTotal,
          achievedTotal,
          achievedForTarget,
          remaining: Math.max(0, targetTotal - achievedForTarget),
        },
        breakdown,
      });
    } catch (e) {
      logError("DASHBOARD", "Target achievement error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // -----------------------
  // GET: /api/dashboard/day-wise?year=...
  // Day 1/2/3 cards, columns include Hissa - Exclusive between Waqf and Total
  // rows: Total Orders, Payment Cleared, Pending (Completely), Pending (Partially)
  // (goat split by order_type sub-category)
  // -----------------------
  app.get("/api/dashboard/day-wise", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;

      const params = [];
      const conditions = buildYearWhere(year, params);
      conditions.push(`${TYPE_KEY_SQL} IS NOT NULL`);
      conditions.push(`${DAY_KEY_SQL} IS NOT NULL`);

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          ${DAY_KEY_SQL} AS dayKey,
          ${TYPE_KEY_SQL} AS typeKey,

          COUNT(*) AS totalOrders,

          -- Payment Cleared: pending is 0
          SUM(CASE WHEN COALESCE(o.pending_amount,0) = 0 THEN 1 ELSE 0 END) AS paymentCleared,
          -- Pending (Completely): pending = total amount (nothing paid)
          SUM(CASE WHEN COALESCE(o.pending_amount,0) = COALESCE(o.total_amount,0) AND COALESCE(o.total_amount,0) > 0 THEN 1 ELSE 0 END) AS pendingCompletely,
          -- Pending (Partially): some pending but less than total (some amount paid)
          SUM(CASE WHEN COALESCE(o.pending_amount,0) > 0 AND COALESCE(o.pending_amount,0) < COALESCE(o.total_amount,0) THEN 1 ELSE 0 END) AS pendingPartially

        FROM orders o
        ${where}
        GROUP BY dayKey, typeKey
        `,
        params
      );

      const emptyDay = () => ({
        premium: 0,
        standard: 0,
        waqf: 0,
        exclusive: 0,
        goat: 0,
        super_goat: 0,
        premium_goat: 0,
      });

      const base = {
        day1: {
          title: "DAY 1",
          rows: {
            totalOrders: emptyDay(),
            paymentCleared: emptyDay(),
            pendingCompletely: emptyDay(),
            pendingPartially: emptyDay(),
          },
        },
        day2: {
          title: "DAY 2",
          rows: {
            totalOrders: emptyDay(),
            paymentCleared: emptyDay(),
            pendingCompletely: emptyDay(),
            pendingPartially: emptyDay(),
          },
        },
        day3: {
          title: "DAY 3",
          rows: {
            totalOrders: emptyDay(),
            paymentCleared: emptyDay(),
            pendingCompletely: emptyDay(),
            pendingPartially: emptyDay(),
          },
        },
      };

      for (const r of rows) {
        const d = r.dayKey ?? r.daykey ?? null;
        const t = r.typeKey ?? r.typekey ?? null;
        const totalOrders = Number(r.totalOrders ?? r.totalorders ?? 0);
        const paymentCleared = Number(r.paymentCleared ?? r.paymentcleared ?? 0);
        const pendingCompletely = Number(r.pendingCompletely ?? r.pendingcompletely ?? 0);
        const pendingPartially = Number(r.pendingPartially ?? r.pendingpartially ?? 0);

        if (!d || !t || !base[d] || !base[d].rows || base[d].rows.totalOrders[t] === undefined) continue;

        base[d].rows.totalOrders[t] = totalOrders;
        base[d].rows.paymentCleared[t] = paymentCleared;
        base[d].rows.pendingCompletely[t] = pendingCompletely;
        base[d].rows.pendingPartially[t] = pendingPartially;
      }

      const toCard = (dkey) => {
        const d = base[dkey];

        return {
          key: dkey,
          title: d.title,
          columns: ["Premium", "Standard", "Waqf", "Exclusive", "Total", "Super Goat", "Premium Goat"],
          data: [
            {
              label: "Total Orders",
              premium: d.rows.totalOrders.premium,
              standard: d.rows.totalOrders.standard,
              waqf: d.rows.totalOrders.waqf,
              exclusive: d.rows.totalOrders.exclusive,
              super_goat: d.rows.totalOrders.super_goat + d.rows.totalOrders.goat,
              premium_goat: d.rows.totalOrders.premium_goat,
              total: d.rows.totalOrders.premium + d.rows.totalOrders.standard + d.rows.totalOrders.waqf + d.rows.totalOrders.exclusive,
            },
            {
              label: "Payment Cleared",
              premium: d.rows.paymentCleared.premium,
              standard: d.rows.paymentCleared.standard,
              waqf: d.rows.paymentCleared.waqf,
              exclusive: d.rows.paymentCleared.exclusive,
              super_goat: d.rows.paymentCleared.super_goat + d.rows.paymentCleared.goat,
              premium_goat: d.rows.paymentCleared.premium_goat,
              total: d.rows.paymentCleared.premium + d.rows.paymentCleared.standard + d.rows.paymentCleared.waqf + d.rows.paymentCleared.exclusive,
            },
            {
              label: "Pending (Completely)",
              premium: d.rows.pendingCompletely.premium,
              standard: d.rows.pendingCompletely.standard,
              waqf: d.rows.pendingCompletely.waqf,
              exclusive: d.rows.pendingCompletely.exclusive,
              super_goat: d.rows.pendingCompletely.super_goat + d.rows.pendingCompletely.goat,
              premium_goat: d.rows.pendingCompletely.premium_goat,
              total: d.rows.pendingCompletely.premium + d.rows.pendingCompletely.standard + d.rows.pendingCompletely.waqf + d.rows.pendingCompletely.exclusive,
            },
            {
              label: "Pending (Partially)",
              premium: d.rows.pendingPartially.premium,
              standard: d.rows.pendingPartially.standard,
              waqf: d.rows.pendingPartially.waqf,
              exclusive: d.rows.pendingPartially.exclusive,
              super_goat: d.rows.pendingPartially.super_goat + d.rows.pendingPartially.goat,
              premium_goat: d.rows.pendingPartially.premium_goat,
              total: d.rows.pendingPartially.premium + d.rows.pendingPartially.standard + d.rows.pendingPartially.waqf + d.rows.pendingPartially.exclusive,
            },
          ],
        };
      };

      res.json({ days: [toCard("day1"), toCard("day2"), toCard("day3")] });
    } catch (e) {
      logError("DASHBOARD", "Day-wise error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // -----------------------
  // GET: /api/dashboard/reference-wise?year=...
  // Uses orders.closed_by as the primary grouping key.
  // Lead generated = orders with that closer + queries (leads) with same name in lead reference.
  // Lead converted = orders with that closer only.
  // -----------------------
  app.get("/api/dashboard/reference-wise", verifyToken, async (req, res) => {
    try {
      const { year = "all", orderType } = req.query;

      const paramsO = [];
      const conditionsO = buildYearWhere(year, paramsO);
      applyDashboardOrderTypeFilter(orderType, conditionsO);
      conditionsO.push("o.closed_by IS NOT NULL AND o.closed_by != ''");
      const whereO = conditionsO.length ? `WHERE ${conditionsO.join(" AND ")}` : "";

      const paramsL = [];
const conditionsL = [];

if (year === "2026" || year === "2025") {
  conditionsL.push("YEAR(l.created_at) = ?");
  paramsL.push(year);
} else if (year === "2024") {
  conditionsL.push("(l.created_at IS NULL OR YEAR(l.created_at) < 2025)");
}

// ✅ NO orderType filter here

conditionsL.push("l.reference IS NOT NULL AND l.reference != ''");
      const whereL = conditionsL.length ? `WHERE ${conditionsL.join(" AND ")}` : "";

      const [orderRows] = await db.execute(
        `
        SELECT
          o.closed_by AS name,
          COUNT(*) AS orderCount,
          COALESCE(SUM(o.total_amount), 0) AS totalRevenueGenerated
        FROM orders o
        ${whereO}
        GROUP BY o.closed_by
        `,
        paramsO
      );

      const [leadRows] = await db.execute(
        `
        SELECT l.reference AS name, COUNT(*) AS queryCount
        FROM leads l
        ${whereL}
        GROUP BY l.reference
        `,
        paramsL
      );

      const orderMap = new Map();
      for (const r of orderRows || []) {
        const orderCount = Number(r.orderCount || 0);
        orderMap.set(r.name, {
          orderCount,
          leadsConverted: orderCount,
          totalRevenueGenerated: Number(r.totalRevenueGenerated || 0),
        });
      }
      const leadMap = new Map();
      for (const r of leadRows || []) {
        leadMap.set(r.name, Number(r.queryCount || 0));
      }

      // Keep names sourced from closed_by only.
      const data = [...orderMap.keys()].map((name) => {
        const o = orderMap.get(name) || {
          orderCount: 0,
          totalRevenueGenerated: 0,
        };
        const leadsConverted = o.orderCount;
        const queryCount = leadMap.get(name) || 0;
        const leadsGenerated = queryCount;
        const conversionRate = leadsGenerated > 0 ? (leadsConverted / leadsGenerated) * 100 : 0;
        return {
          name,
          leadsGenerated,
          leadsConverted,
          totalRevenueGenerated: o.totalRevenueGenerated,
          conversionRate,
        };
      });
      data.sort((a, b) => (b.leadsGenerated - a.leadsGenerated));

      res.json({ references: data });
    } catch (e) {
      logError("DASHBOARD", "Reference-wise error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // -----------------------
  // GET: /api/dashboard/source-wise?year=...
  // Order count per order_source (for Source wise summary cards)
  // -----------------------
  app.get("/api/dashboard/source-wise", verifyToken, async (req, res) => {
    try {
      const { year = "all", orderType } = req.query;

      const params = [];
      const conditions = buildYearWhere(year, params);
      applyDashboardOrderTypeFilter(orderType, conditions);
      conditions.push("(o.order_source IS NOT NULL AND o.order_source != '')");

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          o.order_source AS sourceName,
          COUNT(*) AS count
        FROM orders o
        ${where}
        GROUP BY o.order_source
        ORDER BY count DESC
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

  // -----------------------
  // GET: /api/dashboard/sales-overview?year=...
  // Daily series for line chart: date, orders, totalSales, receivedPayments, pendingPayments, totalQuantity, avgOrderValue
  // -----------------------
  app.get("/api/dashboard/sales-overview", verifyToken, async (req, res) => {
    try {
      const { year = "2026", orderType } = req.query;

      const params = [];
      const conditions = buildYearWhere(year, params);
      applyDashboardOrderTypeFilter(orderType, conditions);
      conditions.push("o.booking_date IS NOT NULL");
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          DATE(o.booking_date) AS date,
          COUNT(*) AS orders,
          COALESCE(SUM(o.total_amount), 0) AS totalSales,
          COALESCE(SUM(o.received_amount), 0) AS receivedPayments,
          COALESCE(SUM(o.pending_amount), 0) AS pendingPayments
        FROM orders o
        ${where}
        GROUP BY DATE(o.booking_date)
        ORDER BY date ASC
        `,
        params
      );

      const series = (rows || []).map((r) => {
        const orders = Number(r.orders || 0);
        const totalSales = Number(r.totalSales || 0);
        return {
          date: r.date ? String(r.date).slice(0, 10) : "",
          orders,
          totalSales,
          receivedPayments: Number(r.receivedPayments || 0),
          pendingPayments: Number(r.pendingPayments || 0),
          totalQuantity: orders,
          avgOrderValue: orders > 0 ? Math.round(totalSales / orders) : 0,
        };
      });

      res.json({ series });
    } catch (e) {
      logError("DASHBOARD", "Sales overview error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

// -----------------------
// GET: /api/dashboard/area-wise?year=...
// Bar chart: order count per area, with day and SLOT 1/2/3 breakdown.
// Types: Hissa → Standard+Premium+Exclusive only; Goat → Super Goat + Premium Goat only; both → combined. Waqf excluded from area-wise hissa slice.
// -----------------------
app.get("/api/dashboard/area-wise", verifyToken, async (req, res) => {
  try {
    const { year = "all", orderType } = req.query;

    const params = [];
    const conditions = buildYearWhere(year, params);
    applyAreaOrderTypeFilter(orderType, conditions);
    conditions.push("(o.area IS NOT NULL AND TRIM(o.area) != '')");

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await db.execute(
      `
      SELECT
        TRIM(o.area) AS area,
        COUNT(*) AS total,
        SUM(CASE WHEN ${DAY_KEY_SQL} = 'day1' THEN 1 ELSE 0 END) AS day1,
        SUM(CASE WHEN ${DAY_KEY_SQL} = 'day2' THEN 1 ELSE 0 END) AS day2,
        SUM(CASE WHEN ${DAY_KEY_SQL} = 'day3' THEN 1 ELSE 0 END) AS day3,
        SUM(CASE WHEN ${SLOT_KEY_SQL} = 'slot1' THEN 1 ELSE 0 END) AS slot1,
        SUM(CASE WHEN ${SLOT_KEY_SQL} = 'slot2' THEN 1 ELSE 0 END) AS slot2,
        SUM(CASE WHEN ${SLOT_KEY_SQL} = 'slot3' THEN 1 ELSE 0 END) AS slot3,
        SUM(CASE WHEN ${DAY_KEY_SQL} = 'day1' AND ${SLOT_KEY_SQL} = 'slot1' THEN 1 ELSE 0 END) AS d1s1,
        SUM(CASE WHEN ${DAY_KEY_SQL} = 'day1' AND ${SLOT_KEY_SQL} = 'slot2' THEN 1 ELSE 0 END) AS d1s2,
        SUM(CASE WHEN ${DAY_KEY_SQL} = 'day1' AND ${SLOT_KEY_SQL} = 'slot3' THEN 1 ELSE 0 END) AS d1s3,
        SUM(CASE WHEN ${DAY_KEY_SQL} = 'day2' AND ${SLOT_KEY_SQL} = 'slot1' THEN 1 ELSE 0 END) AS d2s1,
        SUM(CASE WHEN ${DAY_KEY_SQL} = 'day2' AND ${SLOT_KEY_SQL} = 'slot2' THEN 1 ELSE 0 END) AS d2s2,
        SUM(CASE WHEN ${DAY_KEY_SQL} = 'day2' AND ${SLOT_KEY_SQL} = 'slot3' THEN 1 ELSE 0 END) AS d2s3,
        SUM(CASE WHEN ${DAY_KEY_SQL} = 'day3' AND ${SLOT_KEY_SQL} = 'slot1' THEN 1 ELSE 0 END) AS d3s1,
        SUM(CASE WHEN ${DAY_KEY_SQL} = 'day3' AND ${SLOT_KEY_SQL} = 'slot2' THEN 1 ELSE 0 END) AS d3s2,
        SUM(CASE WHEN ${DAY_KEY_SQL} = 'day3' AND ${SLOT_KEY_SQL} = 'slot3' THEN 1 ELSE 0 END) AS d3s3,
        SUM(CASE WHEN ${TYPE_KEY_SQL} = 'standard' THEN 1 ELSE 0 END) AS sum_std,
        SUM(CASE WHEN ${TYPE_KEY_SQL} = 'premium' THEN 1 ELSE 0 END) AS sum_prm,
        SUM(CASE WHEN ${TYPE_KEY_SQL} = 'exclusive' THEN 1 ELSE 0 END) AS sum_exc,
        SUM(CASE WHEN ${TYPE_KEY_SQL} = 'super_goat' THEN 1 ELSE 0 END) AS sum_sg,
        SUM(CASE WHEN ${TYPE_KEY_SQL} = 'premium_goat' THEN 1 ELSE 0 END) AS sum_pg,
        ${AREA_TYPE_GRID_META.sqlFragment}
      FROM orders o
      ${where}
      GROUP BY TRIM(o.area)
      ORDER BY total DESC
      `,
      params
    );

    const areas = (rows || []).map((r) => {
      const base = {
        area: r.area || "—",
        total: Number(r.total || 0),
        day1: Number(r.day1 || 0),
        day2: Number(r.day2 || 0),
        day3: Number(r.day3 || 0),
        slot1: Number(r.slot1 || 0),
        slot2: Number(r.slot2 || 0),
        slot3: Number(r.slot3 || 0),
        sum_std: Number(r.sum_std ?? r.SUM_STD ?? 0),
        sum_prm: Number(r.sum_prm ?? r.SUM_PRM ?? 0),
        sum_exc: Number(r.sum_exc ?? r.SUM_EXC ?? 0),
        sum_sg: Number(r.sum_sg ?? r.SUM_SG ?? 0),
        sum_pg: Number(r.sum_pg ?? r.SUM_PG ?? 0),
        slotsByDay: {
          day1: { slot1: Number(r.d1s1 || 0), slot2: Number(r.d1s2 || 0), slot3: Number(r.d1s3 || 0) },
          day2: { slot1: Number(r.d2s1 || 0), slot2: Number(r.d2s2 || 0), slot3: Number(r.d2s3 || 0) },
          day3: { slot1: Number(r.d3s1 || 0), slot2: Number(r.d3s2 || 0), slot3: Number(r.d3s3 || 0) },
        },
      };
      for (const al of AREA_TYPE_GRID_META.aliases) {
        const v = r[al] ?? r[String(al).toLowerCase()];
        base[al] = Number(v || 0);
      }
      return base;
    });

    res.json({ areas });
  } catch (e) {
    logError("DASHBOARD", "Area-wise error", e);
    res.status(500).json({ message: "Server error" });
  }
});


};