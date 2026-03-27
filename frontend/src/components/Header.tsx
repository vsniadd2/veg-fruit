import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

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
        <div className="flex min-w-0 items-center gap-2.5 shrink-0">
          <span
            className="pointer-events-none flex items-center justify-center rounded-xl bg-[#0d601b] p-1.5 text-white shadow-sm shadow-[#0d601b]/25"
            aria-hidden="true"
          >
            <BrandLeafMark className="h-5 w-5" />
          </span>
          <Link className="truncate text-2xl font-black text-[#1f642e]" to="/">
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
            aria-label={mobileMenuOpen ? "Закрыть меню" : "Меню"}
            aria-expanded={mobileMenuOpen}
            className="h-12 w-12 inline-flex items-center justify-center hover:bg-[#f3f4f0] transition-colors rounded-xl"
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            <svg className="h-6 w-6 overflow-visible text-[#1f642e]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <g
                  style={{
                    transformOrigin: "12px 12px",
                    transformBox: "view-box",
                    transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                    transform: mobileMenuOpen ? "translateY(5px) rotate(45deg)" : "translateY(0) rotate(0deg)",
                  }}
                >
                  <line x1="4" y1="7" x2="20" y2="7" />
                </g>
                <g
                  style={{
                    transition: "opacity 0.2s ease-out",
                    opacity: mobileMenuOpen ? 0 : 1,
                  }}
                >
                  <line x1="4" y1="12" x2="20" y2="12" />
                </g>
                <g
                  style={{
                    transformOrigin: "12px 12px",
                    transformBox: "view-box",
                    transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                    transform: mobileMenuOpen ? "translateY(-5px) rotate(-45deg)" : "translateY(0) rotate(0deg)",
                  }}
                >
                  <line x1="4" y1="17" x2="20" y2="17" />
                </g>
              </g>
            </svg>
          </button>

          {mobileMenuOpen ? (
            <>
              <button
                type="button"
                aria-label="Закрыть меню"
                className="fixed left-0 right-0 bottom-0 top-[80px] z-[60] bg-[#1a1c1a]/35 backdrop-blur-lg motion-reduce:backdrop-blur-none"
                onClick={() => setMobileMenuOpen(false)}
              />
              <div
                className={[
                  "fixed z-[70] left-3 right-3 top-[calc(80px+0.625rem)]",
                  "max-h-[min(70vh,520px)] min-h-[min(48vh,340px)] flex flex-col isolate",
                  "rounded-[1.75rem] overflow-hidden",
                  "bg-gradient-to-br from-white/90 via-white/78 to-white/85",
                  "backdrop-blur-2xl backdrop-saturate-125 backdrop-brightness-[1.02] motion-reduce:backdrop-blur-none motion-reduce:backdrop-saturate-100",
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
                      "active:scale-[0.99] backdrop-blur-lg backdrop-saturate-110 motion-reduce:backdrop-blur-none",
                      isHome
                        ? "font-bold bg-white/95 text-[#1f642e] border border-[#1f642e]/40 shadow-[0_6px_18px_rgba(31,100,46,0.15),inset_0_1px_0_rgba(255,255,255,0.95)]"
                        : [
                            "font-semibold text-[#1a1c1a] bg-white/62 border border-white/65",
                            "shadow-[0_4px_14px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.75)]",
                            "hover:bg-white/78 hover:border-white/80",
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
                      "active:scale-[0.99] backdrop-blur-lg backdrop-saturate-110 motion-reduce:backdrop-blur-none",
                      isCatalogActive
                        ? "font-bold bg-white/95 text-[#1f642e] border border-[#1f642e]/40 shadow-[0_6px_18px_rgba(31,100,46,0.15),inset_0_1px_0_rgba(255,255,255,0.95)]"
                        : [
                            "font-semibold text-[#1a1c1a] bg-white/62 border border-white/65",
                            "shadow-[0_4px_14px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.75)]",
                            "hover:bg-white/78 hover:border-white/80",
                          ].join(" "),
                    ].join(" ")}
                    to="/catalog"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Каталог
                  </Link>
                  {showRightSection ? (
                    <>
                      <div className="my-1 border-t border-white/45" />
                      <button
                        type="button"
                        className={[
                          "mt-auto w-full px-4 py-4 rounded-2xl text-base font-bold text-center text-white",
                          "bg-[#1f642e] backdrop-blur-md backdrop-saturate-110 motion-reduce:backdrop-blur-none",
                          "border border-white/30 shadow-[0_8px_22px_rgba(31,100,46,0.28),inset_0_1px_0_rgba(255,255,255,0.28)]",
                          "hover:bg-[#195324] transition-[background-color,transform] duration-200 active:scale-[0.99]",
                        ].join(" ")}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Корзина
                      </button>
                    </>
                  ) : null}
                </nav>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
