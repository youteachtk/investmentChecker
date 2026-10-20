// Regression test: the ETF AAXJ may exist without being the first displayed ticker.
// All 226 rows must still be captured with their correct category and no stale tabs.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const collector=fs.readFileSync('browser/brave-extension/collector.js','utf8');
const csv=fs.readFileSync('data/universe.csv','utf8').trim().split(/\r?\n/).slice(1);
const lists={ACCIONES:[],ETFs:[],FONDOS:[]};
for(const line of csv){const [category,symbol]=line.split(',');lists[category].push(symbol);}
assert.deepEqual(Object.fromEntries(Object.entries(lists).map(([k,v])=>[k,v.length])),
  {ACCIONES:145,ETFs:56,FONDOS:25});
// Intentionally display ACWI before AAXJ, violating old first-row assumption.
lists.ETFs=[...lists.ETFs.slice(1,4),lists.ETFs[0],...lists.ETFs.slice(4)];
let state={category:'ACCIONES',page:1,pending:null,delay:0};
let done=null,failed=null;
const button=(label,click,active=false)=>({
  innerText:label,click:click||(()=>{}),
  classList:{contains:name=>name==='active'&&active},
  parentElement:null,getAttribute:name=>null,disabled:false
});
const tabs=['ACCIONES','ETFs','FONDOS'].map(cat=>button(cat,()=>{
  if(cat==='ETFs'&&state.category==='ACCIONES'&&state.delay<2) {state.delay++;return;}
  state.category=cat;state.page=1;
}));
const navRoot={querySelectorAll:()=>pagerButtons()};
const pagerButtons=()=>{
 const list=lists[state.category],max=Math.ceil(list.length/10);
 const out=[button('Primera',()=>{state.page=1})];
 for(let n=1;n<=max;n++)out.push(button(String(n),()=>{state.page=n},state.page===n));
 out.push(button('Última',()=>{state.page=max}));
 out.forEach(x=>x.parentElement=navRoot);
 return out;
};
const document={
  querySelector:()=>null,
  querySelectorAll(selector){
    if(selector==='button')return [...tabs,...pagerButtons()];
    if(selector==='table tbody tr'){
      return lists[state.category].slice((state.page-1)*10,state.page*10).map(symbol=>{
        const vals=['','',''+symbol,'100.00','0.00','100','99.50','100','100.50'];
        return {getClientRects:()=>[{}],
          querySelectorAll:()=>vals.map(innerText=>({innerText}))};
      });
    }
    throw Error('unexpected selector: '+selector);
  }
};
const chrome={runtime:{sendMessage:async payload=>{
  if(payload.type==='COLLECT_DONE'){done=payload.payload;return {ok:true};}
  if(payload.type==='COLLECT_FAILED'){failed=payload.reason;return {ok:true};}
  return {ok:true};
}}};
let simulatedMs=Date.UTC(2026,9,20,14,0,0);
class SimDate extends Date {
  constructor(...args){super(...(args.length?args:[simulatedMs]));}
  static now(){return simulatedMs;}
}
const context={document,chrome,console:{log:()=>{},error:()=>{}},
  setTimeout(fn,ms=0){simulatedMs+=ms;fn();},Promise,Date:SimDate,Set,JSON};
(async()=>{
  vm.runInNewContext(collector,context,{timeout:3000});
  for(let i=0;i<500&&!done&&!failed;i++)await new Promise(setImmediate);
  assert.equal(failed,null,failed||'Unexpected failure');
  assert.ok(done,'collector should finish');
  assert.equal(done.rows.length,226);
  const etfs=done.rows.filter(x=>x.category==='ETFs').map(x=>x.symbol);
  assert.equal(etfs.length,56);
  assert.equal(etfs[0],'ACWI','collector should not demand AAXJ first');
  assert.ok(etfs.includes('AAXJ'));
  assert.equal(state.delay,2,'initial stale action rows were simulated');
  console.log('PASS: 226 symbols captured with stale tab transitions and ETF AAXJ not first');
})().catch(err=>{console.error(err);process.exitCode=1;});
