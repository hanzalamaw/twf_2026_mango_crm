import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
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
import { registerNewQueryRoutes } from "./routes/newqueryRoutes.js";
import { registerPerformanceRoutes } from "./routes/performanceRoutes.js";
import { registerFarmRoutes } from "./routes/farmRoutes.js";
import { registerProcurementRoutes } from "./routes/procurement.js";
import { registerAccountingRoutes } from "./routes/accountingRoutes.js";
import { registerOperationsRoutes } from "./routes/operationsRoutes.js";
import { registerRiderAttendanceRoutes } from "./routes/riderAttendanceRoutes.js";
import { registerSlaughterRoutes } from "./routes/slaughterRoutes.js";
import { registerLineRoutes } from "./routes/lineRoutes.js";
import { buildPermissionsFromRoleRow } from "./utils/userPermissions.js";
import { log, logError } from "./utils/logger.js";
import { writeAuditLog } from "./utils/auditLog.js";
import { sendLoginNotificationEmail } from "./utils/email.js";
import { ensurePasswordResetTable } from "./utils/ensurePasswordResetTable.js";
import { registerAccountingDashboardRoutes } from "./routes/AccountingDashboardRoutes.js";

dotenv.config();

const app = express();
app.set("trust proxy", 1);

function resolveSocketCorsOrigins() {
  const raw = process.env.CLIENT_ORIGIN || process.env.CLIENT_URL || "*";
  const list = String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!list.length || list.includes("*")) return "*";
  return list;
}

// Socket.IO — real-time Operations updates (challans, riders, supervisors).
// Path defaults to /api/socket.io so it is proxied with /api on nginx/Apache (root /socket.io often serves SPA HTML).
const SOCKET_IO_PATH = String(process.env.SOCKET_IO_PATH || "/api/socket.io").trim() || "/api/socket.io";
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  path: SOCKET_IO_PATH,
  cors: {
    origin: resolveSocketCorsOrigins(),
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  socket.join("operations");
  log("SOCKET", "Client connected", { id: socket.id, room: "operations" });
});

io.engine.on("connection_error", (err) => {
  logError("SOCKET", "Engine connection error", err);
});

app.use(cors({ origin: resolveSocketCorsOrigins() }));
app.use(express.json());

