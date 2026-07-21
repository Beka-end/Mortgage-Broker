import React, { useState, useEffect, useMemo } from "react";

/* ============================================================
   НАСТРОЙКА БАНКОВСКИХ СЕРВИСОВ (админка застройщика / брокера)
   По спецификации Altyn «Online Ipoteka» (JsonMortgage / ESB):
     REST  StartMortgage
     SOAP  SendOffers  (колбэк банка — предложения)
     SOAP  UpdateOrderState (колбэк банка — статусы)
   Здесь застройщик/брокер настраивает подключение, продукты,
   маппинг полей и статусы, и прогоняет тестовый флоу.
   ============================================================ */

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');`;
const C = {
  bg: "#f5f6f8", panel: "#ffffff", ink: "#191c22", sub: "#6a7180", line: "#e4e7ec",
  indigo: "#4f46e5", indigoSoft: "#eef0fe", green: "#0e8f5b", greenSoft: "#e5f4ed",
  amber: "#b7791f", red: "#c0392b", sidebar: "#171a21",
};
const body = { fontFamily: "'Hanken Grotesk', sans-serif" };
const mono = { fontFamily: "'JetBrains Mono', monospace" };
const guid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16); });
const nowIso = () => new Date().toISOString().slice(0, 23);
const fmt = (n) => new Intl.NumberFormat("ru-RU").format(Math.round(n));

/* ---- Спец-справочники (из JsonMortgage) -------------------------- */
const PAYMENT_METHODS = [["0", "Аннуитет"], ["1", "Равные доли"]];
const REALTY_TYPES = [["underConsRealEstate", "Строящаяся недвижимость"], ["builtRealEstate", "Готовая недвижимость"]];

/* ---- Шаблон коннектора Altyn (сид из спецификации) --------------- */
const ALTYN = {
  id: "altyn-online-ipoteka",
  name: "Altyn Bank · Online Ipoteka",
  env: "test",
  enabled: true,
  restUrl: "http://ala33535.hsbk.nb:7900/JsonMortgage",
  soapUrl: "http://ala33535.hsbk.nb:7806/esb/mortgage/v1.0",
  version: "TL 1.1",
  source: "BI",
  authType: "token",
  token: "",
  signType: "AITU",
  timeout: 30,
  seller: { name: "Hayat Construction Group", bin: "151040016771", branchCode: "GPM000011", branchName: "Отдел продаж Hayat", managerFullName: "", managerPhone: "77016167773" },
  products: [
    { internal: "Ипотека", code: "biMortgage", productRef: "ALTNM", kind: "mortgage", enabled: true },
    { internal: "7‑20‑25", code: "72025", productRef: "ALTNM", kind: "mortgage", enabled: true },
    { internal: "Рассрочка (Altyn‑i)", code: "installmentMortgage", productRef: "ALTNM INS", kind: "installment", enabled: true },
  ],
  fieldMap: [
    { group: "Заявка", path: "body[].orderNumber", label: "Номер заявки", src: "order.ref", req: true },
    { group: "Заявка", path: "body[].desiredProductType", label: "Тип продукта", src: "product.code", req: true },
    { group: "Заявка", path: "body[].amount", label: "Сумма займа", src: "order.amount", req: true },
    { group: "Заявка", path: "body[].initialSum", label: "Первонач. взнос", src: "order.down", req: true },
    { group: "Заявка", path: "body[].desiredLoanTerm", label: "Срок (мес)", src: "order.termMonths", req: true },
    { group: "Заявка", path: "body[].desiredPaymentMethod", label: "Способ платежа", src: "order.paymentMethod", req: true },
    { group: "Заявка", path: "body[].isNPI", label: "Без подтв. дохода", src: "order.isNPI", req: false },
    { group: "Заявка", path: "body[].initNetSalary", label: "Чистый доход", src: "order.income", req: false },
    { group: "Согласие", path: "agreementToFCBSignHash.documentHash", label: "Хэш согласия ПКБ", src: "consent.hash", req: true },
    { group: "Согласие", path: "agreementToFCBSignHash.signature", label: "Подпись (base64)", src: "consent.signature", req: true },
    { group: "Продавец", path: "seller.bin", label: "БИН застройщика", src: "seller.bin", req: true },
    { group: "Продавец", path: "seller.managerPhone", label: "Телефон менеджера", src: "seller.managerPhone", req: false },
    { group: "Объект", path: "complex[].type", label: "Тип недвижимости", src: "object.realtyType", req: true },
    { group: "Объект", path: "complex[].typeOfPledge", label: "Тип залога", src: "'ACQUIRING'", req: true },
    { group: "Объект", path: "complex[].name", label: "ЖК / объект", src: "object.complexName", req: true },
    { group: "Объект", path: "complex[].marketCost", label: "Рыночная стоимость", src: "object.marketCost", req: true },
    { group: "Объект", path: "complex[].totalArea", label: "Общая площадь", src: "object.totalArea", req: false },
    { group: "Объект", path: "complex[].numberOfRooms", label: "Комнат", src: "object.rooms", req: false },
    { group: "Объект", path: "complex[].address.city", label: "Город (код)", src: "object.cityCode", req: false },
    { group: "Оценка", path: "complex[].estimater.reportNum", label: "№ отчёта оценки", src: "estimate.reportNum", req: false },
    { group: "Оценка", path: "complex[].estimater.estimaterCost", label: "Оценочная стоимость", src: "estimate.cost", req: false },
    { group: "Клиент", path: "customer[].taxCode", label: "ИИН", src: "client.iin", req: true },
    { group: "Клиент", path: "customer[].mobilePhone", label: "Телефон", src: "client.phone", req: true },
    { group: "Клиент", path: "customer[].document.number", label: "№ документа", src: "client.docNumber", req: false },
    { group: "Клиент", path: "customer[].address.registration.city", label: "Город регистрации", src: "client.regCity", req: false },
  ],
  states: [
    { state: "approve", title: "Одобрено", internal: "approved" },
    { state: "reject", title: "Отказ", internal: "rejected" },
    { state: "readyRegistration", title: "Готов к регистрации", internal: "ready" },
    { state: "signed", title: "Займ выдан", internal: "issued" },
  ],
};
const blankConnector = (n) => ({ ...JSON.parse(JSON.stringify(ALTYN)), id: "bank-" + Date.now(), name: n || "Новый банк", enabled: false, restUrl: "", soapUrl: "", token: "" });

