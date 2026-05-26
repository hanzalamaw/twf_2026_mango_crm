import { normalizeForCompare, normalizeDayLabel } from './orderTags';

/** Canonical display label for slot filters (Slot 1, not SLOT 1). */
export function normalizeSlotLabel(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const m = raw.match(/slot\s*(\d+)/i);
  if (m) return `Slot ${m[1]}`;
  const num = raw.match(/^(\d+)$/);
  if (num) return `Slot ${num[1]}`;
  return raw.replace(/\bSLOT\b/gi, 'Slot');
}

export function itemMatchesDay(item, filterDay) {
  if (!filterDay) return true;
  const target = normalizeForCompare(normalizeDayLabel(filterDay));
  const primary = normalizeForCompare(normalizeDayLabel(item?.day ?? item?.challan?.day));
  if (primary && primary === target) return true;
  const orders = item?.orders || [];
  return orders.some(
    (o) => normalizeForCompare(normalizeDayLabel(o?.day)) === target
  );
}

/**
 * Slots for filtering — when a day is selected, prefer order rows on that day
 * so Day 2 + Slot 1 is not blocked by slots from other days on the same challan.
 */
export function getSlotsForItem(item, filterDay) {
  const slots = new Set();
  const orders = item?.orders || [];

  if (filterDay && orders.length) {
    const target = normalizeForCompare(normalizeDayLabel(filterDay));
    orders.forEach((o) => {
      if (normalizeForCompare(normalizeDayLabel(o?.day)) !== target) return;
      const sl = String(o?.slot ?? '').trim();
      if (sl) slots.add(sl);
    });
    if (slots.size) return [...slots];
  }

  (item?.slots || []).forEach((sl) => {
    const s = String(sl ?? '').trim();
    if (s) slots.add(s);
  });
  String(item?.slot ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((sl) => slots.add(sl));
  orders.forEach((o) => {
    const sl = String(o?.slot ?? '').trim();
    if (sl) slots.add(sl);
  });

  if (filterDay && !itemMatchesDay(item, filterDay)) return [];

  return [...slots];
}

/** @deprecated alias */
export function getGroupSlots(g, filterDay) {
  return getSlotsForItem(g, filterDay);
}

export function itemMatchesSlots(item, filterSlots, filterDay) {
  if (!filterSlots?.length) return true;
  const groupSlots = getSlotsForItem(item, filterDay).map(normalizeForCompare);
  return filterSlots.some((fs) => groupSlots.includes(normalizeForCompare(fs)));
}

/** @deprecated alias */
export function groupMatchesSlots(g, filterSlots, filterDay) {
  return itemMatchesSlots(g, filterSlots, filterDay);
}

/** @deprecated alias */
export function groupMatchesDay(g, filterDay) {
  return itemMatchesDay(g, filterDay);
}

/** Slot dropdown from server `slots_list` (distinct values for batch/day). */
export function buildSlotFilterOptionsFromValues(slotValues) {
  const seen = new Map();
  for (const sl of slotValues || []) {
    const label = normalizeSlotLabel(sl);
    const key = normalizeForCompare(label);
    if (key && !seen.has(key)) seen.set(key, label);
  }
  return [...seen.values()]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((slot) => ({ value: slot, label: slot }));
}

export function buildSlotFilterOptions(items, filterDay, getSlots = getSlotsForItem) {
  const seen = new Map();
  for (const item of items || []) {
    if (filterDay && !itemMatchesDay(item, filterDay)) continue;
    getSlots(item, filterDay).forEach((sl) => {
      const key = normalizeForCompare(sl);
      if (key && !seen.has(key)) seen.set(key, normalizeSlotLabel(sl));
    });
  }
  return [...seen.values()]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((slot) => ({ value: slot, label: slot }));
}

/** Stable string key for slot option lists (avoids effect loops on new array references). */
export function slotFilterValuesKey(optionValues) {
  const opts = Array.isArray(optionValues) ? optionValues : [];
  return opts
    .map((v) => normalizeForCompare(typeof v === 'string' ? v : v?.value))
    .filter(Boolean)
    .join('\x1f');
}

export function pruneSlotFilter(selected, optionValues) {
  const list = Array.isArray(selected) ? selected : [];
  const opts = Array.isArray(optionValues) ? optionValues : [];
  if (!opts.length) {
    return list.length ? [] : list;
  }
  const allowed = new Set(opts.map((v) => normalizeForCompare(typeof v === 'string' ? v : v?.value)));
  const next = list.filter((s) => allowed.has(normalizeForCompare(s)));
  if (next.length === list.length && next.every((v, i) => v === list[i])) return list;
  return next;
}
