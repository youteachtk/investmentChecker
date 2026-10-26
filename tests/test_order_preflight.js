// InvestmentChecker's simulated-trading proposal engine is approval-gated and read-only.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('browser/brave-extension/order-preflight.js','utf8');
const now=Date.parse('2026-10-23T16:00:00Z');
const alarms={onAlarm:{addListener:()=>{}}};
const {orderDrafts,orderCSV,orderApprove}=vm.runInNewContext(
  code+';({orderDrafts,orderCSV,orderApprove})',
  {Date,Promise,Set,Map,Number,Math,JSON,chrome:{alarms}}
);
const mk=(symbol,ask)=>({
  symbol,category:'ACCIONES',
  bid:ask-.5,ask,bid_volume:500,ask_volume:700,variation:1.1
});
const quotes=[];
for(let i=0;i<145;i++)quotes.push(mk('TEST'+i,100+i));
for(let i=0;i<56;i++)quotes.push({symbol:'ETF'+i,category:'ETFs'});
for(let i=0;i<25;i++)quotes.push({symbol:'FUND'+i,category:'FONDOS'});
quotes[0]=mk('V',7758.99);
quotes[1]=mk('UNH',7964.98);
const snap={total:226,quotes,captured_at:new Date(now-1000).toISOString(),
  validated_at:new Date(now).toISOString()};
const portfolio={captured_at:new Date(now-1000).toISOString(),
  summary:{total_value:1000000,investments:250000,buying_power:750000,unsettled:0},
  holdings:[{symbol:'AAPL',quantity:3,price_mxn:50000},
    {symbol:'MSFT',quantity:2,price_mxn:50000}]};
const ranked=orderCSV('simbolo_actinver,research_score,annual_volatility_pct,rsi_14,last_market_date\r\nV,85.44,19,62,2026-10-23\r\nUNH,61.81,24,55,2026-10-23\r\nAAPL,92,20,59,2026-10-23\r\n');
let result=orderDrafts(snap,portfolio,ranked,now);
assert.equal(result.ok,true);
assert.equal(result.status,'DRAFTS_READY_FOR_REVIEW');
assert.equal(result.execution_enabled,false);
assert.deepEqual(Array.from(result.orders,o=>o.symbol),['V','UNH']);
assert.ok(result.orders.every(x=>x.order_type==='LIMIT_DRAFT'));
assert.ok(result.orders.every(x=>x.quantity>0 && x.limit_mxn>0));
assert.ok(result.estimated_spend_mxn<=1000000*.20);
assert.equal(result.policy_version,3);
assert.equal(result.copy_only,true);
assert.equal(result.auto_fill_enabled,false);
assert.equal(result.universe_total,226);
assert.equal(result.research_covered,2);
assert.equal(result.research_pending,224);
assert.equal(result.eligible_count,2);
assert.equal(orderDrafts(snap,portfolio,ranked,now+16*60000).status,'STALE_QUOTES');
const historical=orderDrafts(snap,portfolio,ranked,now+2*86400000,{simulation_only:true});
assert.equal(historical.ok,true);
assert.equal(historical.status,'HISTORICAL_SIMULATION');
assert.equal(historical.simulation_only,true);
assert.equal(historical.copy_only,false);
assert.equal(historical.execution_enabled,false);
assert.equal(historical.auto_fill_enabled,false);
assert.equal(historical.orders.length,2);
assert.equal(orderDrafts(snap,{...portfolio,captured_at:new Date(now-36*60000).toISOString()},
  ranked,now).status,'STALE_PORTFOLIO');
assert.equal(orderDrafts(snap,{...portfolio,summary:{...portfolio.summary,buying_power:15}},
  ranked,now).status,'BALANCE_MISMATCH');
assert.equal(orderDrafts(snap,{...portfolio,holdings:[
  {symbol:'AAPL',quantity:1,price_mxn:100},{symbol:'AAPL',quantity:1,price_mxn:100}
]},ranked,now).status,'INVALID_HOLDINGS');
// The strongest eligible instrument wins regardless of its ticker or legacy Visa.
const rankedNeutral=orderCSV('simbolo_actinver,research_score,annual_volatility_pct,rsi_14,last_market_date\n'.replace(/\\n/g,'\n')+
  'V,79,19,60,2026-10-23\nUNH,91,24,55,2026-10-23\n'.replace(/\\n/g,'\n'));
