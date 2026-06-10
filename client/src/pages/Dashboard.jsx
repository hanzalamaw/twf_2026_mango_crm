// src/pages/Dashboard.jsx — Mango CRM booking dashboard
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../config/api";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, LabelList,
} from "recharts";

const fmt = (n) => Number(n || 0).toLocaleString("en-PK");

const formatChartDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-PK", { month: "short", day: "numeric" });
};

const CHART_COLORS = [
  "#FF5722", "#2196F3", "#4CAF50", "#9333EA", "#FF9800",
  "#3B82F6", "#10B981", "#f59e0b", "#ec4899", "#6366f1",
];

const colorForKey = (key, index = 0) => {
  if (key === "remaining") return "#EAEAEA";
  const hash = String(key || "")
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return CHART_COLORS[(hash + index) % CHART_COLORS.length];
};

/* ── Animated number hook ── */
const useCountUp = (value, { duration = 600 } = {}) => {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(0);
  const fromRef = useRef(0);
  const toRef = useRef(0);

  useEffect(() => {
    const to = Number(value || 0);
    const from = Number(display || 0);
    if (!Number.isFinite(to)) { setDisplay(0); return; }
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
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value]);

  return display;
};

const AnimatedNumber = ({ value, format = (n) => fmt(Math.round(n)), duration = 600, className }) => {
  const n = useCountUp(value, { duration });
  return <span className={className}>{format(n)}</span>;
};

