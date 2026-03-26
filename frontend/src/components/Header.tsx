import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

type HeaderProps = {
  variant?: "home" | "catalog";
};

export default function Header({ variant = "home" }: HeaderProps) {
  const location = useLocation();
  const isCatalog = variant === "catalog";
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeHomeAnchor, setActiveHomeAnchor] = useState<"#how-it-works" | "#about" | null>(null);

  const closeMenu = () => setMenuOpen(false);
  const isHome = location.pathname === "/";
  const isCatalogActive = location.pathname.startsWith("/catalog");
  const navClass = (isActive: boolean) =>
    isActive
      ? "text-[#1f642e] font-bold border-b-2 border-[#1f642e] pb-1"
      : "text-stone-600 hover:text-[#1f642e] transition-colors";

  useEffect(() => {
    if (!isHome) {
      setActiveHomeAnchor(null);
      return;
    }

    let rafId = 0;
    const updateActiveByScroll = () => {
      rafId = 0;
      const how = document.getElementById("how-it-works");
      const about = document.getElementById("about");
      if (!how || !about) {
        setActiveHomeAnchor(null);
        return;
      }

      const viewportMiddle = window.innerHeight * 0.5;
      const howRect = how.getBoundingClientRect();
      const aboutRect = about.getBoundingClientRect();

      const inHow = howRect.top <= viewportMiddle && howRect.bottom >= viewportMiddle;
      const inAbout = aboutRect.top <= viewportMiddle && aboutRect.bottom >= viewportMiddle;

      if (inAbout) {
        setActiveHomeAnchor("#about");
        return;
      }
      if (inHow) {
        setActiveHomeAnchor("#how-it-works");
        return;
      }

      // Если между секциями, выбираем ближайшую к центру экрана.
      const howDistance = Math.min(Math.abs(howRect.top - viewportMiddle), Math.abs(howRect.bottom - viewportMiddle));
      const aboutDistance = Math.min(Math.abs(aboutRect.top - viewportMiddle), Math.abs(aboutRect.bottom - viewportMiddle));
      setActiveHomeAnchor(howDistance <= aboutDistance ? "#how-it-works" : "#about");
    };

    const onScrollOrResize = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(updateActiveByScroll);
    };

    onScrollOrResize();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("hashchange", onScrollOrResize);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("hashchange", onScrollOrResize);
    };
  }, [isHome]);

  return (
    <header
      className="fixed top-0 w-full flex justify-between items-center px-6 lg:px-8 py-4 max-w-full bg-[#f9faf6]/93 backdrop-blur-sm text-[#1f642e] tracking-tight shadow-sm shadow-[#1f642e]/5 z-50"
      data-purpose="navigation-header"
    >
      <div className="flex items-center gap-8 lg:gap-12 min-w-0">
        <Link className="text-2xl font-black text-[#1f642e] shrink-0" to="/" onClick={closeMenu}>
          Садовка
        </Link>

        <nav className="hidden md:flex gap-8">
          <Link className={navClass(isHome)} to="/" onClick={closeMenu}>
            Главная
          </Link>
          <Link className={navClass(isCatalogActive)} to="/catalog" onClick={closeMenu}>
            Каталог
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-3 lg:gap-4 shrink-0">
        {isCatalog ? (
          <Link
            className="hidden sm:inline-flex h-12 px-6 rounded-full bg-[#1f642e] text-white text-base font-bold leading-none items-center justify-center shadow-lg shadow-[#1f642e]/20 hover:bg-[#195324] transition-colors"
            to="/"
            onClick={closeMenu}
          >
            На главную
          </Link>
        ) : (
          <Link
            className="hidden sm:inline-flex h-12 px-6 rounded-full bg-[#e7e9e5] hover:bg-[#dfe1dd] transition-colors text-base font-bold leading-none items-center justify-center"
            to="/catalog"
            onClick={closeMenu}
          >
            Каталог
          </Link>
        )}
        <a
          className="h-12 px-6 rounded-full bg-[#1f642e] text-white text-base font-bold leading-none inline-flex items-center justify-center shadow-lg shadow-[#1f642e]/20 hover:bg-[#195324] transition-colors whitespace-nowrap"
          href="#"
          onClick={closeMenu}
        >
          Заказать
        </a>
        <button
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
          className="md:hidden h-12 w-12 rounded-full bg-[#e7e9e5] hover:bg-[#dfe1dd] transition-colors text-[#1f642e] inline-flex items-center justify-center"
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

      {menuOpen ? (
        <div className="md:hidden fixed top-[5.5rem] left-0 right-0 border-t border-[#1f642e]/10 bg-[#f9faf6]/96 backdrop-blur-sm px-6 py-4 space-y-2 shadow-sm shadow-[#1f642e]/5">
          <Link
            className={[
              "block py-3 px-2 rounded-xl font-semibold",
              isHome ? "text-[#1f642e] bg-white/70" : "text-stone-700 hover:bg-white/70",
            ].join(" ")}
            to="/"
            onClick={closeMenu}
          >
            Главная
          </Link>
          {isCatalog ? (
            <Link
              className="block py-3 px-2 rounded-xl font-semibold text-stone-700 hover:bg-white/70 sm:hidden"
              to="/"
              onClick={closeMenu}
            >
              На главную
            </Link>
          ) : (
            <Link
              className="block py-3 px-2 rounded-xl font-semibold text-stone-700 hover:bg-white/70 sm:hidden"
              to="/catalog"
              onClick={closeMenu}
            >
              Каталог
            </Link>
          )}
          <Link
            className={[
              "block py-3 px-2 rounded-xl font-semibold",
              isCatalogActive ? "text-[#1f642e] bg-white/70" : "text-stone-700 hover:bg-white/70",
            ].join(" ")}
            to="/catalog"
            onClick={closeMenu}
          >
            Каталог
          </Link>
        </div>
      ) : null}
    </header>
  );
}
