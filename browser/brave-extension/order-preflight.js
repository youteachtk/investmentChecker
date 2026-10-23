'use strict';
// InvestmentChecker simulated-trading order preflight.
// Read only. NEVER submits, clicks, or queues a broker transaction.
// Draft approval is NOT permission to change prices or execute anything.
const ORDER_PUBLIC='https://raw.githubusercontent.com/youteachtk/investmentChecker/main/output/';
const ORDER_FEE_RATE=.00116;
const ORDER_MAX_AGE_MS=5*60*1000;
const ORDER_SECTORS={
  V:'payments',MA:'payments',AXP:'payments',WMT:'consumer',COST:'consumer',
  KO:'consumer',PG:'consumer',CVX:'energy',XOM:'energy',PFE:'health',
  ABBV:'health',UNH:'health',LLY:'health',AAPL:'technology',MSFT:'technology',
  NVDA:'technology',PLTR:'technology',BRKB:'diversified',CAT:'industrials',
  BA:'industrials',JPM:'financial',BAC:'financial'
};
const ORDER_PREFERRED=['V','WMT','CVX','COST','MA','KO','AAPL','PFE',
  'MSFT','CAT','BRKB','ABBV','JPM','PG','UNH'];
const ORDER_EXCLUDE=new Set(['SOXL','SOXS','TQQQ','SQQQ','TECL','TECS',
  'SPXL','SPXS','QLD','FAS','FAZ','TNA','TZA','PSQ']);
