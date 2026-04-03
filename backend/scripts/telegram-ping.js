/**
 * Проверка токена и доставки сообщения во все TELEGRAM_CHAT_ID.
 * Запуск из папки backend: npm run telegram-ping
 */
import "../src/loadEnv.js";
import { TELEGRAM_DEFAULT_BOT_TOKEN, TELEGRAM_DEFAULT_CHAT_IDS } from "../src/telegramConfig.js";

function trimUnquote(v) {
  let s = String(v ?? "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function parseChatIds(raw) {
  return [...new Set(String(raw ?? "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
}

function chatIdForApi(s) {
  if (/^-?\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isSafeInteger(n)) return n;
  }
  return s;
}

const token = trimUnquote(process.env.TELEGRAM_BOT_TOKEN) || TELEGRAM_DEFAULT_BOT_TOKEN;
const chatIds = (() => {
  const fromEnv = parseChatIds(trimUnquote(process.env.TELEGRAM_CHAT_ID));
  if (fromEnv.length > 0) return fromEnv;
  return [...TELEGRAM_DEFAULT_CHAT_IDS];
})();

async function main() {
  const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const me = await meRes.json().catch(() => null);
  console.log("getMe:", me);
  if (!me?.ok) {
    process.exit(1);
  }

  let failed = false;
  for (const idStr of chatIds) {
    const chat_id = chatIdForApi(idStr);
    const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        text: "veg-fruit: тест уведомлений (сообщение можно удалить).",
      }),
    });
    const send = await sendRes.json().catch(() => null);
    console.log(`sendMessage chat_id=${chat_id}:`, send);
    if (!send?.ok) {
      failed = true;
      console.error(
        "\nЕсли 403: откройте именно ЭТОГО бота (из getMe) и нажмите /start.\nЕсли chat not found: chat_id должен быть из getUpdates после сообщения боту.",
      );
    }
  }
  if (failed) process.exit(1);
  console.log(`\nОк: сообщения ушли в ${chatIds.length} чат(ов).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
