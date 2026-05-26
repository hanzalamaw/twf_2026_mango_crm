/** Optimistic challan row updates for operations delivery-style tables. */

export function deriveGroupStatusFromOrders(orders = []) {
  const statuses = orders.map((o) => o.delivery_status || 'Pending');
  if (!statuses.length) return 'Pending';
  if (statuses.every((s) => s === 'Delivered')) return 'Delivered';
  if (statuses.some((s) => s === 'Returned to Farm')) return 'Returned to Farm';
  if (statuses.some((s) => s === 'Dispatched')) return 'Dispatched';
  if (statuses.some((s) => s === 'Rider Assigned')) return 'Rider Assigned';
  return 'Pending';
}

export function applyChallanPatchToGroups(groups, challanId, patch = {}) {
  const id = Number(challanId);
  if (!Number.isFinite(id)) return groups;

  return groups.map((g) => {
    if (Number(g.challan_id) !== id) return g;

    const hasOrders = Array.isArray(g.orders) && g.orders.length > 0;
    const nextOrders = hasOrders ? [...g.orders] : [];

    // If we still have orders rows, keep the previous behavior (best accuracy).
    if (hasOrders) {
      let orders = nextOrders;

      if (patch.delivery_status != null) {
        const status = String(patch.delivery_status);
        orders = orders.map((o) => ({ ...o, delivery_status: status }));
      }

      if (Object.prototype.hasOwnProperty.call(patch, 'rider_id')) {
        const rid = patch.rider_id === '' || patch.rider_id == null ? null : Number(patch.rider_id);
        orders = orders.map((o) => ({ ...o, rider_id: rid }));
      }

      const riderIds = [
        ...new Set(
          orders
            .map((o) => o.rider_id)
            .filter((v) => v !== null && v !== undefined && v !== '')
            .map(Number)
        ),
      ];

      return {
        ...g,
        orders,
        derived_status: deriveGroupStatusFromOrders(orders),
        rider_id: riderIds.length === 1 ? riderIds[0] : null,
        rider_count: riderIds.length,
      };
    }

    // Slim list rows: update using only group-level fields.
    const curStatus = g.derived_status || 'Pending';
    let derived_status = curStatus;
    let rider_id = g.rider_id ?? null;
    let rider_count = typeof g.rider_count === 'number' ? g.rider_count : (rider_id ? 1 : 0);

    if (patch.delivery_status != null) {
      const status = String(patch.delivery_status);
      // PATCH /status sets delivery_status on all linked orders; derived_status maps directly.
      if (status === 'Delivered') derived_status = 'Delivered';
      else if (status === 'Returned to Farm') derived_status = 'Returned to Farm';
      else if (status === 'Dispatched') derived_status = 'Dispatched';
      else if (status === 'Rider Assigned') derived_status = 'Rider Assigned';
      else derived_status = 'Pending';
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'rider_id')) {
      const rid = patch.rider_id === '' || patch.rider_id == null ? null : Number(patch.rider_id);
      rider_id = rid;
      rider_count = rid ? 1 : 0;

      // Server behavior: assigning a rider converts Pending -> Rider Assigned.
      if (rid != null) {
        if (derived_status === 'Pending') derived_status = 'Rider Assigned';
      } else {
        // Server behavior: removing a rider resets Pending/Rider Assigned -> Pending.
        if (derived_status === 'Rider Assigned') derived_status = 'Pending';
      }
    }

    return {
      ...g,
      derived_status,
      rider_id: rider_id == null ? null : rider_id,
      rider_count: rider_count,
    };
  });
}

export function markSkipSocketRefresh(skipRef, ms = 2500) {
  if (skipRef) skipRef.current = Date.now() + ms;
}

export function shouldSkipSocketRefresh(skipRef) {
  return skipRef && Date.now() < skipRef.current;
}
