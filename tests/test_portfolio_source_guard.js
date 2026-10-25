// Private portfolio uploads require a verified #/portafolio content-script origin.
// A #/movimientos table must never be allowed to masquerade as live holdings.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('browser/brave-extension/private-sync.js','utf8');
const start=source.indexOf('function sanitizePrivateCapture(raw) {');
const end=source.indexOf('async function uploadPrivatePortfolio(payload) {',start);
assert.ok(start>0&&end>start);
const snippet=source.slice(start,end);
const now=new Date().toISOString();
function setup(cache={}){
  const state={privateEnabled:true,privateCache:cache};
  const writes=[];
  const storage={
    get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys])
      .map(k=>[k,state[k]])),
    set:async obj=>Object.assign(state,obj)
  };
  const context={Date,Number,Math,Object,String,Promise,privateUploading:false,
    PRIVATE_TTL_MS:1800000,privateSitePattern:/^https:\/\/(?:www\.)?retoactinver\.com(?:[\/:#?]|$)/i,
    chrome:{storage:{local:storage}},privateState:async()=>{},
    uploadPrivatePortfolio:async payload=>{writes.push(payload)},
    console:{warn:()=>{}},Error};
  const receive=vm.runInNewContext(snippet+';acceptPrivateCapture',context);
  return {state,writes,receive};
}
const summary={total_value:10000,investments:4000,buying_power:6000,unsettled:0};
const items=[{symbol:'AAPL',quantity:2,price_mxn:2000}];
const msg={payload:{captured_at:now,summary,holdings:items}};
const sender=(hash)=>({tab:{id:17,url:'https://retoactinver.com/RetoActinver/'+hash}});
(async()=>{
  const wrong=setup();
  const refused=await wrong.receive(msg,sender('#/movimientos'));
  assert.equal(refused.ok,false);
  assert.equal(wrong.writes.length,0);
  assert.equal(wrong.state.privateCache.holdings,undefined);
  const good=setup();
  const accepted=await good.receive(msg,sender('#/portafolio'));
  assert.equal(accepted.ok,true);
  assert.equal(good.writes.length,1);
  assert.equal(good.state.privateCache.holdings.verified_portfolio_route,true);
  assert.equal(good.writes[0].holdings[0].symbol,'AAPL');
  const missing=setup();
  const incomplete=await missing.receive({payload:{captured_at:now,
    summary,holdings:[{symbol:'AAPL',quantity:2,price_mxn:500}]}},
    sender('#/portafolio'));
  assert.equal(incomplete.ok,true);
  assert.equal(incomplete.partial,true);
  assert.equal(incomplete.reason,'HOLDINGS_VALUE_MISMATCH');
  assert.equal(missing.writes.length,0);
  assert.equal(missing.state.portfolioReconciliationStatus,'HOLDINGS_VALUE_MISMATCH');
  const formerlySaved=setup({holdings:{at:now,values:[{
    symbol:'PFE',quantity:1,price_mxn:100}],verified_portfolio_route:true,
    reconciled:false},summary:{at:now,values:summary}});
  formerlySaved.state.privateLastSync=Date.now()-30000;
  const replaced=await formerlySaved.receive(msg,sender('#/portafolio'));
  assert.equal(replaced.ok,true);
  assert.equal(formerlySaved.writes.length,1,
    'Old incomplete cache must not suppress newly reconciled GitHub upload');


  const stale=setup({holdings:{at:now,values:[{symbol:'PFE',quantity:999}]},
    summary:{at:now,values:summary}});
  const partial=await stale.receive(
    {payload:{captured_at:now,summary,holdings:null}},sender('#/movimientos'));
  assert.equal(partial.ok,true);
  assert.equal(partial.partial,true);
  assert.equal(stale.writes.length,0);
  assert.equal(stale.state.privateCache.holdings,undefined);
  console.log('PASS movements rejected as holdings, verified portfolio accepted, stale cache invalidated');
})().catch(err=>{console.error(err);process.exitCode=1});
