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
async function cleanupTemporarySyncTab() {
  const s=await chrome.storage.local.get('syncTemporaryTabId');
  if(s.syncTemporaryTabId) {
    try {await chrome.tabs.remove(s.syncTemporaryTabId);}catch(_){}
    await chrome.storage.local.remove('syncTemporaryTabId');
  }
}

async function startSync(tabId = null) {
  const s=await chrome.storage.local.get(['githubToken','syncRunning','syncStartedAt']);
  if(!s.githubToken)return {ok:false,error:'Aún no hay token público de GitHub.'};
  if(s.syncRunning && s.syncStartedAt && Date.now()-s.syncStartedAt<MAX_RUN_AGE_MS)
    return {ok:false,error:'Ya hay una sincronización en curso.'};
  const found=await getActinverTabs();
  if(!found.matches.length) return {ok:false,error:'Abre Actinver e inicia sesión en Brave. La extensión hará el resto.'};
  let tab=(tabId!==null ? found.matches.find(t=>t.id===tabId && isMonitorTab(t)):null)
    ||found.matches.find(t=>isMonitorTab(t)&&t.active)
    ||found.matches.find(isMonitorTab);
  if(!tab) {
    tab=await chrome.tabs.create({url:MONITOR_URL,active:false});
    await chrome.storage.local.set({syncTemporaryTabId:tab.id});
    if(!(await waitForPage(tab.id))) {
      await cleanupTemporarySyncTab();
      return {ok:false,error:'No se pudo abrir Monitores en segundo plano.'};
    }
  }
  await chrome.storage.local.set({syncTabId:tab.id,syncStartedAt:Date.now(),syncRunning:true,
    syncStatus:'Sincronizando mercado y cartera…'});
  void chrome.scripting.executeScript({target:{tabId:tab.id},files:['collector.js'],world:'ISOLATED'})
    .catch(async err=>{
      await setStatus('No se pudo leer Monitores: '+err.message,false);
      await cleanupTemporarySyncTab();
    });
  return {ok:true};
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
    const {syncTabId,syncRunning}=await chrome.storage.local.get(['syncTabId','syncRunning']);
    if (sender.tab?.id!==syncTabId || !syncRunning) return {ok:false,error:'Captura no reconocida'};
    if (msg.type==='PROGRESS') {
      await setStatus(msg.status,true);
      return {ok:true};
    }
    if (msg.type==='COLLECT_FAILED') {
      await setStatus('Error de cotizaciones: '+(msg.reason||'lectura incompleta'),false);
      await cleanupTemporarySyncTab();
      return {ok:true};
    }
    try {
      await setStatus('226 cotizaciones capturadas. Guardando y comprobando cartera…',true);
      await upload(msg.payload);
      await chrome.storage.local.set({lastSync:Date.now()});
      // One workflow: market capture AND private portfolio capture.
      const task=runPortfolioSync(syncTabId)
        .then(result=>setStatus(result?.message||'Cotizaciones enviadas a GitHub; cartera procesada · '+stamp(),false))
        .catch(err=>setStatus('Mercado sincronizado; cartera pendiente: '+err.message,false))
        .finally(()=>cleanupTemporarySyncTab());
      void task;
      return {ok:true};
    }catch(err) {
      await setStatus('No se pudo enviar cotizaciones: '+err.message,false);
      await cleanupTemporarySyncTab();
      return {ok:false,error:err.message};
    }
  }
  return {ok:false,error:'Comando no reconocido'};
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  route(msg,sender).then(result=>reply({...result,version:'2.2.0'})).catch(async err=>{
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
