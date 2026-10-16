const WORKFLOW_URL = 'https://api.github.com/repos/youteachtk/investmentChecker/actions/workflows/ingest_quotes.yml/dispatches';
const ACTINVER = /^https:\/\/retoactinver\.com\/RetoActinver\//i;
const stamp = () => new Date().toLocaleString('es-MX');
let runningTab = null;

async function setStatus(syncStatus, syncRunning) {
  await chrome.storage.local.set({syncStatus, syncRunning});
}
async function startSync(tabId = null, scheduled = false) {
  const v = await chrome.storage.local.get(['githubToken','syncRunning']);
  if (!v.githubToken) return {ok:false,error:'Primero guarda tu token de GitHub.'};
  if (v.syncRunning || runningTab !== null) return {ok:false,error:'Ya hay una sincronización en curso.'};
  let tab;
  if (tabId !== null) {
    tab = await chrome.tabs.get(tabId);
  } else {
    const tabs=await chrome.tabs.query({active:true,currentWindow:true});
    tab=tabs[0];
  }
  if (!tab?.id || !ACTINVER.test(tab.url || ''))
    return {ok:false,error:'Abre https://retoactinver.com/RetoActinver/#/capitales (Monitores).'};
  runningTab = tab.id;
  await setStatus('Iniciando recolección · '+stamp(),true);
  try {
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['collector.js'],world:'ISOLATED'});
    return {ok:true};
  } catch(err) {
    runningTab=null;
    await setStatus('Error al ejecutar en Brave: '+err.message,false);
    return {ok:false,error:'No fue posible leer Monitores: '+err.message};
  }
}
async function upload(payload) {
  const {githubToken} = await chrome.storage.local.get('githubToken');
  if (!githubToken) throw Error('Falta token de GitHub');
  const response=await fetch(WORKFLOW_URL,{
    method:'POST',
    headers:{
      Authorization:'Bearer '+githubToken,
      Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28',
      'Content-Type':'application/json'
    },
    body:JSON.stringify({ref:'main',inputs:{payload:JSON.stringify(payload)}})
  });
  if (response.status !== 204) {
    const detail=(await response.text()).slice(0,220);
    throw Error('GitHub rechazó envío ('+response.status+'): '+detail);
  }
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  (async()=>{
    if (msg?.type==='START_SYNC') return await startSync();
    if (msg?.type==='TOGGLE_AUTO') {
      const {autoSync}=await chrome.storage.local.get('autoSync');
      const enabled=!autoSync;
      await chrome.storage.local.set({autoSync:enabled});
      if (enabled) await chrome.alarms.create('quote_sync',{periodInMinutes:30});
      else await chrome.alarms.clear('quote_sync');
      return {ok:true,enabled};
    }
    if (msg?.type==='PROGRESS') {
      if (sender.tab?.id!==runningTab) return {ok:false};
      await setStatus(msg.status,true);
      return {ok:true};
    }
    if (msg?.type==='COLLECT_FAILED') {
      if (sender.tab?.id!==runningTab) return {ok:false};
      runningTab=null;
      await setStatus('No se enviaron datos: '+msg.reason,false);
      return {ok:true};
    }
    if (msg?.type==='COLLECT_DONE') {
      if (sender.tab?.id!==runningTab) return {ok:false};
      try {
        if (msg.payload?.rows?.length!==226) throw Error('Catálogo incompleto');
        await setStatus('226 cotizaciones capturadas. Enviando a GitHub…',true);
        await upload(msg.payload);
        await chrome.storage.local.set({lastSync:Date.now()});
        await setStatus('Datos enviados · '+stamp()+'. Espera marca verde en GitHub Actions para confirmar su validación.',false);
        return {ok:true};
      } catch(err) {
        await setStatus('Error de sincronización: '+err.message,false);
        return {ok:false,error:err.message};
      } finally {runningTab=null;}
    }
    return {ok:false,error:'Acción no admitida'};
  })().then(reply).catch(async err=>{
    if (msg?.type==='COLLECT_DONE' || msg?.type==='COLLECT_FAILED') runningTab=null;
    await setStatus('Error: '+err.message,false);
    reply({ok:false,error:err.message});
  });
  return true;
});
chrome.alarms.onAlarm.addListener(async alarm=>{
  if(alarm.name!=='quote_sync') return;
  const v=await chrome.storage.local.get(['autoSync','lastSync']);
  if(!v.autoSync || Date.now()-(v.lastSync||0)<28*60000) return;
  const tabs=await chrome.tabs.query({url:'https://retoactinver.com/RetoActinver/*'});
  const tab=tabs.find(t=>t.active && ACTINVER.test(t.url||''));
  if(!tab) return;
  await startSync(tab.id,true);
});
chrome.runtime.onInstalled.addListener(async ()=>{
  const {autoSync}=await chrome.storage.local.get('autoSync');
  if(autoSync) await chrome.alarms.create('quote_sync',{periodInMinutes:30});
});
