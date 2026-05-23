/** Shared affluent / special-request tagging for operations modules. */

export const DAY_OPTIONS = ['Day 1', 'Day 2', 'Day 3'];

export const AFFLUENT_ROW_STYLE = {
  background: '#FFF7F7',
  borderLeft: '3px solid #D32F2F',
};

export const SPECIAL_REQUEST_ROW_STYLE = {
  background: '#FFFBF0',
  borderLeft: '3px solid #F9A825',
};

export function normalizeForCompare(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeDayLabel(value) {
  const n = normalizeForCompare(value);
  if (n === 'day 1' || n === 'day1' || n === '1') return 'Day 1';
  if (n === 'day 2' || n === 'day2' || n === '2') return 'Day 2';
  if (n === 'day 3' || n === 'day3' || n === '3') return 'Day 3';
  return String(value || '').trim() || '';
}

const PLACEHOLDER_DESCRIPTIONS = new Set(['-', '—', '–', '--', '---', 'none', 'n/a', 'na', 'nil', 'null']);

/** Treat "-", em dash, n/a, etc. as empty description. */
export function isPlaceholderDescriptionValue(value) {
  const norm = normalizeForCompare(value);
  return !norm || PLACEHOLDER_DESCRIPTIONS.has(norm);
}

function collectRawDescriptionValues(source) {
  if (!source) return [];
  const values = [];
  const push = (val) => {
    const trimmed = String(val ?? '').trim();
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

const PRIORITY_WORD_RE = /\bPRIORITY\b/i;

/** Any non-placeholder description contains the word PRIORITY. */
export function hasPriorityInDescription(source) {
  return collectRawDescriptionValues(source).some(
    (v) => !isPlaceholderDescriptionValue(v) && PRIORITY_WORD_RE.test(v)
  );
}

export function getDescriptionText(source) {
  if (!source) return '';

  const normalize = (v) =>
    String(v || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

  const originalMap = new Map();

  const addValue = (val) => {
    if (isPlaceholderDescriptionValue(val)) return;
    const norm = normalize(val);
    if (!norm) return;
    if (!originalMap.has(norm)) {
      originalMap.set(norm, String(val).trim());
    }
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
  ].forEach(addValue);

  (source.orders || []).forEach((o) => {
    addValue(o.description);
  });

  return Array.from(originalMap.values()).join(' | ');
}

export function hasDescription(source) {
  return getDescriptionText(source).length > 0;
}

export function nonWaqfHissaCount(source, totalField = 'total_hissa', waqfField = 'total_waqf_hissa') {
  const totalHissa = Number(source?.[totalField] ?? source?.hissa_count ?? 0);
  const waqfHissa = Number(source?.[waqfField] ?? source?.waqf_hissa_count ?? 0);
  return totalHissa - waqfHissa;
}

/** Special request: meaningful description (not “-”), no PRIORITY word. Checked before affluent. */
export function isSpecialRequestOrder(source, _totalField = 'total_hissa', _waqfField = 'total_waqf_hissa') {
  if (!hasDescription(source)) return false;
  if (hasPriorityInDescription(source)) return false;
  return true;
}

/** Affluent: among non–special-request rows, 3+ non-waqf hissa or description contains PRIORITY. */
export function isAffluentOrder(source, totalField = 'total_hissa', waqfField = 'total_waqf_hissa') {
  if (isSpecialRequestOrder(source, totalField, waqfField)) return false;
  if (hasPriorityInDescription(source)) return true;
  return nonWaqfHissaCount(source, totalField, waqfField) >= 3;
}

export function getOrderTag(source, totalField = 'total_hissa', waqfField = 'total_waqf_hissa') {
  if (isSpecialRequestOrder(source, totalField, waqfField)) return 'special_request';
  if (isAffluentOrder(source, totalField, waqfField)) return 'affluent';
  return null;
}

/** Delivery/challan group rows from deliveries/groups API. */
export function getDeliveryGroupTag(source) {
  return getOrderTag(source, 'hissa_count', 'waqf_hissa_count');
}

export function isDeliverySpecialRequestGroup(source) {
  return getDeliveryGroupTag(source) === 'special_request';
}

export function isDeliveryAffluentGroup(source) {
  return getDeliveryGroupTag(source) === 'affluent';
}

export function getChallanRowHighlight(tag) {
  if (tag === 'affluent') return AFFLUENT_ROW_STYLE;
  if (tag === 'special_request') return SPECIAL_REQUEST_ROW_STYLE;
  return { background: null, borderLeft: '3px solid transparent' };
}

export function batchesForDay(batches, day) {
  const want = normalizeDayLabel(day);
  if (!want) return batches || [];
  return (batches || []).filter((b) => normalizeDayLabel(b.day) === want);
}

export function latestBatchIdForDay(batches, day) {
  const list = batchesForDay(batches, day);
  if (!list.length) return null;
  return list[0].batch_id;
}

export function batchMatchesDay(batch, day) {
  if (!day) return true;
  return normalizeDayLabel(batch?.day) === normalizeDayLabel(day);
}
