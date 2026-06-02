import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { env } from "../src/config/env.js";

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

await pool.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`);

const migrations = ["001_init.sql", "002_jobs_reliability.sql"];
for (const migration of migrations) {
  const applied = await pool.query("SELECT id FROM schema_migrations WHERE id = $1", [migration]);
  if (applied.rowCount) continue;
  const sql = await readFile(join(process.cwd(), "db", "migrations", migration), "utf8");
  await pool.query("BEGIN");
  try {
    await pool.query(sql);
    await pool.query("INSERT INTO schema_migrations(id) VALUES ($1)", [migration]);
    await pool.query("COMMIT");
    console.log(`applied ${migration}`);
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

await pool.end();
