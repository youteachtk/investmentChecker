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
    'orderHistoryLastRemoteStatus','orderHistoryLastRemoteAt',
    'orderHistoryDiagnosticCode','orderHistoryDiagnosticPhase',
    'orderHistoryDiagnosticUploaded','orderHistoryLastCheckedAt','orderHistoryCounts',
    'orderHistoryCombinedMessage','orderHistoryCombinedAt',
    'lastPublishedExtensionVersion','lastPublishedVersionCheckedAt',
    'lastNativeUpdateStatus','lastNativeUpdateError','lastNativeUpdateSucceeded',
    'syncProgress','syncStartedAt','manualSyncRequest','manualSyncHandledId',
    'manualSyncStartedAt','manualSyncLastResult']);
  const publicOk=!!s.githubToken,privateOk=!!(s.privateEnabled && s.privateRepo && s.privateToken);
  $('connection').textContent=(publicOk?'✓ Token de cotizaciones guardado':'⚠ Sin token público')+'  ·  '+
    (privateOk?'✓ Acceso a cartera privada verificado':'⚠ Cartera privada pendiente');
  $('connection').className=publicOk && privateOk?'minor ok':'minor warn';
  const currentVersion=chrome.runtime.getManifest().version;
  const publishedVersion=s.lastPublishedExtensionVersion;
  const versionParts=v=>String(v||'').split('.').map(Number);
  const newer=publishedVersion&&versionParts(publishedVersion).every(Number.isFinite)&&
    versionParts(publishedVersion).some((n,i)=>{
      const a=versionParts(currentVersion),b=versionParts(publishedVersion);
      return b.slice(0,i).every((x,j)=>x===a[j])&&n>a[i];
    });
  $('updateState').textContent=newer?
    'Disponible '+publishedVersion+' · instalada '+currentVersion+
    (s.lastNativeUpdateError?' · Falló el actualizador: '+s.lastNativeUpdateError:
      ' · comprobando instalación automática'):
    'Versión instalada '+currentVersion+
    (publishedVersion?' · publicada '+publishedVersion:
      ' · publicación pendiente de consultar');
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
  // Read progress from field-proven collector status strings.
  // No modification to the working 226-row collector is needed.
  const message=String(s.syncStatus||'');
  const match=/Capitales:\s*(ACCIONES|ETFs|FONDOS)\s+página\s+(\d+)\s*[·•-]\s*(\d+)\s*\/\s*(\d+)/i.exec(message);
  const offsets={ACCIONES:0,ETFS:145,FONDOS:201};
  const category=match?.[1]?.toUpperCase();
  const categoryLabel=category==='ETFS'?'ETFs':category;
  const count=match?Math.min(226,offsets[category]+Number(match[3])):
    /226 cotizaciones (?:enviadas|capturadas)/i.test(message)?226:0;
  $('syncProgress').value=count;
  $('syncCount').textContent=count+' / 226 instrumentos'+
    (match?' · '+categoryLabel+', página '+match[2]:'');
  $('syncStage').textContent=s.syncRunning&&!running?
    'La captura superó siete minutos. Revisa el estado antes de reintentar.':
    (message||'Sin sincronización activa.');
  $('syncFreshness').textContent=s.lastSync?
    'Último envío iniciado en GitHub: '+
      new Date(s.lastSync).toLocaleString('es-MX'):
    'Aún no hay un envío registrado.';
  if(s.orderHistoryCombinedMessage&&
    Date.parse(s.orderHistoryCombinedAt)>=Date.parse(s.orderHistoryLastCheckedAt||'1970-01-01')){
    $('orderHistoryMessage').textContent=s.orderHistoryCombinedMessage;
  }else if(s.orderHistoryLastRemoteAt || s.orderHistoryLastCheckedAt){
    const dates=[s.orderHistoryLastRemoteAt,s.orderHistoryLastCheckedAt]
      .filter(value=>Number.isFinite(Date.parse(value)));
    const when=dates.sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||null;
    const stamp=Number.isFinite(Date.parse(when))?
      new Date(when).toLocaleString('es-MX'):'';
    const code=s.orderHistoryDiagnosticCode||
      s.orderHistoryLastRemoteStatus||'ORDERS_NOT_VERIFIED';
    $('orderHistoryMessage').textContent=
      'Última comprobación de órdenes: '+stamp+
      '. Estado: '+code+
      (s.orderHistoryDiagnosticUploaded===true?
        '. Diagnóstico guardado en GitHub privado.':
        '. Diagnóstico privado todavía no confirmado.');
  }
  const draft=s.orderDraftCache;
  if(draft?.policy_version===3 && draft?.copy_only===true &&
     draft.execution_enabled===false&&draft.auto_fill_enabled===false&&
     draft?.ok&&Date.parse(draft.expires_at)>Date.now()){
    if(draft.approved)renderApprovedOrders(draft);
    else if(draft.draft_id!==orderDraft?.draft_id)renderOrders(draft);
  }else if(renderedCopyId){
    $('orderCopy').replaceChildren();
    renderedCopyId=null;
    $('orderMessage').textContent='La propuesta caducó. Vuelve a analizar el mercado con datos recientes.';
  }
}
$('run').addEventListener('click',async()=>{
  // Field-proven direct route from 2.7.1. No queue, no extra alarm.
  localMessage=null;
  show('Solicitando lectura de Actinver…');
  $('run').disabled=true;
  const response=await Promise.race([
    send({type:'START_SYNC'}),
    new Promise(resolve=>setTimeout(()=>resolve({
      ok:false,error:'Brave no confirmó el inicio; no hay captura nueva verificada.'
    }),35000))
  ]);
  if(!response?.ok){
    localMessage=response?.error||'No fue posible iniciar la captura.';
    show(localMessage);
  }else localMessage=null;
  await refresh();
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
     changes.syncProgress||changes.lastSync||changes.syncStartedAt){
    localMessage=null;
    void refresh();
  }
});
void refresh();


