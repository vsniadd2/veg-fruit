import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** Корень репозитория, затем backend/.env. Подставляем из файла, только если переменная не задана или пустая (иначе пустое значение из shell не даёт прочитать токен из .env; непустые значения из Docker Compose сохраняем). */
const candidates = [path.resolve(dir, "../../.env"), path.resolve(dir, "../.env")];

for (const p of candidates) {
  if (!fs.existsSync(p)) continue;
  const parsed = dotenv.parse(fs.readFileSync(p, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    const cur = process.env[key];
    if (cur !== undefined && cur !== "") continue;
    if (value === "") continue;
    process.env[key] = value;
  }
}
