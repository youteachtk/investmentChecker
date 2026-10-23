// Verify updates are triggered by published version metadata, without a new timer.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('browser/brave-extension/remote.js','utf8');
const first=source.indexOf('let nativeUpdateInProgress=false;');
const last=source.indexOf('// Detect when the Windows updater',first);
assert.ok(first>0&&last>first);
let sent=[],reloads=0,now=1000000,loaded='2.8.10';
const store={};
const chrome={runtime:{
  getManifest:()=>({version:loaded}),
  sendNativeMessage:(host,req,cb)=>{sent.push({host,req});cb({ok:true,version:'2.8.11',updated:true})},
  reload:()=>{reloads++},lastError:null
},storage:{local:{
  get:async keys=>Object.fromEntries(keys.map(k=>[k,store[k]])),
  set:async v=>Object.assign(store,v)
}}};
const f=vm.runInNewContext(source.slice(first,last)+
  ';({updateIfPublished,publishedVersionNewer})',
  {chrome,Date:{now:()=>now},console:{warn:()=>{}},Number,Math,Error,String});
(async()=>{
  assert.equal(f.publishedVersionNewer('2.8.11','2.8.10'),true);
  assert.equal(f.publishedVersionNewer('2.8.9','2.8.10'),false);
  assert.equal(f.publishedVersionNewer('bad','2.8.10'),false);
  await f.updateIfPublished('2.8.10');assert.equal(sent.length,0);
  await f.updateIfPublished('2.8.11');
  assert.equal(sent.length,1);
  assert.equal(sent[0].host,'com.investmentchecker.updater');
  assert.equal(sent[0].req.version,'2.8.11');
  assert.equal(sent[0].req.action,'update');
  assert.equal(reloads,1);
  await f.updateIfPublished('2.8.11');assert.equal(sent.length,1);
  loaded='2.8.11';now+=70000;
  await f.updateIfPublished('2.8.11');assert.equal(sent.length,1);
  console.log('PASS update only on new GitHub published version');
})().catch(e=>{console.error(e);process.exitCode=1});
