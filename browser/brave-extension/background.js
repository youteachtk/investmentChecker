'use strict';
const WORKFLOW_URL = 'https://api.github.com/repos/youteachtk/investmentChecker/actions/workflows/ingest_quotes.yml/dispatches';
const ACTINVER = /^https:\/\/(?:www\.)?retoactinver\.com(?:[\/:#?]|$)/i;
const stamp = () => new Date().toLocaleString('es-MX');
const MAX_RUN_AGE_MS = 7 * 60 * 1000;

async function setStatus(message, running) {
  await chrome.storage.local.set({syncStatus:message, syncRunning:running});
}

// Access only tab URL metadata; never store or upload other tabs' URLs.
async function getActinverTabs(){
  const all=await chrome.tabs.query({});
  return {allCount:all.length,matches:all.filter(t=>t?.id && ACTINVER.test(t.url||t.pendingUrl||''))};
}
async function getTabDiagnostics(){
  const {allCount,matches}=await getActinverTabs();
  let sitePermission='no se pudo determinar';
  try {
    const granted=await chrome.permissions.contains({origins:['https://retoactinver.com/*']});
    sitePermission=granted?'concedido':'no concedido';
  }catch(_){}
  let diagnostic='Brave detecta '+allCount+' pestaña(s). Actinver: '+matches.length+'. Permiso del sitio: '+sitePermission+'.';
  if(!matches.length) diagnostic+=' Si Actinver sigue abierto en esta misma instalación de Brave, revisa el Acceso al sitio en Detalles de esta extensión.';
  return {allCount,matchCount:matches.length,sitePermission,diagnostic};
}

const MONITOR_URL = 'https://retoactinver.com/RetoActinver/#/capitales';
const isMonitorTab = t => /\/#\/capitales(?:[/?#]|$)/i.test(t?.url || '');
async function waitForPage(tabId, maxMs=25000) {
  const until=Date.now()+maxMs;
  while(Date.now()<until) {
    try {
      const tab=await chrome.tabs.get(tabId);
      if(tab.status==='complete') {await new Promise(r=>setTimeout(r,1100));return true;}
    }catch{return false;}
    await new Promise(r=>setTimeout(r,350));
  }
  return false;
}
async function cleanupTemporarySyncTab(expectedId=null,ownerId=null) {
  const s=await chrome.storage.local.get(['syncTemporaryTabId','syncRunId','syncTempRunId']);
  if(!s.syncTemporaryTabId)return;
  if(ownerId!==null && (s.syncTempRunId!==ownerId || s.syncRunId!==ownerId))return;
  if(expectedId!==null && expectedId!==s.syncTemporaryTabId)return;
  const tabId=s.syncTemporaryTabId;
  await chrome.storage.local.remove('syncTemporaryTabId');
  try{await chrome.tabs.remove(tabId);}catch(_){}
}
// Chrome can discard a background tab between opening and script injection.
// Retry once with a new, independently owned temporary tab rather than failing
// with the raw error "No tab with id: ...".
async function injectQuotesWithRetry(firstTabId, runId) {
  let tabId=firstTabId;
  for(let attempt=0;attempt<2;attempt++){
    try{
      await chrome.tabs.get(tabId);
      await chrome.storage.local.set({syncTabId:tabId});
      await chrome.scripting.executeScript({
        target:{tabId},files:['collector.js'],world:'ISOLATED'
      });
      return;
    }catch(err){
      const missing=/No tab with id|tab was closed|No frame with id/i.test(String(err?.message||''));
      if(!missing||attempt===1){
        await setStatus('Error de lectura de Actinver: '+(missing?'pestaña cerrada durante la captura':err.message),false);
        await cleanupTemporarySyncTab(null,runId);
        return;
      }
      const old=tabId;
      // Only clean up the failed temporary tab, not another run's tab.
      await cleanupTemporarySyncTab(old,runId);
      const found=await getActinverTabs();
      const existing=found.matches.find(t=>t.id!==old&&isMonitorTab(t));
      if(existing){tabId=existing.id;continue;}
      const created=await chrome.tabs.create({url:MONITOR_URL,active:false});
      tabId=created.id;
      await chrome.storage.local.set({syncTemporaryTabId:tabId,syncTempRunId:runId});
      if(!(await waitForPage(tabId))) {
        await setStatus('Error: no cargó Monitores después de reintentar.',false);
        await cleanupTemporarySyncTab(tabId,runId);
        return;
      }
    }
  }
}

async function startSync(tabId = null) {
  const s=await chrome.storage.local.get(['githubToken','syncRunning','syncStartedAt']);
  if(!s.githubToken)return {ok:false,error:'Aún no hay token de cotizaciones públicas.'};
  if(s.syncRunning && s.syncStartedAt && Date.now()-s.syncStartedAt<MAX_RUN_AGE_MS)
    return {ok:false,error:'Ya hay una sincronización en curso.'};
  const found=await getActinverTabs();
  if(!found.matches.length)return {ok:false,error:'Abre Actinver con sesión iniciada; se sincronizará automáticamente.'};
  // If a private-only token was put in the public box, recover it before
  // attempting both independent channels.
  await recoverMisplacedPrivateToken();
  const runId='sync-'+Date.now()+'-'+Math.floor(Math.random()*100000);
  await chrome.storage.local.set({syncRunId:runId,syncStartedAt:Date.now(),syncRunning:true,
    syncStatus:'Sincronizando cotizaciones y cartera…'});
  try {
    let tab=(tabId!==null?found.matches.find(t=>t.id===tabId&&isMonitorTab(t)):null)
      ||found.matches.find(t=>isMonitorTab(t)&&t.active)
      ||found.matches.find(isMonitorTab);
    if(!tab){
      tab=await chrome.tabs.create({url:MONITOR_URL,active:false});
      await chrome.storage.local.set({syncTemporaryTabId:tab.id,syncTempRunId:runId});
      if(!(await waitForPage(tab.id)))throw Error('No se pudo abrir Monitores.');
    }
    // Start the private read-only portfolio sync independently of market quotes.
    // A delayed ETF table must never block positions or available balance.
    void runPortfolioSync(tab.id)
      .then(result=>chrome.storage.local.set({privateSyncStatus:result?.message||'Lectura privada completada.'}))
      .catch(error=>chrome.storage.local.set({privateSyncStatus:'Cartera: '+error.message}));
    void injectQuotesWithRetry(tab.id,runId);
    return {ok:true};
  }catch(error){
    await setStatus('Error al iniciar lectura: '+error.message,false);
    await cleanupTemporarySyncTab(null,runId);
    return {ok:false,error:error.message};
  }
}
async function upload(payload) {
  if (!payload || !Array.isArray(payload.rows) || payload.rows.length!==226)
    throw Error('El catálogo está incompleto, no se enviarán datos.');
  const body = JSON.stringify(payload);
  if (body.length > 62000) throw Error('Captura demasiado larga para GitHub Actions.');
  const {githubToken}=await chrome.storage.local.get('githubToken');
  if (!githubToken) throw Error('Falta token de GitHub.');
  const response=await fetch(WORKFLOW_URL,{
    method:'POST',
    headers:{Authorization:'Bearer '+githubToken,Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},
    body:JSON.stringify({ref:'main',inputs:{payload:body}})
  });
  if (response.status!==204) {
    const detail=(await response.text()).slice(0,250);
    throw Error('GitHub respondió '+response.status+' '+detail);
  }
}
async function route(msg,sender) {
  if (msg?.type==='PRIVATE_CONFIG') return await configurePrivatePortfolio(msg);
  if (msg?.type==='PRIVATE_START') return await capturePrivatePortfolio();
  if (msg?.type==='PRIVATE_CAPTURE') return await acceptPrivateCapture(msg,sender);
  if (msg?.type==='START_SYNC') return await startSync();
  if (msg?.type==='DIAGNOSE') return {ok:true,...await getTabDiagnostics()};
  if (msg?.type==='TOGGLE_AUTO') {
    const {autoSync}=await chrome.storage.local.get('autoSync');
    const enabled=!autoSync;
    await chrome.storage.local.set({autoSync:enabled});
    if (enabled) await chrome.alarms.create('quote_sync',{periodInMinutes:30});
    else await chrome.alarms.clear('quote_sync');
    return {ok:true,enabled};
  }
  if (['PROGRESS','COLLECT_FAILED','COLLECT_DONE'].includes(msg?.type)) {
    const {syncTabId,syncRunning,syncRunId}=await chrome.storage.local.get(['syncTabId','syncRunning','syncRunId']);
    if (sender.tab?.id!==syncTabId || !syncRunning) return {ok:false,error:'Captura no reconocida'};
    if (msg.type==='PROGRESS') {
      await setStatus(msg.status,true);
      return {ok:true};
    }
    if (msg.type==='COLLECT_FAILED') {
      await setStatus('Cotizaciones pendientes: '+(msg.reason||'lectura incompleta')+
        '. Guardando diagnóstico privado; la cartera se procesa por separado.',false);
      let diagnosticStatus='unavailable';
      try {
        const saved=await uploadPrivateDiagnostic(msg.diagnostic);
        diagnosticStatus=saved.ok?'saved':saved.reason;
      }catch(error){
        diagnosticStatus='upload_failed';
      }
      await chrome.storage.local.set({lastDiagnosticStatus:diagnosticStatus});
      await cleanupTemporarySyncTab(null,syncRunId);
      return {ok:true};
    }
    try {
      await setStatus('226 cotizaciones capturadas. Validando en GitHub…',true);
      await upload(msg.payload);
      await chrome.storage.local.set({lastSync:Date.now()});
      await setStatus('226 cotizaciones enviadas a GitHub · '+stamp()+
        '. Cartera privada en proceso independiente.',false);
      await cleanupTemporarySyncTab(null,syncRunId);
      return {ok:true};
    }catch(err) {
      await setStatus('Error en envío público: '+err.message+
        '. La cartera privada no se interrumpe.',false);
      await cleanupTemporarySyncTab(null,syncRunId);
      return {ok:false,error:err.message};
    }
  }
  return {ok:false,error:'Comando no reconocido'};
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  route(msg,sender).then(result=>reply({...result,version:'2.4.0'})).catch(async err=>{
    await setStatus('Error: '+err.message,false);
    reply({ok:false,error:err.message});
  });
  return true;
});
chrome.alarms.onAlarm.addListener(async alarm=>{
  if(alarm.name!=='quote_sync') return;
  const s=await chrome.storage.local.get(['autoSync','lastSync']);
  if(!s.autoSync || Date.now()-(s.lastSync||0)<28*60000) return;
  const tabs=await getActinverTabs();
  const tab=tabs.matches.find(t=>t.active);
  if(tab) await startSync(tab.id);
});
async function maybeAutoStart(){
  const s=await chrome.storage.local.get(['autoSync','lastSync','syncRunning','lastAutoAttempt']);
  if(!s.autoSync || s.syncRunning || Date.now()-(s.lastSync||0)<28*60000 ||
     Date.now()-(s.lastAutoAttempt||0)<3*60000)return;
  const tabs=await getActinverTabs();
  if(!tabs.matches.length)return;
  await chrome.storage.local.set({lastAutoAttempt:Date.now()});
  const result=await startSync();
  if(!result.ok)await setStatus('Esperando a Actinver: '+result.error,false);
}
async function ensureAutoSync(){
  const {autoSync}=await chrome.storage.local.get('autoSync');
  if(autoSync===false){await chrome.alarms.clear('quote_sync');return;}
  if(autoSync!==true)await chrome.storage.local.set({autoSync:true});
  await chrome.alarms.create('quote_sync',{periodInMinutes:30});
  await maybeAutoStart();
}
chrome.runtime.onInstalled.addListener(()=>{void ensureAutoSync();});
chrome.runtime.onStartup.addListener(()=>{void ensureAutoSync();});
chrome.tabs.onUpdated.addListener((tabId,info,tab)=>{
  if(info.status==='complete' && ACTINVER.test(tab.url||''))void maybeAutoStart();
});

// Remote read-only quote capture requests initiated from ChatGPT via GitHub.
importScripts('remote.js');
importScripts('private-sync.js');
