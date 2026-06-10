import PDFDocument from "pdfkit";
import { log, logError } from "../utils/logger.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { limitOffsetClause } from "../utils/sqlPagination.js";
import { buildBatchReceivedYearWhere, buildOrderBatchFilter, buildOrderYearWhere } from "../utils/yearFilter.js";
import {
  assignOrderToChallan,
  normalizeAddress,
  relinkOrderToChallan,
  refreshLinkedChallanForOrder,
  removeOrderFromChallan,
} from "../utils/challanAssign.js";
import { qualifiesForOperations } from "../utils/operationsYear.js";

/** Normalize to date-only YYYY-MM-DD for consistent display and audit (avoids timezone shift). */
function toDateOnly(v) {
  if (v == null || v === "") return v;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v);
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : s;
}

/** Invoice PDF page 2 — T&Cs text from TWF Terms & Conditions (for invoice). */
const INVOICE_TERMS_SECTIONS = [
  {
    heading: "1. General",
    paragraphs: [
      'By placing an order with The Warsi Farm, the customer ("you") agrees to be fully bound by these Terms & Conditions. The Warsi Farm ("we," "us," "TWF") reserves the right to update these terms at any time without prior notice. Continued engagement after any update constitutes acceptance.',
    ],
  },
  {
    heading: "2. Payment Terms & Due Dates",
    paragraphs: [
      "A partial payment (advance/booking amount) is required at the time of booking to confirm your order.",
      "The remaining balance must be cleared before delivery as communicated at the time of booking.",
      "Accepted payment methods: Bank Transfer, EasyPaisa, JazzCash, and Cash (in-person only, subject to availability).",
      "In case of bank transfer, the customer must share valid payment proof (screenshot/receipt) via WhatsApp within 24 hours of transfer.",
      "All prices are quoted in Pakistani Rupees (PKR).",
      "Prices are locked at the time of booking and will not change due to market fluctuation after confirmation.",
    ],
  },
  {
    heading: "3. Product & Delivery",
    paragraphs: [
      "Mango orders are fulfilled according to the variety, weight, and quantity specified at booking.",
      "Delivery will be made on the scheduled date or as communicated at the time of booking.",
      "Free delivery within Karachi, except Bahria Town Karachi.",
      "The Warsi Farm is not responsible for delays caused by traffic, weather, or other external factors beyond our control. We will communicate proactively in case of any delay.",
    ],
  },
  {
    heading: "4. Liability",
    paragraphs: [
      "The Warsi Farm's total liability under any circumstance shall not exceed the amount paid by the customer for their order. We are not liable for any indirect, consequential, or incidental losses.",
    ],
  },
  {
    heading: "5. Governing Jurisdiction",
    paragraphs: [
      "These Terms & Conditions are governed by the laws of Pakistan. Any dispute arising shall be resolved amicably, failing which it shall be subject to the jurisdiction of the courts of Karachi, Sindh.",
    ],
  },
];

/**
 * Appends T&C pages — minimal gray header (reference: centered title + light rule + #333 body).
 * @param {import("pdfkit").PDFDocument} doc
 * @param {object} ctx
 */
function drawInvoiceTermsPage(doc, ctx) {
  const { ML, RIGHT, CW, PH } = ctx;
  const TNC_HEAD = "#707070";
  const TNC_LINE = "#E0E0E0";
  const TNC_TEXT = "#333333";
  const bottomMargin = 42;
  const lineGap = 2.5;
  const HEADING_BOTTOM_PAD = 7;

  doc.addPage({ margin: 0, size: "A4" });

  let y = 45;
  doc.font("Helvetica-Bold").fontSize(11).fillColor(TNC_HEAD)
    .text("Terms & Conditions", ML, y, { width: CW, align: "center" });
  y += 18;
  doc.moveTo(ML, y).lineTo(RIGHT, y).lineWidth(0.5).strokeColor(TNC_LINE).stroke();
  y += 20;

  const drawContinuedHeader = () => {
    doc.font("Helvetica-Bold").fontSize(11).fillColor(TNC_HEAD)
      .text("Terms & Conditions (continued)", ML, y, { width: CW, align: "center" });
    y += 18;
    doc.moveTo(ML, y).lineTo(RIGHT, y).lineWidth(0.5).strokeColor(TNC_LINE).stroke();
    y += 20;
  };

  const ensureSpace = (needed) => {
    if (y + needed <= PH - bottomMargin) return;
    doc.addPage({ margin: 0, size: "A4" });
    y = 45;
    drawContinuedHeader();
  };

  for (const sec of INVOICE_TERMS_SECTIONS) {
    const headingH = 13;
    ensureSpace(headingH + HEADING_BOTTOM_PAD + 20);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(TNC_HEAD)
      .text(sec.heading, ML, y, { width: CW, align: "left" });
    y += headingH + HEADING_BOTTOM_PAD;

    for (const para of sec.paragraphs) {
      doc.font("Helvetica").fontSize(9.5);
      const h = doc.heightOfString(para, { width: CW, lineGap, align: "left" });
      ensureSpace(h + 8);
      doc.font("Helvetica").fontSize(9.5).fillColor(TNC_TEXT)
        .text(para, ML, y, { width: CW, lineGap, align: "left" });
      y += h + 8;
    }
    y += 4;
  }
}

/**
 * Booking management API: orders list with search and filters.
 * @param {object} app - Express app
 * @param {object} db - MySQL connection
 * @param {Function} verifyToken - auth middleware
 */
