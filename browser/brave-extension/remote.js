// This module accepts ONLY short-lived read-only quote captures or a structural
// broker-interface inspection. No orders, arbitrary scripts, or trading commands.
'use strict';
const REMOTE_REQUEST_URL = 'https://raw.githubusercontent.com/youteachtk/investmentChecker/main/browser/remote-request.json';
const REMOTE_ALARM = 'investmentchecker_remote_capture';
const REMOTE_MAX_AGE_MS = 5 * 60 * 1000;
const REMOTE_INTERVAL_MINUTES = 0.5; // Chrome 120+ permits 30-second alarms.
let remoteCheckInProgress = false;

// Detect when the Windows updater has already replaced unpacked extension
// files. Chromium does not reliably activate those files until reload.
const LOCAL_UPDATE_SETTLE_MS = 60000;
async function checkInstalledFileUpdate() {
  try {
    if(typeof chrome.runtime.reload!=='function')return;
    const loaded=chrome.runtime.getManifest().version;
    const localUrl=chrome.runtime.getURL('manifest.json')+'?disk-check='+Date.now();
    const response=await fetch(localUrl,{cache:'no-store'});
    if(!response.ok)return;
    const disk=await response.json();
    if(!disk||!/^\\d+\\.\\d+\\.\\d+$/.test(disk.version||''))return;
    const parts=v=>v.split('.').map(Number);
    const a=parts(disk.version),b=parts(loaded);
    const newer=a.some((n,i)=>n!==b[i] && a.slice(0,i).every((p,j)=>p===b[j]) && n>b[i]);
    const state=await chrome.storage.local.get(['pendingExtensionVersion','pendingVersionSince',
      'syncRunning','syncStartedAt']);
    if(!newer){
      if(state.pendingExtensionVersion)await chrome.storage.local.remove(
        ['pendingExtensionVersion','pendingVersionSince']);
      return;
    }
    if(state.pendingExtensionVersion!==disk.version) {
      await chrome.storage.local.set({
        pendingExtensionVersion:disk.version,pendingVersionSince:Date.now()
      });
      return;
    }
    if(Date.now()-(state.pendingVersionSince||Date.now())<LOCAL_UPDATE_SETTLE_MS)return;
    // Never reload while public quotes are actively being uploaded.
    if(state.syncRunning && Date.now()-(state.syncStartedAt||0)<7*60*1000)return;
    chrome.runtime.reload();
  }catch(error){
    console.warn('[investmentChecker auto-reload]',String(error?.message||error));
  }
}

async function checkRemoteRequest() {
  if (remoteCheckInProgress) return;
  remoteCheckInProgress = true;
  try {
    const state = await chrome.storage.local.get([
      'remoteControlEnabled','lastRemoteRequestId','syncRunning','syncStartedAt'
    ]);
    if (state.remoteControlEnabled === false) return;
    // A timestamp query avoids stale raw.githubusercontent.com CDN responses.
    const url = REMOTE_REQUEST_URL + '?at=' + Date.now();
    const response = await fetch(url, {cache:'no-store'});
    if (!response.ok) throw Error('Error consultando solicitudes GitHub: HTTP '+response.status);
    const request = await response.json();
    // Both approved remote actions are READ-ONLY. Never accept buy/sell,
    // click instructions, scripts, freeform URLs or financial data payloads.
    if (!request || !['capture_public_quotes','inspect_order_ui'].includes(request.action) ||
        typeof request.id !== 'string' || !/^[A-Za-z0-9._:-]{8,100}$/.test(request.id)) return;
    const requestedAt = Date.parse(request.issued_at);
    if (!Number.isFinite(requestedAt) || requestedAt>Date.now()+60_000 ||
        Date.now()-requestedAt>REMOTE_MAX_AGE_MS) return;
    if (state.lastRemoteRequestId === request.id) return;
    // Don't lose a new request while another capture is still in progress.
    if (state.syncRunning && Date.now()-(state.syncStartedAt||0)<7*60*1000) return;
    const tabs = await getActinverTabs();
    const eligible = tabs.matches;
    const tab = eligible.find(t=>t.active) || eligible[0];
    if (!tab) {
      await chrome.storage.local.set({remotePendingRequestId:request.id,
        syncStatus:'Solicitud desde ChatGPT recibida. Abre Actinver → Monitores e inicia sesión para continuar.'});
      return;
    }
    // One read-only request now starts both public quotes and private portfolio capture.
    await chrome.storage.local.set({lastRemoteRequestId:request.id,remotePendingRequestId:null});
    if(request.action==='inspect_order_ui'){
      const inspected=await orderInspectUi();
      await chrome.storage.local.set({
        orderUiInspectionStatus:inspected?.message||inspected?.error||
          'Inspección no completada',
        lastRemoteOrderInspectionAt:new Date().toISOString()
      });
      return;
    }
    const result=await startSync(tab.id);
    if (!result.ok) {
      await setStatus('No se pudo iniciar la solicitud de ChatGPT: '+(result.error||'error desconocido'),false);
    } else {
      await chrome.storage.local.set({lastRemoteRequestStartedAt:new Date().toISOString()});
    }
  } catch (error) {
    console.warn('[investmentChecker remote]',error.message);
    // Network failures will retry at the next alarm without affecting manual sync.
  } finally {
    remoteCheckInProgress = false;
  }
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === REMOTE_ALARM) {
    void checkInstalledFileUpdate();
    void checkRemoteRequest();
  }
});
async function ensureRemoteAlarm() {
  await chrome.alarms.create(REMOTE_ALARM, {periodInMinutes:REMOTE_INTERVAL_MINUTES});
}
chrome.runtime.onInstalled.addListener(() => {void ensureRemoteAlarm();});
chrome.runtime.onStartup.addListener(() => {void ensureRemoteAlarm();});
// When the worker wakes for any reason after a browser restart, restore polling.
void ensureRemoteAlarm();
