'use strict';
const $ = id => document.getElementById(id);
const POPUP_VERSION = chrome.runtime.getManifest().version;
$('version').textContent = 'v'+POPUP_VERSION;
let showingLocalError = false;
function show(text) { $('status').textContent = String(text); }
async function refresh() {
  try {
    const s = await chrome.storage.local.get(['githubToken','autoSync','remoteControlEnabled','syncStatus','syncRunning','privateEnabled','privateRepo','privateSyncStatus']);
    $('privateRepo').value=s.privateRepo||'';
    $('privateRun').disabled=!s.privateEnabled;
    $('privateStatus').textContent=s.privateSyncStatus||(s.privateEnabled?'Sincronización privada preparada.':'Necesitas configurar un repositorio privado.');
    $('token').placeholder = s.githubToken ? 'Token ya guardado (escribe solo para cambiarlo)' : 'github_pat_...';
    $('run').disabled = !!s.syncRunning;
    $('run').textContent = s.syncRunning ? 'Sincronización en curso…' : 'Sincronizar las 226 cotizaciones';
    $('remote').textContent = s.remoteControlEnabled === false ? 'Activar solicitudes desde ChatGPT' : 'Desactivar solicitudes desde ChatGPT';
    $('auto').textContent = s.autoSync ? 'Desactivar sincronización automática' : 'Activar sincronización automática';
    $('saved').textContent = s.githubToken ? '✓ Token de GitHub guardado' : '⚠ Aún no hay token de GitHub';
    if (!showingLocalError) show(s.syncStatus || 'Abre Actinver → Monitores y pulsa sincronizar.');
  } catch (err) {
    show('Error al leer el estado de la extensión: ' + err.message);
  }
}
async function ask(message) {
  try { return await chrome.runtime.sendMessage(message); }
  catch (err) {
    showingLocalError = true;
    show('No se pudo comunicar con Brave: ' + err.message + '. Abre brave://extensions y pulsa Recargar en investmentChecker.');
    return null;
  }
}
$('save').addEventListener('click', async () => {
  const token = $('token').value.trim();
  if (!/^github_pat_[A-Za-z0-9_]+$/.test(token)) {
    showingLocalError = true;
    show('El token debe empezar por github_pat_. No lo compartas en el chat.');
    return;
  }
  try {
    await chrome.storage.local.set({githubToken: token});
    $('token').value = '';
    showingLocalError = false;
    await chrome.storage.local.set({syncStatus:'Token guardado correctamente. Ya puedes pulsar Sincronizar.'});
    await refresh();
  } catch (err) { showingLocalError = true; show('No pude guardar el token: ' + err.message); }
});
// Diagnostics and manual sync run in the popup, independently of stale background commands.
const ACTINVER_URL = /^https:\/\/(?:www\.)?retoactinver\.com(?:[\/:#?]|$)/i;
async function getActinverTabs(){
  const all=await chrome.tabs.query({});
  return {allCount:all.length,matches:all.filter(t=>t?.id && ACTINVER_URL.test(t.url||t.pendingUrl||''))};
}
async function getDiagnostic(){
  const {allCount,matches}=await getActinverTabs();
  let allowed='no comprobado';
  try{
    allowed=(await chrome.permissions.contains({origins:['https://retoactinver.com/*']}))?'concedido':'no concedido';
  }catch(_){}
  return {matches,message:'Brave detecta '+allCount+' pestaña(s). Actinver: '+matches.length+'. Permiso del sitio: '+allowed+'.'};
}
$('diagnose').addEventListener('click',async()=>{
  showingLocalError=true;
  show('Diagnosticando directamente desde el panel…');
  try{const d=await getDiagnostic();show(d.message);}
  catch(err){show('Error de diagnóstico en Brave: '+err.message);}
});
$('run').addEventListener('click',async()=>{
  showingLocalError=true;
  $('run').disabled=true;
  show('Buscando Actinver directamente desde este panel…');
  try{
    const state=await chrome.storage.local.get(['githubToken','syncRunning','syncStartedAt']);
    if(!state.githubToken)throw Error('El token no está guardado. Pégalo en esta extensión.');
    if(state.syncRunning && state.syncStartedAt && Date.now()-state.syncStartedAt<7*60*1000)
      throw Error('Ya hay una sincronización en curso. Espera a que termine.');
    const d=await getDiagnostic();
    const tab=d.matches.find(t=>t.active)||d.matches[0];
    if(!tab)throw Error('No detecto la pestaña de Actinver. '+d.message);
    await chrome.storage.local.set({
      syncTabId:tab.id,syncStartedAt:Date.now(),syncRunning:true,
      syncStatus:'Pestaña de Actinver localizada. Extrayendo cotizaciones…'
    });
    showingLocalError=false;
    await refresh();
    void chrome.scripting.executeScript({target:{tabId:tab.id},files:['collector.js'],world:'ISOLATED'})
      .catch(async err=>{
        await chrome.storage.local.set({syncStatus:'Brave impidió extraer los datos: '+err.message,syncRunning:false});
      });
  }catch(err){
    showingLocalError=true;
    $('run').disabled=false;
    show('No se inició: '+err.message);
  }
});
$('remote').addEventListener('click', async () => {
  try {
    const s = await chrome.storage.local.get('remoteControlEnabled');
    const enabled = s.remoteControlEnabled === false;
    await chrome.storage.local.set({remoteControlEnabled: enabled});
    showingLocalError = false;
    show(enabled ? 'Solicitudes desde ChatGPT activadas. Brave comprobará GitHub aproximadamente cada 30 segundos.' : 'Solicitudes desde ChatGPT desactivadas. Puedes seguir sincronizando manualmente.');
    await refresh();
  } catch (err) { show('No se pudo cambiar la configuración remota: '+err.message); }
});
$('auto').addEventListener('click', async () => {
  showingLocalError = false;
  show('Actualizando sincronización automática…');
  const r = await ask({type:'TOGGLE_AUTO'});
  if (r && !r.ok) { showingLocalError = true; show('No se pudo cambiar: ' + r.error); }
  else if (r) await refresh();
});
chrome.storage.onChanged.addListener((changes,area) => {
  if (area==='local' && (changes.syncStatus || changes.syncRunning || changes.autoSync || changes.githubToken || changes.remoteControlEnabled || changes.privateSyncStatus || changes.privateEnabled)) {
    showingLocalError = false;
    void refresh();
  }
});

$('savePrivate').addEventListener('click',async()=>{
  const repository=$('privateRepo').value.trim(),token=$('privateToken').value.trim();
  $('privateStatus').textContent='Comprobando privacidad del repositorio…';
  const r=await ask({type:'PRIVATE_CONFIG',repository,token});
  if(!r?.ok){$('privateStatus').textContent='Bloqueado: '+(r?.error||'Error de configuración');return;}
  $('privateToken').value='';
  await refresh();
});
$('privateRun').addEventListener('click',async()=>{
  const r=await ask({type:'PRIVATE_START'});
  if(!r?.ok)$('privateStatus').textContent=r?.error||'No se inició la captura.';
  else $('privateStatus').textContent='Recopilación local iniciada…';
});
void refresh();
