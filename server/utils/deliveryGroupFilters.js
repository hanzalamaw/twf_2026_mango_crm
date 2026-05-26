/**
 * Server-side filter / sort / paginate for operations deliveries/groups.
 * Mirrors client rules in orderTags.js, operationsFilters.js, operationsOrderTypes.js.
 */

const PLACEHOLDER_DESCRIPTIONS = new Set(["-", "—", "–", "--", "---", "none", "n/a", "na", "nil", "null"]);
const PRIORITY_WORD_RE = /\bPRIORITY\b/i;

function normalizeForCompare(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeDayLabel(value) {
  const n = normalizeForCompare(value);
  if (n === "day 1" || n === "day1" || n === "1") return "Day 1";
  if (n === "day 2" || n === "day2" || n === "2") return "Day 2";
  if (n === "day 3" || n === "day3" || n === "3") return "Day 3";
  return String(value || "").trim() || "";
}

function normalizeSlotLabel(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const m = raw.match(/slot\s*(\d+)/i);
  if (m) return `Slot ${m[1]}`;
  const num = raw.match(/^(\d+)$/);
  if (num) return `Slot ${num[1]}`;
  return raw.replace(/\bSLOT\b/gi, "Slot");
}

function parseList(val) {
  if (Array.isArray(val)) return val.map((s) => String(s).trim()).filter(Boolean);
  if (val != null && String(val).trim() !== "") {
    return String(val)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function isPlaceholderDescriptionValue(value) {
  const norm = normalizeForCompare(value);
  return !norm || PLACEHOLDER_DESCRIPTIONS.has(norm);
}

function collectRawDescriptionValues(source) {
  if (!source) return [];
  const values = [];
  const push = (val) => {
    const trimmed = String(val ?? "").trim();
    if (trimmed) values.push(trimmed);
  };
  [
    source.description,
    source.descriptions,
    source.description_csv,
    source.descriptions_csv,
    source.special_request,
    source.specialRequest,
    source.request,
    source.remarks,
    source.notes,
    source.note,
  ].forEach(push);
  (source.orders || []).forEach((o) => push(o.description));
  return values;
}

function hasDescription(source) {
  return collectRawDescriptionValues(source).some((v) => !isPlaceholderDescriptionValue(v));
}

function hasPriorityInDescription(source) {
  return collectRawDescriptionValues(source).some(
    (v) => !isPlaceholderDescriptionValue(v) && PRIORITY_WORD_RE.test(v)
  );
}

function nonWaqfHissaCount(source) {
  const totalHissa = Number(source?.hissa_count ?? source?.total_hissa ?? 0);
  const waqfHissa = Number(source?.waqf_hissa_count ?? source?.total_waqf_hissa ?? 0);
  return totalHissa - waqfHissa;
}

function isSpecialRequestGroup(g) {
  if (!hasDescription(g)) return false;
  if (hasPriorityInDescription(g)) return false;
  return true;
}

function isAffluentGroup(g) {
  if (isSpecialRequestGroup(g)) return false;
  if (hasPriorityInDescription(g)) return false;
  return nonWaqfHissaCount(g) >= 3;
}

function itemMatchesDay(item, filterDay) {
  if (!filterDay) return true;
  const target = normalizeForCompare(normalizeDayLabel(filterDay));
  const primary = normalizeForCompare(normalizeDayLabel(item?.day ?? item?.challan?.day));
  if (primary && primary === target) return true;
  return (item?.orders || []).some(
    (o) => normalizeForCompare(normalizeDayLabel(o?.day)) === target
  );
}

function getSlotsForItem(item, filterDay) {
  const slots = new Set();
  const orders = item?.orders || [];

  if (filterDay && orders.length) {
    const target = normalizeForCompare(normalizeDayLabel(filterDay));
    orders.forEach((o) => {
      if (normalizeForCompare(normalizeDayLabel(o?.day)) !== target) return;
      const sl = String(o?.slot ?? "").trim();
      if (sl) slots.add(sl);
    });
    if (slots.size) return [...slots];
  }

  (item?.slots || []).forEach((sl) => {
    const s = String(sl ?? "").trim();
    if (s) slots.add(s);
  });
  String(item?.slot ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((sl) => slots.add(sl));
  orders.forEach((o) => {
    const sl = String(o?.slot ?? "").trim();
    if (sl) slots.add(sl);
  });

  if (filterDay && !itemMatchesDay(item, filterDay)) return [];

  return [...slots];
}

function itemMatchesSlots(item, filterSlots, filterDay) {
  if (!filterSlots?.length) return true;
  const groupSlots = getSlotsForItem(item, filterDay).map(normalizeForCompare);
  return filterSlots.some((fs) => groupSlots.includes(normalizeForCompare(fs)));
}

function normalizeOrderType(raw) {
  const t = String(raw || "").trim();
  if (!t) return "";
  const lower = t.toLowerCase().replace(/\s+/g, " ");
  if (lower === "hissa standard" || lower === "hissa - standard") return "Hissa - Standard";
  if (lower === "hissa premium" || lower === "hissa - premium") return "Hissa Premium";
  if (lower === "hissa waqf" || lower === "hissa - waqf") return "Hissa - Waqf";
  if (lower === "hissa exclusive" || lower === "hissa - exclusive") return "Hissa - Exclusive";
  if (lower === "super goat(hissa)" || lower === "super goat (hissa)") return "Super Goat(Hissa)";
  if (lower === "premium goat(hissa)" || lower === "premium goat (hissa)") return "Premium Goat(Hissa)";
  if (lower === "exclusive goat(hissa)" || lower === "exclusive goat (hissa)") return "Exclusive Goat(Hissa)";
  if (lower === "goat(hissa)" || lower === "goat (hissa)" || lower === "goat hissa") return "Super Goat(Hissa)";
  return t;
}

function countTypesFromGroupFields(g) {
  let superGoat = Number(g?.super_goat_hissa_count ?? g?.total_super_goat_hissa ?? 0);
  let premiumGoat = Number(g?.premium_goat_hissa_count ?? g?.total_premium_goat_hissa ?? 0);
  const legacyGoat = Number(g?.goat_hissa_count ?? g?.total_goat_hissa ?? 0);
  if (superGoat === 0 && premiumGoat === 0 && legacyGoat > 0) superGoat = legacyGoat;
  return {
    standard: Number(g?.standard_hissa_count ?? g?.total_standard_hissa ?? 0),
    premium: Number(g?.premium_hissa_count ?? g?.total_premium_hissa ?? 0),
    waqf: Number(g?.waqf_hissa_count ?? g?.total_waqf_hissa ?? 0),
    exclusive: Number(g?.exclusive_hissa_count ?? g?.total_exclusive_hissa ?? 0),
    superGoat,
    premiumGoat,
    exclusiveGoat: Number(g?.exclusive_goat_hissa_count ?? g?.total_exclusive_goat_hissa ?? 0),
  };
}

function getGroupOrderTypes(g) {
  const direct = [...new Set((g?.orders || []).map((o) => normalizeOrderType(o.order_type)).filter(Boolean))];
  if (direct.length) return direct;
  const inferred = [];
  const c = countTypesFromGroupFields(g);
  if (c.standard > 0) inferred.push("Hissa - Standard");
  if (c.premium > 0) inferred.push("Hissa Premium");
  if (c.waqf > 0) inferred.push("Hissa - Waqf");
  if (c.exclusive > 0) inferred.push("Hissa - Exclusive");
  if (c.superGoat > 0) inferred.push("Super Goat(Hissa)");
  if (c.premiumGoat > 0) inferred.push("Premium Goat(Hissa)");
  if (c.exclusiveGoat > 0) inferred.push("Exclusive Goat(Hissa)");
  return inferred;
}

function groupMatchesOrderTypeFilter(g, filterOrderType) {
  const selected = Array.isArray(filterOrderType) ? filterOrderType : filterOrderType ? [filterOrderType] : [];
  if (!selected.length) return true;
  const productTypes = getGroupOrderTypes(g);
  return selected.some(
    (filter) =>
      productTypes.includes(filter) ||
      (g.orders || []).some((o) => normalizeOrderType(o.order_type) === filter)
  );
}

function groupSearchHaystack(g) {
  return [
    g.address,
    g.area,
    g.day,
    g.slot,
    g.description,
    ...(g.shareholder_names || []),
    ...(g.booking_names || []),
    ...(g.contacts || []),
    ...(g.alt_contacts || []),
    ...(g.customer_ids || []).map(String),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sortDeliveryGroups(list, filterDay) {
  return [...list].sort((a, b) => {
    const dayA = normalizeForCompare(a.day);
    const dayB = normalizeForCompare(b.day);
    if (dayA !== dayB) return dayA.localeCompare(dayB);
    const slotA = normalizeForCompare(getSlotsForItem(a, filterDay)[0] || "");
    const slotB = normalizeForCompare(getSlotsForItem(b, filterDay)[0] || "");
    if (slotA !== slotB) return slotA.localeCompare(slotB, undefined, { numeric: true });
    return String(a.address || "")
      .trim()
      .toLowerCase()
      .localeCompare(String(b.address || "").trim().toLowerCase());
  });
}

function summarizeDeliveryGroups(groups) {
  let totalPremium = 0;
  let totalStandard = 0;
  let totalWaqf = 0;
  let totalExclusive = 0;
  let totalSuperGoat = 0;
  let totalPremiumGoat = 0;
  let totalExclusiveGoat = 0;

  for (const g of groups || []) {
    const c = countTypesFromGroupFields(g);
    totalPremium += c.premium;
    totalStandard += c.standard;
    totalWaqf += c.waqf;
    totalExclusive += c.exclusive;
    totalSuperGoat += c.superGoat;
    totalPremiumGoat += c.premiumGoat;
    totalExclusiveGoat += c.exclusiveGoat;
  }

  const totalHissa =
    totalPremium + totalStandard + totalWaqf + totalExclusive + totalSuperGoat + totalPremiumGoat + totalExclusiveGoat;

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

function buildSlotsList(groups, filterDay) {
  const seen = new Map();
  for (const item of groups || []) {
    if (filterDay && !itemMatchesDay(item, filterDay)) continue;
    getSlotsForItem(item, filterDay).forEach((sl) => {
      const key = normalizeForCompare(sl);
      if (key && !seen.has(key)) seen.set(key, normalizeSlotLabel(sl));
    });
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function parseDeliveriesGroupsQuery(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50));
  return {
    day: query.day ? String(query.day).trim() : null,
    page,
    limit,
    search: query.search ? String(query.search).trim().toLowerCase() : "",
    challan: query.challan ? String(query.challan).trim().toLowerCase() : "",
    slots: parseList(query.slot ?? query.slots),
    statuses: parseList(query.status ?? query.delivery_status),
    riderId: query.rider_id != null && String(query.rider_id).trim() !== "" ? String(query.rider_id).trim() : "",
    orderTypes: parseList(query.order_type),
    groupKind: query.group_kind ? String(query.group_kind).trim().toLowerCase() : "all",
    qrToken: query.qr_token ? String(query.qr_token).trim() : "",
  };
}

const EMPTY_SUMMARY = summarizeDeliveryGroups([]);

export function filterSortPaginateDeliveryGroups(allGroups, queryOpts, batchId) {
  const opts = queryOpts || parseDeliveriesGroupsQuery({});
  let list = allGroups || [];

  if (opts.groupKind === "affluent") {
    list = list.filter(isAffluentGroup);
  } else if (opts.groupKind === "special_request") {
    list = list.filter(isSpecialRequestGroup);
  }

  if (opts.qrToken) {
    list = list.filter((g) => g.qr_token === opts.qrToken);
  }

  if (opts.search) {
    list = list.filter((g) => groupSearchHaystack(g).includes(opts.search));
  }

  if (opts.challan) {
    list = list.filter((g) => String(g.challan_id || "").toLowerCase().includes(opts.challan));
  }

  if (opts.day) {
    list = list.filter((g) => itemMatchesDay(g, opts.day));
  }

  if (opts.statuses.length) {
    list = list.filter((g) => opts.statuses.includes(g.derived_status || "Pending"));
  }

  if (opts.riderId) {
    list = list.filter((g) => String(g.rider_id || "") === opts.riderId);
  }

  if (opts.orderTypes.length) {
    list = list.filter((g) => groupMatchesOrderTypeFilter(g, opts.orderTypes));
  }

  const slots_list = buildSlotsList(list, opts.day);

  if (opts.slots.length) {
    list = list.filter((g) => itemMatchesSlots(g, opts.slots, opts.day));
  }

  list = sortDeliveryGroups(list, opts.day);

  const total = list.length;
  const summary = summarizeDeliveryGroups(list);
  const offset = (opts.page - 1) * opts.limit;
  const groups = list
    .slice(offset, offset + opts.limit)
    .map((g) => {
      // Slim list payload: keep group-level fields, omit linked orders.
      const { orders, ...rest } = g || {};
      return rest;
    });

  return {
    groups,
    total,
    page: opts.page,
    limit: opts.limit,
    batch_id: batchId,
    summary,
    slots_list,
  };
}

export function emptyDeliveriesGroupsPayload(batchId, queryOpts) {
  const opts = queryOpts || parseDeliveriesGroupsQuery({});
  return {
    groups: [],
    total: 0,
    page: opts.page,
    limit: opts.limit,
    batch_id: batchId,
    summary: EMPTY_SUMMARY,
    slots_list: [],
  };
}
