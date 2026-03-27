/**
 * Заполняет БД демо-категориями и товарами с внешними URL картинок.
 *
 * Запуск (локально, Postgres на localhost): npm run seed
 * Повторно не вставляет товары, если таблица products непустая.
 * Чтобы пересоздать демо-товары: SEED_RESET=1 npm run seed
 * Обновить только ссылки на картинки у уже существующих строк с теми же названиями:
 *   SEED_SYNC_IMAGES=1 npm run seed
 */
import { initDb, pool } from "../src/db.js";

const CATEGORY_ORDER = ["Овощи", "Фрукты", "Ягоды"];

/**
 * Прямые ссылки на upload.wikimedia.org (Commons разрешает хотлинк).
 * Unsplash в <img> часто даёт обрыв из‑за политики CDN/реферера.
 */
const SEED_ROWS = [
  // Овощи
  {
    category: "Овощи",
    name: "Морковь молодая",
    country: "Беларусь",
    price: "3.90",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Carrots_of_many_colors.jpg/960px-Carrots_of_many_colors.jpg",
    badge_kind: "organic",
    badge_label: "ОРГАНИК",
  },
  {
    category: "Овощи",
    name: "Помидоры черри",
    country: "Испания",
    price: "12.50",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Bright_red_tomato_and_cross_section02.jpg/960px-Bright_red_tomato_and_cross_section02.jpg",
    badge_kind: "hit",
    badge_label: "ХИТ",
  },
  {
    category: "Овощи",
    name: "Огурец тепличный",
    country: "Беларусь",
    price: "5.20",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Cucumber_BNC.jpg/960px-Cucumber_BNC.jpg",
    badge_kind: null,
    badge_label: null,
  },
  {
    category: "Овощи",
    name: "Брокколи",
    country: "Италия",
    price: "8.40",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Broccoli_and_cross_section_edit.jpg/960px-Broccoli_and_cross_section_edit.jpg",
    badge_kind: "seasonal",
    badge_label: "СЕЗОННОЕ",
  },
  {
    category: "Овощи",
    name: "Сладкий перец",
    country: "Турция",
    price: "9.80",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Baby_Bell_pepper_Capsicum_annuum_3.jpg/960px-Baby_Bell_pepper_Capsicum_annuum_3.jpg",
    badge_kind: null,
    badge_label: null,
  },
  {
    category: "Овощи",
    name: "Свёкла столовая",
    country: "Беларусь",
    price: "2.60",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Beetroot_preparing_for_curry.jpg/960px-Beetroot_preparing_for_curry.jpg",
    badge_kind: null,
    badge_label: null,
  },
  {
    category: "Овощи",
    name: "Лук репчатый",
    country: "Египет",
    price: "2.40",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Yellow_onion_with_x-section.jpg/960px-Yellow_onion_with_x-section.jpg",
    badge_kind: null,
    badge_label: null,
  },
  {
    category: "Овощи",
    name: "Картофель ранний",
    country: "Беларусь",
    price: "1.80",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Potato_tuber_%28248_03%29_Potato_tuber_cross-section.jpg/960px-Potato_tuber_%28248_03%29_Potato_tuber_cross-section.jpg",
    badge_kind: "hit",
    badge_label: "ХИТ",
  },
  {
    category: "Овощи",
    name: "Капуста белокочанная",
    country: "Беларусь",
    price: "3.10",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Chou_1.jpg/960px-Chou_1.jpg",
    badge_kind: null,
    badge_label: null,
  },
  {
    category: "Овощи",
    name: "Чеснок",
    country: "Испания",
    price: "6.50",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Garlic_Bulbs_2.jpg/960px-Garlic_Bulbs_2.jpg",
    badge_kind: null,
    badge_label: null,
  },
  {
    category: "Овощи",
    name: "Кабачок молодой",
    country: "Беларусь",
    price: "4.20",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Zucchini_in_basket_2021_G1.jpg/960px-Zucchini_in_basket_2021_G1.jpg",
    badge_kind: "seasonal",
    badge_label: "СЕЗОННОЕ",
  },
  {
    category: "Овощи",
    name: "Шпинат листовой",
    country: "Италия",
    price: "7.20",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Spinach_leaves.jpg/960px-Spinach_leaves.jpg",
    badge_kind: "organic",
    badge_label: "ОРГАНИК",
  },
  {
    category: "Овощи",
    name: "Салат айсберг",
    country: "Испания",
    price: "5.90",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Iceberg_lettuce_in_SB.jpg/960px-Iceberg_lettuce_in_SB.jpg",
    badge_kind: null,
    badge_label: null,
  },
  {
    category: "Овощи",
    name: "Редис пучок",
    country: "Беларусь",
    price: "4.80",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Red_Radish.JPG/960px-Red_Radish.JPG",
    badge_kind: null,
    badge_label: null,
  },
  // Фрукты
  {
    category: "Фрукты",
    name: "Бананы",
    country: "Эквадор",
    price: "6.20",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Banana-Single.jpg/960px-Banana-Single.jpg",
    badge_kind: "hit",
    badge_label: "ХИТ",
  },
  {
    category: "Фрукты",
    name: "Яблоки «Голден»",
    country: "Польша",
    price: "4.50",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Golden_delicious_apple.jpg/960px-Golden_delicious_apple.jpg",
    badge_kind: null,
    badge_label: null,
  },
  {
    category: "Фрукты",
    name: "Авокадо Хасс",
    country: "Мексика",
    price: "7.90",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/2/2f/Avocado-Fruit_42883-480x360_%284791300885%29.jpg",
    badge_kind: null,
    badge_label: null,
  },
  {
    category: "Фрукты",
    name: "Груша конференция",
    country: "Бельгия",
    price: "8.10",
    image_url: "https://upload.wikimedia.org/wikipedia/commons/c/cf/Pears.jpg",
    badge_kind: "seasonal",
    badge_label: "СЕЗОННОЕ",
  },
  {
    category: "Фрукты",
    name: "Апельсины",
    country: "Египет",
    price: "5.50",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Orange-Fruit-Pieces.jpg/960px-Orange-Fruit-Pieces.jpg",
    badge_kind: null,
    badge_label: null,
  },
  {
    category: "Фрукты",
    name: "Манго спелое",
    country: "Перу",
    price: "14.00",
    image_url: "https://upload.wikimedia.org/wikipedia/commons/9/90/Hapus_Mango.jpg",
    badge_kind: "hit",
    badge_label: "ХИТ",
  },
  // Ягоды
  {
    category: "Ягоды",
    name: "Клубника",
    country: "Беларусь",
    price: "18.00",
    image_url: "https://upload.wikimedia.org/wikipedia/commons/2/29/PerfectStrawberry.jpg",
    badge_kind: "seasonal",
    badge_label: "СЕЗОННОЕ",
  },
  {
    category: "Ягоды",
    name: "Малина",
    country: "Беларусь",
    price: "22.00",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Raspberries05.jpg/960px-Raspberries05.jpg",
    badge_kind: null,
    badge_label: null,
  },
  {
    category: "Ягоды",
    name: "Голубика",
    country: "Чили",
    price: "19.50",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Blueberries_in_a_little_bowl.jpg/960px-Blueberries_in_a_little_bowl.jpg",
    badge_kind: null,
    badge_label: null,
  },
  {
    category: "Ягоды",
    name: "Смородина чёрная",
    country: "Беларусь",
    price: "12.00",
    image_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Ribes_nigrum_a1.JPG/960px-Ribes_nigrum_a1.JPG",
    badge_kind: "organic",
    badge_label: "ОРГАНИК",
  },
];

