// Contract test for the real read-only Mi portafolio route and its permissions.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const manifest=require('../browser/brave-extension/manifest.json');
const source=fs.readFileSync('browser/brave-extension/private-sync.js','utf8');
assert.ok(manifest.host_permissions.includes('https://www.retoactinver.com/*'));
const start=source.indexOf("const PORTFOLIO_URL=");
const end=source.indexOf('// Silent opportunistic capture',start);
assert.ok(start>=0&&end>start);
const runCode=source.slice(start,end);

async function test(redirect=false){
  let captureCount=0;
  const actions=[];
  const state={privateEnabled:true,privateRepo:'example/private',privateToken:'unused',
    privateCache:{}};
  const store={
    get:async names=>Object.fromEntries((Array.isArray(names)?names:[names])
      .map(name=>[name,state[name]])),
    set:async data=>Object.assign(state,data)
  };
  const chrome={storage:{local:store},tabs:{
    create:async arg=>{actions.push({create:arg});return{id:24}},
    get:async()=>({url:redirect?
      'https://www.retoactinver.com/RetoActinver/#/inicio':
      'https://www.retoactinver.com/RetoActinver/#/portafolio'}),
    remove:async id=>actions.push({remove:id})
  },scripting:{executeScript:async arg=>{actions.push({script:arg});return[{result:true}];}}};
  let diagnostic;
  const context={
    chrome,Date,Promise,PRIVATE_TTL_MS:1800000,
    privateSitePattern:/^https:\/\/(?:www\.)?retoactinver\.com\//i,
    recoverMisplacedPrivateToken:async()=>{},
    privateState:async()=>{},
    capturePrivatePortfolio:async id=>{
      captureCount++;
      const at=new Date().toISOString();
      if(captureCount===1)state.privateCache.summary={
        at,values:{total_value:2000,investments:0,buying_power:2000}};
      else{
        state.privateCache.holdings={at,values:[],verified_portfolio_route:true,reconciled:true};
        state.privateLastSync=Date.now();
      }
      return {ok:true};
    },
    waitForPage:async()=>true,
    uploadPrivateDiagnostic:async value=>{diagnostic=value},
    stamp:()=>'test',
    console:{warn(){}}
  };
  const run=vm.runInNewContext(runCode+';runPortfolioSync',context);
  await run(14);
  assert.equal(actions[0].create.url,
    'https://www.retoactinver.com/RetoActinver/#/portafolio');
  assert.equal(actions[0].create.openerTabId,14);
  assert.equal(actions[0].create.active,false);
  assert.equal(actions.at(-1).remove,24);
  if(!redirect)assert.ok(actions.some(x=>x.script?.target?.tabId===24),
    'Only the inactive portfolio tab can enable safe category scanning');
  if(redirect){
    assert.equal(captureCount,1);
    assert.equal(diagnostic.code,'PRIVATE_NAV_FAILED');
    assert.equal(diagnostic.navigation_step,'direct-redirect');
  }else{
    assert.equal(captureCount,2);
    assert.equal(diagnostic.code,'PRIVATE_OK');
    assert.equal(diagnostic.navigation_step,'direct-portfolio');
  }
}
(async()=>{await test(false);await test(true);
  console.log('PASS direct Mi portafolio route, permissions, empty holdings and redirect');
})().catch(e=>{console.error(e);process.exitCode=1});
