import React, { useState, useEffect, useMemo } from "react";

/* ============================================================
   ПЛАТФОРМА КРЕДИТНОГО БРОКЕРА для застройщиков (единый проект)
   Закладки:
     • Сайт      — витрина Hayat + онлайн-оформление (Вариант 1)
     • Заявки    — брокерский/CRM мониторинг (Вариант 2)
     • Банки     — настройка банковских сервисов (JsonMortgage / ESB)
   Брокер стоит между застройщиком и банком. Коннекторы банков
   питают флоу на сайте; оформленные заявки идут в «Заявки».
   ============================================================ */

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');`;
const C = {
  bg: "#f5f6f8", cream: "#f5f3ef", panel: "#fff", ink: "#191c22", sub: "#6a7180", line: "#e4e7ec",
  gold: "#a8823c", goldDk: "#8a6a2c", goldSoft: "#f3ead0", indigo: "#4f46e5", indigoSoft: "#eef0fe",
  green: "#0e8f5b", greenSoft: "#e5f4ed", amber: "#b7791f", red: "#c0392b", sidebar: "#171a21",
};
const serif = { fontFamily: "'Fraunces', serif" };
const body = { fontFamily: "'Hanken Grotesk', sans-serif" };
const mono = { fontFamily: "'JetBrains Mono', monospace" };
const fmt = (n) => new Intl.NumberFormat("ru-RU").format(Math.round(n));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = () => Math.floor(100000 + Math.random() * 899999);
const guid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16); });
const nowIso = () => new Date().toISOString().slice(0, 23);

/* ---- Проверки ИИН / телефона (РК) -------------------------------- */
function validateIin(raw) {
  const iin = String(raw).replace(/\D/g, "");
  if (iin.length !== 12) return false;
  const w1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], w2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];
  let s1 = 0; for (let i = 0; i < 11; i++) s1 += +iin[i] * w1[i];
  let c = s1 % 11;
  if (c === 10) { let s2 = 0; for (let i = 0; i < 11; i++) s2 += +iin[i] * w2[i]; c = s2 % 11; if (c === 10) return false; }
  return c === +iin[11];
}
function phoneDigits(raw) { let d = String(raw).replace(/\D/g, ""); if (d[0] === "8") d = "7" + d.slice(1); return d.slice(0, 11); }
function validatePhone(raw) { const d = phoneDigits(raw); return d.length === 11 && d[0] === "7"; }
function fmtPhone(raw) { const d = phoneDigits(raw); if (!d) return ""; let s = "+7"; if (d.length > 1) s += " (" + d.slice(1, 4); if (d.length >= 5) s += ") " + d.slice(4, 7); if (d.length >= 8) s += "-" + d.slice(7, 9); if (d.length >= 10) s += "-" + d.slice(9, 11); return s; }

/* ---- Коннектор Altyn (сид из спецификации JsonMortgage) ---------- */
const ALTYN = {
  id: "altyn-online-ipoteka", name: "Altyn Bank · Online Ipoteka", env: "test", enabled: true,
  restUrl: "http://ala33535.hsbk.nb:7900/JsonMortgage", soapUrl: "http://ala33535.hsbk.nb:7806/esb/mortgage/v1.0",
  version: "TL 1.1", source: "BI", signType: "AITU", token: "", timeout: 30,
  seller: { name: "Hayat Construction Group", bin: "151040016771", branchCode: "GPM000011", branchName: "Отдел продаж Hayat", managerFullName: "", managerPhone: "77016167773" },
  products: [
    { internal: "Ипотека", code: "biMortgage", productRef: "ALTNM", kind: "mortgage", rate: 14, enabled: true },
    { internal: "7‑20‑25", code: "72025", productRef: "ALTNM", kind: "mortgage", rate: 7, enabled: true },
    { internal: "Рассрочка (Altyn‑i)", code: "installmentMortgage", productRef: "ALTNM INS", kind: "installment", rate: 0, enabled: true },
  ],
  fieldMap: [
    { group: "Заявка", path: "body[].orderNumber", label: "Номер заявки", src: "order.ref", req: true },
    { group: "Заявка", path: "body[].desiredProductType", label: "Тип продукта", src: "product.code", req: true },
    { group: "Заявка", path: "body[].amount", label: "Сумма займа", src: "order.amount", req: true },
    { group: "Заявка", path: "body[].initialSum", label: "Первонач. взнос", src: "order.down", req: true },
    { group: "Заявка", path: "body[].desiredLoanTerm", label: "Срок (мес)", src: "order.termMonths", req: true },
    { group: "Заявка", path: "body[].desiredPaymentMethod", label: "Способ платежа", src: "order.paymentMethod", req: true },
    { group: "Согласие", path: "agreementToFCBSignHash.signature", label: "Подпись согласия (AITU)", src: "consent.signature", req: true },
    { group: "Продавец", path: "seller.bin", label: "БИН застройщика", src: "seller.bin", req: true },
    { group: "Объект", path: "complex[].type", label: "Тип недвижимости", src: "object.realtyType", req: true },
    { group: "Объект", path: "complex[].name", label: "ЖК / объект", src: "object.complexName", req: true },
    { group: "Объект", path: "complex[].marketCost", label: "Рыночная стоимость", src: "object.marketCost", req: true },
    { group: "Клиент", path: "customer[].taxCode", label: "ИИН", src: "client.iin", req: true },
    { group: "Клиент", path: "customer[].mobilePhone", label: "Телефон", src: "client.phone", req: true },
  ],
  states: [
    { state: "approve", title: "Одобрено", internal: "approved" },
    { state: "reject", title: "Отказ", internal: "rejected" },
    { state: "readyRegistration", title: "Готов к регистрации", internal: "ready" },
    { state: "signed", title: "Займ выдан", internal: "issued" },
  ],
};
const blankConnector = (n) => ({ ...JSON.parse(JSON.stringify(ALTYN)), id: "bank-" + Date.now(), name: n || "Новый банк", enabled: false, restUrl: "", soapUrl: "", token: "" });

/* ---- Расчёт офферов из продуктов коннектора ---------------------- */
function annuity(loanMln, rate, months) { const r = rate / 100 / 12, p = loanMln * 1e6; return r === 0 ? p / months : (p * r) / (1 - Math.pow(1 + r, -months)); }
function offersFrom(connector, price, down, months) {
  const loan = +(price - down).toFixed(1);
  return (connector?.products || []).filter((p) => p.enabled).map((p, i) => {
    const term = p.kind === "installment" ? Math.min(months, 36) : months;
    const m = annuity(loan, p.rate, term);
    return { id: p.code + i, bank: connector.name.split(" · ")[0], name: p.internal, kind: p.kind, rate: p.rate, gesv: p.rate === 0 ? 0 : +(p.rate + 1.2).toFixed(1), loan, term, monthly: Math.round(m), productRef: p.productRef };
  }).sort((a, b) => a.rate - b.rate);
}

