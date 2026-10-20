(async () => {
  'use strict';
  if (globalThis.__investmentCheckerBusy) return;
  globalThis.__investmentCheckerBusy = true;

  // UI-state driven. The category is determined by TAB POSITION, not by
  // a ticker's name or a catalog of known symbols.
  const GROUPS = [
    {category:'ACCIONES', expected:145},
    {category:'ETFs', expected:56},
    {category:'FONDOS', expected:25}
  ];
  const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
  const visible = e => !!(e && e.getClientRects().length);
  const text = e => (e?.innerText || '').trim().replace(/\s+/g,' ');
  const buttons = () => [...document.querySelectorAll('button')].filter(visible);
  const rows = () => [...document.querySelectorAll('table tbody tr')].filter(visible)
    .map(tr => [...tr.querySelectorAll('td')].map(text))
    .filter(cells => cells.length >= 9);
  const symbol = r => (r?.[2] || '').replace(/[\*?ⓘℹ]/g,'').trim().toUpperCase().replace(/\s+/g,' ');
  // Use row identity fingerprints ONLY to detect DOM updates. No comparison
  // to AA1, AAXJ, ACTDUAL or any other known symbol.
  const identity = () => JSON.stringify(rows().map(symbol));
  const signature = () => rows().map(symbol);
  const distinct = r => r.length > 0 && r.every(Boolean) && new Set(r).size === r.length;
  const progress = async s => {
    console.log('[investmentChecker]',s);
    await chrome.runtime.sendMessage({type:'PROGRESS',status:s});
  };

  function tabButtons() {
    const semantic = [...document.querySelectorAll('[role="tablist"]')].filter(visible)
      .map(group => [...group.querySelectorAll('[role="tab"]')].filter(visible))
      .find(group => group.length === GROUPS.length);
    if (semantic) return semantic;
    const roleTabs = [...document.querySelectorAll('[role="tab"]')].filter(visible);
    if (roleTabs.length === GROUPS.length) return roleTabs;

    // React/Bootstrap uses three wide sibling <button> elements for the
    // market categories; locate that bar by STRUCTURE and screen position.
    const all = buttons();
    const containers = new Map();
    for (const btn of all) {
      const parent = btn.parentElement;
      if (!parent) continue;
      if (!containers.has(parent)) containers.set(parent,[]);
      containers.get(parent).push(btn);
    }
    const table = [...document.querySelectorAll('table')].find(visible);
    const tableTop = table?.getBoundingClientRect?.().top ?? Infinity;
    const candidates = [...containers.values()].filter(group => group.length === 3)
      .filter(group => group.every(b => {
        const r=b.getBoundingClientRect?.();
        return r && r.width >= 70 && r.height > 0 && r.top < tableTop;
      }))
      .filter(group => {
        const r=group.map(b=>b.getBoundingClientRect());
        return Math.max(...r.map(v=>v.top))-Math.min(...r.map(v=>v.top)) < 24 &&
          r[0].left <= r[1].left && r[1].left <= r[2].left;
      });
    candidates.sort((a,b) => {
      const ra=a.map(x=>x.getBoundingClientRect()),rb=b.map(x=>x.getBoundingClientRect());
      const da=tableTop-Math.max(...ra.map(x=>x.bottom));
      const db=tableTop-Math.max(...rb.map(x=>x.bottom));
      return da-db;
    });
    if (candidates[0]) return candidates[0];
    throw Error('No se encontró una barra con tres pestañas de mercado');
  }

  function pageButtons() {
    const numeric = buttons().filter(b => /^\d+$/.test(text(b)));
    if (!numeric.length) throw Error('La paginación numérica no está disponible');
    return numeric;
  }
  const pageButton = n => pageButtons().find(b => text(b) === String(n));
  function pageNumber() {
    const current = pageButtons().find(b => {
      const klass = b.classList;
      const parentKlass = b.parentElement?.classList;
      return klass?.contains('active') || parentKlass?.contains('active') ||
        b.getAttribute?.('aria-current') === 'page' ||
        b.getAttribute?.('aria-selected') === 'true' ||
        b.getAttribute?.('data-state') === 'active';
    });
    return current ? Number(text(current)) : null;
  }
  async function awaitRows(why, isReady, maxMs=45000, retry=null) {
    const started=Date.now(),milestones=[9000,22000,38000],end=started+maxMs;
    let consecutive=0,nextRetry=0;
    while (Date.now()<end) {
      await sleep(300);
      if (isReady()) {
        consecutive++;
        if (consecutive>=4) return;
      } else consecutive=0;
      if (retry && nextRetry<milestones.length && Date.now()-started>=milestones[nextRetry]) {
        nextRetry++;
        await progress('Esperando que cambie la tabla de '+why+'; reintento '+nextRetry);
        await retry();
        consecutive=0;
      }
    }
    throw Error('Actinver no actualizó la tabla de '+why+'; no se enviaron datos incompletos');
  }
  async function clickCategory(index) {
    const tabs=tabButtons();
    if (!tabs[index]) throw Error('Falta la pestaña en posición '+(index+1));
    tabs[index].click();
  }
  async function retryCategory(index) {
    // Clicking an already selected React tab may do nothing; briefly select
    // another tab first, then return, without relying on any label text.
    const alternative = (index+1) % GROUPS.length;
    await clickCategory(alternative);
    await sleep(1100);
    await clickCategory(index);
  }

  try {
    const search = document.querySelector('input[placeholder*="Buscar"],input[placeholder*="Search"]');
    if (search?.value?.trim()) throw Error('Hay un filtro de búsqueda activo; no se sincroniza una lista parcial');
    if (tabButtons().length !== GROUPS.length) throw Error('Faltan pestañas de mercado');

    const all=[];
    const seenGlobal = new Set();
    for (let i=0;i<GROUPS.length;i++) {
      const {category,expected}=GROUPS[i];
      await progress('Leyendo pestaña '+(i+1)+' de '+GROUPS.length+'; esperando actualización de tabla');
      const before=identity();
      await clickCategory(i);
      if (i === 0) {
        // The existing Monitores route initially displays the first tab.
        // The backend will also verify every instrument's category.
        await awaitRows('pestaña 1',() => distinct(signature()),45000);
      } else {
        await awaitRows('pestaña '+(i+1),() => distinct(signature()) &&
          identity() !== before,60000,()=>retryCategory(i));
      }

      const toFirst=pageButton(1);
      if (!toFirst) throw Error('No se encuentra la primera página');
      const prior=identity();
      const priorPage=pageNumber();
      toFirst.click();
      await awaitRows('primera página '+(i+1),() => distinct(signature()) &&
        (priorPage===1 || (pageNumber()===1 && identity()!==prior)),45000);

      const visited=new Set();
      const categorySeen=new Set();
      let currentPage=1;
      for (let step=0;step<30;step++) {
        const keys=signature();
        if (!distinct(keys)) throw Error('Filas vacías o duplicadas en pestaña '+(i+1));
        const fingerprint=JSON.stringify(keys);
        if (visited.has(fingerprint)) throw Error('React repitió una página; se detuvo la sincronización');
        visited.add(fingerprint);
        const data=rows();
        for (const row of data) {
          const ticker=symbol(row);
          if (categorySeen.has(ticker) || seenGlobal.has(ticker))
            throw Error('Instrumento duplicado entre páginas o categorías');
          categorySeen.add(ticker);
          seenGlobal.add(ticker);
          all.push({category,symbol:ticker,last:row[3],variation:row[4],
            bid_volume:row[5],bid:row[6],ask_volume:row[7],ask:row[8]});
        }
        await progress('Pestaña '+(i+1)+' · página '+currentPage+
          ' · '+categorySeen.size+'/'+expected);
        if (categorySeen.size >= expected) break;
        const next=pageButton(currentPage+1);
        if (!next || next.disabled)
          throw Error('No hay siguiente página de la pestaña '+(i+1));
        next.click();
        const previous=fingerprint;
        const expectedPage=currentPage+1;
        await awaitRows('página '+expectedPage,() => distinct(signature()) &&
          identity()!==previous && (pageNumber()===null || pageNumber()===expectedPage),45000);
        currentPage=expectedPage;
      }
      if (categorySeen.size!==expected)
        throw Error('Cantidad incorrecta en pestaña '+(i+1)+
          ': '+categorySeen.size+'/'+expected+'; no se publica');
    }

    if (all.length!==226) throw Error('Captura incompleta: '+all.length+'/226');
    const payload={captured_at:new Date().toISOString(),rows:all};
    const reply=await chrome.runtime.sendMessage({type:'COLLECT_DONE',payload});
    if (!reply?.ok) throw Error(reply?.error||'GitHub no aceptó la captura');
  } catch (err) {
    console.error('[investmentChecker]',err);
    await chrome.runtime.sendMessage({type:'COLLECT_FAILED',reason:err.message});
  } finally {
    globalThis.__investmentCheckerBusy=false;
  }
})();