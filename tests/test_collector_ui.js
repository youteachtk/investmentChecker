// Real Actinver Capitales DOM contract, recorded 2026-10-20 from user inspector.
// Angular Material components, tab-btn.active parent and app-paginator .btn-pages.
// No assumed ticker names or fixed first symbols. The selected tab changes
// eight seconds BEFORE Angular renders the corresponding category rows.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('browser/brave-extension/collector.js','utf8');
for(const obsolete of ['const CATALOG=','AAXJ','AA1','ACTDUAL',
  'findTab(name)','table tbody tr']) {
  assert.equal(src.includes(obsolete),false,'Old selector/catalog logic: '+obsolete);
}
const tickers=[145,56,25].map((size,g)=>
  Array.from({length:size},(_,j)=>'S'+g+'_'+String(j+1).padStart(4,'0')));
let state={category:0,visibleCategory:0,page:1,window:0,stalledETF:0,arrowClicks:0,pendingCategory:null,refreshAt:Infinity};
let captured=null,error=null,now=Date.UTC(2026,9,20,16);
const visible=()=>[{}];
const cells=['Fav','Información','Emisora','Precio','% Variación','Volumen Compra',
  'Precio de Compra','Volumen de Venta','Precio de Venta','Comprar o vender'];
const rows=()=>tickers[state.visibleCategory]
  .slice((state.page-1)*10,state.page*10)
  .map(symbol=>({
    getClientRects:visible,
    querySelectorAll:sel=>{
      assert.equal(sel,'td');
      // Deliberately different buy / sell volumes and price fields,
      // including misleading mat-column classes from actual user report.
      const funds=symbol.startsWith('S2_');
      const data=['*','Detalle',symbol,funds?'':'$100.00',funds?'':'1.00%',funds?'0':'123',funds?'0':'$99.00',funds?'0':'555',funds?'':'$101.00','Operar'];
      return data.map((innerText,i)=>({
        innerText,
        classList:{contains:name=>i===7?name==='mat-column-precioVenta':
          i===8?name==='mat-column-venta':false}
      }));
    }
  }));
const table={
  getClientRects:visible,
  querySelectorAll:sel=>sel==='thead th'?cells.map(innerText=>({innerText})):
    sel==='tbody tr'?rows():[]
};
const categories=[0,1,2].map(i=>({
  getClientRects:visible,
  classList:{contains:name=>name==='active'&&state.category===i},
  querySelector:sel=>{
    assert.equal(sel,'button');
    return {disabled:false,click(){
      if(i===1&&state.category===0&&state.stalledETF++===0)return;
      state.category=i;state.page=1;state.window=0;
      state.pendingCategory=i;state.refreshAt=now+8000;
    }};
  }
}));
const makePage=n=>({
  innerText:String(n),getClientRects:visible,disabled:false,
  classList:{contains:key=>key==='active'&&state.page===n},
  click(){state.page=n}
});
const left={
  innerText:'',getClientRects:visible,disabled:false,
  click(){state.window=Math.max(0,state.window-1)}
};
const right={
  innerText:'',getClientRects:visible,disabled:false,
  click(){state.arrowClicks++;state.window++}
};
const buttonsWindow=()=>[
  left,
  ...Array.from({length:Math.min(4,Math.ceil(tickers[state.category].length/10)-
    state.window*4)},(_,j)=>makePage(state.window*4+j+1)),
  right
];
const paginator={
  getClientRects:visible,
  querySelector:sel=>{
    if(sel==='button.btn-first-page')return {
      get disabled(){return state.page===1;},
      click(){state.page=1;state.window=0}
    };
    if(sel==='.btn-pages')return {querySelectorAll:()=>buttonsWindow()};
    return null;
  },
  querySelectorAll:()=>buttonsWindow()
};
const root={
  querySelectorAll:sel=>sel==='div.tab-btn'?categories:
    sel==='app-tabla-material table.table-capitales'?[table]:[],
  querySelector:sel=>sel==='app-paginator'?paginator:null
};
const document={querySelector:sel=>sel==='app-capitales'?root:null};
const chrome={runtime:{sendMessage:async msg=>{
  if(msg.type==='COLLECT_DONE')captured=msg.payload;
  if(msg.type==='COLLECT_FAILED')error=msg.reason;
  return {ok:true};
}}};
class FakeDate extends Date{
  constructor(...args){super(...(args.length?args:[now]));}
  static now(){return now;}
}
(async()=>{
  await vm.runInNewContext(src,{
    document,chrome,location:{hash:'#/capitales'},Date:FakeDate,
    console:{log(){},error(){}},Promise,JSON,Set,
    setTimeout:(fn,ms=0)=>{now+=ms;if(now>=state.refreshAt){state.visibleCategory=state.pendingCategory;state.refreshAt=Infinity;}fn();}
  },{timeout:5000});
  assert.equal(error,null,error||'Collector failed');
  assert.ok(captured,'No quotes captured');
  assert.equal(captured.rows.length,226);
  assert.deepEqual(['ACCIONES','ETFs','FONDOS'].map(c=>
    captured.rows.filter(x=>x.category===c).length),[145,56,25]);
  assert.equal(captured.rows[0].symbol,'S0_0001');
  assert.equal(captured.rows[145].symbol,'S1_0001');
  assert.equal(captured.rows[0].bid_volume,'123');
  assert.equal(captured.rows[0].bid,'$99.00');
  assert.equal(captured.rows[0].ask_volume,'555');
  assert.equal(captured.rows[0].ask,'$101.00');
  const funds=captured.rows.filter(x=>x.category==='FONDOS');
  assert.equal(funds.length,25);
  assert.ok(funds.every(x=>x.last==='' && x.ask===''),
    'Capitales funds must accept absent last and ask prices');
  assert.ok(state.arrowClicks>=3,'Never advanced past pages 4/8/12');
  assert.ok(state.stalledETF>=1,'Delayed category load was not simulated');
  assert.equal(state.visibleCategory,2,'Delayed Angular render never caught up');
  console.log('PASS: real Angular selectors; all 226; arrows and header mappings');
})().catch(e=>{console.error(e);process.exitCode=1;});