import type { SelectHTMLAttributes } from "react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ScheduleFrequency = "daily" | "twice_weekly" | "weekly" | "by_agreement";

export type SupplierScheduleEntry = {
  weekday: number | null;
  timeLabel: string;
  frequency: ScheduleFrequency;
};

export type Supplier = {
  id: string;
  name: string;
  phone: string;
  whatsapp: string;
  email: string;
  addressRegion: string;
  productTags: string[];
  scheduleEntries: SupplierScheduleEntry[];
  lastDeliveryAt: string | null;
  nextDeliveryAt: string | null;
  nextDeliveryStatus: "expected" | "overdue" | "none";
  isActive: boolean;
  notes: string;
};

const PRODUCT_PRESETS: { id: string; label: string }[] = [
  { id: "fruits", label: "Фрукты" },
  { id: "vegetables", label: "Овощи" },
  { id: "berries", label: "Ягоды" },
  { id: "greens", label: "Зелень" },
  { id: "other", label: "Другое" },
];

const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const FREQ_LABEL: Record<ScheduleFrequency, string> = {
  daily: "Ежедневно",
  twice_weekly: "2 раза в неделю",
  weekly: "Раз в неделю",
  by_agreement: "По договорённости",
};

const selectBaseClass =
  "w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none";

/** Одна системная стрелка у select (без appearance-none + дублирующей иконки). */
function SelectWithChevron(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...rest } = props;
  return (
    <select {...rest} className={[selectBaseClass, className].filter(Boolean).join(" ")}>
      {children}
    </select>
  );
}

