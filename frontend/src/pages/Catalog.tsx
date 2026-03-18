import { useEffect, useMemo, useState } from "react";
import Header from "../components/Header";

type ProductBadge =
  | { kind: "seasonal"; label: string; className: "bg-white/90 backdrop-blur text-[#2d6a4f]" }
  | { kind: "hit"; label: string; className: "bg-[#f3722c] text-white" }
  | { kind: "organic"; label: string; className: "bg-white/90 backdrop-blur text-[#2d6a4f]" };

type Product = {
  id: string;
  name: string;
  country: string;
  imageUrl: string;
  category: string; // categoryId from backend (or slug in mock fallback)
  categoryName?: string | null; // for convenience in UI
  badge?: ProductBadge;
};

export default function Catalog() {
  const API_BASE_URL = "http://localhost:3001";

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"default" | "name" | "season">("default");
  const [category, setCategory] = useState<Product["category"]>("vegetables");
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);

  const [apiProducts, setApiProducts] = useState<Product[]>([]);

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
    if (!categories.length) return;
    setCategory((prev) => (categories.some((c) => c.id === prev) ? prev : categories[0]!.id));
  }, [categories]);

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
              return { kind: "hit", label: label || "ХИТ", className: "bg-[#f3722c] text-white" };
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
              return {
                id: String(it.id),
                name: String(it.name ?? ""),
                country: String(it.country ?? ""),
                imageUrl: toAbsoluteImageUrl(String(it.imageUrl ?? "")),
                category: String(it.categoryId ?? ""),
                categoryName: it.categoryName ?? null,
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
        badge: { kind: "hit", label: "ХИТ", className: "bg-[#f3722c] text-white" },
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

  return (
    <div className="bg-white text-[#1b4332]">
      <Header variant="catalog" />

      {/* BEGIN: PageTitle Section */}
      <section className="bg-gray-50 py-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Наш каталог</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Самые свежие овощи, фрукты и зелень, выращенные с любовью нашими фермерами. Мы гарантируем качество каждого
            плода.
          </p>
        </div>
      </section>
      {/* END: PageTitle Section */}

      {/* BEGIN: MainContent */}
      <main className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-12">
          {/* Sidebar Categories */}
          <aside className="w-full" data-purpose="category-sidebar">
            <h2 className="text-xl font-bold mb-6">Категории</h2>
            <ul className="space-y-3">
              {categoriesToShow.map((c) => {
                const isActive = c.id === category;
                return (
                  <li key={c.id}>
                    <button
                      className={[
                        "w-full flex items-center justify-between p-3 rounded-lg transition-colors font-medium text-left",
                        isActive ? "bg-[#52b788] text-white" : "hover:bg-gray-100",
                      ].join(" ")}
                      onClick={() => {
                        setCategory(c.id);
                        setPage(1);
                        setQuery("");
                      }}
                      type="button"
                    >
                      <span>{c.label}</span>
                      <span
                        className={[
                          "text-xs px-2 py-0.5 rounded-full",
                          isActive ? "bg-white text-[#52b788]" : "bg-gray-200 text-gray-600",
                        ].join(" ")}
                      >
                        {categoryCounts[c.id] ?? 0}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-12 p-6 bg-[#f1f8f4] rounded-2xl">
              <h3 className="font-bold mb-2">Бесплатная доставка</h3>
              <p className="text-sm text-gray-600 mb-4">При заказе от 100 BYN. Привезем в течение 2-х часов.</p>
              <img
                alt="Delivery"
                className="w-full rounded-lg"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCNcQznvUtzne59khVGSzAi_qsKBigXdeJAHaM-qOnxq0QHV8dVLTCeenUq05CSK_hxaSz59sBzlLgF6chLEsygSeF0fF_X5hrnExEzBsSW5BE4-IhcR3ddUR1qTxeZoIYEJX4MfrvoCGrN2JDU65h7Izd6_CM9Oi2KctR9XAQzTzCtWIHcK3KAsnaFMc9GqnvfHIO5IO3ONneyb4ZU35VN_Xu4aV_tYl5uiAjfgpCKOGJCc11n6jOrhVoEuo9TMZW19f_Lyfd1sSi2"
              />
            </div>
          </aside>

          {/* Product Grid */}
          <section className="flex-grow" data-purpose="product-grid-section">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
              <div className="flex flex-col gap-2">
                <p className="text-sm text-gray-500">
                  Найдено: {filteredProducts.length} товара(ов) в категории "{categoriesToShow.find((c) => c.id === category)?.label ?? ""}"
                </p>
                <div className="max-w-md">
                  <input
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#52b788] focus:border-transparent"
                    placeholder="Поиск по названию или стране..."
                    type="search"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Сортировать:</span>
                <div className="relative">
                  <select
                    className="sort-select appearance-none bg-white border border-gray-200 hover:border-gray-300 text-sm font-semibold rounded-2xl px-5 py-2.5 pr-12 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#52b788]/30 focus:border-transparent transition-colors"
                    value={sort}
                    onChange={(e) => {
                      const value = e.target.value as typeof sort;
                      setSort(value);
                      setPage(1);
                    }}
                  >
                    <option value="default">По умолчанию</option>
                    <option value="name">По названию</option>
                    <option value="season">По сезону</option>
                  </select>
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {pagedProducts.map((p) => (
                <article
                  key={p.id}
                  className="group bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-xl transition-shadow duration-300"
                >
                  <div className="relative h-64 overflow-hidden bg-gray-100">
                    <img
                      alt={p.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                      src={p.imageUrl}
                    />
                    {p.badge ? (
                      <span
                        className={[
                          "absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-bold",
                          p.badge.className,
                        ].join(" ")}
                      >
                        {p.badge.label}
                      </span>
                    ) : null}
                  </div>
                  <div className="p-6">
                    <h3 className="text-lg font-bold mb-1 group-hover:text-[#52b788] transition-colors">{p.name}</h3>
                    <p className="text-sm text-gray-500 mb-4">Страна: {p.country}</p>
                    <button className="w-full bg-[#f1f8f4] text-[#2d6a4f] py-3 rounded-xl font-bold hover:bg-[#2d6a4f] hover:text-white transition-colors">
                      В корзину
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className="mt-16 w-full lg:col-span-2 flex flex-wrap justify-center items-center gap-2">
            <button
              className="w-10 h-10 rounded-lg hover:bg-gray-100 font-bold disabled:opacity-40"
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
                    "w-10 h-10 rounded-lg font-bold",
                    isActive ? "bg-[#2d6a4f] text-white" : "hover:bg-gray-100",
                  ].join(" ")}
                  onClick={() => setPage(n)}
                  type="button"
                >
                  {n}
                </button>
              );
            })}
            <button
              className="w-10 h-10 rounded-lg hover:bg-gray-100 font-bold disabled:opacity-40"
              disabled={currentPage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              type="button"
            >
              →
            </button>
          </div>
        </div>
      </main>
      {/* END: MainContent */}

      {/* BEGIN: NewsletterCTA */}
      <section className="container mx-auto px-4 mb-24">
        <div className="relative bg-[#1b4332] rounded-[2.5rem] p-8 md:p-16 overflow-hidden text-center">
          <div className="absolute top-0 left-0 w-64 h-64 bg-[#2d6a4f] rounded-full -translate-x-1/2 -translate-y-1/2 opacity-50" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#2d6a4f] rounded-full translate-x-1/4 translate-y-1/4 opacity-30" />
          <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="text-white text-3xl md:text-5xl font-bold mb-6">Готовы попробовать самое свежее?</h2>
            <p className="text-green-100 mb-10 text-lg">Подпишитесь на нашу рассылку и получите скидку 10% на ваш первый заказ!</p>
            <form className="flex flex-col md:flex-row gap-4">
              <input
                className="flex-grow px-6 py-4 rounded-xl focus:ring-2 focus:ring-[#f3722c] border-none text-gray-800"
                placeholder="Ваш e-mail"
                type="email"
              />
              <button
                className="bg-[#f3722c] text-white px-10 py-4 rounded-xl font-bold hover:bg-orange-600 transition-colors whitespace-nowrap"
                type="submit"
              >
                Подписаться
              </button>
            </form>
          </div>
        </div>
      </section>
      {/* END: NewsletterCTA */}

      {/* BEGIN: MainFooter */}
      <footer className="bg-gray-50 pt-20 pb-10">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
            <div>
              <div className="flex items-center space-x-2 mb-6">
                <div className="w-8 h-8 bg-[#2d6a4f] rounded flex items-center justify-center">
                  <span className="text-white font-bold text-xl">G</span>
                </div>
                <span className="font-bold text-xl tracking-tight uppercase">GREENHARVEST</span>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                Мы верим, что качественная еда должна быть доступна каждому. Доставляем здоровье прямо в ваш холодильник.
              </p>
              <div className="flex space-x-4">
                <a
                  className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center hover:bg-[#52b788] hover:text-white transition-colors"
                  href="#"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </a>
                <a
                  className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center hover:bg-[#52b788] hover:text-white transition-colors"
                  href="#"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z" />
                  </svg>
                </a>
              </div>
            </div>

            <div>
              <h3 className="font-bold mb-6 uppercase text-sm tracking-widest">Каталог</h3>
              <ul className="space-y-4 text-gray-600 text-sm">
                <li>
                  <a className="hover:text-[#52b788] transition-colors" href="#">
                    Овощи
                  </a>
                </li>
                <li>
                  <a className="hover:text-[#52b788] transition-colors" href="#">
                    Фрукты
                  </a>
                </li>
                <li>
                  <a className="hover:text-[#52b788] transition-colors" href="#">
                    Зелень и травы
                  </a>
                </li>
                <li>
                  <a className="hover:text-[#52b788] transition-colors" href="#">
                    Ягоды
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold mb-6 uppercase text-sm tracking-widest">О компании</h3>
              <ul className="space-y-4 text-gray-600 text-sm">
                <li>
                  <a className="hover:text-[#52b788] transition-colors" href="#">
                    История бренда
                  </a>
                </li>
                <li>
                  <a className="hover:text-[#52b788] transition-colors" href="#">
                    Наши фермеры
                  </a>
                </li>
                <li>
                  <a className="hover:text-[#52b788] transition-colors" href="#">
                    Условия доставки
                  </a>
                </li>
                <li>
                  <a className="hover:text-[#52b788] transition-colors" href="#">
                    Контакты
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold mb-6 uppercase text-sm tracking-widest">Контакты</h3>
              <ul className="space-y-4 text-gray-600 text-sm">
                <li className="flex items-center space-x-3">
                  <svg className="w-5 h-5 text-[#52b788]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                  <span>8 800 555-35-35</span>
                </li>
                <li className="flex items-center space-x-3">
                  <svg className="w-5 h-5 text-[#52b788]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                  <span>hello@greenharvest.ru</span>
                </li>
                <li className="flex items-start space-x-3">
                  <svg className="w-5 h-5 text-[#52b788] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                  <span>Ежедневно с 8:00 до 22:00</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-8 flex flex-col md:flex-row justify-between items-center text-xs text-gray-500 space-y-4 md:space-y-0">
            <p>© 2026 Зелёный Сад (GreenHarvest). Все права защищены.</p>
            <div className="flex space-x-6">
              <a className="hover:text-[#52b788]" href="#">
                Политика конфиденциальности
              </a>
              <a className="hover:text-[#52b788]" href="#">
                Оферта
              </a>
            </div>
          </div>
        </div>
      </footer>
      {/* END: MainFooter */}
    </div>
  );
}

