import { env } from "../src/config/env.js";

async function main() {
  if (!env.MAX_BOT_TOKEN) throw new Error("MAX_BOT_TOKEN is required");
  const response = await fetch(new URL("/subscriptions", env.MAX_API_BASE_URL), {
    method: "GET",
    headers: { Authorization: env.MAX_BOT_TOKEN }
  });
  const body = await response.text();
  console.log(body);
  if (!response.ok) throw new Error(`max_subscriptions_failed:${response.status}`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
