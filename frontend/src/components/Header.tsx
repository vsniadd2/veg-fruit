import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

type HeaderProps = {
  variant?: "home" | "catalog";
  showSearch?: boolean;
  showRightSection?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onSearchKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

export default function Header({
  variant = "home",
  showSearch = true,
  showRightSection = true,
  searchValue,
  onSearchChange,
  onSearchKeyDown,
}: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isHome = location.pathname === "/";
  const isCatalogActive = location.pathname.startsWith("/catalog");
  const navClass = (isActive: boolean) =>
    isActive
      ? "text-[#1f642e] font-bold border-b-2 border-[#1f642e] pb-1"
      : "text-stone-600 hover:text-[#1f642e] transition-colors";

  const isSearchControlled = typeof searchValue === "string" && typeof onSearchChange === "function";
  const [internalSearchValue, setInternalSearchValue] = useState("");
  const effectiveSearchValue = isSearchControlled ? searchValue : internalSearchValue;

  const searchPlaceholder = useMemo(() => {
    if (variant === "catalog") return "Поиск по каталогу...";
    return "Поиск по каталогу...";
  }, [variant]);

  const handleSearchChange = (value: string) => {
    if (isSearchControlled) {
      onSearchChange(value);
      return;
    }
    setInternalSearchValue(value);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onSearchKeyDown?.(e);
    if (e.defaultPrevented) return;

    if (e.key === "Escape") {
      handleSearchChange("");
      return;
    }

    if (e.key !== "Enter") return;
    const q = effectiveSearchValue.trim();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    navigate(`/catalog${params.toString() ? `?${params.toString()}` : ""}`);
  };

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

  return (
    <header
      className="fixed top-0 w-full flex justify-between items-center px-6 lg:px-8 py-4 min-h-[80px] max-w-full bg-[#f9faf6]/93 backdrop-blur-sm text-[#1f642e] tracking-tight shadow-sm shadow-[#1f642e]/5 z-50"
      data-purpose="navigation-header"
    >
      <div className="flex items-center gap-8 lg:gap-12 min-w-0">
        <Link className="text-2xl font-black text-[#1f642e] shrink-0" to="/">
          MiksFreshGold.by
        </Link>

        <nav className="hidden md:flex gap-8">
          <Link className={navClass(isHome)} to="/">
            Главная
          </Link>
          <Link className={navClass(isCatalogActive)} to="/catalog">
            Каталог
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-3 lg:gap-4">
        {showRightSection ? (
          <>
            {showSearch ? (
              <div className="hidden lg:flex items-center bg-[#f9faf6]/70 backdrop-blur-sm border border-[#1f642e]/10 rounded-full h-12 px-5 gap-2.5">
                <span className="text-[#707a6e] text-3xl shrink-0 leading-[1] h-12 w-7 inline-flex self-center items-center justify-center -translate-y-[2px]">
                  ⌕
                </span>
                <input
                  className="bg-transparent border-none focus:ring-0 focus:outline-none text-base w-56 h-12 leading-none"
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  type="search"
                  value={effectiveSearchValue}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                />
              </div>
            ) : null}

            <button
              className="hidden md:inline-flex h-12 px-6 rounded-full bg-[#1f642e] text-white text-base font-bold leading-none items-center justify-center shadow-lg shadow-[#1f642e]/20 hover:bg-[#195324] transition-colors"
              type="button"
            >
              Корзина
            </button>
          </>
        ) : null}

        <div className="md:hidden relative z-[70]">
          <button
            type="button"
            aria-label="Меню"
            aria-expanded={mobileMenuOpen}
            className="h-12 w-12 inline-flex items-center justify-center hover:bg-[#f3f4f0] transition-colors rounded-xl"
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            <svg className="w-6 h-6 text-[#1f642e]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>

          {mobileMenuOpen ? (
            <>
              <button
                type="button"
                aria-label="Закрыть меню"
                className="fixed left-0 right-0 bottom-0 top-[80px] z-[60] bg-[#f9faf6]/85 backdrop-blur-sm"
                onClick={() => setMobileMenuOpen(false)}
              />
              <div className="fixed left-0 right-0 top-[80px] z-[70] rounded-t-none rounded-b-[2.25rem] bg-[#f9faf6] shadow-2xl shadow-black/15 overflow-hidden border-t border-[#1f642e]/10">
                <div className="p-2">
                  <Link
                    className={[
                      "block px-3 py-3 rounded-xl text-sm font-semibold transition-colors",
                      isHome
                        ? "bg-white text-[#1f642e] shadow-sm shadow-black/5"
                        : "text-[#1a1c1a] hover:bg-[#e7e9e5]",
                    ].join(" ")}
                    to="/"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Главная
                  </Link>
                  <Link
                    className={[
                      "block px-3 py-3 rounded-xl text-sm font-semibold transition-colors",
                      isCatalogActive
                        ? "bg-white text-[#1f642e] shadow-sm shadow-black/5"
                        : "text-[#1a1c1a] hover:bg-[#e7e9e5]",
                    ].join(" ")}
                    to="/catalog"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Каталог
                  </Link>
                  {showRightSection ? (
                    <button
                      type="button"
                      className="mt-1 block w-full px-3 py-3 rounded-xl text-sm font-semibold transition-colors text-[#1a1c1a] hover:bg-[#e7e9e5] text-left"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Корзина
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
