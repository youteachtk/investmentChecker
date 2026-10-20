// Tests for UI-structure based collection: NO ticker names, catalog membership,
// or alphabetical order are used to decide when category/page transitions finish.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const collector=fs.readFileSync('browser/brave-extension/collector.js','utf8');
for(const disallowed of ['AAXJ','AA1','ACTDUAL','CATALOG','SETS','findTab']){
  assert.equal(collector.includes(disallowed),false,'Name-anchored collection has returned: '+disallowed);
}
const groups=[145,56,25].map((len,i)=>
  Array.from({length:len},(_,j)=>'INSTR_'+i+'_'+String(j+1).padStart(3,'0')));
let category=0,page=1,clicks=0,delaySwitch=0;
let captured=null,error=null,progress=[];
const rect=(top,left,width,height)=>({top,left,width,height,bottom:top+height});
const sharedParent={};
function makeButton(label,click,options={}) {
  return {
    innerText:label,click:click||(()=>{}),disabled:false,
    parentElement:options.parent||null,
    getBoundingClientRect:()=>rect(options.top||0,options.left||0,options.width||60,options.height||25),
    getClientRects:()=>[{}],
    getAttribute:()=>null,
    classList:{contains:k=>k==='active'&&!!options.active}
  };
}
const tabs=[0,1,2].map(i=>makeButton('GROUP_'+i,()=>{
  clicks++;
  // The first two attempts to reach group 2 leave the old table unchanged.
  if(i===1 && category===0 && delaySwitch<2){delaySwitch++;return;}
  category=i;page=1;
},{parent:sharedParent,top:200,left:i*320,width:300,height:38}));
let pagerParent=null;
function pager() {
  const max=Math.ceil(groups[category].length/10);
  const els=[makeButton('Primera',()=>page=1)];
  for(let p=1;p<=max;p++)els.push(makeButton(String(p),()=>page=p,{active:page===p}));
  els.push(makeButton('Última',()=>page=max));
  for(const el of els)el.parentElement=pagerParent;
  return els;
}
pagerParent={querySelectorAll:()=>pager(),classList:{contains:()=>false}};
const table={
  getClientRects:()=>[{}],
  getBoundingClientRect:()=>rect(360,100,900,250)
};
const document={
  querySelector:()=>null,
  querySelectorAll(s) {
    if(s==='button') return [...tabs,...pager()];
    if(s==='[role="tablist"]'||s==='[role="tab"]') return [];
    if(s==='table') return [table];
    if(s==='table tbody tr')return groups[category]
      .slice((page-1)*10,page*10).map(ticker=>({
        getClientRects:()=>[{}],
        querySelectorAll:()=>['','',ticker,'100.00','-1.00','100','99.80','100','100.20']
          .map(innerText=>({innerText}))
      }));
    throw Error('Selector unexpected: '+s);
  }
};
const chrome={runtime:{sendMessage:async msg=>{
  if(msg.type==='COLLECT_DONE'){captured=msg.payload;return {ok:true};}
  if(msg.type==='COLLECT_FAILED'){error=msg.reason;return {ok:true};}
  if(msg.type==='PROGRESS')progress.push(msg.status);
  return {ok:true};
}}};
let now=Date.UTC(2026,9,20,15);
class FakeDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const context={document,chrome,Date:FakeDate,Promise,Set,JSON,
  console:{log:()=>{},error:()=>{}},setTimeout:(fn,ms=0)=>{now+=ms;fn();}};
(async()=>{
  vm.runInNewContext(collector,context,{timeout:4000});
  for(let i=0;i<2500&&!captured&&!error;i++)await new Promise(setImmediate);
  assert.equal(error,null,'Collection error: '+error);
  assert.ok(captured,'Collector did not complete');
  assert.equal(captured.rows.length,226);
  assert.deepEqual([0,1,2].map(i=>captured.rows.filter(x=>x.category===
    ['ACCIONES','ETFs','FONDOS'][i]).length),[145,56,25]);
  assert.equal(captured.rows[145].symbol,'INSTR_1_001');
  assert.ok(progress.some(x=>x.includes('reintento')),'Category retry not exercised');
  assert.ok(delaySwitch>=1,'Stale tab transition was not simulated');
  assert.ok(clicks>=5,'Stale tab retry did not occur');
  console.log('PASS UI: 226 rows, category transitions without any expected symbol name');
})().catch(e=>{console.error(e);process.exitCode=1;});
