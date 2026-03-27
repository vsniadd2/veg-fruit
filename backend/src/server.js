import cors from "cors";
import express from "express";
import heicConvert from "heic-convert";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "node:path";

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
    where.push(`(p.name ilike $${params.length} or p.country ilike $${params.length})`);
  }
  if (categoryIds.length === 1) {
    params.push(categoryIds[0]);
    where.push(`p.category_id = $${params.length}::uuid`);
  } else if (categoryIds.length > 1) {
    params.push(categoryIds);
    where.push(`p.category_id = any($${params.length}::uuid[])`);
  }
  const whereSql = where.length ? `where ${where.join(" and ")}` : "";

  try {
    const count = await pool.query(`select count(*)::int as count from products p ${whereSql}`, params);
    const total = count.rows[0]?.count ?? 0;

    const items = await pool.query(
      `select p.id, p.name, p.country, p.price, p.image_url, p.image_data is not null as has_image_data, p.badge_kind, p.badge_label, p.category_id, p.in_stock, c.name as category_name
       from products p
       left join categories c on c.id = p.category_id
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
      items: items.rows.map((r) => ({
        id: r.id,
        name: r.name,
        country: r.country,
        price: r.price,
        imageUrl: r.has_image_data ? `/api/products/${r.id}/image` : r.image_url ?? "",
        categoryId: r.category_id ?? null,
        categoryName: r.category_name ?? null,
        inStock: r.in_stock !== false,
        badge: r.badge_kind
          ? {
              kind: r.badge_kind,
              label: r.badge_label ?? "",
            }
          : null,
      })),
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

  try {
    const { rows } = await pool.query(`select image_data, image_mime from products where id = $1::uuid`, [id]);
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
            `insert into products (name, category_id, country, price, image_url, image_data, image_mime, badge_kind, badge_label, in_stock)
             values ($1, $2::uuid, $3, $4::numeric, null, $5, $6, $7, $8, true)
             returning id, name, category_id, country, price, image_url, image_data is not null as has_image_data, badge_kind, badge_label, in_stock`,
            [
              name,
              categoryId,
              country,
              price,
              normalizedImage.imageBuffer,
              normalizedImage.imageMime,
              badgeKind,
              badgeLabel,
            ],
          )
        : await pool.query(
            `insert into products (name, category_id, country, price, image_url, image_data, image_mime, badge_kind, badge_label, in_stock)
             values ($1, $2::uuid, $3, $4::numeric, null, null, null, $5, $6, true)
             returning id, name, category_id, country, price, image_url, image_data is not null as has_image_data, badge_kind, badge_label, in_stock`,
            [name, categoryId, country, price, badgeKind, badgeLabel],
          );
    const r = rows[0];
    const category = r.category_id
      ? await pool.query(`select name from categories where id = $1::uuid`, [r.category_id])
      : { rows: [] };
    const categoryName = category.rows[0]?.name ?? null;
    res.status(201).json({
      id: r.id,
      name: r.name,
      country: r.country,
      price: r.price,
      imageUrl: r.has_image_data ? `/api/products/${r.id}/image` : r.image_url ?? "",
      categoryId: r.category_id ?? null,
      categoryName,
      inStock: r.in_stock !== false,
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
           in_stock = $7
       where id = $8::uuid
       returning id, name, category_id, country, price, image_url, image_data is not null as has_image_data, badge_kind, badge_label, in_stock`,
      [name, categoryId, country, price, badgeKind, badgeLabel, inStock, id],
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
    res.json({
      id: r.id,
      name: r.name,
      country: r.country,
      price: r.price,
      imageUrl: r.has_image_data ? `/api/products/${r.id}/image` : r.image_url ?? "",
      categoryId: r.category_id ?? null,
      categoryName,
      inStock: r.in_stock !== false,
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
  if (!subtitle) {
    res.status(400).json({ ok: false, error: "subtitle_required" });
    return;
  }
  if (!categoryId) {
    res.status(400).json({ ok: false, error: "category_required" });
    return;
  }

  try {
    const category = await pool.query(`select id from categories where id = $1::uuid`, [categoryId]);
    if (!category.rows[0]) {
      res.status(400).json({ ok: false, error: "category_not_found" });
      return;
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

