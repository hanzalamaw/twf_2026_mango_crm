/**
 * Year filters for orders, payments, and batches.
 *
 * Orders (booking_date) & payments (date) business year bucketing:
 * - calendar year 2026 → bucket 2026
 * - calendar year 2024 → bucket 2024
 * - null, invalid, 2025, or any other year → bucket 2025
 */

/** Map a date column to business year (2026 / 2024 / else 2025). */
export function effectiveYearExpr(dateColExpr) {
  return `(CASE WHEN YEAR(${dateColExpr}) = 2026 THEN 2026 WHEN YEAR(${dateColExpr}) = 2024 THEN 2024 ELSE 2025 END)`;
}

export function orderDateCol(alias) {
  const prefix = alias ? `${alias}.` : "";
  return `${prefix}booking_date`;
}

export function orderEffectiveYearExpr(alias) {
  return effectiveYearExpr(orderDateCol(alias));
}

export function paymentDateCol(alias) {
  const prefix = alias ? `${alias}.` : "";
  return `${prefix}date`;
}

export function paymentEffectiveYearExpr(alias) {
  return effectiveYearExpr(paymentDateCol(alias));
}

function buildYearBucketWhere(year, params, effectiveYearSqlExpr) {
  if (!year || year === "all") return [];
  const y = String(year);
  if (y !== "2026" && y !== "2025" && y !== "2024") return [];
  params.push(Number(y));
  return [`${effectiveYearSqlExpr} = ?`];
}

/** Orders: booking_date bucketed to 2026 / 2024 / 2025. */
export function buildOrderYearWhere(year, params, alias = "o") {
  return buildYearBucketWhere(year, params, orderEffectiveYearExpr(alias));
}

/** Alias used by dashboard KPI routes. */
export function buildOrderBookingYearWhere(year, params, alias = "o") {
  return buildOrderYearWhere(year, params, alias);
}

/** Payments: date column; same bucketing as orders. */
export function buildPaymentYearWhere(year, params, alias = "p") {
  return buildYearBucketWhere(year, params, paymentEffectiveYearExpr(alias));
}

/** Batches: literal received_date calendar year (unchanged). */
export function buildBatchReceivedYearWhere(year, params, alias = "b") {
  const conditions = [];
  const col = `${alias}.received_date`;

  if (year === "2026" || year === "2025") {
    conditions.push(`YEAR(${col}) = ?`);
    params.push(year);
  } else if (year === "2024") {
    conditions.push(`(${col} IS NULL OR YEAR(${col}) < 2025)`);
  }

  return conditions;
}

/** Batches: created_at calendar year (e.g. New Order batch dropdown). */
export function buildBatchCreatedYearWhere(year, params, alias = "b") {
  const conditions = [];
  const col = `${alias}.created_at`;

  if (year === "2026" || year === "2025") {
    conditions.push(`YEAR(${col}) = ?`);
    params.push(year);
  } else if (year === "2024") {
    conditions.push(`(${col} IS NULL OR YEAR(${col}) < 2025)`);
  }

  return conditions;
}

/** Per-order KG: weight × quantity (quantity defaults to 1 only when NULL). */
export function orderKgExpr(alias = "o") {
  return `COALESCE(CAST(${alias}.weight AS DECIMAL(10,2)), 0) * COALESCE(CAST(${alias}.quantity AS SIGNED), 1)`;
}

/** Match an order row to a batch number expression (handles "1" vs "01"). */
export function orderMatchesBatchNumberExpr(orderAlias = "o", batchNumberExpr = "b.batch_number") {
  return `(
    ${orderAlias}.batch IS NOT NULL AND TRIM(${orderAlias}.batch) != '' AND (
      TRIM(${orderAlias}.batch) = TRIM(${batchNumberExpr})
      OR (
        TRIM(${orderAlias}.batch) REGEXP '^[0-9]+$'
        AND TRIM(${batchNumberExpr}) REGEXP '^[0-9]+$'
        AND CAST(TRIM(${orderAlias}.batch) AS UNSIGNED) = CAST(TRIM(${batchNumberExpr}) AS UNSIGNED)
      )
    )
  )`;
}

/** JOIN orders.batch to batches.batch_number (handles "1" vs "01"). */
export function batchOrderJoinSql(orderAlias = "o", batchAlias = "b") {
  return orderMatchesBatchNumberExpr(orderAlias, `${batchAlias}.batch_number`);
}

/** WHERE clause to filter orders by batch (same numeric normalization). */
export function buildOrderBatchFilter(batchValue, params, alias = "o") {
  const batch = String(batchValue ?? "").trim();
  if (!batch) return null;

  if (/^[0-9]+$/.test(batch)) {
    const n = parseInt(batch, 10);
    params.push(batch, n);
    return `(
      ${alias}.batch IS NOT NULL AND TRIM(${alias}.batch) != '' AND (
        TRIM(${alias}.batch) = ?
        OR (
          TRIM(${alias}.batch) REGEXP '^[0-9]+$'
          AND CAST(TRIM(${alias}.batch) AS UNSIGNED) = ?
        )
      )
    )`;
  }

  params.push(batch);
  return `TRIM(COALESCE(${alias}.batch, '')) = ?`;
}
