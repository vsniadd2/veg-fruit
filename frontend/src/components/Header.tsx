import { Link } from "react-router-dom";

type HeaderProps = {
  variant?: "home" | "catalog";
};

export default function Header({ variant = "home" }: HeaderProps) {
  const isCatalog = variant === "catalog";

  return (
    <header
      className="sticky top-0 z-50 bg-white border-b border-gray-100"
      data-purpose="navigation-header"
    >
      <div className="container mx-auto px-4 h-20 flex items-center">
        <Link className="flex items-center space-x-2" to="/">
          <div className="w-8 h-8 bg-[#2d6a4f] rounded flex items-center justify-center">
            <span className="text-white font-bold text-xl">G</span>
          </div>
          <span className="font-bold text-xl tracking-tight uppercase">GREENHARVEST</span>
        </Link>

        <nav className="hidden md:flex flex-1 justify-center items-center gap-3 text-base font-semibold">
          <Link
            className="px-4 py-2 rounded-lg hover:text-[#f3722c] hover:bg-[#f3722c]/10 transition-colors whitespace-nowrap"
            to="/catalog"
          >
            Продукция
          </Link>
          <a
            className="px-4 py-2 rounded-lg hover:text-[#f3722c] hover:bg-[#f3722c]/10 transition-colors whitespace-nowrap"
            href="#"
          >
            Как это работает
          </a>
          <a
            className="px-4 py-2 rounded-lg hover:text-[#f3722c] hover:bg-[#f3722c]/10 transition-colors whitespace-nowrap"
            href="#"
          >
            О нас
          </a>
        </nav>

        <div className="flex items-center gap-3 ml-auto">
          {isCatalog ? (
            <Link
              className="hidden sm:inline-flex bg-[#f3722c] text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-orange-600 transition-all text-sm"
              to="/"
            >
              На главную
            </Link>
          ) : (
            <Link
              className="hidden sm:inline-flex border border-[#f3722c] text-[#f3722c] px-6 py-2.5 rounded-lg font-semibold hover:bg-[#f3722c] hover:text-white transition-all text-sm"
              to="/catalog"
            >
              Каталог
            </Link>
          )}
          <a
            className="bg-[#f3722c] text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-orange-600 transition-all text-sm"
            href="#"
          >
            Заказать сейчас
          </a>
        </div>
      </div>
    </header>
  );
}

