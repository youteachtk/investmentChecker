// Manual sync must work even when chrome.runtime.sendMessage never resolves.
// Both immediate wake and durable alarm address the same request once.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const background=fs.readFileSync('browser/brave-extension/background.js','utf8');
const popup=fs.readFileSync('browser/brave-extension/popup.js','utf8');
const a=background.indexOf("const MANUAL_SYNC_ALARM=");
const b=background.indexOf("async function setStatus",a);
assert.ok(a>0&&b>a,'Manual-start implementation is missing.');

async function workerFallbackSimulation(){
  const state={manualSyncRequest:{id:'manual-test-2026',at:Date.now()}};
  let executions=0,release;
  const pending=new Promise(resolve=>release=resolve);
  const chrome={storage:{local:{
    get:async keys=>Object.fromEntries(keys.map(k=>[k,state[k]])),
    set:async object=>Object.assign(state,object)
  }}};
  const impl=vm.runInNewContext(background.slice(a,b)+';startQueuedManualSync',{
    chrome,Date,Math,Number,Promise,
    startSync:async()=>{executions++;await pending;return {ok:true,stage:'INICIADA'};},
    setStatus:async message=>{state.status=message}
  });
  const wake=impl();
  // A second event fires while a worker wake is already processing.
  const repeat=await impl();
  assert.equal(repeat.alreadyProcessing,true);
  release();
  const done=await wake;
  assert.equal(done.ok,true);
  assert.equal(executions,1,'Two manual triggers started duplicate market scans');
  assert.equal(state.manualSyncLastResult.ok,true);
  assert.equal(state.manualSyncLastResult.id,state.manualSyncRequest.id);
  const again=await impl();
  assert.equal(again.alreadyHandled,true);
  assert.equal(executions,1,'Alarm retried an already accepted request.');
  // Simulate a lost immediate wake; the alarm alone must process a fresh ID.
  state.manualSyncRequest={id:'manual-alarm-only',at:Date.now()};
  const fallBack=await impl();
  assert.equal(fallBack.ok,true);
  assert.equal(executions,2);
}
async function popupLostMessageSimulation(){
  const elements=new Map(),scheduled=[],sent=[];
  function element(id){
    if(!elements.has(id)) elements.set(id,{
      id,textContent:'',value:'',placeholder:'',className:'',disabled:false,
      checked:false,addEventListener(name,fn){this[name]=fn},
      replaceChildren(){},append(){},querySelectorAll(){return []}
    });
    return elements.get(id);
  }
  const data={githubToken:'test-public',privateEnabled:true,
    privateRepo:'mock/private',privateToken:'test-private'};
  const chrome={
    runtime:{getManifest:()=>({version:'2.8.3'}),
      sendMessage:message=>{sent.push(message.type);return new Promise(()=>{});}},
    storage:{local:{
      get:async keys=>Object.fromEntries(
        (Array.isArray(keys)?keys:[keys]).map(k=>[k,data[k]])),
      set:async values=>Object.assign(data,values)
    },onChanged:{addListener() {}}},
    alarms:{create:async(name,options)=>scheduled.push({name,options})}
  };
  const ctx={
    chrome,Date,Math,Promise,Number,Set,Map,
    document:{getElementById:element,createElement:()=>element('dynamic'),activeElement:null},
    setInterval:()=>{},setTimeout:()=>{}
  };
  vm.runInNewContext(popup,ctx,{timeout:10000});
  assert.equal(typeof element('run').click,'function');
  await element('run').click();
  assert.equal(scheduled.length,1);
  assert.equal(scheduled[0].name,'investmentchecker_manual_sync');
  assert.ok(scheduled[0].options.when>Date.now()-1000);
  assert.ok(data.manualSyncRequest?.id?.startsWith('manual-'));
  assert.ok(sent.includes('WAKE_MANUAL_SYNC'));
  assert.ok(!sent.includes('START_SYNC'),'The popup still waits on old START_SYNC response');
  assert.match(data.syncProgress.stage,/Esperando proceso de fondo/);
}
(async()=>{
  await workerFallbackSimulation();
  await popupLostMessageSimulation();
  console.log('PASS hung message, alarm fallback, exact request ID and no duplicate capture');
})().catch(e=>{console.error(e);process.exitCode=1});
