import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AdminSuppliers } from "./admin/AdminSuppliers";

const AUTH_KEY = "gh_admin_authed_v1";
const ACCESS_TOKEN_KEY = "gh_admin_access_token_v1";
const REFRESH_TOKEN_KEY = "gh_admin_refresh_token_v1";
// In production we proxy `/api` via nginx (same-origin), so default is empty string.
// In local dev you can set VITE_API_BASE_URL=http://localhost:3001
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const ACTIVE_TAB_KEY = "gh_admin_active_tab_v1";
const CATALOG_CATEGORY_ID_KEY = "gh_admin_catalog_category_id_v1";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DASHBOARD_PRODUCTS_PAGE_SIZE = 10;
const CATALOG_TAB_PAGE_SIZE = 10;

type AdminTab = "dashboard" | "homeCards" | "catalog" | "orders" | "suppliers" | "reports";

const ADMIN_TAB_LABELS: Record<AdminTab, string> = {
  dashboard: "Панель",
  homeCards: "Карточки главной",
  catalog: "Каталог",
  orders: "Заказы",
  suppliers: "Поставщики",
  reports: "Отчёты",
};

type Category = { id: string; name: string };

type Product = {
  id: string;
  name: string;
  country: string;
  price: string | number | null;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  inStock?: boolean;
  popular?: boolean;
  weightValue?: number | null;
  weightUnit?: "kg" | "g" | "pcs" | null;
  badge?: { kind: string; label: string } | null;
};
type HomeCard = {
  slot: number;
  title: string;
  subtitle: string;
  categoryId: string | null;
  categoryName: string | null;
  imageUrl: string | null;
};

type HomeCardDraft = HomeCard & {
  subtitleEnabled: boolean;
};

function isLikelyImageFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  return /\.(heic|heif|jpg|jpeg|png|webp|gif|bmp|avif)$/i.test(file.name);
}

function extractErrorCode(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error.trim();
  } catch {
    // ignore parse failures
  }
  return raw.trim();
}

function getUploadErrorMessage(err: unknown, fallback: string) {
  const code = extractErrorCode(err);
  if (code.includes("file_too_large")) return "Файл слишком большой. Максимум 5 МБ.";
  if (code.includes("invalid_image_type")) return "Можно загрузить только изображение (JPG, PNG, WEBP, HEIC/HEIF).";
  if (code.includes("unsupported_mobile_image_format")) {
    return "Не удалось обработать фото с телефона. Сохраните его как JPG/PNG и загрузите снова.";
  }
  if (code.includes("image_conversion_failed")) return "Не удалось обработать изображение. Попробуйте другой файл.";
  return fallback;
}

/** Превью: только <img>. Fetch с Authorization ломает внешние URL (Wikimedia) из‑за CORS. Эндпоинты картинок публичные. */
function AdminProductImage(props: { src: string | null; alt: string; className?: string }) {
  const { src, alt, className } = props;
  const resolvedSrc = src
    ? src.startsWith("http://") || src.startsWith("https://")
      ? src
      : `${API_BASE_URL}${src}`
    : null;
  if (!resolvedSrc) return null;
  return <img alt={alt} className={className} src={resolvedSrc} />;
}

type PackageUnit = "kg" | "g" | "pcs";
const WEIGHT_UNIT_OPTIONS: Array<{ value: PackageUnit; label: string }> = [
  { value: "g", label: "гр" },
  { value: "kg", label: "кг" },
  { value: "pcs", label: "шт" },
];

