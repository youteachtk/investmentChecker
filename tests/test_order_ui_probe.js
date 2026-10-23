// Read-only stock Detail inspection: never open Operar or submit a trade.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('browser/brave-extension/order-ui-probe.js','utf8');
function mock({visaPage=1,link=true,navigate=true}={}){
  let page=1;
  const clicks=[];
  const location={hash:'#/capitales'};
  const el=(value='',extra={})=>({
    innerText:value,textContent:value,tagName:'DIV',
    getClientRects:()=>[1],disabled:false,querySelector:()=>null,
    querySelectorAll:()=>[],getAttribute:()=>null,
    closest:()=>null,classList:{contains:()=>false},
    click:()=>{clicks.push('UNEXPECTED')},...extra
  });
  const widget=el('',{tagName:'GT-BTN-OPERAR'});
  const detail=el('Detalle',{tagName:'A',click:()=>{
    clicks.push('DETAIL');
    if(navigate)location.hash='#/capitales/detalle/DetalleAcciones';
  }});
  const infoCell=el('Detalle',{tagName:'TD',querySelectorAll:()=>link?[detail]:[]});
  const symbolCell=s=>el(s,{tagName:'TD'});
  const row=s=>el('',{
    querySelector:selector=>selector==='gt-btn-operar'?widget:null,
    querySelectorAll:selector=>selector==='td'?[infoCell,symbolCell(s)]:[]
  });
  const th1=el('Información',{tagName:'TH'});
  const th2=el('Emisora',{tagName:'TH'});
  const table=el('',{querySelectorAll:selector=>{
    if(selector==='thead th')return [th1,th2];
    if(selector==='tbody tr')return [row(page===visaPage?'V':'AA1')];
    return [];
  }});
  const nav=n=>el(String(n),{tagName:'BUTTON',
    classList:{contains:name=>name==='active'&&page===n},
    click:()=>{page=n;clicks.push('PAGE_'+n)}
  });
  const buttons=[nav(1),nav(2)];
  const paginator=el('',{querySelectorAll:selector=>selector==='button'?buttons:[],
    querySelector:()=>null});
  const root=el('',{
    querySelector:selector=>selector==='app-paginator'?paginator:null,
    querySelectorAll:selector=>{
      if(selector==='app-tabla-material table.table-capitales')return [table];
      if(selector==='div.tab-btn')return [];
      return [];
    }
  });
  const buy=el('Comprar',{tagName:'BUTTON',click:()=>{clicks.push('WRONG_BUY')}});
  const sell=el('Vender',{tagName:'BUTTON',click:()=>{clicks.push('WRONG_SELL')}});
  const document={
    querySelector:s=>s==='app-capitales'?root:null,
    querySelectorAll:s=>{
      if(s==='gt-btn-operar')return [widget];
      if(s==='button,a,input,select,textarea,[role="button"],[role="link"]' ||
         s==='button,a,[role="button"],[role="link"]')
        return location.hash.includes('DetalleAcciones')?[buy,sell]:[];
      return [];
    }
  };
  return {clicks,location,document};
}
async function inspect(model){
  return vm.runInNewContext(source,{
    document:model.document,location:model.location,
    Date,setTimeout:callback=>callback()
  });
}
(async()=>{
  const first=mock();
  const ok=await inspect(first);
  assert.equal(ok.stage,'DETAIL_OPENED');
  assert.equal(ok.detail_route_verified,true);
  assert.equal(ok.selected_symbol,'V');
  assert.equal(ok.form_detected,false);
  assert.equal(ok.detail_controls.buy_control_present,true);
  assert.equal(ok.detail_controls.sell_control_present,true);
  assert.equal(ok.submitted_orders,0);
  assert.deepEqual(first.clicks,['DETAIL']);
  assert.deepEqual(Array.from(ok.clicked_steps),['OPEN_STOCK_DETAIL']);

  const later=mock({visaPage:2});
  const paged=await inspect(later);
  assert.equal(paged.stage,'DETAIL_OPENED');
  assert.equal(paged.located_page,2);
  assert.equal(paged.pages_visited,2);
  assert.deepEqual(later.clicks,['PAGE_2','DETAIL']);

  const absent=mock({visaPage:99});
  const notFound=await inspect(absent);
  assert.equal(notFound.stage,'TARGET_ROW_NOT_FOUND');
  assert.deepEqual(absent.clicks,['PAGE_2']);

  const missing=mock({link:false});
  const missingResult=await inspect(missing);
  assert.equal(missingResult.stage,'DETAIL_LINK_NOT_FOUND');
  assert.deepEqual(missing.clicks,[]);

  const failed=mock({navigate:false});
  const failResult=await inspect(failed);
  assert.equal(failResult.stage,'DETAIL_NAVIGATION_NOT_CONFIRMED');
  assert.equal(failResult.detail_route_verified,false);
  assert.equal(failResult.submitted_orders,0);
  assert.deepEqual(failed.clicks,['DETAIL']);
  console.log('PASS Visa Detail navigation with correct row, pagination and zero order submissions');
})().catch(error=>{console.error(error);process.exitCode=1});
