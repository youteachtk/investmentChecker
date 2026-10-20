(async()=>{
  'use strict';
  if(globalThis.__investmentCheckerBusy)return;
  globalThis.__investmentCheckerBusy=true;
  // Verified catalog by CATEGORY. Never require one particular first ticker
  // (e.g. AAXJ) or depend on the table's alphabetical order.
  const CATALOG={"ACCIONES":["AA1","AAL","AAPL","ABBV","ABNB","AC","ACTINVR B","AFRM","AGNC","ALPEK A","ALSEA","AMAT","AMD","AMX B","AMZN","ASUR B","AVGO","AXP","B N","BA","BABA N","BAC","BBAJIO O","BIMBO A","BMY","BOLSA A","BRKB","BYND","C","CAT","CCL1 N","CEMEX CPO","CHDRAUI B","CLF","COST","CRM","CSCO","CUERVO","CVS","CVX","DAL","DIS","DVN","ETSY","F","FANG","FCX","FDX","FEMSA UBD","FIBRAMQ 12","FIBRAPL 14","FSLR","FUBO","FUNO 11","GAP B","GCARSO A1","GCC","GE","GENTERA","GFINBUR O","GFNORTE O","GM","GME","GMEXICO B","GOOGL","GRUMA B","HD","INTC","JNJ","JPM","KIMBER A","KO","KOF UBL","LAB B","LASITE B-1","LCID","LIVEPOL C-1","LLY","LUV","LVS","MA","MARA","MCD","MEGA CPO","MELI N","META","MFRISCO A-1","MRK","MRNA","MSFT","MU","NCLH N","NFLX","NKE","NU N","NVAX","NVDA","OMA B","ORBIA","ORCL","OXY1","PE&OLES","PEP","PFE","PG","PINFRA","PINS","PLTR","PYPL","Q","QCOM","R A","RCL","RIOT","RIVN","ROKU","SBUX","SHOP N","SIGMAF A","SITES1 A-1","SOFI","SPCE","T","TGT","TLEVISA CPO","TMO","TSLA","TSM N","TWLO","TX","UAL","UBER","UNH","UPST","V","VESTA","VOLAR A","VZ","WALMEX","WFC","WMT","WYNN","XOM","XYZ","ZM"],"ETFs":["AAXJ","ACWI","ANGELD 10","BIL","BOTZ","DIA","DIABLOI 10","EEM","EWZ","FAS","FAZ","GDX","GLD","IAU","ICLN","INDA","IVV","KWEB","LIT","MCHI","NAFTRAC ISHRS","PSQ","QCLN","QLD","QQQ","SHV","SHY","SLV","SOXL","SOXS","SOXX","SPXL","SPXS","SPY","SPYM","SQQQ","TAN","TECL","TECS","TLT","TNA","TQQQ","TZA","USO","VEA","VGT","VNQ","VOO","VT","VTI","VWO","VYM","XLE","XLF","XLK","XLV"],"FONDOS":["ACTDUAL","ACTI500","ACTIAI","ACTICOB","ACTICRE","ACTIG+","ACTIG+2","ACTIGOB","ACTIMED","ACTIPLU","ACTIREN","ACTIRVT","ACTIVAR","ALTERN","DINAMO","ESCALA","ESFERA","JPMRVUS","MAXIMO","MAYA","OPORT1","PROTEGE","ROBOTIK","SALUD","TEMATIK"]};
  const EXPECTED=['ACCIONES','ETFs','FONDOS'];
  const SETS=Object.fromEntries(EXPECTED.map(k=>[k,new Set(CATALOG[k])]));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const text=e=>(e?.innerText||'').trim().replace(/\s+/g,' ');
  const buttons=()=>[...document.querySelectorAll('button')];
  const symbol=r=>(r?.[2]||'').replace(/[\*?ⓘℹ]/g,'').trim().toUpperCase().replace(/\s+/g,' ');
  const rows=()=>[...document.querySelectorAll('table tbody tr')]
    .filter(tr=>tr.getClientRects().length>0)
    .map(tr=>[...tr.querySelectorAll('td')].map(text))
    .filter(r=>r.length>=9);
  const signature=()=>JSON.stringify(rows());
  const firstSymbol=()=>symbol(rows()[0]);
  const categoryMatches=category=>{
    const data=rows();
    if(!data.length)return false;
    const syms=data.map(symbol);
    return syms.every(x=>x && SETS[category].has(x)) &&
      new Set(syms).size===syms.length;
  };
  const progress=async s=>{
    console.log('[investmentChecker]',s);
    await chrome.runtime.sendMessage({type:'PROGRESS',status:s});
  };
  // React category tab and rows may become inconsistent for seconds.
  // A retry toggles to another category and back, rather than clicking
  // an already-selected tab that Actinver may ignore.
  const findTab=name=>buttons().find(b=>text(b).toUpperCase()===name.toUpperCase());
  const switchCategory=async (name,retry=false)=>{
    const tab=findTab(name);
    if(!tab)throw Error('No se encontró la pestaña '+name+' en Monitores');
    if(retry){
      const other=EXPECTED.find(x=>x!==name && findTab(x));
      if(other){
        findTab(other).click();
        await sleep(750);
      }
    }
    tab.click();
  };
  const wait=async (test,why,{timeoutMs=45000,onDelay=null}={})=>{
    const start=Date.now(),stop=start+timeoutMs;
    let stable=0,attempt=0;
    const retryAt=[9000,22000,38500];
    while(Date.now()<stop){
      await sleep(260);
      try{
        if(test()){
          stable++;
          if(stable>=3)return;
        }else stable=0;
      }catch(_){stable=0;}
      if(onDelay && attempt<retryAt.length && Date.now()-start>=retryAt[attempt]){
        attempt++;
        await progress('Actinver aún no presenta '+why+'. Corrigiendo la pestaña automáticamente ('+attempt+')…');
        await onDelay();
      }
    }
    throw Error('Actinver no actualizó '+why+'. Tabla visible: '+(firstSymbol()||'vacía')+'.');
  };
  const pager=()=>{
    const last=buttons().find(b=>text(b)==='Última');
    if(!last)throw Error('No encuentro el botón Última de la paginación');
    let el=last.parentElement;
    while(el && ![...el.querySelectorAll('button')].some(b=>text(b)==='Primera'))el=el.parentElement;
    if(!el)throw Error('No encuentro la paginación de Monitores');
    return el;
  };
  const page=()=>{
    const current=[...pager().querySelectorAll('button')].find(b=>
      /^\d+$/.test(text(b)) &&
      (b.classList.contains('active') ||
        b.parentElement?.classList.contains('active') ||
        b.getAttribute('aria-current')==='page' ||
        b.getAttribute('aria-selected')==='true'));
    return current?Number(text(current)):null;
  };
  const pageButton=label=>[...pager().querySelectorAll('button')].find(b=>text(b)===String(label));
  try{
    const search=document.querySelector('input[placeholder*="Buscar"],input[placeholder*="Search"]');
    if(search?.value?.trim())throw Error('Hay un filtro Buscar activo en Monitores; no capturo listas filtradas.');
    for(const category of EXPECTED)if(!findTab(category))throw Error('No se encontró '+category+' en Monitores.');
    const all=[];
    for(const category of EXPECTED){
      const count=CATALOG[category].length;
      await progress('Abriendo '+category+'; verificando su catálogo, sin depender de la primera emisora…');
      await switchCategory(category);
      await wait(()=>categoryMatches(category),category,{timeoutMs:60000,
        onDelay:()=>switchCategory(category,true)});
      let current=page();
      if(current!==1){
        const first=pageButton('Primera');
        if(!first)throw Error('No encuentro Primera en '+category);
        first.click();
        await wait(()=>page()===1 && categoryMatches(category),'página inicial '+category,{timeoutMs:45000});
      }
      // Recheck the whole page, not a single ticker or selected tab color.
      if(!categoryMatches(category))throw Error('La tabla no pertenece a '+category);
      const known=new Set(), visited=new Set();
      for(let n=0;n<25;n++){
        current=page();
        if(!Number.isInteger(current))throw Error('Página sin identificar en '+category);
        const data=rows();
        if(!data.length || !categoryMatches(category))throw Error('Filas de categoría equivocada en '+category);
        const sig=JSON.stringify(data.map(symbol));
        if(visited.has(sig))throw Error('Paginación repetida en '+category);
        visited.add(sig);
        for(const r of data){
          const s=symbol(r);
          if(!SETS[category].has(s) || known.has(s))
            throw Error('Emisora duplicada o ajena a '+category+': '+s);
          known.add(s);
          all.push({category,symbol:s,last:r[3],variation:r[4],
            bid_volume:r[5],bid:r[6],ask_volume:r[7],ask:r[8]});
        }
        await progress(category+' · página '+current+' · '+known.size+'/'+count+' capturados');
        if(known.size===count)break;
        if(known.size>count)throw Error('Demasiadas filas en '+category);
        const next=pageButton(current+1);
        if(!next || next.disabled){
          const missing=CATALOG[category].filter(s=>!known.has(s));
          throw Error('Faltan '+missing.length+' instrumentos en '+category+': '+missing.slice(0,8).join(', '));
        }
        const before=signature();
        next.click();
        await wait(()=>page()===current+1 && signature()!==before &&
          categoryMatches(category),category+' página '+(current+1),{timeoutMs:45000});
      }
      if(known.size!==count){
        const missing=CATALOG[category].filter(s=>!known.has(s));
        throw Error('Captura incompleta '+category+': faltan '+missing.join(', '));
      }
    }
    if(all.length!==226)throw Error('Se recibieron '+all.length+' de 226 instrumentos');
    const payload={captured_at:new Date().toISOString(),rows:all};
    const reply=await chrome.runtime.sendMessage({type:'COLLECT_DONE',payload});
    if(!reply?.ok)throw Error(reply?.error||'No se pudo enviar a GitHub');
  }catch(err){
    console.error('[investmentChecker]',err);
    await chrome.runtime.sendMessage({type:'COLLECT_FAILED',reason:err.message});
  }finally{globalThis.__investmentCheckerBusy=false;}
})();
