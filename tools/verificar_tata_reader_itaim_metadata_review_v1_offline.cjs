"use strict";
const assert=require("node:assert/strict");
const {SCHEMA,EFFECTS,NAMES,reviewItaimReaderMetadata:review}=
 require("./tata_reader_itaim_metadata_review_v1_offline.cjs");
const stamp="2026-10-29T07:40:00.0000000Z";
function f(){return {
 schema:"tata.comandas.itaim-reader-metadata.v1.readonly",
 captured_at_utc:stamp,
 device_unit:"ITAIM_HUMAN_CONFIRMED_NOT_INDEPENDENTLY_ATTESTED",
 host_matches_approved_name:true,root_directory_safe:true,
 files:NAMES.map(logical_name=>({logical_name,status:"PRESENT_METADATA_ONLY",
  last_write_utc:stamp,age_minutes:1.2,clock_anomaly:false,length_bytes:100})),
 status:"HOLD",reader_service_running_proven:false,
 reader_content_valid_proven:false,native_first_dispatch_proven:false,
 printer_path_proven:false,physical_paper_proven:false,
 ready_for_operational_print:false,
 effect_boundary:{file_contents_read:false,file_write:false,sql_read:false,
  sql_write:false,network:false,printer_read:false,print:false,
  spooler_read:false,spooler_write:false,service_read:false,
  service_change:false,sequence_write:false,fiscal:false,deploy:false}
};}
let n=0;function check(name,v,expect){
 const before=JSON.stringify(v),r=review(v);
 assert.equal(JSON.stringify(v),before);assert.equal(r.schema,SCHEMA);
 assert.deepEqual(r.effects,EFFECTS);assert.equal(r.status,"HOLD");
 assert.equal(r.operational_print_authorized,false);
 for(const k of ["reader_service_running_proven","json_contents_valid_proven",
  "independent_native_source_proven","reader_freshness_proven",
  "first_production_print_proven","physical_paper_proven"])
   assert.equal(r[k],false,k);
 assert.equal(r.diagnosis,expect,name);
 assert.ok(!JSON.stringify(r).includes("SENSITIVE_CUSTOMER"));
 console.log("PASS "+(++n)+" "+name);
}
check("all present is not health",f(),"FOUR_METADATA_PRESENT_NOT_SERVICE_HEALTH");
const test=(label,mutation,expect)=>{const x=f();mutation(x);check(label,x,expect);};
test("old metadata never proves current Reader",x=>x.files.forEach(o=>o.age_minutes=100000),"FOUR_METADATA_PRESENT_NOT_SERVICE_HEALTH");
test("unavailable",x=>Object.assign(x.files[0],{status:"UNAVAILABLE",last_write_utc:null,age_minutes:null,clock_anomaly:null,length_bytes:null}),"FILE_ABSENT_OR_ACCESS_DENIED");
test("unsafe parent",x=>Object.assign(x.files[2],{status:"BLOCKED_UNSAFE_PARENT",last_write_utc:null,age_minutes:null,clock_anomaly:null,length_bytes:null}),"UNSAFE_PATH_OR_REPARSE_POINT");
test("zero-byte file",x=>x.files[3].length_bytes=0,"EMPTY_FILE_NOT_VALIDATED");
test("clock anomaly",x=>{x.files[0].clock_anomaly=true;x.files[0].age_minutes=null;},"FILE_CLOCK_ANOMALY");
test("unapproved host",x=>{x.host_matches_approved_name=false;x.root_directory_safe=false;x.files=[];},"UNAPPROVED_HOST");
test("wrong host contradiction",x=>{x.host_matches_approved_name=false;x.root_directory_safe=false;},"WRONG_HOST_WITH_UNEXPECTED_OBSERVATIONS");
test("missing root",x=>{x.root_directory_safe=false;x.files=[];},"READER_ROOT_UNAVAILABLE_OR_UNSAFE");
test("root contradicted",x=>x.root_directory_safe=false,"ROOT_UNSAFE_WITH_UNEXPECTED_OBSERVATIONS");
test("partial list",x=>x.files.pop(),"INCOMPLETE_FOUR_FILE_COVERAGE");
test("duplicate",x=>x.files[1].logical_name=x.files[0].logical_name,"FILE_METADATA_INVALID_OR_DUPLICATED");
test("private extra metadata",x=>x.files[0].client_notes="SENSITIVE_CUSTOMER","FILE_METADATA_INVALID_OR_DUPLICATED");
test("private top level",x=>x.order_name="SENSITIVE_CUSTOMER","UNTRUSTED_ENVELOPE_OR_EFFECT_CLAIM");
test("unsupported fifth file",x=>x.files.push({...x.files[0],logical_name:"SENSITIVE_CUSTOMER"}),"UNTRUSTED_ENVELOPE_OR_EFFECT_CLAIM");
test("false timestamp for unavailable",x=>x.files[0].status="UNAVAILABLE","UNAVAILABLE_FILE_CLAIMS_TIMESTAMPS");
test("invalid timestamp",x=>x.files[0].last_write_utc="yesterday","FILE_METADATA_CONTRADICTION");
test("negative file size",x=>x.files[0].length_bytes=-1,"FILE_METADATA_CONTRADICTION");
test("self-authorized print",x=>x.ready_for_operational_print=true,"UNTRUSTED_ENVELOPE_OR_EFFECT_CLAIM");
test("self-reported file content",x=>x.effect_boundary.file_contents_read=true,"UNTRUSTED_ENVELOPE_OR_EFFECT_CLAIM");
test("new effect value",x=>x.effect_boundary.print_jobs=true,"UNTRUSTED_ENVELOPE_OR_EFFECT_CLAIM");
for(const bad of [null,[],{},false])check("invalid envelope",bad,"UNTRUSTED_ENVELOPE_OR_EFFECT_CLAIM");
console.log("ITAIM_READER_FOUR_FILE_DIAG="+n+"/"+n+" HOLD NO_EFFECTS");
