import React, { useState, useEffect, useMemo, useRef } from "react";

/* ============================================================
   КАБИНЕТ СТРОЙКОМПАНИИ · кредитный брокер
   - Личный кабинет компании (заявки, офферы, платежи)
   - Загрузка документов + проверка ИНН по контрольной сумме
   - Роли и доступы: Владелец / Менеджер / Бухгалтер
   - Экспорт и отчётность (CSV)
   - Слой подбора банков (скоринг) — место под реальное API
   ============================================================ */

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap');
`;
const C = {
  bg: "#f4f2ee", panel: "#fff", ink: "#1c1a17", sub: "#6b655c",
  line: "#e4e0d8", amber: "#e8590c", amberSoft: "#fdf0e6", navy: "#1f3a5f",
};
const display = { fontFamily: "'Bricolage Grotesque', sans-serif" };
const body = { fontFamily: "'Hanken Grotesk', sans-serif" };
const mono = { fontFamily: "'JetBrains Mono', monospace" };
const fmt = (n) => new Intl.NumberFormat("ru-RU").format(n);

/* ---- Реальная проверка ИНН по контрольной сумме ------------------ */
function validateInn(raw) {
  const inn = String(raw).replace(/\D/g, "");
  if (inn.length === 10) {
    const c = [2, 4, 10, 3, 5, 9, 4, 6, 8];
    let s = 0; for (let i = 0; i < 9; i++) s += +inn[i] * c[i];
    return ((s % 11) % 10) === +inn[9];
  }
  if (inn.length === 12) {
    const c1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
    const c2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
    let s1 = 0, s2 = 0;
    for (let i = 0; i < 10; i++) s1 += +inn[i] * c1[i];
    for (let i = 0; i < 11; i++) s2 += +inn[i] * c2[i];
    return ((s1 % 11) % 10) === +inn[10] && ((s2 % 11) % 10) === +inn[11];
  }
  return false;
}

/* ---- Банки (слой скоринга = интеграция) -------------------------- */
const BANKS = [
  { id: "sber", name: "Сбербанк", tag: "Крупный · консервативный", minRevenue: 300, minYears: 3, maxLoan: 2000, baseRate: 16.5, speed: 7, purposes: ["project_finance", "working_capital", "equipment"] },
  { id: "vtb", name: "ВТБ", tag: "Проектное финансирование", minRevenue: 200, minYears: 2, maxLoan: 1500, baseRate: 17.0, speed: 6, purposes: ["project_finance", "contract_finance"] },
  { id: "psb", name: "ПСБ", tag: "Госконтракты · подряд", minRevenue: 80, minYears: 1, maxLoan: 800, baseRate: 18.2, speed: 4, purposes: ["contract_finance", "working_capital", "project_finance"] },
  { id: "alfa", name: "Альфа-Банк", tag: "Быстро · гибко", minRevenue: 50, minYears: 1, maxLoan: 500, baseRate: 19.5, speed: 2, purposes: ["working_capital", "equipment", "contract_finance"] },
  { id: "sovcom", name: "Совкомбанк", tag: "Лизинг техники", minRevenue: 40, minYears: 1, maxLoan: 350, baseRate: 18.9, speed: 3, purposes: ["equipment"] },
  { id: "tbank", name: "Т-Банк", tag: "Оборотка для МСБ", minRevenue: 25, minYears: 1, maxLoan: 150, baseRate: 21.0, speed: 1, purposes: ["working_capital"] },
];
const PURPOSES = {
  working_capital: "Оборотные средства", equipment: "Спецтехника / оборудование",
  project_finance: "Проектное финансирование", contract_finance: "Исполнение контракта",
};
const RATING_ADJ = { A: -1.5, B: 0, C: 2.5 };
const RATING_PROB = { A: 0.92, B: 0.7, C: 0.45 };

function matchBanks(app, co) {
  const out = [];
  for (const b of BANKS) {
    const reasons = [];
    if (co.revenue < b.minRevenue) reasons.push(`выручка < ${b.minRevenue} млн`);
    if (co.years < b.minYears) reasons.push(`стаж < ${b.minYears} г.`);
    if (!b.purposes.includes(app.purpose)) reasons.push("цель не поддерживается");
    if (reasons.length) { out.push({ bankId: b.id, declined: true, reasons }); continue; }
    const rate = +(b.baseRate + RATING_ADJ[co.rating] + (co.years >= 5 ? -0.5 : 0)).toFixed(1);
    const approved = Math.min(app.amount, b.maxLoan, Math.round(co.revenue * (co.rating === "C" ? 1.2 : 2)));
    let prob = RATING_PROB[co.rating]; if (app.amount > b.maxLoan) prob *= 0.7;
    const m = (approved * (rate / 100 / 12)) / (1 - Math.pow(1 + rate / 100 / 12, -app.term));
    out.push({ bankId: b.id, declined: false, rate, approved, term: app.term, speed: b.speed, probability: Math.round(Math.min(prob, 0.98) * 100), monthly: Math.round(m) });
  }
  return out.sort((a, b) => (a.declined !== b.declined) ? (a.declined ? 1 : -1) : (a.declined ? 0 : a.rate - b.rate));
}

/* ---- Документы по заявке ----------------------------------------- */
const DOC_TYPES = {
  charter: "Устав / учредительные",
  finance: "Бухгалтерская отчётность",
  bankstmt: "Выписка по расчётному счёту",
  contract: "Договор / контракт",
};
const requiredDocs = (purpose) =>
  purpose === "contract_finance"
    ? ["charter", "finance", "bankstmt", "contract"]
    : ["charter", "finance", "bankstmt"];

/* ---- Компания и сид-данные --------------------------------------- */
const COMPANY = { name: "СтройМонолит ГК", inn: "7701234560", revenue: 640, years: 8, rating: "A" };

const SEED = [
  { id: "APP-1042", amount: 450, term: 36, purpose: "project_finance", status: "offers", created: "2026-05-28", docs: { charter: { name: "ustav.pdf", size: 184320 }, finance: { name: "buh_2025.pdf", size: 902144 }, bankstmt: { name: "vypiska.pdf", size: 331776 } } },
  { id: "APP-1041", amount: 180, term: 24, purpose: "contract_finance", status: "approved", created: "2026-05-21", chosenBank: "psb", docs: { charter: { name: "ustav.pdf", size: 184320 }, finance: { name: "buh_2025.pdf", size: 902144 }, bankstmt: { name: "vypiska.pdf", size: 331776 }, contract: { name: "dogovor_podryad.pdf", size: 512000 } } },
  { id: "APP-1040", amount: 90, term: 18, purpose: "equipment", status: "draft", created: "2026-06-02", docs: { charter: { name: "ustav.pdf", size: 184320 } } },
];

const STATUS = {
  draft: { label: "Черновик", c: "#6b655c", bg: "#efece6" },
  sent: { label: "На рассмотрении", c: "#1f3a5f", bg: "#e6edf5" },
  offers: { label: "Есть предложения", c: "#b45309", bg: "#fdf0e6" },
  approved: { label: "Одобрено", c: "#15803d", bg: "#e7f4ec" },
  rejected: { label: "Отказ", c: "#b91c1c", bg: "#fbe9e9" },
};

const ROLES = {
  owner: { label: "Владелец", can: { create: 1, upload: 1, accept: 1, team: 1, export: 1 } },
  manager: { label: "Менеджер", can: { create: 1, upload: 1, accept: 0, team: 0, export: 1 } },
  accountant: { label: "Бухгалтер", can: { create: 0, upload: 0, accept: 0, team: 0, export: 1 } },
};

/* ============================================================ */
export default function App() {
  const [apps, setApps] = useState(SEED);
  const [team, setTeam] = useState([
    { name: "Игорь Соколов", email: "sokolov@stroymonolit.ru", role: "owner" },
    { name: "Анна Лебедева", email: "lebedeva@stroymonolit.ru", role: "manager" },
    { name: "Мария Котова", email: "kotova@stroymonolit.ru", role: "accountant" },
  ]);
  const [role, setRole] = useState("owner");
  const [view, setView] = useState("home");
  const [openApp, setOpenApp] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const can = ROLES[role].can;

  useEffect(() => { (async () => {
    try {
      const r = await window.storage.get("cab:apps"); if (r?.value) setApps(JSON.parse(r.value));
      const t = await window.storage.get("cab:team"); if (t?.value) setTeam(JSON.parse(t.value));
    } catch (e) {}
    setLoaded(true);
  })(); }, []);
  useEffect(() => { if (loaded) { try { window.storage.set("cab:apps", JSON.stringify(apps)); window.storage.set("cab:team", JSON.stringify(team)); } catch (e) {} } }, [apps, team, loaded]);

  const createApp = (form) => {
    const id = "APP-" + (1043 + apps.filter((a) => a.id.startsWith("APP")).length);
    const app = { ...form, id, status: "draft", created: new Date().toISOString().slice(0, 10), docs: {} };
    setApps([app, ...apps]); setShowNew(false); setOpenApp(id);
  };
  const updateApp = (id, patch) => setApps(apps.map((a) => a.id === id ? { ...a, ...patch } : a));
  const submitApp = (id) => updateApp(id, { status: "offers" });
  const chooseOffer = (id, bankId) => updateApp(id, { status: "approved", chosenBank: bankId });
  const uploadDoc = (id, type, file) =>
    updateApp(id, { docs: { ...apps.find((a) => a.id === id).docs, [type]: { name: file.name, size: file.size } } });

  const current = apps.find((a) => a.id === openApp);

  return (
    <div style={{ ...body, background: C.bg, color: C.ink, minHeight: "100vh" }}>
      <style>{FONTS}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <aside style={{ width: 240, background: C.ink, color: "#e9e5dd", padding: "26px 18px", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 34, height: 34, background: C.amber, borderRadius: 8, display: "grid", placeItems: "center", ...display, fontWeight: 800, color: "#fff", fontSize: 16 }}>СМ</div>
            <div>
              <div style={{ ...display, fontWeight: 700, fontSize: 15, lineHeight: 1.1 }}>{COMPANY.name}</div>
              <div style={{ ...mono, fontSize: 11, color: "#9b948a" }}>ИНН {COMPANY.inn}</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#7e776d", marginBottom: 24 }}>Кабинет заёмщика</div>
          {[["home", "Главная"], ["apps", "Мои заявки"], ["docs", "Документы"], can.team && ["team", "Команда"], ["reports", "Отчёты"]].filter(Boolean).map(([k, l]) => (
            <button key={k} onClick={() => { setView(k); setOpenApp(null); }} style={{ textAlign: "left", padding: "11px 14px", marginBottom: 4, borderRadius: 9, border: "none", cursor: "pointer", fontSize: 14.5, ...body, fontWeight: 500, background: view === k && !openApp ? C.amber : "transparent", color: view === k && !openApp ? "#fff" : "#cfc9bf" }}>{l}</button>
          ))}
          <div style={{ marginTop: "auto" }}>
            <div style={{ fontSize: 11, color: "#7e776d", marginBottom: 6 }}>Роль (демо-переключатель):</div>
            <select value={role} onChange={(e) => { setRole(e.target.value); setView("home"); setOpenApp(null); }} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "none", background: "#2c2925", color: "#e9e5dd", ...body, fontSize: 13 }}>
              {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </aside>

        <main style={{ flex: 1, padding: "32px 40px", maxWidth: 1180 }}>
          {current ? (
            <AppDetail app={current} can={can} onBack={() => setOpenApp(null)} onSubmit={submitApp} onChoose={chooseOffer} onUpload={uploadDoc} />
          ) : view === "home" ? (
            <Home apps={apps} can={can} onOpen={setOpenApp} onNew={() => setShowNew(true)} />
          ) : view === "apps" ? (
            <Applications apps={apps} can={can} onOpen={setOpenApp} onNew={() => setShowNew(true)} />
          ) : view === "docs" ? (
            <Documents apps={apps} onOpen={setOpenApp} />
          ) : view === "team" ? (
            <Team team={team} setTeam={setTeam} />
          ) : (
            <Reports apps={apps} can={can} />
          )}
        </main>
      </div>
      {showNew && <NewApp onClose={() => setShowNew(false)} onCreate={createApp} />}
    </div>
  );
}

/* ---- Главная ----------------------------------------------------- */
function Home({ apps, can, onOpen, onNew }) {
  const active = apps.filter((a) => ["draft", "sent", "offers"].includes(a.status)).length;
  const approved = apps.filter((a) => a.status === "approved");
  const volume = approved.reduce((s, a) => {
    const o = matchBanks(a, COMPANY).find((x) => x.bankId === a.chosenBank); return s + (o ? o.approved : a.amount);
  }, 0);
  const nextPay = approved.reduce((s, a) => {
    const o = matchBanks(a, COMPANY).find((x) => x.bankId === a.chosenBank); return s + (o ? o.monthly : 0);
  }, 0);
  return (
    <div>
      <Header title="Главная" sub={`Рейтинг компании: ${COMPANY.rating} · выручка ${fmt(COMPANY.revenue)} млн/год`} onNew={can.create ? onNew : null} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 24 }}>
        <Kpi label="Активные заявки" value={active} />
        <Kpi label="Действующее финансирование" value={fmt(volume) + " млн"} accent />
        <Kpi label="Платёж в месяц" value={fmt(nextPay) + " млн"} />
      </div>
      <Panel title="Последние заявки">
        {apps.slice(0, 5).map((a) => <Row key={a.id} a={a} onOpen={onOpen} />)}
      </Panel>
    </div>
  );
}

/* ---- Заявки ------------------------------------------------------ */
function Applications({ apps, can, onOpen, onNew }) {
  const [f, setF] = useState("all");
  const list = apps.filter((a) => f === "all" || a.status === f);
  return (
    <div>
      <Header title="Мои заявки" sub={`${apps.length} всего`} onNew={can.create ? onNew : null} />
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[["all", "Все"], ...Object.entries(STATUS).map(([k, v]) => [k, v.label])].map(([k, l]) => (
          <button key={k} onClick={() => setF(k)} style={{ padding: "7px 14px", borderRadius: 20, border: `1px solid ${C.line}`, cursor: "pointer", ...body, fontSize: 13, fontWeight: 500, background: f === k ? C.ink : C.panel, color: f === k ? "#fff" : C.sub }}>{l}</button>
        ))}
      </div>
      <Panel>
        {list.length === 0 && <div style={{ color: C.sub, padding: 20, textAlign: "center" }}>Нет заявок</div>}
        {list.map((a) => <Row key={a.id} a={a} onOpen={onOpen} />)}
      </Panel>
    </div>
  );
}

/* ---- Детали заявки ----------------------------------------------- */
function AppDetail({ app, can, onBack, onSubmit, onChoose, onUpload }) {
  const offers = useMemo(() => matchBanks(app, COMPANY), [app]);
  const valid = offers.filter((o) => !o.declined);
  const req = requiredDocs(app.purpose);
  const haveAll = req.every((d) => app.docs[d]);
  const bankName = (id) => BANKS.find((b) => b.id === id)?.name;

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.sub, cursor: "pointer", ...body, fontSize: 13, marginBottom: 14, padding: 0 }}>← Назад</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ ...display, fontWeight: 700, fontSize: 26, margin: 0 }}>{PURPOSES[app.purpose]}</h1>
          <div style={{ color: C.sub, fontSize: 14, marginTop: 4 }}>{app.id} · {fmt(app.amount)} млн на {app.term} мес · от {app.created}</div>
        </div>
        <Badge s={app.status} />
      </div>

      {/* Документы */}
      <Panel title="Документы">
        {req.map((d) => (
          <DocRow key={d} type={d} doc={app.docs[d]} canUpload={can.upload && app.status === "draft"} onUpload={(file) => onUpload(app.id, d, file)} />
        ))}
        {app.status === "draft" && (
          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: haveAll ? "#15803d" : C.sub }}>
              {haveAll ? "✓ Все документы загружены" : `Загружено ${req.filter((d) => app.docs[d]).length} из ${req.length}`}
            </span>
            {can.create && (
              <button disabled={!haveAll} onClick={() => onSubmit(app.id)} style={{ ...btn(true), opacity: haveAll ? 1 : 0.4 }}>
                Отправить в банки →
              </button>
            )}
          </div>
        )}
      </Panel>

      {/* Офферы */}
      {app.status !== "draft" && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ ...display, fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Предложения банков</h2>
          <p style={{ color: C.sub, fontSize: 13, marginTop: 0, marginBottom: 16 }}>Отправлено в {BANKS.length} · откликнулись {valid.length}</p>
          <div style={{ display: "grid", gap: 12 }}>
            {valid.map((o) => {
              const chosen = app.chosenBank === o.bankId;
              return (
                <div key={o.bankId} style={{ background: C.panel, border: `1.5px solid ${chosen ? C.amber : C.line}`, borderRadius: 12, padding: "16px 20px", display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr auto", alignItems: "center", gap: 14 }}>
                  <div>
                    <div style={{ ...display, fontWeight: 700, fontSize: 16 }}>{bankName(o.bankId)}</div>
                    <div style={{ fontSize: 12, color: C.sub }}>{BANKS.find((b) => b.id === o.bankId).tag}</div>
                  </div>
                  <Field l="Ставка" v={<span style={mono}>{o.rate}%</span>} />
                  <Field l="Сумма" v={<span style={mono}>{fmt(o.approved)} млн</span>} />
                  <Field l="Платёж/мес" v={<span style={mono}>{fmt(o.monthly)} млн</span>} />
                  <Field l="Решение" v={`${o.speed} дн · ${o.probability}%`} />
                  {app.status === "offers" ? (
                    can.accept ? (
                      <button onClick={() => onChoose(app.id, o.bankId)} style={{ ...btn(true), padding: "9px 16px", fontSize: 13 }}>Выбрать</button>
                    ) : <span style={{ fontSize: 12, color: C.sub }}>нет прав</span>
                  ) : chosen ? <span style={{ ...body, fontWeight: 600, fontSize: 13, color: "#15803d" }}>✓ Сделка</span> : <span />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Документы (общий реестр) ------------------------------------ */
function Documents({ apps, onOpen }) {
  const rows = [];
  apps.forEach((a) => Object.entries(a.docs).forEach(([t, d]) => rows.push({ ...d, type: t, app: a.id, status: a.status })));
  return (
    <div>
      <Header title="Документы" sub={`${rows.length} файлов`} />
      <Panel>
        {rows.length === 0 && <div style={{ color: C.sub, padding: 20, textAlign: "center" }}>Документов пока нет</div>}
        {rows.map((r, i) => (
          <div key={i} onClick={() => onOpen(r.app)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 6px", borderBottom: `1px solid ${C.line}`, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: C.sub }}>{DOC_TYPES[r.type]} · {r.app}</div>
              </div>
            </div>
            <span style={{ ...mono, fontSize: 12, color: C.sub }}>{(r.size / 1024).toFixed(0)} КБ</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

/* ---- Команда ----------------------------------------------------- */
function Team({ team, setTeam }) {
  return (
    <div>
      <Header title="Команда" sub="Доступы сотрудников компании" />
      <Panel>
        {team.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 6px", borderBottom: `1px solid ${C.line}` }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>{m.name}</div>
              <div style={{ fontSize: 12, color: C.sub }}>{m.email}</div>
            </div>
            <select value={m.role} onChange={(e) => setTeam(team.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} style={{ ...inp, width: 160, marginTop: 0 }}>
              {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        ))}
        <div style={{ fontSize: 12, color: C.sub, marginTop: 14, lineHeight: 1.5 }}>
          <b>Владелец</b> — всё, выбор банка, управление командой · <b>Менеджер</b> — заявки и документы · <b>Бухгалтер</b> — просмотр и экспорт.
        </div>
      </Panel>
    </div>
  );
}

/* ---- Отчёты + экспорт CSV ---------------------------------------- */
function Reports({ apps, can }) {
  const exportCsv = () => {
    const head = ["ID", "Цель", "Сумма_млн", "Срок_мес", "Статус", "Банк", "Создана"];
    const lines = apps.map((a) => [a.id, PURPOSES[a.purpose], a.amount, a.term, STATUS[a.status].label, a.chosenBank ? BANKS.find((b) => b.id === a.chosenBank).name : "—", a.created]);
    const csv = "\uFEFF" + [head, ...lines].map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "zayavki.csv"; a.click(); URL.revokeObjectURL(url);
  };
  const byStatus = Object.keys(STATUS).map((k) => ({ k, n: apps.filter((a) => a.status === k).length }));
  return (
    <div>
      <Header title="Отчёты" sub="Сводка по заявкам" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 20 }}>
        {byStatus.map(({ k, n }) => (
          <div key={k} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 }}>
            <div style={{ ...display, fontWeight: 700, fontSize: 24 }}>{n}</div>
            <div style={{ fontSize: 12, color: STATUS[k].c }}>{STATUS[k].label}</div>
          </div>
        ))}
      </div>
      <Panel title="Все заявки">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ textAlign: "left", color: C.sub }}>
            {["ID", "Цель", "Сумма", "Статус", "Банк"].map((h) => <th key={h} style={{ padding: "6px 4px", fontWeight: 500 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {apps.map((a) => (
              <tr key={a.id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: "9px 4px", ...mono }}>{a.id}</td>
                <td style={{ padding: "9px 4px" }}>{PURPOSES[a.purpose]}</td>
                <td style={{ padding: "9px 4px", ...mono }}>{fmt(a.amount)} млн</td>
                <td style={{ padding: "9px 4px" }}><Badge s={a.status} /></td>
                <td style={{ padding: "9px 4px" }}>{a.chosenBank ? BANKS.find((b) => b.id === a.chosenBank).name : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {can.export && <button onClick={exportCsv} style={{ ...btn(true), marginTop: 16 }}>↓ Экспорт в CSV</button>}
      </Panel>
    </div>
  );
}

/* ---- Новая заявка ------------------------------------------------ */
function NewApp({ onClose, onCreate }) {
  const [f, setF] = useState({ amount: 200, term: 24, purpose: "working_capital" });
  const [inn, setInn] = useState(COMPANY.inn);
  const innOk = validateInn(inn);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(28,26,23,.5)", display: "grid", placeItems: "center", padding: 20, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, borderRadius: 16, padding: 28, width: 500, maxWidth: "100%" }}>
        <h2 style={{ ...display, fontWeight: 700, fontSize: 22, marginTop: 0 }}>Новая заявка</h2>
        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ fontSize: 12.5, color: C.sub }}>ИНН компании</span>
          <div style={{ position: "relative" }}>
            <input value={inn} onChange={(e) => setInn(e.target.value.replace(/\D/g, ""))} maxLength={12} style={{ ...inp, ...mono, borderColor: inn.length >= 10 ? (innOk ? "#15803d" : "#b91c1c") : C.line }} />
            <span style={{ position: "absolute", right: 12, top: 16, fontSize: 13, fontWeight: 600, color: innOk ? "#15803d" : "#b91c1c" }}>
              {inn.length >= 10 ? (innOk ? "✓ верный" : "✗ неверный") : ""}
            </span>
          </div>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Num l="Сумма, млн" v={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
          <Num l="Срок, мес" v={f.term} onChange={(v) => setF({ ...f, term: v })} />
          <div style={{ gridColumn: "1 / -1" }}>
            <Sel l="Цель кредита" v={f.purpose} onChange={(v) => setF({ ...f, purpose: v })} opts={Object.entries(PURPOSES)} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btn(false)}>Отмена</button>
          <button disabled={!innOk} onClick={() => onCreate(f)} style={{ ...btn(true), opacity: innOk ? 1 : 0.4 }}>Создать черновик</button>
        </div>
      </div>
    </div>
  );
}

/* ---- DocRow с загрузкой файла ------------------------------------ */
function DocRow({ type, doc, canUpload, onUpload }) {
  const ref = useRef();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 6px", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 16 }}>{doc ? "✅" : "⬜"}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{DOC_TYPES[type]}</div>
          {doc && <div style={{ fontSize: 12, color: C.sub, ...mono }}>{doc.name} · {(doc.size / 1024).toFixed(0)} КБ</div>}
        </div>
      </div>
      {canUpload && (
        <>
          <input ref={ref} type="file" style={{ display: "none" }} onChange={(e) => e.target.files[0] && onUpload(e.target.files[0])} />
          <button onClick={() => ref.current.click()} style={btn(false)}>{doc ? "Заменить" : "Загрузить"}</button>
        </>
      )}
    </div>
  );
}

/* ---- Общие компоненты -------------------------------------------- */
const btn = (primary) => ({ padding: "9px 16px", borderRadius: 9, cursor: "pointer", ...body, fontWeight: 600, fontSize: 13.5, border: primary ? "none" : `1px solid ${C.line}`, background: primary ? C.amber : C.panel, color: primary ? "#fff" : C.ink });

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
    <div style={{ background: accent ? C.ink : C.panel, color: accent ? "#fff" : C.ink, border: `1px solid ${accent ? C.ink : C.line}`, borderRadius: 12, padding: 18 }}>
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
    <div onClick={() => onOpen(a.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 6px", borderBottom: `1px solid ${C.line}`, cursor: "pointer" }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14.5 }}>{PURPOSES[a.purpose]}</div>
        <div style={{ fontSize: 12, color: C.sub }}>{a.id} · {a.term} мес</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ ...mono, fontSize: 14 }}>{fmt(a.amount)} млн</span>
        <Badge s={a.status} />
      </div>
    </div>
  );
}
function Badge({ s }) {
  const st = STATUS[s] || STATUS.draft;
  return <span style={{ fontSize: 12, fontWeight: 600, color: st.c, background: st.bg, padding: "4px 11px", borderRadius: 20, whiteSpace: "nowrap" }}>{st.label}</span>;
}
function Field({ l, v }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 2 }}>{l}</div>
      <div style={{ fontWeight: 600, fontSize: 14.5 }}>{v}</div>
    </div>
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
const inp = { width: "100%", marginTop: 5, padding: "10px 12px", borderRadius: 9, border: `1px solid ${C.line}`, background: "#fff", fontSize: 14, fontFamily: "'Hanken Grotesk', sans-serif", boxSizing: "border-box", color: C.ink };
