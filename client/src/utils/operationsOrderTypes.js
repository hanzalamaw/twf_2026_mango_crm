/** Shared product order types for operations modules. */

export const GOAT_HISSA_SUPER = 'Super Goat(Hissa)';
export const GOAT_HISSA_PREMIUM = 'Premium Goat(Hissa)';
export const GOAT_HISSA_EXCLUSIVE = 'Exclusive Goat(Hissa)';

export const COW_HISSA_ORDER_TYPES = [
  'Hissa - Standard',
  'Hissa Premium',
  'Hissa - Waqf',
  'Hissa - Exclusive',
];

export const GOAT_HISSA_ORDER_TYPES = [
  GOAT_HISSA_SUPER,
  GOAT_HISSA_PREMIUM,
  GOAT_HISSA_EXCLUSIVE,
];

export const ALLOWED_ORDER_TYPES = [
  ...COW_HISSA_ORDER_TYPES,
  ...GOAT_HISSA_ORDER_TYPES,
];

export function isCowHissaOrderType(value) {
  return COW_HISSA_ORDER_TYPES.includes(normalizeOrderType(value));
}

export function isGoatHissaOrderType(value) {
  return GOAT_HISSA_ORDER_TYPES.includes(normalizeOrderType(value));
}

/** Split challan orders into cow, goat, and any other rows for separate PDF sections. */
export function partitionOrdersForChallanPrint(orders) {
  const cow = [];
  const goat = [];
  const other = [];
  for (const o of orders || []) {
    if (isCowHissaOrderType(o.order_type)) cow.push(o);
    else if (isGoatHissaOrderType(o.order_type)) goat.push(o);
    else other.push(o);
  }
  return { cow, goat, other };
}

export const ORDER_TYPE_FILTERS = [
  { value: 'Hissa - Standard', label: 'Hissa Standard' },
  { value: 'Hissa Premium', label: 'Premium' },
  { value: 'Hissa - Waqf', label: 'Waqf' },
  { value: 'Hissa - Exclusive', label: 'Exclusive' },
  { value: GOAT_HISSA_SUPER, label: 'Super Goat' },
  { value: GOAT_HISSA_PREMIUM, label: 'Premium Goat' },
  { value: GOAT_HISSA_EXCLUSIVE, label: 'Exclusive Goat' },
];

/** @deprecated Use ORDER_TYPE_FILTERS */
export const PRODUCT_ONLY_ORDER_TYPE_FILTERS = ORDER_TYPE_FILTERS;

export function normalizeOrderType(value) {
  const lower = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (lower === 'hissa - standard' || lower === 'hissa standard') return 'Hissa - Standard';
  if (lower === 'hissa premium' || lower === 'hissa - premium') return 'Hissa Premium';
  if (lower === 'hissa - waqf' || lower === 'hissa waqf') return 'Hissa - Waqf';
  if (lower === 'hissa - exclusive' || lower === 'hissa exclusive') return 'Hissa - Exclusive';
  if (lower === 'super goat(hissa)' || lower === 'super goat (hissa)') return GOAT_HISSA_SUPER;
  if (lower === 'premium goat(hissa)' || lower === 'premium goat (hissa)') return GOAT_HISSA_PREMIUM;
  if (lower === 'exclusive goat(hissa)' || lower === 'exclusive goat (hissa)') return GOAT_HISSA_EXCLUSIVE;
  if (lower === 'goat(hissa)' || lower === 'goat (hissa)' || lower === 'goat hissa') return GOAT_HISSA_SUPER;
  return '';
}

function countTypesFromOrders(orders) {
  const counts = {
    premium: 0,
    standard: 0,
    waqf: 0,
    exclusive: 0,
    superGoat: 0,
    premiumGoat: 0,
    exclusiveGoat: 0,
  };
  for (const o of orders || []) {
    const t = normalizeOrderType(o?.order_type);
    if (t === 'Hissa - Standard') counts.standard += 1;
    else if (t === 'Hissa Premium') counts.premium += 1;
    else if (t === 'Hissa - Waqf') counts.waqf += 1;
    else if (t === 'Hissa - Exclusive') counts.exclusive += 1;
    else if (t === GOAT_HISSA_SUPER) counts.superGoat += 1;
    else if (t === GOAT_HISSA_PREMIUM) counts.premiumGoat += 1;
    else if (t === GOAT_HISSA_EXCLUSIVE) counts.exclusiveGoat += 1;
  }
  return counts;
}