/* ---- Проекты Hayat ----------------------------------------------- */
const PROJECTS = [
  { id: "meliora", name: "Hayat Meliora", cls: "Премиум", status: "сдача II кв. 2024", addr: "Алматы, ул. Сагадат Нурмагамбетов, 28Б", flats: 216, area: 3.4, from: 32, hue: 34 },
  { id: "regency", name: "Hayat Regency", cls: "Премиум", status: "проект сдан", addr: "Алматы, ул. Оспанова 85/80", flats: 184, area: 2.6, from: 48, hue: 20 },
  { id: "apartments", name: "Hayat Apartments", cls: "Комфорт+", status: "сдача 2 очереди II кв. 2024", addr: "Алматы, ул. Райымбек Батыра, 161", flats: 1411, area: 5.4, from: 22, hue: 205 },
  { id: "besagash", name: "Besagash", cls: "Комфорт+", status: "сдача IV кв. 2023", addr: "Алматы, ул. Райымбек Батыра, 167", flats: 1411, area: 3.4, from: 20, hue: 150 },
  { id: "park", name: "Hayat Park", cls: "Премиум", status: "проект сдан", addr: "Алматы, ул. Рахмадиева, 6", flats: 191, area: 2.0, from: 35, hue: 262 },
  { id: "arena", name: "Hayat Arena", cls: "Премиум", status: "скоро старт продаж", addr: "Алматы, Талгарский тракт, 1а", flats: 191, area: 2.0, from: 30, hue: 8 },
];

/* ---- Сид заявок (для «Заявки») ----------------------------------- */
const SEED_ORDERS = [
  { ref: "HYT-100201", order_id: "ORD-482013", project: "Hayat Meliora", price: 38, down: 12, months: 180, client: { name: "Арман Сериков", iin: "900515312349", phone: "77011234567" }, product: { bank: "Altyn Bank", name: "Онай ипотека", rate: 14, loan: 26, monthly: 379000 }, state: "ready", created: "2026-07-10" },
  { ref: "HYT-100198", order_id: "ORD-479920", project: "Besagash", price: 22, down: 5, months: 240, client: { name: "Дана Ахметова", iin: "011224500115", phone: "77052223344" }, product: { bank: "Altyn Bank", name: "7‑20‑25", rate: 7, loan: 17, monthly: 120000 }, state: "approved", created: "2026-07-12" },
  { ref: "HYT-100205", order_id: "ORD-484551", project: "Hayat Park", price: 35, down: 14, months: 36, client: { name: "Ерлан Тлеу", iin: "890101300457", phone: "77771119988" }, product: { bank: "Altyn Bank", name: "Рассрочка (Altyn‑i)", rate: 0, loan: 21, monthly: 583000 }, state: "issued", created: "2026-07-05" },
];
const STATE_META = { approved: { t: "Одобрено", c: C.amber, bg: "#f6edda" }, ready: { t: "Готов к регистрации", c: C.indigo, bg: C.indigoSoft }, issued: { t: "Займ выдан", c: C.green, bg: C.greenSoft }, rejected: { t: "Отказ", c: C.red, bg: "#fbe9e9" } };
const PIPELINE = ["approved", "ready", "issued"];

