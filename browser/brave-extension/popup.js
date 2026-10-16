'use strict';
const $ = id => document.getElementById(id);
const POPUP_VERSION = chrome.runtime.getManifest().version;
$('version').textContent = 'v'+POPUP_VERSION;
let showingLocalError = false;
function show(text) { $('status').textContent = String(text); }
async function refresh() {
  try {
    const s = await chrome.storage.local.get(['githubToken','autoSync','syncStatus','syncRunning']);
    $('token').placeholder = s.githubToken ? 'Token ya guardado (escribe solo para cambiarlo)' : 'github_pat_...';
    $('run').disabled = !!s.syncRunning;
    $('run').textContent = s.syncRunning ? 'Sincronización en curso…' : 'Sincronizar las 226 cotizaciones';
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
$('run').addEventListener('click', async () => {
  showingLocalError = false;
  show('Comprobando token y página de Actinver…');
  $('run').disabled = true;
  const reply = await ask({type:'START_SYNC'});
  if (!reply) { $('run').disabled = false; return; }
  if (reply.version !== POPUP_VERSION) {
    showingLocalError = true;
    show('Se mezclaron dos versiones de la extensión. Abre brave://extensions y pulsa Recargar en investmentChecker.');
    $('run').disabled = false;
    return;
  }
  if (!reply.ok) {
    showingLocalError = true;
    show('No se inició: ' + (reply.error || 'error desconocido'));
    $('run').disabled = false;
  } else { await refresh(); }
});
$('diagnose').addEventListener('click', async () => {
  showingLocalError = true;
  show('Buscando pestañas en Brave…');
  const reply = await ask({type:'DIAGNOSE'});
  if (reply) show(reply.diagnostic || ('Error: ' + (reply.error || 'sin respuesta')));
});
$('auto').addEventListener('click', async () => {
  showingLocalError = false;
  show('Actualizando sincronización automática…');
  const r = await ask({type:'TOGGLE_AUTO'});
  if (r && !r.ok) { showingLocalError = true; show('No se pudo cambiar: ' + r.error); }
  else if (r) await refresh();
});
chrome.storage.onChanged.addListener((changes,area) => {
  if (area==='local' && (changes.syncStatus || changes.syncRunning || changes.autoSync || changes.githubToken)) {
    showingLocalError = false;
    void refresh();
  }
});
void refresh();
