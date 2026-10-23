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
  let tab=null;
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
      'BUY_FORM_DETECTED']);
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
      ['OPEN_MARKET_ACTIONS','OPEN_BUY_FORM'].includes(step)).slice(0,2):[];
    const probe={schema_version:2,captured_at:new Date().toISOString(),
      target_symbol:'V',selected_symbol:raw.selected_symbol==='V'?'V':null,
      stage:stages.has(raw.stage)?raw.stage:'MARKET_NOT_READY',
      action_widget_count:Number.isInteger(raw.action_widget_count)?
        Math.min(500,Math.max(0,raw.action_widget_count)):null,
      form_detected:raw.form_detected===true,fields,
      side_panel_visible:raw.side_panel_visible===true,
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
    return {ok:true,status:probe.stage,action_widget_count:probe.action_widget_count,
      order_form_verified:probe.form_detected,submitted_orders:0,
      message:probe.form_detected?
        'Se abrió el formulario de compra de V en pestaña secundaria; se identificaron '+
        probe.fields.length+' controles. Diagnóstico privado guardado. No se envió ninguna compra.':
        'Inspección parcial de V ('+probe.stage+'). Panel lateral visible: '+(probe.side_panel_visible?'sí':'no')+'. Diagnóstico guardado en GitHub privado. No se envió ninguna compra.'};
  }catch(error){
    return {ok:false,error:String(error?.message||'No se pudo inspeccionar la interfaz.')};
  }finally{
    if(tab)try{await chrome.tabs.remove(tab.id);}catch(_){}
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
