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
}

