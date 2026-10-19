// v2.2.0: read-only discovery of the logged-in Actinver holdings screen.
// Runs in a short-lived INACTIVE Brave tab. Never presses trade/order controls.
(async () => {
  'use strict';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const visible = el => !!(el && el.getClientRects().length);
  const norm = s => String(s || '').trim().replace(/\s+/g,' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const controls = () => [...document.querySelectorAll('a,button,[role="menuitem"],[role="button"]')].filter(visible);
  const hasHoldingsTable = () => [...document.querySelectorAll('table,[role="table"]')].filter(visible).some(t => {
    const labels = [...t.querySelectorAll('thead th,[role="columnheader"]')].map(x => norm(x.textContent));
    return labels.some(h=>/emisora|simbolo|instrumento|ticker/.test(h)) &&
           labels.some(h=>/titulos|cantidad|posicion|unidades/.test(h));
  });
  const safe = e => {
    const t = norm(e.innerText || e.textContent);
    const href = e.getAttribute('href');
    if (/comprar|vender|operar|orden|retirar|transferir|depositar|liquidar|eliminar/.test(t)) return false;
    if (href && !href.startsWith('#') && !href.startsWith('/')) {
      try { if (new URL(href,location.href).origin !== location.origin) return false; } catch{return false;}
    }
    return true;
  };
  const waitForHoldings = async ms => {
    const stop=Date.now()+ms;
    while(Date.now()<stop) {
      if(hasHoldingsTable()) return true;
      await sleep(300);
    }
    return false;
  };
  if(await waitForHoldings(900)) return {found:true,step:'already-open'};
  const labelled=label=>[...document.querySelectorAll('span,div,li,p')].filter(visible)
    .find(e=>e.children.length===0 && norm(e.textContent)===label);
  const menu=controls().find(e=>norm(e.innerText||e.textContent)==='tu inversion')
    ||labelled('tu inversion')?.closest('button,a,[role="button"],[role="menuitem"]')
    ||labelled('tu inversion')?.parentElement;
  if(!menu || !safe(menu)) return {found:false,reason:'No se encontró el menú Tu inversión'};
  menu.click();
  await sleep(850);
  if(await waitForHoldings(900)) return {found:true,step:'investment-menu'};
  const isLink = e => {
    const label=norm(e.innerText||e.textContent);
    const href=norm(e.getAttribute('href'));
    return /mi portafolio|portafolio|mi cartera|cartera|mis inversiones|mis posiciones|posiciones|mis acciones|inversiones/.test(label+' '+href)
      && label!=='tu inversion' && safe(e);
  };
  const option=controls().find(isLink) || [...document.querySelectorAll('span,li,div')].filter(visible)
    .find(e=>e.children.length===0 && isLink(e));
  if(!option) return {found:false,reason:'Menú abierto, pero no se identificó un enlace de posiciones'};
  option.click();
  if(await waitForHoldings(11000)) return {found:true,step:'holdings-route'};
  return {found:false,reason:'No apareció una tabla reconocible de posiciones'};
})();
