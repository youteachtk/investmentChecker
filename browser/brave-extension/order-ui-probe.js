// Navigate to Visa Detail, then open only the unique paired Buy/Sell ticket launcher.
// Never fill, calculate, confirm or submit transactions.
// No quantity/price is entered. Do not include DOM dumps, balances or account data.
(async () => {
  'use strict';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const visible = el => !!(el && typeof el.getClientRects === 'function' &&
    el.getClientRects().length && !el.disabled);
  const norm = value => String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const label = el => norm(el && (el.innerText || el.textContent));
  const elements = selector => [...document.querySelectorAll(selector)].filter(visible);
  const recognized = selector => elements(selector).slice(0, 100);
  const dialogs = () => elements('[role="dialog"],mat-dialog-container,dialog,aside,[role="complementary"],mat-sidenav,mat-drawer,.mat-drawer,.mat-sidenav');
  const menus = () => elements('[role="menu"],mat-menu-panel,.mat-menu-panel,.cdk-overlay-pane,aside,[role="complementary"],mat-sidenav,mat-drawer,.mat-drawer,.mat-sidenav');
  const fields = region => [...region.querySelectorAll('input,select,textarea,[role="spinbutton"],mat-select')]
    .filter(visible).filter(el => !['hidden','password','email'].includes(String(el.type || '').toLowerCase()));
  const fieldKind = field => {
    const type=String(field.type||'').toLowerCase();
    const related=elements('label').filter(el=>field.id && el.htmlFor===field.id);
    const scope=field.closest?.('label,mat-form-field,.mat-form-field,.form-group,[class*="form-field"],[class*="input-wrapper"]')||field.parentElement;
    const hints=[
      field.getAttribute?.('aria-label'),field.getAttribute?.('placeholder'),
      field.getAttribute?.('name'),field.getAttribute?.('id'),
      field.closest?.('label')?.textContent,
      ...related.map(el=>el.textContent),
      scope?.previousElementSibling?.textContent,
      field.previousElementSibling?.textContent,
      scope?.textContent?.slice(0,110)
    ];
    const semantic=norm(hints.filter(Boolean).join(' '));
    // Selection radios are not editable price or quantity fields.
    if(type==='radio'||type==='checkbox')
      return /limitada por precio|a mercado|tipo de orden/.test(semantic)?
        'TIPO_ORDEN':'OTRO';
    if(/titulos|cantidad|numero de acciones|numero de titulos|unidades/.test(semantic))
      return 'CANTIDAD';
    if(/precio limite|precio de compra|precio de venta|precio|limite/.test(semantic))
      return 'PRECIO';
    if(/vigencia|duracion/.test(semantic))return 'VIGENCIA';
    return 'OTRO';
  };
  const safeFields = region => fields(region).slice(0,15).map(el=>({
    kind:fieldKind(el),
    control:String(el.tagName||'').toUpperCase().slice(0,15),
    type:String(el.type||'').toLowerCase().slice(0,20)
  }));
  const appearsForm = () => {
    const regions=[...dialogs(),...elements('form')];
    for(const region of regions){
      const descriptors=safeFields(region);
      if(descriptors.some(x=>x.kind==='CANTIDAD') &&
         (descriptors.some(x=>x.kind==='PRECIO'||x.kind==='TIPO_ORDEN') ||
          descriptors.length>=2))
        return {region,descriptors};
    }
    return null;
  };
  const state={schema_version:2,stage:'MARKET_NOT_READY',
    target_symbol:'V',selected_symbol:null,
    clicked_steps:[],form_detected:false,fields:[],side_panel_visible:false,
    detail_route_verified:false,detail_controls:null,
    action_widget_count:0,submitted_orders:0,
    inspected_without_submission:true};
  for(let attempt=0;attempt<45;attempt++){
    if(elements('gt-btn-operar').length)break;
    await sleep(300);
  }
  const widgets=recognized('gt-btn-operar');
  state.action_widget_count=widgets.length;
  if(!widgets.length)return {...state,stage:'NO_MARKET_ACTIONS'};
  // Strict row selection: do not accidentally open a different instrument.
  const root=document.querySelector('app-capitales');
  const stockTabs=root?[...root.querySelectorAll('div.tab-btn')].filter(visible):[];
  if(stockTabs.length===3 && !stockTabs[0].classList.contains('active')){
    stockTabs[0].querySelector('button')?.click();
    for(let n=0;n<40&&!stockTabs[0].classList.contains('active');n++)await sleep(250);
  }
  const table=()=>[...(root?.querySelectorAll('app-tabla-material table.table-capitales')||[])].find(visible);
  const rows=()=>[...(table()?.querySelectorAll('tbody tr')||[])].filter(visible);
  const ticker=tr=>{
    const h=[...(table()?.querySelectorAll('thead th')||[])].map(label);
    const col=h.indexOf('emisora');
    const cells=[...tr.querySelectorAll('td')];
    return col>=0?label(cells[col]).replace(/[?*ⓘℹ]/g,'').trim():'';
  };
  const findV=()=>rows().find(tr=>ticker(tr)==='v'&&tr.querySelector('gt-btn-operar'));
  const pager=()=>root?.querySelector('app-paginator');
  const buttons=()=>[...(pager()?.querySelectorAll('button')||[])].filter(visible);
  const pageNumber=()=>{const b=buttons().filter(e=>e.classList.contains('active')&&/^\d+$/.test(label(e)));
    return b.length===1?Number(label(b[0])):null;};
  let row=findV(),page=pageNumber()||1;
  state.pages_visited=1;
  state.lookup_method=row?'VISIBLE_PAGE':'PAGINATOR';
  state.search_attempted=false;
  // Search only inside the temporary Capitales tab. The active user page
  // is never modified, and the exact Emisora cell must still equal V.
  if(!row){
    const searches=[...(root?.querySelectorAll('input')||[])].filter(visible)
      .filter(input=>/^(buscar|search)$/.test(norm([
        input.getAttribute?.('placeholder'),input.getAttribute?.('aria-label')
      ].filter(Boolean).join(' '))));
    if(searches.length===1){
      const search=searches[0];
      state.search_attempted=true;
      const setSearch=term=>{
        const descriptor=Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(search),'value');
        if(descriptor?.set)descriptor.set.call(search,term);
        else search.value=term;
        search.dispatchEvent(new Event('input',{bubbles:true}));
      };
      for(const term of ['VISA','V']){
        const before=rows().map(ticker).join('|');
        setSearch(term);
        for(let tick=0;tick<32;tick++){
          await sleep(250);
          const now=rows().map(ticker).join('|');
          if(now!==before)break;
        }
        row=findV();
        if(row){
          state.lookup_method='SEARCH';
          state.search_term=term;
          page=pageNumber()||1;
          break;
        }
      }
      if(!row){
        setSearch('');
        for(let tick=0;tick<40;tick++){
          await sleep(250);
          if(rows().length>0)break;
        }
      }
    }
  }
  for(let n=0;!row&&n<14;n++){
    if(!pager())break;
    const nextPage=page+1, before=rows().map(ticker).join('|');
    let next=buttons().find(e=>label(e)===String(nextPage));
    if(!next){
      const group=pager().querySelector('.btn-pages');
      const groupButtons=[...(group?.querySelectorAll('button')||[])].filter(visible);
      const arrow=groupButtons[groupButtons.length-1];
      if(!arrow||arrow.disabled||/^\d+$/.test(label(arrow)))break;
      arrow.click();
      for(let i=0;i<40&&!buttons().some(e=>label(e)===String(nextPage));i++)await sleep(250);
      next=buttons().find(e=>label(e)===String(nextPage));
    }
    if(!next||next.disabled)break;
    next.click();
    for(let i=0;i<50;i++){
      await sleep(250);
      if(pageNumber()===nextPage&&rows().map(ticker).join('|')!==before)break;
    }
    if(pageNumber()!==nextPage||rows().map(ticker).join('|')===before)break;
    page=nextPage;state.pages_visited++;row=findV();
  }
  if(!row)return {...state,stage:'TARGET_ROW_NOT_FOUND'};
  state.located_page=page;
  state.selected_symbol='V';
  // Navigate using the DETAIL link within V's own Información column.
  // The side panel opened by Operar is intentionally not used.
  const headers=[...(table()?.querySelectorAll('thead th')||[])].map(label);
  const infoIndex=headers.indexOf('informacion');
  const cells=[...row.querySelectorAll('td')];
  if(infoIndex<0||!cells[infoIndex])
    return {...state,stage:'DETAIL_COLUMN_NOT_FOUND'};
  const detailLinks=[...cells[infoIndex].querySelectorAll('a,button,[role="link"],[role="button"]')]
    .filter(visible).filter(el=>label(el)==='detalle');
  if(detailLinks.length!==1)
    return {...state,stage:detailLinks.length?'DETAIL_LINK_AMBIGUOUS':'DETAIL_LINK_NOT_FOUND'};

  detailLinks[0].click();
  state.clicked_steps.push('OPEN_STOCK_DETAIL');
  state.stage='DETAIL_REQUESTED';
  for(let attempt=0;attempt<70;attempt++){
    if(String(location.hash||'').includes('/capitales/detalle/DetalleAcciones'))break;
    await sleep(250);
  }
  if(!String(location.hash||'').includes('/capitales/detalle/DetalleAcciones'))
    return {...state,stage:'DETAIL_NAVIGATION_NOT_CONFIRMED'};

  state.detail_route_verified=true;
  state.stage='DETAIL_OPENED';
  // Read only the structure of the detail view. The paired Comprar/Vender
  // controls at the bottom are the ticket launchers seen in the user's image.
  // Never click any Comprar button inside an order form or side panel.
  let ctas=[];
  for(let attempt=0;attempt<40;attempt++){
    ctas=elements('button,a,[role="button"],[role="link"]');
    if(ctas.some(el=>label(el)==='comprar')&&ctas.some(el=>label(el)==='vender'))break;
    await sleep(250);
  }
  const buys=ctas.filter(el=>label(el)==='comprar' &&
    !el.closest?.('form,[role="dialog"],mat-dialog-container,mat-drawer,mat-sidenav,aside'));
  const sells=ctas.filter(el=>label(el)==='vender' &&
    !el.closest?.('form,[role="dialog"],mat-dialog-container,mat-drawer,mat-sidenav,aside'));
  const initial=safeFields(document);
  state.detail_controls={
    buy_control_present:buys.length===1,
    sell_control_present:sells.length===1,
    visible_field_count:initial.length
  };
  // This is a navigation click, not an order. Refuse any ambiguous DOM or
  // page that is already showing a form, which might contain a submit button.
  if(buys.length!==1||sells.length!==1||initial.length){
    state.stage='DETAIL_TICKET_LAUNCHER_UNVERIFIED';
    return state;
  }
  if(!String(location.hash||'').includes('/capitales/detalle/DetalleAcciones')){
    state.stage='DETAIL_NAVIGATION_NOT_CONFIRMED';
    return state;
  }
  buys[0].click();
  state.clicked_steps.push('OPEN_DETAIL_BUY_TICKET');
  state.stage='DETAIL_BUY_TICKET_REQUESTED';
  let descriptors=[],ticketInputs=[];
  for(let attempt=0;attempt<36;attempt++){
    await sleep(250);
    descriptors=safeFields(document);
    ticketInputs=descriptors.filter(field=>
      ['CANTIDAD','PRECIO'].includes(field.kind) ||
      ['number','text','tel'].includes(field.type));
    if(ticketInputs.length>=2)break;
  }
  state.fields=descriptors;
  state.side_panel_visible=elements('aside,[role="complementary"],mat-sidenav,mat-drawer,.mat-drawer,.mat-sidenav').length>0;
  state.detail_controls.visible_field_count=descriptors.length;
  if(ticketInputs.length>=2){
    state.form_detected=true;
    state.stage='DETAIL_BUY_TICKET_FIELDS_DETECTED';
  }else state.stage='DETAIL_BUY_TICKET_NOT_DETECTED';
  // Never enter order values or press Calculate, Comprar or any confirmation
  // inside the ticket. Do not serialize page text, account data or input values.
  return state;
})();