const startServer = async () => {
  try {
    const db = await mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    console.log("Connected to MySQL Database");

    try {
      await ensurePasswordResetTable(db);
      console.log("password_reset_tokens table ready");
    } catch (e) {
      logError("MIGRATE", "ensurePasswordResetTable failed", e);
      throw e;
    }

    const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_key";
    const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
    const SESSION_EXPIRY_HOURS = Math.max(1, Math.min(168, parseInt(process.env.SESSION_EXPIRY_HOURS, 10) || 11));
    const verifyToken = createVerifyToken(db, JWT_SECRET);

    // ---------- Login ----------
    app.post("/api/login", async (req, res) => {
      const { username, password } = req.body;
      log("AUTH", "Login attempt", { username: username ? `${username.slice(0, 3)}***` : null });

      if (!username || typeof username !== "string" || !password || typeof password !== "string") {
        await writeAuditLog(db, { action: "LOGIN_FAILED", entity_type: "auth", new_values: { reason: "invalid_request" }, ip_address: req.ip, user_agent: req.get("user-agent") });
        return res.status(400).json({ message: "Please enter username and password.", reason: "invalid_request" });
      }

      try {
        const [rows] = await db.execute(
          `SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, u.password, u.role_id, u.terms_accepted_at, u.has_prev_logged_in,
            r.role_name,
            r.control_management, r.booking_management, r.operation_management,
            r.operation_general_dashboard, r.operation_customer_support, r.operation_rider_management,
            r.operation_rider_management_supervisor, r.operation_deliveries_management, r.operation_challan_management,
            r.operation_affluent_management,
            r.operation_special_request_management,
            r.operation_slaughter_management,
            r.operation_line_management,
            r.farm_management, r.procurement_management, r.accounting_and_finance, r.performance_management
           FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.username = ?`,
          [username]
        );

        if (rows.length === 0) {
          log("AUTH", "Login failed: user not found", { username: username ? `${username.slice(0, 3)}***` : null });
          await writeAuditLog(db, { action: "LOGIN_FAILED", entity_type: "auth", new_values: { reason: "user_not_found" }, ip_address: req.ip, user_agent: req.get("user-agent") });
          return res.status(401).json({ message: "Invalid credentials", reason: "user_not_found" });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
          log("AUTH", "Login failed: wrong password", { username: user.username });
          await writeAuditLog(db, { action: "LOGIN_FAILED", entity_type: "auth", new_values: { reason: "wrong_password", username: user.username }, ip_address: req.ip, user_agent: req.get("user-agent") });
          return res.status(401).json({ message: "Invalid credentials", reason: "wrong_password" });
        }

        await db.execute("UPDATE users SET last_login_at = NOW() WHERE user_id = ?", [user.user_id]);

        const sessionId = crypto.randomBytes(32).toString('hex');
        let refreshToken = null;
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + SESSION_EXPIRY_HOURS);

        try {
          refreshToken = crypto.randomBytes(32).toString('hex');
          await db.execute(
            `INSERT INTO user_sessions (session_id, user_id, ip_address, user_agent, expires_at, refresh_token) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [sessionId, user.user_id, req.ip, req.get('user-agent'), expiresAt, refreshToken]
          );
        } catch (err) {
          if (err.message && err.message.includes("refresh_token")) {
            await db.execute(
              `INSERT INTO user_sessions (session_id, user_id, ip_address, user_agent, expires_at) 
               VALUES (?, ?, ?, ?, ?)`,
              [sessionId, user.user_id, req.ip, req.get('user-agent'), expiresAt]
            );
            refreshToken = null;
          } else throw err;
        }

        await writeAuditLog(db, {
          user_id: user.user_id,
          session_id: sessionId,
          action: "LOGIN",
          entity_type: "auth",
          entity_id: String(user.user_id),
          new_values: { username: user.username },
          ip_address: req.ip,
          user_agent: req.get("user-agent")
        });

        const permissions = buildPermissionsFromRoleRow(user);

        const token = jwt.sign(
          { id: user.user_id, username: user.username, role: user.role_name, role_id: user.role_id, sessionId, permissions },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES_IN }
        );

        log("AUTH", "Login success", { user_id: user.user_id, username: user.username });
        if (user.email) {
          const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username;
          const loginTime = new Date();
          sendLoginNotificationEmail(user.email, fullName, user.username, loginTime).catch((err) =>
            logError("AUTH", "Login notification email failed", err)
          );
        }
        res.json({
          token,
          ...(refreshToken != null && { refreshToken }),
          sessionId,
          user: {
            id: user.user_id,
            username: user.username,
            email: user.email,
            role: user.role_name,
            role_id: user.role_id,
            permissions,
            terms_accepted_at: user.terms_accepted_at || null,
            has_prev_logged_in: user.has_prev_logged_in != null ? !!user.has_prev_logged_in : (user.terms_accepted_at != null)
          }
        });
      } catch (error) {
        logError("AUTH", "Login error", error);
        await writeAuditLog(db, { action: "LOGIN_ERROR", entity_type: "auth", new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
        res.status(500).json({ message: "Something went wrong. Please try again.", reason: "server_error" });
      }
    });

    // ---------- Current user (for OAuth callback and session load) ----------
    app.get("/api/me", verifyToken, async (req, res) => {
      log("AUTH", "Current user loaded", { user_id: req.userId });
      try {
        const [rows] = await db.execute(
          `SELECT u.user_id, u.username, u.email, u.role_id, u.terms_accepted_at, u.has_prev_logged_in,
            r.role_name,
            r.control_management, r.booking_management, r.operation_management,
            r.operation_general_dashboard, r.operation_customer_support, r.operation_rider_management,
            r.operation_rider_management_supervisor, r.operation_deliveries_management, r.operation_challan_management,
            r.operation_affluent_management,
            r.operation_special_request_management,
            r.operation_slaughter_management,
            r.operation_line_management,
            r.farm_management, r.procurement_management, r.accounting_and_finance, r.performance_management
           FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?`,
          [req.userId]
        );
        if (rows.length === 0) return res.status(404).json({ message: "User not found" });
        const user = rows[0];
        const permissions = buildPermissionsFromRoleRow(user);
        res.json({
          user: {
            id: user.user_id,
            username: user.username,
            email: user.email,
            role: user.role_name,
            role_id: user.role_id,
            permissions,
            terms_accepted_at: user.terms_accepted_at || null,
            has_prev_logged_in: user.has_prev_logged_in != null ? !!user.has_prev_logged_in : (user.terms_accepted_at != null)
          }
        });
      } catch (error) {
        logError("AUTH", "/api/me error", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // ---------- Accept Terms (first-time login) ----------
    app.post("/api/accept-terms", verifyToken, async (req, res) => {
      try {
        const userId = req.userId;
        const [userRows] = await db.execute("SELECT role_id FROM users WHERE user_id = ?", [userId]);
        if (userRows.length === 0) {
          await writeAuditLog(db, { user_id: userId, action: "TERMS_ACCEPT_FAILED", entity_type: "auth", entity_id: String(userId), new_values: { reason: "user_not_found" }, ip_address: req.ip, user_agent: req.get("user-agent") });
          return res.status(404).json({ message: "User not found" });
        }
        const roleId = userRows[0].role_id;

        await db.execute("UPDATE users SET terms_accepted_at = NOW(), has_prev_logged_in = 1 WHERE user_id = ?", [userId]);

        await writeAuditLog(db, {
          user_id: userId,
          action: "TERMS_ACCEPTED",
          entity_type: "auth",
          entity_id: String(userId),
          new_values: { role_id: roleId },
          ip_address: req.ip,
          user_agent: req.get("user-agent")
        });
        log("AUTH", "Terms accepted", { user_id: userId, role_id: roleId });

        const [rows] = await db.execute(
          `SELECT u.user_id, u.username, u.email, u.role_id, u.terms_accepted_at, u.has_prev_logged_in,
            r.role_name,
            r.control_management, r.booking_management, r.operation_management,
            r.operation_general_dashboard, r.operation_customer_support, r.operation_rider_management,
            r.operation_rider_management_supervisor, r.operation_deliveries_management, r.operation_challan_management,
            r.operation_affluent_management,
            r.operation_special_request_management,
            r.operation_slaughter_management,
            r.operation_line_management,
            r.farm_management, r.procurement_management, r.accounting_and_finance, r.performance_management
           FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?`,
          [userId]
        );
        const u = rows[0];
        const permissions = buildPermissionsFromRoleRow(u);
        res.json({
          user: {
            id: u.user_id,
            username: u.username,
            email: u.email,
            role: u.role_name,
            role_id: u.role_id,
            permissions,
            terms_accepted_at: u.terms_accepted_at,
            has_prev_logged_in: !!u.has_prev_logged_in
          }
        });
      } catch (error) {
        logError("AUTH", "Accept terms error", error);
        await writeAuditLog(db, { user_id: req.userId, action: "TERMS_ACCEPT_ERROR", entity_type: "auth", new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
        res.status(500).json({ message: "Server error" });
      }
    });

    // ---------- Refresh token (issue new access token; session remains 10–12h) ----------
    app.post("/api/refresh", async (req, res) => {
      const refreshToken = req.body?.refreshToken || req.headers['x-refresh-token'];
      if (!refreshToken || typeof refreshToken !== 'string') {
        return res.status(401).json({ message: 'Refresh token required' });
      }
      try {
        const [sessions] = await db.execute(
          "SELECT session_id, user_id FROM user_sessions WHERE refresh_token = ? AND is_active = 1 AND expires_at > NOW()",
          [refreshToken.trim()]
        );
        if (sessions.length === 0) {
          return res.status(401).json({ message: 'Invalid or expired refresh token' });
        }
        const session = sessions[0];
        const [rows] = await db.execute(
          `SELECT u.user_id, u.username, u.email, u.role_id, u.terms_accepted_at, u.has_prev_logged_in,
            r.role_name,
            r.control_management, r.booking_management, r.operation_management,
            r.operation_general_dashboard, r.operation_customer_support, r.operation_rider_management,
            r.operation_rider_management_supervisor, r.operation_deliveries_management, r.operation_challan_management,
            r.operation_affluent_management,
            r.operation_special_request_management,
            r.operation_slaughter_management,
            r.operation_line_management,
            r.farm_management, r.procurement_management, r.accounting_and_finance, r.performance_management
           FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?`,
          [session.user_id]
        );
        if (rows.length === 0) {
          await db.execute("UPDATE user_sessions SET is_active = FALSE WHERE session_id = ?", [session.session_id]);
          return res.status(401).json({ message: 'User not found' });
        }
        const user = rows[0];
        const permissions = buildPermissionsFromRoleRow(user);
        const token = jwt.sign(
          { id: user.user_id, username: user.username, role: user.role_name, role_id: user.role_id, sessionId: session.session_id, permissions },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES_IN }
        );
        await db.execute(
          "UPDATE user_sessions SET last_activity_at = NOW() WHERE session_id = ?",
          [session.session_id]
        );
        res.json({ token });
      } catch (error) {
        logError("AUTH", "Refresh token error", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // ---------- Logout (invalidate session; accepts access token or refresh token in body) ----------
    app.post("/api/logout", async (req, res) => {
      const refreshToken = req.body?.refreshToken;
      if (refreshToken && typeof refreshToken === 'string') {
        const [sessions] = await db.execute(
          "SELECT session_id, user_id FROM user_sessions WHERE refresh_token = ? AND is_active = 1",
          [refreshToken.trim()]
        );
        if (sessions.length > 0) {
          await db.execute("UPDATE user_sessions SET is_active = FALSE WHERE session_id = ?", [sessions[0].session_id]);
          await writeAuditLog(db, {
            user_id: sessions[0].user_id,
            action: "LOGOUT",
            entity_type: "auth",
            entity_id: String(sessions[0].user_id),
            new_values: { via: "refresh_token" },
            ip_address: req.ip,
            user_agent: req.get("user-agent")
          });
          log("AUTH", "Logout via refresh token", { user_id: sessions[0].user_id });
        }
        return res.json({ message: "Logged out successfully" });
      }
      const token = req.headers.authorization?.split(' ')[1] || req.headers['x-access-token'];
      if (!token) {
        log("AUTH", "Logout (no token)");
        return res.status(200).json({ message: "Logged out" });
      }
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.id) {
          if (decoded.sessionId) {
            await db.execute("UPDATE user_sessions SET is_active = FALSE WHERE session_id = ?", [decoded.sessionId]);
          } else {
            await db.execute("UPDATE user_sessions SET is_active = FALSE WHERE user_id = ? AND is_active = TRUE", [decoded.id]);
          }
          await writeAuditLog(db, {
            user_id: decoded.id,
            action: "LOGOUT",
            entity_type: "auth",
            entity_id: String(decoded.id),
            new_values: { username: decoded.username },
            ip_address: req.ip,
            user_agent: req.get("user-agent")
          });
          log("AUTH", "Logout success", { user_id: decoded.id });
        }
        res.json({ message: "Logged out successfully" });
      } catch (error) {
        res.status(200).json({ message: "Logged out" });
      }
    });

    // ---------- Mount other routes ----------
    
    registerPasswordResetRoutes(app, db);
    registerOAuthRoutes(app, db, JWT_SECRET);
    registerControlRoutes(app, db, verifyToken);
    registerBookingRoutes(app, db, verifyToken);
    registerDashboardRoutes(app, db, verifyToken);
    registerAccountingDashboardRoutes(app, db, verifyToken);
    registerFarmRoutes(app, db, verifyToken);
    registerNewQueryRoutes(app, db, verifyToken);
    registerPerformanceRoutes(app, db, verifyToken);
    registerProcurementRoutes(app, db, verifyToken);
    registerAccountingRoutes(app, db, verifyToken);
    registerOperationsRoutes(app, db, verifyToken, io);
    registerRiderAttendanceRoutes(app, db, verifyToken);
    registerSlaughterRoutes(app, db, verifyToken);
    registerLineRoutes(app, db, verifyToken);

    // ---------- 404 ----------
    app.use((req, res) => {
      log("SERVER", "Route not found", { method: req.method, path: req.path });
      res.status(404).json({ message: `Not Found - ${req.path}` });
    });

    const PORT = process.env.PORT || 5000;
    httpServer.listen(PORT, () => {
      log("SERVER", "Server started", { port: PORT, socketPath: SOCKET_IO_PATH });
      console.log(`Server running on http://localhost:${PORT}`);
      console.log('Auth: POST /api/login, POST /api/logout');
      console.log('  POST /api/register, POST /api/forgot-password, GET /api/reset-password/validate, POST /api/reset-password');
      console.log('  GET /api/auth/google, GET /api/auth/microsoft, GET /api/auth/apple');
      console.log('Control: GET/POST/PUT/DELETE /api/control/users, /api/control/roles, /api/control/audit-logs, /api/control/sessions');
    });
  } catch (error) {
    logError("SERVER", "Database connection failed", error);
    process.exit(1);
  }
};

startServer();
