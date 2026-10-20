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
  const capturedStart = Date.now();
  const stage = {phase:'BOOT',category_index:null,page_index:null,retries:0};
  function diagnostic(error) {
    // Deliberately excludes symbols, page contents, account information, URL,
    // credentials and raw exception text.
    const reason=String(error?.message||'');
    let code='UNCLASSIFIED';
    if (/barra|pestaña|tab/i.test(reason))code='CATEGORY_STATE';
    if (/paginaci[oó]n|p[aá]gina/i.test(reason))code='PAGE_STATE';
    if (/duplicad|repetid/i.test(reason))code='ROWS_DUPLICATE';
    if (/actualiz|esperando|entreg/i.test(reason))code='DOM_TRANSITION_TIMEOUT';
    if (/incompleta|cantidad|captura/i.test(reason))code='PARTIAL_CAPTURE';
    let currentTab=-1,totalTabs=null,pagesCount=null,visibleRows=null,activePage=null;
    try { currentTab=selectedTabIndex(); } catch(_){}
    try { totalTabs=tabButtons().length; } catch(_){}
    try { pagesCount=pageButtons().length;activePage=pageNumber(); } catch(_){}
    try { visibleRows=rows().length; } catch(_){}
    return {schema_version:1,code,phase:stage.phase,
      category_index:stage.category_index,page_index:stage.page_index,
      retries:stage.retries,selected_tab_index:currentTab,tab_count:totalTabs,
      visible_rows:visibleRows,numeric_page_buttons:pagesCount,active_page:activePage,
      elapsed_seconds:Math.min(600,Math.round((Date.now()-capturedStart)/1000)),
      captured_at:new Date().toISOString()};
  }
  const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
  const visible = e => !!(e && e.getClientRects().length);
  const text = e => (e?.innerText || '').trim().replace(/\s+/g,' ');
  const buttons = () => [...document.querySelectorAll('button')].filter(visible);
  const rows = () => [...document.querySelectorAll('table tbody tr')].filter(visible)
    .map(tr => [...tr.querySelectorAll('td')].map(text))
    .filter(cells => cells.length >= 9);
  const symbol = r => (r?.[2] || '').replace(/[\*?ⓘℹ]/g,'').trim().toUpperCase().replace(/\s+/g,' ');
  // Row identity is only a fingerprint for DOM changes, never a list of known names.
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

    // Some layouts wrap each tab in a separate column. In that case, use
    // physical alignment and width, still without reading ANY tab label.
    const rects=all.map(el=>({el,r:el.getBoundingClientRect?.()}))
      .filter(item=>item.r && item.r.width>=70 && item.r.height>0 &&
        item.r.top>=0 && item.r.bottom<tableTop);
    const visual=[];
    for (let i=0;i<rects.length;i++) {
      const row=rects.filter(v=>Math.abs(v.r.top-rects[i].r.top)<20)
        .sort((a,b)=>a.r.left-b.r.left);
      if (row.length!==3)continue;
      if (row[0].r.right>row[1].r.left+6 ||
          row[1].r.right>row[2].r.left+6)continue;
      const rightmost=Math.max(...row.map(v=>v.r.bottom));
      visual.push({distance:tableTop-rightmost,group:row.map(v=>v.el)});
    }
    visual.sort((a,b)=>a.distance-b.distance);
    if (visual[0])return visual[0].group;
    throw Error('No se encontró una barra con tres pestañas por su disposición visual');
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
        stage.retries++;
        await progress('Esperando que cambie la tabla de '+why+'; reintento '+nextRetry);
        await retry();
        consecutive=0;
      }
    }
    throw Error('Actinver no actualizó la tabla de '+why+'; no se enviaron datos incompletos');
  }
  const isSelected = e =>
    e?.classList?.contains('active') ||
    e?.parentElement?.classList?.contains('active') ||
    e?.getAttribute?.('aria-selected')==='true' ||
    e?.getAttribute?.('data-state')==='active';
  function selectedTabIndex(){
    const tabs=tabButtons();
    const marked=tabs.map(isSelected);
    if(marked.filter(Boolean).length===1)return marked.indexOf(true);
    if(typeof getComputedStyle==='function'){
      const colors=tabs.map(e=>getComputedStyle(e).backgroundColor);
      for(let i=0;i<colors.length;i++){
        if(colors.filter(x=>x===colors[i]).length===1 &&
          colors.filter(x=>x===colors[(i+1)%3]).length===2)return i;
      }
    }
    return -1;
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
      stage.category_index=i;stage.page_index=null;stage.phase='CATEGORY_NAV';
      await progress('Leyendo pestaña '+(i+1)+' de '+GROUPS.length+'; esperando actualización de tabla');
      const before=identity();
      const selectedBefore=selectedTabIndex();
      await clickCategory(i);
      // On an already-selected tab the row identity may be unchanged.
      // On an OTHER tab, a visible state change AND a row-key change are
      // necessary; a live price tick cannot fool that second condition.
      if (selectedBefore===i) {
        await awaitRows('pestaña '+(i+1),() => distinct(signature()),45000);
      } else if (i===0 && selectedBefore===-1) {
        // Unknown initial tab state: do not prematurely accept stale rows.
        await sleep(2000);
        if (identity()===before) {
          await clickCategory(2);
          await awaitRows('preparación de pestañas',() =>
            distinct(signature()) && identity()!==before,60000,()=>retryCategory(2));
          const reset=identity();
          await clickCategory(0);
          await awaitRows('pestaña inicial',() =>
            distinct(signature()) && identity()!==reset,60000,()=>retryCategory(0));
        } else {
          await awaitRows('pestaña inicial',() =>
            distinct(signature()) && identity()!==before,45000);
        }
      } else {
        await awaitRows('pestaña '+(i+1),() => distinct(signature()) &&
          identity()!==before && (selectedTabIndex()===-1 ||
          selectedTabIndex()===i),60000,()=>retryCategory(i));
      }

      stage.phase='FIRST_PAGE';stage.page_index=1;
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
        stage.phase='READ_PAGE';stage.page_index=currentPage;
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
        stage.phase='NEXT_PAGE';
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

    stage.phase='VALIDATION';
    if (all.length!==226) throw Error('Captura incompleta: '+all.length+'/226');
    const payload={captured_at:new Date().toISOString(),rows:all};
    const reply=await chrome.runtime.sendMessage({type:'COLLECT_DONE',payload});
    if (!reply?.ok) throw Error(reply?.error||'GitHub no aceptó la captura');
  } catch (err) {
    console.error('[investmentChecker]',err);
    await chrome.runtime.sendMessage({type:'COLLECT_FAILED',reason:err.message,
      diagnostic:diagnostic(err)});
  } finally {
    globalThis.__investmentCheckerBusy=false;
  }
})();