async function ensureCategories() {
  const idByName = new Map();
  for (const name of CATEGORY_ORDER) {
    await pool.query(`insert into categories (name) values ($1) on conflict (name) do nothing`, [name]);
    const { rows } = await pool.query(`select id from categories where name = $1`, [name]);
    if (!rows[0]?.id) throw new Error(`category missing: ${name}`);
    idByName.set(name, rows[0].id);
  }
  return idByName;
}

async function main() {
  await initDb();

  if (process.env.SEED_SYNC_IMAGES === "1") {
    let updated = 0;
    for (const row of SEED_ROWS) {
      const { rowCount } = await pool.query(`update products set image_url = $1 where name = $2`, [
        row.image_url,
        row.name,
      ]);
      updated += rowCount;
    }
    console.log(`Обновлено записей products (по полю name): ${updated}.`);
    await pool.end();
    return;
  }

  const idByName = await ensureCategories();

  const { rows: countRows } = await pool.query(`select count(*)::int as n from products`);
  const existing = countRows[0]?.n ?? 0;
  const reset = process.env.SEED_RESET === "1";

  if (existing > 0 && !reset) {
    console.log(`Пропуск: в products уже ${existing} строк. Для пересоздания: SEED_RESET=1 npm run seed`);
    await pool.end();
    return;
  }

  if (reset && existing > 0) {
    await pool.query(`delete from products`);
    console.log("Таблица products очищена (SEED_RESET=1).");
  }

  let inserted = 0;
  for (const row of SEED_ROWS) {
    const categoryId = idByName.get(row.category);
    if (!categoryId) throw new Error(`unknown category: ${row.category}`);

    await pool.query(
      `insert into products (name, category_id, country, price, image_url, image_data, image_mime, badge_kind, badge_label, in_stock)
       values ($1, $2, $3, $4::numeric, $5, null, null, $6, $7, true)`,
      [row.name, categoryId, row.country, row.price, row.image_url, row.badge_kind, row.badge_label],
    );
    inserted += 1;
  }

  console.log(`Готово: добавлено товаров: ${inserted}, категории: ${CATEGORY_ORDER.join(", ")}.`);
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
