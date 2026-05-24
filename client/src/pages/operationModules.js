/** Operations sub-modules — same card metadata pattern as SubSystemSelection OPTIONS */
export const OPERATION_MODULES = [
  {
    id: 'general',
    name: 'General Dashboard',
    desc: 'Operational overview & KPIs',
    path: '/operations/general',
    permission: 'operation_general_dashboard',
    emoji: '📊',
    accent: '#E65100',
    soft: '#FFF3E0',
  },
  {
    id: 'support',
    name: 'Customer Support',
    desc: 'Tickets & customer support',
    path: '/operations/support',
    permission: 'operation_customer_support',
    emoji: '💬',
    accent: '#D84315',
    soft: '#FBE9E7',
  },
  {
    id: 'riders',
    name: 'Rider Management',
    desc: 'Riders, vehicles & routes',
    path: '/operations/riders',
    permission: 'operation_rider_management',
    /** Show card if admin OR supervisor rider permission */
    permissionsAny: ['operation_rider_management', 'operation_rider_management_supervisor'],
    emoji: '🏍️',
    accent: '#BF360C',
    soft: '#FFCCBC',
  },
  {
    id: 'deliveries',
    name: 'Deliveries Management',
    desc: 'Deliveries, riders & QR status',
    path: '/operations/deliveries',
    permission: 'operation_deliveries_management',
    emoji: '🚚',
    accent: '#FF5722',
    soft: '#FFE0B2',
  },
  {
    id: 'affluent',
    name: 'Affluent Management',
    desc: 'Affluent delivery groups only',
    path: '/operations/affluent',
    permission: 'operation_affluent_management',
    emoji: '💎',
    accent: '#FF7043',
    soft: '#FFE6DE',
  },
  {
    id: 'special-request',
    name: 'Special Request',
    desc: 'Special-request delivery groups',
    path: '/operations/special-request',
    permission: 'operation_special_request_management',
    emoji: '⭐',
    accent: '#F9A825',
    soft: '#FFF8E1',
  },
  {
    id: 'slaughter',
    name: 'Slaughter Management',
    desc: 'Qassai groups, slaughter counts & records',
    path: '/operations/slaughter/dashboard',
    permission: 'operation_slaughter_management',
    emoji: '🥩',
    accent: '#C62828',
    soft: '#FFEBEE',
  },
  {
    id: 'line',
    name: 'Line Management',
    desc: 'Line groups, cow/goat counts & records',
    path: '/operations/line/dashboard',
    permission: 'operation_line_management',
    emoji: '📋',
    accent: '#C62828',
    soft: '#FFEBEE',
  },
  {
    id: 'challan',
    name: 'Challan Management',
    desc: 'Challan PDFs & batch data',
    path: '/operations/challan',
    permission: 'operation_challan_management',
    emoji: '📄',
    accent: '#D84315',
    soft: '#FFCCBC',
  },
];

/** True if user can open this operations sub-module card */
export function operationModuleHasAccess(m, permissions = {}) {
  const p = permissions || {};
  if (m.permissionsAny?.length) return m.permissionsAny.some((key) => !!p[key]);
  return !!p[m.permission];
}

export function countAccessibleOperationModules(permissions) {
  return OPERATION_MODULES.filter((m) => operationModuleHasAccess(m, permissions)).length;
}
