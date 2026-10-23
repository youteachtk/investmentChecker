// Full extension service-worker integration smoke test.
// Unlike isolated unit tests, imports are loaded together and all event
// listeners register on the same mocked chrome.runtime/chrome.alarms.
'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const folder='browser/brave-extension/';
const bg=fs.readFileSync(folder+'background.js','utf8');
const scripts=['remote.js','private-sync.js','order-preflight.js']
  .map(f=>fs.readFileSync(folder+f,'utf8'));
const all=bg.replace(/importScripts\('remote\.js'\);\s*importScripts\('private-sync\.js'\);\s*importScripts\('order-preflight\.js'\);/,'')+
  '\n'+scripts.join('\n');
const ev=()=>({listeners:[],addListener(cb){this.listeners.push(cb)}});
const tabs=new Map([[51,{id:51,url:
  'https://www.retoactinver.com/RetoActinver/#/portafolio',
  active:true,status:'complete'}]]);
const store={githubToken:'github_pat_TEST',privateEnabled:false};
const tracking={created:[],removed:[],injected:[],alarms:[]};
const chrome={
  runtime:{onMessage:ev(),onInstalled:ev(),onStartup:ev()},
  tabs:{
    onUpdated:ev(),onRemoved:ev(),
    query:async()=>[...tabs.values()],
    create:async args=>{
      const tab={id:119,url:args.url,active:args.active,status:'complete'};
      tracking.created.push(args);tabs.set(tab.id,tab);
      return tab;
    },
    get:async id=>{
      if(!tabs.has(id))throw Error('No tab with id '+id);
      return tabs.get(id);
    },
    remove:async id=>{tracking.removed.push(id);tabs.delete(id)}
  },
  alarms:{
    onAlarm:ev(),
    create:async (name,options)=>tracking.alarms.push({name,options}),
    clear:async()=>true
  },
  storage:{
    onChanged:ev(),
    local:{
      get:async keys=>Object.fromEntries(
        (Array.isArray(keys)?keys:[keys]).map(k=>[k,store[k]])),
      set:async values=>Object.assign(store,values),
      remove:async key=>{delete store[key]}
    }
  },
  permissions:{contains:async()=>true},
  scripting:{executeScript:async args=>{
    tracking.injected.push(args);
    return [{result:{ok:false,partial:true}}];
  }}
};
const context={
  chrome,Date,Promise,Math,Number,Set,Map,
  console:{warn() {},error(){},log(){}},
  setTimeout:cb=>setImmediate(cb),
  fetch:async()=>({ok:false,status:404,json:async()=>({})})
};
vm.runInNewContext(all,context,{timeout:10000});
assert.equal(chrome.runtime.onMessage.listeners.length,1);
assert.ok(chrome.alarms.onAlarm.listeners.length>=3,
  'Alarm handlers from all modules failed to register');
const send=(msg)=>new Promise((resolve,reject)=>{
  const callback=chrome.runtime.onMessage.listeners[0];
  const keepChannel=callback(msg,{tab:tabs.get(51)},answer=>resolve(answer));
  assert.equal(keepChannel,true);
  setTimeout(()=>reject(Error('Worker never replied')),2500);
});
(async()=>{
  // Fast WAKE_MANUAL_SYNC acknowledgement and queued start from the full worker.
  store.manualSyncRequest={id:'manual-integrated-2026',at:Date.now()};
  const response=await send({type:'WAKE_MANUAL_SYNC'});
  assert.equal(response.ok,true);
  assert.equal(response.queued,true);
  for(let i=0;i<100&&!store.manualSyncLastResult;i++)
    await new Promise(resolve=>setImmediate(resolve));
  assert.equal(store.manualSyncHandledId,'manual-integrated-2026');
  assert.equal(store.manualSyncLastResult?.ok,true);
  assert.equal(tracking.created.length,1);
  assert.equal(tracking.created[0].active,false);
  assert.equal(tracking.created[0].openerTabId,51);
  // The scheduled fallback fires and must not start another capture.
  for(const listener of chrome.alarms.onAlarm.listeners)
    await listener({name:'investmentchecker_manual_sync'});
  assert.equal(tracking.created.length,1);
  assert.equal(chrome.runtime.onMessage.listeners.length,1);
  console.log('PASS complete worker imports, fast ACK, manual alarm, duplicate guard');
})().catch(e=>{process.stderr.write(String(e.stack||e));process.exitCode=1});
