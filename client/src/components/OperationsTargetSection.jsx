import React, { useState } from 'react';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK');

const SEGMENT_COLORS = {
  premium: { fill: '#FF5722' },
  standard: { fill: '#2196F3' },
  waqf: { fill: '#4CAF50' },
  exclusive: { fill: '#9333EA' },
  goat: { fill: '#FF9800' },
  super_goat: { fill: '#f59e0b' },
  premium_goat: { fill: '#d97706' },
  exclusive_goat: { fill: '#a855f7' },
  remaining: { fill: '#EAEAEA' },
};

const GOAT_CHILDREN = [
  { key: 'super_goat', label: 'Super Goat (Hissa)' },
  { key: 'premium_goat', label: 'Premium Goat (Hissa)' },
  { key: 'exclusive_goat', label: 'Exclusive Goat (Hissa)' },
];

function TargetDonut({ achieved = 0, target = 2000, size = 220, stroke = 20, breakdown = [], activeKey, onSegmentHover }) {
  const isOver = achieved > target;
  const overAmount = isOver ? achieved - target : 0;
  const innerRadius = (size - stroke) / 2;
  const innerC = 2 * Math.PI * innerRadius;
  const cx = size / 2;
  const cy = size / 2;
  const outerStroke = 8;
  const outerRadius = (size - stroke) / 2 + stroke / 2 + outerStroke / 2 + 4;
  const outerC = 2 * Math.PI * outerRadius;
  const segments = [];
  let cursor = 0;
  breakdown.forEach((b) => {
    const ratio = target > 0 ? Math.min(Number(b.value || 0) / target, 1) : 0;
    const dash = innerC * ratio;
    segments.push({ key: b.key, label: b.label, value: b.value, pct: b.percentage, dash, offset: cursor });
    cursor += dash;
  });
  if (!isOver) {
    const ach = breakdown.reduce((s, b) => s + Number(b.value || 0), 0);
    const rem = target > 0 ? Math.max(0, (target - ach) / target) : 1;
    segments.push({ key: 'remaining', label: 'Remaining', value: Math.max(0, target - ach), pct: null, dash: innerC * rem, offset: cursor });
  }
  const overDash = outerC * Math.min(overAmount / target, 1);
  const rotate = `rotate(-90 ${cx} ${cy})`;
  return (
    <div className="ops-donut-shell" style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ overflow: 'visible' }}>
        <circle cx={cx} cy={cy} r={innerRadius} stroke="#EAEAEA" strokeWidth={stroke} fill="none" />
        {segments.map((seg) => {
          if (seg.dash <= 0) return null;
          const color = SEGMENT_COLORS[seg.key]?.fill || '#ccc';
          const isActive = activeKey === seg.key;
          const isAnyActive = !!activeKey;
          return (
            <circle
              key={seg.key}
              cx={cx}
              cy={cy}
              r={innerRadius}
              stroke={color}
              strokeWidth={isActive ? stroke + 6 : stroke}
              strokeLinecap="butt"
              fill="none"
              strokeDasharray={`${seg.dash} ${innerC - seg.dash}`}
              strokeDashoffset={-seg.offset}
              transform={rotate}
              opacity={isAnyActive && !isActive ? 0.3 : 1}
              style={{ transition: 'opacity .2s, stroke-width .2s', cursor: seg.key !== 'remaining' ? 'pointer' : 'default' }}
              onMouseEnter={() => seg.key !== 'remaining' && onSegmentHover?.(seg.key)}
              onMouseLeave={() => onSegmentHover?.(null)}
            />
          );
        })}
        {isOver && (
          <circle
            cx={cx}
            cy={cy}
            r={outerRadius}
            stroke="#fbbf24"
            strokeWidth={outerStroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${overDash} ${outerC - overDash}`}
            transform={rotate}
          />
        )}
      </svg>
      <div className="ops-donut-center">
        {activeKey && activeKey !== 'remaining' ? (() => {
          const seg = segments.find((s) => s.key === activeKey);
          const color = SEGMENT_COLORS[activeKey]?.fill || '#FF5722';
          return (
            <>
              <div className="ops-donut-small" style={{ color }}>{seg?.label}</div>
              <div className="ops-donut-big" style={{ color }}>{fmt(Math.round(Number(seg?.value || 0)))}</div>
              <div className="ops-donut-sub" style={{ color: '#6b7280' }}>{seg?.pct != null ? `${Number(seg.pct).toFixed(1)}% of total` : ''}</div>
            </>
          );
        })() : (
          <>
            <div className="ops-donut-small">Total Orders:</div>
            <div className="ops-donut-big ops-donut-big-bold">{fmt(Math.round(achieved))}</div>
            <div className="ops-donut-sub">Remaining: {fmt(Math.max(0, target - achieved))}</div>
          </>
        )}
      </div>
    </div>
  );
}

function ProgressRow({ label, value, percentage, color, active, onHover, segmentKey }) {
  const pct = Number.isFinite(percentage) ? percentage : 0;
  return (
    <div
      className={`ops-progress-row ${active ? 'ops-progress-row-active' : ''}`}
      onMouseEnter={() => onHover?.(segmentKey)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div className="ops-progress-head">
        <div className="ops-progress-label">
          <span className="ops-progress-dot" style={{ background: color }} />
          {label}
        </div>
        <div className="ops-progress-val">
          {fmt(Math.round(Number(value || 0)))}
          <span className="ops-progress-pct"> ({pct.toFixed(1)}%)</span>
        </div>
      </div>
      <div className="ops-progress-track">
        <div className="ops-progress-fill" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
    </div>
  );
}

export default function OperationsTargetSection({
  achieved = 0,
  target = 2000,
  breakdown = [],
  statusOptions = [],
  selectedStatuses = [],
  onStatusChange,
}) {
  const [activeKey, setActiveKey] = useState(null);
  const [goatExpanded, setGoatExpanded] = useState(false);

  const breakdownList = Array.isArray(breakdown) ? breakdown : [];
  const goatTotalValue = Number(breakdownList.find((b) => b.key === 'goat')?.value || 0);
  const goatChildList = GOAT_CHILDREN.map((c) => {
    const found = breakdownList.find((b) => b.key === c.key);
    const childValue = Number(found?.value || 0);
    return {
      ...c,
      value: childValue,
      percentage: goatTotalValue > 0 ? (childValue / goatTotalValue) * 100 : 0,
    };
  });
  const childKeys = new Set(GOAT_CHILDREN.map((c) => c.key));
  const displayRows = breakdownList.filter((b) => !childKeys.has(b.key));

  const toggleStatus = (status) => {
    const next = selectedStatuses.includes(status)
      ? selectedStatuses.filter((s) => s !== status)
      : [...selectedStatuses, status];
    if (next.length === 0) return;
    onStatusChange?.(next);
  };

  return (
    <div className="ops-target-card">
      <div className="ops-status-filters">
            <span className="ops-status-filters-label">Order status:</span>
            {statusOptions.map((status) => {
              const checked = selectedStatuses.includes(status);
              return (
                <label key={status} className={`ops-status-chip ${checked ? 'ops-status-chip-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      e.preventDefault();
                      toggleStatus(status);
                    }}
                  />
                  {status}
                </label>
              );
            })}
          </div>

          <div className="ops-target-grid">
            <div className="ops-donut-wrap">
              <TargetDonut
                achieved={achieved}
                target={target}
                breakdown={displayRows}
                activeKey={activeKey}
                onSegmentHover={setActiveKey}
              />
            </div>
            <div className="ops-progress-wrap">
              {displayRows.map((b) => (
                <React.Fragment key={b.key}>
                  <div className="ops-target-row-shell">
                    {b.key === 'goat' ? (
                      <button
                        type="button"
                        className={`ops-target-expand ${goatExpanded ? 'ops-target-expand-open' : ''}`}
                        onClick={() => setGoatExpanded((v) => !v)}
                        title="Show goat categories"
                      >
                        ▶
                      </button>
                    ) : (
                      <span className="ops-target-expand-spacer" />
                    )}
                    <ProgressRow
                      segmentKey={b.key}
                      label={b.label}
                      value={b.value}
                      percentage={b.percentage}
                      color={SEGMENT_COLORS[b.key]?.fill || '#FF5722'}
                      active={activeKey === b.key}
                      onHover={setActiveKey}
                    />
                  </div>
                  {b.key === 'goat' && goatExpanded && goatChildList.map((child) => (
                    <div key={child.key} className="ops-target-child">
                      <ProgressRow
                        segmentKey={child.key}
                        label={child.label}
                        value={child.value}
                        percentage={child.percentage}
                        color={SEGMENT_COLORS[child.key]?.fill || SEGMENT_COLORS.goat.fill}
                        active={activeKey === child.key}
                        onHover={setActiveKey}
                      />
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
    </div>
  );
}
