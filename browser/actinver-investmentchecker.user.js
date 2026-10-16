// ==UserScript==
// @name         Actinver → investmentChecker (solo cotizaciones públicas)
// @namespace    https://github.com/youteachtk/investmentChecker
// @version      0.1.0
// @description  Lee los 226 instrumentos del monitor y envía solo cotizaciones públicas mediante GitHub Actions. Nunca compra ni vende.
// @match        https://retoactinver.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      api.github.com
// @run-at       document-idle
// ==/UserScript==
(async function () {
  "use strict";
  const OWNER = "youteachtk";
  const REPO = "investmentChecker";
  const WORKFLOW = "ingest_quotes.yml";
  const EXPECTED = [["ACCIONES", 145], ["ETFs", 56], ["FONDOS", 25]];
  const WAIT_MS = 9000;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const txt = node => (node?.innerText || "").trim().replace(/\s+/g, " ");
  let running = false;

  function quoteRows() {
    return [...document.querySelectorAll("table tbody tr")]
      .map(tr => [...tr.querySelectorAll("td")].map(txt))
      .filter(cols => cols.length >= 9);
  }
  const signature = () => JSON.stringify(quoteRows());
  const buttons = () => [...document.querySelectorAll("button")];

  function pager() {
    const last = buttons().find(b => txt(b) === "Última");
    if (!last) throw Error("No veo la paginación del monitor");
    let p = last.parentElement;
    while (p && ![...p.querySelectorAll("button")]
      .some(b => txt(b) === "Primera")) p = p.parentElement;
    if (!p) throw Error("No hay controles de paginación");
    return p;
  }
  function page() {
    const b = [...pager().querySelectorAll("button")]
      .find(b => b.classList.contains("active") && /^\d+$/.test(txt(b)));
    return b ? Number(txt(b)) : null;
  }
  function pageButton(label) {
    return [...pager().querySelectorAll("button")]
      .find(b => txt(b) === String(label));
  }
  async function waitFor(condition, label) {
    const t = Date.now();
    while (Date.now() - t < WAIT_MS) {
      await sleep(230);
      if (condition()) { await sleep(350); return; }
    }
    throw Error("No se confirmó el cambio: " + label);
  }

  async function collectCategory(category, count) {
    const tab = buttons().find(b => txt(b).toUpperCase() === category.toUpperCase());
    if (!tab) throw Error("Pestaña inexistente: " + category);
    const beforeTab = signature();
    tab.click();
    // Si ya estaba seleccionada, la tabla no tiene por qué cambiar.
    if (signature() === beforeTab) {
      try { await waitFor(() => signature() !== beforeTab, category); }
      catch (_) { console.warn("Comprobaré la categoría por su catálogo:", category); }
    }
    if (page() !== 1) {
      const first = pageButton("Primera");
      if (!first) throw Error("No encuentro Primera en " + category);
      const before = signature();
      first.click();
      await waitFor(() => page() === 1 && signature() !== before, category + " primera");
    }
    const found = new Map();
    const signatures = new Set();
    for (let iteration = 0; iteration < 30; iteration++) {
      const p = page();
      if (p === null) throw Error("No puedo leer la página activa de " + category);
      const current = quoteRows();
      const sig = signature();
      if (!current.length || signatures.has(sig))
        throw Error("Tabla vacía o repetida en " + category + ", página " + p);
      signatures.add(sig);
      for (const row of current) {
        const symbol = String(row[2]).replace(/\*/g, "").trim().toUpperCase();
        if (!symbol) continue;
        if (found.has(symbol)) throw Error("Emisora duplicada en " + category + ": " + symbol);
        found.set(symbol, {
          category, symbol, last: row[3], variation: row[4],
          bid_volume: row[5], bid: row[6],
          ask_volume: row[7], ask: row[8]
        });
      }
      console.log(category, "página", p, "instrumentos", found.size, "/", count);
      if (found.size === count) return [...found.values()];
      if (found.size > count) throw Error("La tabla no coincide con " + category);
      const next = pageButton(p + 1);
      if (!next || next.disabled)
        throw Error("Faltan instrumentos en " + category + ": " + found.size + "/" + count);
      const before = signature();
      next.click();
      await waitFor(() => page() === p + 1 && signature() !== before, category + " página " + (p + 1));
    }
    throw Error("Se alcanzó el máximo de páginas de " + category);
  }

  function githubDispatch(payload, token) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: "https://api.github.com/repos/" + OWNER + "/" + REPO +
             "/actions/workflows/" + WORKFLOW + "/dispatches",
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json"
        },
        data: JSON.stringify({ref: "main", inputs: {payload}}),
        timeout: 20000,
        onload: resp => resp.status === 204 ? resolve() :
          reject(Error("GitHub API " + resp.status + ": " + String(resp.responseText).slice(0, 180))),
        ontimeout: () => reject(Error("GitHub no respondió")),
        onerror: () => reject(Error("Error de conexión a GitHub"))
      });
    });
  }

  async function run() {
    if (running) return;
    if (!buttons().some(b => txt(b).toUpperCase() === "ETFS")) {
      console.warn("Abre Actinver → Monitores para sincronizar");
      return;
    }
    const token = GM_getValue("github_actions_token", "");
    if (!token) {
      alert("Primero configura el token de GitHub desde el menú de Tampermonkey.");
      return;
    }
    running = true;
    try {
      const rows = [];
      for (const [category, count] of EXPECTED)
        rows.push(...await collectCategory(category, count));
      if (rows.length !== 226) throw Error("Catálogo incompleto");
      const payload = JSON.stringify({
        captured_at: new Date().toISOString(), rows
      });
      if (payload.length > 62000) throw Error("Datos demasiado extensos");
      await githubDispatch(payload, token);
      GM_setValue("last_sync", Date.now());
      console.log("✅ Sincronización solicitada: 145 acciones, 56 ETFs, 25 fondos.");
      console.log("Revisa GitHub Actions → Receive Actinver quotes from Brave.");
    } catch (err) {
      console.error("❌ NO se sincronizaron cotizaciones:", err);
      alert("Sincronización detenida: " + err.message + ". No se subieron datos incompletos.");
    } finally { running = false; }
  }

  GM_registerMenuCommand("Configurar token de GitHub (solo Actions)", () => {
    const value = prompt("Token fine-grained para investmentChecker con permiso Actions: Read and write. No uses tu contraseña de GitHub.");
    if (value?.trim()) GM_setValue("github_actions_token", value.trim());
  });
  GM_registerMenuCommand("Sincronizar las 226 cotizaciones ahora", run);
  GM_registerMenuCommand("Activar/desactivar sincronización cada 30 minutos", () => {
    const enabled = !GM_getValue("automatic_sync", false);
    GM_setValue("automatic_sync", enabled);
    alert(enabled ? "Sincronización automática ACTIVADA mientras el monitor esté abierto." :
       "Sincronización automática DESACTIVADA.");
  });
  setInterval(() => {
    if (!GM_getValue("automatic_sync", false) || running) return;
    if (!buttons().some(b => txt(b).toUpperCase() === "ETFS")) return;
    if (Date.now() - GM_getValue("last_sync", 0) < 30 * 60 * 1000) return;
    const active = document.activeElement;
    if (document.visibilityState !== "visible" ||
        (active && ["INPUT", "TEXTAREA"].includes(active.tagName) && active.value)) return;
    run();
  }, 60000);
})();
