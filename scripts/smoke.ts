import pg from "pg";
import { env } from "../src/config/env.js";

type CheckStatus = "ok" | "fail" | "warn";

const checks: Record<string, CheckStatus> = {};
const details: Record<string, string> = {};

function setCheck(name: string, status: CheckStatus, detail?: string) {
  checks[name] = status;
  if (detail) details[name] = detail;
}

try {
  const response = await fetch(`http://127.0.0.1:${env.PORT}/health`);
  setCheck("health", response.ok ? "ok" : "fail", response.ok ? undefined : `status=${response.status}`);
} catch (error) {
  setCheck("health", "fail", (error as Error).message);
}

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
try {
  await pool.query("SELECT 1");
  setCheck("db", "ok");

  const assistants = await pool.query("SELECT count(*)::int AS count FROM assistants WHERE status = 'active'");
  setCheck("assistants", assistants.rows[0].count > 0 ? "ok" : "warn", assistants.rows[0].count > 0 ? undefined : "no active assistants");

  const relays = await pool.query("SELECT count(*)::int AS count FROM relay_accounts WHERE status = 'active'");
  setCheck("relay_accounts", relays.rows[0].count > 0 ? "ok" : "warn", relays.rows[0].count > 0 ? undefined : "no active relay accounts");
} catch (error) {
  setCheck("db", "fail", (error as Error).message);
} finally {
  await pool.end();
}

if (env.TELEGRAM_ENABLED && !env.TELEGRAM_BOT_TOKEN) {
  setCheck("telegram_token", "fail", "TELEGRAM_ENABLED=true but TELEGRAM_BOT_TOKEN is empty");
} else {
  setCheck("telegram_token", "ok");
}

const ok = Object.values(checks).every((status) => status === "ok" || status === "warn");
console.log(JSON.stringify({ ok, checks, details }, null, 2));
process.exit(ok ? 0 : 1);
