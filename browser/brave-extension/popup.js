const $ = id => document.getElementById(id);
const status = s => {$('status').textContent = s;};

async function refresh() {
  const v = await chrome.storage.local.get(['githubToken','autoSync','syncStatus','syncRunning','lastSync']);
  $('token').placeholder = v.githubToken ? 'Token guardado (escribe para sustituir)' : 'github_pat_...';
  $('auto').textContent = v.autoSync ? 'Desactivar sincronización automática' : 'Activar sincronización automática';
  $('run').disabled = !!v.syncRunning;
  status(v.syncStatus || 'Abre Actinver → Monitores y pulsa sincronizar.');
}
$('save').addEventListener('click', async () => {
  const token=$('token').value.trim();
  if (!/^github_pat_[A-Za-z0-9_]+$/.test(token)) {
    status('Pega un token fine-grained válido de GitHub. No compartas el token en el chat.');return;
  }
  await chrome.storage.local.set({githubToken:token});
  $('token').value='';
  status('Token guardado solo en el almacenamiento de esta extensión.');
  refresh();
});
$('run').addEventListener('click', async () => {
  const r=await chrome.runtime.sendMessage({type:'START_SYNC'});
  if (!r?.ok) status(r?.error || 'No se pudo empezar. Abre Actinver → Monitores.');
  else status('Extrayendo cotizaciones en Actinver. No navegues por sus pestañas mientras termina.');
  refresh();
});
$('auto').addEventListener('click', async () => {
  const r=await chrome.runtime.sendMessage({type:'TOGGLE_AUTO'});
  if (!r?.ok) status(r?.error || 'No se pudo cambiar la sincronización.');
  refresh();
});
chrome.storage.onChanged.addListener(changes => {
  if (changes.syncStatus || changes.syncRunning || changes.autoSync) refresh();
});
refresh();
