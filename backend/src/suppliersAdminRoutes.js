import multer from "multer";
import XLSX from "xlsx";

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function parseJsonField(v, fallback) {
  if (v == null || v === "") return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return fallback;
    }
  }
  return Array.isArray(v) || typeof v === "object" ? v : fallback;
}

function pgDateToIso(v) {
  if (v == null) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}

function nextDeliveryStatus(nextDate) {
  const iso = pgDateToIso(nextDate);
  if (!iso) return "none";
  const parts = iso.split("-");
  if (parts.length !== 3) return "none";
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  if (d < today) return "overdue";
  return "expected";
}

function mapRow(r) {
  const next = r.next_delivery_at;
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? "",
    whatsapp: r.whatsapp ?? "",
    email: r.email ?? "",
    addressRegion: r.address_region ?? "",
    productTags: Array.isArray(r.product_tags) ? r.product_tags : r.product_tags ?? [],
    scheduleEntries: Array.isArray(r.schedule_entries) ? r.schedule_entries : r.schedule_entries ?? [],
    lastDeliveryAt: pgDateToIso(r.last_delivery_at),
    nextDeliveryAt: pgDateToIso(next),
    nextDeliveryStatus: nextDeliveryStatus(next),
    isActive: r.is_active !== false,
    notes: r.notes ?? "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * @param {import("express").Express} app
 * @param {{ pool: import("pg").Pool; requireAdmin: (req: any, res: any) => any }} deps
 */
export function registerSuppliersAdminRoutes(app, { pool, requireAdmin }) {
  app.get("/api/admin/suppliers/export", async (req, res) => {
    const payload = requireAdmin(req, res);
    if (!payload) return;
    try {
      const { rows } = await pool.query(
        `select name, phone, whatsapp, email, address_region, product_tags, schedule_entries,
                last_delivery_at, next_delivery_at, is_active, notes
         from suppliers order by name asc`,
      );
      const data = rows.map((r) => ({
        name: r.name,
        phone: r.phone,
        whatsapp: r.whatsapp ?? "",
        email: r.email ?? "",
        addressRegion: r.address_region,
        productTagsJson: JSON.stringify(r.product_tags ?? []),
        scheduleEntriesJson: JSON.stringify(r.schedule_entries ?? []),
        lastDeliveryAt: pgDateToIso(r.last_delivery_at) ?? "",
        nextDeliveryAt: pgDateToIso(r.next_delivery_at) ?? "",
        isActive: r.is_active ? "yes" : "no",
        notes: r.notes ?? "",
      }));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ name: "" }]);
      XLSX.utils.book_append_sheet(wb, ws, "Suppliers");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="suppliers.xlsx"');
      res.send(Buffer.from(buf));
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.post("/api/admin/suppliers/import", uploadExcel.single("file"), async (req, res) => {
    const payload = requireAdmin(req, res);
    if (!payload) return;
    const file = req.file;
    if (!file?.buffer?.length) {
      res.status(400).json({ ok: false, error: "file_required" });
      return;
    }
    try {
      const wb = XLSX.read(file.buffer, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const created = [];
      const errors = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const name = String(row.name ?? row.Name ?? "").trim();
        if (!name) {
          errors.push({ row: i + 2, message: "empty_name" });
          continue;
        }
        const phone = String(row.phone ?? row.Phone ?? "").trim();
        const whatsapp = String(row.whatsapp ?? row.WhatsApp ?? "").trim() || null;
        const email = String(row.email ?? row.Email ?? "").trim() || null;
        const addressRegion = String(row.addressRegion ?? row["address_region"] ?? "").trim();
        let productTags = [];
        try {
          const pj = row.productTagsJson ?? row.product_tags_json ?? "[]";
          productTags = typeof pj === "string" ? JSON.parse(pj || "[]") : Array.isArray(pj) ? pj : [];
        } catch {
          productTags = [];
        }
        let scheduleEntries = [];
        try {
          const sj = row.scheduleEntriesJson ?? row.schedule_entries_json ?? "[]";
          scheduleEntries = typeof sj === "string" ? JSON.parse(sj || "[]") : Array.isArray(sj) ? sj : [];
        } catch {
          scheduleEntries = [];
        }
        const lastRaw = row.lastDeliveryAt ?? row.last_delivery_at ?? "";
        const nextRaw = row.nextDeliveryAt ?? row.next_delivery_at ?? "";
        const lastDeliveryAt = String(lastRaw).trim() ? String(lastRaw).trim().slice(0, 10) : null;
        const nextDeliveryAt = String(nextRaw).trim() ? String(nextRaw).trim().slice(0, 10) : null;
        const isActiveStr = String(row.isActive ?? row.is_active ?? "yes").toLowerCase();
        const isActive = isActiveStr !== "no" && isActiveStr !== "false" && isActiveStr !== "0";
        const notes = String(row.notes ?? row.Notes ?? "").trim();
        try {
          const ins = await pool.query(
            `insert into suppliers (name, phone, whatsapp, email, address_region, product_tags, schedule_entries,
              last_delivery_at, next_delivery_at, is_active, notes, updated_at)
             values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::date, $9::date, $10, $11, now())
             returning id`,
            [
              name,
              phone,
              whatsapp,
              email,
              addressRegion,
              JSON.stringify(productTags),
              JSON.stringify(scheduleEntries),
              lastDeliveryAt,
              nextDeliveryAt,
              isActive,
              notes,
            ],
          );
          created.push(ins.rows[0].id);
        } catch (err) {
          errors.push({ row: i + 2, message: String(err) });
        }
      }
      res.json({ ok: true, created: created.length, errors });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.get("/api/admin/suppliers", async (req, res) => {
    const payload = requireAdmin(req, res);
    if (!payload) return;

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const product = typeof req.query.product === "string" ? req.query.product.trim() : "";
    const activeRaw = typeof req.query.active === "string" ? req.query.active.trim() : "all";
    const deliveryWindow = typeof req.query.deliveryWindow === "string" ? req.query.deliveryWindow.trim() : "all";

    const where = [];
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      where.push(
        `(s.name ilike $${params.length} or s.phone ilike $${params.length} or coalesce(s.whatsapp,'') ilike $${params.length})`,
      );
    }
    if (product) {
      params.push(JSON.stringify([product]));
      where.push(`s.product_tags @> $${params.length}::jsonb`);
    }
    if (activeRaw === "true") {
      where.push(`s.is_active = true`);
    } else if (activeRaw === "false") {
      where.push(`s.is_active = false`);
    }
    if (deliveryWindow === "today") {
      where.push(`s.next_delivery_at = CURRENT_DATE`);
    } else if (deliveryWindow === "tomorrow") {
      where.push(`s.next_delivery_at = CURRENT_DATE + interval '1 day'`);
    } else if (deliveryWindow === "overdue") {
      where.push(`s.next_delivery_at is not null and s.next_delivery_at < CURRENT_DATE`);
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : "";

    try {
      const { rows } = await pool.query(
        `select s.* from suppliers s ${whereSql} order by s.name asc`,
        params,
      );
      res.json({ ok: true, items: rows.map(mapRow) });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.get("/api/admin/suppliers/:id", async (req, res) => {
    const payload = requireAdmin(req, res);
    if (!payload) return;
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!id) {
      res.status(400).json({ ok: false, error: "id_required" });
      return;
    }
    try {
      const { rows } = await pool.query(`select * from suppliers where id = $1::uuid`, [id]);
      if (!rows[0]) {
        res.status(404).json({ ok: false, error: "not_found" });
        return;
      }
      res.json({ ok: true, item: mapRow(rows[0]) });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.post("/api/admin/suppliers", async (req, res) => {
    const payload = requireAdmin(req, res);
    if (!payload) return;
    const body = req.body ?? {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp.trim() || null : null;
    const email = typeof body.email === "string" ? body.email.trim() || null : null;
    const addressRegion = typeof body.addressRegion === "string" ? body.addressRegion.trim() : "";
    const productTags = parseJsonField(body.productTags, []);
    const scheduleEntries = parseJsonField(body.scheduleEntries, []);
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const isActive = body.isActive !== false;
    const lastDeliveryAt =
      typeof body.lastDeliveryAt === "string" && body.lastDeliveryAt.trim()
        ? body.lastDeliveryAt.trim().slice(0, 10)
        : null;
    const nextDeliveryAt =
      typeof body.nextDeliveryAt === "string" && body.nextDeliveryAt.trim()
        ? body.nextDeliveryAt.trim().slice(0, 10)
        : null;

    try {
      const { rows } = await pool.query(
        `insert into suppliers (name, phone, whatsapp, email, address_region, product_tags, schedule_entries,
          last_delivery_at, next_delivery_at, is_active, notes, updated_at)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::date, $9::date, $10, $11, now())
         returning *`,
        [
          name,
          phone,
          whatsapp,
          email,
          addressRegion,
          JSON.stringify(Array.isArray(productTags) ? productTags : []),
          JSON.stringify(Array.isArray(scheduleEntries) ? scheduleEntries : []),
          lastDeliveryAt,
          nextDeliveryAt,
          isActive,
          notes,
        ],
      );
      res.status(201).json({ ok: true, item: mapRow(rows[0]) });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.put("/api/admin/suppliers/:id", async (req, res) => {
    const payload = requireAdmin(req, res);
    if (!payload) return;
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!id) {
      res.status(400).json({ ok: false, error: "id_required" });
      return;
    }
    const body = req.body ?? {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp.trim() || null : null;
    const email = typeof body.email === "string" ? body.email.trim() || null : null;
    const addressRegion = typeof body.addressRegion === "string" ? body.addressRegion.trim() : "";
    const productTags = parseJsonField(body.productTags, []);
    const scheduleEntries = parseJsonField(body.scheduleEntries, []);
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const isActive = body.isActive !== false;
    const lastDeliveryAt =
      typeof body.lastDeliveryAt === "string" && body.lastDeliveryAt.trim()
        ? body.lastDeliveryAt.trim().slice(0, 10)
        : null;
    const nextDeliveryAt =
      typeof body.nextDeliveryAt === "string" && body.nextDeliveryAt.trim()
        ? body.nextDeliveryAt.trim().slice(0, 10)
        : null;

    try {
      const { rows } = await pool.query(
        `update suppliers set
          name = $1, phone = $2, whatsapp = $3, email = $4, address_region = $5,
          product_tags = $6::jsonb, schedule_entries = $7::jsonb,
          last_delivery_at = $8::date, next_delivery_at = $9::date,
          is_active = $10, notes = $11, updated_at = now()
         where id = $12::uuid
         returning *`,
        [
          name,
          phone,
          whatsapp,
          email,
          addressRegion,
          JSON.stringify(Array.isArray(productTags) ? productTags : []),
          JSON.stringify(Array.isArray(scheduleEntries) ? scheduleEntries : []),
          lastDeliveryAt,
          nextDeliveryAt,
          isActive,
          notes,
          id,
        ],
      );
      if (!rows[0]) {
        res.status(404).json({ ok: false, error: "not_found" });
        return;
      }
      res.json({ ok: true, item: mapRow(rows[0]) });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.delete("/api/admin/suppliers/:id", async (req, res) => {
    const payload = requireAdmin(req, res);
    if (!payload) return;
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!id) {
      res.status(400).json({ ok: false, error: "id_required" });
      return;
    }
    try {
      const { rows } = await pool.query(`delete from suppliers where id = $1::uuid returning id`, [id]);
      if (!rows[0]) {
        res.status(404).json({ ok: false, error: "not_found" });
        return;
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.get("/api/admin/suppliers/:id/history", async (req, res) => {
    const payload = requireAdmin(req, res);
    if (!payload) return;
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!id) {
      res.status(400).json({ ok: false, error: "id_required" });
      return;
    }
    try {
      const { rows } = await pool.query(
        `select id, supplier_id, delivered_at, note, created_at
         from supplier_delivery_history where supplier_id = $1::uuid
         order by delivered_at desc, created_at desc`,
        [id],
      );
      res.json({
        ok: true,
        items: rows.map((r) => ({
          id: r.id,
          supplierId: r.supplier_id,
          deliveredAt: r.delivered_at,
          note: r.note,
          createdAt: r.created_at,
        })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.post("/api/admin/suppliers/:id/history", async (req, res) => {
    const payload = requireAdmin(req, res);
    if (!payload) return;
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!id) {
      res.status(400).json({ ok: false, error: "id_required" });
      return;
    }
    const body = req.body ?? {};
    const note = typeof body.note === "string" ? body.note.trim() : "";
    let deliveredAt = body.deliveredAt;
    if (typeof deliveredAt === "string" && deliveredAt.trim()) {
      deliveredAt = new Date(deliveredAt);
    } else {
      deliveredAt = new Date();
    }
    if (Number.isNaN(deliveredAt.getTime())) {
      res.status(400).json({ ok: false, error: "invalid_delivered_at" });
      return;
    }
    try {
      const { rows } = await pool.query(
        `insert into supplier_delivery_history (supplier_id, delivered_at, note)
         values ($1::uuid, $2, $3)
         returning id, supplier_id, delivered_at, note, created_at`,
        [id, deliveredAt.toISOString(), note],
      );
      const r = rows[0];
      res.status(201).json({
        ok: true,
        item: {
          id: r.id,
          supplierId: r.supplier_id,
          deliveredAt: r.delivered_at,
          note: r.note,
          createdAt: r.created_at,
        },
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });
}
