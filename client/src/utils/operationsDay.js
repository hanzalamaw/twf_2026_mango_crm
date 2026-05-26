/** Match server dayLabelToNumber — "Day 1" / "1" → 1, etc. */
export function dayLabelToNumber(day) {
  const n = String(day || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (n === 'day 1' || n === 'day1' || n === '1') return 1;
  if (n === 'day 2' || n === 'day2' || n === '2') return 2;
  if (n === 'day 3' || n === 'day3' || n === '3') return 3;
  return null;
}
