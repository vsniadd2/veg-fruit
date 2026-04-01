import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import SiteFooter from "../components/SiteFooter";

type ProductBadge =
  | { kind: "seasonal"; label: string; className: "bg-white/90 backdrop-blur text-[#2d6a4f]" }
  | { kind: "hit"; label: string; className: "bg-primary text-white" }
  | { kind: "organic"; label: string; className: "bg-white/90 backdrop-blur text-[#2d6a4f]" };

type Product = {
  id: string;
  name: string;
  country: string;
  imageUrl: string;
  category: string; // categoryId (uuid) from backend
  categoryName?: string | null; // for convenience in UI
  price?: number | null;
  weightValue?: number | null;
  weightUnit?: "kg" | "g" | "pcs" | null;
  badge?: ProductBadge;
  inStock?: boolean;
  popular?: boolean;
};

function formatPackageWeight(value: number | null | undefined, unit: "kg" | "g" | "pcs" | null | undefined): string | null {
  if (value == null || unit == null) return null;
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (unit === "pcs") {
    const n = Math.round(v);
    return `${n} шт`;
  }
  if (unit === "g") {
    const rounded = Math.abs(v - Math.round(v)) < 1e-6 ? Math.round(v) : v;
    return `${rounded} гр`;
  }
  if (unit === "kg") {
    const s = v % 1 === 0 ? String(v) : v.toFixed(3).replace(/\.?0+$/, "");
    return `${s.replace(".", ",")} кг`;
  }
  return null;
}

