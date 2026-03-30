import cors from "cors";
import express from "express";
import heicConvert from "heic-convert";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "node:path";
import sharp from "sharp";

import { initDb, pool } from "./db.js";
import { registerSuppliersAdminRoutes } from "./suppliersAdminRoutes.js";

const app = express();

app.use(express.json());

const corsOrigins = String(
  process.env.CORS_ORIGINS ?? "http://127.0.0.1:5173,http://localhost:5173",
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins,
  }),
);

const ADMIN_LOGIN = process.env.ADMIN_LOGIN ?? "miksgoldfruct";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Miksgold1!";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev_jwt_secret_change_me";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "dev_jwt_refresh_secret_change_me";

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL ?? "15m";
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL ?? "30d";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
});

function sendUploadError(res, status, error, message) {
  res.status(status).json({ ok: false, error, message });
}

function detectMimeType(file) {
  const declaredMime = String(file?.mimetype ?? "").toLowerCase().trim();
  if (declaredMime) return declaredMime;
  const ext = path.extname(String(file?.originalname ?? "")).toLowerCase();
  if (ext === ".heic") return "image/heic";
  if (ext === ".heif") return "image/heif";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".avif") return "image/avif";
  return "";
}

async function normalizeUploadedImage(file) {
  if (!file?.buffer?.length) return null;

  const detectedMime = detectMimeType(file);
  if (!detectedMime.startsWith("image/")) {
    return { ok: false, error: "invalid_image_type", status: 400 };
  }

  const isHeicLike = detectedMime === "image/heic" || detectedMime === "image/heif";
  if (!isHeicLike) {
    return { ok: true, imageBuffer: file.buffer, imageMime: detectedMime };
  }

  try {
    const converted = await heicConvert({
      buffer: file.buffer,
      format: "JPEG",
      quality: 0.9,
    });
    const imageBuffer = Buffer.isBuffer(converted) ? converted : Buffer.from(converted);
    if (!imageBuffer.length) {
      return { ok: false, error: "image_conversion_failed", status: 400 };
    }
    if (imageBuffer.length > MAX_IMAGE_BYTES) {
      return { ok: false, error: "file_too_large", status: 413 };
    }
    return { ok: true, imageBuffer, imageMime: "image/jpeg" };
  } catch {
    return { ok: false, error: "unsupported_mobile_image_format", status: 400 };
  }
}

function mapProductWeight(row) {
  const wv = row.weight_value;
  const wu = row.weight_unit;
  if (wv == null || wu == null) return { weightValue: null, weightUnit: null };
  const n = typeof wv === "number" ? wv : Number.parseFloat(String(wv));
  if (!Number.isFinite(n)) return { weightValue: null, weightUnit: null };
  const unit = String(wu).toLowerCase();
  if (unit !== "kg" && unit !== "g" && unit !== "pcs") return { weightValue: null, weightUnit: null };
  return { weightValue: n, weightUnit: unit };
}

/** @returns {{ weightValue: number | null, weightUnit: string | null } | { error: string }} */
function parseWeightFromBody(body) {
  if (!body || typeof body !== "object") return { weightValue: null, weightUnit: null };
  const rawVal = body.weightValue;
  const rawUnit = typeof body.weightUnit === "string" ? body.weightUnit.trim().toLowerCase() : "";
  const emptyVal =
    rawVal === undefined ||
    rawVal === null ||
    rawVal === "" ||
    (typeof rawVal === "string" && !String(rawVal).trim());
  if (emptyVal && !rawUnit) return { weightValue: null, weightUnit: null };
  if (emptyVal || !rawUnit) return { error: "weight_incomplete" };
  const n =
    typeof rawVal === "number" && Number.isFinite(rawVal)
      ? rawVal
      : Number.parseFloat(String(rawVal).replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) return { error: "invalid_weight" };
  if (rawUnit !== "kg" && rawUnit !== "g" && rawUnit !== "pcs") return { error: "invalid_weight_unit" };
  return { weightValue: n, weightUnit: rawUnit };
}

function truthyFormFlag(v) {
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "1" || s === "true" || s === "on" || s === "yes";
  }
  return false;
}

function mapHomeCardRow(row) {
  return {
    slot: Number(row.slot),
    title: row.title ?? "",
    subtitle: row.subtitle ?? "",
    categoryId: row.category_id ?? null,
    categoryName: row.category_name ?? null,
    imageUrl: row.has_image_data ? `/api/public/home-cards/${row.slot}/image` : null,
  };
}

