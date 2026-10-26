"use strict";
const assert=require("node:assert/strict");
const {crosswalk,SCHEMA,UNKNOWN,EFFECTS}=require("./comandas_cruzamento_simples_v855_offline.cjs");
const copy=x=>JSON.parse(JSON.stringify(x));
const input={
 ifood:{schema:"deliveryos.ifood-paper-observation.v1",store:"001",day:"2026-10-20",
  short_id:"8332",status:"CONFIRMED",items_complete:true,items:[
   {name:"Combinado Teste",quantity:2,notes:["SEM MOLHO"]},
   {name:"Gyoza",quantity:1,notes:[]}]},
 teknisa_orders:[{schema:"deliveryos.teknisa-native-order-observation.v1",
  store:"001",day:"2026-10-20",origin:"DLV_IFO",NRCOMANDAEXT:"8332",
  NRCOMANDA:"0000348932",NRVENDAREST:"0000349363",items_complete:true,
  notes_complete:true,items:[
   {name:"COMBINADO TESTE",quantity:2,notes:["sem molho"]},
   {name:"Gyoza",quantity:1,notes:[]}]}],
 fiscal_rows:[{schema:"deliveryos.teknisa-fiscal-observation.v1",
  NRCOMANDA:"0000348932",NRVENDAREST:"0000349363",status:"A"}]
};
let pass=0;
function audit(x){
 const r=crosswalk(x);assert.equal(r.schema,SCHEMA);assert.deepEqual(r.effects,EFFECTS);
 for(const prop of ["full_ifood_uuid_join_proven","paper_proven","duplicates_excluded","print_authorized"])
  assert.equal(r[prop],false,prop);
 return r;
}
function test(n,fn){fn();pass++;console.log("PASS "+pass+" "+n);}
test("matching native DLV_IFO gives candidate never print proof",()=>{
 const r=audit(input);assert.equal(r.status,"CANDIDATE_REVIEW");
 assert.equal(r.match_basis,"STORE_DAY_SHORT_ID_ITEMS");assert.equal(r.native_order_matched,true);
 assert.equal(r.native_fiscal_link_matched,true);
 assert.equal(r.comanda.nota_fiscal,"REGISTRADA NA TEKNISA");
});
test("unknown bag box kit explicitly A DEFINIR",()=>{
 const r=audit(input);
 for(const k of ["caixa","sacola","kit"])assert.equal(r.comanda[k],UNKNOWN);
});
test("iFood item and customer note preserved",()=>{
 const r=audit(input);assert.deepEqual(r.comanda.items[0],
  {name:"Combinado Teste",quantity:2,notes:["SEM MOLHO"]});
});
test("missing fiscal optional, no block",()=>{
 const x=copy(input);x.fiscal_rows=[];
 const r=audit(x);assert.equal(r.status,"CANDIDATE_REVIEW");
 assert.equal(r.comanda.nota_fiscal,UNKNOWN);
});
test("fiscal record with no native order cannot substitute the order",()=>{
 const x=copy(input);x.teknisa_orders=[];assert.equal(audit(x).status,"HOLD");
});
test("missing native note proof does not erase iFood note",()=>{
 const x=copy(input);x.teknisa_orders[0].notes_complete=false;
 const r=audit(x);assert.equal(r.status,"CANDIDATE_REVIEW");
 assert.ok(r.reasons.includes("NATIVE_NOTES_A_DEFINIR"));
});
test("item note contradiction blocks",()=>{
 const x=copy(input);x.teknisa_orders[0].items[0].notes=["COM MOLHO"];
 assert.deepEqual(audit(x).reasons,["NOTES_CONTRADICT"]);
});
test("item quantity mismatch blocks",()=>{
 const x=copy(input);x.teknisa_orders[0].items[0].quantity=1;
 assert.deepEqual(audit(x).reasons,["ITEMS_OR_QUANTITIES_DIFFER"]);
});
test("store mismatch blocks",()=>{
 const x=copy(input);x.teknisa_orders[0].store="002";assert.equal(audit(x).status,"HOLD");
});
test("day mismatch blocks",()=>{
 const x=copy(input);x.teknisa_orders[0].day="2026-10-19";assert.equal(audit(x).status,"HOLD");
});
test("short ID collision blocks",()=>{
 const x=copy(input);x.teknisa_orders.push({...x.teknisa_orders[0],NRCOMANDA:"0000999999"});
 assert.deepEqual(audit(x).reasons,["AMBIGUOUS_SHORT_ID_SAME_STORE_DAY"]);
});
test("missing native order is not declared a lost iFood order",()=>{
 const x=copy(input);x.teknisa_orders=[];
 assert.deepEqual(audit(x).reasons,["NATIVE_ORDER_NOT_OBSERVED_NOT_PROVEN_LOST"]);
});
test("non-iFood native origin excluded",()=>{
 const x=copy(input);x.teknisa_orders[0].origin="OTHER";
 assert.equal(audit(x).status,"HOLD");
});
test("cancelled iFood cannot become candidate",()=>{
 const x=copy(input);x.ifood.status="CANCELLED";
 assert.deepEqual(audit(x).reasons,["IFOOD_CANCELLED"]);
});
test("placed iFood cannot become candidate",()=>{
 const x=copy(input);x.ifood.status="PLACED";
 assert.deepEqual(audit(x).reasons,["IFOOD_NOT_CONFIRMED"]);
});
test("missing iFood item quantity blocks",()=>{
 const x=copy(input);x.ifood.items[0].quantity=0;assert.equal(audit(x).status,"HOLD");
});
test("incomplete items block",()=>{
 const x=copy(input);x.teknisa_orders[0].items_complete=false;
 assert.equal(audit(x).status,"HOLD");
});
test("impossible date blocks",()=>{
 const x=copy(input);x.ifood.day="2026-02-30";assert.equal(audit(x).status,"HOLD");
});
test("duplicate items preserve multiset",()=>{
 const x=copy(input);x.ifood.items.push({...x.ifood.items[0]});
 assert.equal(audit(x).status,"HOLD");
});
test("fiscal cannot join on NRCOMANDA alone",()=>{
 const x=copy(input);x.fiscal_rows[0].NRVENDAREST="0000000000";
 const r=audit(x);assert.equal(r.native_fiscal_link_matched,false);
});
test("duplicate invoices are ambiguous, not printed proof",()=>{
 const x=copy(input);x.fiscal_rows.push(copy(x.fiscal_rows[0]));
 const r=audit(x);assert.equal(r.native_fiscal_link_matched,false);
 assert.ok(r.reasons.includes("MULTIPLE_FISCAL_ROWS_A_DEFINIR"));
});
test("native fiscal nonauthorized status leaves A DEFINIR",()=>{
 const x=copy(input);x.fiscal_rows[0].status="P";
 assert.equal(audit(x).comanda.nota_fiscal,UNKNOWN);
});
test("null input fails safely",()=>assert.equal(audit(null).status,"HOLD"));
console.log("COMANDAS_SIMPLE_CROSSWALK_V855="+pass+"/"+pass+
 " NO_PRINT NO_API NO_SQL FISCAL_INDEPENDENT A_DEFINIR");
