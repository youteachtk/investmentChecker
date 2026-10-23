// Read-only order history: only Actinver's explicit status column is evidence.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('browser/brave-extension/orders-history-probe.js','utf8');
function setup({section=true,rows=true}={}){
  let open=false;const clicks=[];
  const node=(text='',extras={})=>({
    textContent:text,innerText:text,getClientRects:()=>[1],disabled:false,
    getAttribute:()=>null,querySelectorAll:()=>[],click:()=>{},...extras
  });
  const nav=node('Órdenes',{click:()=>{open=true;clicks.push('ORDERS')}});
  const head=['Emisora','Estatus','Operación','Títulos','Folio','Fecha']
    .map(x=>node(x));
  const values=[
    ['V','Ejecutada','Compra','8','ORD001','23/10/2026'],
    ['AAPL','Pendiente','Compra','3','ORD002','23/10/2026'],
    ['KO','Cancelada','Venta','2','ORD003','23/10/2026'],
    ['CVX','Asignada','Compra','1','ORD004','23/10/2026'],
    ['PFE','Parcialmente ejecutada','Compra','7','ORD005','23/10/2026']
  ];
  const trs=values.map(vals=>node('',{querySelectorAll:sel=>
    sel==='td,[role="cell"]'?vals.map(v=>node(v)):[]}));
  const table=node('',{querySelectorAll:sel=>{
    if(sel==='thead th,[role="columnheader"]')return head;
    if(sel==='tbody tr,[role="rowgroup"] [role="row"]')return rows?trs:[];
    return [];
  }});
  const document={querySelectorAll:sel=>{
    if(sel==='table,[role="table"]')return open?[table]:[];
    if(sel.startsWith('a,button'))return section?[nav]:[];
    return [];
  }};
  return {document,clicks};
}
async function inspect(x){
  return vm.runInNewContext(source,{document:x.document,Date,setTimeout:fn=>fn()});
}
(async()=>{
  const yes=setup();
  const a=await inspect(yes);
  assert.equal(a.stage,'ORDERS_TABLE_READ');
  assert.equal(a.orders.length,5);
  assert.equal(a.counts.executed,2);
  assert.equal(a.counts.partial,1);
  assert.equal(a.counts.pending,1);
  assert.equal(a.counts.cancelled,1);
  assert.equal(a.counts.rejected,0);
  assert.equal(a.submitted_orders,0);
  assert.deepEqual(yes.clicks,['ORDERS']);
  const no=setup({section:false});
  const b=await inspect(no);
  assert.equal(b.stage,'ORDERS_SECTION_NOT_FOUND');
  assert.deepEqual(no.clicks,[]);
  const empty=setup({rows:false});
  const c=await inspect(empty);
  assert.equal(c.stage,'ORDERS_TABLE_EMPTY');
  assert.equal(c.orders.length,0);
  console.log('PASS private read-only orders status requires visible status table');
})().catch(e=>{console.error(e);process.exitCode=1});
