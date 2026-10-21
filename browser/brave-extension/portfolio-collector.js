// InvestmentChecker 2.1.0 — read-only portfolio collector.
// Only recognized summary fields and holdings columns leave this content script.
// Never capture credentials, account numbers, cookies, raw HTML, or order history.
(async () => {
  'use strict';
  if (globalThis.__icPortfolioBusy) return;
  globalThis.__icPortfolioBusy = true;
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
  const canon = s => norm(s).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const visible = e => !!(e && e.getClientRects().length);
  const money = s => {
    const txt=norm(s);
    const m = txt.match(/[-+]?\s*\$\s*[\d,]+(?:\.\d{1,2})?/);
    return m ? Number(m[0].replace(/[^\d.-]/g, '')) : null;
  };
  const amount = s => {
    const v = norm(s).replace(/[$,%\s]/g, '').replace(/,/g, '');
    return /^[-+]?\d+(?:\.\d+)?$/.test(v) ? Number(v) : null;
  };
  function summary() {
    const labels = {
      total_value: 'Valuación total',
      investments: 'Inversiones',
      buying_power: 'Poder de compra',
      unsettled: 'Por liquidar',
      change_mxn: 'Variación (MXN)'
    };
    const found = {};
    const leaves = [...document.querySelectorAll('span,div,p,small,strong,dt,label')].filter(
      e => visible(e) && norm(e.textContent).length < 60
    );
    for (const [key, label] of Object.entries(labels)) {
      const leaf = leaves.find(e => {
        const actual=canon(e.textContent);
        const target=canon(label);
        return actual===target || (actual.startsWith(target) && actual.length<=target.length+6);
      });
      if (!leaf) continue;
      let node = leaf;
      for (let i = 0; node && i < 4; i++, node = node.parentElement) {
        const t = norm(node.innerText);
        const p = t.toLowerCase().indexOf(label.toLowerCase());
        if (p < 0) continue;
        const tail = t.slice(p + label.length);
        const n = money(tail);
        if (n !== null && Number.isFinite(n)) {found[key] = n; break;}
      }
    }
    const percentLeaf = leaves.find(e => canon(e.textContent).startsWith('variacion (%)') &&
      canon(e.textContent).length<=18);
    if (percentLeaf) {
      let node = percentLeaf;
      for (let i = 0; node && i < 4; i++, node = node.parentElement) {
        const t = norm(node.innerText);
        const m = t.match(/Variaci[oó]n\s*\(%\)[^\d+-]*([-+]?\s*\d+(?:\.\d+)?)\s*%/i);
        if (m) {found.change_pct = Number(m[1].replace(/\s/g, '')); break;}
      }
    }
    // Fail closed: a portfolio summary must have all three main figures.
    if (['total_value','investments','buying_power'].every(k => Number.isFinite(found[k])) &&
        found.total_value >= 0 && found.buying_power >= 0 && found.investments >= 0 &&
        Math.abs(found.total_value - found.investments - found.buying_power - (found.unsettled || 0)) < Math.max(100, found.total_value * 0.02))
      return found;
    return null;
  }

  function holdings() {
    const out = [];
    for (const table of document.querySelectorAll('table,[role="table"]')) {
      if (!visible(table)) continue;
      const head = [...table.querySelectorAll('thead th,[role="columnheader"]')].map(e => canon(e.innerText));
      const sym = head.findIndex(h => /emisora|simbolo|instrumento|accion|ticker|fondo|serie/.test(h));
      const qty = head.findIndex(h => /titulos|cantidad|posicion|unidades|participaciones|numero de/.test(h));
      if (sym < 0 || qty < 0 || head.some(h => /volumen de compra|volumen de venta|postura de compra|postura de venta/.test(h))) continue;
      const cost = head.findIndex(h => /costo promedio|precio promedio|precio de compra/.test(h));
      const val = head.findIndex(h => /valor actual|valor de mercado|valuacion|importe actual/.test(h));
      const price = head.findIndex(h => /ultimo precio|precio actual|cotizacion/.test(h));
      const records = [...table.querySelectorAll('tbody tr,[role="rowgroup"] [role="row"]')];
      for (const tr of records) {
        if (!visible(tr)) continue;
        const cols = [...tr.querySelectorAll('td,[role="cell"]')].map(e => norm(e.innerText));
        if (cols.length <= Math.max(sym,qty)) continue;
        const symbol = cols[sym].toUpperCase().replace(/[ⓘℹ*]/g,'').trim().slice(0,48);
        const quantity = amount(cols[qty]);
        if (!/^[A-Z0-9 .&+/-]{1,48}$/.test(symbol) || quantity === null || quantity <= 0) continue;
        const entry = {symbol,quantity};
        if (cost >= 0 && Number.isFinite(money(cols[cost]))) entry.cost_mxn = money(cols[cost]);
        if (val >= 0 && Number.isFinite(money(cols[val]))) entry.value_mxn = money(cols[val]);
        if (price >= 0 && Number.isFinite(money(cols[price]))) entry.price_mxn = money(cols[price]);
        out.push(entry);
      }
      if (out.length) break;
    }
    return out.length && out.length <= 100 ? out : null;
  }
  try {
    // Angular can finish loading its shell before the account values.
    // Read again briefly, but never click trading controls or collect raw HTML.
    let foundSummary=null,foundHoldings=null;
    for(let attempt=0;attempt<24;attempt++){
      foundSummary=foundSummary||summary();
      foundHoldings=foundHoldings||holdings();
      if(foundSummary && foundHoldings)break;
      if(attempt<23)await new Promise(r=>setTimeout(r,500));
    }
    const result={captured_at:new Date().toISOString(),
      summary:foundSummary,holdings:foundHoldings};
    const ack=await chrome.runtime.sendMessage({type:'PRIVATE_CAPTURE',
      payload:result,diagnostic:{
        summary_detected:!!foundSummary,
        summary_fields:foundSummary?Object.keys(foundSummary).length:0,
        holdings_detected:!!foundHoldings,
        holding_count:foundHoldings?foundHoldings.length:0,
        visible_tables:[...document.querySelectorAll('table')]
          .filter(visible).length
      }});
    return {ok:!!ack?.ok,partial:!!ack?.partial,
      uploaded:!!ack?.uploaded,
      error:ack?.ok?null:(ack?.error||'Capture not accepted'),
      summary_detected:!!foundSummary,holdings_detected:!!foundHoldings};
  } catch (err) {
    console.warn('[investmentChecker private]',err.message);
    return {ok:false,error:'Private capture failed'};
  } finally {
    globalThis.__icPortfolioBusy = false;
  }
})();