// Batch trade preparation. Approval NEVER submits a transaction to Actinver.
let orderDraft=null;
let renderedCopyId=null;
const fmtMX=n=>Number(n).toLocaleString('es-MX',{
  minimumFractionDigits:2,maximumFractionDigits:2
});
function resetOrderSelection(){
  orderDraft=null;
  $('orderList').replaceChildren();
  $('orderConsent').checked=false;
  $('orderApprove').disabled=true;
  $('orderApprove').hidden=true;
}
function refreshOrderApproval(){
  const checked=[...$('orderList').querySelectorAll('input[type="checkbox"]')]
    .some(x=>x.checked);
  $('orderApprove').disabled=!orderDraft||!$('orderConsent').checked||!checked;
  $('orderApprove').hidden=!orderDraft||!checked;
}
function renderOrders(result){
  resetOrderSelection();
  renderedCopyId=null;
  $('orderCopy').replaceChildren();
  if(!result?.ok){
    $('orderMessage').textContent=result?.reason||result?.error||
      'Sin propuestas válidas. Actualiza cotizaciones y cartera.';
    return;
  }
  if(result.simulation_only===true && result.status==='HISTORICAL_SIMULATION'){
    $('orderConsent').hidden=true;
    $('orderMessage').textContent='SIMULACIÓN HISTÓRICA — precios no vigentes. '+
      'No son órdenes para copiar ni enviar. Cotización: '+
      new Date(result.quotes_captured_at).toLocaleString('es-MX')+'.';
    for(const o of result.orders){
      const item=document.createElement('div');item.className='order-line';
      item.textContent=o.symbol+' · '+o.quantity+' títulos · límite de referencia $'+
        fmtMX(o.limit_mxn)+' · total estimado $'+fmtMX(o.estimated_total_mxn);
      $('orderList').append(item);
    }
    return;
  }
  $('orderConsent').hidden=false;
  if(result.policy_version!==3 || result.copy_only!==true ||
     result.execution_enabled!==false || result.auto_fill_enabled!==false ||
     !Array.isArray(result.orders)||
     !result.orders.every(o=>o.history_verified===true)) {
    $('orderMessage').textContent='Propuesta incompleta: falta verificar la tendencia histórica de tres años en dólares y pesos.';
    return;
  }
  orderDraft=result;
  $('orderMessage').textContent=
    'Datos recientes verificados. Vigencia hasta: '+
    new Date(result.expires_at).toLocaleTimeString('es-MX')+
    '. Efectivo disponible: $'+fmtMX(result.buying_power_mxn)+
    '. Meta de exposición '+result.target_exposure_pct+'%'+
    ' (comprometido '+result.current_exposure_pct+'%; faltan $'+
    fmtMX(result.remaining_to_target_mxn)+').'+
    ' Tope de este lote: $'+fmtMX(result.review_budget_mxn)+
    '. Importe estimado: $'+fmtMX(result.estimated_spend_mxn)+'. '+
    'De '+result.universe_total+' instrumentos, '+result.research_covered+
    ' tienen historial comparable y '+result.research_pending+
    ' siguen pendientes de investigación. Todos los candidatos pasaron la revisión '+
    'de tres años, seis meses, un año, medias móviles y caída desde máximos. '+
    'Sin preferencias fijas por emisora. '+
    'Antes de comprar, verifica noticias, resultados y eventos de cada empresa; '+
    'antes de otro lote, comprueba ejecuciones y actualiza la cartera.';
  for(const o of result.orders){
    const container=document.createElement('div');container.className='order-line';
    const label=document.createElement('label');
    const input=document.createElement('input');input.type='checkbox';
    input.value=o.symbol;
    input.addEventListener('change',refreshOrderApproval);
    const text=document.createElement('span');
    const ticker=document.createElement('strong');
    ticker.textContent=o.symbol+' · '+o.instrument_type+' · '+
      (o.position_action==='AMPLIAR'?'Ampliar':'Nueva')+' · '+o.quantity+' títulos';
    const detail=document.createElement('span');detail.className='order-detail';
    detail.textContent='Límite $'+fmtMX(o.limit_mxn)+
      ' · máximo estimado $'+fmtMX(o.estimated_total_mxn)+
      ' · diferencial '+Number(o.spread_pct).toFixed(3)+'%'+
      ' · evaluación '+Number(o.comparison_score).toFixed(2)+
      ' · puntuación histórica '+Number(o.historical_score).toFixed(2)+
      ' · historial en MXN: 6 meses '+Number(o.mxn_return_126d_pct).toFixed(2)+'%'+
      ', 1 año '+Number(o.mxn_return_252d_pct).toFixed(2)+'%'+
      ', ≈3 años '+Number(o.mxn_return_750d_pct).toFixed(2)+'%'+
      ' · desde máximo anual '+Number(o.mxn_current_drawdown_252d_pct).toFixed(2)+'%';
    text.append(ticker,detail);label.append(input,text);
    container.append(label);$('orderList').append(container);
  }
}
function copyTextButton(label,value){
  const b=document.createElement('button');
  b.type='button';b.textContent=label;
  b.addEventListener('click',async()=>{
    try{
      if(!navigator.clipboard?.writeText)throw Error('Portapapeles no disponible');
      await navigator.clipboard.writeText(String(value));
      $('orderMessage').textContent=label+' copiado. Pega tú el valor en Actinver; verifica la orden antes de confirmarla.';
    }catch(_){
      $('orderMessage').textContent='No se pudo copiar automáticamente. Selecciona manualmente el valor mostrado en la ficha.';
    }
  });
  return b;
}
function renderApprovedOrders(draft){
  if(!draft||draft.policy_version!==3||!draft.copy_only||
     draft.execution_enabled!==false||draft.auto_fill_enabled!==false||
     Date.parse(draft.expires_at)<=Date.now()||
     !Array.isArray(draft.orders)||!draft.orders.every(o=>o.history_verified===true))return;
  if(renderedCopyId===draft.draft_id)return;
  resetOrderSelection();
  renderedCopyId=draft.draft_id;
  $('orderCopy').replaceChildren();
  const selected=new Set(draft.approved_symbols||[]);
  $('orderMessage').textContent='Datos preparados para copiar, vigentes hasta '+
    new Date(draft.expires_at).toLocaleTimeString('es-MX')+
    '. Tú debes rellenar y confirmar cada operación en Actinver.';
  for(const o of draft.orders.filter(order=>selected.has(order.symbol))){
    const box=document.createElement('div');box.className='order-line';
    const header=document.createElement('strong');
    header.textContent=o.symbol+' · '+o.instrument_type+' · '+
      (o.position_action==='AMPLIAR'?'Ampliar':'Nueva')+' · '+o.quantity+' títulos';
    const detail=document.createElement('div');detail.className='order-detail';
    detail.textContent='Compra con límite $'+fmtMX(o.limit_mxn)+
      ' · Comisión estimada $'+fmtMX(o.estimated_fee_mxn)+
      ' · Importe máximo estimado $'+fmtMX(o.estimated_total_mxn);
    const actions=document.createElement('div');actions.className='copy-tools';
    actions.append(
      copyTextButton('Copiar símbolo',o.symbol),
      copyTextButton('Copiar títulos',String(o.quantity)),
      copyTextButton('Copiar límite',Number(o.limit_mxn).toFixed(2))
    );
    box.append(header,detail,actions);
    $('orderCopy').append(box);
  }
}
$('orderPreview').addEventListener('click',async()=>{
  $('orderPreview').disabled=true;
  $('orderMessage').textContent='Contrastando precios y cartera privada…';
  let result=await send({type:'ORDER_PREVIEW'});
  if(['STALE_QUOTES','STALE_PORTFOLIO'].includes(result?.status))
    result=await send({type:'ORDER_SIMULATION'});
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
  const approvedDraft={...orderDraft,approved:true,approved_symbols:selected};
  resetOrderSelection();
  renderApprovedOrders(approvedDraft);
  await refresh();
});
void refresh();
setInterval(()=>{void refresh();},1500);
