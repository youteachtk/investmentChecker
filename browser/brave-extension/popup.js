'use strict';
const $=id=>document.getElementById(id);
$('version').textContent='v'+chrome.runtime.getManifest().version;
let localMessage=null;
function show(v){$('status').textContent=String(v);}
async function send(msg) {
  try{return await chrome.runtime.sendMessage(msg);}
  catch(e){return {ok:false,error:'Recarga la extensión en brave://extensions: '+e.message};}
}
async function refresh(){
  const s=await chrome.storage.local.get(['githubToken','privateToken','privateRepo','privateEnabled',
    'syncStatus','syncRunning','privateSyncStatus','autoSync','lastSync','privateLastSync','remoteControlEnabled']);
  const publicOk=!!s.githubToken,privateOk=!!(s.privateEnabled && s.privateRepo && s.privateToken);
  $('connection').textContent=(publicOk?'✓ Token de cotizaciones guardado':'⚠ Sin token público')+'  ·  '+
    (privateOk?'✓ Acceso a cartera privada verificado':'⚠ Cartera privada pendiente');
  $('connection').className=publicOk && privateOk?'minor ok':'minor warn';
  if(document.activeElement!==$('privateRepo'))$('privateRepo').value=s.privateRepo||'';
  $('token').placeholder=publicOk?'Guardado; dejar vacío para conservar':'github_pat_…';
  $('privateToken').placeholder=privateOk?'Guardado; dejar vacío para conservar':'github_pat_…';
  $('run').disabled=!!s.syncRunning || !publicOk;
  $('run').textContent=s.syncRunning?'Sincronización en curso…':'Sincronizar todo ahora';
  $('auto').textContent=s.autoSync?'Pausar sincronización automática':'Activar sincronización automática';
  $('remote').textContent=s.remoteControlEnabled===false?'Activar solicitudes desde ChatGPT':'Pausar solicitudes desde ChatGPT';
  if(!localMessage){
    const lines=[s.syncStatus||(publicOk?'Listo para sincronizar.':'Configura el token público.')];
    if(privateOk && s.privateSyncStatus && (!s.syncRunning)) lines.push(s.privateSyncStatus);
    show(lines.join('\n'));
  }
}
$('run').addEventListener('click',async()=>{
  localMessage='Iniciando sincronización completa…';show(localMessage);
  const r=await send({type:'START_SYNC'});
  if(!r?.ok){localMessage=r?.error||'No se pudo iniciar.';show(localMessage);}
  else {localMessage=null;await refresh();}
});
$('save').addEventListener('click',async()=>{
  const value=$('token').value.trim();
  if(!/^github_pat_[A-Za-z0-9_]+$/.test(value)){show('Introduce un token válido.');return;}
  await chrome.storage.local.set({githubToken:value});$('token').value='';localMessage=null;await refresh();
});
$('savePrivate').addEventListener('click',async()=>{
  const repository=$('privateRepo').value.trim(),token=$('privateToken').value.trim();
  const s=await chrome.storage.local.get(['privateToken','privateRepo']);
  const r=await send({type:'PRIVATE_CONFIG',repository:repository||s.privateRepo,
    token:token||s.privateToken});
  if(!r?.ok){show('No se verificó la conexión privada: '+r?.error);return;}
  $('privateToken').value='';localMessage=null;await refresh();
});
$('auto').addEventListener('click',async()=>{const r=await send({type:'TOGGLE_AUTO'});if(r?.ok){localMessage=null;await refresh();}else show(r?.error);});
$('remote').addEventListener('click',async()=>{
  const s=await chrome.storage.local.get('remoteControlEnabled');
  await chrome.storage.local.set({remoteControlEnabled:s.remoteControlEnabled===false?true:false});
  localMessage=null;await refresh();
});
$('diagnose').addEventListener('click',async()=>{const r=await send({type:'DIAGNOSE'});show(r?.diagnostic||r?.error||'No se completó el diagnóstico.');});
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=='local')return;
  if(changes.syncStatus||changes.syncRunning||changes.privateSyncStatus||changes.privateEnabled||changes.privateLastSync){
    localMessage=null;void refresh();
  }
});
void refresh();
