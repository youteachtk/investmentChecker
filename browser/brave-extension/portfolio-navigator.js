// Read-only Actinver investment navigation. Inactive temporary tab only.
// Navigation success is separate from holdings extraction success.
(async () => {
  'use strict';
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ').trim().toLowerCase();
  const visible=e=>!!(e&&e.getClientRects().length);
  const controls=()=>[...document.querySelectorAll(
    'a,button,[role="menuitem"],[role="button"],[routerlink],mat-list-item,mat-expansion-panel-header'
  )].filter(visible);
  const tables=()=>[...document.querySelectorAll('table,[role="table"]')].filter(visible);
  const headers=t=>[...t.querySelectorAll('thead th,[role="columnheader"]')]
    .map(x=>norm(x.innerText||x.textContent));
  const market=h=>h.some(x=>/volumen (de )?compra|volumen (de )?venta/.test(x)) &&
    h.some(x=>/precio de compra|precio de venta/.test(x));
  const hasHoldings=()=>tables().some(t=>{
    const h=headers(t);
    return !market(h) &&
      h.some(x=>/emisora|simbolo|instrumento|ticker|fondo|producto/.test(x)) &&
      h.some(x=>/titulos|cantidad|posicion|unidades|participaciones|tenencia/.test(x));
  });
  const structure=()=>tables().filter(t=>!market(headers(t)))
    .map(t=>headers(t).join('|')).join('||');
  const route=()=>String(location.hash||'');
  const isTargetRoute=()=>/inversion|cartera|portafolio|tenencia|posicion/.test(norm(route())) &&
    !/capitales/.test(norm(route()));
  const safe=e=>{
    const label=norm(e.innerText||e.textContent);
    // Block all order-, money-transfer-, and account-changing controls.
    if(/comprar|vender|operar|orden|retirar|transferir|depositar|liquidar|eliminar/.test(label))
      return false;
    const href=e.getAttribute?.('href');
    if(href && !href.startsWith('#') && !href.startsWith('/')){
      try{if(new URL(href,location.href).origin!==location.origin)return false;}
      catch(_){return false;}
    }
    return true;
  };
  const find=async predicate=>{
    for(let i=0;i<36;i++){
      const match=controls().find(e=>predicate(e)&&safe(e));
      if(match)return match;
      await sleep(350);
    }
    return null;
  };
  const waitNavigation=async (hashBefore,structureBefore,ms=5500)=>{
    const until=Date.now()+ms;
    while(Date.now()<until){
      if(hasHoldings())return 'holdings';
      if(isTargetRoute() && route()!==hashBefore)return 'route';
      if(structure()!==structureBefore && tables().some(t=>!market(headers(t))))
        return 'table';
      await sleep(250);
    }
    return null;
  };
  if(hasHoldings())return {found:true,step:'already-open'};
  const firstRoute=route(),firstStructure=structure();
  let menu=await find(e=>{
    const label=norm(e.innerText||e.textContent);
    return label==='tu inversion'||(label.startsWith('tu inversion')&&label.length<=50);
  });
  if(!menu){
    // On some layouts the caption is separate from the clickable Angular item.
    const labels=[...document.querySelectorAll('span,div,li,p')].filter(visible);
    const caption=labels.find(e=>norm(e.textContent)==='tu inversion');
    menu=caption?.closest?.(
      'mat-list-item,[routerlink],a,button,[role="menuitem"],[role="button"],mat-expansion-panel-header'
    )||null;
  }
  if(!menu||!safe(menu))return {found:false,step:'menu-missing'};
  menu.click();
  let moved=await waitNavigation(firstRoute,firstStructure);
  if(moved)return {found:true,step:'menu-'+moved};
  // The first click may expand a submenu instead of navigating.
  const isSubmenu=e=>{
    const label=norm(e.innerText||e.textContent);
    const href=norm(e.getAttribute?.('routerlink')||e.getAttribute?.('href'));
    return label!=='tu inversion'&&
      /mi portafolio|portafolio|mi cartera|cartera|mis inversiones|mis posiciones|posiciones|tenencia|mis acciones|inversiones/.test(label+' '+href)&&
      label.length<100;
  };
  let option=await find(e=>e!==menu&&isSubmenu(e));
  if(!option){
    const descendants=[...document.querySelectorAll('span,li,div')].filter(visible);
    const node=descendants.find(e=>!e.children.length&&isSubmenu(e));
    option=node?.closest?.('a,button,[routerlink],mat-list-item,[role="menuitem"]')||null;
  }
  if(!option||!safe(option))return {found:false,step:'submenu-missing'};
  const secondRoute=route(),secondStructure=structure();
  option.click();
  moved=await waitNavigation(secondRoute,secondStructure,9000);
  if(moved)return {found:true,step:'submenu-'+moved};
  // A click reached an eligible investment control; allow a read-only probe
  // even if Angular hides the table behind unfamiliar headers.
  return {found:true,step:'submenu-inspect'};
})();