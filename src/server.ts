import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { createDb, createPgPool } from "./db/client.js";
import { PostgresStore } from "./db/postgres-store.js";
import { logger } from "./utils/logger.js";
import { startBackgroundWorkers } from "./workers/background-workers.js";

const pool = createPgPool();
const store = new PostgresStore(createDb(pool));
const { app, dispatcher } = await buildApp({ store });
const workers = startBackgroundWorkers({ store, dispatcher });

app.addHook("onClose", async () => {
  workers.stop();
  await pool.end();
});

try {
  await app.listen({ host: "0.0.0.0", port: env.PORT });
  logger.info({ port: env.PORT }, "server_started");
} catch (error) {
  logger.error({ err: error }, "server_failed");
  await pool.end();
  process.exit(1);
}
