import bcrypt from "bcryptjs";
import { log, logError } from "../utils/logger.js";
import { limitOffsetClause } from "../utils/sqlPagination.js";

/**
 * Control Management API: users, roles, audit-logs, sessions.
 * @param {object} app - Express app
 * @param {object} db - MySQL connection
 * @param {Function} verifyToken - auth middleware
 */
export const registerControlRoutes = (app, db, verifyToken) => {
  const logAuditAction = async (userId, action, entityType, entityId, oldValues, newValues, ipAddress, userAgent) => {
    try {
      await db.execute(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          action,
          entityType,
          entityId,
          oldValues ? JSON.stringify(oldValues) : null,
          newValues ? JSON.stringify(newValues) : null,
          ipAddress,
          userAgent
        ]
      );
    } catch (error) {
      logError("CONTROL", "Audit log insert failed", error);
    }
  };

  // ---------- Users ----------
  app.get("/api/control/users", verifyToken, async (req, res) => {
    try {
      const [users] = await db.execute(
        `SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, u.phone, 
                u.status, u.created_at, u.last_login_at, u.role_id,
                r.role_name, u.created_by, creator.username as created_by_username
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.role_id
         LEFT JOIN users creator ON u.created_by = creator.user_id
         ORDER BY u.created_at DESC`
      );
      res.json(users);
    } catch (error) {
      logError("CONTROL", "List users error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/control/users/:id", verifyToken, async (req, res) => {
    try {
      const [users] = await db.execute(
        `SELECT u.*, r.role_name 
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.role_id
         WHERE u.user_id = ?`,
        [req.params.id]
      );
      if (users.length === 0) return res.status(404).json({ message: "User not found" });
      res.json(users[0]);
    } catch (error) {
      logError("CONTROL", "Get user error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/control/users", verifyToken, async (req, res) => {
    try {
      const { username, email, password, first_name, last_name, phone, role_id, status } = req.body;
      if (!username || !email || !password || !role_id) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      const [usernameRows] = await db.execute("SELECT user_id FROM users WHERE username = ?", [username]);
      if (usernameRows.length > 0) return res.status(400).json({ message: "Username already exists" });
      const [emailRows] = await db.execute("SELECT user_id FROM users WHERE email = ?", [email]);
      if (emailRows.length > 0) return res.status(400).json({ message: "Email already exists" });
      const hashedPassword = await bcrypt.hash(password, 10);
      const [result] = await db.execute(
        `INSERT INTO users (username, email, password, first_name, last_name, phone, role_id, status, created_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [username, email, hashedPassword, first_name || null, last_name || null, phone || null, role_id, status || 'active', req.userId]
      );
      await logAuditAction(req.userId, 'CREATE_USER', 'users', result.insertId.toString(), null, { username, email, role_id, status }, req.ip, req.get('user-agent'));
      log("CONTROL", "User created", { by: req.userId, user_id: result.insertId, username });
      res.status(201).json({ message: "User created successfully", user_id: result.insertId });
    } catch (error) {
      logError("CONTROL", "Create user error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/control/users/:id", verifyToken, async (req, res) => {
    try {
      const { username, email, password, first_name, last_name, phone, role_id, status } = req.body;
      const [oldUsers] = await db.execute("SELECT * FROM users WHERE user_id = ?", [req.params.id]);
      if (oldUsers.length === 0) return res.status(404).json({ message: "User not found" });
      const oldUser = oldUsers[0];
      const updates = [];
      const values = [];
      if (username !== undefined) {
        const [usernameRows] = await db.execute("SELECT user_id FROM users WHERE username = ? AND user_id != ?", [username, req.params.id]);
        if (usernameRows.length > 0) return res.status(400).json({ message: "Username already exists" });
        updates.push("username = ?"); values.push(username);
      }
      if (email !== undefined) {
        const [emailRows] = await db.execute("SELECT user_id FROM users WHERE email = ? AND user_id != ?", [email, req.params.id]);
        if (emailRows.length > 0) return res.status(400).json({ message: "Email already exists" });
        updates.push("email = ?"); values.push(email);
      }
      if (password !== undefined && password !== '') {
        updates.push("password = ?"); values.push(await bcrypt.hash(password, 10));
      }
      if (first_name !== undefined) { updates.push("first_name = ?"); values.push(first_name); }
      if (last_name !== undefined) { updates.push("last_name = ?"); values.push(last_name); }
      if (phone !== undefined) { updates.push("phone = ?"); values.push(phone); }
      if (role_id !== undefined) { updates.push("role_id = ?"); values.push(role_id); }
      if (status !== undefined) { updates.push("status = ?"); values.push(status); }
      if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });
      values.push(req.params.id);
      await db.execute(`UPDATE users SET ${updates.join(", ")} WHERE user_id = ?`, values);
      const [newUsers] = await db.execute("SELECT * FROM users WHERE user_id = ?", [req.params.id]);
      await logAuditAction(req.userId, 'UPDATE_USER', 'users', req.params.id, oldUser, newUsers[0], req.ip, req.get('user-agent'));
      log("CONTROL", "User updated", { by: req.userId, user_id: req.params.id });
      res.json({ message: "User updated successfully" });
    } catch (error) {
      logError("CONTROL", "Update user error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/control/users/:id", verifyToken, async (req, res) => {
    try {
      const [oldUsers] = await db.execute("SELECT * FROM users WHERE user_id = ?", [req.params.id]);
      if (oldUsers.length === 0) return res.status(404).json({ message: "User not found" });
      if (parseInt(req.params.id) === req.userId) return res.status(400).json({ message: "Cannot delete your own account" });
      await db.execute("DELETE FROM users WHERE user_id = ?", [req.params.id]);
      await logAuditAction(req.userId, 'DELETE_USER', 'users', req.params.id, oldUsers[0], null, req.ip, req.get('user-agent'));
      log("CONTROL", "User deleted", { by: req.userId, user_id: req.params.id });
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      logError("CONTROL", "Delete user error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ---------- Roles ----------
  app.get("/api/control/roles", verifyToken, async (req, res) => {
    try {
      const [roles] = await db.execute("SELECT * FROM roles ORDER BY role_id");
      res.json(roles);
    } catch (error) {
      logError("CONTROL", "List roles error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/control/roles/:id", verifyToken, async (req, res) => {
    try {
      const [roles] = await db.execute("SELECT * FROM roles WHERE role_id = ?", [req.params.id]);
      if (roles.length === 0) return res.status(404).json({ message: "Role not found" });
      res.json(roles[0]);
    } catch (error) {
      logError("CONTROL", "Get role error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/control/roles", verifyToken, async (req, res) => {
    try {
      const {
        role_name,
        control_management,
        booking_management,
        operation_management,
        operation_general_dashboard,
        operation_customer_support,
        operation_rider_management,
        operation_rider_management_supervisor,
        operation_deliveries_management,
        operation_challan_management,
        operation_affluent_management,
        operation_special_request_management,
        operation_slaughter_management,
        operation_line_management,
        farm_management,
        procurement_management,
        accounting_and_finance,
        performance_management
      } = req.body;
      if (!role_name) return res.status(400).json({ message: "Role name is required" });
      const [existingRoles] = await db.execute("SELECT role_id FROM roles WHERE role_name = ?", [role_name]);
      if (existingRoles.length > 0) return res.status(400).json({ message: "Role name already exists" });
      const opOn = !!(operation_management || false);
      let riderSup = !!(operation_rider_management_supervisor || false);
      let riderAdm = opOn && !!(operation_rider_management || false);
      if (riderSup) riderAdm = false;
      else if (riderAdm) riderSup = false;
      const [result] = await db.execute(
        `INSERT INTO roles (role_name, control_management, booking_management, 
                           operation_management, operation_general_dashboard, operation_customer_support,
                           operation_rider_management, operation_rider_management_supervisor,
                           operation_deliveries_management, operation_challan_management, operation_affluent_management,
                           operation_special_request_management, operation_slaughter_management,
                           operation_line_management,
                           farm_management, procurement_management, 
                           accounting_and_finance, performance_management) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          role_name,
          control_management || false,
          booking_management || false,
          operation_management || false,
          opOn && !!(operation_general_dashboard || false),
          opOn && !!(operation_customer_support || false),
          riderAdm,
          riderSup,
          opOn && !!(operation_deliveries_management || false),
          opOn && !!(operation_challan_management || false),
          opOn && !!(operation_affluent_management || false),
          opOn && !!(operation_special_request_management || false),
          opOn && !!(operation_slaughter_management || false),
          opOn && !!(operation_line_management || false),
          farm_management || false,
          procurement_management || false,
          accounting_and_finance || false,
          performance_management || false
        ]
      );
      await logAuditAction(req.userId, 'CREATE_ROLE', 'roles', result.insertId.toString(), null, req.body, req.ip, req.get('user-agent'));
      log("CONTROL", "Role created", { by: req.userId, role_id: result.insertId, role_name });
      res.status(201).json({ message: "Role created successfully", role_id: result.insertId });
    } catch (error) {
      logError("CONTROL", "Create role error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/control/roles/:id", verifyToken, async (req, res) => {
    try {
      const [oldRoles] = await db.execute("SELECT * FROM roles WHERE role_id = ?", [req.params.id]);
      if (oldRoles.length === 0) return res.status(404).json({ message: "Role not found" });
      const {
        role_name,
        control_management,
        booking_management,
        operation_management,
        operation_general_dashboard,
        operation_customer_support,
        operation_rider_management,
        operation_rider_management_supervisor,
        operation_deliveries_management,
        operation_challan_management,
        operation_affluent_management,
        operation_special_request_management,
        operation_slaughter_management,
        operation_line_management,
        farm_management,
        procurement_management,
        accounting_and_finance,
        performance_management
      } = req.body;
      if (role_name && role_name !== oldRoles[0].role_name) {
        const [existingRoles] = await db.execute("SELECT role_id FROM roles WHERE role_name = ? AND role_id != ?", [role_name, req.params.id]);
        if (existingRoles.length > 0) return res.status(400).json({ message: "Role name already exists" });
      }
      const nextOp =
        operation_management !== undefined ? operation_management : oldRoles[0].operation_management;
      const opOn = !!nextOp;
      const sub = (v, oldV) => (v !== undefined ? v : oldV);
      const oldSup = !!oldRoles[0].operation_rider_management_supervisor;
      const oldAff = !!oldRoles[0].operation_affluent_management;
      const oldSpecial = !!oldRoles[0].operation_special_request_management;
      const oldSlaughter = !!oldRoles[0].operation_slaughter_management;
      const oldLine = !!oldRoles[0].operation_line_management;
      let nextRiderSup = !!sub(operation_rider_management_supervisor, oldSup);
      let nextRiderAdm = opOn ? !!sub(operation_rider_management, oldRoles[0].operation_rider_management) : 0;
      if (nextRiderSup) nextRiderAdm = 0;
      else if (nextRiderAdm) nextRiderSup = 0;
      const nextAffluent = opOn ? !!sub(operation_affluent_management, oldAff) : 0;
      const nextSpecial = opOn ? !!sub(operation_special_request_management, oldSpecial) : 0;
      const nextSlaughter = opOn ? !!sub(operation_slaughter_management, oldSlaughter) : 0;
      const nextLine = opOn ? !!sub(operation_line_management, oldLine) : 0;
      await db.execute(
        `UPDATE roles SET 
         role_name = ?, control_management = ?, booking_management = ?,
         operation_management = ?, operation_general_dashboard = ?, operation_customer_support = ?,
         operation_rider_management = ?, operation_rider_management_supervisor = ?,
         operation_deliveries_management = ?, operation_challan_management = ?, operation_affluent_management = ?,
         operation_special_request_management = ?, operation_slaughter_management = ?,
         operation_line_management = ?,
         farm_management = ?, procurement_management = ?,
         accounting_and_finance = ?, performance_management = ?
         WHERE role_id = ?`,
        [
          role_name || oldRoles[0].role_name,
          control_management !== undefined ? control_management : oldRoles[0].control_management,
          booking_management !== undefined ? booking_management : oldRoles[0].booking_management,
          nextOp,
          opOn ? !!sub(operation_general_dashboard, oldRoles[0].operation_general_dashboard) : 0,
          opOn ? !!sub(operation_customer_support, oldRoles[0].operation_customer_support) : 0,
          nextRiderAdm,
          nextRiderSup,
          opOn ? !!sub(operation_deliveries_management, oldRoles[0].operation_deliveries_management) : 0,
          opOn ? !!sub(operation_challan_management, oldRoles[0].operation_challan_management) : 0,
          nextAffluent,
          nextSpecial,
          nextSlaughter,
          nextLine,
          farm_management !== undefined ? farm_management : oldRoles[0].farm_management,
          procurement_management !== undefined ? procurement_management : oldRoles[0].procurement_management,
          accounting_and_finance !== undefined ? accounting_and_finance : oldRoles[0].accounting_and_finance,
          performance_management !== undefined ? performance_management : oldRoles[0].performance_management,
          req.params.id
        ]
      );
      const [newRoles] = await db.execute("SELECT * FROM roles WHERE role_id = ?", [req.params.id]);
      await logAuditAction(req.userId, 'UPDATE_ROLE', 'roles', req.params.id, oldRoles[0], newRoles[0], req.ip, req.get('user-agent'));
      log("CONTROL", "Role updated", { by: req.userId, role_id: req.params.id });
      res.json({ message: "Role updated successfully" });
    } catch (error) {
      logError("CONTROL", "Update role error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/control/roles/:id", verifyToken, async (req, res) => {
    try {
      const [users] = await db.execute("SELECT COUNT(*) as count FROM users WHERE role_id = ?", [req.params.id]);
      if (users[0].count > 0) return res.status(400).json({ message: "Cannot delete role that is assigned to users" });
      const [oldRoles] = await db.execute("SELECT * FROM roles WHERE role_id = ?", [req.params.id]);
      if (oldRoles.length === 0) return res.status(404).json({ message: "Role not found" });
      await db.execute("DELETE FROM roles WHERE role_id = ?", [req.params.id]);
      await logAuditAction(req.userId, 'DELETE_ROLE', 'roles', req.params.id, oldRoles[0], null, req.ip, req.get('user-agent'));
      log("CONTROL", "Role deleted", { by: req.userId, role_id: req.params.id });
      res.json({ message: "Role deleted successfully" });
    } catch (error) {
      logError("CONTROL", "Delete role error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ---------- Audit logs ----------
  app.get("/api/control/audit-logs", verifyToken, async (req, res) => {
    try {
      const { limit = 100, offset = 0, entity_type, action } = req.query;
      let query = `
        SELECT al.*, u.username, u.email, al.user_agent
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.user_id
        WHERE 1=1
      `;
      const params = [];
      if (entity_type) { query += " AND al.entity_type = ?"; params.push(entity_type); }
      if (action) { query += " AND al.action = ?"; params.push(action); }
      query += ` ORDER BY al.created_at DESC ${limitOffsetClause(limit, offset, { maxLimit: 500, defaultLimit: 100 })}`;
      const [logs] = await db.execute(query, params);
      res.json(logs);
    } catch (error) {
      logError("CONTROL", "Audit logs list error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ---------- Sessions ----------
  app.get("/api/control/sessions", verifyToken, async (req, res) => {
    try {
      const [sessions] = await db.execute(
        `SELECT s.*, u.username, u.email, u.role_id, r.role_name
         FROM user_sessions s
         JOIN users u ON s.user_id = u.user_id
         LEFT JOIN roles r ON u.role_id = r.role_id
         WHERE s.is_active = TRUE
         ORDER BY s.last_activity_at DESC`
      );
      res.json(sessions);
    } catch (error) {
      logError("CONTROL", "Sessions list error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/control/sessions/:sessionId", verifyToken, async (req, res) => {
    try {
      await db.execute("UPDATE user_sessions SET is_active = FALSE WHERE session_id = ?", [req.params.sessionId]);
      await logAuditAction(req.userId, 'TERMINATE_SESSION', 'sessions', req.params.sessionId, null, null, req.ip, req.get('user-agent'));
      log("CONTROL", "Session terminated", { by: req.userId, session_id: req.params.sessionId?.slice(0, 8) + "..." });
      res.json({ message: "Session terminated successfully" });
    } catch (error) {
      logError("CONTROL", "Terminate session error", error);
      res.status(500).json({ message: "Server error" });
    }
  });
};
