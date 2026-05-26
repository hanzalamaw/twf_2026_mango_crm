import { logError } from "../utils/logger.js";
import { emitOperationsChanged } from "../utils/operationsSocket.js";

function notifyLineChanged(io, action, day) {
  if (!day) return;
  emitOperationsChanged(io, "line:changed", { action, day });
}

const VALID_TYPES = new Set([
  "premium_cow",
  "standard_cow",
  "waqf_cow",
  "exclusive_cow",
  "premium_goat",
  "super_goat",
  "exclusive_goat",
]);

const TYPE_MULTIPLIER = {
  premium_cow: 7,
  standard_cow: 7,
  waqf_cow: 7,
  exclusive_cow: 7,
  premium_goat: 1,
  super_goat: 1,
  exclusive_goat: 1,
};

function parseDay(raw) {
  const n = Number(raw);
  if (n === 1 || n === 2 || n === 3) return n;
  return null;
}

function parseSequence(animalType, animalNumber) {
  const n = String(animalNumber || "").trim().toUpperCase();
  if (!n) return null;
  const patterns = {
    premium_cow: /^P(\d+)$/,
    standard_cow: /^S(\d+)$/,
    waqf_cow: /^W(\d+)$/,
    exclusive_cow: /^E(\d+)$/,
    premium_goat: /^GP(\d+)$/,
    super_goat: /^GS-(\d+)$/,
    exclusive_goat: /^GE(\d+)$/,
  };
  const re = patterns[animalType];
  if (!re) return null;
  const m = n.match(re);
  if (!m) return null;
  const seq = Number(m[1]);
  return Number.isFinite(seq) && seq > 0 ? seq : null;
}

function formatNumber(animalType, seq) {
  const s = Math.max(1, Math.floor(Number(seq) || 1));
  switch (animalType) {
    case "premium_cow":
      return `P${s}`;
    case "standard_cow":
      return `S${s}`;
    case "waqf_cow":
      return `W${s}`;
    case "exclusive_cow":
      return `E${s}`;
    case "premium_goat":
      return `GP${s}`;
    case "super_goat":
      return `GS-${s}`;
    case "exclusive_goat":
      return `GE${s}`;
    default:
      return String(s);
  }
}

function normalizeNumberInput(animalType, raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  const seq = parseSequence(animalType, trimmed);
  if (seq != null) return formatNumber(animalType, seq);
  return trimmed.toUpperCase();
}

function buildStatsFromCounts(counts = {}) {
  const stats = { total_units: { start: 0, end: 0 } };
  for (const type of VALID_TYPES) {
    const rawStart = Number(counts[type]?.start) || 0;
    const rawEnd = Number(counts[type]?.end) || 0;
    const mult = TYPE_MULTIPLIER[type] ?? 1;
    stats[type] = { start: rawStart * mult, end: rawEnd * mult };
    stats.total_units.start += stats[type].start;
    stats.total_units.end += stats[type].end;
  }
  return stats;
}