function countTypesFromGroupFields(g) {
  let superGoat = Number(g?.super_goat_hissa_count ?? 0);
  let premiumGoat = Number(g?.premium_goat_hissa_count ?? 0);
  let exclusiveGoat = Number(g?.exclusive_goat_hissa_count ?? 0);
  const legacyGoat = Number(g?.goat_hissa_count || 0);
  if (superGoat === 0 && premiumGoat === 0 && exclusiveGoat === 0 && legacyGoat > 0) superGoat = legacyGoat;
  return {
    premium: Number(g?.premium_hissa_count || 0),
    standard: Number(g?.standard_hissa_count || 0),
    waqf: Number(g?.waqf_hissa_count || 0),
    exclusive: Number(g?.exclusive_hissa_count || 0),
    superGoat,
    premiumGoat,
    exclusiveGoat,
  };
}

export function getGroupTypeCounts(g) {
  const orders = g?.orders || [];
  if (orders.length) return countTypesFromOrders(orders);
  return countTypesFromGroupFields(g);
}

/** Hissa breakdown column headers for operations data tables. */
export const HISSA_COUNT_TABLE_HEADERS = [
  'Standard',
  'Premium',
  'Waqf',
  'Exclusive Cow',
  'Super Goat',
  'Premium Goat',
  'Exclusive Goat',
];

/** Counts for table rows (delivery group or challan list row). */
export function getTableHissaCounts(row) {
  let c;
  if ((row?.orders || []).length) {
    c = getGroupTypeCounts(row);
  } else {
    c = getGroupTypeCounts({
      standard_hissa_count: row?.standard_hissa_count ?? row?.total_standard_hissa,
      premium_hissa_count: row?.premium_hissa_count ?? row?.total_premium_hissa,
      waqf_hissa_count: row?.waqf_hissa_count ?? row?.total_waqf_hissa,
      exclusive_hissa_count: row?.exclusive_hissa_count ?? row?.total_exclusive_hissa ?? 0,
      super_goat_hissa_count: row?.super_goat_hissa_count ?? row?.total_super_goat_hissa,
      premium_goat_hissa_count: row?.premium_goat_hissa_count ?? row?.total_premium_goat_hissa,
      exclusive_goat_hissa_count: row?.exclusive_goat_hissa_count ?? row?.total_exclusive_goat_hissa ?? 0,
      goat_hissa_count: row?.goat_hissa_count ?? row?.total_goat_hissa,
    });
  }
  const total =
    c.standard + c.premium + c.waqf + c.exclusive + c.superGoat + c.premiumGoat + c.exclusiveGoat;
  return {
    standard: c.standard,
    premium: c.premium,
    waqf: c.waqf,
    exclusiveCow: c.exclusive,
    superGoat: c.superGoat,
    premiumGoat: c.premiumGoat,
    exclusiveGoat: c.exclusiveGoat,
    total: total || Number(row?.hissa_count ?? row?.total_hissa ?? row?.order_count ?? 0),
  };
}

export function hissaCountCellValues(counts) {
  return [
    counts.standard,
    counts.premium,
    counts.waqf,
    counts.exclusiveCow,
    counts.superGoat,
    counts.premiumGoat,
    counts.exclusiveGoat,
  ];
}

export function getGroupOrderTypes(g) {
  const direct = [...new Set((g?.orders || []).map((o) => normalizeOrderType(o.order_type)).filter(Boolean))];
  if (direct.length) return direct;
  const inferred = [];
  const c = countTypesFromGroupFields(g);
  if (c.standard > 0) inferred.push('Hissa - Standard');
  if (c.premium > 0) inferred.push('Hissa Premium');
  if (c.waqf > 0) inferred.push('Hissa - Waqf');
  if (c.exclusive > 0) inferred.push('Hissa - Exclusive');
  if (c.superGoat > 0) inferred.push(GOAT_HISSA_SUPER);
  if (c.premiumGoat > 0) inferred.push(GOAT_HISSA_PREMIUM);
  if (c.exclusiveGoat > 0) inferred.push(GOAT_HISSA_EXCLUSIVE);
  return inferred;
}

