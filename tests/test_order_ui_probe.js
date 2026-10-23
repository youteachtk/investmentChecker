// Real buy-form launcher inspection, with mock DOM. No trading submissions.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('browser/brave-extension/order-ui-probe.js','utf8');
function mock(openBuy=true){
  const clicks=[];
  const el=(text='',extras={})=>({
    innerText:text,textContent:text,tagName:'BUTTON',
    getClientRects:()=>[1],getAttribute:()=>null,
    querySelectorAll:()=>[],closest:()=>null,click:()=>{clicks.push(text)},
    ...extras
  });
  let clickedLauncher=false,clickedBuy=false;
  const buyButton=el('Comprar',{click:()=>{clickedBuy=true;clicks.push('OPEN_BUY_FORM')}});
  const sellButton=el('Vender');
  const menu=el('Comprar Vender',{querySelectorAll:()=>[buyButton,sellButton]});
  const operateButton=el('Comprar o vender',{click:()=>{clickedLauncher=true;clicks.push('OPEN_ACTIONS')}});
  const widget=el('',{querySelectorAll:()=>[operateButton]});
  const cell=el('V');
  const row=el('',{querySelector:()=>widget,querySelectorAll:()=>[cell]});
  const qty=el('',{tagName:'INPUT',type:'number',id:'q',getAttribute:k=>k==='aria-label'?'Cantidad':null});
  const price=el('',{tagName:'INPUT',type:'number',id:'p',getAttribute:k=>k==='aria-label'?'Precio límite':null});
  const dialog=el('Comprar',{querySelectorAll:()=>[qty,price]});
  const document={
    querySelectorAll(selector){
      if(selector==='gt-btn-operar')return [widget];
      if(selector==='tr,[role="row"],mat-row,.mat-row')return [row];
      if(selector==='label')return [];
      if(selector.includes('mat-menu-panel')||selector.includes('[role="menu"]'))
        return clickedLauncher&&!clickedBuy?[menu]:[];
      if(selector==='[role="dialog"],mat-dialog-container,dialog')
        return clickedBuy&&openBuy?[dialog]:[];
      if(selector==='form')return [];
      return [];
    }
  };
  return {clicks,document};
}
(async()=>{
  const success=mock();
  const first=await vm.runInNewContext(source,{
    document:success.document,Date,setTimeout:cb=>cb()
  });
  assert.equal(first.schema_version,2);
  assert.equal(first.stage,'BUY_FORM_DETECTED');
  assert.equal(first.selected_symbol,'V');
  assert.equal(first.form_detected,true);
  assert.equal(first.submitted_orders,0);
  assert.deepEqual(Array.from(first.clicked_steps),['OPEN_MARKET_ACTIONS','OPEN_BUY_FORM']);
  assert.equal(first.fields.some(f=>f.kind==='CANTIDAD'),true);
  assert.equal(first.fields.some(f=>f.kind==='PRECIO'),true);
  assert.deepEqual(success.clicks,['OPEN_ACTIONS','OPEN_BUY_FORM']);
  const noForm=mock(false);
  const second=await vm.runInNewContext(source,{
    document:noForm.document,Date,setTimeout:cb=>cb()
  });
  assert.equal(second.form_detected,false);
  assert.equal(second.submitted_orders,0);
  const unsafe=mock();
  unsafe.document.querySelectorAll=(function(original){
    return selector=>selector==='tr,[role="row"],mat-row,.mat-row'?[]:original(selector);
  })(unsafe.document.querySelectorAll.bind(unsafe.document));
  const third=await vm.runInNewContext(source,{
    document:unsafe.document,Date,setTimeout:cb=>cb()
  });
  assert.equal(third.stage,'TARGET_ROW_NOT_FOUND');
  assert.deepEqual(unsafe.clicks,[]);
  console.log('PASS guided V buy-form discovery and zero order submission');
})().catch(e=>{console.error(e);process.exitCode=1});
