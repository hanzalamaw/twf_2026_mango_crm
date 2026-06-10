/** Operations sub-modules — Mango CRM (Riders + Deliveries only) */
export const OPERATION_MODULES = [
  {
    id: 'riders',
    name: 'Rider Management',
    desc: 'Riders, vehicles & delivery stats',
    path: '/operations/riders',
    permission: 'operation_rider_management',
    emoji: '🏍️',
    accent: '#BF360C',
    soft: '#FFCCBC',
  },
  {
    id: 'deliveries',
    name: 'Deliveries Management',
    desc: 'Challans, riders & print PDF',
    path: '/operations/deliveries',
    permission: 'operation_deliveries_management',
    emoji: '🚚',
    accent: '#FF5722',
    soft: '#FFE0B2',
  },
];

export function operationModuleHasAccess(m, permissions = {}) {
  return !!permissions[m.permission];
}

export function countAccessibleOperationModules(permissions) {
  return OPERATION_MODULES.filter((m) => operationModuleHasAccess(m, permissions)).length;
}
