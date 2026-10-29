"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {reviewSourceBoundClassificationV1:review,
 PENDING_20261026_CODES_V1:pending,
 CLASSIFICATION_REVIEW_SCHEMA_V1:SCHEMA}=
 require("../dist/src/production/sourceBoundClassificationReviewV1.js");
const {bridgeCurrentPackagingV63:bridge,
 PACKAGING_SOURCE_BLOB_V63:BLOB}=
 require("../dist/src/production/currentPackagingBridgeV63.js");
const gap=JSON.parse(fs.readFileSync(path.join(__dirname,"..",
 "data/comandas_packaging_classification_gaps_20261026_v1.json"),"utf8"));
assert.deepEqual([...pending].sort(),gap.entries.map(x=>x.canonical_code).sort());
let count=0;
const test=(name,fn)=>{fn();console.log("PASS "+(++count)+" "+name)};
const sources=()=>[
 {item_index:0,product_code:"9.50.00.000.00",
  product_name:"PRODUTO SUSHI FICTICIO",quantity:2,observations:[],packaging_role:"OTHER"},
 {item_index:1,product_code:"8.00.00.050.00",
  product_name:"BEBIDA FICTICIA",quantity:1,observations:[],packaging_role:"OTHER"}
];
const claims=()=>[
 {source_item_index:0,product_code:"9.50.00.000.00",
  product_name:"PRODUTO SUSHI FICTICIO",quantity:2,
  family:"dupla",station:"duplas",review_required:false,review_source_ref:"SYNTHETIC"},
 {source_item_index:1,product_code:"8.00.00.050.00",
  product_name:"BEBIDA FICTICIA",quantity:1,
  family:"bebida",station:null,review_required:false,review_source_ref:"SYNTHETIC"}
];
function run(s=sources(),c=claims(),blob=BLOB){
 const b=JSON.stringify([s,c]);const out=review(s,c,blob);
 assert.equal(JSON.stringify([s,c]),b,"input mutated");
 assert.equal(out.schema,SCHEMA);
 for(const k of ["current_catalog_homologation_proven",
  "provenance_independently_attested","ready_for_automatic_operational_print"])
  assert.equal(out[k],false);
 assert.ok(Object.values(out.effects).every(v=>v===false));
 return out;
}
function denied(label,fn,reason){
 test(label,()=>{const data={s:sources(),c:claims(),blob:BLOB};
  fn(data);const out=run(data.s,data.c,data.blob);
  assert.equal(out.status,"HOLD");assert.deepEqual(out.entries,[]);
  assert.ok(out.reasons.includes(reason),out.reasons.join(","));
 });
}
test("exact source code, name, quantity and index are bound only for review",()=>{
 const r=run();assert.equal(r.status,"REVIEW_CANDIDATE_ONLY");
 assert.equal(r.entries.length,2);
 assert.ok(r.entries.every(x=>x.station_proof==="UNKNOWN"));
 assert.equal(r.exact_code_name_quantity_index_checked,true);
});
test("review-only entries cannot invoke pinned V6.3 motor or produce boxes",()=>{
 const a=run();let called=0;
 const motor={packComanda(){called++;throw Error("NEVER")},
  kitVerdict(){called++;throw Error("NEVER")}};
 const r=bridge(sources(),a.entries,motor,BLOB);
 assert.equal(r.status,"BLOCKED");
 assert.ok(r.reasons.includes("STATION_NOT_CURRENTLY_PROVEN"));
 assert.equal(r.packaging,null);assert.equal(r.kits,null);
 assert.equal(r.ready_for_automatic_operational_print,false);
 assert.equal(called,0);
});
test("all 14 26-Oct pending codes remain HOLD even with claimed review",()=>{
 for(const code of pending){const s=sources(),c=claims();
  s[0].product_code=code;c[0].product_code=code;
  const out=run(s,c);assert.equal(out.status,"HOLD",code);
  assert.ok(out.reasons.includes("HISTORICAL_CLASSIFICATION_GAP_REQUIRES_NEW_APPROVAL"));
 }
});
denied("code swap cannot borrow similar product name",
 d=>{d.c[0].product_code="9.50.00.001.00"},
 "REVIEW_CLAIM_NOT_EXACT_SOURCE_IDENTITY");
denied("fuzzy name cannot claim classification",
 d=>{d.c[0].product_name="PRODUTO FICTICIO"},
 "REVIEW_CLAIM_NOT_EXACT_SOURCE_IDENTITY");
denied("quantity change cannot inherit packaging",
 d=>{d.c[0].quantity=1},
 "REVIEW_CLAIM_NOT_EXACT_SOURCE_IDENTITY");
denied("index swap cannot borrow approved family",
 d=>{d.c[0].source_item_index=1;d.c[1].source_item_index=0},
 "REVIEW_CLAIM_NOT_EXACT_SOURCE_IDENTITY");
denied("beverage cannot acquire production station",
 d=>{d.c[1].station="BAR"},
 "STATION_AND_NONPRODUCTION_FAMILY_CONFLICT");
denied("production cannot have null station",
 d=>{d.c[0].station=null},
 "STATION_AND_NONPRODUCTION_FAMILY_CONFLICT");
denied("mismatched pinned Academy source blocks",
 d=>{d.blob="A".repeat(40)},
 "PINNED_PACKAGING_MOTOR_SOURCE_DRIFT");
denied("unreviewed flag cannot pretend review",
 d=>{d.c[0].review_required=true},
 "REVIEW_CLAIM_SHAPE_OR_DUPLICATE_INVALID");
denied("arbitrary family injection rejected",
 d=>{d.c[0].packing="1 BOX"},
 "REVIEW_CLAIM_SHAPE_OR_DUPLICATE_INVALID");
denied("duplicate claim index blocked",
 d=>{d.c[1].source_item_index=0},
 "REVIEW_CLAIM_SHAPE_OR_DUPLICATE_INVALID");
denied("missing claim cannot become completed order",
 d=>{d.c.pop()},
 "SOURCE_CLAIM_COUNT_OR_SHAPE_INVALID");
denied("duplicate name and quantity regardless of product code fail closed",
 d=>{d.s[1].product_name=d.s[0].product_name;d.s[1].quantity=2},
 "SOURCE_PACKAGING_MEMBERSHIP_COLLISION");
denied("invalid source code cannot be matched by name",
 d=>{d.s[0].product_code="NEAR_MATCH"},
 "SOURCE_IDENTITY_INVALID_OR_DUPLICATE");
denied("unknown source index cannot enter bridge",
 d=>{d.c[0].source_item_index=700},
 "REVIEW_CLAIM_NOT_EXACT_SOURCE_IDENTITY");
test("no source or claim gives HOLD without leaking names",()=>{
 for(const s of [null,[],undefined]){const r=run(s,claims());
  assert.equal(r.status,"HOLD");
  assert.ok(!JSON.stringify(r).includes("BEBIDA FICTICIA"));
 }
});
console.log("COMANDAS_SOURCE_BOUND_CLASSIFICATION="+count+"/"+count+
 " PENDING14_HOLD NO_CATALOG_PROMOTION NO_PRINT");