async function ensureLineTables(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS line_groups (
      group_id INT AUTO_INCREMENT PRIMARY KEY,
      group_name VARCHAR(255) NOT NULL,
      day TINYINT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_line_group_day (day)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS line_records (
      record_id INT AUTO_INCREMENT PRIMARY KEY,
      group_id INT NOT NULL,
      day TINYINT NOT NULL,
      animal_type ENUM(
        'premium_cow','standard_cow','waqf_cow','exclusive_cow',
        'premium_goat','super_goat','exclusive_goat'
      ) NOT NULL,
      animal_number VARCHAR(32) NOT NULL,
      recorded_time DATETIME NOT NULL,
      recorded_end_time DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_line_day_type (day, animal_type),
      INDEX idx_line_group (group_id),
      INDEX idx_line_time (recorded_time)
    )
  `);
  try {
    await db.execute(
      `ALTER TABLE line_records ADD COLUMN recorded_end_time DATETIME NULL AFTER recorded_time`
    );
  } catch (e) {
    if (!String(e?.message || "").includes("Duplicate column")) throw e;
  }
  try {
    await db.execute(`
      ALTER TABLE line_records MODIFY animal_type ENUM(
        'premium_cow','standard_cow','waqf_cow','exclusive_cow',
        'premium_goat','super_goat','exclusive_goat'
      ) NOT NULL
    `);
  } catch (e) {
    logError("LINE", "Enum migration (exclusive_goat)", e);
  }
}

async function fetchRoleLineFlags(db, userId) {
  const [rows] = await db.execute(
    `SELECT r.operation_management, r.operation_rider_management,
            r.operation_rider_management_supervisor, r.operation_line_management
     FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?`,
    [userId]
  );
  return rows[0] || null;
}

function requireLineAccess(req, res, flags) {
  const parent =
    !!flags?.operation_management ||
    !!flags?.operation_rider_management ||
    !!flags?.operation_rider_management_supervisor;
  if (!parent) {
    res.status(403).json({ message: "Operations access denied" });
    return false;
  }
  if (!flags?.operation_line_management) {
    res.status(403).json({ message: "Line Management access denied" });
    return false;
  }
  return true;
}

async function assertLine(req, res, db) {
  const flags = await fetchRoleLineFlags(db, req.userId);
  if (!flags || !requireLineAccess(req, res, flags)) return null;
  return flags;
}

async function getUsedSequences(db, day, animalType) {
  const [rows] = await db.execute(
    `SELECT animal_number FROM line_records WHERE day = ? AND animal_type = ?`,
    [day, animalType]
  );
  const used = new Set();
  for (const row of rows) {
    const seq = parseSequence(animalType, row.animal_number);
    if (seq != null) used.add(seq);
  }
  return used;
}

async function computeNextNumber(db, day, animalType) {
  const used = await getUsedSequences(db, day, animalType);
  let seq = 1;
  while (used.has(seq)) seq += 1;
  return formatNumber(animalType, seq);
}

async function resolveAnimalNumber(db, res, { day, animalType, rawNumber, excludeRecordId = null }) {
  let animal_number;
  const userProvided = rawNumber !== undefined && rawNumber !== null && String(rawNumber).trim() !== "";

  if (userProvided) {
    animal_number = normalizeNumberInput(animalType, rawNumber);
    if (!animal_number) {
      res.status(400).json({ message: "Invalid animal number format" });
      return null;
    }
  } else {
    return computeNextNumber(db, day, animalType);
  }

  const params = [day, animalType, animal_number];
  let sql = `SELECT record_id FROM line_records
             WHERE day = ? AND animal_type = ? AND UPPER(TRIM(animal_number)) = UPPER(TRIM(?))`;
  if (excludeRecordId != null) {
    sql += ` AND record_id != ?`;
    params.push(excludeRecordId);
  }
  sql += ` LIMIT 1`;

  const [dupes] = await db.execute(sql, params);
  if (dupes.length) {
    res.status(409).json({
      message: `${animal_number} already exists for this type on the selected day`,
    });
    return null;
  }

  return animal_number;
}

function toMysqlDatetime(val) {
  if (!val) return new Date();
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return new Date(
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function formatRowTime(val) {
  if (!val) return null;
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const registerLineRoutes = (app, db, verifyToken, io = null) => {
  ensureLineTables(db).catch((e) => logError("LINE", "Ensure tables failed", e));

  app.get("/api/operations/line/dashboard", verifyToken, async (req, res) => {
    try {
      if (!(await assertLine(req, res, db))) return;
      const day = parseDay(req.query.day);
      if (!day) return res.status(400).json({ message: "Invalid day (use 1, 2, or 3)" });

      const [groups] = await db.execute(
        `SELECT group_id, group_name, day, created_at
         FROM line_groups WHERE day = ? ORDER BY group_id ASC`,
        [day]
      );

      const [statsRows] = await db.execute(
        `SELECT group_id, animal_type,
                COUNT(*) AS start_cnt,
                SUM(recorded_end_time IS NOT NULL) AS end_cnt
         FROM line_records WHERE day = ?
         GROUP BY group_id, animal_type`,
        [day]
      );

      const statsMap = {};
      for (const row of statsRows) {
        if (!statsMap[row.group_id]) statsMap[row.group_id] = {};
        statsMap[row.group_id][row.animal_type] = {
          start: Number(row.start_cnt) || 0,
          end: Number(row.end_cnt) || 0,
        };
      }

      const data = groups.map((g) => ({
        group_id: g.group_id,
        group_name: g.group_name,
        day: g.day,
        created_at: g.created_at,
        stats: buildStatsFromCounts(statsMap[g.group_id] || {}),
      }));

      res.json({ day, groups: data });
    } catch (error) {
      logError("LINE", "Dashboard error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/line/next-number", verifyToken, async (req, res) => {
    try {
      if (!(await assertLine(req, res, db))) return;
      const day = parseDay(req.query.day);
      const animalType = String(req.query.type || "").trim();
      if (!day) return res.status(400).json({ message: "Invalid day" });
      if (!VALID_TYPES.has(animalType)) return res.status(400).json({ message: "Invalid animal type" });
      const animal_number = await computeNextNumber(db, day, animalType);
      res.json({ animal_number });
    } catch (error) {
      logError("LINE", "Next number error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/operations/line/groups", verifyToken, async (req, res) => {
    try {
      if (!(await assertLine(req, res, db))) return;
      const day = parseDay(req.body?.day);
      const group_name = String(req.body?.group_name || "").trim();
      if (!day) return res.status(400).json({ message: "Invalid day" });
      if (!group_name) return res.status(400).json({ message: "Group name is required" });

      const [result] = await db.execute(
        `INSERT INTO line_groups (group_name, day) VALUES (?, ?)`,
        [group_name, day]
      );
      res.status(201).json({
        group_id: result.insertId,
        group_name,
        day,
        stats: buildStatsFromCounts({}),
      });
    } catch (error) {
      logError("LINE", "Create group error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/line/groups/:groupId/records", verifyToken, async (req, res) => {
    try {
      if (!(await assertLine(req, res, db))) return;
      const day = parseDay(req.query.day);
      const groupId = Number(req.params.groupId);
      if (!day || !Number.isFinite(groupId)) return res.status(400).json({ message: "Invalid request" });

      const [rows] = await db.execute(
        `SELECT r.record_id, r.group_id, r.day, r.animal_type, r.animal_number,
                r.recorded_time, r.recorded_end_time, g.group_name
         FROM line_records r
         JOIN line_groups g ON g.group_id = r.group_id
         WHERE r.group_id = ? AND r.day = ?
         ORDER BY r.recorded_time DESC, r.record_id DESC`,
        [groupId, day]
      );

      res.json({
        records: rows.map((row) => ({
          ...row,
          recorded_time: formatRowTime(row.recorded_time),
          recorded_end_time: formatRowTime(row.recorded_end_time),
        })),
      });
    } catch (error) {
      logError("LINE", "List group records error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/line/pending-number", verifyToken, async (req, res) => {
    try {
      if (!(await assertLine(req, res, db))) return;
      const day = parseDay(req.query.day);
      const groupId = Number(req.query.group_id);
      const animalType = String(req.query.type || "").trim();
      if (!day || !Number.isFinite(groupId) || !VALID_TYPES.has(animalType)) {
        return res.status(400).json({ message: "Invalid request" });
      }

      const [rows] = await db.execute(
        `SELECT record_id, animal_number FROM line_records
         WHERE group_id = ? AND day = ? AND animal_type = ? AND recorded_end_time IS NULL
         ORDER BY recorded_time ASC, record_id ASC
         LIMIT 1`,
        [groupId, day, animalType]
      );

      if (!rows.length) {
        return res.json({ record_id: null, animal_number: "" });
      }
      res.json({
        record_id: rows[0].record_id,
        animal_number: rows[0].animal_number,
      });
    } catch (error) {
      logError("LINE", "Pending number error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/operations/line/records/end", verifyToken, async (req, res) => {
    try {
      if (!(await assertLine(req, res, db))) return;
      const day = parseDay(req.body?.day);
      const groupId = Number(req.body?.group_id);
      const animalType = String(req.body?.animal_type || "").trim();
      if (!day || !Number.isFinite(groupId)) return res.status(400).json({ message: "Invalid request" });
      if (!VALID_TYPES.has(animalType)) return res.status(400).json({ message: "Invalid animal type" });

      const [groupRows] = await db.execute(
        `SELECT group_id FROM line_groups WHERE group_id = ? AND day = ?`,
        [groupId, day]
      );
      if (!groupRows.length) return res.status(404).json({ message: "Line group not found for this day" });

      const rawNumber = req.body?.animal_number;
      let targetRow = null;

      if (rawNumber !== undefined && String(rawNumber).trim() !== "") {
        const animal_number = normalizeNumberInput(animalType, rawNumber);
        if (!animal_number) return res.status(400).json({ message: "Invalid animal number format" });
        const [byNumber] = await db.execute(
          `SELECT record_id, animal_number, recorded_end_time FROM line_records
           WHERE group_id = ? AND day = ? AND animal_type = ?
             AND UPPER(TRIM(animal_number)) = UPPER(TRIM(?))
           LIMIT 1`,
          [groupId, day, animalType, animal_number]
        );
        if (!byNumber.length) {
          return res.status(404).json({ message: "No matching line start found for this number" });
        }
        if (byNumber[0].recorded_end_time) {
          return res.status(409).json({ message: "This record already has an end time recorded" });
        }
        targetRow = byNumber[0];
      } else {
        const [pending] = await db.execute(
          `SELECT record_id, animal_number FROM line_records
           WHERE group_id = ? AND day = ? AND animal_type = ? AND recorded_end_time IS NULL
           ORDER BY recorded_time ASC, record_id ASC
           LIMIT 1`,
          [groupId, day, animalType]
        );
        if (!pending.length) {
          return res.status(404).json({ message: "No pending line start for this type in this group" });
        }
        targetRow = pending[0];
      }

      const recorded_end_time = toMysqlDatetime(req.body?.recorded_end_time);

      await db.execute(
        `UPDATE line_records SET recorded_end_time = ? WHERE record_id = ?`,
        [recorded_end_time, targetRow.record_id]
      );

      notifyLineChanged(io, "end", day);

      res.json({
        record_id: targetRow.record_id,
        group_id: groupId,
        day,
        animal_type: animalType,
        animal_number: targetRow.animal_number,
        recorded_end_time: formatRowTime(recorded_end_time),
      });
    } catch (error) {
      logError("LINE", "Record end error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/operations/line/records", verifyToken, async (req, res) => {
    try {
      if (!(await assertLine(req, res, db))) return;
      const day = parseDay(req.body?.day);
      const groupId = Number(req.body?.group_id);
      const animalType = String(req.body?.animal_type || "").trim();
      if (!day || !Number.isFinite(groupId)) return res.status(400).json({ message: "Invalid request" });
      if (!VALID_TYPES.has(animalType)) return res.status(400).json({ message: "Invalid animal type" });

      const [groupRows] = await db.execute(
        `SELECT group_id FROM line_groups WHERE group_id = ? AND day = ?`,
        [groupId, day]
      );
      if (!groupRows.length) return res.status(404).json({ message: "Line group not found for this day" });

      const animal_number = await resolveAnimalNumber(db, res, {
        day,
        animalType,
        rawNumber: req.body?.animal_number,
      });
      if (!animal_number) return;

      const recorded_time = toMysqlDatetime(req.body?.recorded_time);

      const [result] = await db.execute(
        `INSERT INTO line_records (group_id, day, animal_type, animal_number, recorded_time)
         VALUES (?, ?, ?, ?, ?)`,
        [groupId, day, animalType, animal_number, recorded_time]
      );

      notifyLineChanged(io, "created", day);

      res.status(201).json({
        record_id: result.insertId,
        group_id: groupId,
        day,
        animal_type: animalType,
        animal_number,
        recorded_time: formatRowTime(recorded_time),
      });
    } catch (error) {
      logError("LINE", "Create record error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/operations/line/records/:id", verifyToken, async (req, res) => {
    try {
      if (!(await assertLine(req, res, db))) return;
      const recordId = Number(req.params.id);
      if (!Number.isFinite(recordId)) return res.status(400).json({ message: "Invalid record id" });

      const [existing] = await db.execute(
        `SELECT * FROM line_records WHERE record_id = ?`,
        [recordId]
      );
      if (!existing.length) return res.status(404).json({ message: "Record not found" });

      const row = existing[0];
      const animalType = req.body?.animal_type
        ? String(req.body.animal_type).trim()
        : row.animal_type;
      if (!VALID_TYPES.has(animalType)) return res.status(400).json({ message: "Invalid animal type" });

      const recorded_time =
        req.body?.recorded_time !== undefined
          ? toMysqlDatetime(req.body.recorded_time)
          : row.recorded_time;

      const recorded_end_time =
        req.body?.recorded_end_time !== undefined
          ? req.body.recorded_end_time
            ? toMysqlDatetime(req.body.recorded_end_time)
            : null
          : row.recorded_end_time;

      const groupId =
        req.body?.group_id !== undefined ? Number(req.body.group_id) : row.group_id;
      const day = req.body?.day !== undefined ? parseDay(req.body.day) : row.day;
      if (!day || !Number.isFinite(groupId)) return res.status(400).json({ message: "Invalid request" });

      const numberInput =
        req.body?.animal_number !== undefined ? req.body.animal_number : row.animal_number;
      const animal_number = await resolveAnimalNumber(db, res, {
        day,
        animalType,
        rawNumber: numberInput,
        excludeRecordId: recordId,
      });
      if (!animal_number) return;

      await db.execute(
        `UPDATE line_records
         SET group_id = ?, day = ?, animal_type = ?, animal_number = ?,
             recorded_time = ?, recorded_end_time = ?
         WHERE record_id = ?`,
        [groupId, day, animalType, animal_number, recorded_time, recorded_end_time, recordId]
      );

      notifyLineChanged(io, "updated", day);
      if (row.day !== day) notifyLineChanged(io, "updated", row.day);

      res.json({
        record_id: recordId,
        group_id: groupId,
        day,
        animal_type: animalType,
        animal_number,
        recorded_time: formatRowTime(recorded_time),
        recorded_end_time: formatRowTime(recorded_end_time),
      });
    } catch (error) {
      logError("LINE", "Update record error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/operations/line/records/:id", verifyToken, async (req, res) => {
    try {
      if (!(await assertLine(req, res, db))) return;
      const recordId = Number(req.params.id);
      if (!Number.isFinite(recordId)) return res.status(400).json({ message: "Invalid record id" });

      const [existing] = await db.execute(
        `SELECT day FROM line_records WHERE record_id = ?`,
        [recordId]
      );
      if (!existing.length) return res.status(404).json({ message: "Record not found" });

      const [result] = await db.execute(
        `DELETE FROM line_records WHERE record_id = ?`,
        [recordId]
      );
      if (result.affectedRows === 0) return res.status(404).json({ message: "Record not found" });

      notifyLineChanged(io, "deleted", existing[0].day);

      res.json({ message: "Deleted" });
    } catch (error) {
      logError("LINE", "Delete record error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/line/records-list", verifyToken, async (req, res) => {
    try {
      if (!(await assertLine(req, res, db))) return;

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const offset = (page - 1) * limit;

      const conditions = [];
      const params = [];

      const day = parseDay(req.query.day);
      if (day) {
        conditions.push("r.day = ?");
        params.push(day);
      }

      const animalType = String(req.query.type || "").trim();
      if (animalType && VALID_TYPES.has(animalType)) {
        conditions.push("r.animal_type = ?");
        params.push(animalType);
      }

      const groupId = Number(req.query.group_id);
      if (Number.isFinite(groupId) && groupId > 0) {
        conditions.push("r.group_id = ?");
        params.push(groupId);
      }

      const search = String(req.query.search || "").trim();
      if (search) {
        conditions.push(
          "(g.group_name LIKE ? OR r.animal_number LIKE ? OR CAST(r.record_id AS CHAR) LIKE ?)"
        );
        const like = `%${search}%`;
        params.push(like, like, like);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [countRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM line_records r
         JOIN line_groups g ON g.group_id = r.group_id
         ${where}`,
        params
      );
      const total = Number(countRows[0]?.total) || 0;

      const [rows] = await db.execute(
        `SELECT r.record_id, r.group_id, g.group_name, r.day, r.animal_type,
                r.animal_number, r.recorded_time, r.recorded_end_time, r.created_at
         FROM line_records r
         JOIN line_groups g ON g.group_id = r.group_id
         ${where}
         ORDER BY r.recorded_time DESC, r.record_id DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params
      );

      res.json({
        data: rows.map((row) => ({
          ...row,
          recorded_time: formatRowTime(row.recorded_time),
          recorded_end_time: formatRowTime(row.recorded_end_time),
          units: TYPE_MULTIPLIER[row.animal_type] || 1,
        })),
        total,
        page,
        limit,
      });
    } catch (error) {
      logError("LINE", "Records list error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/line/filters", verifyToken, async (req, res) => {
    try {
      if (!(await assertLine(req, res, db))) return;
      const [groups] = await db.execute(
        `SELECT group_id, group_name, day FROM line_groups ORDER BY day, group_id`
      );
      res.json({ groups });
    } catch (error) {
      logError("LINE", "Filters error", error);
      res.status(500).json({ message: "Server error" });
    }
  });
};
