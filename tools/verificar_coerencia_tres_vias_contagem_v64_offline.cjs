"use strict";
/**
 * Adversarial offline shadow reconciliation. Synthetic minimum-shape
 * fixture; never sends bytes to a real printer or reads orders.
 */
const assert=require("node:assert/strict");
const {inspectThreeWayBoxCoherenceV64:inspect}=
 require("../dist/src/production/packagingCoherenceV64.js");
const item=(name="COMBINADO FICTICIO",quantity=1)=>
 ({print_name:name,quantity});
const box=(model="750",items=[item()],count)=>({
 model,status:"PROVEN",items,...(count===undefined?{}:{physical_box_count:count})
});
const order=(conference,production,ready=true)=>({
 ready_for_semantic_preview:ready,
 conference:{boxes:conference},
 production:production.map(([station,boxes])=>({station,boxes}))
});
let n=0;
function check(title,arr,expectedPrefix=null){
 const original=JSON.stringify(arr);
 const r=inspect(arr);
 assert.equal(JSON.stringify(arr),original,"must not mutate tickets");
 if(expectedPrefix)assert.ok(r.some(x=>x.startsWith(expectedPrefix)),r.join(","));
 else assert.deepEqual(r,[]);
 console.log("PASS "+(++n)+" "+title);
}
check("one proven conference box covers one production box",
 order([box()],[["SUSHI",[box()]]]));
check("same conference box cannot satisfy two distinct production stations",
 order([box()],[["SUSHI",[box()]],["QUENTE",[box()]]]),
 "CONFERENCE_PRODUCTION_BOX_DIVERGENCE:QUENTE:");
check("two conference boxes cover two distinct production stations",
 order([box(),box()],[["SUSHI",[box()]],["QUENTE",[box()]]]));
check("two print intents on same station also cannot double spend box",
 order([box()],[["SUSHI",[box(),box()]]]),
 "CONFERENCE_PRODUCTION_BOX_DIVERGENCE:SUSHI:");
check("a repeated closed combo needs two conference boxes",
 order([box()],[["SUSHI",[box("750",[item("COMBINADO FICTICIO",2)],2)]]]),
 "CONFERENCE_PRODUCTION_BOX_DIVERGENCE:SUSHI:");
check("a repeated closed combo passes when both boxes exist",
 order([box(),box()],[["SUSHI",[box("750",[item("COMBINADO FICTICIO",2)],2)]]]));
check("one covered box and one different model never match",
 order([box("750")],[["SUSHI",[box("450")]]]),
 "CONFERENCE_PRODUCTION_BOX_DIVERGENCE:SUSHI:");
check("a zero declared production count is forbidden",
 order([box()],[["SUSHI",[box("750",[item()],0)]]]),
 "PRODUCTION_BOX_COUNT_INVALID:SUSHI");
check("negative repeated count is forbidden",
 order([box()],[["SUSHI",[box("750",[item()],-1)]]]),
 "PRODUCTION_BOX_COUNT_INVALID:SUSHI");
check("fractional repeated count is forbidden",
 order([box()],[["SUSHI",[box("750",[item()],1.5)]]]),
 "PRODUCTION_BOX_COUNT_INVALID:SUSHI");
check("multiple boxes with unrelated items must not be counted",
 order([box(),box()],[["SUSHI",[box("750",[item("ITEM DIFERENTE")])]]]),
 "CONFERENCE_PRODUCTION_BOX_DIVERGENCE:SUSHI:");
check("unproven conference box never counts as inventory",
 order([{...box(),status:"UNKNOWN"}],[["SUSHI",[box()]]]),
 "CONFERENCE_BOX_NOT_PROVEN");
check("conference aggregate count cannot impersonate separate boxes",
 order([box("750",[item()],2)],[["SUSHI",[box("750",[item()],2)]]]),
 "CONFERENCE_BOX_NOT_PROVEN");
check("unproven production box cannot claim inventory",
 order([box()],[["SUSHI",[{...box(),status:"UNKNOWN"}]]]),
 "PRODUCTION_BOX_NOT_PROVEN:SUSHI");
check("multiple-box production is permitted only for repeated one-line combo",
 order([box(),box()],[["SUSHI",[box("750",[item(),item("TEMAKI")],2)]]]),
 "PRODUCTION_MULTI_BOX_MEMBERSHIP_UNKNOWN:SUSHI");
check("upstream non-ready remains blocked",
 order([box()],[["SUSHI",[box()]]],false),"TICKETS_NOT_SEMANTICALLY_READY");
console.log("THREE_WAY_BOX_INVENTORY_V64="+n+"/"+n+
 " OFFLINE NO_ORDER_READ NO_PRINT NO_PHYSICAL_PROOF");
