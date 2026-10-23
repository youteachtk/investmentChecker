// Actinver 2026 simulator: inspect the user's Orders page in a disposable tab.
// No order placement, cancellation, authorization or changes to positions.
(async()=>{
  'use strict';
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ').trim().toLowerCase();
  const visible=e=>!!(e&&typeof e.getClientRects==='function'&&e.getClientRects().length&&!e.disabled);
  const label=e=>norm(e?.innerText||e?.textContent);
  const controls=()=>[...document.querySelectorAll(
    'a,button,[role="tab"],[role="menuitem"],[routerlink]')].filter(visible);
  const state={schema_version:1,captured_at:new Date().toISOString(),
    stage:'ORDERS_NOT_OPEN',orders_page_seen:false,rows_scanned:0,
    orders:[],counts:{executed:0,partial:0,pending:0,cancelled:0,rejected:0,unknown:0},
    submitted_orders:0,read_only:true,
    probe_step:'INITIAL',visible_table_count:0,visible_control_count:0,
    order_nav_candidate_count:0,investment_menu_candidate_count:0};
  const statusKind=text=>{
    const t=norm(text);
    if(/^(asignada|asignado|ejecutada|ejecutado|completada|completado|filled)$/.test(t))
      return 'executed';
    if(/parcial|partially/.test(t))return 'partial';
    if(/pendiente|abierta|abierto|registrada|recibida|ingresada|en proceso|activa|por ejecutar|pending/.test(t))
      return 'pending';
    if(/cancelada|cancelado|vencida|vencido|expirada|expired/.test(t))
      return 'cancelled';
    if(/rechazada|rechazado|rejected/.test(t))return 'rejected';
    return 'unknown';
  };
  const tableData=()=>{
    for(const table of [...document.querySelectorAll('table,[role="table"]')].filter(visible)){
      const headers=[...table.querySelectorAll('thead th,[role="columnheader"]')].map(label);
      const find=(re)=>headers.findIndex(h=>re.test(h));
      const colStatus=find(/^(estatus|estado|situacion|estatus de orden|estado de orden)$/);
      const colSymbol=find(/emisora|simbolo|instrumento|accion|titulo valor/);
      if(colStatus<0||colSymbol<0)continue;
      const colSide=find(/operacion|tipo de movimiento|compra o venta|tipo de orden/);
      const colQty=find(/titulos|cantidad|numero de acciones|volumen/);
      const colFolio=find(/^(folio|numero de orden|no de orden|id orden)$/);
      const colDate=find(/^(fecha|fecha de orden|fecha de operacion)$/);
      const rows=[...table.querySelectorAll('tbody tr,[role="rowgroup"] [role="row"]')].filter(visible);
      const out=[];
      for(const row of rows.slice(0,100)){
        const vals=[...row.querySelectorAll('td,[role="cell"]')].map(x=>String(x.innerText||x.textContent||'').trim());
        if(vals.length<=Math.max(colStatus,colSymbol))continue;
        const sym=vals[colSymbol].toUpperCase().replace(/[\*ⓘℹ]/g,'').trim();
        if(!/^[A-Z0-9 .&+/-]{1,35}$/.test(sym))continue;
        const status=statusKind(vals[colStatus]);
        const item={symbol:sym,status};
        if(colSide>=0){
          const side=norm(vals[colSide]);
          if(/compra|buy/.test(side))item.side='BUY';
          else if(/venta|sell/.test(side))item.side='SELL';
        }
        if(colQty>=0){
          const n=Number(vals[colQty].replace(/,/g,'').trim());
          if(Number.isInteger(n)&&n>0&&n<=10000000)item.quantity=n;
        }
        if(colFolio>=0&&/^[a-zA-Z0-9-]{1,48}$/.test(vals[colFolio]))
          item.folio=vals[colFolio];
        if(colDate>=0&&/^[\d\s:/.-]{6,32}$/.test(vals[colDate]))
          item.date=vals[colDate];
        out.push(item);
      }
      return {rows:rows.length,orders:out};
    }
    return null;
  };
  state.probe_step='READ_CURRENT_TABLE';
  state.visible_table_count=[...document.querySelectorAll('table,[role="table"]')].filter(visible).length;
  state.visible_control_count=Math.min(1000,controls().length);
  let info=tableData();
  if(!info){
    const isOrders=e=>{
      const t=label(e);
      const href=norm(e.getAttribute?.('routerlink')||e.getAttribute?.('href')||'');
      return (/^(mis ordenes|ordenes|historial de ordenes|ordenes de compra y venta)$/.test(t)||
        (/ordenes/.test(href)&&t.length>0&&t.length<65)) &&
        !/cancelar|eliminar|modificar/.test(t);
    };
    state.probe_step='FIND_ORDER_NAVIGATION';
    let found=controls().filter(isOrders);
    state.order_nav_candidate_count=Math.min(100,found.length);
    if(found.length===0){
      const menu=controls().filter(e=>/^(tu inversion|tu inversion ⌄)$/.test(label(e)));
      state.investment_menu_candidate_count=Math.min(100,menu.length);
      if(menu.length===1){
        menu[0].click(); // expand navigation, no order action
        for(let i=0;i<20;i++){
          await sleep(250);
          found=controls().filter(isOrders);
          if(found.length)break;
        }
      }
    }
    if(found.length!==1){
      state.stage=found.length>1?'ORDERS_NAV_AMBIGUOUS':'ORDERS_SECTION_NOT_FOUND';
      return state;
    }
    state.probe_step='OPEN_ORDER_NAVIGATION';
    found[0].click(); // navigate to orders only
    state.orders_page_seen=true;
    state.probe_step='WAIT_ORDERS_TABLE';
    for(let i=0;i<48;i++){
      await sleep(250);
      info=tableData();
      if(info)break;
    }
  }else state.orders_page_seen=true;
  if(!info){
    state.probe_step='NO_MATCHING_TABLE';
    state.visible_table_count=[...document.querySelectorAll('table,[role="table"]')].filter(visible).length;
    state.stage='ORDERS_TABLE_NOT_VERIFIED';return state;
  }
  state.probe_step='CLASSIFY_ORDER_ROWS';
  state.rows_scanned=Math.min(info.rows,100);
  state.orders=info.orders;
  for(const o of info.orders)state.counts[o.status]++;
  state.probe_step='COMPLETED';
  state.stage=info.rows===0?'ORDERS_TABLE_EMPTY':
    info.orders.length?'ORDERS_TABLE_READ':'ORDERS_ROWS_UNRECOGNIZED';
  return state;
})();
