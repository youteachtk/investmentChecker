// Inspect a real-looking paginated Capitales table, without submitting trades.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('browser/brave-extension/order-ui-probe.js','utf8');
function setup({visaPage=1,form=true}={}){
  const clicks=[];let page=1,menuOpen=false,buyOpen=false;
  const node=(value='',extra={})=>({
    innerText:value,textContent:value,tagName:'BUTTON',getClientRects:()=>[1],
    getAttribute:()=>null,querySelector:()=>null,querySelectorAll:()=>[],
    closest:()=>null,classList:{contains:()=>false},disabled:false,
    click:()=>{clicks.push(value)},...extra
  });
  const buy=node('Comprar',{click:()=>{buyOpen=true;clicks.push('BUY_MENU')}});
  const sell=node('Vender');
  const menu=node('Comprar Vender',{querySelectorAll:s=>
    s.startsWith('input,select,textarea')?[]:[buy,sell]});
  const launcher=node('Operar',{click:()=>{menuOpen=true;clicks.push('OPEN_ACTION')}});
  const widget=node('',{querySelectorAll:()=>[launcher]});
  const row=symbol=>node('',{querySelector:s=>s==='gt-btn-operar'?widget:null,
    querySelectorAll:s=>s.startsWith('td')?[node(symbol)]:[]});
  const head=node('Emisora');
  const table=node('',{querySelectorAll:s=>{
    if(s==='thead th')return [head];
    if(s==='tbody tr')return [row(page===visaPage?'V':'AA1')];
    return [];
  }});
  const number=n=>node(String(n),{
    classList:{contains:c=>c==='active'&&page===n},
    click:()=>{page=n;clicks.push('PAGE_'+n)}
  });
  const first=number(1),second=number(2);
  const paginator=node('',{querySelectorAll:s=>s==='button'?[first,second]:[],
    querySelector:()=>null});
  const root=node('',{querySelectorAll:s=>{
    if(s==='app-tabla-material table.table-capitales')return [table];
    if(s==='div.tab-btn')return [];
    return [];
  },querySelector:s=>s==='app-paginator'?paginator:null});
  const qty=node('',{tagName:'INPUT',type:'number',id:'q',
    getAttribute:key=>key==='aria-label'?'Cantidad':null});
  const price=node('',{tagName:'INPUT',type:'number',id:'p',
    getAttribute:key=>key==='aria-label'?'Precio límite':null});
  const dialog=node('Compra',{querySelectorAll:()=>[qty,price]});
  const document={
    querySelector:s=>s==='app-capitales'?root:null,
    querySelectorAll:s=>{
      if(s==='gt-btn-operar')return [widget];
      if(s==='label')return [];
      if(s.startsWith('[role="dialog"],mat-dialog-container,dialog'))
        return buyOpen&&form?[dialog]:[];
      if(s==='form')return [];
      if(s.includes('[role="menu"]')||s.includes('mat-menu-panel'))
        return menuOpen&&!buyOpen?[menu]:[];
      return [];
    }
  };
  return {document,clicks,getPage:()=>page};
}
async function run(model){
  return vm.runInNewContext(src,{document:model.document,Date,setTimeout:fn=>fn()});
}
(async()=>{
  const first=setup();
  const ok=await run(first);
  assert.equal(ok.schema_version,2);
  assert.equal(ok.stage,'BUY_FORM_DETECTED');
  assert.equal(ok.selected_symbol,'V');
  assert.equal(ok.form_detected,true);
  assert.equal(ok.submitted_orders,0);
  assert.equal(ok.located_page,1);
  assert.deepEqual(first.clicks,['OPEN_ACTION','BUY_MENU']);
  assert.deepEqual(Array.from(ok.clicked_steps),['OPEN_MARKET_ACTIONS','OPEN_BUY_FORM']);
  assert.equal(ok.fields.some(f=>f.kind==='CANTIDAD'),true);
  assert.equal(ok.fields.some(f=>f.kind==='PRECIO'),true);
  // The real Actinver interface can render a nonmodal right-side drawer.
  const side=setup();
  const orig=side.document.querySelectorAll.bind(side.document);
  side.document.querySelectorAll=s=>{
    if(s==='aside,[role="complementary"],mat-sidenav,mat-drawer,.mat-drawer,.mat-sidenav')
      return [{getClientRects:()=>[1],disabled:false}];
    return orig(s);
  };
  const sideResult=await run(side);
  assert.equal(sideResult.side_panel_visible,true);
  assert.equal(sideResult.submitted_orders,0);
  const second=setup({visaPage:2});
  const paged=await run(second);
  assert.equal(paged.stage,'BUY_FORM_DETECTED');
  assert.equal(paged.located_page,2);
  assert.equal(paged.pages_visited,2);
  assert.equal(second.getPage(),2);
  assert.deepEqual(second.clicks,['PAGE_2','OPEN_ACTION','BUY_MENU']);
  const absent=setup({visaPage:99});
  const notFound=await run(absent);
  assert.equal(notFound.stage,'TARGET_ROW_NOT_FOUND');
  assert.equal(notFound.submitted_orders,0);
  assert.deepEqual(absent.clicks,['PAGE_2']);
  const unfilled=setup({form:false});
  const partial=await run(unfilled);
  assert.equal(partial.form_detected,false);
  assert.equal(partial.submitted_orders,0);
  assert.ok(!JSON.stringify(partial).includes('password'));
  console.log('PASS Capitales pagination to V and zero purchase submissions');
})().catch(e=>{console.error(e);process.exitCode=1});
