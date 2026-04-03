import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import SiteFooter from "../components/SiteFooter";

export default function Home() {
  const navigate = useNavigate();
  const images = useMemo(
    () => ({
      hero: "/img/grok-veg-fruit.jpg",
    }),
    [],
  );
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
  const HOME_CARD_IMAGE_PLACEHOLDER =
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="960" viewBox="0 0 700 960"><rect fill="#e5e7eb" width="700" height="960"/><text x="350" y="480" dominant-baseline="middle" text-anchor="middle" fill="#6b7280" font-family="system-ui,sans-serif" font-size="28">Изображение</text></svg>`,
    );
  type HomeCard = {
    slot: number;
    title: string;
    subtitle: string;
    categoryId: string | null;
    categoryName: string | null;
    imageUrl: string | null;
  };
  const [homeCards, setHomeCards] = useState<HomeCard[]>([]);

  const testimonials = useMemo(
    () => [
      {
        id: "anna",
        text: '“Качество продуктов просто потрясающее! Овощи сочные и ароматные — не как в пластиковой упаковке из супермаркета. Доставка приехала за 45 минут.”',
        name: "Анна К.",
        subtitle: "Постоянный клиент",
        avatarText: "АК",
      },
      {
        id: "elena",
        text: '“Вот такую красоту привезли сегодня! Посмотрите на эти томаты — они просто сахарные.”',
        name: "Елена П.",
        subtitle: "Любитель томатов",
        avatarText: "ЕЛ",
      },
      {
        id: "mikhail",
        text: '“Очень удобно заказывать наборы для салата. Все ингредиенты свежайшие, аккуратно упакованы. Теперь за овощами — только к вам!”',
        name: "Михаил В.",
        subtitle: "Заказывает 3 раза в неделю",
        avatarText: "МВ",
      },
      {
        id: "irina",
        text: '“Наконец-то нашла наборы, где всё действительно сочное и спелое. Курьер приезжает аккуратно, упаковка не промокает.”',
        name: "Ирина С.",
        subtitle: "Покупаю по подписке",
        avatarText: "ИС",
      },
      {
        id: "sergey",
        text: '“Порадовало качество и вкус. Особенно понравились зелень и травы: аромат остаётся даже после хранения в холодильнике.”',
        name: "Сергей М.",
        subtitle: "Любитель зелени",
        avatarText: "СМ",
      },
      {
        id: "olga",
        text: '“Свежесть держится дольше, чем у привычных овощей. Готовить стало намного проще: всё уже подобрано и сочетается.”',
        name: "Ольга Н.",
        subtitle: "Готовит дома каждый день",
        avatarText: "ОН",
      },
    ],
    [],
  );

  const [activeTestimonialIndex, setActiveTestimonialIndex] = useState(0);
  const [cardsPerView, setCardsPerView] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);

  const maxIndex = Math.max(0, testimonials.length - cardsPerView);

  useEffect(() => {
    const REVEAL_KEY = "gh_reveal_done_v1";

    try {
      if (localStorage.getItem(REVEAL_KEY) === "1") return;
    } catch {
      return;
    }

    let observer: IntersectionObserver | null = null;

    const start = () => {
      try {
        localStorage.setItem(REVEAL_KEY, "1");
      } catch {
        // ignore
      }

      const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
      for (const el of els) el.classList.add("reveal-init");

      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const el = entry.target as HTMLElement;
            el.classList.add("reveal-in");
            observer?.unobserve(el);
          }
        },
        { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
      );

      for (const el of els) observer.observe(el);
    };

    window.addEventListener("scroll", start, { once: true, passive: true });
    return () => {
      window.removeEventListener("scroll", start);
      observer?.disconnect();
      observer = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/public/home-cards`);
        if (!res.ok) throw new Error(`http_${res.status}`);
        const data = (await res.json()) as {
          ok?: boolean;
          items?: Array<{
            slot: number;
            title: string;
            subtitle: string;
            categoryId: string | null;
            categoryName: string | null;
            imageUrl: string | null;
          }>;
        };
        if (cancelled) return;
        const mapped = (data.items ?? [])
          .map((item) => ({
            slot: Number(item.slot),
            title: String(item.title ?? ""),
            subtitle: String(item.subtitle ?? ""),
            categoryId: item.categoryId ? String(item.categoryId) : null,
            categoryName: item.categoryName ? String(item.categoryName) : null,
            imageUrl: item.imageUrl ? `${API_BASE_URL}${item.imageUrl}` : null,
          }))
          .sort((a, b) => a.slot - b.slot);
        setHomeCards(mapped);
      } catch {
        if (cancelled) return;
        setHomeCards([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;

    const mq = window.matchMedia("(min-width: 768px)");

    const update = () => setCardsPerView(mq.matches ? 3 : 1);
    update();

    if (typeof (mq as any).addEventListener === "function") {
      mq.addEventListener("change", update);
    } else {
      // Fallback for older browsers
      (mq as any).addListener?.(update);
    }

    return () => {
      if (typeof (mq as any).removeEventListener === "function") {
        mq.removeEventListener("change", update);
      } else {
        // Fallback for older browsers
        (mq as any).removeListener?.(update);
      }
    };
  }, []);

  useEffect(() => {
    setActiveTestimonialIndex((prev) => Math.min(prev, maxIndex));
  }, [maxIndex]);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      "matchMedia" in window &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) return;
    if (maxIndex <= 0) return;

    const intervalId = window.setInterval(() => {
      setActiveTestimonialIndex((prev) => (prev + 1 > maxIndex ? 0 : prev + 1));
    }, 6500);

    return () => window.clearInterval(intervalId);
  }, [maxIndex]);

  useEffect(() => {
    const el = cardRefs.current[activeTestimonialIndex];
    if (!el) return;

    const frameId = window.requestAnimationFrame(() => {
      setTranslateX(-el.offsetLeft);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeTestimonialIndex, cardsPerView]);

  return (
    <>
      <Header showRightSection={false} />

      <main className="overflow-x-hidden pt-24">
        {/* BEGIN: Hero Section */}
        <section className="relative overflow-x-hidden bg-green-100 py-12 sm:py-16 lg:py-24 mx-3 sm:mx-5 lg:mx-6 rounded-2xl sm:rounded-3xl mb-4 sm:mb-5">
          <div className="container mx-auto px-4 flex flex-col lg:flex-row items-center">
            <div className="lg:w-1/2 z-10">
              <span className="inline-block bg-green-200 text-forest-green px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-6">
                Свежие фрукты и овощи · круглый год
              </span>
              <h1
                className="heading-serif text-4xl sm:text-5xl lg:text-7xl text-forest-green leading-tight mb-6"
                data-reveal
              >
                Свежие фрукты и овощи{" "}
                <span className="italic text-leaf-green">круглый год</span> — с доставкой до вашей двери
              </h1>
              <p className="text-lg text-gray-600 mb-8 max-w-lg" data-reveal>
                Удобный заказ из каталога и доставка в удобное время — чтобы на вашем столе всегда было то, что вы любите.
              </p>
              <div className="flex flex-col sm:flex-row flex-wrap gap-4" data-reveal>
                <button
                  className="bg-leaf-green hover:bg-forest-green text-white px-8 py-4 rounded-xl font-bold transition-all transform hover:-translate-y-1 w-full sm:w-auto"
                  type="button"
                  onClick={() => navigate("/catalog?seasonal=1")}
                >
                  Сезонные товары
                </button>
                <Link
                  className="border-2 border-leaf-green text-leaf-green hover:bg-leaf-green hover:text-white px-8 py-4 rounded-xl font-bold transition-all transform hover:-translate-y-1 w-full sm:w-auto text-center"
                  to="/catalog"
                >
                  Весь каталог
                </Link>
              </div>
            </div>
            <div className="lg:w-1/2 mt-12 lg:mt-0 relative group">
              <div className="rounded-3xl overflow-hidden shadow-2xl rotate-2 aspect-[4/3] sm:aspect-[16/11] transition-transform duration-500 ease-out group-hover:will-change-transform group-hover:rotate-1 group-hover:scale-[1.01]">
                <img
                  alt="Свежие овощи, фрукты и зелень"
                  className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:will-change-transform group-hover:scale-[1.05]"
                  loading="eager"
                  src={images.hero}
                />
              </div>
              {/* Rating Floating Card */}
              <div className="absolute -bottom-5 left-3 right-3 sm:left-auto sm:right-auto sm:-bottom-6 sm:-left-6 sm:max-w-none max-w-full bg-white p-3 sm:p-4 rounded-2xl shadow-xl flex items-center gap-3 sm:space-x-4">
                <div className="bg-orange-100 p-2 rounded-full">
                  <svg className="w-6 h-6 text-vibrant-orange" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Рейтинг 4.9/5</p>
                  <p className="text-xs text-gray-500">Более 2000 семей выбирают нас</p>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* END: Hero Section */}

        {/* BEGIN: Quick Features */}
        <section className="py-12 bg-white">
          <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div
              className="flex flex-col items-center text-center p-8 rounded-2xl bg-gray-50 hover:bg-green-50 transition-colors"
              data-reveal
            >
              <div className="w-12 h-12 bg-green-100 text-leaf-green rounded-full flex items-center justify-center mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
              </div>
              <h3 className="font-bold text-lg text-forest-green mb-2">Контроль качества</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Следим за свежестью и условиями хранения — вы получаете то, что заказали.
              </p>
            </div>
            {/* Feature 2 */}
            <div
              className="flex flex-col items-center text-center p-8 rounded-2xl bg-gray-50 hover:bg-orange-50 transition-colors"
              data-reveal
            >
              <div className="w-12 h-12 bg-orange-100 text-vibrant-orange rounded-full flex items-center justify-center mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                  <path
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </div>
              <h3 className="font-bold text-lg text-forest-green mb-2">Происхождение товаров</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Указываем страну и категорию — вы понимаете, что покупаете и откуда продукт.
              </p>
            </div>
            {/* Feature 3 */}
            <div
              className="flex flex-col items-center text-center p-8 rounded-2xl bg-gray-50 hover:bg-blue-50 transition-colors"
              data-reveal
            >
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </div>
              <h3 className="font-bold text-lg text-forest-green mb-2">Доставка в удобное время</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Оформите заказ заранее — привезём в выбранный интервал, когда вам удобно.
              </p>
            </div>
          </div>
        </section>
        {/* END: Quick Features */}

        {/* BEGIN: Product Categories */}
        <section className="py-16 sm:py-20 bg-soft-gray">
          <div className="container mx-auto px-4">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-12">
              <div>
                <h2 className="text-4xl font-bold text-forest-green mb-4">Категории товаров</h2>
                <p className="text-gray-500">
                  Свежие фрукты и овощи — подобрали категории так, чтобы было проще выбрать нужное.
                </p>
              </div>
              <Link className="text-leaf-green font-bold flex items-center hover:text-forest-green transition-colors" to="/catalog">
                Смотреть весь каталог
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M17 8l4 4m0 0l-4 4m4-4H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {(homeCards.length
                ? homeCards
                : Array.from({ length: 4 }, (_, idx) => ({
                    slot: idx + 1,
                    title: "",
                    subtitle: "",
                    categoryId: null,
                    categoryName: null,
                    imageUrl: null,
                  }))
              ).map((card) => (
                <Link
                  key={card.slot}
                  className="group relative rounded-3xl overflow-hidden h-72 sm:h-96 cursor-pointer shadow-lg"
                  data-reveal
                  to={card.categoryName ? `/catalog?category=${encodeURIComponent(card.categoryName)}` : "/catalog"}
                >
                  <img
                    alt={card.title || `Категория ${card.slot}`}
                    className="w-full h-full object-cover group-hover:scale-110 group-hover:will-change-transform transition-transform duration-500 transform-gpu"
                    loading="lazy"
                    src={card.imageUrl || HOME_CARD_IMAGE_PLACEHOLDER}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-8">
                    <h3 className="text-2xl font-bold text-white mb-1">{card.title || "Скоро здесь будет категория"}</h3>
                    <p className="text-white/80">{card.subtitle || "Настройте карточку в админ-панели"}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
        {/* END: Product Categories */}

        {/* BEGIN: How It Works */}
        <section className="py-24 bg-white" id="how-it-works">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-4xl font-bold text-forest-green mb-4" data-reveal>
              Как мы работаем
            </h2>
            <p className="text-gray-500 mb-16 max-w-2xl mx-auto" data-reveal>
              Простой и прозрачный путь: заказ на сайте — сборка — доставка до вашей двери.
            </p>
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center relative">
              <div className="hidden lg:block absolute top-1/2 left-0 w-full h-0.5 border-t-2 border-dashed border-leaf-green/30 -z-0" />
              <div className="flex flex-col items-center bg-white z-10 px-8 mb-12 lg:mb-0 w-full lg:w-1/3" data-reveal>
                <div className="w-20 h-20 bg-leaf-green rounded-full flex items-center justify-center text-white mb-6 shadow-xl shadow-green-100">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
                <h4 className="font-bold text-xl text-forest-green mb-3">Заказ на сайте</h4>
                <p className="text-gray-500 text-sm">
                  Выберите лучшие товары из нашего каталога и оформите заказ в пару кликов.
                </p>
              </div>
              <div className="flex flex-col items-center bg-white z-10 px-8 mb-12 lg:mb-0 w-full lg:w-1/3" data-reveal>
                <div className="w-20 h-20 bg-forest-green rounded-full flex items-center justify-center text-white mb-6 shadow-xl shadow-green-900/10">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
                <h4 className="font-bold text-xl text-forest-green mb-3">Сборка экспертами</h4>
                <p className="text-gray-500 text-sm">
                  Наши закупщики выбирают только самые спелые и красивые плоды специально для вас.
                </p>
              </div>
              <div className="flex flex-col items-center bg-white z-10 px-8 w-full lg:w-1/3" data-reveal>
                <div className="w-20 h-20 bg-vibrant-orange rounded-full flex items-center justify-center text-white mb-6 shadow-xl shadow-orange-100">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
                <h4 className="font-bold text-xl text-forest-green mb-3">Доставка до двери</h4>
                <p className="text-gray-500 text-sm">
                  Курьер доставит заказ аккуратно и вовремя — в удобный для вас интервал.
                </p>
              </div>
            </div>
          </div>
        </section>
        {/* END: How It Works */}

        {/* BEGIN: Testimonials */}
        <section className="py-24 bg-soft-gray overflow-hidden">
          <div className="container mx-auto px-4">
            <h2 className="text-4xl font-bold text-forest-green text-center mb-4" data-reveal>
              Отзывы наших клиентов
            </h2>
            <p className="text-gray-500 text-center mb-16" data-reveal>
              Более 10,000 счастливых семей уже доверяют нам свой рацион.
            </p>
            <div className="relative" data-reveal>
              <div className="overflow-hidden">
                <div
                  className="flex gap-0 md:gap-4 transition-transform duration-500 ease-out transform-gpu"
                  style={{ transform: `translate3d(${translateX}px, 0, 0)` }}
                >
                  {testimonials.map((t, idx) => (
                    <div
                      key={t.id}
                      ref={(el) => {
                        cardRefs.current[idx] = el;
                      }}
                      className="shrink-0 w-full md:w-[calc((100%-2rem)/3)]"
                    >
                      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full min-h-[320px] transition-[transform,box-shadow,border-color] duration-300 ease-out hover:will-change-transform hover:-translate-y-2 hover:shadow-xl hover:border-gray-200">
                        <div className="flex text-yellow-400 mb-4">
                          <svg className="w-5 h-5 fill-current" viewBox="0 0 20 20" aria-hidden="true">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        </div>

                        <p className="text-gray-600 mb-8 flex-grow italic">{t.text}</p>

                        <div className="flex items-center space-x-4 border-t pt-6 border-gray-50">
                          <div className="w-12 h-12 rounded-full bg-leaf-green/10 text-leaf-green font-bold flex items-center justify-center">
                            {t.avatarText}
                          </div>
                          <div>
                            <p className="font-bold text-forest-green">{t.name}</p>
                            <p className="text-xs text-gray-400 uppercase tracking-widest">{t.subtitle}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                aria-label="Предыдущий отзыв"
                disabled={maxIndex <= 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white border border-gray-200 shadow-sm hover:border-gray-300 hover:shadow-md transition-shadow flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() =>
                  setActiveTestimonialIndex((prev) => (prev - 1 < 0 ? maxIndex : prev - 1))
                }
              >
                <svg className="w-5 h-5 text-gray-600" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M12.5 4.5L7.5 9.5L12.5 14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>

              <button
                type="button"
                aria-label="Следующий отзыв"
                disabled={maxIndex <= 0}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white border border-gray-200 shadow-sm hover:border-gray-300 hover:shadow-md transition-shadow flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() =>
                  setActiveTestimonialIndex((prev) => (prev + 1 > maxIndex ? 0 : prev + 1))
                }
              >
                <svg className="w-5 h-5 text-gray-600" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M7.5 4.5L12.5 9.5L7.5 14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>

              <div className="flex items-center justify-center gap-2 mt-6">
                {Array.from({ length: maxIndex + 1 }).map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    aria-label={`Перейти к группе отзывов ${idx + 1}`}
                    className={[
                      "w-2.5 h-2.5 rounded-full transition-colors",
                      idx === activeTestimonialIndex ? "bg-leaf-green" : "bg-gray-300 hover:bg-gray-400",
                    ].join(" ")}
                    onClick={() => setActiveTestimonialIndex(idx)}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
        {/* END: Testimonials */}

        {/* BEGIN: CTA Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="bg-forest-green rounded-[3rem] p-12 lg:p-20 text-center relative overflow-hidden" data-reveal>
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-leaf-green opacity-20 rounded-full" />
              <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-vibrant-orange opacity-20 rounded-full" />
              <div className="relative z-10 max-w-2xl mx-auto">
                <h2 className="heading-serif text-4xl lg:text-5xl text-white mb-6">Готовы попробовать самое свежее?</h2>
                <p className="text-green-100/80 mb-10 text-lg">
                  Загляните в каталог — подберите фрукты, овощи и зелень на любой вкус. Рассылку и сбор контактов мы не ведём, просто свежие продукты на вашем столе.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-stretch sm:items-center">
                  <Link
                    className="inline-flex justify-center items-center bg-vibrant-orange hover:bg-orange-600 text-white font-bold px-10 py-4 rounded-xl transition-all transform hover:-translate-y-1 w-full sm:w-auto text-center shadow-lg shadow-black/10"
                    to="/catalog"
                  >
                    Весь каталог
                  </Link>
                  <button
                    className="inline-flex justify-center items-center border-2 border-white/90 text-white font-bold px-10 py-4 rounded-xl transition-all transform hover:-translate-y-1 hover:bg-white hover:text-forest-green w-full sm:w-auto"
                    type="button"
                    onClick={() => navigate("/catalog?seasonal=1")}
                  >
                    Сезонные товары
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* END: CTA Section */}
      </main>

      <SiteFooter />
    </>
  );
}

