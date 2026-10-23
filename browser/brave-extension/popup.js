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
    'syncStatus','syncRunning','privateSyncStatus','autoSync','lastSync','privateLastSync',
    'remoteControlEnabled','orderDraftCache','orderReviewStatus',
    'syncProgress','syncStartedAt','manualSyncRequest','manualSyncHandledId',
    'manualSyncStartedAt','manualSyncLastResult']);
  const publicOk=!!s.githubToken,privateOk=!!(s.privateEnabled && s.privateRepo && s.privateToken);
  $('connection').textContent=(publicOk?'✓ Token de cotizaciones guardado':'⚠ Sin token público')+'  ·  '+
    (privateOk?'✓ Acceso a cartera privada verificado':'⚠ Cartera privada pendiente');
  $('connection').className=publicOk && privateOk?'minor ok':'minor warn';
  if(document.activeElement!==$('privateRepo'))$('privateRepo').value=s.privateRepo||'';
  $('token').placeholder=publicOk?'Guardado; dejar vacío para conservar':'github_pat_…';
  $('privateToken').placeholder=privateOk?'Guardado; dejar vacío para conservar':'github_pat_…';
  const running=!!s.syncRunning &&
    Date.now()-(Number(s.syncStartedAt)||0)<7*60*1000;
  $('run').disabled=running || !publicOk;
  $('run').textContent=running?'Sincronización en curso…':'Sincronizar todo ahora';
  $('auto').textContent=s.autoSync?'Pausar sincronización automática':'Activar sincronización automática';
  $('remote').textContent=s.remoteControlEnabled===false?'Activar solicitudes desde ChatGPT':'Pausar solicitudes desde ChatGPT';
  if(!localMessage){
    const lines=[s.syncStatus||(publicOk?'Listo para sincronizar.':'Configura el token público.')];
    if(privateOk && s.privateSyncStatus && (!s.syncRunning)) lines.push(s.privateSyncStatus);
    show(lines.join('\n'));
  }
  // Read local telemetry instead of inferring success from hidden tabs.
  const progress=s.syncProgress||{};
  const count=Number.isInteger(progress.captured)?
    Math.min(226,Math.max(0,progress.captured)):0;
  $('syncProgress').value=count;
  $('syncCount').textContent=count+' / 226 instrumentos capturados en esta ejecución';
  const category=['ACCIONES','ETFs','FONDOS'].includes(progress.category)?
    progress.category:null;
  const phase=String(progress.stage||'');
  const stage=category?
    'Leyendo '+category+(Number.isInteger(progress.page)?
      ' · página '+progress.page:''):
    (phase||'Sin sincronización activa.');
  const inactivity=running && Number(progress.updatedAt)>0 &&
    Date.now()-progress.updatedAt>3*60*1000;
  $('syncStage').textContent=inactivity?
    'Sin avance confirmado desde hace más de 3 minutos. '+stage:stage;
  if(s.syncRunning&&!running){
    $('syncStage').textContent='La sincronización anterior perdió contacto o superó 7 minutos. Puedes reintentar.';
  }
  const request=s.manualSyncRequest,result=s.manualSyncLastResult;
  const pending=request && request.id!==result?.id &&
    !running && Date.now()-request.at>=12000 &&
    Date.now()-request.at<2*60*1000;
  if(pending){
    const acknowledged=s.manualSyncHandledId===request.id;
    const diagnosis=acknowledged?
      'Brave recibió la solicitud, pero no confirmó el arranque.':
      'El proceso de fondo de Brave no respondió a la solicitud.';
    $('syncStage').textContent=diagnosis;
    show(diagnosis+' Revisa Configuración y diagnóstico; no hay nueva captura confirmada.');
  }else if(result && request?.id===result.id && result.ok===false && !running){
    const error='Inicio rechazado: '+(result.error||'error desconocido');
    $('syncStage').textContent=error;
    if(!localMessage)show(error);
  }
  $('syncFreshness').textContent=s.lastSync?
    'Último envío iniciado en GitHub: '+
      new Date(s.lastSync).toLocaleString('es-MX'):
    'Aún no hay un envío registrado.';
  const draft=s.orderDraftCache;
  if(draft?.ok && !draft.approved && Date.parse(draft.expires_at)>Date.now() &&
     draft.draft_id!==orderDraft?.draft_id)renderOrders(draft);
}
$('run').addEventListener('click',async()=>{
  // START_SYNC used to wait for an asynchronous service-worker reply, which
  // sometimes never reached this popup even though the worker was alive.
  // A browser alarm is durable and wakes the worker independently.
  $('run').disabled=true;
  const id='manual-'+Date.now().toString(36)+'-'+
    Math.random().toString(36).slice(2,10);
  try{
    await chrome.storage.local.set({
      manualSyncRequest:{id,at:Date.now()},
      syncStatus:'Solicitud recibida. Esperando a Brave para iniciar la lectura…',
      syncProgress:{stage:'Esperando proceso de fondo de Brave',
        category:null,page:null,captured:0,total:226,updatedAt:Date.now()}
    });
    await chrome.alarms.create('investmentchecker_manual_sync',{
      when:Date.now()+1000
    });
    // Try an immediate wake without awaiting it. If the message stalls,
    // Brave's own durable alarm will still dispatch the exact same request.
    void send({type:'WAKE_MANUAL_SYNC'});
    localMessage=null;
    await refresh();
  }catch(error){
    localMessage='No se pudo programar la lectura: '+
      String(error?.message||error);
    show(localMessage);
    $('run').disabled=false;
  }
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
  if(changes.syncStatus||changes.syncRunning||changes.privateSyncStatus||
     changes.privateEnabled||changes.privateLastSync||
     changes.orderDraftCache||changes.orderReviewStatus||
     changes.syncProgress||changes.lastSync||changes.syncStartedAt||
     changes.manualSyncRequest||changes.manualSyncHandledId||
     changes.manualSyncStartedAt||changes.manualSyncLastResult){
    localMessage=null;
    void refresh();
  }
});
void refresh();


