"use strict";
const assert=require("node:assert/strict");
const {bridgeCurrentPackagingV63,PACKAGING_SOURCE_BLOB_V63}=
 require("../dist/src/production/currentPackagingBridgeV63.js");
let passed=0;
const run=(label,fn)=>{fn();passed++;console.log("PASS "+passed+" "+label)};
const sources=[
 {item_index:0,product_code:"D1",product_name:"DUPLA SALMAO",quantity:2,observations:[],packaging_role:"OTHER"},
 {item_index:1,product_code:"S1",product_name:"SASHIMI ATUM",quantity:1,observations:["SEM PIMENTA"],packaging_role:"OTHER"}
];
const entries=sources.map(s=>({source_item_index:s.item_index,quantity:s.quantity,
 station_proof:"CURRENT_MOTOR_PROVEN",
 product:{nome:s.product_name,classification:{station:"duplas"}}}));
const output=()=>({groups:[{kind:"faixa",station:"duplas",box:"450",boxes:1,
 status:"PROVEN_CURRENT_HUMAN_RULE_WITH_DERIVED_CAPACITY",
 products:sources.map(s=>({name:s.product_name,quantity:s.quantity}))}],
 total_items:3,has_unknown:false,bags:{size:"P",status:"PROVEN_OPERATIONAL_DOCUMENT",
 size_status:"FACT",exact_bag_count:1,exact_bag_count_status:"FACT"}});
const motor=(result=output(),kit={status:"FACT",kits:[{kit:"Kit p/1",quantidade:1}]})=>
 ({packComanda:()=>result,kitVerdict:()=>kit});
const bridge=(s=sources,e=entries,m=motor(),sha=PACKAGING_SOURCE_BLOB_V63)=>
 bridgeCurrentPackagingV63(s,e,m,sha);
run("two families in one proven physical box",()=>{
 const d=bridge();assert.equal(d.status,"VERIFIED_INPUT",JSON.stringify(d.reasons));
 assert.equal(d.packaging.groups.length,1);assert.equal(d.packaging.groups[0].box,"450");
 assert.equal(d.packaging.groups[0].products.length,2);
 assert.equal(d.ready_for_automatic_operational_print,false);
});
run("source revision drift blocked",()=>assert.ok(bridge(sources,entries,motor(),"stale").reasons.includes("PACKAGING_MOTOR_SOURCE_DRIFT")));
run("different current station blocks",()=>{
 const e=entries.map((x,i)=>i?{...x,product:{...x.product,classification:{station:"sushi"}}}:x);
 assert.equal(bridge(sources,e).status,"BLOCKED");
});
run("no station proof blocks",()=>{
 const e=entries.map((x,i)=>i?{...x,station_proof:"UNKNOWN"}:x);
 assert.ok(bridge(sources,e).reasons.includes("STATION_NOT_CURRENTLY_PROVEN"));
});
run("motor source quantity mismatch blocks",()=>{
 const e=entries.map((x,i)=>i?{...x,quantity:2}:x);
 assert.ok(bridge(sources,e).reasons.includes("MOTOR_INPUT_DOES_NOT_MATCH_ORDER_SOURCE"));
});
run("engine UNKNOWN cannot become a box FACT",()=>{
 const m=output();m.has_unknown=true;
 assert.ok(bridge(sources,entries,motor(m)).reasons.includes("MOTOR_PACKING_CONTAINS_UNKNOWN"));
});
run("unknown external bag blocked, no implied one bag",()=>{
 const m=output();m.bags={size:null,status:"UNKNOWN",exact_bag_count:null};
 assert.ok(bridge(sources,entries,motor(m)).reasons.includes("EXTERNAL_BAG_SIZE_OR_COUNT_NOT_PROVEN"));
});
run("unverified kits blocked",()=>{
 assert.ok(bridge(sources,entries,motor(output(),{status:"UNKNOWN",kits:[]})).reasons.includes("KIT_ASSIGNMENT_NOT_PROVEN"));
});
run("two physical boxes without each-item distribution blocked",()=>{
 const m=output();m.groups[0].boxes=2;
 assert.ok(bridge(sources,entries,motor(m)).reasons.includes("MULTIPLE_BOX_CONTENT_DISTRIBUTION_UNPROVEN"));
});
run("no fake mixed closed combo",()=>{
 const s=sources.map((x,i)=>i?x:{...x,packaging_role:"CLOSED_COMBO"});
 assert.ok(bridge(s,entries).reasons.includes("CLOSED_COMBO_MIXED_WITH_EXTRAS"));
});
run("individual comments are input source not altered",()=>{
 const before=JSON.stringify(sources);bridge();assert.equal(JSON.stringify(sources),before);
});
console.log("PACKAGING_BRIDGE_V63="+passed+"/"+passed+" OFFLINE_ONLY; PRINT=false");
