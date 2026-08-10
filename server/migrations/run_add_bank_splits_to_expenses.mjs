import "dotenv/config";
import mysql from "mysql2/promise";

const tables = [
  "booking_expenses",
  "farm_expenses",
  "procurement_expenses",
  "accounting_expenses",
];

async function ensureColumn(db, table, column, ddl) {
  try {
    const [cols] = await db.execute(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
    if (cols.length) {
      console.log(`${table}.${column} already exists`);
      return;
    }
    await db.execute(ddl);
    console.log(`added ${table}.${column}`);
  } catch (e) {
    console.log(`skip ${table}.${column}: ${e.message}`);
  }
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 20000,
  });

  for (const t of tables) {
    await ensureColumn(
      db,
      t,
      "bank_tw_traders",
      `ALTER TABLE \`${t}\` ADD COLUMN \`bank_tw_traders\` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER \`bank\``
    );
    await ensureColumn(
      db,
      t,
      "bank_others",
      `ALTER TABLE \`${t}\` ADD COLUMN \`bank_others\` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER \`bank_tw_traders\``
    );
  }

  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
