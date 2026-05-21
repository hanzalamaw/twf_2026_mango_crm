/**
 * Compact rider label: Name (Contact) - Vehicle Type
 */
export function formatRiderCompact(rider, fallbackName = 'Unassigned') {
  if (!rider) return fallbackName;
  const name = String(rider.rider_name || fallbackName).trim() || fallbackName;
  const contact = rider.contact ? ` (${String(rider.contact).trim()})` : '';
  const vehicle = rider.vehicle ? ` - ${String(rider.vehicle).trim()}` : '';
  return `${name}${contact}${vehicle}`;
}
