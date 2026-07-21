import React, { useState, useEffect, useMemo } from "react";

/* ============================================================
   КРЕДИТНЫЙ БРОКЕР · для строительных компаний
   - Воронка заявок
   - База банков-партнёров и их кредитных продуктов
   - Движок подбора ("интеграция": заявка прогоняется по
     критериям банков и возвращает офферы как от их API)
   - Сравнение предложений и фиксация комиссии
   ============================================================ */

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap');
`;

const C = {
  bg: "#f4f2ee",
  panel: "#ffffff",
  ink: "#1c1a17",
  sub: "#6b655c",
  line: "#e4e0d8",
  amber: "#e8590c",
  amberSoft: "#fdf0e6",
  navy: "#1f3a5f",
};

const display = { fontFamily: "'Bricolage Grotesque', sans-serif" };
const body = { fontFamily: "'Hanken Grotesk', sans-serif" };
const mono = { fontFamily: "'JetBrains Mono', monospace" };

const fmtMln = (n) => new Intl.NumberFormat("ru-RU").format(n);
const fmtRub = (n) => fmtMln(Math.round(n)) + " ₽";

/* ---------------- Банки-партнёры (критерии = их "API") ------------- */
const BANKS = [
  {
    id: "sber", name: "Сбербанк", tag: "Крупный · консервативный",
    minRevenue: 300, minYears: 3, maxLoan: 2000, baseRate: 16.5, speed: 7,
    purposes: ["project_finance", "working_capital", "equipment"],
  },
  {
    id: "vtb", name: "ВТБ", tag: "Проектное финансирование",
    minRevenue: 200, minYears: 2, maxLoan: 1500, baseRate: 17.0, speed: 6,
    purposes: ["project_finance", "contract_finance"],
  },
  {
    id: "psb", name: "ПСБ", tag: "Госконтракты · подряд",
    minRevenue: 80, minYears: 1, maxLoan: 800, baseRate: 18.2, speed: 4,
    purposes: ["contract_finance", "working_capital", "project_finance"],
  },
  {
    id: "alfa", name: "Альфа-Банк", tag: "Быстро · гибко",
    minRevenue: 50, minYears: 1, maxLoan: 500, baseRate: 19.5, speed: 2,
    purposes: ["working_capital", "equipment", "contract_finance"],
  },
  {
    id: "sovcom", name: "Совкомбанк", tag: "Лизинг техники",
    minRevenue: 40, minYears: 1, maxLoan: 350, baseRate: 18.9, speed: 3,
    purposes: ["equipment"],
  },
  {
    id: "tbank", name: "Т-Банк", tag: "Оборотка для МСБ",
    minRevenue: 25, minYears: 1, maxLoan: 150, baseRate: 21.0, speed: 1,
    purposes: ["working_capital"],
  },
];

const PURPOSES = {
  working_capital: "Оборотные средства",
  equipment: "Спецтехника / оборудование",
  project_finance: "Проектное финансирование",
  contract_finance: "Исполнение контракта",
};

const RATING_ADJ = { A: -1.5, B: 0, C: 2.5 };
const RATING_PROB = { A: 0.92, B: 0.7, C: 0.45 };

/* ---------------- Движок подбора (интеграция с банками) ------------ */
function matchBanks(app) {
  const offers = [];
  for (const b of BANKS) {
    const reasons = [];
    if (app.revenue < b.minRevenue) reasons.push(`выручка < ${b.minRevenue} млн`);
    if (app.years < b.minYears) reasons.push(`стаж < ${b.minYears} г.`);
    if (!b.purposes.includes(app.purpose)) reasons.push("цель не поддерживается");
    if (reasons.length) {
      offers.push({ bankId: b.id, declined: true, reasons });
      continue;
    }
    const rate = +(b.baseRate + RATING_ADJ[app.rating] + (app.years >= 5 ? -0.5 : 0)).toFixed(1);
    const approved = Math.min(app.amount, b.maxLoan, Math.round(app.revenue * (app.rating === "C" ? 1.2 : 2)));
    let prob = RATING_PROB[app.rating];
    if (app.amount > b.maxLoan) prob *= 0.7;
    const monthly = (approved * (rate / 100 / 12)) /
      (1 - Math.pow(1 + rate / 100 / 12, -app.term));
    offers.push({
      bankId: b.id, declined: false, rate,
      approved, term: app.term, speed: b.speed,
      probability: Math.round(Math.min(prob, 0.98) * 100),
      monthly: Math.round(monthly),
    });
  }
  return offers.sort((a, b) => {
    if (a.declined !== b.declined) return a.declined ? 1 : -1;
    if (a.declined) return 0;
    return a.rate - b.rate;
  });
}

/* ---------------- Сид-данные --------------------------------------- */
const SEED = [
  {
    id: "APP-1042", company: "СтройМонолит ГК", inn: "7701234567",
    revenue: 640, years: 8, rating: "A", amount: 450, term: 36,
    purpose: "project_finance", status: "offers", created: "2026-05-28",
  },
  {
    id: "APP-1041", company: "ВысотаСтрой ООО", inn: "5009876543",
    revenue: 120, years: 4, rating: "B", amount: 180, term: 24,
    purpose: "contract_finance", status: "approved", created: "2026-05-21",
    chosenBank: "psb",
  },
  {
    id: "APP-1040", company: "ТехГрадо ИП", inn: "6612345678",
    revenue: 55, years: 2, rating: "B", amount: 90, term: 18,
    purpose: "equipment", status: "sent", created: "2026-06-02",
  },
  {
    id: "APP-1039", company: "ПромКаркас ООО", inn: "7809988776",
    revenue: 30, years: 1, rating: "C", amount: 220, term: 36,
    purpose: "working_capital", status: "rejected", created: "2026-05-15",
  },
];

const STATUS = {
  new: { label: "Новая", c: "#6b655c", bg: "#efece6" },
  sent: { label: "В банках", c: "#1f3a5f", bg: "#e6edf5" },
  offers: { label: "Есть офферы", c: "#b45309", bg: "#fdf0e6" },
  approved: { label: "Одобрено", c: "#15803d", bg: "#e7f4ec" },
  rejected: { label: "Отказ", c: "#b91c1c", bg: "#fbe9e9" },
};

/* ============================================================ */
export default function App() {
  const [apps, setApps] = useState(SEED);
  const [view, setView] = useState("dash");
  const [openApp, setOpenApp] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // загрузка из персистентного хранилища
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("broker:apps");
        if (r && r.value) setApps(JSON.parse(r.value));
      } catch (e) { /* первый запуск — используем SEED */ }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try { await window.storage.set("broker:apps", JSON.stringify(apps)); }
      catch (e) { /* офлайн-режим */ }
    })();
  }, [apps, loaded]);

  const kpi = useMemo(() => {
    const active = apps.filter((a) => ["new", "sent", "offers"].includes(a.status)).length;
    const appr = apps.filter((a) => a.status === "approved");
    const volume = appr.reduce((s, a) => {
      const o = matchBanks(a).find((x) => x.bankId === a.chosenBank);
      return s + (o ? o.approved : a.amount);
    }, 0);
    const finished = apps.filter((a) => ["approved", "rejected"].includes(a.status)).length;
    const conv = finished ? Math.round((appr.length / finished) * 100) : 0;
    return { active, volume, conv, commission: volume * 0.015 };
  }, [apps]);

  const byBank = useMemo(() => {
    const m = {};
    BANKS.forEach((b) => (m[b.id] = 0));
    apps.forEach((a) => {
      if (a.status === "approved" && a.chosenBank) {
        const o = matchBanks(a).find((x) => x.bankId === a.chosenBank);
        m[a.chosenBank] += o ? o.approved : a.amount;
      }
    });
    return BANKS.map((b) => ({ name: b.name, v: m[b.id] })).sort((x, y) => y.v - x.v);
  }, [apps]);

  const createApp = (form) => {
    const id = "APP-" + (1043 + apps.filter((a) => a.id.startsWith("APP")).length);
    const app = {
      ...form, id, status: "offers",
      created: new Date().toISOString().slice(0, 10),
    };
    setApps([app, ...apps]);
    setShowNew(false);
    setOpenApp(app.id);
  };

  const chooseOffer = (appId, bankId) => {
    setApps(apps.map((a) => (a.id === appId ? { ...a, status: "approved", chosenBank: bankId } : a)));
  };

  const current = apps.find((a) => a.id === openApp);

  return (
    <div style={{ ...body, background: C.bg, color: C.ink, minHeight: "100vh" }}>
      <style>{FONTS}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* Сайдбар */}
        <aside style={{
          width: 240, background: C.ink, color: "#e9e5dd", padding: "26px 18px",
          display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 34 }}>
            <div style={{
              width: 34, height: 34, background: C.amber, borderRadius: 8,
              display: "grid", placeItems: "center", ...display, fontWeight: 800, color: "#fff", fontSize: 18,
            }}>К</div>
            <div>
              <div style={{ ...display, fontWeight: 700, fontSize: 16, lineHeight: 1 }}>КРЕДО·Брокер</div>
              <div style={{ fontSize: 11, color: "#9b948a" }}>стройфинансирование</div>
            </div>
          </div>
          {[
            ["dash", "Дашборд"], ["apps", "Заявки"], ["banks", "Банки-партнёры"],
          ].map(([k, l]) => (
            <button key={k} onClick={() => { setView(k); setOpenApp(null); }}
              style={{
                textAlign: "left", padding: "11px 14px", marginBottom: 4, borderRadius: 9,
                border: "none", cursor: "pointer", fontSize: 14.5, ...body, fontWeight: 500,
                background: view === k && !openApp ? C.amber : "transparent",
                color: view === k && !openApp ? "#fff" : "#cfc9bf",
              }}>{l}</button>
          ))}
          <div style={{ marginTop: "auto", fontSize: 11, color: "#7e776d", lineHeight: 1.5 }}>
            Демо-движок подбора. Реальная интеграция — через API/скоринг банков.
          </div>
        </aside>

        {/* Контент */}
        <main style={{ flex: 1, padding: "32px 40px", maxWidth: 1180 }}>
          {current ? (
            <AppDetail app={current} onBack={() => setOpenApp(null)} onChoose={chooseOffer} />
          ) : view === "dash" ? (
            <Dashboard kpi={kpi} byBank={byBank} apps={apps}
              onOpen={(id) => setOpenApp(id)} onNew={() => setShowNew(true)} />
          ) : view === "apps" ? (
            <Applications apps={apps} onOpen={(id) => setOpenApp(id)} onNew={() => setShowNew(true)} />
          ) : (
            <Banks />
          )}
        </main>
      </div>

      {showNew && <NewApp onClose={() => setShowNew(false)} onCreate={createApp} />}
    </div>
  );
}

/* ---------------- Дашборд ------------------------------------------ */
function Dashboard({ kpi, byBank, apps, onOpen, onNew }) {
  const max = Math.max(...byBank.map((b) => b.v), 1);
  return (
    <div>
      <Header title="Дашборд" sub="Сводка по портфелю заявок" onNew={onNew} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
        <Kpi label="Активные заявки" value={kpi.active} />
        <Kpi label="Объём одобрено" value={fmtMln(kpi.volume) + " млн"} accent />
        <Kpi label="Конверсия" value={kpi.conv + "%"} />
        <Kpi label="Комиссия (1.5%)" value={fmtMln(Math.round(kpi.commission * 10) / 10) + " млн"} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
        <Panel title="Последние заявки">
          {apps.slice(0, 5).map((a) => (
            <Row key={a.id} a={a} onOpen={onOpen} />
          ))}
        </Panel>
        <Panel title="Объём по банкам, млн ₽">
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
            {byBank.map((b) => (
              <div key={b.name}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span>{b.name}</span><span style={{ ...mono, color: C.sub }}>{fmtMln(b.v)}</span>
                </div>
                <div style={{ height: 8, background: C.line, borderRadius: 6 }}>
                  <div style={{ height: "100%", width: `${(b.v / max) * 100}%`, background: C.amber, borderRadius: 6, transition: "width .5s" }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ---------------- Список заявок ------------------------------------ */
function Applications({ apps, onOpen, onNew }) {
  const [f, setF] = useState("all");
  const list = apps.filter((a) => f === "all" || a.status === f);
  return (
    <div>
      <Header title="Заявки" sub={`${apps.length} всего`} onNew={onNew} />
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[["all", "Все"], ...Object.entries(STATUS).map(([k, v]) => [k, v.label])].map(([k, l]) => (
          <button key={k} onClick={() => setF(k)} style={{
            padding: "7px 14px", borderRadius: 20, border: `1px solid ${C.line}`, cursor: "pointer",
            ...body, fontSize: 13, fontWeight: 500,
            background: f === k ? C.ink : C.panel, color: f === k ? "#fff" : C.sub,
          }}>{l}</button>
        ))}
      </div>
      <Panel>
        {list.length === 0 && <div style={{ color: C.sub, padding: 20, textAlign: "center" }}>Нет заявок</div>}
        {list.map((a) => <Row key={a.id} a={a} onOpen={onOpen} />)}
      </Panel>
    </div>
  );
}

/* ---------------- Детали заявки + офферы --------------------------- */
function AppDetail({ app, onBack, onChoose }) {
  const offers = useMemo(() => matchBanks(app), [app]);
  const valid = offers.filter((o) => !o.declined);
  const declined = offers.filter((o) => o.declined);
  const bankName = (id) => BANKS.find((b) => b.id === id)?.name;

  return (
    <div>
      <button onClick={onBack} style={{
        background: "none", border: "none", color: C.sub, cursor: "pointer",
        ...body, fontSize: 13, marginBottom: 14, padding: 0,
      }}>← Назад к заявкам</button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ ...display, fontWeight: 700, fontSize: 28, margin: 0 }}>{app.company}</h1>
          <div style={{ color: C.sub, fontSize: 14, marginTop: 4 }}>
            {app.id} · ИНН {app.inn} · от {app.created}
          </div>
        </div>
        <Badge s={app.status} />
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 24,
        background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18,
      }}>
        <Field l="Запрос" v={fmtMln(app.amount) + " млн"} />
        <Field l="Срок" v={app.term + " мес"} />
        <Field l="Выручка/год" v={fmtMln(app.revenue) + " млн"} />
        <Field l="Стаж" v={app.years + " лет"} />
        <Field l="Рейтинг" v={app.rating} />
        <div style={{ gridColumn: "1 / -1", borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
          <Field l="Цель" v={PURPOSES[app.purpose]} />
        </div>
      </div>

      <h2 style={{ ...display, fontWeight: 700, fontSize: 18, marginBottom: 4 }}>
        Предложения банков
      </h2>
      <p style={{ color: C.sub, fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        Заявка отправлена в {BANKS.length} банков · откликнулись {valid.length}
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        {valid.map((o) => {
          const chosen = app.chosenBank === o.bankId;
          return (
            <div key={o.bankId} style={{
              background: C.panel, border: `1.5px solid ${chosen ? C.amber : C.line}`,
              borderRadius: 12, padding: "16px 20px",
              display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr auto",
              alignItems: "center", gap: 14,
            }}>
              <div>
                <div style={{ ...display, fontWeight: 700, fontSize: 16 }}>{bankName(o.bankId)}</div>
                <div style={{ fontSize: 12, color: C.sub }}>{BANKS.find((b) => b.id === o.bankId).tag}</div>
              </div>
              <Field l="Ставка" v={<span style={mono}>{o.rate}%</span>} />
              <Field l="Сумма" v={<span style={mono}>{fmtMln(o.approved)} млн</span>} />
              <Field l="Платёж/мес" v={<span style={mono}>{fmtMln(o.monthly)} млн</span>} />
              <Field l="Решение" v={o.speed + " дн · " + o.probability + "%"} />
              {app.status === "offers" ? (
                <button onClick={() => onChoose(app.id, o.bankId)} style={{
                  padding: "9px 16px", background: C.amber, color: "#fff", border: "none",
                  borderRadius: 8, cursor: "pointer", ...body, fontWeight: 600, fontSize: 13,
                }}>Выбрать</button>
              ) : chosen ? (
                <span style={{ ...body, fontWeight: 600, fontSize: 13, color: "#15803d" }}>✓ Сделка</span>
              ) : <span />}
            </div>
          );
        })}
      </div>

      {declined.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>Отказали / не подошли:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {declined.map((o) => (
              <div key={o.bankId} style={{
                fontSize: 12, color: C.sub, background: C.panel, border: `1px solid ${C.line}`,
                borderRadius: 8, padding: "6px 12px",
              }}>
                <b style={{ color: C.ink }}>{bankName(o.bankId)}</b> — {o.reasons.join(", ")}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Банки-партнёры ----------------------------------- */
function Banks() {
  return (
    <div>
      <Header title="Банки-партнёры" sub={`${BANKS.length} подключённых источников`} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
        {BANKS.map((b) => (
          <div key={b.id} style={{
            background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ ...display, fontWeight: 700, fontSize: 18 }}>{b.name}</div>
              <span style={{ ...mono, fontSize: 13, color: C.amber }}>от {b.baseRate}%</span>
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 14 }}>{b.tag}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <Field l="Мин. выручка" v={fmtMln(b.minRevenue) + " млн"} />
              <Field l="Лимит" v={"до " + fmtMln(b.maxLoan) + " млн"} />
              <Field l="Мин. стаж" v={b.minYears + " г."} />
              <Field l="Срок решения" v={b.speed + " дн"} />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {b.purposes.map((p) => (
                <span key={p} style={{
                  fontSize: 11, background: C.amberSoft, color: "#b45309",
                  padding: "4px 9px", borderRadius: 6,
                }}>{PURPOSES[p]}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Новая заявка (форма) ----------------------------- */
function NewApp({ onClose, onCreate }) {
  const [f, setF] = useState({
    company: "", inn: "", revenue: 100, years: 3, rating: "B",
    amount: 200, term: 24, purpose: "working_capital",
  });
  const set = (k, v) => setF({ ...f, [k]: v });
  const ok = f.company.trim() && f.inn.trim().length >= 10;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(28,26,23,.5)",
      display: "grid", placeItems: "center", padding: 20, zIndex: 50,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.bg, borderRadius: 16, padding: 28, width: 540, maxWidth: "100%",
        maxHeight: "90vh", overflow: "auto",
      }}>
        <h2 style={{ ...display, fontWeight: 700, fontSize: 22, marginTop: 0 }}>Новая заявка</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Input l="Компания" v={f.company} onChange={(v) => set("company", v)} full />
          <Input l="ИНН" v={f.inn} onChange={(v) => set("inn", v.replace(/\D/g, ""))} />
          <Sel l="Рейтинг" v={f.rating} onChange={(v) => set("rating", v)}
            opts={[["A", "A — высокий"], ["B", "B — средний"], ["C", "C — низкий"]]} />
          <Num l="Выручка/год, млн" v={f.revenue} onChange={(v) => set("revenue", v)} />
          <Num l="Стаж, лет" v={f.years} onChange={(v) => set("years", v)} />
          <Num l="Сумма, млн" v={f.amount} onChange={(v) => set("amount", v)} />
          <Num l="Срок, мес" v={f.term} onChange={(v) => set("term", v)} />
          <div style={{ gridColumn: "1 / -1" }}>
            <Sel l="Цель кредита" v={f.purpose} onChange={(v) => set("purpose", v)}
              opts={Object.entries(PURPOSES)} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btn(false)}>Отмена</button>
          <button disabled={!ok} onClick={() => onCreate(f)} style={{ ...btn(true), opacity: ok ? 1 : 0.4 }}>
            Подобрать банки →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Мелкие компоненты -------------------------------- */
const btn = (primary) => ({
  padding: "10px 18px", borderRadius: 9, cursor: "pointer", ...body, fontWeight: 600, fontSize: 14,
  border: primary ? "none" : `1px solid ${C.line}`,
  background: primary ? C.amber : C.panel, color: primary ? "#fff" : C.ink,
});

function Header({ title, sub, onNew }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
      <div>
        <h1 style={{ ...display, fontWeight: 700, fontSize: 30, margin: 0 }}>{title}</h1>
        <div style={{ color: C.sub, fontSize: 14, marginTop: 2 }}>{sub}</div>
      </div>
      {onNew && <button onClick={onNew} style={btn(true)}>+ Новая заявка</button>}
    </div>
  );
}

function Kpi({ label, value, accent }) {
  return (
    <div style={{
      background: accent ? C.ink : C.panel, color: accent ? "#fff" : C.ink,
      border: `1px solid ${accent ? C.ink : C.line}`, borderRadius: 12, padding: 18,
    }}>
      <div style={{ fontSize: 12.5, color: accent ? "#b6b0a6" : C.sub, marginBottom: 8 }}>{label}</div>
      <div style={{ ...display, fontWeight: 700, fontSize: 26 }}>{value}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
      {title && <div style={{ ...display, fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{title}</div>}
      {children}
    </div>
  );
}

function Row({ a, onOpen }) {
  return (
    <div onClick={() => onOpen(a.id)} style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "12px 6px", borderBottom: `1px solid ${C.line}`, cursor: "pointer",
    }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14.5 }}>{a.company}</div>
        <div style={{ fontSize: 12, color: C.sub }}>{a.id} · {PURPOSES[a.purpose]}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ ...mono, fontSize: 14 }}>{fmtMln(a.amount)} млн</span>
        <Badge s={a.status} />
      </div>
    </div>
  );
}

function Badge({ s }) {
  const st = STATUS[s] || STATUS.new;
  return (
    <span style={{
      fontSize: 12, fontWeight: 600, color: st.c, background: st.bg,
      padding: "4px 11px", borderRadius: 20, whiteSpace: "nowrap",
    }}>{st.label}</span>
  );
}

function Field({ l, v }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 2 }}>{l}</div>
      <div style={{ fontWeight: 600, fontSize: 14.5 }}>{v}</div>
    </div>
  );
}

function Input({ l, v, onChange, full }) {
  return (
    <label style={{ display: "block", gridColumn: full ? "1 / -1" : "auto" }}>
      <span style={{ fontSize: 12.5, color: C.sub }}>{l}</span>
      <input value={v} onChange={(e) => onChange(e.target.value)} style={inp} />
    </label>
  );
}
function Num({ l, v, onChange }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 12.5, color: C.sub }}>{l}</span>
      <input type="number" value={v} onChange={(e) => onChange(+e.target.value)} style={{ ...inp, ...mono }} />
    </label>
  );
}
function Sel({ l, v, onChange, opts }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 12.5, color: C.sub }}>{l}</span>
      <select value={v} onChange={(e) => onChange(e.target.value)} style={inp}>
        {opts.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
      </select>
    </label>
  );
}
const inp = {
  width: "100%", marginTop: 5, padding: "10px 12px", borderRadius: 9,
  border: `1px solid ${C.line}`, background: "#fff", fontSize: 14,
  fontFamily: "'Hanken Grotesk', sans-serif", boxSizing: "border-box", color: C.ink,
};
