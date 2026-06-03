import { env } from "../src/config/env.js";

async function main() {
  if (!env.MAX_BOT_TOKEN) throw new Error("MAX_BOT_TOKEN is required");
  const webhookUrl = new URL(`/webhooks/max/${env.MAX_WEBHOOK_BOT_KEY}`, env.PUBLIC_BASE_URL).toString();
  const url = new URL("/subscriptions", env.MAX_API_BASE_URL);
  url.searchParams.set("url", webhookUrl);
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: env.MAX_BOT_TOKEN }
  });
  const body = await response.text();
  console.log(body);
  if (!response.ok) throw new Error(`max_unsubscribe_failed:${response.status}`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