export function registerBookingRoutes(app, db, verifyToken) {
  // Generate customer ID based on contact lookup
  app.post("/api/booking/generate-customer-id", verifyToken, async (req, res) => {
    try {
      const { contact } = req.body || {};
      if (!contact || String(contact).trim().length < 3) {
        return res.status(400).json({ message: "Contact number is required (minimum 3 characters)" });
      }
      const contactStr = String(contact).trim();

      const [orderRows] = await db.execute(
        "SELECT customer_id FROM orders WHERE contact = ? LIMIT 1",
        [contactStr]
      );
      if (orderRows.length > 0 && orderRows[0].customer_id) {
        log("BOOKING", "Customer ID found in orders", { user_id: req.userId, contact: contactStr, customer_id: orderRows[0].customer_id });
        return res.json({ customer_id: orderRows[0].customer_id });
      }

      const [cancelledRows] = await db.execute(
        "SELECT customer_id FROM cancelled_orders WHERE contact = ? LIMIT 1",
        [contactStr]
      );
      if (cancelledRows.length > 0 && cancelledRows[0].customer_id) {
        log("BOOKING", "Customer ID found in cancelled orders", { user_id: req.userId, contact: contactStr, customer_id: cancelledRows[0].customer_id });
        return res.json({ customer_id: cancelledRows[0].customer_id });
      }

      const [maxOrderRows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(customer_id, '-', 2), '-', -1) AS UNSIGNED)), 0) AS maxNum FROM orders WHERE customer_id LIKE 'TWF-%'"
      );
      const [maxCancelledRows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(customer_id, '-', 2), '-', -1) AS UNSIGNED)), 0) AS maxNum FROM cancelled_orders WHERE customer_id LIKE 'TWF-%'"
      );

      const nextNum = Math.max(Number(maxOrderRows[0]?.maxNum || 0), Number(maxCancelledRows[0]?.maxNum || 0)) + 1;
      const customerId = `TWF-${String(nextNum).padStart(4, "0")}-Q`;

      log("BOOKING", "Customer ID generated", { user_id: req.userId, contact: contactStr, customer_id: customerId });
      res.json({ customer_id: customerId });
    } catch (error) {
      logError("BOOKING", "Generate customer ID error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Generate order ID — mango orders use M-0001-2026 format
  app.post("/api/booking/generate-order-id", verifyToken, async (req, res) => {
    try {
      const { order_type } = req.body || {};
      if (!order_type || !String(order_type).trim()) {
        return res.status(400).json({ message: "Order type is required" });
      }

      const year = 2026;
      const prefix = "M";
      const idParams = [`${prefix}-%`];
      const yearConds = buildOrderYearWhere(String(year), idParams, null);
      const yearSql = yearConds.length ? ` AND ${yearConds[0]}` : "";
      const [idRows] = await db.execute(
        `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(order_id, '-', 2), '-', -1) AS UNSIGNED)), 0) AS nextId FROM orders WHERE order_id LIKE ?${yearSql}`,
        idParams
      );

      const nextNum = Number(idRows[0]?.nextId || 0) + 1;
      const orderId = `${prefix}-${String(nextNum).padStart(4, "0")}-${year}`;

      log("BOOKING", "Order ID generated", { user_id: req.userId, order_type: String(order_type).trim(), order_id: orderId });
      res.json({ order_id: orderId });
    } catch (error) {
      logError("BOOKING", "Generate order ID error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Create new order
  app.post("/api/booking/orders", verifyToken, async (req, res) => {
    try {
      const body = req.body || {};
      const {
        order_id,
        customer_id,
        contact,
        alt_contact,
        order_type,
        name,
        address,
        area,
        weight,
        quantity,
        booking_date,
        total_amount,
        source,
        description,
        batch,
      } = body;

      if (!order_id || !String(order_id).trim()) {
        return res.status(400).json({ message: "Order ID is required" });
      }
      if (!customer_id || !String(customer_id).trim()) {
        return res.status(400).json({ message: "Customer ID is required" });
      }
      if (!contact || !String(contact).trim()) {
        return res.status(400).json({ message: "Contact is required" });
      }
      if (!order_type || !String(order_type).trim()) {
        return res.status(400).json({ message: "Order type is required" });
      }

      const [existing] = await db.execute("SELECT order_id FROM orders WHERE order_id = ?", [order_id]);
      if (existing.length > 0) {
        return res.status(400).json({ message: "Order ID already exists" });
      }

      const totalAmount = Math.max(0, Number(total_amount) || 0);
      const receivedAmount = 0;
      const pendingAmount = totalAmount;
      const weightVal = weight != null && weight !== "" ? Number(weight) : null;
      const quantityVal = quantity != null && quantity !== "" ? parseInt(quantity, 10) : null;

      await db.execute(
        `INSERT INTO orders (
          order_id, customer_id, contact, alt_contact, order_type, name, address, area,
          weight, quantity, booking_date, total_amount, received_amount, pending_amount,
          source, description, batch
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          order_id,
          customer_id,
          contact,
          alt_contact || null,
          String(order_type).trim(),
          name || null,
          address || null,
          area || null,
          weightVal,
          quantityVal,
          booking_date ? toDateOnly(booking_date) : null,
          totalAmount,
          receivedAmount,
          pendingAmount,
          source || null,
          description || null,
          batch || null,
        ]
      );

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "CREATE_ORDER",
        entity_type: "orders",
        entity_id: order_id,
        new_values: {
          order_id,
          customer_id,
          contact,
          alt_contact: alt_contact || null,
          order_type: String(order_type).trim(),
          name: name || null,
          address: address || null,
          area: area || null,
          weight: weightVal,
          quantity: quantityVal,
          batch: batch || null,
          booking_date: booking_date ? toDateOnly(booking_date) : null,
          total_amount: totalAmount,
          source: source || null,
          description: description || null,
        },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      try {
        await assignOrderToChallan(db, {
          order_id,
          booking_date: booking_date ? toDateOnly(booking_date) : null,
          batch: batch || null,
          address: address || null,
          area: area || null,
          name: name || null,
        });
      } catch (challanErr) {
        logError("BOOKING", "Challan auto-assign on create", challanErr);
      }

      log("BOOKING", "Order created", { user_id: req.userId, order_id });
      res.json({ message: "Order created successfully", order_id });
    } catch (error) {
      logError("BOOKING", "Create order error", error);
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "CREATE_ORDER_ERROR",
        entity_type: "orders",
        new_values: { reason: "server_error" },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/booking/orders", verifyToken, async (req, res) => {
    try {
      const {
        search,
        order_type,
        batch,
        year,
        page,
        limit,
        payment_status,
        source,
        delivery_status,
      } = req.query;
      const conditions = [];
      const params = [];

      conditions.push(...buildOrderYearWhere(year, params, "o"));

      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conditions.push(`(
          o.order_id LIKE ? OR o.customer_id LIKE ? OR
          o.name LIKE ? OR o.contact LIKE ? OR o.alt_contact LIKE ? OR
          o.area LIKE ? OR o.address LIKE ? OR o.batch LIKE ?
        )`);
        params.push(term, term, term, term, term, term, term, term);
      }

      const orderTypesRaw = Array.isArray(order_type) ? order_type : order_type ? [order_type] : [];
      if (orderTypesRaw.length > 0) {
        conditions.push(`o.order_type IN (${orderTypesRaw.map(() => "?").join(",")})`);
        params.push(...orderTypesRaw.map((t) => String(t).trim()));
      }

      if (batch) {
        const batchCond = buildOrderBatchFilter(batch, params, "o");
        if (batchCond) conditions.push(batchCond);
      }

      if (payment_status === "pending") {
        conditions.push("COALESCE(o.pending_amount, 0) > 0");
      } else if (payment_status === "received") {
        conditions.push("COALESCE(o.pending_amount, 0) <= 0");
      }

      if (source) {
        conditions.push("TRIM(COALESCE(o.source, '')) = ?");
        params.push(String(source).trim());
      }

      if (delivery_status) {
        conditions.push("o.delivery_status = ?");
        params.push(String(delivery_status).trim());
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const fromClause = `
        FROM orders o
        LEFT JOIN (
          SELECT order_id, SUM(bank) AS bank, SUM(bank_tw_traders) AS bank_tw_traders, SUM(cash) AS cash
          FROM payments
          GROUP BY order_id
        ) p ON o.order_id = p.order_id
        ${whereClause}
      `;

      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const offset = (pageNum - 1) * limitNum;

      const [countRows] = await db.execute(
        `SELECT COUNT(*) AS total FROM orders o ${whereClause}`,
        params
      );
      const total = countRows[0]?.total ?? 0;

      const query = `
        SELECT
          o.customer_id AS customer_id,
          o.order_id AS order_id,
          o.name AS name,
          o.contact AS phone_number,
          o.alt_contact AS alt_contact,
          o.address AS address,
          o.area AS area,
          o.order_type AS type,
          o.weight AS weight,
          o.quantity AS quantity,
          o.batch AS batch,
          o.booking_date AS booking_date,
          o.total_amount AS total_amount,
          COALESCE(p.bank, 0) AS bank,
          COALESCE(p.bank_tw_traders, 0) AS bank_tw_traders,
          COALESCE(p.cash, 0) AS cash,
          o.received_amount AS received,
          o.pending_amount AS pending,
          o.source AS source,
          o.delivery_status AS delivery_status,
          o.description AS description,
          CASE WHEN COALESCE(o.pending_amount, 0) > 0 THEN 'Pending' ELSE 'Paid' END AS payment_status
        ${fromClause}
        ORDER BY o.created_at DESC
        ${limitOffsetClause(limitNum, offset, { maxLimit: 100, defaultLimit: 50 })}
      `;

      const [rows] = await db.execute(query, params);
      const normalized = rows.map((r) => ({ ...r, booking_date: toDateOnly(r.booking_date) ?? r.booking_date }));
      log("BOOKING", "Orders list fetched", { user_id: req.userId, count: rows.length, total, page: pageNum });
      res.json({ data: normalized, total });
    } catch (error) {
      logError("BOOKING", "Orders list error", error);
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "ORDER_LIST_ERROR",
        entity_type: "orders",
        new_values: { reason: "server_error" },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/booking/orders/summary", verifyToken, async (req, res) => {
    try {
      const { year, order_type } = req.query;
      const conditions = [];
      const params = [];

      conditions.push(...buildOrderYearWhere(year, params, "o"));

      const typesRaw = Array.isArray(order_type) ? order_type : order_type ? [order_type] : [];
      if (typesRaw.length > 0) {
        conditions.push(`o.order_type IN (${typesRaw.map(() => "?").join(",")})`);
        params.push(...typesRaw.map((t) => String(t).trim()));
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const [rows] = await db.execute(
        `SELECT COALESCE(SUM(p.bank), 0) AS total_bank_twf,
                COALESCE(SUM(p.bank_tw_traders), 0) AS total_bank_tw_traders,
                COALESCE(SUM(p.cash), 0) AS total_cash
         FROM orders o
         LEFT JOIN (
           SELECT order_id, SUM(bank) AS bank, SUM(bank_tw_traders) AS bank_tw_traders, SUM(cash) AS cash
           FROM payments GROUP BY order_id
         ) p ON o.order_id = p.order_id
         ${whereClause}`,
        params
      );
      const totalBankTwf = Number(rows[0]?.total_bank_twf ?? 0);
      const totalBankTwTraders = Number(rows[0]?.total_bank_tw_traders ?? 0);
      res.json({
        totalBankTwf,
        totalBankTwTraders,
        totalBank: totalBankTwf + totalBankTwTraders,
        totalCash: Number(rows[0]?.total_cash ?? 0),
      });
    } catch (error) {
      logError("BOOKING", "Orders summary error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/booking/orders/filters", verifyToken, async (req, res) => {
    try {
      const { year } = req.query;
      const conditions = [];
      const params = [];

      conditions.push(...buildOrderYearWhere(year, params, "o"));

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const andOrWhere = whereClause ? " AND " : " WHERE ";

      const batchParams = [];
      const batchYearConditions = buildBatchReceivedYearWhere(year, batchParams, "b");
      const batchTableWhere = batchYearConditions.length ? `WHERE ${batchYearConditions.join(" AND ")}` : "";

      const [batchesFromTable] = await db.execute(
        `SELECT batch_number AS value FROM batches b ${batchTableWhere}
         ORDER BY CAST(batch_number AS UNSIGNED) ASC, batch_number ASC`,
        batchParams
      );

      const orderBatchParams = [];
      const orderYearConditions = buildOrderYearWhere(year, orderBatchParams, "o");
      const orderBatchWhere = orderYearConditions.length
        ? `WHERE ${orderYearConditions.join(" AND ")} AND o.batch IS NOT NULL AND TRIM(o.batch) != ''`
        : "WHERE o.batch IS NOT NULL AND TRIM(o.batch) != ''";

      const [batchesFromOrders] = await db.execute(
        `SELECT DISTINCT TRIM(o.batch) AS value FROM orders o ${orderBatchWhere} ORDER BY value`,
        orderBatchParams
      );

      const batchSet = new Set([
        ...batchesFromTable.map((r) => String(r.value ?? "").trim()),
        ...batchesFromOrders.map((r) => String(r.value ?? "").trim()),
      ].filter(Boolean));

      const batches = [...batchSet].sort((a, b) => {
        const na = parseInt(a, 10);
        const nb = parseInt(b, 10);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      });
      const [types] = await db.execute(
        `SELECT DISTINCT o.order_type AS value FROM orders o ${whereClause}${andOrWhere}o.order_type IS NOT NULL ORDER BY value`,
        params
      );

      res.json({
        batches,
        order_types: types.map((r) => r.value),
      });
    } catch (error) {
      logError("BOOKING", "Orders filters error", error);
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "ORDER_FILTERS_ERROR",
        entity_type: "orders",
        new_values: { reason: "server_error" },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/booking/transactions", verifyToken, async (req, res) => {
    try {
      const [paySum] = await db.execute(
        `SELECT COALESCE(SUM(bank), 0) AS total_bank_twf,
                COALESCE(SUM(bank_tw_traders), 0) AS total_bank_tw_traders,
                COALESCE(SUM(cash), 0) AS total_cash,
                COALESCE(SUM(total_received), 0) AS total_received
         FROM payments`
      );
      const [expSum] = await db.execute(
        "SELECT COALESCE(SUM(bank), 0) AS expenses_bank, COALESCE(SUM(cash), 0) AS expenses_cash FROM booking_expenses"
      );
      const totalBankTwf = Number(paySum[0]?.total_bank_twf ?? 0);
      const totalBankTwTraders = Number(paySum[0]?.total_bank_tw_traders ?? 0);
      const totalBank = totalBankTwf + totalBankTwTraders;
      const totalCash = Number(paySum[0]?.total_cash ?? 0);
      const totalExpensesBank = Number(expSum[0]?.expenses_bank ?? 0);
      const totalExpensesCash = Number(expSum[0]?.expenses_cash ?? 0);

      const [payments] = await db.execute(
        "SELECT p.payment_id, p.bank, p.bank_tw_traders, p.cash, p.total_received, p.date, p.order_id FROM payments p ORDER BY p.date DESC, p.payment_id DESC"
      );
      const [expenses] = await db.execute(
        "SELECT expense_id, bank, cash, total, done_at, description FROM booking_expenses ORDER BY done_at DESC"
      );

      res.json({
        summary: {
          totalBankTwf,
          totalBankTwTraders,
          totalBank,
          totalCash,
          totalExpensesBank,
          totalExpensesCash,
          onHand: totalBank - totalExpensesBank,
          actual: totalCash - totalExpensesCash,
          totalAmount: totalBank + totalCash,
        },
        payments: payments.map((r) => ({ ...r, date: toDateOnly(r.date) ?? r.date })),
        expenses,
      });
    } catch (error) {
      logError("BOOKING", "Transactions error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/booking/expenses/summary", verifyToken, async (req, res) => {
    try {
      const [rows] = await db.execute(
        "SELECT COALESCE(SUM(bank), 0) AS total_bank, COALESCE(SUM(cash), 0) AS total_cash FROM booking_expenses"
      );
      res.json({
        totalBank: Number(rows[0]?.total_bank ?? 0),
        totalCash: Number(rows[0]?.total_cash ?? 0),
      });
    } catch (error) {
      logError("BOOKING", "Expenses summary error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/booking/expenses", verifyToken, async (req, res) => {
    try {
      const { page = 1, limit = 50 } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const offset = (pageNum - 1) * limitNum;

      const [countRows] = await db.execute("SELECT COUNT(*) AS total FROM booking_expenses");
      const total = Number(countRows[0]?.total ?? 0);

      const [rows] = await db.execute(
        `
        SELECT
          e.expense_id,
          e.bank,
          e.cash,
          e.total,
          e.done_at,
          e.description,
          e.done_by,
          e.created_by AS created_by_id,
          COALESCE(u.username, e.created_by) AS created_by,
          COALESCE(u.username, e.created_by) AS created_by_name
        FROM booking_expenses e
        LEFT JOIN users u ON u.user_id = e.created_by
        ORDER BY e.done_at DESC
        ${limitOffsetClause(limitNum, offset, { maxLimit: 100, defaultLimit: 50 })}
        `
      );

      res.json({
        data: rows.map((r) => ({ ...r, done_at: toDateOnly(r.done_at) ?? r.done_at })),
        total,
      });
    } catch (error) {
      logError("BOOKING", "Expenses list error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/booking/expenses", verifyToken, async (req, res) => {
    try {
      let { bank = 0, cash = 0, description = "", done_by = null, done_at = null } = req.body || {};

      const addBank = Math.max(0, Number(bank) || 0);
      const addCash = Math.max(0, Number(cash) || 0);
      if (addBank === 0 && addCash === 0) {
        return res.status(400).json({ message: "Add at least one of bank or cash amount" });
      }

      const total = addBank + addCash;
      description = String(description || "").trim() || null;
      done_by = done_by ? String(done_by).trim() : null;

      if (done_at) {
        const d = new Date(done_at);
        done_at = isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
      } else {
        done_at = null;
      }

      const year = new Date().getFullYear();
      const [userRows] = await db.execute("SELECT username FROM users WHERE user_id = ?", [req.userId]);
      const username = userRows[0]?.username ?? String(req.userId);

      const [idRows] = await db.execute(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(expense_id, 3, 4) AS UNSIGNED)), 0) + 1 AS nextId
         FROM booking_expenses WHERE expense_id LIKE 'E-%'`
      );
      const expenseId = `E-${String(idRows[0]?.nextId ?? 1).padStart(4, "0")}-${year}`;

      await db.execute(
        `INSERT INTO booking_expenses (expense_id, bank, cash, total, description, done_by, done_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [expenseId, addBank, addCash, total, description, done_by || username, done_at, req.userId]
      );

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "ADD_EXPENSE",
        entity_type: "booking_expenses",
        entity_id: expenseId,
        new_values: { bank: addBank, cash: addCash, total, description, done_by: done_by || username, done_at },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      log("BOOKING", "Expense added", { user_id: req.userId, expenseId });
      res.json({ message: "Expense added", expense_id: expenseId });
    } catch (error) {
      logError("BOOKING", "Add expense error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/booking/expenses/:expenseId", verifyToken, async (req, res) => {
    try {
      const { expenseId } = req.params;
      let { bank, cash, description, done_by = null, done_at = null } = req.body || {};

      const newBank = Math.max(0, Number(bank) || 0);
      const newCash = Math.max(0, Number(cash) || 0);
      if (newBank === 0 && newCash === 0) {
        return res.status(400).json({ message: "At least one of bank or cash must be greater than 0" });
      }

      const total = newBank + newCash;
      description = String(description ?? "").trim() || null;
      done_by = done_by ? String(done_by).trim() || null : null;

      if (done_at) {
        const d = new Date(done_at);
        done_at = isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
      } else {
        done_at = null;
      }

      const [existing] = await db.execute(
        "SELECT expense_id, bank, cash, total, description, done_by, done_at FROM booking_expenses WHERE expense_id = ?",
        [expenseId]
      );
      if (!existing.length) {
        return res.status(404).json({ message: "Expense not found" });
      }

      const oldRow = existing[0];
      await db.execute(
        `UPDATE booking_expenses SET bank = ?, cash = ?, total = ?, description = ?, done_by = ?, done_at = ?
         WHERE expense_id = ?`,
        [newBank, newCash, total, description, done_by, done_at, expenseId]
      );

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "UPDATE_EXPENSE",
        entity_type: "booking_expenses",
        entity_id: expenseId,
        old_values: { ...oldRow },
        new_values: { expense_id: expenseId, bank: newBank, cash: newCash, total, description, done_by, done_at },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      log("BOOKING", "Expense updated", { user_id: req.userId, expenseId });
      res.json({ message: "Expense updated", expense_id: expenseId });
    } catch (error) {
      logError("BOOKING", "Update expense error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/booking/expenses/next-id", verifyToken, async (req, res) => {
    try {
      const year = new Date().getFullYear();
      const [rows] = await db.execute(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(expense_id, 3, 4) AS UNSIGNED)), 0) + 1 AS nextId
         FROM booking_expenses WHERE expense_id LIKE 'E-%'`
      );
      res.json({ expense_id: `E-${String(rows[0]?.nextId ?? 1).padStart(4, "0")}-${year}` });
    } catch (error) {
      logError("BOOKING", "Next expense ID error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/booking/expenses/:expenseId", verifyToken, async (req, res) => {
    try {
      const { expenseId } = req.params;
      const [existing] = await db.execute(
        "SELECT expense_id, bank, cash, total, done_at, description, done_by, created_by FROM booking_expenses WHERE expense_id = ?",
        [expenseId]
      );
      if (existing.length === 0) return res.status(404).json({ message: "Expense not found" });

      const row = existing[0];
      await db.execute("DELETE FROM booking_expenses WHERE expense_id = ?", [expenseId]);
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "DELETE_EXPENSE",
        entity_type: "booking_expenses",
        entity_id: expenseId,
        old_values: {
          expense_id: row.expense_id,
          bank: row.bank,
          cash: row.cash,
          total: row.total,
          done_at: toDateOnly(row.done_at) ?? row.done_at,
          description: row.description,
          done_by: row.done_by,
        },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      log("BOOKING", "Expense deleted", { user_id: req.userId, expenseId });
      res.json({ message: "Expense deleted", expense_id: expenseId });
    } catch (error) {
      logError("BOOKING", "Delete expense error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/booking/expenses/export-audit", verifyToken, async (req, res) => {
    try {
      const { count, expense_ids } = req.body || {};
      const exportCount = typeof count === "number" && count >= 0 ? count : 0;
      const newValues = { count: exportCount };
      if (Array.isArray(expense_ids) && expense_ids.length > 0) {
        newValues.expense_ids = expense_ids.length === exportCount && exportCount > 0 ? "all" : expense_ids;
      }
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "EXPENSES_EXPORT",
        entity_type: "booking_expenses",
        new_values: newValues,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      log("BOOKING", "Expenses export", { user_id: req.userId, count: exportCount });
      res.json({ ok: true });
    } catch (error) {
      logError("BOOKING", "Expenses export audit error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/booking/orders/:orderId/payments", verifyToken, async (req, res) => {
    try {
      const { orderId } = req.params;
      const { bank = 0, bank_tw_traders = 0, cash = 0 } = req.body || {};

      const addBank = Math.max(0, Number(bank) || 0);
      const addBankTwTraders = Math.max(0, Number(bank_tw_traders) || 0);
      const addCash = Math.max(0, Number(cash) || 0);
      if (addBank === 0 && addBankTwTraders === 0 && addCash === 0) {
        return res.status(400).json({ message: "Add at least one of bank, bank (TW Traders), or cash amount" });
      }

      const [orders] = await db.execute("SELECT * FROM orders WHERE order_id = ?", [orderId]);
      if (!orders.length) {
        return res.status(404).json({ message: "Order not found" });
      }

      const order = orders[0];
      const totalAmount = Number(order.total_amount) || 0;
      const currentReceived = Number(order.received_amount) || 0;
      const paymentAmount = addBank + addBankTwTraders + addCash;
      const newReceived = currentReceived + paymentAmount;

      if (newReceived > totalAmount) {
        return res.status(400).json({ message: "Total received cannot exceed order total amount" });
      }

      const [idRows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(payment_id, 3, 4) AS UNSIGNED)), 0) + 1 AS nextId FROM payments WHERE payment_id LIKE 'P-%'"
      );
      const year = new Date().getFullYear();
      const paymentId = `P-${String(idRows[0]?.nextId ?? 1).padStart(4, "0")}-${year}`;
      const today = toDateOnly(new Date());

      await db.execute(
        `INSERT INTO payments (payment_id, order_id, bank, bank_tw_traders, cash, total_received, date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [paymentId, orderId, addBank, addBankTwTraders, addCash, paymentAmount, today]
      );

      await db.execute(
        `UPDATE orders SET received_amount = ?, pending_amount = ? WHERE order_id = ?`,
        [newReceived, Math.max(0, totalAmount - newReceived), orderId]
      );

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "ADD_PAYMENT",
        entity_type: "orders",
        entity_id: orderId,
        new_values: {
          payment_id: paymentId,
          bank: addBank,
          bank_tw_traders: addBankTwTraders,
          cash: addCash,
          total_received: newReceived,
          pending_amount: Math.max(0, totalAmount - newReceived),
          order_id: order.order_id,
          customer_id: order.customer_id,
          contact: order.contact,
          order_type: order.order_type,
          name: order.name,
          weight: order.weight,
          quantity: order.quantity,
          batch: order.batch,
          total_amount: totalAmount,
        },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      log("BOOKING", "Payment added", { user_id: req.userId, orderId, paymentId });
      res.json({
        message: "Payment added",
        payment_id: paymentId,
        received: newReceived,
        pending: Math.max(0, totalAmount - newReceived),
      });
    } catch (error) {
      logError("BOOKING", "Add payment error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/booking/orders/export-audit", verifyToken, async (req, res) => {
    try {
      const { count, filters, order_ids } = req.body || {};
      const exportCount = typeof count === "number" && count >= 0 ? count : 0;
      const newValues = { count: exportCount };
      if (filters && typeof filters === "object" && Object.keys(filters).length > 0) {
        newValues.filters = filters;
      }
      if (Array.isArray(order_ids) && order_ids.length > 0) {
        newValues.order_ids = order_ids.length === exportCount && exportCount > 0 ? "all" : order_ids;
      }
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "ORDER_EXPORT",
        entity_type: "orders",
        new_values: newValues,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      log("BOOKING", "Orders export", { user_id: req.userId, count: exportCount });
      res.json({ ok: true });
    } catch (error) {
      logError("BOOKING", "Export audit error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/booking/orders/:orderId", verifyToken, async (req, res) => {
    try {
      const { orderId } = req.params;
      const body = req.body;

      const [oldRows] = await db.execute(
        `SELECT customer_id, name, contact AS phone_number, alt_contact, address, area, order_type AS type,
                weight, quantity, batch, booking_date, total_amount, received_amount AS received,
                pending_amount AS pending, source, delivery_status, description
         FROM orders WHERE order_id = ?`,
        [orderId]
      );
      const rawOld = oldRows.length > 0 ? oldRows[0] : null;
      const rawNew = { ...body };

      const omitOrderId = (obj) => {
        if (!obj || typeof obj !== "object") return obj;
        const out = { ...obj };
        delete out.order_id;
        return out;
      };
      const oldValues = rawOld ? omitOrderId({ ...rawOld, booking_date: toDateOnly(rawOld.booking_date) }) : null;
      const newValues = omitOrderId({
        ...rawNew,
        booking_date: body.booking_date !== undefined ? toDateOnly(body.booking_date) : undefined,
      });

      const updates = [];
      const params = [];
      const fieldMap = {
        customer_id: "customer_id",
        name: "name",
        phone_number: "contact",
        alt_contact: "alt_contact",
        address: "address",
        area: "area",
        type: "order_type",
        weight: "weight",
        quantity: "quantity",
        batch: "batch",
        booking_date: "booking_date",
        total_amount: "total_amount",
        received: "received_amount",
        pending: "pending_amount",
        source: "source",
        delivery_status: "delivery_status",
        description: "description",
      };

      for (const [clientKey, dbCol] of Object.entries(fieldMap)) {
        if (body[clientKey] !== undefined) {
          updates.push(`\`${dbCol}\` = ?`);
          let value = body[clientKey];
          if (clientKey === "booking_date") value = toDateOnly(value);
          else if (clientKey === "weight") value = value != null && value !== "" ? Number(value) : null;
          else if (clientKey === "quantity") value = value != null && value !== "" ? parseInt(value, 10) : null;
          else if (clientKey === "type") value = String(value).trim();
          params.push(value);
        }
      }

      if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });

      params.push(orderId);
      await db.execute(`UPDATE orders SET ${updates.join(", ")} WHERE order_id = ?`, params);

      const [updatedRows] = await db.execute(
        `SELECT order_id, booking_date, batch, address, area, name
         FROM orders WHERE order_id = ?`,
        [orderId]
      );
      const updated = updatedRows[0];
      if (updated && rawOld) {
        const addressChanged =
          body.address !== undefined &&
          normalizeAddress(body.address) !== normalizeAddress(rawOld.address);
        const batchChanged =
          body.batch !== undefined &&
          String(body.batch || "").trim() !== String(rawOld.batch || "").trim();

        if (addressChanged || batchChanged) {
          await relinkOrderToChallan(db, updated);
        } else if (qualifiesForOperations(updated)) {
          await refreshLinkedChallanForOrder(db, orderId);
        }
      }

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "UPDATE_ORDER",
        entity_type: "orders",
        entity_id: orderId,
        old_values: oldValues,
        new_values: newValues,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      log("BOOKING", "Order updated", { user_id: req.userId, orderId });
      res.json({ message: "Order updated", order_id: orderId });
    } catch (error) {
      logError("BOOKING", "Update order error", error);
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "UPDATE_ORDER_ERROR",
        entity_type: "orders",
        entity_id: req.params.orderId,
        new_values: { reason: "server_error" },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/booking/orders/:orderId/cancel", verifyToken, async (req, res) => {
    try {
      const { orderId } = req.params;
      const [rows] = await db.execute(
        `SELECT customer_id, contact, alt_contact, order_type, name, address, area, weight, quantity,
                booking_date, total_amount, source, description, batch
         FROM orders WHERE order_id = ?`,
        [orderId]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Order not found" });

      const o = rows[0];
      const [idRows] = await db.execute(
        `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(REPLACE(id, '#', ''), '-', 2), '-', -1) AS UNSIGNED)), 0) + 1 AS nextId
         FROM cancelled_orders WHERE REPLACE(id, '#', '') LIKE 'C-%'`
      );
      const year = new Date().getFullYear();
      const cancelId = `C-${String(idRows[0]?.nextId ?? 1).padStart(4, "0")}-${year}`;

      await db.execute(
        `INSERT INTO cancelled_orders (
          id, customer_id, contact, alt_contact, order_type, name, address, area, weight, quantity,
          booking_date, total_amount, source, description, batch
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cancelId,
          o.customer_id,
          o.contact,
          o.alt_contact,
          o.order_type,
          o.name,
          o.address,
          o.area,
          o.weight,
          o.quantity,
          o.booking_date,
          o.total_amount,
          o.source,
          o.description,
          o.batch,
        ]
      );

      try {
        await removeOrderFromChallan(db, orderId);
      } catch (challanErr) {
        logError("BOOKING", "Challan remove on cancel", challanErr);
      }

      await db.execute("DELETE FROM payments WHERE order_id = ?", [orderId]);
      await db.execute("DELETE FROM orders WHERE order_id = ?", [orderId]);

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "CANCEL_ORDER",
        entity_type: "orders",
        entity_id: orderId,
        new_values: { order_id: orderId, cancelled_id: cancelId, ...o },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      log("BOOKING", "Order cancelled", { user_id: req.userId, orderId, cancelId });
      res.json({ message: "Order cancelled", cancelled_id: cancelId });
    } catch (error) {
      logError("BOOKING", "Cancel order error", error);
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "CANCEL_ORDER_ERROR",
        entity_type: "orders",
        entity_id: req.params.orderId,
        new_values: { reason: "server_error" },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/booking/invoice/:customerId", verifyToken, async (req, res) => {
    try {
      const { customerId } = req.params;
      const INVOICE_BOOKING_YEAR = 2026;

      const invoiceParams = [customerId];
      const invoiceYearConds = buildOrderYearWhere(String(INVOICE_BOOKING_YEAR), invoiceParams, "o");
      const invoiceYearSql = invoiceYearConds.length ? ` AND ${invoiceYearConds[0]}` : "";

      const [orders] = await db.execute(
        `SELECT o.order_id, o.name, o.contact, o.address, o.area,
                o.order_type AS type, o.booking_date, o.total_amount,
                o.received_amount, o.pending_amount, o.weight, o.quantity, o.batch
         FROM orders o
         WHERE o.customer_id = ?${invoiceYearSql}
         ORDER BY o.booking_date, o.order_id`,
        invoiceParams
      );

      if (orders.length === 0) {
        await writeAuditLog(db, {
          user_id: req.userId,
          action: "INVOICE_NO_ORDERS",
          entity_type: "invoice",
          entity_id: customerId,
          new_values: { reason: "no_orders" },
          ip_address: req.ip,
          user_agent: req.get("user-agent"),
        });
        return res.status(404).json({ message: `No orders found for this customer in ${INVOICE_BOOKING_YEAR}` });
      }

      const firstBookingYear = (() => {
        const d = orders[0].booking_date;
        if (!d) return new Date().getFullYear();
        const yr = new Date(d).getFullYear();
        return isNaN(yr) ? new Date().getFullYear() : yr;
      })();

      const [seqRows] = await db.execute(
        "SELECT COUNT(*) AS cnt FROM audit_logs WHERE action = 'INVOICE_GENERATED'"
      );
      const invoiceSeq = Number(seqRows[0]?.cnt ?? 0) + 1;
      const invoiceNumber = `#I-${String(invoiceSeq).padStart(4, "0")}-${firstBookingYear}`;
      const displayOrderNo = `S-${String(invoiceSeq).padStart(4, "0")}-${firstBookingYear}`;

      const customer = orders[0];
      const bookingDateStr = toDateOnly(customer.booking_date) || "—";
      const issuedDate = toDateOnly(new Date()) || new Date().toISOString().split("T")[0];

      let grandTotal = 0;
      let grandReceived = 0;
      let grandPending = 0;
      for (const row of orders) {
        grandTotal += Number(row.total_amount || 0);
        grandReceived += Number(row.received_amount || 0);
        grandPending += Number(row.pending_amount || 0);
      }

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "INVOICE_GENERATED",
        entity_type: "invoice",
        entity_id: customerId,
        new_values: {
          customer_id: customerId,
          invoice_number: invoiceNumber,
          order_count: orders.length,
          grand_total: grandTotal,
          grand_received: grandReceived,
          grand_pending: grandPending,
        },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      const fmt = (n) => Math.round(Number(n || 0)).toLocaleString("en-PK");

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Invoice-${invoiceNumber.replace("#", "")}-${customerId}.pdf"`);

      const doc = new PDFDocument({ margin: 0, size: "A4", autoFirstPage: true });
      doc.pipe(res);

      const PW = doc.page.width;
      const PH = doc.page.height;
      const ML = 38;
      const MR = 38;
      const CW = PW - ML - MR;
      const RIGHT = ML + CW;

      const C_BG = "#f5f5f5";
      const C_BORDER = "#d8d8d8";
      const C_HEAD_TX = "#141414";
      const C_MUTED = "#7a7a7a";
      const C_BODY = "#222222";
      const C_GREEN = "#196a43";
      const C_RED = "#a63234";
      const C_TITLE = "#111111";
      const C_SUB = "#535353";

      const truncate = (text, maxW, font = "Helvetica", size = 10) => {
        const str = String(text || "");
        doc.font(font).fontSize(size);
        if (doc.widthOfString(str) <= maxW) return str;
        let out = str;
        while (out.length > 0 && doc.widthOfString(`${out}...`) > maxW) out = out.slice(0, -1);
        return `${out}...`;
      };

      // Header
      doc.font("Helvetica-Bold").fontSize(26).fillColor("#151515").text("INVOICE", ML, 45, { lineBreak: false });
      doc.font("Helvetica").fontSize(13).fillColor("#272727").text("THE WARSI FARM", ML, 80, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(16).fillColor("#151515").text(displayOrderNo, ML, 45, { width: CW, align: "right", lineBreak: false });
      doc.font("Helvetica").fontSize(9).fillColor(C_MUTED).text("ORDER NUMBER", ML, 66, { width: CW, align: "right", lineBreak: false });

      const sepY = 105;
      doc.moveTo(ML, sepY).lineTo(RIGHT, sepY).lineWidth(0.5).strokeColor(C_BORDER).stroke();

      const topY = 122;
      const cardW = 148;
      const cardH = 110;

      doc.roundedRect(ML, topY, cardW, cardH, 5).fillColor(C_BG).fill();
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#1f1f1f").text("Issue Date:", ML + 14, topY + 16, { lineBreak: false });
      doc.font("Helvetica").fontSize(10.5).fillColor("#575757").text(issuedDate, ML + 14, topY + 34, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#1f1f1f").text("Booking Date:", ML + 14, topY + 60, { lineBreak: false });
      doc.font("Helvetica").fontSize(10.5).fillColor("#575757").text(bookingDateStr, ML + 14, topY + 78, { lineBreak: false });

      const fromX = ML + 174;
      doc.font("Helvetica-Bold").fontSize(11).fillColor(C_TITLE).text("FROM", fromX, topY + 4, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#111111").text("The Warsi Farm", fromX, topY + 24, { lineBreak: false });
      doc.font("Helvetica").fontSize(10.5).fillColor(C_SUB)
        .text("D-63, Block # H, North", fromX, topY + 46, { lineBreak: false })
        .text("Nazimabad, Karachi", fromX, topY + 62, { lineBreak: false })
        .text("Contact: 0331-9911466", fromX, topY + 80, { lineBreak: false });

      const toX = ML + 352;
      const customerName = (customer.name || "Customer Name").trim();
      const customerAddr = String(customer.address || "—");
      const customerContact = String(customer.contact || "—");
      const toColWidth = RIGHT - toX - 8;
      const toWrap = { width: toColWidth, lineGap: 2 };

      doc.font("Helvetica-Bold").fontSize(11).fillColor(C_TITLE).text("TO", toX, topY + 4, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#111111");
      const toNameH = doc.heightOfString(customerName, toWrap);
      doc.font("Helvetica").fontSize(10.5).fillColor(C_SUB);
      const toAddrH = doc.heightOfString(customerAddr, toWrap);
      const toContactLine = `Customer Contact: ${customerContact}`;
      const toContactH = doc.heightOfString(toContactLine, toWrap);
      const toContentTop = topY + 24;
      const toBlockBottom = toContentTop + toNameH + 6 + toAddrH + 6 + toContactH;

      let tableY = Math.max(topY + cardH + 28, toBlockBottom + 18);
      let toY = toContentTop;
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#111111");
      doc.text(customerName, toX, toY, toWrap);
      toY += toNameH + 6;
      doc.font("Helvetica").fontSize(10.5).fillColor(C_SUB);
      doc.text(customerAddr, toX, toY, toWrap);
      toY += toAddrH + 6;
      doc.text(toContactLine, toX, toY, toWrap);

      const ROW_H = 30;
      const ITEM_H = 48;
      const GAP = 8;
      const COL_DESC = ML + 12;
      const COL_QTY = ML + 214;
      const COL_RATE = ML + 282;
      const COL_PAID = ML + 374;
      const COL_DUE = ML + 454;

      const drawTableHeader = (y) => {
        doc.roundedRect(ML, y, CW, ROW_H, 4).lineWidth(1).strokeColor(C_BORDER).fillAndStroke(C_BG, C_BORDER);
        doc.font("Helvetica-Bold").fontSize(10.5).fillColor(C_HEAD_TX);
        doc.text("DESCRIPTION", COL_DESC, y + 10, { lineBreak: false });
        doc.text("QUANTITY", COL_QTY, y + 10, { lineBreak: false });
        doc.text("RATE", COL_RATE, y + 10, { lineBreak: false });
        doc.text("PAID", COL_PAID, y + 10, { lineBreak: false });
        doc.text("DUE", COL_DUE, y + 10, { lineBreak: false });
      };

      drawTableHeader(tableY);

      let rowY = tableY + ROW_H + GAP;
      const rowsBottomLimit = PH - 48;

      for (const row of orders) {
        if (rowY + ITEM_H > rowsBottomLimit) {
          doc.addPage({ margin: 0, size: "A4" });
          tableY = 60;
          drawTableHeader(tableY);
          rowY = tableY + ROW_H + GAP;
        }

        doc.roundedRect(ML, rowY, CW, ITEM_H, 4).fillColor(C_BG).fill();

        const displayType = String(row.type || "Mango").trim();
        const qty = row.quantity != null ? String(row.quantity) : "1";
        const weightStr = row.weight != null ? `${row.weight} kg` : null;
        const batchStr = row.batch ? `Batch: ${row.batch}` : null;
        const subParts = [weightStr, batchStr].filter(Boolean).join(" | ");

        doc.font("Helvetica-Bold").fontSize(11).fillColor("#1a1a1a")
          .text(truncate(displayType, 190, "Helvetica-Bold", 11), COL_DESC, rowY + 8, { lineBreak: false });
        if (subParts) {
          doc.font("Helvetica").fontSize(9.5).fillColor("#5f5f5f")
            .text(truncate(subParts, 190), COL_DESC, rowY + 24, { lineBreak: false });
        }

        const qtyY = rowY + 17;
        doc.font("Helvetica").fontSize(11).fillColor(C_BODY)
          .text(qty, COL_QTY + 10, qtyY, { width: 30, align: "center", lineBreak: false });
        doc.font("Helvetica").fontSize(11).fillColor(C_BODY)
          .text(`PKR ${fmt(row.total_amount)}`, COL_RATE - 4, qtyY, { width: 90, lineBreak: false });
        doc.font("Helvetica-Bold").fontSize(11).fillColor(C_GREEN)
          .text(`PKR ${fmt(row.received_amount)}`, COL_PAID - 4, qtyY, { width: 80, lineBreak: false });
        doc.font("Helvetica-Bold").fontSize(11).fillColor(C_RED)
          .text(`PKR ${fmt(row.pending_amount)}`, COL_DUE - 4, qtyY, { width: 80, lineBreak: false });

        rowY += ITEM_H + GAP;
      }

      const noteText = "All items are exclusive of tax. Terms & Conditions apply. Please refer to the following page for full details.";
      doc.font("Helvetica").fontSize(9.5);
      const noteBodyHeight = doc.heightOfString(noteText, { width: 300, lineGap: 2.5, align: "justify" });
      const signatureText = "* This is an auto generated invoice and does not need a signature.";
      doc.font("Helvetica").fontSize(8);
      const signatureHeight = doc.heightOfString(signatureText, { width: CW, align: "center" });
      const PAY_H = 72;
      const payReservedHeight = PAY_H + 8 + signatureHeight + 24;
      const noteTotalsHeight = Math.max(18 + noteBodyHeight, 152);

      let noteY = rowY + 8;
      if (noteY + noteTotalsHeight + 20 + payReservedHeight > PH) {
        doc.addPage({ margin: 0, size: "A4" });
        noteY = 60;
      }

      doc.font("Helvetica-Bold").fontSize(12).fillColor(C_TITLE).text("NOTE:", ML, noteY, { lineBreak: false });
      doc.font("Helvetica").fontSize(9.5).fillColor("#4f4f4f")
        .text(noteText, ML, noteY + 18, { width: 300, lineGap: 2.5, align: "justify" });

      const sumLabel = ML + 355;
      const sumRight = RIGHT;
      let sy = noteY + 6;

      const drawTotalRow = (label, value, lColor = C_TITLE, vColor = C_TITLE, bold = true) => {
        const f = bold ? "Helvetica-Bold" : "Helvetica";
        doc.font(f).fontSize(11).fillColor(lColor).text(label, sumLabel, sy, { width: 75, align: "left", lineBreak: false });
        doc.font(f).fontSize(11).fillColor(vColor).text(value, sumLabel, sy, { width: sumRight - sumLabel, align: "right", lineBreak: false });
        sy += 22;
      };

      drawTotalRow("SUBTOTAL", `PKR ${fmt(grandTotal)}`);
      drawTotalRow("SHIPPING", "FREE", C_TITLE, C_MUTED, false);
      drawTotalRow("TOTAL", `PKR ${fmt(grandTotal)}`);
      drawTotalRow("PAID", `PKR ${fmt(grandReceived)}`, C_TITLE, C_GREEN);
      sy += 6;
      doc.font("Helvetica-Bold").fontSize(11).fillColor(C_TITLE).text("AMOUNT DUE", RIGHT - 160, sy, { width: 160, align: "right", lineBreak: false });
      sy += 22;
      doc.font("Helvetica-Bold").fontSize(22).fillColor(C_RED)
        .text(`PKR ${fmt(grandPending)}`, RIGHT - 160, sy, { width: 160, align: "right", lineBreak: false });

      const noteBodyBottomY = noteY + 18 + noteBodyHeight;
      const totalsBottomY = sy + 30;
      const contentBottomY = Math.max(noteBodyBottomY, totalsBottomY);
      const bottomAlignedPayY = PH - payReservedHeight;
      let PAY_Y = bottomAlignedPayY;
      if (contentBottomY + 20 > bottomAlignedPayY) {
        doc.addPage({ margin: 0, size: "A4" });
        PAY_Y = 60;
      }

      doc.roundedRect(ML, PAY_Y, CW, PAY_H, 4).lineWidth(1).strokeColor(C_BORDER).fillAndStroke("#ffffff", C_BORDER);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#1d1d1d")
        .text("PAYMENT INFORMATION", ML, PAY_Y + 11, { width: CW, align: "center", lineBreak: false });

      const P1 = ML + 14;
      const P2 = ML + 152;
      const P3 = ML + 284;
      const P4 = ML + 438;
      const VY = PAY_Y + 33;
      const NY = PAY_Y + 51;

      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#222222");
      doc.text("ACCOUNT NAME (Meezan)", P1, VY, { width: 130, lineBreak: false });
      doc.text("BRANCH", P2, VY, { width: 120, lineBreak: false });
      doc.text("IBAN", P3, VY, { width: 145, lineBreak: false });
      doc.text("ACCOUNT NO", P4, VY, { width: 80, lineBreak: false });

      doc.font("Helvetica").fontSize(8).fillColor("#4a4a4a");
      doc.text("THE WARSI FARM", P1, NY, { width: 130, lineBreak: false });
      doc.text("FB AREA BLOCK 12 BRANCH", P2, NY, { width: 120, lineBreak: false });
      doc.text("PK03MEZN0010180114502823", P3, NY, { width: 145, lineBreak: false });
      doc.text("10180114502823", P4, NY, { width: 80, lineBreak: false });

      doc.font("Helvetica").fontSize(8).fillColor("#4a4a4a")
        .text(signatureText, ML, PAY_Y + PAY_H + 8, { width: CW, align: "center", lineBreak: false });

      drawInvoiceTermsPage(doc, { ML, RIGHT, CW, PH });
      doc.end();
    } catch (error) {
      logError("BOOKING", "Invoice error", error);
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "INVOICE_ERROR",
        entity_type: "invoice",
        entity_id: req.params.customerId,
        new_values: { reason: "server_error" },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      res.status(500).json({ message: "Server error" });
    }
  });
}
