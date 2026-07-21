import React, { useState, useEffect, useMemo, useRef } from "react";

/* ============================================================
   ИПОТЕЧНЫЙ БРОКЕР · физлица · Казахстан  +  кабинет ЗАСТРОЙЩИКА
   Покупатель: каталог → подбор ипотеки по банкам РК → заявки → документы
   Застройщик: публикация объектов (как Krisha / BI Group) → лиды от покупателей
   Идентификация по ИИН (реальная контрольная сумма РК)
   ============================================================ */

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap');
`;
const C = {
  bg: "#f4f2ee", panel: "#fff", ink: "#1c1a17", sub: "#6b655c",
  line: "#e4e0d8", teal: "#0d7a6f", tealSoft: "#e3f2f0", gold: "#c98a1a", blue: "#0060FE",
};
const display = { fontFamily: "'Bricolage Grotesque', sans-serif" };
const body = { fontFamily: "'Hanken Grotesk', sans-serif" };
const mono = { fontFamily: "'JetBrains Mono', monospace" };
const fmt = (n) => new Intl.NumberFormat("ru-RU").format(Math.round(n));
const fmtT = (n) => fmt(n) + " ₸";

/* ---- Реальная проверка ИИН (РК, 12 знаков) ----------------------- */
function validateIin(raw) {
  const iin = String(raw).replace(/\D/g, "");
  if (iin.length !== 12) return false;
  const w1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const w2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];
  let s1 = 0; for (let i = 0; i < 11; i++) s1 += +iin[i] * w1[i];
  let ctrl = s1 % 11;
  if (ctrl === 10) {
    let s2 = 0; for (let i = 0; i < 11; i++) s2 += +iin[i] * w2[i];
    ctrl = s2 % 11; if (ctrl === 10) return false;
  }
  return ctrl === +iin[11];
}
function iinInfo(iin) {
  if (!validateIin(iin)) return null;
  const yy = +iin.slice(0, 2), mm = +iin.slice(2, 4), dd = +iin.slice(4, 6), g = +iin[6];
  const century = g <= 2 ? 1800 : g <= 4 ? 1900 : 2000;
  const sex = g % 2 === 1 ? "муж" : "жен";
  return { birth: `${String(dd).padStart(2, "0")}.${String(mm).padStart(2, "0")}.${century + yy}`, sex };
}
// Телефон РК: 11 цифр, начинается с 7/8
function phoneDigits(raw) { let d = String(raw).replace(/\D/g, ""); if (d[0] === "8") d = "7" + d.slice(1); return d.slice(0, 11); }
function validatePhone(raw) { const d = phoneDigits(raw); return d.length === 11 && d[0] === "7"; }
function fmtPhone(raw) {
  const d = phoneDigits(raw); if (!d) return "";
  let s = "+7"; if (d.length > 1) s += " (" + d.slice(1, 4); if (d.length >= 5) s += ") " + d.slice(4, 7);
  if (d.length >= 8) s += "-" + d.slice(7, 9); if (d.length >= 10) s += "-" + d.slice(9, 11); return s;
}

/* ---- Банки РК (слой скоринга = интеграция) ----------------------- */
const BANKS = [
  { id: "otbasy7", name: "Отбасы банк", program: "«7-20-25»", tag: "Госпрограмма · жильё", rate: 7.0, minDownPct: 20, maxTerm: 25, maxLoan: 35, propTypes: ["residential"] },
  { id: "otbasy", name: "Отбасы банк", program: "Жилстройсбережения", tag: "Депозитная · низкая ставка", rate: 5.0, minDownPct: 20, maxTerm: 25, maxLoan: 60, propTypes: ["residential"] },
  { id: "halyk", name: "Halyk Bank", program: "Рыночная ипотека", tag: "Жильё и коммерция", rate: 19.5, minDownPct: 20, maxTerm: 25, maxLoan: 200, propTypes: ["residential", "commercial"] },
  { id: "kaspi", name: "Kaspi Bank", program: "Kaspi Ипотека", tag: "Быстрое решение", rate: 18.9, minDownPct: 30, maxTerm: 20, maxLoan: 80, propTypes: ["residential"] },
  { id: "bcc", name: "Bank CenterCredit", program: "Ипотека BCC", tag: "Жильё и коммерция", rate: 20.0, minDownPct: 25, maxTerm: 20, maxLoan: 150, propTypes: ["residential", "commercial"] },
  { id: "forte", name: "ForteBank", program: "Коммерческая недвижимость", tag: "Бизнес-объекты", rate: 21.0, minDownPct: 30, maxTerm: 15, maxLoan: 300, propTypes: ["commercial"] },
  { id: "freedom", name: "Freedom Bank", program: "Freedom Ипотека", tag: "Гибкие условия", rate: 22.0, minDownPct: 20, maxTerm: 25, maxLoan: 120, propTypes: ["residential"] },
];
const PROP_TYPES = { residential: "Квартира / жильё", commercial: "Коммерция" };

function monthlyPayment(loanMln, rate, years) {
  const r = rate / 100 / 12, n = years * 12, p = loanMln * 1e6;
  return r === 0 ? p / n : (p * r) / (1 - Math.pow(1 + r, -n));
}
function matchBanks(app) {
  const loan = +(app.price - app.down).toFixed(1);
  const downPct = (app.down / app.price) * 100;
  const out = [];
  for (const b of BANKS) {
    const reasons = [];
    if (!b.propTypes.includes(app.propType)) reasons.push("не финансирует этот тип");
    if (downPct < b.minDownPct) reasons.push(`взнос ≥ ${b.minDownPct}%`);
    if (loan > b.maxLoan) reasons.push(`лимит ${b.maxLoan} млн ₸`);
    if (app.term > b.maxTerm) reasons.push(`срок ≤ ${b.maxTerm} лет`);
    if (reasons.length) { out.push({ bankId: b.id, declined: true, reasons }); continue; }
    const m = monthlyPayment(loan, b.rate, app.term);
    const dsr = app.income > 0 ? m / app.income : 1;
    const prob = dsr <= 0.4 ? 0.9 : dsr <= 0.5 ? 0.72 : dsr <= 0.6 ? 0.45 : 0.2;
    out.push({ bankId: b.id, declined: false, rate: b.rate, loan, term: app.term, monthly: Math.round(m), dsr: Math.round(dsr * 100), probability: Math.round(prob * 100) });
  }
  return out.sort((a, b) => (a.declined !== b.declined) ? (a.declined ? 1 : -1) : (a.declined ? 0 : a.rate - b.rate));
}

/* ---- Каталог: объекты брокера + объекты застройщиков ------------- */
const BROKER_CATALOG = [
  { id: "P-201", type: "residential", title: "2-комн. квартира", city: "Алматы", district: "Бостандыкский р-н", area: 65, rooms: 2, price: 38, source: "broker" },
  { id: "P-202", type: "residential", title: "1-комн. квартира", city: "Астана", district: "р-н Есиль", area: 42, rooms: 1, price: 28, source: "broker" },
  { id: "P-204", type: "residential", title: "Студия", city: "Шымкент", district: "мкр. Нурсат", area: 32, rooms: 0, price: 16, source: "broker" },
  { id: "P-302", type: "commercial", title: "Офис класса B", city: "Алматы", district: "Алмалинский р-н", area: 200, rooms: 0, price: 140, source: "broker" },
];
const SEED_LISTINGS = [
  { id: "D-101", type: "residential", title: "ЖК «Tumar», 2-комн.", city: "Астана", district: "р-н Есиль", area: 58, rooms: 2, price: 32, developer: "BI Group", promo: 15, installment: true, status: "published", views: 1240, source: "developer" },
  { id: "D-102", type: "residential", title: "ЖК «Asyl Arman», 1-комн.", city: "Алматы", district: "Бостандыкский р-н", area: 45, rooms: 1, price: 26, developer: "BI Group", promo: 0, installment: true, status: "published", views: 870, source: "developer" },
  { id: "D-201", type: "commercial", title: "БЦ «BI Plaza», помещение", city: "Астана", district: "пр. Мангилик Ел", area: 90, rooms: 0, price: 75, developer: "BI Group", promo: 0, installment: false, status: "published", views: 410, source: "developer" },
];

// Реестр объектов (обновляется в App каждый рендер) — чтобы вспомогательные
// компоненты могли найти объект по id без проброса props.
let PROP_REGISTRY = [...BROKER_CATALOG, ...SEED_LISTINGS];
const propById = (id) => PROP_REGISTRY.find((p) => p.id === id);
const effPrice = (p) => +(p.price * (1 - (p.promo || 0) / 100)).toFixed(1);

/* ---- Профиль и сид-данные ---------------------------------------- */
const SEED_PROFILE = { name: "Арман Сериков", iin: "900515312349", phone: "77011234567", income: 850000 };
const SEED_DEV = { name: "BI Group", city: "Астана", bin: "050540004455" };
const SEED = [
  { id: "M-1042", propId: "P-201", propType: "residential", price: 38, down: 9, term: 20, income: 850000, status: "offers", created: "2026-05-28", docs: { id: { name: "udostoverenie.pdf", size: 154000 }, income: { name: "spravka_dohod.pdf", size: 210000 } } },
  { id: "M-1041", propId: "D-101", propType: "residential", price: 27.2, listPrice: 32, promo: 15, down: 7, term: 20, income: 850000, iin: "900515312349", phone: "77011234567", status: "sent", created: "2026-06-04", docs: { id: { name: "udostoverenie.pdf", size: 154000 } } },
  { id: "M-1040", propId: "P-204", propType: "residential", price: 16, down: 4, term: 15, income: 850000, status: "approved", chosenBank: "otbasy7", created: "2026-05-12", docs: { id: { name: "udostoverenie.pdf", size: 154000 }, income: { name: "spravka_dohod.pdf", size: 210000 }, enpf: { name: "enpf.pdf", size: 98000 }, object: { name: "ocenka.pdf", size: 420000 } } },
];
const STATUS = {
  draft: { label: "Черновик", c: "#6b655c", bg: "#efece6" },
  sent: { label: "На рассмотрении", c: "#1f3a5f", bg: "#e6edf5" },
  offers: { label: "Есть предложения", c: "#9a6212", bg: "#f6edda" },
  approved: { label: "Одобрено", c: "#15803d", bg: "#e7f4ec" },
  rejected: { label: "Отказ", c: "#b91c1c", bg: "#fbe9e9" },
};
const DOC_TYPES = { id: "Удостоверение личности", income: "Справка о доходах", enpf: "Пенсионные отчисления (ЕНПФ)", object: "Документы / оценка объекта" };
const requiredDocs = () => ["id", "income", "enpf", "object"];

/* ============================================================ */
export default function App() {
  const [apps, setApps] = useState(SEED);
  const [profile, setProfile] = useState(SEED_PROFILE);
  const [listings, setListings] = useState(SEED_LISTINGS);
  const [dev, setDev] = useState(SEED_DEV);
  const [mode, setMode] = useState("buyer"); // buyer | developer
  const [view, setView] = useState("home");
  const [openApp, setOpenApp] = useState(null);
  const [newFor, setNewFor] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Обновляем реестр объектов на каждый рендер
  const catalog = useMemo(() => [...BROKER_CATALOG, ...listings.filter((l) => l.status === "published")], [listings]);
  PROP_REGISTRY = [...BROKER_CATALOG, ...listings];

  useEffect(() => { (async () => {
    try {
      const a = await window.storage.get("kz2:apps"); if (a?.value) setApps(JSON.parse(a.value));
      const p = await window.storage.get("kz2:profile"); if (p?.value) setProfile(JSON.parse(p.value));
      const l = await window.storage.get("kz2:listings"); if (l?.value) setListings(JSON.parse(l.value));
      const d = await window.storage.get("kz2:dev"); if (d?.value) setDev(JSON.parse(d.value));
    } catch (e) {}
    setLoaded(true);
  })(); }, []);
  useEffect(() => { if (loaded) { try {
    window.storage.set("kz2:apps", JSON.stringify(apps));
    window.storage.set("kz2:profile", JSON.stringify(profile));
    window.storage.set("kz2:listings", JSON.stringify(listings));
    window.storage.set("kz2:dev", JSON.stringify(dev));
  } catch (e) {} } }, [apps, profile, listings, dev, loaded]);

  const iinOk = validateIin(profile.iin);

  const createApp = (form) => {
    const id = "M-" + (1043 + apps.filter((a) => a.id.startsWith("M")).length);
    setApps([{ ...form, id, status: "offers", created: new Date().toISOString().slice(0, 10), docs: {} }, ...apps]);
    setNewFor(null); setOpenApp(id); setView("apps");
  };
  const updateApp = (id, patch) => setApps(apps.map((a) => a.id === id ? { ...a, ...patch } : a));
  const chooseOffer = (id, bankId) => updateApp(id, { status: "approved", chosenBank: bankId });
  const uploadDoc = (id, type, file) => updateApp(id, { docs: { ...apps.find((a) => a.id === id).docs, [type]: { name: file.name, size: file.size } } });

  const publishListing = (form) => {
    const id = "D-" + (300 + listings.length);
    setListings([{ ...form, id, developer: dev.name, status: "published", views: 0, source: "developer" }, ...listings]);
    setView("devobjects");
  };
  const toggleListing = (id) => setListings(listings.map((l) => l.id === id ? { ...l, status: l.status === "published" ? "draft" : "published" } : l));

  const current = apps.find((a) => a.id === openApp);
  const buyerNav = [["home", "Главная"], ["catalog", "Объекты"], ["apps", "Заявки"], ["docs", "Документы"], ["banks", "Банки"], ["profile", "Клиент"]];
  const devNav = [["devhome", "Дашборд"], ["publish", "Опубликовать"], ["devobjects", "Мои объекты"], ["leads", "Лиды"], ["devprofile", "Компания"]];
  const nav = mode === "buyer" ? buyerNav : devNav;

  return (
    <div style={{ ...body, background: C.bg, color: C.ink, minHeight: "100vh" }}>
      <style>{FONTS}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <aside style={{ width: 244, background: C.ink, color: "#e9e5dd", padding: "24px 18px", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ width: 34, height: 34, background: mode === "buyer" ? C.teal : C.blue, borderRadius: 8, display: "grid", placeItems: "center", ...display, fontWeight: 800, color: "#fff", fontSize: 18 }}>И</div>
            <div>
              <div style={{ ...display, fontWeight: 700, fontSize: 15, lineHeight: 1.1 }}>Ипотека.kz</div>
              <div style={{ fontSize: 11, color: "#9b948a" }}>маркетплейс + брокер</div>
            </div>
          </div>

          {/* Переключатель режима */}
          <div style={{ display: "flex", background: "#2c2925", borderRadius: 9, padding: 3, marginBottom: 18 }}>
            {[["buyer", "Менеджер"], ["developer", "Застройщик"]].map(([k, l]) => (
              <button key={k} onClick={() => { setMode(k); setView(k === "buyer" ? "home" : "devhome"); setOpenApp(null); }} style={{ flex: 1, padding: "8px 0", border: "none", borderRadius: 7, cursor: "pointer", ...body, fontWeight: 600, fontSize: 12.5, background: mode === k ? (k === "buyer" ? C.teal : C.blue) : "transparent", color: mode === k ? "#fff" : "#9b948a" }}>{l}</button>
            ))}
          </div>

          {nav.map(([k, l]) => (
            <button key={k} onClick={() => { setView(k); setOpenApp(null); }} style={{ textAlign: "left", padding: "11px 14px", marginBottom: 4, borderRadius: 9, border: "none", cursor: "pointer", fontSize: 14.5, ...body, fontWeight: 500, background: view === k && !openApp ? (mode === "buyer" ? C.teal : C.blue) : "transparent", color: view === k && !openApp ? "#fff" : "#cfc9bf" }}>{l}</button>
          ))}

          <div style={{ marginTop: "auto", fontSize: 11, color: "#7e776d", lineHeight: 1.5 }}>
            {mode === "buyer" ? "Рабочее место менеджера · " + (iinOk ? "ИИН клиента ✓" : "ИИН клиента ⚠") : dev.name + " · БИН " + dev.bin}
          </div>
        </aside>

        <main style={{ flex: 1, padding: "32px 40px", maxWidth: 1180 }}>
          {/* ----- ПОКУПАТЕЛЬ ----- */}
          {mode === "buyer" && (current ? (
            <AppDetail app={current} onBack={() => setOpenApp(null)} onChoose={chooseOffer} onUpload={uploadDoc} />
          ) : view === "home" ? (
            <Home apps={apps} onOpen={setOpenApp} onCatalog={() => setView("catalog")} />
          ) : view === "catalog" ? (
            <Catalog items={catalog} onPick={(p) => setNewFor(p)} />
          ) : view === "apps" ? (
            <Applications apps={apps} onOpen={setOpenApp} onCatalog={() => setView("catalog")} />
          ) : view === "docs" ? (
            <Documents apps={apps} onOpen={setOpenApp} />
          ) : view === "banks" ? (
            <Banks />
          ) : (
            <Profile profile={profile} setProfile={setProfile} />
          ))}

          {/* ----- ЗАСТРОЙЩИК ----- */}
          {mode === "developer" && (view === "devhome" ? (
            <DevHome listings={listings} apps={apps} dev={dev} onPublish={() => setView("publish")} />
          ) : view === "publish" ? (
            <PublishForm onPublish={publishListing} />
          ) : view === "devobjects" ? (
            <DevObjects listings={listings.filter((l) => l.developer === dev.name)} apps={apps} onToggle={toggleListing} onPublish={() => setView("publish")} />
          ) : view === "leads" ? (
            <Leads apps={apps} dev={dev} profile={profile} />
          ) : (
            <DevProfile dev={dev} setDev={setDev} />
          ))}
        </main>
      </div>
      {newFor && <NewApp property={newFor} profile={profile} onClose={() => setNewFor(null)} onCreate={createApp} onProfile={() => { setNewFor(null); setView("profile"); }} />}
    </div>
  );
}

/* ======================= ПОКУПАТЕЛЬ ======================= */
function Home({ apps, onOpen, onCatalog }) {
  const active = apps.filter((a) => ["draft", "sent", "offers"].includes(a.status)).length;
  const approved = apps.filter((a) => a.status === "approved");
  const fin = approved.reduce((s, a) => { const o = matchBanks(a).find((x) => x.bankId === a.chosenBank); return s + (o ? o.loan : 0); }, 0);
  const pay = approved.reduce((s, a) => { const o = matchBanks(a).find((x) => x.bankId === a.chosenBank); return s + (o ? o.monthly : 0); }, 0);
  return (
    <div>
      <Header title="Главная" sub="Заявки клиентов" action={["Подобрать объект", onCatalog]} accent={C.teal} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 24 }}>
        <Kpi label="Активные заявки" value={active} />
        <Kpi label="Одобренное финансирование" value={fmt(fin) + " млн ₸"} accent />
        <Kpi label="Платёж в месяц" value={fmtT(pay)} />
      </div>
      <Panel title="Последние заявки">
        {apps.length === 0 && <Empty t="Заявок пока нет — начните с подбора объекта" />}
        {apps.slice(0, 5).map((a) => <Row key={a.id} a={a} onOpen={onOpen} />)}
      </Panel>
    </div>
  );
}

function Catalog({ items, onPick }) {
  const [f, setF] = useState("all");
  const list = items.filter((p) => f === "all" || p.type === f);
  const grad = (t) => t === "residential" ? "linear-gradient(135deg,#0d7a6f,#13a392)" : "linear-gradient(135deg,#c98a1a,#e0a93d)";
  return (
    <div>
      <Header title="Объекты" sub={`${items.length} объектов · квартиры и коммерция`} accent={C.teal} />
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["all", "Все"], ["residential", "Квартиры"], ["commercial", "Коммерция"]].map(([k, l]) => (
          <button key={k} onClick={() => setF(k)} style={{ padding: "7px 14px", borderRadius: 20, border: `1px solid ${C.line}`, cursor: "pointer", ...body, fontSize: 13, fontWeight: 500, background: f === k ? C.ink : C.panel, color: f === k ? "#fff" : C.sub }}>{l}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
        {list.map((p) => (
          <div key={p.id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ height: 120, background: grad(p.type), display: "grid", placeItems: "center", color: "#fff", ...display, fontSize: 30, position: "relative" }}>
              {p.type === "residential" ? "🏢" : "🏬"}
              {p.promo > 0 && <span style={{ position: "absolute", top: 10, left: 10, background: "#b91c1c", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, ...body }}>−{p.promo}%</span>}
              {p.developer && <span style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,.35)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, ...body }}>{p.developer}</span>}
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ ...display, fontWeight: 700, fontSize: 15.5 }}>{p.title}</div>
              <div style={{ fontSize: 13, color: C.sub, marginBottom: 10 }}>{p.city} · {p.district}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
                <span style={{ ...mono, fontSize: 13, color: C.sub }}>{p.area} м²{p.rooms ? ` · ${p.rooms} комн` : ""}</span>
                <div style={{ textAlign: "right" }}>
                  {p.promo > 0 && <div style={{ ...mono, fontSize: 12, color: C.sub, textDecoration: "line-through" }}>{p.price} млн</div>}
                  <span style={{ ...display, fontWeight: 700, fontSize: 18 }}>{effPrice(p)} млн ₸</span>
                </div>
              </div>
              {p.installment && <div style={{ fontSize: 11.5, color: C.blue, marginBottom: 10 }}>● рассрочка от застройщика</div>}
              <button onClick={() => onPick(p)} style={{ ...btn(true), width: "100%" }}>Подобрать ипотеку</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Applications({ apps, onOpen, onCatalog }) {
  const [f, setF] = useState("all");
  const list = apps.filter((a) => f === "all" || a.status === f);
  return (
    <div>
      <Header title="Заявки" sub={`${apps.length} всего`} action={["Новая заявка", onCatalog]} accent={C.teal} />
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[["all", "Все"], ...Object.entries(STATUS).map(([k, v]) => [k, v.label])].map(([k, l]) => (
          <button key={k} onClick={() => setF(k)} style={{ padding: "7px 14px", borderRadius: 20, border: `1px solid ${C.line}`, cursor: "pointer", ...body, fontSize: 13, fontWeight: 500, background: f === k ? C.ink : C.panel, color: f === k ? "#fff" : C.sub }}>{l}</button>
        ))}
      </div>
      <Panel>
        {list.length === 0 && <Empty t="Нет заявок" />}
        {list.map((a) => <Row key={a.id} a={a} onOpen={onOpen} />)}
      </Panel>
    </div>
  );
}

function AppDetail({ app, onBack, onChoose, onUpload }) {
  const offers = useMemo(() => matchBanks(app), [app]);
  const valid = offers.filter((o) => !o.declined);
  const req = requiredDocs();
  const p = propById(app.propId);
  const downPct = Math.round((app.down / app.price) * 100);
  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.sub, cursor: "pointer", ...body, fontSize: 13, marginBottom: 14, padding: 0 }}>← Назад</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ ...display, fontWeight: 700, fontSize: 24, margin: 0 }}>{p ? p.title : PROP_TYPES[app.propType]}</h1>
          <div style={{ color: C.sub, fontSize: 14, marginTop: 4 }}>{app.id}{p ? ` · ${p.city}, ${p.district}` : ""}{p && p.developer ? ` · ${p.developer}` : ""} · от {app.created}</div>
        </div>
        <Badge s={app.status} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
        <Field l="Стоимость" v={app.promo ? `${fmt(app.price)} млн (−${app.promo}%)` : `${fmt(app.price)} млн ₸`} />
        <Field l="Первый взнос" v={`${fmt(app.down)} млн (${downPct}%)`} />
        <Field l="Сумма займа" v={`${fmt(app.price - app.down)} млн ₸`} />
        <Field l="Срок" v={`${app.term} лет`} />
        <Field l="Тип объекта" v={PROP_TYPES[app.propType]} />
        <Field l="Доход/мес" v={fmtT(app.income)} />
        <Field l="ИИН клиента" v={<span style={mono}>{app.iin || "—"}</span>} />
        <Field l="Телефон" v={<span style={mono}>{app.phone ? fmtPhone(app.phone) : "—"}</span>} />
      </div>
      <Panel title="Документы">
        {req.map((d) => <DocRow key={d} type={d} doc={app.docs[d]} canUpload={app.status !== "approved"} onUpload={(file) => onUpload(app.id, d, file)} />)}
      </Panel>
      <div style={{ marginTop: 24 }}>
        <h2 style={{ ...display, fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Предложения банков</h2>
        <p style={{ color: C.sub, fontSize: 13, marginTop: 0, marginBottom: 16 }}>Подходят {valid.length} из {BANKS.length} программ</p>
        <div style={{ display: "grid", gap: 12 }}>
          {valid.map((o) => {
            const chosen = app.chosenBank === o.bankId;
            const b = BANKS.find((x) => x.id === o.bankId);
            return (
              <div key={o.bankId} style={{ background: C.panel, border: `1.5px solid ${chosen ? C.teal : C.line}`, borderRadius: 12, padding: "16px 20px", display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr auto", alignItems: "center", gap: 14 }}>
                <div>
                  <div style={{ ...display, fontWeight: 700, fontSize: 15 }}>{b.name}</div>
                  <div style={{ fontSize: 12, color: C.sub }}>{b.program}</div>
                </div>
                <Field l="Ставка" v={<span style={mono}>{o.rate}%</span>} />
                <Field l="Платёж/мес" v={<span style={mono}>{fmt(o.monthly / 1000)} тыс ₸</span>} />
                <Field l="Нагрузка" v={`${o.dsr}% дохода`} />
                <Field l="Одобрение" v={`${o.probability}%`} />
                {app.status === "offers" ? (
                  <button onClick={() => onChoose(app.id, o.bankId)} style={{ ...btn(true), padding: "9px 16px", fontSize: 13 }}>Выбрать</button>
                ) : chosen ? <span style={{ ...body, fontWeight: 600, fontSize: 13, color: "#15803d" }}>✓ Выбрано</span> : <span />}
              </div>
            );
          })}
        </div>
        {offers.some((o) => o.declined) && (
          <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {offers.filter((o) => o.declined).map((o) => { const b = BANKS.find((x) => x.id === o.bankId); return (
              <div key={o.bankId} style={{ fontSize: 12, color: C.sub, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 12px" }}>
                <b style={{ color: C.ink }}>{b.name} · {b.program}</b> — {o.reasons.join(", ")}
              </div>
            ); })}
          </div>
        )}
      </div>
    </div>
  );
}

function Documents({ apps, onOpen }) {
  const rows = [];
  apps.forEach((a) => Object.entries(a.docs).forEach(([t, d]) => rows.push({ ...d, type: t, app: a.id })));
  return (
    <div>
      <Header title="Документы" sub={`${rows.length} файлов`} accent={C.teal} />
      <Panel>
        {rows.length === 0 && <Empty t="Документов пока нет" />}
        {rows.map((r, i) => (
          <div key={i} onClick={() => onOpen(r.app)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 6px", borderBottom: `1px solid ${C.line}`, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <div><div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div><div style={{ fontSize: 12, color: C.sub }}>{DOC_TYPES[r.type]} · {r.app}</div></div>
            </div>
            <span style={{ ...mono, fontSize: 12, color: C.sub }}>{(r.size / 1024).toFixed(0)} КБ</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function Banks() {
  return (
    <div>
      <Header title="Банки и программы" sub={`${BANKS.length} ипотечных программ РК`} accent={C.teal} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
        {BANKS.map((b) => (
          <div key={b.id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ ...display, fontWeight: 700, fontSize: 17 }}>{b.name}</div><div style={{ fontSize: 13, color: C.teal, fontWeight: 600 }}>{b.program}</div></div>
              <span style={{ ...mono, fontSize: 15, color: C.gold, fontWeight: 700 }}>{b.rate}%</span>
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 14 }}>{b.tag}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field l="Первый взнос" v={`от ${b.minDownPct}%`} />
              <Field l="Срок" v={`до ${b.maxTerm} лет`} />
              <Field l="Лимит займа" v={`до ${b.maxLoan} млн ₸`} />
              <Field l="Объекты" v={b.propTypes.map((t) => PROP_TYPES[t]).join(", ")} />
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: C.sub, marginTop: 14 }}>Ставки и условия — иллюстративные. В боевой версии тянутся из API банков.</p>
    </div>
  );
}

function Profile({ profile, setProfile }) {
  const [iin, setIin] = useState(profile.iin);
  const ok = validateIin(iin);
  const info = iinInfo(iin);
  return (
    <div>
      <Header title="Клиент" sub="Идентификация по ИИН" accent={C.teal} />
      <Panel>
        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ fontSize: 12.5, color: C.sub }}>ФИО</span>
          <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} style={inp} />
        </label>
        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ fontSize: 12.5, color: C.sub }}>Номер телефона</span>
          <div style={{ position: "relative" }}>
            <input value={fmtPhone(profile.phone || "")} inputMode="tel" placeholder="+7 (7__) ___-__-__" onChange={(e) => setProfile({ ...profile, phone: phoneDigits(e.target.value) })} style={{ ...inp, ...mono, borderColor: phoneDigits(profile.phone || "").length === 11 ? (validatePhone(profile.phone) ? "#15803d" : "#b91c1c") : C.line }} />
            <span style={{ position: "absolute", right: 12, top: 16, fontSize: 13, fontWeight: 600, color: validatePhone(profile.phone) ? "#15803d" : "#b91c1c" }}>{phoneDigits(profile.phone || "").length === 11 ? (validatePhone(profile.phone) ? "✓" : "✗") : ""}</span>
          </div>
        </label>
        <label style={{ display: "block", marginBottom: 6 }}>
          <span style={{ fontSize: 12.5, color: C.sub }}>ИИН (12 цифр)</span>
          <div style={{ position: "relative" }}>
            <input value={iin} maxLength={12} onChange={(e) => setIin(e.target.value.replace(/\D/g, ""))} style={{ ...inp, ...mono, borderColor: iin.length === 12 ? (ok ? "#15803d" : "#b91c1c") : C.line }} />
            <span style={{ position: "absolute", right: 12, top: 16, fontSize: 13, fontWeight: 600, color: ok ? "#15803d" : "#b91c1c" }}>{iin.length === 12 ? (ok ? "✓ верный" : "✗ неверный") : `${iin.length}/12`}</span>
          </div>
        </label>
        {info && <div style={{ fontSize: 13, color: C.sub, marginBottom: 16 }}>Из ИИН: дата рождения {info.birth}, пол — {info.sex}</div>}
        <label style={{ display: "block", marginBottom: 18 }}>
          <span style={{ fontSize: 12.5, color: C.sub }}>Подтверждённый доход в месяц, ₸</span>
          <input type="number" value={profile.income} onChange={(e) => setProfile({ ...profile, income: +e.target.value })} style={{ ...inp, ...mono }} />
        </label>
        <button disabled={!ok} onClick={() => setProfile({ ...profile, iin })} style={{ ...btn(true), opacity: ok ? 1 : 0.4 }}>Сохранить профиль</button>
      </Panel>
    </div>
  );
}

function NewApp({ property, profile, onClose, onCreate, onProfile }) {
  const [downPct, setDownPct] = useState(25);
  const [term, setTerm] = useState(20);
  const [iin, setIin] = useState(profile.iin || "");
  const [phone, setPhone] = useState(profile.phone || "");
  const iinValid = validateIin(iin);
  const phoneValid = validatePhone(phone);
  const canSubmit = iinValid && phoneValid;
  const price = effPrice(property);
  const down = +(price * downPct / 100).toFixed(1);
  const draft = { propId: property.id, propType: property.type, price, listPrice: property.price, promo: property.promo || 0, down, term, income: profile.income, iin, phone };
  const offers = matchBanks(draft).filter((o) => !o.declined);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(28,26,23,.5)", display: "grid", placeItems: "center", padding: 20, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, borderRadius: 16, padding: 28, width: 520, maxWidth: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <h2 style={{ ...display, fontWeight: 700, fontSize: 21, marginTop: 0 }}>Заявка на одобрение</h2>
        <div style={{ fontSize: 14, color: C.sub, marginBottom: 6 }}>{property.title} · {property.city}{property.developer ? ` · ${property.developer}` : ""}</div>
        <div style={{ fontSize: 14, marginBottom: 18 }}>
          {property.promo > 0 && <span style={{ color: C.sub, textDecoration: "line-through", marginRight: 8 }}>{property.price} млн</span>}
          <b>{price} млн ₸</b>{property.promo > 0 && <span style={{ color: "#b91c1c", marginLeft: 6 }}>−{property.promo}%</span>}
        </div>

        {/* Данные клиента для одобрения */}
        <div style={{ ...display, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Данные клиента для одобрения</div>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 12.5, color: C.sub }}>ИИН (12 цифр)</span>
          <div style={{ position: "relative" }}>
            <input value={iin} maxLength={12} onChange={(e) => setIin(e.target.value.replace(/\D/g, ""))} style={{ ...inp, ...mono, borderColor: iin.length === 12 ? (iinValid ? "#15803d" : "#b91c1c") : C.line }} />
            <span style={{ position: "absolute", right: 12, top: 16, fontSize: 13, fontWeight: 600, color: iinValid ? "#15803d" : "#b91c1c" }}>{iin.length === 12 ? (iinValid ? "✓" : "✗") : `${iin.length}/12`}</span>
          </div>
        </label>
        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ fontSize: 12.5, color: C.sub }}>Номер телефона</span>
          <div style={{ position: "relative" }}>
            <input value={fmtPhone(phone)} inputMode="tel" placeholder="+7 (7__) ___-__-__" onChange={(e) => setPhone(phoneDigits(e.target.value))} style={{ ...inp, ...mono, borderColor: phoneDigits(phone).length === 11 ? (phoneValid ? "#15803d" : "#b91c1c") : C.line }} />
            <span style={{ position: "absolute", right: 12, top: 16, fontSize: 13, fontWeight: 600, color: phoneValid ? "#15803d" : "#b91c1c" }}>{phoneDigits(phone).length === 11 ? (phoneValid ? "✓" : "✗") : ""}</span>
          </div>
        </label>

        {property.installment && <div style={{ background: "#eef3ff", color: C.blue, padding: "9px 13px", borderRadius: 9, fontSize: 13, marginBottom: 16 }}>Доступна рассрочка от застройщика — как альтернатива банковской ипотеке.</div>}

        <label style={{ display: "block", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span style={{ color: C.sub }}>Первоначальный взнос</span><span style={{ ...mono, fontWeight: 600 }}>{downPct}% · {fmt(down)} млн ₸</span></div>
          <input type="range" min={10} max={60} value={downPct} onChange={(e) => setDownPct(+e.target.value)} style={{ width: "100%", accentColor: C.teal }} />
        </label>
        <label style={{ display: "block", marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span style={{ color: C.sub }}>Срок</span><span style={{ ...mono, fontWeight: 600 }}>{term} лет</span></div>
          <input type="range" min={5} max={25} value={term} onChange={(e) => setTerm(+e.target.value)} style={{ width: "100%", accentColor: C.teal }} />
        </label>
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: 14, marginBottom: 18, fontSize: 13 }}>Сумма займа <b style={mono}>{fmt(price - down)} млн ₸</b> · подойдут <b>{offers.length}</b> программ</div>
        {!canSubmit && <div style={{ fontSize: 12.5, color: "#b91c1c", marginBottom: 12 }}>Для одобрения укажите корректный ИИН и номер телефона. {profile.iin && <button onClick={onProfile} style={{ background: "none", border: "none", color: "#b91c1c", textDecoration: "underline", cursor: "pointer", ...body, fontSize: 12.5, padding: 0 }}>Открыть карточку клиента →</button>}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btn(false)}>Отмена</button>
          <button disabled={!canSubmit} onClick={() => onCreate(draft)} style={{ ...btn(true), opacity: canSubmit ? 1 : 0.4 }}>Отправить на одобрение →</button>
        </div>
      </div>
    </div>
  );
}

/* ======================= ЗАСТРОЙЩИК ======================= */
function DevHome({ listings, apps, dev, onPublish }) {
  const mine = listings.filter((l) => l.developer === dev.name);
  const published = mine.filter((l) => l.status === "published").length;
  const views = mine.reduce((s, l) => s + (l.views || 0), 0);
  const leadIds = mine.map((l) => l.id);
  const leads = apps.filter((a) => leadIds.includes(a.propId));
  return (
    <div>
      <Header title={`Дашборд · ${dev.name}`} sub="Публикация объектов и заявки покупателей" action={["Опубликовать объект", onPublish]} accent={C.blue} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
        <Kpi label="Опубликовано" value={published} />
        <Kpi label="Просмотры" value={fmt(views)} />
        <Kpi label="Заявки (лиды)" value={leads.length} accentColor={C.blue} accent />
        <Kpi label="В работе у банков" value={leads.filter((a) => ["sent", "offers"].includes(a.status)).length} />
      </div>
      <Panel title="Последние лиды по вашим объектам">
        {leads.length === 0 && <Empty t="Пока нет заявок на ваши объекты" />}
        {leads.slice(0, 5).map((a) => { const p = propById(a.propId); return (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 6px", borderBottom: `1px solid ${C.line}` }}>
            <div><div style={{ fontWeight: 600, fontSize: 14.5 }}>{p ? p.title : a.propId}</div><div style={{ fontSize: 12, color: C.sub }}>{a.id} · заявка на ипотеку · {fmt(a.price)} млн ₸</div></div>
            <Badge s={a.status} />
          </div>
        ); })}
      </Panel>
    </div>
  );
}

function PublishForm({ onPublish }) {
  const [f, setF] = useState({ type: "residential", title: "", city: "Астана", district: "", area: 50, rooms: 2, price: 30, promo: 0, installment: true });
  const set = (k, v) => setF({ ...f, [k]: v });
  const ok = f.title.trim() && f.price > 0 && f.area > 0;
  return (
    <div>
      <Header title="Опубликовать объект" sub="Карточка появится в каталоге покупателей" accent={C.blue} />
      <Panel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Sel l="Тип" v={f.type} onChange={(v) => set("type", v)} opts={Object.entries(PROP_TYPES)} />
          <Input l="Город" v={f.city} onChange={(v) => set("city", v)} />
          <div style={{ gridColumn: "1 / -1" }}><Input l="Название / ЖК" v={f.title} onChange={(v) => set("title", v)} ph="напр. ЖК «Tumar», 2-комн." /></div>
          <div style={{ gridColumn: "1 / -1" }}><Input l="Район / адрес" v={f.district} onChange={(v) => set("district", v)} /></div>
          <Num l="Площадь, м²" v={f.area} onChange={(v) => set("area", v)} />
          <Num l="Комнат (0 — студия/коммерция)" v={f.rooms} onChange={(v) => set("rooms", v)} />
          <Num l="Цена, млн ₸" v={f.price} onChange={(v) => set("price", v)} />
          <Num l="Скидка / акция, %" v={f.promo} onChange={(v) => set("promo", v)} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={f.installment} onChange={(e) => set("installment", e.target.checked)} style={{ accentColor: C.blue, width: 16, height: 16 }} />
          Доступна рассрочка от застройщика
        </label>
        <div style={{ marginTop: 20 }}>
          <button disabled={!ok} onClick={() => onPublish(f)} style={{ ...btnB(true), opacity: ok ? 1 : 0.4 }}>Опубликовать →</button>
        </div>
      </Panel>
    </div>
  );
}

function DevObjects({ listings, apps, onToggle, onPublish }) {
  const leadsFor = (id) => apps.filter((a) => a.propId === id).length;
  return (
    <div>
      <Header title="Мои объекты" sub={`${listings.length} карточек`} action={["Опубликовать", onPublish]} accent={C.blue} />
      <Panel>
        {listings.length === 0 && <Empty t="Вы ещё не опубликовали ни одного объекта" />}
        {listings.map((l) => (
          <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 6px", borderBottom: `1px solid ${C.line}` }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>{l.title} {l.promo > 0 && <span style={{ color: "#b91c1c", fontSize: 12 }}>−{l.promo}%</span>}</div>
              <div style={{ fontSize: 12, color: C.sub }}>{l.city} · {l.area} м² · {effPrice(l)} млн ₸ · 👁 {fmt(l.views || 0)} · {leadsFor(l.id)} заявок</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: l.status === "published" ? "#15803d" : C.sub, background: l.status === "published" ? "#e7f4ec" : "#efece6", padding: "4px 11px", borderRadius: 20 }}>{l.status === "published" ? "Опубликован" : "Снят"}</span>
              <button onClick={() => onToggle(l.id)} style={btn(false)}>{l.status === "published" ? "Снять" : "Вернуть"}</button>
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function Leads({ apps, dev, profile }) {
  const mineIds = PROP_REGISTRY.filter((p) => p.developer === dev.name).map((p) => p.id);
  const leads = apps.filter((a) => mineIds.includes(a.propId));
  const bankName = (id) => { const b = BANKS.find((x) => x.id === id); return b ? `${b.name} · ${b.program}` : "—"; };
  return (
    <div>
      <Header title="Лиды" sub="Покупатели, оформляющие ипотеку на ваши объекты" accent={C.blue} />
      <Panel>
        {leads.length === 0 && <Empty t="Пока нет заявок на ваши объекты" />}
        {leads.map((a) => { const p = propById(a.propId); return (
          <div key={a.id} style={{ padding: "14px 6px", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{p ? p.title : a.propId}</div>
              <Badge s={a.status} />
            </div>
            <div style={{ display: "flex", gap: 22, fontSize: 13, color: C.sub, flexWrap: "wrap" }}>
              <span>Клиент: <b style={{ color: C.ink }}>{profile.name}</b></span>
              <span>Телефон: <b style={{ color: C.ink, ...mono }}>{a.phone ? fmtPhone(a.phone) : "—"}</b></span>
              <span>ИИН: <b style={{ color: C.ink, ...mono }}>{a.iin ? a.iin.slice(0, 6) + "••••••" : "—"}</b></span>
              <span>Сумма: <b style={{ color: C.ink, ...mono }}>{fmt(a.price)} млн ₸</b></span>
              <span>Банк: <b style={{ color: C.ink }}>{a.chosenBank ? bankName(a.chosenBank) : "подбор"}</b></span>
            </div>
          </div>
        ); })}
      </Panel>
      <p style={{ fontSize: 12, color: C.sub, marginTop: 14 }}>Связь напрямую с заявками покупателей: застройщик видит спрос на свои объекты и стадию финансирования. Контакты покупателя открываются по его согласию.</p>
    </div>
  );
}

function DevProfile({ dev, setDev }) {
  return (
    <div>
      <Header title="Компания" sub="Профиль застройщика" accent={C.blue} />
      <Panel>
        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ fontSize: 12.5, color: C.sub }}>Название компании</span>
          <input value={dev.name} onChange={(e) => setDev({ ...dev, name: e.target.value })} style={inp} />
        </label>
        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ fontSize: 12.5, color: C.sub }}>БИН</span>
          <input value={dev.bin} maxLength={12} onChange={(e) => setDev({ ...dev, bin: e.target.value.replace(/\D/g, "") })} style={{ ...inp, ...mono, borderColor: dev.bin.length === 12 ? (validateIin(dev.bin) ? "#15803d" : "#b91c1c") : C.line }} />
          <span style={{ fontSize: 12, color: dev.bin.length === 12 ? (validateIin(dev.bin) ? "#15803d" : "#b91c1c") : C.sub }}>{dev.bin.length === 12 ? (validateIin(dev.bin) ? "✓ контрольный разряд верный" : "✗ неверный БИН") : `${dev.bin.length}/12`}</span>
        </label>
        <label style={{ display: "block", marginBottom: 18 }}>
          <span style={{ fontSize: 12.5, color: C.sub }}>Город</span>
          <input value={dev.city} onChange={(e) => setDev({ ...dev, city: e.target.value })} style={inp} />
        </label>
        <p style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.5 }}>БИН проверяется по той же контрольной сумме, что и ИИН (12 знаков). В проде — сверка с ГБД ЮЛ и реестром застройщиков.</p>
      </Panel>
    </div>
  );
}

/* ---- DocRow ------------------------------------------------------ */
function DocRow({ type, doc, canUpload, onUpload }) {
  const ref = useRef();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 6px", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 16 }}>{doc ? "✅" : "⬜"}</span>
        <div><div style={{ fontWeight: 600, fontSize: 14 }}>{DOC_TYPES[type]}</div>{doc && <div style={{ fontSize: 12, color: C.sub, ...mono }}>{doc.name} · {(doc.size / 1024).toFixed(0)} КБ</div>}</div>
      </div>
      {canUpload && (<>
        <input ref={ref} type="file" style={{ display: "none" }} onChange={(e) => e.target.files[0] && onUpload(e.target.files[0])} />
        <button onClick={() => ref.current.click()} style={btn(false)}>{doc ? "Заменить" : "Загрузить"}</button>
      </>)}
    </div>
  );
}

/* ---- Общие компоненты -------------------------------------------- */
const btn = (primary) => ({ padding: "9px 16px", borderRadius: 9, cursor: "pointer", ...body, fontWeight: 600, fontSize: 13.5, border: primary ? "none" : `1px solid ${C.line}`, background: primary ? C.teal : C.panel, color: primary ? "#fff" : C.ink });
const btnB = (primary) => ({ ...btn(primary), background: primary ? C.blue : C.panel });

function Header({ title, sub, action, accent }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
      <div>
        <h1 style={{ ...display, fontWeight: 700, fontSize: 30, margin: 0 }}>{title}</h1>
        <div style={{ color: C.sub, fontSize: 14, marginTop: 2 }}>{sub}</div>
      </div>
      {action && <button onClick={action[1]} style={{ ...btn(true), background: accent || C.teal }}>+ {action[0]}</button>}
    </div>
  );
}
function Kpi({ label, value, accent, accentColor }) {
  return (
    <div style={{ background: accent ? C.ink : C.panel, color: accent ? "#fff" : C.ink, border: `1px solid ${accent ? C.ink : C.line}`, borderRadius: 12, padding: 18 }}>
      <div style={{ fontSize: 12.5, color: accent ? "#b6b0a6" : C.sub, marginBottom: 8 }}>{label}</div>
      <div style={{ ...display, fontWeight: 700, fontSize: 25, color: accentColor && accent ? "#fff" : undefined }}>{value}</div>
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
  const p = propById(a.propId);
  return (
    <div onClick={() => onOpen(a.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 6px", borderBottom: `1px solid ${C.line}`, cursor: "pointer" }}>
      <div><div style={{ fontWeight: 600, fontSize: 14.5 }}>{p ? p.title : PROP_TYPES[a.propType]}</div><div style={{ fontSize: 12, color: C.sub }}>{a.id} · {p ? p.city : ""}{p && p.developer ? ` · ${p.developer}` : ""} · {a.term} лет</div></div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}><span style={{ ...mono, fontSize: 14 }}>{fmt(a.price)} млн ₸</span><Badge s={a.status} /></div>
    </div>
  );
}
function Badge({ s }) {
  const st = STATUS[s] || STATUS.draft;
  return <span style={{ fontSize: 12, fontWeight: 600, color: st.c, background: st.bg, padding: "4px 11px", borderRadius: 20, whiteSpace: "nowrap" }}>{st.label}</span>;
}
function Field({ l, v }) {
  return <div><div style={{ fontSize: 11.5, color: C.sub, marginBottom: 2 }}>{l}</div><div style={{ fontWeight: 600, fontSize: 14 }}>{v}</div></div>;
}
function Empty({ t }) { return <div style={{ color: C.sub, padding: 24, textAlign: "center", fontSize: 14 }}>{t}</div>; }
function Input({ l, v, onChange, ph }) {
  return <label style={{ display: "block" }}><span style={{ fontSize: 12.5, color: C.sub }}>{l}</span><input value={v} placeholder={ph || ""} onChange={(e) => onChange(e.target.value)} style={inp} /></label>;
}
function Num({ l, v, onChange }) {
  return <label style={{ display: "block" }}><span style={{ fontSize: 12.5, color: C.sub }}>{l}</span><input type="number" value={v} onChange={(e) => onChange(+e.target.value)} style={{ ...inp, ...mono }} /></label>;
}
function Sel({ l, v, onChange, opts }) {
  return <label style={{ display: "block" }}><span style={{ fontSize: 12.5, color: C.sub }}>{l}</span><select value={v} onChange={(e) => onChange(e.target.value)} style={inp}>{opts.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>;
}
const inp = { width: "100%", marginTop: 5, padding: "10px 12px", borderRadius: 9, border: `1px solid ${C.line}`, background: "#fff", fontSize: 14, fontFamily: "'Hanken Grotesk', sans-serif", boxSizing: "border-box", color: C.ink };
