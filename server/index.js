import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";

import { createVerifyToken } from "./middleware/auth.js";
import { registerPasswordResetRoutes } from "./routes/passwordReset.js";
import { registerOAuthRoutes } from "./routes/oauth.js";
import { registerControlRoutes } from "./routes/control.js";
import { registerBookingRoutes } from "./routes/booking.js";
import { registerDashboardRoutes } from "./routes/dashboardRoutes.js";
import { registerPerformanceRoutes } from "./routes/performanceRoutes.js";
import { registerAccountingRoutes } from "./routes/accountingRoutes.js";
import { buildPermissionsFromRoleRow } from "./utils/userPermissions.js";
import { log, logError } from "./utils/logger.js";
import { writeAuditLog } from "./utils/auditLog.js";
import { sendLoginNotificationEmail } from "./utils/email.js";
import { ensurePasswordResetTable } from "./utils/ensurePasswordResetTable.js";
import { ensureExpenseBankSplits } from "./utils/ensureExpenseBankSplits.js";
import { registerBatchRoutes } from "./routes/batchRoutes.js";
import { registerOrderTypePriceRoutes } from "./routes/orderTypePriceRoutes.js";
import { registerAccountingDashboardRoutes } from "./routes/AccountingDashboardRoutes.js";
import { registerOperationsRoutes } from "./routes/operationsRoutes.js";

dotenv.config();

const app = express();
app.set("trust proxy", 1);

function resolveCorsOrigins() {
  const raw = process.env.CLIENT_ORIGIN || process.env.CLIENT_URL || "*";
  const list = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length || list.includes("*")) return "*";
  return list;
}

app.use(cors({ origin: resolveCorsOrigins() }));
app.use(express.json());

const ROLE_SELECT = `
  r.control_management, r.booking_management, r.operation_management,
  r.operation_general_dashboard, r.operation_customer_support, r.operation_rider_management,
  r.operation_rider_management_supervisor, r.operation_deliveries_management, r.operation_challan_management,
  r.operation_affluent_management, r.operation_special_request_management,
  r.operation_slaughter_management, r.operation_line_management,
  r.farm_management, r.procurement_management, r.accounting_and_finance, r.performance_management
`;

