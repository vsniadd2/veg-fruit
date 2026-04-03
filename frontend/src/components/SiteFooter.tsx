import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type FooterCategory = { id: string; name: string };

export default function SiteFooter() {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
  const [topCategories, setTopCategories] = useState<FooterCategory[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/public/categories/popular?limit=4`);
        if (!res.ok) throw new Error(`http_${res.status}`);
        const data = (await res.json()) as { ok?: boolean; items?: FooterCategory[] };
        if (cancelled) return;
        const items = (data.items ?? []).filter((c) => c?.id && c?.name);
        setTopCategories(items);
      } catch {
        if (!cancelled) setTopCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [API_BASE_URL]);

  return (
    <footer className="bg-gray-50 pt-8 pb-4 border-t border-gray-200" id="about">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8 pb-8 border-b border-gray-200">
          <section aria-labelledby="footer-about-heading">
            <h3 id="footer-about-heading" className="font-bold text-forest-green text-base mb-3">
              О магазине
            </h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              Магазин Миксголдфрукт — ваш надежный поставщик качественных фруктов, овощей, зелени и экзотических
              продуктов. Мы тщательно отбираем товары, чтобы гарантировать максимальную свежесть, натуральный вкус и
              витамины на вашем столе. Предлагаем доступные цены, удобное расположение.
            </p>
          </section>
          <section aria-labelledby="footer-delivery-heading">
            <h3 id="footer-delivery-heading" className="font-bold text-forest-green text-base mb-3">
              Условия доставки
            </h3>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed list-none pl-0">
              <li>Доставку осуществляем по г. Минск и в пределах 5 км от МКАД.</li>
              <li>Бесплатная доставка при заказе от 120 руб. в черте города.</li>
              <li>При заказе менее 120 руб. в черте города, доставка — 10 руб.</li>
            </ul>
          </section>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div>
            <div className="group flex min-w-0 items-center gap-2.5 mb-4">
              <span
                className="pointer-events-none flex shrink-0 items-center justify-center rounded-xl bg-[#0d601b] p-1.5 text-white shadow-sm shadow-[#0d601b]/25 transition-transform duration-200 group-hover:scale-[1.03]"
                aria-hidden="true"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 21v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 14c-5 0-8-3.5-8-8 4.5 0 8 3 8 8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <path d="M12 14c5 0 8-3.5 8-8-4.5 0-8 3-8 8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <path d="M7 21h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <Link
                className="truncate text-xl font-black text-[#1f642e] transition-colors duration-200 hover:text-[#195324] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f642e]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-50"
                to="/"
              >
                Миксголдфрукт
              </Link>
            </div>
            <div className="flex space-x-4">
              <a
                className="text-gray-400 hover:text-forest-green"
                href="https://www.instagram.com/royal_fruit_minsk?igsh=MXVzandzaXk0ZzdkYw=="
                target="_blank"
                rel="noreferrer"
                aria-label="Instagram"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.791-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.209-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </a>
            </div>
          </div>
          <div>
            <h4 className="font-bold text-forest-green mb-6">Каталог</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              {topCategories === null ? (
                <li className="text-gray-400" aria-busy="true">
                  <span className="inline-block h-4 w-28 rounded bg-gray-200/80 animate-pulse" />
                </li>
              ) : topCategories.length ? (
                topCategories.map((c) => (
                  <li key={c.id}>
                    <Link
                      className="hover:text-vibrant-orange"
                      to={`/catalog?category=${encodeURIComponent(c.id)}`}
                    >
                      {c.name}
                    </Link>
                  </li>
                ))
              ) : (
                <li>
                  <Link className="hover:text-vibrant-orange" to="/catalog">
                    Весь каталог
                  </Link>
                </li>
              )}
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-forest-green mb-6">Контакты</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              <li className="flex items-center">
                <svg className="w-4 h-4 mr-3 text-leaf-green shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                <a className="hover:text-forest-green" href="tel:+375333918181">
                  +375 (33) 391-81-81
                </a>
              </li>
              <li className="flex items-center">
                <svg className="w-4 h-4 mr-3 text-leaf-green shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                <a className="hover:text-forest-green" href="mailto:miksgoldfruct@mail.ru">
                  miksgoldfruct@mail.ru
                </a>
              </li>
              <li className="flex items-center">
                <svg className="w-4 h-4 mr-3 text-leaf-green shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                Ежедневно 9.00-21.00
              </li>
            </ul>
          </div>
          <div className="md:col-span-2 lg:col-span-1">
            <h4 className="font-bold text-forest-green mb-6">Реквизиты</h4>
            <div className="space-y-2 text-sm text-gray-500 leading-relaxed">
              <div className="font-semibold text-gray-700">ООО &quot;Миксголдфрукт&quot;</div>
              <div>УНП 193855188</div>
              <div>Юридический адрес: ул. Веры Хоружей, дом 6А, оф. 117, 220100</div>
              <div className="pt-1 space-y-1">
                <a className="block hover:text-forest-green" href="tel:+375333918181">
                  +375 (33) 391-81-81
                </a>
                <a className="block hover:text-forest-green" href="mailto:miksgoldfruct@mail.ru">
                  miksgoldfruct@mail.ru
                </a>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-200 pt-4 flex flex-col md:flex-row justify-center items-center text-center text-xs text-gray-400 gap-2 md:gap-6">
          <p>© 2026 Миксголдфрукт. Все права защищены.</p>
          <span className="text-gray-300 hidden md:inline">•</span>
          <p className="text-gray-400">Версия 03.04.2026-vc</p>
        </div>
      </div>
    </footer>
  );
}