/* ============================================================ */
export default function App() {
  const [tab, setTab] = useState("site");
  const [connectors, setConnectors] = useState([ALTYN, { ...blankConnector("Freedom Bank · Онлайн-ипотека"), id: "freedom", source: "BI" }, { ...blankConnector("Банк ЦентрКредит · Super"), id: "bcc" }]);
  const [orders, setOrders] = useState(SEED_ORDERS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { (async () => {
    try {
      const c = await window.storage.get("plat:conn"); if (c?.value) setConnectors(JSON.parse(c.value));
      const o = await window.storage.get("plat:orders"); if (o?.value) setOrders(JSON.parse(o.value));
    } catch (e) {}
    setLoaded(true);
  })(); }, []);
  useEffect(() => { if (loaded) { try { window.storage.set("plat:conn", JSON.stringify(connectors)); window.storage.set("plat:orders", JSON.stringify(orders)); } catch (e) {} } }, [connectors, orders, loaded]);

  const activeConnector = connectors.find((c) => c.enabled) || connectors[0];
  const addOrder = (o) => setOrders((s) => [o, ...s]);
  const advanceOrder = (ref) => setOrders((s) => s.map((o) => { if (o.ref !== ref) return o; const i = PIPELINE.indexOf(o.state); return i >= 0 && i < PIPELINE.length - 1 ? { ...o, state: PIPELINE[i + 1] } : o; }));

  const TABS = [["site", "Сайт"], ["orders", "Заявки"], ["banks", "Банки"]];

  return (
    <div style={{ ...body, background: C.bg, color: C.ink, minHeight: "100vh" }}>
      <style>{FONTS}</style>
      {/* Верхняя панель с закладками */}
      <div style={{ background: C.sidebar, color: "#dfe3ea", padding: "0 clamp(16px,4vw,40px)", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>HAYAT<span style={{ color: C.gold }}>·</span>Broker</div>
          <div style={{ display: "flex", gap: 4 }}>
            {TABS.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", ...body, fontSize: 14, fontWeight: 600, background: tab === k ? C.indigo : "transparent", color: tab === k ? "#fff" : "#aab1bd" }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#8b93a2" }}>застройщик → <b style={{ color: C.gold }}>брокер</b> → банк</div>
      </div>

      {tab === "site" && <SiteView connector={activeConnector} onOrder={addOrder} states={activeConnector.states} />}
      {tab === "orders" && <OrdersView orders={orders} advance={advanceOrder} />}
      {tab === "banks" && <BanksView connectors={connectors} setConnectors={setConnectors} />}
    </div>
  );
}

/* ======================= САЙТ ======================= */
function SiteView({ connector, onOrder }) {
  const [modal, setModal] = useState(null);
  return (
    <div style={{ background: C.cream }}>
      <header style={{ background: `linear-gradient(155deg,#22201f,${C.ink})`, color: C.cream, padding: "clamp(40px,7vw,80px) clamp(18px,5vw,64px) 0", overflow: "hidden" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "inline-block", border: `1px solid ${C.gold}`, color: C.gold, padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, marginBottom: 22 }}>Онлайн-ипотека и рассрочка · одобрение по ИИН</div>
          <h1 style={{ ...serif, fontWeight: 600, fontSize: "clamp(32px,5.5vw,58px)", lineHeight: 1.03, margin: 0, maxWidth: 700, letterSpacing: "-1.2px" }}>Ничего лишнего — только лучшее</h1>
          <p style={{ fontSize: "clamp(15px,2vw,18px)", color: "#c7c2b8", maxWidth: 540, marginTop: 18, lineHeight: 1.5 }}>Жилые комплексы Hayat в Алматы. Выберите квартиру и оформите финансирование онлайн — заявка уходит в банк через {connector.name.split(" · ")[0]}.</p>
          <svg viewBox="0 0 1200 90" style={{ display: "block", width: "100%", marginTop: 34 }} preserveAspectRatio="none">
            {Array.from({ length: 28 }).map((_, i) => { const w = 43, h = 22 + ((i * 41) % 60); return <rect key={i} x={i * w} y={90 - h} width={w - 5} height={h} fill="rgba(168,130,60,.10)" />; })}
          </svg>
        </div>
      </header>

      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(36px,5vw,64px) clamp(18px,5vw,64px)" }}>
        <div style={{ marginBottom: 26 }}>
          <div style={{ color: C.gold, fontWeight: 700, fontSize: 13, letterSpacing: ".6px", textTransform: "uppercase" }}>Проекты</div>
          <h2 style={{ ...serif, fontWeight: 600, fontSize: "clamp(26px,3.5vw,40px)", margin: "6px 0 0", letterSpacing: "-1px" }}>Новые ЖК в Алматы</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 22 }}>
          {PROJECTS.map((p) => (
            <div key={p.id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ height: 150, background: `linear-gradient(150deg,hsl(${p.hue} 20% 30%),hsl(${p.hue} 22% 16%))`, position: "relative", display: "flex", alignItems: "flex-end", padding: 16 }}>
                <span style={{ position: "absolute", top: 12, left: 12, background: C.gold, color: "#fff", fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 6 }}>{p.cls}</span>
                <span style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,.32)", color: "#fff", fontSize: 11, padding: "3px 9px", borderRadius: 6 }}>{p.status}</span>
                <div style={{ ...serif, fontWeight: 700, fontSize: 24, color: "#fff" }}>{p.name}</div>
              </div>
              <div style={{ padding: 18, display: "flex", flexDirection: "column", flex: 1 }}>
                <div style={{ fontSize: 13, color: C.sub, marginBottom: 12, minHeight: 36 }}>{p.addr}</div>
                <div style={{ display: "flex", gap: 14, fontSize: 12.5, marginBottom: 14 }}><span><b style={mono}>{fmt(p.flats)}</b> квартир</span><span><b style={mono}>{p.area}</b> га</span></div>
                <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div><div style={{ fontSize: 12, color: C.sub }}>от</div><div style={{ ...serif, fontWeight: 700, fontSize: 19 }}>{p.from} млн ₸</div></div>
                  <button onClick={() => setModal(p)} style={{ background: C.gold, color: "#fff", border: "none", padding: "10px 16px", borderRadius: 8, ...body, fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>Оформить →</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ background: C.ink, color: "#b0aaa0", padding: "30px clamp(18px,5vw,64px)", fontSize: 13 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <span>Hayat Construction Group © 2007–2026 · Алматы</span>
          <span>5533 · +7 700 511 17 77</span>
        </div>
      </footer>

      {modal && <BrokerFlow project={modal} connector={connector} onClose={() => setModal(null)} onOrder={onOrder} />}
    </div>
  );
}

/* ---- Брокерский флоу (схема «Золотая рассрочка») ----------------- */
const STEPS = ["Заявка", "Согласие ПКБ/ГЦВП", "Решение банка", "Оформление ДДУ", "Выдача"];
function BrokerFlow({ project, connector, onClose, onOrder }) {
  const [step, setStep] = useState(0);
  const [downPct, setDownPct] = useState(30), [months, setMonths] = useState(180);
  const [name, setName] = useState(""), [iin, setIin] = useState(""), [phone, setPhone] = useState("");
  const [cons, setCons] = useState({ pkb: false, gcvp: false, pd: false });
  const [busy, setBusy] = useState(false), [api, setApi] = useState({}), [chosen, setChosen] = useState(null), [ref, setRef] = useState(null), [ff, setFf] = useState({});
  const price = project.from, down = +(price * downPct / 100).toFixed(1);
  const iinOk = validateIin(iin), phoneOk = validatePhone(phone);
  const s1 = name.trim() && iinOk && phoneOk, allC = cons.pkb && cons.gcvp && cons.pd;

  const place = async () => {
    setBusy(true);
    await wait(600); // POST /document/customer-agreement
    const oid = "ORD-" + rnd(); setApi({ order_id: oid }); setStep(2); // POST /order/place
    await wait(1400); // GET /order/{id}/status  (SendOffers)
    const offers = offersFrom(connector, price, down, months);
    setApi({ order_id: oid, decision: offers.length ? "approved" : "rejected", offers }); setBusy(false);
  };
  const pick = async (o) => { setBusy(true); await wait(500); setChosen(o); setStep(3); setBusy(false); }; // POST /order/confirm
  const fulfill = async () => {
    setBusy(true); setFf({ ddu: true }); await wait(450); setFf((f) => ({ ...f, pay: true })); await wait(450); setFf((f) => ({ ...f, gl: true })); await wait(350);
    const r = "HYT-" + rnd();
    onOrder({ ref: r, order_id: api.order_id, project: project.name, price, down, months, client: { name, iin, phone }, product: chosen, state: "issued", created: new Date().toISOString().slice(0, 10) });
    setRef(r); setStep(4); setBusy(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,22,26,.55)", display: "grid", placeItems: "center", padding: 16, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.cream, borderRadius: 18, width: 600, maxWidth: "100%", maxHeight: "94vh", overflow: "auto" }}>
        <div style={{ background: `linear-gradient(150deg,hsl(${project.hue} 22% 28%),hsl(${project.hue} 24% 15%))`, color: "#fff", padding: "18px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div><div style={{ fontSize: 12, opacity: .8 }}>Hayat → брокер → {connector.name.split(" · ")[0]}</div><div style={{ ...serif, fontWeight: 700, fontSize: 21 }}>{project.name}</div></div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,.15)", color: "#fff", border: "none", width: 30, height: 30, borderRadius: 8, cursor: "pointer", fontSize: 17 }}>×</button>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
            {STEPS.map((st, i) => <div key={st} style={{ flex: "1 1 84px", fontSize: 10.5, textAlign: "center" }}><div style={{ height: 4, borderRadius: 3, background: i <= step ? C.gold : "rgba(255,255,255,.2)", marginBottom: 5 }} /><span style={{ color: i <= step ? "#fff" : "rgba(255,255,255,.55)" }}>{i + 1}. {st}</span></div>)}
          </div>
        </div>
        <div style={{ padding: 24 }}>
          {step === 0 && (<>
            <Slider label="Первоначальный взнос" val={`${downPct}% · ${fmt(down)} млн ₸`} min={10} max={60} value={downPct} onChange={setDownPct} />
            <Slider label="Срок" val={`${months} мес · ${Math.round(months / 12)} лет`} min={12} max={300} value={months} onChange={setMonths} />
            <Box>Стоимость <b style={mono}>{price} млн ₸</b> · займ <b style={mono}>{fmt(price - down)} млн ₸</b></Box>
            <div style={{ ...serif, fontWeight: 600, fontSize: 16, margin: "14px 0 10px" }}>Данные клиента</div>
            <Fld l="Имя"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к вам обращаться" style={inp} /></Fld>
            <Fld l="ИИН"><div style={{ position: "relative" }}><input value={iin} maxLength={12} onChange={(e) => setIin(e.target.value.replace(/\D/g, ""))} placeholder="12 цифр" style={{ ...inp, ...mono, borderColor: iin.length === 12 ? (iinOk ? C.green : C.red) : C.line }} /><Tick show={iin.length === 12} ok={iinOk} /></div></Fld>
            <Fld l="Телефон"><div style={{ position: "relative" }}><input value={fmtPhone(phone)} inputMode="tel" placeholder="+7 (7__) ___-__-__" onChange={(e) => setPhone(phoneDigits(e.target.value))} style={{ ...inp, ...mono, borderColor: phoneDigits(phone).length === 11 ? (phoneOk ? C.green : C.red) : C.line }} /><Tick show={phoneDigits(phone).length === 11} ok={phoneOk} /></div></Fld>
            <Gold disabled={!s1} onClick={() => setStep(1)}>Далее →</Gold>
          </>)}

          {step === 1 && (<>
            <div style={{ ...serif, fontWeight: 600, fontSize: 17, marginBottom: 6 }}>Согласие на запрос данных</div>
            <p style={{ fontSize: 13.5, color: C.sub, marginTop: 0, marginBottom: 14 }}>Банк запрашивает кредитную историю и доходы. Подпишите согласия.</p>
            {[["pkb", "Согласие на запрос в кредитное бюро (ПКБ/ГКБ)"], ["gcvp", "Согласие на запрос в ГЦВП (доходы)"], ["pd", "Согласие на обработку персональных данных"]].map(([k, t]) => (
              <label key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, marginBottom: 12, cursor: "pointer", lineHeight: 1.45 }}><input type="checkbox" checked={cons[k]} onChange={(e) => setCons({ ...cons, [k]: e.target.checked })} style={{ accentColor: C.gold, width: 17, height: 17, marginTop: 1 }} /><span>{t}</span></label>
            ))}
            <div style={{ display: "flex", gap: 10 }}><Ghost onClick={() => setStep(0)}>Назад</Ghost><Gold disabled={!allC || busy} onClick={place}>{busy ? "Отправка…" : "Подписать и отправить →"}</Gold></div>
            <ApiNote>POST /document/customer-agreement → POST /order/place</ApiNote>
          </>)}

          {step === 2 && (<>
            {!api.decision ? <Loading text="Данные обрабатываются. Заявка в банке…" sub={api.order_id} /> :
              api.decision === "rejected" ? <div style={{ textAlign: "center", padding: 20 }}><div style={{ ...serif, fontWeight: 700, fontSize: 22, color: C.red }}>Отказ</div><Ghost onClick={() => { setApi({}); setStep(0); }}>Изменить условия</Ghost></div> :
              (<>
                <div style={{ ...serif, fontWeight: 600, fontSize: 17, marginBottom: 4 }}>Решение — одобрено</div>
                <p style={{ fontSize: 13, color: C.sub, marginTop: 0, marginBottom: 14 }}>Заявка {api.order_id}. На выбор — 24 часа.</p>
                <div style={{ display: "grid", gap: 10 }}>
                  {api.offers.map((o) => (
                    <div key={o.id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><div><div style={{ fontWeight: 700, fontSize: 15 }}>{o.bank}</div><div style={{ fontSize: 12.5, color: o.kind === "installment" ? C.goldDk : C.sub }}>{o.name}</div></div><div style={{ ...mono, fontWeight: 700, fontSize: 17, color: C.goldDk }}>{o.rate === 0 ? "0%" : o.rate + "%"}</div></div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}><M l="Займ" v={`${fmt(o.loan)} млн ₸`} /><M l={o.kind === "installment" ? "Срок" : "ГЭСВ"} v={o.kind === "installment" ? `${o.term} мес` : `от ${o.gesv}%`} /><M l="Платёж/мес" v={`${fmt(o.monthly)} ₸`} /></div>
                      <Gold disabled={busy} onClick={() => pick(o)}>Выбрать и продолжить</Gold>
                    </div>
                  ))}
                </div>
                <ApiNote>GET /order/{"{id}"}/status (SendOffers) → POST /order/confirm</ApiNote>
              </>)}
          </>)}

          {step === 3 && (<>
            <div style={{ ...serif, fontWeight: 600, fontSize: 17, marginBottom: 4 }}>Оформление ДДУ</div>
            <p style={{ fontSize: 13, color: C.sub, marginTop: 0, marginBottom: 14 }}>{chosen.bank} · {chosen.name} · {fmt(chosen.loan)} млн ₸ · {fmt(chosen.monthly)} ₸/мес</p>
            <Chk done={ff.ddu} t="Подписание и регистрация ДДУ" /><Chk done={ff.pay} t={`Оплата взноса — ${fmt(down)} млн ₸`} /><Chk done={ff.gl} t="Гарантийное письмо банка" />
            <div style={{ background: C.goldSoft, borderRadius: 10, padding: "12px 14px", margin: "14px 0", fontSize: 12.5, color: C.goldDk, lineHeight: 1.5 }}>В банк передаётся: № и дата ДДУ, ссылка на ДДУ, св‑во о регистрации, гарантийное письмо, наименование / счёт / БИН УК.</div>
            <Gold disabled={busy} onClick={fulfill}>{busy ? "Оформляем…" : "Оформить и отправить в банк →"}</Gold>
            <ApiNote>GET /document/guarantee-letter → UpdateOrderState: signed</ApiNote>
          </>)}

          {step === 4 && (
            <div style={{ textAlign: "center", padding: 10 }}>
              <div style={{ ...serif, fontWeight: 700, fontSize: 24, color: C.green, marginBottom: 8 }}>Заявка оформлена ✓</div>
              <div style={{ fontSize: 14, color: C.sub, marginBottom: 16 }}>Заявка <b style={{ ...mono, color: C.ink }}>{ref}</b> · банк {api.order_id}. Появилась во вкладке «Заявки». SMS на {fmtPhone(phone)}.</div>
              <Gold onClick={onClose}>Готово</Gold>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ======================= ЗАЯВКИ (CRM / брокер) ======================= */
function OrdersView({ orders, advance }) {
  const [f, setF] = useState("all");
  const [open, setOpen] = useState(null);
  const list = orders.filter((o) => f === "all" || o.state === f);
  const kpi = {
    active: orders.filter((o) => ["approved", "ready"].includes(o.state)).length,
    issued: orders.filter((o) => o.state === "issued").length,
    volume: orders.filter((o) => o.state === "issued").reduce((s, o) => s + o.product.loan, 0),
    commission: orders.filter((o) => o.state === "issued").reduce((s, o) => s + o.product.loan * 0.015, 0),
  };
  const cur = orders.find((o) => o.ref === open);
  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "26px clamp(18px,4vw,40px)" }}>
      <h1 style={{ fontWeight: 700, fontSize: 24, margin: "0 0 4px" }}>Заявки</h1>
      <div style={{ fontSize: 13.5, color: C.sub, marginBottom: 20 }}>Мониторинг заявок брокера между застройщиком и банком</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 22 }}>
        <Kpi l="В работе" v={kpi.active} /><Kpi l="Выдано займов" v={kpi.issued} accent /><Kpi l="Объём выдач" v={fmt(kpi.volume) + " млн ₸"} /><Kpi l="Комиссия 1.5%" v={fmt(kpi.commission * 10) / 10 + " млн ₸"} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[["all", "Все"], ...PIPELINE.map((s) => [s, STATE_META[s].t]), ["rejected", "Отказ"]].map(([k, l]) => (
          <button key={k} onClick={() => setF(k)} style={{ padding: "7px 14px", borderRadius: 20, border: `1px solid ${C.line}`, cursor: "pointer", ...body, fontSize: 13, fontWeight: 500, background: f === k ? C.ink : C.panel, color: f === k ? "#fff" : C.sub }}>{l}</button>
        ))}
      </div>
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead><tr>{["Заявка", "Клиент", "Проект", "Продукт", "Займ", "Статус", ""].map((h) => <th key={h} style={{ textAlign: "left", padding: "11px 14px", fontSize: 11.5, color: C.sub, fontWeight: 600, borderBottom: `1px solid ${C.line}` }}>{h}</th>)}</tr></thead>
          <tbody>
            {list.map((o) => { const st = STATE_META[o.state]; return (
              <tr key={o.ref} onClick={() => setOpen(o.ref)} style={{ cursor: "pointer", borderBottom: `1px solid ${C.line}` }}>
                <td style={cell}><span style={mono}>{o.ref}</span></td>
                <td style={cell}>{o.client.name}</td>
                <td style={cell}>{o.project}</td>
                <td style={cell}>{o.product.bank} · {o.product.name}</td>
                <td style={{ ...cell, ...mono }}>{fmt(o.product.loan)} млн ₸</td>
                <td style={cell}><span style={{ fontSize: 12, fontWeight: 600, color: st.c, background: st.bg, padding: "4px 10px", borderRadius: 20 }}>{st.t}</span></td>
                <td style={{ ...cell, color: C.sub }}>›</td>
              </tr>
            ); })}
            {list.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: C.sub }}>Нет заявок</td></tr>}
          </tbody>
        </table>
      </div>
      {cur && <OrderDetail o={cur} advance={advance} onClose={() => setOpen(null)} />}
    </div>
  );
}
function OrderDetail({ o, advance, onClose }) {
  const idx = PIPELINE.indexOf(o.state);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,22,26,.5)", display: "flex", justifyContent: "flex-end", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, width: 440, maxWidth: "100%", height: "100%", overflow: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><div><div style={{ fontWeight: 700, fontSize: 20 }}>{o.project}</div><div style={{ ...mono, fontSize: 12.5, color: C.sub }}>{o.ref} · банк {o.order_id}</div></div><button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: C.sub }}>×</button></div>
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <Row2 l="Клиент" v={o.client.name} /><Row2 l="ИИН" v={o.client.iin.slice(0, 6) + "••••••"} /><Row2 l="Телефон" v={fmtPhone(o.client.phone)} /><Row2 l="Продукт" v={`${o.product.bank} · ${o.product.name}`} /><Row2 l="Ставка" v={o.product.rate === 0 ? "0%" : o.product.rate + "%"} /><Row2 l="Займ" v={`${fmt(o.product.loan)} млн ₸`} /><Row2 l="Платёж" v={`${fmt(o.product.monthly)} ₸/мес`} />
      </div>
      <div style={{ ...body, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Статус (UpdateOrderState)</div>
      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        {PIPELINE.map((s, i) => { const st = STATE_META[s]; const done = o.state === "issued" ? true : i <= idx; return (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}><span style={{ width: 20, height: 20, borderRadius: 6, background: done ? C.green : "#d7dbe2", color: "#fff", display: "grid", placeItems: "center", fontSize: 12 }}>{done ? "✓" : ""}</span><span style={{ color: done ? C.ink : C.sub }}>{st.t}</span></div>
        ); })}
      </div>
      {o.state !== "issued" && o.state !== "rejected" && <button onClick={() => advance(o.ref)} style={{ ...primary, width: "100%" }}>Продвинуть статус →</button>}
      {o.state === "issued" && <div style={{ background: C.greenSoft, color: C.green, borderRadius: 8, padding: "10px 14px", fontSize: 13.5, fontWeight: 600, textAlign: "center" }}>Займ выдан застройщику ✓</div>}
      </div>
    </div>
  );
}