const TABS = [["conn", "Подключение"], ["prod", "Продукты"], ["map", "Маппинг полей"], ["state", "Статусы"], ["test", "Проверка"]];

/* ============================================================ */
export default function App() {
  const [connectors, setConnectors] = useState([ALTYN, { ...blankConnector("Freedom Bank · Онлайн-ипотека"), id: "freedom", source: "BI" }, { ...blankConnector("Банк ЦентрКредит · Super"), id: "bcc" }]);
  const [selId, setSelId] = useState("altyn-online-ipoteka");
  const [tab, setTab] = useState("conn");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { (async () => {
    try { const r = await window.storage.get("bankcfg:v1"); if (r?.value) setConnectors(JSON.parse(r.value)); } catch (e) {}
    setLoaded(true);
  })(); }, []);
  const persist = async (next) => { setConnectors(next); try { await window.storage.set("bankcfg:v1", JSON.stringify(next)); setSaved(true); setTimeout(() => setSaved(false), 1500); } catch (e) {} };

  const sel = connectors.find((c) => c.id === selId) || connectors[0];
  const update = (patch) => persist(connectors.map((c) => c.id === sel.id ? { ...c, ...patch } : c));
  const addBank = () => { const n = blankConnector(); persist([...connectors, n]); setSelId(n.id); setTab("conn"); };

  return (
    <div style={{ ...body, background: C.bg, color: C.ink, minHeight: "100vh", display: "flex" }}>
      <style>{FONTS}</style>

      {/* Сайдбар: список банков */}
      <aside style={{ width: 264, background: C.sidebar, color: "#dfe3ea", padding: "22px 16px", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Банковские сервисы</div>
        <div style={{ fontSize: 11.5, color: "#8b93a2", marginBottom: 20 }}>Интеграция · JsonMortgage / ESB</div>
        <div style={{ fontSize: 11, color: "#8b93a2", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>Подключения</div>
        {connectors.map((c) => (
          <button key={c.id} onClick={() => setSelId(c.id)} style={{ textAlign: "left", padding: "10px 12px", marginBottom: 4, borderRadius: 9, border: "none", cursor: "pointer", ...body, fontSize: 13.5, background: c.id === sel.id ? C.indigo : "transparent", color: c.id === sel.id ? "#fff" : "#c4cad4", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
            <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: c.enabled ? C.green : "#5a6170" }} />
          </button>
        ))}
        <button onClick={addBank} style={{ marginTop: 8, padding: "10px 12px", borderRadius: 9, border: "1px dashed #3a4150", background: "transparent", color: "#c4cad4", cursor: "pointer", ...body, fontSize: 13.5 }}>+ Добавить банк</button>
        <div style={{ marginTop: "auto", fontSize: 11, color: "#7a8290", lineHeight: 1.5 }}>Настройка едина для Варианта 1 (сайт застройщика) и Варианта 2 (CRM). Брокер стоит между застройщиком и банком.</div>
      </aside>

      {/* Контент */}
      <main style={{ flex: 1, padding: "26px 34px", maxWidth: 1080 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <h1 style={{ fontWeight: 700, fontSize: 24, margin: 0 }}>{sel.name}</h1>
            <div style={{ fontSize: 13, color: C.sub, marginTop: 3, ...mono }}>source: {sel.source || "—"} · env: {sel.env} · version: {sel.version}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {saved && <span style={{ fontSize: 13, color: C.green }}>Сохранено ✓</span>}
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, cursor: "pointer" }}>
              <input type="checkbox" checked={sel.enabled} onChange={(e) => update({ enabled: e.target.checked })} style={{ accentColor: C.indigo, width: 16, height: 16 }} />
              Подключение активно
            </label>
          </div>
        </div>

        {/* Табы */}
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.line}`, margin: "16px 0 22px" }}>
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: "10px 16px", border: "none", background: "none", cursor: "pointer", ...body, fontSize: 14, fontWeight: 600, color: tab === k ? C.indigo : C.sub, borderBottom: `2px solid ${tab === k ? C.indigo : "transparent"}`, marginBottom: -1 }}>{l}</button>
          ))}
        </div>

        {tab === "conn" && <TabConnection c={sel} update={update} />}
        {tab === "prod" && <TabProducts c={sel} update={update} />}
        {tab === "map" && <TabMapping c={sel} update={update} />}
        {tab === "state" && <TabStates c={sel} update={update} />}
        {tab === "test" && <TabTest c={sel} />}
      </main>
    </div>
  );
}

/* ---- Таб: Подключение -------------------------------------------- */
function TabConnection({ c, update }) {
  const s = c.seller;
  const setSeller = (k, v) => update({ seller: { ...s, [k]: v } });
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card title="Соединение" note="Эндпоинты и параметры из спецификации JsonMortgage">
        <Grid>
          <F l="Название"><Inp v={c.name} on={(v) => update({ name: v })} /></F>
          <F l="Среда">
            <select value={c.env} onChange={(e) => update({ env: e.target.value })} style={inp}>
              <option value="test">Test</option><option value="prod">Prod</option>
            </select>
          </F>
          <F l="REST · StartMortgage (URL)" wide><Inp mono v={c.restUrl} on={(v) => update({ restUrl: v })} ph="http://.../JsonMortgage" /></F>
          <F l="SOAP · ESB колбэки (URL)" wide><Inp mono v={c.soapUrl} on={(v) => update({ soapUrl: v })} ph="http://.../esb/mortgage/v1.0" /></F>
          <F l="version"><Inp v={c.version} on={(v) => update({ version: v })} /></F>
          <F l="source (код партнёра)"><Inp v={c.source} on={(v) => update({ source: v })} ph="BI" /></F>
          <F l="signType"><Inp v={c.signType} on={(v) => update({ signType: v })} ph="AITU" /></F>
          <F l="Timeout, сек"><Inp v={c.timeout} on={(v) => update({ timeout: +v || 0 })} /></F>
          <F l="Auth token" wide><Inp mono type="password" v={c.token} on={(v) => update({ token: v })} ph="Bearer / API key" /></F>
        </Grid>
      </Card>

      <Card title="Продавец (застройщик)" note="Блок seller в StartMortgage — данные застройщика для флоу">
        <Grid>
          <F l="Наименование"><Inp v={s.name} on={(v) => setSeller("name", v)} /></F>
          <F l="БИН"><Inp mono v={s.bin} on={(v) => setSeller("bin", v.replace(/\D/g, ""))} /></F>
          <F l="branchCode"><Inp v={s.branchCode} on={(v) => setSeller("branchCode", v)} /></F>
          <F l="branchName"><Inp v={s.branchName} on={(v) => setSeller("branchName", v)} /></F>
          <F l="ФИО менеджера"><Inp v={s.managerFullName} on={(v) => setSeller("managerFullName", v)} /></F>
          <F l="Телефон менеджера"><Inp mono v={s.managerPhone} on={(v) => setSeller("managerPhone", v)} /></F>
        </Grid>
      </Card>
    </div>
  );
}

/* ---- Таб: Продукты ----------------------------------------------- */
function TabProducts({ c, update }) {
  const set = (i, k, v) => update({ products: c.products.map((p, j) => j === i ? { ...p, [k]: v } : p) });
  const add = () => update({ products: [...c.products, { internal: "Новый продукт", code: "", productRef: "", kind: "mortgage", enabled: false }] });
  const del = (i) => update({ products: c.products.filter((_, j) => j !== i) });
  return (
    <Card title="Продукты банка" note="Сопоставление продуктов застройщика с кодами desiredProductType / ProductReferenceId">
      <table style={tbl}>
        <thead><tr>{["Продукт (внутр.)", "desiredProductType", "ProductReferenceId", "Тип", "Вкл", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {c.products.map((p, i) => (
            <tr key={i}>
              <td style={td}><Inp v={p.internal} on={(v) => set(i, "internal", v)} /></td>
              <td style={td}><Inp mono v={p.code} on={(v) => set(i, "code", v)} ph="biMortgage / 72025" /></td>
              <td style={td}><Inp mono v={p.productRef} on={(v) => set(i, "productRef", v)} ph="ALTNM / ALTNM INS" /></td>
              <td style={td}>
                <select value={p.kind} onChange={(e) => set(i, "kind", e.target.value)} style={{ ...inp, minWidth: 120 }}>
                  <option value="mortgage">Ипотека</option><option value="installment">Рассрочка</option>
                </select>
              </td>
              <td style={{ ...td, textAlign: "center" }}><input type="checkbox" checked={p.enabled} onChange={(e) => set(i, "enabled", e.target.checked)} style={{ accentColor: C.indigo, width: 16, height: 16 }} /></td>
              <td style={{ ...td, textAlign: "center" }}><button onClick={() => del(i)} style={delBtn}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={add} style={addBtn}>+ Продукт</button>
      <div style={{ fontSize: 12, color: C.sub, marginTop: 10 }}>Коды из спецификации: <span style={mono}>biMortgage</span>, <span style={mono}>72025</span> (7‑20‑25), <span style={mono}>installmentMortgage</span>; ProductReferenceId <span style={mono}>ALTNM</span> / <span style={mono}>ALTNM INS</span>.</div>
    </Card>
  );
}

/* ---- Таб: Маппинг полей ------------------------------------------ */
function TabMapping({ c, update }) {
  const groups = useMemo(() => [...new Set(c.fieldMap.map((f) => f.group))], [c.fieldMap]);
  const set = (idx, v) => update({ fieldMap: c.fieldMap.map((f, j) => j === idx ? { ...f, src: v } : f) });
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ fontSize: 13, color: C.sub }}>Соответствие полей StartMortgage полям источника (сайт застройщика / CRM). Значения в кавычках — константы.</div>
      {groups.map((g) => (
        <Card key={g} title={g}>
          <table style={tbl}>
            <thead><tr>{["Поле спецификации", "Название", "Источник", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {c.fieldMap.map((f, i) => f.group === g && (
                <tr key={i}>
                  <td style={{ ...td, ...mono, fontSize: 12, color: C.sub, whiteSpace: "nowrap" }}>{f.path}</td>
                  <td style={td}>{f.label}{f.req && <span style={{ color: C.red }}> *</span>}</td>
                  <td style={td}><Inp mono v={f.src} on={(v) => set(i, v)} /></td>
                  <td style={{ ...td, textAlign: "center" }}>{f.req ? <span style={{ fontSize: 11, color: C.amber }}>required</span> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}

/* ---- Таб: Статусы ------------------------------------------------ */
function TabStates({ c, update }) {
  const set = (i, k, v) => update({ states: c.states.map((s, j) => j === i ? { ...s, [k]: v } : s) });
  return (
    <Card title="Статусы UpdateOrderState" note="Колбэк банка обновляет состояние заявки. Сопоставьте со статусами внутри системы.">
      <table style={tbl}>
        <thead><tr>{["state (банк)", "stateTitle", "Внутренний статус"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {c.states.map((s, i) => (
            <tr key={i}>
              <td style={{ ...td, ...mono }}>{s.state}</td>
              <td style={td}><Inp v={s.title} on={(v) => set(i, "title", v)} /></td>
              <td style={td}><Inp mono v={s.internal} on={(v) => set(i, "internal", v)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: C.sub, marginTop: 10 }}>Из спецификации: <span style={mono}>approve</span> · <span style={mono}>reject</span> · <span style={mono}>readyRegistration</span> · <span style={mono}>signed</span>.</div>
    </Card>
  );
}

/* ---- Таб: Проверка (тестовый флоу) ------------------------------- */
function TabTest({ c }) {
  const enabledProducts = c.products.filter((p) => p.enabled);
  const [sample, setSample] = useState({ ref: "HYT-100245", iin: "900515312349", phone: "77011234567", amount: 45.5, down: 12, termMonths: 60, paymentMethod: "0", isNPI: "false", income: 600000, productIdx: 0, realtyType: "underConsRealEstate", complexName: "Hayat Meliora", rooms: 2, totalArea: 80.29, cityCode: "750000000" });
  const set = (k, v) => setSample((s) => ({ ...s, [k]: v }));
  const [phase, setPhase] = useState("idle"); // idle|sending|offers|state
  const [orderId, setOrderId] = useState(null);
  const [offers, setOffers] = useState([]);
  const [stateIdx, setStateIdx] = useState(-1);
  const product = enabledProducts[sample.productIdx] || enabledProducts[0] || c.products[0];

  const startJson = useMemo(() => buildStartMortgage(c, sample, product), [c, sample, product]);

  const send = async () => {
    setPhase("sending"); setOffers([]); setStateIdx(-1);
    await new Promise((r) => setTimeout(r, 900));
    const oid = "ORD-" + Math.floor(100000 + Math.random() * 899999);
    setOrderId(oid);
    await new Promise((r) => setTimeout(r, 1000));
    setOffers(mockSendOffers(c, sample)); setPhase("offers");
  };
  const nextState = () => setStateIdx((i) => Math.min(i + 1, c.states.filter((s) => s.state !== "reject").length - 1));
  const flowStates = c.states.filter((s) => s.state !== "reject");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
      {/* левая колонка: параметры + JSON */}
      <div style={{ display: "grid", gap: 16 }}>
        <Card title="Тестовые данные">
          <Grid>
            <F l="orderNumber"><Inp mono v={sample.ref} on={(v) => set("ref", v)} /></F>
            <F l="Продукт">
              <select value={sample.productIdx} onChange={(e) => set("productIdx", +e.target.value)} style={inp}>
                {enabledProducts.map((p, i) => <option key={i} value={i}>{p.internal}</option>)}
              </select>
            </F>
            <F l="ИИН"><Inp mono v={sample.iin} on={(v) => set("iin", v.replace(/\D/g, ""))} /></F>
            <F l="Телефон"><Inp mono v={sample.phone} on={(v) => set("phone", v.replace(/\D/g, ""))} /></F>
            <F l="amount, млн"><Inp v={sample.amount} on={(v) => set("amount", +v || 0)} /></F>
            <F l="initialSum, млн"><Inp v={sample.down} on={(v) => set("down", +v || 0)} /></F>
            <F l="desiredLoanTerm, мес"><Inp v={sample.termMonths} on={(v) => set("termMonths", +v || 0)} /></F>
            <F l="desiredPaymentMethod">
              <select value={sample.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} style={inp}>
                {PAYMENT_METHODS.map(([k, l]) => <option key={k} value={k}>{k} — {l}</option>)}
              </select>
            </F>
            <F l="complex.type">
              <select value={sample.realtyType} onChange={(e) => set("realtyType", e.target.value)} style={inp}>
                {REALTY_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </F>
            <F l="complex.name"><Inp v={sample.complexName} on={(v) => set("complexName", v)} /></F>
          </Grid>
        </Card>
        <Card title="StartMortgage · тело запроса" note={`POST ${c.restUrl || "—"}`}>
          <pre style={pre}>{JSON.stringify(startJson, null, 2)}</pre>
        </Card>
      </div>

      {/* правая колонка: прогон */}
      <div style={{ display: "grid", gap: 16 }}>
        <Card title="Прогон флоу">
          <button onClick={send} disabled={phase === "sending"} style={{ ...primary, width: "100%", opacity: phase === "sending" ? .6 : 1 }}>
            {phase === "sending" ? "Отправка в банк…" : "Отправить StartMortgage (тест) →"}
          </button>
          {orderId && <div style={{ ...mono, fontSize: 12, color: C.sub, marginTop: 10 }}>OrderId: {orderId}</div>}
        </Card>

        {offers.length > 0 && (
          <Card title="SendOffers · ответ банка" note="SOAP-колбэк — предложения">
            <div style={{ display: "grid", gap: 10 }}>
              {offers.map((o) => (
                <div key={o.offerId} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <b style={{ fontSize: 13.5 }}>{o._name}</b>
                    <span style={{ ...mono, fontWeight: 700, color: C.indigo }}>{o.PercentRate}%</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, ...mono, fontSize: 11.5, color: C.sub }}>
                    <span>ГЭСВ<br /><b style={{ color: C.ink }}>{o.EffectiveAnnualRate}%</b></span>
                    <span>Платёж<br /><b style={{ color: C.ink }}>{fmt(o.MonthlyPayment)} ₸</b></span>
                    <span>Срок<br /><b style={{ color: C.ink }}>{o.LoanDuration} мес</b></span>
                  </div>
                  <div style={{ ...mono, fontSize: 11, color: C.sub, marginTop: 6 }}>offerId {o.offerId} · ref {o.ProductReferenceId}</div>
                </div>
              ))}
            </div>
            <button onClick={() => { setPhase("state"); setStateIdx(0); }} style={{ ...primary, width: "100%", marginTop: 12 }}>Выбрать оффер → UpdateOrderState</button>
          </Card>
        )}

        {phase === "state" && (
          <Card title="UpdateOrderState · статусы" note="SOAP-колбэк — состояние заявки">
            <div style={{ display: "grid", gap: 8 }}>
              {flowStates.map((s, i) => (
                <div key={s.state} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, background: i <= stateIdx ? C.green : "#d7dbe2", color: "#fff", display: "grid", placeItems: "center", fontSize: 12, flexShrink: 0 }}>{i <= stateIdx ? "✓" : ""}</span>
                  <span style={{ color: i <= stateIdx ? C.ink : C.sub }}><span style={mono}>{s.state}</span> — {s.title}</span>
                </div>
              ))}
            </div>
            {stateIdx < flowStates.length - 1
              ? <button onClick={nextState} style={{ ...primary, width: "100%", marginTop: 12 }}>Следующий статус →</button>
              : <div style={{ marginTop: 12, background: C.greenSoft, color: C.green, borderRadius: 8, padding: "10px 14px", fontSize: 13.5, fontWeight: 600 }}>Флоу завершён — займ выдан застройщику ✓</div>}
          </Card>
        )}
      </div>
    </div>
  );
}

/* ---- Построение StartMortgage из маппинга ------------------------ */
function buildStartMortgage(c, s, product) {
  return {
    version: c.version, type: "StartMortgage", id: guid(), dateTime: nowIso(), source: c.source,
    body: [{
      orderNumber: s.ref, orderDateTime: nowIso(),
      desiredProductType: product?.code || "", amount: String(s.amount * 1e6), initialSum: String(s.down * 1e6),
      agreementToFCBSignHash: { documentHash: "<sha256(consent)>", signature: "<base64(AITU)>", signType: c.signType },
      desiredLoanTerm: String(s.termMonths), desiredPaymentMethod: s.paymentMethod, isNPI: s.isNPI, initNetSalary: String(s.income),
      seller: { name: c.seller.name, bin: c.seller.bin, branchCode: c.seller.branchCode, branchName: c.seller.branchName, managerFullName: c.seller.managerFullName, managerPhone: c.seller.managerPhone },
      complex: [{
        type: s.realtyType, typeOfPledge: "ACQUIRING", name: s.complexName, marketCost: String(s.amount * 1e6),
        marketCurrency: "KZT", totalArea: String(s.totalArea), numberOfRooms: String(s.rooms),
        address: { country: "KZ", city: s.cityCode }, estimater: { reportNum: "", estimaterCost: String(s.amount * 1e6), estimaterCostCurrency: "KZT" },
        pledger: [{ taxCode: s.iin, role: "pledger", mobilePhone: s.phone }],
      }],
      customer: [{ taxCode: s.iin, role: "borrower", mobilePhone: s.phone, document: { type: "IDCARD", number: "" }, address: { registration: { country: "KZ", city: s.cityCode } } }],
    }],
  };
}
/* ---- Мок SendOffers ---------------------------------------------- */
function mockSendOffers(c, s) {
  const loan = Math.max(0, (s.amount - s.down)) * 1e6;
  const out = [];
  c.products.filter((p) => p.enabled).forEach((p, i) => {
    const rate = p.kind === "installment" ? 0 : (p.code === "72025" ? 7 : 11 + i * 2);
    const n = p.kind === "installment" ? Math.min(s.termMonths, 36) : s.termMonths;
    const r = rate / 100 / 12;
    const m = r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
    out.push({
      _name: `${p.internal}`, offerId: 1000 + i, ProductReferenceId: p.productRef,
      Amount: Math.round(loan), PercentRate: rate, EffectiveAnnualRate: rate === 0 ? 0 : +(rate + 1.2).toFixed(1),
      LoanDuration: n, MonthlyPayment: Math.round(m), OverPayment: Math.round(m * n - loan),
      PaymentType: s.paymentMethod, LoanType: p.kind === "installment" ? "1" : "0",
    });
  });
  return out;
}

/* ---- UI-компоненты ----------------------------------------------- */
function Card({ title, note, children }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
      {title && <div style={{ fontWeight: 700, fontSize: 14.5 }}>{title}</div>}
      {note && <div style={{ fontSize: 12, color: C.sub, marginTop: 2, marginBottom: 12, ...mono }}>{note}</div>}
      {!note && title && <div style={{ height: 12 }} />}
      {children}
    </div>
  );
}
function Grid({ children }) { return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>{children}</div>; }
function F({ l, wide, children }) { return <label style={{ display: "block", gridColumn: wide ? "1 / -1" : "auto" }}><span style={{ fontSize: 12, color: C.sub, display: "block", marginBottom: 4 }}>{l}</span>{children}</label>; }
function Inp({ v, on, ph, mono: m, type }) { return <input type={type || "text"} value={v} placeholder={ph} onChange={(e) => on(e.target.value)} style={{ ...inp, ...(m ? mono : {}) }} />; }

const inp = { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff", fontSize: 13.5, fontFamily: "'Hanken Grotesk', sans-serif", boxSizing: "border-box", color: C.ink };
const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th = { textAlign: "left", padding: "6px 8px", fontSize: 11.5, color: C.sub, fontWeight: 600, borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap" };
const td = { padding: "6px 8px", borderBottom: `1px solid ${C.line}`, verticalAlign: "middle" };
const primary = { background: C.indigo, color: "#fff", border: "none", padding: "11px 16px", borderRadius: 9, ...body, fontWeight: 600, fontSize: 14, cursor: "pointer" };
const addBtn = { marginTop: 12, background: C.indigoSoft, color: C.indigo, border: "none", padding: "8px 14px", borderRadius: 8, ...body, fontWeight: 600, fontSize: 13, cursor: "pointer" };
const delBtn = { background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 13 };
const pre = { ...mono, fontSize: 11.5, lineHeight: 1.5, background: "#12141a", color: "#cfe3ff", padding: 14, borderRadius: 10, overflow: "auto", maxHeight: 360, margin: 0 };
