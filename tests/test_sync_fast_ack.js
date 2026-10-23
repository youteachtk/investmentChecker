// A slow Angular background tab MUST NOT leave the popup stuck on "Iniciando..."
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const entire=fs.readFileSync('browser/brave-extension/background.js','utf8');
const a=entire.indexOf('async function getActinverTabs()');
const b=entire.indexOf('async function upload(payload)',a);
assert.ok(a>=0&&b>a);
const functions=entire.slice(a,b);
const source={id:41,url:'https://www.retoactinver.com/RetoActinver/#/portafolio',
  active:true,status:'complete'};
let loading=true;
const t=new Map([[41,source]]),stored={githubToken:'FAKE'},actions=[];
const chrome={
  storage:{local:{
    get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys])
      .map(k=>[k,stored[k]])),
    set:async value=>Object.assign(stored,value),
    remove:async key=>{delete stored[key]}
  }},
  tabs:{
    query:async()=>[...t.values()],
    create:async opts=>{
      const newTab={id:99,url:opts.url,status:'loading',active:false};
      actions.push('created');
      t.set(99,newTab);
      return newTab;
    },
    get:async id=>{
      if(!t.has(id))throw Error('No tab with id');
      if(id===99 && !loading)t.get(99).status='complete';
      return t.get(id);
    },
    remove:async id=>{actions.push('removed');t.delete(id)}
  },
  scripting:{executeScript:async()=>{actions.push('injected');return[{result:null}]}}
};
const app=vm.runInNewContext(functions+';({startSync})',{
  chrome,Date,Math,Promise,
  ACTINVER:/^https:\/\/(?:www\.)?retoactinver\.com(?:[/:#?]|$)/i,
  MAX_RUN_AGE_MS:7*60*1000,
  setStatus:async(message,running)=>{
    stored.syncStatus=message;stored.syncRunning=running;
  },
  recoverMisplacedPrivateToken:async()=>({}),
  runPortfolioSync:async()=>({message:'Cartera privada sin cambios'}),
  stamp:()=> 'simulated',
  setTimeout:fn=>setImmediate(fn)
});
(async()=>{
  const started=await app.startSync(41);
  assert.equal(started.ok,true);
  assert.equal(started.stage,'INICIADA');
  assert.deepEqual(actions,['created']);
  assert.equal(stored.syncRunning,true);
  assert.match(stored.syncProgress.stage,/Esperando carga/);
  assert.match(stored.syncStatus,/Esperando carga/);
  assert.equal(actions.includes('injected'),false,
    'Market reader must not be injected before the tab has loaded');
  loading=false;
  for(let i=0;i<80&&!actions.includes('injected');i++)
    await new Promise(resolve=>setImmediate(resolve));
  assert.ok(actions.includes('injected'));
  assert.equal(t.get(41)?.url,source.url);
  console.log('PASS popup acknowledged immediately while Angular tab was still loading');
})().catch(error=>{console.error(error);process.exitCode=1});