/* ======================= БАНКИ (настройка) ======================= */
const CFG_TABS = [["conn", "Подключение"], ["prod", "Продукты"], ["map", "Маппинг"], ["state", "Статусы"], ["test", "Проверка"]];
function BanksView({ connectors, setConnectors }) {
  const [selId, setSelId] = useState(connectors[0].id);
  const [tab, setTab] = useState("conn");
  const [saved, setSaved] = useState(false);
  const sel = connectors.find((c) => c.id === selId) || connectors[0];
  const update = (patch) => { const next = connectors.map((c) => c.id === sel.id ? { ...c, ...patch } : c); setConnectors(next); setSaved(true); setTimeout(() => setSaved(false), 1200); };
  const add = () => { const n = blankConnector(); setConnectors([...connectors, n]); setSelId(n.id); setTab("conn"); };
  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 56px)" }}>
      <aside style={{ width: 250, background: "#1f232b", color: "#dfe3ea", padding: "20px 14px" }}>
        <div style={{ fontSize: 11, color: "#8b93a2", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>Подключения</div>
        {connectors.map((c) => (
          <button key={c.id} onClick={() => setSelId(c.id)} style={{ width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 4, borderRadius: 9, border: "none", cursor: "pointer", ...body, fontSize: 13, background: c.id === sel.id ? C.indigo : "transparent", color: c.id === sel.id ? "#fff" : "#c4cad4", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span><span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: c.enabled ? C.green : "#5a6170" }} />
          </button>
        ))}
        <button onClick={add} style={{ marginTop: 8, width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px dashed #3a4150", background: "transparent", color: "#c4cad4", cursor: "pointer", ...body, fontSize: 13 }}>+ Добавить банк</button>
      </aside>
      <main style={{ flex: 1, padding: "24px 30px", maxWidth: 1000 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div><h1 style={{ fontWeight: 700, fontSize: 22, margin: 0 }}>{sel.name}</h1><div style={{ ...mono, fontSize: 12.5, color: C.sub, marginTop: 3 }}>source: {sel.source || "—"} · env: {sel.env} · {sel.version}</div></div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>{saved && <span style={{ fontSize: 13, color: C.green }}>Сохранено ✓</span>}<label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13.5, cursor: "pointer" }}><input type="checkbox" checked={sel.enabled} onChange={(e) => update({ enabled: e.target.checked })} style={{ accentColor: C.indigo, width: 16, height: 16 }} />Активно</label></div>
        </div>
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.line}`, margin: "14px 0 20px" }}>
          {CFG_TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={{ padding: "9px 15px", border: "none", background: "none", cursor: "pointer", ...body, fontSize: 14, fontWeight: 600, color: tab === k ? C.indigo : C.sub, borderBottom: `2px solid ${tab === k ? C.indigo : "transparent"}`, marginBottom: -1 }}>{l}</button>)}
        </div>
        {tab === "conn" && <CfgConn c={sel} update={update} />}
        {tab === "prod" && <CfgProducts c={sel} update={update} />}
        {tab === "map" && <CfgMap c={sel} update={update} />}
        {tab === "state" && <CfgStates c={sel} update={update} />}
        {tab === "test" && <CfgTest c={sel} />}
      </main>
    </div>
  );
}
function CfgConn({ c, update }) {
  const setS = (k, v) => update({ seller: { ...c.seller, [k]: v } });
  return (<div style={{ display: "grid", gap: 18 }}>
    <Card title="Соединение" note="Эндпоинты JsonMortgage / ESB">
      <Grid>
        <Fld l="Название"><input value={c.name} onChange={(e) => update({ name: e.target.value })} style={inp} /></Fld>
        <Fld l="Среда"><select value={c.env} onChange={(e) => update({ env: e.target.value })} style={inp}><option value="test">Test</option><option value="prod">Prod</option></select></Fld>
        <Fld l="REST · StartMortgage" wide><input value={c.restUrl} onChange={(e) => update({ restUrl: e.target.value })} placeholder="http://.../JsonMortgage" style={{ ...inp, ...mono }} /></Fld>
        <Fld l="SOAP · ESB колбэки" wide><input value={c.soapUrl} onChange={(e) => update({ soapUrl: e.target.value })} placeholder="http://.../esb/mortgage/v1.0" style={{ ...inp, ...mono }} /></Fld>
        <Fld l="version"><input value={c.version} onChange={(e) => update({ version: e.target.value })} style={inp} /></Fld>
        <Fld l="source"><input value={c.source} onChange={(e) => update({ source: e.target.value })} placeholder="BI" style={inp} /></Fld>
        <Fld l="signType"><input value={c.signType} onChange={(e) => update({ signType: e.target.value })} placeholder="AITU" style={inp} /></Fld>
        <Fld l="Auth token"><input type="password" value={c.token} onChange={(e) => update({ token: e.target.value })} style={{ ...inp, ...mono }} /></Fld>
      </Grid>
    </Card>
    <Card title="Продавец (застройщик)" note="Блок seller в StartMortgage">
      <Grid>
        <Fld l="Наименование"><input value={c.seller.name} onChange={(e) => setS("name", e.target.value)} style={inp} /></Fld>
        <Fld l="БИН"><input value={c.seller.bin} onChange={(e) => setS("bin", e.target.value.replace(/\D/g, ""))} style={{ ...inp, ...mono }} /></Fld>
        <Fld l="branchCode"><input value={c.seller.branchCode} onChange={(e) => setS("branchCode", e.target.value)} style={inp} /></Fld>
        <Fld l="Телефон менеджера"><input value={c.seller.managerPhone} onChange={(e) => setS("managerPhone", e.target.value)} style={{ ...inp, ...mono }} /></Fld>
      </Grid>
    </Card>
  </div>);
}
function CfgProducts({ c, update }) {
  const set = (i, k, v) => update({ products: c.products.map((p, j) => j === i ? { ...p, [k]: v } : p) });
  const add = () => update({ products: [...c.products, { internal: "Новый", code: "", productRef: "", kind: "mortgage", rate: 12, enabled: false }] });
  const del = (i) => update({ products: c.products.filter((_, j) => j !== i) });
  return (<Card title="Продукты банка" note="desiredProductType / ProductReferenceId">
    <table style={tbl}><thead><tr>{["Продукт", "code", "ProductRef", "Тип", "Ставка", "Вкл", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
      <tbody>{c.products.map((p, i) => (<tr key={i}>
        <td style={td}><input value={p.internal} onChange={(e) => set(i, "internal", e.target.value)} style={inp} /></td>
        <td style={td}><input value={p.code} onChange={(e) => set(i, "code", e.target.value)} placeholder="biMortgage" style={{ ...inp, ...mono }} /></td>
        <td style={td}><input value={p.productRef} onChange={(e) => set(i, "productRef", e.target.value)} placeholder="ALTNM" style={{ ...inp, ...mono }} /></td>
        <td style={td}><select value={p.kind} onChange={(e) => set(i, "kind", e.target.value)} style={{ ...inp, minWidth: 110 }}><option value="mortgage">Ипотека</option><option value="installment">Рассрочка</option></select></td>
        <td style={td}><input value={p.rate} onChange={(e) => set(i, "rate", +e.target.value || 0)} style={{ ...inp, ...mono, width: 60 }} /></td>
        <td style={{ ...td, textAlign: "center" }}><input type="checkbox" checked={p.enabled} onChange={(e) => set(i, "enabled", e.target.checked)} style={{ accentColor: C.indigo, width: 16, height: 16 }} /></td>
        <td style={{ ...td, textAlign: "center" }}><button onClick={() => del(i)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}>✕</button></td>
      </tr>))}</tbody>
    </table>
    <button onClick={add} style={addBtn}>+ Продукт</button>
    <div style={{ fontSize: 12, color: C.sub, marginTop: 10 }}>Коды: <span style={mono}>biMortgage · 72025 · installmentMortgage</span>; ref <span style={mono}>ALTNM · ALTNM INS</span>.</div>
  </Card>);
}
function CfgMap({ c, update }) {
  const groups = useMemo(() => [...new Set(c.fieldMap.map((f) => f.group))], [c.fieldMap]);
  const set = (i, v) => update({ fieldMap: c.fieldMap.map((f, j) => j === i ? { ...f, src: v } : f) });
  return (<div style={{ display: "grid", gap: 14 }}>
    <div style={{ fontSize: 13, color: C.sub }}>Соответствие полей StartMortgage полям источника (сайт / CRM).</div>
    {groups.map((g) => (<Card key={g} title={g}>
      <table style={tbl}><thead><tr>{["Поле спецификации", "Название", "Источник"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{c.fieldMap.map((f, i) => f.group === g && (<tr key={i}>
          <td style={{ ...td, ...mono, fontSize: 12, color: C.sub, whiteSpace: "nowrap" }}>{f.path}</td>
          <td style={td}>{f.label}{f.req && <span style={{ color: C.red }}> *</span>}</td>
          <td style={td}><input value={f.src} onChange={(e) => set(i, e.target.value)} style={{ ...inp, ...mono }} /></td>
        </tr>))}</tbody>
      </table>
    </Card>))}
  </div>);
}
function CfgStates({ c, update }) {
  const set = (i, k, v) => update({ states: c.states.map((s, j) => j === i ? { ...s, [k]: v } : s) });
  return (<Card title="Статусы UpdateOrderState" note="Колбэк банка → внутренний статус">
    <table style={tbl}><thead><tr>{["state", "stateTitle", "Внутренний"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
      <tbody>{c.states.map((s, i) => (<tr key={i}><td style={{ ...td, ...mono }}>{s.state}</td><td style={td}><input value={s.title} onChange={(e) => set(i, "title", e.target.value)} style={inp} /></td><td style={td}><input value={s.internal} onChange={(e) => set(i, "internal", e.target.value)} style={{ ...inp, ...mono }} /></td></tr>))}</tbody>
    </table>
    <div style={{ fontSize: 12, color: C.sub, marginTop: 10 }}>Спец: <span style={mono}>approve · reject · readyRegistration · signed</span>.</div>
  </Card>);
}
function CfgTest({ c }) {
  const enabled = c.products.filter((p) => p.enabled);
  const [s, setS] = useState({ ref: "HYT-100245", iin: "900515312349", phone: "77011234567", amount: 45.5, down: 12, term: 60, pm: "0", pi: 0, realty: "underConsRealEstate", complex: "Hayat Meliora" });
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const [phase, setPhase] = useState("idle"), [oid, setOid] = useState(null), [offers, setOffers] = useState([]), [si, setSi] = useState(-1);
  const prod = enabled[s.pi] || enabled[0] || c.products[0];
  const json = useMemo(() => buildStart(c, s, prod), [c, s, prod]);
  const flow = c.states.filter((x) => x.state !== "reject");
  const send = async () => { setPhase("sending"); setOffers([]); setSi(-1); await wait(900); setOid("ORD-" + rnd()); await wait(900); setOffers(offersFrom(c, s.amount, s.down, s.term)); setPhase("offers"); };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
      <div style={{ display: "grid", gap: 16 }}>
        <Card title="Тестовые данные"><Grid>
          <Fld l="orderNumber"><input value={s.ref} onChange={(e) => set("ref", e.target.value)} style={{ ...inp, ...mono }} /></Fld>
          <Fld l="Продукт"><select value={s.pi} onChange={(e) => set("pi", +e.target.value)} style={inp}>{enabled.map((p, i) => <option key={i} value={i}>{p.internal}</option>)}</select></Fld>
          <Fld l="ИИН"><input value={s.iin} onChange={(e) => set("iin", e.target.value.replace(/\D/g, ""))} style={{ ...inp, ...mono }} /></Fld>
          <Fld l="Телефон"><input value={s.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))} style={{ ...inp, ...mono }} /></Fld>
          <Fld l="amount, млн"><input value={s.amount} onChange={(e) => set("amount", +e.target.value || 0)} style={inp} /></Fld>
          <Fld l="initialSum, млн"><input value={s.down} onChange={(e) => set("down", +e.target.value || 0)} style={inp} /></Fld>
          <Fld l="Срок, мес"><input value={s.term} onChange={(e) => set("term", +e.target.value || 0)} style={inp} /></Fld>
          <Fld l="paymentMethod"><select value={s.pm} onChange={(e) => set("pm", e.target.value)} style={inp}><option value="0">0 — Аннуитет</option><option value="1">1 — Равные доли</option></select></Fld>
        </Grid></Card>
        <Card title="StartMortgage · тело запроса" note={`POST ${c.restUrl || "—"}`}><pre style={pre}>{JSON.stringify(json, null, 2)}</pre></Card>
      </div>
      <div style={{ display: "grid", gap: 16 }}>
        <Card title="Прогон флоу"><button onClick={send} disabled={phase === "sending"} style={{ ...primary, width: "100%", opacity: phase === "sending" ? .6 : 1 }}>{phase === "sending" ? "Отправка…" : "Отправить StartMortgage (тест) →"}</button>{oid && <div style={{ ...mono, fontSize: 12, color: C.sub, marginTop: 10 }}>OrderId: {oid}</div>}</Card>
        {offers.length > 0 && (<Card title="SendOffers · ответ банка" note="SOAP-колбэк">
          <div style={{ display: "grid", gap: 10 }}>{offers.map((o) => (<div key={o.id} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><b style={{ fontSize: 13.5 }}>{o.name}</b><span style={{ ...mono, fontWeight: 700, color: C.indigo }}>{o.rate}%</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, ...mono, fontSize: 11.5, color: C.sub }}><span>ГЭСВ<br /><b style={{ color: C.ink }}>{o.gesv}%</b></span><span>Платёж<br /><b style={{ color: C.ink }}>{fmt(o.monthly)} ₸</b></span><span>Срок<br /><b style={{ color: C.ink }}>{o.term} мес</b></span></div>
          </div>))}</div>
          <button onClick={() => { setPhase("state"); setSi(0); }} style={{ ...primary, width: "100%", marginTop: 12 }}>Выбрать → UpdateOrderState</button>
        </Card>)}
        {phase === "state" && (<Card title="UpdateOrderState · статусы" note="SOAP-колбэк">
          <div style={{ display: "grid", gap: 8 }}>{flow.map((st, i) => (<div key={st.state} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}><span style={{ width: 20, height: 20, borderRadius: 6, background: i <= si ? C.green : "#d7dbe2", color: "#fff", display: "grid", placeItems: "center", fontSize: 12 }}>{i <= si ? "✓" : ""}</span><span style={{ color: i <= si ? C.ink : C.sub }}><span style={mono}>{st.state}</span> — {st.title}</span></div>))}</div>
          {si < flow.length - 1 ? <button onClick={() => setSi((i) => i + 1)} style={{ ...primary, width: "100%", marginTop: 12 }}>Следующий статус →</button> : <div style={{ marginTop: 12, background: C.greenSoft, color: C.green, borderRadius: 8, padding: "10px 14px", fontSize: 13.5, fontWeight: 600 }}>Флоу завершён — займ выдан ✓</div>}
        </Card>)}
      </div>
    </div>
  );
}
function buildStart(c, s, prod) {
  return { version: c.version, type: "StartMortgage", id: guid(), dateTime: nowIso(), source: c.source, body: [{
    orderNumber: s.ref, orderDateTime: nowIso(), desiredProductType: prod?.code || "", amount: String(s.amount * 1e6), initialSum: String(s.down * 1e6),
    agreementToFCBSignHash: { documentHash: "<sha256(consent)>", signature: "<base64(AITU)>", signType: c.signType },
    desiredLoanTerm: String(s.term), desiredPaymentMethod: s.pm,
    seller: { name: c.seller.name, bin: c.seller.bin, branchCode: c.seller.branchCode, managerPhone: c.seller.managerPhone },
    complex: [{ type: s.realty, typeOfPledge: "ACQUIRING", name: s.complex, marketCost: String(s.amount * 1e6), marketCurrency: "KZT" }],
    customer: [{ taxCode: s.iin, role: "borrower", mobilePhone: s.phone, document: { type: "IDCARD" }, address: { registration: { country: "KZ" } } }],
  }] };
}

/* ---- Общие UI-компоненты ----------------------------------------- */
function Card({ title, note, children }) { return <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>{title && <div style={{ fontWeight: 700, fontSize: 14.5 }}>{title}</div>}{note && <div style={{ fontSize: 12, color: C.sub, marginTop: 2, marginBottom: 12, ...mono }}>{note}</div>}{!note && title && <div style={{ height: 12 }} />}{children}</div>; }
function Grid({ children }) { return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>{children}</div>; }
function Fld({ l, wide, children }) { return <label style={{ display: "block", gridColumn: wide ? "1 / -1" : "auto", marginBottom: 10 }}><span style={{ fontSize: 12, color: C.sub, display: "block", marginBottom: 4 }}>{l}</span>{children}</label>; }
function Kpi({ l, v, accent }) { return <div style={{ background: accent ? C.ink : C.panel, color: accent ? "#fff" : C.ink, border: `1px solid ${accent ? C.ink : C.line}`, borderRadius: 12, padding: 16 }}><div style={{ fontSize: 12, color: accent ? "#aeb4c0" : C.sub, marginBottom: 6 }}>{l}</div><div style={{ fontWeight: 700, fontSize: 22 }}>{v}</div></div>; }
function M({ l, v }) { return <div><div style={{ fontSize: 11, color: C.sub, marginBottom: 2 }}>{l}</div><div style={{ fontWeight: 600, fontSize: 13.5 }}>{v}</div></div>; }
function Row2({ l, v }) { return <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13.5 }}><span style={{ color: C.sub }}>{l}</span><b>{v}</b></div>; }
function Tick({ show, ok }) { return <span style={{ position: "absolute", right: 12, top: 12, fontSize: 14, fontWeight: 700, color: ok ? C.green : C.red }}>{show ? (ok ? "✓" : "✗") : ""}</span>; }
function Box({ children }) { return <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 16px", fontSize: 13.5 }}>{children}</div>; }
function Slider({ label, val, min, max, value, onChange }) { return <label style={{ display: "block", marginBottom: 16 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}><span style={{ color: C.sub }}>{label}</span><span style={{ ...mono, fontWeight: 600 }}>{val}</span></div><input type="range" min={min} max={max} value={value} onChange={(e) => onChange(+e.target.value)} style={{ width: "100%", accentColor: C.gold }} /></label>; }
function Chk({ done, t }) { return <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", fontSize: 14 }}><span style={{ width: 20, height: 20, borderRadius: 6, background: done ? C.green : "#ddd6c6", color: "#fff", display: "grid", placeItems: "center", fontSize: 12 }}>{done ? "✓" : ""}</span><span style={{ color: done ? C.ink : C.sub }}>{t}</span></div>; }
function Loading({ text, sub }) { return <div style={{ textAlign: "center", padding: "30px 0" }}><div style={{ width: 38, height: 38, border: `3px solid ${C.line}`, borderTopColor: C.gold, borderRadius: "50%", margin: "0 auto 14px", animation: "spin 1s linear infinite" }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style><div style={{ fontSize: 15, fontWeight: 600 }}>{text}</div>{sub && <div style={{ ...mono, fontSize: 12, color: C.sub, marginTop: 6 }}>{sub}</div>}</div>; }
function ApiNote({ children }) { return <div style={{ ...mono, fontSize: 11, color: "#a49e92", textAlign: "center", marginTop: 12 }}>{children}</div>; }
function Gold({ children, disabled, onClick }) { return <button disabled={disabled} onClick={onClick} style={{ width: "100%", background: disabled ? "#d8d2c6" : C.gold, color: "#fff", border: "none", padding: "13px", borderRadius: 11, ...body, fontWeight: 700, fontSize: 15, cursor: disabled ? "not-allowed" : "pointer", marginTop: 4 }}>{children}</button>; }
function Ghost({ children, onClick }) { return <button onClick={onClick} style={{ background: C.panel, color: C.ink, border: `1px solid ${C.line}`, padding: "13px 20px", borderRadius: 11, ...body, fontWeight: 600, fontSize: 14, cursor: "pointer", marginTop: 4, whiteSpace: "nowrap" }}>{children}</button>; }
const inp = { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff", fontSize: 13.5, fontFamily: "'Hanken Grotesk', sans-serif", boxSizing: "border-box", color: C.ink };
const cell = { padding: "11px 14px" };
const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th = { textAlign: "left", padding: "6px 8px", fontSize: 11.5, color: C.sub, fontWeight: 600, borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap" };
const td = { padding: "6px 8px", borderBottom: `1px solid ${C.line}`, verticalAlign: "middle" };
const primary = { background: C.indigo, color: "#fff", border: "none", padding: "11px 16px", borderRadius: 9, ...body, fontWeight: 600, fontSize: 14, cursor: "pointer" };
const addBtn = { marginTop: 12, background: C.indigoSoft, color: C.indigo, border: "none", padding: "8px 14px", borderRadius: 8, ...body, fontWeight: 600, fontSize: 13, cursor: "pointer" };
const pre = { ...mono, fontSize: 11.5, lineHeight: 1.5, background: "#12141a", color: "#cfe3ff", padding: 14, borderRadius: 10, overflow: "auto", maxHeight: 340, margin: 0 };
