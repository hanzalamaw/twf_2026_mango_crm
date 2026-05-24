export const LINE_DAYS = [
  { value: 1, label: 'Day 1' },
  { value: 2, label: 'Day 2' },
  { value: 3, label: 'Day 3' },
];

export const LINE_COW_TYPES = [
  { key: 'premium_cow', label: 'Premium Cow', multiplier: 7 },
  { key: 'standard_cow', label: 'Standard Cow', multiplier: 7 },
  { key: 'waqf_cow', label: 'Waqf Cow', multiplier: 7 },
  { key: 'exclusive_cow', label: 'Exclusive Cow', multiplier: 7 },
];

export const LINE_GOAT_TYPES = [
  { key: 'premium_goat', label: 'Premium Goat', multiplier: 1 },
  { key: 'super_goat', label: 'Super Goat', multiplier: 1 },
];

export const LINE_ANIMAL_TYPES = [...LINE_COW_TYPES, ...LINE_GOAT_TYPES];

export function animalTypeLabel(key) {
  return LINE_ANIMAL_TYPES.find((t) => t.key === key)?.label || key;
}

export function animalTypeMultiplier(key) {
  return LINE_ANIMAL_TYPES.find((t) => t.key === key)?.multiplier ?? 1;
}

export function weightedCount(rawCount, typeKey) {
  return (Number(rawCount) || 0) * animalTypeMultiplier(typeKey);
}

/** Sum weighted card values for cow types (premium, standard, waqf, exclusive). */
export function sumCowStats(stats = {}) {
  return LINE_COW_TYPES.reduce((sum, t) => sum + (Number(stats[t.key]) || 0), 0);
}

/** Sum weighted card values for goat types (premium, super). */
export function sumGoatStats(stats = {}) {
  return LINE_GOAT_TYPES.reduce((sum, t) => sum + (Number(stats[t.key]) || 0), 0);
}

export function dayLabel(day) {
  const n = Number(day);
  if (n === 1) return 'Day 1';
  if (n === 2) return 'Day 2';
  if (n === 3) return 'Day 3';
  return `Day ${day}`;
}
