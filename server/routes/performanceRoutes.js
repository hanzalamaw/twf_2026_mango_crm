// Performance Management API: performers (performance_targets), daily reports (pms_daily_report), stats.
import { logError } from "../utils/logger.js";
import { buildOrderYearWhere } from "../utils/yearFilter.js";

/** Exactly the 4 booking types requested for performance stats. */
const PERFORMANCE_4_TYPES_SQL = `
  CASE
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissapremium') THEN 'premium'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissastandard') THEN 'standard'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissawaqf') THEN 'waqf'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('goathissa') THEN 'goat'
    ELSE NULL
  END
`;

/** Same year rules as GET /api/booking/orders (Order Management totals). */
function appendBookingOrdersYearFilter(year, params) {
  const conditions = buildOrderYearWhere(year, params, "o");
  return conditions.length ? conditions[0] : "";
}

/** closed_by matches performer display name or linked user (username / full name). */
const ORDER_CLOSER_MATCH_SQL = `(
  LOWER(TRIM(COALESCE(o.closed_by, ''))) = LOWER(TRIM(COALESCE(pt.display_name, '')))
  OR LOWER(TRIM(COALESCE(o.closed_by, ''))) = LOWER(TRIM(COALESCE(u.username, '')))
  OR LOWER(TRIM(COALESCE(o.closed_by, ''))) = LOWER(TRIM(CONCAT_WS(' ', NULLIF(TRIM(COALESCE(u.first_name, '')), ''), NULLIF(TRIM(COALESCE(u.last_name, '')), ''))))
)`;

