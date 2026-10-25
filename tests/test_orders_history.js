// Read-only order history: only Actinver's explicit status column is evidence.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('browser/brave-extension/orders-history-probe.js','utf8');
function setup({section=true,rows=true,navMode='button',layout='table',direct=false}={}){
  let open=direct;const clicks=[];
  const location={hash:direct?'#/ordenes':'#/portafolio'};
  const node=(text='',extras={})=>({
    textContent:text,innerText:text,getClientRects:()=>[1],disabled:false,
    getAttribute:()=>null,querySelectorAll:()=>[],click:()=>{},...extras
  });
  const nav=node('Órdenes',{click:()=>{open=true;location.hash='#/inversion/ordenes';clicks.push('ORDERS')}});
  const nestedCaption=node('Órdenes',{closest:()=>nav});
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
    sel.startsWith('td,[role="cell"]')?vals.map(v=>node(v)):[]}));
  const table=node('',{querySelectorAll:sel=>{
    if(sel.startsWith('thead th,[role="columnheader"]'))return head;
    if(sel.startsWith('tbody tr,[role="rowgroup"] [role="row"]'))return rows?trs:[];
    return [];
  }});
  const document={body:{get innerText(){return layout==='empty-state'&&open?'No hay órdenes':' ';}},querySelectorAll:sel=>{
    if(sel==='table,[role="table"]')return open&&layout==='table'?[table]:[];
    if(sel.includes('mat-table'))return open&&layout!=='empty-state'?[table]:[];
    if(sel.startsWith('a,button'))return section&&navMode!=='caption'?[nav]:[];
    if(sel==='span,div,li,p,small')return section&&navMode==='caption'?
      [nestedCaption]:[];
    return [];
  }};
  return {document,location,clicks};
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
  assert.equal(a.probe_step,'COMPLETED');
  assert.equal(a.visible_table_count,0);
  assert.equal(a.order_nav_candidate_count,1);
  assert.deepEqual(yes.clicks,['ORDERS']);
  const no=setup({section:false});
  const b=await inspect(no);
  assert.equal(b.stage,'ORDERS_SECTION_NOT_FOUND');
  assert.equal(b.probe_step,'FIND_ORDER_NAVIGATION');
  assert.equal(b.order_nav_candidate_count,0);
  assert.deepEqual(no.clicks,[]);
  const empty=setup({rows:false});
  const c=await inspect(empty);
  assert.equal(c.stage,'ORDERS_TABLE_EMPTY');
  assert.equal(c.orders.length,0);
  const privateUploader=fs.readFileSync('browser/brave-extension/private-sync.js','utf8');
  const orderPreflight=fs.readFileSync('browser/brave-extension/order-preflight.js','utf8');
  assert.ok(privateUploader.includes('actinver/order-history-diagnostic.json'));
  assert.ok(orderPreflight.includes('uploadPrivateDiagnostic(diag)'));
  assert.ok(orderPreflight.includes("orderHistoryDiagnosticCode:diag.code"));
  for(const code of ['ORDERS_READER_MISSING','ORDERS_INJECTION_FAILED',
    'ORDERS_INVALID_RESULT']){
    assert.ok(privateUploader.includes("'"+code+"'"),code+' not allowed for private logs');
    if(code!=='ORDERS_READER_MISSING')
      assert.ok(orderPreflight.includes("'"+code+"'"),code+' not identified');
  }
  // Regression: the Windows updater may omit a standalone file.
  // The live extension must inject a self-contained read-only function instead.
  assert.ok(orderPreflight.includes("func:inspectOrdersInPage,world:'ISOLATED'"));
  const from=orderPreflight.indexOf('async function inspectOrdersInPage(){');
  const to=orderPreflight.indexOf('async function orderHistoryStatus(){',from);
  assert.ok(from>=0 && to>from,'Embedded orders reader must exist');
  const embedded=orderPreflight.slice(from,to);
  assert.ok(orderPreflight.includes("https://www.retoactinver.com/RetoActinver/#/ordenes"),
    'Orders history must open the user-verified direct route');
  assert.ok(embedded.includes('CHECK_DIRECT_ORDERS_ROUTE'));
  assert.ok(!embedded.includes('menus[0].click()'),'Do not click speculative menus');
  for(const scenario of [
    {options:{direct:true,section:false},expected:'ORDERS_TABLE_READ',count:5},
    {options:{direct:false,section:false},expected:'ORDERS_ROUTE_MISMATCH',count:0},
    {options:{direct:true,layout:'grid'},expected:'ORDERS_TABLE_READ',count:5},
    {options:{direct:true,layout:'empty-state'},expected:'ORDERS_TABLE_NOT_VERIFIED',count:0},
    {options:{direct:true,rows:false},expected:'ORDERS_TABLE_EMPTY',count:0}
  ]){
    const mock=setup(scenario.options);
    const actual=await vm.runInNewContext(
      embedded+'\ninspectOrdersInPage()',{
        document:mock.document,location:mock.location,Date,setTimeout:fn=>fn()
      });
    assert.equal(actual.stage,scenario.expected);
    assert.equal(actual.orders.length,scenario.count);
    assert.equal(actual.submitted_orders,0);
    assert.equal(actual.read_only,true);
    assert.deepEqual(mock.clicks,[],'A direct orders reader must never click menu or trading controls');
    if(scenario.options.layout==='grid')assert.equal(actual.possible_grid_count,1);
    if(scenario.options.layout==='empty-state'){
      assert.equal(actual.empty_notice_detected,true);
      assert.equal(actual.orders_route_seen,true);
    }
    if(actual.orders.length){
      assert.equal(actual.orders[0].folio,'ORD001');
      assert.equal(actual.orders[0].date,'23/10/2026');
    }
  }
  const popup=fs.readFileSync('browser/brave-extension/popup.js','utf8');
  assert.ok(popup.includes('dates.sort((a,b)=>Date.parse(b)-Date.parse(a))'),
    'Popup must prefer the latest order-history timestamp');
  console.log('PASS private read-only orders status requires visible status table');
})().catch(e=>{console.error(e);process.exitCode=1});
