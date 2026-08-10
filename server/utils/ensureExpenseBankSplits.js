import { log, logError } from "./logger.js";

/**
 * Ensures expense bank-split columns exist on booking_expenses
 * (and farm/procurement expense tables if present).
 * `bank` = TWF; `bank_tw_traders` / `bank_others` match payments.
 */
export async function ensureExpenseBankSplits(db) {
  const tables = ["booking_expenses", "farm_expenses", "procurement_expenses"];

  for (const table of tables) {
    try {
      const [exists] = await db.execute(
        `SELECT 1 AS ok
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
         LIMIT 1`,
        [table]
      );
      if (!exists.length) continue;

      const [tw] = await db.execute(`SHOW COLUMNS FROM \`${table}\` LIKE 'bank_tw_traders'`);
      if (!tw.length) {
        await db.execute(
          `ALTER TABLE \`${table}\`
           ADD COLUMN \`bank_tw_traders\` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER \`bank\``
        );
        log("MIGRATION", `Added ${table}.bank_tw_traders`);
      }

      const [others] = await db.execute(`SHOW COLUMNS FROM \`${table}\` LIKE 'bank_others'`);
      if (!others.length) {
        await db.execute(
          `ALTER TABLE \`${table}\`
           ADD COLUMN \`bank_others\` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER \`bank_tw_traders\``
        );
        log("MIGRATION", `Added ${table}.bank_others`);
      }
    } catch (e) {
      logError("MIGRATION", `ensureExpenseBankSplits failed for ${table}`, e);
      throw e;
    }
  }
}