function signAccessToken() {
  return jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

function signRefreshToken() {
  return jwt.sign({ role: "admin", type: "refresh" }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_TTL });
}

function getBearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function requireAdmin(req, res) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: "missing_token" });
    return null;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload || payload.role !== "admin") {
      res.status(401).json({ ok: false, error: "invalid_token" });
      return null;
    }
    return payload;
  } catch {
    res.status(401).json({ ok: false, error: "invalid_token" });
    return null;
  }
}

app.post("/api/admin/login", async (req, res) => {
  const body = req.body ?? {};
  const login = typeof body.login === "string" ? body.login : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (login !== ADMIN_LOGIN || password !== ADMIN_PASSWORD) {
    res.status(401).json({ ok: false, error: "invalid_credentials" });
    return;
  }

  res.json({
    ok: true,
    accessToken: signAccessToken(),
    refreshToken: signRefreshToken(),
  });
});

app.post("/api/admin/refresh", async (req, res) => {
  const body = req.body ?? {};
  const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
  if (!refreshToken) {
    res.status(400).json({ ok: false, error: "refresh_required" });
    return;
  }

  try {
    const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    if (!payload || payload.role !== "admin" || payload.type !== "refresh") {
      res.status(401).json({ ok: false, error: "invalid_refresh" });
      return;
    }
    res.json({ ok: true, accessToken: signAccessToken() });
  } catch (e) {
    res.status(401).json({ ok: false, error: "invalid_refresh" });
  }
});

app.get("/api/admin/verify", async (req, res) => {
  const payload = requireAdmin(req, res);
  if (!payload) return;
  res.json({ ok: true, role: "admin" });
});

