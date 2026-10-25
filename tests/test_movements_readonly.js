// Real Movimientos columns, 10 + 2 paginated rows; never a trade.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('browser/brave-extension/order-preflight.js','utf8');
const from=source.indexOf('async function inspectMovementsInPage(){');
const to=source.indexOf('async function movementHistoryStatus(){',from);
assert.ok(from>=0&&to>from,'Self-contained injected Movimientos reader');
const embedded=source.slice(from,to);
function fixture({route='#/movimientos',pages=true,tableVisible=true,empty=false,extraDomRows=false}={}){
  let page=1;const clicks=[];
  const node=(t='',extras={})=>({
    innerText:t,textContent:t,getClientRects:()=>[{}],disabled:false,
    querySelectorAll:()=>[],click:()=>{throw Error('Unexpected click')},...extras
  });
  const names=['Fecha','Hora','Folio','Emisora','Operación','Títulos','Precio',
    'Comisión','IVA','Importe total'];
  const fillings=[
    ['12/OCT/2026','13:43','13973390','PFE *','COMPRA','1','$519.00','$0.52','$0.08','$519.60'],
    ['12/OCT/2026','13:43','13973390','PFE *','COMPRA','5','$518.50','$2.59','$0.41','$2,595.51'],
    ['12/OCT/2026','13:43','13973390','PFE *','COMPRA','11','$518.51','$5.70','$0.91','$5,710.23'],
    ['13/OCT/2026','10:40','13992941','KO *','COMPRA','35','$1,660.00','$58.10','$9.30','$58,167.40'],
    ['13/OCT/2026','10:44','13993200','QQQ *','COMPRA','1','$13,673.22','$13.67','$2.19','$13,689.08'],
    ['13/OCT/2026','10:44','13993200','QQQ *','COMPRA','1','$13,645.00','$13.65','$2.18','$13,660.83'],
    ['13/OCT/2026','10:44','13993200','QQQ *','COMPRA','1','$13,659.00','$13.66','$2.19','$13,674.84'],
    ['13/OCT/2026','10:44','13993200','QQQ *','COMPRA','1','$13,647.38','$13.65','$2.18','$13,663.21'],
    ['13/OCT/2026','12:26','13998584','AAPL *','COMPRA','1','$6,290.00','$6.29','$1.01','$6,297.30'],
    ['13/OCT/2026','12:26','13998584','AAPL *','COMPRA','2','$6,290.00','$12.58','$2.01','$12,594.59'],
    ['14/OCT/2026','09:00','14000001','CVX *','VENTA','1','$4,000.00','$4.00','$0.64','$3,995.36'],
    ['14/OCT/2026','09:05','14000002','V *','COMPRA','1','$5,000.00','$5.00','$0.80','$5,005.80']
  ];
  const grid=node('',{querySelectorAll:(sel)=>{
    if(sel.startsWith('thead th,'))return names.map(n=>node(n));
    if(sel.startsWith('tbody tr,')){
      const rows=page===1?fillings.slice(0,10):fillings.slice(10);
      const mapped=rows.map(values=>node('',{querySelectorAll:sel=>
        sel.startsWith('td,')?values.map(v=>node(v)):[]}));
      if(extraDomRows&&page===1){
        mapped.push(node('Cargando...',{querySelectorAll:()=>[]}));
        mapped.push(node('Fila auxiliar',{querySelectorAll:()=>[]}));
      }
      return mapped;
    }
    return [];
  }});
  const pageTwo=node('2',{click:()=>{clicks.push('PAGE_2');page=2}});
  const document={
    body:{get innerText(){return 'Todos los movimientos: '+(empty?0:12)+
      ' | Sección: '+page+' de '+(pages?2:1);}},
    querySelectorAll:(sel)=>{
      if(sel.startsWith('table,'))return tableVisible?[grid]:[];
      if(sel==='button,a,[role="button"]')return pages&&page===1?[pageTwo]:[];
      return [];
    }
  };
  return {document,location:{hash:route},clicks};
}
async function inspect(o){
  const f=fixture(o);
  const result=await vm.runInNewContext(embedded+'\ninspectMovementsInPage()',
    {document:f.document,location:f.location,Date,
     setTimeout:fn=>fn(),Number,String,Math,Promise});
  return {result,clicks:f.clicks};
}
(async()=>{
  const {result:r,clicks}=await inspect();
  assert.equal(r.stage,'MOVEMENTS_VERIFIED');
  assert.equal(r.total_expected,12);
  assert.equal(r.total_pages,2);
  assert.equal(r.pages_read,2);
  assert.equal(r.movements.length,12);
  assert.equal(r.submitted_orders,0);
  assert.equal(r.movements.filter(x=>x.folio==='13973390').length,3,
    'Keep partial fills sharing the same folio');
  assert.equal(r.movements[10].side,'SELL');
  assert.equal(r.movements[0].symbol,'PFE');
  assert.equal(r.movements[0].price_mxn,519);
  assert.deepEqual(clicks,['PAGE_2'],'Only page number control clicked');
  const withExtra=await inspect({extraDomRows:true});
  assert.equal(withExtra.result.stage,'MOVEMENTS_VERIFIED');
  assert.equal(withExtra.result.movements.length,12);
  assert.equal(withExtra.result.rows_scanned,14);
  assert.deepEqual(withExtra.clicks,['PAGE_2']);
  const wrong=await inspect({route:'#/ordenes'});
  assert.equal(wrong.result.stage,'MOVEMENTS_WRONG_ROUTE');
  assert.deepEqual(wrong.clicks,[]);
  const blocked=await inspect({pages:false});
  assert.equal(blocked.result.stage,'MOVEMENTS_PARTIAL');
  assert.equal(blocked.result.pages_read,1);
  assert.equal(blocked.result.movements.length,10);
  assert.deepEqual(blocked.clicks,[]);
  const missing=await inspect({tableVisible:false});
  assert.equal(missing.result.stage,'MOVEMENTS_TABLE_MISSING');
  assert.deepEqual(missing.clicks,[]);
  assert.ok(source.includes('actinver/movements-latest.json'));
  assert.ok(source.includes('func:inspectMovementsInPage,world:'));
  assert.ok(source.includes('async function scheduledOrdersStatus(){'));
  console.log('PASS 12 movements over 2 pages, repeated folios retained, safe pagination');
})().catch(e=>{console.error(e);process.exitCode=1});