export const registerPerformanceRoutes = (app, db, verifyToken) => {
  // ---------- Audit log helper (mirrors control.js) ----------
  const logAuditAction = async (userId, action, entityType, entityId, oldValues, newValues, ipAddress, userAgent) => {
    try {
      await db.execute(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          action,
          entityType,
          entityId,
          oldValues ? JSON.stringify(oldValues) : null,
          newValues ? JSON.stringify(newValues) : null,
          ipAddress,
          userAgent,
        ]
      );
    } catch (error) {
      logError("PERFORMANCE", "Audit log insert failed", error);
    }
  };

  // ---------- Performers (performance_targets) ----------
  app.get("/api/performance/performers", verifyToken, async (req, res) => {
    try {
      const [rows] = await db.execute(
        `SELECT pt.performer_id, pt.display_name, pt.user_id, pt.calls_target, pt.leads_target, pt.orders_target,
                u.username, u.first_name, u.last_name
         FROM performance_targets pt
         LEFT JOIN users u ON pt.user_id = u.user_id
         ORDER BY pt.display_name`
      );
      res.json(rows);
    } catch (error) {
      logError("PERFORMANCE", "List performers error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  const validateTargets = (calls, leads, orders) => {
    const c = Number(calls) || 0;
    const l = Number(leads) || 0;
    const o = Number(orders) || 0;
    if (c <= l) return "Calls target must be greater than leads target.";
    if (c <= o) return "Calls target must be greater than orders target.";
    if (l <= o) return "Leads target must be greater than orders target.";
    return null;
  };

  app.post("/api/performance/performers", verifyToken, async (req, res) => {
    try {
      const { display_name, user_id, calls_target = 0, leads_target = 0, orders_target = 0 } = req.body;
      if (!display_name || !user_id) {
        return res.status(400).json({ message: "display_name and user_id are required" });
      }
      const [existing] = await db.execute(
        "SELECT performer_id FROM performance_targets WHERE user_id = ?",
        [user_id]
      );
      if (existing.length > 0) {
        return res.status(400).json({ message: "This user is already linked to another performer." });
      }
      const c = Number(calls_target) || 0, l = Number(leads_target) || 0, o = Number(orders_target) || 0;
      const targetErr = validateTargets(c, l, o);
      if (targetErr) return res.status(400).json({ message: targetErr });
      const [result] = await db.execute(
        `INSERT INTO performance_targets (display_name, user_id, calls_target, leads_target, orders_target)
         VALUES (?, ?, ?, ?, ?)`,
        [display_name.trim(), user_id, c, l, o]
      );
      await logAuditAction(
        req.userId,
        "CREATE_PERFORMER",
        "performance_targets",
        result.insertId.toString(),
        null,
        { display_name, user_id, calls_target: c, leads_target: l, orders_target: o },
        req.ip,
        req.get("user-agent")
      );
      res.status(201).json({ message: "Performer added", performer_id: result.insertId });
    } catch (error) {
      logError("PERFORMANCE", "Create performer error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/performance/performers/:id", verifyToken, async (req, res) => {
    try {
      const id = req.params.id;
      const { display_name, user_id, calls_target, leads_target, orders_target } = req.body;

      // Fetch old record for audit diff
      const [oldRows] = await db.execute(
        "SELECT * FROM performance_targets WHERE performer_id = ?",
        [id]
      );
      if (oldRows.length === 0) return res.status(404).json({ message: "Performer not found" });
      const oldPerformer = oldRows[0];

      const updates = [];
      const values = [];
      if (display_name !== undefined) {
        updates.push("display_name = ?");
        values.push(display_name.trim());
      }
      if (user_id !== undefined) {
        const [existing] = await db.execute(
          "SELECT performer_id FROM performance_targets WHERE user_id = ? AND performer_id <> ?",
          [user_id, id]
        );
        if (existing.length > 0) {
          return res.status(400).json({ message: "This user is already linked to another performer." });
        }
        updates.push("user_id = ?");
        values.push(user_id);
      }
      if (calls_target !== undefined) {
        updates.push("calls_target = ?");
        values.push(Number(calls_target) || 0);
      }
      if (leads_target !== undefined) {
        updates.push("leads_target = ?");
        values.push(Number(leads_target) || 0);
      }
      if (orders_target !== undefined) {
        updates.push("orders_target = ?");
        values.push(Number(orders_target) || 0);
      }
      if (updates.length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      const isUpdatingTargets = [calls_target, leads_target, orders_target].some((v) => v !== undefined);
      if (isUpdatingTargets) {
        const c = calls_target !== undefined ? Number(calls_target) || 0 : Number(oldPerformer.calls_target) || 0;
        const l = leads_target !== undefined ? Number(leads_target) || 0 : Number(oldPerformer.leads_target) || 0;
        const o = orders_target !== undefined ? Number(orders_target) || 0 : Number(oldPerformer.orders_target) || 0;
        const targetErr = validateTargets(c, l, o);
        if (targetErr) return res.status(400).json({ message: targetErr });
      }

      values.push(id);
      await db.execute(
        `UPDATE performance_targets SET ${updates.join(", ")} WHERE performer_id = ?`,
        values
      );

      const [newRows] = await db.execute(
        "SELECT * FROM performance_targets WHERE performer_id = ?",
        [id]
      );
      await logAuditAction(
        req.userId,
        "UPDATE_PERFORMER",
        "performance_targets",
        id,
        oldPerformer,
        newRows[0],
        req.ip,
        req.get("user-agent")
      );
      res.json({ message: "Performer updated" });
    } catch (error) {
      logError("PERFORMANCE", "Update performer error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/performance/performers/:id", verifyToken, async (req, res) => {
    try {
      const id = req.params.id;

      const [oldRows] = await db.execute(
        "SELECT * FROM performance_targets WHERE performer_id = ?",
        [id]
      );
      if (oldRows.length === 0) return res.status(404).json({ message: "Performer not found" });

      await db.execute("DELETE FROM pms_daily_report WHERE performer_id = ?", [id]);
      await db.execute("DELETE FROM performance_targets WHERE performer_id = ?", [id]);

      await logAuditAction(
        req.userId,
        "DELETE_PERFORMER",
        "performance_targets",
        id,
        oldRows[0],
        null,
        req.ip,
        req.get("user-agent")
      );
      res.json({ message: "Performer deleted" });
    } catch (error) {
      logError("PERFORMANCE", "Delete performer error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ---------- Daily reports (pms_daily_report) ----------
  app.get("/api/performance/daily-reports", verifyToken, async (req, res) => {
    try {
      const { performer_id, from_date, to_date } = req.query;
      let sql = `
        SELECT r.report_id, r.performer_id,
               DATE_FORMAT(r.date, '%Y-%m-%d') AS date,
               r.calls_done, r.leads_generated, r.orders_confirmed,
               pt.display_name
        FROM pms_daily_report r
        JOIN performance_targets pt ON r.performer_id = pt.performer_id
        WHERE 1=1`;
      const params = [];
      if (performer_id) {
        sql += " AND r.performer_id = ?";
        params.push(performer_id);
      }
      if (from_date) {
        sql += " AND r.date >= ?";
        params.push(from_date);
      }
      if (to_date) {
        sql += " AND r.date <= ?";
        params.push(to_date);
      }
      sql += " ORDER BY r.date DESC, pt.display_name";
      const [rows] = await db.execute(sql, params);
      res.json(rows);
    } catch (error) {
      logError("PERFORMANCE", "List daily reports error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Prefill daily report from booking orders by performer/date (closed_by + booking_date).
  app.get("/api/performance/daily-reports/prefill", verifyToken, async (req, res) => {
    try {
      const { performer_id, date } = req.query;
      if (!performer_id || !date) {
        return res.status(400).json({ message: "performer_id and date are required" });
      }

      const [perfRows] = await db.execute(
        `SELECT pt.display_name, u.username, u.first_name, u.last_name
         FROM performance_targets pt
         LEFT JOIN users u ON u.user_id = pt.user_id
         WHERE pt.performer_id = ? LIMIT 1`,
        [performer_id]
      );
      if (perfRows.length === 0) {
        return res.status(404).json({ message: "Performer not found" });
      }

      const pr = perfRows[0];
      const nameCandidates = new Set();
      const fn = String(pr.first_name || "").trim();
      const ln = String(pr.last_name || "").trim();
      const full = [fn, ln].filter(Boolean).join(" ").trim();
      for (const v of [pr.display_name, pr.username, full]) {
        const t = String(v || "").trim();
        if (t) nameCandidates.add(t);
      }
      if (nameCandidates.size === 0) {
        return res.json({ leads_generated: 0, orders_confirmed: 0 });
      }

      const lowerList = [...nameCandidates].map((s) => String(s).trim().toLowerCase());
      const inPh = lowerList.map(() => "?").join(", ");
      const [orderRows] = await db.execute(
        `SELECT COUNT(*) AS ordersCount
         FROM orders o
         WHERE DATE(o.booking_date) = ?
           AND (${PERFORMANCE_4_TYPES_SQL}) IS NOT NULL
           AND o.closed_by IS NOT NULL
           AND TRIM(o.closed_by) <> ''
           AND LOWER(TRIM(o.closed_by)) IN (${inPh})`,
        [date, ...lowerList]
      );

      const [leadRows] = await db.execute(
        `SELECT COUNT(*) AS leadsCount
         FROM leads l
         WHERE l.booking_date = ?
           AND l.closed_by IS NOT NULL
           AND TRIM(l.closed_by) <> ''
           AND LOWER(TRIM(l.closed_by)) IN (${inPh})`,
        [date, ...lowerList]
      );

      const ordersCount = Number(orderRows?.[0]?.ordersCount || 0);
      const leadsCount = Number(leadRows?.[0]?.leadsCount || 0);

      res.json({
        leads_generated: leadsCount + ordersCount,
        orders_confirmed: ordersCount,
      });
    } catch (error) {
      logError("PERFORMANCE", "Daily prefill error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/performance/daily-reports", verifyToken, async (req, res) => {
    try {
      const { performer_id, date, calls_done = 0, leads_generated = 0, orders_confirmed = 0 } = req.body;
      if (!performer_id || !date) {
        return res.status(400).json({ message: "performer_id and date are required" });
      }
      const [existing] = await db.execute(
        "SELECT report_id FROM pms_daily_report WHERE performer_id = ? AND date = ?",
        [performer_id, date]
      );
      if (existing.length > 0) {
        return res.status(400).json({ message: "A report for this performer and date already exists. Use edit to update." });
      }
      const c = Number(calls_done) || 0;
      const l = Number(leads_generated) || 0;
      const o = Number(orders_confirmed) || 0;
      const [result] = await db.execute(
        `INSERT INTO pms_daily_report (performer_id, date, calls_done, leads_generated, orders_confirmed)
         VALUES (?, ?, ?, ?, ?)`,
        [performer_id, date, c, l, o]
      );
      await logAuditAction(
        req.userId,
        "CREATE_DAILY_REPORT",
        "pms_daily_report",
        result.insertId.toString(),
        null,
        { report_id: result.insertId, performer_id, date: String(date).slice(0, 10), calls_done: c, leads_generated: l, orders_confirmed: o },
        req.ip,
        req.get("user-agent")
      );
      res.status(201).json({ message: "Daily report added", report_id: result.insertId });
    } catch (error) {
      logError("PERFORMANCE", "Create daily report error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/performance/daily-reports/:id", verifyToken, async (req, res) => {
    try {
      const id = req.params.id;
      const { date, calls_done, leads_generated, orders_confirmed } = req.body;

      // Fetch old record for audit diff — only the 4 relevant fields
      const [oldRows] = await db.execute(
        `SELECT report_id, performer_id, DATE_FORMAT(date, '%Y-%m-%d') AS date, calls_done, leads_generated, orders_confirmed
         FROM pms_daily_report WHERE report_id = ?`,
        [id]
      );
      if (oldRows.length === 0) return res.status(404).json({ message: "Daily report not found" });
      const oldReport = oldRows[0];

      const updates = [];
      const values = [];
      if (date !== undefined) {
        updates.push("date = ?");
        values.push(date);
      }
      if (calls_done !== undefined) {
        updates.push("calls_done = ?");
        values.push(Number(calls_done) || 0);
      }
      if (leads_generated !== undefined) {
        updates.push("leads_generated = ?");
        values.push(Number(leads_generated) || 0);
      }
      if (orders_confirmed !== undefined) {
        updates.push("orders_confirmed = ?");
        values.push(Number(orders_confirmed) || 0);
      }
      if (updates.length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      values.push(id);
      await db.execute(
        `UPDATE pms_daily_report SET ${updates.join(", ")} WHERE report_id = ?`,
        values
      );

      const [newRows] = await db.execute(
        `SELECT report_id, performer_id, DATE_FORMAT(date, '%Y-%m-%d') AS date, calls_done, leads_generated, orders_confirmed
         FROM pms_daily_report WHERE report_id = ?`,
        [id]
      );
      await logAuditAction(
        req.userId,
        "UPDATE_DAILY_REPORT",
        "pms_daily_report",
        id,
        oldReport,
        newRows[0],
        req.ip,
        req.get("user-agent")
      );
      res.json({ message: "Daily report updated" });
    } catch (error) {
      logError("PERFORMANCE", "Update daily report error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/performance/daily-reports/:id", verifyToken, async (req, res) => {
    try {
      const id = req.params.id;

      const [oldRows] = await db.execute(
        `SELECT report_id, performer_id, DATE_FORMAT(date, '%Y-%m-%d') AS date, calls_done, leads_generated, orders_confirmed
         FROM pms_daily_report WHERE report_id = ?`,
        [id]
      );
      if (oldRows.length === 0) return res.status(404).json({ message: "Daily report not found" });

      await db.execute("DELETE FROM pms_daily_report WHERE report_id = ?", [id]);

      await logAuditAction(
        req.userId,
        "DELETE_DAILY_REPORT",
        "pms_daily_report",
        id,
        oldRows[0],
        null,
        req.ip,
        req.get("user-agent")
      );
      res.json({ message: "Daily report deleted" });
    } catch (error) {
      logError("PERFORMANCE", "Delete daily report error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ---------- Stats for dashboard ----------
  app.get("/api/performance/stats", verifyToken, async (req, res) => {
    try {
      const { from_date, to_date, year: yearQuery } = req.query;

      const [[{ min_report: minReport, today: todayStr }]] = await db.execute(
        `SELECT DATE_FORMAT((SELECT MIN(\`date\`) FROM pms_daily_report), '%Y-%m-%d') AS min_report,
                DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today`
      );

      let rangeStart;
      let rangeEnd;
      if (from_date && to_date) {
        rangeStart = String(from_date).slice(0, 10);
        rangeEnd = String(to_date).slice(0, 10);
      } else if (from_date) {
        rangeStart = String(from_date).slice(0, 10);
        rangeEnd = to_date ? String(to_date).slice(0, 10) : todayStr;
      } else if (to_date) {
        rangeEnd = String(to_date).slice(0, 10);
        rangeStart = minReport || rangeEnd;
      } else {
        rangeStart = minReport;
        rangeEnd = todayStr;
      }

      let periodDays = 0;
      const effStart = rangeStart || rangeEnd;
      const effEnd = rangeEnd || rangeStart;
      if (effStart && effEnd) {
        if (effEnd < effStart) periodDays = 0;
        else {
          const [[row]] = await db.execute(`SELECT DATEDIFF(?, ?) + 1 AS d`, [effEnd, effStart]);
          periodDays = Math.max(0, Number(row?.d) || 0);
        }
      }

      let reportDateSql = "";
      const reportParams = [];
      if (rangeStart && rangeEnd) {
        if (rangeEnd < rangeStart) {
          reportDateSql = " AND 1=0";
        } else {
          reportDateSql = " AND r.date >= ? AND r.date <= ?";
          reportParams.push(rangeStart, rangeEnd);
        }
      } else if (rangeStart) {
        reportDateSql = " AND r.date >= ?";
        reportParams.push(rangeStart);
      } else if (rangeEnd) {
        reportDateSql = " AND r.date <= ?";
        reportParams.push(rangeEnd);
      }

      let orderDateSql = "";
      const orderJoinParams = [];
      const useDateRangeForOrders = Boolean(from_date || to_date);
      if (useDateRangeForOrders) {
        if (rangeStart && rangeEnd) {
          if (rangeEnd < rangeStart) {
            orderDateSql = " AND 1=0";
          } else {
            orderDateSql = " AND DATE(o.booking_date) >= ? AND DATE(o.booking_date) <= ?";
            orderJoinParams.push(rangeStart, rangeEnd);
          }
        } else if (rangeStart) {
          orderDateSql = " AND DATE(o.booking_date) >= ?";
          orderJoinParams.push(rangeStart);
        } else if (rangeEnd) {
          orderDateSql = " AND DATE(o.booking_date) <= ?";
          orderJoinParams.push(rangeEnd);
        }
      } else {
        const y = String(yearQuery || "2026");
        const yPart = appendBookingOrdersYearFilter(y, orderJoinParams);
        if (yPart) orderDateSql = ` AND ${yPart}`;
      }

      const [performerStatsFiltered] = await db.execute(
        `SELECT pt.performer_id, pt.display_name,
                pt.calls_target, pt.leads_target, pt.orders_target,
                COALESCE(SUM(r.calls_done), 0) AS calls_done,
                COALESCE(SUM(r.leads_generated), 0) AS leads_generated,
                COUNT(r.report_id) AS report_days
         FROM performance_targets pt
         LEFT JOIN pms_daily_report r ON pt.performer_id = r.performer_id${reportDateSql}
         GROUP BY pt.performer_id, pt.display_name, pt.calls_target, pt.leads_target, pt.orders_target
         ORDER BY pt.display_name`,
        reportParams
      );

      const [orderCountRows] = await db.execute(
        `SELECT pt.performer_id,
                COUNT(o.order_id) AS orders_confirmed
         FROM performance_targets pt
         LEFT JOIN users u ON u.user_id = pt.user_id
         LEFT JOIN orders o
           ON (${PERFORMANCE_4_TYPES_SQL}) IS NOT NULL
          AND TRIM(COALESCE(o.closed_by, '')) <> ''
          AND ${ORDER_CLOSER_MATCH_SQL}
          ${orderDateSql}
         GROUP BY pt.performer_id`,
        orderJoinParams
      );

      const orderTotalParams = [];
      let orderTotalWhere = "1=1";
      if (useDateRangeForOrders) {
        if (rangeStart && rangeEnd) {
          if (rangeEnd < rangeStart) orderTotalWhere += " AND 1=0";
          else {
            orderTotalWhere += " AND DATE(o.booking_date) >= ? AND DATE(o.booking_date) <= ?";
            orderTotalParams.push(rangeStart, rangeEnd);
          }
        } else if (rangeStart) {
          orderTotalWhere += " AND DATE(o.booking_date) >= ?";
          orderTotalParams.push(rangeStart);
        } else if (rangeEnd) {
          orderTotalWhere += " AND DATE(o.booking_date) <= ?";
          orderTotalParams.push(rangeEnd);
        }
      } else {
        const y = String(yearQuery || "2026");
        const yPart = appendBookingOrdersYearFilter(y, orderTotalParams);
        if (yPart) orderTotalWhere += ` AND ${yPart}`;
      }

      const orderTotalWhereFull = `${orderTotalWhere} AND (${PERFORMANCE_4_TYPES_SQL}) IS NOT NULL`;
      const [[bookingStyleTotalRow]] = await db.execute(
        `SELECT COUNT(*) AS c FROM orders o WHERE ${orderTotalWhereFull}`,
        orderTotalParams
      );
      const bookingStyleOrderTotal = Number(bookingStyleTotalRow?.c || 0);

      const ordersByPerformer = new Map(
        orderCountRows.map((row) => [String(row.performer_id), Number(row.orders_confirmed || 0)])
      );

      const performers = performerStatsFiltered.map((p) => {
        const reportDays = Math.max(0, Number(p.report_days || 0));
        const baseCalls = Number(p.calls_target || 0);
        const baseLeads = Number(p.leads_target || 0);
        const baseOrders = Number(p.orders_target || 0);
        const ordersConfirmed = ordersByPerformer.get(String(p.performer_id)) ?? 0;
        return {
          performer_id: p.performer_id,
          display_name: p.display_name,
          calls_target: baseCalls * reportDays,
          leads_target: baseLeads * reportDays,
          orders_target: baseOrders * reportDays,
          calls_done: Number(p.calls_done || 0),
          leads_generated: Number(p.leads_generated || 0),
          orders_confirmed: ordersConfirmed,
          report_days: reportDays,
        };
      });

      const totals = performers.reduce(
        (acc, p) => ({
          calls_done: acc.calls_done + Number(p.calls_done || 0),
          leads_generated: acc.leads_generated + Number(p.leads_generated || 0),
          calls_target: acc.calls_target + Number(p.calls_target || 0),
          leads_target: acc.leads_target + Number(p.leads_target || 0),
          orders_target: acc.orders_target + Number(p.orders_target || 0),
        }),
        { calls_done: 0, leads_generated: 0, calls_target: 0, leads_target: 0, orders_target: 0 }
      );
      totals.orders_confirmed = bookingStyleOrderTotal;

      res.json({
        performers,
        totals,
        period: {
          from: rangeStart,
          to: rangeEnd,
          calendar_days: periodDays,
          orders_year: useDateRangeForOrders ? null : String(yearQuery || "2026"),
        },
      });
    } catch (error) {
      logError("PERFORMANCE", "Stats error", error);
      res.status(500).json({ message: "Server error" });
    }
  });
};