// Public categories for the customer-facing catalog.
// Admin token is NOT required.
app.get("/api/public/categories", async (_req, res) => {
  try {
    const { rows } = await pool.query(`select id, name from categories order by name asc`);
    res.json({ ok: true, items: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/** Топ категорий по числу товаров (для футера и виджетов). Популярность = количество позиций в каталоге. */
app.get("/api/public/categories/popular", async (req, res) => {
  const raw = req.query.limit;
  const n = raw != null ? Number.parseInt(String(raw), 10) : 4;
  const limit = Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : 4;
  try {
    const { rows } = await pool.query(
      `select c.id, c.name, count(p.id)::int as product_count
       from categories c
       inner join products p on p.category_id = c.id
       group by c.id, c.name
       order by count(p.id) desc, c.name asc
       limit $1::int`,
      [limit],
    );
    res.json({ ok: true, items: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get("/api/public/home-cards", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `select hc.slot, hc.title, hc.subtitle, hc.category_id, c.name as category_name, hc.image_data is not null as has_image_data
       from home_cards hc
       left join categories c on c.id = hc.category_id
       order by hc.slot asc`,
    );
    res.json({ ok: true, items: rows.map(mapHomeCardRow) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get("/api/public/home-cards/:slot/image", async (req, res) => {
  const slot = Number.parseInt(String(req.params.slot ?? ""), 10);
  if (!Number.isInteger(slot) || slot < 1 || slot > 4) {
    res.status(400).end();
    return;
  }
  try {
    const { rows } = await pool.query(`select image_data, image_mime from home_cards where slot = $1`, [slot]);
    const row = rows[0];
    if (!row?.image_data) {
      res.status(404).end();
      return;
    }
    res.setHeader("Content-Type", row.image_mime || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.end(row.image_data);
  } catch {
    res.status(500).end();
  }
});

app.get("/api/categories", async (req, res) => {
  const payload = requireAdmin(req, res);
  if (!payload) return;

  try {
    const { rows } = await pool.query(`select id, name from categories order by name asc`);
    res.json({ ok: true, items: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post("/api/categories", async (req, res) => {
  const payload = requireAdmin(req, res);
  if (!payload) return;

  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    res.status(400).json({ ok: false, error: "name_required" });
    return;
  }

  try {
    const { rows } = await pool.query(
      `insert into categories (name)
       values ($1)
       on conflict (name) do update set name = excluded.name
       returning id, name`,
      [name],
    );
    res.status(201).json({ ok: true, item: rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.put("/api/categories/:id", async (req, res) => {
  const payload = requireAdmin(req, res);
  if (!payload) return;

  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!id) {
    res.status(400).json({ ok: false, error: "id_required" });
    return;
  }
  if (!name) {
    res.status(400).json({ ok: false, error: "name_required" });
    return;
  }

  try {
    const { rows } = await pool.query(
      `update categories
       set name = $2
       where id = $1::uuid
       returning id, name`,
      [id, name],
    );
    if (!rows[0]) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    res.json({ ok: true, item: rows[0] });
  } catch (e) {
    // Unique name conflicts land here too.
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.delete("/api/categories/:id", async (req, res) => {
  const payload = requireAdmin(req, res);
  if (!payload) return;

  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!id) {
    res.status(400).json({ ok: false, error: "id_required" });
    return;
  }

  try {
    const usage = await pool.query(`select count(*)::int as count from home_cards where category_id = $1::uuid`, [id]);
    if ((usage.rows[0]?.count ?? 0) > 0) {
      res.status(409).json({ ok: false, error: "category_in_use_home_cards" });
      return;
    }
    const { rows } = await pool.query(`delete from categories where id = $1::uuid returning id`, [id]);
    if (!rows[0]) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get("/api/admin/search", async (req, res) => {
  const payload = requireAdmin(req, res);
  if (!payload) return;

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    res.json({ ok: true, categories: [], products: [] });
    return;
  }

  try {
    const categories = await pool.query(
      `select id, name
       from categories
       where name ilike $1
       order by name asc
       limit 10`,
      [`%${q}%`],
    );

    const products = await pool.query(
      `select p.id, p.name, p.country, p.price, p.category_id, c.name as category_name
       from products p
       left join categories c on c.id = p.category_id
       where (p.name ilike $1 or p.country ilike $1)
       order by p.created_at desc
       limit 10`,
      [`%${q}%`],
    );

    res.json({
      ok: true,
      categories: categories.rows,
      products: products.rows.map((r) => ({
        id: r.id,
        name: r.name,
        country: r.country,
        price: r.price,
        categoryId: r.category_id,
        categoryName: r.category_name ?? null,
      })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    const { rows } = await pool.query("select 1 as ok");
    res.json({ ok: true, db: rows[0]?.ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get("/api/products", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const categoryIdRaw = typeof req.query.categoryId === "string" ? req.query.categoryId.trim() : "";
  const categoryIds = categoryIdRaw
    ? categoryIdRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(String(req.query.pageSize ?? "6"), 10) || 6));
  const offset = (page - 1) * pageSize;

  const where = [];
  const params = [];
  if (q) {
    params.push(`%${q}%`);
    where.push(
      `(p.name ilike $${params.length} or p.country ilike $${params.length} or c.name ilike $${params.length} or coalesce(p.price::text, '') ilike $${params.length})`,
    );
  }
  if (categoryIds.length === 1) {
    params.push(categoryIds[0]);
    where.push(`p.category_id = $${params.length}::uuid`);
  } else if (categoryIds.length > 1) {
    params.push(categoryIds);
    where.push(`p.category_id = any($${params.length}::uuid[])`);
  }
  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const fromSql = `from products p left join categories c on c.id = p.category_id`;

  try {
    const count = await pool.query(`select count(*)::int as count ${fromSql} ${whereSql}`, params);
    const total = count.rows[0]?.count ?? 0;

    const items = await pool.query(
      `select p.id, p.name, p.country, p.price, p.image_url, p.image_data is not null as has_image_data, p.badge_kind, p.badge_label, p.category_id, p.in_stock, p.is_popular, p.weight_value, p.weight_unit, c.name as category_name
       ${fromSql}
       ${whereSql}
       order by p.created_at desc
       limit $${params.length + 1}
       offset $${params.length + 2}`,
      [...params, pageSize, offset],
    );

    res.json({
      page,
      pageSize,
      total,
      items: items.rows.map((r) => {
        const w = mapProductWeight(r);
        return {
          id: r.id,
          name: r.name,
          country: r.country,
          price: r.price,
          imageUrl: r.has_image_data ? `/api/products/${r.id}/image` : r.image_url ?? "",
          categoryId: r.category_id ?? null,
          categoryName: r.category_name ?? null,
          inStock: r.in_stock !== false,
          popular: r.is_popular === true,
          weightValue: w.weightValue,
          weightUnit: w.weightUnit,
          badge: r.badge_kind
            ? {
                kind: r.badge_kind,
                label: r.badge_label ?? "",
              }
            : null,
        };
      }),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/api/products/:id/image", async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!id) {
    res.status(400).end();
    return;
  }

  const wRaw = req.query.w;
  const wParsed = wRaw != null ? Number.parseInt(String(wRaw), 10) : 0;
  const targetWidth =
    Number.isFinite(wParsed) && wParsed > 0 ? Math.min(800, Math.max(64, wParsed)) : 0;

  try {
    const { rows } = await pool.query(`select image_data, image_mime from products where id = $1::uuid`, [id]);
    const row = rows[0];
    if (!row?.image_data) {
      res.status(404).end();
      return;
    }

    if (targetWidth > 0) {
      try {
        const out = await sharp(row.image_data, { failOn: "none" })
          .rotate()
          .resize({ width: targetWidth, withoutEnlargement: true })
          .jpeg({ quality: 82 })
          .toBuffer();
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=604800");
        res.end(out);
        return;
      } catch {
        // fallback: отдаём оригинал (редкие форматы / повреждённые файлы)
      }
    }

    res.setHeader("Content-Type", row.image_mime || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(row.image_data);
  } catch {
    res.status(500).end();
  }
});

app.post("/api/products", upload.single("image"), async (req, res) => {
  const payload = requireAdmin(req, res);
  if (!payload) return;

  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const categoryIdRaw = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
  const categoryId = categoryIdRaw || null;
  const country = typeof body.country === "string" ? body.country.trim() : "";
  const file = req.file ?? null;
  const priceRaw = body.price;
  const price =
    typeof priceRaw === "number"
      ? priceRaw
      : typeof priceRaw === "string" && priceRaw.trim()
        ? Number.parseFloat(priceRaw)
        : null;
  const badgeKind = typeof body.badgeKind === "string" ? body.badgeKind.trim() : null;
  const badgeLabel = typeof body.badgeLabel === "string" ? body.badgeLabel.trim() : null;
  const popular = truthyFormFlag(body.popular);

  const parsedWeight = parseWeightFromBody(body);
  if ("error" in parsedWeight) {
    const msg =
      parsedWeight.error === "weight_incomplete"
        ? "Укажите фасовку: число и единицу (кг или г)"
        : parsedWeight.error === "invalid_weight"
          ? "Некорректное значение фасовки"
          : "Единица фасовки: кг или г";
    res.status(400).json({ error: parsedWeight.error, message: msg });
    return;
  }
  const { weightValue, weightUnit } = parsedWeight;

  if (!name || !country) {
    res.status(400).json({ error: "name, country are required" });
    return;
  }

  const normalizedImage = await normalizeUploadedImage(file);
  if (normalizedImage && !normalizedImage.ok) {
    sendUploadError(
      res,
      normalizedImage.status,
      normalizedImage.error,
      normalizedImage.error === "file_too_large"
        ? "Файл слишком большой. Максимум 5 МБ."
        : "Не удалось обработать изображение. Используйте JPG, PNG, WEBP или сохраните фото с телефона в совместимом формате.",
    );
    return;
  }

  try {
    const { rows } =
      normalizedImage && normalizedImage.ok
        ? await pool.query(
            `insert into products (name, category_id, country, price, image_url, image_data, image_mime, badge_kind, badge_label, weight_value, weight_unit, in_stock, is_popular)
             values ($1, $2::uuid, $3, $4::numeric, null, $5, $6, $7, $8, $9::numeric, $10, true, $11)
             returning id, name, category_id, country, price, image_url, image_data is not null as has_image_data, badge_kind, badge_label, in_stock, is_popular, weight_value, weight_unit`,
            [
              name,
              categoryId,
              country,
              price,
              normalizedImage.imageBuffer,
              normalizedImage.imageMime,
              badgeKind,
              badgeLabel,
              weightValue,
              weightUnit,
              popular,
            ],
          )
        : await pool.query(
            `insert into products (name, category_id, country, price, image_url, image_data, image_mime, badge_kind, badge_label, weight_value, weight_unit, in_stock, is_popular)
             values ($1, $2::uuid, $3, $4::numeric, null, null, null, $5, $6, $7::numeric, $8, true, $9)
             returning id, name, category_id, country, price, image_url, image_data is not null as has_image_data, badge_kind, badge_label, in_stock, is_popular, weight_value, weight_unit`,
            [name, categoryId, country, price, badgeKind, badgeLabel, weightValue, weightUnit, popular],
          );
    const r = rows[0];
    const category = r.category_id
      ? await pool.query(`select name from categories where id = $1::uuid`, [r.category_id])
      : { rows: [] };
    const categoryName = category.rows[0]?.name ?? null;
    const w = mapProductWeight(r);
    res.status(201).json({
      id: r.id,
      name: r.name,
      country: r.country,
      price: r.price,
      imageUrl: r.has_image_data ? `/api/products/${r.id}/image` : r.image_url ?? "",
      categoryId: r.category_id ?? null,
      categoryName,
      inStock: r.in_stock !== false,
      popular: r.is_popular === true,
      weightValue: w.weightValue,
      weightUnit: w.weightUnit,
      badge: r.badge_kind ? { kind: r.badge_kind, label: r.badge_label ?? "" } : null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.put("/api/products/:id", async (req, res) => {
  const payload = requireAdmin(req, res);
  if (!payload) return;

  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!id) {
    res.status(400).json({ error: "id_required" });
    return;
  }

  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const country = typeof body.country === "string" ? body.country.trim() : "";
  const categoryIdRaw = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
  const categoryId = categoryIdRaw || null;
  const priceRaw = body.price;
  const price =
    typeof priceRaw === "number"
      ? priceRaw
      : typeof priceRaw === "string" && priceRaw.trim()
        ? Number.parseFloat(priceRaw)
        : null;
  const badgeKind =
    body.badgeKind === null || body.badgeKind === ""
      ? null
      : typeof body.badgeKind === "string"
        ? body.badgeKind.trim() || null
        : null;
  const badgeLabel =
    body.badgeLabel === null || body.badgeLabel === ""
      ? null
      : typeof body.badgeLabel === "string"
        ? body.badgeLabel.trim() || null
        : null;
  const inStock = !(body.inStock === false || body.inStock === "false");
  const popular =
    body.popular === true ||
    body.popular === "true" ||
    body.popular === 1 ||
    body.popular === "1";

  const parsedWeight = parseWeightFromBody(body);
  if ("error" in parsedWeight) {
    const msg =
      parsedWeight.error === "weight_incomplete"
        ? "Укажите фасовку: число и единицу (кг или г), или очистите поле"
        : parsedWeight.error === "invalid_weight"
          ? "Некорректное значение фасовки"
          : "Единица фасовки: кг или г";
    res.status(400).json({ error: parsedWeight.error, message: msg });
    return;
  }
  const { weightValue, weightUnit } = parsedWeight;

  if (!name || !country) {
    res.status(400).json({ error: "name, country are required" });
    return;
  }

  try {
    const { rows } = await pool.query(
      `update products
       set name = $1,
           category_id = $2::uuid,
           country = $3,
           price = $4::numeric,
           badge_kind = $5,
           badge_label = $6,
           in_stock = $7,
           weight_value = $8::numeric,
           weight_unit = $9,
           is_popular = $10
       where id = $11::uuid
       returning id, name, category_id, country, price, image_url, image_data is not null as has_image_data, badge_kind, badge_label, in_stock, is_popular, weight_value, weight_unit`,
      [name, categoryId, country, price, badgeKind, badgeLabel, inStock, weightValue, weightUnit, popular, id],
    );
    const r = rows[0];
    if (!r) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const category = r.category_id
      ? await pool.query(`select name from categories where id = $1::uuid`, [r.category_id])
      : { rows: [] };
    const categoryName = category.rows[0]?.name ?? null;
    const w = mapProductWeight(r);
    res.json({
      id: r.id,
      name: r.name,
      country: r.country,
      price: r.price,
      imageUrl: r.has_image_data ? `/api/products/${r.id}/image` : r.image_url ?? "",
      categoryId: r.category_id ?? null,
      categoryName,
      inStock: r.in_stock !== false,
      popular: r.is_popular === true,
      weightValue: w.weightValue,
      weightUnit: w.weightUnit,
      badge: r.badge_kind ? { kind: r.badge_kind, label: r.badge_label ?? "" } : null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  const payload = requireAdmin(req, res);
  if (!payload) return;

  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!id) {
    res.status(400).json({ error: "id_required" });
    return;
  }

  try {
    const { rows } = await pool.query(`delete from products where id = $1::uuid returning id`, [id]);
    if (!rows[0]) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/api/admin/home-cards", async (req, res) => {
  const payload = requireAdmin(req, res);
  if (!payload) return;
  try {
    const { rows } = await pool.query(
      `select hc.slot, hc.title, hc.subtitle, hc.category_id, c.name as category_name, hc.image_data is not null as has_image_data
       from home_cards hc
       left join categories c on c.id = hc.category_id
       order by hc.slot asc`,
    );
    res.json({ ok: true, items: rows.map(mapHomeCardRow) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.put("/api/admin/home-cards/:slot", async (req, res) => {
  const payload = requireAdmin(req, res);
  if (!payload) return;

  const slot = Number.parseInt(String(req.params.slot ?? ""), 10);
  if (!Number.isInteger(slot) || slot < 1 || slot > 4) {
    res.status(400).json({ ok: false, error: "slot_invalid" });
    return;
  }

  const body = req.body ?? {};
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const subtitle = typeof body.subtitle === "string" ? body.subtitle.trim() : "";
  const categoryIdRaw = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
  const categoryId = categoryIdRaw || null;

  if (!title) {
    res.status(400).json({ ok: false, error: "title_required" });
    return;
  }
  // subtitle is optional (can be empty string)

  try {
    if (categoryId) {
      const category = await pool.query(`select id from categories where id = $1::uuid`, [categoryId]);
      if (!category.rows[0]) {
        res.status(400).json({ ok: false, error: "category_not_found" });
        return;
      }
    }

    const updated = await pool.query(
      `update home_cards
       set title = $2,
           subtitle = $3,
           category_id = $4::uuid,
           updated_at = now()
       where slot = $1
       returning slot`,
      [slot, title, subtitle, categoryId],
    );
    if (!updated.rows[0]) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }

    const { rows } = await pool.query(
      `select hc.slot, hc.title, hc.subtitle, hc.category_id, c.name as category_name, hc.image_data is not null as has_image_data
       from home_cards hc
       left join categories c on c.id = hc.category_id
       where hc.slot = $1`,
      [slot],
    );
    res.json({ ok: true, item: mapHomeCardRow(rows[0]) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post("/api/admin/home-cards/:slot/image", upload.single("image"), async (req, res) => {
  const payload = requireAdmin(req, res);
  if (!payload) return;

  const slot = Number.parseInt(String(req.params.slot ?? ""), 10);
  if (!Number.isInteger(slot) || slot < 1 || slot > 4) {
    res.status(400).json({ ok: false, error: "slot_invalid" });
    return;
  }

  const file = req.file ?? null;
  if (!file?.buffer?.length) {
    res.status(400).json({ ok: false, error: "image_required" });
    return;
  }
  const normalizedImage = await normalizeUploadedImage(file);
  if (!normalizedImage || !normalizedImage.ok) {
    const errorCode = normalizedImage?.error ?? "invalid_image_type";
    sendUploadError(
      res,
      normalizedImage?.status ?? 400,
      errorCode,
      errorCode === "file_too_large"
        ? "Файл слишком большой. Максимум 5 МБ."
        : "Не удалось обработать изображение. Используйте JPG, PNG, WEBP или сохраните фото с телефона в совместимом формате.",
    );
    return;
  }

  try {
    const updated = await pool.query(
      `update home_cards
       set image_data = $2,
           image_mime = $3,
           updated_at = now()
       where slot = $1
       returning slot`,
      [slot, normalizedImage.imageBuffer, normalizedImage.imageMime],
    );
    if (!updated.rows[0]) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }

    const { rows } = await pool.query(
      `select hc.slot, hc.title, hc.subtitle, hc.category_id, c.name as category_name, hc.image_data is not null as has_image_data
       from home_cards hc
       left join categories c on c.id = hc.category_id
       where hc.slot = $1`,
      [slot],
    );
    res.json({ ok: true, item: mapHomeCardRow(rows[0]) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

registerSuppliersAdminRoutes(app, { pool, requireAdmin });

app.use((err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    sendUploadError(res, 413, "file_too_large", "Файл слишком большой. Максимум 5 МБ.");
    return;
  }

  next(err);
});

const PORT = Number.parseInt(process.env.PORT ?? "3001", 10) || 3001;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      // Intentionally no extra logging; keep minimal.
      process.stdout.write(`Backend listening on http://localhost:${PORT}\n`);
    });
  })
  .catch((e) => {
    process.stderr.write(`Failed to init DB: ${String(e)}\n`);
    process.exit(1);
  });

