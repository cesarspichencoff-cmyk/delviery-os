"use strict";
/*
 * Repeatable OFFLINE private-source proof for packagingContractV1.
 * Usage: node tools/verificar_contrato_embalagem_v1_private_replay.cjs
 *   <absolute-approved-motor-file> <absolute-approved-catalog-file>
 * Reads exact private bytes supplied out-of-band. Never publishes/copies them,
 * never connects to a live host or operates a printer. All order IDs fake.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {evaluatePackagingContractV1,validatePackagingContractRequestV1}=
 require("../dist/src/production/packagingContractV1.js");
const EFFECTS=["print","spooler_write","sequence_write","database_write","network","fiscal"];
const ids=[["combinado_kids","Combinado Kids",3,"CLOSED_COMBO"],
 ["edamame","Edamame",1,"OTHER"],
 ["nasu_no_misso","Nasu no Missô",1,"OTHER"],
 ["sushi_de_unagui","Sushi de Unagui",1,"OTHER"]];
const request={order_key:"9999|99|1111111111|2222222222",
 snapshot_hash:"c".repeat(64),
 lines:ids.map(([academy_product_id,product_name,qty,packaging_role],i)=>({
  source_line_id:String(i+1).padStart(6,"0"),
  source_product_code:"SYNTHETIC_"+String(i+1),
  academy_product_id,product_name,
  quantity_raw:qty+".000",observations:[],packaging_role,
 }))};
if(process.argv.length!==4)throw Error("PRIVATE_REPLAY_EXPECTS_TWO_LOCAL_FILE_PATHS");
function readLimited(file,size){
 if(!path.isAbsolute(file))throw Error("PRIVATE_REPLAY_ABSOLUTE_PATH_REQUIRED");
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>size)
  throw Error("PRIVATE_REPLAY_BOUNDED_REGULAR_FILE_REQUIRED");
 return fs.readFileSync(file);
}
const motor=readLimited(process.argv[2],256*1024);
const catalog=readLimited(process.argv[3],2*1024*1024);
assert.deepEqual(validatePackagingContractRequestV1(request),[]);
function deny(input,reason){
 const r=evaluatePackagingContractV1(input,catalog,motor);
 assert.equal(r.status,"HOLD",JSON.stringify(r.blockers));
 assert.ok(r.blockers.includes(reason),JSON.stringify(r.blockers));
 assert.equal(r.ready_for_operational_print,false);
 assert.equal(r.reader_pair_authenticated,false);
 assert.equal(r.source_code_crosswalk_authenticated,false);
 assert.equal(r.snapshot_hash_independently_recomputed,false);
 assert.equal(r.observations_authenticated,false);
 assert.ok(EFFECTS.every(k=>r.effects[k]===false));
}
const r=evaluatePackagingContractV1(request,catalog,motor);
assert.equal(r.status,"OFFLINE_CONTRACT_VERIFIED",JSON.stringify(r.blockers));
assert.equal(r.motor_sha256,
 "1e4cf2475edb586d5dae88388d2adc7cf02013b00ec93c0371e3edb80f81342e");
assert.equal(r.catalog_git_blob_sha1,"d4cc9ba91c850314ffa9bd45fb9dfd1dea3d3c22");
assert.equal(r.packaging.groups.reduce((s,g)=>s+(g.boxes||0),0),6);
assert.equal(r.packaging.groups.filter(g=>g.category==="selada_650")
 .reduce((s,g)=>s+g.boxes,0),2);
assert.equal(r.packaging.bags.exact_bag_count,1);
assert.equal(r.packaging.bags.group_sizes[0].size,"G");
assert.deepEqual(r.kits.kits.map(k=>[k.kit,k.quantidade]),
 [["Kit Kids",3],["Kit Quente",1]]);
assert.equal(r.group_membership.length,4);
assert.deepEqual(r.group_membership.flatMap(g=>g.source_line_ids).sort(),
 ["000001","000002","000003","000004"]);
assert.ok(r.group_membership.every(g=>g.physical_box_allocation==="NOT_ASSERTED"));
assert.equal(r.ready_for_operational_print,false);
assert.equal(r.reader_pair_authenticated,false);
assert.equal(r.source_code_crosswalk_authenticated,false);
assert.equal(r.snapshot_hash_independently_recomputed,false);
assert.equal(r.observations_authenticated,false);
assert.ok(EFFECTS.every(k=>r.effects[k]===false));
const fractional=structuredClone(request);
fractional.lines[1].quantity_raw="1.5";
deny(fractional,"SOURCE_QUANTITY_INVALID");
const wrong=structuredClone(request);
wrong.lines[2].product_name="UNKNOWN FAKE PRODUCT";
deny(wrong,"CATALOG_PRODUCT_NAME_OR_ID_MISMATCH");
const repeated=structuredClone(request);
repeated.lines.push({...repeated.lines[1],
 source_line_id:"000005",source_product_code:"SYNTHETIC_5"});
deny(repeated,"MOTOR_GROUP_SOURCE_MEMBERSHIP_AMBIGUOUS");
const mismatch=structuredClone(request);
mismatch.lines[1].source_product_code=mismatch.lines[0].source_product_code;
deny(mismatch,"SOURCE_CODE_CATALOG_MAPPING_CONFLICT");
const unclosed=structuredClone(request);
unclosed.lines[0].packaging_role="OTHER";
deny(unclosed,"MULTIPLE_BOX_CONTENT_DISTRIBUTION_UNPROVEN");
console.log("HEADLESS_V1_REAL_ENGINE_PRIVATE_CATALOG=6/6"+
 " EXACT_PRIVATE_BYTES NO_HOST NO_PRINT NO_SEQUENCE NO_CROSSWALK_ASSERTION");