function WeightUnitSelect(props: {
  value: PackageUnit;
  onChange: (v: PackageUnit) => void;
  id?: string;
}) {
  const { value, onChange, id } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const updateMenuPos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 6, left: r.left, width: r.width });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPos();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updateMenuPos();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (rootRef.current?.contains(t)) return;
      if (menuPanelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const currentLabel = WEIGHT_UNIT_OPTIONS.find((o) => o.value === value)?.label ?? "гр";

  const menuPanel =
    open && menuPos
      ? createPortal(
          <div
            ref={menuPanelRef}
            className="fixed z-[100020] flex flex-col overflow-hidden rounded-2xl border border-[#1f642e]/10 bg-white/95 p-0 shadow-xl shadow-[#1f642e]/15 backdrop-blur-md dark:border-slate-600 dark:bg-slate-900/95"
            id={listId}
            role="listbox"
            style={{
              top: menuPos.top,
              left: menuPos.left,
              minWidth: menuPos.width,
            }}
          >
            {WEIGHT_UNIT_OPTIONS.map((o, i) => {
              const active = value === o.value;
              const isFirst = i === 0;
              const isLast = i === WEIGHT_UNIT_OPTIONS.length - 1;
              return (
                <button
                  key={o.value}
                  className={[
                    "flex w-full items-center px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                    isFirst ? "rounded-t-2xl" : "",
                    isLast ? "rounded-b-2xl" : "",
                    active
                      ? "bg-[#1f642e] text-white"
                      : "text-[#1a1c1a] hover:bg-[#e7e9e5] dark:text-slate-100 dark:hover:bg-slate-700",
                  ].join(" ")}
                  role="option"
                  type="button"
                  aria-selected={active}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative shrink-0 w-[5.5rem]">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-label="Единица веса"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        className={[
          "flex w-full cursor-pointer items-center justify-between gap-1 rounded-xl border border-[#1f642e]/25 bg-[#f9faf6]/80 px-2.5 py-2.5 text-sm font-semibold text-[#1a1c1a] shadow-sm backdrop-blur-sm transition-colors",
          "hover:border-[#1f642e]/45 hover:bg-white/90",
          "focus:border-[#1f642e]/50 focus:outline-none focus:ring-2 focus:ring-[#1f642e]/20",
          "dark:border-[#1f642e]/35 dark:bg-slate-800/90 dark:text-slate-100 dark:hover:border-[#1f642e]/50",
        ].join(" ")}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{currentLabel}</span>
        <svg
          className={[
            "h-4 w-4 shrink-0 text-[#707a6e] transition-transform duration-200",
            open ? "rotate-180" : "rotate-0",
          ].join(" ")}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.24 4.5a.75.75 0 0 1-1.08 0l-4.24-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {menuPanel}
    </div>
  );
}

function IconLeaf(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20 3c-8 1-13 6-14 14m0 0c0 2 0 4 2 4 5 0 10-6 12-18-2 0-5 0-8 1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 17c2 0 4-.5 6-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconGrid(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" fill="currentColor" />
    </svg>
  );
}

function IconImageStack(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M8 10h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m3 16 4-4 3 3 2-2 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M17 8h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBox(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21 8l-9 5-9-5m18 0-9-5-9 5m18 0v10l-9 5-9-5V8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCart(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6h15l-2 9H7L6 6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M6 6 5 3H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconUsers(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z" stroke="currentColor" strokeWidth="2" />
      <path d="M4 21a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconChart(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 19V5m0 14h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 15v-4m4 4V7m4 8v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconSearch(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z" stroke="currentColor" strokeWidth="2" />
      <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconLogout(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M10 7V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M15 12H3m0 0 3-3m-3 3 3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUpload(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 16V4m0 0 4 4m-4-4-4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 16v4h16v-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPlusCircle(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8v8m4-4H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconGlobe(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" stroke="currentColor" strokeWidth="2" />
      <path d="M2 12h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M12 2c3 3.5 3 16.5 0 20-3-3.5-3-16.5 0-20Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPencil(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M6 6l1 16h10l1-16" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 11v6m4-6v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconHelp(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 18h.01M9.5 9a2.5 2.5 0 1 1 4 2c-.9.6-1.5 1.1-1.5 2v.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconPlant(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M12 14c-5 0-8-3.5-8-8 4.5 0 8 3 8 8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M12 14c5 0 8-3.5 8-8-4.5 0-8 3-8 8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M7 21h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconArrowBack(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getIsAuthed(): boolean {
  try {
    return sessionStorage.getItem(AUTH_KEY) === "1";
  } catch {
    return false;
  }
}

function setAuthed(value: boolean) {
  try {
    sessionStorage.setItem(AUTH_KEY, value ? "1" : "0");
  } catch {
    // ignore
  }
}

function parseAdminTab(value: string | null): AdminTab | null {
  switch (value) {
    case "dashboard":
    case "homeCards":
    case "catalog":
    case "orders":
    case "suppliers":
    case "reports":
      return value;
    default:
      return null;
  }
}

function getSavedActiveTab(): AdminTab {
  try {
    const parsed = parseAdminTab(sessionStorage.getItem(ACTIVE_TAB_KEY));
    return parsed ?? "dashboard";
  } catch {
    return "dashboard";
  }
}

function setSavedActiveTab(value: AdminTab) {
  try {
    sessionStorage.setItem(ACTIVE_TAB_KEY, value);
  } catch {
    // ignore
  }
}

function getSavedCatalogCategoryIds(): string[] {
  try {
    const raw = sessionStorage.getItem(CATALOG_CATEGORY_ID_KEY) ?? "";
    if (!raw) return [];
    // Backward compatibility: old version stored a single string id.
    if (!raw.startsWith("[")) return [raw];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function setSavedCatalogCategoryIds(value: string[]) {
  try {
    if (!value.length) sessionStorage.removeItem(CATALOG_CATEGORY_ID_KEY);
    else sessionStorage.setItem(CATALOG_CATEGORY_ID_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function getToken(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setToken(key: string, value: string | null) {
  try {
    if (!value) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function decodeJwtPayload(token: string): { exp?: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    return JSON.parse(json) as { exp?: number };
  } catch {
    return null;
  }
}

/** Подсказка по сроку без проверки подписи — чтобы не дергать /verify с истёкшим токеном (лишний 401 в консоли). */
function isAccessTokenExpired(token: string): boolean {
  const p = decodeJwtPayload(token);
  if (!p || typeof p.exp !== "number") return true;
  return p.exp * 1000 <= Date.now();
}

export default function Admin() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Админ панель";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const navigate = useNavigate();
  const [isAuthed, setIsAuthed] = useState(getIsAuthed);
  const [activeTab, setActiveTab] = useState<AdminTab>(() => getSavedActiveTab());
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [loginHelpOpen, setLoginHelpOpen] = useState(false);

  useEffect(() => {
    if (!loginHelpOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLoginHelpOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loginHelpOpen]);

  useEffect(() => {
    const link =
      document.querySelector<HTMLLinkElement>('link[rel="icon"]') ??
      (() => {
        const el = document.createElement("link");
        el.rel = "icon";
        document.head.appendChild(el);
        return el;
      })();
    const prevHref = link.getAttribute("href");
    const prevType = link.getAttribute("type");
    const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    link.href = `${base}admin-favicon.svg`;
    link.type = "image/svg+xml";
    return () => {
      if (prevHref != null) link.setAttribute("href", prevHref);
      else link.removeAttribute("href");
      if (prevType != null) link.setAttribute("type", prevType);
      else link.removeAttribute("type");
    };
  }, []);

  const [categories, setCategories] = useState<Category[]>([]);
  const [dashboardProducts, setDashboardProducts] = useState<Product[]>([]);
  const [dashboardProductsTotal, setDashboardProductsTotal] = useState(0);
  const [dashboardProductsPage, setDashboardProductsPage] = useState(1);
  const [dashboardProductsSearch, setDashboardProductsSearch] = useState("");
  const [debouncedDashboardSearch, setDebouncedDashboardSearch] = useState("");
  const [isLoadingDashboardProducts, setIsLoadingDashboardProducts] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [catalogProductsTotal, setCatalogProductsTotal] = useState(0);
  const [catalogProductsPage, setCatalogProductsPage] = useState(1);
  const [catalogCategoryIds, setCatalogCategoryIds] = useState<string[]>(() => getSavedCatalogCategoryIds());
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const [draftCategoryIds, setDraftCategoryIds] = useState<string[]>(() => getSavedCatalogCategoryIds());
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [catalogProductSearchQuery, setCatalogProductSearchQuery] = useState("");
  const [debouncedCatalogProductSearch, setDebouncedCatalogProductSearch] = useState("");
  const [highlightProductId, setHighlightProductId] = useState<string | null>(null);
  const [highlightCategoryId, setHighlightCategoryId] = useState<string | null>(null);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchCategories, setSearchCategories] = useState<Category[]>([]);
  const [searchProducts, setSearchProducts] = useState<
    Array<{ id: string; name: string; country: string; price: string | number | null; categoryId: string | null; categoryName: string | null }>
  >([]);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState<string>("");
  const [isUpdatingCategory, setIsUpdatingCategory] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);
  const [categoryIdForNewProduct, setCategoryIdForNewProduct] = useState<string>("");
  const [newProductName, setNewProductName] = useState("");
  const [newProductCountry, setNewProductCountry] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductImageFile, setNewProductImageFile] = useState<File | null>(null);
  const [newProductImagePreviewUrl, setNewProductImagePreviewUrl] = useState<string | null>(null);
  const [newProductSeasonal, setNewProductSeasonal] = useState(false);
  const [newProductPopular, setNewProductPopular] = useState(false);
  const [newProductWeightValue, setNewProductWeightValue] = useState("");
  const [newProductWeightUnit, setNewProductWeightUnit] = useState<PackageUnit>("g");
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editProductName, setEditProductName] = useState("");
  const [editProductCountry, setEditProductCountry] = useState("");
  const [editProductPrice, setEditProductPrice] = useState("");
  const [editProductCategoryId, setEditProductCategoryId] = useState("");
  const [editProductWeightValue, setEditProductWeightValue] = useState("");
  const [editProductWeightUnit, setEditProductWeightUnit] = useState<PackageUnit>("g");
  const [editProductSeasonal, setEditProductSeasonal] = useState(false);
  const [editProductPopular, setEditProductPopular] = useState(false);
  const [editProductInStock, setEditProductInStock] = useState(true);
  const [isSavingProductEdit, setIsSavingProductEdit] = useState(false);

  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);
  const [homeCards, setHomeCards] = useState<HomeCardDraft[]>([]);
  const [isLoadingHomeCards, setIsLoadingHomeCards] = useState(false);
  const [savingHomeCardSlot, setSavingHomeCardSlot] = useState<number | null>(null);
  const [uploadingHomeCardSlot, setUploadingHomeCardSlot] = useState<number | null>(null);
  const [homeCardSaveNotice, setHomeCardSaveNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const profileImageUrl = useMemo(
    () =>
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCsqX2_oD_7ONkke1QZMffSv39drHqfeL2krnw2o5K_keeiJFLaBkuQ-Vo88KKOU6CVRQ1ppMQ3y_7JTxzRKKHirjLdY8XB0JJZ_OGOb4iEEZzGQfkcistWHQXdp58yK-EFLexDPdlJnQiTLAAWGpsgi3UwzLZxCPvCrtYnc7MLqI2lxZwvnlhcHTgmfe5wv20EK5mVMH--5irtIjtMLA_Lf6IynDvm0mJIlNU3OVePF4yi3k4N70xXwr9yWqqiH-xxz3qJA98BM5my",
    [],
  );

  useEffect(() => {
    // При логауте сбрасываем состояние на дефолт.
    // При F5 (когда isAuthed становится true) мы НЕ должны перетирать выбранную вкладку.
    if (!isAuthed && !isCheckingAuth) setActiveTab("dashboard");
  }, [isAuthed, isCheckingAuth]);

  useEffect(() => {
    setSavedActiveTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    setSavedCatalogCategoryIds(catalogCategoryIds);
    setDraftCategoryIds(catalogCategoryIds);
  }, [catalogCategoryIds]);

  useEffect(() => {
    if (catalogProductSearchQuery === "") {
      setDebouncedCatalogProductSearch("");
      return;
    }
    const t = window.setTimeout(() => setDebouncedCatalogProductSearch(catalogProductSearchQuery), 300);
    return () => window.clearTimeout(t);
  }, [catalogProductSearchQuery]);

  const doLogout = () => {
    setToken(ACCESS_TOKEN_KEY, null);
    setToken(REFRESH_TOKEN_KEY, null);
    setAuthed(false);
    setIsAuthed(false);
    setLogin("");
    setPassword("");
    setError(null);
  };

  const refreshAccessToken = async (): Promise<string | null> => {
    const refreshToken = getToken(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}/api/admin/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      return null;
    }
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; accessToken?: string };
    if (data.ok !== true || typeof data.accessToken !== "string") return null;
    setToken(ACCESS_TOKEN_KEY, data.accessToken);
    return data.accessToken;
  };

  const adminFetchJson = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const accessToken = getToken(ACCESS_TOKEN_KEY);
    if (!accessToken) throw new Error("missing_access_token");

    const doRequest = async (token: string) => {
      const headers = new Headers(init?.headers ?? {});
      headers.set("Authorization", `Bearer ${token}`);
      let res: Response;
      try {
        res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
      } catch {
        return { kind: "unauthorized" as const };
      }
      if (res.status === 401) return { kind: "unauthorized" as const };
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `http_${res.status}`);
      }
      return { kind: "ok" as const, json: (await res.json()) as T };
    };

    const first = await doRequest(accessToken);
    if (first.kind === "ok") return first.json;

    const next = await refreshAccessToken();
    if (!next) {
      doLogout();
      throw new Error("unauthorized");
    }

    const second = await doRequest(next);
    if (second.kind === "ok") return second.json;
    doLogout();
    throw new Error("unauthorized");
  };

  const authorizedFetch = async (path: string, init?: RequestInit): Promise<Response> => {
    const accessToken = getToken(ACCESS_TOKEN_KEY);
    if (!accessToken) throw new Error("missing_access_token");

    const doRequest = async (token: string) => {
      const headers = new Headers(init?.headers ?? {});
      headers.set("Authorization", `Bearer ${token}`);
      return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
    };

    let res = await doRequest(accessToken);
    if (res.status !== 401) return res;

    const next = await refreshAccessToken();
    if (!next) {
      doLogout();
      throw new Error("unauthorized");
    }
    res = await doRequest(next);
    if (res.status === 401) {
      doLogout();
      throw new Error("unauthorized");
    }
    return res;
  };

  const loadCategories = async () => {
    const data = await adminFetchJson<{ ok: boolean; items: Category[] }>("/api/categories");
    setCategories(data.items);
    if (!categoryIdForNewProduct && data.items[0]?.id) {
      setCategoryIdForNewProduct(data.items[0].id);
    }
  };

  const updateCategory = async (id: string, name: string) => {
    setIsUpdatingCategory(true);
    try {
      await adminFetchJson<{ ok: boolean; item: Category }>(`/api/categories/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      await loadCategories();
    } finally {
      setIsUpdatingCategory(false);
    }
  };

  const deleteCategory = async (id: string) => {
    setIsDeletingCategory(true);
    try {
      await adminFetchJson<{ ok: boolean }>(`/api/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
      await loadCategories();
      const nextIds = catalogCategoryIds.filter((x) => x !== id);
      if (nextIds.length !== catalogCategoryIds.length) setCatalogCategoryIds(nextIds);
      await loadCatalogProducts(nextIds, 1, debouncedCatalogProductSearch);
    } finally {
      setIsDeletingCategory(false);
    }
  };

  const loadDashboardProducts = async (page: number, qRaw: string) => {
    const trimmed = qRaw.trim();
    setIsLoadingDashboardProducts(true);
    try {
      let targetPage = Math.max(1, page);
      for (let attempt = 0; attempt < 12; attempt++) {
        const params = new URLSearchParams();
        params.set("page", String(targetPage));
        params.set("pageSize", String(DASHBOARD_PRODUCTS_PAGE_SIZE));
        if (trimmed) params.set("q", trimmed);
        const data = await adminFetchJson<{ items?: Product[]; total?: number }>(`/api/products?${params.toString()}`);
        const items = data.items ?? [];
        const total = typeof data.total === "number" ? data.total : 0;
        const pageCount = Math.max(1, Math.ceil(total / DASHBOARD_PRODUCTS_PAGE_SIZE));
        if (targetPage > pageCount) {
          targetPage = pageCount;
          continue;
        }
        if (items.length === 0 && targetPage > 1 && total > 0) {
          targetPage -= 1;
          continue;
        }
        setDashboardProducts(items);
        setDashboardProductsTotal(total);
        setDashboardProductsPage(targetPage);
        return;
      }
      setDashboardProducts([]);
      setDashboardProductsTotal(0);
      setDashboardProductsPage(1);
    } catch {
      setDashboardProducts([]);
      setDashboardProductsTotal(0);
    } finally {
      setIsLoadingDashboardProducts(false);
    }
  };

  useEffect(() => {
    if (dashboardProductsSearch === "") {
      setDebouncedDashboardSearch("");
      return;
    }
    const t = window.setTimeout(() => setDebouncedDashboardSearch(dashboardProductsSearch), 300);
    return () => window.clearTimeout(t);
  }, [dashboardProductsSearch]);

  useEffect(() => {
    if (!isAuthed) return;
    if (isCheckingAuth) return;
    void loadDashboardProducts(1, debouncedDashboardSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- перезагрузка списка только при смене поиска/авторизации
  }, [isAuthed, isCheckingAuth, debouncedDashboardSearch]);

  const loadHomeCards = async () => {
    setIsLoadingHomeCards(true);
    try {
      const data = await adminFetchJson<{ ok: boolean; items: HomeCard[] }>("/api/admin/home-cards");
      const rows = [...(data.items ?? [])].sort((a, b) => Number(a.slot) - Number(b.slot));
      setHomeCards(
        rows.map((c) => ({
          ...c,
          // Normalize to keep inputs controlled (no undefined/null).
          title: typeof c.title === "string" ? c.title : "",
          subtitle: typeof c.subtitle === "string" ? c.subtitle : "",
          subtitleEnabled: Boolean(typeof c.subtitle === "string" && c.subtitle.trim()),
        })),
      );
    } finally {
      setIsLoadingHomeCards(false);
    }
  };

  const saveHomeCard = async (card: HomeCardDraft) => {
    setSavingHomeCardSlot(card.slot);
    try {
      await adminFetchJson<{ ok: boolean; item: HomeCard }>(`/api/admin/home-cards/${card.slot}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: card.title,
          subtitle: card.subtitleEnabled ? card.subtitle : "",
          categoryId: card.categoryId,
        }),
      });
      await loadHomeCards().catch(() => {});
    } finally {
      setSavingHomeCardSlot(null);
    }
  };

  const uploadHomeCardImage = async (slot: number, file: File) => {
    if (file.size > MAX_IMAGE_BYTES) throw new Error("file_too_large");
    if (!isLikelyImageFile(file)) throw new Error("invalid_image_type");
    setUploadingHomeCardSlot(slot);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await authorizedFetch(`/api/admin/home-cards/${slot}/image`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `http_${res.status}`);
      }
      const data = (await res.json()) as { ok?: boolean; item?: HomeCard };
      if (data.ok === true && data.item) {
        setHomeCards((prev) =>
          prev.map((c) => (c.slot === slot ? { ...c, imageUrl: data.item!.imageUrl } : c)),
        );
      } else {
        await loadHomeCards();
      }
    } finally {
      setUploadingHomeCardSlot(null);
    }
  };

  const loadCatalogProducts = async (categoryIds: string[] | undefined, page: number, qRaw: string) => {
    const ids = categoryIds ?? [];
    const trimmed = qRaw.trim();
    setIsLoadingCatalog(true);
    try {
      let targetPage = Math.max(1, page);
      for (let attempt = 0; attempt < 12; attempt++) {
        const params = new URLSearchParams();
        params.set("page", String(targetPage));
        params.set("pageSize", String(CATALOG_TAB_PAGE_SIZE));
        if (ids.length === 1) {
          params.set("categoryId", ids[0]);
        } else if (ids.length > 1) {
          params.set("categoryId", ids.join(","));
        }
        if (trimmed) params.set("q", trimmed);
        const data = await adminFetchJson<{ items?: Product[]; total?: number }>(`/api/products?${params.toString()}`);
        const items = data.items ?? [];
        const total = typeof data.total === "number" ? data.total : 0;
        const pageCount = Math.max(1, Math.ceil(total / CATALOG_TAB_PAGE_SIZE));
        if (targetPage > pageCount) {
          targetPage = pageCount;
          continue;
        }
        if (items.length === 0 && targetPage > 1 && total > 0) {
          targetPage -= 1;
          continue;
        }
        setCatalogProducts(items);
        setCatalogProductsTotal(total);
        setCatalogProductsPage(targetPage);
        return;
      }
      setCatalogProducts([]);
      setCatalogProductsTotal(0);
      setCatalogProductsPage(1);
    } catch {
      setCatalogProducts([]);
      setCatalogProductsTotal(0);
    } finally {
      setIsLoadingCatalog(false);
    }
  };

  const openProductEdit = (p: Product) => {
    setError(null);
    setEditingProduct(p);
    setEditProductName(p.name);
    setEditProductCountry(p.country);
    setEditProductPrice(p.price === null || p.price === undefined || p.price === "" ? "" : String(p.price));
    setEditProductCategoryId(p.categoryId ?? "");
    const wv = p.weightValue;
    setEditProductWeightValue(
      wv !== null && wv !== undefined && Number.isFinite(Number(wv)) ? String(wv) : "",
    );
    setEditProductWeightUnit(p.weightUnit === "kg" || p.weightUnit === "pcs" ? p.weightUnit : "g");
    setEditProductSeasonal(p.badge?.kind === "seasonal");
    setEditProductPopular(p.popular === true);
    setEditProductInStock(p.inStock !== false);
  };

  const saveProductEdit = async () => {
    if (!editingProduct) return;
    const name = editProductName.trim();
    const country = editProductCountry.trim();
    if (!name || !country) {
      setError("Заполните название и страну.");
      return;
    }
    setIsSavingProductEdit(true);
    setError(null);
    try {
      const categoryId = editProductCategoryId.trim() || null;
      const priceStr = editProductPrice.trim();
      const body: Record<string, unknown> = {
        name,
        country,
        categoryId,
        price: priceStr ? Number.parseFloat(priceStr) : null,
        inStock: editProductInStock,
      };
      if (editProductSeasonal) {
        body.badgeKind = "seasonal";
        body.badgeLabel = "СЕЗОННОЕ";
      } else {
        body.badgeKind = null;
        body.badgeLabel = null;
      }
      body.popular = editProductPopular;
      const wTrim = editProductWeightValue.trim();
      if (wTrim) {
        body.weightValue = Number.parseFloat(wTrim.replace(",", "."));
        body.weightUnit = editProductWeightUnit;
      } else {
        body.weightValue = null;
        body.weightUnit = null;
      }
      await adminFetchJson<Product>(`/api/products/${encodeURIComponent(editingProduct.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setEditingProduct(null);
      await loadDashboardProducts(dashboardProductsPage, debouncedDashboardSearch);
      await loadCatalogProducts(catalogCategoryIds, catalogProductsPage, debouncedCatalogProductSearch);
    } catch {
      setError("Не удалось сохранить товар.");
    } finally {
      setIsSavingProductEdit(false);
    }
  };

  const confirmDeleteProduct = async () => {
    if (!deletingProductId) return;
    setIsDeletingProduct(true);
    setError(null);
    try {
      await adminFetchJson<{ ok: boolean }>(`/api/products/${encodeURIComponent(deletingProductId)}`, {
        method: "DELETE",
      });
      setDeletingProductId(null);
      await loadDashboardProducts(dashboardProductsPage, debouncedDashboardSearch);
      await loadCatalogProducts(catalogCategoryIds, catalogProductsPage, debouncedCatalogProductSearch);
    } catch {
      setError("Не удалось удалить товар.");
    } finally {
      setIsDeletingProduct(false);
    }
  };

  useEffect(() => {
    if (!highlightProductId) return;
    const id = highlightProductId;
    const t = window.setTimeout(() => {
      setHighlightProductId((v) => (v === id ? null : v));
    }, 2500);
    return () => window.clearTimeout(t);
  }, [highlightProductId]);

  useEffect(() => {
    if (!highlightCategoryId) return;
    const id = highlightCategoryId;
    const t = window.setTimeout(() => {
      setHighlightCategoryId((v) => (v === id ? null : v));
    }, 2500);
    return () => window.clearTimeout(t);
  }, [highlightCategoryId]);

  useEffect(() => {
    if (!newProductImageFile) {
      setNewProductImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(newProductImageFile);
    setNewProductImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [newProductImageFile]);

  useEffect(() => {
    if (!isAuthed) return;
    if (isCheckingAuth) return;
    void loadCategories().catch(() => {});
    void loadHomeCards().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, isCheckingAuth]);

  useEffect(() => {
    if (!isAuthed) return;
    if (isCheckingAuth) return;
    if (activeTab !== "catalog") return;
    void loadCatalogProducts(catalogCategoryIds, 1, debouncedCatalogProductSearch).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, catalogCategoryIds, debouncedCatalogProductSearch, isAuthed, isCheckingAuth]);

  useEffect(() => {
    if (!isAuthed) return;
    if (isCheckingAuth) return;
    if (!isSearchOpen) return;

    const q = searchQuery.trim();
    if (!q) {
      setSearchCategories([]);
      setSearchProducts([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const data = await adminFetchJson<{
            ok: boolean;
            categories: Category[];
            products: Array<{
              id: string;
              name: string;
              country: string;
              price: string | number | null;
              categoryId: string | null;
              categoryName: string | null;
            }>;
          }>(`/api/admin/search?q=${encodeURIComponent(q)}`);
          setSearchCategories(data.categories ?? []);
          setSearchProducts(data.products ?? []);
        } catch {
          setSearchCategories([]);
          setSearchProducts([]);
        } finally {
          setIsSearching(false);
        }
      })();
    }, 300);

    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearchOpen, isAuthed, searchQuery]);

  useEffect(() => {
    let cancelled = false;

    const verify = async (accessToken: string) => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/verify`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { ok?: boolean };
        return data.ok === true;
      } catch {
        return false;
      }
    };

    const refresh = async (refreshToken: string) => {
      let res: Response;
      try {
        res = await fetch(`${API_BASE_URL}/api/admin/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        return null;
      }
      if (!res.ok) return null;
      const data = (await res.json()) as { ok?: boolean; accessToken?: string };
      if (data.ok !== true || typeof data.accessToken !== "string") return null;
      return data.accessToken;
    };

    const run = async () => {
      setIsCheckingAuth(true);
      try {
        const accessToken = getToken(ACCESS_TOKEN_KEY);
        const refreshToken = getToken(REFRESH_TOKEN_KEY);

        if (accessToken && !isAccessTokenExpired(accessToken) && (await verify(accessToken))) {
          if (cancelled) return;
          setAuthed(true);
          setIsAuthed(true);
          return;
        }

        if (refreshToken) {
          const nextAccess = await refresh(refreshToken);
          if (nextAccess) {
            if (cancelled) return;
            setToken(ACCESS_TOKEN_KEY, nextAccess);
            setAuthed(true);
            setIsAuthed(true);
            return;
          }
        }

        if (cancelled) return;
        setToken(ACCESS_TOKEN_KEY, null);
        setToken(REFRESH_TOKEN_KEY, null);
        setAuthed(false);
        setIsAuthed(false);
      } finally {
        if (cancelled) return;
        setIsCheckingAuth(false);
      }
    };

    void run().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const dashboardPageCount = Math.max(1, Math.ceil(dashboardProductsTotal / DASHBOARD_PRODUCTS_PAGE_SIZE));
  const catalogPageCount = Math.max(1, Math.ceil(catalogProductsTotal / CATALOG_TAB_PAGE_SIZE));

  if (!isAuthed) {
    const verdantMeshBg: React.CSSProperties = {
      backgroundColor: "#f7fbf1",
      backgroundImage: [
        "radial-gradient(at 0% 0%, rgba(13, 96, 27, 0.05) 0px, transparent 50%)",
        "radial-gradient(at 100% 0%, rgba(202, 236, 194, 0.2) 0px, transparent 50%)",
        "radial-gradient(at 100% 100%, rgba(13, 96, 27, 0.03) 0px, transparent 50%)",
        "radial-gradient(at 0% 100%, rgba(202, 236, 194, 0.15) 0px, transparent 50%)",
        "radial-gradient(at 50% 50%, rgba(255, 255, 255, 0.5) 0px, transparent 50%)",
      ].join(", "),
    };

    return (
      <div className="h-screen overflow-hidden relative text-[#181d17] font-display" style={verdantMeshBg}>
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          {/* Soft background circles (as in mock) */}
          <div className="absolute -top-24 -right-24 w-[520px] h-[520px] rounded-full bg-[#0d601b]/10" />
          <div className="absolute -bottom-24 -left-24 w-[520px] h-[520px] rounded-full bg-[#486645]/10" />

          {/* Organic blobs (from 1-admin.txt) */}
          <svg
            className="absolute top-[-10%] right-[-5%] w-[60%] h-[60%] opacity-[0.07] text-[#0d601b] animate-[float_20s_ease-in-out_infinite]"
            viewBox="0 0 200 200"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,77.3,-44.7C85.4,-31.3,90.5,-15.7,91.2,0.4C91.9,16.5,88.3,33,79.8,47.1C71.3,61.2,57.9,72.9,42.7,80.4C27.5,87.9,10.5,91.2,-6.1,91.8C-22.7,92.4,-38.9,90.3,-53.2,82.4C-67.5,74.5,-79.9,60.8,-87.4,45.2C-94.9,29.6,-97.5,12.1,-95.1,-4.1C-92.7,-20.3,-85.3,-35.2,-74.8,-47.9C-64.3,-60.6,-50.7,-71.1,-36.4,-77.8C-22.1,-84.5,-7.1,-87.4,8.1,-88.8C23.3,-90.2,31.3,-83.6,44.7,-76.4Z"
              fill="currentColor"
              transform="translate(100 100)"
            />
          </svg>
          <svg
            className="absolute bottom-[-15%] left-[-10%] w-[70%] h-[70%] opacity-[0.04] text-[#486645] animate-[float_20s_ease-in-out_infinite]"
            style={{ animationDelay: "-5s" }}
            viewBox="0 0 200 200"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M37.5,-64.7C48.4,-57.8,56.9,-46.8,63.6,-34.8C70.3,-22.8,75.2,-9.8,74.9,3.1C74.6,16,69.1,28.8,60.9,39.6C52.7,50.4,41.8,59.2,29.4,65.3C17,71.4,3,74.8,-11.5,73.6C-26,72.4,-41,66.6,-52.8,56.7C-64.6,46.8,-73.2,32.8,-76.9,17.7C-80.6,2.6,-79.4,-13.6,-72.7,-27.4C-66,-41.2,-53.8,-52.6,-40.4,-58.5C-27,-64.4,-12.4,-64.8,1.1,-66.7C14.6,-68.6,26.6,-71.6,37.5,-64.7Z"
              fill="currentColor"
              transform="translate(100 100)"
            />
          </svg>
        </div>

        <header className="fixed top-0 w-full flex justify-between items-center px-6 sm:px-8 h-16 bg-transparent z-50">
          <button
            className="flex items-center gap-2 rounded-xl py-1.5 pl-1 pr-2 -ml-1 text-left text-[#0d601b] outline-none transition-colors hover:bg-white/45 focus-visible:ring-2 focus-visible:ring-[#0d601b]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            type="button"
            aria-label="Обновить страницу админ-панели"
            onClick={() => window.location.reload()}
          >
            <span className="flex items-center justify-center rounded-xl bg-[#0d601b] p-1.5 text-white">
              <IconPlant className="h-5 w-5" />
            </span>
            <span className="text-xl font-bold tracking-tight">Админ панель</span>
          </button>
          <div className="flex items-center gap-4">
            <button
              className="text-[#40493d] hover:bg-white/50 transition-colors p-2 rounded-full active:scale-95 duration-200"
              type="button"
              aria-label="Помощь"
              aria-expanded={loginHelpOpen}
              aria-haspopup="dialog"
              aria-controls="admin-login-help-dialog"
              onClick={() => setLoginHelpOpen(true)}
            >
              <IconHelp className="w-6 h-6" />
            </button>
          </div>
        </header>

        <main
          className="flex items-center justify-center px-4 py-2 sm:px-6"
          style={{ height: "calc(100vh - 8rem)" }}
        >
          <div
            className={[
              "w-[min(480px,92vw)]",
              "px-6 pt-6 pb-7 sm:px-9 sm:pt-8 sm:pb-9",
              "rounded-[2.5rem]",
              "shadow-[0_40px_100px_rgba(13,96,27,0.08)]",
              "flex flex-col items-center",
              "border border-white/40 bg-white/70 backdrop-blur-[24px]",
            ].join(" ")}
          >
            <div className="mb-5 text-center sm:mb-6">
              <div className="bg-[#0d601b]/10 mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-[#0d601b] sm:mb-4 sm:h-16 sm:w-16">
                <IconPlant className="h-8 w-8 sm:h-9 sm:w-9" />
              </div>
              <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-[#181d17] sm:mb-2 sm:text-3xl">Админ-панель Миксголдфрукт</h1>
              <p className="text-sm text-[#40493d] sm:text-base">Введите логин и пароль</p>
            </div>

            <form
              className="w-full space-y-4 sm:space-y-5"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);

                try {
                  const res = await fetch(`${API_BASE_URL}/api/admin/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login: login.trim(), password }),
                  });

                  if (!res.ok) {
                    setError("Неверный логин или пароль.");
                    return;
                  }

                  const data = (await res.json()) as { ok?: boolean; accessToken?: string; refreshToken?: string };
                  if (data.ok !== true || typeof data.accessToken !== "string" || typeof data.refreshToken !== "string") {
                    setError("Ошибка входа. Попробуйте ещё раз.");
                    return;
                  }

                  setToken(ACCESS_TOKEN_KEY, data.accessToken);
                  setToken(REFRESH_TOKEN_KEY, data.refreshToken);
                  setLoginHelpOpen(false);
                  setAuthed(true);
                  setIsAuthed(true);
                } catch {
                  setError("Сервер недоступен. Запустите сервер и попробуйте ещё раз.");
                }
              }}
            >
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-[#40493d] ml-1">Логин</label>
                <input
                  autoComplete="username"
                  className="w-full rounded-xl border border-[#c0c9ba]/30 bg-white/50 px-4 py-3 text-[#181d17] transition-all duration-300 placeholder:text-[#707a6c] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0d601b] sm:px-5 sm:py-3.5"
                  placeholder="Введите ваш логин"
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-[#40493d] ml-1">Пароль</label>
                <input
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-[#c0c9ba]/30 bg-white/50 px-4 py-3 text-[#181d17] transition-all duration-300 placeholder:text-[#707a6c] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0d601b] sm:px-5 sm:py-3.5"
                  placeholder="Введите пароль"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-800">
                  {error}
                </div>
              ) : null}

              <button
                className="mt-2 w-full rounded-xl bg-[linear-gradient(135deg,#0d601b_0%,#2d7931_100%)] py-3.5 text-base font-bold text-white shadow-lg shadow-[#0d601b]/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 sm:mt-3 sm:py-4 sm:text-lg"
                disabled={isCheckingAuth}
                type="submit"
              >
                Войти
              </button>
            </form>

            <div className="mt-5 flex w-full shrink-0 flex-col items-center gap-3 sm:mt-6 sm:gap-4">
              <button
                className="text-[#0d601b] font-medium hover:bg-[#0d601b]/5 px-4 py-2 rounded-lg transition-colors text-sm"
                onClick={() => {
                  setLogin("");
                  setPassword("");
                  setError(null);
                }}
                type="button"
              >
                Очистить
              </button>
              <div className="h-px w-full max-w-[min(100%,20rem)] shrink-0 bg-[#c0c9ba]/25" />
              <button
                className="group inline-flex min-h-[2.75rem] w-full max-w-[19rem] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-center text-sm font-semibold text-[#40493d] transition-colors hover:bg-[#f3f6f1] hover:text-[#0d601b] active:scale-[0.99] sm:min-h-[3rem] sm:gap-2.5 sm:py-3"
                type="button"
                onClick={() => navigate("/")}
              >
                <IconArrowBack className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5" />
                <span className="leading-tight">Назад на главную</span>
              </button>
            </div>
          </div>
        </main>

        {loginHelpOpen ? (
          <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center sm:p-6" role="presentation">
            <button
              type="button"
              aria-label="Закрыть помощь"
              className="absolute inset-0 bg-[#1a1c1a]/40 backdrop-blur-[2px] motion-reduce:backdrop-blur-none"
              onClick={() => setLoginHelpOpen(false)}
            />
            <div
              id="admin-login-help-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-login-help-title"
              className="relative z-10 w-full max-w-md rounded-2xl border border-[#c0c9ba]/30 bg-white/95 p-6 shadow-2xl sm:p-8"
            >
              <h2 id="admin-login-help-title" className="text-lg font-bold text-[#181d17]">
                Помощь
              </h2>
              <div className="mt-4 space-y-4 text-sm leading-relaxed text-[#40493d]">
                <p>
                  Эта страница — <strong className="text-[#181d17]">только для сотрудников магазина</strong>. Здесь настраивают
                  каталог и заказы. Если вы просто хотите заказать овощи и фрукты, вернитесь на главный сайт — кнопка
                  «Назад на главную» внизу формы.
                </p>
                <p>
                  Логин и пароль для входа вам выдаёт <strong className="text-[#181d17]">тот, кто ведёт сайт или магазин</strong>
                  (руководитель, администратор). Без этих данных войти нельзя — мы не присылаем пароль по телефону или почте
                  автоматически.
                </p>
                <p>
                  Пишет, что <strong className="text-[#181d17]">логин или пароль неверный</strong>? Проверьте, что не включён
                  Caps Lock и что выбрана правильная раскладка клавиатуры (русская/английская). Если всё равно не пускает —
                  попросите новый пароль у того, кто вас подключает к админке.
                </p>
                <p>
                  Сообщение <strong className="text-[#181d17]">«Сервер недоступен»</strong> значит, что сейчас не отвечает
                  часть сайта с нашей стороны. Подождите немного и попробуйте снова; если не проходит долго — напишите или
                  позвоните тому, кто обслуживает сайт.
                </p>
              </div>
              <button
                className="mt-6 w-full rounded-xl bg-[#0d601b] py-3 text-sm font-bold text-white transition-colors hover:bg-[#195324] active:scale-[0.99]"
                type="button"
                onClick={() => setLoginHelpOpen(false)}
              >
                Понятно
              </button>
            </div>
          </div>
        ) : null}

        <footer className="fixed bottom-0 w-full flex flex-col sm:flex-row justify-center sm:justify-between items-center gap-3 sm:gap-8 px-6 sm:px-10 h-16 bg-transparent">
          <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-4 text-center sm:text-left">
            <span className="text-sm text-[#40493d]">© 2024 Админ-панель «Миксголдфрукт». Все права защищены.</span>
            <span className="text-xs text-[#707a6c]">Версия 29.03.2026-v3</span>
          </div>
          <div className="flex gap-6">
            <a className="text-[#707a6c] hover:text-[#0d601b] transition-colors opacity-80 hover:opacity-100 text-sm" href="#">
              Политика конфиденциальности
            </a>
            <a className="text-[#707a6c] hover:text-[#0d601b] transition-colors opacity-80 hover:opacity-100 text-sm" href="#">
              Условия использования
            </a>
            <a className="text-[#707a6c] hover:text-[#0d601b] transition-colors opacity-80 hover:opacity-100 text-sm" href="/">
              На сайт
            </a>
          </div>
        </footer>

        <style>{`
          @keyframes float {
            0%, 100% { transform: translate(0, 0) rotate(0deg); }
            33% { transform: translate(2%, 4%) rotate(2deg); }
            66% { transform: translate(-1%, 2%) rotate(-1deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display">
      {isAuthed && !isCheckingAuth ? (
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-background-dark hidden lg:flex flex-col sticky top-0 h-screen">
            <div className="p-6 flex items-center gap-3">
              <div className="bg-primary p-2 rounded-lg text-white">
                <IconLeaf className="w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-primary">Админ панель</h1>
            </div>
            <nav className="flex-1 px-4 space-y-1">
              <a
                className={[
                  "flex items-center gap-3 px-3 py-2 rounded-xl transition-colors",
                  activeTab === "dashboard" ? "bg-primary text-white" : "text-slate-600 hover:bg-primary/10",
                ].join(" ")}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab("dashboard");
                }}
              >
                <IconGrid className="w-5 h-5" />
                <span className="text-sm font-medium">Панель</span>
              </a>
              <a
                className={[
                  "flex items-center gap-3 px-3 py-2 rounded-xl transition-colors",
                  activeTab === "homeCards" ? "bg-primary text-white" : "text-slate-600 hover:bg-primary/10",
                ].join(" ")}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab("homeCards");
                }}
              >
                <IconImageStack className="w-5 h-5" />
                <span className="text-sm font-medium">Карточки главной</span>
              </a>
              <a
                className={[
                  "flex items-center gap-3 px-3 py-2 rounded-xl transition-colors",
                  activeTab === "catalog" ? "bg-primary text-white" : "text-slate-600 hover:bg-primary/10",
                ].join(" ")}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab("catalog");
                }}
              >
                <IconBox className="w-5 h-5" />
                <span className="text-sm font-medium">Каталог</span>
              </a>
              <a
                className={[
                  "flex items-center gap-3 px-3 py-2 rounded-xl transition-colors",
                  activeTab === "orders" ? "bg-primary text-white" : "text-slate-600 hover:bg-primary/10",
                ].join(" ")}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab("orders");
                }}
              >
                <IconCart className="w-5 h-5" />
                <span className="text-sm font-medium">Заказы</span>
              </a>
              <a
                className={[
                  "flex items-center gap-3 px-3 py-2 rounded-xl transition-colors",
                  activeTab === "suppliers" ? "bg-primary text-white" : "text-slate-600 hover:bg-primary/10",
                ].join(" ")}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab("suppliers");
                }}
              >
                <IconUsers className="w-5 h-5" />
                <span className="text-sm font-medium">Поставщики</span>
              </a>
              <a
                className={[
                  "flex items-center gap-3 px-3 py-2 rounded-xl transition-colors",
                  activeTab === "reports" ? "bg-primary text-white" : "text-slate-600 hover:bg-primary/10",
                ].join(" ")}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab("reports");
                }}
              >
                <IconChart className="w-5 h-5" />
                <span className="text-sm font-medium">Отчёты</span>
              </a>
            </nav>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3 px-3 py-2">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary overflow-hidden">
                  <img alt="Профиль администратора" className="w-full h-full object-cover" src={profileImageUrl} />
                </div>
                <div>
                <p className="text-sm font-semibold">Админ</p>
                <p className="text-xs text-slate-500">Панель управления</p>
                </div>
              </div>
            </div>
          </aside>

          {mobileNavOpen ? (
            <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Разделы админки">
              <button
                className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
                type="button"
                aria-label="Закрыть меню"
                onClick={() => setMobileNavOpen(false)}
              />
              <nav className="absolute left-0 top-0 bottom-0 flex h-full w-[min(20rem,92vw)] flex-col gap-1 overflow-y-auto border-r border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-background-dark">
                <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div className="rounded-lg bg-primary p-2 text-white">
                    <IconLeaf className="h-5 w-5" />
                  </div>
                  <span className="font-bold text-primary">Меню</span>
                </div>
                <a
                  className={[
                    "flex items-center gap-3 rounded-xl px-3 py-3 transition-colors",
                    activeTab === "dashboard" ? "bg-primary text-white" : "text-slate-600 hover:bg-primary/10",
                  ].join(" ")}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveTab("dashboard");
                    setMobileNavOpen(false);
                  }}
                >
                  <IconGrid className="h-5 w-5" />
                  <span className="text-sm font-medium">Панель</span>
                </a>
                <a
                  className={[
                    "flex items-center gap-3 rounded-xl px-3 py-3 transition-colors",
                    activeTab === "homeCards" ? "bg-primary text-white" : "text-slate-600 hover:bg-primary/10",
                  ].join(" ")}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveTab("homeCards");
                    setMobileNavOpen(false);
                  }}
                >
                  <IconImageStack className="h-5 w-5" />
                  <span className="text-sm font-medium">Карточки главной</span>
                </a>
                <a
                  className={[
                    "flex items-center gap-3 rounded-xl px-3 py-3 transition-colors",
                    activeTab === "catalog" ? "bg-primary text-white" : "text-slate-600 hover:bg-primary/10",
                  ].join(" ")}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveTab("catalog");
                    setMobileNavOpen(false);
                  }}
                >
                  <IconBox className="h-5 w-5" />
                  <span className="text-sm font-medium">Каталог</span>
                </a>
                <a
                  className={[
                    "flex items-center gap-3 rounded-xl px-3 py-3 transition-colors",
                    activeTab === "orders" ? "bg-primary text-white" : "text-slate-600 hover:bg-primary/10",
                  ].join(" ")}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveTab("orders");
                    setMobileNavOpen(false);
                  }}
                >
                  <IconCart className="h-5 w-5" />
                  <span className="text-sm font-medium">Заказы</span>
                </a>
                <a
                  className={[
                    "flex items-center gap-3 rounded-xl px-3 py-3 transition-colors",
                    activeTab === "suppliers" ? "bg-primary text-white" : "text-slate-600 hover:bg-primary/10",
                  ].join(" ")}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveTab("suppliers");
                    setMobileNavOpen(false);
                  }}
                >
                  <IconUsers className="h-5 w-5" />
                  <span className="text-sm font-medium">Поставщики</span>
                </a>
                <a
                  className={[
                    "flex items-center gap-3 rounded-xl px-3 py-3 transition-colors",
                    activeTab === "reports" ? "bg-primary text-white" : "text-slate-600 hover:bg-primary/10",
                  ].join(" ")}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveTab("reports");
                    setMobileNavOpen(false);
                  }}
                >
                  <IconChart className="h-5 w-5" />
                  <span className="text-sm font-medium">Отчёты</span>
                </a>
                <button
                  className="mt-auto flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    doLogout();
                  }}
                >
                  <IconLogout className="h-5 w-5" />
                  <span className="text-sm font-semibold">Выйти</span>
                </button>
              </nav>
            </div>
          ) : null}

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            {homeCardSaveNotice ? (
              <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/35 backdrop-blur-[1px]" onClick={() => setHomeCardSaveNotice(null)} />
                <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl p-6">
                  <h4
                    className={[
                      "text-lg font-bold mb-2",
                      homeCardSaveNotice.kind === "success" ? "text-emerald-700" : "text-red-700",
                    ].join(" ")}
                  >
                    {homeCardSaveNotice.kind === "success" ? "Успешно" : "Ошибка"}
                  </h4>
                  <p className="text-sm text-slate-600">{homeCardSaveNotice.text}</p>
                  <button
                    className="mt-5 w-full rounded-xl bg-primary hover:bg-primary/90 text-white font-bold py-2.5 transition-colors"
                    type="button"
                    onClick={() => setHomeCardSaveNotice(null)}
                  >
                    Ок
                  </button>
                </div>
              </div>
            ) : null}
            <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-sm dark:border-slate-800 dark:bg-background-dark/80 sm:px-6 lg:px-8">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
                  type="button"
                  aria-label="Открыть меню разделов"
                  onClick={() => setMobileNavOpen(true)}
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </button>
                <h2 className="truncate text-base font-semibold sm:text-lg">
                  <span className="font-bold text-primary">Админ панель</span>
                  <span className="mx-1.5 font-normal text-slate-400" aria-hidden>
                    ·
                  </span>
                  <span>{ADMIN_TAB_LABELS[activeTab]}</span>
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:gap-4">
                <Link
                  className="hidden items-center gap-2 rounded-xl px-3 py-2 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 sm:inline-flex"
                  to="/"
                >
                  На главную
                </Link>
                <Link
                  aria-label="На главную"
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 sm:hidden"
                  to="/"
                >
                  <span className="text-lg leading-none">⌂</span>
                </Link>
                <button
                  className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => {
                    setMobileNavOpen(false);
                    setIsSearchOpen(true);
                    setSearchQuery("");
                  }}
                  type="button"
                >
                  <IconSearch className="h-5 w-5" />
                </button>
                <button
                  className="hidden items-center gap-2 rounded-xl px-3 py-2 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 sm:flex"
                  onClick={doLogout}
                  type="button"
                >
                  <IconLogout className="h-5 w-5" />
                  <span className="text-sm font-semibold">Выйти</span>
                </button>
                <button
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 sm:hidden"
                  type="button"
                  aria-label="Выйти"
                  onClick={doLogout}
                >
                  <IconLogout className="h-5 w-5" />
                </button>
              </div>
            </header>

            {isSearchOpen ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div
                  className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                  onClick={() => setIsSearchOpen(false)}
                  role="button"
                  tabIndex={-1}
                />
                <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl animate-[fadeIn_180ms_ease-out]">
                  <div className="p-4 border-b border-slate-100 flex items-center gap-3">
                    <div className="text-slate-500">
                      <IconSearch className="w-5 h-5" />
                    </div>
                    <input
                      autoFocus
                      className="w-full border-none focus:ring-0 text-slate-900 placeholder:text-slate-400"
                      placeholder="Поиск по товарам и категориям..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setIsSearchOpen(false);
                      }}
                    />
                    <button
                      className="px-3 py-2 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold"
                      onClick={() => setIsSearchOpen(false)}
                      type="button"
                    >
                      Закрыть
                    </button>
                  </div>

                  <div className="p-4 space-y-6 max-h-[70vh] overflow-auto">
                    {isSearching ? (
                      <div className="text-sm text-slate-500">Поиск...</div>
      ) : null}

      {/* Пока проверяем токен — не показываем панель, чтобы не было запросов с невалидным access token */}
      {isCheckingAuth && isAuthed ? (
        <div className="fixed inset-0 z-[9999] bg-background-light/60 dark:bg-background-dark/60 backdrop-blur-[2px] flex items-center justify-center">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-6 py-4 shadow-2xl">
            <div className="text-slate-700 dark:text-slate-200 font-semibold">Проверка доступа...</div>
          </div>
        </div>
      ) : null}

                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Категории</h4>
                      {searchCategories.length ? (
                        <div className="flex flex-wrap gap-2">
                          {searchCategories.map((c) => (
                            <button
                              key={c.id}
                              className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm"
                              onClick={() => {
                                setIsSearchOpen(false);
                                setActiveTab("catalog");
                                setCatalogCategoryIds([c.id]);
                                setHighlightCategoryId(c.id);
                                window.setTimeout(() => {
                                  document.getElementById(`category-${c.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                                }, 50);
                              }}
                              type="button"
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500">Ничего не найдено.</div>
                      )}
                    </div>

                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Товары</h4>
                      {searchProducts.length ? (
                        <div className="space-y-2">
                          {searchProducts.map((p) => (
                            <button
                              key={p.id}
                              className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                              onClick={() => {
                                setIsSearchOpen(false);
                                setActiveTab("catalog");
                                if (p.categoryId) setCatalogCategoryIds([p.categoryId]);
                                setHighlightProductId(p.id);
                                window.setTimeout(() => {
                                  document.getElementById(`product-${p.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                                }, 150);
                              }}
                              type="button"
                            >
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">{p.name}</div>
                                  <div className="text-xs text-slate-500">
                                    {p.categoryName ? `${p.categoryName} • ` : ""}
                                    {p.country}
                                  </div>
                                </div>
                                <div className="text-sm font-bold text-slate-700">
                                  {p.price === null || p.price === undefined || p.price === "" ? "—" : String(p.price)}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500">Ничего не найдено.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6 lg:p-8">
              {activeTab === "dashboard" ? (
                <>
                  {/* Add Product Section */}
                  <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                      <h3 className="text-xl font-bold">Добавить товар</h3>
                      <p className="text-slate-500 text-sm">Заполните поля, чтобы добавить новый товар в каталог.</p>
                    </div>
                    {error ? (
                      <div className="px-6 pb-4">
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
                          {error}
                        </div>
                      </div>
                    ) : null}
                    <form
                      className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setError(null);

                        const name = newProductName.trim();
                        const country = newProductCountry.trim();
                        const price = newProductPrice.trim();
                        const categoryId = categoryIdForNewProduct || null;

                        if (!name || !country) {
                          setError("Заполните название и страну.");
                          return;
                        }

                        if (newProductImageFile) {
                          if (newProductImageFile.size > MAX_IMAGE_BYTES) {
                            setError("Файл слишком большой. Максимум 5 МБ.");
                            return;
                          }

                          if (!isLikelyImageFile(newProductImageFile)) {
                            setError("Можно загрузить только изображение (JPG, PNG, WEBP, HEIC/HEIF).");
                            return;
                          }
                        }

                        setIsSavingProduct(true);
                        try {
                          const form = new FormData();
                          form.append("name", name);
                          form.append("country", country);
                          if (price) form.append("price", price);
                          if (categoryId) form.append("categoryId", categoryId);
                          if (newProductImageFile) form.append("image", newProductImageFile);
                          if (newProductSeasonal) {
                            form.append("badgeKind", "seasonal");
                            form.append("badgeLabel", "СЕЗОННОЕ");
                          }
                          if (newProductPopular) form.append("popular", "1");
                          const wNew = newProductWeightValue.trim();
                          if (wNew) {
                            form.append("weightValue", wNew.replace(",", "."));
                            form.append("weightUnit", newProductWeightUnit);
                          }

                          await adminFetchJson<Product>("/api/products", {
                            method: "POST",
                            body: form,
                          });

                          setNewProductName("");
                          setNewProductCountry("");
                          setNewProductPrice("");
                          setNewProductWeightValue("");
                          setNewProductWeightUnit("g");
                          setNewProductImageFile(null);
                          setNewProductSeasonal(false);
                          setNewProductPopular(false);
                          await loadDashboardProducts(1, debouncedDashboardSearch);
                        } catch (err) {
                          setError(getUploadErrorMessage(err, "Не удалось сохранить товар. Проверьте сервер и попробуйте ещё раз."));
                        } finally {
                          setIsSavingProduct(false);
                        }
                      }}
                    >
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Название товара</label>
                          <input
                            className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-primary focus:border-primary"
                            placeholder="Например: Томаты"
                            type="text"
                            value={newProductName}
                            onChange={(e) => setNewProductName(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Категория</label>
                          <div className="flex items-center gap-2">
                            <select
                              className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-primary focus:border-primary"
                              value={categoryIdForNewProduct}
                              onChange={(e) => setCategoryIdForNewProduct(e.target.value)}
                            >
                              {categories.length ? null : <option value="">Нет категорий</option>}
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Страна происхождения</label>
                          <div className="relative">
                            <IconGlobe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              className="w-full pl-10 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-primary focus:border-primary"
                              placeholder="Например: Италия"
                              type="text"
                              value={newProductCountry}
                              onChange={(e) => setNewProductCountry(e.target.value)}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Цена за единицу</label>
                          <input
                            className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-primary focus:border-primary"
                            placeholder="Например: 4.99"
                            step="0.01"
                            type="number"
                            value={newProductPrice}
                            onChange={(e) => setNewProductPrice(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Фасовка (необязательно)</label>
                          <div className="flex flex-wrap items-center gap-4 mb-2">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                checked={newProductWeightUnit !== "pcs"}
                                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                type="checkbox"
                                onChange={(e) => {
                                  if (!e.target.checked) return;
                                  setNewProductWeightUnit("g");
                                }}
                              />
                              <span className="text-sm font-medium">По весу</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                checked={newProductWeightUnit === "pcs"}
                                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                type="checkbox"
                                onChange={(e) => {
                                  if (!e.target.checked) return;
                                  setNewProductWeightUnit("pcs");
                                }}
                              />
                              <span className="text-sm font-medium">В штуках</span>
                            </label>
                          </div>
                          <div className="flex gap-2 items-center">
                            <input
                              className="min-w-0 flex-1 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-primary focus:border-primary"
                              inputMode={newProductWeightUnit === "pcs" ? "numeric" : "decimal"}
                              placeholder={newProductWeightUnit === "pcs" ? "Например: 6" : "Например: 500"}
                              type="text"
                              value={newProductWeightValue}
                              onChange={(e) => setNewProductWeightValue(e.target.value)}
                            />
                            {newProductWeightUnit === "pcs" ? (
                              <div className="shrink-0 w-[5.5rem] rounded-xl border border-[#1f642e]/25 bg-[#f9faf6]/80 px-2.5 py-2.5 text-sm font-semibold text-[#1a1c1a] shadow-sm backdrop-blur-sm text-center">
                                шт
                              </div>
                            ) : (
                              <WeightUnitSelect value={newProductWeightUnit} onChange={setNewProductWeightUnit} />
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {newProductWeightUnit === "pcs" ? "В каталоге показывается как количество в штуках." : "В каталоге показывается в строке с весом."}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                          <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                              checked={newProductSeasonal}
                              className="h-5 w-5 rounded-md border-slate-300 text-primary focus:ring-primary"
                              onChange={(e) => setNewProductSeasonal(e.target.checked)}
                              type="checkbox"
                            />
                            <span className="text-sm font-medium">Сезонный товар</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                              checked={newProductPopular}
                              className="h-5 w-5 rounded-md border-slate-300 text-primary focus:ring-primary"
                              onChange={(e) => setNewProductPopular(e.target.checked)}
                              type="checkbox"
                            />
                            <span className="text-sm font-medium">Популярный товар</span>
                          </label>
                        </div>
                        <div className="pt-2">
                          <button
                            className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-xl transition-all shadow-md shadow-primary/20 flex items-center justify-center gap-2"
                            disabled={isSavingProduct}
                            type="submit"
                          >
                            <IconPlusCircle className="w-5 h-5" />
                            {isSavingProduct ? "Сохранение..." : "Добавить товар"}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <label className="block text-sm font-medium mb-1.5">Фото товара (необязательно)</label>
                        <label className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl h-48 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors cursor-pointer group overflow-hidden">
                          <input
                            accept="image/*,.heic,.heif"
                            className="hidden"
                            type="file"
                            onChange={(e) => {
                              const input = e.currentTarget;
                              const f = input.files?.[0] ?? null;
                              if (f && f.size > MAX_IMAGE_BYTES) {
                                setError("Файл слишком большой. Максимум 5 МБ.");
                                setNewProductImageFile(null);
                                input.value = "";
                                return;
                              }
                              setNewProductImageFile(f);
                            }}
                          />
                          {newProductImagePreviewUrl ? (
                            <img alt="Предпросмотр" className="w-full h-full object-cover" src={newProductImagePreviewUrl} />
                          ) : (
                            <div className="flex flex-col items-center justify-center">
                              <IconUpload className="w-10 h-10 text-slate-400 group-hover:text-primary transition-colors" />
                              <p className="text-sm text-slate-500 mt-2">Нажмите, чтобы выбрать фото</p>
                              <p className="text-xs text-slate-400 mt-1">JPG, PNG, WEBP, HEIC — до 5 МБ</p>
                            </div>
                          )}
                        </label>
                      </div>
                    </form>
                  </section>

                  <section className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-xl font-bold">Товары</h3>
                        <p className="text-slate-500 text-sm">
                          {isLoadingDashboardProducts
                            ? "Загрузка..."
                            : debouncedDashboardSearch.trim()
                              ? `Найдено: ${dashboardProductsTotal} (стр. ${dashboardProductsPage} из ${dashboardPageCount})`
                              : `Всего в базе: ${dashboardProductsTotal} · стр. ${dashboardProductsPage} из ${dashboardPageCount}`}
                        </p>
                      </div>
                      <input
                        className="w-full sm:max-w-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:text-slate-100"
                        type="search"
                        autoComplete="off"
                        placeholder="Поиск: название, страна, категория…"
                        aria-label="Поиск товаров"
                        value={dashboardProductsSearch}
                        onChange={(e) => setDashboardProductsSearch(e.target.value)}
                      />
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                                Товар
                              </th>
                              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                                Категория
                              </th>
                              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                                Происхождение
                              </th>
                              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                                Цена
                              </th>
                              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                                Наличие
                              </th>
                              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">
                                Действия
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {dashboardProducts.length ? (
                              dashboardProducts.map((p) => (
                                <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                        {p.imageUrl ? (
                                          <AdminProductImage
                                            src={p.imageUrl}
                                            alt={p.name}
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800">
                                            Без фото
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex flex-col gap-0.5 min-w-0">
                                        <span className="font-medium text-sm">{p.name}</span>
                                        {p.badge?.kind === "seasonal" ? (
                                          <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                                            Сезонное
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    {p.categoryName ? (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                        {p.categoryName}
                                      </span>
                                    ) : (
                                      <span className="text-sm text-slate-500">Без категории</span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{p.country}</td>
                                  <td className="px-6 py-4 text-sm font-semibold">
                                    {p.price === null || p.price === undefined || p.price === "" ? "—" : String(p.price)}
                                  </td>
                                  <td className="px-6 py-4">
                                    {p.inStock !== false ? (
                                      <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                                        В наличии
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                        Нет в наличии
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <button
                                      className="p-1.5 text-slate-400 hover:text-primary transition-colors"
                                      type="button"
                                      aria-label="Редактировать товар"
                                      onClick={() => openProductEdit(p)}
                                    >
                                      <IconPencil className="w-5 h-5" />
                                    </button>
                                    <button
                                      className="p-1.5 text-slate-400 hover:text-red-500 transition-colors ml-2"
                                      type="button"
                                      aria-label="Удалить товар"
                                      onClick={() => setDeletingProductId(p.id)}
                                    >
                                      <IconTrash className="w-5 h-5" />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td className="px-6 py-8 text-sm text-slate-500" colSpan={6}>
                                  {dashboardProductsTotal === 0 && !debouncedDashboardSearch.trim()
                                    ? "Пока нет добавленных товаров."
                                    : "Ничего не найдено по запросу. Измените поиск или сбросьте поле."}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      {dashboardProductsTotal > 0 ? (
                        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-100 dark:border-slate-800 px-4 py-4">
                          <button
                            className="h-10 min-w-[2.5rem] shrink-0 rounded-full border border-slate-200 bg-slate-100 px-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            disabled={dashboardProductsPage <= 1 || isLoadingDashboardProducts}
                            onClick={() => void loadDashboardProducts(dashboardProductsPage - 1, debouncedDashboardSearch)}
                            type="button"
                          >
                            ←
                          </button>
                          {Array.from({ length: dashboardPageCount }).map((_, i) => {
                            const n = i + 1;
                            const active = n === dashboardProductsPage;
                            return (
                              <button
                                key={n}
                                className={[
                                  "h-10 min-w-[2.5rem] shrink-0 rounded-full px-3 text-sm font-bold transition-colors",
                                  active
                                    ? "bg-primary text-white"
                                    : "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
                                ].join(" ")}
                                disabled={isLoadingDashboardProducts}
                                onClick={() => void loadDashboardProducts(n, debouncedDashboardSearch)}
                                type="button"
                              >
                                {n}
                              </button>
                            );
                          })}
                          <button
                            className="h-10 min-w-[2.5rem] shrink-0 rounded-full border border-slate-200 bg-slate-100 px-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            disabled={dashboardProductsPage >= dashboardPageCount || isLoadingDashboardProducts}
                            onClick={() => void loadDashboardProducts(dashboardProductsPage + 1, debouncedDashboardSearch)}
                            type="button"
                          >
                            →
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </section>
                </>
              ) : activeTab === "homeCards" ? (
                <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold">Карточки главной</h3>
                      <p className="text-slate-500 text-sm">
                        Ровно 4 карточки: заголовок, второй текст, изображение. Категория перехода на каталог — по желанию.
                      </p>
                    </div>
                    <button
                      className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold transition-colors"
                      onClick={() => void loadHomeCards()}
                      type="button"
                    >
                      {isLoadingHomeCards ? "Загрузка..." : "Обновить"}
                    </button>
                  </div>
                  <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {homeCards.map((card) => (
                      <form
                        key={card.slot}
                        className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 md:p-5 space-y-4"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          setError(null);
                          if (!card.title.trim()) {
                            setError(`Заполните обязательные поля для карточки #${card.slot}.`);
                            setHomeCardSaveNotice({
                              kind: "error",
                              text: `Заполните заголовок для карточки #${card.slot}.`,
                            });
                            return;
                          }
                          try {
                            await saveHomeCard(card);
                            setHomeCardSaveNotice({
                              kind: "success",
                              text: `Карточка #${card.slot} сохранена. Все данные успешно записаны на сервер.`,
                            });
                          } catch (err) {
                            const message = String(err);
                            if (message.includes("category_not_found")) {
                              setError(`Категория карточки #${card.slot} не найдена.`);
                              setHomeCardSaveNotice({
                                kind: "error",
                                text: `Не удалось сохранить карточку #${card.slot}: категория не найдена. Выберите другую категорию.`,
                              });
                            } else {
                              setError(`Не удалось сохранить карточку #${card.slot}.`);
                              setHomeCardSaveNotice({
                                kind: "error",
                                text: `Ошибка при сохранении карточки #${card.slot}. Проверьте соединение и поля, затем попробуйте снова.`,
                              });
                            }
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-base">Карточка #{card.slot}</h4>
                          <span className="text-xs text-slate-500">{card.categoryName ?? "Без категории"}</span>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Заголовок</label>
                          <input
                            className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-primary focus:border-primary"
                            value={card.title}
                            onChange={(e) =>
                              setHomeCards((prev) => prev.map((x) => (x.slot === card.slot ? { ...x, title: e.target.value } : x)))
                            }
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-3 mb-1.5">
                            <label className="block text-sm font-medium">Второй текст</label>
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              className={[
                                "w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-primary focus:border-primary",
                                "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:opacity-80",
                                "dark:disabled:bg-slate-800/60 dark:disabled:text-slate-500 dark:disabled:border-slate-700",
                              ].join(" ")}
                              value={card.subtitle ?? ""}
                              disabled={!card.subtitleEnabled}
                              onChange={(e) =>
                                setHomeCards((prev) =>
                                  prev.map((x) => (x.slot === card.slot ? { ...x, subtitle: e.target.value } : x)),
                                )
                              }
                            />
                            <label className="shrink-0 flex items-center gap-2 cursor-pointer select-none px-2 py-2 -mr-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/50">
                              <input
                                checked={card.subtitleEnabled}
                                className="h-6 w-6 rounded-md border-slate-300 text-primary focus:ring-primary"
                                type="checkbox"
                                onChange={(e) => {
                                  const enabled = e.target.checked;
                                  setHomeCards((prev) =>
                                    prev.map((x) =>
                                      x.slot === card.slot ? { ...x, subtitleEnabled: enabled, subtitle: enabled ? x.subtitle : "" } : x,
                                    ),
                                  );
                                }}
                              />
                              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">вкл</span>
                            </label>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Категория перехода</label>
                          <select
                            className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-primary focus:border-primary"
                            value={card.categoryId ?? ""}
                            onChange={(e) =>
                              setHomeCards((prev) =>
                                prev.map((x) => (x.slot === card.slot ? { ...x, categoryId: e.target.value || null } : x)),
                              )
                            }
                          >
                            <option value="">Без категории (весь каталог)</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="block text-sm font-medium">Изображение</label>
                          <div className="h-36 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            {card.imageUrl ? (
                              <AdminProductImage
                                src={card.imageUrl}
                                alt={card.title || `Карточка ${card.slot}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">Нет изображения</div>
                            )}
                          </div>
                          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold transition-colors cursor-pointer">
                            <IconUpload className="w-4 h-4" />
                            {uploadingHomeCardSlot === card.slot ? "Загрузка..." : "Загрузить фото"}
                            <input
                              accept="image/*,.heic,.heif"
                              className="hidden"
                              type="file"
                              onChange={(e) => {
                                const input = e.currentTarget;
                                const file = e.target.files?.[0] ?? null;
                                if (!file) return;
                                if (file.size > MAX_IMAGE_BYTES) {
                                  setError("Файл слишком большой. Максимум 5 МБ.");
                                  input.value = "";
                                  return;
                                }
                                setError(null);
                                void (async () => {
                                  try {
                                    await uploadHomeCardImage(card.slot, file);
                                  } catch (err) {
                                    setError(
                                      getUploadErrorMessage(err, `Не удалось загрузить изображение для карточки #${card.slot}.`),
                                    );
                                  } finally {
                                    // Если элемент уже размонтирован, value сбрасывать нельзя.
                                    if (input && input.isConnected) input.value = "";
                                  }
                                })();
                              }}
                            />
                          </label>
                          <p className="text-xs text-slate-400">JPG, PNG, WEBP, HEIC — до 5 МБ</p>
                        </div>
                        <button
                          className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-60"
                          disabled={savingHomeCardSlot === card.slot}
                          type="submit"
                        >
                          {savingHomeCardSlot === card.slot ? "Сохранение..." : "Сохранить карточку"}
                        </button>
                      </form>
                    ))}
                  </div>
                </section>
              ) : activeTab === "catalog" ? (
                <div className="space-y-6">
                  <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                      <h3 className="text-xl font-bold">Каталог</h3>
                      <p className="text-slate-500 text-sm">Категории и товары из базы данных.</p>
                    </div>
                    <div className="p-6">
                      <div className="flex items-center justify-between gap-4 mb-4">
                        <div className="text-sm text-slate-600">Категории</div>
                        <button
                          className="px-3 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold transition-colors"
                          onClick={() => setIsCreatingCategory(true)}
                          type="button"
                        >
                          + Добавить категорию
                        </button>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs text-slate-500">Фильтр товаров по категориям.</div>
                          <div className="text-xs text-slate-500">Всего: {categories.length}</div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-semibold transition-colors"
                            type="button"
                            onClick={() => {
                              setDraftCategoryIds(catalogCategoryIds);
                              setIsCategoryFilterOpen(true);
                            }}
                          >
                            Категории
                            {catalogCategoryIds.length ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                {catalogCategoryIds.length}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500">(все)</span>
                            )}
                          </button>
                          {catalogCategoryIds.length ? (
                            <button
                              className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold transition-colors"
                              type="button"
                              onClick={() => setCatalogCategoryIds([])}
                            >
                              Сбросить
                            </button>
                          ) : null}
                        </div>

                        {isCategoryFilterOpen ? (
                          <div className="fixed inset-0 z-[10000] flex items-start justify-center pt-20 sm:pt-24">
                            <div
                              className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
                              onClick={() => setIsCategoryFilterOpen(false)}
                              role="button"
                              tabIndex={-1}
                            />
                            <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
                              <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4">
                                <div>
                                  <h4 className="text-lg font-bold">Фильтр по категориям</h4>
                                  <p className="text-sm text-slate-500">Выберите одну или несколько категорий.</p>
                                </div>
                                <button
                                  className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700"
                                  type="button"
                                  onClick={() => setIsCategoryFilterOpen(false)}
                                  aria-label="Закрыть"
                                >
                                  ✕
                                </button>
                              </div>

                              <div className="max-h-[60vh] overflow-y-auto p-5 space-y-2">
                                <label className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="h-5 w-5 rounded-md border-slate-300 text-primary focus:ring-primary"
                                    checked={draftCategoryIds.length === 0}
                                    onChange={(e) => {
                                      if (e.target.checked) setDraftCategoryIds([]);
                                    }}
                                  />
                                  <span className="font-semibold">Все категории</span>
                                </label>

                                <div className="h-px bg-slate-100 my-2" />

                                {categories.map((c) => {
                                  const checked = draftCategoryIds.includes(c.id);
                                  return (
                                    <div key={c.id} className="flex items-center gap-2">
                                      <label className="flex flex-1 items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          className="h-5 w-5 rounded-md border-slate-300 text-primary focus:ring-primary"
                                          checked={checked}
                                          onChange={(e) => {
                                            setDraftCategoryIds((prev) => {
                                              const next = new Set(prev);
                                              if (e.target.checked) next.add(c.id);
                                              else next.delete(c.id);
                                              return Array.from(next);
                                            });
                                          }}
                                        />
                                        <span className="font-medium">{c.name}</span>
                                      </label>
                                      <button
                                        className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                                        onClick={() => {
                                          setEditingCategoryId(c.id);
                                          setEditingCategoryName(c.name);
                                          setIsCategoryFilterOpen(false);
                                        }}
                                        type="button"
                                        aria-label="Редактировать категорию"
                                        title="Редактировать"
                                      >
                                        <IconPencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-red-600 transition-colors"
                                        onClick={() => {
                                          setDeletingCategoryId(c.id);
                                          setIsCategoryFilterOpen(false);
                                        }}
                                        type="button"
                                        aria-label="Удалить категорию"
                                        title="Удалить"
                                      >
                                        <IconTrash className="w-4 h-4" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="p-5 border-t border-slate-100 flex flex-col sm:flex-row gap-2 sm:justify-between">
                                <button
                                  className="px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold"
                                  type="button"
                                  onClick={() => setDraftCategoryIds([])}
                                >
                                  Выбрать все
                                </button>
                                <div className="flex gap-2">
                                  <button
                                    className="px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold"
                                    type="button"
                                    onClick={() => {
                                      setDraftCategoryIds(catalogCategoryIds);
                                      setIsCategoryFilterOpen(false);
                                    }}
                                  >
                                    Отмена
                                  </button>
                                  <button
                                    className="px-4 py-3 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold transition-colors"
                                    type="button"
                                    onClick={() => {
                                      setCatalogCategoryIds(draftCategoryIds);
                                      setIsCategoryFilterOpen(false);
                                    }}
                                  >
                                    Применить
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </section>

                  {isCreatingCategory ? (
                    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
                      <div
                        className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
                        onClick={() => setIsCreatingCategory(false)}
                        role="button"
                        tabIndex={-1}
                      />
                      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="p-6 border-b border-slate-100">
                          <h4 className="text-lg font-bold">Добавить категорию</h4>
                          <p className="text-sm text-slate-500">Введите название категории.</p>
                        </div>
                        <div className="p-6 space-y-4">
                          <div>
                            <label className="block text-sm font-medium mb-1.5">Название</label>
                            <input
                              className="w-full rounded-xl border-slate-200 bg-slate-50 focus:ring-primary focus:border-primary"
                              placeholder="Например: Овощи"
                              value={newCategoryName}
                              onChange={(e) => setNewCategoryName(e.target.value)}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-xl transition-colors"
                              onClick={async () => {
                                const name = newCategoryName.trim();
                                if (!name) return;
                                try {
                                  const created = await adminFetchJson<{ ok: boolean; item: Category }>("/api/categories", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ name }),
                                  });
                                  setNewCategoryName("");
                                  setIsCreatingCategory(false);
                                  await loadCategories();
                                } catch {
                                  setError("Не удалось создать категорию.");
                                }
                              }}
                              type="button"
                            >
                              Сохранить
                            </button>
                            <button
                              className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 rounded-xl transition-colors"
                              onClick={() => setIsCreatingCategory(false)}
                              type="button"
                            >
                              Отмена
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {editingCategoryId ? (
                    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
                      <div
                        className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
                        onClick={() => setEditingCategoryId(null)}
                        role="button"
                        tabIndex={-1}
                      />
                      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="p-6 border-b border-slate-100">
                          <h4 className="text-lg font-bold">Редактировать категорию</h4>
                          <p className="text-sm text-slate-500">Введите новое название и сохраните.</p>
                        </div>
                        <div className="p-6 space-y-4">
                          <div>
                            <label className="block text-sm font-medium mb-1.5">Название</label>
                            <input
                              className="w-full rounded-xl border-slate-200 bg-slate-50 focus:ring-primary focus:border-primary"
                              value={editingCategoryName}
                              onChange={(e) => setEditingCategoryName(e.target.value)}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-60"
                              disabled={isUpdatingCategory}
                              onClick={async () => {
                                const name = editingCategoryName.trim();
                                if (!name) return;
                                try {
                                  await updateCategory(editingCategoryId, name);
                                  setEditingCategoryId(null);
                                  setEditingCategoryName("");
                                } catch {
                                  setError("Не удалось обновить категорию.");
                                }
                              }}
                              type="button"
                            >
                              {isUpdatingCategory ? "Сохранение..." : "Сохранить"}
                            </button>
                            <button
                              className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 rounded-xl transition-colors"
                              onClick={() => setEditingCategoryId(null)}
                              type="button"
                            >
                              Отмена
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {deletingCategoryId ? (
                    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                      <div
                        className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
                        onClick={() => setDeletingCategoryId(null)}
                        role="button"
                        tabIndex={-1}
                      />
                      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="p-6 border-b border-slate-100">
                          <h4 className="text-lg font-bold">Удалить категорию?</h4>
                          <p className="text-sm text-slate-500">
                            Категория будет удалена. У товаров из этой категории категория станет «Без категории».
                          </p>
                        </div>
                        <div className="p-6 flex gap-2">
                          <button
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-60"
                            disabled={isDeletingCategory}
                            onClick={async () => {
                              try {
                                await deleteCategory(deletingCategoryId);
                                setDeletingCategoryId(null);
                              } catch {
                                setError("Не удалось удалить категорию.");
                              }
                            }}
                            type="button"
                          >
                            {isDeletingCategory ? "Удаление..." : "Удалить"}
                          </button>
                          <button
                            className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 rounded-xl transition-colors"
                            onClick={() => setDeletingCategoryId(null)}
                            type="button"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-xl font-bold">Товары</h3>
                        <p className="text-slate-500 text-sm">
                          {isLoadingCatalog
                            ? "Загрузка..."
                            : debouncedCatalogProductSearch.trim()
                              ? `Найдено: ${catalogProductsTotal} · стр. ${catalogProductsPage} из ${catalogPageCount}`
                              : `Всего: ${catalogProductsTotal} · стр. ${catalogProductsPage} из ${catalogPageCount}`}
                        </p>
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[min(100%,20rem)] sm:flex-row sm:items-center">
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                          type="search"
                          autoComplete="off"
                          placeholder="Поиск: название, категория, страна, цена…"
                          aria-label="Поиск товаров в каталоге"
                          value={catalogProductSearchQuery}
                          onChange={(e) => setCatalogProductSearchQuery(e.target.value)}
                        />
                        <button
                          className="shrink-0 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold transition-colors dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-200"
                          onClick={() =>
                            void loadCatalogProducts(
                              catalogCategoryIds,
                              catalogProductsPage,
                              debouncedCatalogProductSearch,
                            )
                          }
                          type="button"
                        >
                          Обновить
                        </button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Товар</th>
                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Категория</th>
                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Страна</th>
                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Цена</th>
                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Наличие</th>
                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">
                              Действия
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {catalogProducts.length ? (
                            catalogProducts.map((p) => (
                              <tr
                                key={p.id}
                                id={`product-${p.id}`}
                                className={[
                                  "transition-colors",
                                  highlightProductId === p.id
                                    ? "bg-primary/10"
                                    : "hover:bg-slate-50/50 dark:hover:bg-slate-800/50",
                                ].join(" ")}
                              >
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                      {p.imageUrl ? (
                                        <AdminProductImage
                                          src={p.imageUrl}
                                          alt={p.name}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800">
                                          Без фото
                                        </div>
                                      )}
                                    </div>
                                    <span className="font-medium text-sm">{p.name}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                                  {p.categoryName ?? "Без категории"}
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{p.country}</td>
                                <td className="px-6 py-4 text-sm font-semibold">
                                  {p.price === null || p.price === undefined || p.price === "" ? "—" : String(p.price)}
                                </td>
                                <td className="px-6 py-4 text-xs">
                                  {p.inStock !== false ? (
                                    <span className="text-primary font-medium">В наличии</span>
                                  ) : (
                                    <span className="text-red-600 dark:text-red-400 font-medium">Нет в наличии</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <button
                                    className="p-1.5 text-slate-400 hover:text-primary transition-colors"
                                    type="button"
                                    aria-label="Редактировать товар"
                                    onClick={() => openProductEdit(p)}
                                  >
                                    <IconPencil className="w-5 h-5" />
                                  </button>
                                  <button
                                    className="p-1.5 text-slate-400 hover:text-red-500 transition-colors ml-2"
                                    type="button"
                                    aria-label="Удалить товар"
                                    onClick={() => setDeletingProductId(p.id)}
                                  >
                                    <IconTrash className="w-5 h-5" />
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td className="px-6 py-8 text-sm text-slate-500" colSpan={6}>
                                {catalogProductsTotal === 0 && !debouncedCatalogProductSearch.trim()
                                  ? "Товары не найдены."
                                  : "Нет товаров по текущему поиску или фильтру. Измените запрос или сбросьте поиск."}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {catalogProductsTotal > 0 ? (
                      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-100 dark:border-slate-800 px-4 py-4">
                        <button
                          className="h-10 min-w-[2.5rem] shrink-0 rounded-full border border-slate-200 bg-slate-100 px-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          disabled={catalogProductsPage <= 1 || isLoadingCatalog}
                          onClick={() =>
                            void loadCatalogProducts(
                              catalogCategoryIds,
                              catalogProductsPage - 1,
                              debouncedCatalogProductSearch,
                            )
                          }
                          type="button"
                        >
                          ←
                        </button>
                        {Array.from({ length: catalogPageCount }).map((_, i) => {
                          const n = i + 1;
                          const active = n === catalogProductsPage;
                          return (
                            <button
                              key={n}
                              className={[
                                "h-10 min-w-[2.5rem] shrink-0 rounded-full px-3 text-sm font-bold transition-colors",
                                active
                                  ? "bg-primary text-white"
                                  : "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
                              ].join(" ")}
                              disabled={isLoadingCatalog}
                              onClick={() => void loadCatalogProducts(catalogCategoryIds, n, debouncedCatalogProductSearch)}
                              type="button"
                            >
                              {n}
                            </button>
                          );
                        })}
                        <button
                          className="h-10 min-w-[2.5rem] shrink-0 rounded-full border border-slate-200 bg-slate-100 px-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          disabled={catalogProductsPage >= catalogPageCount || isLoadingCatalog}
                          onClick={() =>
                            void loadCatalogProducts(
                              catalogCategoryIds,
                              catalogProductsPage + 1,
                              debouncedCatalogProductSearch,
                            )
                          }
                          type="button"
                        >
                          →
                        </button>
                      </div>
                    ) : null}
                  </section>
                </div>
              ) : activeTab === "suppliers" ? (
                <AdminSuppliers adminFetchJson={adminFetchJson} setError={setError} />
              ) : (
                <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="text-xl font-bold">{activeTab === "orders" ? "Заказы" : "Отчёты"}</h3>
                    <p className="text-slate-500 text-sm">Раздел в разработке.</p>
                  </div>
                  <div className="p-6 text-sm text-slate-600 dark:text-slate-300">Здесь будет контент выбранного раздела.</div>
                </section>
              )}

              {editingProduct ? (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                  <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
                    onClick={() => setEditingProduct(null)}
                    role="button"
                    tabIndex={-1}
                  />
                  <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl max-h-[90vh] overflow-y-auto">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                      <h4 className="text-lg font-bold">Редактировать товар</h4>
                      <p className="text-sm text-slate-500">
                        Название, страна, цена, вес, категория, наличие, сезонность и популярность.
                      </p>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Название</label>
                        <input
                          className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-primary focus:border-primary"
                          value={editProductName}
                          onChange={(e) => setEditProductName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Категория</label>
                        <select
                          className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-primary focus:border-primary"
                          value={editProductCategoryId}
                          onChange={(e) => setEditProductCategoryId(e.target.value)}
                        >
                          <option value="">Без категории</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Страна</label>
                        <input
                          className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-primary focus:border-primary"
                          value={editProductCountry}
                          onChange={(e) => setEditProductCountry(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Цена</label>
                        <input
                          className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-primary focus:border-primary"
                          step="0.01"
                          type="number"
                          value={editProductPrice}
                          onChange={(e) => setEditProductPrice(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Фасовка</label>
                        <div className="flex flex-wrap items-center gap-4 mb-2">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              checked={editProductWeightUnit !== "pcs"}
                              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                              type="checkbox"
                              onChange={(e) => {
                                if (!e.target.checked) return;
                                setEditProductWeightUnit("g");
                              }}
                            />
                            <span className="text-sm font-medium">По весу</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              checked={editProductWeightUnit === "pcs"}
                              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                              type="checkbox"
                              onChange={(e) => {
                                if (!e.target.checked) return;
                                setEditProductWeightUnit("pcs");
                              }}
                            />
                            <span className="text-sm font-medium">В штуках</span>
                          </label>
                        </div>
                        <div className="flex gap-2 items-center">
                          <input
                            className="min-w-0 flex-1 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-primary focus:border-primary"
                            inputMode={editProductWeightUnit === "pcs" ? "numeric" : "decimal"}
                            placeholder="Очистите, чтобы убрать"
                            type="text"
                            value={editProductWeightValue}
                            onChange={(e) => setEditProductWeightValue(e.target.value)}
                          />
                          {editProductWeightUnit === "pcs" ? (
                            <div className="shrink-0 w-[5.5rem] rounded-xl border border-[#1f642e]/25 bg-[#f9faf6]/80 px-2.5 py-2.5 text-sm font-semibold text-[#1a1c1a] shadow-sm backdrop-blur-sm text-center">
                              шт
                            </div>
                          ) : (
                            <WeightUnitSelect value={editProductWeightUnit} onChange={setEditProductWeightUnit} />
                          )}
                        </div>
                      </div>
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                          checked={editProductInStock}
                          className="h-5 w-5 rounded-md border-slate-300 text-primary focus:ring-primary"
                          onChange={(e) => setEditProductInStock(e.target.checked)}
                          type="checkbox"
                        />
                        <span className="text-sm font-medium">В наличии</span>
                      </label>
                      <p className="text-xs text-slate-500">
                        Снимите галочку, чтобы отметить товар как отсутствующий (в таблице будет красная подсветка).
                      </p>
                      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                          <input
                            checked={editProductSeasonal}
                            className="h-5 w-5 rounded-md border-slate-300 text-primary focus:ring-primary"
                            onChange={(e) => setEditProductSeasonal(e.target.checked)}
                            type="checkbox"
                          />
                          <span className="text-sm font-medium">Сезонный товар</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                          <input
                            checked={editProductPopular}
                            className="h-5 w-5 rounded-md border-slate-300 text-primary focus:ring-primary"
                            onChange={(e) => setEditProductPopular(e.target.checked)}
                            type="checkbox"
                          />
                          <span className="text-sm font-medium">Популярный товар</span>
                        </label>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-60"
                          disabled={isSavingProductEdit}
                          onClick={() => void saveProductEdit()}
                          type="button"
                        >
                          {isSavingProductEdit ? "Сохранение..." : "Сохранить"}
                        </button>
                        <button
                          className="flex-1 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold py-3 rounded-xl transition-colors"
                          onClick={() => setEditingProduct(null)}
                          type="button"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {deletingProductId ? (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                  <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
                    onClick={() => setDeletingProductId(null)}
                    role="button"
                    tabIndex={-1}
                  />
                  <div className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                      <h4 className="text-lg font-bold">Удалить товар?</h4>
                      <p className="text-sm text-slate-500">
                        {dashboardProducts.find((x) => x.id === deletingProductId)?.name ??
                          catalogProducts.find((x) => x.id === deletingProductId)?.name ??
                          "Товар"}{" "}
                        будет удалён без восстановления.
                      </p>
                    </div>
                    <div className="p-6 flex gap-2">
                      <button
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-60"
                        disabled={isDeletingProduct}
                        onClick={() => void confirmDeleteProduct()}
                        type="button"
                      >
                        {isDeletingProduct ? "Удаление..." : "Удалить"}
                      </button>
                      <button
                        className="flex-1 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold py-3 rounded-xl transition-colors"
                        onClick={() => setDeletingProductId(null)}
                        type="button"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </main>
        </div>
      ) : (
        <div className="min-h-screen" />
      )}
    </div>
  );
}

