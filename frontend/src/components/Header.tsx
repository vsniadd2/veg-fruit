import { useState } from "react";
import { Link } from "react-router-dom";

type HeaderProps = {
  variant?: "home" | "catalog";
};

export default function Header({ variant = "home" }: HeaderProps) {
  const isCatalog = variant === "catalog";
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header
      className="sticky top-0 z-50 bg-white border-b border-gray-100"
      data-purpose="navigation-header"
    >
      <div className="container mx-auto px-3 sm:px-4 min-h-[4rem] sm:min-h-[5rem] flex items-center gap-2">
        <Link className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink" to="/" onClick={closeMenu}>
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xl">С</span>
          </div>
          <span className="font-bold text-sm sm:text-xl tracking-tight truncate">Садовка</span>
        </Link>

        <nav className="hidden md:flex flex-1 justify-center items-center gap-2 lg:gap-3 text-base font-semibold">
          <Link
            className="px-3 lg:px-4 py-2 rounded-lg hover:text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
            to="/catalog"
          >
            Продукция
          </Link>
          <a
            className="px-3 lg:px-4 py-2 rounded-lg hover:text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
            href="#"
          >
            Как это работает
          </a>
          <a
            className="px-3 lg:px-4 py-2 rounded-lg hover:text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
            href="#"
          >
            О нас
          </a>
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-3 ml-auto shrink-0">
          {isCatalog ? (
            <Link
              className="hidden sm:inline-flex bg-primary text-white px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg font-semibold hover:bg-forest-green transition-all text-xs sm:text-sm"
              to="/"
            >
              На главную
            </Link>
          ) : (
            <Link
              className="hidden sm:inline-flex border border-primary text-primary px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg font-semibold hover:bg-primary hover:text-white transition-all text-xs sm:text-sm"
              to="/catalog"
            >
              Каталог
            </Link>
          )}
          <a
            className="bg-primary text-white px-3 sm:px-6 py-2 sm:py-2.5 rounded-lg font-semibold hover:bg-forest-green transition-all text-xs sm:text-sm whitespace-nowrap"
            href="#"
          >
            Заказать
          </a>
          <button
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            className="md:hidden p-2.5 rounded-lg hover:bg-gray-100 text-gray-800 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 space-y-1 shadow-inner">
          <Link
            className="block py-3 px-2 rounded-lg font-semibold text-gray-900 hover:bg-gray-50"
            to="/catalog"
            onClick={closeMenu}
          >
            Продукция
          </Link>
          {isCatalog ? (
            <Link
              className="block py-3 px-2 rounded-lg font-semibold text-gray-900 hover:bg-gray-50 sm:hidden"
              to="/"
              onClick={closeMenu}
            >
              На главную
            </Link>
          ) : (
            <Link
              className="block py-3 px-2 rounded-lg font-semibold text-primary hover:bg-primary/10 sm:hidden"
              to="/catalog"
              onClick={closeMenu}
            >
              Каталог
            </Link>
          )}
          <a className="block py-3 px-2 rounded-lg font-semibold text-gray-900 hover:bg-gray-50" href="#">
            Как это работает
          </a>
          <a className="block py-3 px-2 rounded-lg font-semibold text-gray-900 hover:bg-gray-50" href="#">
            О нас
          </a>
        </div>
      ) : null}
    </header>
  );
}
