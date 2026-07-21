import React, { useState, useEffect, useMemo } from "react";

/* ============================================================
   HAYAT CONSTRUCTION GROUP — сайт застройщика + кредитный брокер
   Вариант 1: сайт с интеграцией банка.
   Флоу одобрения построен по схеме «Золотая рассрочка» (Altyn-i, Схема 1).
   Слой интеграции bankApi повторяет эндпоинты Altyn банк API.
   Брокер стоит между застройщиком (Hayat) и банком.
   ============================================================ */

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
`;
const C = {
  cream: "#f5f3ef", panel: "#ffffff", ink: "#17161a", sub: "#6b6a60",
  line: "#e6e1d6", gold: "#a8823c", goldDk: "#8a6a2c", goldSoft: "#f3ead0",
  green: "#0d7a4f", red: "#b91c1c",
};
const serif = { fontFamily: "'Fraunces', serif" };
const body = { fontFamily: "'Hanken Grotesk', sans-serif" };
const mono = { fontFamily: "'JetBrains Mono', monospace" };
const fmt = (n) => new Intl.NumberFormat("ru-RU").format(Math.round(n));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = () => Math.floor(100000 + Math.random() * 899999);

/* ---- Проверки ИИН и телефона (РК) -------------------------------- */
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
function fmtPhone(raw) {
  const d = phoneDigits(raw); if (!d) return "";
  let s = "+7"; if (d.length > 1) s += " (" + d.slice(1, 4); if (d.length >= 5) s += ") " + d.slice(4, 7);
  if (d.length >= 8) s += "-" + d.slice(7, 9); if (d.length >= 10) s += "-" + d.slice(9, 11); return s;
}

/* ---- Продукты банков-партнёров (данные с сайта + Altyn-i) --------- */
const PRODUCTS = [
  { id: "altyn-zs", bank: "Altyn Bank", name: "Золотая рассрочка (Altyn-i)", kind: "installment", rate: 0, gesv: 0, minDownPct: 20, maxTermM: 36, maxLoan: 100 },
  { id: "freedom", bank: "Freedom Bank", name: "Цифровая ипотека", kind: "mortgage", rate: 7.0, gesv: 7.2, minDownPct: 20, maxTermM: 300, maxLoan: 70 },
  { id: "bcc", bank: "Банк ЦентрКредит", name: "Super ипотека", kind: "mortgage", rate: 11.0, gesv: 12.1, minDownPct: 20, maxTermM: 240, maxLoan: 100 },
  { id: "altyn", bank: "Altyn Bank", name: "Онай ипотека", kind: "mortgage", rate: 14.0, gesv: 19.4, minDownPct: 20, maxTermM: 240, maxLoan: 175 },
];
function annuity(loanMln, rate, months) {
  const r = rate / 100 / 12, p = loanMln * 1e6;
  return r === 0 ? p / months : (p * r) / (1 - Math.pow(1 + r, -months));
}
function computeOffers(price, down, months) {
  const loan = +(price - down).toFixed(1), downPct = (down / price) * 100;
  return PRODUCTS.map((p) => {
    const term = p.kind === "installment" ? Math.min(months, p.maxTermM) : Math.min(months, p.maxTermM);
    const reasons = [];
    if (downPct < p.minDownPct) reasons.push(`взнос ≥ ${p.minDownPct}%`);
    if (loan > p.maxLoan) reasons.push(`лимит ${p.maxLoan} млн ₸`);
    if (reasons.length) return { ...p, declined: true, reasons };
    return { ...p, declined: false, loan, term, monthly: Math.round(annuity(loan, p.rate, term)) };
  }).sort((a, b) => (a.declined !== b.declined) ? (a.declined ? 1 : -1) : a.rate - b.rate);
}

/* ---- Слой интеграции с банком (эндпоинты Altyn банк API) ---------- */
/* В проде: base URL + токен банка. Сейчас — мок с задержкой, но с теми же
   методами/полями, что и реальный API, чтобы был drop-in replacement.   */
const bankApi = {
  // POST /api/v1/document/customer-agreement  (multipart/form-data) -> { documentId }
  async uploadAgreement(_payload) { await wait(700); return { documentId: "DOC-" + rnd() }; },
  // POST /api/v1/order/place -> { order_id }
  async placeOrder(_payload) { await wait(1100); return { order_id: "ORD-" + rnd() }; },
  // GET /api/v1/order/{order_id}/status -> { status, offers }
  async orderStatus(_orderId, ctx) {
    await wait(1400);
    const offers = computeOffers(ctx.price, ctx.down, ctx.months).filter((o) => !o.declined);
    return { status: offers.length ? "approved" : "rejected", offers };
  },
  // POST /api/v1/order/confirm -> { ok }
  async confirmOrder(_orderId, _productId) { await wait(600); return { ok: true }; },
  // GET /api/v1/document/guarantee-letter -> { pdfUrl }
  async guaranteeLetter(_orderId) { await wait(800); return { pdfUrl: "guarantee-letter.pdf" }; },
};

/* ---- Проекты Hayat (данные с hayatconstruction.kz) --------------- */
const PROJECTS = [
  { id: "meliora", name: "Hayat Meliora", cls: "Премиум", status: "сдача II кв. 2024", addr: "Алматы, ул. Сагадат Нурмагамбетов, 28Б", flats: 216, area: 3.4, from: 32, url: "https://hayatmeliora.kz", hue: 34 },
  { id: "regency", name: "Hayat Regency", cls: "Премиум", status: "проект сдан", addr: "Алматы, ул. Оспанова 85/80", flats: 184, area: 2.6, from: 48, url: "https://www.hayatregency.kz", hue: 20 },
  { id: "apartments", name: "Hayat Apartments", cls: "Комфорт+", status: "сдача 2 очереди II кв. 2024", addr: "Алматы, ул. Райымбек Батыра, 161", flats: 1411, area: 5.4, from: 22, url: "https://hayatapartments.kz", hue: 205 },
  { id: "besagash", name: "Besagash", cls: "Комфорт+", status: "сдача IV кв. 2023", addr: "Алматы, ул. Райымбек Батыра, 167", flats: 1411, area: 3.4, from: 20, url: "https://besagashdom.kz", hue: 150 },
  { id: "park", name: "Hayat Park", cls: "Премиум", status: "проект сдан", addr: "Алматы, ул. Рахмадиева, 6", flats: 191, area: 2.0, from: 35, url: "https://hayatpark.kz/ru/", hue: 262 },
  { id: "arena", name: "Hayat Arena", cls: "Премиум", status: "скоро старт продаж", addr: "Алматы, Талгарский тракт, 1а", flats: 191, area: 2.0, from: 30, url: "https://hayatarena.kz", hue: 8 },
  { id: "astoria", name: "Hayat Astoria", cls: "Премиум", status: "скоро старт продаж", addr: "Алматы, мкр. Нур Алатау, 134", flats: 191, area: 2.0, from: 33, url: "https://hayatastoria.kz", hue: 300 },
];
const AMENITIES = ["Зарядные станции для электрокара", "Спортзал и СПА", "Собственный кинотеатр"];

/* ============================================================ */
export default function App() {
  const [modal, setModal] = useState(null); // { project }
  const [leads, setLeads] = useState([]);
  const [showLeads, setShowLeads] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { (async () => {
    try { const r = await window.storage.get("hcg2:leads"); if (r?.value) setLeads(JSON.parse(r.value)); } catch (e) {}
    setLoaded(true);
  })(); }, []);
  useEffect(() => { if (loaded) { try { window.storage.set("hcg2:leads", JSON.stringify(leads)); } catch (e) {} } }, [leads, loaded]);

  const goProjects = () => document.getElementById("projects").scrollIntoView({ behavior: "smooth" });

  return (
    <div style={{ ...body, background: C.cream, color: C.ink, minHeight: "100vh" }}>
      <style>{FONTS}</style>

      <nav style={{ position: "sticky", top: 0, zIndex: 30, background: "rgba(23,22,26,.97)", color: C.cream, padding: "0 clamp(18px,5vw,64px)", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
          <div style={{ ...serif, fontWeight: 700, fontSize: 21, letterSpacing: "1px" }}>HAYAT</div>
          <div style={{ display: "flex", gap: 20, fontSize: 14 }}>
            {[["Проекты", "projects"], ["Ипотека", "broker"], ["О компании", "about"], ["Контакты", "contacts"]].map(([t, a]) => (
              <a key={t} href={"#" + a} onClick={(e) => { e.preventDefault(); document.getElementById(a).scrollIntoView({ behavior: "smooth" }); }} style={{ color: "#cbc7bf", textDecoration: "none" }}>{t}</a>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => setShowLeads(true)} style={{ background: "none", border: "none", color: "#cbc7bf", cursor: "pointer", ...body, fontSize: 14 }}>Мои заявки{leads.length ? ` · ${leads.length}` : ""}</button>
          <a href="tel:5533" style={{ ...mono, color: C.cream, textDecoration: "none", fontSize: 15, fontWeight: 700 }}>5533</a>
          <button onClick={goProjects} style={{ background: C.gold, color: "#fff", border: "none", padding: "9px 18px", borderRadius: 7, ...body, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Оформить онлайн</button>
        </div>
      </nav>

      {/* Hero */}
      <header style={{ background: `linear-gradient(155deg, #22201f, ${C.ink})`, color: C.cream, padding: "clamp(52px,8vw,104px) clamp(18px,5vw,64px) 0", overflow: "hidden" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "inline-block", border: `1px solid ${C.gold}`, color: C.gold, padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, marginBottom: 24 }}>
            Онлайн-ипотека и рассрочка · одобрение по ИИН
          </div>
          <h1 style={{ ...serif, fontWeight: 600, fontSize: "clamp(34px,6vw,64px)", lineHeight: 1.03, margin: 0, maxWidth: 720, letterSpacing: "-1.2px" }}>Ничего лишнего — только лучшее</h1>
          <p style={{ fontSize: "clamp(16px,2vw,19px)", color: "#c7c2b8", maxWidth: 560, marginTop: 20, lineHeight: 1.5 }}>
            Жилые комплексы Hayat в Алматы. Выберите квартиру и оформите ипотеку или Золотую рассрочку онлайн — заявка уходит сразу в банки-партнёры.
          </p>
          <div style={{ display: "flex", gap: 14, marginTop: 30, flexWrap: "wrap" }}>
            <button onClick={goProjects} style={{ background: C.gold, color: "#fff", border: "none", padding: "14px 26px", borderRadius: 9, ...body, fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>Смотреть проекты</button>
            <button onClick={() => document.getElementById("broker").scrollIntoView({ behavior: "smooth" })} style={{ background: "transparent", color: C.cream, border: "1.5px solid rgba(255,255,255,.3)", padding: "14px 26px", borderRadius: 9, ...body, fontWeight: 600, fontSize: 15.5, cursor: "pointer" }}>Как оформить</button>
          </div>
          <div style={{ display: "flex", gap: "clamp(24px,5vw,60px)", marginTop: 46, flexWrap: "wrap" }}>
            {[["7", "проектов"], ["3.4 тыс.", "квартир"], ["18", "лет на рынке"], ["4", "продукта банков"]].map(([n, l]) => (
              <div key={l}><div style={{ ...serif, fontWeight: 700, fontSize: 30, color: C.gold }}>{n}</div><div style={{ fontSize: 13, color: "#b0aaa0" }}>{l}</div></div>
            ))}
          </div>
          <svg viewBox="0 0 1200 110" style={{ display: "block", width: "100%", marginTop: 38 }} preserveAspectRatio="none">
            {Array.from({ length: 28 }).map((_, i) => { const w = 43, h = 26 + ((i * 41) % 74); return <rect key={i} x={i * w} y={110 - h} width={w - 5} height={h} fill="rgba(168,130,60,.10)" />; })}
          </svg>
        </div>
      </header>

      {/* Проекты */}
      <section id="projects" style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(46px,7vw,80px) clamp(18px,5vw,64px)" }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ color: C.gold, fontWeight: 700, fontSize: 13, letterSpacing: ".6px", textTransform: "uppercase" }}>Проекты</div>
          <h2 style={{ ...serif, fontWeight: 600, fontSize: "clamp(28px,4vw,42px)", margin: "6px 0 0", letterSpacing: "-1px" }}>Новые ЖК в Алматы</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 22 }}>
          {PROJECTS.map((p) => <ProjectCard key={p.id} p={p} onBuy={() => setModal({ project: p })} />)}
        </div>
        <div style={{ marginTop: 40, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: 24 }}>
          <div style={{ ...serif, fontWeight: 600, fontSize: 20, marginBottom: 14 }}>Кроме квартир</div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {[["Машино-места", 238], ["Кладовые", 136], ["Коммерческие помещения", 52]].map(([t, n]) => (
              <div key={t} style={{ flex: "1 1 200px", border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
                <div style={{ ...serif, fontWeight: 700, fontSize: 26, color: C.gold }}>{n}</div>
                <div style={{ fontSize: 14, color: C.sub }}>{t} · вариантов</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Как оформить (брокерская схема «Золотая рассрочка») */}
      <section id="broker" style={{ background: C.panel, borderTop: `1px solid ${C.line}`, padding: "clamp(46px,7vw,80px) clamp(18px,5vw,64px)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ color: C.gold, fontWeight: 700, fontSize: 13, letterSpacing: ".6px", textTransform: "uppercase" }}>Онлайн-оформление</div>
          <h2 style={{ ...serif, fontWeight: 600, fontSize: "clamp(26px,4vw,40px)", margin: "6px 0 8px", letterSpacing: "-1px" }}>Ипотека и Золотая рассрочка за 5 шагов</h2>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 13.5, color: C.sub, marginBottom: 30, flexWrap: "wrap" }}>
            <b style={{ color: C.ink }}>Hayat</b> <span>→</span> <b style={{ color: C.gold }}>кредитный брокер</b> <span>→</span> <b style={{ color: C.ink }}>банк</b>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 18 }}>
            {[
              ["01", "Заявка", "Выбор квартиры, взноса, срока и данные клиента по ИИН"],
              ["02", "Согласие ПКБ/ГЦВП", "Онлайн-подпись согласия на запрос в кредитное бюро и госбазы"],
              ["03", "Решение банка", "Заявка уходит в банки, решение — сразу, 24 часа на выбор"],
              ["04", "Оформление ДДУ", "Оплата взноса, подписание и регистрация ДДУ"],
              ["05", "Выдача", "Передача пакета в банк и выдача займа застройщику"],
            ].map(([n, t, d]) => (
              <div key={n} style={{ border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }}>
                <div style={{ ...serif, fontWeight: 700, fontSize: 28, color: C.gold }}>{n}</div>
                <div style={{ ...serif, fontWeight: 600, fontSize: 17, margin: "8px 0 6px" }}>{t}</div>
                <div style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* О компании */}
      <section id="about" style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(46px,7vw,80px) clamp(18px,5vw,64px)" }}>
        <div style={{ color: C.gold, fontWeight: 700, fontSize: 13, letterSpacing: ".6px", textTransform: "uppercase" }}>О компании</div>
        <h2 style={{ ...serif, fontWeight: 600, fontSize: "clamp(26px,4vw,40px)", margin: "6px 0 16px", letterSpacing: "-1px", maxWidth: 760 }}>Продуманные планировки и инфраструктура</h2>
        <p style={{ fontSize: 16, color: C.sub, maxWidth: 720, lineHeight: 1.6, marginBottom: 22 }}>Hayat Construction Group строит жильё в Алматы с 2007 года. Оптимизированные планировки, закрытые дворы и премиальная инфраструктура.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {AMENITIES.map((a) => <span key={a} style={{ background: C.goldSoft, color: C.goldDk, borderRadius: 20, padding: "8px 16px", fontSize: 14, fontWeight: 500 }}>{a}</span>)}
        </div>
      </section>

      {/* Футер */}
      <footer id="contacts" style={{ background: C.ink, color: "#b0aaa0", padding: "52px clamp(18px,5vw,64px) 40px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 30 }}>
          <div>
            <div style={{ ...serif, fontWeight: 700, fontSize: 22, color: C.cream, letterSpacing: "1px" }}>HAYAT</div>
            <div style={{ fontSize: 13.5, marginTop: 10, maxWidth: 280 }}>Hayat Construction Group. Застройщик недвижимости в Алматы.</div>
            <a href="https://www.instagram.com/hayatconstructiongroup/" style={{ color: C.gold, fontSize: 14, textDecoration: "none", display: "inline-block", marginTop: 12 }}>Instagram</a>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.9 }}>
            <div style={{ color: C.cream, fontWeight: 600, marginBottom: 6 }}>Отделы продаж</div>
            <div>Hayat Meliora: <a href="tel:+77005111777" style={{ color: "#cbc7bf", textDecoration: "none" }}>+7 700 511 17 77</a></div>
            <div>Apartments и Besagash: <a href="tel:+77717720101" style={{ color: "#cbc7bf", textDecoration: "none" }}>+7 771 772 01 01</a></div>
            <div>Единый номер: <a href="tel:5533" style={{ color: "#cbc7bf", textDecoration: "none" }}>5533</a></div>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.9 }}>
            <div style={{ color: C.cream, fontWeight: 600, marginBottom: 6 }}>Проекты</div>
            {PROJECTS.slice(0, 6).map((p) => <div key={p.id}><a href={p.url} style={{ color: "#cbc7bf", textDecoration: "none" }}>{p.name}</a></div>)}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.9 }}>
            <div style={{ color: C.cream, fontWeight: 600, marginBottom: 6 }}>Банки-партнёры</div>
            <div>Freedom Bank · Altyn Bank</div>
            <div>Банк ЦентрКредит</div>
            <div style={{ marginTop: 8, color: C.cream, fontWeight: 600 }}>Режим работы</div>
            <div>9:00 – 21:00, пн-сб</div>
          </div>
        </div>
        <div style={{ maxWidth: 1200, margin: "30px auto 0", fontSize: 12, color: "#7c7770", lineHeight: 1.6 }}>
          Hayat Construction Group © 2007–2026. Ставки, ГЭСВ и одобрение — предварительные, определяются банком. Идентификация по ИИН и запрос в ПКБ/ГЦВП — с согласия клиента.
        </div>
      </footer>

      {modal && <BrokerFlow project={modal.project} onClose={() => setModal(null)} onSubmit={(l) => setLeads([l, ...leads])} />}
      {showLeads && <LeadsDrawer leads={leads} onClose={() => setShowLeads(false)} />}
    </div>
  );
}

