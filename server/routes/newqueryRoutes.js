import { log, logError } from "../utils/logger.js";
import { writeAuditLog } from "../utils/auditLog.js";

/**
 * New Query API: Save leads from the newquery page into the database.
 * @param {object} app - Express app
 * @param {object} db - MySQL connection
 * @param {Function} verifyToken - auth middleware
 */
export const registerNewQueryRoutes = (app, db, verifyToken) => {

  // ---------- Generate Customer ID based on Contact ----------
  const generateCustomerId = async (contact) => {
    try {
      if (!contact || String(contact).trim().length < 3) {
        throw new Error("Contact number is required (minimum 3 characters)");
      }
      const contactStr = String(contact).trim();

      // Check existing orders for this contact
      const [orderRows] = await db.execute(
        "SELECT customer_id FROM orders WHERE contact = ? LIMIT 1",
        [contactStr]
      );

      if (orderRows.length > 0 && orderRows[0].customer_id) {
        log("BOOKING", "Customer ID found in orders", { contact: contactStr, customer_id: orderRows[0].customer_id });
        return orderRows[0].customer_id;
      }

      // Check cancelled orders for this contact
      const [cancelledRows] = await db.execute(
        "SELECT customer_id FROM cancelled_orders WHERE contact = ? LIMIT 1",
        [contactStr]
      );

      if (cancelledRows.length > 0 && cancelledRows[0].customer_id) {
        log("BOOKING", "Customer ID found in cancelled orders", { contact: contactStr, customer_id: cancelledRows[0].customer_id });
        return cancelledRows[0].customer_id;
      }

      // Generate new customer ID: TWF-XXXX-Q format
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

      log("BOOKING", "Customer ID generated", { contact: contactStr, customer_id: customerId });
      return customerId;
    } catch (error) {
      logError("BOOKING", "Generate customer ID error", error);
      throw new Error("Unable to generate Customer ID");
    }
  };

  // ---------- Generate Lead ID (same pattern as order_id: L-0001-2026) ----------
  const generateLeadId = async () => {
    try {
      const year = 2026;
      // Support both L-0001-2026 and #L-0001-2026
      const [rows] = await db.execute(
        `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(TRIM(LEADING '#' FROM lead_id), '-', 2), '-', -1) AS UNSIGNED)), 0) AS nextId 
         FROM leads 
         WHERE (lead_id LIKE 'L-%' OR lead_id LIKE '#L-%') 
         AND lead_id LIKE ?`,
        [`%-${year}`]
      );
      const nextNum = Number(rows[0]?.nextId || 0) + 1;
      const leadId = `L-${String(nextNum).padStart(4, "0")}-${year}`;
      return leadId;
    } catch (err) {
      logError("LEAD", "Generate Lead ID error", err);
      throw new Error("Unable to generate Lead ID");
    }
  };

  // ---------- POST generate-lead-id (for frontend, like generate-order-id) ----------
  app.post("/api/leads/generate-lead-id", verifyToken, async (req, res) => {
    try {
      const lead_id = await generateLeadId();
      log("LEAD", "Lead ID generated", { user_id: req.userId, lead_id });
      return res.json({ lead_id });
    } catch (err) {
      logError("LEAD", "Generate lead ID error", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ---------- Save new lead ----------
  app.post("/api/leads", verifyToken, async (req, res) => {
    try {
      const {
        contact,
        order_type,
        booking_name,
        shareholder_name,
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
      } = req.body;

      const contactStr = contact != null ? String(contact).trim() : "";
      const bookingNameStr = booking_name != null ? String(booking_name).trim() : "";
      const bookingDateStr = booking_date != null ? String(booking_date).trim() : "";

      if (!contactStr || contactStr.length < 3) {
        return res.status(400).json({ message: "Contact is required (minimum 3 characters)" });
      }
      if (!bookingNameStr) {
        return res.status(400).json({ message: "Booking name is required" });
      }
      if (!bookingDateStr) {
        return res.status(400).json({ message: "Booking date is required" });
      }
      if (!(closed_by != null && String(closed_by).trim())) {
        return res.status(400).json({ message: "Query By is required" });
      }
      const customer_id = await generateCustomerId(contactStr);

      const lead_id = await generateLeadId();

      await db.execute(
        `INSERT INTO leads 
         (lead_id, customer_id, contact, order_type, booking_name, shareholder_name, alt_contact, address, area, day, booking_date, total_amount, order_source, reference, closed_by, description) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lead_id,
          customer_id,
          contactStr,
          (order_type != null && String(order_type).trim()) || null,
          bookingNameStr,
          (shareholder_name != null && String(shareholder_name).trim()) || null,
          (alt_contact != null && String(alt_contact).trim()) || null,
          (address != null && String(address).trim()) || null,
          (area != null && String(area).trim()) || null,
          (day != null && String(day).trim()) || null,
          bookingDateStr,
          Number.isFinite(Number(total_amount)) && Number(total_amount) >= 0 ? Number(total_amount) : 0,
          (order_source != null && String(order_source).trim()) || null,
          (reference != null && String(reference).trim()) || null,
          String(closed_by).trim(),
          (description != null && String(description).trim()) || null,
        ]
      );

      // Log the action (Audit)
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "CREATE_LEAD",
        entity_type: "leads",
        entity_id: lead_id,
        new_values: req.body,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      log("LEAD", "New lead created", { lead_id });
      res.status(201).json({ message: "Lead created successfully", lead_id });
    } catch (error) {
      logError("LEAD", "Create lead error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ---------- Get all leads ----------
  app.get("/api/leads", verifyToken, async (req, res) => {
    try {
      const pageRaw = req.query.page;
      const limitRaw = req.query.limit;
      const search = req.query.search ? String(req.query.search).trim().toLowerCase() : "";

      const shouldPaginate =
        pageRaw != null || limitRaw != null || search !== "";

      if (!shouldPaginate) {
        const [leads] = await db.execute(`SELECT * FROM leads ORDER BY created_at DESC`);
        return res.json(leads);
      }

      const page = Number.isFinite(Number(pageRaw)) && Number(pageRaw) > 0 ? Number(pageRaw) : 1;
      const limit = Number.isFinite(Number(limitRaw)) && Number(limitRaw) > 0 ? Number(limitRaw) : 50;
      const offset = (page - 1) * limit;

      const like = `%${search}%`;

      const whereSql = search
        ? `WHERE (
            LOWER(TRIM(COALESCE(contact, '')))        LIKE ?
            OR LOWER(TRIM(COALESCE(booking_name, ''))) LIKE ?
            OR LOWER(TRIM(COALESCE(shareholder_name, ''))) LIKE ?
            OR LOWER(TRIM(COALESCE(alt_contact, ''))) LIKE ?
            OR LOWER(TRIM(COALESCE(address, '')))      LIKE ?
            OR LOWER(TRIM(COALESCE(area, '')))         LIKE ?
            OR LOWER(TRIM(COALESCE(day, '')))           LIKE ?
            OR LOWER(TRIM(COALESCE(reference, '')))    LIKE ?
            OR LOWER(TRIM(COALESCE(closed_by, '')))     LIKE ?
            OR LOWER(TRIM(COALESCE(description, '')))  LIKE ?
          )`
        : "";

      // total
      const [countRows] = await db.execute(
        `SELECT COUNT(*) AS total FROM leads ${whereSql}`,
        search ? [like, like, like, like, like, like, like, like, like, like] : []
      );
      const total = Number(countRows[0]?.total || 0);

      const [leads] = await db.execute(
        `SELECT *
         FROM leads
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        search ? [...([like, like, like, like, like, like, like, like, like, like]), limit, offset] : [limit, offset]
      );

      return res.json({ leads, total, page, limit });
    } catch (error) {
      logError("LEAD", "List leads error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ---------- Get lead by ID ----------
  app.get("/api/leads/:id", verifyToken, async (req, res) => {
    try {
      const [lead] = await db.execute("SELECT * FROM leads WHERE lead_id = ?", [req.params.id]);
      if (lead.length === 0) return res.status(404).json({ message: "Lead not found" });
      res.json(lead[0]);
    } catch (error) {
      logError("LEAD", "Get lead error", error);
      res.status(500).json({ message: "Server error" });
    }
  });
};