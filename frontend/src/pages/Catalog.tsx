import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

type ProductBadge =
  | { kind: "seasonal"; label: string; className: "bg-white/90 backdrop-blur text-[#2d6a4f]" }
  | { kind: "hit"; label: string; className: "bg-primary text-white" }
  | { kind: "organic"; label: string; className: "bg-white/90 backdrop-blur text-[#2d6a4f]" };

type Product = {
  id: string;
  name: string;
  country: string;
  imageUrl: string;
  category: string; // categoryId from backend (or slug in mock fallback)
  categoryName?: string | null; // for convenience in UI
  price?: number | null;
  badge?: ProductBadge;
};

const CATALOG_IMAGE_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="512" viewBox="0 0 800 512"><rect fill="#f3f4f6" width="800" height="512"/><text x="400" y="256" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-family="system-ui,sans-serif" font-size="18">Нет фото</text></svg>`,
  );

export default function Catalog() {
  const API_BASE_URL = "http://localhost:3001";
  const [searchParams] = useSearchParams();

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"default" | "name" | "season">("default");
  const [category, setCategory] = useState<Product["category"]>("vegetables");
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);

  const [apiProducts, setApiProducts] = useState<Product[]>([]);
  const sortOptions = useMemo(
    () =>
      [
        { value: "default", label: "По свежести" },
        { value: "name", label: "По названию" },
        { value: "season", label: "По сезону" },
      ] as const,
    [],
  );
  const sortLabel = useMemo(() => sortOptions.find((o) => o.value === sort)?.label ?? "По свежести", [sort, sortOptions]);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const sortButtonRef = useRef<HTMLButtonElement | null>(null);

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
    let cancelled = false;
    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const q = query.trim();
          const params = new URLSearchParams();
          params.set("page", "1");
          params.set("pageSize", "50");
          if (q) params.set("q", q);

          const res = await fetch(`${API_BASE_URL}/api/products?${params.toString()}`, { signal: controller.signal });
          if (!res.ok) throw new Error(`http_${res.status}`);
          const data = (await res.json()) as { items?: Array<any> };

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

          const mapped: Product[] = (data.items ?? [])
            .map((it: any) => {
              const badge = badgeFromApi(it.badge);
              const price =
                typeof it.price === "number"
                  ? it.price
                  : typeof it.price === "string" && it.price.trim()
                    ? Number.parseFloat(it.price)
                    : null;
              return {
                id: String(it.id),
                name: String(it.name ?? ""),
                country: String(it.country ?? ""),
                imageUrl: toAbsoluteImageUrl(String(it.imageUrl ?? "")),
                category: String(it.categoryId ?? ""),
                categoryName: it.categoryName ?? null,
                price: Number.isFinite(price as number) ? (price as number) : null,
                badge,
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
  }, [query]);

  const mockProducts = useMemo<Product[]>(
    () => [
      {
        id: "tomatoes",
        name: "Спелые Томаты",
        country: "Испания",
        category: "vegetables",
        imageUrl:
          "https://lh3.googleusercontent.com/aida-public/AB6AXuBja0IoWqP351BgR5QksrVI4htKIHV8bJSfj8LYjlIzJQRCAte1f5ufYYOStcbmRZw9Yo-NtD7Fd5aJUyV6t6U7SHsUaAkeL90MpU3NrDFmiKkMhv9_NP9m0GcEGj5x4nwkY2gxGv76-aNz8TjAq5Wsq3wFP5-8TdtyAYVDTsSwmvgUor6GvdWvwZxeqLG-0THkc6s-DEPn61D9atU-Q81mNMWQHghHJiwqu52D4zqJQa_SkMGnTd34XisrWx8Pu4kKB8mlriTsK7Aa",
        badge: { kind: "seasonal", label: "СЕЗОННОЕ", className: "bg-white/90 backdrop-blur text-[#2d6a4f]" },
      },
      {
        id: "mango",
        name: "Сочное Манго",
        country: "Узбекистан",
        category: "fruits",
        imageUrl:
          "https://lh3.googleusercontent.com/aida-public/AB6AXuAhfC1ekrSFGxXUtU79rm-R0x6k7poYE8P_frP6wf7nFkhoy8NiXz-XC2Lf8olmX_ZuClLgDKwGiUlXyjKc1wTHCisXZl4wybIU0ijVCMt_Ed518KshpHcWCmkOXJH__nboBvdZ0e7dGO2HwdoLqFl71wi2i0jFIxmlU_uNfvUithlQk07u7YF-j6zCxQvsjPx67qRkW_a0ziWgQJsiJEP6bYSHcTpml0s3TTjZEdIQyOx8wDBuxXuslmDndokKkwjKvBvmg8UTkKQ8",
        badge: { kind: "hit", label: "ХИТ", className: "bg-primary text-white" },
      },
      {
        id: "carrot",
        name: "Фермерская Морковь",
        country: "Беларусь",
        category: "vegetables",
        imageUrl:
          "https://lh3.googleusercontent.com/aida-public/AB6AXuDqmMBHnpVB6nz5XbziJW6zDTa8kwwjI8H4qe-ipsKvHNRBrZdcgbiUDbt9V0Hya-NF28lJaupMCh4dJwcx_sAxoNOfHdBsofCG2lNp5Y1ss_GNivJRFV05Z5WPYHgFAmbR0Sv90zyhYv_EA1uE81CnA5ovYiDGoJHElcFDkhl6djVSb15hh-0hO-TH5U1_JETU5f-WuukX469m_NQ0_IRKxPdT7DUDgESA3UyfAWyhl9jPAT19EN-yBj_DE9w1oMBMBuu8oTNnfWD3",
      },
      {
        id: "pepper",
        name: "Сладкий Перец",
        country: "Турция",
        category: "vegetables",
        imageUrl:
          "https://lh3.googleusercontent.com/aida-public/AB6AXuBsEZJlkLe8l9ac08OTdUbSbE2Y_wVtSLLe-j8j58ltxGqVanMUsTaIpPLrGF0bdF35yGRbWQfMn1mIqRJ66jiW3_2uumdxd8h2V8zzbjmIQ5KlofXfIQBltS8RIADqxehcCLaT8FJH6wU1W6nVS_KhHkd6lDMvKGCikXtsOb9m3ReLIjLiaS4l055Ss7rENFa6Zonbmjx1CS48agGbRh8w84ipErXvIKdKPgRIarQbdtep03djZVXkYNMHHZTuLKdvWKMXjrIV2YAn",
      },
      {
        id: "broccoli",
        name: "Брокколи",
        country: "Италия",
        category: "vegetables",
        imageUrl:
          "https://lh3.googleusercontent.com/aida-public/AB6AXuBfZetvkpCX111aefA4KrLKszo51EVyFsLkFzVc09t6odu0FuOK5ALwECNrhx2LdQ_bUyI_eXI2o2prbL9Bz_v38CMykFxINF0T7bxDPBXTkMtqpByVnPdlj-0e7tsBxMOMowctIm6mh2WccoJH6AnY5Na8mk1dH7VHfuuVhJZ7vwJNPHTi7bj1PTIBBYrmo7LfhYt-ssxZMBDuo2rDuHx-dM5RpYE3mijSLpHyzYKT3UYdMgHtcnd9UwK2PEgv_lvYLmdaeD8XDaVw",
        badge: { kind: "organic", label: "ОРГАНИК", className: "bg-white/90 backdrop-blur text-[#2d6a4f]" },
      },
      {
        id: "cucumber",
        name: "Зеленый Огурец",
        country: "Беларусь",
        category: "vegetables",
        imageUrl:
          "https://lh3.googleusercontent.com/aida-public/AB6AXuCZuyv7gAT0iEEfS0tDNOBcFbWH1YfUF2HjAXPG5dePzHrYURkg_ohin73xB_Iq_ocNsb8ELjjuSx_1j7BXA8YcAK7nrowYeI9wFvnkt7QczAZP8peK0jG8UBk3ahxggRfJeqZsUdBYB4OH_UVluM3QekuOZrcQS1-PFzoCdjvm-xOoPTJvYW5IP6c7dpGprUr56nBWiWxclmpL30nCcDS2U4dnxhYEva6IZ0krbLRPGpbpd3g6sF4urxj0jv0Y41AptOxXQIHHVxQs",
      },
      // Duplicate + vary names/countries to reach 24 items for pagination demo
      { id: "tomatoes-2", name: "Томаты Черри", country: "Испания", category: "vegetables", imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuBja0IoWqP351BgR5QksrVI4htKIHV8bJSfj8LYjlIzJQRCAte1f5ufYYOStcbmRZw9Yo-NtD7Fd5aJUyV6t6U7SHsUaAkeL90MpU3NrDFmiKkMhv9_NP9m0GcEGj5x4nwkY2gxGv76-aNz8TjAq5Wsq3wFP5-8TdtyAYVDTsSwmvgUor6GvdWvwZxeqLG-0THkc6s-DEPn61D9atU-Q81mNMWQHghHJiwqu52D4zqJQa_SkMGnTd34XisrWx8Pu4kKB8mlriTsK7Aa" },
      { id: "mango-2", name: "Манго Премиум", country: "Узбекистан", category: "fruits", imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuAhfC1ekrSFGxXUtU79rm-R0x6k7poYE8P_frP6wf7nFkhoy8NiXz-XC2Lf8olmX_ZuClLgDKwGiUlXyjKc1wTHCisXZl4wybIU0ijVCMt_Ed518KshpHcWCmkOXJH__nboBvdZ0e7dGO2HwdoLqFl71wi2i0jFIxmlU_uNfvUithlQk07u7YF-j6zCxQvsjPx67qRkW_a0ziWgQJsiJEP6bYSHcTpml0s3TTjZEdIQyOx8wDBuxXuslmDndokKkwjKvBvmg8UTkKQ8" },
      { id: "carrot-2", name: "Морковь Молодая", country: "Беларусь", category: "vegetables", imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuDqmMBHnpVB6nz5XbziJW6zDTa8kwwjI8H4qe-ipsKvHNRBrZdcgbiUDbt9V0Hya-NF28lJaupMCh4dJwcx_sAxoNOfHdBsofCG2lNp5Y1ss_GNivJRFV05Z5WPYHgFAmbR0Sv90zyhYv_EA1uE81CnA5ovYiDGoJHElcFDkhl6djVSb15hh-0hO-TH5U1_JETU5f-WuukX469m_NQ0_IRKxPdT7DUDgESA3UyfAWyhl9jPAT19EN-yBj_DE9w1oMBMBuu8oTNnfWD3" },
      { id: "pepper-2", name: "Перец Красный", country: "Турция", category: "vegetables", imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuBsEZJlkLe8l9ac08OTdUbSbE2Y_wVtSLLe-j8j58ltxGqVanMUsTaIpPLrGF0bdF35yGRbWQfMn1mIqRJ66jiW3_2uumdxd8h2V8zzbjmIQ5KlofXfIQBltS8RIADqxehcCLaT8FJH6wU1W6nVS_KhHkd6lDMvKGCikXtsOb9m3ReLIjLiaS4l055Ss7rENFa6Zonbmjx1CS48agGbRh8w84ipErXvIKdKPgRIarQbdtep03djZVXkYNMHHZTuLKdvWKMXjrIV2YAn" },
      { id: "broccoli-2", name: "Брокколи Органик", country: "Италия", category: "vegetables", imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuBfZetvkpCX111aefA4KrLKszo51EVyFsLkFzVc09t6odu0FuOK5ALwECNrhx2LdQ_bUyI_eXI2o2prbL9Bz_v38CMykFxINF0T7bxDPBXTkMtqpByVnPdlj-0e7tsBxMOMowctIm6mh2WccoJH6AnY5Na8mk1dH7VHfuuVhJZ7vwJNPHTi7bj1PTIBBYrmo7LfhYt-ssxZMBDuo2rDuHx-dM5RpYE3mijSLpHyzYKT3UYdMgHtcnd9UwK2PEgv_lvYLmdaeD8XDaVw" },
      { id: "cucumber-2", name: "Огурец Хрустящий", country: "Беларусь", category: "vegetables", imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuCZuyv7gAT0iEEfS0tDNOBcFbWH1YfUF2HjAXPG5dePzHrYURkg_ohin73xB_Iq_ocNsb8ELjjuSx_1j7BXA8YcAK7nrowYeI9wFvnkt7QczAZP8peK0jG8UBk3ahxggRfJeqZsUdBYB4OH_UVluM3QekuOZrcQS1-PFzoCdjvm-xOoPTJvYW5IP6c7dpGprUr56nBWiWxclmpL30nCcDS2U4dnxhYEva6IZ0krbLRPGpbpd3g6sF4urxj0jv0Y41AptOxXQIHHVxQs" },
      { id: "tomatoes-3", name: "Томаты Розовые", country: "Испания", category: "vegetables", imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuBja0IoWqP351BgR5QksrVI4htKIHV8bJSfj8LYjlIzJQRCAte1f5ufYYOStcbmRZw9Yo-NtD7Fd5aJUyV6t6U7SHsUaAkeL90MpU3NrDFmiKkMhv9_NP9m0GcEGj5x4nwkY2gxGv76-aNz8TjAq5Wsq3wFP5-8TdtyAYVDTsSwmvgUor6GvdWvwZxeqLG-0THkc6s-DEPn61D9atU-Q81mNMWQHghHJiwqu52D4zqJQa_SkMGnTd34XisrWx8Pu4kKB8mlriTsK7Aa" },
      { id: "mango-3", name: "Манго Спелое", country: "Узбекистан", category: "fruits", imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuAhfC1ekrSFGxXUtU79rm-R0x6k7poYE8P_frP6wf7nFkhoy8NiXz-XC2Lf8olmX_ZuClLgDKwGiUlXyjKc1wTHCisXZl4wybIU0ijVCMt_Ed518KshpHcWCmkOXJH__nboBvdZ0e7dGO2HwdoLqFl71wi2i0jFIxmlU_uNfvUithlQk07u7YF-j6zCxQvsjPx67qRkW_a0ziWgQJsiJEP6bYSHcTpml0s3TTjZEdIQyOx8wDBuxXuslmDndokKkwjKvBvmg8UTkKQ8" },
      { id: "carrot-3", name: "Морковь Сладкая", country: "Беларусь", category: "vegetables", imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuDqmMBHnpVB6nz5XbziJW6zDTa8kwwjI8H4qe-ipsKvHNRBrZdcgbiUDbt9V0Hya-NF28lJaupMCh4dJwcx_sAxoNOfHdBsofCG2lNp5Y1ss_GNivJRFV05Z5WPYHgFAmbR0Sv90zyhYv_EA1uE81CnA5ovYiDGoJHElcFDkhl6djVSb15hh-0hO-TH5U1_JETU5f-WuukX469m_NQ0_IRKxPdT7DUDgESA3UyfAWyhl9jPAT19EN-yBj_DE9w1oMBMBuu8oTNnfWD3" },
      { id: "pepper-3", name: "Перец Жёлтый", country: "Турция", category: "vegetables", imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuBsEZJlkLe8l9ac08OTdUbSbE2Y_wVtSLLe-j8j58ltxGqVanMUsTaIpPLrGF0bdF35yGRbWQfMn1mIqRJ66jiW3_2uumdxd8h2V8zzbjmIQ5KlofXfIQBltS8RIADqxehcCLaT8FJH6wU1W6nVS_KhHkd6lDMvKGCikXtsOb9m3ReLIjLiaS4l055Ss7rENFa6Zonbmjx1CS48agGbRh8w84ipErXvIKdKPgRIarQbdtep03djZVXkYNMHHZTuLKdvWKMXjrIV2YAn" },
      { id: "broccoli-3", name: "Брокколи Свежая", country: "Италия", category: "vegetables", imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuBfZetvkpCX111aefA4KrLKszo51EVyFsLkFzVc09t6odu0FuOK5ALwECNrhx2LdQ_bUyI_eXI2o2prbL9Bz_v38CMykFxINF0T7bxDPBXTkMtqpByVnPdlj-0e7tsBxMOMowctIm6mh2WccoJH6AnY5Na8mk1dH7VHfuuVhJZ7vwJNPHTi7bj1PTIBBYrmo7LfhYt-ssxZMBDuo2rDuHx-dM5RpYE3mijSLpHyzYKT3UYdMgHtcnd9UwK2PEgv_lvYLmdaeD8XDaVw" },
      { id: "cucumber-3", name: "Огурец Зелёный", country: "Беларусь", category: "vegetables", imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuCZuyv7gAT0iEEfS0tDNOBcFbWH1YfUF2HjAXPG5dePzHrYURkg_ohin73xB_Iq_ocNsb8ELjjuSx_1j7BXA8YcAK7nrowYeI9wFvnkt7QczAZP8peK0jG8UBk3ahxggRfJeqZsUdBYB4OH_UVluM3QekuOZrcQS1-PFzoCdjvm-xOoPTJvYW5IP6c7dpGprUr56nBWiWxclmpL30nCcDS2U4dnxhYEva6IZ0krbLRPGpbpd3g6sF4urxj0jv0Y41AptOxXQIHHVxQs" },
      { id: "tomatoes-4", name: "Томаты Сливка", country: "Испания", category: "vegetables", imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuBja0IoWqP351BgR5QksrVI4htKIHV8bJSfj8LYjlIzJQRCAte1f5ufYYOStcbmRZw9Yo-NtD7Fd5aJUyV6t6U7SHsUaAkeL90MpU3NrDFmiKkMhv9_NP9m0GcEGj5x4nwkY2gxGv76-aNz8TjAq5Wsq3wFP5-8TdtyAYVDTsSwmvgUor6GvdWvwZxeqLG-0THkc6s-DEPn61D9atU-Q81mNMWQHghHJiwqu52D4zqJQa_SkMGnTd34XisrWx8Pu4kKB8mlriTsK7Aa" },
      { id: "mango-4", name: "Манго Ароматное", country: "Узбекистан", category: "fruits", imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuAhfC1ekrSFGxXUtU79rm-R0x6k7poYE8P_frP6wf7nFkhoy8NiXz-XC2Lf8olmX_ZuClLgDKwGiUlXyjKc1wTHCisXZl4wybIU0ijVCMt_Ed518KshpHcWCmkOXJH__nboBvdZ0e7dGO2HwdoLqFl71wi2i0jFIxmlU_uNfvUithlQk07u7YF-j6zCxQvsjPx67qRkW_a0ziWgQJsiJEP6bYSHcTpml0s3TTjZEdIQyOx8wDBuxXuslmDndokKkwjKvBvmg8UTkKQ8" },
      { id: "carrot-4", name: "Морковь Мытая", country: "Беларусь", category: "vegetables", imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuDqmMBHnpVB6nz5XbziJW6zDTa8kwwjI8H4qe-ipsKvHNRBrZdcgbiUDbt9V0Hya-NF28lJaupMCh4dJwcx_sAxoNOfHdBsofCG2lNp5Y1ss_GNivJRFV05Z5WPYHgFAmbR0Sv90zyhYv_EA1uE81CnA5ovYiDGoJHElcFDkhl6djVSb15hh-0hO-TH5U1_JETU5f-WuukX469m_NQ0_IRKxPdT7DUDgESA3UyfAWyhl9jPAT19EN-yBj_DE9w1oMBMBuu8oTNnfWD3" },
      { id: "pepper-4", name: "Перец Сочный", country: "Турция", category: "vegetables", imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuBsEZJlkLe8l9ac08OTdUbSbE2Y_wVtSLLe-j8j58ltxGqVanMUsTaIpPLrGF0bdF35yGRbWQfMn1mIqRJ66jiW3_2uumdxd8h2V8zzbjmIQ5KlofXfIQBltS8RIADqxehcCLaT8FJH6wU1W6nVS_KhHkd6lDMvKGCikXtsOb9m3ReLIjLiaS4l055Ss7rENFa6Zonbmjx1CS48agGbRh8w84ipErXvIKdKPgRIarQbdtep03djZVXkYNMHHZTuLKdvWKMXjrIV2YAn" },
      { id: "broccoli-4", name: "Брокколи Крупная", country: "Италия", category: "vegetables", imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuBfZetvkpCX111aefA4KrLKszo51EVyFsLkFzVc09t6odu0FuOK5ALwECNrhx2LdQ_bUyI_eXI2o2prbL9Bz_v38CMykFxINF0T7bxDPBXTkMtqpByVnPdlj-0e7tsBxMOMowctIm6mh2WccoJH6AnY5Na8mk1dH7VHfuuVhJZ7vwJNPHTi7bj1PTIBBYrmo7LfhYt-ssxZMBDuo2rDuHx-dM5RpYE3mijSLpHyzYKT3UYdMgHtcnd9UwK2PEgv_lvYLmdaeD8XDaVw" },
      { id: "cucumber-4", name: "Огурец Длинный", country: "Беларусь", category: "vegetables", imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuCZuyv7gAT0iEEfS0tDNOBcFbWH1YfUF2HjAXPG5dePzHrYURkg_ohin73xB_Iq_ocNsb8ELjjuSx_1j7BXA8YcAK7nrowYeI9wFvnkt7QczAZP8peK0jG8UBk3ahxggRfJeqZsUdBYB4OH_UVluM3QekuOZrcQS1-PFzoCdjvm-xOoPTJvYW5IP6c7dpGprUr56nBWiWxclmpL30nCcDS2U4dnxhYEva6IZ0krbLRPGpbpd3g6sF4urxj0jv0Y41AptOxXQIHHVxQs" },
    ],
    [],
  );

  const products = apiProducts.length ? apiProducts : mockProducts;

  const fallbackCategories = useMemo(
    () => [
      { id: "vegetables", label: "Овощи" },
      { id: "fruits", label: "Фрукты" },
      { id: "greens", label: "Зелень и травы" },
      { id: "berries", label: "Ягоды" },
    ],
    [],
  );

  const categoriesToShow = useMemo(
    () => (categories.length ? categories.map((c) => ({ id: c.id, label: c.name })) : fallbackCategories),
    [categories, fallbackCategories],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) {
      const key = p.category || "";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [products]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    const categoryBase = products.filter((p) => p.category === category);

    const base = normalizedQuery
      ? categoryBase.filter((p) => {
          const hay = `${p.name} ${p.country}`.toLowerCase();
          return hay.includes(normalizedQuery);
        })
      : categoryBase;

    if (sort === "name") {
      return [...base].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    }

    if (sort === "season") {
      const score = (p: Product) => (p.badge?.kind === "seasonal" ? 2 : p.badge?.kind ? 1 : 0);
      return [...base].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, "ru"));
    }

    return base;
  }, [category, normalizedQuery, products, sort]);

  const pageSize = 6;
  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const pagedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [currentPage, filteredProducts]);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Escape") return;
    setQuery("");
    setPage(1);
  };

  const organicBgStyle = useMemo<React.CSSProperties>(
    () => ({
      backgroundImage: "radial-gradient(circle at 2px 2px, rgba(31, 100, 46, 0.05) 1px, transparent 0)",
      backgroundSize: "40px 40px",
    }),
    [],
  );

  const formatPrice = (p: Product) => {
    if (p.price === null || p.price === undefined || Number.isNaN(p.price)) return "—";
    return `${p.price.toFixed(2)}`;
  };

  return (
    <div className="bg-[#f9faf6] text-[#1a1c1a] overflow-x-hidden" style={organicBgStyle}>
      {/* Header Navigation (from catalog.txt) */}
      <header className="fixed top-0 w-full flex justify-between items-center px-6 lg:px-8 py-4 max-w-full bg-[#f9faf6]/93 backdrop-blur-sm text-[#1f642e] tracking-tight shadow-sm shadow-[#1f642e]/5 z-50">
        <div className="flex items-center gap-8 lg:gap-12 min-w-0">
          <Link className="text-2xl font-black text-[#1f642e] shrink-0" to="/">
            Садовка
          </Link>
          <nav className="hidden md:flex gap-8">
            <Link className="text-stone-600 hover:text-[#1f642e] transition-colors" to="/">
              Главная
            </Link>
            <Link className="text-[#1f642e] font-bold border-b-2 border-[#1f642e] pb-1" to="/catalog">
              Каталог
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3 lg:gap-4">
          <div className="hidden lg:flex items-center bg-[#e7e9e5] rounded-full h-12 px-5 gap-2.5">
            <span className="text-[#707a6e] text-base shrink-0 leading-none">⌕</span>
            <input
              className="bg-transparent border-none focus:ring-0 focus:outline-none text-base w-56 h-12 leading-none"
              placeholder="Поиск по каталогу..."
              type="search"
              aria-label="Поиск по каталогу"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              onKeyDown={onSearchKeyDown}
            />
          </div>
          <div className="flex gap-3 lg:gap-4 items-center">
            <button
              className="h-12 px-6 rounded-full bg-[#1f642e] text-white text-base font-bold leading-none inline-flex items-center justify-center shadow-lg shadow-[#1f642e]/20 hover:bg-[#195324] transition-colors"
              type="button"
            >
              Корзина
            </button>
          </div>
        </div>
      </header>

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
                {categoriesToShow.map((c, idx) => {
                  const isActive = c.id === category;
                  return (
                    <button
                      key={c.id}
                      className={[
                        "w-full text-left py-4 px-8 flex items-center gap-3 text-sm transition-all duration-200",
                        isActive
                          ? "text-[#1f642e] font-bold bg-white rounded-r-full shadow-sm"
                          : "text-stone-500 hover:translate-x-1 hover:text-[#1f642e]",
                      ].join(" ")}
                      onClick={() => {
                        setCategory(c.id);
                        setPage(1);
                        setQuery("");
                      }}
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
          <section className="flex-1 pb-20">
            {/* Catalog Header */}
            <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 mb-12">
              <div>
                <h1 className="text-5xl font-black text-[#1a1c1a] tracking-tighter mb-2">Наш урожай</h1>
                <p className="text-[#40493f] max-w-md">
                  Экологично выращенные и вручную отобранные сезонные продукты — прямо с грядки к вашей двери.
                </p>
              </div>
              <div className="flex gap-4 items-center">
                <div className="bg-[#e2e3df] px-6 py-3 rounded-full flex items-center gap-2 text-sm font-semibold">
                  <span className="text-[#707a6e]">Сортировка:</span>
                  <div className="relative">
                    <button
                      ref={sortButtonRef}
                      className="inline-flex items-center gap-2 bg-transparent text-[#1a1c1a] font-semibold pl-1 -ml-1 pr-1 rounded-full focus:outline-none focus:ring-2 focus:ring-[#1f642e]/20"
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={sortMenuOpen}
                      onClick={() => setSortMenuOpen((v) => !v)}
                    >
                      <span className="whitespace-nowrap">{sortLabel}</span>
                      <svg
                        className={[
                          "h-4 w-4 text-[#707a6e] transition-transform duration-200",
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

                    {sortMenuOpen ? (
                      <div
                        ref={sortMenuRef}
                        role="menu"
                        className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(16rem,calc(100vw-2.5rem))] max-h-[min(50vh,18rem)] overflow-auto rounded-2xl border border-[#1f642e]/10 bg-white/95 backdrop-blur-md shadow-2xl shadow-[#1f642e]/10"
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
              </div>
            </div>

            {/* Mobile search */}
            <div className="lg:hidden mb-8">
              <input
                className="w-full bg-[#e7e9e5] rounded-full px-6 py-3 text-sm focus:ring-2 focus:ring-[#1f642e]/20 border border-transparent"
                placeholder="Поиск по каталогу..."
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                onKeyDown={onSearchKeyDown}
              />
            </div>

            {/* Product Grid: Asymmetric Layout */}
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {pagedProducts.map((p) => {
                return (
                  <article
                    key={p.id}
                    className="group bg-white rounded-[2rem] p-6 shadow-sm hover:shadow-xl hover:shadow-[#1f642e]/5 transition-all duration-500 flex flex-col h-full"
                  >
                    <div className="relative h-64 mb-6 rounded-2xl overflow-hidden bg-[#e2e3df]">
                      <img
                        className="w-full h-full object-cover transition-transform duration-500 ease-out transform-gpu group-hover:scale-110"
                        alt={p.name}
                        loading="lazy"
                        src={p.imageUrl || CATALOG_IMAGE_PLACEHOLDER}
                      />
                      {p.badge ? (
                        <div className="absolute top-4 left-4 bg-[#736f60] text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-sm">
                          {p.badge.label}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex justify-between items-start mb-2 gap-4">
                      <h3 className="text-2xl font-bold group-hover:text-[#1f642e] transition-colors leading-tight max-h-[3.5rem] overflow-hidden">
                        {p.name}
                      </h3>
                      <span className="text-xl font-black text-[#1f642e] whitespace-nowrap">
                        {formatPrice(p) === "—" ? "—" : `${formatPrice(p)} BYN`}
                      </span>
                    </div>
                    <p className="text-[#40493f] text-sm mb-6 flex-grow min-h-[2.5rem] max-h-[2.5rem] overflow-hidden">
                      {p.country ? `Страна: ${p.country}` : "Свежий сезонный продукт из нашей коллекции."}
                    </p>
                    <button
                      className="w-full bg-[#a8f0b3] text-[#2a703f] py-3 rounded-full font-bold hover:bg-[#1f642e] hover:text-white transition-all duration-300"
                      type="button"
                    >
                      В корзину
                    </button>
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

        <footer className="bg-gray-50 pt-20 pb-10 border-t border-gray-200" id="about">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
              <div>
                <div className="flex items-center space-x-2 mb-6">
                  <div className="w-8 h-8 bg-forest-green rounded-md flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      />
                    </svg>
                  </div>
                  <span className="text-xl font-bold text-forest-green">Садовка</span>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed mb-6">
                  Мы верим, что качественная еда должна быть доступна каждому. Доставляем здоровье прямо в ваш холодильник.
                </p>
                <div className="flex space-x-4">
                  <a className="text-gray-400 hover:text-forest-green" href="#">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                  </a>
                  <a className="text-gray-400 hover:text-forest-green" href="#">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.791-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.209-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                    </svg>
                  </a>
                </div>
              </div>
              <div>
                <h4 className="font-bold text-forest-green mb-6">Каталог</h4>
                <ul className="space-y-4 text-sm text-gray-500">
                  <li>
                    <a className="hover:text-vibrant-orange" href="#">
                      Овощи
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-vibrant-orange" href="#">
                      Фрукты
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-vibrant-orange" href="#">
                      Зелень и травы
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-vibrant-orange" href="#">
                      Ягоды
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold text-forest-green mb-6">О компании</h4>
                <ul className="space-y-4 text-sm text-gray-500">
                  <li>
                    <a className="hover:text-vibrant-orange" href="#">
                      История бренда
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-vibrant-orange" href="#">
                      Поставщики и качество
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-vibrant-orange" href="#">
                      Условия доставки
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-vibrant-orange" href="#">
                      Контакты
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold text-forest-green mb-6">Контакты</h4>
                <ul className="space-y-4 text-sm text-gray-500">
                  <li className="leading-relaxed">
                    ООО &quot;Миксголдфрукт&quot;
                    <br />
                    УНП 193855188
                    <br />
                    Юридический адрес У Л. ВЕРЫ ХОРУЖЕЙ, ДОМ 6А, ОФ. 117, 220100
                  </li>
                  <li className="flex items-center">
                    <svg className="w-4 h-4 mr-3 text-leaf-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      />
                    </svg>
                    <a className="hover:text-forest-green" href="tel:+375297606955">
                      +375(29)760-69-55
                    </a>
                  </li>
                  <li className="flex items-center">
                    <svg className="w-4 h-4 mr-3 text-leaf-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <svg className="w-4 h-4 mr-3 text-leaf-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      />
                    </svg>
                    Ежедневно с 8:00 до 22:00
                  </li>
                </ul>
              </div>
            </div>
            <div className="border-t border-gray-200 pt-8 flex flex-col md:flex-row justify-between items-center text-xs text-gray-400">
              <p>© 2026 Садовка. Все права защищены.</p>
              <div className="flex space-x-6 mt-4 md:mt-0">
                <Link className="hover:text-forest-green" to="/privacy">
                  Политика конфиденциальности
                </Link>
                <Link className="hover:text-forest-green" to="/offer">
                  Оферта
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

