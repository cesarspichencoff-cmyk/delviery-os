"use strict";
/**
 * Tests the EXACT local scope function extracted from V7.14 source without
 * requiring its Windows paths, opening an event, querying SQL, starting any
 * process on the cashier or invoking any real consumer.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const src=fs.readFileSync(path.join(__dirname,"..","runtime","shadow",
 "live_shadow_consumer_v2_candidate_v714.cjs"),"utf8");
const marker="function nativeItaimIfoodScopeReasonsV1(e) {";
const start=src.indexOf(marker);
assert.ok(start>0,"NATIVE_GUARD_NOT_FOUND");
assert.equal(src.indexOf(marker,start+1),-1,"DUPLICATE_NATIVE_GUARD");
const end=src.indexOf("\n}\n",start);
assert.ok(end>start,"NATIVE_GUARD_END_NOT_FOUND");
const code=src.slice(start,end+2);
const guard=vm.runInNewContext("("+code+")",Object.create(null),{timeout:1000});
const review=x=>Array.from(guard(x));
const fake=()=>({
 order_key:"0001|01|FAKESALE|FAKECMD",
 ready_for_downstream_shadow:true,
 blockers:[],service_resolution:{blockers:[]},
 order:{CDFILIAL:"0001",CDLOJA:"01",NRVENDAREST:"FAKESALE",
        NRCOMANDA:"FAKECMD",IDORGCMDVENDA:"DLV_IFO",
        IDSTCOMANDA:"P",items:[]}
});
let n=0;
function test(label,fn){fn();console.log("PASS "+(++n)+" "+label);}
test("exact Itaim DLV_IFO four-field key has no SOURCE blocker only",()=>{
 assert.deepEqual(review(fake()),[]);
});
test("native DLV_NMO is not accepted despite upstream ready",()=>{
 const x=fake();x.order.IDORGCMDVENDA="DLV_NMO";
 assert.ok(review(x).includes("NATIVE_IFOOD_ORIGIN_NOT_EXACT"));
});
test("native DLV_CPD is not accepted despite iFood-like prefix",()=>{
 const x=fake();x.order.IDORGCMDVENDA="DLV_CPD";
 assert.ok(review(x).includes("NATIVE_IFOOD_ORIGIN_NOT_EXACT"));
});
test("missing native origin is rejected",()=>{
 const x=fake();delete x.order.IDORGCMDVENDA;
 assert.ok(review(x).includes("NATIVE_IFOOD_ORIGIN_NOT_EXACT"));
});
test("incorrect filial blocks regardless upstream ready",()=>{
 const x=fake();x.order.CDFILIAL="0002";
 assert.ok(review(x).includes("ITAIM_NATIVE_SCOPE_MISMATCH"));
});
test("incorrect store blocks regardless upstream ready",()=>{
 const x=fake();x.order.CDLOJA="02";
 assert.ok(review(x).includes("ITAIM_NATIVE_SCOPE_MISMATCH"));
});
test("order key cannot be forged independently of native header",()=>{
 const x=fake();x.order_key="0001|01|FAKESALE|OTHER";
 assert.ok(review(x).includes("NATIVE_ORDER_KEY_NOT_BOUND_TO_HEADER"));
});
test("missing header cannot claim a valid scope",()=>{
 const x=fake();delete x.order;
 assert.deepEqual(review(x),["NATIVE_ORDER_SCOPE_MISSING"]);
});
test("null event remains rejected without throwing",()=>{
 assert.deepEqual(review(null),["NATIVE_ORDER_SCOPE_MISSING"]);
});
test("delimiter injection in a native field must fail closed",()=>{
 const x=fake();x.order.NRVENDAREST="FAKE|SALE";x.order_key="0001|01|FAKE|SALE|FAKECMD";
 assert.ok(review(x).includes("NATIVE_ORDER_KEY_NOT_BOUND_TO_HEADER"));
});
test("varchar10 overlength native identity cannot silently pass",()=>{
 const x=fake();x.order.NRCOMANDA="12345678901";
 x.order_key="0001|01|FAKESALE|"+x.order.NRCOMANDA;
 assert.ok(review(x).includes("NATIVE_ORDER_KEY_NOT_BOUND_TO_HEADER"));
});
test("control characters cannot become order key components",()=>{
 const x=fake();x.order.NRCOMANDA="A\nB";x.order_key="0001|01|FAKESALE|A\nB";
 assert.ok(review(x).includes("NATIVE_ORDER_KEY_NOT_BOUND_TO_HEADER"));
});
test("native status 3 P X have no inferred finalization meaning",()=>{
 for(const status of ["3","P","X"]){
  const x=fake();x.order.IDSTCOMANDA=status;
  assert.deepEqual(review(x),[]);
 }
});
test("this guard cannot promote ready status or write an effect",()=>{
 assert.ok(src.includes("...nativeItaimIfoodScopeReasonsV1(event)"));
 assert.ok(src.includes("const blockers = [...upstreamBlockers, ...observationBlockers,"));
 assert.ok(src.includes("ready: blockers.length === 0"));
 assert.ok(src.includes("print: false"));
 assert.ok(src.includes("spooler_write: false"));
 assert.equal(src.includes("NATIVE_STATUS_MEANS_FINALIZED"),false);
});
test("different plausible sale key than header always blocks",()=>{
 const x=fake();x.order.NRVENDAREST="SALEA";
 assert.ok(review(x).includes("NATIVE_ORDER_KEY_NOT_BOUND_TO_HEADER"));
});
test("valid native identity cannot be widened by extra attacker fields",()=>{
 const x=fake();x.ready=true;x.authorizePrint=true;
 assert.deepEqual(review(x),[]);
 assert.equal(src.includes("effects: {"),true);
 assert.equal(src.includes("print: false"),true);
});
if(n!==16)throw Error("UNEXPECTED_NATIVE_SCOPE_COUNT_"+n);
console.log("COMANDAS_V714_NATIVE_IFOOD_ITAIM_SCOPE="+n+"/"+n+
 " ONLY_UNINSTALLED_SHADOW NO_SQL NO_ORDER_DATA NO_PRINT");
