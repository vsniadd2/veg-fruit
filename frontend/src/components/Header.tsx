import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";

function BrandLeafMark(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 14c-5 0-8-3.5-8-8 4.5 0 8 3 8 8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 14c5 0 8-3.5 8-8-4.5 0-8 3-8 8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M7 21h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
  const { totalCount } = useCart();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isHome = location.pathname === "/";
  const isCatalogActive = location.pathname.startsWith("/catalog");
  const isCartActive = location.pathname === "/cart";
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

  const menuIconTransition =
    "opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1), transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)";

  return (
    <header
      className="fixed top-0 w-full flex justify-between items-center px-6 lg:px-8 py-4 min-h-[80px] max-w-full bg-[#f9faf6]/93 backdrop-blur-sm text-[#1f642e] tracking-tight shadow-sm shadow-[#1f642e]/5 z-50"
      data-purpose="navigation-header"
    >
      <div className="flex items-center gap-8 lg:gap-12 min-w-0">
        <div className="group flex min-w-0 items-center gap-2.5 shrink-0">
          <span
            className="pointer-events-none flex items-center justify-center rounded-xl bg-[#0d601b] p-1.5 text-white shadow-sm shadow-[#0d601b]/25 transition-transform duration-200 group-hover:scale-[1.03]"
            aria-hidden="true"
          >
            <BrandLeafMark className="h-5 w-5" />
          </span>
          <Link
            className="truncate text-2xl font-black text-[#1f642e] transition-colors duration-200 hover:text-[#195324] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f642e]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f9faf6]"
            to="/"
          >
            Миксголдфрукт
          </Link>
        </div>

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
              className={[
                "hidden md:inline-flex h-12 px-6 rounded-full text-base font-bold leading-none items-center justify-center transition-colors gap-2 relative shadow-lg",
                isCartActive
                  ? "bg-[#195324] text-white ring-2 ring-[#1f642e]/40 shadow-[#1f642e]/25"
                  : "bg-[#1f642e] text-white shadow-[#1f642e]/20 hover:bg-[#195324]",
              ].join(" ")}
              type="button"
              onClick={() => navigate("/cart")}
              aria-label="Корзина"
              aria-current={isCartActive ? "page" : undefined}
            >
              Корзина
              {totalCount > 0 && (
                <span className="inline-flex items-center justify-center bg-white text-[#1f642e] text-xs font-black rounded-full min-w-[1.25rem] h-5 px-1 leading-none">
                  {totalCount > 99 ? "99+" : totalCount}
                </span>
              )}
            </button>
          </>
        ) : null}

        <div className="md:hidden relative z-[70]">
          <button
            type="button"
            aria-label={mobileMenuOpen ? "Закрыть меню" : "Меню"}
            aria-expanded={mobileMenuOpen}
            className="h-12 w-12 inline-flex items-center justify-center bg-transparent hover:bg-[#1f642e]/12 active:bg-[#1f642e]/18 transition-colors rounded-xl appearance-none"
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            <svg className="h-6 w-6 overflow-visible text-[#1f642e]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <g
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                style={{
                  opacity: mobileMenuOpen ? 0 : 1,
                  transform: mobileMenuOpen ? "scale(0.45) rotate(90deg)" : "scale(1) rotate(0deg)",
                  transformOrigin: "12px 12px",
                  transformBox: "view-box",
                  transition: menuIconTransition,
                }}
              >
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </g>
              <g
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                style={{
                  opacity: mobileMenuOpen ? 1 : 0,
                  transform: mobileMenuOpen ? "scale(1) rotate(0deg)" : "scale(0.45) rotate(-90deg)",
                  transformOrigin: "12px 12px",
                  transformBox: "view-box",
                  transition: menuIconTransition,
                }}
              >
                <line x1="5" y1="5" x2="19" y2="19" />
                <line x1="19" y1="5" x2="5" y2="19" />
              </g>
            </svg>
          </button>

          {mobileMenuOpen ? (
            <>
              <button
                type="button"
                aria-label="Закрыть меню"
                className="fixed left-0 right-0 bottom-0 top-[80px] z-[60] bg-[#1a1c1a]/38 backdrop-blur-[120px] motion-reduce:backdrop-blur-none"
                onClick={() => setMobileMenuOpen(false)}
              />
              <div
                className={[
                  "fixed z-[70] left-3 right-3 top-[calc(80px+0.625rem)]",
                  "max-h-[min(70vh,520px)] min-h-[min(48vh,340px)] flex flex-col isolate",
                  "rounded-[1.75rem] overflow-hidden",
                  "bg-gradient-to-br from-white/90 via-white/78 to-white/85",
                  "backdrop-blur-[160px] backdrop-saturate-[1.35] backdrop-brightness-[1.02] motion-reduce:backdrop-blur-none motion-reduce:backdrop-saturate-100",
                  "border border-white/75 shadow-[0_8px_32px_rgba(0,0,0,0.1),0_1px_0_rgba(255,255,255,0.85)_inset]",
                  "ring-1 ring-white/55",
                ].join(" ")}
                role="dialog"
                aria-label="Меню навигации"
              >
                <div className="shrink-0 flex justify-center pt-3 pb-1">
                  <div className="h-1 w-10 rounded-full bg-white/55 shadow-[0_1px_0_rgba(255,255,255,0.95)_inset]" aria-hidden />
                </div>
                <nav className="flex-1 flex flex-col gap-2 px-4 pb-3 overflow-y-auto">
                  <Link
                    className={[
                      "relative z-10 block px-4 py-4 rounded-2xl text-base tracking-tight",
                      "transition-[color,background-color,box-shadow,transform,border-color] duration-200",
                      "active:scale-[0.99]",
                      isHome
                        ? "font-bold bg-[#f9faf6]/93 text-[#1f642e] backdrop-blur-sm border-2 border-[#1f642e]/40 shadow-sm shadow-[#1f642e]/15 ring-1 ring-[#1f642e]/10 motion-reduce:backdrop-blur-none"
                        : [
                            "font-semibold text-stone-600 bg-[#f9faf6]/93 backdrop-blur-sm border border-[#1f642e]/10",
                            "shadow-sm shadow-[#1f642e]/5",
                            "hover:text-[#1f642e] hover:border-[#1f642e]/25 hover:shadow-md hover:shadow-[#1f642e]/10 motion-reduce:backdrop-blur-none",
                          ].join(" "),
                    ].join(" ")}
                    to="/"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Главная
                  </Link>
                  <Link
                    className={[
                      "relative z-10 block px-4 py-4 rounded-2xl text-base tracking-tight",
                      "transition-[color,background-color,box-shadow,transform,border-color] duration-200",
                      "active:scale-[0.99]",
                      isCatalogActive
                        ? "font-bold bg-[#f9faf6]/93 text-[#1f642e] backdrop-blur-sm border-2 border-[#1f642e]/40 shadow-sm shadow-[#1f642e]/15 ring-1 ring-[#1f642e]/10 motion-reduce:backdrop-blur-none"
                        : [
                            "font-semibold text-stone-600 bg-[#f9faf6]/93 backdrop-blur-sm border border-[#1f642e]/10",
                            "shadow-sm shadow-[#1f642e]/5",
                            "hover:text-[#1f642e] hover:border-[#1f642e]/25 hover:shadow-md hover:shadow-[#1f642e]/10 motion-reduce:backdrop-blur-none",
                          ].join(" "),
                    ].join(" ")}
                    to="/catalog"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Каталог
                  </Link>
                  <div className="my-1 border-t border-white/45" />
                  <button
                    type="button"
                    aria-current={isCartActive ? "page" : undefined}
                    className={[
                      "mt-auto w-full px-4 py-4 rounded-2xl text-base font-bold text-center",
                      "border-2 transition-[background-color,transform,border-color,box-shadow] duration-200 active:scale-[0.99]",
                      "flex items-center justify-center gap-2",
                      isCartActive
                        ? "text-[#1f642e] bg-[#f9faf6]/93 backdrop-blur-sm border-[#1f642e]/40 shadow-sm shadow-[#1f642e]/15 ring-1 ring-[#1f642e]/10 motion-reduce:backdrop-blur-none"
                        : [
                            "text-white bg-[#1f642e] border-white/55",
                            "shadow-[0_10px_28px_rgba(31,100,46,0.45),0_2px_0_rgba(0,0,0,0.12)_inset,inset_0_1px_0_rgba(255,255,255,0.35)]",
                            "ring-2 ring-[#0d2e16]/25",
                            "hover:bg-[#195324] hover:border-white/65",
                          ].join(" "),
                    ].join(" ")}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      navigate("/cart");
                    }}
                  >
                    Корзина
                    {totalCount > 0 && (
                      <span
                        className={[
                          "inline-flex items-center justify-center text-xs font-black rounded-full min-w-[1.25rem] h-5 px-1 leading-none",
                          isCartActive ? "bg-[#1f642e] text-white" : "bg-white text-[#1f642e]",
                        ].join(" ")}
                      >
                        {totalCount > 99 ? "99+" : totalCount}
                      </span>
                    )}
                  </button>
                </nav>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
