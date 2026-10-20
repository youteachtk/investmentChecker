(async () => {
  'use strict';
  if (globalThis.__investmentCheckerBusy) return;
  globalThis.__investmentCheckerBusy=true;
  // Actinver #/capitales, actual Angular Material DOM confirmed 20 Oct 2026.
  // No fixed ticker is used to identify categories or pages.
  const GROUPS=[{category:'ACCIONES',expected:145},
    {category:'ETFs',expected:56},{category:'FONDOS',expected:25}];
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const text=e=>(e?.innerText||e?.textContent||'').replace(/\s+/g,' ').trim();
  const visible=e=>!!(e&&e.getClientRects().length);
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .trim().toLowerCase().replace(/\s+/g,' ');
  const phase={name:'START',tab:null,page:null,retries:0};
  const started=Date.now();
  const progress=async message=>{
    console.log('[investmentChecker]',message);
    await chrome.runtime.sendMessage({type:'PROGRESS',status:message});
  };
  function root(){
    const el=document.querySelector('app-capitales');
    if(!el)throw Error('No se encontró el componente app-capitales');
    return el;
  }
  function tabs(){
    // Angular marks div.acciones/etfs/fondos.tab-btn ACTIVE, not their buttons.
    const found=[...root().querySelectorAll('div.tab-btn')]
      .filter(visible).filter(e=>!!e.querySelector('button'));
    if(found.length!==3)throw Error('Se esperaban 3 contenedores tab-btn; se encontraron '+found.length);
    return found;
  }
  function selectedIndex(){
    const marked=tabs().map(t=>t.classList.contains('active'));
    return marked.filter(Boolean).length===1?marked.indexOf(true):-1;
  }
  function switchTo(i){
    const node=tabs()[i],button=node?.querySelector('button');
    if(!button||button.disabled)throw Error('Pestaña '+(i+1)+' no disponible');
    button.click();  // read-only category navigation
  }
  function table(){
    const tables=[...root().querySelectorAll('app-tabla-material table.table-capitales')];
    const t=tables.find(visible);
    if(!t)throw Error('La tabla table-capitales no está disponible');
    return t;
  }
  function headings(){
    const th=[...table().querySelectorAll('thead th')];
    const normalized=th.map(e=>norm(text(e)));
    const lookup=(name)=>normalized.findIndex(h=>h===name);
    const fields={
      symbol:lookup('emisora'),
      last:lookup('precio'),
      variation:lookup('% variacion'),
      bid_volume:lookup('volumen compra'),
      bid:lookup('precio de compra'),
      ask_volume:lookup('volumen de venta'),
      ask:lookup('precio de venta')
    };
    if(Object.values(fields).some(i=>i<0) ||
       new Set(Object.values(fields)).size!==7)
      throw Error('Encabezados de tabla incompletos o inesperados');
    return fields;
  }
  function rows(){
    const trs=[...table().querySelectorAll('tbody tr')].filter(visible);
    const map=headings();
    return trs.map(tr=>{
      const cells=[...tr.querySelectorAll('td')].map(text);
      if(cells.length<9)return null;
      const sym=(cells[map.symbol]||'')
        .replace(/[\*?ⓘℹ]/g,'').trim().toUpperCase().replace(/\s+/g,' ');
      const obj={symbol:sym};
      for(const f of ['last','variation','bid_volume','bid','ask_volume','ask']){
        obj[f]=cells[map[f]]||'';
      }
      return obj;
    }).filter(Boolean);
  }
  const identities=()=>JSON.stringify(rows().map(x=>x.symbol));
  const validRows=r=>r.length>0 && r.length<=10 &&
    r.every(x=>x.symbol && x.last && x.bid && x.ask) &&
    new Set(r.map(x=>x.symbol)).size===r.length;

  function paginator(){
    const p=root().querySelector('app-paginator');
    if(!p||!visible(p))throw Error('No aparece app-paginator');
    return p;
  }
  function numericButtons(){
    return [...paginator().querySelectorAll('button')]
      .filter(visible).filter(b=>/^\d+$/.test(text(b)));
  }
  function currentPage(){
    const active=numericButtons().filter(b=>b.classList.contains('active'));
    return active.length===1?Number(text(active[0])):null;
  }
  function pageButton(n){
    return numericButtons().find(b=>Number(text(b))===n);
  }
  function firstButton(){
    return paginator().querySelector('button.btn-first-page');
  }
  function rightPageArrow(){
    // Capitales .btn-pages has six children: left arrow, four numbers,
    // right arrow. The numbered buttons alone cannot reach page 5+.
    const group=paginator().querySelector('.btn-pages');
    if(!group)return null;
    const buttons=[...group.querySelectorAll('button')].filter(visible);
    if(buttons.length<3)return null;
    const last=buttons[buttons.length-1];
    return /^\d+$/.test(text(last))?null:last;
  }
  async function moveToNextPage(current,fingerprint){
    const target=current+1;
    let next=pageButton(target);
    if(!next){
      const arrow=rightPageArrow();
      if(!arrow||arrow.disabled)
        throw Error('No se encontró el avance al bloque de páginas '+target);
      arrow.click(); // only paginator navigation
      await waitFor('bloque de paginación '+target,()=>!!pageButton(target)||
        (currentPage()===target&&identities()!==fingerprint),{ms:30000});
      if(currentPage()===target&&identities()!==fingerprint)return;
      next=pageButton(target);
    }
    if(!next||next.disabled)throw Error('Página '+target+' no disponible');
    next.click(); // only numeric page navigation
    await waitFor('página '+target,()=>currentPage()===target&&
      validRows(rows())&&identities()!==fingerprint);
  }
  async function waitFor(label,condition,{ms=40000,retry=null}={}){
    const start=Date.now();let consecutive=0,tries=0;
    const timeouts=[7500,18000,30000];
    while(Date.now()-start<ms){
      await sleep(300);
      let ok=false;
      try{ok=!!condition();}catch(_){}
      if(ok){if(++consecutive>=3)return;}else consecutive=0;
      if(retry && tries<timeouts.length &&
         Date.now()-start>timeouts[tries]){
        tries++;phase.retries++;
        await progress('Esperando '+label+'; recuperación '+tries);
        await retry();
        consecutive=0;
      }
    }
    throw Error('Tiempo agotado: '+label);
  }
  async function selectCategory(i,alreadyRead){
    phase.name='CATEGORY';phase.tab=i;phase.page=null;
    const before=identities(),was=selectedIndex();
    switchTo(i);
    if(was===i){
      await waitFor('tabla categoría '+(i+1),()=>selectedIndex()===i&&validRows(rows()));
      return;
    }
    const fn=()=>selectedIndex()===i&&validRows(rows())&&identities()!==before&&
      rows().every(r=>!alreadyRead.has(r.symbol));
    await waitFor('cambio a categoría '+(i+1),fn,{ms:45000,
      retry:async()=>{switchTo((i+1)%3);await sleep(700);switchTo(i);}});
  }
  async function goFirst(alreadyRead){
    phase.name='FIRST_PAGE';phase.page=1;
    const first=firstButton();
    if(!first)throw Error('Sin btn-first-page');
    if(!first.disabled){
      const before=identities();
      first.click();
      await waitFor('primera página',()=>currentPage()===1&&validRows(rows())&&
        identities()!==before&&rows().every(r=>!alreadyRead.has(r.symbol)));
    }else{
      await waitFor('primera página activa',()=>currentPage()===1&&validRows(rows())&&
        rows().every(r=>!alreadyRead.has(r.symbol)));
    }
  }
  function sanitizeDiagnostic(err){
    const msg=String(err?.message||'');
    let code='OTHER';
    if(msg.includes('tab-btn')||msg.includes('Pestaña'))code='TABS';
    else if(/p[aá]gina|paginator/i.test(msg))code='PAGINATION';
    else if(/encabezad|tabla/i.test(msg))code='TABLE';
    else if(/tiempo agotado/i.test(msg))code='TIMEOUT';
    const x={schema_version:1,code,phase:phase.name,
      category_index:phase.tab,page_index:phase.page,retries:phase.retries,
      elapsed_seconds:Math.min(600,Math.round((Date.now()-started)/1000)),
      captured_at:new Date().toISOString()};
    try{x.selected_tab_index=selectedIndex();x.tab_count=tabs().length;}catch(_){}
    try{x.visible_rows=rows().length;}catch(_){}
    try{x.numeric_page_buttons=numericButtons().length;x.active_page=currentPage();}catch(_){}
    return x;
  }
  try {
    if(!location.hash.includes('/capitales'))
      throw Error('Abre Actinver #/capitales');
    const search=root().querySelector('app-tabla-material input');
    if(search?.value?.trim())throw Error('Búsqueda activa; captura parcial');
    tabs();headings();
    const out=[],globalSeen=new Set();
    for(let i=0;i<GROUPS.length;i++){
      const {category,expected}=GROUPS[i];
      await progress('Capitales: pestaña '+(i+1)+' / 3');
      await selectCategory(i,globalSeen);
      await goFirst(globalSeen);
      const local=new Set(),visited=new Set();
      let page=1;
      for(let steps=0;steps<30;steps++){
        phase.name='READ_PAGE';phase.page=page;
        if(currentPage()!==page)throw Error('Página activa inesperada '+page);
        const data=rows();
        if(!validRows(data))throw Error('Filas incompletas en página '+page);
        const fingerprint=JSON.stringify(data.map(r=>r.symbol));
        if(visited.has(fingerprint))throw Error('Página repetida');
        visited.add(fingerprint);
        for(const r of data){
          if(local.has(r.symbol)||globalSeen.has(r.symbol))
            throw Error('Emisora duplicada');
          local.add(r.symbol);globalSeen.add(r.symbol);
          out.push({category,...r});
        }
        await progress('Capitales: '+category+' página '+page+
          ' · '+local.size+'/'+expected);
        if(local.size===expected)break;
        if(local.size>expected)throw Error('Más filas de las esperadas');
        phase.name='NEXT_PAGE';phase.page=page+1;
        await moveToNextPage(page,fingerprint);
        page++;
      }
      if(local.size!==expected)
        throw Error('Faltaron instrumentos de la categoría '+(i+1));
    }
    if(out.length!==226)throw Error('No se capturaron los 226');
    phase.name='UPLOAD';
    const payload={captured_at:new Date().toISOString(),rows:out};
    const res=await chrome.runtime.sendMessage({type:'COLLECT_DONE',payload});
    if(!res?.ok)throw Error(res?.error||'Envío público no confirmado');
  }catch(err){
    console.error('[investmentChecker]',err);
    await chrome.runtime.sendMessage({
      type:'COLLECT_FAILED',reason:err.message,diagnostic:sanitizeDiagnostic(err)
    });
  }finally{globalThis.__investmentCheckerBusy=false;}
})();