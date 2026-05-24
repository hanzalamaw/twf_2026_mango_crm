export const SLAUGHTER_DAYS = [
  { value: 1, label: 'Day 1' },
  { value: 2, label: 'Day 2' },
  { value: 3, label: 'Day 3' },
];

export const SLAUGHTER_ANIMAL_TYPES = [
  { key: 'premium_cow', label: 'Premium Cow' },
  { key: 'standard_cow', label: 'Standard Cow' },
  { key: 'waqf_cow', label: 'Waqf Cow' },
  { key: 'exclusive_cow', label: 'Exclusive Cow' },
  { key: 'premium_goat', label: 'Premium Goat' },
  { key: 'super_goat', label: 'Super Goat' },
];

export function animalTypeLabel(key) {
  return SLAUGHTER_ANIMAL_TYPES.find((t) => t.key === key)?.label || key;
}

export function dayLabel(day) {
  const n = Number(day);
  if (n === 1) return 'Day 1';
  if (n === 2) return 'Day 2';
  if (n === 3) return 'Day 3';
  return `Day ${day}`;
}
