'use strict';
// Regression: a 20-day bounce cannot become a buy without multiyear MXN research.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync('browser/brave-extension/order-preflight.js','utf8');
const {orderDrafts,orderCSV}=vm.runInNewContext(script+';({orderDrafts,orderCSV})',
  {Date,Promise,Set,Map,Number,Math,JSON,chrome:{alarms:{onAlarm:{addListener(){}}}}});
const now=Date.parse('2026-10-26T18:00:00Z');
const row=(symbol,category='ACCIONES')=>({symbol,category,last:200,
  bid:199.5,ask:200,bid_volume:600,ask_volume:600,variation:0.1});
const quotes=[...Array.from({length:145},(_,i)=>row('STOCK'+i)),
  ...Array.from({length:56},(_,i)=>row('ETF'+i,'ETFs')),
  ...Array.from({length:25},(_,i)=>row('FUND'+i,'FONDOS'))];
quotes[0]=row('WMT');quotes[1]=row('COST');quotes[2]=row('PFE');
quotes[145]=row('XLV','ETFs');
const snap={total:226,quotes,captured_at:new Date(now-2000).toISOString(),
  validated_at:new Date(now-1000).toISOString()};
const portfolio={captured_at:new Date(now-1000).toISOString(),
  summary:{total_value:1000000,investments:100000,buying_power:900000,unsettled:0},
  holdings:[{symbol:'AAPL',quantity:10,price_mxn:10000}]};
const header=['simbolo_actinver','research_score','annual_volatility_pct',
  'rsi_14','last_market_date','history_days','return_126d_pct',
  'return_252d_pct','mxn_return_20d_pct',
  'mxn_return_126d_pct','mxn_return_252d_pct','mxn_return_750d_pct',
  'mxn_current_drawdown_252d_pct','mxn_above_sma_50',
  'mxn_above_sma_200','mxn_sma_50_rising','fx_validated_date'].join(',');
const item=(s,score,r20,r126,r252,r750,drawdown,above50=1,above200=1,rising=1)=>
  [s,score,20,60,'2026-10-23',755,
    s==='WMT'?-7.7:s==='COST'?-0.8:11.2,
    s==='COST'?6.2:21.5,r20,r126,r252,r750,drawdown,
    above50,above200,rising,'2026-10-23'].join(',');
const ranking=orderCSV([header,
  item('WMT',91,11,-1.6,12.5,120,-10.7),
  item('COST',89,8,5.8,6.8,83,-8.3,1,1,0),
  item('PFE',80,5,18.6,22.2,-3.0,-1.3),
  item('XLV',79,5,32.6,23.5,44,-1.1)].join('\n'));
const result=orderDrafts(snap,portfolio,ranking,now);
assert.equal(result.ok,true);
assert.deepEqual(Array.from(result.orders,o=>o.symbol),['PFE','XLV'],
  'Neither a six-month downtrend nor a falling 50-day moving average may be called a buy');
for(const order of result.orders){
  assert.equal(order.history_verified,true);
  assert.equal(order.mxn_return_126d_pct>0,true);
  assert.equal(order.mxn_return_252d_pct>0,true);
  assert.equal(order.mxn_above_sma_200,true);
  assert.equal(order.instrument_type,order.category==='ACCIONES'?'Acción':'ETF');
}
const incomplete=orderDrafts(snap,portfolio,orderCSV(
  'simbolo_actinver,research_score,annual_volatility_pct,rsi_14,last_market_date\n'+
  'PFE,99,20,60,2026-10-23\n'),now);
assert.equal(incomplete.ok,false,
  'The previous ranking format cannot silently authorize a new purchase');
assert.equal(incomplete.status,'NO_VERIFIED_HISTORICAL_BUYS');
const existingPosition={...portfolio,holdings:[
  {symbol:'AAPL',quantity:10,price_mxn:9980},
  {symbol:'PFE',quantity:1,price_mxn:200}
]};
const adds=orderDrafts(snap,existingPosition,ranking,now);
assert.equal(adds.ok,true);
assert.equal(adds.orders.some(o=>o.symbol==='PFE'),true,
  'Full analysis must consider adding titles to holdings, not only new tickers');
console.log('PASS complete MXN historic validation and no short-term rebound buys');
