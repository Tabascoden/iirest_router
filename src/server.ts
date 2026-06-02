import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { createDb, createPgPool } from "./db/client.js";
import { PostgresStore } from "./db/postgres-store.js";
import { logger } from "./utils/logger.js";

const pool = createPgPool();
const app = await buildApp({ store: new PostgresStore(createDb(pool)) });

try {
  await app.listen({ host: "0.0.0.0", port: env.PORT });
  logger.info({ port: env.PORT }, "server_started");
} catch (error) {
  logger.error({ err: error }, "server_failed");
  await pool.end();
  process.exit(1);
}
