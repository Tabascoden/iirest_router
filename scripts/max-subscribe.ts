import { env } from "../src/config/env.js";

const updateTypes = ["message_created", "bot_started", "message_callback", "bot_added", "bot_removed"];
const secretPattern = /^[A-Za-z0-9_-]{5,256}$/;

function requireMaxConfig() {
  if (!env.MAX_BOT_TOKEN) throw new Error("MAX_BOT_TOKEN is required");
  if (!env.MAX_WEBHOOK_SECRET) throw new Error("MAX_WEBHOOK_SECRET is required");
  if (!secretPattern.test(env.MAX_WEBHOOK_SECRET)) {
    throw new Error("MAX_WEBHOOK_SECRET must match ^[A-Za-z0-9_-]{5,256}$");
  }
  if (!env.PUBLIC_BASE_URL.startsWith("https://")) {
    throw new Error("PUBLIC_BASE_URL must start with https:// for MAX webhook subscriptions");
  }
}

async function main() {
  requireMaxConfig();
  const webhookUrl = new URL(`/webhooks/max/${env.MAX_WEBHOOK_BOT_KEY}`, env.PUBLIC_BASE_URL).toString();
  const response = await fetch(new URL("/subscriptions", env.MAX_API_BASE_URL), {
    method: "POST",
    headers: {
      Authorization: env.MAX_BOT_TOKEN,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url: webhookUrl,
      update_types: updateTypes,
      secret: env.MAX_WEBHOOK_SECRET
    })
  });
  const body = await response.text();
  console.log(body);
  if (!response.ok) throw new Error(`max_subscribe_failed:${response.status}`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
