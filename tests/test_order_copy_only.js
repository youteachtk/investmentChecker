// Contest-safe browser popup regression: copy approved values; never touch Actinver.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('browser/brave-extension/popup.html','utf8');
const popup=fs.readFileSync('browser/brave-extension/popup.js','utf8');
const bg=fs.readFileSync('browser/brave-extension/background.js','utf8');
assert.doesNotMatch(html,/id="orderStageVisa"|id="orderInspect"/);
assert.doesNotMatch(popup,/send\(\{type:'ORDER_STAGE_VISA'|send\(\{type:'ORDER_INSPECT_UI'/);
assert.match(bg,/if\(msg\?\.type==='ORDER_STAGE_VISA'\)return \{ok:false,status:'CONTEST_SAFE_COPY_ONLY'/);
assert.match(bg,/if\(msg\?\.type==='ORDER_INSPECT_UI'\)return \{ok:false,status:'CONTEST_SAFE_COPY_ONLY'/);
const makeNode=(tag='div')=>({
  tagName:tag.toUpperCase(),textContent:'',children:[],listeners:{},className:'',value:'',
  disabled:false,checked:false,style:{},placeholder:'',
  addEventListener(kind,fn){this.listeners[kind]=fn;},
  append(...values){this.children.push(...values);},
  replaceChildren(...values){this.children=values;},
  querySelectorAll(s){return s==='input[type="checkbox"]'?
    this.children.flatMap(x=>x.querySelectorAll?.(s)||[]):[];}
});
const ids=new Map();
const get=id=>{if(!ids.has(id))ids.set(id,makeNode());return ids.get(id)};
const document={getElementById:get,activeElement:null,createElement:makeNode};
let calls=[],clipboard=[];
const state={};
const chrome={
  runtime:{getManifest:()=>({version:'2.8.28'}),
    sendMessage:async msg=>{calls.push(msg);return {ok:false}}},
  storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys])
      .map(k=>[k,state[k]])),set:async o=>Object.assign(state,o)},
    onChanged:{addListener:()=>{}}}
};
const ctx={document,chrome,Date,Set,Map,Number,Promise,
  navigator:{clipboard:{writeText:async str=>clipboard.push(str)}},
  setInterval:()=>{}};
const {renderApprovedOrders,renderOrders}=vm.runInNewContext(popup+
  ';({renderApprovedOrders,renderOrders})',ctx);
const proposal={ok:true,policy_version:3,copy_only:true,
  auto_fill_enabled:false,execution_enabled:false,
  draft_id:'copy-test',approved:true,approved_symbols:['V'],
  expires_at:new Date(Date.now()+60000).toISOString(),
  buying_power_mxn:750000,review_budget_mxn:75000,estimated_spend_mxn:30000,
  universe_total:226,research_covered:135,research_pending:91,
  orders:[{symbol:'V',quantity:4,limit_mxn:7639.99,estimated_fee_mxn:35.45,
    estimated_total_mxn:30595.41,spread_pct:.55,
    comparison_score:76,historical_score:84}]
};
(async()=>{
  await new Promise(resolve=>setImmediate(resolve)); // finish initial refresh()
  renderApprovedOrders(proposal);
  const cards=get('orderCopy').children;
  assert.equal(cards.length,1);
  const controls=cards[0].children[2].children;
  assert.deepEqual(Array.from(controls,x=>x.textContent),
    ['Copiar emisora','Copiar títulos','Copiar límite']);
  for(const b of controls)await b.listeners.click();
  assert.deepEqual(clipboard,['V','4','7639.99']);
  assert.equal(calls.length,0,'Copy buttons may not send broker or extension messages');
  renderOrders({...proposal,approved:false,draft_id:'review-2'});
  assert.equal(get('orderCopy').children.length,0);
  assert.equal(get('orderList').children.length,1);
  get('orderCopy').replaceChildren();
  renderApprovedOrders({...proposal,draft_id:'expired',
    expires_at:new Date(Date.now()-1000).toISOString()});
  assert.equal(get('orderCopy').children.length,0,'Expired values must not be copyable');
  console.log('PASS three manual-copy controls, no Actinver interaction, expired proposals blocked');
})().catch(e=>{console.error(e);process.exitCode=1});
