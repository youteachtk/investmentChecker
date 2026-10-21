// Contract tests for read-only investment navigation in Angular.
'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync('browser/brave-extension/portfolio-navigator.js','utf8');

async function scenario(nested) {
  let tick=0,opened=false;
  const location={hash:'#/capitales',href:'https://retoactinver.com/RetoActinver/#/capitales',
    origin:'https://retoactinver.com'};
  const button=(text,action)=>({
    innerText:text,textContent:text,
    getClientRects:()=>[1],getAttribute:()=>null,click:action
  });
  const menu=button('Tu inversión',()=>{
    if(nested)opened=true;
    else location.hash='#/mis-inversiones';
  });
  const submenu=button('Mi portafolio',()=>location.hash='#/mi-portafolio');
  const document={
    querySelectorAll(selector){
      if(selector.startsWith('a,button'))return nested&&opened?[menu,submenu]:[menu];
      if(selector==='table,[role="table"]')return [];
      if(selector==='span,div,li,p'||selector==='span,li,div')return [];
      return [];
    }
  };
  class Clock extends Date{static now(){return tick;}}
  const result=await vm.runInNewContext(code,{
    document,location,URL,Date:Clock,Promise,
    setTimeout:(done,ms)=>{tick+=ms;done();}
  },{timeout:10000});
  return result;
}
(async()=>{
  const direct=await scenario(false);
  assert.equal(direct.found,true,'Direct route did not open');
  assert.equal(direct.step,'menu-route');
  const nested=await scenario(true);
  assert.equal(nested.found,true,'Nested Angular submenu did not open');
  assert.equal(nested.step,'submenu-route');
  console.log('PASS: direct Tu inversión and nested Mi portafolio routes');
})().catch(e=>{console.error(e);process.exitCode=1;});
