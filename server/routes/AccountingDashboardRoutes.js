// server/routes/AccountingDashboardRoutes.js
import { logError } from "../utils/logger.js";

function toDateOnly(v) {
  if (v == null || v === "") return v;

  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const s = String(v);
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : s;
}

function buildPaymentYearWhere(year, params) {
  const conditions = [];

  if (year === "2026" || year === "2025") {
    conditions.push("YEAR(p.date) = ?");
    params.push(year);
  } else if (year === "2024") {
    conditions.push("(p.date IS NULL OR YEAR(p.date) < 2025)");
  }

  return conditions;
}

function buildExpenseYearWhere(year, params, col = "e.done_at") {
  const conditions = [];

  if (year === "2026" || year === "2025") {
    conditions.push(`YEAR(${col}) = ?`);
    params.push(year);
  } else if (year === "2024") {
    conditions.push(`(${col} IS NULL OR YEAR(${col}) < 2025)`);
  }

  return conditions;
}

export const registerAccountingDashboardRoutes = (app, db, verifyToken) => {
  app.get("/api/accounting-dashboard/kpis", verifyToken, async (req, res) => {
    try {
      const year = req.query.year || "all";

      const paymentParams = [];
      const paymentConditions = buildPaymentYearWhere(year, paymentParams);
      const paymentWhere = paymentConditions.length
        ? `WHERE ${paymentConditions.join(" AND ")}`
        : "";

      const [paymentRows] = await db.execute(
        `
        SELECT
          COALESCE(SUM(COALESCE(p.cash, 0)), 0) AS cash,
          COALESCE(SUM(COALESCE(p.bank, 0)), 0) AS bank,
          COALESCE(SUM(COALESCE(p.cash, 0) + COALESCE(p.bank, 0)), 0) AS totalReceived
        FROM payments p
        ${paymentWhere}
        `,
        paymentParams
      );

      const expenseParams = [];
      const expenseConditions = buildExpenseYearWhere(year, expenseParams, "e.done_at");
      const expenseWhere = expenseConditions.length
        ? `WHERE ${expenseConditions.join(" AND ")}`
        : "";

      const [expenseRows] = await db.execute(
        `
        SELECT
          COALESCE(SUM(COALESCE(e.bank, 0)), 0) AS expenseBank,
          COALESCE(SUM(COALESCE(e.cash, 0)), 0) AS expenseCash,
          COALESCE(SUM(COALESCE(e.total, COALESCE(e.bank, 0) + COALESCE(e.cash, 0))), 0) AS totalExpenses
        FROM booking_expenses e
        ${expenseWhere}
        `,
        expenseParams
      );

      const p = paymentRows?.[0] || {};
      const e = expenseRows?.[0] || {};

      res.json({
        kpis: {
          cash: Number(p.cash || 0),
          bank: Number(p.bank || 0),
          totalReceived: Number(p.totalReceived || 0),

          expenseBank: Number(e.expenseBank || 0),
          expenseCash: Number(e.expenseCash || 0),
          totalExpenses: Number(e.totalExpenses || 0),
        },
      });
    } catch (e) {
      logError("ACCOUNTING_DASHBOARD", "KPIs error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/accounting-dashboard/budget-usage", verifyToken, async (req, res) => {
    try {
      const year = req.query.year || "all";

      const catParams = [];
      const catConditions = buildExpenseYearWhere(year, catParams, "e.done_at");
      const catExpenseFilter = catConditions.length
        ? `AND ${catConditions.join(" AND ")}`
        : "";

      const [categoryRows] = await db.execute(
        `
        SELECT
          c.category_id,
          c.name,
          COALESCE(c.budget, 0) AS budget,
          COALESCE(SUM(COALESCE(e.total, COALESCE(e.bank, 0) + COALESCE(e.cash, 0))), 0) AS usedBudget
        FROM booking_expense_categories c
        LEFT JOIN booking_expenses e
          ON e.category_id = c.category_id
          ${catExpenseFilter}
        GROUP BY c.category_id, c.name, c.budget
        ORDER BY c.name ASC
        `,
        catParams
      );

      const subParams = [];
      const subConditions = buildExpenseYearWhere(year, subParams, "e.done_at");
      const subExpenseFilter = subConditions.length
        ? `AND ${subConditions.join(" AND ")}`
        : "";

      const [subCategoryRows] = await db.execute(
        `
        SELECT
          sc.sub_category_id,
          sc.category_id,
          sc.name,
          COALESCE(sc.budget, 0) AS budget,
          COALESCE(SUM(COALESCE(e.total, COALESCE(e.bank, 0) + COALESCE(e.cash, 0))), 0) AS usedBudget
        FROM booking_expense_sub_categories sc
        LEFT JOIN booking_expenses e
          ON e.sub_category_id = sc.sub_category_id
          ${subExpenseFilter}
        GROUP BY sc.sub_category_id, sc.category_id, sc.name, sc.budget
        ORDER BY sc.name ASC
        `,
        subParams
      );

      const subMap = new Map();

      for (const sub of subCategoryRows || []) {
        const budget = Number(sub.budget || 0);
        const usedBudget = Number(sub.usedBudget || 0);

        const row = {
          subCategoryKey: `sub-${sub.sub_category_id}`,
          sub_category_id: sub.sub_category_id,
          category_id: sub.category_id,
          name: sub.name || "",
          budget,
          usedBudget,
          remainingBudget: budget - usedBudget,
          usagePercent: budget > 0 ? (usedBudget / budget) * 100 : 0,
        };

        const list = subMap.get(sub.category_id) || [];
        list.push(row);
        subMap.set(sub.category_id, list);
      }

      const categories = (categoryRows || []).map((cat) => {
        const budget = Number(cat.budget || 0);
        const usedBudget = Number(cat.usedBudget || 0);

        return {
          categoryKey: `cat-${cat.category_id}`,
          category_id: cat.category_id,
          name: cat.name || "",
          budget,
          usedBudget,
          remainingBudget: budget - usedBudget,
          usagePercent: budget > 0 ? (usedBudget / budget) * 100 : 0,
          subCategories: subMap.get(cat.category_id) || [],
        };
      });

      res.json({ categories });
    } catch (e) {
      logError("ACCOUNTING_DASHBOARD", "Budget usage error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/accounting-dashboard/daily-expenses", verifyToken, async (req, res) => {
    try {
      const year = req.query.year || "all";

      const params = [];
      const conditions = buildExpenseYearWhere(year, params, "e.done_at");
      conditions.push("e.done_at IS NOT NULL");

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          DATE(e.done_at) AS date,
          COALESCE(SUM(COALESCE(e.bank, 0)), 0) AS bankExpenses,
          COALESCE(SUM(COALESCE(e.cash, 0)), 0) AS cashExpenses,
          COALESCE(SUM(COALESCE(e.total, COALESCE(e.bank, 0) + COALESCE(e.cash, 0))), 0) AS totalExpenses
        FROM booking_expenses e
        ${where}
        GROUP BY DATE(e.done_at)
        ORDER BY DATE(e.done_at) ASC
        `,
        params
      );

      const series = (rows || []).map((r) => ({
        date: toDateOnly(r.date),
        bankExpenses: Number(r.bankExpenses || 0),
        cashExpenses: Number(r.cashExpenses || 0),
        totalExpenses: Number(r.totalExpenses || 0),
      }));

      res.json({ series });
    } catch (e) {
      logError("ACCOUNTING_DASHBOARD", "Daily expenses error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/accounting-dashboard/budget-usage-expenses", verifyToken, async (req, res) => {
    try {
      const year = req.query.year || "all";
      const categoryId = req.query.category_id ? Number(req.query.category_id) : null;
      const subCategoryId = req.query.sub_category_id ? Number(req.query.sub_category_id) : null;

      if (!categoryId || Number.isNaN(categoryId)) {
        return res.status(400).json({ message: "category_id is required" });
      }

      const params = [];
      const conditions = buildExpenseYearWhere(year, params, "e.done_at");
      conditions.push("e.category_id = ?");
      params.push(categoryId);

      if (subCategoryId && !Number.isNaN(subCategoryId)) {
        conditions.push("e.sub_category_id = ?");
        params.push(subCategoryId);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          e.expense_id,
          e.done_at,
          e.description,
          e.done_by,
          e.bank,
          e.cash,
          COALESCE(e.total, COALESCE(e.bank, 0) + COALESCE(e.cash, 0)) AS total,
          c.name AS category_name,
          sc.name AS sub_category_name
        FROM booking_expenses e
        LEFT JOIN booking_expense_categories c ON c.category_id = e.category_id
        LEFT JOIN booking_expense_sub_categories sc ON sc.sub_category_id = e.sub_category_id
        ${where}
        ORDER BY e.done_at DESC, e.expense_id DESC
        `,
        params
      );

      const expenses = (rows || []).map((r) => ({
        expense_id: r.expense_id,
        done_at: toDateOnly(r.done_at) ?? r.done_at,
        description: r.description ?? "",
        done_by: r.done_by ?? "",
        category_name: r.category_name ?? "",
        sub_category_name: r.sub_category_name ?? "",
        bank: Number(r.bank || 0),
        cash: Number(r.cash || 0),
        total: Number(r.total || 0),
      }));

      const totals = expenses.reduce(
        (acc, row) => {
          acc.bank += Number(row.bank || 0);
          acc.cash += Number(row.cash || 0);
          return acc;
        },
        { bank: 0, cash: 0 }
      );

      res.json({
        totals,
        expenses,
      });
    } catch (e) {
      logError("ACCOUNTING_DASHBOARD", "Budget usage expenses error", e);
      res.status(500).json({ message: "Server error" });
    }
  });
};