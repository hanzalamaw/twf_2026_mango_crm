import crypto from "crypto";
import { log, logError } from "../utils/logger.js";
import { writeAuditLog } from "../utils/auditLog.js";

const ALLOWED_STATUSES = ["Pending", "Rider Assigned", "Dispatched", "Delivered", "Returned to Farm"];
const REGENERATE_ALLOWED_EMAIL = "hanzalamawahab@gmail.com";
const OPERATIONS_YEAR = 2026;
const ALLOWED_ORDER_TYPE_SQL =
  "'hissa - standard', 'hissa standard', 'hissa premium', 'hissa - premium', 'hissa - waqf', 'hissa waqf', " +
  "'hissa - exclusive', 'hissa exclusive', " +
  "'super goat(hissa)', 'super goat (hissa)', 'premium goat(hissa)', 'premium goat (hissa)', " +
  "'exclusive goat(hissa)', 'exclusive goat (hissa)', " +
  "'goat(hissa)', 'goat (hissa)', 'goat hissa'";
const allowedOrderType = (alias = "o") => `LOWER(TRIM(COALESCE(${alias}.order_type, ''))) IN (${ALLOWED_ORDER_TYPE_SQL})`;
const nonWaqfOrder = allowedOrderType;

function emitOperationsChanged(io, event, payload = {}) {
  if (!io) return;
  io.to("operations").emit("operations:changed", { event, ...payload, at: new Date().toISOString() });
  io.to("operations").emit(event, { ...payload, at: new Date().toISOString() });
}


// ── DB migration (run once on startup or via migration script) ───────────────
// ALTER TABLE challan ADD COLUMN IF NOT EXISTS batch_id INT NULL AFTER challan_id;
// ALTER TABLE challan DROP COLUMN IF EXISTS delivery_status;
// ALTER TABLE challan DROP COLUMN IF EXISTS rider_id; -- rider assignment now lives only in orders.rider_id
// CREATE TABLE IF NOT EXISTS challan_batch (
//   batch_id INT AUTO_INCREMENT PRIMARY KEY,
//   label VARCHAR(255) NOT NULL,
//   created_at DATETIME NOT NULL DEFAULT NOW()
// );

