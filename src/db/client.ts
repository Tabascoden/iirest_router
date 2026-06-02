import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

export function createPgPool() {
  return new pg.Pool({ connectionString: env.DATABASE_URL });
}

export function createDb(pool = createPgPool()) {
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof createDb>;