function orderNumber(v){
  return typeof v==='number' && Number.isFinite(v)?v:null;
}
function orderAge(iso,now=Date.now()){
  const t=Date.parse(String(iso||''));
  return Number.isFinite(t)?now-t:Infinity;
}
function orderCSV(text){
  // RFC 4180 quoting, including cells with embedded commas.
  const rows=[];let cell='',cols=[],quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted&&text[i+1]==='"'){cell+='"';i++;}
      else quoted=!quoted;
    }else if(c===','&&!quoted){cols.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&text[i+1]==='\n')i++;
      cols.push(cell);cell='';
      if(cols.some(x=>x!==''))rows.push(cols);
      cols=[];
    }else cell+=c;
  }
  cols.push(cell);
  if(cols.some(x=>x!==''))rows.push(cols);
  const keys=rows.shift()||[];
  return rows.map(row=>Object.fromEntries(keys.map((k,i)=>[k,row[i]||''])));
}
function orderDrafts(quotes,portfolio,ranking,now=Date.now()){
  const fail=(status,reason)=>({ok:false,status,reason,orders:[]});
  if(!quotes||quotes.total!==226||!Array.isArray(quotes.quotes)||
     quotes.quotes.length!==226) return fail('INVALID_QUOTES','Faltan cotizaciones validadas.');
  const qa=orderAge(quotes.captured_at,now),va=orderAge(quotes.validated_at,now);
  if(qa< -300000||qa>900000||va< -300000||va>900000)
    return fail('STALE_QUOTES','Cotizaciones vencidas o no validadas en GitHub.');
  const pa=orderAge(portfolio?.captured_at,now);
  if(pa< -300000||pa>2100000)
    return fail('STALE_PORTFOLIO','Cartera privada vencida.');
  const summary=portfolio?.summary,holds=portfolio?.holdings;
  if(!summary||!Array.isArray(holds)||holds.length>100)
    return fail('INCOMPLETE_PORTFOLIO','Faltan posiciones o saldos.');
  const total=orderNumber(summary.total_value),cash=orderNumber(summary.buying_power);
  const invested=orderNumber(summary.investments);
  if([total,cash,invested].some(x=>x===null||x<0)||total<1000)
    return fail('INVALID_BALANCE','Saldo no válido.');
  const unsettled=orderNumber(summary.unsettled)||0;
  if(Math.abs(total-cash-invested-unsettled)>Math.max(100,total*.015))
    return fail('BALANCE_MISMATCH','Los saldos no concuerdan.');
  if(holds.length===0 && invested>Math.max(100,total*.01))
    return fail('INCOMPLETE_PORTFOLIO','Hay inversión positiva sin posiciones legibles.');
  const owned=new Set();
  for(const h of holds){
    const sym=String(h?.symbol||'').trim().toUpperCase();
    if(!/^[A-Z0-9 .&+/-]{1,48}$/.test(sym)||
       orderNumber(h.quantity)===null||h.quantity<=0||owned.has(sym))
      return fail('INVALID_HOLDINGS','Posiciones ambiguas o duplicadas.');
    owned.add(sym);
  }
  const score=new Map();
  for(const r of ranking){
    const sym=String(r.simbolo_actinver||'').trim().toUpperCase();
    const n=Number(r.research_score);
    if(sym&&r.research_score!==''&&Number.isFinite(n))score.set(sym,n);
  }
  if(!score.size)return fail('INVALID_RANKING','Clasificación histórica no disponible.');
  const eligible=[];
  for(const q of quotes.quotes){
    const symbol=String(q.symbol||'').trim().toUpperCase();
    if(q.category!=='ACCIONES'||owned.has(symbol)||ORDER_EXCLUDE.has(symbol))continue;
    const bid=orderNumber(q.bid),ask=orderNumber(q.ask);
    const bv=orderNumber(q.bid_volume),av=orderNumber(q.ask_volume);
    const change=orderNumber(q.variation),scoreVal=score.get(symbol);
    if([bid,ask,bv,av,change,scoreVal].some(x=>!Number.isFinite(x)))continue;
    if(bid<=0||ask<=0||ask<bid||Math.min(bv,av)<100)continue;
    const spread=200*(ask-bid)/(ask+bid);
    if(spread>.9||change>3||scoreVal<60)continue;
    eligible.push({symbol,sector:ORDER_SECTORS[symbol]||'other',
      bid,ask,ask_volume:av,historical_score:scoreVal,
      spread_pct:Math.round(spread*1000)/1000,daily_change_pct:change});
  }
  eligible.sort((a,b)=>{
    const ap=ORDER_PREFERRED.indexOf(a.symbol),bp=ORDER_PREFERRED.indexOf(b.symbol);
    return (ap>=0?0:1)-(bp>=0?0:1)||
      (ap>=0?ap:999)-(bp>=0?bp:999)||
      b.historical_score-a.historical_score||a.spread_pct-b.spread_pct;
  });
  const budget=cash*.65,per=budget/5;
  let spent=0;
  const orders=[],sectors=new Set();
  for(const pass of [0,1]){
    for(const x of eligible){
      if(orders.length>=5)break;
      if(orders.some(y=>y.symbol===x.symbol))continue;
      if(pass===0&&sectors.has(x.sector))continue;
      const allocation=Math.min(per,budget-spent,total*.20);
      const quantity=Math.min(Math.floor(allocation/(x.ask*(1+ORDER_FEE_RATE))),x.ask_volume);
      if(quantity<1)continue;
      const gross=Math.round(quantity*x.ask*100)/100;
      const fee=Math.round(gross*ORDER_FEE_RATE*100)/100;
      const amount=Math.round((gross+fee)*100)/100;
      orders.push({symbol:x.symbol,side:'BUY',order_type:'LIMIT_DRAFT',
        quantity,limit_mxn:x.ask,estimated_fee_mxn:fee,
        estimated_total_mxn:amount,spread_pct:x.spread_pct,
        historical_score:x.historical_score,sector:x.sector});
      spent+=amount;sectors.add(x.sector);
    }
  }
  if(!orders.length)return fail('NO_ELIGIBLE_NEW_BUYS','No hay compras nuevas que cumplan los filtros.');
  return {ok:true,status:'DRAFTS_READY_FOR_REVIEW',orders,
    quotes_captured_at:quotes.captured_at,portfolio_captured_at:portfolio.captured_at,
    buying_power_mxn:cash,estimated_spend_mxn:Math.round(spent*100)/100,
    expires_at:new Date(Math.min(now+ORDER_MAX_AGE_MS,
      Date.parse(quotes.captured_at)+900000,
      Date.parse(portfolio.captured_at)+2100000)).toISOString(),
    execution_enabled:false};
}
async function orderLoadPrivatePortfolio(){
  const {privateEnabled,privateRepo,privateToken}=await chrome.storage.local.get([
    'privateEnabled','privateRepo','privateToken']);
  if(!privateEnabled||!privateRepo||!privateToken)
    throw Error('La cartera privada no está configurada.');
  await verifyPrivateRepo(privateRepo,privateToken);
  const url='https://api.github.com/repos/'+privateRepo+'/contents/actinver/portfolio-latest.json';
  const response=await fetch(url,{cache:'no-store',headers:{
    Authorization:'Bearer '+privateToken,Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28'
  }});
  if(!response.ok)throw Error('No se pudo leer la cartera privada.');
  const item=await response.json();
  const binary=atob(String(item.content||'').replace(/\s/g,''));
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function orderFetchPublic(name){
  const response=await fetch(ORDER_PUBLIC+name,{cache:'no-store'});
  if(!response.ok)throw Error('Datos de mercado no disponibles.');
  return name.endsWith('.csv')?response.text():response.json();
}
async function orderPreview(){
  // No data containing private holdings is uploaded or returned to public GitHub.
  const [quotes,portfolio,csv]=await Promise.all([
    orderFetchPublic('actinver_quotes.json'),orderLoadPrivatePortfolio(),
    orderFetchPublic('ranking.csv')
  ]);
  const proposal=orderDrafts(quotes,portfolio,orderCSV(csv));
  if(!proposal.ok){
    await chrome.storage.local.remove('orderDraftCache');
    return proposal;
  }
  const stamp=crypto.randomUUID();
  const result={...proposal,draft_id:stamp};
  await chrome.storage.local.set({
    orderDraftCache:{...result,created_at:Date.now(),approved:false}
  });
  return result;
}
async function orderApprove(msg){
  const stored=(await chrome.storage.local.get('orderDraftCache')).orderDraftCache;
  if(!stored||!stored.ok||stored.approved||Date.now()>=Date.parse(stored.expires_at))
    return {ok:false,error:'La propuesta caducó o ya fue revisada. Actualiza cotizaciones.'};
  if(stored.draft_id!==msg.draft_id||msg.confirmed!==true)
    return {ok:false,error:'Falta consentimiento explícito para este lote.'};
  const picked=Array.isArray(msg.symbols)?msg.symbols:[];
  if(!picked.length||picked.length>5||
     new Set(picked).size!==picked.length ||
     picked.some(sym=>!stored.orders.some(o=>o.symbol===sym)))
    return {ok:false,error:'Selección de operaciones no válida.'};
  const approved=stored.orders.filter(o=>picked.includes(o.symbol));
  // This is only draft preparation. The broker adapter is locked until
  // actual trade-screen fields and confirmation behavior have been verified.
  await chrome.storage.local.set({orderDraftCache:{...stored,approved:true,
    approved_at:new Date().toISOString(),approved_symbols:picked}});
  return {ok:true,status:'APPROVED_FOR_PREPARATION',orders:approved,
    execution_enabled:false,submitted_orders:0,
    message:'Lote aprobado para preparación. Ninguna orden se envió a Actinver.'};
}

async function orderInspectUi(){
  const found=await getActinverTabs();
  const source=found.matches.find(t=>t.active)||found.matches[0];
  if(!source)return {ok:false,error:'No hay sesión de Actinver abierta en Brave.'};
  let tab=null,keepDetailTab=false;
  try{
    tab=await chrome.tabs.create({url:marketUrlForSession(source),
      openerTabId:source.id,active:false});
    if(!await waitForPage(tab.id))throw Error('Capitales no terminó de cargar.');
    const result=await chrome.scripting.executeScript({
      target:{tabId:tab.id},files:['order-ui-probe.js'],world:'ISOLATED'
    });
    const raw=result?.[0]?.result;
    if(!raw||raw.schema_version!==2||raw.inspected_without_submission!==true ||
       raw.submitted_orders!==0)
      throw Error('No se pudo verificar que la inspección evitó enviar operaciones.');
    const stages=new Set(['MARKET_NOT_READY','NO_MARKET_ACTIONS',
      'TARGET_ROW_NOT_FOUND','ACTION_LAUNCHER_AMBIGUOUS','ACTIONS_OPENED',
      'BUY_FORM_REQUESTED','BUY_ACTION_AMBIGUOUS','BUY_MENU_NOT_FOUND',
      'BUY_FORM_DETECTED','DETAIL_COLUMN_NOT_FOUND','DETAIL_LINK_NOT_FOUND',
      'DETAIL_LINK_AMBIGUOUS','DETAIL_REQUESTED','DETAIL_NAVIGATION_NOT_CONFIRMED',
      'DETAIL_OPENED','DETAIL_FORM_DETECTED','DETAIL_TICKET_LAUNCHER_UNVERIFIED',
      'DETAIL_BUY_TICKET_REQUESTED','DETAIL_BUY_TICKET_FIELDS_DETECTED',
      'DETAIL_BUY_TICKET_FIELDS_MAPPED',
      'DETAIL_BUY_TICKET_NOT_DETECTED']);
    const allowedKinds=new Set(['CANTIDAD','PRECIO','TIPO_ORDEN','VIGENCIA','OTRO']);
    const allowedControls=new Set(['INPUT','SELECT','TEXTAREA','MAT-SELECT']);
    const fields=Array.isArray(raw.fields)?raw.fields.slice(0,15)
      .filter(item=>allowedKinds.has(item?.kind))
      .map(item=>({
        kind:item.kind,
        control:allowedControls.has(item?.control)?item.control:'OTRO',
        type:/^(text|number|tel|radio|checkbox|select-one)?$/.test(item?.type||'')?
          (item.type||''):'other'
      })):[];
    const steps=Array.isArray(raw.clicked_steps)?raw.clicked_steps.filter(step=>
      ['OPEN_STOCK_DETAIL','OPEN_DETAIL_BUY_TICKET'].includes(step)).slice(0,2):[];
    const probe={schema_version:2,captured_at:new Date().toISOString(),
      target_symbol:'V',selected_symbol:raw.selected_symbol==='V'?'V':null,
      stage:stages.has(raw.stage)?raw.stage:'MARKET_NOT_READY',
      action_widget_count:Number.isInteger(raw.action_widget_count)?
        Math.min(500,Math.max(0,raw.action_widget_count)):null,
      form_detected:raw.form_detected===true,fields,
      detail_route_verified:raw.detail_route_verified===true,
      detail_controls:{
        buy_control_present:raw.detail_controls?.buy_control_present===true,
        sell_control_present:raw.detail_controls?.sell_control_present===true,
        visible_field_count:Number.isInteger(raw.detail_controls?.visible_field_count)?
          Math.min(30,Math.max(0,raw.detail_controls.visible_field_count)):0
      },
      side_panel_visible:raw.side_panel_visible===true,
      lookup_method:['VISIBLE_PAGE','SEARCH','PAGINATOR'].includes(raw.lookup_method)?
        raw.lookup_method:null,
      search_attempted:raw.search_attempted===true,
      search_term:['V','VISA'].includes(raw.search_term)?raw.search_term:null,
      pages_visited:Number.isInteger(raw.pages_visited)?
        Math.min(15,Math.max(0,raw.pages_visited)):null,
      located_page:Number.isInteger(raw.located_page)&&raw.located_page>=1&&raw.located_page<=15?
        raw.located_page:null,
      clicked_steps:steps,inspected_without_submission:true,submitted_orders:0};
    const {privateRepo,privateToken,privateEnabled}=await chrome.storage.local.get([
      'privateRepo','privateToken','privateEnabled']);
    if(!privateEnabled)throw Error('Repositorio privado no configurado.');
    await verifyPrivateRepo(privateRepo,privateToken);
    const url='https://api.github.com/repos/'+privateRepo+
      '/contents/actinver/order-ui-probe.json';
    const headers={Authorization:'Bearer '+privateToken,
      Accept:'application/vnd.github+json','Content-Type':'application/json',
      'X-GitHub-Api-Version':'2022-11-28'};
    const existing=await fetch(url,{headers,cache:'no-store'});
    if(!existing.ok&&existing.status!==404)
      throw Error('No se pudo comprobar el diagnóstico privado.');
    const sha=existing.ok?(await existing.json()).sha:undefined;
    const rawJson=JSON.stringify(probe,null,2)+'\n';
    const bytes=new TextEncoder().encode(rawJson);
    let binary='';for(const n of bytes)binary+=String.fromCharCode(n);
    const body={message:'Inspect simulated trading controls without submitting orders',
      content:btoa(binary),branch:'main'};
    if(sha)body.sha=sha;
    const saved=await fetch(url,{method:'PUT',headers,body:JSON.stringify(body)});
    if(!saved.ok)throw Error('No se pudo guardar el diagnóstico privado.');
    if(probe.detail_route_verified){
      // The user's actual Detail page should remain visible after inspection.
      keepDetailTab=true;
      try{await chrome.tabs.update(tab.id,{active:true});}catch(_){}
    }
    return {ok:true,status:probe.stage,action_widget_count:probe.action_widget_count,
      detail_opened:probe.detail_route_verified,order_form_verified:probe.form_detected,
      detail_tab_id:keepDetailTab?tab.id:null,
      submitted_orders:0,
      message:probe.detail_route_verified?
        'Se abrió Detalle de V en Brave. '+(probe.form_detected?
          'El botón Comprar abrió controles del formulario de orden.':
          probe.stage==='DETAIL_BUY_TICKET_NOT_DETECTED'?
            'Se pulsó el acceso Comprar, pero aún no se reconoció el formulario.':
            'Todavía no se pudo verificar el acceso al formulario.')+
          ' Diagnóstico privado guardado. No se envió ninguna orden.':
        'Inspección parcial de V ('+probe.stage+'). Se guardó el diagnóstico privado. No se envió ninguna orden.'};
  }catch(error){
    return {ok:false,error:String(error?.message||'No se pudo inspeccionar la interfaz.')};
  }finally{
    if(tab&&!keepDetailTab)try{await chrome.tabs.remove(tab.id);}catch(_){}
  }
}

const ORDER_REVIEW_ALARM='order_review_refresh';
chrome.alarms.onAlarm.addListener(alarm=>{
  if(alarm.name!==ORDER_REVIEW_ALARM)return;
  void (async()=>{
    const result=await orderPreview();
    await chrome.storage.local.set({
      orderReviewStatus:result.status,
      orderReviewUpdatedAt:new Date().toISOString()
    });
    if(result.ok){
      await chrome.storage.local.remove('orderReviewAttempts');
      return;
    }
    const state=await chrome.storage.local.get('orderReviewAttempts');
    const count=Number(state.orderReviewAttempts)||0;
    if(count<4 && ['STALE_QUOTES','STALE_PORTFOLIO'].includes(result.status)){
      await chrome.storage.local.set({orderReviewAttempts:count+1});
      await chrome.alarms.create(ORDER_REVIEW_ALARM,{delayInMinutes:.5});
    }
  })().catch(err=>{
    console.warn('[investmentChecker order draft]',String(err?.message||'unavailable'));
  });
});


async function orderHistoryStatus(){
  const session=await getActinverTabs();
  const source=session.matches.find(t=>t.active)||session.matches[0];
  if(!source)return {ok:false,error:'No hay sesión de Actinver en Brave.'};
  let tab=null;
  const diag={order_history:true,phase:'ORDERS_START',code:'ORDERS_ERROR',
    probe_step:'INITIAL',orders_page_seen:false};
  try{
    const origin=new URL(source.url).origin;
    if(!/^https:\/\/(?:www\.)?retoactinver\.com$/.test(origin))
      return {ok:false,error:'Origen de Actinver no autorizado.'};
    diag.phase='ORDERS_NAV';
    tab=await chrome.tabs.create({url:origin+'/RetoActinver/#/portafolio',
      active:false,openerTabId:source.id});
    if(!await waitForPage(tab.id))throw Error('No cargó la página privada.');
    const result=await chrome.scripting.executeScript({
      target:{tabId:tab.id},files:['orders-history-probe.js'],world:'ISOLATED'
    });
    const raw=result?.[0]?.result;
    if(raw&&typeof raw==='object'){
      diag.probe_step=raw.probe_step;
      diag.orders_page_seen=raw.orders_page_seen===true;
      for(const key of ['visible_table_count','visible_control_count',
        'order_nav_candidate_count','investment_menu_candidate_count']){
        diag[key]=raw[key];
      }
    }
    if(!raw||raw.schema_version!==1||raw.read_only!==true||raw.submitted_orders!==0)
      throw Error('Inspección de órdenes no verificable.');
    const statuses=new Set(['executed','partial','pending','cancelled','rejected','unknown']);
    const stages=new Set(['ORDERS_SECTION_NOT_FOUND','ORDERS_NAV_AMBIGUOUS',
      'ORDERS_TABLE_NOT_VERIFIED','ORDERS_TABLE_EMPTY','ORDERS_TABLE_READ',
      'ORDERS_ROWS_UNRECOGNIZED']);
    const orders=(Array.isArray(raw.orders)?raw.orders:[]).slice(0,100)
      .filter(o=>typeof o?.symbol==='string'&&/^[A-Z0-9 .&+/-]{1,35}$/.test(o.symbol)&&statuses.has(o.status))
      .map(o=>{
        const item={symbol:o.symbol,status:o.status};
        if(['BUY','SELL'].includes(o.side))item.side=o.side;
        if(Number.isInteger(o.quantity)&&o.quantity>=1&&o.quantity<=10000000)item.quantity=o.quantity;
        if(typeof o.folio==='string'&&/^[a-zA-Z0-9-]{1,48}$/.test(o.folio))item.folio=o.folio;
        if(typeof o.date==='string'&&/^[\d\s:/.-]{6,32}$/.test(o.date))item.date=o.date;
        return item;
      });
    const counts={executed:0,partial:0,pending:0,cancelled:0,rejected:0,unknown:0};
    for(const order of orders)counts[order.status]++;
    const stage=stages.has(raw.stage)?raw.stage:'ORDERS_TABLE_NOT_VERIFIED';
    diag.phase='ORDERS_READ';
    diag.code=stage==='ORDERS_TABLE_READ'||stage==='ORDERS_TABLE_EMPTY'?
      'ORDERS_OK':stage==='ORDERS_SECTION_NOT_FOUND'||stage==='ORDERS_NAV_AMBIGUOUS'?
      'ORDERS_NAV_FAILED':'ORDERS_TABLE_MISSING';
    const report={schema_version:1,captured_at:new Date().toISOString(),
      stage,orders_page_seen:raw.orders_page_seen===true,
      rows_scanned:Number.isInteger(raw.rows_scanned)?
        Math.min(100,Math.max(0,raw.rows_scanned)):0,
      counts,orders,read_only:true,submitted_orders:0};
    diag.phase='ORDERS_SAVE';
    const config=await chrome.storage.local.get(['privateEnabled','privateRepo','privateToken']);
    if(!config.privateEnabled)throw Error('GitHub privado no configurado.');
    await verifyPrivateRepo(config.privateRepo,config.privateToken);
    const endpoint='https://api.github.com/repos/'+config.privateRepo+
      '/contents/actinver/orders-latest.json';
    const headers={Authorization:'Bearer '+config.privateToken,
      Accept:'application/vnd.github+json','Content-Type':'application/json',
      'X-GitHub-Api-Version':'2022-11-28'};
    const old=await fetch(endpoint,{headers,cache:'no-store'});
    if(!old.ok&&old.status!==404)throw Error('No se pudo consultar historial privado.');
    const sha=old.ok?(await old.json()).sha:undefined;
    const bytes=new TextEncoder().encode(JSON.stringify(report,null,2)+'\n');
    let binary='';for(const n of bytes)binary+=String.fromCharCode(n);
    const data={message:'Read-only Reto Actinver order-status snapshot',
      content:btoa(binary),branch:'main'};
    if(sha)data.sha=sha;
    const saved=await fetch(endpoint,{method:'PUT',headers,body:JSON.stringify(data)});
    if(!saved.ok)throw Error('No se pudo guardar historial privado.');
    diag.phase='ORDERS_DONE';
    const verified=stage==='ORDERS_TABLE_READ'||stage==='ORDERS_TABLE_EMPTY';
    await chrome.storage.local.set({orderHistoryLastStatus:stage,
      orderHistoryLastCheckedAt:report.captured_at,
      orderHistoryCounts:verified?counts:null});
    return {ok:true,status:stage,verified,counts:verified?counts:null,
      order_count:verified?orders.length:null,
      message:verified?
        'Órdenes verificadas en Actinver: '+counts.executed+' ejecutadas, '+
        counts.partial+' parciales, '+counts.pending+' pendientes, '+
        counts.cancelled+' canceladas y '+counts.rejected+' rechazadas.':
        'La sección de órdenes aún no se reconoció ('+stage+
        '). No se puede afirmar que haya cero órdenes.'};
  }catch(error){
    diag.code=diag.phase==='ORDERS_SAVE'?'ORDERS_SAVE_FAILED':'ORDERS_ERROR';
    return {ok:false,error:String(error?.message||'Error consultando órdenes.')};
  }finally{
    if(tab)try{await chrome.tabs.remove(tab.id)}catch(_){}
    try{
      const saved=await uploadPrivateDiagnostic(diag);
      await chrome.storage.local.set({orderHistoryDiagnosticUploaded:saved?.ok===true,
        orderHistoryDiagnosticCode:diag.code,orderHistoryDiagnosticPhase:diag.phase});
    }catch(error){
      await chrome.storage.local.set({orderHistoryDiagnosticUploaded:false,
        orderHistoryDiagnosticCode:'ORDERS_SAVE_FAILED',
        orderHistoryDiagnosticPhase:diag.phase});
    }
  }
}


// This Chrome-injected function only fills a prepared virtual Reto order.
// The actual Comprar/Calcular orden controls are NEVER activated here.
async function orderFillFieldsOnVisaDetail(order){
  const result={ok:false,stage:'UNVERIFIED',submitted_orders:0};
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ').trim().toLowerCase();
  const visible=el=>!!(el&&typeof el.getClientRects==='function'&&
    el.getClientRects().length&&!el.disabled);
  if(!location.hash.includes('/capitales/detalle/DetalleAcciones'))
    return {...result,stage:'WRONG_ROUTE'};
  if(order?.symbol!=='V'||!Number.isInteger(order.quantity)||
    order.quantity<1||order.quantity>1000||
    !Number.isFinite(order.limit_mxn)||order.limit_mxn<=0)
    return {...result,stage:'INVALID_APPROVED_DRAFT'};
  const company=[...document.querySelectorAll('h1,h2,h3,h4,span,div,strong')]
    .filter(visible).some(el=>norm(el.innerText)==='visa inc.');
  if(!company)return {...result,stage:'VISA_IDENTITY_NOT_VERIFIED'};
  const panels=[...document.querySelectorAll(
    'aside,[role="complementary"],mat-sidenav,mat-drawer,.mat-drawer,.mat-sidenav')]
    .filter(visible).filter(el=>{
      const t=norm(el.innerText);
      return t.includes('titulos')&&t.includes('precio limite')&&
        t.includes('calcular orden');
    });
  if(panels.length!==1)return {...result,stage:'ORDER_PANEL_AMBIGUOUS'};
  const panel=panels[0];
  const inputs=[...panel.querySelectorAll('input')]
    .filter(visible).filter(el=>['text','number','tel'].includes(
      String(el.type||'text').toLowerCase())&&!el.readOnly);
  if(inputs.length!==2)return {...result,stage:'ORDER_INPUTS_AMBIGUOUS'};
  const candidates=[...panel.querySelectorAll('label,span,small,strong,div')]
    .filter(visible).filter(el=>{
      const t=norm(el.innerText);
      return t==='titulos'||t==='precio limite';
    });
  const nearest=(name)=>{
    const labels=candidates.filter(el=>norm(el.innerText)===name);
    if(labels.length===0)return null;
    const possible=[];
    for(const lab of labels){
      const r=lab.getBoundingClientRect?.();
      if(!r)continue;
      for(const input of inputs){
        const b=input.getBoundingClientRect?.();
        if(!b)continue;
        const dx=Math.abs(b.left-r.left),dy=b.top-r.bottom;
        if(dx<=125&&dy>=-15&&dy<=95)
          possible.push({input,score:dx+Math.abs(dy)*2});
      }
    }
    possible.sort((a,b)=>a.score-b.score);
    return possible.length&&(possible.length===1||
      possible[0].score+15<possible[1].score)?possible[0].input:null;
  };
  const qtyInput=nearest('titulos'),priceInput=nearest('precio limite');
  if(!qtyInput||!priceInput||qtyInput===priceInput)
    return {...result,stage:'ORDER_LABEL_MAPPING_UNVERIFIED'};
  // Refuse to replace any already-entered quantity.
  if(qtyInput.value&&qtyInput.value!=='0')
    return {...result,stage:'QUANTITY_ALREADY_ENTERED'};
  const parse=x=>Number(String(x||'').replace(/[^\d.-]/g,''));
  const setter=(field,value)=>{
    const proto=Object.getPrototypeOf(field);
    const descriptor=Object.getOwnPropertyDescriptor(proto,'value')||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    if(descriptor?.set)descriptor.set.call(field,value);
    else field.value=value;
    field.dispatchEvent(new Event('input',{bubbles:true}));
    field.dispatchEvent(new Event('change',{bubbles:true}));
  };
  setter(qtyInput,String(order.quantity));
  setter(priceInput,order.limit_mxn.toFixed(2));
  if(parse(qtyInput.value)!==order.quantity||
    Math.abs(parse(priceInput.value)-order.limit_mxn)>.02)
    return {...result,stage:'FORM_DID_NOT_ACCEPT_VALUES'};
  return {ok:true,stage:'DRAFT_FILLED_FOR_MANUAL_CONFIRMATION',
    symbol:'V',quantity:order.quantity,limit_mxn:order.limit_mxn,
    submitted_orders:0,final_confirmation_required:true};
}
async function orderStageApprovedVisa(){
  const data=(await chrome.storage.local.get('orderDraftCache')).orderDraftCache;
  if(!data||data.approved!==true||
    !Array.isArray(data.approved_symbols)||!data.approved_symbols.includes('V')||
    Date.now()>Date.parse(data.expires_at))
    return {ok:false,error:'No hay propuesta vigente de V aprobada para preparación.'};
  const order=data.orders.find(x=>x.symbol==='V'&&x.side==='BUY');
  if(!order)return {ok:false,error:'La aprobación no incluye una compra de Visa.'};
  // An approved draft is valid only for 5 minutes; never use stale limits.
  if(!Number.isFinite(order.limit_mxn)||!Number.isInteger(order.quantity))
    return {ok:false,error:'Cantidad o precio del borrador no verificables.'};
  const inspected=await orderInspectUi();
  if(!inspected?.ok||!inspected?.order_form_verified||!inspected.detail_tab_id)
    return {ok:false,error:inspected?.message||inspected?.error||
      'No se verificó el formulario real de Visa.'};
  if(Date.now()>Date.parse(data.expires_at))
    return {ok:false,error:'La propuesta venció durante la navegación. Sin cambios al formulario.'};
  const rows=await chrome.scripting.executeScript({
    target:{tabId:inspected.detail_tab_id},func:orderFillFieldsOnVisaDetail,
    args:[{symbol:'V',quantity:order.quantity,limit_mxn:order.limit_mxn}],
    world:'ISOLATED'
  });
  const response=rows?.[0]?.result;
  if(response?.ok&&response.submitted_orders===0){
    await chrome.storage.local.set({orderReviewStatus:
      'Formulario de V preparado; confirma personalmente en Actinver.'});
    return {ok:true,stage:response.stage,submitted_orders:0,
      message:'Se cargaron los títulos y precio límite de V. Revisa y confirma personalmente en Actinver. No se envió la orden.'};
  }
  return {ok:false,status:response?.stage||'STAGE_UNVERIFIED',
    error:'La interfaz no permitió identificar con seguridad los campos ('+
      (response?.stage||'SIN_DATOS')+'). No se envió ninguna orden.'};
}
