// The real user's tab must never be paginated by the 226-instrument collector.
// Test starting on Capitales, Mi portafolio and a discarded temporary tab.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('browser/brave-extension/background.js','utf8');
const start=src.indexOf('async function getActinverTabs()');
const end=src.indexOf('async function upload(payload)',start);
assert.ok(start>=0&&end>start,'Background capture functions missing');
const functions=src.slice(start,end);
const origin='https://www.retoactinver.com/RetoActinver/#/';

async function scenario(path,failFirst=false){
  const events=[],stored={githubToken:'FAKE',syncRunning:false};
  const tabs=new Map([[91,{id:91,url:origin+path,active:true,status:'complete'}]]);
  let nextId=200,attempts=0;
  const chrome={
    storage:{local:{
      get:async key=>Object.fromEntries((Array.isArray(key)?key:[key])
        .map(k=>[k,stored[k]])),
      set:async values=>Object.assign(stored,values),
      remove:async key=>{delete stored[key]}
    }},
    tabs:{
      query:async()=>[...tabs.values()],
      get:async id=>{if(!tabs.has(id))throw Error('No tab with id');return tabs.get(id)},
      create:async params=>{
        const tab={id:++nextId,url:params.url,active:params.active,status:'complete'};
        events.push({kind:'create',id:tab.id,params});
        tabs.set(tab.id,tab);return tab;
      },
      remove:async id=>{events.push({kind:'remove',id});tabs.delete(id)}
    },
    scripting:{executeScript:async args=>{
      attempts++;
      events.push({kind:'inject',id:args.target.tabId,files:args.files});
      if(failFirst&&attempts===1)throw Error('No tab with id: discarded');
      return [{result:null}];
    }}
  };
  let finishPrivate;
  const pending=new Promise(resolve=>{finishPrivate=resolve});
  const code=functions+';({startSync,injectQuotesWithRetry})';
  const app=vm.runInNewContext(code,{
    chrome,Date,Math,Promise,
    MAX_RUN_AGE_MS:420000,
    ACTINVER:/^https:\/\/(?:www\.)?retoactinver\.com(?:[/:#?]|$)/i,
    setStatus:async()=>{},
    recoverMisplacedPrivateToken:async()=>{},
    runPortfolioSync:async id=>{
      events.push({kind:'private',id});
      return pending;
    },
    stamp:()=> 'test',
    setTimeout:cb=>cb()
  });
  const result=await app.startSync(91);
  assert.equal(result.ok,true);
  // The private portfolio test deliberately does not resolve until AFTER
  // public injection: no private/navigation/API hang can freeze quotations.
  for(let i=0;i<50 && events.filter(x=>x.kind==='inject').length<(failFirst?2:1);i++)
    await new Promise(resolve=>setImmediate(resolve));
  assert.ok(events.some(x=>x.kind==='inject'),
    'Public collector was blocked by pending private portfolio read');
  assert.ok(events.some(x=>x.kind==='private'&&x.id===91),
    'Private reading should use original tab, not the public collector frame');
  finishPrivate({message:'test complete'});
  const created=events.filter(x=>x.kind==='create');
  const injected=events.filter(x=>x.kind==='inject');
  assert.equal(created.length,failFirst?2:1);
  assert.equal(injected.length,failFirst?2:1);
  for(const x of created){
    assert.equal(x.params.active,false);
    assert.equal(x.params.openerTabId,91);
    assert.equal(x.params.url,origin+'capitales');
  }
  assert.ok(injected.every(x=>x.id!==91),
    'Never inject collector.js into the user-visible tab');
  assert.ok(injected.every(x=>created.some(y=>y.id===x.id)));
  assert.ok(tabs.has(91),'The user-visible tab must remain open');
  assert.equal(tabs.get(91).url,origin+path);
}
(async()=>{
  await scenario('capitales');
  await scenario('portafolio');
  await scenario('capitales',true);
  console.log('PASS: Capitales and Mi portafolio never navigated; retries remain isolated');
})().catch(error=>{console.error(error);process.exitCode=1});
