// Private portfolio sync. No account data is ever sent to the public quotes repository.
// A separate fine-grained token may write only to a VERIFIED PRIVATE GitHub repository.
'use strict';
const PRIVATE_PATH = 'actinver/portfolio-latest.json';
const PRIVATE_TTL_MS = 30 * 60 * 1000;
let privateUploading = false;
const privateRepoPattern = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const privateSitePattern = /^https:\/\/(?:www\.)?retoactinver\.com(?:[\/:#?]|$)/i;
async function privateState(message) {
  await chrome.storage.local.set({privateSyncStatus:message});
}
async function verifyPrivateRepo(repository, token) {
  if (!privateRepoPattern.test(repository) || !/^github_pat_[A-Za-z0-9_]+$/.test(token))
    throw Error('Repositorio o token privado no válidos.');
  const r=await fetch('https://api.github.com/repos/'+repository,{
    headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
    cache:'no-store'
  });
  if (!r.ok) throw Error('No se puede verificar el repositorio privado (HTTP '+r.status+').');
  const info=await r.json();
  if (info.private!==true || info.full_name?.toLowerCase()!==repository.toLowerCase())
    throw Error('BLOQUEADO: el repositorio debe ser PRIVADO.');
  if (info.permissions?.push===false)
    throw Error('El token no tiene acceso de escritura al repositorio privado.');
  return true;
}
// Recover a private-only token accidentally saved in the public token field.
// It is tested against the exact existing PRIVATE repo; no secret leaves Brave
// except as an Authorization header to api.github.com.
async function recoverMisplacedPrivateToken() {
  const state=await chrome.storage.local.get(['githubToken','privateToken','privateRepo','privateEnabled']);
  if(state.privateEnabled && state.privateToken) return {configured:true,recovered:false};
  const candidate=state.privateToken || state.githubToken;
  if(!candidate) return {configured:false,recovered:false};
  const repository=state.privateRepo || 'youteachtk/investmentChecker-private';
  try {
    await verifyPrivateRepo(repository,candidate);
    await chrome.storage.local.set({
      privateRepo:repository,privateToken:candidate,privateEnabled:true,
      privateSyncStatus:'Cartera privada conectada y token verificado. Sincronización automática activa.'
    });
    return {configured:true,recovered:true};
  }catch(error) {
    return {configured:false,recovered:false};
  }
}

async function configurePrivatePortfolio(msg) {
  const repository=String(msg.repository||'').trim();
  const token=String(msg.token||'').trim();
  await verifyPrivateRepo(repository,token);
  // Do not log, display or upload this token to public GitHub.
  await chrome.storage.local.set({privateRepo:repository,privateToken:token,privateEnabled:true,
    privateSyncStatus:'Repositorio privado verificado. Captura de cartera automática habilitada.'});
  return {ok:true};
}
async function capturePrivatePortfolio(tabId=null) {
  await recoverMisplacedPrivateToken();
  const s=await chrome.storage.local.get(['privateEnabled','privateRepo','privateToken']);
  if (!s.privateEnabled || !s.privateRepo || !s.privateToken)
    return {ok:false,error:'Cartera privada aún sin token verificado.'};
  const all=await chrome.tabs.query({});
  const actinver=all.filter(t=>Number.isInteger(t.id) && privateSitePattern.test(t.url||t.pendingUrl||''));
  const selected=actinver.find(t=>t.id===tabId) || actinver.find(t=>t.active) || actinver[0];
  if(!selected)return {ok:false,error:'La sesión de Actinver no está abierta.'};
  try{
    const executed=await chrome.scripting.executeScript({target:{tabId:selected.id},
      files:['portfolio-collector.js'],world:'ISOLATED'});
    const result=executed?.[0]?.result;
    return result&&typeof result==='object'?result:{ok:false,
      error:'La lectura privada no confirmó ningún resultado.'};
  }catch(error){
    if(!/No tab with id|tab was closed|No frame with id/i.test(String(error.message||'')))throw error;
    const refreshed=await chrome.tabs.query({});
    const fallback=refreshed.find(t=>t.id!==selected.id && privateSitePattern.test(t.url||''));
    if(!fallback)return {ok:false,error:'La pestaña de Actinver cambió. Se reintentará al abrirla.'};
    const executed=await chrome.scripting.executeScript({target:{tabId:fallback.id},
      files:['portfolio-collector.js'],world:'ISOLATED'});
    const result=executed?.[0]?.result;
    return result&&typeof result==='object'?{...result,recoveredTab:true}:
      {ok:false,error:'El segundo intento no confirmó lectura privada.'};
  }
}
function sanitizePrivateCapture(raw) {
  if (!raw || typeof raw!=='object') throw Error('Captura privada vacía.');
  const t=Date.parse(raw.captured_at);
  if (!Number.isFinite(t) || Math.abs(Date.now()-t)>60000) throw Error('Fecha de captura privada inválida.');
  const summary=raw.summary && Object.fromEntries(
    ['total_value','investments','buying_power','unsettled','change_mxn','change_pct']
      .filter(k=>typeof raw.summary[k]==='number' && Number.isFinite(raw.summary[k]))
      .map(k=>[k,raw.summary[k]])
  );
  let holdings=null;
  if (Array.isArray(raw.holdings) && raw.holdings.length<=100 && raw.holdings.length>0) {
    holdings=raw.holdings.map(v=>{
      const symbol=String(v.symbol||'').trim().toUpperCase();
      if (!/^[A-Z0-9 .&+/-]{1,48}$/.test(symbol) || !Number.isFinite(v.quantity) || v.quantity<=0)
        throw Error('Posición no válida.');
      const item={symbol,quantity:v.quantity};
      for(const k of ['cost_mxn','price_mxn','value_mxn'])
        if (typeof v[k]==='number' && Number.isFinite(v[k]) && v[k]>=0) item[k]=v[k];
      return item;
    });
  }
  return {captured_at:raw.captured_at,summary:summary && Object.keys(summary).length>=3?summary:null,holdings};
}
async function acceptPrivateCapture(msg,sender) {
  const s=await chrome.storage.local.get('privateEnabled');
  if(!s.privateEnabled) return {ok:false,error:'Sincronización privada no habilitada.'};
  if(!sender?.tab?.id || !privateSitePattern.test(sender.tab.url||'')) return {ok:false,error:'Origen no autorizado.'};
  const capture=sanitizePrivateCapture(msg.payload);
  if(!capture.summary && !capture.holdings) return {ok:false,error:'No se detectó información de cartera.'};
  const previous=await chrome.storage.local.get(['privateCache','privateLastSync']);
  const cache=previous.privateCache||{};
  if(capture.summary) cache.summary={at:capture.captured_at,values:capture.summary};
  if(capture.holdings) cache.holdings={at:capture.captured_at,values:capture.holdings};
  await chrome.storage.local.set({privateCache:cache});
  if(!cache.summary || !cache.holdings) {
    const missing=cache.summary?'posiciones (Tu inversión)':'resumen (Monitores)';
    await privateState('Captura parcial local. Falta '+missing+'. Reintento automático pendiente; ningún dato privado ha salido de Brave.');
    return {ok:true,partial:true};
  }
  const a=Date.parse(cache.summary.at),b=Date.parse(cache.holdings.at);
  if(!Number.isFinite(a)||!Number.isFinite(b)||Math.max(Date.now()-a,Date.now()-b)>PRIVATE_TTL_MS) {
    await privateState('La captura de cartera está incompleta o caducada; se actualizará al acceder a Actinver.');
    return {ok:true,partial:true};
  }
  // Avoid duplicate writes from React re-renders and the background tab.
  if (previous.privateLastSync && Date.now()-previous.privateLastSync<120000)
    return {ok:true,recentlySaved:true};
  const payload={schema_version:1,captured_at:new Date().toISOString(),
    summary:cache.summary.values,holdings:cache.holdings.values};
  if(Math.abs(payload.summary.total_value-payload.summary.investments-payload.summary.buying_power-(payload.summary.unsettled||0))>Math.max(100,payload.summary.total_value*.02))
    return {ok:false,error:'Resumen inconsistente. No se enviaron datos.'};
  if(privateUploading)return {ok:true,pending:true};
  privateUploading=true;
  try {
    await uploadPrivatePortfolio(payload);
    await chrome.storage.local.set({privateLastSync:Date.now()});
    await privateState('Cartera sincronizada SOLO al repositorio privado. '+new Date().toLocaleString('es-MX'));
    return {ok:true,uploaded:true};
  }catch(err) {
    await privateState('No se sincronizó la cartera privada: '+err.message);
    return {ok:false,error:err.message};
  }finally{privateUploading=false;}
}
async function uploadPrivatePortfolio(payload) {
  const s=await chrome.storage.local.get(['privateRepo','privateToken','privateEnabled']);
  if (!s.privateEnabled) throw Error('Desactivado.');
  // Recheck PRIVATE visibility every time, not only when configured.
  await verifyPrivateRepo(s.privateRepo,s.privateToken);
  const url='https://api.github.com/repos/'+s.privateRepo+'/contents/'+PRIVATE_PATH;
  const headers={Authorization:'Bearer '+s.privateToken,Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
  const get=await fetch(url,{headers,cache:'no-store'});
  if(!get.ok && get.status!==404) throw Error('No se puede comprobar el archivo privado (HTTP '+get.status+').');
  const sha=get.ok?(await get.json()).sha:undefined;
  const raw=JSON.stringify(payload,null,2)+'\n';
  const bytes=new TextEncoder().encode(raw);
  let binary='';for(const v of bytes)binary+=String.fromCharCode(v);
  const body={message:'Update private Actinver portfolio snapshot',content:btoa(binary),branch:'main'};
  if(sha) body.sha=sha;
  const result=await fetch(url,{method:'PUT',headers,body:JSON.stringify(body)});
  if(!result.ok) throw Error('GitHub privado rechazó la escritura (HTTP '+result.status+').');
}
// Bounded, de-identified real-session diagnostic. Written only to private repo.
// This is intentionally NOT a DOM dump and never includes names, tickers, URLs,
// account data, credentials, table values, HTML, cookies, or screenshots.
async function uploadPrivateDiagnostic(raw) {
  const keys=['category_index','page_index','retries','selected_tab_index',
    'tab_count','visible_rows','numeric_page_buttons','active_page','elapsed_seconds'];
  const stages=new Set(['START','CATEGORY','FIRST_PAGE','READ_PAGE','NEXT_PAGE','UPLOAD',
    'PRIVATE_START','PRIVATE_NAV','PRIVATE_READ','PRIVATE_DONE']);
  const codes=new Set(['TABS','PAGINATION','TABLE','TIMEOUT','OTHER',
    'PRIVATE_SUMMARY_MISSING','PRIVATE_HOLDINGS_MISSING',
    'PRIVATE_NAV_FAILED','PRIVATE_UPLOAD_FAILED','PRIVATE_OK']);
  if(!raw || typeof raw!=='object')return {ok:false,reason:'No diagnostic'};
  const portfolio=raw?.private_portfolio===true;
  const rateKey=portfolio?'lastPortfolioDiagnosticAt':'lastDiagnosticAt';
  const stored=await chrome.storage.local.get(['privateRepo','privateToken',
    'privateEnabled',rateKey]);
  if(!stored.privateEnabled||!stored.privateRepo||!stored.privateToken)
    return {ok:false,reason:'Private repository not connected'};
  if(stored[rateKey] && Date.now()-stored[rateKey]<5*60_000)
    return {ok:false,reason:'Diagnostic rate limited'};
  const payload={schema_version:1,
    captured_at:new Date().toISOString(),
    code:codes.has(raw.code)?raw.code:'OTHER',
    phase:stages.has(raw.phase)?raw.phase:'START'};
  for(const k of keys){
    const v=raw[k];
    payload[k]=Number.isInteger(v)&&v>=-1&&v<=1000?v:null;
  }
  if(portfolio){
    payload.private_portfolio=true;
    payload.summary_detected=raw.summary_detected===true;
    payload.holdings_detected=raw.holdings_detected===true;
    const navSteps=new Set(['not-attempted','already-open','menu-missing',
      'submenu-missing','menu-route','menu-table','menu-holdings',
      'submenu-route','submenu-table','submenu-holdings','submenu-inspect',
      'navigation-error']);
    payload.navigation_step=navSteps.has(raw.navigation_step)?
      raw.navigation_step:'not-attempted';
    // This field counts DOM tables, never the customer's holdings.
    payload.visible_tables=Number.isInteger(raw.visible_tables)&&
      raw.visible_tables>=0&&raw.visible_tables<=50?raw.visible_tables:null;
  }
  await verifyPrivateRepo(stored.privateRepo,stored.privateToken);
  const path=portfolio?'actinver/portfolio-diagnostic.json':
    'actinver/diagnostics-latest.json';
  const url='https://api.github.com/repos/'+stored.privateRepo+'/contents/'+path;
  const headers={Authorization:'Bearer '+stored.privateToken,
    Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
  const current=await fetch(url,{headers,cache:'no-store'});
  if(current.status!==404 && !current.ok)throw Error('Private diagnostic preflight '+current.status);
  const sha=current.ok?(await current.json()).sha:undefined;
  const str=JSON.stringify(payload,null,2)+'\n';
  const bin=Array.from(new TextEncoder().encode(str),b=>String.fromCharCode(b)).join('');
  const body={message:'Store sanitized Actinver DOM transition diagnostic',
    content:btoa(bin),branch:'main'};
  if(sha)body.sha=sha;
  const response=await fetch(url,{method:'PUT',headers,body:JSON.stringify(body)});
  if(!response.ok)throw Error('Private diagnostic HTTP '+response.status);
  await chrome.storage.local.set({[rateKey]:Date.now()});
  return {ok:true};
}

// One unified market + portfolio workflow. All extra navigation happens in an
// inactive temporary tab; Actinver's trading UI is never interacted with.
let privateDiscoveryBusy=false;
async function runPortfolioSync(marketTabId) {
  await recoverMisplacedPrivateToken();
  const settings=await chrome.storage.local.get([
    'privateEnabled','privateRepo','privateToken']);
  if(!settings.privateEnabled||!settings.privateRepo||!settings.privateToken)
    return {message:'La cartera privada todavía no está configurada.'};
  await privateState('Leyendo resumen y posiciones de inversión…');
  let navOK=false,navError=false,navStep='not-attempted';
  let initial=null,second=null;
  try{initial=await capturePrivatePortfolio(marketTabId);}
  catch(e){initial={ok:false,error:'Summary reader failed'};}
  let cache=(await chrome.storage.local.get('privateCache')).privateCache;
  let freshHoldings=!!(cache?.holdings&&
    Date.now()-Date.parse(cache.holdings.at)<PRIVATE_TTL_MS);
  if(!freshHoldings&&!privateDiscoveryBusy){
    privateDiscoveryBusy=true;
    let tmp=null;
    try{
      navStep='tab-create';
      tmp=await chrome.tabs.create({url:MONITOR_URL,openerTabId:marketTabId,active:false});
      if(!(await waitForPage(tmp.id)))throw Error('Portfolio tab did not load');
      const nav=await chrome.scripting.executeScript({
        target:{tabId:tmp.id},files:['portfolio-navigator.js'],
        world:'ISOLATED'
      });
      const state=nav?.[0]?.result;
      navStep=typeof state?.step==='string'?state.step:'navigation-error';
      navOK=state?.found===true;
      if(navOK){
        // Navigation alone is not success: the reader must actually return
        // positions and the private repository must acknowledge the upload.
        second=await capturePrivatePortfolio(tmp.id);
      }else{
        navError=true;
      }
    }catch(e){
      navError=true;
    }finally{
      if(tmp)try{await chrome.tabs.remove(tmp.id);}catch(_){}
      privateDiscoveryBusy=false;
    }
  }
  const state=await chrome.storage.local.get([
    'privateCache','privateLastSync']);
  cache=state.privateCache;
  const freshSummary=!!(cache?.summary&&
    Date.now()-Date.parse(cache.summary.at)<PRIVATE_TTL_MS);
  freshHoldings=!!(cache?.holdings&&
    Date.now()-Date.parse(cache.holdings.at)<PRIVATE_TTL_MS);
  const hasUpload=!!(state.privateLastSync&&
    Date.now()-state.privateLastSync<PRIVATE_TTL_MS);
  const code=hasUpload?'PRIVATE_OK':
    (!freshHoldings&&navError)?'PRIVATE_NAV_FAILED':
    !freshSummary?'PRIVATE_SUMMARY_MISSING':
    !freshHoldings?'PRIVATE_HOLDINGS_MISSING':
    'PRIVATE_UPLOAD_FAILED';
  try{
    await uploadPrivateDiagnostic({
      private_portfolio:true,phase:'PRIVATE_DONE',code,
      summary_detected:freshSummary,
      holdings_detected:freshHoldings,
      navigation_step:navStep,visible_tables:null
    });
  }catch(error){
    console.warn('[investmentChecker private diagnostics]',error.message);
  }
  if(hasUpload)return {message:'Cartera privada sincronizada · '+stamp()};
  const label={
    PRIVATE_SUMMARY_MISSING:'No se encontraron saldos en Capitales.',
    PRIVATE_NAV_FAILED:'No se logró abrir automáticamente Tu inversión.',
    PRIVATE_HOLDINGS_MISSING:'Tu inversión abrió, pero falta reconocer sus posiciones.',
    PRIVATE_UPLOAD_FAILED:'Lectura parcial; el archivo privado aún no se confirmó.'
  }[code]||'Captura privada pendiente.';
  await privateState(label+' Se guardó un diagnóstico técnico privado.');
  return {message:label};
}

// Silent opportunistic capture whenever the authenticated SPA changes screens;
// no extra clicks or manual uploads.
let lastPrivateProbe=new Map();
chrome.tabs.onUpdated.addListener((tabId,info,tab)=>{
  if((info.status!=='complete' && !info.url)||!privateSitePattern.test(tab.url||''))return;
  const last=lastPrivateProbe.get(tabId)||0;
  if(Date.now()-last<2500)return;
  lastPrivateProbe.set(tabId,Date.now());
  void chrome.storage.local.get('privateEnabled').then(s=>{
    if(s.privateEnabled)return capturePrivatePortfolio(tabId);
  }).catch(err=>console.warn('[investmentChecker private]',err.message));
});
chrome.tabs.onRemoved.addListener(tabId=>lastPrivateProbe.delete(tabId));
