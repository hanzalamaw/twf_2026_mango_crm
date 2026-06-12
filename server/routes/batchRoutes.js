import { log, logError } from "../utils/logger.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { buildBatchReceivedYearWhere, buildBatchCreatedYearWhere } from "../utils/yearFilter.js";

function toDateOnly(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function normalizeBatchRow(row) {
  return {
    batch_id: row.batch_id,
    batch_number: row.batch_number,
    received_in_kgs: Number(row.received_in_kgs || 0),
    received_in_units: Number(row.received_in_units || 0),
    rotten: Number(row.rotten || 0),
    compensation_or_gift: Number(row.compensation_or_gift || 0),
    weight_loss: Number(row.weight_loss || 0),
    description: row.description || "",
    received_date: toDateOnly(row.received_date),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function registerBatchRoutes(app, db, verifyToken) {
  app.get("/api/batches", verifyToken, async (req, res) => {
    try {
      const { year = "all", created_year } = req.query;
      const params = [];
      const yearConditions = created_year
        ? buildBatchCreatedYearWhere(created_year, params, "b")
        : buildBatchReceivedYearWhere(year, params, "b");
      const where = yearConditions.length ? `WHERE ${yearConditions.join(" AND ")}` : "";
      const [rows] = await db.execute(
        `SELECT b.* FROM batches b
         ${where}
         ORDER BY CAST(b.batch_number AS UNSIGNED) ASC, b.batch_number ASC`,
        params
      );
      res.json({ data: rows.map(normalizeBatchRow) });
    } catch (e) {
      logError("BATCH", "List error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/batches/latest", verifyToken, async (_req, res) => {
    try {
      const [rows] = await db.execute(
        `SELECT * FROM batches
         ORDER BY CAST(batch_number AS UNSIGNED) DESC, batch_number DESC
         LIMIT 1`
      );
      res.json({ batch: rows.length ? normalizeBatchRow(rows[0]) : null });
    } catch (e) {
      logError("BATCH", "Latest error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/batches", verifyToken, async (req, res) => {
    try {
      const body = req.body || {};
      const batch_number = String(body.batch_number || "").trim();
      if (!batch_number) return res.status(400).json({ message: "Batch number is required" });

      const [existing] = await db.execute("SELECT batch_id FROM batches WHERE batch_number = ?", [batch_number]);
      if (existing.length) return res.status(400).json({ message: "Batch number already exists" });

      const [result] = await db.execute(
        `INSERT INTO batches (
          batch_number, received_in_kgs, received_in_units, rotten,
          compensation_or_gift, weight_loss, description, received_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batch_number,
          Math.max(0, Number(body.received_in_kgs) || 0),
          Math.max(0, parseInt(body.received_in_units, 10) || 0),
          Math.max(0, Number(body.rotten) || 0),
          Math.max(0, Number(body.compensation_or_gift) || 0),
          Math.max(0, Number(body.weight_loss) || 0),
          body.description ? String(body.description).trim() : null,
          body.received_date ? toDateOnly(body.received_date) : null,
        ]
      );

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "CREATE_BATCH",
        entity_type: "batches",
        entity_id: String(result.insertId),
        new_values: body,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      log("BATCH", "Created", { batch_id: result.insertId, batch_number });
      res.json({ message: "Batch created", batch_id: result.insertId });
    } catch (e) {
      logError("BATCH", "Create error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/batches/:batchId", verifyToken, async (req, res) => {
    try {
      const { batchId } = req.params;
      const body = req.body || {};
      const [oldRows] = await db.execute("SELECT * FROM batches WHERE batch_id = ?", [batchId]);
      if (!oldRows.length) return res.status(404).json({ message: "Batch not found" });

      const batch_number = String(body.batch_number ?? oldRows[0].batch_number).trim();
      if (!batch_number) return res.status(400).json({ message: "Batch number is required" });

      const [dup] = await db.execute(
        "SELECT batch_id FROM batches WHERE batch_number = ? AND batch_id != ?",
        [batch_number, batchId]
      );
      if (dup.length) return res.status(400).json({ message: "Batch number already exists" });

      const oldNumber = oldRows[0].batch_number;
      await db.execute(
        `UPDATE batches SET
          batch_number = ?, received_in_kgs = ?, received_in_units = ?, rotten = ?,
          compensation_or_gift = ?, weight_loss = ?, description = ?, received_date = ?
         WHERE batch_id = ?`,
        [
          batch_number,
          Math.max(0, Number(body.received_in_kgs ?? oldRows[0].received_in_kgs) || 0),
          Math.max(0, parseInt(body.received_in_units ?? oldRows[0].received_in_units, 10) || 0),
          Math.max(0, Number(body.rotten ?? oldRows[0].rotten) || 0),
          Math.max(0, Number(body.compensation_or_gift ?? oldRows[0].compensation_or_gift) || 0),
          Math.max(0, Number(body.weight_loss ?? oldRows[0].weight_loss) || 0),
          body.description !== undefined ? (String(body.description).trim() || null) : oldRows[0].description,
          body.received_date !== undefined ? toDateOnly(body.received_date) : oldRows[0].received_date,
          batchId,
        ]
      );

      if (oldNumber !== batch_number) {
        await db.execute("UPDATE orders SET batch = ? WHERE batch = ?", [batch_number, oldNumber]);
      }

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "UPDATE_BATCH",
        entity_type: "batches",
        entity_id: batchId,
        old_values: oldRows[0],
        new_values: body,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      res.json({ message: "Batch updated" });
    } catch (e) {
      logError("BATCH", "Update error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/batches/:batchId", verifyToken, async (req, res) => {
    try {
      const { batchId } = req.params;
      const [rows] = await db.execute("SELECT * FROM batches WHERE batch_id = ?", [batchId]);
      if (!rows.length) return res.status(404).json({ message: "Batch not found" });

      const batch_number = rows[0].batch_number;
      const [orderRefs] = await db.execute("SELECT COUNT(*) AS cnt FROM orders WHERE batch = ?", [batch_number]);
      if (Number(orderRefs[0]?.cnt || 0) > 0) {
        return res.status(400).json({ message: "Cannot delete batch — orders are linked to it" });
      }

      await db.execute("DELETE FROM batches WHERE batch_id = ?", [batchId]);
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "DELETE_BATCH",
        entity_type: "batches",
        entity_id: batchId,
        new_values: rows[0],
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      res.json({ message: "Batch deleted" });
    } catch (e) {
      logError("BATCH", "Delete error", e);
      res.status(500).json({ message: "Server error" });
    }
  });
}