const neutral=orderDrafts(snap,portfolio,rankedNeutral,now);
assert.equal(neutral.ok,true);
assert.equal(neutral.orders[0].symbol,'UNH','Visa must not receive priority');
const badHoldings=orderDrafts(snap,{
  ...portfolio,holdings:[{symbol:'AAPL',quantity:1,price_mxn:100}]
},ranked,now);
assert.equal(badHoldings.status,'HOLDINGS_VALUE_MISMATCH');
// ETFs are eligible for research when quotes are liquid and risk data valid.
const mixed=[...quotes];mixed[2]={...mk('XLV',3200),category:'ETFs'};
const broad=orderDrafts({...snap,quotes:mixed},portfolio,
  [...ranked,...orderCSV('simbolo_actinver,research_score,annual_volatility_pct,rsi_14,last_market_date\nXLV,90,17,62,2026-10-23\n'.replace(/\\n/g,'\n'))],now);
assert.equal(broad.ok,true);
assert.ok(broad.orders.some(o=>o.symbol==='XLV'));

// Competition strategy: successive manual-copy batches should move a
// verified portfolio toward 65% exposure, not stop at the old 8% cap.
const liquidQuotes=[...quotes];
const bulkRows=['simbolo_actinver,research_score,annual_volatility_pct,rsi_14,last_market_date'];
for(let i=0;i<8;i++){
  liquidQuotes[i]=mk('CAND'+i,1000);
  bulkRows.push('CAND'+i+','+(90-i)+',20,55,2026-10-23');
}
const bulkRanking=orderCSV(bulkRows.join('\n')+'\n');
const bulk=orderDrafts({...snap,quotes:liquidQuotes},portfolio,bulkRanking,now);
assert.equal(bulk.ok,true);
assert.equal(bulk.target_exposure_pct,65);
assert.equal(bulk.current_exposure_pct,25);
assert.equal(bulk.review_budget_mxn,200000);
assert.ok(bulk.estimated_spend_mxn>180000,'The new batch must deploy materially more than 8%');
assert.ok(bulk.estimated_spend_mxn<=200000);
assert.equal(bulk.orders.length,5);
assert.ok(bulk.orders.every(o=>o.estimated_total_mxn<=50000));
const reached={...portfolio,
  summary:{total_value:1000000,investments:650000,buying_power:350000,unsettled:0},
  holdings:[{symbol:'AAPL',quantity:13,price_mxn:50000}]};
assert.equal(orderDrafts({...snap,quotes:liquidQuotes},reached,bulkRanking,now).status,
  'TARGET_REACHED');
const pending={...portfolio,
  summary:{total_value:1000000,investments:500000,buying_power:350000,unsettled:150000},
  holdings:[{symbol:'AAPL',quantity:10,price_mxn:50000}]};
assert.equal(orderDrafts({...snap,quotes:liquidQuotes},pending,bulkRanking,now).status,
  'TARGET_REACHED','Unsettled funds must not be budgeted twice');

// User selection is a preparation approval; it can never submit an order.
let draft={...result,draft_id:'test-unique-id',expires_at:new Date(Date.now()+60000).toISOString(),
  approved:false};
let storage={orderDraftCache:draft};
const chrome={alarms,storage:{local:{
  get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,storage[k]])),
  set:async obj=>Object.assign(storage,obj)
}}};
const approve=vm.runInNewContext(code+';orderApprove',{Date,Promise,Set,Map,Number,Math,JSON,chrome});
(async()=>{
  assert.equal((await approve({draft_id:'wrong',confirmed:true,symbols:['V']})).ok,false);
  assert.equal((await approve({draft_id:'test-unique-id',confirmed:false,symbols:['V']})).ok,false);
  const accepted=await approve({draft_id:'test-unique-id',confirmed:true,symbols:['V']});
  assert.equal(accepted.ok,true);
  assert.equal(accepted.execution_enabled,false);
  assert.equal(accepted.auto_fill_enabled,false);
  assert.equal(accepted.copy_only,true);
  assert.equal(accepted.submitted_orders,0);
  assert.equal(storage.orderDraftCache.approved,true);
  assert.equal((await approve({draft_id:'test-unique-id',confirmed:true,symbols:['V']})).ok,false);
  console.log('PASS private read-only order proposals, expiry, spending guard and explicit draft approval');
})().catch(e=>{console.error(e);process.exitCode=1});
