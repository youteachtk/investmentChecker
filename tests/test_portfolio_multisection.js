// Read-only portfolio: one inactive tab can scan safe category tabs and pages.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('browser/brave-extension/portfolio-collector.js','utf8');
function fixture(){
  let category='Acciones',page=1;const clicks=[];let captured=null;
  const leaf=(name,value)=>({
    textContent:name,innerText:name,getClientRects:()=>[{}],
    parentElement:{innerText:name+' '+value,parentElement:null}
  });
  const summary=[
    leaf('Valuación total','$15,000.00'),
    leaf('Inversiones','$5,000.00'),
    leaf('Poder de compra','$10,000.00'),
    leaf('Por liquidar','$0.00')
  ];
  const cell=t=>({innerText:t,textContent:t,getClientRects:()=>[{}]});
  const headings=['Emisora','Títulos','Precio actual'];
  const grid={
    getClientRects:()=>[{}],
    querySelectorAll:sel=>{
      if(sel.startsWith('thead'))return headings.map(cell);
      if(!sel.startsWith('tbody'))return [];
      const values=category==='Acciones'?
        page===1?['AAPL','2','$1,000.00']:['KO','1','$1,000.00']:
        ['QQQ','1','$2,000.00'];
      return [{getClientRects:()=>[{}],innerText:values.join(' '),
        querySelectorAll:()=>values.map(cell)}];
    }
  };
  const tab=(name)=>({
    textContent:name,innerText:name,getClientRects:()=>[{}],
    getAttribute:(key)=>key==='aria-selected'?(name===category?'true':'false'):null,
    click:()=>{clicks.push('TAB_'+name);category=name;page=1;}
  });
  const categoryTabs=[tab('Acciones'),tab('ETF')];
  const pageTwo={textContent:'2',innerText:'2',getClientRects:()=>[{}],
    click:()=>{clicks.push('PAGE_2');page=2;}};
  const document={
    body:{get innerText(){return 'Sección: '+page+' de '+(category==='Acciones'?2:1);}},
    querySelectorAll:sel=>{
      if(sel.startsWith('span,div'))return summary;
      if(sel.startsWith('table'))return [grid];
      if(sel.startsWith('[role="tab"]'))return categoryTabs;
      if(sel==='button,a,[role="button"]')return category==='Acciones'&&page===1?[pageTwo]:[];
      return [];
    }
  };
  const chrome={runtime:{sendMessage:async msg=>{captured=msg;return {ok:true,uploaded:true};}}};
  return {document,chrome,clicks,get captured(){return captured;}};
}
async function run(flag){
  const f=fixture();
  const result=await vm.runInNewContext(source,{
    document:f.document,chrome:f.chrome,location:{hash:'#/portafolio'},
    console:{warn:()=>{}},setTimeout:fn=>fn(),Date,Promise,
    __icPortfolioReadSections:flag
  },{timeout:10000});
  return {f,result};
}
(async()=>{
  const normal=await run(false);
  assert.equal(normal.f.captured.payload.holdings.length,1);
  assert.equal(normal.f.captured.payload.holdings[0].symbol,'AAPL');
  assert.deepEqual(normal.f.clicks,[], 'Never navigate the active user tab');
  const scanned=await run(true);
  const names=scanned.f.captured.payload.holdings.map(x=>x.symbol).sort();
  assert.deepEqual(Array.from(names),['AAPL','KO','QQQ']);
  assert.deepEqual(scanned.f.clicks,['PAGE_2','TAB_ETF']);
  const items=scanned.f.captured.payload.holdings;
  const value=items.reduce((s,x)=>s+x.quantity*x.price_mxn,0);
  assert.equal(value,5000);
  assert.equal(scanned.result.holdings_detected,true);
  console.log('PASS category Acciones/ETF, 2 portfolio pages, hidden-tab-only navigation');
})().catch(e=>{console.error(e);process.exitCode=1});
