import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "veg_fruit",
  user: "veg_fruit",
  password: "veg_fruit_password",
});

export async function initDb() {
  await pool.query(`create extension if not exists pgcrypto;`);
  await pool.query(`
    create table if not exists categories (
      id uuid primary key default gen_random_uuid(),
      name text not null unique,
      created_at timestamptz not null default now()
    );
  `);
  await pool.query(`
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
  await pool.query(`
    alter table products
    add column if not exists category_id uuid null references categories(id) on delete set null;
  `);
  await pool.query(`
    alter table products
    add column if not exists price numeric(10, 2) null;
  `);
  await pool.query(`
    alter table products
    add column if not exists image_data bytea null;
  `);
  await pool.query(`
    alter table products
    add column if not exists image_mime text null;
  `);
  await pool.query(`
    alter table products
    alter column image_url drop not null;
  `);
  await pool.query(`create index if not exists idx_products_category_id on products(category_id);`);
  await pool.query(`
    alter table products
    add column if not exists in_stock boolean not null default true;
  `);

  await pool.query(`
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
  await pool.query(`
    create table if not exists supplier_delivery_history (
      id uuid primary key default gen_random_uuid(),
      supplier_id uuid not null references suppliers(id) on delete cascade,
      delivered_at timestamptz not null default now(),
      note text not null default '',
      created_at timestamptz not null default now()
    );
  `);
  await pool.query(`create index if not exists idx_suppliers_active on suppliers(is_active);`);
  await pool.query(`create index if not exists idx_suppliers_next_delivery on suppliers(next_delivery_at);`);
  await pool.query(`create index if not exists idx_suppliers_product_tags on suppliers using gin (product_tags);`);
  await pool.query(`create index if not exists idx_supplier_history_supplier on supplier_delivery_history(supplier_id);`);

  await pool.query(`
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
  await pool.query(`create index if not exists idx_home_cards_category_id on home_cards(category_id);`);
  await pool.query(`
    insert into home_cards (slot, title, subtitle)
    values
      (1, 'Сезонные фрукты', 'От 120 BYN/кг'),
      (2, 'Экзотика', 'От 350 BYN/шт'),
      (3, 'Наборы для салата', 'От 450 BYN/набор'),
      (4, 'Овощи', 'От 85 BYN/кг')
    on conflict (slot) do nothing;
  `);
}

