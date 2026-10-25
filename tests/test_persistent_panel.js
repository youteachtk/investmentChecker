'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const manifest=JSON.parse(fs.readFileSync('browser/brave-extension/manifest.json','utf8'));
assert.equal(manifest.action.default_popup,undefined,'Toolbar action must open a persistent window');
const src=fs.readFileSync('browser/brave-extension/background.js','utf8');
assert.match(src,/chrome\.action\?\.onClicked\?\.addListener/);
assert.match(src,/chrome\.windows\.create/);
assert.match(src,/chrome\.windows\.update/);
const start=src.indexOf('let panelOpening=null;');
const end=src.indexOf('async function setStatus',start);
const state={};let created=0,focused=0,clicked;
const chrome={
  storage:{local:{get:async()=>({...state}),set:async v=>Object.assign(state,v),
    remove:async key=>delete state[key]}},
  runtime:{getURL:path=>'chrome-extension://fixture/'+path},
  action:{onClicked:{addListener:fn=>clicked=fn}},
  windows:{onRemoved:{addListener:()=>{}},
    create:async options=>{created++;assert.equal(options.type,'popup');return {id:42}},
    get:async id=>({id}),update:async(id,opts)=>{focused++;assert.equal(opts.focused,true)}}
};
vm.runInNewContext(src.slice(start,end),{chrome,Number,Promise,Error});
(async()=>{
  assert.equal(typeof clicked,'function');
  clicked();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(created,1);
  clicked();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(created,1,'second click should reuse the same window');
  assert.equal(focused,1);
  console.log('PASS persistent window reuses existing panel');
})().catch(e=>{console.error(e);process.exitCode=1});
console.log('PASS persistent InvestmentChecker window wiring');
