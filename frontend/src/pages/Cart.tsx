import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import Header from "../components/Header";
import SiteFooter from "../components/SiteFooter";
import { useCart } from "../context/CartContext";

const DELIVERY_COST = 10;
const FREE_DELIVERY_THRESHOLD = 120;
/** ~min-h-[5.5rem] / max-h-48 при root 16px */
const ADDRESS_TEXTAREA_MIN_PX = 88;
const ADDRESS_TEXTAREA_MAX_PX = 192;

const CART_SUGGEST_IMAGE_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="512" viewBox="0 0 800 512"><rect fill="#f3f4f6" width="800" height="512"/><text x="400" y="256" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-family="system-ui,sans-serif" font-size="18">Нет фото</text></svg>`,
  );

type CatalogSuggestion = {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  imageUrl: string;
  popular: boolean;
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

type ClearCartDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function ClearCartDialog({ open, onCancel, onConfirm }: ClearCartDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#171d14]/45 motion-reduce:bg-[#171d14]/55"
        aria-label="Закрыть"
        onClick={onCancel}
      />
      <div
        className="relative z-10 w-full max-w-[20rem] rounded-lg border border-[#bfcaba]/40 bg-white p-5 shadow-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-cart-dialog-title"
      >
        <h2
          id="clear-cart-dialog-title"
          className="text-base font-semibold text-[#171d14]"
          style={{ fontFamily: "'Manrope', sans-serif" }}
        >
          Очистить корзину?
        </h2>
        <p className="mt-2 text-sm leading-snug text-[#707a6c]">
          Все товары будут удалены. Вернуть их не получится.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            className="w-full rounded-md border border-[#bfcaba]/60 bg-white px-3 py-2.5 text-sm font-medium text-[#40493d] transition-colors hover:bg-[#f5fced] sm:w-auto"
            onClick={onCancel}
          >
            Отмена
          </button>
          <button
            type="button"
            className="w-full rounded-md bg-[#ba1a1a] px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#991b1b] sm:w-auto"
            onClick={onConfirm}
          >
            Удалить всё
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function normalizeBelarusPhoneDigits(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("80") && d.length === 11) return `375${d.slice(2)}`;
  if (!d.startsWith("375") && d.length === 9) return `375${d}`;
  return d;
}

function isValidBelarusPhoneClient(raw: string): boolean {
  return /^375\d{9}$/.test(normalizeBelarusPhoneDigits(raw));
}

function mapOrderError(code: string | undefined): string {
  switch (code) {
    case "invalid_phone":
      return "Укажите телефон (не короче 7 символов).";
    case "invalid_phone_by":
      return "Номер Беларуси: +375 и 9 цифр (можно 8 (029)… или 29… без кода страны).";
    case "invalid_phone_other":
      return "Введите номер (8–64 символа: цифры, +, скобки, дефисы).";
    case "invalid_address":
      return "Укажите полный адрес доставки (не короче 5 символов).";
    case "empty_cart":
      return "Корзина пуста.";
    default:
      return "Не удалось отправить заявку. Попробуйте позже.";
  }
}

export default function Cart() {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
  const { items, subtotal, addToCart, removeFromCart, updateQuantity, clearCart } = useCart();

  const [promoCode, setPromoCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [promoApplied, setPromoApplied] = useState(false);
  const [clearCartDialogOpen, setClearCartDialogOpen] = useState(false);
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderSuccessId, setOrderSuccessId] = useState<string | null>(null);
  const [catalogSuggestions, setCatalogSuggestions] = useState<CatalogSuggestion[]>([]);
  const deliveryAddressRef = useRef<HTMLTextAreaElement>(null);

  const delivery = subtotal === 0 ? 0 : subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_COST;
  const total = subtotal + delivery - discount;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("pageSize", "80");
        const res = await fetch(`${API_BASE_URL}/api/products?${params.toString()}`);
        if (!res.ok) throw new Error(`http_${res.status}`);
        const data = (await res.json()) as { items?: Array<Record<string, unknown>> };

        const toAbsoluteImageUrl = (url: string) => {
          if (!url) return "";
          if (url.startsWith("http://") || url.startsWith("https://")) return url;
          if (url.startsWith("/")) return `${API_BASE_URL}${url}`;
          return `${API_BASE_URL}/${url}`;
        };

        const mapped: CatalogSuggestion[] = (data.items ?? [])
          .map((it) => {
            const priceRaw = it.price;
            const priceNum =
              typeof priceRaw === "number"
                ? priceRaw
                : typeof priceRaw === "string" && String(priceRaw).trim()
                  ? Number.parseFloat(String(priceRaw))
                  : NaN;
            if (!Number.isFinite(priceNum)) return null;
            if (it.inStock === false) return null;

            const wv = it.weightValue;
            const wu = it.weightUnit;
            const weightValue =
              typeof wv === "number" && Number.isFinite(wv)
                ? wv
                : typeof wv === "string" && String(wv).trim()
                  ? Number.parseFloat(String(wv))
                  : null;
            const weightUnit = wu === "kg" || wu === "g" || wu === "pcs" ? wu : null;

            const country = String(it.country ?? "");
            const name = String(it.name ?? "").trim();
            if (!name) return null;

            const rawImg = String(it.imageUrl ?? "");
            const imageUrl = toAbsoluteImageUrl(rawImg) || CART_SUGGEST_IMAGE_PLACEHOLDER;
            const subtitle =
              [country || null, formatPackageWeight(weightValue, weightUnit)].filter(Boolean).join(", ") || "1 шт";

            return {
              id: String(it.id),
              name,
              subtitle,
              price: priceNum,
              imageUrl,
              popular: it.popular === true,
            } satisfies CatalogSuggestion;
          })
          .filter((p): p is CatalogSuggestion => p != null);

        if (!cancelled) setCatalogSuggestions(mapped);
      } catch {
        if (!cancelled) setCatalogSuggestions([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [API_BASE_URL]);

  const recommendedToShow = useMemo(() => {
    const inCart = new Set(items.map((i) => i.id));
    const eligible = catalogSuggestions.filter((p) => !inCart.has(p.id));
    const popularFirst = [...eligible.filter((p) => p.popular), ...eligible.filter((p) => !p.popular)];
    return popularFirst.slice(0, 4);
  }, [catalogSuggestions, items]);

  const applyPromo = () => {
    if (promoCode.trim().toUpperCase() === "FRESH10") {
      setDiscount(parseFloat((subtotal * 0.1).toFixed(2)));
      setPromoApplied(true);
    }
  };

  useEffect(() => {
    if (promoApplied) {
      setDiscount(parseFloat((subtotal * 0.1).toFixed(2)));
    }
  }, [subtotal, promoApplied]);

  useEffect(() => {
    if (items.length > 0) setOrderSuccessId(null);
  }, [items.length]);

  const fitDeliveryAddressHeight = useCallback(() => {
    const el = deliveryAddressRef.current;
    if (!el) return;
    el.style.height = "auto";
    const h = el.scrollHeight;
    el.style.height = `${Math.min(Math.max(h, ADDRESS_TEXTAREA_MIN_PX), ADDRESS_TEXTAREA_MAX_PX)}px`;
  }, []);

  useLayoutEffect(() => {
    fitDeliveryAddressHeight();
  }, [deliveryAddress, fitDeliveryAddressHeight]);

  const submitOrder = async () => {
    setOrderError(null);
    const phone = deliveryPhone.trim();
    const address = deliveryAddress.trim();
    if (!isValidBelarusPhoneClient(phone)) {
      setOrderError(mapOrderError("invalid_phone_by"));
      return;
    }
    const phoneToSend = `+${normalizeBelarusPhoneDigits(phone)}`;
    if (address.length < 5) {
      setOrderError(mapOrderError("invalid_address"));
      return;
    }
    if (items.length === 0) {
      setOrderError(mapOrderError("empty_cart"));
      return;
    }
    setOrderSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/public/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phoneToSend,
          phoneCountryMode: "by",
          address,
          items: items.map((i) => ({
            id: i.id,
            name: i.name,
            subtitle: i.subtitle,
            price: i.price,
            quantity: i.quantity,
          })),
          subtotal,
          delivery,
          discount,
          total: Math.max(0, total),
          promoCode: promoApplied ? promoCode.trim() : "",
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; orderId?: string | number };
      if (!res.ok || !data.ok) {
        setOrderError(mapOrderError(data.error));
        return;
      }
      setDeliveryPhone("");
      setDeliveryAddress("");
      setPromoCode("");
      setDiscount(0);
      setPromoApplied(false);
      if (data.orderId != null && String(data.orderId).length > 0) setOrderSuccessId(String(data.orderId));
      clearCart();
    } catch {
      setOrderError(mapOrderError(undefined));
    } finally {
      setOrderSubmitting(false);
    }
  };

  return (
    <div className="bg-[#f5fced] text-[#171d14] min-h-screen overflow-x-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      <Header showSearch={false} />

      <main className="pt-24 pb-16 sm:pb-20 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-10">
          <h1
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0d631b] pr-1"
            style={{ fontFamily: "'Manrope', sans-serif" }}
          >
            Корзина
          </h1>
          {items.length > 0 ? (
            <button
              className={[
                "self-start sm:self-auto shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold",
                "border border-white/75 bg-white/55 text-[#40493d]",
                "shadow-[0_4px_24px_rgba(23,29,20,0.06),0_1px_0_rgba(255,255,255,0.85)_inset]",
                "backdrop-blur-xl backdrop-saturate-150 ring-1 ring-white/50",
                "transition-[color,background-color,border-color,box-shadow,transform] duration-200",
                "hover:border-red-200/90 hover:bg-red-50/45 hover:text-[#9f1239] hover:shadow-[0_6px_28px_rgba(185,28,28,0.08)]",
                "active:scale-[0.99]",
                "motion-reduce:backdrop-blur-md motion-reduce:backdrop-saturate-100",
              ].join(" ")}
              type="button"
              onClick={() => setClearCartDialogOpen(true)}
            >
              Очистить корзину
            </button>
          ) : null}
        </div>

        {items.length === 0 ? (
          orderSuccessId ? (
            <div className="flex flex-col items-center justify-center py-24 gap-6 max-w-md mx-auto text-center">
              <span className="material-symbols-outlined text-[#0d631b] text-7xl select-none">check_circle</span>
              <p className="text-xl font-bold text-[#0d631b]" style={{ fontFamily: "'Manrope', sans-serif" }}>
                Заявка принята
              </p>
              <p className="text-[#40493d] text-sm leading-relaxed">
                Мы свяжемся с вами по телефону. Номер заявки:{" "}
                <span className="text-lg font-extrabold tabular-nums text-[#0d631b]">{orderSuccessId}</span>
              </p>
              <Link
                to="/catalog"
                className="mt-2 bg-[#0d631b] text-white font-bold py-3 px-8 rounded-xl hover:bg-[#0a5216] transition-colors"
                onClick={() => setOrderSuccessId(null)}
              >
                Продолжить покупки
              </Link>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 gap-6">
              <span className="material-symbols-outlined text-[#bfcaba] text-8xl select-none">shopping_cart</span>
              <p className="text-xl font-semibold text-[#40493d]">Корзина пуста</p>
              <p className="text-[#707a6c] text-center max-w-xs">
                Добавьте товары из каталога, чтобы они появились здесь.
              </p>
              <Link
                to="/catalog"
                className="mt-4 bg-[#0d631b] text-white font-bold py-3 px-8 rounded-xl hover:bg-[#0a5216] transition-colors"
              >
                Перейти в каталог
              </Link>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
            {/* Левая колонка: список товаров */}
            <div className="lg:col-span-8 space-y-3 sm:space-y-4 min-w-0">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-xl p-4 sm:p-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sm:gap-6 shadow-[0_10px_30px_rgba(23,29,20,0.04)] border border-[#bfcaba]/10 group transition-all w-full min-w-0"
                >
                  <div className="w-full max-w-[8rem] sm:w-32 sm:h-32 sm:max-w-none aspect-square sm:aspect-auto mx-auto sm:mx-0 rounded-lg overflow-hidden bg-[#eff6e7] flex-shrink-0">
                    <img
                      className="w-full h-full object-cover"
                      src={item.imageUrl}
                      alt={item.name}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          "data:image/svg+xml," +
                          encodeURIComponent(
                            `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect fill="#e9f0e1" width="128" height="128" rx="8"/><text x="64" y="64" dominant-baseline="middle" text-anchor="middle" fill="#9cad98" font-family="system-ui" font-size="12">Нет фото</text></svg>`,
                          );
                      }}
                    />
                  </div>
                  <div className="flex-grow flex flex-col sm:flex-row sm:justify-between gap-4 w-full min-w-0">
                    <div className="space-y-1 min-w-0 text-center sm:text-left">
                      <h3
                        className="text-lg sm:text-xl font-bold text-[#171d14] [overflow-wrap:anywhere]"
                        style={{ fontFamily: "'Manrope', sans-serif" }}
                      >
                        {item.name}
                      </h3>
                      <p className="text-[#40493d] text-sm [overflow-wrap:anywhere]">{item.subtitle}</p>
                      <p className="text-[#0d631b] font-bold text-base sm:text-lg mt-2 tabular-nums">
                        {(item.price * item.quantity).toFixed(2)} BYN
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center sm:justify-end gap-4 sm:gap-6 mt-0 sm:mt-0 w-full sm:w-auto shrink-0">
                      <div className="flex items-center bg-[#eff6e7] rounded-full px-2 py-1">
                        <button
                          className="w-8 h-8 flex items-center justify-center hover:bg-[#dee5d6] rounded-full transition-colors"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          type="button"
                          aria-label="Уменьшить количество"
                        >
                          <span className="material-symbols-outlined text-sm">remove</span>
                        </button>
                        <span className="w-10 text-center font-semibold">{item.quantity}</span>
                        <button
                          className="w-8 h-8 flex items-center justify-center hover:bg-[#dee5d6] rounded-full transition-colors"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          type="button"
                          aria-label="Увеличить количество"
                        >
                          <span className="material-symbols-outlined text-sm">add</span>
                        </button>
                      </div>
                      <button
                        className="text-[#40493d] hover:text-[#ba1a1a] transition-colors"
                        onClick={() => removeFromCart(item.id)}
                        type="button"
                        aria-label="Удалить товар"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Правая колонка: сайдбар заказа */}
            <aside className="lg:col-span-4 space-y-4 sm:space-y-6 w-full min-w-0 lg:sticky lg:top-24 lg:self-start">
              <div className="bg-white rounded-xl p-4 sm:p-6 lg:p-8 shadow-[0_20px_50px_rgba(23,29,20,0.08)] border border-[#bfcaba]/10">
                <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6" style={{ fontFamily: "'Manrope', sans-serif" }}>
                  Ваш заказ
                </h2>
                <div className="space-y-3 sm:space-y-4 mb-6 sm:mb-8 text-sm sm:text-base">
                  <div className="flex justify-between items-start gap-3 text-[#40493d]">
                    <span className="shrink-0">Подытог</span>
                    <span className="tabular-nums text-right font-medium text-[#171d14]">{subtotal.toFixed(2)} BYN</span>
                  </div>
                  <div className="flex justify-between items-start gap-3 text-[#40493d]">
                    <span className="shrink-0">Доставка</span>
                    <span className="text-[#0d631b] font-medium text-right tabular-nums">
                      {delivery === 0 ? "Бесплатно" : `${delivery.toFixed(2)} BYN`}
                    </span>
                  </div>
                  <div className="flex justify-between items-start gap-3 text-[#40493d]">
                    <span className="shrink-0">Скидка</span>
                    <span className="text-[#874300] tabular-nums text-right">- {discount.toFixed(2)} BYN</span>
                  </div>
                  <div className="h-px bg-[#bfcaba]/20 my-3 sm:my-4" />
                  <div className="flex justify-between items-start gap-3 text-lg sm:text-xl font-extrabold">
                    <span>Итого</span>
                    <span className="text-[#0d631b] tabular-nums text-right">{Math.max(0, total).toFixed(2)} BYN</span>
                  </div>
                </div>
                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#3c6842]"
                      htmlFor="cart-delivery-phone"
                    >
                      Телефон
                    </label>
                    <input
                      id="cart-delivery-phone"
                      autoComplete="tel"
                      className="w-full bg-[#e9f0e1] rounded-lg border border-transparent focus:border-[#0d631b] focus:ring-0 px-4 py-3 text-sm text-[#171d14] placeholder:text-[#40493d]/50 min-h-[2.75rem]"
                      inputMode="tel"
                      placeholder="+375 (29) 123-45-67 или 8 (029) …"
                      type="tel"
                      value={deliveryPhone}
                      disabled={orderSubmitting}
                      onChange={(e) => setDeliveryPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#3c6842]"
                      htmlFor="cart-delivery-address"
                    >
                      Адрес доставки
                    </label>
                    <textarea
                      ref={deliveryAddressRef}
                      id="cart-delivery-address"
                      autoComplete="street-address"
                      className="min-h-[5.5rem] max-h-48 w-full resize-none overflow-y-auto rounded-lg border border-transparent bg-[#e9f0e1] px-4 py-3 text-sm text-[#171d14] placeholder:text-[#40493d]/50 focus:border-[#0d631b] focus:ring-0"
                      placeholder="Город, улица, дом, подъезд, этаж, домофон"
                      rows={1}
                      value={deliveryAddress}
                      disabled={orderSubmitting}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:relative sm:block">
                    <input
                      className="w-full bg-[#e9f0e1] rounded-lg border border-transparent focus:border-[#0d631b] focus:ring-0 px-4 py-3 sm:pr-28 text-sm placeholder:text-[#40493d]/50 min-h-[2.75rem]"
                      placeholder="Промокод"
                      type="text"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyPromo();
                      }}
                    />
                    <button
                      className="sm:absolute sm:right-2 sm:top-1.5 w-full sm:w-auto shrink-0 bg-[#dee5d6] text-[#0d631b] text-xs font-bold px-4 py-2.5 sm:py-2 rounded-md hover:bg-[#e3ebdc] transition-colors min-h-[2.5rem] sm:min-h-0"
                      onClick={applyPromo}
                      type="button"
                    >
                      Применить
                    </button>
                  </div>
                  {promoApplied && (
                    <p className="text-xs text-[#0d631b] font-medium text-center">
                      Промокод применён! Скидка 10%.
                    </p>
                  )}
                  {orderError ? (
                    <p className="text-sm font-medium text-[#ba1a1a]" role="alert">
                      {orderError}
                    </p>
                  ) : null}
                  <button
                    className="w-full bg-[#0d631b] text-white font-bold py-3.5 sm:py-4 px-4 rounded-xl hover:shadow-lg hover:shadow-[#0d631b]/20 transition-all scale-100 active:scale-95 text-sm sm:text-base min-h-[3rem] sm:min-h-0 disabled:opacity-60"
                    type="button"
                    disabled={orderSubmitting}
                    onClick={() => void submitOrder()}
                  >
                    {orderSubmitting ? "Отправка…" : "Оформить заказ"}
                  </button>
                  <p className="text-[10px] sm:text-[11px] text-[#40493d] text-center px-1 sm:px-4 leading-relaxed">
                    Нажимая на кнопку, вы соглашаетесь с условиями обработки персональных данных
                  </p>
                </div>
              </div>

              <div className="bg-[#bdefbe]/30 rounded-xl p-4 sm:p-6 flex items-start gap-3 sm:gap-4">
                <span className="material-symbols-outlined text-[#3c6842] shrink-0 text-[22px] sm:text-[24px] mt-0.5">
                  local_shipping
                </span>
                <p className="text-xs sm:text-sm text-[#3c6842] font-medium leading-snug min-w-0">
                  Бесплатная доставка при заказе от {FREE_DELIVERY_THRESHOLD} BYN
                </p>
              </div>
            </aside>
          </div>
        )}

        {/* Секция рекомендаций */}
        {recommendedToShow.length > 0 && (
          <section className="mt-12 sm:mt-16 lg:mt-20">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end mb-6 sm:mb-8">
              <h2
                className="text-2xl sm:text-3xl font-bold tracking-tight"
                style={{ fontFamily: "'Manrope', sans-serif" }}
              >
                Рекомендуем добавить
              </h2>
              <Link
                className="text-[#0d631b] font-bold hover:underline text-sm sm:text-base shrink-0 self-start sm:self-auto"
                to="/catalog"
              >
                Весь каталог
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
              {recommendedToShow.map((rec) => (
                <div
                  key={rec.id}
                  className="bg-white rounded-xl p-3 sm:p-4 min-w-0 shadow-[0_10px_20px_rgba(23,29,20,0.02)] group hover:shadow-xl transition-all border border-[#bfcaba]/5"
                >
                  <div className="aspect-square rounded-lg overflow-hidden bg-[#eff6e7] mb-4">
                    <img
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      src={rec.imageUrl}
                      alt={rec.name}
                    />
                  </div>
                  <h4 className="font-bold text-[#171d14] mb-1 text-sm sm:text-base line-clamp-2 [overflow-wrap:anywhere]">
                    {rec.name}
                  </h4>
                  <p className="text-[#40493d] text-xs mb-3">{rec.subtitle}</p>
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-[#0d631b]">{rec.price.toFixed(2)} BYN</span>
                    <button
                      className="bg-[#874300] text-white rounded-full w-8 h-8 flex items-center justify-center hover:scale-110 transition-transform"
                      onClick={() =>
                        addToCart({
                          id: rec.id,
                          name: rec.name,
                          subtitle: rec.subtitle,
                          imageUrl: rec.imageUrl,
                          price: rec.price,
                        })
                      }
                      type="button"
                      aria-label={`Добавить ${rec.name} в корзину`}
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <ClearCartDialog
        open={clearCartDialogOpen}
        onCancel={() => setClearCartDialogOpen(false)}
        onConfirm={() => {
          clearCart();
          setPromoCode("");
          setDiscount(0);
          setPromoApplied(false);
          setClearCartDialogOpen(false);
        }}
      />

      <SiteFooter />
    </div>
  );
}
