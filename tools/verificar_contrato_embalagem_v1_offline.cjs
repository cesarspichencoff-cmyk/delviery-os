"use strict";
// Only synthetic data. Never fetch Academy source, store orders or printers.
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {
 evaluatePackagingContractV1,validatePackagingContractRequestV1,
 CONTRACT_VERSION_V1,CATALOG_GIT_BLOB_V1
}=require("../dist/src/production/packagingContractV1.js");
const {PACKAGING_SOURCE_SHA256_V78}=require(
 "../dist/src/production/currentPackagingBridgeV63.js");
const request={
 order_key:"9999|99|1111111111|2222222222",
 snapshot_hash:"a".repeat(64),
 lines:[{source_line_id:"000001",source_product_code:"FAKE01",
  academy_product_id:"synthetic_product",product_name:"SYNTHETIC PRODUCT",
  quantity_raw:"1.000",observations:[],packaging_role:"OTHER"}]
};
const badCatalog=Buffer.from(JSON.stringify({products:[]}));
const canary="GLOBAL_MOTOR_EXECUTED_WITHOUT_PIN";
const badMotor=Buffer.from("globalThis."+canary+"=true;");
let n=0;
function check(name,run){run();console.log("PASS CONTRACT_V1 "+(++n)+" "+name);}
function held(r,reason){
 assert.equal(r.schema,CONTRACT_VERSION_V1);
 assert.equal(r.status,"HOLD");
 assert.ok(r.blockers.includes(reason),JSON.stringify(r.blockers));
 assert.equal(r.packaging,null);assert.equal(r.kits,null);
 assert.deepEqual(r.group_membership,[]);
 assert.equal(r.reader_pair_authenticated,false);
 assert.equal(r.snapshot_hash_independently_recomputed,false);
 assert.equal(r.observations_authenticated,false);
 assert.equal(r.source_code_crosswalk_authenticated,false);
 assert.equal(r.ready_for_operational_print,false);
 assert.ok(Object.values(r.effects).every(v=>v===false));
}
check("immutable pin declarations remain exact",()=>{
 assert.equal(CATALOG_GIT_BLOB_V1,"d4cc9ba91c850314ffa9bd45fb9dfd1dea3d3c22");
 assert.equal(PACKAGING_SOURCE_SHA256_V78,
 "1e4cf2475edb586d5dae88388d2adc7cf02013b00ec93c0371e3edb80f81342e");
});
check("foreign engine bytes denied before any execution",()=>{
 held(evaluatePackagingContractV1(request,badCatalog,badMotor),
  "ACADEMY_ENGINE_BYTES_NOT_PINNED");
 assert.equal(globalThis[canary],undefined);
});
check("foreign catalog cannot establish station truth",()=>{
 held(evaluatePackagingContractV1(request,badCatalog,badMotor),
  "ACADEMY_CATALOG_BYTES_NOT_PINNED");
});
check("false order-key and revision not promoted",()=>{
 const r={...request,order_key:"invalid",snapshot_hash:"WRONG"};
 held(evaluatePackagingContractV1(r,badCatalog,badMotor),
  "ORDER_REVISION_IDENTITY_INVALID");
});
check("empty order is not processed",()=>{
 held(evaluatePackagingContractV1({...request,lines:[]},badCatalog,badMotor),
 "SOURCE_LINES_INVALID");
});
check("large order is rejected before executing motor",()=>{
 held(evaluatePackagingContractV1({...request,lines:Array(201).fill(request.lines[0])},
  badCatalog,badMotor),"SOURCE_LINES_INVALID");
});
check("pure preflight accepts a structurally sound fictional order only",()=>{
 assert.deepEqual(validatePackagingContractRequestV1(request),[]);
});
check("fractional and zero quantity rejected before private engine load",()=>{
 for(const quantity_raw of ["0","0.000","1.5","-2","NaN","1e3",""]){
  const input={...request,lines:[{...request.lines[0],quantity_raw}]};
  assert.ok(validatePackagingContractRequestV1(input).includes("SOURCE_QUANTITY_INVALID"),
   quantity_raw);
  held(evaluatePackagingContractV1(input,badCatalog,badMotor),"SOURCE_QUANTITY_INVALID");
 }
 assert.equal(globalThis[canary],undefined);
});
check("source code cannot map to two different Academy IDs in one order",()=>{
 const input={...request,lines:[request.lines[0],
  {...request.lines[0],source_line_id:"000002",
   academy_product_id:"another_product",product_name:"ANOTHER PRODUCT"}]};
 assert.ok(validatePackagingContractRequestV1(input)
  .includes("SOURCE_CODE_CATALOG_MAPPING_CONFLICT"));
 held(evaluatePackagingContractV1(input,badCatalog,badMotor),
  "SOURCE_CODE_CATALOG_MAPPING_CONFLICT");
});
check("duplicate source-line identifier rejected even with changed name",()=>{
 const input={...request,lines:[request.lines[0],
  {...request.lines[0],source_product_code:"FAKE02",
   academy_product_id:"another_product",product_name:"ANOTHER PRODUCT"}]};
 held(evaluatePackagingContractV1(input,badCatalog,badMotor),
 "SOURCE_LINE_ID_INVALID_OR_DUPLICATE");
});
check("duplicate same-name and quantity remains HOLD, no guessed membership",()=>{
 const input={...request,lines:[request.lines[0],
  {...request.lines[0],source_line_id:"000002"}]};
 held(evaluatePackagingContractV1(input,badCatalog,badMotor),
  "MOTOR_GROUP_SOURCE_MEMBERSHIP_AMBIGUOUS");
});
check("unrecognized CLOSED_COMBO impersonation is rejected before engine",()=>{
 const input={...request,lines:[{...request.lines[0],packaging_role:"AUTO_APPROVED"}]};
 held(evaluatePackagingContractV1(input,badCatalog,badMotor),
  "SOURCE_PACKAGING_ROLE_INVALID");
});
check("oversized quantity sum and missing observations are denied",()=>{
 const input={...request,lines:[
  {...request.lines[0],quantity_raw:"9999"},
  {...request.lines[0],source_line_id:"000002",source_product_code:"FAKE02",
   academy_product_id:"another_product",product_name:"ANOTHER PRODUCT",
   quantity_raw:"1",observations:null}]};
 const reasons=validatePackagingContractRequestV1(input);
 assert.ok(reasons.includes("ORDER_QUANTITY_OUT_OF_BOUNDS"));
 assert.ok(reasons.includes("SOURCE_OBSERVATIONS_INVALID"));
 held(evaluatePackagingContractV1(input,badCatalog,badMotor),
  "ORDER_QUANTITY_OUT_OF_BOUNDS");
});
check("all 463 historical ITAIM Teknisa codes pass syntax without asserting Mooca identity",()=>{
 const d=JSON.parse(fs.readFileSync(path.join(__dirname,
  "../data/odhen_product_routing_compact_v1.json"),"utf8"));
 assert.equal(d.store,"0001 - TATA ITAIM");
 const codes=Object.keys(d.products);
 assert.equal(codes.length,463);
 for(const source_product_code of codes){
  const r={...request,lines:[{...request.lines[0],source_product_code}]};
  assert.deepEqual(validatePackagingContractRequestV1(r),[],
   "rejects historical source format "+source_product_code);
 }
});
check("forged, truncated and arbitrary dotted source codes are denied",()=>{
 for(const source_product_code of [
   "",".","9.05.05.080","9.05.05.080.00.EXE",
   "9.05.05.0/0.00","9.05.05.080.00\n","9.05.05.08?.00",
   "9.05.05.080.00;print",
 ]){
  const r={...request,lines:[{...request.lines[0],source_product_code}]};
  held(evaluatePackagingContractV1(r,badCatalog,badMotor),
   "SOURCE_PRODUCT_IDENTITY_INCOMPLETE");
 }
});
check("dotted Teknisa code mapping conflicts still fail closed",()=>{
 const a={...request.lines[0],source_product_code:"9.05.05.080.00"};
 const b={...a,source_line_id:"000002",
  academy_product_id:"another_product",product_name:"ANOTHER PRODUCT"};
 const r={...request,lines:[a,b]};
 held(evaluatePackagingContractV1(r,badCatalog,badMotor),
  "SOURCE_CODE_CATALOG_MAPPING_CONFLICT");
});
check("source, catalog and motor are not mutated",()=>{
 const before=JSON.stringify(request),ca=Buffer.from(badCatalog),mo=Buffer.from(badMotor);
 evaluatePackagingContractV1(request,badCatalog,badMotor);
 assert.equal(JSON.stringify(request),before);
 assert.deepEqual(badCatalog,ca);assert.deepEqual(badMotor,mo);
});
check("public adapter performs no host, printer, network or source writes",()=>{
 const file=fs.readFileSync(path.join(__dirname,
 "../src/production/packagingContractV1.ts"),"utf8");
 assert.doesNotMatch(file,/\b(?:writeFileSync|execSync|spawnSync|fetch|https\.request|Set-Printer|Start-Service)\b/);
 assert.ok(file.includes('physical_box_allocation:"NOT_ASSERTED"'));
 assert.ok(file.includes("source_code_crosswalk_authenticated:false"));
});
console.log("TATA_COMANDA_PACKAGING_CONTRACT_V1="+n+"/"+n+
 " NO_PRIVATE_BYTES NO_HOST NO_PRINT NO_SOURCE_CLAIMS");