function formatDateRu(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function statusBadge(s: Supplier) {
  if (!s.nextDeliveryAt) return { text: "Нет даты", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };
  if (s.nextDeliveryStatus === "overdue") {
    return { text: "Просрочено", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nd = new Date(s.nextDeliveryAt + "T12:00:00");
  nd.setHours(0, 0, 0, 0);
  const diff = (nd.getTime() - today.getTime()) / 86400000;
  if (diff === 0) return { text: "Сегодня", className: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100" };
  if (diff === 1) return { text: "Завтра", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100" };
  return { text: "Ожидается", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" };
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const MONTH_NAMES_RU = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

function buildMonthGrid(year: number, month: number): Array<{ day: number | null; iso: string | null }> {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = (first.getDay() + 6) % 7;
  const out: Array<{ day: number | null; iso: string | null }> = [];
  for (let i = 0; i < startPad; i++) out.push({ day: null, iso: null });
  for (let d = 1; d <= last.getDate(); d++) {
    const iso = toIsoDate(new Date(year, month, d));
    out.push({ day: d, iso });
  }
  return out;
}

function supplierDisplayName(s: Supplier): string {
  const n = s.name?.trim();
  return n ? n : "Без названия";
}

type Props = {
  adminFetchJson: <T,>(path: string, init?: RequestInit) => Promise<T>;
  setError: (msg: string | null) => void;
};

export function AdminSuppliers(props: Props) {
  const { adminFetchJson, setError } = props;

  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [product, setProduct] = useState("");
  const [calendarDay, setCalendarDay] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [formOpen, setFormOpen] = useState<"create" | { edit: Supplier } | null>(null);
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);
  const [historyItems, setHistoryItems] = useState<
    Array<{ id: string; deliveredAt: string; note: string }>
  >([]);
  const [historyNote, setHistoryNote] = useState("");
  const [historyDate, setHistoryDate] = useState(() => toIsoDate(new Date()));
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q), 400);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
      if (product) params.set("product", product);
      const qs = params.toString();
      const data = await adminFetchJson<{ ok: boolean; items: Supplier[] }>(
        `/api/admin/suppliers${qs ? `?${qs}` : ""}`,
      );
      setItems(data.items ?? []);
    } catch {
      setError("Не удалось загрузить поставщиков.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, debouncedQ, product, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!calendarDay) return items;
    return items.filter((s) => s.nextDeliveryAt === calendarDay);
  }, [items, calendarDay]);

  const soonList = useMemo(() => {
    const t = toIsoDate(new Date());
    const tm = toIsoDate(addDays(new Date(), 1));
    return items.filter(
      (s) => s.isActive && s.nextDeliveryAt && (s.nextDeliveryAt === t || s.nextDeliveryAt === tm),
    );
  }, [items]);

  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const today = toIsoDate(new Date());
    for (const s of items) {
      if (!s.isActive || !s.nextDeliveryAt) continue;
      if (s.nextDeliveryAt === today && s.nextDeliveryStatus !== "overdue") {
        const key = `${s.id}-${today}`;
        if (notifiedRef.current.has(key)) continue;
        notifiedRef.current.add(key);
        new Notification("Поставка сегодня", { body: `${supplierDisplayName(s)} — ожидается поставка` });
      }
    }
  }, [items]);

  const monthCells = useMemo(
    () => buildMonthGrid(calendarMonth.getFullYear(), calendarMonth.getMonth()),
    [calendarMonth],
  );

  const countsByDate = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of items) {
      if (!s.isActive || !s.nextDeliveryAt) continue;
      m[s.nextDeliveryAt] = (m[s.nextDeliveryAt] ?? 0) + 1;
    }
    return m;
  }, [items]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const openHistory = async (s: Supplier) => {
    setHistoryFor({ id: s.id, name: supplierDisplayName(s) });
    setHistoryNote("");
    setHistoryDate(toIsoDate(new Date()));
    try {
      const data = await adminFetchJson<{ ok: boolean; items: Array<{ id: string; deliveredAt: string; note: string }> }>(
        `/api/admin/suppliers/${encodeURIComponent(s.id)}/history`,
      );
      setHistoryItems(data.items ?? []);
    } catch {
      setHistoryItems([]);
    }
  };

  const addHistory = async () => {
    if (!historyFor) return;
    try {
      await adminFetchJson(`/api/admin/suppliers/${encodeURIComponent(historyFor.id)}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: historyNote, deliveredAt: `${historyDate}T12:00:00` }),
      });
      setHistoryNote("");
      const data = await adminFetchJson<{ ok: boolean; items: Array<{ id: string; deliveredAt: string; note: string }> }>(
        `/api/admin/suppliers/${encodeURIComponent(historyFor.id)}/history`,
      );
      setHistoryItems(data.items ?? []);
    } catch {
      setError("Не удалось сохранить запись.");
    }
  };

  const requestNotifications = () => {
    if (typeof Notification === "undefined") return;
    void Notification.requestPermission();
  };

  return (
    <div className="space-y-6">
      {soonList.length ? (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/20 px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-amber-900 dark:text-amber-100">Скоро поставки:</span>
          <div className="flex flex-wrap gap-2">
            {soonList.map((s) => (
              <span
                key={s.id}
                className="text-xs px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-50"
              >
                {supplierDisplayName(s)} ({formatDateRu(s.nextDeliveryAt)})
              </span>
            ))}
          </div>
          <button
            className="text-xs font-semibold text-primary hover:underline ml-auto"
            type="button"
            onClick={requestNotifications}
          >
            Разрешить уведомления в браузере
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="min-w-[12rem] flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm focus:ring-primary focus:border-primary"
          placeholder="Поиск по имени или телефону..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="min-w-[10rem]">
          <SelectWithChevron
            className="!rounded-xl !px-3 !py-2.5 !border-slate-200 dark:!border-slate-700"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
          >
            <option value="">Все продукты</option>
            {PRODUCT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </SelectWithChevron>
        </div>
        <button
          className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-bold"
          type="button"
          onClick={() => void load()}
        >
          Обновить
        </button>
        <button
          className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-bold ml-auto"
          type="button"
          onClick={() => {
            setError(null);
            setFormOpen("create");
          }}
        >
          + Добавить поставщика
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-4">
          {loading ? (
            <p className="text-sm text-slate-500">Загрузка...</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-8 text-center text-slate-500 text-sm">
              Поставщики не найдены. Измените фильтры или добавьте нового.
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                      <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Поставщик</th>
                      <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Контакты</th>
                      <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Продукты</th>
                      <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">След. поставка</th>
                      <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Статус</th>
                      <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filtered.map((s) => {
                      const st = statusBadge(s);
                      return (
                        <Fragment key={s.id}>
                          <tr
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer"
                            onClick={() => {
                              setError(null);
                              setFormOpen({ edit: s });
                            }}
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900 dark:text-slate-100">{supplierDisplayName(s)}</div>
                              <div className="text-xs text-slate-500">{s.addressRegion || "—"}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                              <div>{s.phone || "—"}</div>
                              {s.whatsapp ? <div className="text-xs">Мессенджер: {s.whatsapp}</div> : null}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {(s.productTags ?? []).slice(0, 4).map((t) => (
                                  <span
                                    key={t}
                                    className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                  >
                                    {t.startsWith("custom:") ? t.slice(7) : PRODUCT_PRESETS.find((p) => p.id === t)?.label ?? t}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">{formatDateRu(s.nextDeliveryAt)}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.className}`}>{st.text}</span>
                              {!s.isActive ? (
                                <span className="ml-1 text-xs text-slate-400">(неактивен)</span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <button
                                className="text-primary text-xs font-semibold mr-2"
                                type="button"
                                onClick={() => void openHistory(s)}
                              >
                                История
                              </button>
                              <button
                                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                                type="button"
                                onClick={() => toggleExpand(s.id)}
                                aria-expanded={expanded[s.id]}
                              >
                                {expanded[s.id] ? "▲ График" : "▼ График"}
                              </button>
                            </td>
                          </tr>
                          {expanded[s.id] ? (
                            <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                              <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300" colSpan={6}>
                                <strong className="text-slate-800 dark:text-slate-100">График:</strong>
                                <ul className="mt-2 space-y-1 list-disc list-inside">
                                  {(s.scheduleEntries ?? []).length ? (
                                    s.scheduleEntries.map((e, i) => (
                                      <li key={i}>
                                        {e.frequency === "by_agreement"
                                          ? "По договорённости"
                                          : e.weekday != null
                                            ? `${WEEKDAYS_SHORT[((e.weekday ?? 1) - 1 + 7) % 7]}, ${e.timeLabel || "время не указано"} — ${FREQ_LABEL[e.frequency]}`
                                            : `${e.timeLabel || "—"} — ${FREQ_LABEL[e.frequency]}`}
                                      </li>
                                    ))
                                  ) : (
                                    <li>Не указан</li>
                                  )}
                                </ul>
                                {s.notes ? (
                                  <p className="mt-2 text-slate-500">
                                    <strong>Примечание:</strong> {s.notes}
                                  </p>
                                ) : null}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-3">
                {filtered.map((s) => {
                  const st = statusBadge(s);
                  return (
                    <button
                      key={s.id}
                      className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm"
                      type="button"
                      onClick={() => {
                        setError(null);
                        setFormOpen({ edit: s });
                      }}
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-bold">{supplierDisplayName(s)}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${st.className}`}>{st.text}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{s.phone}</p>
                      <p className="text-xs mt-2">След.: {formatDateRu(s.nextDeliveryAt)}</p>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm h-fit xl:sticky xl:top-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Календарь поставок</h4>
            <button
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-semibold shrink-0"
              type="button"
              onClick={() => setCalendarOpen((o) => !o)}
            >
              {calendarOpen ? "Свернуть" : "Открыть"}
            </button>
          </div>
          {calendarOpen ? (
            <>
              <div className="flex items-center justify-between gap-2 mb-2">
                <button
                  className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-sm"
                  type="button"
                  onClick={() =>
                    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                  }
                  aria-label="Предыдущий месяц"
                >
                  ←
                </button>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 text-center flex-1">
                  {MONTH_NAMES_RU[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                </span>
                <button
                  className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-sm"
                  type="button"
                  onClick={() =>
                    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                  }
                  aria-label="Следующий месяц"
                >
                  →
                </button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                {WEEKDAYS_SHORT.map((w) => (
                  <div key={w} className="py-1">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {monthCells.map((cell, idx) => {
                  if (cell.day === null || !cell.iso) {
                    return <div key={`pad-${idx}`} className="min-h-[2.25rem]" />;
                  }
                  const c = countsByDate[cell.iso] ?? 0;
                  const sel = calendarDay === cell.iso;
                  const hasSupply = c > 0;
                  return (
                    <button
                      key={cell.iso}
                      className={[
                        "min-h-[2.25rem] rounded-lg py-1 flex flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors",
                        sel
                          ? "bg-primary text-white ring-2 ring-primary/40"
                          : hasSupply
                            ? "bg-emerald-200/90 text-emerald-950 dark:bg-emerald-600/40 dark:text-emerald-50 hover:bg-emerald-300/90 dark:hover:bg-emerald-500/50"
                            : "bg-slate-100 dark:bg-slate-800 hover:bg-primary/15 text-slate-800 dark:text-slate-100",
                      ].join(" ")}
                      title={hasSupply ? `${c} поставок` : undefined}
                      type="button"
                      onClick={() => setCalendarDay((prev) => (prev === cell.iso ? null : cell.iso))}
                    >
                      <span>{cell.day}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-500">
              Нажмите «Открыть», чтобы увидеть месяц: дни с запланированными поставками подсвечены. Выберите день, чтобы
              отфильтровать список.
            </p>
          )}
          {calendarDay ? (
            <p className="text-xs text-slate-500 mt-2">
              Фильтр: {formatDateRu(calendarDay)}{" "}
              <button className="text-primary font-semibold" type="button" onClick={() => setCalendarDay(null)}>
                сбросить
              </button>
            </p>
          ) : calendarOpen ? (
            <p className="text-xs text-slate-500 mt-2">Нажмите на день, чтобы отфильтровать список.</p>
          ) : null}
        </div>
      </div>

      {formOpen ? (
        <SupplierFormModal
          key={formOpen === "create" ? "create" : formOpen.edit.id}
          mode={formOpen}
          onClose={() => setFormOpen(null)}
          adminFetchJson={adminFetchJson}
          setError={setError}
          onSaved={() => {
            setFormOpen(null);
            void load();
          }}
        />
      ) : null}

      {historyFor ? (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setHistoryFor(null)} role="presentation" />
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <h4 className="text-lg font-bold">История: {historyFor.name}</h4>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {historyItems.length ? (
                historyItems.map((h) => (
                  <div key={h.id} className="text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                    <div className="text-xs text-slate-500">{new Date(h.deliveredAt).toLocaleString("ru-RU")}</div>
                    <div>{h.note || "—"}</div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Пока нет записей.</p>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <label className="block text-xs font-medium text-slate-600">Дата поставки</label>
              <input
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm"
                type="date"
                value={historyDate}
                onChange={(e) => setHistoryDate(e.target.value)}
              />
              <textarea
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm"
                placeholder="Комментарий"
                rows={2}
                value={historyNote}
                onChange={(e) => setHistoryNote(e.target.value)}
              />
              <button
                className="w-full py-2.5 rounded-xl bg-primary text-white font-bold text-sm"
                type="button"
                onClick={() => void addHistory()}
              >
                Добавить запись
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SupplierFormModal(props: {
  mode: "create" | { edit: Supplier };
  onClose: () => void;
  adminFetchJson: <T,>(path: string, init?: RequestInit) => Promise<T>;
  setError: (msg: string | null) => void;
  onSaved: () => void;
}) {
  const { mode, onClose, adminFetchJson, setError, onSaved } = props;
  const isEdit = mode !== "create";
  const initial = isEdit ? mode.edit : null;

  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [addressRegion, setAddressRegion] = useState(initial?.addressRegion ?? "");
  const [productTags, setProductTags] = useState<string[]>(initial?.productTags ?? []);
  const [customTag, setCustomTag] = useState("");
  const [scheduleEntries, setScheduleEntries] = useState<SupplierScheduleEntry[]>(
    initial?.scheduleEntries?.length ? initial.scheduleEntries : [],
  );
  const [lastDeliveryAt, setLastDeliveryAt] = useState(initial?.lastDeliveryAt ?? "");
  const [nextDeliveryAt, setNextDeliveryAt] = useState(initial?.nextDeliveryAt ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive !== false);
  const [saving, setSaving] = useState(false);

  const togglePreset = (id: string) => {
    setProductTags((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const addCustomTag = () => {
    const t = customTag.trim();
    if (!t) return;
    const key = `custom:${t}`;
    setProductTags((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setCustomTag("");
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const body = {
      name: name.trim(),
      phone: phone.trim(),
      whatsapp: whatsapp.trim(),
      email: email.trim(),
      addressRegion: addressRegion.trim(),
      productTags,
      scheduleEntries,
      lastDeliveryAt: lastDeliveryAt.trim() || null,
      nextDeliveryAt: nextDeliveryAt.trim() || null,
      notes: notes.trim(),
      isActive,
    };
    try {
      if (isEdit && initial) {
        await adminFetchJson(`/api/admin/suppliers/${encodeURIComponent(initial.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await adminFetchJson(`/api/admin/suppliers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      onSaved();
    } catch {
      setError("Не удалось сохранить.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!isEdit || !initial) return;
    if (!window.confirm("Удалить поставщика безвозвратно?")) return;
    try {
      await adminFetchJson(`/api/admin/suppliers/${encodeURIComponent(initial.id)}`, { method: "DELETE" });
      onSaved();
    } catch {
      setError("Не удалось удалить.");
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} role="presentation" />
      <div className="relative w-full max-w-2xl my-8 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800">
          <h4 className="text-lg font-bold">{isEdit ? "Редактировать поставщика" : "Новый поставщик"}</h4>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium mb-1">Название / ФИО</label>
            <input
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Телефон</label>
              <input
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Контакт в мессенджере</label>
              <input
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2"
                placeholder="@username или +7…"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Сюда вводят ник или номер поставщика в любом мессенджере (WhatsApp, Telegram, Viber и т.д.).
              </p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Адрес / регион поставок</label>
            <input
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2"
              value={addressRegion}
              onChange={(e) => setAddressRegion(e.target.value)}
            />
          </div>
          <div>
            <span className="block text-sm font-medium mb-2">Продукты</span>
            <div className="flex flex-wrap gap-2">
              {PRODUCT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={[
                    "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors",
                    productTags.includes(p.id)
                      ? "bg-primary text-white border-primary"
                      : "border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800",
                  ].join(" ")}
                  type="button"
                  onClick={() => togglePreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <input
                className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm"
                placeholder="Свой вариант"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomTag();
                  }
                }}
              />
              <button className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold" type="button" onClick={addCustomTag}>
                +
              </button>
            </div>
          </div>
          <div>
            <span className="block text-sm font-medium mb-2">График поставок</span>
            <div className="space-y-2">
              {scheduleEntries.map((row, idx) => (
                <div key={idx} className="flex flex-wrap gap-2 items-end p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80">
                  <div className="w-[min(100%,11rem)] min-w-[8rem]">
                    <SelectWithChevron
                      value={row.frequency}
                      onChange={(e) => {
                        const f = e.target.value as ScheduleFrequency;
                        setScheduleEntries((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, frequency: f, weekday: f === "by_agreement" ? null : r.weekday } : r,
                          ),
                        );
                      }}
                    >
                      {(Object.keys(FREQ_LABEL) as ScheduleFrequency[]).map((k) => (
                        <option key={k} value={k}>
                          {FREQ_LABEL[k]}
                        </option>
                      ))}
                    </SelectWithChevron>
                  </div>
                  {row.frequency !== "by_agreement" ? (
                    <div className="w-24 shrink-0">
                      <SelectWithChevron
                        value={row.weekday ?? 1}
                        onChange={(e) =>
                          setScheduleEntries((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, weekday: Number(e.target.value) } : r)),
                          )
                        }
                      >
                        {WEEKDAYS_SHORT.map((label, i) => (
                          <option key={label} value={i + 1}>
                            {label}
                          </option>
                        ))}
                      </SelectWithChevron>
                    </div>
                  ) : null}
                  <input
                    className="flex-1 min-w-[8rem] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
                    placeholder="Время, напр. Утро 8:00"
                    value={row.timeLabel}
                    onChange={(e) =>
                      setScheduleEntries((prev) => prev.map((r, i) => (i === idx ? { ...r, timeLabel: e.target.value } : r)))
                    }
                  />
                  <button
                    className="text-red-500 text-sm"
                    type="button"
                    onClick={() => setScheduleEntries((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    Удалить
                  </button>
                </div>
              ))}
              <button
                className="text-sm text-primary font-semibold"
                type="button"
                onClick={() =>
                  setScheduleEntries((prev) => [...prev, { weekday: 1, timeLabel: "", frequency: "weekly" }])
                }
              >
                + Добавить слот
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Последняя поставка</label>
              <input
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2"
                type="date"
                value={lastDeliveryAt}
                onChange={(e) => setLastDeliveryAt(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Следующая поставка</label>
              <input
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2"
                type="date"
                value={nextDeliveryAt}
                onChange={(e) => setNextDeliveryAt(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              checked={isActive}
              className="rounded border-slate-300 text-primary"
              onChange={(e) => setIsActive(e.target.checked)}
              type="checkbox"
            />
            <span className="text-sm font-medium">Активен</span>
          </label>
          <div>
            <label className="block text-sm font-medium mb-1">Примечания</label>
            <textarea
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
          <button
            className="flex-1 min-w-[8rem] py-3 rounded-xl bg-primary text-white font-bold disabled:opacity-50"
            disabled={saving}
            type="button"
            onClick={() => void save()}
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
          <button className="py-3 px-6 rounded-xl border border-slate-200 dark:border-slate-600 font-bold" type="button" onClick={onClose}>
            Отмена
          </button>
          {isEdit ? (
            <button className="py-3 px-6 rounded-xl border border-red-200 text-red-600 font-bold ml-auto" type="button" onClick={() => void remove()}>
              Удалить
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
