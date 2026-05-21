// src/pages/AccountingDashboard.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../config/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LabelList,
} from "recharts";

const fmt = (n) => Number(n || 0).toLocaleString("en-PK");

const useCountUp = (value, { duration = 600 } = {}) => {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(0);
  const fromRef = useRef(0);
  const toRef = useRef(0);

  useEffect(() => {
    const to = Number(value || 0);
    const from = Number(display || 0);

    if (!Number.isFinite(to)) {
      setDisplay(0);
      return;
    }

    if (to === from) return;

    fromRef.current = from;
    toRef.current = to;
    startRef.current = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(fromRef.current + (toRef.current - fromRef.current) * eased);

      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  return display;
};

const AnimatedNumber = ({ value, format = (n) => fmt(Math.round(n)), duration = 600 }) => {
  const n = useCountUp(value, { duration });
  return <span>{format(n)}</span>;
};

const KPIBox = ({ title, value, icon, bubble, reveal = true }) => {
  const [hovered, setHovered] = useState(false);
  const numeric = Number(value || 0);

  return (
    <div
      className={`kpiCard animPop ${hovered ? "kpiCardHovered" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="kpiIcon">
        <img src={icon} alt="" className="kpiIconImg" />
      </div>

      <div className="kpiText">
        <div className="kpiTitle">{title}</div>
        <div className={`kpiValue ${reveal ? "" : "kpiBlurField"}`}>
          <AnimatedNumber
            value={numeric}
            format={(n) => `PKR ${fmt(Math.round(n))}`}
          />
        </div>
      </div>

      {hovered && <div className="kpiGlow" style={{ background: bubble }} />}
    </div>
  );
};

const BudgetUsageTable = ({ categories, year, token }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [openCats, setOpenCats] = useState({});
  const [openFilter, setOpenFilter] = useState(null);
  const [columnFilters, setColumnFilters] = useState({});
  const [detailModal, setDetailModal] = useState({
    open: false,
    loading: false,
    title: "",
    expenses: [],
    totals: { bank: 0, cash: 0 },
  });

  const money = (n) => `PKR ${fmt(Math.round(Number(n || 0)))}`;
  const modalColumns = [
    { key: "done_at", label: "Date" },
    { key: "description", label: "Description" },
    { key: "done_by", label: "Done By" },
    { key: "category_name", label: "Category" },
    { key: "sub_category_name", label: "Sub-Category" },
    { key: "bank", label: "Bank", numeric: true },
    { key: "cash", label: "Cash", numeric: true },
    { key: "total", label: "Total", numeric: true },
  ];

  const getCellValue = useCallback(
    (row, key) => {
      if (key === "done_at") return row.done_at || "—";
      if (key === "bank" || key === "cash" || key === "total") return money(row[key]);
      return row[key] || "—";
    },
    []
  );

  const groupedByDate = useMemo(() => {
    const all = Array.isArray(detailModal.expenses) ? detailModal.expenses : [];
    const filtered = all.filter((row) =>
      modalColumns.every((col) => {
        const allowed = columnFilters[col.key];
        if (!Array.isArray(allowed) || allowed.length === 0) return true;
        return allowed.includes(getCellValue(row, col.key));
      })
    );

    const map = new Map();
    filtered.forEach((row) => {
      const dateKey = row.done_at || "No Date";
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey).push(row);
    });

    return map;
  }, [detailModal.expenses, columnFilters, modalColumns, getCellValue]);

  const filterOptions = useMemo(() => {
    const all = Array.isArray(detailModal.expenses) ? detailModal.expenses : [];
    const out = {};
    modalColumns.forEach((col) => {
      out[col.key] = Array.from(new Set(all.map((row) => getCellValue(row, col.key))));
    });
    return out;
  }, [detailModal.expenses, modalColumns, getCellValue]);

  const toggleCat = (key) => {
    setOpenCats((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const openDetails = async ({ title, categoryId, subCategoryId = null }) => {
    setOpenFilter(null);
    setColumnFilters({});
    setDetailModal({
      open: true,
      loading: true,
      title,
      expenses: [],
      totals: { bank: 0, cash: 0 },
    });

    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const params = new URLSearchParams({
        year: year || "all",
        category_id: String(categoryId),
      });
      if (subCategoryId) params.set("sub_category_id", String(subCategoryId));

      const res = await fetch(`${API_BASE}/accounting-dashboard/budget-usage-expenses?${params.toString()}`, {
        headers,
      });

      const json = await res.json().catch(() => ({}));

      setDetailModal((prev) => ({
        ...prev,
        loading: false,
        expenses: Array.isArray(json.expenses) ? json.expenses : [],
        totals: {
          bank: Number(json?.totals?.bank || 0),
          cash: Number(json?.totals?.cash || 0),
        },
      }));
    } catch (_) {
      setDetailModal((prev) => ({ ...prev, loading: false, expenses: [] }));
    }
  };

  return (
    <div className="card animCard">
      <div
        className="cardTitleBig cardTitleClickable"
        onClick={() => setCollapsed((v) => !v)}
      >
        CATEGORY BUDGET USAGE{" "}
        <span className="collapseChevron">{collapsed ? "▶" : "▼"}</span>
      </div>

      {!collapsed && (
        <div className="budgetTableWrap">
          <table className="tblBudget">
            <thead>
              <tr>
                <th>Category / Sub Category</th>
                <th>Used Budget</th>
                <th>Usage</th>
              </tr>
            </thead>

            <tbody>
              {(categories || []).length === 0 ? (
                <tr>
                  <td colSpan={3} className="emptyTd">
                    No category budget found
                  </td>
                </tr>
              ) : (
                categories
                  .filter((cat) => Number(cat.usedBudget || 0) > 0)
                  .map((cat) => {
                    const filteredSubs = (cat.subCategories || []).filter(
                      (sub) => Number(sub.usedBudget || 0) > 0
                    );

                    const isOpen = !!openCats[cat.categoryKey];
                    const hasSubs = filteredSubs.length > 0;

                    return (
                      <React.Fragment key={cat.categoryKey}>
                        <tr className="catRow">
                          <td>
                            <div className="budgetNameCell">
                              <button
                                type="button"
                                className={`catArrowBtn ${isOpen ? "catArrowOpen" : ""}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (hasSubs) toggleCat(cat.categoryKey);
                                }}
                                disabled={!hasSubs}
                                title={hasSubs ? "Show sub categories" : "No sub categories"}
                              >
                                ▶
                              </button>
                              <button
                                type="button"
                                className="budgetItemBtn"
                                onClick={() =>
                                  openDetails({
                                    title: cat.name,
                                    categoryId: cat.category_id,
                                  })
                                }
                              >
                                {cat.name}
                              </button>
                            </div>
                          </td>
                          <td>{money(cat.usedBudget)}</td>

                          <td>
                            <UsageBar value={cat.usagePercent} />
                          </td>
                        </tr>

                        {isOpen &&
                          filteredSubs.map((sub) => (
                            <tr key={sub.subCategoryKey} className="subRow">
                              <td>
                                <div className="budgetNameCell">
                                  <span className="subIndent">↳</span>
                                  <button
                                    type="button"
                                    className="budgetItemBtn budgetItemSubBtn"
                                    onClick={() =>
                                      openDetails({
                                        title: `${cat.name} / ${sub.name}`,
                                        categoryId: cat.category_id,
                                        subCategoryId: sub.sub_category_id,
                                      })
                                    }
                                  >
                                    {sub.name}
                                  </button>
                                </div>
                              </td>
                              <td>{money(sub.usedBudget)}</td>

                              <td>
                                <UsageBar value={sub.usagePercent} />
                              </td>
                            </tr>
                          ))}
                      </React.Fragment>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      )}

      {detailModal.open &&
        createPortal(
          <div
            className="budgetModalBackdrop"
            onClick={() => {
              setOpenFilter(null);
              setDetailModal((p) => ({ ...p, open: false }));
            }}
          >
            <div
              className="budgetModalCard"
              onClick={(e) => {
                e.stopPropagation();
                setOpenFilter(null);
              }}
            >
              <div className="budgetModalHeader">
                <h3>{detailModal.title} Expenses</h3>
                <button
                  type="button"
                  className="budgetModalClose"
                  onClick={() => {
                    setOpenFilter(null);
                    setDetailModal((p) => ({ ...p, open: false }));
                  }}
                >
                  ✕
                </button>
              </div>

              <div className="budgetModalTopCards">
                <div className="budgetMiniCard">
                  <div>Bank Expenses</div>
                  <strong>{money(detailModal.totals.bank)}</strong>
                </div>
                <div className="budgetMiniCard">
                  <div>Cash Expenses</div>
                  <strong>{money(detailModal.totals.cash)}</strong>
                </div>
              </div>

              {detailModal.loading ? (
                <div className="chartPlaceholder">Loading expenses...</div>
              ) : groupedByDate.size === 0 ? (
                <div className="chartPlaceholder">No expenses found</div>
              ) : (
                <div className="budgetModalTableWrap">
                  <table className="tblBudget tblBudgetModal">
                    <thead>
                      <tr>
                        {modalColumns.map((col) => (
                          <th key={col.key} className={col.numeric ? "numCol" : ""}>
                            <div className="modalFilterHead">
                              <span>{col.label}</span>
                              <button
                                type="button"
                                className={`modalFilterBtn ${
                                  Array.isArray(columnFilters[col.key]) && columnFilters[col.key].length > 0
                                    ? "modalFilterBtnActive"
                                    : ""
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setOpenFilter((prev) =>
                                    prev?.key === col.key
                                      ? null
                                      : {
                                          key: col.key,
                                          top: rect.bottom + 6,
                                          left: rect.left,
                                          width: Math.max(190, rect.width + 150),
                                        }
                                  );
                                }}
                              >
                                ▾
                              </button>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(groupedByDate.entries()).map(([dateKey, rows]) => (
                        <React.Fragment key={dateKey}>
                          {rows.map((row, idx) => (
                            <tr
                              key={row.expense_id}
                              className={
                                rows.length === 1
                                  ? "dateGroupSingle"
                                  : idx === 0
                                  ? "dateGroupFirst"
                                  : idx === rows.length - 1
                                  ? "dateGroupLast"
                                  : "dateGroupMiddle"
                              }
                            >
                              {modalColumns.map((col) => (
                                <td key={`${row.expense_id}-${col.key}`} className={col.numeric ? "numCol" : ""}>
                                  {getCellValue(row, col.key)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
      {openFilter?.key &&
        createPortal(
          <div
            className="modalFilterMenu"
            style={{
              position: "fixed",
              top: openFilter.top,
              left: Math.max(8, Math.min(openFilter.left, window.innerWidth - openFilter.width - 8)),
              width: openFilter.width,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modalFilterClear"
              onClick={() =>
                setColumnFilters((prev) => ({
                  ...prev,
                  [openFilter.key]: [],
                }))
              }
            >
              Clear filter
            </button>
            <div className="modalFilterOptions">
              {(filterOptions[openFilter.key] || []).map((opt) => {
                const active = Array.isArray(columnFilters[openFilter.key])
                  ? columnFilters[openFilter.key].includes(opt)
                  : false;
                return (
                  <label key={opt} className="modalFilterOption">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => {
                        setColumnFilters((prev) => {
                          const current = Array.isArray(prev[openFilter.key]) ? [...prev[openFilter.key]] : [];
                          const next = current.includes(opt)
                            ? current.filter((v) => v !== opt)
                            : [...current, opt];
                          return { ...prev, [openFilter.key]: next };
                        });
                      }}
                    />
                    <span>{opt}</span>
                  </label>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

const UsageBar = ({ value }) => {
  const pct = Math.max(0, Number(value || 0));
  const basePct = Math.min(100, pct);
  const overPct = Math.max(0, pct - 100);

  return (
    <div className="usageWrap">
      <div className="usageTrack">
        <div className="usageFill" style={{ width: `${basePct}%` }} />

        {overPct > 0 && (
          <div
            className="usageOverFill"
            style={{ width: `${Math.min(100, overPct)}%` }}
          />
        )}
      </div>

      <span className={pct > 100 ? "usageOverText" : ""}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
};

const DailyExpensesChart = ({ series, reveal }) => {
  const [chartType, setChartType] = useState("line");
  const [metric, setMetric] = useState("totalExpenses");
  const [collapsed, setCollapsed] = useState(false);

  const data = useMemo(
    () =>
      (series || []).map((d) => ({
        ...d,
        name: d.date,
        bankExpenses: Number(d.bankExpenses || 0),
        cashExpenses: Number(d.cashExpenses || 0),
        totalExpenses: Number(d.totalExpenses || 0),
      })),
    [series]
  );

  const metricOptions = [
    { key: "totalExpenses", label: "Total Expenses" },
    { key: "bankExpenses", label: "Bank Expenses" },
    { key: "cashExpenses", label: "Cash Expenses" },
  ];

  const activeMetric = metricOptions.some((m) => m.key === metric)
    ? metric
    : "totalExpenses";

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length || !label) return null;

    const p = payload[0]?.payload || {};

    return (
      <div className="chartTooltip">
        <div className="chartTooltipTitle">{label}</div>
        <div className="chartTooltipRow">
          <span>Expenses from Bank:</span>
          <span>PKR {fmt(p.bankExpenses)}</span>
        </div>
        <div className="chartTooltipRow">
          <span>Expenses from Cash:</span>
          <span>PKR {fmt(p.cashExpenses)}</span>
        </div>
        <div className="chartTooltipRow green">
          <span>Total Expenses:</span>
          <span>PKR {fmt(p.totalExpenses)}</span>
        </div>
      </div>
    );
  };

  if (!data.length) {
    return (
      <div className="card animCard">
        <div className="cardTitle">DAILY EXPENSES</div>
        <div className="chartPlaceholder">No expenses found for selected year</div>
      </div>
    );
  }

  return (
    <div className="card animCard">
      <div className="salesOverviewHeader" style={{ marginBottom: collapsed ? 0 : 10 }}>
        <div
          className="cardTitle cardTitleClickable salesOverviewTitle"
          onClick={() => setCollapsed((v) => !v)}
        >
          DAILY EXPENSES <span className="collapseChevron">{collapsed ? "▶" : "▼"}</span>
        </div>

        {!collapsed && (
          <div className="salesOverviewHeaderRight">
            <div className="viewToggle">
              <button
                className={`viewToggleBtn ${chartType === "line" ? "viewToggleActive" : ""}`}
                onClick={() => setChartType("line")}
              >
                〜 Line
              </button>

              <button
                className={`viewToggleBtn ${chartType === "bar" ? "viewToggleActive" : ""}`}
                onClick={() => setChartType("bar")}
              >
                ▦ Bar
              </button>
            </div>
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          <div className="metricChips">
            {metricOptions.map((m) => (
              <button
                key={m.key}
                className={`metricChip ${activeMetric === m.key ? "metricChipActive" : ""}`}
                onClick={() => setMetric(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className={`chartWrap ${reveal ? "" : "kpiBlurField"}`}>
            <ResponsiveContainer width="100%" height={280}>
              {chartType === "line" ? (
                <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fontFamily: "'Poppins','Inter',sans-serif" }}
                    stroke="#6b7280"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fontFamily: "'Poppins','Inter',sans-serif" }}
                    stroke="#6b7280"
                    tickFormatter={(v) => fmt(v)}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#FF5722", strokeWidth: 1 }} />
                  <Line
                    type="monotone"
                    dataKey={activeMetric}
                    stroke="#FF5722"
                    strokeWidth={2}
                    dot={{ fill: "#FF5722", r: 3 }}
                    activeDot={{ r: 5, fill: "#FF5722", stroke: "#fff", strokeWidth: 2 }}
                  />
                </LineChart>
              ) : (
                <BarChart data={data} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fontFamily: "'Poppins','Inter',sans-serif" }}
                    stroke="#6b7280"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fontFamily: "'Poppins','Inter',sans-serif" }}
                    stroke="#6b7280"
                    tickFormatter={(v) => fmt(v)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey={activeMetric} fill="#FF5722" radius={[4, 4, 0, 0]}>
                    {data.map((_, idx) => (
                      <Cell key={idx} fill={idx % 2 === 0 ? "#FF5722" : "#FF8A65"} />
                    ))}
                    <LabelList
                      dataKey={activeMetric}
                      position="top"
                      style={{
                        fontSize: 10,
                        fontFamily: "'Poppins','Inter',sans-serif",
                        fill: "#374151",
                        fontWeight: 600,
                      }}
                      formatter={(v) => fmt(v)}
                    />
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
};

const AccountingDashboard = () => {
  const { user } = useAuth();

  const [year, setYear] = useState("2026");
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState(null);
  const [budgetUsage, setBudgetUsage] = useState([]);
  const [dailyExpenses, setDailyExpenses] = useState([]);
  const [kpiValuesVisible, setKpiValuesVisible] = useState(false);

  const token = useMemo(() => localStorage.getItem("token"), []);

  const fetchAll = useCallback(
    async (opts = {}) => {
      const silent = opts.silent === true;

      try {
        if (!silent) setLoading(true);

        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const y = encodeURIComponent(year);
        const base = `${API_BASE}/accounting-dashboard`;

        const [kpiRes, budgetRes, dailyRes] = await Promise.all([
          fetch(`${base}/kpis?year=${y}`, { headers }),
          fetch(`${base}/budget-usage?year=${y}`, { headers }),
          fetch(`${base}/daily-expenses?year=${y}`, { headers }),
        ]);

        const [kpiJson, budgetJson, dailyJson] = await Promise.all([
          kpiRes.json(),
          budgetRes.json(),
          dailyRes.json(),
        ]);

        setKpis(kpiJson.kpis || null);
        setBudgetUsage(budgetJson.categories || []);
        setDailyExpenses(dailyJson.series || []);
      } catch (e) {
        console.error("Accounting dashboard error:", e);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [token, year]
  );

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const salesIcon = "/icons/total_orders_amount.png";
  const expenseIcon = "/icons/pending_payments_amount.png";

  return (
    <div className="page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; }

        .page {
          font-family:'Poppins','Inter',sans-serif;
          padding:12px 16px;
          display:flex;
          flex-direction:column;
          gap:10px;
        }

        .page * { font-family:inherit; }

        .animCard { animation:cardIn .35s ease-out both; }
        .animPop { animation:popIn .35s ease-out both; }

        @keyframes cardIn {
          from { opacity:0; transform:translateY(6px); }
          to { opacity:1; transform:translateY(0); }
        }

        @keyframes popIn {
          from { opacity:0; transform:scale(.96); }
          to { opacity:1; transform:scale(1); }
        }

        .header {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          flex-wrap:wrap;
        }

        .hTitle {
          margin:0;
          font-size:17px;
          font-weight:600;
          color:#111827;
        }

        .hSub {
          margin:4px 0 0;
          font-size:13px;
          color:#6b7280;
        }

        .headerRight {
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
        }

        .ctrlBtn,
        .ctrlSelect,
        .ctrlIconBtn {
          padding:7px 12px;
          border-radius:10px;
          border:1px solid #e5e7eb;
          background:#fff;
          cursor:pointer;
          font-size:13px;
          font-weight:500;
          color:#374151;
          box-shadow:0 2px 6px rgba(0,0,0,0.04);
          transition:all .15s;
        }

        .ctrlBtn:hover,
        .ctrlSelect:hover,
        .ctrlIconBtn:hover {
          background:#fff4f0;
          border-color:#FF5722;
          color:#FF5722;
        }

        .ctrlIconBtn {
          display:flex;
          align-items:center;
          justify-content:center;
          padding:7px 10px;
        }

        .ctrlIconBtnImg {
          width:18px;
          height:18px;
          display:block;
        }

        .kpiGrid {
          display:grid;
          grid-template-columns:repeat(3,minmax(160px,1fr));
          gap:8px;
        }

        .kpiCard {
          background:#fff;
          border-radius:10px;
          padding:14px 12px;
          min-height:72px;
          display:flex;
          align-items:center;
          gap:8px;
          box-shadow:0 2px 8px rgba(0,0,0,0.04);
          border:1px solid #f1f1f1;
          position:relative;
          overflow:hidden;
          transition:transform .18s, box-shadow .18s, border-color .18s;
        }

        .kpiCard:hover,
        .kpiCardHovered {
          transform:translateY(-2px);
          box-shadow:0 6px 20px rgba(0,0,0,0.09);
          border-color:#FF5722;
        }

        .kpiGlow {
          position:absolute;
          inset:0;
          opacity:.07;
          pointer-events:none;
          border-radius:inherit;
        }

        .kpiIcon {
          width:64px;
          height:64px;
          display:flex;
          align-items:center;
          justify-content:center;
          flex:0 0 auto;
        }

        .kpiIconImg {
          width:50px;
          height:50px;
          object-fit:contain;
        }

        .kpiText {
          display:flex;
          flex-direction:column;
          justify-content:center;
          gap:2px;
        }

        .kpiTitle {
          font-size:11px;
          font-weight:400;
          color:#6b7280;
        }

        .kpiValue {
          font-size:18px;
          font-weight:600;
          color:#111827;
          line-height:1.2;
        }

        .kpiBlurField {
          filter:blur(6px);
          user-select:none;
        }

        .card {
          background:#fff;
          border:1px solid #f1f1f1;
          border-radius:12px;
          padding:14px;
          box-shadow:0 2px 8px rgba(0,0,0,0.04);
        }

        .cardTitleBig,
        .cardTitle {
          font-size:14px;
          font-weight:600;
          color:#111827;
          margin:0;
        }

        .cardTitleClickable {
          cursor:pointer;
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:8px;
        }

        .collapseChevron {
          color:#9ca3af;
          font-size:12px;
        }

        .budgetTableWrap {
          margin-top:12px;
          overflow-x:auto;
        }

        .tblBudget {
          width:100%;
          border-collapse:collapse;
          font-size:12px;
          white-space:nowrap;
        }

        .tblBudget th {
          background:#fafafa;
          color:#374151;
          font-weight:600;
          text-align:left;
          border-bottom:2px solid #e5e7eb;
          padding:10px;
        }

        .tblBudget td {
          padding:10px;
          border-bottom:1px solid #f1f1f1;
          color:#374151;
        }

        .catRow {
          background:#fff;
          font-weight:600;
        }

        .subRow {
          background:#fcfcfc;
          font-weight:400;
        }

        .subIndent {
          display:inline-block;
          margin-left:18px;
          margin-right:6px;
          color:#9ca3af;
        }

        .emptyTd {
          text-align:center;
          color:#9ca3af;
          padding:20px !important;
        }

        .usageWrap {
          display:flex;
          align-items:center;
          gap:8px;
          min-width:150px;
        }

        .usageTrack {
          flex:1;
          height:8px;
          background:#e5e7eb;
          border-radius:999px;
          overflow:hidden;
        }

        .usageFill {
          height:100%;
          background:#FF5722;
          border-radius:999px;
        }

        .usageWrap span {
          width:50px;
          text-align:right;
          color:#6b7280;
          font-size:11px;
        }

        .salesOverviewHeader {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          flex-wrap:wrap;
        }

        .salesOverviewHeaderRight {
          display:flex;
          align-items:center;
          gap:8px;
        }

        .viewToggle {
          display:flex;
          border:1px solid #e5e7eb;
          border-radius:10px;
          overflow:hidden;
          box-shadow:0 2px 6px rgba(0,0,0,0.04);
        }

        .viewToggleBtn {
          padding:7px 12px;
          border:none;
          background:#fff;
          font-size:12px;
          font-weight:500;
          color:#6b7280;
          cursor:pointer;
          transition:background .15s,color .15s;
        }

        .viewToggleBtn:hover {
          background:#f9f9f9;
          color:#374151;
        }

        .viewToggleActive {
          background:#FF5722 !important;
          color:#fff !important;
          font-weight:600 !important;
        }

        .metricChips {
          display:flex;
          gap:6px;
          flex-wrap:wrap;
          margin-bottom:8px;
        }

        .metricChip {
          border:1px solid #e5e7eb;
          background:#fff;
          color:#6b7280;
          border-radius:999px;
          padding:5px 10px;
          font-size:12px;
          cursor:pointer;
        }

        .metricChipActive {
          background:#fff4f0;
          border-color:#FF5722;
          color:#FF5722;
          font-weight:600;
        }

        .chartWrap {
          width:100%;
          height:280px;
        }

        .chartPlaceholder {
          color:#9ca3af;
          font-size:13px;
          text-align:center;
          padding:24px;
        }

        .chartTooltip {
          background:#fff;
          border:1px solid #e5e7eb;
          border-radius:10px;
          padding:10px 12px;
          box-shadow:0 8px 24px rgba(0,0,0,0.08);
          font-size:12px;
        }

        .chartTooltipTitle {
          font-weight:600;
          margin-bottom:6px;
          color:#111827;
        }

        .chartTooltipRow {
          display:flex;
          justify-content:space-between;
          gap:16px;
          color:#374151;
          margin-top:4px;
        }

        .chartTooltipRow.green {
          color:#16a34a;
          font-weight:600;
        }

        @media (max-width: 767px) {
          .page {
            padding:12px;
          }

          .kpiGrid {
            grid-template-columns:1fr;
          }

          .headerRight {
            width:100%;
            justify-content:flex-end;
          }

          .kpiIcon {
            width:52px;
            height:52px;
          }

          .kpiIconImg {
            width:42px;
            height:42px;
          }

          .kpiValue {
            font-size:15px;
          }
        }

        .usageTrack {
  flex: 1;
  height: 8px;
  background: #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
  position: relative;
}

.usageFill {
  height: 100%;
  background: #FF5722;
  border-radius: 999px;
  position: absolute;
  left: 0;
  top: 0;
}

.usageOverFill {
  height: 100%;
  background: linear-gradient(90deg, #f59e0b, #fbbf24);
  border-radius: 999px;
  position: absolute;
  left: 0;
  top: 0;
  box-shadow: 0 0 6px rgba(251, 191, 36, 0.75);
}

.usageOverText {
  color: #d97706 !important;
  font-weight: 700;
}

.catArrowBtn {
  width: 24px;
  height: 24px;
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 6px;
  margin-right: 8px;
  cursor: pointer;
  color: #6b7280;
  font-size: 10px;
  transition: all .15s ease;
}

.catArrowBtn:hover:not(:disabled) {
  background: #fff4f0;
  border-color: #FF5722;
  color: #FF5722;
}

.catArrowBtn:disabled {
  opacity: .35;
  cursor: not-allowed;
}

.catArrowOpen {
  transform: rotate(90deg);
}

.tblBudget th:nth-child(2),
        .tblBudget td:nth-child(2),
        .tblBudgetModal th:nth-child(5),
        .tblBudgetModal td:nth-child(5),
        .tblBudgetModal th:nth-child(6),
        .tblBudgetModal td:nth-child(6),
        .tblBudgetModal th:nth-child(7),
        .tblBudgetModal td:nth-child(7),
        .tblBudgetModal th.numCol,
        .tblBudgetModal td.numCol {
  text-align: right;
}

.budgetNameCell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.budgetItemBtn {
  border: none;
  background: transparent;
  color: #374151;
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.budgetItemBtn:hover {
  color: #FF5722;
  text-decoration: underline;
}

.budgetItemSubBtn {
  font-weight: 500;
}

.budgetModalBackdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 1200;
}

.budgetModalCard {
  width: min(1100px, 100%);
  max-height: 90vh;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.budgetModalHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #f1f1f1;
}

.budgetModalHeader h3 {
  margin: 0;
  font-size: 14px;
  color: #111827;
}

.budgetModalClose {
  border: none;
  background: transparent;
  font-size: 15px;
  cursor: pointer;
  color: #9ca3af;
}

.budgetModalTopCards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 12px 16px 0;
}

.budgetMiniCard {
  border: 1px solid #f1f1f1;
  border-radius: 10px;
  padding: 10px 12px;
  background: #fffaf8;
}

.budgetMiniCard div {
  font-size: 11px;
  color: #6b7280;
}

.budgetMiniCard strong {
  display: block;
  margin-top: 2px;
  font-size: 15px;
  color: #111827;
}

.budgetModalTableWrap {
  padding: 12px 16px 16px;
  overflow: auto;
}

.modalFilterHead {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.modalFilterBtn {
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #6b7280;
  border-radius: 6px;
  height: 22px;
  min-width: 22px;
  cursor: pointer;
  line-height: 1;
}

.modalFilterBtnActive {
  border-color: #FF5722;
  color: #FF5722;
  background: #fff4f0;
}

.modalFilterMenu {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 12px 30px rgba(0,0,0,0.12);
  z-index: 2500;
  padding: 8px;
}

.modalFilterClear {
  border: none;
  background: transparent;
  color: #FF5722;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 0 0 8px;
}

.modalFilterOptions {
  max-height: 170px;
  overflow: auto;
  border-top: 1px solid #f1f1f1;
  padding-top: 6px;
}

.modalFilterOption {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #374151;
  padding: 4px 0;
}

.dateGroupFirst td,
.dateGroupMiddle td,
.dateGroupLast td,
.dateGroupSingle td {
  border-bottom: none !important;
  border-left: none !important;
  border-right: none !important;
}

.dateGroupFirst td:first-child,
.dateGroupMiddle td:first-child,
.dateGroupLast td:first-child,
.dateGroupSingle td:first-child {
  border-left: 1px dotted #f59e0b;
}

.dateGroupFirst td:last-child,
.dateGroupMiddle td:last-child,
.dateGroupLast td:last-child,
.dateGroupSingle td:last-child {
  border-right: 1px dotted #f59e0b;
}

.dateGroupFirst td:first-child,
.dateGroupFirst td,
.dateGroupSingle td:first-child,
.dateGroupSingle td {
  border-top: 1px dotted #f59e0b;
}

.dateGroupLast td:first-child,
.dateGroupLast td,
.dateGroupSingle td:first-child,
.dateGroupSingle td {
  border-bottom: 1px dotted #f59e0b !important;
}

.tblBudget th:nth-child(1),
.tblBudget td:nth-child(1) {
  width: 1%;
}

.tblBudget th:nth-child(2),
.tblBudget td:nth-child(2) {
  white-space: nowrap;
}

.tblBudget th:nth-child(3),
.tblBudget td:nth-child(3) {
  width: 99%;
}
      `}</style>

      <div className="header">
        <div>
          <h2 className="hTitle">Accounting Dashboard</h2>
          <p className="hSub">
            Welcome{user?.name ? `, ${user.name}` : ""}. Cash, bank, expenses and budget overview.
          </p>
        </div>

        <div className="headerRight">
          <select className="ctrlSelect" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">All Year</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>

          <button type="button" className="ctrlBtn" onClick={() => fetchAll({ silent: true })}>
            Refresh
          </button>

          <button
            type="button"
            className="ctrlIconBtn"
            onClick={() => setKpiValuesVisible((v) => !v)}
            title={kpiValuesVisible ? "Hide Amounts" : "Show Amounts"}
          >
            <img
              src={kpiValuesVisible ? "/icons/hide.png" : "/icons/show.png"}
              alt={kpiValuesVisible ? "Hide" : "Show"}
              className="ctrlIconBtnImg"
            />
          </button>
        </div>
      </div>

      <div className="kpiGrid">
        <KPIBox
          title="Cash"
          value={kpis?.cash}
          icon={salesIcon}
          bubble="#fff4e5"
          reveal={kpiValuesVisible}
        />
        <KPIBox
          title="Bank"
          value={kpis?.bank}
          icon={salesIcon}
          bubble="#fff4e5"
          reveal={kpiValuesVisible}
        />
        <KPIBox
          title="Total Received"
          value={kpis?.totalReceived}
          icon={salesIcon}
          bubble="#fff4e5"
          reveal={kpiValuesVisible}
        />
      </div>

      <div className="kpiGrid">
        <KPIBox
          title="Expenses from Bank"
          value={kpis?.expenseBank}
          icon={expenseIcon}
          bubble="#fde8e8"
          reveal={kpiValuesVisible}
        />
        <KPIBox
          title="Expenses from Cash"
          value={kpis?.expenseCash}
          icon={expenseIcon}
          bubble="#fde8e8"
          reveal={kpiValuesVisible}
        />
        <KPIBox
          title="Total Expenses"
          value={kpis?.totalExpenses}
          icon={expenseIcon}
          bubble="#fde8e8"
          reveal={kpiValuesVisible}
        />
      </div>

      {loading ? (
        <div className="card animCard" style={{ textAlign: "center", color: "#6b7280" }}>
          Loading accounting dashboard...
        </div>
      ) : (
        <>
          <BudgetUsageTable categories={budgetUsage} year={year} token={token} />
          <DailyExpensesChart series={dailyExpenses} reveal={kpiValuesVisible} />
        </>
      )}
    </div>
  );
};

export default AccountingDashboard;