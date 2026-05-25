import { logError } from "../utils/logger.js";

const VALID_TYPES = new Set([
  "premium_cow",
  "standard_cow",
  "waqf_cow",
  "exclusive_cow",
  "premium_goat",
  "super_goat",
  "exclusive_goat",
]);

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

async function ensureSlaughterTables(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS slaughter_qassai_groups (
      group_id INT AUTO_INCREMENT PRIMARY KEY,
      group_name VARCHAR(255) NOT NULL,
      day TINYINT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_slaughter_group_day (day)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS slaughter_records (
      slaughter_id INT AUTO_INCREMENT PRIMARY KEY,
      group_id INT NOT NULL,
      day TINYINT NOT NULL,
      animal_type ENUM(
        'premium_cow','standard_cow','waqf_cow','exclusive_cow',
        'premium_goat','super_goat','exclusive_goat'
      ) NOT NULL,
      animal_number VARCHAR(32) NOT NULL,
      slaughter_time DATETIME NOT NULL,
      slaughter_end_time DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_slaughter_day_type (day, animal_type),
      INDEX idx_slaughter_group (group_id),
      INDEX idx_slaughter_time (slaughter_time)
    )
  `);
  try {
    await db.execute(
      `ALTER TABLE slaughter_records ADD COLUMN slaughter_end_time DATETIME NULL AFTER slaughter_time`
    );
  } catch (e) {
    if (!String(e?.message || "").includes("Duplicate column")) throw e;
  }
  try {
    await db.execute(`
      ALTER TABLE slaughter_records MODIFY animal_type ENUM(
        'premium_cow','standard_cow','waqf_cow','exclusive_cow',
        'premium_goat','super_goat','exclusive_goat'
      ) NOT NULL
    `);
  } catch (e) {
    logError("SLAUGHTER", "Enum migration (exclusive_goat)", e);
  }
}

async function fetchRoleSlaughterFlags(db, userId) {
  const [rows] = await db.execute(
    `SELECT r.operation_management, r.operation_rider_management,
            r.operation_rider_management_supervisor, r.operation_slaughter_management
     FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?`,
    [userId]
  );
  return rows[0] || null;
}

function requireSlaughterAccess(req, res, flags) {
  const parent =
    !!flags?.operation_management ||
    !!flags?.operation_rider_management ||
    !!flags?.operation_rider_management_supervisor;
  if (!parent) {
    res.status(403).json({ message: "Operations access denied" });
    return false;
  }
  if (!flags?.operation_slaughter_management) {
    res.status(403).json({ message: "Slaughter Management access denied" });
    return false;
  }
  return true;
}

async function assertSlaughter(req, res, db) {
  const flags = await fetchRoleSlaughterFlags(db, req.userId);
  if (!flags || !requireSlaughterAccess(req, res, flags)) return null;
  return flags;
}

async function getUsedSequences(db, day, animalType) {
  const [rows] = await db.execute(
    `SELECT animal_number FROM slaughter_records WHERE day = ? AND animal_type = ?`,
    [day, animalType]
  );
  const used = new Set();
  for (const row of rows) {
    const seq = parseSequence(animalType, row.animal_number);
    if (seq != null) used.add(seq);
  }
  return used;
}

/** Lowest unused sequence for this day + type (fills gaps after deletes). */
async function computeNextNumber(db, day, animalType) {
  const used = await getUsedSequences(db, day, animalType);
  let seq = 1;
  while (used.has(seq)) seq += 1;
  return formatNumber(animalType, seq);
}

/**
 * Returns normalized number or sends 409/400 on res and returns null.
 * @param {number|null} excludeSlaughterId
 */
async function resolveAnimalNumber(db, res, { day, animalType, rawNumber, excludeSlaughterId = null }) {
  let animal_number;
  const userProvided = rawNumber !== undefined && rawNumber !== null && String(rawNumber).trim() !== "";

  if (userProvided) {
    animal_number = normalizeNumberInput(animalType, rawNumber);
    if (!animal_number) {
      res.status(400).json({ message: "Invalid animal number format" });
      return null;
    }
  } else {
    animal_number = await computeNextNumber(db, day, animalType);
    return animal_number;
  }

  const params = [day, animalType, animal_number];
  let sql = `SELECT slaughter_id FROM slaughter_records
             WHERE day = ? AND animal_type = ? AND UPPER(TRIM(animal_number)) = UPPER(TRIM(?))`;
  if (excludeSlaughterId != null) {
    sql += ` AND slaughter_id != ?`;
    params.push(excludeSlaughterId);
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

/**
 * @param {object} app
 * @param {import("mysql2/promise").Pool} db
 * @param {Function} verifyToken
 */
export const registerSlaughterRoutes = (app, db, verifyToken) => {
  ensureSlaughterTables(db).catch((e) => logError("SLAUGHTER", "Ensure tables failed", e));

  app.get("/api/operations/slaughter/dashboard", verifyToken, async (req, res) => {
    try {
      if (!(await assertSlaughter(req, res, db))) return;
      const day = parseDay(req.query.day);
      if (!day) return res.status(400).json({ message: "Invalid day (use 1, 2, or 3)" });

      const [groups] = await db.execute(
        `SELECT group_id, group_name, day, created_at
         FROM slaughter_qassai_groups WHERE day = ? ORDER BY group_id ASC`,
        [day]
      );

      const [statsRows] = await db.execute(
        `SELECT group_id, animal_type,
                COUNT(*) AS start_cnt,
                SUM(slaughter_end_time IS NOT NULL) AS end_cnt
         FROM slaughter_records WHERE day = ?
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
        stats: statsMap[g.group_id] || {},
      }));

      res.json({ day, groups: data });
    } catch (error) {
      logError("SLAUGHTER", "Dashboard error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/slaughter/next-number", verifyToken, async (req, res) => {
    try {
      if (!(await assertSlaughter(req, res, db))) return;
      const day = parseDay(req.query.day);
      const animalType = String(req.query.type || "").trim();
      if (!day) return res.status(400).json({ message: "Invalid day" });
      if (!VALID_TYPES.has(animalType)) return res.status(400).json({ message: "Invalid animal type" });
      const animal_number = await computeNextNumber(db, day, animalType);
      res.json({ animal_number });
    } catch (error) {
      logError("SLAUGHTER", "Next number error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/operations/slaughter/groups", verifyToken, async (req, res) => {
    try {
      if (!(await assertSlaughter(req, res, db))) return;
      const day = parseDay(req.body?.day);
      const group_name = String(req.body?.group_name || "").trim();
      if (!day) return res.status(400).json({ message: "Invalid day" });
      if (!group_name) return res.status(400).json({ message: "Group name is required" });

      const [result] = await db.execute(
        `INSERT INTO slaughter_qassai_groups (group_name, day) VALUES (?, ?)`,
        [group_name, day]
      );
      res.status(201).json({
        group_id: result.insertId,
        group_name,
        day,
        stats: {},
      });
    } catch (error) {
      logError("SLAUGHTER", "Create group error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/slaughter/groups/:groupId/slaughters", verifyToken, async (req, res) => {
    try {
      if (!(await assertSlaughter(req, res, db))) return;
      const day = parseDay(req.query.day);
      const groupId = Number(req.params.groupId);
      if (!day || !Number.isFinite(groupId)) return res.status(400).json({ message: "Invalid request" });

      const [rows] = await db.execute(
        `SELECT s.slaughter_id, s.group_id, s.day, s.animal_type, s.animal_number,
                s.slaughter_time, s.slaughter_end_time, g.group_name
         FROM slaughter_records s
         JOIN slaughter_qassai_groups g ON g.group_id = s.group_id
         WHERE s.group_id = ? AND s.day = ?
         ORDER BY s.slaughter_time DESC, s.slaughter_id DESC`,
        [groupId, day]
      );

      res.json({
        slaughters: rows.map((r) => ({
          ...r,
          slaughter_time: formatRowTime(r.slaughter_time),
          slaughter_end_time: formatRowTime(r.slaughter_end_time),
        })),
      });
    } catch (error) {
      logError("SLAUGHTER", "List group slaughters error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/slaughter/pending-number", verifyToken, async (req, res) => {
    try {
      if (!(await assertSlaughter(req, res, db))) return;
      const day = parseDay(req.query.day);
      const groupId = Number(req.query.group_id);
      const animalType = String(req.query.type || "").trim();
      if (!day || !Number.isFinite(groupId) || !VALID_TYPES.has(animalType)) {
        return res.status(400).json({ message: "Invalid request" });
      }

      const [rows] = await db.execute(
        `SELECT slaughter_id, animal_number FROM slaughter_records
         WHERE group_id = ? AND day = ? AND animal_type = ? AND slaughter_end_time IS NULL
         ORDER BY slaughter_time ASC, slaughter_id ASC
         LIMIT 1`,
        [groupId, day, animalType]
      );

      if (!rows.length) {
        return res.json({ slaughter_id: null, animal_number: "" });
      }
      res.json({
        slaughter_id: rows[0].slaughter_id,
        animal_number: rows[0].animal_number,
      });
    } catch (error) {
      logError("SLAUGHTER", "Pending number error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/operations/slaughter/slaughters/end", verifyToken, async (req, res) => {
    try {
      if (!(await assertSlaughter(req, res, db))) return;
      const day = parseDay(req.body?.day);
      const groupId = Number(req.body?.group_id);
      const animalType = String(req.body?.animal_type || "").trim();
      if (!day || !Number.isFinite(groupId)) return res.status(400).json({ message: "Invalid request" });
      if (!VALID_TYPES.has(animalType)) return res.status(400).json({ message: "Invalid animal type" });

      const [groupRows] = await db.execute(
        `SELECT group_id FROM slaughter_qassai_groups WHERE group_id = ? AND day = ?`,
        [groupId, day]
      );
      if (!groupRows.length) return res.status(404).json({ message: "Qassai group not found for this day" });

      const rawNumber = req.body?.animal_number;
      let targetRow = null;

      if (rawNumber !== undefined && String(rawNumber).trim() !== "") {
        const animal_number = normalizeNumberInput(animalType, rawNumber);
        if (!animal_number) return res.status(400).json({ message: "Invalid animal number format" });
        const [byNumber] = await db.execute(
          `SELECT slaughter_id, animal_number, slaughter_end_time FROM slaughter_records
           WHERE group_id = ? AND day = ? AND animal_type = ?
             AND UPPER(TRIM(animal_number)) = UPPER(TRIM(?))
           LIMIT 1`,
          [groupId, day, animalType, animal_number]
        );
        if (!byNumber.length) {
          return res.status(404).json({ message: "No matching slaughter start found for this number" });
        }
        if (byNumber[0].slaughter_end_time) {
          return res.status(409).json({ message: "This slaughter already has an end time recorded" });
        }
        targetRow = byNumber[0];
      } else {
        const [pending] = await db.execute(
          `SELECT slaughter_id, animal_number FROM slaughter_records
           WHERE group_id = ? AND day = ? AND animal_type = ? AND slaughter_end_time IS NULL
           ORDER BY slaughter_time ASC, slaughter_id ASC
           LIMIT 1`,
          [groupId, day, animalType]
        );
        if (!pending.length) {
          return res.status(404).json({ message: "No pending slaughter start for this type in this group" });
        }
        targetRow = pending[0];
      }

      const slaughter_end_time = toMysqlDatetime(req.body?.slaughter_end_time);

      await db.execute(
        `UPDATE slaughter_records SET slaughter_end_time = ? WHERE slaughter_id = ?`,
        [slaughter_end_time, targetRow.slaughter_id]
      );

      res.json({
        slaughter_id: targetRow.slaughter_id,
        group_id: groupId,
        day,
        animal_type: animalType,
        animal_number: targetRow.animal_number,
        slaughter_end_time: formatRowTime(slaughter_end_time),
      });
    } catch (error) {
      logError("SLAUGHTER", "Slaughter end error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/operations/slaughter/slaughters", verifyToken, async (req, res) => {
    try {
      if (!(await assertSlaughter(req, res, db))) return;
      const day = parseDay(req.body?.day);
      const groupId = Number(req.body?.group_id);
      const animalType = String(req.body?.animal_type || "").trim();
      if (!day || !Number.isFinite(groupId)) return res.status(400).json({ message: "Invalid request" });
      if (!VALID_TYPES.has(animalType)) return res.status(400).json({ message: "Invalid animal type" });

      const [groupRows] = await db.execute(
        `SELECT group_id FROM slaughter_qassai_groups WHERE group_id = ? AND day = ?`,
        [groupId, day]
      );
      if (!groupRows.length) return res.status(404).json({ message: "Qassai group not found for this day" });

      const animal_number = await resolveAnimalNumber(db, res, {
        day,
        animalType,
        rawNumber: req.body?.animal_number,
      });
      if (!animal_number) return;

      const slaughter_time = toMysqlDatetime(req.body?.slaughter_time);

      const [result] = await db.execute(
        `INSERT INTO slaughter_records (group_id, day, animal_type, animal_number, slaughter_time)
         VALUES (?, ?, ?, ?, ?)`,
        [groupId, day, animalType, animal_number, slaughter_time]
      );

      res.status(201).json({
        slaughter_id: result.insertId,
        group_id: groupId,
        day,
        animal_type: animalType,
        animal_number,
        slaughter_time: formatRowTime(slaughter_time),
      });
    } catch (error) {
      logError("SLAUGHTER", "Create slaughter error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/operations/slaughter/slaughters/:id", verifyToken, async (req, res) => {
    try {
      if (!(await assertSlaughter(req, res, db))) return;
      const slaughterId = Number(req.params.id);
      if (!Number.isFinite(slaughterId)) return res.status(400).json({ message: "Invalid slaughter id" });

      const [existing] = await db.execute(
        `SELECT * FROM slaughter_records WHERE slaughter_id = ?`,
        [slaughterId]
      );
      if (!existing.length) return res.status(404).json({ message: "Slaughter not found" });

      const row = existing[0];
      const animalType = req.body?.animal_type
        ? String(req.body.animal_type).trim()
        : row.animal_type;
      if (!VALID_TYPES.has(animalType)) return res.status(400).json({ message: "Invalid animal type" });

      const slaughter_time =
        req.body?.slaughter_time !== undefined
          ? toMysqlDatetime(req.body.slaughter_time)
          : row.slaughter_time;

      const slaughter_end_time =
        req.body?.slaughter_end_time !== undefined
          ? req.body.slaughter_end_time
            ? toMysqlDatetime(req.body.slaughter_end_time)
            : null
          : row.slaughter_end_time;

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
        excludeSlaughterId: slaughterId,
      });
      if (!animal_number) return;

      await db.execute(
        `UPDATE slaughter_records
         SET group_id = ?, day = ?, animal_type = ?, animal_number = ?,
             slaughter_time = ?, slaughter_end_time = ?
         WHERE slaughter_id = ?`,
        [groupId, day, animalType, animal_number, slaughter_time, slaughter_end_time, slaughterId]
      );

      res.json({
        slaughter_id: slaughterId,
        group_id: groupId,
        day,
        animal_type: animalType,
        animal_number,
        slaughter_time: formatRowTime(slaughter_time),
        slaughter_end_time: formatRowTime(slaughter_end_time),
      });
    } catch (error) {
      logError("SLAUGHTER", "Update slaughter error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/operations/slaughter/slaughters/:id", verifyToken, async (req, res) => {
    try {
      if (!(await assertSlaughter(req, res, db))) return;
      const slaughterId = Number(req.params.id);
      if (!Number.isFinite(slaughterId)) return res.status(400).json({ message: "Invalid slaughter id" });

      const [result] = await db.execute(
        `DELETE FROM slaughter_records WHERE slaughter_id = ?`,
        [slaughterId]
      );
      if (result.affectedRows === 0) return res.status(404).json({ message: "Slaughter not found" });
      res.json({ message: "Deleted" });
    } catch (error) {
      logError("SLAUGHTER", "Delete slaughter error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/slaughter/records", verifyToken, async (req, res) => {
    try {
      if (!(await assertSlaughter(req, res, db))) return;

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const offset = (page - 1) * limit;

      const conditions = [];
      const params = [];

      const day = parseDay(req.query.day);
      if (day) {
        conditions.push("s.day = ?");
        params.push(day);
      }

      const animalType = String(req.query.type || "").trim();
      if (animalType && VALID_TYPES.has(animalType)) {
        conditions.push("s.animal_type = ?");
        params.push(animalType);
      }

      const groupId = Number(req.query.group_id);
      if (Number.isFinite(groupId) && groupId > 0) {
        conditions.push("s.group_id = ?");
        params.push(groupId);
      }

      const search = String(req.query.search || "").trim();
      if (search) {
        conditions.push(
          "(g.group_name LIKE ? OR s.animal_number LIKE ? OR CAST(s.slaughter_id AS CHAR) LIKE ?)"
        );
        const like = `%${search}%`;
        params.push(like, like, like);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [countRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM slaughter_records s
         JOIN slaughter_qassai_groups g ON g.group_id = s.group_id
         ${where}`,
        params
      );
      const total = Number(countRows[0]?.total) || 0;

      const [rows] = await db.execute(
        `SELECT s.slaughter_id, s.group_id, g.group_name, s.day, s.animal_type,
                s.animal_number, s.slaughter_time, s.slaughter_end_time, s.created_at
         FROM slaughter_records s
         JOIN slaughter_qassai_groups g ON g.group_id = s.group_id
         ${where}
         ORDER BY s.slaughter_time DESC, s.slaughter_id DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params
      );

      res.json({
        data: rows.map((r) => ({
          ...r,
          slaughter_time: formatRowTime(r.slaughter_time),
          slaughter_end_time: formatRowTime(r.slaughter_end_time),
        })),
        total,
        page,
        limit,
      });
    } catch (error) {
      logError("SLAUGHTER", "Records list error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/slaughter/filters", verifyToken, async (req, res) => {
    try {
      if (!(await assertSlaughter(req, res, db))) return;
      const [groups] = await db.execute(
        `SELECT group_id, group_name, day FROM slaughter_qassai_groups ORDER BY day, group_id`
      );
      res.json({ groups });
    } catch (error) {
      logError("SLAUGHTER", "Filters error", error);
      res.status(500).json({ message: "Server error" });
    }
  });
};