const startServer = async () => {
  try {
    const db = await mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    console.log("Connected to MySQL Database");
    await ensurePasswordResetTable(db);
    await ensureExpenseBankSplits(db);

    const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_key";
    const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
    const SESSION_EXPIRY_HOURS = Math.max(1, Math.min(168, parseInt(process.env.SESSION_EXPIRY_HOURS, 10) || 11));
    const verifyToken = createVerifyToken(db, JWT_SECRET);

    app.post("/api/login", async (req, res) => {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Please enter username and password." });
      }
      try {
        const [rows] = await db.execute(
          `SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, u.password, u.role_id, u.terms_accepted_at, u.has_prev_logged_in,
            r.role_name, ${ROLE_SELECT}
           FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.username = ?`,
          [username]
        );
        if (rows.length === 0) return res.status(401).json({ message: "Invalid credentials" });
        const user = rows[0];
        if (!(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: "Invalid credentials" });

        await db.execute("UPDATE users SET last_login_at = NOW() WHERE user_id = ?", [user.user_id]);
        const sessionId = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + SESSION_EXPIRY_HOURS);
        let refreshToken = crypto.randomBytes(32).toString("hex");
        try {
          await db.execute(
            `INSERT INTO user_sessions (session_id, user_id, ip_address, user_agent, expires_at, refresh_token) VALUES (?, ?, ?, ?, ?, ?)`,
            [sessionId, user.user_id, req.ip, req.get("user-agent"), expiresAt, refreshToken]
          );
        } catch {
          await db.execute(
            `INSERT INTO user_sessions (session_id, user_id, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)`,
            [sessionId, user.user_id, req.ip, req.get("user-agent"), expiresAt]
          );
          refreshToken = null;
        }

        const permissions = buildPermissionsFromRoleRow(user);
        const token = jwt.sign(
          { id: user.user_id, username: user.username, role: user.role_name, role_id: user.role_id, sessionId, permissions },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES_IN }
        );

        if (user.email) {
          const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username;
          sendLoginNotificationEmail(user.email, fullName, user.username, new Date()).catch(() => {});
        }

        res.json({
          token,
          ...(refreshToken && { refreshToken }),
          sessionId,
          user: {
            id: user.user_id,
            username: user.username,
            email: user.email,
            role: user.role_name,
            role_id: user.role_id,
            permissions,
            terms_accepted_at: user.terms_accepted_at || null,
            has_prev_logged_in: user.has_prev_logged_in != null ? !!user.has_prev_logged_in : user.terms_accepted_at != null,
          },
        });
      } catch (error) {
        logError("AUTH", "Login error", error);
        res.status(500).json({ message: "Something went wrong." });
      }
    });

    app.get("/api/me", verifyToken, async (req, res) => {
      try {
        const [rows] = await db.execute(
          `SELECT u.user_id, u.username, u.email, u.role_id, u.terms_accepted_at, u.has_prev_logged_in,
            r.role_name, ${ROLE_SELECT}
           FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?`,
          [req.userId]
        );
        if (!rows.length) return res.status(404).json({ message: "User not found" });
        const user = rows[0];
        res.json({
          user: {
            id: user.user_id,
            username: user.username,
            email: user.email,
            role: user.role_name,
            role_id: user.role_id,
            permissions: buildPermissionsFromRoleRow(user),
            terms_accepted_at: user.terms_accepted_at || null,
            has_prev_logged_in: user.has_prev_logged_in != null ? !!user.has_prev_logged_in : user.terms_accepted_at != null,
          },
        });
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    app.post("/api/accept-terms", verifyToken, async (req, res) => {
      try {
        await db.execute("UPDATE users SET terms_accepted_at = NOW(), has_prev_logged_in = 1 WHERE user_id = ?", [req.userId]);
        const [rows] = await db.execute(
          `SELECT u.user_id, u.username, u.email, u.role_id, u.terms_accepted_at, u.has_prev_logged_in,
            r.role_name, ${ROLE_SELECT}
           FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?`,
          [req.userId]
        );
        const u = rows[0];
        res.json({
          user: {
            id: u.user_id,
            username: u.username,
            email: u.email,
            role: u.role_name,
            role_id: u.role_id,
            permissions: buildPermissionsFromRoleRow(u),
            terms_accepted_at: u.terms_accepted_at,
            has_prev_logged_in: !!u.has_prev_logged_in,
          },
        });
      } catch {
        res.status(500).json({ message: "Server error" });
      }
    });

    app.post("/api/refresh", async (req, res) => {
      const refreshToken = req.body?.refreshToken || req.headers["x-refresh-token"];
      if (!refreshToken) return res.status(401).json({ message: "Refresh token required" });
      try {
        const [sessions] = await db.execute(
          "SELECT session_id, user_id FROM user_sessions WHERE refresh_token = ? AND is_active = 1 AND expires_at > NOW()",
          [refreshToken.trim()]
        );
        if (!sessions.length) return res.status(401).json({ message: "Invalid refresh token" });
        const [rows] = await db.execute(
          `SELECT u.user_id, u.username, u.email, u.role_id, r.role_name, ${ROLE_SELECT}
           FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?`,
          [sessions[0].user_id]
        );
        if (!rows.length) return res.status(401).json({ message: "User not found" });
        const user = rows[0];
        const token = jwt.sign(
          { id: user.user_id, username: user.username, role: user.role_name, role_id: user.role_id, sessionId: sessions[0].session_id, permissions: buildPermissionsFromRoleRow(user) },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES_IN }
        );
        res.json({ token });
      } catch {
        res.status(500).json({ message: "Server error" });
      }
    });

    app.post("/api/logout", async (req, res) => {
      const refreshToken = req.body?.refreshToken;
      if (refreshToken) {
        const [sessions] = await db.execute("SELECT session_id FROM user_sessions WHERE refresh_token = ? AND is_active = 1", [refreshToken.trim()]);
        if (sessions.length) await db.execute("UPDATE user_sessions SET is_active = FALSE WHERE session_id = ?", [sessions[0].session_id]);
        return res.json({ message: "Logged out" });
      }
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) return res.json({ message: "Logged out" });
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.sessionId) await db.execute("UPDATE user_sessions SET is_active = FALSE WHERE session_id = ?", [decoded.sessionId]);
      } catch { /* ignore */ }
      res.json({ message: "Logged out" });
    });

    registerPasswordResetRoutes(app, db);
    registerOAuthRoutes(app, db, JWT_SECRET);
    registerControlRoutes(app, db, verifyToken);
    registerBookingRoutes(app, db, verifyToken);
    registerBatchRoutes(app, db, verifyToken);
    registerOrderTypePriceRoutes(app, db, verifyToken);
    registerDashboardRoutes(app, db, verifyToken);
    registerAccountingDashboardRoutes(app, db, verifyToken);
    registerPerformanceRoutes(app, db, verifyToken);
    registerAccountingRoutes(app, db, verifyToken);
    registerOperationsRoutes(app, db, verifyToken);

    app.use((req, res) => res.status(404).json({ message: `Not Found - ${req.path}` }));

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      log("SERVER", "Server started", { port: PORT });
      console.log(`Mango CRM server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    logError("SERVER", "Database connection failed", error);
    process.exit(1);
  }
};

startServer();
