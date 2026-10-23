// Discover structural trading controls without actions, financial figures or DOM dumps.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('browser/brave-extension/order-ui-probe.js','utf8');
let clicks=0;
function node(label){
  return {innerText:label,textContent:label,getClientRects:()=>[1],
    click:()=>{clicks++},querySelectorAll:()=>[]};
}
const root=node('Comprar o vender');
const dialog=node('Comprar');
const document={querySelector:()=>node('market root'),querySelectorAll:selector=>{
  if(selector.includes('gt-btn-operar,app-componente'))return [root];
  if(selector==='gt-btn-operar')return [root];
  if(selector.startsWith('form,[role="dialog"]'))return [dialog];
  if(selector.startsWith('[role="dialog"]'))return [dialog];
  return [];
}};
(async()=>{
  const result=await vm.runInNewContext(source,{
    document,location:{hash:'#/capitales'},Date,
    setTimeout:fn=>fn()
  });
  assert.equal(result.schema_version,1);
  assert.equal(result.inspected_without_clicks,true);
  assert.equal(result.submitted_orders,0);
  assert.equal(result.action_kinds.COMPRAR_O_VENDER,1);
  assert.equal(clicks,0);
  assert.ok(!JSON.stringify(result).includes('BUY_1000'));
  assert.ok(!JSON.stringify(result).includes('password'));
  console.log('PASS broker structural probe without clicks or private data');
})().catch(error=>{console.error(error);process.exitCode=1});
