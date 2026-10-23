// Approved virtual buy drafts may be entered only in proven Visa field locations.
// No "Comprar", "Calcular orden", submit or confirmation clicks are allowed.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync('browser/brave-extension/order-preflight.js','utf8');
const start=script.indexOf('async function orderFillFieldsOnVisaDetail(order){');
const end=script.indexOf('async function orderStageApprovedVisa(){',start);
assert.ok(start>=0&&end>start);
const body=script.slice(start,end);
assert.equal(/\.click\s*\(/.test(body),false,'Staging must never click an order button');
function context({route='#/capitales/detalle/DetalleAcciones',symbol='visa inc.',qtyValue=''}={}){
 const clicked=[];const label=(text,left)=>({
   innerText:text,getClientRects:()=>[1],disabled:false,
   getBoundingClientRect:()=>({left,top:0,bottom:15})
 });
 const quantity={type:'text',value:qtyValue,disabled:false,readOnly:false,
   getClientRects:()=>[1],getBoundingClientRect:()=>({left:10,top:30,bottom:55}),
   dispatchEvent:()=>{}};
 const price={type:'text',value:'0.000',disabled:false,readOnly:false,
   getClientRects:()=>[1],getBoundingClientRect:()=>({left:210,top:30,bottom:55}),
   dispatchEvent:()=>{}};
 const nodes=[label('Títulos',0),label('Precio Límite',200)];
 const panel={
   innerText:'Operación Compra Títulos Precio Límite Calcular orden',
   disabled:false,getClientRects:()=>[1],
   querySelectorAll:selector=>{
     if(selector==='input')return [quantity,price];
     if(selector==='label,span,small,strong,div')return nodes;
     return [];
   }
 };
 const document={querySelectorAll:selector=>{
   if(selector==='h1,h2,h3,h4,span,div,strong')return [label(symbol,0)];
   if(selector.startsWith('aside,'))return [panel];
   return [];
 }};
 const ctxt={document,location:{hash:route},
   Event:class{constructor(type){this.type=type}},
   HTMLInputElement:{prototype:{}},Number,Math,String,Object};
 const fn=vm.runInNewContext(body+';orderFillFieldsOnVisaDetail',ctxt);
 return {fn,quantity,price,clicked};
}
(async()=>{
 const a=context();
 const result=await a.fn({symbol:'V',quantity:4,limit_mxn:7611.50});
 assert.equal(result.ok,true);
 assert.equal(result.submitted_orders,0);
 assert.equal(a.quantity.value,'4');
 assert.equal(a.price.value,'7611.50');
 assert.deepEqual(a.clicked,[]);
 const b=context({qtyValue:'5'});
 const invalid=await b.fn({symbol:'V',quantity:4,limit_mxn:7611.50});
 assert.equal(invalid.ok,false);
 assert.equal(invalid.stage,'QUANTITY_ALREADY_ENTERED');
 assert.equal(b.quantity.value,'5');
 const c=context({symbol:'other company'});
 const wrong=await c.fn({symbol:'V',quantity:1,limit_mxn:100});
 assert.equal(wrong.stage,'VISA_IDENTITY_NOT_VERIFIED');
 console.log('PASS verified Visa-only field mapping and zero order submissions');
})().catch(e=>{console.error(e);process.exitCode=1});
