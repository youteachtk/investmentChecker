// Read-only stock Detail inspection: never open Operar or submit a trade.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('browser/brave-extension/order-ui-probe.js','utf8');
function mock({visaPage=1,link=true,navigate=true,ticketOpens=true,startingForm=false}={}){
  let page=1,ticketOpen=false;
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
  const buy=el('Comprar',{tagName:'BUTTON',click:()=>{ticketOpen=true;clicks.push('OPEN_BUY_TICKET')}});
  const sell=el('Vender',{tagName:'BUTTON',click:()=>{clicks.push('WRONG_SELL')}});
  const qty=el('',{tagName:'INPUT',type:'number',id:'quantity',getAttribute:k=>k==='aria-label'?'Títulos':null});
  const price=el('',{tagName:'INPUT',type:'number',id:'limit',getAttribute:k=>k==='aria-label'?'Precio límite':null});
  const document={
    querySelector:s=>s==='app-capitales'?root:null,
    querySelectorAll:s=>{
      if(s==='gt-btn-operar')return [widget];
      if(s==='input,select,textarea,[role="spinbutton"],mat-select')
        return startingForm||(ticketOpen&&ticketOpens)?[qty,price]:[];
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
  assert.equal(ok.stage,'DETAIL_BUY_TICKET_FIELDS_DETECTED');
  assert.equal(ok.detail_route_verified,true);
  assert.equal(ok.selected_symbol,'V');
  assert.equal(ok.form_detected,true);
  assert.equal(ok.detail_controls.buy_control_present,true);
  assert.equal(ok.detail_controls.sell_control_present,true);
  assert.equal(ok.submitted_orders,0);
  assert.deepEqual(first.clicks,['DETAIL','OPEN_BUY_TICKET']);
  assert.deepEqual(Array.from(ok.clicked_steps),['OPEN_STOCK_DETAIL','OPEN_DETAIL_BUY_TICKET']);

  const later=mock({visaPage:2});
  const paged=await inspect(later);
  assert.equal(paged.stage,'DETAIL_BUY_TICKET_FIELDS_DETECTED');
  assert.equal(paged.located_page,2);
  assert.equal(paged.pages_visited,2);
  assert.deepEqual(later.clicks,['PAGE_2','DETAIL','OPEN_BUY_TICKET']);

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

  const alreadyHasForm=mock({startingForm:true});
  const guard=await inspect(alreadyHasForm);
  assert.equal(guard.stage,'DETAIL_TICKET_LAUNCHER_UNVERIFIED');
  assert.deepEqual(alreadyHasForm.clicks,['DETAIL']);

  const noTicket=mock({ticketOpens:false});
  const unknown=await inspect(noTicket);
  assert.equal(unknown.stage,'DETAIL_BUY_TICKET_NOT_DETECTED');
  assert.deepEqual(noTicket.clicks,['DETAIL','OPEN_BUY_TICKET']);
  assert.equal(unknown.submitted_orders,0);
  console.log('PASS Visa Detail buy-ticket launcher, field detection and zero order submissions');
})().catch(error=>{console.error(error);process.exitCode=1});