/* ── KPI Box ── */
const KPIBox = ({ title, value, icon, bubble, isMoney, isPercent, reveal = true }) => {
  const [hovered, setHovered] = useState(false);
  const numeric = Number(String(value ?? "").replace(/[^0-9.-]/g, "").trim());
  const canAnimate = Number.isFinite(numeric);

  const renderFormatted = () => {
    if (value === "—" || value === null || value === undefined) return "—";
    if (canAnimate) {
      return (
        <AnimatedNumber
          value={numeric}
          duration={600}
          format={(n) => {
            const rounded = isPercent ? Number(n).toFixed(1) : Math.round(n);
            if (isPercent) return `${rounded}%`;
            if (isMoney) return `PKR ${fmt(rounded)}`;
            return fmt(rounded);
          }}
        />
      );
    }
    return value;
  };

  return (
    <div
      className={`kpiCard animPop ${hovered ? "kpiCardHovered" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="kpiIcon">
        {typeof icon === "string" && (icon.startsWith("/") || icon.endsWith(".png"))
          ? <img src={icon} alt="" className="kpiIconImg" />
          : icon}
      </div>
      <div className="kpiText">
        <div className="kpiTitle">{title}</div>
        <div className={`kpiValue ${reveal ? "" : "kpiBlurField"}`}>{renderFormatted()}</div>
      </div>
      {hovered && <div className="kpiGlow" style={{ background: bubble }} />}
    </div>
  );
};

/* ── Donut ── */
const TargetDonut = ({ achieved = 0, target = 0, breakdown = [], activeKey, onSegmentHover }) => {
  const isOver = target > 0 && achieved > target;
  const overAmount = isOver ? achieved - target : 0;
  const overPct = target > 0 ? (overAmount / target) * 100 : 0;
  const size = 220;
  const stroke = 20;
  const innerRadius = (size - stroke) / 2;
  const innerC = 2 * Math.PI * innerRadius;
  const cx = size / 2;
  const cy = size / 2;
  const outerStroke = 8;
  const outerRadius = (size - stroke) / 2 + stroke / 2 + outerStroke / 2 + 4;
  const outerC = 2 * Math.PI * outerRadius;

  const segments = [];
  let cursor = 0;
  const base = target > 0 ? target : achieved;

  breakdown.forEach((b, i) => {
    const ratio = base > 0 ? Math.min(Number(b.value || 0) / base, 1) : 0;
    const dash = innerC * ratio;
    segments.push({
      key: b.key,
      label: b.label,
      value: b.value,
      pct: b.percentage,
      dash,
      offset: cursor,
      color: colorForKey(b.key, i),
    });
    cursor += dash;
  });

  if (!isOver && base > 0) {
    const ach = breakdown.reduce((s, b) => s + Number(b.value || 0), 0);
    const rem = Math.max(0, (base - ach) / base);
    if (rem > 0) {
      segments.push({
        key: "remaining",
        label: "Remaining",
        value: Math.max(0, base - ach),
        pct: null,
        dash: innerC * rem,
        offset: cursor,
        color: "#EAEAEA",
      });
    }
  }

  const overDash = outerC * Math.min(overAmount / Math.max(target, 1), 1);
  const rotate = `rotate(-90 ${cx} ${cy})`;

  return (
    <div className="donutShell animFade" style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ overflow: "visible" }}>
        <circle cx={cx} cy={cy} r={innerRadius} stroke="#EAEAEA" strokeWidth={stroke} fill="none" />
        {segments.map((seg) => {
          if (seg.dash <= 0) return null;
          const isActive = activeKey === seg.key;
          const isAnyActive = !!activeKey;
          return (
            <circle
              key={seg.key}
              cx={cx}
              cy={cy}
              r={innerRadius}
              stroke={seg.color}
              strokeWidth={isActive ? stroke + 6 : stroke}
              strokeLinecap="butt"
              fill="none"
              strokeDasharray={`${seg.dash} ${innerC - seg.dash}`}
              strokeDashoffset={-seg.offset}
              transform={rotate}
              opacity={isAnyActive && !isActive ? 0.3 : 1}
              style={{
                transition: "opacity .2s, stroke-width .2s",
                cursor: seg.key !== "remaining" ? "pointer" : "default",
              }}
              onMouseEnter={() => seg.key !== "remaining" && onSegmentHover?.(seg.key)}
              onMouseLeave={() => onSegmentHover?.(null)}
            />
          );
        })}
        {isOver && (
          <>
            <circle cx={cx} cy={cy} r={outerRadius} stroke="#fde68a" strokeWidth={outerStroke} fill="none" opacity={0.4} />
            <circle
              cx={cx}
              cy={cy}
              r={outerRadius}
              stroke="url(#overGold)"
              strokeWidth={outerStroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${overDash} ${outerC - overDash}`}
              strokeDashoffset={0}
              transform={rotate}
              style={{ filter: "drop-shadow(0 0 4px rgba(251,191,36,0.6))" }}
            />
            <defs>
              <linearGradient id="overGold" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#fbbf24" />
              </linearGradient>
            </defs>
          </>
        )}
      </svg>
      <div className="donutCenter">
        {activeKey && activeKey !== "remaining" ? (() => {
          const seg = segments.find((s) => s.key === activeKey);
          return (
            <>
              <div className="donutSmall" style={{ color: seg?.color }}>{seg?.label}</div>
              <div className="donutBig" style={{ color: seg?.color }}>
                <AnimatedNumber value={Number(seg?.value || 0)} duration={400} format={(n) => fmt(Math.round(n))} />
              </div>
              <div className="donutRed" style={{ color: "#6b7280" }}>
                {seg?.pct != null ? `${Number(seg.pct).toFixed(1)}% of total` : ""}
              </div>
            </>
          );
        })() : isOver ? (
          <>
            <div className="donutSmall" style={{ color: "#6b7280" }}>Total Orders</div>
            <div className="donutBig donutBigBold" style={{ color: "#111827" }}>
              <AnimatedNumber value={achieved} duration={750} format={(n) => fmt(Math.round(n))} />
            </div>
            <div style={{ fontSize: 12, color: "#d97706", fontWeight: 600, marginTop: 2 }}>Target Hit!</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              +<AnimatedNumber value={overAmount} duration={800} format={(n) => fmt(Math.round(n))} /> over
              (<AnimatedNumber value={overPct} duration={800} format={(n) => `+${n.toFixed(1)}%`} />)
            </div>
          </>
        ) : (
          <>
            <div className="donutSmall">Total Orders:</div>
            <div className="donutBig donutBigBold">
              <AnimatedNumber value={achieved} duration={750} format={(n) => fmt(Math.round(n))} />
            </div>
            <div className="donutRed">
              Remaining:{" "}
              <AnimatedNumber
                value={Math.max(0, target - achieved)}
                duration={750}
                format={(n) => fmt(Math.round(n))}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const ProgressRow = ({ label, value, percentage, color, active, onHover, segmentKey }) => {
  const pct = Number.isFinite(percentage) ? percentage : 0;
  return (
    <div
      className={`progressRow animSlide ${active ? "progressRowActive" : ""}`}
      onMouseEnter={() => onHover?.(segmentKey)}
      onMouseLeave={() => onHover?.(null)}
      style={{ cursor: "pointer" }}
    >
      <div className="progressHead">
        <div className="progressLabel">
          <span className="progressDot" style={{ background: color }} />
          {label}
        </div>
        <div className="progressVal">
          <AnimatedNumber value={Number(value || 0)} duration={600} format={(n) => fmt(Math.round(n))} />
          <span className="progressPct"> ({pct.toFixed(1)}%)</span>
        </div>
      </div>
      <div className="progressTrack">
        <div className="progressFill progressAnim" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
    </div>
  );
};

const TargetAchievement = ({ achieved, target, breakdown }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeKey, setActiveKey] = useState(null);
  const breakdownList = Array.isArray(breakdown) ? breakdown : [];

  return (
    <div className="card animCard" style={{ paddingBottom: 24 }}>
      <div className="cardTitleBig cardTitleClickable" onClick={() => setCollapsed((v) => !v)}>
        TARGET ACHIEVEMENT <span className="collapseChevron">{collapsed ? "▶" : "▼"}</span>
      </div>
      {!collapsed && (
        <div className="targetGrid">
          <div className="donutWrap">
            <TargetDonut
              achieved={achieved}
              target={target}
              breakdown={breakdownList}
              activeKey={activeKey}
              onSegmentHover={setActiveKey}
            />
          </div>
          <div className="progressWrap">
            {breakdownList.length === 0 && (
              <div className="chartPlaceholder">No order type data for selected year</div>
            )}
            {breakdownList.map((b, i) => (
              <ProgressRow
                key={b.key}
                segmentKey={b.key}
                label={b.label}
                value={b.value}
                percentage={b.percentage}
                color={colorForKey(b.key, i)}
                active={activeKey === b.key}
                onHover={setActiveKey}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Source Wise ── */
const SourceWiseSummary = ({ sources }) => {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="card animCard sourceWiseCard">
      <div className="sourceCardHeader">
        <div className="cardTitle cardTitleClickable" onClick={() => setCollapsed((v) => !v)}>
          SOURCE-WISE ORDER SUMMARY <span className="collapseChevron">{collapsed ? "▶" : "▼"}</span>
        </div>
      </div>
      {!collapsed && (
        <div className="sourceGrid">
          {(sources || []).map((s, i) => (
            <div key={`${s.sourceName}-${i}`} className="sourceCard animPop sourceCardInteractive">
              <div className="sourceIcon"><span className="sourcePin">▶</span></div>
              <div className="sourceName">{s.sourceName}</div>
              <div className="sourceCount">
                <AnimatedNumber value={Number(s.count || 0)} duration={500} format={(n) => fmt(Math.round(n))} />
              </div>
            </div>
          ))}
          {(!sources || sources.length === 0) && (
            <div className="sourceCard sourceCardEmpty">No source data</div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Area Wise Bar Chart ── */
const AreaWiseChart = ({ areas, batches, selectedBatch, onBatchChange, loading }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeArea, setActiveArea] = useState(null);

  const wrapText = (text, maxChars = 10) => {
    const value = String(text || "");
    const words = value.split(" ");
    const lines = [];
    let line = "";
    words.forEach((word) => {
      if ((line + " " + word).trim().length <= maxChars) {
        line = (line + " " + word).trim();
      } else {
        if (line) lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
    return lines.length ? lines : [value];
  };

  const CustomXAxisTick = ({ x, y, payload }) => {
    const lines = wrapText(payload.value, 12).slice(0, 3);
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} textAnchor="middle" fontFamily="'Poppins','Inter',sans-serif">
          {lines.map((lineText, index) => (
            <tspan key={index} x={0} dy={index === 0 ? 12 : 11} fontSize={10} fill="#374151">
              {lineText}
            </tspan>
          ))}
        </text>
      </g>
    );
  };

  const data = useMemo(
    () =>
      (areas || [])
        .map((a) => ({
          area: a.area,
          name: a.area,
          total: Number(a.total || 0),
        }))
        .sort((a, b) => b.total - a.total),
    [areas]
  );

  const CustomTooltip = ({ active: a, payload }) => {
    if (!a || !payload?.length) return null;
    const p = payload[0]?.payload || {};
    return (
      <div className="chartTooltip">
        <div className="chartTooltipTitle">{p.area}</div>
        <div className="chartTooltipRow">
          <span>Orders</span>
          <span>{fmt(p.total)}</span>
        </div>
      </div>
    );
  };

  if (!loading && !data.length) {
    return (
      <div className="card animCard">
        <div className="cardTitleBig">AREA WISE ORDERS</div>
        <div className="chartPlaceholder">No area data for selected year</div>
      </div>
    );
  }

  return (
    <div className="card animCard">
      <div
        className={`salesOverviewHeader areaWiseChartHeader${!collapsed ? " areaWiseChartHeaderExpanded" : ""}`}
        style={{ marginBottom: collapsed ? 0 : 10 }}
      >
        <div className="cardTitle cardTitleClickable salesOverviewTitle" onClick={() => setCollapsed((v) => !v)}>
          AREA WISE ORDERS <span className="collapseChevron">{collapsed ? "▶" : "▼"}</span>
        </div>
        {!collapsed && (
          <div className="salesOverviewHeaderRight areaWiseOrdersFilters">
            <select
              className="ctrlSelect areaBatchSelect"
              value={selectedBatch}
              onChange={(e) => onBatchChange(e.target.value)}
              aria-label="Batch filter"
            >
              <option value="all">All Batches</option>
              {(batches || []).map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!collapsed && (
        loading ? (
          <div className="chartPlaceholder">Loading area data...</div>
        ) : (
          <div className="chartScrollX">
            <div style={{ minWidth: Math.max(data.length * 85, 900), height: 260 }}>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart
                  data={data}
                  margin={{ top: 32, right: 8, left: 0, bottom: 80 }}
                  onMouseLeave={() => setActiveArea(null)}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                  <XAxis dataKey="name" tick={<CustomXAxisTick />} stroke="#6b7280" interval={0} height={95} />
                  <YAxis
                    tick={{ fontSize: 11, fontFamily: "'Poppins','Inter',sans-serif" }}
                    stroke="#6b7280"
                    tickFormatter={(v) => fmt(v)}
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,87,34,0.06)" }} />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={36} onMouseEnter={(d) => setActiveArea(d.area)}>
                    {data.map((entry) => {
                      const base = "#FF5722";
                      const dim = activeArea !== null && activeArea !== entry.area;
                      return <Cell key={entry.area} fill={dim ? `${base}55` : base} />;
                    })}
                    <LabelList
                      dataKey="total"
                      position="top"
                      style={{ fontSize: 10, fontFamily: "'Poppins','Inter',sans-serif", fill: "#374151", fontWeight: 600 }}
                      formatter={(v) => fmt(v)}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      )}
    </div>
  );
};

/* ── Sales Overview ── */
const SalesOverviewChart = ({ series, reveal }) => {
  const [chartType, setChartType] = useState("line");
  const [metric, setMetric] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const data = useMemo(() => (series || []).map((d) => ({ ...d, name: d.date })), [series]);
  const metricOptions = [
    { key: "orders", label: "Orders" },
    { key: "totalSales", label: "Total Sales" },
    { key: "receivedPayments", label: "Received Payments" },
  ];
  const activeMetric =
    metric !== null && metricOptions.some((m) => m.key === metric)
      ? metric
      : (reveal ? "totalSales" : "orders");

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length || !label) return null;
    const p = payload[0]?.payload || {};
    return (
      <div className="chartTooltip">
        <div className="chartTooltipTitle">{formatChartDate(label) || label}</div>
        <div className="chartTooltipRow"><span>Orders:</span><span>{fmt(Number(p.orders || 0))}</span></div>
        <div className="chartTooltipRow green"><span>Total Sales:</span><span>Rs {fmt(Number(p.totalSales || 0))}</span></div>
        <div className="chartTooltipRow"><span>Received:</span><span>Rs {fmt(Number(p.receivedPayments || 0))}</span></div>
        <div className="chartTooltipRow"><span>Avg Value:</span><span>Rs {fmt(Number(p.avgOrderValue || 0))}</span></div>
      </div>
    );
  };

  if (!data.length) {
    return (
      <div className="card animCard">
        <div className="cardTitle">SALES OVERVIEW</div>
        <div className="chartPlaceholder">No data for selected year</div>
      </div>
    );
  }

  return (
    <div className="card animCard">
      <div className="salesOverviewHeader" style={{ marginBottom: collapsed ? 0 : 10 }}>
        <div className="cardTitle cardTitleClickable salesOverviewTitle" onClick={() => setCollapsed((v) => !v)}>
          SALES OVERVIEW <span className="collapseChevron">{collapsed ? "▶" : "▼"}</span>
        </div>
        {!collapsed && (
          <div className="salesOverviewHeaderRight">
            <div className="viewToggle">
              <button
                type="button"
                className={`viewToggleBtn ${chartType === "line" ? "viewToggleActive" : ""}`}
                onClick={() => setChartType("line")}
              >
                〜 Line
              </button>
              <button
                type="button"
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
                type="button"
                className={`metricChip ${activeMetric === m.key ? "metricChipActive" : ""}`}
                onClick={() => setMetric(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="chartWrap">
            <ResponsiveContainer width="100%" height={280}>
              {chartType === "line" ? (
                <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fontFamily: "'Poppins','Inter',sans-serif" }}
                    stroke="#6b7280"
                    tickFormatter={formatChartDate}
                    minTickGap={24}
                  />
                  <YAxis tick={{ fontSize: 11, fontFamily: "'Poppins','Inter',sans-serif" }} stroke="#6b7280" tickFormatter={(v) => fmt(v)} />
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
                <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fontFamily: "'Poppins','Inter',sans-serif" }}
                    stroke="#6b7280"
                    tickFormatter={formatChartDate}
                    minTickGap={24}
                  />
                  <YAxis tick={{ fontSize: 11, fontFamily: "'Poppins','Inter',sans-serif" }} stroke="#6b7280" tickFormatter={(v) => fmt(v)} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey={activeMetric} fill="#FF5722" radius={[4, 4, 0, 0]}>
                    {data.map((_, idx) => <Cell key={idx} fill={idx % 2 === 0 ? "#FF5722" : "#FF8A65"} />)}
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

/* ── Mangoes summary table ── */
const fmtKg = (n) => `${Math.round(Number(n || 0)).toLocaleString("en-PK")} KG`;

const MangoesSummary = ({ rows = [], total = null }) => (
  <div className="card animCard">
    <div className="cardTitle">BATCH WISE ORDER SUMMARY</div>
    <div className="mangoesTableWrap">
      <table className="mangoesTable">
        <thead>
          <tr>
            <th>Batch</th>
            <th>Received</th>
            <th>Compensation / Gift</th>
            <th>Rotten</th>
            <th>Weight Loss</th>
            <th>Ordered</th>
            <th>Delivered - Pending</th>
            <th>Undelivered - Pending</th>
            <th>Unordered</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={9} className="mangoesEmpty">No batch data — add batches in Batch Management</td></tr>
          ) : rows.map((row) => (
            <tr key={row.batch_number}>
              <td className="mangoesBatch">{row.batch_number}</td>
              <td>{fmtKg(row.received)}</td>
              <td>{fmtKg(row.compensation_or_gift)}</td>
              <td>{fmtKg(row.rotten)}</td>
              <td>{fmtKg(row.weight_loss)}</td>
              <td>{fmtKg(row.ordered)}</td>
              <td>{row.delivered_pending_label}</td>
              <td>{row.undelivered_pending_label}</td>
              <td>{fmtKg(row.unordered)}</td>
            </tr>
          ))}
          {rows.length > 0 && total && (
            <tr className="mangoesTotalRow">
              <td>Total</td>
              <td>{fmtKg(total.received)}</td>
              <td>{fmtKg(total.compensation_or_gift)}</td>
              <td>{fmtKg(total.rotten)}</td>
              <td>{fmtKg(total.weight_loss)}</td>
              <td>{fmtKg(total.ordered)}</td>
              <td>{total.delivered_pending_label}</td>
              <td>{total.undelivered_pending_label}</td>
              <td>{fmtKg(total.unordered)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

/* ════════════════════════════════════════
   Dashboard
════════════════════════════════════════ */
const Dashboard = () => {
  const { user } = useAuth();
  const [year, setYear] = useState("2026");
  const [loading, setLoading] = useState(true);
  const [areasLoading, setAreasLoading] = useState(false);
  const [kpis, setKpis] = useState(null);
  const [mangoesData, setMangoesData] = useState({ rows: [], total: null });
  const [sources, setSources] = useState([]);
  const [salesOverview, setSalesOverview] = useState([]);
  const [areas, setAreas] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("all");
  const [kpiValuesVisible, setKpiValuesVisible] = useState(false);

  const token = useMemo(() => localStorage.getItem("token"), []);
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  const base = `${API_BASE}/dashboard`;

  const fetchMain = useCallback(async () => {
    try {
      setLoading(true);
      const y = encodeURIComponent(year);
      const [k, m, src, sales, bat] = await Promise.all([
        fetch(`${base}/kpis?year=${y}`, { headers }),
        fetch(`${base}/mangoes-summary?year=${y}`, { headers }),
        fetch(`${base}/source-wise?year=${y}`, { headers }),
        fetch(`${base}/sales-overview?year=${y}`, { headers }),
        fetch(`${base}/batches?year=${y}`, { headers }),
      ]);
      const [kj, mj, srcj, salesj, batj] = await Promise.all([
        k.json(), m.json(), src.json(), sales.json(), bat.json(),
      ]);
      setKpis(kj.kpis || null);
      setMangoesData({ rows: mj.rows || [], total: mj.total || null });
      setSources(srcj.sources || []);
      setSalesOverview(salesj.series || []);
      setBatches(batj.batches || []);
      setSelectedBatch("all");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [year, headers, base]);

  const fetchAreas = useCallback(async (batch) => {
    try {
      setAreasLoading(true);
      const y = encodeURIComponent(year);
      const b = encodeURIComponent(batch || "all");
      const res = await fetch(`${base}/area-wise?year=${y}&batch=${b}`, { headers });
      const json = await res.json();
      setAreas(json.areas || []);
    } catch (e) {
      console.error(e);
      setAreas([]);
    } finally {
      setAreasLoading(false);
    }
  }, [year, headers, base]);

  useEffect(() => { fetchMain(); }, [fetchMain]);

  useEffect(() => {
    if (!loading) fetchAreas(selectedBatch);
  }, [selectedBatch, loading, fetchAreas]);

  const handleBatchChange = useCallback((batch) => {
    setSelectedBatch(batch);
  }, []);

  return (
    <div className="page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }

        .page { font-family:'Poppins','Inter',sans-serif; padding:12px 16px; display:flex; flex-direction:column; gap:10px; }
        .page * { font-family:inherit; }

        .animCard  { animation:cardIn  .35s ease-out both; }
        .animPop   { animation:popIn   .35s ease-out both; }
        .animFade  { animation:fadeIn  .45s ease-out both; }
        .animSlide { animation:slideIn .40s ease-out both; }
        @keyframes cardIn  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes popIn   { from{opacity:0;transform:scale(.96)}       to{opacity:1;transform:scale(1)} }
        @keyframes fadeIn  { from{opacity:0}                            to{opacity:1} }
        @keyframes slideIn { from{opacity:0;transform:translateX(-4px)} to{opacity:1;transform:translateX(0)} }
        .progressAnim { animation:barGrow .6s ease-out both; transform-origin:left; }
        @keyframes barGrow { from{transform:scaleX(0)} to{transform:scaleX(1)} }

        .header { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
        .hTitle { margin:0; font-size:17px; font-weight:600; color:#111827; }
        .hSub   { margin:4px 0 0; font-size:13px; color:#6b7280; }
        .headerRight { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

        .ctrlSelect {
          padding:7px 30px 7px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff;
          cursor:pointer; font-size:13px; font-weight:500; color:#374151;
          box-shadow:0 2px 6px rgba(0,0,0,0.04); transition:all .15s;
          -webkit-appearance:none; appearance:none;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat:no-repeat; background-position:right 10px center;
        }
        .ctrlSelect:hover { background-color:#fff4f0; border-color:#FF5722; color:#FF5722; }
        .ctrlSelect:focus { outline:none; border-color:#FF5722; box-shadow:0 0 0 3px rgba(255,87,34,.1); }

        .ctrlIconBtn {
          padding:7px 10px; border-radius:10px; border:1px solid #e5e7eb; background:#fff;
          cursor:pointer; display:flex; align-items:center; justify-content:center;
          box-shadow:0 2px 6px rgba(0,0,0,0.04); transition:all .15s; line-height:1;
        }
        .ctrlIconBtn:hover  { background:#fff4f0; border-color:#FF5722; }
        .ctrlIconBtn:active { transform:scale(.96); }
        .ctrlIconBtnImg { width:18px; height:18px; display:block; }

        .kpiGrid { display:grid; grid-template-columns:repeat(3,minmax(160px,1fr)); gap:8px; }
        .kpiCard { background:#fff; border-radius:10px; padding:14px 12px; min-height:72px; display:flex; align-items:center; gap:8px; box-shadow:0 2px 8px rgba(0,0,0,0.04); border:1px solid #f1f1f1; position:relative; overflow:hidden; transition:transform .18s,box-shadow .18s,border-color .18s; cursor:default; }
        .kpiCard:hover,.kpiCardHovered { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,0.09); border-color:#FF5722; }
        .kpiGlow { position:absolute; inset:0; opacity:.07; pointer-events:none; border-radius:inherit; }
        .kpiIcon { width:64px; height:64px; display:flex; align-items:center; justify-content:center; flex:0 0 auto; transition:transform .2s; }
        .kpiIconImg { width:50px; height:50px; object-fit:contain; }
        .kpiCard:hover .kpiIcon { transform:scale(1.08); }
        .kpiText { display:flex; flex-direction:column; justify-content:center; gap:2px; }
        .kpiTitle { font-size:11px; font-weight:400; color:#6b7280; }
        .kpiValue { font-size:18px; font-weight:600; color:#111827; line-height:1.2; }
        .kpiBlurField { filter:blur(6px); opacity:.35; user-select:none; pointer-events:none; background:rgba(0,0,0,0.03); border-radius:10px; padding:6px 10px; display:inline-block; min-width:140px; }

        .chartScrollX { width:100%; overflow-x:auto; overflow-y:hidden; padding-bottom:8px; }

        .card { background:#fff; border-radius:10px; padding:12px; border:1px solid #f1f1f1; box-shadow:0 2px 8px rgba(0,0,0,0.04); transition:box-shadow .2s; }
        .card:hover { box-shadow:0 4px 16px rgba(0,0,0,0.07); }
        .cardTitle,.cardTitleBig { text-align:center; font-size:15px; font-weight:600; letter-spacing:.2px; color:#111827; margin-bottom:10px; white-space:nowrap; }
        .cardTitleClickable { cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; user-select:none; transition:color .15s; }
        .cardTitleClickable:hover { color:#FF5722; }
        .collapseChevron { font-size:11px; font-weight:500; }

        .targetGrid { display:grid; grid-template-columns:240px 1fr; gap:16px; align-items:center; min-height:320px; }
        .donutCenter { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; white-space:nowrap; pointer-events:none; }
        .donutSmall { font-size:12px; font-weight:500; color:#374151; }
        .donutBig { font-size:28px; font-weight:600; color:#1f2937; }
        .donutBigBold { font-size:38px !important; font-weight:700 !important; }
        .donutRed { font-size:12px; font-weight:400; color:#b91c1c; font-style:italic; }
        .donutWrap { display:flex; flex-direction:column; align-items:center; gap:10px; }
        .progressWrap { display:flex; flex-direction:column; gap:10px; }
        .progressRow { display:flex; flex-direction:column; gap:4px; padding:6px 8px; border-radius:8px; border:1px solid transparent; transition:background .15s,border-color .15s,transform .15s,box-shadow .15s; }
        .progressRowActive { background:#fafafa; border-color:#e5e7eb; transform:translateX(3px); box-shadow:0 2px 8px rgba(0,0,0,0.06); }
        .progressHead { display:flex; justify-content:space-between; align-items:center; gap:8px; }
        .progressLabel { font-size:12px; font-weight:500; color:#111827; white-space:nowrap; display:flex; align-items:center; gap:6px; }
        .progressDot { width:8px; height:8px; border-radius:50%; flex-shrink:0; transition:transform .2s; }
        .progressRowActive .progressDot { transform:scale(1.5); }
        .progressVal { font-size:12px; font-weight:600; color:#111827; white-space:nowrap; }
        .progressPct { font-weight:500; color:#374151; font-size:11px; }
        .progressTrack { height:7px; border-radius:999px; background:#e5e7eb; overflow:hidden; }
        .progressFill { height:100%; border-radius:999px; }

        .sourceWiseCard { background:#fff; }
        .sourceCardHeader { display:flex; justify-content:center; align-items:center; margin-bottom:12px; }
        .sourceCardHeader .cardTitle { margin-bottom:0; }
        .sourceGrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:10px; width:100%; min-width:0; }
        .sourceCard { background:#fff; border-radius:8px; padding:8px 12px; display:flex; align-items:center; gap:8px; border:1px solid #e8e8e8; min-height:40px; min-width:0; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.04); transition:transform .15s,box-shadow .15s; }
        .sourceCardInteractive:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,0.08); }
        .sourceCardEmpty { justify-content:center; color:#6b7280; font-size:11px; }
        .sourceIcon { width:24px; height:24px; border-radius:5px; background:#7c3aed; color:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:10px; }
        .sourceName { font-size:11px; font-weight:500; color:#111827; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sourceCount { font-size:12px; font-weight:600; color:#111827; white-space:nowrap; flex-shrink:0; }

        .salesOverviewHeader { display:flex; justify-content:space-between; align-items:center; position:relative; }
        .salesOverviewTitle { position:absolute; left:50%; transform:translateX(-50%); }
        .salesOverviewHeaderRight { margin-left:auto; z-index:1; }
        .viewToggle { display:flex; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden; }
        .viewToggleBtn { padding:6px 12px; border:none; background:#fff; font-size:12px; font-weight:500; color:#6b7280; cursor:pointer; transition:background .15s,color .15s; }
        .viewToggleBtn:hover { background:#f9f9f9; color:#374151; }
        .viewToggleActive { background:#FF5722 !important; color:#fff !important; }
        .areaWiseChartHeader { flex-wrap:wrap; align-items:flex-start; gap:8px 12px; position:relative; }
        .areaWiseChartHeaderExpanded { min-height:48px; align-items:flex-start; }
        .areaWiseOrdersFilters { display:flex; align-items:flex-end; flex:0 1 auto; min-width:0; }
        .areaBatchSelect { min-width:140px; }
        .metricChips { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
        .metricChip { padding:5px 12px; border-radius:20px; border:1px solid #e5e7eb; background:#f9fafb; font-size:12px; font-weight:500; color:#6b7280; cursor:pointer; transition:all .15s; }
        .metricChip:hover { border-color:#FF5722; color:#FF5722; background:#fff4f0; }
        .metricChipActive { background:#FF5722 !important; color:#fff !important; border-color:#FF5722 !important; }
        .chartWrap { width:100%; min-height:260px; }
        .chartPlaceholder { padding:24px; text-align:center; color:#6b7280; font-size:13px; }
        .chartTooltip { background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:10px 12px; box-shadow:0 4px 12px rgba(0,0,0,.1); font-size:12px; min-width:180px; }
        .chartTooltipTitle { font-weight:600; font-size:12px; margin-bottom:6px; color:#111827; border-bottom:1px solid #eee; padding-bottom:4px; }
        .chartTooltipRow { display:flex; justify-content:space-between; gap:12px; margin-top:4px; }
        .chartTooltipRow.green { color:#166534; }

        .mangoesTableWrap { overflow-x: auto; }
        .mangoesTable { width: 100%; border-collapse: collapse; min-width: 960px; font-size: 10px; }
        .mangoesTable th, .mangoesTable td {
          padding: 7px 8px; border: 1px solid #e5e7eb; text-align: center; white-space: nowrap;
        }
        .mangoesTable th { background: #fafafa; font-weight: 600; color: #374151; font-size: 9px; }
        .mangoesTable tbody tr:nth-child(even):not(.mangoesTotalRow) { background: #fafafa; }
        .mangoesBatch { font-weight: 600; }
        .mangoesTotalRow { background: #f3f4f6 !important; font-weight: 700; }
        .mangoesEmpty { padding: 24px !important; color: #9ca3af; }

        @media (max-width: 767px) {
          .page { padding:16px 10px 28px; gap:8px; }
          .header { flex-direction:column; align-items:flex-start; gap:8px; }
          .hTitle { font-size:clamp(15px, 4.3vw, 17px); }
          .hSub { font-size:11px; }
          .headerRight { width:100%; gap:6px; }
          .kpiGrid { grid-template-columns:1fr 1fr; gap:6px; }
          .kpiCard { padding:10px 8px; min-height:60px; gap:6px; }
          .kpiIcon { width:36px; height:36px; }
          .kpiIconImg { width:28px; height:28px; }
          .kpiTitle { font-size:9px; }
          .kpiValue { font-size:13px; }
          .kpiBlurField { min-width:60px; padding:3px 5px; }
          .cardTitleBig,.cardTitle { font-size:12px; white-space:normal; }
          .targetGrid { grid-template-columns:1fr; min-height:unset; gap:12px; }
          .donutWrap { align-items:center; }
          .sourceGrid { grid-template-columns:1fr 1fr; gap:6px; }
          .sourceCard { padding:7px 8px; gap:6px; }
          .sourceName { font-size:10px; }
          .sourceCount { font-size:11px; }
          .salesOverviewHeader { flex-direction:column; align-items:flex-start; gap:6px; }
          .salesOverviewTitle { position:static; transform:none; font-size:12px; }
          .salesOverviewHeaderRight { margin-left:0; width:100%; }
          .areaWiseChartHeader .salesOverviewTitle { width:100%; text-align:center; }
          .areaWiseChartHeader .areaWiseOrdersFilters { width:100%; }
          .areaBatchSelect { width:100%; }
          .chartWrap { min-height:200px; }
        }

        @media (max-width: 400px) {
          .kpiGrid { grid-template-columns:1fr; }
          .sourceGrid { grid-template-columns:1fr; }
        }
      `}</style>

      <div className="header">
        <div>
          <h1 className="hTitle">Dashboard</h1>
          <p className="hSub">Welcome, {user?.username || "Manager"}</p>
        </div>
        <div className="headerRight">
          <select className="ctrlSelect" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">All Year</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>
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
        <KPIBox title="Total Orders" value={kpis?.totalOrders} icon="/icons/total_orders.png" bubble="#e8f6ff" reveal />
        <KPIBox title="Payment Clearance" value={kpis?.paymentClearance} icon="/icons/payments_cleared.png" bubble="#e6f9eb" isPercent reveal />
        <KPIBox title="Pending Payments" value={kpis?.pendingPaymentsCount} icon="/icons/pending_payments.png" bubble="#fce7ef" reveal />
        <KPIBox title="Total Sales" value={kpis?.totalSales} icon="/icons/total_orders_amount.png" bubble="#fff4e5" isMoney reveal={kpiValuesVisible} />
        <KPIBox title="Total Received Amount" value={kpis?.receivedPayments} icon="/icons/payment_clearance_amount.png" bubble="#e6f9eb" isMoney reveal={kpiValuesVisible} />
        <KPIBox title="Total Pending Amount" value={kpis?.pendingAmount} icon="/icons/pending_payments_amount.png" bubble="#fde8e8" isMoney reveal={kpiValuesVisible} />
      </div>

      {loading ? (
        <div className="card animCard" style={{ textAlign: "center", color: "#6b7280" }}>Loading dashboard...</div>
      ) : (
        <>
          <MangoesSummary rows={mangoesData.rows} total={mangoesData.total} />
          <SourceWiseSummary sources={sources} />
          <AreaWiseChart
            areas={areas}
            batches={batches}
            selectedBatch={selectedBatch}
            onBatchChange={handleBatchChange}
            loading={areasLoading}
          />
          <SalesOverviewChart series={salesOverview} reveal={kpiValuesVisible} />
        </>
      )}
    </div>
  );
};

export default Dashboard;
