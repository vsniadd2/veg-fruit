import pg from "pg";

const { Pool } = pg;

function envInt(name, fallback) {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

export const pool = new Pool({
  host: process.env.PGHOST ?? "localhost",
  port: envInt("PGPORT", 5432),
  database: process.env.PGDATABASE ?? "veg_fruit",
  user: process.env.PGUSER ?? "veg_fruit",
  password: process.env.PGPASSWORD ?? "veg_fruit_password",
});

/** Одна миграция за раз: backend при старте и seed могут вызывать initDb() параллельно — без блокировки возможен duplicate key в pg_type. */
const INIT_DB_ADVISORY_LOCK_KEY = 872035901;

export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`select pg_advisory_lock($1)`, [INIT_DB_ADVISORY_LOCK_KEY]);

    await client.query(`create extension if not exists pgcrypto;`);
    await client.query(`
    create table if not exists categories (
      id uuid primary key default gen_random_uuid(),
      name text not null unique,
      created_at timestamptz not null default now()
    );
  `);
    await client.query(`
    create table if not exists products (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      country text not null,
      image_url text not null,
      badge_kind text null,
      badge_label text null,
      created_at timestamptz not null default now()
    );
  `);
    await client.query(`
    alter table products
    add column if not exists category_id uuid null references categories(id) on delete set null;
  `);
    await client.query(`
    alter table products
    add column if not exists price numeric(10, 2) null;
  `);
    await client.query(`
    alter table products
    add column if not exists image_data bytea null;
  `);
    await client.query(`
    alter table products
    add column if not exists image_mime text null;
  `);
    await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_products_image_data_max_5mb'
      ) THEN
        ALTER TABLE products
        ADD CONSTRAINT ck_products_image_data_max_5mb
        CHECK (image_data IS NULL OR octet_length(image_data) <= 5 * 1024 * 1024);
      END IF;
    END $$;
  `);
    await client.query(`
    alter table products
    alter column image_url drop not null;
  `);
    await client.query(`create index if not exists idx_products_category_id on products(category_id);`);
    await client.query(`
    alter table products
    add column if not exists in_stock boolean not null default true;
  `);
    await client.query(`
    alter table products
    add column if not exists is_popular boolean not null default false;
  `);
    await client.query(`
    alter table products
    add column if not exists weight_value numeric(12, 3) null;
  `);
    await client.query(`
    alter table products
    add column if not exists weight_unit text null;
  `);
    await client.query(`
    DO $$
    BEGIN
      -- Allow 'pcs' alongside weight units. We may have an older constraint from previous versions.
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_products_weight_unit_allowed') THEN
        ALTER TABLE products DROP CONSTRAINT ck_products_weight_unit_allowed;
      END IF;
      ALTER TABLE products ADD CONSTRAINT ck_products_weight_unit_allowed
      CHECK (weight_unit IS NULL OR weight_unit IN ('kg', 'g', 'pcs'));
    END $$;
  `);
    await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_products_weight_pair'
      ) THEN
        ALTER TABLE products ADD CONSTRAINT ck_products_weight_pair
        CHECK (
          (weight_value IS NULL AND weight_unit IS NULL)
          OR (weight_value IS NOT NULL AND weight_unit IS NOT NULL AND weight_value > 0)
        );
      END IF;
    END $$;
  `);

    await client.query(`
    create table if not exists suppliers (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      phone text not null default '',
      whatsapp text null,
      email text null,
      address_region text not null default '',
      product_tags jsonb not null default '[]'::jsonb,
      schedule_entries jsonb not null default '[]'::jsonb,
      last_delivery_at date null,
      next_delivery_at date null,
      is_active boolean not null default true,
      notes text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
    await client.query(`
    create table if not exists supplier_delivery_history (
      id uuid primary key default gen_random_uuid(),
      supplier_id uuid not null references suppliers(id) on delete cascade,
      delivered_at timestamptz not null default now(),
      note text not null default '',
      created_at timestamptz not null default now()
    );
  `);
    await client.query(`create index if not exists idx_suppliers_active on suppliers(is_active);`);
    await client.query(`create index if not exists idx_suppliers_next_delivery on suppliers(next_delivery_at);`);
    await client.query(`create index if not exists idx_suppliers_product_tags on suppliers using gin (product_tags);`);
    await client.query(`create index if not exists idx_supplier_history_supplier on supplier_delivery_history(supplier_id);`);

    await client.query(`
    create table if not exists home_cards (
      slot smallint primary key check (slot between 1 and 4),
      title text not null default '',
      subtitle text not null default '',
      category_id uuid null references categories(id) on delete restrict,
      image_data bytea null,
      image_mime text null,
      updated_at timestamptz not null default now()
    );
  `);
    await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_home_cards_image_data_max_5mb'
      ) THEN
        ALTER TABLE home_cards
        ADD CONSTRAINT ck_home_cards_image_data_max_5mb
        CHECK (image_data IS NULL OR octet_length(image_data) <= 5 * 1024 * 1024);
      END IF;
    END $$;
  `);
    await client.query(`create index if not exists idx_home_cards_category_id on home_cards(category_id);`);
    await client.query(`
    insert into home_cards (slot, title, subtitle)
    values
      (1, 'Сезонные фрукты', 'От 120 BYN/кг'),
      (2, 'Экзотика', 'От 350 BYN/шт'),
      (3, 'Наборы для салата', 'От 450 BYN/набор'),
      (4, 'Овощи', 'От 85 BYN/кг')
    on conflict (slot) do nothing;
  `);

    await client.query(`
    create sequence if not exists customer_orders_number_seq
      as bigint
      start with 100001
      increment by 1
      minvalue 100001
      no maxvalue
      cache 1;
  `);
    await client.query(`
    create table if not exists customer_orders (
      id uuid primary key default gen_random_uuid(),
      phone text not null,
      address text not null,
      order_payload jsonb not null,
      created_at timestamptz not null default now()
    );
  `);
    await client.query(`
    alter table customer_orders
    add column if not exists order_number bigint;
  `);
    await client.query(`
    update customer_orders o
    set order_number = v.n
    from (
      select id, nextval('customer_orders_number_seq') as n
      from customer_orders
      where order_number is null
      order by created_at
    ) as v
    where o.id = v.id;
  `);
    await client.query(`
    alter table customer_orders
    alter column order_number set default nextval('customer_orders_number_seq');
  `);
    await client.query(`
    alter table customer_orders
    alter column order_number set not null;
  `);
    await client.query(`
    create unique index if not exists uq_customer_orders_order_number on customer_orders(order_number);
  `);
    await client.query(`create index if not exists idx_customer_orders_created_at on customer_orders(created_at desc);`);
    await client.query(`
    alter table customer_orders
    add column if not exists status text not null default 'new';
  `);
    await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_customer_orders_status'
      ) THEN
        ALTER TABLE customer_orders
        ADD CONSTRAINT ck_customer_orders_status
        CHECK (status IN ('new', 'processing', 'completed'));
      END IF;
    END $$;
  `);
  } finally {
    try {
      await client.query(`select pg_advisory_unlock($1)`, [INIT_DB_ADVISORY_LOCK_KEY]);
    } catch {
      /* ignore */
    }
    client.release();
  }
}

