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

async function startSync(tabId = null) {
  const s = await chrome.storage.local.get(['githubToken','syncRunning','syncStartedAt']);
  if (!s.githubToken) return {ok:false,error:'Primero guarda el token de GitHub en esta extensión.'};
  if (s.syncRunning && s.syncStartedAt && Date.now()-s.syncStartedAt < MAX_RUN_AGE_MS)
    return {ok:false,error:'Ya hay una sincronización en curso. Consulta el estado debajo del botón.'};
  const found=await getActinverTabs();
  const tab=tabId!==null
    ? found.matches.find(t=>t.id===tabId)
    : found.matches.find(t=>t.active)||found.matches[0];
  if(!tab) {
    const diag=await getTabDiagnostics();
    return {ok:false,error:'No encuentro Actinver. '+diag.diagnostic};
  }
  await chrome.storage.local.set({syncTabId:tab.id,syncStartedAt:Date.now(),syncRunning:true,
    syncStatus:'Conectado a Actinver. Leyendo las tablas…'});
  // Reply immediately instead of making the popup wait for the full capture.
  void chrome.scripting.executeScript({target:{tabId:tab.id},files:['collector.js'],world:'ISOLATED'})
    .catch(async err => {
      await setStatus('Brave no permitió ejecutar el recolector: ' + err.message, false);
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
      await setStatus('No se enviaron datos: ' + (msg.reason||'error de lectura'),false);
      return {ok:true};
    }
    try {
      await setStatus('226 cotizaciones capturadas. Enviando a GitHub…',true);
      await upload(msg.payload);
      await chrome.storage.local.set({lastSync:Date.now()});
      await setStatus('Enviado a GitHub · '+stamp()+'. Confirma una ejecución verde en Actions.',false);
      return {ok:true};
    } catch (err) {
      await setStatus('No se pudo enviar: '+err.message,false);
      return {ok:false,error:err.message};
    }
  }
  return {ok:false,error:'Comando no reconocido'};
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  route(msg,sender).then(result=>reply({...result,version:'2.0.0'})).catch(async err=>{
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
chrome.runtime.onInstalled.addListener(async()=>{
  const {autoSync}=await chrome.storage.local.get('autoSync');
  if(autoSync) await chrome.alarms.create('quote_sync',{periodInMinutes:30});
});

// Remote read-only quote capture requests initiated from ChatGPT via GitHub.
importScripts('remote.js');