function normalizeAddr(a) {
  if (a == null) return "";
  return String(a).trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeSlot(s) {
  if (s == null || s === "") return "_none_";
  return String(s).trim();
}

function normalizeDay(d) {
  if (d == null || d === "") return "_none_";
  return String(d).trim();
}

function normalizeDayLabel(d) {
  const n = String(d || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (n === "day 1" || n === "day1" || n === "1") return "Day 1";
  if (n === "day 2" || n === "day2" || n === "2") return "Day 2";
  if (n === "day 3" || n === "day3" || n === "3") return "Day 3";
  return String(d || "").trim();
}

const ALLOWED_OPERATION_DAYS = ["Day 1", "Day 2", "Day 3"];

async function inferActiveOperationsDay(db) {
  try {
    const [[orderRow]] = await db.execute(
      `SELECT o.day, COUNT(*) AS c
       FROM orders o
       WHERE o.booking_date IS NOT NULL AND YEAR(o.booking_date) = ?
         AND DATE(o.booking_date) = CURDATE()
         AND TRIM(COALESCE(o.day, '')) != ''
       GROUP BY o.day
       ORDER BY c DESC
       LIMIT 1`,
      [OPERATIONS_YEAR]
    );
    if (orderRow?.day) return normalizeDayLabel(orderRow.day);
  } catch { /* ignore */ }

  try {
    const [[batchRow]] = await db.execute(
      `SELECT COALESCE(NULLIF(TRIM(cb.day), ''),
              (SELECT MIN(c.day) FROM challan c
               WHERE c.batch_id = cb.batch_id AND TRIM(COALESCE(c.day, '')) != '')) AS day
       FROM challan_batch cb
       ORDER BY cb.created_at DESC, cb.batch_id DESC
       LIMIT 1`
    );
    if (batchRow?.day) return normalizeDayLabel(batchRow.day);
  } catch { /* ignore */ }

  return "Day 1";
}

function classifyHissa(orderType) {
  const t = String(orderType || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (t === "super goat(hissa)" || t === "super goat (hissa)") return "super_goat";
  if (t === "premium goat(hissa)" || t === "premium goat (hissa)") return "premium_goat";
  if (t === "exclusive goat(hissa)" || t === "exclusive goat (hissa)") return "exclusive_goat";
  if (t === "goat(hissa)" || t === "goat (hissa)") return "super_goat";
  if (t === "hissa - waqf" || t === "hissa waqf") return "waqf";
  if (t === "hissa premium" || t === "hissa - premium") return "premium";
  if (t === "hissa - standard" || t === "hissa standard") return "standard";
  if (t === "hissa - exclusive" || t === "hissa exclusive") return "exclusive";
  return "ignore";
}

const OPS_TYPE_KEY_SQL = `
  CASE
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissapremium') THEN 'premium'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissastandard') THEN 'standard'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissawaqf') THEN 'waqf'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissaexclusive') THEN 'exclusive'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('exclusivegoathissa') THEN 'exclusive_goat'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('supergoathissa') THEN 'super_goat'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('premiumgoathissa') THEN 'premium_goat'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('goathissa') THEN 'super_goat'
    ELSE NULL
  END
`;

const ORDER_TYPE_DB_VARIANTS = {
  standard: ["hissa - standard", "hissa standard"],
  premium: ["hissa - premium", "hissa premium"],
  waqf: ["hissa - waqf", "hissa waqf"],
  exclusive: ["hissa - exclusive", "hissa exclusive"],
  super_goat: ["super goat (hissa)", "super goat(hissa)", "goat (hissa)", "goat(hissa)", "goat hissa"],
  premium_goat: ["premium goat (hissa)", "premium goat(hissa)"],
  exclusive_goat: ["exclusive goat (hissa)", "exclusive goat(hissa)"],
};

function parseQueryList(val) {
  if (Array.isArray(val)) return val.map((s) => String(s).trim()).filter(Boolean);
  if (val != null && String(val).trim() !== "") {
    return String(val).split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function filterKeyFromOrderType(raw) {
  const t = String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (t === "hissa - standard" || t === "hissa standard") return "standard";
  if (t === "hissa premium" || t === "hissa - premium") return "premium";
  if (t === "hissa - waqf" || t === "hissa waqf") return "waqf";
  if (t === "hissa - exclusive" || t === "hissa exclusive") return "exclusive";
  if (t === "super goat(hissa)" || t === "super goat (hissa)") return "super_goat";
  if (t === "premium goat(hissa)" || t === "premium goat (hissa)") return "premium_goat";
  if (t === "exclusive goat(hissa)" || t === "exclusive goat (hissa)") return "exclusive_goat";
  if (t === "goat(hissa)" || t === "goat (hissa)" || t === "goat hissa") return "super_goat";
  return null;
}

function buildOrderTypeFilterSql(selectedKeys, alias = "o") {
  if (!selectedKeys.length) return { sql: allowedOrderType(alias), params: [] };
  const parts = [];
  const params = [];
  for (const key of selectedKeys) {
    const variants = ORDER_TYPE_DB_VARIANTS[key];
    if (!variants) continue;
    for (const v of variants) {
      parts.push(`LOWER(TRIM(COALESCE(${alias}.order_type, ''))) = ?`);
      params.push(v);
    }
  }
  if (!parts.length) return { sql: allowedOrderType(alias), params: [] };
  return { sql: `(${parts.join(" OR ")})`, params };
}

function dayLabelToNumber(day) {
  const n = String(day || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (n === "day 1" || n === "day1" || n === "1") return 1;
  if (n === "day 2" || n === "day2" || n === "2") return 2;
  if (n === "day 3" || n === "day3" || n === "3") return 3;
  return null;
}

const LINE_COW_MULTIPLIER = 7;

const GSEP = "\x1F";

function groupKeyForOrder(row) {
  // Non-waqf: day + slot + address (same address, different slot → separate challans).
  // Waqf: customer (or address fallback) + day only — same customer splits per day; slots on that day share one waqf challan.
  const dayPart = normalizeDay(row.day);
  const slotPart = normalizeSlot(row.slot);
  const addrPart = normalizeAddr(row.address);
  if (classifyHissa(row.order_type) === "waqf") {
    const customerId = String(row.customer_id || "").trim().toLowerCase();
    return `waqf${GSEP}${customerId || addrPart}${GSEP}${dayPart}`;
  }
  return `${dayPart}${GSEP}${slotPart}${GSEP}${addrPart}`;
}

function uniqueRiderIdsFromOrders(orders = []) {
  return [...new Set(orders
    .map((o) => o.rider_id)
    .filter((v) => v !== null && v !== undefined && v !== "")
    .map(Number))];
}

async function resolveSingleRiderFromOrders(db, orders = []) {
  const riderIds = uniqueRiderIdsFromOrders(orders);
  if (riderIds.length !== 1) return { rider: null, rider_id: null, rider_count: riderIds.length };
  const [rs] = await db.execute(`SELECT rider_id, rider_name, contact, vehicle, number_plate FROM riders WHERE rider_id = ?`, [riderIds[0]]);
  return { rider: rs[0] || null, rider_id: riderIds[0], rider_count: 1 };
}

function formatRiderAuditValue(riderId, rider) {
  if (riderId === null || riderId === undefined || riderId === "") return "—";
  if (!rider) return String(riderId);
  return [
    `ID ${riderId}`,
    rider.rider_name,
    rider.contact,
    rider.vehicle,
    rider.number_plate,
  ].filter((v) => v !== null && v !== undefined && String(v).trim() !== "").join(" | ");
}

async function fetchRiderById(db, riderId) {
  if (riderId === null || riderId === undefined || riderId === "") return null;
  const [rows] = await db.execute(
    `SELECT rider_id, rider_name, contact, vehicle, number_plate FROM riders WHERE rider_id = ?`,
    [Number(riderId)]
  );
  return rows[0] || null;
}

/** Human-readable supervisor for audit_logs JSON (avoid raw supervisor_id only). */
async function supervisorLabelForAudit(db, supervisorId) {
  if (supervisorId == null || supervisorId === "") return "—";
  const sid = Number(supervisorId);
  if (!Number.isFinite(sid) || sid <= 0) return "—";
  const [rows] = await db.execute(
    `SELECT supervisor_name, supervisor_code FROM rider_supervisors WHERE supervisor_id = ?`,
    [sid]
  );
  if (!rows.length) return `Unknown supervisor (id ${sid})`;
  const name = rows[0].supervisor_name != null ? String(rows[0].supervisor_name).trim() : "";
  if (name) return name;
  const code = rows[0].supervisor_code != null ? String(rows[0].supervisor_code).trim() : "";
  if (code) return code;
  return `Supervisor #${sid}`;
}

async function resolveChallanRiderAuditState(db, challanId) {
  const [rows] = await db.execute(
    `SELECT DISTINCT o.rider_id, r.rider_name, r.contact, r.vehicle, r.number_plate
     FROM orders o
     INNER JOIN challan_orders co ON co.order_id = o.order_id
     LEFT JOIN riders r ON r.rider_id = o.rider_id
     WHERE co.challan_id = ? AND o.rider_id IS NOT NULL AND ${nonWaqfOrder('o')}
     ORDER BY o.rider_id`,
    [challanId]
  );

  if (rows.length === 0) return { rider_id: null, rider_label: "—" };

  if (rows.length === 1) {
    const r = rows[0];
    return { rider_id: Number(r.rider_id), rider_label: formatRiderAuditValue(r.rider_id, r) };
  }

  return {
    rider_id: rows.map((r) => Number(r.rider_id)).join(", "),
    rider_label: rows.map((r) => formatRiderAuditValue(r.rider_id, r)).join("; "),
  };
}


async function fetchRoleOpsFlags(db, userId) {
  const [rows] = await db.execute(
    `SELECT r.operation_management, r.operation_general_dashboard, r.operation_customer_support,
            r.operation_rider_management, r.operation_rider_management_supervisor,
            r.operation_deliveries_management, r.operation_challan_management, r.operation_affluent_management
     FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?`,
    [userId]
  );
  return rows[0] || null;
}

async function getSupervisorRecordForUser(db, userId) {
  const [rows] = await db.execute(
    `SELECT supervisor_id, supervisor_code, supervisor_name, phone, user_id, created_at
     FROM rider_supervisors WHERE user_id = ?`,
    [userId]
  );
  return rows[0] || null;
}

/** Full supervisor row + login identity for audit_logs (old/new snapshots). */
async function fetchSupervisorAuditSnapshot(db, supervisorId) {
  const sid = Number(supervisorId);
  if (!Number.isFinite(sid) || sid <= 0) return null;
  const [rows] = await db.execute(
    `SELECT s.supervisor_id, s.supervisor_code, s.supervisor_name, s.phone, s.user_id,
            u.username AS login_username, u.email AS login_email
     FROM rider_supervisors s
     INNER JOIN users u ON u.user_id = s.user_id
     WHERE s.supervisor_id = ?`,
    [sid]
  );
  if (!rows.length) return null;
  const r = rows[0];
  const code = r.supervisor_code != null ? String(r.supervisor_code).trim() : "";
  const name = r.supervisor_name != null ? String(r.supervisor_name).trim() : "";
  return {
    supervisor_id: r.supervisor_id,
    supervisor_code: code,
    supervisor_name: name,
    phone: r.phone,
    user_id: r.user_id,
    login_username: r.login_username,
    login_email: r.login_email,
    label: code && name ? `${code} — ${name}` : (name || code || `Supervisor #${r.supervisor_id}`),
  };
}

/** If user only has rider-supervisor ops access, challan must include an order rider under that supervisor. */
async function assertChallanVisibleToScopedSupervisor(db, userId, flags, challanId) {
  const broad =
    flags.operation_deliveries_management ||
    flags.operation_challan_management ||
    flags.operation_customer_support;
  if (broad) return true;
  if (!flags.operation_rider_management_supervisor) return false;
  const sup = await getSupervisorRecordForUser(db, userId);
  if (!sup) return false;
  const [rows] = await db.execute(
    `SELECT 1 AS ok FROM orders o
     INNER JOIN challan_orders co ON co.order_id = o.order_id
     INNER JOIN riders r ON r.rider_id = o.rider_id
     WHERE co.challan_id = ? AND r.supervisor_id = ? AND ${nonWaqfOrder("o")}
     LIMIT 1`,
    [challanId, sup.supervisor_id]
  );
  return rows.length > 0;
}

async function nextSupervisorCode(db) {
  const [rows] = await db.execute(
    `SELECT supervisor_code FROM rider_supervisors ORDER BY supervisor_id DESC LIMIT 1`
  );
  let n = 1;
  if (rows.length && rows[0].supervisor_code) {
    const m = String(rows[0].supervisor_code).match(/(\d+)$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return `SUP-${String(n).padStart(4, "0")}`;
}

/** One row per order (hissa line); updated when challan bulk status → Dispatched / Delivered. */
async function applyRiderDeliveryTimingForChallan(db, challanId, deliveryStatus) {
  if (deliveryStatus !== "Dispatched" && deliveryStatus !== "Delivered") return;
  const cid = Number(challanId);
  if (!Number.isFinite(cid) || cid <= 0) return;
  const [orderRows] = await db.execute(
    `SELECT o.order_id, o.rider_id
     FROM orders o
     INNER JOIN challan_orders co ON co.order_id = o.order_id
     WHERE co.challan_id = ? AND o.rider_id IS NOT NULL AND ${nonWaqfOrder("o")}`,
    [cid]
  );
  for (const row of orderRows) {
    const orderId = row.order_id != null ? String(row.order_id).trim() : "";
    const riderId = Number(row.rider_id);
    if (!orderId || !Number.isFinite(riderId) || riderId <= 0) continue;
    if (deliveryStatus === "Dispatched") {
      await db.execute(
        `INSERT INTO rider_delivery_timing (order_id, rider_id, challan_id, dispatched_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           rider_id = VALUES(rider_id),
           challan_id = VALUES(challan_id),
           dispatched_at = NOW()`,
        [orderId, riderId, cid]
      );
    } else if (deliveryStatus === "Delivered") {
      await db.execute(
        `INSERT INTO rider_delivery_timing (order_id, rider_id, challan_id, delivered_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           rider_id = VALUES(rider_id),
           challan_id = VALUES(challan_id),
           delivered_at = NOW()`,
        [orderId, riderId, cid]
      );
    }
  }
}

async function buildDeliveriesGroupsForBatch(db, batchId, dayFilter, supervisorId = null) {
  let challanSql = `SELECT c.challan_id, c.qr_token, c.booking_name, c.address, c.area,
                c.description, c.slot, c.day, c.challan_date,
                c.total_hissa, c.total_premium_hissa, c.total_standard_hissa, c.total_waqf_hissa,
                c.total_super_goat_hissa, c.total_premium_goat_hissa, c.total_goat_hissa,
                cb.label AS batch_label
         FROM challan c
         LEFT JOIN challan_batch cb ON cb.batch_id = c.batch_id
         WHERE c.batch_id = ? AND COALESCE(c.total_hissa, 0) > 0`;
  const challanParams = [batchId];

  if (dayFilter) {
    challanSql += ` AND LOWER(TRIM(COALESCE(c.day, ''))) = LOWER(TRIM(?))`;
    challanParams.push(dayFilter);
  }
  challanSql += ` ORDER BY c.day, c.slot, c.address, c.challan_id`;

  let [challans] = await db.execute(challanSql, challanParams);

  if (supervisorId != null) {
    const [allowedRows] = await db.execute(
      `SELECT DISTINCT c.challan_id FROM challan c
       INNER JOIN challan_orders co ON co.challan_id = c.challan_id
       INNER JOIN orders o ON o.order_id = co.order_id
       INNER JOIN riders r ON r.rider_id = o.rider_id
       WHERE c.batch_id = ? AND r.supervisor_id = ? AND ${nonWaqfOrder("o")}`,
      [batchId, supervisorId]
    );
    const allowed = new Set(allowedRows.map((x) => x.challan_id));
    challans = challans.filter((c) => allowed.has(c.challan_id));
  }

  if (challans.length === 0) return { groups: [], batch_id: batchId };

  const challanIds = challans.map((c) => c.challan_id);
  const placeholders = challanIds.map(() => "?").join(",");

  const [orderRows] = await db.execute(
    `SELECT co.challan_id,
            o.order_id, o.customer_id, o.booking_name, o.shareholder_name,
            o.contact, o.alt_contact, o.address, o.area, o.day, o.slot,
            o.order_type, o.cow_number, o.hissa_number, o.description,
            o.delivery_status, o.rider_id
     FROM challan_orders co
     INNER JOIN orders o ON o.order_id = co.order_id
     WHERE co.challan_id IN (${placeholders}) AND ${nonWaqfOrder("o")}
     ORDER BY co.challan_id, o.order_id`,
    challanIds
  );

  const ordersByChallan = new Map();
  for (const o of orderRows) {
    if (!ordersByChallan.has(o.challan_id)) ordersByChallan.set(o.challan_id, []);
    ordersByChallan.get(o.challan_id).push(o);
  }

  const groups = challans.map((c) => {
    const orders = ordersByChallan.get(c.challan_id) || [];

    const shareholderNames = [...new Set(orders.map((x) => x.shareholder_name).filter(Boolean))];
    const bookingNames = [...new Set(orders.map((x) => x.booking_name).filter(Boolean))];
    const customerIds = [...new Set(orders.map((x) => x.customer_id).filter(Boolean))];
    const contacts = [...new Set(orders.map((x) => x.contact).filter(Boolean))];
    const altContacts = [...new Set(orders.map((x) => x.alt_contact).filter(Boolean))];
    const slots = [...new Set(orders.map((x) => String(x.slot || "").trim()).filter(Boolean))].sort();
    const riderIds = uniqueRiderIdsFromOrders(orders);
    const groupRiderId = riderIds.length === 1 ? riderIds[0] : null;

    const statuses = orders.map((o) => o.delivery_status || "Pending");
    const allDelivered = statuses.length > 0 && statuses.every((s) => s === "Delivered");
    const anyReturned = statuses.some((s) => s === "Returned to Farm");
    const anyDispatched = statuses.some((s) => s === "Dispatched");
    const anyRiderAssigned = statuses.some((s) => s === "Rider Assigned");
    let derivedStatus = "Pending";
    if (allDelivered) derivedStatus = "Delivered";
    else if (anyReturned) derivedStatus = "Returned to Farm";
    else if (anyDispatched) derivedStatus = "Dispatched";
    else if (anyRiderAssigned) derivedStatus = "Rider Assigned";

    let superGoat = Number(c.total_super_goat_hissa ?? 0);
    let premiumGoat = Number(c.total_premium_goat_hissa ?? 0);
    const legacyGoat = Number(c.total_goat_hissa ?? 0);
    if (superGoat === 0 && premiumGoat === 0 && legacyGoat > 0) superGoat = legacyGoat;
    const goatSum = superGoat + premiumGoat;

    return {
      group_key: `${c.challan_id}`,
      challan_id: c.challan_id,
      qr_token: c.qr_token,
      rider_id: groupRiderId,
      rider_count: riderIds.length,
      day: c.day,
      slots,
      slot: c.slot,
      address: c.address,
      area: c.area,
      description: c.description,
      batch_label: c.batch_label,
      hissa_count: Number(c.total_hissa || 0),
      standard_hissa_count: Number(c.total_standard_hissa || 0),
      premium_hissa_count: Number(c.total_premium_hissa || 0),
      waqf_hissa_count: Number(c.total_waqf_hissa || 0),
      super_goat_hissa_count: superGoat,
      premium_goat_hissa_count: premiumGoat,
      goat_hissa_count: goatSum,
      customer_ids: customerIds,
      booking_names: bookingNames,
      contacts,
      alt_contacts: altContacts,
      shareholder_names: shareholderNames,
      derived_status: derivedStatus,
      orders,
      challan: {
        challan_id: c.challan_id,
        qr_token: c.qr_token,
        rider_id: groupRiderId,
        rider_count: riderIds.length,
        address: c.address,
        area: c.area,
        day: c.day,
        slot: c.slot,
        derived_status: derivedStatus,
      },
    };
  });

  return { groups, batch_id: batchId };
}

function requireOperationParent(req, res, flags) {
  const ok =
    !!flags?.operation_management ||
    !!flags?.operation_rider_management ||
    !!flags?.operation_rider_management_supervisor;
  if (!ok) {
    res.status(403).json({ message: "Operations access denied" });
    return false;
  }
  return true;
}

async function resolveLatestBatchId(db) {
  const [rows] = await db.execute(
    `SELECT batch_id FROM challan_batch ORDER BY created_at DESC, batch_id DESC LIMIT 1`
  );
  return rows[0]?.batch_id ?? null;
}

async function resolveLatestBatchIdForDay(db, day) {
  const dayLabel = normalizeDayLabel(day);
  if (!dayLabel) return resolveLatestBatchId(db);
  const [rows] = await db.execute(
    `SELECT cb.batch_id
     FROM challan_batch cb
     WHERE LOWER(TRIM(COALESCE(cb.day, ''))) = LOWER(TRIM(?))
        OR cb.batch_id IN (
          SELECT DISTINCT c.batch_id FROM challan c
          WHERE c.batch_id IS NOT NULL
            AND LOWER(TRIM(COALESCE(c.day, ''))) = LOWER(TRIM(?))
        )
     ORDER BY cb.created_at DESC, cb.batch_id DESC
     LIMIT 1`,
    [dayLabel, dayLabel]
  );
  return rows[0]?.batch_id ?? null;
}

/**
 * @param {object} app
 * @param {import("mysql2/promise").Pool} db
 * @param {Function} verifyToken
 */
export const registerOperationsRoutes = (app, db, verifyToken, io = null) => {
  const assertSub = async (req, res, checker) => {
    const flags = await fetchRoleOpsFlags(db, req.userId);
    if (!requireOperationParent(req, res, flags)) return null;
    if (!checker(flags)) {
      res.status(403).json({ message: "Insufficient operations permission" });
      return null;
    }
    return flags;
  };

  // ── Active operations day (calendar / today's orders) ───────
  app.get("/api/operations/active-day", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) =>
        f.operation_challan_management ||
        f.operation_deliveries_management ||
        f.operation_affluent_management ||
        f.operation_special_request_management ||
        f.operation_customer_support ||
        f.operation_rider_management_supervisor
      );
      if (!flags) return;
      const day = await inferActiveOperationsDay(db);
      res.json({ day });
    } catch (error) {
      logError("OPERATIONS", "Active day error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Batches list ────────────────────────────────────────────
  app.get("/api/operations/batches", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) =>
        f.operation_challan_management ||
        f.operation_deliveries_management ||
        f.operation_affluent_management ||
        f.operation_special_request_management ||
        f.operation_customer_support ||
        f.operation_rider_management_supervisor
      );
      if (!flags) return;
      const filterDay = normalizeDayLabel(req.query.day);
      const [rows] = await db.execute(
        `SELECT cb.batch_id, cb.label, cb.created_at,
                COALESCE(NULLIF(TRIM(cb.day), ''),
                  (SELECT MIN(c.day) FROM challan c
                   WHERE c.batch_id = cb.batch_id AND TRIM(COALESCE(c.day, '')) != '')) AS day
         FROM challan_batch cb
         ORDER BY cb.created_at DESC, cb.batch_id DESC`
      );
      const batches = rows.map((r) => ({
        ...r,
        day: normalizeDayLabel(r.day) || r.day || null,
      }));
      const filtered = filterDay && ALLOWED_OPERATION_DAYS.includes(filterDay)
        ? batches.filter((b) => normalizeDayLabel(b.day) === filterDay)
        : batches;
      res.json({ batches: filtered });
    } catch (error) {
      logError("OPERATIONS", "List batches error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // --- Riders ---
  app.get("/api/operations/riders", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) =>
        f.operation_rider_management || f.operation_deliveries_management || f.operation_challan_management
      );
      if (!flags) return;
      const [riders] = await db.execute(
        `SELECT rider_id, rider_name, contact, vehicle, number_plate, availability, status FROM riders WHERE status = 'active' OR status IS NULL ORDER BY rider_name`
      );
      res.json(riders);
    } catch (error) {
      logError("OPERATIONS", "List riders error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/operations/riders", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;
      const { rider_name, contact, vehicle, cnic, number_plate, amount_per_delivery } = req.body;
      if (!rider_name || typeof rider_name !== "string") {
        return res.status(400).json({ message: "rider_name is required" });
      }
      const amount = amount_per_delivery == null || amount_per_delivery === "" ? 0 : Number(amount_per_delivery);
      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ message: "amount_per_delivery must be a valid non-negative number" });
      }
      const [result] = await db.execute(
        `INSERT INTO riders (rider_name, contact, vehicle, cnic, number_plate, amount_per_delivery, total_paid, availability, status)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'Available', 'active')`,
        [rider_name.trim(), contact || null, vehicle || null, cnic || null, number_plate || null, amount]
      );
      log("OPERATIONS", "Rider created", { rider_id: result.insertId });
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "RIDER_CREATE",
        entity_type: "rider",
        entity_id: String(result.insertId),
        new_values: {
          rider_name: rider_name.trim(),
          contact: contact || null,
          vehicle: vehicle || null,
          cnic: cnic || null,
          number_plate: number_plate || null,
          amount_per_delivery: amount,
          total_paid: 0,
          availability: "Available",
          status: "active",
        },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      emitOperationsChanged(io, "riders:changed", { action: "created", rider_id: result.insertId });
      res.status(201).json({ rider_id: result.insertId });
    } catch (error) {
      logError("OPERATIONS", "Create rider error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Challan list (Challan Management page) ──────────────────
  // Returns aggregated contact/customer data from linked orders
  app.get("/api/operations/challans", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_challan_management || f.operation_deliveries_management);
      if (!flags) return;

      let batchId = req.query.batch_id ? Number(req.query.batch_id) : null;
      if (!batchId) batchId = await resolveLatestBatchId(db);
      if (!batchId) return res.json({ challans: [] });

      const [rows] = await db.execute(
        `SELECT c.*,
                cb.label AS batch_label, cb.created_at AS batch_created_at,
                (SELECT CASE WHEN COUNT(DISTINCT o0.rider_id) = 1 THEN MAX(o0.rider_id) ELSE NULL END
                 FROM challan_orders co0 INNER JOIN orders o0 ON o0.order_id = co0.order_id
                 WHERE co0.challan_id = c.challan_id AND o0.rider_id IS NOT NULL AND ${nonWaqfOrder('o0')}) AS rider_id,
                (SELECT COUNT(DISTINCT o0b.rider_id)
                 FROM challan_orders co0b INNER JOIN orders o0b ON o0b.order_id = co0b.order_id
                 WHERE co0b.challan_id = c.challan_id AND o0b.rider_id IS NOT NULL AND ${nonWaqfOrder('o0b')}) AS rider_count,
                (SELECT COUNT(*) FROM challan_orders co INNER JOIN orders ox ON ox.order_id = co.order_id WHERE co.challan_id = c.challan_id AND ${nonWaqfOrder('ox')}) AS order_count,
                -- Aggregated from linked orders
                (SELECT GROUP_CONCAT(DISTINCT NULLIF(TRIM(o.shareholder_name), '') ORDER BY o.order_id SEPARATOR ', ')
                 FROM challan_orders co2 INNER JOIN orders o ON o.order_id = co2.order_id WHERE co2.challan_id = c.challan_id) AS shareholders_csv,
                (SELECT GROUP_CONCAT(DISTINCT NULLIF(TRIM(o.contact), '') ORDER BY o.order_id SEPARATOR ', ')
                 FROM challan_orders co3 INNER JOIN orders o ON o.order_id = co3.order_id WHERE co3.challan_id = c.challan_id) AS contacts_csv,
                (SELECT GROUP_CONCAT(DISTINCT NULLIF(TRIM(o.alt_contact), '') ORDER BY o.order_id SEPARATOR ', ')
                 FROM challan_orders co4 INNER JOIN orders o ON o.order_id = co4.order_id WHERE co4.challan_id = c.challan_id AND NULLIF(TRIM(o.alt_contact), '') IS NOT NULL) AS alt_contacts_csv,
                (SELECT GROUP_CONCAT(DISTINCT NULLIF(TRIM(o.customer_id), '') ORDER BY o.order_id SEPARATOR ', ')
                 FROM challan_orders co5 INNER JOIN orders o ON o.order_id = co5.order_id WHERE co5.challan_id = c.challan_id AND NULLIF(TRIM(o.customer_id), '') IS NOT NULL) AS customer_ids_csv,
                (SELECT GROUP_CONCAT(DISTINCT NULLIF(TRIM(o.order_type), '') ORDER BY o.order_id SEPARATOR ', ')
                 FROM challan_orders co8 INNER JOIN orders o ON o.order_id = co8.order_id WHERE co8.challan_id = c.challan_id AND ${nonWaqfOrder('o')}) AS order_types_csv,
                -- Delivery progress from linked orders
                (SELECT COUNT(*) FROM challan_orders co6
                 INNER JOIN orders o2 ON o2.order_id = co6.order_id
                 WHERE co6.challan_id = c.challan_id AND o2.delivery_status = 'Delivered') AS orders_delivered,
                (SELECT COUNT(*) FROM challan_orders co7
                 INNER JOIN orders o3 ON o3.order_id = co7.order_id
                 WHERE co7.challan_id = c.challan_id) AS orders_total
         FROM challan c
         LEFT JOIN challan_batch cb ON cb.batch_id = c.batch_id
         WHERE c.batch_id = ? AND COALESCE(c.total_hissa, 0) > 0
         ORDER BY c.day, c.slot, c.challan_id`,
        [batchId]
      );
      res.json({ challans: rows, batch_id: batchId });
    } catch (error) {
      logError("OPERATIONS", "List challans error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Challan detail by QR token ──────────────────────────────
  app.get("/api/operations/challans/by-token/:token", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(
        req,
        res,
        (f) =>
          f.operation_deliveries_management ||
          f.operation_challan_management ||
          f.operation_customer_support ||
          f.operation_rider_management_supervisor
      );
      if (!flags) return;
      const token = String(req.params.token || "").trim();
      if (!token) return res.status(400).json({ message: "Invalid token" });
      const [ch] = await db.execute(
        `SELECT c.*, cb.label AS batch_label FROM challan c
         LEFT JOIN challan_batch cb ON cb.batch_id = c.batch_id
         WHERE c.qr_token = ?`,
        [token]
      );
      if (ch.length === 0) return res.status(404).json({ message: "Challan not found" });
      const challan = ch[0];
      const visible = await assertChallanVisibleToScopedSupervisor(db, req.userId, flags, challan.challan_id);
      if (!visible) return res.status(403).json({ message: "Insufficient permission" });
      const [orderRows] = await db.execute(
        `SELECT o.order_id, o.booking_name, o.shareholder_name, o.contact, o.alt_contact,
                o.address, o.area, o.day, o.slot, o.order_type, o.cow_number, o.hissa_number,
                o.description, o.delivery_status, o.rider_id, o.customer_id
         FROM orders o
         INNER JOIN challan_orders co ON co.order_id = o.order_id
         WHERE co.challan_id = ? AND ${nonWaqfOrder('o')}
         ORDER BY o.order_id`,
        [challan.challan_id]
      );
      const riderInfo = await resolveSingleRiderFromOrders(db, orderRows);
      const rider = riderInfo.rider;
      const statuses = orderRows.map((o) => o.delivery_status || "Pending");
      const allDelivered = statuses.length > 0 && statuses.every((s) => s === "Delivered");
      const anyReturned  = statuses.some((s) => s === "Returned to Farm");
      const anyDispatched = statuses.some((s) => s === "Dispatched");
      const anyRiderAssigned = statuses.some((s) => s === "Rider Assigned");
      let derivedStatus = "Pending";
      if (allDelivered) derivedStatus = "Delivered";
      else if (anyReturned) derivedStatus = "Returned to Farm";
      else if (anyDispatched) derivedStatus = "Dispatched";
      else if (anyRiderAssigned) derivedStatus = "Rider Assigned";

      res.json({ challan: { ...challan, rider_id: riderInfo.rider_id, rider_count: riderInfo.rider_count, derived_status: derivedStatus }, orders: orderRows, rider });
    } catch (error) {
      logError("OPERATIONS", "Challan by token error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Bulk detail for PDF ─────────────────────────────────────
  app.post("/api/operations/challans/bulk-detail", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_challan_management);
      if (!flags) return;
      const raw = req.body.challan_ids;
      let ids = [];
      if (Array.isArray(raw) && raw.length > 0) {
        ids = [...new Set(raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
      } else if (req.body.batch_id) {
        const batchId = Number(req.body.batch_id);
        if (!Number.isFinite(batchId) || batchId <= 0) {
          return res.status(400).json({ message: "Invalid batch_id" });
        }
        const [batchRows] = await db.execute(
          `SELECT challan_id FROM challan WHERE batch_id = ? AND COALESCE(total_hissa, 0) > 0 ORDER BY day, slot, challan_id`,
          [batchId]
        );
        ids = batchRows.map((r) => r.challan_id);
      } else {
        return res.status(400).json({ message: "challan_ids array or batch_id required" });
      }
      if (ids.length === 0) return res.status(400).json({ message: "No valid challan ids" });
      const placeholders = ids.map(() => "?").join(",");
      const [challans] = await db.execute(
        `SELECT c.* FROM challan c
         WHERE c.challan_id IN (${placeholders})`,
        ids
      );
      const byId = new Map(challans.map((c) => [c.challan_id, c]));
      const items = [];
      for (const id of ids) {
        const c = byId.get(id);
        if (!c) continue;
        const [orderRows] = await db.execute(
          `SELECT 
            o.order_id,
            o.customer_id,
            o.booking_name,
            o.shareholder_name,
            o.contact,
            o.alt_contact,
            o.order_type,
            o.cow_number,
            o.hissa_number,
            o.slot,
            o.description,
            o.delivery_status,
            o.rider_id
           FROM orders o
           INNER JOIN challan_orders co ON co.order_id = o.order_id
           WHERE co.challan_id = ? AND ${nonWaqfOrder('o')}
           ORDER BY o.order_id`,
          [id]
        );
        const riderInfo = await resolveSingleRiderFromOrders(db, orderRows);
        items.push({ challan: { ...c, rider_id: riderInfo.rider_id, rider_count: riderInfo.rider_count }, orders: orderRows, rider: riderInfo.rider });
      }
      await writeAuditLog(db, {
        user_id: req.userId, action: "CHALLAN_BULK_DETAIL",
        entity_type: "challan", entity_id: "*",
        new_values: { challan_ids: ids, returned: items.length },
        ip_address: req.ip, user_agent: req.get("user-agent")
      });
      res.json({ items });
    } catch (error) {
      logError("OPERATIONS", "Challan bulk detail error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Status update — patches all linked orders ────────────────
  app.patch("/api/operations/challans/:id/status", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_deliveries_management || f.operation_challan_management);
      if (!flags) return;
      const { delivery_status } = req.body;
      if (!ALLOWED_STATUSES.includes(delivery_status)) {
        return res.status(400).json({ message: "Invalid status", allowed: ALLOWED_STATUSES });
      }
      const id = req.params.id;
      const [ex] = await db.execute(`SELECT challan_id FROM challan WHERE challan_id = ?`, [id]);
      if (ex.length === 0) return res.status(404).json({ message: "Challan not found" });
      await db.execute(
        `UPDATE orders o
         INNER JOIN challan_orders co ON co.order_id = o.order_id
         SET o.delivery_status = ?
         WHERE co.challan_id = ?`,
        [delivery_status, id]
      );
      try {
        await applyRiderDeliveryTimingForChallan(db, id, delivery_status);
      } catch (timingErr) {
        logError("OPERATIONS", "rider_delivery_timing (challan status)", timingErr);
      }
      await writeAuditLog(db, {
        user_id: req.userId, action: "CHALLAN_STATUS_UPDATE",
        entity_type: "challan", entity_id: String(id),
        new_values: { delivery_status },
        ip_address: req.ip, user_agent: req.get("user-agent")
      });
      emitOperationsChanged(io, "challans:changed", { action: "status", challan_id: Number(id), delivery_status });
      res.json({ message: "Updated" });
    } catch (error) {
      logError("OPERATIONS", "Challan status error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Rider assignment on a challan: orders.rider_id is the only source of truth ───────────────────────────
  app.patch("/api/operations/challans/:id/rider", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_deliveries_management || f.operation_challan_management);
      if (!flags) return;
      const riderId = req.body.rider_id;
      const id = req.params.id;
      const [ex] = await db.execute(`SELECT challan_id FROM challan WHERE challan_id = ?`, [id]);
      if (ex.length === 0) return res.status(404).json({ message: "Challan not found" });

      const oldRiderState = await resolveChallanRiderAuditState(db, id);

      const nextRiderId = riderId === null || riderId === "" || riderId === undefined ? null : Number(riderId);
      let nextRider = null;
      if (nextRiderId !== null) {
        if (!Number.isFinite(nextRiderId) || nextRiderId <= 0) return res.status(400).json({ message: "Invalid rider id" });
        nextRider = await fetchRiderById(db, nextRiderId);
        if (!nextRider) return res.status(400).json({ message: "Rider not found" });
      }

      await db.execute(
        `UPDATE orders o
         INNER JOIN challan_orders co ON co.order_id = o.order_id
         SET o.rider_id = ?
         WHERE co.challan_id = ? AND ${nonWaqfOrder('o')}`,
        [nextRiderId, id]
      );

      if (nextRiderId !== null) {
        await db.execute(
          `UPDATE orders o
           INNER JOIN challan_orders co ON co.order_id = o.order_id
           SET o.delivery_status = 'Rider Assigned'
           WHERE co.challan_id = ? AND o.delivery_status = 'Pending' AND ${nonWaqfOrder('o')}`,
          [id]
        );
      }

      const newRiderLabel = formatRiderAuditValue(nextRiderId, nextRider);

      await writeAuditLog(db, {
        user_id: req.userId, action: "CHALLAN_RIDER_UPDATE",
        entity_type: "challan", entity_id: String(id),
        old_values: { rider_id: oldRiderState.rider_label },
        new_values: { rider_id: newRiderLabel },
        ip_address: req.ip, user_agent: req.get("user-agent")
      });
      emitOperationsChanged(io, "challans:changed", {
        action: "rider",
        challan_id: Number(id),
        old_rider_id: oldRiderState.rider_id,
        old_rider_label: oldRiderState.rider_label,
        rider_id: nextRiderId,
        rider_label: newRiderLabel,
      });
      res.json({ message: "Rider updated" });
    } catch (error) {
      logError("OPERATIONS", "Challan rider error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Regenerate challans (creates a new batch, never deletes old) ─
  app.post("/api/operations/challans/regenerate-from-orders", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_challan_management);
      if (!flags) return;
      const [users] = await db.execute(`SELECT email FROM users WHERE user_id = ?`, [req.userId]);
      const email = (users[0]?.email || "").trim().toLowerCase();
      if (email !== REGENERATE_ALLOWED_EMAIL) {
        return res.status(403).json({ message: "Only the designated operations lead can regenerate challan data." });
      }

      const genDay = normalizeDayLabel(req.body?.day);
      if (!genDay || !ALLOWED_OPERATION_DAYS.includes(genDay)) {
        return res.status(400).json({ message: "day is required (Day 1, Day 2, or Day 3)" });
      }

      const [orders] = await db.execute(
        `SELECT order_id, order_type, booking_name, shareholder_name, cow_number, hissa_number, contact, alt_contact,
                address, area, day, slot, description, customer_id
         FROM orders
         WHERE booking_date IS NOT NULL AND YEAR(booking_date) = ?
           AND LOWER(TRIM(COALESCE(day, ''))) = LOWER(TRIM(?))
           AND ${nonWaqfOrder('orders')}`,
        [OPERATIONS_YEAR, genDay]
      );

      const grouped = new Map();
      let skippedNoAddress = 0;
      for (const o of orders) {
        if (classifyHissa(o.order_type) === "ignore") continue;
        if (o.address == null || String(o.address).trim() === "") { skippedNoAddress++; continue; }
        const k = groupKeyForOrder(o);
        if (!grouped.has(k)) grouped.set(k, []);
        grouped.get(k).push(o);
      }

      const [[{ cnt }]] = await db.execute(`SELECT COUNT(*) AS cnt FROM challan_batch`);
      const batchLabel = `Batch ${Number(cnt) + 1} (${genDay}, ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })})`;

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        const [batchResult] = await conn.execute(
          `INSERT INTO challan_batch (label, day, created_at) VALUES (?, ?, NOW())`,
          [batchLabel, genDay]
        );
        const batchId = batchResult.insertId;

        const today = new Date();
        const m = String(today.getMonth() + 1).padStart(2, "0");
        const d = String(today.getDate()).padStart(2, "0");
        const challanDate = `${OPERATIONS_YEAR}-${m}-${d}`;

        let created = 0;
        for (const [, list] of grouped.entries()) {
          const first = list[0];
          const qrToken = crypto.randomBytes(24).toString("hex");
          let tp = 0, ts = 0, tw = 0, te = 0, tsg = 0, tpg = 0, teg = 0;
          for (const row of list) {
            const c = classifyHissa(row.order_type);
            if (c === "premium") tp++;
            else if (c === "standard") ts++;
            else if (c === "waqf") tw++;
            else if (c === "exclusive") te++;
            else if (c === "super_goat") tsg++;
            else if (c === "premium_goat") tpg++;
            else if (c === "exclusive_goat") teg++;
          }
          const tg = tsg + tpg + teg;
          const totalHissa = tp + ts + tw + te + tg;
          const bookingNames = [...new Set(list.map((x) => x.booking_name).filter(Boolean))];
          const descParts = [...new Set(list.map((x) => x.description).filter(Boolean))];
          const allSlots = [...new Set(list.map((x) => String(x.slot || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

          const [ins] = await conn.execute(
            `INSERT INTO challan (
               batch_id, qr_token, booking_name, address, area, description, slot, day,
               total_premium_hissa, total_standard_hissa, total_waqf_hissa,
               total_super_goat_hissa, total_premium_goat_hissa, total_goat_hissa, total_hissa,
               challan_date
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              batchId, qrToken,
              bookingNames.join(", ") || null,
              normalizeAddr(first.address),
              first.area || null,
              descParts.join("\n") || null,
              allSlots.length ? allSlots.join(", ") : null,
              normalizeDay(first.day) === "_none_" ? null : first.day,
              tp, ts, tw, tsg, tpg, tg, totalHissa, challanDate
            ]
          );
          const challanId = ins.insertId;
          for (const row of list) {
            await conn.execute(`INSERT INTO challan_orders (challan_id, order_id) VALUES (?, ?)`, [challanId, row.order_id]);
          }
          created++;
        }

        await conn.commit();
        log("OPERATIONS", "Challan regenerate", { by: req.userId, batch_id: batchId, groups: created, skippedNoAddress });
        await writeAuditLog(db, {
          user_id: req.userId, action: "CHALLAN_REGENERATE",
          entity_type: "challan", entity_id: "*",
          new_values: { batch_id: batchId, batch_label: batchLabel, groups: created, skippedNoAddress },
          ip_address: req.ip, user_agent: req.get("user-agent")
        });
        emitOperationsChanged(io, "challans:changed", { action: "regenerated", batch_id: batchId, batch_label: batchLabel, groups: created });
        res.json({ message: "Challan data regenerated", groups: created, skipped_no_address: skippedNoAddress, batch_id: batchId, batch_label: batchLabel });
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    } catch (error) {
      logError("OPERATIONS", "Regenerate challan error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Deliveries groups — reads from challan table ─────────────
  app.get("/api/operations/deliveries/groups", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_deliveries_management || f.operation_challan_management || f.operation_customer_support);
      if (!flags) return;

      let batchId = req.query.batch_id ? Number(req.query.batch_id) : null;
      if (!batchId) batchId = await resolveLatestBatchId(db);
      if (!batchId) return res.json({ groups: [] });

      const dayFilter = req.query.day ? String(req.query.day).trim() : null;
      const payload = await buildDeliveriesGroupsForBatch(db, batchId, dayFilter, null);
      res.json(payload);
    } catch (error) {
      logError("OPERATIONS", "Deliveries groups error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Rider supervisor: same shape as deliveries/groups, filtered by supervisor's riders ──
  app.get("/api/operations/supervisor/deliveries/groups", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management_supervisor);
      if (!flags) return;
      const sup = await getSupervisorRecordForUser(db, req.userId);
      if (!sup) return res.status(404).json({ message: "Supervisor profile not found" });

      const dayFilter = req.query.day ? normalizeDayLabel(req.query.day) : null;
      let batchId = req.query.batch_id ? Number(req.query.batch_id) : null;
      if (!batchId) {
        batchId = dayFilter
          ? await resolveLatestBatchIdForDay(db, dayFilter)
          : await resolveLatestBatchId(db);
      }
      if (!batchId) return res.json({ groups: [] });

      const payload = await buildDeliveriesGroupsForBatch(db, batchId, dayFilter, sup.supervisor_id);
      res.json(payload);
    } catch (error) {
      logError("OPERATIONS", "Supervisor deliveries groups error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Customer Support: now served by deliveries/groups ────────
  // Kept for backward compat; redirects to groups logic
  app.get("/api/operations/customer-support/orders", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_customer_support || f.operation_management);
      if (!flags) return;

      let batchId = req.query.batch_id ? Number(req.query.batch_id) : null;
      if (!batchId) batchId = await resolveLatestBatchId(db);
      if (!batchId) return res.json({ orders: [] });

      const { day, status, rider_id, area, order_type, search } = req.query;

      const conditions = ["co.challan_id IS NOT NULL", "c.batch_id = ?", nonWaqfOrder("o")];
      const params = [batchId];

      if (day) { conditions.push("LOWER(TRIM(COALESCE(o.day, ''))) = LOWER(TRIM(?))"); params.push(String(day).trim()); }
      if (status) { conditions.push("o.delivery_status = ?"); params.push(String(status).trim()); }
      if (rider_id) { conditions.push("o.rider_id = ?"); params.push(Number(rider_id)); }
      if (area) { conditions.push("TRIM(COALESCE(o.area, '')) = ?"); params.push(String(area).trim()); }
      if (order_type) { conditions.push("o.order_type = ?"); params.push(String(order_type).trim()); }
      if (search) {
        const q = `%${String(search).trim()}%`;
        conditions.push("(o.booking_name LIKE ? OR o.shareholder_name LIKE ? OR o.contact LIKE ? OR o.alt_contact LIKE ? OR o.address LIKE ? OR o.cow_number LIKE ?)");
        params.push(q, q, q, q, q, q);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [orders] = await db.execute(
        `SELECT DISTINCT
           o.order_id, o.booking_name, o.shareholder_name,
           o.contact, o.alt_contact,
           o.address, o.area,
           o.day, o.slot,
           o.order_type, o.cow_number, o.hissa_number, o.description,
           o.rider_id, o.delivery_status,
           c.challan_id, c.qr_token AS challan_token
         FROM orders o
         INNER JOIN challan_orders co ON co.order_id = o.order_id
         INNER JOIN challan c ON c.challan_id = co.challan_id
         ${where}
         ORDER BY o.day, o.slot, o.address, o.order_id`,
        params
      );

      res.json({ orders, batch_id: batchId });
    } catch (error) {
      logError("OPERATIONS", "Customer support orders error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── General Dashboard stats ─────────────────────────────────
  app.get("/api/operations/dashboard/stats", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_general_dashboard || f.operation_management);
      if (!flags) return;

      const { day } = req.query;
      const areaList = parseQueryList(req.query.area);
      const slotList = parseQueryList(req.query.slot);
      const orderTypeKeys = parseQueryList(req.query.order_type)
        .map((v) => filterKeyFromOrderType(v) || v)
        .filter((k) => ORDER_TYPE_DB_VARIANTS[k]);
      const deliveryStatuses = parseQueryList(req.query.delivery_status);
      const statusFilter = deliveryStatuses.length
        ? deliveryStatuses.filter((s) => ALLOWED_STATUSES.includes(s))
        : ["Delivered"];

      const baseConditions = [];
      const baseParams = [];
      baseConditions.push("o.booking_date IS NOT NULL");
      baseConditions.push("YEAR(o.booking_date) = ?");
      baseParams.push(OPERATIONS_YEAR);
      const typeFilter = buildOrderTypeFilterSql(orderTypeKeys, "o");
      baseConditions.push(typeFilter.sql);
      baseParams.push(...typeFilter.params);
      if (day) {
        baseConditions.push("LOWER(TRIM(COALESCE(o.day, ''))) = LOWER(TRIM(?))");
        baseParams.push(String(day).trim());
      }
      if (areaList.length) {
        baseConditions.push(`TRIM(COALESCE(o.area, '')) IN (${areaList.map(() => "?").join(", ")})`);
        baseParams.push(...areaList);
      }
      if (slotList.length) {
        baseConditions.push(`TRIM(COALESCE(o.slot, '')) IN (${slotList.map(() => "?").join(", ")})`);
        baseParams.push(...slotList);
      }
      const where = baseConditions.length ? `WHERE ${baseConditions.join(" AND ")}` : "";

      const [[summary]] = await db.execute(
        `SELECT COUNT(*) AS total_hissas,
                SUM(o.delivery_status = 'Delivered') AS delivered,
                SUM(o.delivery_status = 'Dispatched') AS in_transit,
                SUM(o.delivery_status = 'Pending') AS pending,
                SUM(o.delivery_status = 'Returned to Farm') AS returned,
                SUM(o.delivery_status = 'Rider Assigned') AS rider_assigned,
                SUM(o.rider_id IS NULL) AS unassigned
         FROM orders o ${where}`,
        baseParams
      );
      const [[riderCounts]] = await db.execute(
        `SELECT SUM(availability IN ('Available', 'On Delivery')) AS active_riders FROM riders WHERE status = 'active' OR status IS NULL`
      );
      const [areas] = await db.execute(
        `SELECT COALESCE(NULLIF(TRIM(o.area), ''), 'Unknown') AS area,
                COUNT(*) AS total, SUM(o.delivery_status = 'Delivered') AS delivered,
                SUM(o.delivery_status = 'Pending') AS pending,
                SUM(o.delivery_status = 'Dispatched') AS in_transit,
                SUM(o.delivery_status = 'Returned to Farm') AS returned
         FROM orders o ${where} GROUP BY area ORDER BY area`,
        baseParams
      );
      const riderWhere = baseConditions.length ? `AND ${baseConditions.join(" AND ")}` : "";
      const [riderSummary] = await db.execute(
        `SELECT r.rider_id, r.rider_name,
                COALESCE(NULLIF(TRIM(r.availability), ''), 'Available') AS availability,
                SUM(o.delivery_status = 'Delivered') AS delivered,
                SUM(o.delivery_status IN ('Pending', 'Rider Assigned', 'Dispatched')) AS pending
         FROM riders r
         LEFT JOIN orders o ON o.rider_id = r.rider_id ${riderWhere}
         WHERE r.status = 'active' OR r.status IS NULL
         GROUP BY r.rider_id, r.rider_name, r.availability ORDER BY r.rider_name`,
        [...baseParams]
      );

      const listWhere = [
        "booking_date IS NOT NULL",
        "YEAR(booking_date) = ?",
        allowedOrderType("orders"),
        "TRIM(COALESCE(area, '')) != ''",
      ];
      const listParams = [OPERATIONS_YEAR];
      const [areaRows] = await db.execute(
        `SELECT DISTINCT TRIM(area) AS area FROM orders orders
         WHERE ${listWhere.join(" AND ")} ORDER BY area`,
        listParams
      );
      const [slotRows] = await db.execute(
        `SELECT DISTINCT TRIM(slot) AS slot FROM orders orders
         WHERE booking_date IS NOT NULL AND YEAR(booking_date) = ? AND ${allowedOrderType("orders")}
           AND TRIM(COALESCE(slot, '')) != '' ORDER BY slot`,
        [OPERATIONS_YEAR]
      );

      const slaughterDay = dayLabelToNumber(day);
      let slaughter = { cows_slaughtered: 0, goats_slaughtered: 0 };
      if (slaughterDay) {
        const [[slRow]] = await db.execute(
          `SELECT
             SUM(animal_type IN ('premium_cow','standard_cow','waqf_cow','exclusive_cow')) AS cows_slaughtered,
             SUM(animal_type IN ('premium_goat','super_goat')) AS goats_slaughtered
           FROM slaughter_records WHERE day = ?`,
          [slaughterDay]
        );
        slaughter = {
          cows_slaughtered: Number(slRow?.cows_slaughtered || 0),
          goats_slaughtered: Number(slRow?.goats_slaughtered || 0),
        };
      }

      let packing = { hissa_packed: 0, goats_packed: 0 };
      if (slaughterDay) {
        const [packRows] = await db.execute(
          `SELECT animal_type, COUNT(*) AS cnt FROM line_records WHERE day = ? GROUP BY animal_type`,
          [slaughterDay]
        );
        for (const row of packRows || []) {
          const cnt = Number(row.cnt || 0);
          if (["premium_cow", "standard_cow", "waqf_cow", "exclusive_cow"].includes(row.animal_type)) {
            packing.hissa_packed += cnt * LINE_COW_MULTIPLIER;
          } else if (["premium_goat", "super_goat"].includes(row.animal_type)) {
            packing.goats_packed += cnt;
          }
        }
      }

      const [deliveriesBySlot] = await db.execute(
        `SELECT COALESCE(NULLIF(TRIM(o.slot), ''), 'Unassigned') AS slot,
                COUNT(*) AS total,
                SUM(o.delivery_status = 'Delivered') AS delivered,
                SUM(o.delivery_status = 'Pending') AS pending,
                SUM(o.delivery_status = 'Dispatched') AS in_transit,
                SUM(o.delivery_status = 'Returned to Farm') AS returned,
                SUM(o.delivery_status = 'Rider Assigned') AS rider_assigned
         FROM orders o ${where}
         GROUP BY slot ORDER BY slot`,
        baseParams
      );

      const targetConditions = [...baseConditions];
      const targetParams = [...baseParams];
      targetConditions.push(`o.delivery_status IN (${statusFilter.map(() => "?").join(", ")})`);
      targetParams.push(...statusFilter);
      const targetWhere = targetConditions.length ? `WHERE ${targetConditions.join(" AND ")}` : "";
      const [targetRows] = await db.execute(
        `SELECT ${OPS_TYPE_KEY_SQL} AS typeKey, COUNT(*) AS cnt
         FROM orders o ${targetWhere}
         GROUP BY typeKey`,
        targetParams
      );
      const typeMap = { premium: 0, standard: 0, waqf: 0, exclusive: 0, super_goat: 0, premium_goat: 0, exclusive_goat: 0 };
      for (const row of targetRows || []) {
        if (row.typeKey && typeMap[row.typeKey] !== undefined) typeMap[row.typeKey] = Number(row.cnt || 0);
      }
      const goatTotal = typeMap.super_goat + typeMap.premium_goat + typeMap.exclusive_goat;
      const achievedTotal = typeMap.premium + typeMap.standard + typeMap.waqf + typeMap.exclusive + goatTotal;
      const targetTotal = 2000;
      const TYPE_LABELS = {
        premium: "Hissa - Premium",
        standard: "Hissa - Standard",
        waqf: "Hissa - Waqf",
        exclusive: "Hissa - Exclusive",
        goat: "Goat (Hissa)",
        super_goat: "Super Goat (Hissa)",
        premium_goat: "Premium Goat (Hissa)",
        exclusive_goat: "Exclusive Goat (Hissa)",
      };
      const targetBreakdown = [
        { key: "premium", label: TYPE_LABELS.premium, value: typeMap.premium },
        { key: "standard", label: TYPE_LABELS.standard, value: typeMap.standard },
        { key: "waqf", label: TYPE_LABELS.waqf, value: typeMap.waqf },
        { key: "exclusive", label: TYPE_LABELS.exclusive, value: typeMap.exclusive },
        { key: "goat", label: TYPE_LABELS.goat, value: goatTotal },
        { key: "super_goat", label: TYPE_LABELS.super_goat, value: typeMap.super_goat },
        { key: "premium_goat", label: TYPE_LABELS.premium_goat, value: typeMap.premium_goat },
        { key: "exclusive_goat", label: TYPE_LABELS.exclusive_goat, value: typeMap.exclusive_goat },
      ].map((b) => ({
        ...b,
        percentage: achievedTotal > 0 ? (b.value / achievedTotal) * 100 : 0,
      }));

      const activeCount = Number(riderCounts.active_riders || 0);
      const avg = activeCount > 0 ? Math.round((Number(summary.delivered || 0) / activeCount) * 10) / 10 : 0;

      res.json({
        total_hissas: Number(summary.total_hissas || 0),
        delivered: Number(summary.delivered || 0),
        in_transit: Number(summary.in_transit || 0),
        pending: Number(summary.pending || 0),
        returned: Number(summary.returned || 0),
        rider_assigned: Number(summary.rider_assigned || 0),
        unassigned: Number(summary.unassigned || 0),
        active_riders: activeCount,
        avg_deliveries_per_rider: avg,
        areas,
        rider_summary: riderSummary,
        areas_list: areaRows.map((r) => r.area),
        slots_list: slotRows.map((r) => r.slot),
        slaughter,
        packing,
        deliveries_by_slot: deliveriesBySlot.map((r) => ({
          slot: r.slot,
          total: Number(r.total || 0),
          delivered: Number(r.delivered || 0),
          pending: Number(r.pending || 0),
          in_transit: Number(r.in_transit || 0),
          returned: Number(r.returned || 0),
          rider_assigned: Number(r.rider_assigned || 0),
        })),
        target_achievement: {
          target: targetTotal,
          achieved: achievedTotal,
          breakdown: targetBreakdown,
          delivery_statuses: statusFilter,
        },
      });
    } catch (error) {
      logError("OPERATIONS", "Dashboard stats error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Rider supervisors (admin riders) ─────────────────────────
  app.get("/api/operations/supervisors/user-candidates", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;
      const forSidRaw = req.query.for_supervisor_id;
      const forSid =
        forSidRaw != null && String(forSidRaw).trim() !== ""
          ? Number(forSidRaw)
          : null;
      const includeCurrent = Number.isFinite(forSid) && forSid > 0;

      const sql = includeCurrent
        ? `SELECT u.user_id, u.username, u.email, u.first_name, u.last_name
           FROM users u
           LEFT JOIN rider_supervisors rs ON rs.user_id = u.user_id
           WHERE (u.status = 'active' OR u.status IS NULL)
             AND (rs.supervisor_id IS NULL OR rs.supervisor_id = ?)
           ORDER BY u.username`
        : `SELECT u.user_id, u.username, u.email, u.first_name, u.last_name
           FROM users u
           LEFT JOIN rider_supervisors rs ON rs.user_id = u.user_id
           WHERE rs.supervisor_id IS NULL AND (u.status = 'active' OR u.status IS NULL)
           ORDER BY u.username`;
      const params = includeCurrent ? [forSid] : [];
      const [users] = await db.execute(sql, params);
      res.json({ users });
    } catch (error) {
      logError("OPERATIONS", "Supervisor user candidates error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/supervisors", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;
      const [rows] = await db.execute(
        `SELECT s.supervisor_id, s.supervisor_code, s.supervisor_name, s.phone, s.user_id, s.created_at,
                u.username, u.email,
                (SELECT COUNT(*) FROM riders r
                 WHERE r.supervisor_id = s.supervisor_id AND (r.status = 'active' OR r.status IS NULL)) AS rider_count
         FROM rider_supervisors s
         INNER JOIN users u ON u.user_id = s.user_id
         ORDER BY s.supervisor_id`
      );
      res.json({ supervisors: rows });
    } catch (error) {
      logError("OPERATIONS", "List supervisors error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/operations/supervisors", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;
      const { supervisor_name, phone, user_id } = req.body || {};
      if (!supervisor_name || typeof supervisor_name !== "string" || !String(supervisor_name).trim()) {
        return res.status(400).json({ message: "supervisor_name is required" });
      }
      const uid = Number(user_id);
      if (!Number.isFinite(uid) || uid <= 0) return res.status(400).json({ message: "user_id is required" });
      const [taken] = await db.execute(`SELECT supervisor_id FROM rider_supervisors WHERE user_id = ?`, [uid]);
      if (taken.length > 0) return res.status(400).json({ message: "User is already assigned to a supervisor" });
      const code = await nextSupervisorCode(db);
      const [ins] = await db.execute(
        `INSERT INTO rider_supervisors (supervisor_code, supervisor_name, phone, user_id) VALUES (?, ?, ?, ?)`,
        [code, String(supervisor_name).trim(), phone ? String(phone).trim() : null, uid]
      );
      log("OPERATIONS", "Supervisor created", { supervisor_id: ins.insertId, code });
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "SUPERVISOR_CREATE",
        entity_type: "rider_supervisor",
        entity_id: String(ins.insertId),
        new_values: { supervisor_code: code, supervisor_name: String(supervisor_name).trim(), phone, user_id: uid },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      emitOperationsChanged(io, "supervisors:changed", { action: "created", supervisor_id: ins.insertId });
      res.status(201).json({ supervisor_id: ins.insertId, supervisor_code: code });
    } catch (error) {
      logError("OPERATIONS", "Create supervisor error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/operations/supervisors/:id", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;
      const sid = Number(req.params.id);
      if (!Number.isFinite(sid) || sid <= 0) return res.status(400).json({ message: "Invalid supervisor id" });

      const oldSnap = await fetchSupervisorAuditSnapshot(db, sid);
      if (!oldSnap) return res.status(404).json({ message: "Supervisor not found" });

      const { supervisor_name, phone, user_id } = req.body || {};
      const updates = [];
      const params = [];

      if (supervisor_name !== undefined) {
        if (typeof supervisor_name !== "string" || !String(supervisor_name).trim()) {
          return res.status(400).json({ message: "supervisor_name cannot be empty" });
        }
        updates.push("supervisor_name = ?");
        params.push(String(supervisor_name).trim());
      }
      if (phone !== undefined) {
        const p = phone === null || phone === "" ? null : String(phone).trim();
        updates.push("phone = ?");
        params.push(p);
      }
      if (user_id !== undefined) {
        const uid = Number(user_id);
        if (!Number.isFinite(uid) || uid <= 0) return res.status(400).json({ message: "Invalid user_id" });
        const [taken] = await db.execute(
          `SELECT supervisor_id FROM rider_supervisors WHERE user_id = ? AND supervisor_id != ?`,
          [uid, sid]
        );
        if (taken.length > 0) {
          return res.status(400).json({ message: "User is already assigned to another supervisor" });
        }
        updates.push("user_id = ?");
        params.push(uid);
      }

      if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });

      params.push(sid);
      await db.execute(`UPDATE rider_supervisors SET ${updates.join(", ")} WHERE supervisor_id = ?`, params);

      const newSnap = await fetchSupervisorAuditSnapshot(db, sid);

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "SUPERVISOR_UPDATE",
        entity_type: "rider_supervisor",
        entity_id: String(sid),
        old_values: oldSnap,
        new_values: newSnap,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      emitOperationsChanged(io, "supervisors:changed", { action: "updated", supervisor_id: sid });
      res.json({ ok: true, supervisor: newSnap });
    } catch (error) {
      logError("OPERATIONS", "Update supervisor error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/operations/supervisors/:id", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;
      const sid = Number(req.params.id);
      if (!Number.isFinite(sid) || sid <= 0) return res.status(400).json({ message: "Invalid supervisor id" });

      const oldSnap = await fetchSupervisorAuditSnapshot(db, sid);
      if (!oldSnap) return res.status(404).json({ message: "Supervisor not found" });

      await db.execute(`DELETE FROM rider_supervisors WHERE supervisor_id = ?`, [sid]);

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "SUPERVISOR_DELETE",
        entity_type: "rider_supervisor",
        entity_id: String(sid),
        old_values: oldSnap,
        new_values: { deleted: true },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      emitOperationsChanged(io, "supervisors:changed", { action: "deleted", supervisor_id: sid });
      res.json({ ok: true });
    } catch (error) {
      logError("OPERATIONS", "Delete supervisor error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/supervisors/:id/riders", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;
      const sid = Number(req.params.id);
      if (!Number.isFinite(sid) || sid <= 0) return res.status(400).json({ message: "Invalid supervisor id" });
      const [sup] = await db.execute(
        `SELECT supervisor_id, supervisor_code, supervisor_name, phone, user_id FROM rider_supervisors WHERE supervisor_id = ?`,
        [sid]
      );
      if (sup.length === 0) return res.status(404).json({ message: "Supervisor not found" });
      const [riders] = await db.execute(
        `SELECT rider_id, rider_name, contact, vehicle, number_plate, availability, status
         FROM riders WHERE supervisor_id = ? AND (status = 'active' OR status IS NULL) ORDER BY rider_name`,
        [sid]
      );
      res.json({ supervisor: sup[0], riders });
    } catch (error) {
      logError("OPERATIONS", "Supervisor riders error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/supervisor/me", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management_supervisor);
      if (!flags) return;
      const sup = await getSupervisorRecordForUser(db, req.userId);
      if (!sup) return res.status(404).json({ message: "Supervisor profile not found" });
      res.json({ supervisor: sup });
    } catch (error) {
      logError("OPERATIONS", "Supervisor me error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/supervisor/riders", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management_supervisor);
      if (!flags) return;
      const sup = await getSupervisorRecordForUser(db, req.userId);
      if (!sup) return res.status(404).json({ message: "Supervisor profile not found" });
      const [riders] = await db.execute(
        `SELECT rider_id, rider_name, contact, vehicle, number_plate, availability, status
         FROM riders WHERE supervisor_id = ? AND (status = 'active' OR status IS NULL) ORDER BY rider_name`,
        [sup.supervisor_id]
      );
      res.json(riders);
    } catch (error) {
      logError("OPERATIONS", "Supervisor riders list error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Rider routes ────────────────────────────────────────────
  app.get("/api/operations/riders/details", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;
      const day = req.query.day ? String(req.query.day).trim() : "";
      const [riders] = await db.execute(
        `SELECT r.rider_id, r.supervisor_id, r.rider_name, r.contact, r.vehicle, r.cnic, r.number_plate,
                r.amount_per_delivery, r.total_paid,
                COALESCE(NULLIF(TRIM(r.availability), ''), 'Available') AS availability,
                COALESCE(NULLIF(TRIM(r.status), ''), 'active') AS status,
                rs.supervisor_code, rs.supervisor_name AS supervisor_name, rs.phone AS supervisor_phone
         FROM riders r
         LEFT JOIN rider_supervisors rs ON rs.supervisor_id = r.supervisor_id
         WHERE r.status = 'active' OR r.status IS NULL ORDER BY r.rider_name`
      );
      let batchId = req.query.batch_id ? Number(req.query.batch_id) : null;
      if (!batchId) batchId = await resolveLatestBatchId(db);
      let challanStats = [];
      if (batchId) {
        const challanParams = [batchId];
        let challanWhere = `WHERE o.rider_id IS NOT NULL AND c.batch_id = ? AND COALESCE(c.total_hissa, 0) > 0 AND ${nonWaqfOrder("o")}`;
        if (day) {
          challanWhere += ` AND LOWER(TRIM(COALESCE(c.day, ''))) = LOWER(TRIM(?))`;
          challanParams.push(day);
        }
        const [rows] = await db.execute(
          `SELECT o.rider_id,
                  COUNT(DISTINCT c.challan_id) AS challan_count,
                  SUM(o.delivery_status = 'Delivered') AS delivered_hissa_count,
                  COUNT(o.order_id) - SUM(o.delivery_status = 'Delivered') AS pending_hissa_count,
                  COUNT(o.order_id) AS total_assigned_hissa
           FROM challan c
           INNER JOIN challan_orders co ON co.challan_id = c.challan_id
           INNER JOIN orders o ON o.order_id = co.order_id
           ${challanWhere}
           GROUP BY o.rider_id`,
          challanParams
        );
        challanStats = rows;
      }
      const statsMap = new Map();
      for (const row of challanStats) statsMap.set(Number(row.rider_id), row);

      let timingMap = new Map();
      try {
        const [timingRows] = await db.execute(
          `SELECT rider_id,
                  COALESCE(SUM(
                    CASE
                      WHEN dispatched_at IS NOT NULL AND delivered_at IS NOT NULL
                      THEN TIMESTAMPDIFF(SECOND, dispatched_at, delivered_at)
                      ELSE 0
                    END
                  ), 0) AS timing_sum_seconds
           FROM rider_delivery_timing
           GROUP BY rider_id`
        );
        for (const tr of timingRows || []) timingMap.set(Number(tr.rider_id), Number(tr.timing_sum_seconds || 0));
      } catch (timingAggErr) {
        logError("OPERATIONS", "rider_delivery_timing aggregate (run migrate_rider_delivery_timing.sql?)", timingAggErr);
      }

      const items = riders.map((r) => {
        const s = statsMap.get(Number(r.rider_id)) || {};
        const amountPerDelivery = Number(r.amount_per_delivery || 0);
        const deliveredCount = Number(s.delivered_hissa_count || 0);
        const totalAssigned = Number(s.total_assigned_hissa || 0);
        const pendingHissa = Number(s.pending_hissa_count ?? Math.max(0, totalAssigned - deliveredCount));
        const totalPaid = Number(r.total_paid || 0);
        const totalAmountMade = deliveredCount * amountPerDelivery;
        const timingSumSec = timingMap.get(Number(r.rider_id)) || 0;
        const avgDispatchToDeliverSec =
          deliveredCount > 0 && timingSumSec > 0 ? timingSumSec / deliveredCount : null;
        return {
          ...r,
          deliveries_completed: deliveredCount,
          pending_hissa_count: pendingHissa,
          total_assigned_hissa: totalAssigned,
          challan_count: Number(s.challan_count || 0),
          total_amount_made: Number(totalAmountMade.toFixed(2)),
          balance_due: Number((totalAmountMade - totalPaid).toFixed(2)),
          delivery_timing_sum_seconds: timingSumSec,
          avg_dispatch_to_deliver_seconds:
            avgDispatchToDeliverSec != null ? Math.round(avgDispatchToDeliverSec * 10) / 10 : null,
        };
      });
      res.json({ riders: items });
    } catch (error) {
      logError("OPERATIONS", "Rider details error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/riders/:id/orders", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;
      const riderId = Number(req.params.id);
      if (!Number.isFinite(riderId) || riderId <= 0) return res.status(400).json({ message: "Invalid rider id" });
      const day = req.query.day ? String(req.query.day).trim() : "";
      const [rv] = await db.execute(
        `SELECT rider_id, rider_name, contact, vehicle, number_plate, amount_per_delivery, total_paid,
                COALESCE(NULLIF(TRIM(availability), ''), 'Available') AS availability
         FROM riders WHERE rider_id = ? AND (status = 'active' OR status IS NULL)`,
        [riderId]
      );
      if (rv.length === 0) return res.status(404).json({ message: "Rider not found" });
      let batchId = req.query.batch_id ? Number(req.query.batch_id) : null;
      if (!batchId) batchId = await resolveLatestBatchId(db);
      if (!batchId) return res.json({ rider: rv[0], orders: [] });

      const params = [riderId, batchId];
      let sql = `SELECT c.challan_id, c.qr_token, c.day, c.slot, c.address, c.area,
                        c.description AS challan_description,
                        o.order_id, o.booking_name, o.shareholder_name, o.contact, o.alt_contact,
                        o.customer_id, o.description,
                        o.order_type, o.cow_number, o.hissa_number, o.delivery_status
                 FROM challan c
                 INNER JOIN challan_orders co ON co.challan_id = c.challan_id
                 INNER JOIN orders o ON o.order_id = co.order_id
                 WHERE o.rider_id = ? AND c.batch_id = ? AND COALESCE(c.total_hissa, 0) > 0 AND ${nonWaqfOrder("o")}`;
      if (day) {
        sql += ` AND LOWER(TRIM(COALESCE(c.day, ''))) = LOWER(TRIM(?))`;
        params.push(day);
      }
      sql += ` ORDER BY c.day, c.slot, c.challan_id, o.order_id`;
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
      const [existing] = await db.execute(
        `SELECT rider_id, rider_name, contact, vehicle, cnic, number_plate, availability, amount_per_delivery, total_paid, status, supervisor_id
         FROM riders WHERE rider_id = ? AND (status = 'active' OR status IS NULL)`,
        [riderId]
      );
      if (existing.length === 0) return res.status(404).json({ message: "Rider not found" });
      const updates = [], values = [];
      const { rider_name, contact, vehicle, cnic, number_plate, availability, amount_per_delivery, total_paid, supervisor_id } = req.body || {};
      if (rider_name !== undefined) {
        if (!String(rider_name).trim()) return res.status(400).json({ message: "rider_name cannot be empty" });
        updates.push("rider_name = ?"); values.push(String(rider_name).trim());
      }
      if (contact !== undefined) { updates.push("contact = ?"); values.push(contact ? String(contact).trim() : null); }
      if (vehicle !== undefined) { updates.push("vehicle = ?"); values.push(vehicle ? String(vehicle).trim() : null); }
      if (cnic !== undefined) { updates.push("cnic = ?"); values.push(cnic ? String(cnic).trim() : null); }
      if (number_plate !== undefined) { updates.push("number_plate = ?"); values.push(number_plate ? String(number_plate).trim() : null); }
      if (availability !== undefined) { updates.push("availability = ?"); values.push(String(availability || "").trim()); }
      if (amount_per_delivery !== undefined) {
        const n = Number(amount_per_delivery);
        if (!Number.isFinite(n) || n < 0) return res.status(400).json({ message: "amount_per_delivery must be a valid non-negative number" });
        updates.push("amount_per_delivery = ?"); values.push(n);
      }
      if (total_paid !== undefined) {
        const n = Number(total_paid);
        if (!Number.isFinite(n) || n < 0) return res.status(400).json({ message: "total_paid must be a valid non-negative number" });
        updates.push("total_paid = ?"); values.push(n);
      }
      if (supervisor_id !== undefined) {
        if (supervisor_id === null || supervisor_id === "") {
          updates.push("supervisor_id = ?");
          values.push(null);
        } else {
          const sid = Number(supervisor_id);
          if (!Number.isFinite(sid) || sid <= 0) return res.status(400).json({ message: "Invalid supervisor_id" });
          const [srows] = await db.execute(`SELECT supervisor_id FROM rider_supervisors WHERE supervisor_id = ?`, [sid]);
          if (srows.length === 0) return res.status(404).json({ message: "Supervisor not found" });
          updates.push("supervisor_id = ?");
          values.push(sid);
        }
      }
      if (updates.length === 0) return res.status(400).json({ message: "No valid fields provided for update" });
      values.push(riderId);
      await db.execute(`UPDATE riders SET ${updates.join(", ")} WHERE rider_id = ?`, values);

      const oldForAudit = { ...existing[0] };
      const prevSupervisorId = oldForAudit.supervisor_id;
      delete oldForAudit.supervisor_id;
      oldForAudit.supervisor = await supervisorLabelForAudit(db, prevSupervisorId);

      const body = req.body || {};
      const newForAudit = { ...body };
      if (Object.prototype.hasOwnProperty.call(newForAudit, "supervisor_id")) {
        const supIn = newForAudit.supervisor_id;
        delete newForAudit.supervisor_id;
        newForAudit.supervisor = await supervisorLabelForAudit(db, supIn === "" ? null : supIn);
      }

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "RIDER_UPDATE",
        entity_type: "rider",
        entity_id: String(riderId),
        old_values: oldForAudit,
        new_values: newForAudit,
        ip_address: req.ip,
        user_agent: req.get("user-agent")
      });
      emitOperationsChanged(io, "riders:changed", { action: "updated", rider_id: riderId });
      res.json({ message: "Rider updated" });
    } catch (error) {
      logError("OPERATIONS", "Rider update error", error);
      res.status(500).json({ message: "Server error" });
    }
  });


  app.delete("/api/operations/riders/:id", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;

      const riderId = Number(req.params.id);
      if (!Number.isFinite(riderId) || riderId <= 0) return res.status(400).json({ message: "Invalid rider id" });

      const [existing] = await db.execute(
        `SELECT rider_id, rider_name, contact, vehicle, cnic, number_plate, availability, amount_per_delivery, total_paid, status, supervisor_id
         FROM riders WHERE rider_id = ? AND (status = 'active' OR status IS NULL)`,
        [riderId]
      );
      if (existing.length === 0) return res.status(404).json({ message: "Rider not found" });

      const oldForAudit = { ...existing[0] };
      const prevSupervisorId = oldForAudit.supervisor_id;
      delete oldForAudit.supervisor_id;
      oldForAudit.supervisor = await supervisorLabelForAudit(db, prevSupervisorId);

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        await conn.execute(
          `UPDATE riders SET status = 'deleted', availability = 'Suspended' WHERE rider_id = ?`,
          [riderId]
        );

        await conn.execute(
          `UPDATE orders
           SET rider_id = NULL, delivery_status = 'Pending'
           WHERE rider_id = ? AND delivery_status IN ('Pending', 'Rider Assigned')`,
          [riderId]
        );

        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "RIDER_DELETE",
        entity_type: "rider",
        entity_id: String(riderId),
        old_values: oldForAudit,
        new_values: { status: "deleted", availability: "Suspended" },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      emitOperationsChanged(io, "riders:changed", { action: "deleted", rider_id: riderId });
      res.json({ message: "Rider deleted" });
    } catch (error) {
      logError("OPERATIONS", "Rider delete error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/operations/challans/preview-single", verifyToken, async (req, res) => {
    const flags = await assertSub(req, res, (f) => f.operation_challan_management);
    if (!flags) return;
    res.status(501).json({ message: "Not implemented yet." });
  });
  app.post("/api/operations/challans/preview-bulk", verifyToken, async (req, res) => {
    const flags = await assertSub(req, res, (f) => f.operation_challan_management);
    if (!flags) return;
    res.status(501).json({ message: "Not implemented yet." });
  });
};