import { Link, useLocation } from "react-router-dom";

type HeaderProps = {
  variant?: "home" | "catalog";
};

export default function Header({ variant = "home" }: HeaderProps) {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isCatalogActive = location.pathname.startsWith("/catalog");
  const navClass = (isActive: boolean) =>
    isActive
      ? "text-[#1f642e] font-bold border-b-2 border-[#1f642e] pb-1"
      : "text-stone-600 hover:text-[#1f642e] transition-colors";

  return (
    <header
      className="fixed top-0 w-full flex justify-between items-center px-6 lg:px-8 py-4 max-w-full bg-[#f9faf6]/93 backdrop-blur-sm text-[#1f642e] tracking-tight shadow-sm shadow-[#1f642e]/5 z-50"
      data-purpose="navigation-header"
    >
      <div className="flex items-center gap-8 lg:gap-12 min-w-0">
        <Link className="text-2xl font-black text-[#1f642e] shrink-0" to="/">
          Садовка
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

    </header>
  );
}
