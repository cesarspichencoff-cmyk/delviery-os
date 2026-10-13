"use strict";
const assert=require("node:assert/strict");
const {exactOrderIdentity}=require("./gerar_tres_vias_v2_gate_v720_offline.js");
let n=0;
const check=(name,fn)=>{fn();n++;console.log("PASS "+n+" "+name);};
const ev=()=>({schema:"deliveryos.tata-reader-stable-order-event.v1",
 order_key:"0001|01|0000000099|0000000001",
 order:{CDFILIAL:"0001",CDLOJA:"01",NRVENDAREST:"0000000099",NRCOMANDA:"0000000001"}});
check("exact 4-component real watcher shape accepted for fictional data",()=>{
 assert.equal(exactOrderIdentity(ev()),true);
});
check("legacy 3-part fictional key rejected for actual installed watcher",()=>{
 const x=ev();x.order_key="0001|01|0000000001";
 assert.equal(exactOrderIdentity(x),false);
});
check("different sale identity cannot borrow same command number",()=>{
 const x=ev();x.order.NRVENDAREST="0000000098";
 assert.equal(exactOrderIdentity(x),false);
});
check("sale identifier required and never coerced",()=>{
 for(const value of [null,undefined,"",0,"1|02"]){
   const x=ev();x.order.NRVENDAREST=value;
   assert.equal(exactOrderIdentity(x),false);
 }
});
check("forged key rejected even when event and decision could agree",()=>{
 const x=ev();x.order_key="0001|01|FOREIGN";assert.equal(exactOrderIdentity(x),false);
});
check("wrong store prevents cross-branch order alias",()=>{
 const x=ev();x.order.CDFILIAL="0002";assert.equal(exactOrderIdentity(x),false);
});
check("wrong shop prevents cross-unit ticket",()=>{
 const x=ev();x.order.CDLOJA="02";assert.equal(exactOrderIdentity(x),false);
});
check("different order id cannot reuse same key",()=>{
 const x=ev();x.order.NRCOMANDA="0000000002";assert.equal(exactOrderIdentity(x),false);
});
check("leading zeros remain meaningful, never coerced",()=>{
 const x=ev();x.order.CDFILIAL="1";assert.equal(exactOrderIdentity(x),false);
});
check("pipe and line-injection identifiers rejected",()=>{
 for(const value of ["0001|02","0001\n02","0001\r02"]){
  const x=ev();x.order.CDFILIAL=value;
  x.order_key=[x.order.CDFILIAL,x.order.CDLOJA,x.order.NRVENDAREST,x.order.NRCOMANDA].join("|");
  assert.equal(exactOrderIdentity(x),false);
 }
});
check("incomplete or non-string raw identifiers rejected",()=>{
 for(const val of [null,undefined,0,{},[],"", "x".repeat(97)]){
  const x=ev();x.order.NRCOMANDA=val;
  assert.equal(exactOrderIdentity(x),false);
 }
});
check("schema drift and missing envelope cannot pass",()=>{
 const a=ev();a.schema="unsupported";assert.equal(exactOrderIdentity(a),false);
 for(const p of [null,{},[],{order_key:"0001|01|0000000099|0000000001"}, {schema:ev().schema}]){
  assert.equal(exactOrderIdentity(p),false);
 }
});
console.log("THERMAL_ORDER_KEY_BIND_V727="+n+"/"+n+
 " EXACT_RAW_IDENTIFIERS NO_CROSS_ORDER NO_PRINT");
