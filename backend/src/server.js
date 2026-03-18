import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";

import { initDb, pool } from "./db.js";

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
  }),
);

const ADMIN_LOGIN = process.env.ADMIN_LOGIN ?? "fruit";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "1234";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev_jwt_secret_change_me";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "dev_jwt_refresh_secret_change_me";

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL ?? "15m";
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL ?? "30d";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

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
  const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId.trim() : "";
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(String(req.query.pageSize ?? "6"), 10) || 6));
  const offset = (page - 1) * pageSize;

  const where = [];
  const params = [];
  if (q) {
    params.push(`%${q}%`);
    where.push(`(p.name ilike $${params.length} or p.country ilike $${params.length})`);
  }
  if (categoryId) {
    params.push(categoryId);
    where.push(`p.category_id = $${params.length}::uuid`);
  }
  const whereSql = where.length ? `where ${where.join(" and ")}` : "";

  try {
    const count = await pool.query(`select count(*)::int as count from products p ${whereSql}`, params);
    const total = count.rows[0]?.count ?? 0;

    const items = await pool.query(
      `select p.id, p.name, p.country, p.price, p.image_url, p.image_data is not null as has_image_data, p.badge_kind, p.badge_label, p.category_id, c.name as category_name
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
  const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : null;
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

  if (!file || !file.buffer?.length) {
    res.status(400).json({ error: "image is required" });
    return;
  }

  if (!String(file.mimetype || "").startsWith("image/")) {
    res.status(400).json({ error: "invalid_image_type" });
    return;
  }

  try {
    const { rows } = await pool.query(
      `insert into products (name, category_id, country, price, image_url, image_data, image_mime, badge_kind, badge_label)
       values ($1, $2::uuid, $3, $4::numeric, null, $5, $6, $7, $8)
       returning id, name, category_id, country, price, image_url, image_data is not null as has_image_data, badge_kind, badge_label`,
      [name, categoryId, country, price, file.buffer, file.mimetype, badgeKind, badgeLabel],
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
      badge: r.badge_kind ? { kind: r.badge_kind, label: r.badge_label ?? "" } : null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

const PORT = 3001;

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

