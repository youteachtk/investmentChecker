(async()=>{
  'use strict';
  if(globalThis.__investmentCheckerBusy) return;
  globalThis.__investmentCheckerBusy=true;
  const EXPECTED=[['ACCIONES',145,'AA1'],['ETFs',56,'AAXJ'],['FONDOS',25,'ACTDUAL']];
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const text=e=>(e?.innerText||'').trim().replace(/\s+/g,' ');
  const buttons=()=>[...document.querySelectorAll('button')];
  const rows=()=>[...document.querySelectorAll('table tbody tr')]
    .filter(tr=>tr.getClientRects().length>0)
    .map(tr=>[...tr.querySelectorAll('td')].map(text))
    .filter(r=>r.length>=9);
  const signature=()=>JSON.stringify(rows());
  const symbol=r=>(r?.[2]||'').replace(/\*/g,'').trim().toUpperCase();
  const progress=async s=>{console.log('[investmentChecker]',s);await chrome.runtime.sendMessage({type:'PROGRESS',status:s});};
  const wait=async (test,why)=>{
    const stop=Date.now()+14000;
    while(Date.now()<stop){await sleep(200);if(test()){await sleep(450);return;}}
    throw Error('Actinver no actualizó '+why+' (espera agotada)');
  };
  const findTab=name=>buttons().find(b=>text(b).toUpperCase()===name.toUpperCase());
  const pager=()=>{
    const last=buttons().find(b=>text(b)==='Última');
    if(!last) throw Error('No encuentro el botón Última de la paginación');
    let el=last.parentElement;
    while(el && ![...el.querySelectorAll('button')].some(b=>text(b)==='Primera')) el=el.parentElement;
    if(!el) throw Error('No encuentro los controles de paginación');
    return el;
  };
  const page=()=>{
    const current=[...pager().querySelectorAll('button')].find(b=>
      /^\d+$/.test(text(b)) &&
      (b.classList.contains('active') || b.getAttribute('aria-current')==='page' || b.getAttribute('aria-selected')==='true'));
    return current ? Number(text(current)) : null;
  };
  const pageButton=label=>[...pager().querySelectorAll('button')].find(b=>text(b)===String(label));
  const firstSymbol=()=>symbol(rows()[0]);
  const search=document.querySelector('input[placeholder*="Buscar"],input[placeholder*="Search"]');
  try {
    if(search?.value?.trim()) throw Error('Hay un filtro de búsqueda activo. Borra el texto de Buscar antes de sincronizar.');
    for(const [name] of EXPECTED){if(!findTab(name)) throw Error('Abre Actinver → Monitores. No veo '+name);}
    const all=[];
    for(const [category,count,first] of EXPECTED){
      const tab=findTab(category);
      const before=signature();
      tab.click();
      await wait(()=>firstSymbol()===first || (signature()!==before && rows().length>0),category+' (cambio de pestaña)');
      let current=page();
      if(current!==1){
        const toFirst=pageButton('Primera');
        if(!toFirst) throw Error('No encuentro Primera en '+category);
        const prior=signature();toFirst.click();
        await wait(()=>page()===1 && signature()!==prior,'primera página de '+category);
      }
      if(firstSymbol()!==first) throw Error('La pestaña '+category+' no coincide con el catálogo (esperaba '+first+', aparece '+firstSymbol()+')');
      const known=new Set(), visited=new Set();
      for(let n=0;n<25;n++){
        current=page();
        if(!Number.isInteger(current)) throw Error('No puedo identificar la página de '+category);
        const sig=signature();
        if(visited.has(sig)) throw Error('Se repitió la página de '+category);
        visited.add(sig);
        const data=rows();
        if(!data.length) throw Error('La tabla está vacía en '+category);
        for(const r of data){
          const s=symbol(r);
          if(!s || known.has(s)) throw Error('Emisora vacía o duplicada: '+s+' en '+category);
          known.add(s);
          all.push({category,symbol:s,last:r[3],variation:r[4],
            bid_volume:r[5],bid:r[6],ask_volume:r[7],ask:r[8]});
        }
        await progress(category+' · página '+current+' · '+known.size+'/'+count+' instrumentos');
        if(known.size===count) break;
        if(known.size>count) throw Error('Demasiadas filas en '+category);
        const next=pageButton(current+1);
        if(!next || next.disabled) throw Error('No hay página '+(current+1)+'; solo '+known.size+'/'+count+' '+category);
        const beforePage=signature();next.click();
        await wait(()=>page()===current+1 && signature()!==beforePage,category+' página '+(current+1));
      }
      if(known.size!==count) throw Error('Se capturaron solo '+known.size+'/'+count+' en '+category);
    }
    if(all.length!==226) throw Error('Catálogo incompleto: '+all.length);
    const payload={captured_at:new Date().toISOString(),rows:all};
    const reply=await chrome.runtime.sendMessage({type:'COLLECT_DONE',payload});
    if(!reply?.ok) throw Error(reply?.error||'No se pudo enviar a GitHub');
  }catch(err){
    console.error('[investmentChecker]',err);
    await chrome.runtime.sendMessage({type:'COLLECT_FAILED',reason:err.message});
  }finally{globalThis.__investmentCheckerBusy=false;}
})();
