import { env } from "../src/config/env.js";

const commands = [
  { command: "start", description: "Открыть меню" },
  { command: "help", description: "Показать команды" },
  { command: "id", description: "Показать ваши ID для администратора" },
  { command: "restaurants", description: "Список доступных ресторанов" },
  { command: "restaurant", description: "Текущий ресторан или переключение по номеру" },
  { command: "reset", description: "Сбросить контекст текущего ресторана" },
  { command: "cancel", description: "Отменить текущий запрос" },
  { command: "admin", description: "Написать администратору" }
];

async function main() {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is required");

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setMyCommands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ commands })
  });
  const body = await response.text();
  console.log(body);
  if (!response.ok) throw new Error(`telegram_set_commands_failed:${response.status}`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
