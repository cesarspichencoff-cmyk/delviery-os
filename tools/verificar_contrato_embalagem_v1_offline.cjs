"use strict";
// Only synthetic data. Never fetch Academy source, store orders or printers.
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {
 evaluatePackagingContractV1,CONTRACT_VERSION_V1,CATALOG_GIT_BLOB_V1
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
