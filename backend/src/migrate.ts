import { pool } from "./db.js";
import { runMigrations } from "./migrations.js";

async function run() {
  await runMigrations(pool);
  console.log("Migrations complete.");
  await pool.end();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