/* ---- Карточка проекта -------------------------------------------- */
function ProjectCard({ p, onBuy }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 168, background: `linear-gradient(150deg, hsl(${p.hue} 20% 30%), hsl(${p.hue} 22% 16%))`, position: "relative", display: "flex", alignItems: "flex-end", padding: 18 }}>
        <span style={{ position: "absolute", top: 14, left: 14, background: C.gold, color: "#fff", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6 }}>{p.cls}</span>
        <span style={{ position: "absolute", top: 14, right: 14, background: "rgba(0,0,0,.32)", color: "#fff", fontSize: 11.5, padding: "4px 10px", borderRadius: 6 }}>{p.status}</span>
        <div style={{ ...serif, fontWeight: 700, fontSize: 26, color: "#fff", letterSpacing: "-.5px" }}>{p.name}</div>
      </div>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ fontSize: 13.5, color: C.sub, marginBottom: 14, minHeight: 38 }}>{p.addr}</div>
        <div style={{ display: "flex", gap: 16, fontSize: 13, marginBottom: 16 }}>
          <span><b style={mono}>{fmt(p.flats)}</b> <span style={{ color: C.sub }}>квартир</span></span>
          <span><b style={mono}>{p.area}</b> <span style={{ color: C.sub }}>га</span></span>
        </div>
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ fontSize: 12, color: C.sub }}>от</div><div style={{ ...serif, fontWeight: 700, fontSize: 20 }}>{p.from} млн ₸</div></div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href={p.url} target="_blank" rel="noreferrer" style={{ border: `1px solid ${C.line}`, color: C.ink, padding: "10px 14px", borderRadius: 8, ...body, fontWeight: 600, fontSize: 13, textDecoration: "none" }}>Подробнее</a>
            <button onClick={onBuy} style={{ background: C.gold, color: "#fff", border: "none", padding: "10px 14px", borderRadius: 8, ...body, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Оформить →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   БРОКЕРСКИЙ ФЛОУ (схема «Золотая рассрочка», Схема 1)
   ============================================================ */
const STEPS = ["Заявка", "Согласие ПКБ/ГЦВП", "Решение банка", "Оформление ДДУ", "Выдача"];

function BrokerFlow({ project, onClose, onSubmit }) {
  const [step, setStep] = useState(0);
  const [downPct, setDownPct] = useState(30);
  const [months, setMonths] = useState(180);
  const [name, setName] = useState("");
  const [iin, setIin] = useState("");
  const [phone, setPhone] = useState("");
  const [cPkb, setCPkb] = useState(false);
  const [cGcvp, setCGcvp] = useState(false);
  const [cPd, setCPd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [api, setApi] = useState({}); // documentId, order_id, decision, offers
  const [chosen, setChosen] = useState(null);
  const [fulfil, setFulfil] = useState({}); // дду, взнос, guarantee
  const [ref, setRef] = useState(null);

  const price = project.from; // старт цены проекта (демо)
  const down = +(price * downPct / 100).toFixed(1);
  const ctx = { price, down, months };
  const iinValid = validateIin(iin), phoneValid = validatePhone(phone);
  const step1ok = name.trim() && iinValid && phoneValid;
  const allConsent = cPkb && cGcvp && cPd;

  // Шаг 2 -> отправка в банк
  const signAndPlace = async () => {
    setBusy(true);
    const ag = await bankApi.uploadAgreement({ iin, phone, pkb: cPkb, gcvp: cGcvp, pd: cPd }); // POST customer-agreement
    const ord = await bankApi.placeOrder({ iin, phone, project: project.name, price, down, months, documentId: ag.documentId }); // POST order/place
    setApi((s) => ({ ...s, documentId: ag.documentId, order_id: ord.order_id }));
    setStep(2);
    const st = await bankApi.orderStatus(ord.order_id, ctx); // GET order/{id}/status
    setApi((s) => ({ ...s, decision: st.status, offers: st.offers }));
    setBusy(false);
  };

  // Шаг 3 -> выбор оффера
  const confirmOffer = async (o) => {
    setBusy(true);
    await bankApi.confirmOrder(api.order_id, o.id); // POST order/confirm
    setChosen(o); setStep(3); setBusy(false);
  };

  // Шаг 4 -> оформление ДДУ и передача в банк
  const fulfill = async () => {
    setBusy(true);
    setFulfil({ ddu: true }); await wait(500);
    setFulfil((f) => ({ ...f, pay: true })); await wait(500);
    const gl = await bankApi.guaranteeLetter(api.order_id); // GET guarantee-letter
    setFulfil((f) => ({ ...f, guarantee: gl.pdfUrl })); await wait(400);
    const r = "HYT-" + rnd();
    const lead = { ref: r, order_id: api.order_id, project: project.name, price, down, months, name, iin, phone, product: chosen, created: new Date().toISOString().slice(0, 10) };
    onSubmit(lead); setRef(r); setStep(4); setBusy(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,22,26,.55)", display: "grid", placeItems: "center", padding: 16, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.cream, borderRadius: 18, width: 620, maxWidth: "100%", maxHeight: "94vh", overflow: "auto" }}>
        {/* Шапка */}
        <div style={{ background: `linear-gradient(150deg, hsl(${project.hue} 22% 28%), hsl(${project.hue} 24% 15%))`, color: "#fff", padding: "20px 26px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 12, opacity: .8 }}>Hayat → кредитный брокер → банк</div>
              <div style={{ ...serif, fontWeight: 700, fontSize: 22 }}>{project.name}</div>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,.15)", color: "#fff", border: "none", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 18 }}>×</button>
          </div>
          {/* Прогресс */}
          <div style={{ display: "flex", gap: 6, marginTop: 16, flexWrap: "wrap" }}>
            {STEPS.map((s, i) => (
              <div key={s} style={{ flex: "1 1 90px", fontSize: 11, textAlign: "center" }}>
                <div style={{ height: 4, borderRadius: 3, background: i <= step ? C.gold : "rgba(255,255,255,.2)", marginBottom: 5 }} />
                <span style={{ color: i <= step ? "#fff" : "rgba(255,255,255,.55)" }}>{i + 1}. {s}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: 26 }}>
          {/* ШАГ 1 — Заявка */}
          {step === 0 && (
            <>
              <Slider label="Первоначальный взнос" val={`${downPct}% · ${fmt(down)} млн ₸`} min={10} max={60} value={downPct} onChange={setDownPct} />
              <Slider label="Срок" val={`${months} мес · ${Math.round(months / 12)} лет`} min={12} max={300} value={months} onChange={setMonths} />
              <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 16px", margin: "6px 0 18px", fontSize: 13.5 }}>
                Стоимость <b style={mono}>{price} млн ₸</b> · сумма займа <b style={mono}>{fmt(price - down)} млн ₸</b>
              </div>
              <div style={{ ...serif, fontWeight: 600, fontSize: 16, marginBottom: 12 }}>Данные клиента</div>
              <Field l="Имя"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к вам обращаться" style={inp} /></Field>
              <Field l="ИИН">
                <div style={{ position: "relative" }}>
                  <input value={iin} maxLength={12} onChange={(e) => setIin(e.target.value.replace(/\D/g, ""))} placeholder="12 цифр" style={{ ...inp, ...mono, borderColor: iin.length === 12 ? (iinValid ? C.green : C.red) : C.line }} />
                  <Tick show={iin.length === 12} ok={iinValid} />
                </div>
              </Field>
              <Field l="Номер телефона">
                <div style={{ position: "relative" }}>
                  <input value={fmtPhone(phone)} inputMode="tel" placeholder="+7 (7__) ___-__-__" onChange={(e) => setPhone(phoneDigits(e.target.value))} style={{ ...inp, ...mono, borderColor: phoneDigits(phone).length === 11 ? (phoneValid ? C.green : C.red) : C.line }} />
                  <Tick show={phoneDigits(phone).length === 11} ok={phoneValid} />
                </div>
              </Field>
              <PrimaryBtn disabled={!step1ok} onClick={() => setStep(1)}>Далее →</PrimaryBtn>
            </>
          )}

          {/* ШАГ 2 — Согласие ПКБ/ГЦВП */}
          {step === 1 && (
            <>
              <div style={{ ...serif, fontWeight: 600, fontSize: 17, marginBottom: 6 }}>Согласие на запрос данных</div>
              <p style={{ fontSize: 13.5, color: C.sub, marginTop: 0, marginBottom: 16 }}>Для решения банк запрашивает кредитную историю и сведения о доходах. Подпишите согласия.</p>
              <Consent v={cPkb} set={setCPkb} t="Согласие на запрос в кредитное бюро (ПКБ/ГКБ)" />
              <Consent v={cGcvp} set={setCGcvp} t="Согласие на запрос в ГЦВП (пенсионные/доходы)" />
              <Consent v={cPd} set={setCPd} t="Согласие на сбор, обработку и передачу персональных данных" />
              <div style={{ fontSize: 12, color: C.sub, margin: "6px 0 16px" }}>Клиент: {name} · ИИН {iin.slice(0, 6)}•••••• · {fmtPhone(phone)}</div>
              <div style={{ display: "flex", gap: 10 }}>
                <GhostBtn onClick={() => setStep(0)}>Назад</GhostBtn>
                <PrimaryBtn disabled={!allConsent || busy} onClick={signAndPlace}>{busy ? "Отправка…" : "Подписать и отправить в банк →"}</PrimaryBtn>
              </div>
              <ApiNote>POST /document/customer-agreement → POST /order/place</ApiNote>
            </>
          )}

          {/* ШАГ 3 — Решение банка */}
          {step === 2 && (
            <>
              {!api.decision ? (
                <Loading text="Данные обрабатываются. Заявка направлена в банки…" sub={api.order_id ? `Заявка ${api.order_id}` : ""} />
              ) : api.decision === "rejected" ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ ...serif, fontWeight: 700, fontSize: 22, color: C.red, marginBottom: 8 }}>Отказ банка</div>
                  <div style={{ fontSize: 14, color: C.sub }}>По текущим условиям одобрение не получено. Измените взнос или срок.</div>
                  <GhostBtn onClick={() => { setApi({}); setStep(0); }}>Изменить условия</GhostBtn>
                </div>
              ) : (
                <>
                  <div style={{ ...serif, fontWeight: 600, fontSize: 17, marginBottom: 4 }}>Решение банка — одобрено</div>
                  <p style={{ fontSize: 13, color: C.sub, marginTop: 0, marginBottom: 14 }}>Заявка {api.order_id}. На выбор предложения — 24 часа.</p>
                  <div style={{ display: "grid", gap: 10 }}>
                    {api.offers.map((o) => (
                      <div key={o.id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{o.bank}</div>
                            <div style={{ fontSize: 12.5, color: o.kind === "installment" ? C.goldDk : C.sub }}>{o.name}</div>
                          </div>
                          <div style={{ ...mono, fontWeight: 700, fontSize: 17, color: C.goldDk }}>{o.rate === 0 ? "0%" : o.rate + "%"}</div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                          <Metric l="Займ" v={`${fmt(o.loan)} млн ₸`} />
                          <Metric l={o.kind === "installment" ? "Срок" : "ГЭСВ"} v={o.kind === "installment" ? `${o.term} мес` : `от ${o.gesv}%`} />
                          <Metric l="Платёж/мес" v={`${fmt(o.monthly)} ₸`} />
                        </div>
                        <PrimaryBtn disabled={busy} onClick={() => confirmOffer(o)}>Выбрать и продолжить</PrimaryBtn>
                      </div>
                    ))}
                  </div>
                  <ApiNote>GET /order/{"{id}"}/status → POST /order/confirm</ApiNote>
                </>
              )}
            </>
          )}

          {/* ШАГ 4 — Оформление ДДУ */}
          {step === 3 && (
            <>
              <div style={{ ...serif, fontWeight: 600, fontSize: 17, marginBottom: 4 }}>Оформление ДДУ</div>
              <p style={{ fontSize: 13, color: C.sub, marginTop: 0, marginBottom: 14 }}>{chosen.bank} · {chosen.name} · {fmt(chosen.loan)} млн ₸ · платёж {fmt(chosen.monthly)} ₸/мес</p>
              <Check done={fulfil.ddu} t="Подписание и регистрация ДДУ" />
              <Check done={fulfil.pay} t={`Оплата первоначального взноса — ${fmt(down)} млн ₸`} />
              <Check done={fulfil.guarantee} t="Гарантийное письмо банка" />
              <div style={{ background: C.goldSoft, borderRadius: 10, padding: "12px 14px", margin: "14px 0", fontSize: 12.5, color: C.goldDk, lineHeight: 1.5 }}>
                В банк передаётся пакет: № и дата ДДУ, ссылка на ДДУ, св-во о регистрации, гарантийное письмо, наименование / счёт / БИН УК.
              </div>
              <PrimaryBtn disabled={busy} onClick={fulfill}>{busy ? "Оформляем…" : "Оформить и отправить в банк →"}</PrimaryBtn>
              <ApiNote>GET /document/guarantee-letter → передача пакета в банк</ApiNote>
            </>
          )}

          {/* ШАГ 5 — Выдача */}
          {step === 4 && (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <div style={{ ...serif, fontWeight: 700, fontSize: 24, color: C.green, marginBottom: 8 }}>Заявка оформлена ✓</div>
              <div style={{ fontSize: 14, color: C.sub, marginBottom: 16 }}>Заявка <b style={{ ...mono, color: C.ink }}>{ref}</b> · банк {api.order_id}. Банк выдаёт займ застройщику, ожидается ввод в эксплуатацию. SMS придёт на {fmtPhone(phone)}.</div>
              <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, textAlign: "left", fontSize: 13.5 }}>
                <Line l="Продукт" v={`${chosen.bank} · ${chosen.name}`} />
                <Line l="Ставка" v={chosen.rate === 0 ? "0% (рассрочка)" : chosen.rate + "%"} />
                <Line l="Займ" v={`${fmt(chosen.loan)} млн ₸`} />
                <Line l="Платёж" v={`${fmt(chosen.monthly)} ₸/мес`} />
              </div>
              <PrimaryBtn onClick={onClose}>Готово</PrimaryBtn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Панель "Мои заявки" ----------------------------------------- */
function LeadsDrawer({ leads, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,22,26,.5)", display: "flex", justifyContent: "flex-end", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.cream, width: 430, maxWidth: "100%", height: "100%", overflow: "auto", padding: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ ...serif, fontWeight: 700, fontSize: 22 }}>Мои заявки</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: C.sub }}>×</button>
        </div>
        {leads.length === 0 && <div style={{ color: C.sub, fontSize: 14 }}>Заявок пока нет.</div>}
        <div style={{ display: "grid", gap: 14 }}>
          {leads.map((l) => (
            <div key={l.ref} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ ...serif, fontWeight: 700, fontSize: 16 }}>{l.project}</div>
                <span style={{ ...mono, fontSize: 12, color: C.goldDk }}>{l.ref}</span>
              </div>
              <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>{l.product.bank} · {l.product.name} · {l.product.rate === 0 ? "0%" : l.product.rate + "%"}</div>
              <div style={{ fontSize: 12.5, color: C.sub }}>Займ {fmt(l.product.loan)} млн ₸ · платёж {fmt(l.product.monthly)} ₸/мес · банк {l.order_id}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---- Мелкие компоненты ------------------------------------------- */
function Field({ l, children }) { return <label style={{ display: "block", marginBottom: 12 }}><span style={{ fontSize: 12.5, color: C.sub, display: "block", marginBottom: 5 }}>{l}</span>{children}</label>; }
function Tick({ show, ok }) { return <span style={{ position: "absolute", right: 12, top: 13, fontSize: 14, fontWeight: 700, color: ok ? C.green : C.red }}>{show ? (ok ? "✓" : "✗") : ""}</span>; }
function Metric({ l, v }) { return <div><div style={{ fontSize: 11, color: C.sub, marginBottom: 2 }}>{l}</div><div style={{ fontWeight: 600, fontSize: 13.5 }}>{v}</div></div>; }
function Line({ l, v }) { return <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.line}` }}><span style={{ color: C.sub }}>{l}</span><b>{v}</b></div>; }
function Slider({ label, val, min, max, value, onChange }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}><span style={{ color: C.sub }}>{label}</span><span style={{ ...mono, fontWeight: 600 }}>{val}</span></div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(+e.target.value)} style={{ width: "100%", accentColor: C.gold }} />
    </label>
  );
}
function Consent({ v, set, t }) {
  return (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, marginBottom: 12, cursor: "pointer", lineHeight: 1.45 }}>
      <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} style={{ accentColor: C.gold, width: 17, height: 17, marginTop: 1, flexShrink: 0 }} />
      <span>{t}</span>
    </label>
  );
}
function Check({ done, t }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", fontSize: 14 }}>
      <span style={{ width: 20, height: 20, borderRadius: 6, background: done ? C.green : "#ddd6c6", color: "#fff", display: "grid", placeItems: "center", fontSize: 12, flexShrink: 0 }}>{done ? "✓" : ""}</span>
      <span style={{ color: done ? C.ink : C.sub }}>{t}</span>
    </div>
  );
}
function Loading({ text, sub }) {
  return (
    <div style={{ textAlign: "center", padding: "30px 0" }}>
      <div style={{ width: 40, height: 40, border: `3px solid ${C.line}`, borderTopColor: C.gold, borderRadius: "50%", margin: "0 auto 16px", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{text}</div>
      {sub && <div style={{ ...mono, fontSize: 12, color: C.sub, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}
function ApiNote({ children }) { return <div style={{ ...mono, fontSize: 11, color: "#a49e92", textAlign: "center", marginTop: 12 }}>{children}</div>; }
function PrimaryBtn({ children, disabled, onClick }) {
  return <button disabled={disabled} onClick={onClick} style={{ width: "100%", background: disabled ? "#d8d2c6" : C.gold, color: "#fff", border: "none", padding: "13px", borderRadius: 11, ...body, fontWeight: 700, fontSize: 15, cursor: disabled ? "not-allowed" : "pointer", marginTop: 4 }}>{children}</button>;
}
function GhostBtn({ children, onClick }) {
  return <button onClick={onClick} style={{ background: C.panel, color: C.ink, border: `1px solid ${C.line}`, padding: "13px 20px", borderRadius: 11, ...body, fontWeight: 600, fontSize: 14, cursor: "pointer", marginTop: 4, whiteSpace: "nowrap" }}>{children}</button>;
}
const inp = { width: "100%", padding: "11px 13px", borderRadius: 10, border: `1px solid ${C.line}`, background: "#fff", fontSize: 14.5, fontFamily: "'Hanken Grotesk', sans-serif", boxSizing: "border-box", color: C.ink };