/** Multiselect order-type filter: product types only (from orders or inferred group counts). */
export function groupMatchesOrderTypeFilter(g, filterOrderType) {
  const selected = Array.isArray(filterOrderType) ? filterOrderType : (filterOrderType ? [filterOrderType] : []);
  if (!selected.length) return true;
  const productTypes = getGroupOrderTypes(g);
  return selected.some(
    (filter) =>
      productTypes.includes(filter)
      || (g.orders || []).some((o) => normalizeOrderType(o.order_type) === filter)
  );
}

export function formatTotalHissa(total, opts = {}) {
  const premium = Number(opts.premium || 0);
  const standard = Number(opts.standard || 0);
  const waqf = Number(opts.waqf || 0);
  const exclusive = Number(opts.exclusive || 0);
  let superGoat = Number(opts.superGoat ?? opts.super_goat ?? 0);
  let premiumGoat = Number(opts.premiumGoat ?? opts.premium_goat ?? 0);
  let exclusiveGoat = Number(opts.exclusiveGoat ?? opts.exclusive_goat ?? 0);
  const legacyGoat = Number(opts.goat || 0);
  if (superGoat === 0 && premiumGoat === 0 && exclusiveGoat === 0 && legacyGoat > 0) superGoat = legacyGoat;
  const cleanTotal = Number(
    total ?? (premium + standard + waqf + exclusive + superGoat + premiumGoat + exclusiveGoat)
  );
  const parts = [];
  if (premium > 0) parts.push(`${premium} Premium`);
  if (standard > 0) parts.push(`${standard} Standard`);
  if (waqf > 0) parts.push(`${waqf} Waqf`);
  if (exclusive > 0) parts.push(`${exclusive} Exclusive Cow`);
  if (superGoat > 0) parts.push(`${superGoat} Super Goat`);
  if (premiumGoat > 0) parts.push(`${premiumGoat} Premium Goat`);
  if (exclusiveGoat > 0) parts.push(`${exclusiveGoat} Exclusive Goat`);
  return parts.length ? `${cleanTotal} (${parts.join(', ')})` : String(cleanTotal || 0);
}

/** Aggregate hissa counts for summary cards. */
export function summarizeDeliveryGroups(groups) {
  let totalPremium = 0;
  let totalStandard = 0;
  let totalWaqf = 0;
  let totalExclusive = 0;
  let totalSuperGoat = 0;
  let totalPremiumGoat = 0;
  let totalExclusiveGoat = 0;

  for (const g of groups || []) {
    const c = getGroupTypeCounts(g);
    totalPremium += c.premium;
    totalStandard += c.standard;
    totalWaqf += c.waqf;
    totalExclusive += c.exclusive;
    totalSuperGoat += c.superGoat;
    totalPremiumGoat += c.premiumGoat;
    totalExclusiveGoat += c.exclusiveGoat;
  }

  const totalHissa =
    totalPremium + totalStandard + totalWaqf + totalExclusive
    + totalSuperGoat + totalPremiumGoat + totalExclusiveGoat;

  return {
    totalHissa,
    totalPremium,
    totalStandard,
    totalWaqf,
    totalExclusive,
    totalSuperGoat,
    totalPremiumGoat,
    totalExclusiveGoat,
  };
}

/** Summary stat cards for operations tables. */
export function buildSummaryStatCards(summary) {
  return [
    ['Total Hissa', summary.totalHissa],
    ['Premium', summary.totalPremium],
    ['Standard', summary.totalStandard],
    ['Waqf', summary.totalWaqf],
    ['Exclusive Cow', summary.totalExclusive],
    ['Super Goat', summary.totalSuperGoat],
    ['Premium Goat', summary.totalPremiumGoat],
    ['Exclusive Goat', summary.totalExclusiveGoat],
  ];
}

function sumOrdersField(orders, field) {
  return (orders || []).reduce((total, order) => total + Number(order?.[field] || 0), 0);
}

