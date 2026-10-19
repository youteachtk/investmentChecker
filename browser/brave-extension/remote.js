// This module accepts ONLY short-lived read-only market-quote capture requests.
// It does not accept arbitrary scripts, account data requests, or trading commands.
'use strict';
const REMOTE_REQUEST_URL = 'https://raw.githubusercontent.com/youteachtk/investmentChecker/main/browser/remote-request.json';
const REMOTE_ALARM = 'investmentchecker_remote_capture';
const REMOTE_MAX_AGE_MS = 5 * 60 * 1000;
const REMOTE_INTERVAL_MINUTES = 0.5; // Chrome 120+ permits 30-second alarms.
let remoteCheckInProgress = false;

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
    if (!request || request.action !== 'capture_public_quotes' ||
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
    const result = await startSync(tab.id);
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
  if (alarm.name === REMOTE_ALARM) void checkRemoteRequest();
});
async function ensureRemoteAlarm() {
  await chrome.alarms.create(REMOTE_ALARM, {periodInMinutes:REMOTE_INTERVAL_MINUTES});
}
chrome.runtime.onInstalled.addListener(() => {void ensureRemoteAlarm();});
chrome.runtime.onStartup.addListener(() => {void ensureRemoteAlarm();});
// When the worker wakes for any reason after a browser restart, restore polling.
void ensureRemoteAlarm();
