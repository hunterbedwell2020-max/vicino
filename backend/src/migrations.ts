import fs from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";

const MIGRATIONS_TABLE = "schema_migrations";
const MIGRATIONS_LOCK_KEY = 87873421;

export async function runMigrations(pool: Pool, migrationsDir?: string) {
  const targetDir = migrationsDir ?? path.join(process.cwd(), "migrations");
  await fs.mkdir(targetDir, { recursive: true });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [MIGRATIONS_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const files = (await fs.readdir(targetDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const sql = await fs.readFile(path.join(targetDir, file), "utf8");
    const migrationClient = await pool.connect();
    try {
      await migrationClient.query("BEGIN");
      await migrationClient.query(`SELECT pg_advisory_xact_lock($1)`, [MIGRATIONS_LOCK_KEY]);
      const alreadyApplied = await migrationClient.query(
        `SELECT 1 FROM ${MIGRATIONS_TABLE} WHERE id = $1 LIMIT 1`,
        [file]
      );
      if (alreadyApplied.rowCount) {
        await migrationClient.query("COMMIT");
        continue;
      }

      await migrationClient.query(sql);
      await migrationClient.query(`INSERT INTO ${MIGRATIONS_TABLE} (id) VALUES ($1)`, [file]);
      await migrationClient.query("COMMIT");
      console.log(`Applied migration: ${file}`);
    } catch (err) {
      await migrationClient.query("ROLLBACK");
      throw err;
    } finally {
      migrationClient.release();
    }
  }
}
