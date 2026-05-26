const SLAUGHTER_TYPE_LABELS = {
  premium_cow: "Premium Cow",
  standard_cow: "Standard Cow",
  waqf_cow: "Waqf Cow",
  exclusive_cow: "Exclusive Cow",
  premium_goat: "Premium Goat",
  super_goat: "Super Goat",
  exclusive_goat: "Exclusive Goat",
};

const COW_TYPES = ["premium_cow", "standard_cow", "waqf_cow", "exclusive_cow"];
const GOAT_TYPES = ["premium_goat", "super_goat", "exclusive_goat"];
const LINE_COW_MULTIPLIER = 7;

export function dayLabelToNumber(day) {
  const n = String(day || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (n === "day 1" || n === "day1" || n === "1") return 1;
  if (n === "day 2" || n === "day2" || n === "2") return 2;
  if (n === "day 3" || n === "day3" || n === "3") return 3;
  return null;
}

/** Slaughter + line packing aggregates for the operations general dashboard. */
export async function fetchDashboardSlaughterPacking(db, dayLabel) {
  const slaughterDay = dayLabelToNumber(dayLabel);

  let slaughter = {
    cows_slaughtered: { start: 0, end: 0, pending: 0 },
    goats_slaughtered: { start: 0, end: 0, pending: 0 },
    by_type: [],
  };

  let packing = {
    hissa_packed: { start: 0, end: 0, pending: 0 },
    goats_packed: { start: 0, end: 0, pending: 0 },
    by_type: [],
  };

  if (!slaughterDay) {
    return { slaughter, packing };
  }

  const [slRows] = await db.execute(
    `SELECT animal_type,
            COUNT(*) AS start_cnt,
            SUM(slaughter_end_time IS NOT NULL) AS end_cnt
     FROM slaughter_records WHERE day = ?
     GROUP BY animal_type`,
    [slaughterDay]
  );
  const slMap = {};
  for (const row of slRows || []) {
    slMap[row.animal_type] = {
      start: Number(row.start_cnt) || 0,
      end: Number(row.end_cnt) || 0,
    };
  }
  slaughter.by_type = Object.keys(SLAUGHTER_TYPE_LABELS).map((key) => {
    const start = slMap[key]?.start || 0;
    const end = slMap[key]?.end || 0;
    return {
      key,
      label: SLAUGHTER_TYPE_LABELS[key],
      start,
      end,
      pending: Math.max(0, start - end),
    };
  });
  for (const key of COW_TYPES) {
    slaughter.cows_slaughtered.start += slMap[key]?.start || 0;
    slaughter.cows_slaughtered.end += slMap[key]?.end || 0;
  }
  slaughter.cows_slaughtered.pending = Math.max(
    0,
    slaughter.cows_slaughtered.start - slaughter.cows_slaughtered.end
  );
  for (const key of GOAT_TYPES) {
    slaughter.goats_slaughtered.start += slMap[key]?.start || 0;
    slaughter.goats_slaughtered.end += slMap[key]?.end || 0;
  }
  slaughter.goats_slaughtered.pending = Math.max(
    0,
    slaughter.goats_slaughtered.start - slaughter.goats_slaughtered.end
  );

  const [packRows] = await db.execute(
    `SELECT animal_type,
            COUNT(*) AS start_cnt,
            SUM(recorded_end_time IS NOT NULL) AS end_cnt
     FROM line_records WHERE day = ?
     GROUP BY animal_type`,
    [slaughterDay]
  );
  const packMap = {};
  for (const row of packRows || []) {
    packMap[row.animal_type] = {
      start: Number(row.start_cnt) || 0,
      end: Number(row.end_cnt) || 0,
    };
  }
  packing.by_type = Object.keys(SLAUGHTER_TYPE_LABELS).map((key) => {
    const rawStart = packMap[key]?.start || 0;
    const rawEnd = packMap[key]?.end || 0;
    const mult = COW_TYPES.includes(key) ? LINE_COW_MULTIPLIER : 1;
    const start = rawStart * mult;
    const end = rawEnd * mult;
    return {
      key,
      label: SLAUGHTER_TYPE_LABELS[key],
      start,
      end,
      pending: Math.max(0, start - end),
    };
  });
  for (const key of COW_TYPES) {
    const mult = LINE_COW_MULTIPLIER;
    packing.hissa_packed.start += (packMap[key]?.start || 0) * mult;
    packing.hissa_packed.end += (packMap[key]?.end || 0) * mult;
  }
  packing.hissa_packed.pending = Math.max(
    0,
    packing.hissa_packed.start - packing.hissa_packed.end
  );
  for (const key of GOAT_TYPES) {
    packing.goats_packed.start += packMap[key]?.start || 0;
    packing.goats_packed.end += packMap[key]?.end || 0;
  }
  packing.goats_packed.pending = Math.max(
    0,
    packing.goats_packed.start - packing.goats_packed.end
  );

  return { slaughter, packing };
}