const CATALOG_IMAGE_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="512" viewBox="0 0 800 512"><rect fill="#f3f4f6" width="800" height="512"/><text x="400" y="256" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-family="system-ui,sans-serif" font-size="18">Нет фото</text></svg>`,
  );

export default function Catalog() {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const onlySeasonal = searchParams.get("seasonal") === "1";

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"name" | "price" | "season" | "popular">("name");
  const [category, setCategory] = useState<Product["category"]>("");
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);

  const [apiProducts, setApiProducts] = useState<Product[]>([]);
  const sortOptions = useMemo(
    () =>
      [
        { value: "name", label: "По названию" },
        { value: "price", label: "По цене" },
        { value: "season", label: "По сезону" },
        { value: "popular", label: "По популярности" },
      ] as const,
    [],
  );
  const sortLabel = useMemo(() => sortOptions.find((o) => o.value === sort)?.label ?? "По названию", [sort, sortOptions]);
  const resetFilters = () => {
    setQuery("");
    setSort("name");
    setCategory(categories[0]?.id ?? "");
    setPage(1);
    setSortMenuOpen(false);
    setCategoryMenuOpen(false);
    setSearchParams((sp) => {
      const next = new URLSearchParams(sp);
      next.delete("seasonal");
      return next;
    });
  };
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const sortButtonRef = useRef<HTMLButtonElement | null>(null);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement | null>(null);
  const categoryButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/public/categories`);
        if (!res.ok) throw new Error(`http_${res.status}`);
        const data = (await res.json()) as { ok?: boolean; items?: Array<{ id: string; name: string }> };
        if (cancelled) return;
        setCategories(data.items ?? []);
      } catch {
        if (cancelled) return;
        setCategories([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!categories.length) {
      setCategory("");
      return;
    }
    setCategory((prev) => (prev && categories.some((c) => c.id === prev) ? prev : categories[0].id));
  }, [categories]);

  useEffect(() => {
    if (!sortMenuOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (sortMenuRef.current?.contains(target)) return;
      if (sortButtonRef.current?.contains(target)) return;
      setSortMenuOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSortMenuOpen(false);
      sortButtonRef.current?.focus();
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [sortMenuOpen]);

  useEffect(() => {
    if (!categoryMenuOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (categoryMenuRef.current?.contains(target)) return;
      if (categoryButtonRef.current?.contains(target)) return;
      setCategoryMenuOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setCategoryMenuOpen(false);
      categoryButtonRef.current?.focus();
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [categoryMenuOpen]);

  useEffect(() => {
    if (!categories.length) return;
    const categoryFromQuery = searchParams.get("category");
    if (categoryFromQuery) {
      const normalized = categoryFromQuery.trim().toLowerCase();
      const matched =
        categories.find((c) => c.id === categoryFromQuery) ??
        categories.find((c) => c.name.trim().toLowerCase() === normalized);
      if (matched) {
        setCategory(matched.id);
        setPage(1);
        return;
      }
    }
    setCategory((prev) => (categories.some((c) => c.id === prev) ? prev : categories[0]!.id));
  }, [categories, searchParams]);

  useEffect(() => {
    const q = searchParams.get("q");
    if (!q) return;
    setQuery(q);
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    const s = searchParams.get("sort");
    if (!s) return;
    if (s === "name" || s === "price" || s === "season" || s === "popular") {
      setSort(s);
      setPage(1);
    } else if (s === "default") {
      setSort("name");
      setPage(1);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const q = query.trim();
          const PAGE_SIZE = 50;
          const MAX_PAGES = 80;

          const allItems: Array<any> = [];
          let pageNum = 1;
          let total = Number.POSITIVE_INFINITY;

          while (!cancelled && pageNum <= MAX_PAGES && allItems.length < total) {
            const params = new URLSearchParams();
            params.set("page", String(pageNum));
            params.set("pageSize", String(PAGE_SIZE));
            if (q) params.set("q", q);

            const res = await fetch(`${API_BASE_URL}/api/products?${params.toString()}`, { signal: controller.signal });
            if (!res.ok) throw new Error(`http_${res.status}`);
            const data = (await res.json()) as { items?: Array<any>; total?: number };
            if (typeof data.total === "number" && Number.isFinite(data.total) && data.total >= 0) total = data.total;

            const chunk = data.items ?? [];
            allItems.push(...chunk);
            if (chunk.length < PAGE_SIZE) break;
            pageNum += 1;
          }

          const badgeFromApi = (badge: any): ProductBadge | undefined => {
            if (!badge?.kind) return undefined;
            const kind = String(badge.kind).trim();
            const label = typeof badge.label === "string" ? (badge.label as string) : "";

            if (kind === "seasonal") {
              return { kind: "seasonal", label: label || "СЕЗОННОЕ", className: "bg-white/90 backdrop-blur text-[#2d6a4f]" };
            }
            if (kind === "hit") {
              return { kind: "hit", label: label || "ХИТ", className: "bg-primary text-white" };
            }
            if (kind === "organic") {
              return { kind: "organic", label: label || "ОРГАНИК", className: "bg-white/90 backdrop-blur text-[#2d6a4f]" };
            }
            return undefined;
          };

          const toAbsoluteImageUrl = (url: string) => {
            if (!url) return "";
            if (url.startsWith("http://") || url.startsWith("https://")) return url;
            if (url.startsWith("/")) return `${API_BASE_URL}${url}`;
            return `${API_BASE_URL}/${url}`;
          };

          const mapped: Product[] = allItems
            .map((it: any) => {
              const badge = badgeFromApi(it.badge);
              const price =
                typeof it.price === "number"
                  ? it.price
                  : typeof it.price === "string" && it.price.trim()
                    ? Number.parseFloat(it.price)
                    : null;
              const wv = it.weightValue;
              const wu = it.weightUnit;
              const weightValue =
                typeof wv === "number" && Number.isFinite(wv)
                  ? wv
                  : typeof wv === "string" && wv.trim()
                    ? Number.parseFloat(wv)
                    : null;
              const weightUnit = wu === "kg" || wu === "g" || wu === "pcs" ? wu : null;
              return {
                id: String(it.id),
                name: String(it.name ?? ""),
                country: String(it.country ?? ""),
                imageUrl: toAbsoluteImageUrl(String(it.imageUrl ?? "")),
                category: String(it.categoryId ?? ""),
                categoryName: it.categoryName ?? null,
                price: Number.isFinite(price as number) ? (price as number) : null,
                weightValue: weightValue != null && Number.isFinite(weightValue) ? weightValue : null,
                weightUnit: weightValue != null && weightUnit ? weightUnit : null,
                badge,
                inStock: it.inStock !== false,
                popular: it.popular === true,
              } as Product;
            })
            .filter((p: Product) => Boolean(p.category));

          if (!cancelled) setApiProducts(mapped);
        } catch {
          if (!cancelled) setApiProducts([]);
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [API_BASE_URL, query]);

  const products = apiProducts;


  const categoriesToShow = useMemo(
    () => categories.map((c) => ({ id: c.id, label: c.name })),
    [categories],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const source = onlySeasonal ? products.filter((p) => p.badge?.kind === "seasonal") : products;
    for (const p of source) {
      const key = p.category || "";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [products, onlySeasonal]);

  const categoryLabel = useMemo(() => {
    if (onlySeasonal) return "Все сезонные";
    const c = categoriesToShow.find((x) => x.id === category);
    return c?.label ?? "Категория";
  }, [onlySeasonal, category, categoriesToShow]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    const categoryBase = onlySeasonal
      ? products.filter((p) => p.badge?.kind === "seasonal")
      : products.filter((p) => p.category === category);

    const base = normalizedQuery
      ? categoryBase.filter((p) => {
          const hay = `${p.name} ${p.country}`.toLowerCase();
          return hay.includes(normalizedQuery);
        })
      : categoryBase;

    if (sort === "name") {
      return [...base].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    }

    if (sort === "price") {
      const rank = (p: Product) =>
        p.price != null && Number.isFinite(p.price) ? p.price : Number.POSITIVE_INFINITY;
      return [...base].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "ru"));
    }

    if (sort === "season") {
      const score = (p: Product) => (p.badge?.kind === "seasonal" ? 2 : p.badge?.kind ? 1 : 0);
      return [...base].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, "ru"));
    }

    if (sort === "popular") {
      const pop = (p: Product) => (p.popular ? 1 : 0);
      return [...base].sort((a, b) => pop(b) - pop(a) || a.name.localeCompare(b.name, "ru"));
    }

    return base;
  }, [category, normalizedQuery, onlySeasonal, products, sort]);

  const pageSize = 6;
  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const pagedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [currentPage, filteredProducts]);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      "matchMedia" in window &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, left: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [currentPage]);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Escape") return;
    setQuery("");
    setPage(1);
  };

  const organicBgStyle = useMemo<React.CSSProperties>(
    () => ({
      backgroundImage: "radial-gradient(circle at 2px 2px, rgba(46, 125, 50, 0.06) 1px, transparent 0)",
      backgroundSize: "40px 40px",
    }),
    [],
  );

  const formatPrice = (p: Product) => {
    if (p.price === null || p.price === undefined || Number.isNaN(p.price)) return "—";
    return `${p.price.toFixed(2)}`;
  };

  const selectCatalogCategory = useCallback((id: string) => {
    setSearchParams((sp) => {
      const next = new URLSearchParams(sp);
      next.delete("seasonal");
      return next;
    });
    setCategory(id);
    setPage(1);
    setQuery("");
  }, [setSearchParams]);

  return (
    <div className="bg-green-50 text-[#1a1c1a] overflow-x-hidden" style={organicBgStyle}>
      <Header
        variant="catalog"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        onSearchKeyDown={onSearchKeyDown}
      />

      <main className="pt-24 min-h-screen relative">
        {/* Background Elements */}
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
          {/* Полукруги по краям (часть круга за пределами контейнера) */}
          <div className="absolute top-24 -left-[28rem] w-[56rem] h-[56rem] bg-[#1f642e]/10 rounded-full blur-[110px] motion-reduce:hidden" />
          <div className="absolute top-[28rem] -right-[32rem] w-[64rem] h-[64rem] bg-[#266b3b]/10 rounded-full blur-[130px] motion-reduce:hidden" />
        </div>

        <div className="relative z-10 max-w-[1600px] mx-auto px-6 lg:px-8 flex gap-8 lg:gap-12">
          {/* Sidebar Categories */}
          <aside className="hidden lg:block h-[calc(100vh-6rem)] w-64 sticky top-24 left-0 bg-[#f3f4f0] rounded-3xl overflow-hidden">
            <div className="flex flex-col gap-2 pt-10 h-full">
              <div className="px-8 mb-6">
                <h2 className="text-xl font-black text-[#1a1c1a]">Категории</h2>
                <p className="text-xs text-[#707a6e] font-medium uppercase tracking-wider">Отборная подборка</p>
              </div>

              <nav className="space-y-1">
                {categoriesToShow.length === 0 ? (
                  <p className="px-8 text-sm text-[#707a6e]">Категорий пока нет — добавьте их в админке или запустите сидирование БД.</p>
                ) : null}
                {categoriesToShow.map((c, idx) => {
                  const isActive = !onlySeasonal && c.id === category;
                  return (
                    <button
                      key={c.id}
                      className={[
                        "w-full text-left py-4 px-8 flex items-center gap-3 text-sm transition-all duration-200",
                        isActive
                          ? "text-[#1f642e] font-bold bg-white rounded-r-full shadow-sm"
                          : "text-stone-500 hover:translate-x-1 hover:text-[#1f642e]",
                      ].join(" ")}
                      onClick={() => selectCatalogCategory(c.id)}
                      type="button"
                    >
                      <span className="flex-1">{c.label}</span>
                      <span className="text-xs text-[#707a6e]">{categoryCounts[c.id] ?? 0}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="mt-auto p-8">
                <div className="bg-[#1f642e]/10 rounded-2xl p-4 relative overflow-hidden">
                  <p className="text-xs font-bold text-[#1f642e] mb-1">Сезонная акция</p>
                  <p className="text-sm text-[#40493f] leading-tight">Скидка 15% на всю зелень на этой неделе.</p>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Catalog Content */}
          <section className="min-w-0 flex-1 pb-20">
            {/* Catalog Header: z-30 — выпадающая сортировка над сеткой (иначе карточки рисуются поверх) */}
            <div className="relative z-30 mb-12 flex min-w-0 flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-5xl font-black text-[#1a1c1a] tracking-tighter mb-2">Качественные продукты</h1>
                <p className="text-[#40493f] max-w-md">
                  {onlySeasonal ? (
                    <>
                      Показаны все сезонные позиции из каталога. Чтобы смотреть категории по отдельности, выберите категорию{" "}
                      <span className="lg:hidden">в фильтрах ниже</span>
                      <span className="hidden lg:inline">слева в списке категорий</span> или нажмите «Сбросить фильтры».
                    </>
                  ) : (
                    <>
                      Тщательно отбираем фрукты, овощи и зелень: свежесть, натуральный вкус и витамины — то, что хочется видеть на
                      столе каждый день.
                    </>
                  )}
                </p>
              </div>
              <div className="flex w-full min-w-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:gap-4">
                <div className="w-full min-w-0 md:w-auto md:max-w-[min(22rem,calc(100vw-4rem))] lg:hidden">
                  <div className="relative w-full min-w-0">
                    <div className="flex h-12 w-full min-w-0 items-center gap-2 rounded-full border border-[#1f642e]/10 bg-[#f9faf6]/70 px-4 backdrop-blur-sm text-sm font-semibold sm:px-6">
                      <span className="shrink-0 text-[#707a6e]">Категория:</span>
                      <div className="relative min-w-0 flex-1">
                        <button
                          ref={categoryButtonRef}
                          className="inline-flex min-w-0 max-w-full w-full items-center justify-between gap-2 rounded-full bg-transparent py-1 pl-1 pr-1 text-left text-[#1a1c1a] font-semibold focus:outline-none focus:ring-2 focus:ring-[#1f642e]/20"
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={categoryMenuOpen}
                          aria-label={`Категория: ${categoryLabel}`}
                          onClick={() => {
                            setCategoryMenuOpen((v) => !v);
                            setSortMenuOpen(false);
                          }}
                        >
                          <span className="min-w-0 truncate">{categoryLabel}</span>
                          <svg
                            className={[
                              "h-4 w-4 shrink-0 text-[#707a6e] transition-transform duration-200",
                              categoryMenuOpen ? "rotate-180" : "rotate-0",
                            ].join(" ")}
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.24 4.5a.75.75 0 0 1-1.08 0l-4.24-4.5a.75.75 0 0 1 .02-1.06Z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {categoryMenuOpen ? (
                      <div
                        ref={categoryMenuRef}
                        role="menu"
                        aria-label="Категории"
                        className="z-[100] mt-2 max-h-[min(60vh,22rem)] w-full min-w-0 overflow-auto rounded-2xl border border-[#1f642e]/10 bg-white shadow-xl shadow-[#1f642e]/10 backdrop-blur-md max-md:relative md:absolute md:right-0 md:top-[calc(100%+0.5rem)] md:mt-0 md:w-[min(20rem,calc(100vw-2rem))]"
                      >
                        <div className="p-2">
                          {onlySeasonal ? (
                            <div className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-[#707a6e]">
                              Сейчас: все сезонные
                            </div>
                          ) : null}
                          {!onlySeasonal && categoriesToShow.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-[#707a6e]">Категорий пока нет.</div>
                          ) : null}
                          {categoriesToShow.map((c) => {
                            const active = !onlySeasonal && c.id === category;
                            const count = categoryCounts[c.id] ?? 0;
                            return (
                              <button
                                key={c.id}
                                role="menuitemradio"
                                aria-checked={active}
                                type="button"
                                className={[
                                  "w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                                  active
                                    ? "bg-[#1f642e] text-white shadow-sm shadow-[#1f642e]/20"
                                    : "text-[#1a1c1a] hover:bg-[#e7e9e5]",
                                ].join(" ")}
                                onClick={() => {
                                  selectCatalogCategory(c.id);
                                  setCategoryMenuOpen(false);
                                }}
                              >
                                <span className="flex items-center justify-between gap-3">
                                  <span className="min-w-0 truncate">{c.label}</span>
                                  <span className="flex shrink-0 items-center gap-2">
                                    <span
                                      className={[
                                        "tabular-nums text-xs font-bold",
                                        active ? "text-white/85" : "text-[#707a6e]",
                                      ].join(" ")}
                                    >
                                      {count}
                                    </span>
                                    {active ? (
                                      <svg className="h-4 w-4 opacity-90" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                        <path
                                          fillRule="evenodd"
                                          d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.25 7.3a1 1 0 0 1-1.42-.002L3.29 9.25a1 1 0 1 1 1.42-1.4l3.04 3.082 6.54-6.586a1 1 0 0 1 1.414-.006Z"
                                          clipRule="evenodd"
                                        />
                                      </svg>
                                    ) : (
                                      <span className="h-4 w-4" aria-hidden="true" />
                                    )}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="w-full min-w-0 md:w-auto md:max-w-[min(22rem,calc(100vw-4rem))]">
                  <div className="relative w-full min-w-0">
                    <div className="flex h-12 w-full min-w-0 items-center gap-2 rounded-full border border-[#1f642e]/10 bg-[#f9faf6]/70 px-4 backdrop-blur-sm text-sm font-semibold sm:px-6">
                      <span className="shrink-0 text-[#707a6e]">Сортировка:</span>
                      <div className="relative min-w-0 flex-1">
                        <button
                          ref={sortButtonRef}
                          className="inline-flex min-w-0 max-w-full w-full items-center justify-between gap-2 rounded-full bg-transparent py-1 pl-1 pr-1 text-left text-[#1a1c1a] font-semibold focus:outline-none focus:ring-2 focus:ring-[#1f642e]/20"
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={sortMenuOpen}
                          onClick={() => {
                            setSortMenuOpen((v) => !v);
                            setCategoryMenuOpen(false);
                          }}
                        >
                          <span className="min-w-0 truncate">{sortLabel}</span>
                          <svg
                            className={[
                              "h-4 w-4 shrink-0 text-[#707a6e] transition-transform duration-200",
                              sortMenuOpen ? "rotate-180" : "rotate-0",
                            ].join(" ")}
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.24 4.5a.75.75 0 0 1-1.08 0l-4.24-4.5a.75.75 0 0 1 .02-1.06Z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {sortMenuOpen ? (
                      <div
                        ref={sortMenuRef}
                        role="menu"
                        className="z-[100] mt-2 max-h-[min(50vh,18rem)] w-full min-w-0 overflow-auto rounded-2xl border border-[#1f642e]/10 bg-white shadow-xl shadow-[#1f642e]/10 backdrop-blur-md max-md:relative md:absolute md:right-0 md:top-[calc(100%+0.5rem)] md:mt-0 md:w-[min(16rem,calc(100vw-2rem))]"
                      >
                        <div className="p-2">
                          {sortOptions.map((o) => {
                            const active = o.value === sort;
                            return (
                              <button
                                key={o.value}
                                role="menuitemradio"
                                aria-checked={active}
                                type="button"
                                className={[
                                  "w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors",
                                  active
                                    ? "bg-[#1f642e] text-white shadow-sm shadow-[#1f642e]/20"
                                    : "text-[#1a1c1a] hover:bg-[#e7e9e5]",
                                ].join(" ")}
                                onClick={() => {
                                  const value = o.value as typeof sort;
                                  setSort(value);
                                  setPage(1);
                                  setSortMenuOpen(false);
                                }}
                              >
                                <span className="flex items-center justify-between gap-3">
                                  <span>{o.label}</span>
                                  {active ? (
                                    <svg className="h-4 w-4 opacity-90" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                      <path
                                        fillRule="evenodd"
                                        d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.25 7.3a1 1 0 0 1-1.42-.002L3.29 9.25a1 1 0 1 1 1.42-1.4l3.04 3.082 6.54-6.586a1 1 0 0 1 1.414-.006Z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  ) : (
                                    <span className="h-4 w-4" aria-hidden="true" />
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <button
                  className="h-12 w-full shrink-0 rounded-full border border-[#d4d7d1] bg-white px-5 py-3 text-sm font-semibold text-[#5c6658] transition-colors hover:border-[#1f642e]/40 hover:text-[#1f642e] md:h-auto md:w-auto"
                  onClick={resetFilters}
                  type="button"
                >
                  Сбросить фильтры
                </button>
              </div>
            </div>

            {/* Mobile search — тот же вид, что поиск в шапке на lg (стекло + рамка + ⌕) */}
            <div className="lg:hidden mb-8">
              <div className="flex w-full items-center bg-[#f9faf6]/70 backdrop-blur-sm border border-[#1f642e]/10 rounded-full h-12 px-5 gap-2.5">
                <span
                  className="text-[#707a6e] text-3xl shrink-0 leading-[1] h-12 w-7 inline-flex self-center items-center justify-center -translate-y-[2px]"
                  aria-hidden
                >
                  ⌕
                </span>
                <input
                  className="min-w-0 flex-1 bg-transparent border-none text-base h-12 leading-none placeholder:text-[#707a6e]/80 focus:outline-none focus:ring-0"
                  placeholder="Поиск по каталогу..."
                  aria-label="Поиск по каталогу"
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  onKeyDown={onSearchKeyDown}
                />
              </div>
            </div>

            {/* Product Grid: Asymmetric Layout */}
            <div className="grid grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 min-[380px]:gap-6 sm:gap-8">
              {pagedProducts.map((p, index) => {
                const packLabel = formatPackageWeight(p.weightValue, p.weightUnit);
                const eager = index < 3;
                const available = p.inStock !== false;
                return (
                  <article
                    key={p.id}
                    className={[
                      "group min-w-0 bg-white rounded-[1.5rem] min-[380px]:rounded-[2rem] p-4 min-[380px]:p-6 shadow-sm transition-all duration-500 flex flex-col h-full",
                      available ? "hover:shadow-xl hover:shadow-[#1f642e]/5" : "opacity-90",
                    ].join(" ")}
                  >
                    <div className="relative h-48 min-[380px]:h-56 sm:h-64 mb-4 min-[380px]:mb-6 rounded-2xl overflow-hidden bg-[#e2e3df]">
                      <img
                        className="w-full h-full object-cover transition-transform duration-500 ease-out transform-gpu group-hover:scale-110"
                        alt={p.name}
                        width={512}
                        height={384}
                        sizes="(max-width: 380px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        decoding="async"
                        fetchPriority={eager ? "high" : undefined}
                        loading={eager ? "eager" : "lazy"}
                        src={p.imageUrl || CATALOG_IMAGE_PLACEHOLDER}
                      />
                      {p.badge ? (
                        <div className="absolute top-4 left-4 bg-[#736f60] text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-sm">
                          {p.badge.label}
                        </div>
                      ) : null}
                      {p.popular ? (
                        <div className="absolute top-4 right-4 bg-amber-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-sm shadow-sm">
                          ПОПУЛЯРНО
                        </div>
                      ) : null}
                    </div>

                    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 text-left">
                      <div className="min-h-[2.875rem] sm:min-h-[3.5rem]">
                        <h3 className="line-clamp-2 text-base font-bold leading-snug text-[#1a1f18] [overflow-wrap:anywhere] group-hover:text-[#1f642e] transition-colors sm:text-xl sm:leading-tight">
                          {p.name}
                        </h3>
                      </div>
                      <p className="text-lg font-black tabular-nums text-[#1f642e] sm:text-xl">
                        {formatPrice(p) === "—" ? "—" : `${formatPrice(p)} BYN`}
                      </p>
                      <p className="text-sm leading-snug text-[#40493f] line-clamp-2">
                        {p.country ? `Страна: ${p.country}` : "Свежий сезонный продукт из нашей коллекции."}
                      </p>
                      {packLabel ? (
                        <p className="text-sm leading-snug text-[#40493f]">
                          {p.weightUnit === "pcs" ? "Количество" : "Вес"}: {packLabel}
                        </p>
                      ) : null}
                      {available ? null : (
                        <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" aria-hidden />
                          Нет в наличии
                        </div>
                      )}
                      <button
                        className={[
                          "mt-auto w-full py-3 rounded-full font-bold transition-colors duration-300",
                          available
                            ? "bg-[#a8f0b3] text-[#2a703f] hover:bg-[#1f642e] hover:text-white"
                            : "bg-[#e8e9e6] text-[#8a9289] cursor-not-allowed",
                        ].join(" ")}
                        disabled={!available}
                        type="button"
                      >
                        В корзину
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Pagination (оставляем функциональность, стилизуем под макет) */}
            <div className="mt-14 flex justify-center w-full">
              <div className="flex max-w-full flex-nowrap justify-center items-center gap-2 overflow-x-auto pb-2">
                <button
                  className="w-10 h-10 shrink-0 rounded-full bg-[#e2e3df] hover:bg-[#d9dad7] font-bold disabled:opacity-40"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  type="button"
                >
                  ←
                </button>
                {Array.from({ length: pageCount }).map((_, i) => {
                  const n = i + 1;
                  const isActive = n === currentPage;
                  return (
                    <button
                      key={n}
                      className={[
                        "w-10 h-10 shrink-0 rounded-full font-bold",
                        isActive ? "bg-[#1f642e] text-white" : "bg-[#e2e3df] hover:bg-[#d9dad7]",
                      ].join(" ")}
                      onClick={() => setPage(n)}
                      type="button"
                    >
                      {n}
                    </button>
                  );
                })}
                <button
                  className="w-10 h-10 shrink-0 rounded-full bg-[#e2e3df] hover:bg-[#d9dad7] font-bold disabled:opacity-40"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  type="button"
                >
                  →
                </button>
              </div>
            </div>
          </section>
        </div>

        <SiteFooter />
      </main>
    </div>
  );
}

