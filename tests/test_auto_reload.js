// Unpacked Brave extension reload must wait until new local files are stable.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('browser/brave-extension/remote.js','utf8');
const first=src.indexOf('// Detect when the Windows updater');
const second=src.indexOf('async function checkRemoteRequest()',first);
assert.ok(first>=0&&second>first);
const checker=src.slice(first,second);
let now=1761243000000, disk='2.8.7', reloaded=0;
const state={},chrome={
  runtime:{reload:()=>{reloaded++},getManifest:()=>({version:'2.8.6'}),
    getURL:()=> 'chrome-extension://xyz/manifest.json'},
  storage:{local:{
    get:async ks=>Object.fromEntries(ks.map(k=>[k,state[k]])),
    set:async s=>Object.assign(state,s),
    remove:async ks=>{for(const k of ks)delete state[k]}
  }}
};
const DateMock={now:()=>now};
const globals={chrome,Date:DateMock,fetch:async()=>({ok:true,json:async()=>({version:disk})}),
  console:{warn:()=>{}},Number,Math};
const check=vm.runInNewContext(checker+';checkInstalledFileUpdate',globals);
(async()=>{
  await check();assert.equal(reloaded,0);
  assert.equal(state.pendingExtensionVersion,'2.8.7');
  now+=30000;await check();assert.equal(reloaded,0);
  now+=31000;state.syncRunning=true;state.syncStartedAt=now-1000;
  await check();assert.equal(reloaded,0);
  state.syncRunning=false;await check();assert.equal(reloaded,1);
  disk='2.8.6';await check();
  assert.equal(reloaded,1);assert.equal(state.pendingExtensionVersion,undefined);
  console.log('PASS Windows-updated unpacked extension auto reload with active-sync guard');
})().catch(e=>{console.error(e);process.exitCode=1});
