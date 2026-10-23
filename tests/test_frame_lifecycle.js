// Reproduce the exact "Frame with ID 0 was removed" upload race.
// The private/tab source must survive until the async collector promise settles.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('browser/brave-extension/background.js','utf8');
const start=source.indexOf('async function getActinverTabs(){');
const end=source.indexOf('async function upload(payload)',start);
const routeStart=source.indexOf('async function route(msg,sender) {');
const routeEnd=source.indexOf('chrome.runtime.onMessage.addListener(',routeStart);
assert.ok(start>0&&end>start&&routeStart>0&&routeEnd>routeStart);

(async()=>{
  const events=[],store={githubToken:'FAKE',syncRunning:false};
  const user={id:74,url:'https://www.retoactinver.com/RetoActinver/#/portafolio',
    active:true,status:'complete'};
  const tabs=new Map([[user.id,user]]);
  let route,tempId,releaseScript;
  const pending=new Promise(resolve=>{releaseScript=resolve});
  const chrome={
    storage:{local:{
      get:async ks=>Object.fromEntries((Array.isArray(ks)?ks:[ks]).map(k=>[k,store[k]])),
      set:async obj=>Object.assign(store,obj),
      remove:async key=>{delete store[key]}
    }},
    tabs:{
      query:async()=>[...tabs.values()],
      get:async id=>tabs.get(id)||Promise.reject(Error('No tab with id')),
      create:async opts=>{
        tempId=99;
        tabs.set(tempId,{id:tempId,url:opts.url,active:false,status:'complete'});
        events.push('tab-created');
        return tabs.get(tempId);
      },
      remove:async id=>{events.push('tab-removed');tabs.delete(id)}
    },
    scripting:{executeScript:async opts=>{
      assert.equal(opts.target.tabId,tempId);
      events.push('collector-start');
      const response=await route({
        type:'COLLECT_DONE',payload:{rows:Array(226).fill({symbol:'DUMMY'})}
      },{tab:{id:tempId}});
      assert.equal(response.ok,true);
      events.push('acknowledged');
      // The async injected script has not resolved; removing the tab now
      // would reproduce the observed Brave frame-removal error.
      assert.ok(tabs.has(tempId),'Tab closed inside COLLECT_DONE handler');
      await pending;
      if(!tabs.has(tempId))throw Error('Frame with ID 0 was removed.');
      events.push('collector-complete');
      return [{result:null}];
    }}
  };
  const sandbox={
    chrome,Date,Math,Promise,
    MAX_RUN_AGE_MS:420000,
    ACTINVER:/^https:\/\/(?:www\.)?retoactinver\.com(?:[/:#?]|$)/i,
    stamp:()=> 'mock',
    recoverMisplacedPrivateToken:async()=>{},
    runPortfolioSync:async()=>({message:'private complete'}),
    setStatus:async(msg,running)=>{
      store.syncStatus=msg;store.syncRunning=running;
    },
    upload:async payload=>{
      assert.equal(payload.rows.length,226);
      events.push('uploaded');
    },
    uploadPrivateDiagnostic:async()=>({ok:true}),
    configurePrivatePortfolio:async()=>{},
    capturePrivatePortfolio:async()=>{},
    getTabDiagnostics:async()=>{},
    setTimeout:callback=>callback()
  };
  const code=source.slice(start,end)+'\n'+source.slice(routeStart,routeEnd)+
    '\n({startSync,route})';
  const app=vm.runInNewContext(code,sandbox);
  route=app.route;
  const started=await app.startSync(user.id);
  assert.equal(started.ok,true);
  for(let i=0;i<100&&!events.includes('acknowledged');i++)
    await new Promise(resolve=>setImmediate(resolve));
  assert.ok(events.includes('acknowledged'),'Collector not acknowledged');
  assert.ok(!events.includes('tab-removed'),'Premature tab close');
  assert.ok(tabs.has(tempId));
  releaseScript();
  for(let i=0;i<100&&!events.includes('tab-removed');i++)
    await new Promise(resolve=>setImmediate(resolve));
  assert.ok(events.includes('collector-complete'));
  assert.ok(events.indexOf('tab-removed')>events.indexOf('collector-complete'));
  assert.ok(tabs.has(user.id));
  assert.match(store.syncStatus,/226 cotizaciones enviadas/);
  console.log('PASS: full public quote upload completed before disposable frame removal');
})().catch(e=>{console.error(e);process.exitCode=1});
