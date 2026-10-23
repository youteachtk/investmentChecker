// Guided, read-only discovery of a REAL buy ticket for one market instrument.
// May open a market action menu and a BUY FORM launcher; NEVER submits a trade.
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
    const labels = elements('label').filter(el => field.id && el.htmlFor === field.id);
    const parent = field.closest?.('mat-form-field,.mat-form-field,.form-group,[class*="form-field"]') || field.parentElement;
    const semantic = norm([
      field.getAttribute?.('aria-label'),field.getAttribute?.('placeholder'),
      field.getAttribute?.('name'),...labels.map(label),parent?.textContent?.slice(0,100)
    ].filter(Boolean).join(' '));
    if (/cantidad|titulos|volumen|unidades|numero de titulos|numero de acciones/.test(semantic))return 'CANTIDAD';
    if (/precio|limite|limit/.test(semantic))return 'PRECIO';
    if (/tipo de orden|modalidad|tipo de operacion/.test(semantic))return 'TIPO_ORDEN';
    if (/vigencia|duracion|fecha/.test(semantic))return 'VIGENCIA';
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
  const widget=row.querySelector('gt-btn-operar');
  const launch=[...widget.querySelectorAll('button,[role="button"],a')].filter(visible)
    .filter(el=>/^(comprar o vender|operar)$/.test(label(el)));
  if(launch.length!==1)return {...state,stage:'ACTION_LAUNCHER_AMBIGUOUS'};
  // Only the market-row launcher is allowed; never a submit/confirm control.
  launch[0].click();
  state.clicked_steps.push('OPEN_MARKET_ACTIONS');
  state.stage='ACTIONS_OPENED';
  for(let attempt=0;attempt<15;attempt++){
    if(appearsForm())break;
    const exposed=menus().some(menu=>{
      const actions=[...menu.querySelectorAll('button,[role="menuitem"],a')].filter(visible);
      return actions.some(el=>label(el)==='comprar') &&
        actions.some(el=>label(el)==='vender');
    });
    if(exposed)break;
    await sleep(250);
  }
  let form=appearsForm();
  if(!form){
    // A BUY action is safe to open ONLY when it is an item in an explicit
    // COMPRAR/VENDER chooser and there are no form fields in that chooser.
    const choices=[];
    for(const menu of menus()){
      if(fields(menu).length)continue;
      const actions=[...menu.querySelectorAll('button,[role="menuitem"],a')].filter(visible);
      if(!actions.some(el=>label(el)==='vender'))continue;
      choices.push(...actions.filter(el=>label(el)==='comprar' &&
        !el.closest?.('form,[role="dialog"],mat-dialog-container')));
    }
    if(choices.length===1){
      choices[0].click();
      state.clicked_steps.push('OPEN_BUY_FORM');
      state.stage='BUY_FORM_REQUESTED';
      for(let attempt=0;attempt<24;attempt++){
        form=appearsForm();
        if(form)break;
        await sleep(250);
      }
    }else state.stage=choices.length?'BUY_ACTION_AMBIGUOUS':'BUY_MENU_NOT_FOUND';
  }
  if(form){
    state.form_detected=true;
    state.fields=form.descriptors;
    state.stage='BUY_FORM_DETECTED';
  }
  // Structural diagnostic only; never store panel text or input values.
  state.side_panel_visible=elements('aside,[role="complementary"],mat-sidenav,mat-drawer,.mat-drawer,.mat-sidenav').length>0;
  // Never click confirm, send, preview, finalize, submit, buy-order buttons.
  // No transactions, no account values and no order form values are transmitted.
  return state;
})();
