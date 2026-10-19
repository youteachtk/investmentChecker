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
async function configurePrivatePortfolio(msg) {
  const repository=String(msg.repository||'').trim();
  const token=String(msg.token||'').trim();
  await verifyPrivateRepo(repository,token);
  // Do not log, display or upload this token to public GitHub.
  await chrome.storage.local.set({privateRepo:repository,privateToken:token,privateEnabled:true,
    privateSyncStatus:'Repositorio privado verificado. Abre Tu inversión para captar las posiciones.'});
  return {ok:true};
}
async function capturePrivatePortfolio(tabId=null) {
  const s=await chrome.storage.local.get(['privateEnabled','privateRepo','privateToken']);
  if (!s.privateEnabled || !s.privateRepo || !s.privateToken)
    return {ok:false,error:'Primero configura un repositorio PRIVADO para la cartera.'};
  const all=await chrome.tabs.query({});
  const tab=tabId!==null?all.find(t=>t.id===tabId):all.find(t=>t.active&&privateSitePattern.test(t.url||''))||all.find(t=>privateSitePattern.test(t.url||''));
  if (!tab || !privateSitePattern.test(tab.url||'')) return {ok:false,error:'Abre Actinver en Brave.'};
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['portfolio-collector.js'],world:'ISOLATED'});
  return {ok:true,message:'Captura local iniciada. El resumen y las posiciones deben estar accesibles en Actinver.'};
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
    await privateState('Captura parcial local. Falta '+missing+'. Ningún dato privado ha salido de Brave.');
    return {ok:true,partial:true};
  }
  const a=Date.parse(cache.summary.at),b=Date.parse(cache.holdings.at);
  if(!Number.isFinite(a)||!Number.isFinite(b)||Math.max(Date.now()-a,Date.now()-b)>PRIVATE_TTL_MS) {
    await privateState('La captura de cartera está incompleta o caducada. Abre Monitores y Tu inversión.');
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
// One unified market + portfolio workflow. All extra navigation happens in an
// inactive temporary tab; Actinver's trading UI is never interacted with.
let privateDiscoveryBusy=false;
async function runPortfolioSync(marketTabId) {
  const settings=await chrome.storage.local.get(['privateEnabled','privateRepo','privateToken']);
  if(!settings.privateEnabled || !settings.privateRepo || !settings.privateToken)
    return {message:'Mercado actualizado; cartera privada no configurada.'};
  await privateState('Mercado recibido. Leyendo cartera automáticamente…');
  await capturePrivatePortfolio(marketTabId);
  let cache=(await chrome.storage.local.get('privateCache')).privateCache;
  const freshHoldings=cache?.holdings && Date.now()-Date.parse(cache.holdings.at)<PRIVATE_TTL_MS;
  if(!freshHoldings && !privateDiscoveryBusy) {
    privateDiscoveryBusy=true;
    let tmp=null;
    try {
      // A read-only clone avoids disturbing the Actinver page the user is using.
      tmp=await chrome.tabs.create({url:MONITOR_URL,active:false});
      if(!(await waitForPage(tmp.id))) throw Error('No se pudo abrir la vista de inversiones.');
      const nav=await chrome.scripting.executeScript({
        target:{tabId:tmp.id},files:['portfolio-navigator.js'],world:'ISOLATED'
      });
      const found=nav?.[0]?.result;
      if(found?.found) await capturePrivatePortfolio(tmp.id);
      else await privateState('Mercado sincronizado; posiciones todavía no detectadas automáticamente.');
    }catch(err) {
      await privateState('Mercado sincronizado; posiciones pendientes: '+err.message);
    }finally {
      if(tmp)try{await chrome.tabs.remove(tmp.id);}catch(_){}
      privateDiscoveryBusy=false;
    }
  }
  cache=(await chrome.storage.local.get(['privateCache','privateLastSync','privateSyncStatus']));
  if(cache.privateLastSync && Date.now()-cache.privateLastSync < PRIVATE_TTL_MS)
    return {message:'Mercado y cartera privada sincronizados · '+stamp()};
  return {message:'Mercado sincronizado. Cartera pendiente de validar en Actinver.'};
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
