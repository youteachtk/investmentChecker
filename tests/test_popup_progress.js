// Verify that popup telemetry actually repaints when a background sync advances.
'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('browser/brave-extension/popup.js','utf8');
const nodes=new Map();
function node(id){
  if(!nodes.has(id))nodes.set(id,{
    id,textContent:'',placeholder:'',className:'',value:'',
    disabled:false,checked:false,style:{},
    listeners:{},children:[],
    addEventListener(kind,fn){this.listeners[kind]=fn},
    replaceChildren(){this.children=[]},
    append(child){this.children.push(child)},
    querySelectorAll(){return []}
  });
  return nodes.get(id);
}
let callback=null;
const state={
  githubToken:'MOCK',privateEnabled:true,
  privateRepo:'example/private',privateToken:'MOCK',
  syncRunning:true,syncStartedAt:Date.now(),
  syncStatus:'Capitales: ACCIONES página 2 · 20/145',
  lastSync:Date.now()-60_000
};
const document={getElementById:node,activeElement:null,createElement:()=>node('created')};
const chrome={
  runtime:{getManifest:()=>({version:'2.8.1'}),sendMessage:async()=>({ok:true})},
  storage:{
    local:{
      get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys])
        .map(key=>[key,state[key]])),
      set:async object=>Object.assign(state,object)
    },
    onChanged:{addListener:fn=>{callback=fn}}
  }
};
const windowCtx={document,chrome,Date,Number,Promise,Set,Map,
  setInterval:fn=>{windowCtx.interval=fn}};
vm.runInNewContext(source,windowCtx);
const flush=async()=>{
  for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));
};
(async()=>{
  await flush();
  assert.equal(node('syncProgress').value,20);
  assert.match(node('syncStage').textContent,/ACCIONES/);
  assert.match(node('syncStage').textContent,/página 2/);
  state.syncStatus='Capitales: ETFs página 3 · 30/56';
  assert.equal(typeof callback,'function');
  callback({syncStatus:{newValue:state.syncStatus}},'local');
  await flush();
  assert.equal(node('syncProgress').value,175);
  assert.match(node('syncCount').textContent,/175 \/ 226/);
  assert.match(node('syncStage').textContent,/ETFs/);
  state.syncRunning=false;
  state.syncStatus='226 cotizaciones enviadas a GitHub · prueba.';
  windowCtx.interval();
  await flush();
  assert.equal(node('syncProgress').value,226);
  assert.match(node('syncFreshness').textContent,/Último envío/);
  console.log('PASS 2.8 popup progress derived only from field-proven collector status');
})().catch(error=>{console.error(error);process.exitCode=1});
