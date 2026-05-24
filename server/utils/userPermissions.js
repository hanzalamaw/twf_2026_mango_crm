/**
 * Build the permissions object returned to the client from a joined users+roles row.
 * Most operation sub-screens require operation_management. Rider supervisor can be granted
 * without the master Operations toggle so supervisor-only roles still get a consistent API + UI.
 * @param {object} row - DB row with role permission columns
 */
export function buildPermissionsFromRoleRow(row) {
  const op = !!row.operation_management;
  let riderAdm = !!row.operation_rider_management;
  let riderSup = !!row.operation_rider_management_supervisor;
  if (riderAdm && riderSup) riderSup = false;
  else if (riderSup) riderAdm = false;
  return {
    control_management: !!row.control_management,
    booking_management: !!row.booking_management,
    operation_management: op,
    operation_general_dashboard: op && !!row.operation_general_dashboard,
    operation_customer_support: op && !!row.operation_customer_support,
    operation_rider_management: op && riderAdm,
    operation_rider_management_supervisor: riderSup,
    operation_deliveries_management: op && !!row.operation_deliveries_management,
    operation_challan_management: op && !!row.operation_challan_management,
    operation_affluent_management: op && !!row.operation_affluent_management,
    operation_special_request_management: op && !!row.operation_special_request_management,
    operation_slaughter_management: op && !!row.operation_slaughter_management,
    operation_line_management: op && !!row.operation_line_management,
    farm_management: !!row.farm_management,
    procurement_management: !!row.procurement_management,
    accounting_and_finance: !!row.accounting_and_finance,
    performance_management: !!row.performance_management
  };
}
