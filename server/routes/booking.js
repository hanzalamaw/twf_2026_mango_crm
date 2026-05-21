import PDFDocument from "pdfkit";
import { log, logError } from "../utils/logger.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { limitOffsetClause } from "../utils/sqlPagination.js";

/** Once per process: whether `leads.closed_by` exists (may be NULL for all rows until confirm). */
let leadsClosedByColumnExists;

async function leadsQueryBySelectSql(db) {
  if (leadsClosedByColumnExists === undefined) {
    try {
      const [rows] = await db.execute(
        "SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'closed_by' LIMIT 1"
      );
      leadsClosedByColumnExists = rows.length > 0;
    } catch {
      leadsClosedByColumnExists = false;
    }
  }
  return leadsClosedByColumnExists ? "l.closed_by AS query_by" : "CAST(NULL AS CHAR(100)) AS query_by";
}

/** Normalize to date-only YYYY-MM-DD for consistent display and audit (avoids timezone shift). */
function toDateOnly(v) {
  if (v == null || v === "") return v;
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, "0"), d = String(v.getDate()).padStart(2, "0");
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
      'By placing a Qurbani order with The Warsi Farm, the customer ("you") agrees to be fully bound by these Terms & Conditions. The Warsi Farm ("we," "us," "TWF") reserves the right to update these terms at any time without prior notice. Continued engagement after any update constitutes acceptance.',
    ],
  },
  {
    heading: "2. Payment Terms & Due Dates",
    paragraphs: [
      "A partial payment (advance/booking amount) is required at the time of booking to confirm and reserve your Qurbani slot. No slot is held without this advance.",
      "The remaining balance must be cleared at least 7–10 days before Eid ul-Adha. Failure to do so may result in automatic cancellation of your booking without a refund of the advance.",
      "Accepted payment methods: Bank Transfer, EasyPaisa, JazzCash, and Cash (in-person only, subject to availability).",
      "In case of bank transfer, the customer must share valid payment proof (screenshot/receipt) via WhatsApp within 24 hours of transfer.",
      "All prices are quoted in Pakistani Rupees (PKR) and are exclusive of any tax. There are no additional charges whatsoever.",
      "Prices are locked at the time of booking and will not change due to market fluctuation after confirmation.",
    ],
  },
  {
    heading: "3. Qurbani Animal & Delivery",
    paragraphs: [
      "All Qurbani animals (cow/goat/sheep) are sourced from verified, healthy livestock that meet the Shariah-mandated criteria for age, health, and physical soundness.",
      "The Warsi Farm operates on a Ijtimai (collective) Qurbani model. Each customer's share is identified and tracked throughout the process.",
      "Customers do not select their individual animal; the farm manages animal allocation collectively to ensure fairness and Shariah compliance.",
      "Meat will be delivered fresh on the day of Qurbani or as communicated at the time of booking, based on your delivery slot.",
      "Free Delivery within Karachi, Except Bahria Town Karachi",
      "The Warsi Farm is not responsible for delays caused by traffic, weather, or other external factors beyond our control. However, we will communicate proactively in case of any delay.",
      "Meat quantity per share is estimated and may vary slightly due to the natural variation in animal weight. No claim for weight shortage will be entertained post-delivery.",
    ],
  },
  {
    heading: "4. Shariah-Compliance Disclaimer",
    paragraphs: [
      "The slaughter is performed by following the proper Islamic method, ensuring full Halal compliance.",
      "Customers are advised that by booking through The Warsi Farm, their Qurbani obligation (Wajib) is considered fulfilled upon correct and valid slaughter of the assigned share — regardless of physical presence",
    ],
  },
  {
    heading: "6. Liability",
    paragraphs: [
      "The Warsi Farm's total liability under any circumstance shall not exceed the amount paid by the customer for their booking. We are not liable for any indirect, consequential, or incidental losses.",
    ],
  },
  {
    heading: "7. Governing Jurisdiction",
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
  /** Space below "1. General" / "2. Payment…" headings before body text. */
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
export const registerBookingRoutes = (app, db, verifyToken) => {
  const GOAT_HISSA_TYPES = ["Goat (Hissa)", "Super Goat (Hissa)", "Premium Goat (Hissa)"];
  const normalizeOrderType = (value) => {
    const raw = String(value || "").trim();
    return raw === "Cow" ? "Fancy Cow" : raw;
  };
  const isGoatHissaType = (orderType) => GOAT_HISSA_TYPES.includes(normalizeOrderType(orderType));
  const normalizeGoatNumber = (value) => String(value || "").trim().toUpperCase();
  const isValidGoatNumber = (value) => /^G[1-9]\d*$/.test(normalizeGoatNumber(value));
  const normalizeHissaNumber = (value) => String(value ?? "").trim();

  async function getNextAvailableGoatNumber(year, dayValue) {
    const placeholders = GOAT_HISSA_TYPES.map(() => "?").join(",");
    const [goatRows] = await db.execute(
      `SELECT cow_number
       FROM orders
       WHERE order_type IN (${placeholders})
         AND day = ?
         AND (YEAR(booking_date) = ? OR booking_date IS NULL)
         AND cow_number IS NOT NULL AND cow_number <> ''`,
      [...GOAT_HISSA_TYPES, dayValue, year]
    );

    const used = new Set();
    for (const row of goatRows) {
      const m = normalizeGoatNumber(row.cow_number).match(/^G([1-9]\d*)$/);
      if (m) used.add(Number(m[1]));
    }

    let next = 1;
    while (used.has(next)) next += 1;
    return `G${next}`;
  }
  // Generate customer ID based on contact lookup
  app.post("/api/booking/generate-customer-id", verifyToken, async (req, res) => {
    try {
      const { contact } = req.body || {};
      if (!contact || String(contact).trim().length < 3) {
        return res.status(400).json({ message: "Contact number is required (minimum 3 characters)" });
      }
      const contactStr = String(contact).trim();

      // Check existing orders for this contact
      const [orderRows] = await db.execute(
        "SELECT customer_id FROM orders WHERE contact = ? LIMIT 1",
        [contactStr]
      );

      if (orderRows.length > 0 && orderRows[0].customer_id) {
        log("BOOKING", "Customer ID found in orders", { user_id: req.userId, contact: contactStr, customer_id: orderRows[0].customer_id });
        return res.json({ customer_id: orderRows[0].customer_id });
      }

      // Check cancelled orders for this contact
      const [cancelledRows] = await db.execute(
        "SELECT customer_id FROM cancelled_orders WHERE contact = ? LIMIT 1",
        [contactStr]
      );

      if (cancelledRows.length > 0 && cancelledRows[0].customer_id) {
        log("BOOKING", "Customer ID found in cancelled orders", { user_id: req.userId, contact: contactStr, customer_id: cancelledRows[0].customer_id });
        return res.json({ customer_id: cancelledRows[0].customer_id });
      }

      // Generate new customer ID: TWF-XXXX-Q format
      // Find max numeric part from both orders and cancelled_orders
      const [maxOrderRows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(customer_id, '-', 2), '-', -1) AS UNSIGNED)), 0) AS maxNum FROM orders WHERE customer_id LIKE 'TWF-%'"
      );
      const [maxCancelledRows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(customer_id, '-', 2), '-', -1) AS UNSIGNED)), 0) AS maxNum FROM cancelled_orders WHERE customer_id LIKE 'TWF-%'"
      );

      const maxOrderNum = Number(maxOrderRows[0]?.maxNum || 0);
      const maxCancelledNum = Number(maxCancelledRows[0]?.maxNum || 0);
      const nextNum = Math.max(maxOrderNum, maxCancelledNum) + 1;
      const customerId = `TWF-${String(nextNum).padStart(4, "0")}-Q`;

      log("BOOKING", "Customer ID generated", { user_id: req.userId, contact: contactStr, customer_id: customerId });
      res.json({ customer_id: customerId });
    } catch (error) {
      logError("BOOKING", "Generate customer ID error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Generate order ID based on order_type
  app.post("/api/booking/generate-order-id", verifyToken, async (req, res) => {
    try {
      const { order_type } = req.body || {};
      if (!order_type || !String(order_type).trim()) {
        return res.status(400).json({ message: "Order type is required" });
      }

      const orderType = normalizeOrderType(order_type);
      const year = 2026;

      // Map order types to prefixes
      const prefixMap = {
        "Cow": "C",
        "Fancy Cow": "C",
        "Goat (Hissa)": "G",
        "Super Goat (Hissa)": "G",
        "Premium Goat (Hissa)": "G",
        "Hissa - Standard": "S",
        "Hissa - Premium": "P",
        "Hissa - Waqf": "W",
        "Hissa - Exclusive": "E",
        "Goat": "G",
      };

      const prefix = prefixMap[orderType] || "O"; // Default to "O" if not found

      // Find next available number for this prefix and year
      // Check orders with booking_date in the year OR orders with null booking_date (new orders)
      // Handle both old format (#O-0001-2026) and new format (C-0001-2026)
      const pattern1 = `${prefix}-%`; // New format: C-0001-2026
      
      // Try to find max from new format first
      const [idRows1] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(order_id, '-', 2), '-', -1) AS UNSIGNED)), 0) AS nextId FROM orders WHERE order_id LIKE ? AND (YEAR(booking_date) = ? OR booking_date IS NULL)",
        [pattern1, year]
      );
      
      // Also check old format if prefix is O (for backward compatibility)
      let maxFromOld = 0;
      if (prefix === "O") {
        const [idRows2] = await db.execute(
          "SELECT COALESCE(MAX(CAST(SUBSTRING(order_id, 4, 4) AS UNSIGNED)), 0) AS nextId FROM orders WHERE order_id LIKE '#O-%' AND (YEAR(booking_date) = ? OR booking_date IS NULL)",
          [year]
        );
        maxFromOld = Number(idRows2[0]?.nextId || 0);
      }
      
      const maxFromNew = Number(idRows1[0]?.nextId || 0);
      const nextNum = Math.max(maxFromNew, maxFromOld, 0) + 1;
      const orderId = `${prefix}-${String(nextNum).padStart(4, "0")}-${year}`;

      log("BOOKING", "Order ID generated", { user_id: req.userId, order_type: orderType, order_id: orderId });
      res.json({ order_id: orderId });
    } catch (error) {
      logError("BOOKING", "Generate order ID error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Get available cow/hissa number (day-based independent numbering)
  app.post("/api/booking/get-available-cow-hissa", verifyToken, async (req, res) => {
    try {
      const { order_type, day, booking_date } = req.body || {};
      if (!order_type || !String(order_type).trim()) {
        return res.json({ cow_number: "", hissa_number: "" });
      }

      const orderType = normalizeOrderType(order_type);
      const dayValue = day ? String(day).trim() : null;
      const year = booking_date ? (new Date(booking_date).getFullYear() || 2026) : 2026;

      // Only for Hissa types
      const hissaTypes = ["Hissa - Standard", "Hissa - Premium", "Hissa - Waqf", "Hissa - Exclusive", ...GOAT_HISSA_TYPES];
      if (!hissaTypes.includes(orderType)) {
        return res.json({ cow_number: "", hissa_number: "" });
      }

      if (isGoatHissaType(orderType)) {
        if (!dayValue) {
          return res.json({ cow_number: "", hissa_number: "0" });
        }
        const nextGoatNumber = await getNextAvailableGoatNumber(year, dayValue);
        return res.json({ cow_number: nextGoatNumber, hissa_number: "0" });
      }

      // Get all used cow/hissa combinations for this order_type, day, and year
      let usedCombinations = [];
      if (dayValue) {
        const [usedRows] = await db.execute(
          "SELECT cow_number, hissa_number FROM orders WHERE order_type = ? AND day = ? AND (YEAR(booking_date) = ? OR booking_date IS NULL) AND cow_number IS NOT NULL AND hissa_number IS NOT NULL",
          [orderType, dayValue, year]
        );
        usedCombinations = usedRows.map((r) => ({ cow: r.cow_number, hissa: r.hissa_number }));
      } else {
        const [usedRows] = await db.execute(
          "SELECT cow_number, hissa_number FROM orders WHERE order_type = ? AND (YEAR(booking_date) = ? OR booking_date IS NULL) AND cow_number IS NOT NULL AND hissa_number IS NOT NULL",
          [orderType, year]
        );
        usedCombinations = usedRows.map((r) => ({ cow: r.cow_number, hissa: r.hissa_number }));
      }

      // Find first available combination
      // Cows: S1, S2, S3, ... (Standard)
      // Premium: P1, P2, P3, ... (Premium)
      // Waqf: W1, W2, W3, ... (Waqf)
      // Exclusive: E1, E2, E3, ... (Hissa - Exclusive)
      // Hissas: 1-7 per cow
      const prefixMap = {
        "Hissa - Premium": "P",
        "Hissa - Standard": "S",
        "Hissa - Waqf": "W",
        "Hissa - Exclusive": "E",
      };
      
      const cowPrefix = prefixMap[orderType] || "";
      const maxCows = 50; // Reasonable limit
      const maxHissas = 7;

      let foundCow = "";
      let foundHissa = "";

      for (let cowNum = 1; cowNum <= maxCows; cowNum++) {
        const cowId = `${cowPrefix}${cowNum}`;
        for (let hissaNum = 1; hissaNum <= maxHissas; hissaNum++) {
          const isUsed = usedCombinations.some((uc) => uc.cow === cowId && uc.hissa === String(hissaNum));
          if (!isUsed) {
            foundCow = cowId;
            foundHissa = String(hissaNum);
            break;
          }
        }
        if (foundCow) break;
      }

      log("BOOKING", "Available cow/hissa retrieved", {
        user_id: req.userId,
        order_type: orderType,
        day: dayValue,
        cow_number: foundCow,
        hissa_number: foundHissa,
      });
      res.json({ cow_number: foundCow, hissa_number: foundHissa });
    } catch (error) {
      logError("BOOKING", "Get available cow/hissa error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Hissa + Goat stats sheet (for /stats page)
// Returns:
// - Hissa Standard/Premium/Waqf: cow-wise total hissa + slot distribution
// - Goat (Hissa): goat-wise rows by day + slot
app.get("/api/booking/hissa-sheet", verifyToken, async (req, res) => {
  try {
    const yearParam = parseInt(req.query.year, 10);
    const year = Number.isFinite(yearParam) ? yearParam : 2026;

    const days = ["DAY 1", "DAY 2", "DAY 3"];

    const orderTypes = [
      "Hissa - Standard",
      "Hissa - Premium",
      "Hissa - Waqf",
        ...GOAT_HISSA_TYPES,
    ];

    const normalizeDay = (value) => {
      const s = String(value || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");

      if (s === "DAY1" || s === "1") return "DAY 1";
      if (s === "DAY2" || s === "2") return "DAY 2";
      if (s === "DAY3" || s === "3") return "DAY 3";

      return null;
    };

    const normalizeSlot = (value) => {
      const s = String(value || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, " ");

      if (s === "SLOT 1" || s === "SLOT1" || s === "1") return "SLOT 1";
      if (s === "SLOT 2" || s === "SLOT2" || s === "2") return "SLOT 2";
      if (s === "SLOT 3" || s === "SLOT3" || s === "3") return "SLOT 3";

      return null;
    };

    const normalizeCow = (value) =>
      String(value || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");

    const slotCounts = () => ({
      "SLOT 1": 0,
      "SLOT 2": 0,
      "SLOT 3": 0,
    });

    const out = {
      year,
      days,
      order_types: orderTypes,
      types: {},
    };

    for (const ot of orderTypes) {
      out.types[ot] = {};
      for (const d of days) {
        out.types[ot][d] = {};
      }
    }

    /**
     * 1) Hissa cow stats
     * Standard/Premium/Waqf are calculated by distinct hissa_number.
     */
    const hissaTypes = ["Hissa - Standard", "Hissa - Premium", "Hissa - Waqf"];

    const [hissaRows] = await db.execute(
      `
      SELECT
        o.order_type,
        o.day,
        o.cow_number,
        o.slot,
        COUNT(DISTINCT o.hissa_number) AS total_hissa
      FROM orders o
      WHERE o.order_type IN (${hissaTypes.map(() => "?").join(",")})
        AND o.cow_number IS NOT NULL
        AND TRIM(o.cow_number) <> ''
        AND o.hissa_number IS NOT NULL
        AND TRIM(o.hissa_number) <> ''
        AND YEAR(o.booking_date) = ?
      GROUP BY
        o.order_type,
        o.day,
        o.cow_number,
        o.slot
      `,
      [...hissaTypes, year]
    );

    for (const r of hissaRows) {
      const orderType = String(r.order_type || "").trim();
      const day = normalizeDay(r.day);
      const cow = normalizeCow(r.cow_number);
      const slot = normalizeSlot(r.slot);
      const count = Math.max(0, Number(r.total_hissa) || 0);

      if (!out.types[orderType] || !day || !out.types[orderType][day] || !cow) {
        continue;
      }

      if (!out.types[orderType][day][cow]) {
        out.types[orderType][day][cow] = {
          total_hissa: 0,
          slot_counts: slotCounts(),
        };
      }

      out.types[orderType][day][cow].total_hissa += count;

      if (slot) {
        out.types[orderType][day][cow].slot_counts[slot] += count;
      }
    }

    /**
     * 2) Goat (Hissa) stats
     * Goat is one complete animal/order, so each goat cow_number is counted as 1 row.
     * hissa_number is normally 0, so we do NOT rely on distinct hissa_number.
     */
    const [goatRows] = await db.execute(
      `
      SELECT
        o.order_id,
        o.order_type,
        o.day,
        o.cow_number,
        o.slot
      FROM orders o
      WHERE o.order_type IN (${GOAT_HISSA_TYPES.map(() => "?").join(",")})
        AND o.cow_number IS NOT NULL
        AND TRIM(o.cow_number) <> ''
        AND YEAR(o.booking_date) = ?
      ORDER BY
        o.day ASC,
        CAST(REGEXP_REPLACE(UPPER(TRIM(o.cow_number)), '[^0-9]', '') AS UNSIGNED) ASC,
        o.created_at ASC
      `,
      [...GOAT_HISSA_TYPES, year]
    );

    for (const r of goatRows) {
      const day = normalizeDay(r.day);
      const goatNumber = normalizeCow(r.cow_number);
      const slot = normalizeSlot(r.slot);

      if (!day || !out.types["Goat (Hissa)"][day] || !goatNumber) {
        continue;
      }

      if (!out.types["Goat (Hissa)"][day][goatNumber]) {
        out.types["Goat (Hissa)"][day][goatNumber] = {
          total_hissa: 1,
          slot_counts: slotCounts(),
        };
      }

      if (slot) {
        out.types["Goat (Hissa)"][day][goatNumber].slot_counts[slot] += 1;
      }
    }

    res.json(out);
  } catch (error) {
    logError("BOOKING", "Hissa/goat sheet stats error", error);
    res.status(500).json({ message: "Server error" });
  }
});

  // Check if cow/hissa combination already exists
  app.post("/api/booking/check-cow-hissa", verifyToken, async (req, res) => {
    try {
      const { cow_number, hissa_number, order_type, day, order_id, booking_date } = req.body || {};
      
      if (!cow_number || !hissa_number || !order_type) {
        return res.json({ exists: false });
      }

      const cowNum = String(cow_number).trim();
      const hissaNum = String(hissa_number).trim();
      const orderType = normalizeOrderType(order_type);
      const dayValue = day ? String(day).trim() : null;
      const year = booking_date ? (new Date(booking_date).getFullYear() || 2026) : 2026;
      if (isGoatHissaType(orderType)) {
        if (!isValidGoatNumber(cowNum)) {
          return res.status(400).json({ message: "Goat number must be in G1, G2 format" });
        }
        if (normalizeHissaNumber(hissaNum) !== "0") {
          return res.status(400).json({ message: "Hissa number must be 0 for Goat (Hissa)" });
        }
      }

      let query = `
        SELECT order_id, booking_name, shareholder_name, contact
        FROM orders
        WHERE cow_number = ? AND hissa_number = ?
        AND (YEAR(booking_date) = ? OR booking_date IS NULL)
      `;
      const params = [cowNum, hissaNum, year];
      if (isGoatHissaType(orderType)) {
        query += ` AND order_type IN (${GOAT_HISSA_TYPES.map(() => "?").join(",")})`;
        params.push(...GOAT_HISSA_TYPES);
      } else {
        query += " AND order_type = ?";
        params.push(orderType);
      }

      if (dayValue) {
        query += " AND day = ?";
        params.push(dayValue);
      }
      // Exclude current order_id if editing
      if (order_id) {
        query += " AND order_id != ?";
        params.push(order_id);
      }

      const [rows] = await db.execute(query, params);
      
      if (rows.length > 0) {
        const existing = rows[0];
        return res.json({
          exists: true,
          order_id: existing.order_id,
          booking_name: existing.booking_name,
          shareholder_name: existing.shareholder_name,
          contact: existing.contact,
        });
      }

      res.json({ exists: false });
    } catch (error) {
      logError("BOOKING", "Check cow/hissa error", error);
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
        order_type,
        booking_name,
        shareholder_name,
        cow_number,
        hissa_number,
        alt_contact,
        address,
        area,
        day,
        booking_date,
        total_amount,
        order_source,
        reference,
        closed_by,
        description,
        slot,
      } = body;

      // Validation
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

      // Check if order_id already exists
      const [existing] = await db.execute("SELECT order_id FROM orders WHERE order_id = ?", [order_id]);
      if (existing.length > 0) {
        return res.status(400).json({ message: "Order ID already exists" });
      }

      const normalizedOrderType = normalizeOrderType(order_type);
      let finalCowNumber = cow_number != null && String(cow_number).trim() !== "" ? String(cow_number).trim() : null;
      let finalHissaNumber = hissa_number != null && String(hissa_number).trim() !== "" ? String(hissa_number).trim() : null;
      if (isGoatHissaType(normalizedOrderType)) {
        finalCowNumber = normalizeGoatNumber(finalCowNumber);
        finalHissaNumber = "0";
        if (!isValidGoatNumber(finalCowNumber)) {
          return res.status(400).json({ message: "Goat number must be in G1, G2 format" });
        }
      }

      if (normalizedOrderType === "Hissa - Exclusive") {
        finalCowNumber = String(finalCowNumber || "").trim().toUpperCase();
        if (!/^E[1-9]\d*$/.test(finalCowNumber || "")) {
          return res.status(400).json({ message: "Cow number must be E1, E2, … format for Hissa - Exclusive" });
        }
      }

      const totalAmount = Math.max(0, Number(total_amount) || 0);
      const receivedAmount = 0;
      const pendingAmount = totalAmount;

      await db.execute(
        `INSERT INTO orders (
          order_id, customer_id, contact, order_type, booking_name, shareholder_name,
          cow_number, hissa_number, alt_contact, address, area, day, booking_date,
          total_amount, received_amount, pending_amount, order_source, reference,
          closed_by, description, rider_id, slot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        [
          order_id,
          customer_id,
          contact,
          normalizedOrderType,
          booking_name || null,
          shareholder_name || null,
          finalCowNumber || null,
          finalHissaNumber || null,
          alt_contact || null,
          address || null,
          area || null,
          day || null,
          booking_date ? toDateOnly(booking_date) : null,
          totalAmount,
          receivedAmount,
          pendingAmount,
          order_source || null,
          reference || null,
          closed_by || null,
          description || null,
          slot || null,
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
          order_type,
          booking_name,
          shareholder_name,
          cow_number: finalCowNumber || null,
          hissa_number: finalHissaNumber || null,
          alt_contact: alt_contact || null,
          address: address || null,
          area: area || null,
          day: day || null,
          slot: slot || null,
          booking_date: booking_date ? toDateOnly(booking_date) : null,
          total_amount: totalAmount,
          order_source: order_source || null,
          reference: reference || null,
          closed_by: closed_by || null,
          description: description || null,
        },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

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
        slot,
        order_type,
        day,
        reference,
        cow_number,
        year,
        page,
        limit,
        payment_status,
        source,
        omit_hidden_types,
        farm_order_management,
      } = req.query;
      const conditions = [];
      const params = [];

      if (year === "2026" || year === "2025") {
        conditions.push("YEAR(o.booking_date) = ?");
        params.push(year);
      } else if (year === "2024") {
        conditions.push("(o.booking_date IS NULL OR YEAR(o.booking_date) < 2025)");
      }
      // year === "all" or empty: no year filter
      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conditions.push(`(
          o.order_id LIKE ? OR o.customer_id LIKE ? OR
          o.cow_number LIKE ? OR o.hissa_number LIKE ? OR
          o.booking_name LIKE ? OR o.shareholder_name LIKE ? OR
          o.contact LIKE ? OR o.alt_contact LIKE ? OR
          o.area LIKE ? OR o.address LIKE ?
        )`);
        params.push(term, term, term, term, term, term, term, term, term, term);
      }
      if (slot) {
        conditions.push("o.slot = ?");
        params.push(slot);
      }
      const orderTypesRaw = Array.isArray(order_type) ? order_type : order_type ? [order_type] : [];
      let orderTypes = orderTypesRaw.map((t) => normalizeOrderType(t));

      // Farm Order Management only:
      // - DB may contain old rows as order_type = 'Cow' and new rows as 'Fancy Cow'.
      // - Frontend should display both as 'Fancy Cow'.
      // - Goat must remain exact 'Goat' only, not Goat (Hissa).
      if (farm_order_management === "1") {
        const expanded = new Set();
        for (const type of orderTypes) {
          if (type === "Fancy Cow") {
            expanded.add("Fancy Cow");
            expanded.add("Cow");
          } else if (type === "Goat") {
            expanded.add("Goat");
          }
        }
        orderTypes = Array.from(expanded);
      }

      if (orderTypes.length > 0) {
        conditions.push(`o.order_type IN (${orderTypes.map(() => "?").join(",")})`);
        params.push(...orderTypes);
      }
      if (day) {
        conditions.push("o.day = ?");
        params.push(day);
      }
      if (reference) {
        conditions.push("o.reference = ?");
        params.push(reference);
      }
      if (cow_number && cow_number.trim()) {
        conditions.push("o.cow_number LIKE ?");
        params.push(`%${cow_number.trim()}%`);
      }
      if (payment_status === "pending") {
        conditions.push("COALESCE(o.pending_amount, 0) > 0");
      } else if (payment_status === "received") {
        conditions.push("COALESCE(o.pending_amount, 0) <= 0");
      }
      if (source === "Farm") {
        conditions.push("TRIM(COALESCE(o.order_source, '')) = 'Farm'");
      }
      // Booking transactions UI: exclude farm-only types from main booking list (SQL so LIMIT/total match)
      if (omit_hidden_types === "1") {
        conditions.push("(o.order_type IS NULL OR o.order_type NOT IN ('Cow', 'Fancy Cow', 'Goat'))");
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const fromClause = `
        FROM orders o
        LEFT JOIN (
          SELECT order_id, SUM(bank) AS bank, SUM(cash) AS cash
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
          o.cow_number AS cow,
          o.hissa_number AS hissa,
          o.slot AS slot,
          o.booking_name AS booking_name,
          o.shareholder_name AS shareholder_name,
          o.contact AS phone_number,
          o.alt_contact AS alt_phone,
          o.address AS address,
          o.area AS area,
          o.day AS day,
          CASE WHEN o.order_type = 'Cow' THEN 'Fancy Cow' ELSE o.order_type END AS type,
          o.booking_date AS booking_date,
          o.total_amount AS total_amount,
          COALESCE(p.bank, 0) AS bank,
          COALESCE(p.cash, 0) AS cash,
          o.received_amount AS received,
          o.pending_amount AS pending,
          o.order_source AS source,
          o.reference AS reference,
          o.closed_by AS closed_by,
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
      await writeAuditLog(db, { user_id: req.userId, action: "ORDER_LIST_ERROR", entity_type: "orders", new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
      res.status(500).json({ message: "Server error" });
    }
  });

  // Orders summary (totals over all orders matching filters - for amount divs on Transactions)
  app.get("/api/booking/orders/summary", verifyToken, async (req, res) => {
    try {
      const { year, order_type } = req.query;
      const conditions = [];
      const params = [];
      if (year === "2026" || year === "2025") {
        conditions.push("YEAR(o.booking_date) = ?");
        params.push(year);
      } else if (year === "2024") {
        conditions.push("(o.booking_date IS NULL OR YEAR(o.booking_date) < 2025)");
      }
      const typesRaw = Array.isArray(order_type) ? order_type : order_type ? [order_type] : [];
      const types = typesRaw.map((t) => normalizeOrderType(t));
      if (types.length > 0) {
        conditions.push(`o.order_type IN (${types.map(() => "?").join(",")})`);
        params.push(...types);
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const [rows] = await db.execute(
        `SELECT COALESCE(SUM(p.bank), 0) AS total_bank, COALESCE(SUM(p.cash), 0) AS total_cash
         FROM orders o
         LEFT JOIN (SELECT order_id, SUM(bank) AS bank, SUM(cash) AS cash FROM payments GROUP BY order_id) p ON o.order_id = p.order_id
         ${whereClause}`,
        params
      );
      res.json({
        totalBank: Number(rows[0]?.total_bank ?? 0),
        totalCash: Number(rows[0]?.total_cash ?? 0),
      });
    } catch (error) {
      logError("BOOKING", "Orders summary error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/booking/orders/filters", verifyToken, async (req, res) => {
    try {
      const { year, source } = req.query;
      const conditions = [];
      const params = [];
      if (year === "2026" || year === "2025") {
        conditions.push("YEAR(booking_date) = ?");
        params.push(year);
      } else if (year === "2024") {
        conditions.push("(booking_date IS NULL OR YEAR(booking_date) < 2025)");
      }
      if (source === "Farm") {
        conditions.push("TRIM(COALESCE(order_source, '')) = 'Farm'");
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const andOrWhere = whereClause ? " AND " : " WHERE ";

      const [slots] = await db.execute(`SELECT DISTINCT slot AS value FROM orders ${whereClause}${andOrWhere}slot IS NOT NULL AND slot != '' ORDER BY slot`, params);
      const [types] = await db.execute(`SELECT DISTINCT (CASE WHEN order_type = 'Cow' THEN 'Fancy Cow' ELSE order_type END) AS value FROM orders ${whereClause}${andOrWhere}order_type IS NOT NULL ORDER BY value`, params);
      const [days] = await db.execute(`SELECT DISTINCT day AS value FROM orders ${whereClause}${andOrWhere}day IS NOT NULL ORDER BY day`, params);
      const [refs] = await db.execute(`SELECT DISTINCT reference AS value FROM orders ${whereClause}${andOrWhere}reference IS NOT NULL AND reference != '' ORDER BY reference`, params);
      res.json({
        slots: slots.map((r) => r.value),
        order_types: types.map((r) => r.value),
        days: days.map((r) => r.value),
        references: refs.map((r) => r.value),
      });
    } catch (error) {
      logError("BOOKING", "Orders filters error", error);
      await writeAuditLog(db, { user_id: req.userId, action: "ORDER_FILTERS_ERROR", entity_type: "orders", new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
      res.status(500).json({ message: "Server error" });
    }
  });

  // --- Leads (Query Management) ---
  app.get("/api/booking/leads", verifyToken, async (req, res) => {
    try {
      const { search, order_type, day, reference, area, year, page, limit } = req.query;
      const conditions = [];
      const params = [];

      if (year === "2026" || year === "2025") {
        conditions.push("YEAR(l.booking_date) = ?");
        params.push(year);
      } else if (year === "2024") {
        conditions.push("(l.booking_date IS NULL OR YEAR(l.booking_date) < 2025)");
      }
      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conditions.push(`(
          l.booking_name LIKE ? OR l.shareholder_name LIKE ? OR
          l.contact LIKE ? OR l.alt_contact LIKE ? OR
          l.area LIKE ? OR l.address LIKE ? OR l.customer_id LIKE ?
        )`);
        params.push(term, term, term, term, term, term, term);
      }
      if (order_type) {
        conditions.push("(CASE WHEN l.order_type = 'Cow' THEN 'Fancy Cow' ELSE l.order_type END) = ?");
        params.push(normalizeOrderType(order_type));
      }
      if (day) {
        conditions.push("l.day = ?");
        params.push(day);
      }
      if (reference) {
        conditions.push("l.reference = ?");
        params.push(reference);
      }
      if (area && area.trim()) {
        conditions.push("l.area = ?");
        params.push(area.trim());
      }
      if (req.query.source === "Farm") {
        conditions.push("l.order_source = ?");
        params.push("Farm");
      }
      // Booking Query Management: exclude farm-only order types (must be in SQL so LIMIT/total match the table)
      if (req.query.omit_hidden_types === "1") {
        conditions.push("(l.order_type IS NULL OR l.order_type NOT IN ('Cow', 'Fancy Cow', 'Goat'))");
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const offset = (pageNum - 1) * limitNum;

      const [countRows] = await db.execute(
        `SELECT COUNT(*) AS total FROM leads l ${whereClause}`,
        params
      );
      const total = countRows[0]?.total ?? 0;

      const queryBySql = await leadsQueryBySelectSql(db);
      const query = `
        SELECT
          l.lead_id AS lead_id,
          l.customer_id AS customer_id,
          l.booking_name AS booking_name,
          l.shareholder_name AS shareholder_name,
          l.contact AS phone_number,
          l.alt_contact AS alt_phone,
          l.address AS address,
          l.area AS area,
          l.day AS day,
          CASE WHEN l.order_type = 'Cow' THEN 'Fancy Cow' ELSE l.order_type END AS type,
          l.booking_date AS booking_date,
          l.total_amount AS total_amount,
          l.order_source AS source,
          l.reference AS reference,
          ${queryBySql},
          l.description AS description,
          l.created_at AS created_at
        FROM leads l
        ${whereClause}
        ORDER BY l.created_at DESC
        ${limitOffsetClause(limitNum, offset, { maxLimit: 100, defaultLimit: 50 })}
      `;
      const [rows] = await db.execute(query, params);
      const normalized = rows.map((r) => ({ ...r, booking_date: toDateOnly(r.booking_date) ?? r.booking_date }));
      log("BOOKING", "Leads list fetched", { user_id: req.userId, count: rows.length, total, page: pageNum });
      res.json({ data: normalized, total });
    } catch (error) {
      logError("BOOKING", "Leads list error", error);
      await writeAuditLog(db, { user_id: req.userId, action: "LEADS_LIST_ERROR", entity_type: "leads", new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/booking/leads/filters", verifyToken, async (req, res) => {
    try {
      const { year } = req.query;
      const conditions = [];
      const params = [];
      if (year === "2026" || year === "2025") {
        conditions.push("YEAR(booking_date) = ?");
        params.push(year);
      } else if (year === "2024") {
        conditions.push("(booking_date IS NULL OR YEAR(booking_date) < 2025)");
      }
      if (req.query.source === "Farm") {
        conditions.push("order_source = ?");
        params.push("Farm");
      }
      if (req.query.omit_hidden_types === "1") {
        conditions.push("(order_type IS NULL OR order_type NOT IN ('Cow', 'Fancy Cow', 'Goat'))");
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const andOrWhere = whereClause ? " AND " : " WHERE ";

      const [types] = await db.execute(`SELECT DISTINCT (CASE WHEN order_type = 'Cow' THEN 'Fancy Cow' ELSE order_type END) AS value FROM leads ${whereClause}${andOrWhere}order_type IS NOT NULL ORDER BY value`, params);
      const [days] = await db.execute(`SELECT DISTINCT day AS value FROM leads ${whereClause}${andOrWhere}day IS NOT NULL ORDER BY day`, params);
      const [refs] = await db.execute(`SELECT DISTINCT reference AS value FROM leads ${whereClause}${andOrWhere}reference IS NOT NULL AND reference != '' ORDER BY reference`, params);
      const [areas] = await db.execute(`SELECT DISTINCT area AS value FROM leads ${whereClause}${andOrWhere}area IS NOT NULL AND area != '' ORDER BY area`, params);
      res.json({
        order_types: types.map((r) => r.value),
        days: days.map((r) => r.value),
        references: refs.map((r) => r.value),
        areas: areas.map((r) => r.value),
      });
    } catch (error) {
      logError("BOOKING", "Leads filters error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  /** Map lead row from DB (contact, alt_contact, order_type, order_source) to client shape (phone_number, alt_phone, type, source) for audit display */
  function leadRowToClientShape(row) {
    if (!row) return null;
      const { contact, alt_contact, order_type, order_source, closed_by, booking_date, ...rest } = row;
    return {
      ...rest,
      phone_number: contact,
      alt_phone: alt_contact,
        type: normalizeOrderType(order_type),
      source: order_source,
      query_by: closed_by,
      booking_date: toDateOnly(booking_date) ?? booking_date,
    };
  }

  // Update lead
  app.put("/api/booking/leads/:leadId", verifyToken, async (req, res) => {
    try {
      const { leadId } = req.params;
      const body = req.body;
      const [existingRows] = await db.execute(
        "SELECT lead_id, customer_id, contact, alt_contact, order_type, booking_name, shareholder_name, address, area, day, booking_date, total_amount, order_source, reference, closed_by, description FROM leads WHERE lead_id = ?",
        [leadId]
      );
      if (existingRows.length === 0) return res.status(404).json({ message: "Lead not found" });
      const oldValues = leadRowToClientShape(existingRows[0]);

      const fields = [];
      const params = [];
      const normalized = {
        customer_id: body.customer_id,
        contact: body.contact ?? body.phone_number,
        order_type: body.order_type ?? body.type,
        booking_name: body.booking_name,
        shareholder_name: body.shareholder_name,
        alt_contact: body.alt_contact ?? body.alt_phone,
        address: body.address,
        area: body.area,
        day: body.day,
        booking_date: body.booking_date,
        total_amount: body.total_amount,
        order_source: body.order_source ?? body.source,
        reference: body.reference,
        closed_by: body.closed_by ?? body.query_by,
        description: body.description,
      };
      for (const [key, val] of Object.entries(normalized)) {
        if (val !== undefined) {
          fields.push(`\`${key}\` = ?`);
          params.push(key === "booking_date" ? toDateOnly(val) : val);
        }
      }
      if (fields.length === 0) return res.status(400).json({ message: "No fields to update" });
      params.push(leadId);
      await db.execute(`UPDATE leads SET ${fields.join(", ")} WHERE lead_id = ?`, params);
      await writeAuditLog(db, { user_id: req.userId, action: "UPDATE_LEAD", entity_type: "leads", entity_id: leadId, old_values: oldValues, new_values: body, ip_address: req.ip, user_agent: req.get("user-agent") });
      log("BOOKING", "Lead updated", { user_id: req.userId, leadId });
      res.json({ message: "Lead updated", lead_id: leadId });
    } catch (error) {
      logError("BOOKING", "Update lead error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Delete lead (permanent) — store full deleted lead for audit (same pattern as cancel order)
  app.delete("/api/booking/leads/:leadId", verifyToken, async (req, res) => {
    try {
      const { leadId } = req.params;
      const [existing] = await db.execute(
        "SELECT lead_id, customer_id, contact, alt_contact, order_type, booking_name, shareholder_name, address, area, day, booking_date, total_amount, order_source, reference, closed_by, description FROM leads WHERE lead_id = ?",
        [leadId]
      );
      if (existing.length === 0) return res.status(404).json({ message: "Lead not found" });
      const deletedLead = leadRowToClientShape(existing[0]);
      await db.execute("DELETE FROM leads WHERE lead_id = ?", [leadId]);
      await writeAuditLog(db, { user_id: req.userId, action: "DELETE_LEAD", entity_type: "leads", entity_id: leadId, new_values: deletedLead, ip_address: req.ip, user_agent: req.get("user-agent") });
      log("BOOKING", "Lead deleted", { user_id: req.userId, leadId });
      res.json({ message: "Lead deleted" });
    } catch (error) {
      logError("BOOKING", "Delete lead error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Confirm lead → create order and remove lead (audit logged). Body may include order_id, slot, booking_date, cow_number, hissa_number.
  app.post("/api/booking/leads/:leadId/confirm-order", verifyToken, async (req, res) => {
    try {
      const { leadId } = req.params;
      const body = req.body || {};
      const [leadRows] = await db.execute(
        "SELECT lead_id, customer_id, contact, order_type AS order_type, booking_name, shareholder_name, alt_contact, address, area, day, booking_date, total_amount, order_source, reference, closed_by, description FROM leads WHERE lead_id = ?",
        [leadId]
      );
      if (leadRows.length === 0) {
        await writeAuditLog(db, { user_id: req.userId, action: "CONFIRM_LEAD_ORDER_ERROR", entity_type: "leads", entity_id: leadId, new_values: { reason: "lead_not_found" }, ip_address: req.ip, user_agent: req.get("user-agent") });
        return res.status(404).json({ message: "Lead not found" });
      }
      const lead = leadRows[0];
      const isFarmLead = String(lead.order_source || "").trim() === "Farm";

      const orderType = body.order_type != null && String(body.order_type).trim()
        ? normalizeOrderType(body.order_type)
        : normalizeOrderType(lead.order_type);
      let shareholderName = body.shareholder_name != null && String(body.shareholder_name).trim() ? String(body.shareholder_name).trim() : (lead.shareholder_name ?? null);
      if (isFarmLead) {
        shareholderName = "-";
      }
      const addressVal = body.address != null && String(body.address).trim() ? String(body.address).trim() : (lead.address ?? null);
      const areaVal = body.area != null && String(body.area).trim() ? String(body.area).trim() : (lead.area ?? null);
      let dayVal = body.day != null && String(body.day).trim() ? String(body.day).trim() : (lead.day ?? null);
      if (isFarmLead) {
        dayVal = body.day != null && String(body.day).trim() !== "" ? String(body.day).trim() : null;
      }
      const closedBy = body.closed_by != null && String(body.closed_by).trim()
        ? String(body.closed_by).trim()
        : (lead.closed_by != null && String(lead.closed_by).trim() ? String(lead.closed_by).trim() : null);
      const totalAmount = Number(body.total_amount);

      if (!orderType) {
        return res.status(400).json({ message: "Order type is required" });
      }
      if (!isFarmLead && (!shareholderName || !String(shareholderName).trim())) {
        return res.status(400).json({ message: "Shareholder name is required" });
      }
      if (!addressVal || !String(addressVal).trim()) {
        return res.status(400).json({ message: "Address is required" });
      }
      if (!areaVal || !String(areaVal).trim()) {
        return res.status(400).json({ message: "Area is required" });
      }
      if (!isFarmLead && (!dayVal || !String(dayVal).trim())) {
        return res.status(400).json({ message: "Day is required" });
      }
      if (!closedBy) {
        return res.status(400).json({ message: "Closed by is required" });
      }
      if (!Number.isFinite(totalAmount) || totalAmount < 0) {
        return res.status(400).json({ message: "Total amount must be a valid positive number" });
      }

      let orderId = body.order_id && String(body.order_id).trim() ? String(body.order_id).trim() : null;
      if (!orderId) {
        const [idRows] = await db.execute(
          "SELECT COALESCE(MAX(CAST(SUBSTRING(order_id, 4, 4) AS UNSIGNED)), 0) + 1 AS nextId FROM orders WHERE order_id LIKE '#O-%'"
        );
        const year = new Date().getFullYear();
        const nextNum = idRows[0]?.nextId ?? 1;
        orderId = `O-${String(nextNum).padStart(4, "0")}-${year}`;
      }

      let slotVal = body.slot != null && String(body.slot).trim() !== "" ? String(body.slot).trim() : null;
      let bookingDateVal = body.booking_date != null && String(body.booking_date).trim() !== "" ? toDateOnly(body.booking_date) : toDateOnly(lead.booking_date);
      let cowNumber = body.cow_number != null && String(body.cow_number).trim() !== "" ? String(body.cow_number).trim() : null;
      let hissaNumber = body.hissa_number != null && String(body.hissa_number).trim() !== "" ? String(body.hissa_number).trim() : null;

      if (isFarmLead) {
        slotVal = null;
        cowNumber = "0";
        hissaNumber = "0";
      }
      if (isGoatHissaType(orderType)) {
        cowNumber = normalizeGoatNumber(cowNumber);
        hissaNumber = "0";
        if (!isValidGoatNumber(cowNumber)) {
          return res.status(400).json({ message: "Goat number must be in G1, G2 format" });
        }
      }

      await db.execute(
        `INSERT INTO orders (order_id, customer_id, contact, order_type, booking_name, shareholder_name, cow_number, hissa_number, alt_contact, address, area, day, booking_date, total_amount, received_amount, pending_amount, order_source, reference, closed_by, description, rider_id, slot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, NULL, ?)`,
        [
          orderId,
          lead.customer_id ?? null,
          lead.contact ?? null,
          orderType,
          lead.booking_name ?? null,
          shareholderName,
          cowNumber,
          hissaNumber,
          lead.alt_contact ?? null,
          addressVal,
          areaVal,
          dayVal,
          bookingDateVal ?? null,
          totalAmount,
          totalAmount, // pending_amount
          lead.order_source ?? null,
          lead.reference ?? null,
          closedBy,
          lead.description ?? null,
          slotVal,
        ]
      );

      await db.execute("DELETE FROM leads WHERE lead_id = ?", [leadId]);

      const auditDetail = {
        lead_id: leadId,
        order_id: orderId,
        customer_id: lead.customer_id,
        contact: lead.contact,
        order_type: orderType,
        booking_name: lead.booking_name,
        shareholder_name: shareholderName,
        cow_number: cowNumber,
        hissa_number: hissaNumber,
        slot: slotVal,
        day: dayVal,
        booking_date: bookingDateVal,
        total_amount: totalAmount,
        order_source: lead.order_source || null,
        reference: lead.reference || null,
        closed_by: closedBy,
      };
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "CONFIRM_LEAD_ORDER",
        entity_type: "leads",
        entity_id: leadId,
        new_values: auditDetail,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      log("BOOKING", "Lead confirmed as order", { user_id: req.userId, leadId, orderId });
      res.json({ message: "Order created from lead", order_id: orderId });
    } catch (error) {
      logError("BOOKING", "Confirm lead order error", error);
      await writeAuditLog(db, { user_id: req.userId, action: "CONFIRM_LEAD_ORDER_ERROR", entity_type: "leads", entity_id: req.params.leadId, new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
      res.status(500).json({ message: "Server error" });
    }
  });

  // --- Transactions (payments + expenses summary and lists) ---
  app.get("/api/booking/transactions", verifyToken, async (req, res) => {
    try {
      const [paySum] = await db.execute(
        "SELECT COALESCE(SUM(bank), 0) AS total_bank, COALESCE(SUM(cash), 0) AS total_cash, COALESCE(SUM(total_received), 0) AS total_received FROM payments"
      );
      const [expSum] = await db.execute(
        "SELECT COALESCE(SUM(bank), 0) AS expenses_bank, COALESCE(SUM(cash), 0) AS expenses_cash FROM booking_expenses"
      );
      const totalBank = Number(paySum[0]?.total_bank ?? 0);
      const totalCash = Number(paySum[0]?.total_cash ?? 0);
      const totalExpensesBank = Number(expSum[0]?.expenses_bank ?? 0);
      const totalExpensesCash = Number(expSum[0]?.expenses_cash ?? 0);
      const onHand = totalBank - totalExpensesBank;
      const actual = totalCash - totalExpensesCash;
      const totalAmount = totalBank + totalCash;

      const [payments] = await db.execute(
        "SELECT p.payment_id, p.bank, p.cash, p.total_received, p.date, p.order_id FROM payments p ORDER BY p.date DESC, p.payment_id DESC"
      );
      const [expenses] = await db.execute(
        "SELECT expense_id, bank, cash, total, done_at, description FROM booking_expenses ORDER BY done_at DESC"
      );

      res.json({
        summary: {
          totalBank,
          totalCash,
          totalExpensesBank,
          totalExpensesCash,
          onHand,
          actual,
          totalAmount,
        },
        payments: payments.map((r) => ({ ...r, date: toDateOnly(r.date) ?? r.date })),
        expenses,
      });
    } catch (error) {
      logError("BOOKING", "Transactions error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Expenses summary (totals over all expenses - for amount divs)
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

  // List booking expenses (for Expenses page, paginated)
  app.get(["/api/booking/expenses", "/api/farm/expenses"], verifyToken, async (req, res) => {
    try {
      const isFarm = req.path.startsWith("/api/farm");
      const tableName = isFarm ? "farm_expenses" : "booking_expenses";
      const logScope = isFarm ? "FARM" : "BOOKING";
  
      const { page = 1, limit = 50 } = req.query;
  
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const offset = (pageNum - 1) * limitNum;
  
      const [countRows] = await db.execute(
        `SELECT COUNT(*) AS total FROM ${tableName}`
      );
  
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
        FROM ${tableName} e
        LEFT JOIN users u
          ON u.user_id = e.created_by
        ORDER BY e.done_at DESC
        ${limitOffsetClause(limitNum, offset, { maxLimit: 100, defaultLimit: 50 })}
        `
      );
  
      const expenses = rows.map((r) => ({
        ...r,
        done_at: toDateOnly(r.done_at) ?? r.done_at,
      }));
  
      res.json({ data: expenses, total });
    } catch (error) {
      logError("EXPENSES", "Expenses list error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Create booking expense
  app.post("/api/booking/expenses", verifyToken, async (req, res) => {
    try {
      let { bank = 0, cash = 0, description = "", done_by = null, done_at = null } = req.body || {};
  
      const addBank = Math.max(0, Number(bank) || 0);
      const addCash = Math.max(0, Number(cash) || 0);
  
      if (addBank === 0 && addCash === 0) {
        return res.status(400).json({ message: "Add at least one of bank or cash amount" });
      }
  
      const total = addBank + addCash;
  
      // Normalize optional fields
      description = String(description || "").trim() || null;
      done_by = done_by ? String(done_by).trim() : null;
  
      // Validate date
      if (done_at) {
        const d = new Date(done_at);
        if (isNaN(d.getTime())) done_at = null;
        else done_at = d.toISOString().split("T")[0];
      } else {
        done_at = null;
      }
  
      const year = new Date().getFullYear();
  
      // Get username
      const [userRows] = await db.execute(
        "SELECT username FROM users WHERE user_id = ?",
        [req.userId]
      );
  
      const username = userRows[0]?.username ?? String(req.userId);
  
      /*
        ⭐ Expense ID Generation
        Format → E-0001-2025
      */
      const [idRows] = await db.execute(
        `SELECT COALESCE(
          MAX(CAST(SUBSTRING(expense_id, 3, 4) AS UNSIGNED)), 0
        ) + 1 AS nextId 
        FROM booking_expenses 
        WHERE expense_id LIKE 'E-%'`
      );
  
      const nextId = idRows[0]?.nextId ?? 1;
      const expenseId = `E-${String(nextId).padStart(4, "0")}-${year}`;
  
      // Insert expense
      await db.execute(
        `INSERT INTO booking_expenses 
          (expense_id, bank, cash, total, description, done_by, done_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          expenseId,
          addBank,
          addCash,
          total,
          description,
          done_by || username,
          done_at,
          req.userId
        ]
      );
  
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "ADD_EXPENSE",
        entity_type: "booking_expenses",
        entity_id: expenseId,
        new_values: {
          bank: addBank,
          cash: addCash,
          total,
          description,
          done_by: done_by || username,
          done_at
        },
        ip_address: req.ip,
        user_agent: req.get("user-agent")
      });
  
      log("BOOKING", "Expense added", { user_id: req.userId, expenseId });
  
      res.json({
        message: "Expense added",
        expense_id: expenseId
      });
  
    } catch (error) {
      logError("BOOKING", "Add expense error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Update booking expense
  app.put("/api/booking/expenses/:expenseId", verifyToken, async (req, res) => {
    try {
      const { expenseId } = req.params;
  
      let {
        bank,
        cash,
        description,
        done_by = null,
        done_at = null
      } = req.body || {};
  
      const newBank = Math.max(0, Number(bank) || 0);
      const newCash = Math.max(0, Number(cash) || 0);
  
      if (newBank === 0 && newCash === 0) {
        return res.status(400).json({
          message: "At least one of bank or cash must be greater than 0"
        });
      }
  
      const total = newBank + newCash;
  
      // Normalize text fields
      description = String(description ?? "").trim() || null;
      done_by = done_by ? String(done_by).trim() || null : null;
  
      // Validate date format
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
  
      const previousState = {
        expense_id: oldRow.expense_id,
        bank: oldRow.bank,
        cash: oldRow.cash,
        total: oldRow.total,
        description: oldRow.description,
        done_by: oldRow.done_by,
        done_at: oldRow.done_at
      };
  
      await db.execute(
        `UPDATE booking_expenses 
         SET bank = ?, cash = ?, total = ?, description = ?, done_by = ?, done_at = ?
         WHERE expense_id = ?`,
        [
          newBank,
          newCash,
          total,
          description,
          done_by,
          done_at,
          expenseId
        ]
      );
  
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "UPDATE_EXPENSE",
        entity_type: "booking_expenses",
        entity_id: expenseId,
        old_values: previousState,
        new_values: {
          expense_id: expenseId,
          bank: newBank,
          cash: newCash,
          total,
          description,
          done_by,
          done_at
        },
        ip_address: req.ip,
        user_agent: req.get("user-agent")
      });
  
      log("BOOKING", "Expense updated", { user_id: req.userId, expenseId });
  
      res.json({
        message: "Expense updated",
        expense_id: expenseId
      });
  
    } catch (error) {
      logError("BOOKING", "Update expense error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

// Get next expense ID (for frontend modal display)
app.get("/api/booking/expenses/next-id", verifyToken, async (req, res) => {
  try {
    const year = new Date().getFullYear();

    const [rows] = await db.execute(`
      SELECT COALESCE(
        MAX(CAST(SUBSTRING(expense_id, 3, 4) AS UNSIGNED)), 0
      ) + 1 AS nextId 
      FROM booking_expenses 
      WHERE expense_id LIKE 'E-%'
    `);

    const nextId = rows[0]?.nextId ?? 1;

    const expenseId = `E-${String(nextId).padStart(4, "0")}-${year}`;

    res.json({ expense_id: expenseId });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});
  
  // Delete booking expense
  app.delete("/api/booking/expenses/:expenseId", verifyToken, async (req, res) => {
    try {
      const { expenseId } = req.params;
      const [existing] = await db.execute("SELECT expense_id, bank, cash, total, done_at, description, done_by, created_by FROM booking_expenses WHERE expense_id = ?", [expenseId]);
      if (existing.length === 0) return res.status(404).json({ message: "Expense not found" });
      const row = existing[0];
      const previousState = { expense_id: row.expense_id, bank: row.bank, cash: row.cash, total: row.total, done_at: toDateOnly(row.done_at) ?? row.done_at, description: row.description, done_by: row.done_by };
      await db.execute("DELETE FROM booking_expenses WHERE expense_id = ?", [expenseId]);
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "DELETE_EXPENSE",
        entity_type: "booking_expenses",
        entity_id: expenseId,
        old_values: previousState,
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

  // Log expenses export (client calls after generating Excel)
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

  // Add payment to an order (for Update Transaction modal)
  app.post("/api/booking/orders/:orderId/payments", verifyToken, async (req, res) => {
    try {
      const { orderId } = req.params;
  
      const { bank = 0, cash = 0 } = req.body || {};
  
      const addBank = Math.max(0, Number(bank) || 0);
      const addCash = Math.max(0, Number(cash) || 0);
  
      if (addBank === 0 && addCash === 0) {
        return res.status(400).json({
          message: "Add at least one of bank or cash amount"
        });
      }
  
      // ⭐ Fetch Order
      const [orders] = await db.execute(
        "SELECT * FROM orders WHERE order_id = ?",
        [orderId]
      );
  
      if (!orders.length) {
        return res.status(404).json({ message: "Order not found" });
      }
  
      const order = orders[0];
  
      const totalAmount = Number(order.total_amount) || 0;
      const currentReceived = Number(order.received_amount) || 0;
  
      const paymentAmount = addBank + addCash;
      const newReceived = currentReceived + paymentAmount;
  
      // ⭐ Prevent Overpayment
      if (newReceived > totalAmount) {
        return res.status(400).json({
          message: "Total received cannot exceed order total amount"
        });
      }
  
      // ⭐ Generate Payment ID
      const [idRows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(payment_id, 3, 4) AS UNSIGNED)),0)+1 AS nextId FROM payments WHERE payment_id LIKE 'P-%'"
      );
  
      const year = new Date().getFullYear();
  
      const paymentId = `P-${String(idRows[0]?.nextId ?? 1).padStart(4, "0")}-${year}`;
  
      const today = toDateOnly(new Date());
  
      const paymentTotal = addBank + addCash;
  
      // ⭐ Insert Payment (No new schema fields)
      await db.execute(
        `INSERT INTO payments (
          payment_id,
          order_id,
          bank,
          cash,
          total_received,
          date
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          paymentId,
          orderId,
          addBank,
          addCash,
          paymentTotal,
          today
        ]
      );
  
      // ⭐ Update Order Financial State
      await db.execute(
        `UPDATE orders 
         SET received_amount = ?, pending_amount = ?
         WHERE order_id = ?`,
        [
          newReceived,
          Math.max(0, totalAmount - newReceived),
          orderId
        ]
      );
  
      // ⭐ Audit Log With Order Snapshot
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "ADD_PAYMENT",
        entity_type: "orders",
        entity_id: orderId,
  
        new_values: {
          payment_id: paymentId,
          bank: addBank,
          cash: addCash,
          total_received: newReceived,
          pending_amount: Math.max(0, totalAmount - newReceived),
  
          order_id: order.order_id,
          customer_id: order.customer_id,
          contact: order.contact,
          order_type: order.order_type,
          booking_name: order.booking_name,
          shareholder_name: order.shareholder_name,
          cow_number: order.cow_number,
          hissa_number: order.hissa_number,
          total_amount: totalAmount
        },
  
        ip_address: req.ip,
        user_agent: req.get("user-agent")
      });
  
      log("BOOKING", "Payment added", {
        user_id: req.userId,
        orderId,
        paymentId
      });
  
      res.json({
        message: "Payment added",
        payment_id: paymentId,
        received: newReceived,
        pending: Math.max(0, totalAmount - newReceived)
      });
  
    } catch (error) {
      logError("BOOKING", "Add payment error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Log lead/query export (client calls after generating Excel)
  app.post("/api/booking/leads/export-audit", verifyToken, async (req, res) => {
    try {
      const { count, filters, lead_ids } = req.body || {};
      const exportCount = typeof count === "number" && count >= 0 ? count : 0;
      const newValues = { count: exportCount };
      if (filters && typeof filters === "object" && Object.keys(filters).length > 0) {
        newValues.filters = filters;
      }
      if (Array.isArray(lead_ids) && lead_ids.length > 0) {
        newValues.lead_ids = lead_ids.length === exportCount && exportCount > 0 ? "all" : lead_ids;
      }
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "LEAD_EXPORT",
        entity_type: "leads",
        new_values: newValues,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      log("BOOKING", "Leads export", { user_id: req.userId, count: exportCount });
      res.json({ ok: true });
    } catch (error) {
      logError("BOOKING", "Leads export audit error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Log order export (client calls after generating Excel)
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

  // Update order
  app.put("/api/booking/orders/:orderId", verifyToken, async (req, res) => {
    try {
      const { orderId } = req.params;
      const body = req.body;
      const [oldRows] = await db.execute(
        `SELECT customer_id, cow_number AS cow, hissa_number AS hissa, slot, booking_name, shareholder_name, contact AS phone_number, alt_contact AS alt_phone, address, area, day, order_type AS type, booking_date, total_amount, received_amount AS received, pending_amount AS pending, order_source AS source, reference, closed_by, description FROM orders WHERE order_id = ?`,
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
      const newValues = omitOrderId({ ...rawNew, booking_date: body.booking_date !== undefined ? toDateOnly(body.booking_date) : undefined });

      const updates = [];
      const params = [];
      const fieldMap = {
        customer_id: "customer_id",
        cow: "cow_number",
        hissa: "hissa_number",
        slot: "slot",
        booking_name: "booking_name",
        shareholder_name: "shareholder_name",
        phone_number: "contact",
        alt_phone: "alt_contact",
        address: "address",
        area: "area",
        day: "day",
        type: "order_type",
        booking_date: "booking_date",
        total_amount: "total_amount",
        received: "received_amount",
        pending: "pending_amount",
        source: "order_source",
        reference: "reference",
        closed_by: "closed_by",
        description: "description",
      };
      for (const [clientKey, dbCol] of Object.entries(fieldMap)) {
        if (body[clientKey] !== undefined) {
          updates.push(`\`${dbCol}\` = ?`);
          const value = clientKey === "booking_date"
            ? toDateOnly(body[clientKey])
            : clientKey === "type"
              ? normalizeOrderType(body[clientKey])
              : body[clientKey];
          params.push(value);
        }
      }
      if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });
      params.push(orderId);
      await db.execute(
        `UPDATE orders SET ${updates.join(", ")} WHERE order_id = ?`,
        params
      );
      await writeAuditLog(db, { user_id: req.userId, action: "UPDATE_ORDER", entity_type: "orders", entity_id: orderId, old_values: oldValues, new_values: newValues, ip_address: req.ip, user_agent: req.get("user-agent") });
      log("BOOKING", "Order updated", { user_id: req.userId, orderId });
      res.json({ message: "Order updated", order_id: orderId });
    } catch (error) {
      logError("BOOKING", "Update order error", error);
      await writeAuditLog(db, { user_id: req.userId, action: "UPDATE_ORDER_ERROR", entity_type: "orders", entity_id: req.params.orderId, new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
      res.status(500).json({ message: "Server error" });
    }
  });

  // Cancel order: move to cancelled_orders, delete from orders (and payments)
  app.post("/api/booking/orders/:orderId/cancel", verifyToken, async (req, res) => {
    try {
      const { orderId } = req.params;
      const [rows] = await db.execute(
        "SELECT customer_id, contact, order_type, booking_name, shareholder_name, alt_contact, address, area, day, booking_date, total_amount, order_source, description, reference, closed_by FROM orders WHERE order_id = ?",
        [orderId]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Order not found" });
      const o = rows[0];
      const [idRows] = await db.execute(
        `SELECT COALESCE(
           MAX(
             CAST(
               SUBSTRING_INDEX(
                 SUBSTRING_INDEX(REPLACE(id, '#', ''), '-', 2),
                 '-',
                 -1
               ) AS UNSIGNED
             )
           ),
           0
         ) + 1 AS nextId
         FROM cancelled_orders
         WHERE REPLACE(id, '#', '') LIKE 'C-%'`
      );
      const year = new Date().getFullYear();
      const nextNum = idRows[0]?.nextId ?? 1;
      const cancelId = `C-${String(nextNum).padStart(4, "0")}-${year}`;
      await db.execute(
        `INSERT INTO cancelled_orders (id, customer_id, contact, order_type, booking_name, shareholder_name, alt_contact, address, area, day, booking_date, total_amount, order_source, description, reference, closed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cancelId, o.customer_id, o.contact, o.order_type, o.booking_name, o.shareholder_name, o.alt_contact, o.address, o.area, o.day, o.booking_date, o.total_amount, o.order_source, o.description, o.reference, o.closed_by]
      );
      await db.execute("DELETE FROM payments WHERE order_id = ?", [orderId]);
      await db.execute("DELETE FROM orders WHERE order_id = ?", [orderId]);
      const orderDetail = { order_id: orderId, cancelled_id: cancelId, ...o };
      await writeAuditLog(db, { user_id: req.userId, action: "CANCEL_ORDER", entity_type: "orders", entity_id: orderId, new_values: orderDetail, ip_address: req.ip, user_agent: req.get("user-agent") });
      log("BOOKING", "Order cancelled", { user_id: req.userId, orderId, cancelId });
      res.json({ message: "Order cancelled", cancelled_id: cancelId });
    } catch (error) {
      logError("BOOKING", "Cancel order error", error);
      await writeAuditLog(db, { user_id: req.userId, action: "CANCEL_ORDER_ERROR", entity_type: "orders", entity_id: req.params.orderId, new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
      res.status(500).json({ message: "Server error" });
    }
  });

  // Invoice PDF: THE WARSI FARM style - customer orders only for booking year 2026
  // ─────────────────────────────────────────────────────────────────────────────
  // FIXED INVOICE ROUTE — pixel-matched to CRM_INVOICE_DESIGN.png
  // Drop this in place of the existing app.get("/api/booking/invoice/:customerId")
  // ─────────────────────────────────────────────────────────────────────────────

  app.get("/api/booking/invoice/:customerId", verifyToken, async (req, res) => {
    try {
      const { customerId } = req.params;
      const INVOICE_BOOKING_YEAR = 2026;

      // Fetch orders for this customer only in booking year 2026
      const [orders] = await db.execute(
        `SELECT o.order_id, o.cow_number AS cow, o.hissa_number AS hissa, o.booking_name,
                o.shareholder_name, o.contact, o.alt_contact, o.address, o.area, o.day,
                o.order_type AS type, o.booking_date, o.total_amount,
                o.received_amount, o.pending_amount
        FROM orders o
        WHERE o.customer_id = ?
          AND YEAR(o.booking_date) = ?
        ORDER BY o.booking_date, o.order_id`,
        [customerId, INVOICE_BOOKING_YEAR]
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

      // Invoice number generation
      const firstBookingYear = (() => {
        const d = orders[0].booking_date;
        if (!d) return new Date().getFullYear();
        const yr = new Date(d).getFullYear();
        return isNaN(yr) ? new Date().getFullYear() : yr;
      })();

      const [seqRows] = await db.execute(
        `SELECT COUNT(*) AS cnt FROM audit_logs WHERE action = 'INVOICE_GENERATED'`
      );
      const invoiceSeq = Number(seqRows[0]?.cnt ?? 0) + 1;
      const invoiceNumber = `#I-${String(invoiceSeq).padStart(4, "0")}-${firstBookingYear}`;
      const displayOrderNo = `S-${String(invoiceSeq).padStart(4, "0")}-${firstBookingYear}`;

      const customer = orders[0];
      const bookingDateStr = toDateOnly(customer.booking_date) || "—";
      const issuedDate = toDateOnly(new Date()) || new Date().toISOString().split("T")[0];

      // Grand totals
      let grandTotal = 0, grandReceived = 0, grandPending = 0;
      for (const row of orders) {
        grandTotal    += Number(row.total_amount    || 0);
        grandReceived += Number(row.received_amount || 0);
        grandPending  += Number(row.pending_amount  || 0);
      }

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "INVOICE_GENERATED",
        entity_type: "invoice",
        entity_id: customerId,
        new_values: { customer_id: customerId, invoice_number: invoiceNumber, order_count: orders.length, grand_total: grandTotal, grand_received: grandReceived, grand_pending: grandPending },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      const fmt = (n) => Math.round(Number(n || 0)).toLocaleString("en-PK");

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Invoice-${invoiceNumber.replace("#", "")}-${customerId}.pdf"`);

      const doc = new PDFDocument({ margin: 0, size: "A4", autoFirstPage: true });
      doc.pipe(res);

      // ── Constants ─────────────────────────────────────────────────────────────
      const PW        = doc.page.width;   // 595.28
      const PH        = doc.page.height;  // 841.89
      const ML        = 38;               // margin left
      const MR        = 38;               // margin right
      const CW        = PW - ML - MR;    // content width  ≈ 519.28
      const RIGHT     = ML + CW;

      // Colours — taken from the image
      const C_BG      = "#f5f5f5";   // card / row background
      const C_BORDER  = "#d8d8d8";   // stroke colour
      const C_HEAD_BG = "#f5f5f5";   // table header bg (light grey, bordered)
      const C_HEAD_TX = "#141414";   // table header text
      const C_MUTED   = "#7a7a7a";   // muted / label text
      const C_BODY    = "#222222";   // normal body text
      const C_GREEN   = "#196a43";   // paid / positive
      const C_RED     = "#a63234";   // due / negative
      const C_TITLE   = "#111111";   // section titles
      const C_SUB     = "#535353";   // subtitle / address text

      const truncate = (text, maxW, font = "Helvetica", size = 10) => {
        const str = String(text || "");
        doc.font(font).fontSize(size);
        if (doc.widthOfString(str) <= maxW) return str;
        let out = str;
        while (out.length > 0 && doc.widthOfString(`${out}...`) > maxW) out = out.slice(0, -1);
        return `${out}...`;
      };

      // ── HEADER ────────────────────────────────────────────────────────────────
      // Left: "INVOICE" bold large, "THE WARSI FARM" below
      doc.font("Helvetica-Bold").fontSize(26).fillColor("#151515")
        .text("INVOICE", ML, 45, { lineBreak: false });

      doc.font("Helvetica").fontSize(13).fillColor("#272727")
        .text("THE WARSI FARM", ML, 80, { lineBreak: false });

      // Right: Order number bold top, "ORDER NUMBER" muted directly below — no gap
      doc.font("Helvetica-Bold").fontSize(16).fillColor("#151515")
        .text(displayOrderNo, ML, 45, { width: CW, align: "right", lineBreak: false });

      doc.font("Helvetica").fontSize(9).fillColor(C_MUTED)
        .text("ORDER NUMBER", ML, 66, { width: CW, align: "right", lineBreak: false });

      // Thin separator line under header
      const sepY = 105;
      doc.moveTo(ML, sepY).lineTo(RIGHT, sepY).lineWidth(0.5).strokeColor(C_BORDER).stroke();

      // ── TOP INFO CARDS ────────────────────────────────────────────────────────
      // Three columns: dates card | FROM | TO
      const topY   = 122;
      const cardW  = 148;
      const cardH  = 110;

      // --- Dates card (rounded rect, light grey) ---
      doc.roundedRect(ML, topY, cardW, cardH, 5)
        .fillColor(C_BG).fill();

      doc.font("Helvetica-Bold").fontSize(11).fillColor("#1f1f1f")
        .text("Issue Date:", ML + 14, topY + 16, { lineBreak: false });
      doc.font("Helvetica").fontSize(10.5).fillColor("#575757")
        .text(issuedDate, ML + 14, topY + 34, { lineBreak: false });

      doc.font("Helvetica-Bold").fontSize(11).fillColor("#1f1f1f")
        .text("Booking Date:", ML + 14, topY + 60, { lineBreak: false });
      doc.font("Helvetica").fontSize(10.5).fillColor("#575757")
        .text(bookingDateStr, ML + 14, topY + 78, { lineBreak: false });

      // --- FROM column ---
      const fromX = ML + 174;
      doc.font("Helvetica-Bold").fontSize(11).fillColor(C_TITLE)
        .text("FROM", fromX, topY + 4, { lineBreak: false });

      doc.font("Helvetica-Bold").fontSize(13).fillColor("#111111")
        .text("The Warsi Farm", fromX, topY + 24, { lineBreak: false });

      doc.font("Helvetica").fontSize(10.5).fillColor(C_SUB)
        .text("D-63, Block # H, North", fromX, topY + 46, { lineBreak: false })
        .text("Nazimabad, Karachi", fromX, topY + 62, { lineBreak: false })
        .text("Contact: 0331-9911466", fromX, topY + 80, { lineBreak: false });

      // --- TO column (full text, wraps — no ellipsis) ---
      const toX = ML + 352;
      const customerName = (customer.booking_name || customer.shareholder_name || "Customer Name").trim();
      const customerAddr = String(customer.address || "—");
      const customerContact = String(customer.contact || "—");
      const toColWidth = RIGHT - toX - 8;
      const toWrap = { width: toColWidth, lineGap: 2 };

      doc.font("Helvetica-Bold").fontSize(11).fillColor(C_TITLE)
        .text("TO", toX, topY + 4, { lineBreak: false });

      doc.font("Helvetica-Bold").fontSize(13).fillColor("#111111");
      const toNameH = doc.heightOfString(customerName, toWrap);

      doc.font("Helvetica").fontSize(10.5).fillColor(C_SUB);
      const toAddrH = doc.heightOfString(customerAddr, toWrap);

      const toContactLine = `Customer Contact: ${customerContact}`;
      const toContactH = doc.heightOfString(toContactLine, toWrap);

      const toContentTop = topY + 24;
      const toGapNameAddr = 6;
      const toGapAddrContact = 6;
      const toBlockBottom =
        toContentTop + toNameH + toGapNameAddr + toAddrH + toGapAddrContact + toContactH;

      // ── TABLE HEADER ──────────────────────────────────────────────────────────
      // Matched to image: light bg card with border, bold labels
      let tableY = Math.max(topY + cardH + 28, toBlockBottom + 18);

      let toY = toContentTop;
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#111111");
      doc.text(customerName, toX, toY, toWrap);
      toY += toNameH + toGapNameAddr;

      doc.font("Helvetica").fontSize(10.5).fillColor(C_SUB);
      doc.text(customerAddr, toX, toY, toWrap);
      toY += toAddrH + toGapAddrContact;

      doc.text(toContactLine, toX, toY, toWrap);

      const ROW_H    = 30;  // header row height
      const ITEM_H   = 52;  // data row — order type + shareholder + cow/hissa
      const GAP      = 8;   // gap between rows

      // Column X positions (left-edge of each column text)
      const COL_DESC = ML + 12;
      const COL_QTY  = ML + 214;
      const COL_RATE = ML + 282;
      const COL_PAID = ML + 374;
      const COL_DUE  = ML + 454;

      const drawTableHeader = (y) => {
        doc.roundedRect(ML, y, CW, ROW_H, 4)
          .lineWidth(1).strokeColor(C_BORDER).fillAndStroke(C_BG, C_BORDER);

        doc.font("Helvetica-Bold").fontSize(10.5).fillColor(C_HEAD_TX);
        doc.text("DESCRIPTION", COL_DESC, y + 10, { lineBreak: false });
        doc.text("QUANTITY",    COL_QTY,  y + 10, { lineBreak: false });
        doc.text("RATE",        COL_RATE, y + 10, { lineBreak: false });
        doc.text("PAID",        COL_PAID, y + 10, { lineBreak: false });
        doc.text("DUE",         COL_DUE,  y + 10, { lineBreak: false });
      };

      // Header card
      drawTableHeader(tableY);

      // ── TABLE ROWS ────────────────────────────────────────────────────────────
      let rowY = tableY + ROW_H + GAP;
      const rowsBottomLimit = PH - 48;

      for (const row of orders) {
        // Prevent overflow: continue rows on a fresh page with top margin + header.
        if (rowY + ITEM_H > rowsBottomLimit) {
          doc.addPage({ margin: 0, size: "A4" });
          tableY = 60;
          drawTableHeader(tableY);
          rowY = tableY + ROW_H + GAP;
        }

        // Light grey rounded rect for each row
        doc.roundedRect(ML, rowY, CW, ITEM_H, 4)
          .fillColor(C_BG).fill();

        // Description: invoice-only display labels.
        // Farm animal orders should show simple animal labels only and hide cow/hissa numbers.
        // Booking Goat (Hissa) orders are relabelled by exact package price.
        const normalizedRowType = String(row.type || "").trim();
        const rowTotalAmount = Number(row.total_amount || 0);
        const isFarmAnimalOrder = normalizedRowType === "Fancy Cow" || normalizedRowType === "Cow" || normalizedRowType === "Goat";
        const isGoatHissaOrder = normalizedRowType === "Goat (Hissa)";
        const isSuperGoatHissa = normalizedRowType === "Super Goat (Hissa)" || (isGoatHissaOrder && rowTotalAmount === 51000);
        const isPremiumGoatHissa = normalizedRowType === "Premium Goat (Hissa)" || (isGoatHissaOrder && rowTotalAmount === 59000);
        const isSuperOrPremiumGoatInvoice = isSuperGoatHissa || isPremiumGoatHissa;

        let displayType = normalizedRowType || "Hissa";
        if (normalizedRowType === "Hissa - Standard") {
          displayType = "Hissa - Ijtimai";
        } else if (normalizedRowType === "Fancy Cow" || normalizedRowType === "Cow") {
          displayType = "Cow";
        } else if (normalizedRowType === "Goat") {
          displayType = "Goat";
        } else if (isSuperGoatHissa) {
          displayType = "Super Goat (Hissa)";
        } else if (isPremiumGoatHissa) {
          displayType = "Premium Goat (Hissa)";
        }

        const itemTitle = truncate(`${displayType}${isFarmAnimalOrder ? "" : ` (${row.day || "1"})`}`, 190, "Helvetica-Bold", 11);
        const shareholderLine = truncate(
          `${row.shareholder_name || "—"}`,
          190,
          "Helvetica",
          10
        );
        const itemSub = isFarmAnimalOrder
          ? ""
          : isSuperOrPremiumGoatInvoice
            ? `Goat Number: ${row.cow || "—"}`
            : isGoatHissaOrder
              ? `Goat Number: ${row.cow || "—"}`
              : `Cow: ${row.cow || "—"} | Hissa: ${row.hissa || "—"}`;

        if (isFarmAnimalOrder) {
          // Farm invoice rows show only the animal label, vertically centred in the gray row.
          doc.font("Helvetica-Bold").fontSize(11).fillColor("#1a1a1a")
            .text(itemTitle, COL_DESC, rowY + 19, { lineBreak: false });
        } else {
          doc.font("Helvetica-Bold").fontSize(11).fillColor("#1a1a1a")
            .text(itemTitle, COL_DESC, rowY + 7, { lineBreak: false });
          doc.font("Helvetica").fontSize(10).fillColor("#4a4a4a")
            .text(shareholderLine, COL_DESC, rowY + 22, { lineBreak: false });
          if (itemSub) {
            doc.font("Helvetica").fontSize(9.5).fillColor("#5f5f5f")
              .text(itemSub, COL_DESC, rowY + 36, { lineBreak: false });
          }
        }

        // Quantity — vertically centred in row with description block
        const qtyY = rowY + 19;
        doc.font("Helvetica").fontSize(11).fillColor(C_BODY)
          .text("1", COL_QTY + 20, qtyY, { width: 20, align: "center", lineBreak: false });

        // Rate
        doc.font("Helvetica").fontSize(11).fillColor(C_BODY)
          .text(`PKR ${fmt(row.total_amount)}`, COL_RATE - 4, qtyY, { width: 90, lineBreak: false });

        // Paid (green)
        doc.font("Helvetica-Bold").fontSize(11).fillColor(C_GREEN)
          .text(`PKR ${fmt(row.received_amount)}`, COL_PAID - 4, qtyY, { width: 80, lineBreak: false });

        // Due (red)
        doc.font("Helvetica-Bold").fontSize(11).fillColor(C_RED)
          .text(`PKR ${fmt(row.pending_amount)}`, COL_DUE - 4, qtyY, { width: 80, lineBreak: false });

        rowY += ITEM_H + GAP;
      }

      // ── NOTE + TOTALS SECTION ─────────────────────────────────────────────────
      const noteText = "All items are exclusive of tax.Terms & Conditions apply. Please refer to the following page for full details.";
      doc.font("Helvetica").fontSize(9.5);
      const noteBodyHeight = doc.heightOfString(noteText, { width: 300, lineGap: 2.5, align: "justify" });
      doc.font("Helvetica").fontSize(8);
      const signatureText = "* This is an auto generated invoice and does not need a signature.";
      const signatureHeight = doc.heightOfString(signatureText, { width: CW, align: "center" });
      const PAY_H = 72;

      const payTopGapFromContent = 20;
      const signatureTopGap = 8;
      const bottomPadding = 24;
      const payReservedHeight = PAY_H + signatureTopGap + signatureHeight + bottomPadding;

      // Approximate NOTE + TOTALS block footprint before payment section.
      const noteTotalsHeight = Math.max(18 + noteBodyHeight, 152);

      // If footer area won't fit here, move NOTE/TOTALS/PAYMENT to a clean new page.
      let noteY = rowY + 8;
      const footerFits = (noteY + noteTotalsHeight + payTopGapFromContent + payReservedHeight) <= PH;
      if (!footerFits) {
        doc.addPage({ margin: 0, size: "A4" });
        noteY = 60;
      }

      // NOTE label
      doc.font("Helvetica-Bold").fontSize(12).fillColor(C_TITLE)
        .text("NOTE:", ML, noteY, { lineBreak: false });

      // Note body text (left side, capped at ~305pt wide)
      doc.font("Helvetica").fontSize(9.5).fillColor("#4f4f4f")
        .text(noteText, ML, noteY + 18, { width: 300, lineGap: 2.5, align: "justify" });

      // ── RIGHT-SIDE TOTALS ─────────────────────────────────────────────────────
      const sumLabel = ML + 355;
      const sumRight = RIGHT;
      let sy = noteY + 6;

      const drawTotalRow = (label, value, lColor = C_TITLE, vColor = C_TITLE, bold = true) => {
        const f = bold ? "Helvetica-Bold" : "Helvetica";
        doc.font(f).fontSize(11).fillColor(lColor)
          .text(label, sumLabel, sy, { width: 75, align: "left", lineBreak: false });
        doc.font(f).fontSize(11).fillColor(vColor)
          .text(value, sumLabel, sy, { width: sumRight - sumLabel, align: "right", lineBreak: false });
        sy += 22;
      };

      drawTotalRow("SUBTOTAL",    `PKR ${fmt(grandTotal)}`);
      drawTotalRow("SHIPPING",    "FREE", C_TITLE, C_MUTED, false);
      drawTotalRow("TOTAL",       `PKR ${fmt(grandTotal)}`);
      drawTotalRow("PAID", `PKR ${fmt(grandReceived)}`, C_TITLE, C_GREEN);

      // "AMOUNT DUE" label — right aligned, no separator line, no wrapping
      sy += 6;
      doc.font("Helvetica-Bold").fontSize(11).fillColor(C_TITLE)
        .text("AMOUNT DUE", RIGHT - 160, sy, { width: 160, align: "right", lineBreak: false });
      sy += 22;

      // Big red PKR value — right aligned, guaranteed no wrap
      doc.font("Helvetica-Bold").fontSize(22).fillColor(C_RED)
        .text(`PKR ${fmt(grandPending)}`, RIGHT - 160, sy, { width: 160, align: "right", lineBreak: false });

      // ── PAYMENT INFORMATION STRIP ─────────────────────────────────────────────

      // Place payment strip below content on same page where possible.
      const noteBodyBottomY = noteY + 18 + noteBodyHeight;
      const totalsBottomY = sy + 30;
      const contentBottomY = Math.max(noteBodyBottomY, totalsBottomY);

      const bottomAlignedPayY = PH - (PAY_H + signatureTopGap + signatureHeight + bottomPadding);
      const minPayY = contentBottomY + payTopGapFromContent;
      let PAY_Y = bottomAlignedPayY;

      // Keep payment strip bottom-aligned on first page when possible.
      // If content is too long to allow that, move this section to next page.
      if (minPayY > bottomAlignedPayY) {
        doc.addPage({ margin: 0, size: "A4" });
        PAY_Y = 60;
      }

      doc.roundedRect(ML, PAY_Y, CW, PAY_H, 4)
        .lineWidth(1).strokeColor(C_BORDER).fillAndStroke("#ffffff", C_BORDER);

      // Centre heading
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#1d1d1d")
        .text("PAYMENT INFORMATION", ML, PAY_Y + 11, { width: CW, align: "center", lineBreak: false });

      // Four columns for bank info
      const P1 = ML + 14;
      const P2 = ML + 152;
      const P3 = ML + 284;
      const P4 = ML + 438;
      const VY = PAY_Y + 33;   // label row
      const NY = PAY_Y + 51;   // value row

      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#222222");
      doc.text("ACCOUNT NAME (Meezan)", P1, VY, { width: 130, lineBreak: false });
      doc.text("BRANCH",               P2, VY, { width: 120, lineBreak: false });
      doc.text("IBAN",                 P3, VY, { width: 145, lineBreak: false });
      doc.text("ACCOUNT NO",           P4, VY, { width: 80,  lineBreak: false });

      doc.font("Helvetica").fontSize(8).fillColor("#4a4a4a");
      doc.text("THE WARSI FARM",           P1, NY, { width: 130, lineBreak: false });
      doc.text("FB AREA BLOCK 12 BRANCH",  P2, NY, { width: 120, lineBreak: false });
      doc.text("PK03MEZN0010180114502823", P3, NY, { width: 145, lineBreak: false });
      doc.text("10180114502823",           P4, NY, { width: 80,  lineBreak: false });

      // Auto-generated invoice notice (centered beneath payment section)
      doc.font("Helvetica").fontSize(8).fillColor("#4a4a4a")
        .text(signatureText, ML, PAY_Y + PAY_H + signatureTopGap, {
          width: CW,
          align: "center",
          lineBreak: false
        });

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
};