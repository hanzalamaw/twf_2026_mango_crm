import multer from "multer";
import { logError } from "../utils/logger.js";
import { uploadRiderPhoto, deleteRiderPhoto } from "../utils/googleDriveUpload.js";

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

const ATTENDANCE_DAYS = ["Day 1", "Day 2", "Day 3"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function normalizeDayLabel(d) {
  const n = String(d || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (n === "day 1" || n === "day1" || n === "1") return "Day 1";
  if (n === "day 2" || n === "day2" || n === "2") return "Day 2";
  if (n === "day 3" || n === "day3" || n === "3") return "Day 3";
  return String(d || "").trim();
}

function requireOperationParent(flags) {
  return (
    !!flags?.operation_management ||
    !!flags?.operation_rider_management ||
    !!flags?.operation_rider_management_supervisor
  );
}

async function assertRiderAttendanceAccess(req, res, db) {
  const flags = await fetchRoleOpsFlags(db, req.userId);
  if (!requireOperationParent(flags)) {
    res.status(403).json({ message: "Insufficient operations permission" });
    return null;
  }
  if (!flags.operation_rider_management) {
    res.status(403).json({ message: "Insufficient operations permission" });
    return null;
  }
  return flags;
}

async function riderExists(db, riderId) {
  const [rows] = await db.execute(
    `SELECT rider_id FROM riders WHERE rider_id = ? AND (status = 'active' OR status IS NULL)`,
    [riderId]
  );
  return rows.length > 0;
}

export const registerRiderAttendanceRoutes = (app, db, verifyToken) => {
  app.delete("/api/riders/attendance/:attendanceId", verifyToken, async (req, res) => {
    try {
      if (!(await assertRiderAttendanceAccess(req, res, db))) return;

      const attendanceId = Number(req.params.attendanceId);
      if (!Number.isFinite(attendanceId) || attendanceId <= 0) {
        return res.status(400).json({ message: "Invalid attendance id" });
      }

      const [rows] = await db.execute(
        `SELECT id, rider_id, day_label, photo_drive_file_id FROM rider_attendance WHERE id = ?`,
        [attendanceId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ message: "Attendance record not found" });
      }

      const record = rows[0];
      if (record.photo_drive_file_id) {
        await deleteRiderPhoto(record.photo_drive_file_id);
      }

      await db.execute(`DELETE FROM rider_attendance WHERE id = ?`, [attendanceId]);
      res.json({ message: "Attendance deleted" });
    } catch (error) {
      logError("RIDER_ATTENDANCE", "Delete attendance error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/riders/:riderId/attendance", verifyToken, async (req, res) => {
    try {
      if (!(await assertRiderAttendanceAccess(req, res, db))) return;

      const riderId = Number(req.params.riderId);
      if (!Number.isFinite(riderId) || riderId <= 0) {
        return res.status(400).json({ message: "Invalid rider id" });
      }

      if (!(await riderExists(db, riderId))) {
        return res.status(404).json({ message: "Rider not found" });
      }

      const [records] = await db.execute(
        `SELECT id, day_label, check_in_time, photo_url
         FROM rider_attendance
         WHERE rider_id = ?
         ORDER BY FIELD(day_label, 'Day 1', 'Day 2', 'Day 3'), check_in_time ASC`,
        [riderId]
      );

      res.json(records);
    } catch (error) {
      logError("RIDER_ATTENDANCE", "List attendance error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post(
    "/api/riders/:riderId/attendance",
    verifyToken,
    upload.single("photo"),
    async (req, res) => {
      try {
        if (!(await assertRiderAttendanceAccess(req, res, db))) return;

        const riderId = Number(req.params.riderId);
        if (!Number.isFinite(riderId) || riderId <= 0) {
          return res.status(400).json({ message: "Invalid rider id" });
        }

        if (!(await riderExists(db, riderId))) {
          return res.status(404).json({ message: "Rider not found" });
        }

        const dayLabel = normalizeDayLabel(req.body?.day_label);
        if (!ATTENDANCE_DAYS.includes(dayLabel)) {
          return res.status(400).json({ message: "day_label must be Day 1, Day 2, or Day 3" });
        }

        const [existing] = await db.execute(
          `SELECT id FROM rider_attendance WHERE rider_id = ? AND day_label = ?`,
          [riderId, dayLabel]
        );
        if (existing.length > 0) {
          return res.status(409).json({
            message: `Attendance already marked for ${dayLabel}`,
          });
        }

        let photoUrl = null;
        let photoDriveFileId = null;

        if (req.file?.buffer) {
          const ext = (req.file.originalname || "").split(".").pop() || "jpg";
          const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext : "jpg";
          const fileName = `rider-${riderId}-${dayLabel.replace(/\s+/g, "-")}-${Date.now()}.${safeExt}`;
          try {
            const uploaded = await uploadRiderPhoto(req.file.buffer, fileName);
            photoUrl = uploaded.photoUrl;
            photoDriveFileId = uploaded.fileId;
          } catch (uploadErr) {
            logError("RIDER_ATTENDANCE", "Google Drive upload failed", uploadErr);
            const userMessage = uploadErr?.message || "Failed to upload photo.";
            return res.status(500).json({ message: userMessage });
          }
        }

        try {
          const [result] = await db.execute(
            `INSERT INTO rider_attendance (rider_id, day_label, check_in_time, photo_url, photo_drive_file_id)
             VALUES (?, ?, NOW(), ?, ?)`,
            [riderId, dayLabel, photoUrl, photoDriveFileId]
          );

          const [inserted] = await db.execute(
            `SELECT id, day_label, check_in_time, photo_url FROM rider_attendance WHERE id = ?`,
            [result.insertId]
          );

          res.status(201).json({
            message: "Attendance marked",
            attendance: inserted[0] || null,
          });
        } catch (insertErr) {
          if (photoDriveFileId) {
            await deleteRiderPhoto(photoDriveFileId);
          }
          if (insertErr?.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
              message: `Attendance already marked for ${dayLabel}`,
            });
          }
          throw insertErr;
        }
      } catch (error) {
        logError("RIDER_ATTENDANCE", "Mark attendance error", error);
        res.status(500).json({ message: "Server error" });
      }
    }
  );
};