// Batch trade preparation. Approval NEVER submits a transaction to Actinver.
let orderDraft=null;
const fmtMX=n=>Number(n).toLocaleString('es-MX',{
  minimumFractionDigits:2,maximumFractionDigits:2
});
function resetOrderSelection(){
  orderDraft=null;
  $('orderList').replaceChildren();
  $('orderConsent').checked=false;
  $('orderApprove').disabled=true;
}
function refreshOrderApproval(){
  const checked=[...$('orderList').querySelectorAll('input[type="checkbox"]')]
    .some(x=>x.checked);
  $('orderApprove').disabled=!orderDraft||!$('orderConsent').checked||!checked;
}
function renderOrders(result){
  resetOrderSelection();
  if(!result?.ok){
    $('orderMessage').textContent=result?.reason||result?.error||
      'Sin propuestas válidas. Actualiza cotizaciones y cartera.';
    return;
  }
  if(result.execution_enabled!==false || !Array.isArray(result.orders)) {
    $('orderMessage').textContent='No se pudo verificar que la ejecución esté bloqueada.';
    return;
  }
  orderDraft=result;
  $('orderMessage').textContent=
    'Datos recientes verificados. Vigencia hasta: '+
    new Date(result.expires_at).toLocaleTimeString('es-MX')+
    '. Efectivo disponible: $'+fmtMX(result.buying_power_mxn)+
    '. Importe estimado del lote: $'+fmtMX(result.estimated_spend_mxn)+'.';
  for(const o of result.orders){
    const container=document.createElement('div');container.className='order-line';
    const label=document.createElement('label');
    const input=document.createElement('input');input.type='checkbox';
    input.value=o.symbol;
    input.addEventListener('change',refreshOrderApproval);
    const text=document.createElement('span');
    const ticker=document.createElement('strong');
    ticker.textContent=o.symbol+' · '+o.quantity+' títulos';
    const detail=document.createElement('span');detail.className='order-detail';
    detail.textContent='Límite $'+fmtMX(o.limit_mxn)+
      ' · máximo estimado $'+fmtMX(o.estimated_total_mxn)+
      ' · diferencial '+Number(o.spread_pct).toFixed(3)+'%';
    text.append(ticker,detail);label.append(input,text);
    container.append(label);$('orderList').append(container);
  }
}
$('orderPreview').addEventListener('click',async()=>{
  $('orderPreview').disabled=true;
  $('orderMessage').textContent='Contrastando precios y cartera privada…';
  const result=await send({type:'ORDER_PREVIEW'});
  renderOrders(result);
  $('orderPreview').disabled=false;
});
$('orderConsent').addEventListener('change',refreshOrderApproval);
$('orderApprove').addEventListener('click',async()=>{
  if(!orderDraft||!$('orderConsent').checked)return;
  const selected=[...$('orderList').querySelectorAll('input[type="checkbox"]')]
    .filter(x=>x.checked).map(x=>x.value);
  if(!selected.length)return;
  $('orderApprove').disabled=true;
  const result=await send({type:'ORDER_APPROVE',
    draft_id:orderDraft.draft_id,symbols:selected,confirmed:true});
  if(!result?.ok){
    $('orderMessage').textContent=result?.error||'No se aceptó la revisión del lote.';
    resetOrderSelection();
    return;
  }
  $('orderMessage').textContent='Lote revisado y preparado: '+
    result.orders.map(o=>o.symbol+' ('+o.quantity+')').join(', ')+
    '. Ninguna orden fue enviada a Actinver.';
  resetOrderSelection();
});
$('orderInspect').addEventListener('click',async()=>{
  $('orderInspect').disabled=true;
  $('orderMessage').textContent='Inspeccionando controles de compra sin realizar operaciones…';
  const response=await send({type:'ORDER_INSPECT_UI'});
  $('orderMessage').textContent=response?.message||response?.error||
    'No se pudo inspeccionar la pantalla.';
  $('orderInspect').disabled=false;
});

$('verifyQuotes').addEventListener('click',async()=>{
  $('verifyQuotes').disabled=true;
  $('syncVerified').textContent='Comprobando cotizaciones públicas en GitHub…';
  const result=await send({type:'CHECK_QUOTES'});
  if(!result?.ok){
    $('syncVerified').textContent=result?.error||'No se pudo verificar el archivo.';
  }else{
    const when=new Date(result.validated_at);
    $('syncVerified').textContent='GitHub confirma '+result.total+
      ' cotizaciones validadas el '+when.toLocaleString('es-MX')+
      '. Esta fecha demuestra si la captura realmente se actualizó.';
  }
  $('verifyQuotes').disabled=false;
});
void refresh();
setInterval(()=>{void refresh();},1500);