/** Modal / challan detail totals (prefers order rows when present). */
export function computeModalTotals(challan, orders) {
  const c = challan || {};
  const list = orders || [];
  if (list.length) {
    const counts = countTypesFromOrders(list);
    const total =
      counts.premium + counts.standard + counts.waqf + counts.exclusive
      + counts.superGoat + counts.premiumGoat + counts.exclusiveGoat;
    return {
      standard: counts.standard,
      premium: counts.premium,
      waqf: counts.waqf,
      exclusive: counts.exclusive,
      superGoat: counts.superGoat,
      premiumGoat: counts.premiumGoat,
      exclusiveGoat: counts.exclusiveGoat,
      total,
    };
  }

  const fields = countTypesFromGroupFields({
    standard_hissa_count: c.total_standard_hissa ?? c.standard_hissa_count ?? sumOrdersField(list, 'standard_hissa_count'),
    premium_hissa_count: c.total_premium_hissa ?? c.premium_hissa_count ?? sumOrdersField(list, 'premium_hissa_count'),
    waqf_hissa_count: c.total_waqf_hissa ?? c.waqf_hissa_count ?? sumOrdersField(list, 'waqf_hissa_count'),
    exclusive_hissa_count: c.total_exclusive_hissa ?? c.exclusive_hissa_count ?? 0,
    super_goat_hissa_count: c.total_super_goat_hissa,
    premium_goat_hissa_count: c.total_premium_goat_hissa,
    exclusive_goat_hissa_count: c.total_exclusive_goat_hissa,
    goat_hissa_count: c.total_goat_hissa ?? c.goat_hissa_count ?? sumOrdersField(list, 'goat_hissa_count'),
  });

  const total = Number(
    c.total_hissa ?? c.hissa_count ?? c.order_count
    ?? (fields.standard + fields.premium + fields.waqf + fields.exclusive
      + fields.superGoat + fields.premiumGoat + fields.exclusiveGoat)
    ?? 0
  );

  return {
    standard: fields.standard,
    premium: fields.premium,
    waqf: fields.waqf,
    exclusive: fields.exclusive,
    superGoat: fields.superGoat,
    premiumGoat: fields.premiumGoat,
    exclusiveGoat: fields.exclusiveGoat,
    total,
  };
}

export function getChallanRowOrderTypes(row) {
  const values = [row.order_type, row.order_types, row.order_types_csv, row.types_csv, row.type];
  const direct = [...new Set(values.flatMap((value) => String(value || '').split(',')).map(normalizeOrderType).filter(Boolean))];
  if (direct.length) return direct;
  const inferred = [];
  if (Number(row.total_standard_hissa || row.standard_hissa_count || 0) > 0) inferred.push('Hissa - Standard');
  if (Number(row.total_premium_hissa || row.premium_hissa_count || 0) > 0) inferred.push('Hissa Premium');
  if (Number(row.total_waqf_hissa || row.waqf_hissa_count || 0) > 0) inferred.push('Hissa - Waqf');
  if (Number(row.total_exclusive_hissa || row.exclusive_hissa_count || 0) > 0) inferred.push('Hissa - Exclusive');
  let sg = Number(row.total_super_goat_hissa ?? 0);
  let pg = Number(row.total_premium_goat_hissa ?? 0);
  let eg = Number(row.total_exclusive_goat_hissa ?? 0);
  const leg = Number(row.total_goat_hissa || row.goat_hissa_count || 0);
  if (sg === 0 && pg === 0 && eg === 0 && leg > 0) sg = leg;
  if (sg > 0) inferred.push(GOAT_HISSA_SUPER);
  if (pg > 0) inferred.push(GOAT_HISSA_PREMIUM);
  if (eg > 0) inferred.push(GOAT_HISSA_EXCLUSIVE);
  return inferred;
}

export function challanMatchesOrderTypeFilter(row, filterOrderType) {
  const selected = Array.isArray(filterOrderType) ? filterOrderType : (filterOrderType ? [filterOrderType] : []);
  if (!selected.length) return true;
  const rowTypes = getChallanRowOrderTypes(row);
  return selected.some((filter) => rowTypes.includes(filter));
}
