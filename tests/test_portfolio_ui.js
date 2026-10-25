// Read-only private account capture. Test with simulated numbers only.
// No GitHub tokens, personal identities, or real account holdings in this test.
'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('browser/brave-extension/portfolio-collector.js','utf8');
const leaf=(label,amount)=>({
  textContent:label,innerText:label,children:[],getClientRects:()=>[1],
  parentElement:{innerText:label+' '+amount,parentElement:null}
});
const nodes=[
  leaf('Valuación total ⓘ','$1,001,118.05'),
  leaf('Inversiones','$230,704.67'),
  leaf('Poder de compra','$770,413.38'),
  leaf('Por liquidar','$0.00')
];
const cell=s=>({innerText:s});
const table={
  getClientRects:()=>[1],
  querySelectorAll:s=>s.startsWith('thead')?
    ['Emisora','Títulos','Costo promedio','Precio actual','Valor actual'].map(cell):
    s.startsWith('tbody')?[{
      getClientRects:()=>[1],
      querySelectorAll:()=>['AAPL','4','$2,000.00','$2,500.00','$10,000.00'].map(cell)
    }]:[]
};
const document={querySelectorAll:s=>s.startsWith('span,div')?nodes:
  s.startsWith('table')?[table]:[]};
let message=null;
const chrome={runtime:{sendMessage:async payload=>{
  message=payload;return {ok:true,uploaded:true};
}}};
(async()=>{
  const result=await vm.runInNewContext(source,{
    document,chrome,location:{hash:'#/portafolio'},console:{warn(){},log(){}},
    setTimeout:cb=>cb(),Date,Promise
  },{timeout:10000});
  assert.equal(result.ok,true);
  assert.equal(result.uploaded,true);
  assert.equal(result.summary_detected,true);
  assert.equal(result.holdings_detected,true);
  assert.equal(message.type,'PRIVATE_CAPTURE');
  assert.equal(message.payload.summary.total_value,1001118.05);
  assert.equal(message.payload.summary.investments,230704.67);
  assert.equal(message.payload.summary.buying_power,770413.38);
  assert.equal(message.payload.summary.unsettled,0);
  assert.equal(message.payload.holdings[0].symbol,'AAPL');
  assert.equal(message.payload.holdings[0].quantity,4);
  assert.equal(message.payload.holdings[0].value_mxn,10000);
  assert.equal(message.diagnostic.summary_detected,true);
  assert.equal(message.diagnostic.holdings_detected,true);
  // The same table on the Movimientos route cannot be accepted as holdings.
  message=null;
  const wrongRoute=await vm.runInNewContext(source,{
    document,chrome,location:{hash:'#/movimientos'},console:{warn(){},log(){}},
    setTimeout:cb=>cb(),Date,Promise
  },{timeout:10000});
  assert.equal(wrongRoute.holdings_detected,false);
  assert.equal(message.payload.holdings,null);
  // Even if Angular keeps an old Movimientos grid visible on #/portafolio,
  // its Fecha/Folio/Operación headers cannot qualify as positions.
  const movementTable={...table,querySelectorAll:sel=>sel.startsWith('thead')?
    ['Fecha','Folio','Emisora','Operación','Títulos','Precio','Comisión']
      .map(cell):
    sel.startsWith('tbody')?[{
      getClientRects:()=>[1],
      querySelectorAll:()=>['12/OCT/2026','F001','AAPL','COMPRA','4',
        '$100.00','$0.10'].map(cell)
    }]:[]};
  const movementDocument={querySelectorAll:sel=>sel.startsWith('span,div')?nodes:
    sel.startsWith('table')?[movementTable]:[]};
  message=null;
  const transition=await vm.runInNewContext(source,{
    document:movementDocument,chrome,location:{hash:'#/portafolio'},
    console:{warn(){},log(){}},setTimeout:cb=>cb(),Date,Promise
  },{timeout:10000});
  assert.equal(transition.holdings_detected,false);
  assert.equal(message.payload.holdings,null);
  // No credentials, HTML, customer identities or account numbers are uploaded.
  assert.ok(!JSON.stringify(message).includes('github_pat_'));
  console.log('PASS private summary, holdings, acknowledgement, and safe metadata');
})().catch(e=>{console.error(e);process.exitCode=1;});