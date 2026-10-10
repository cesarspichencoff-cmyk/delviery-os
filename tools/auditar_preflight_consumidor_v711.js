"use strict";
/**
 * V7.11 — read-only prerequisite audit for an eventual Windows consumer cutover.
 * No Win32 calls, shell execution, SQL or writes. Reading a matching file set
 * is NOT authentication or human approval. Never print source JSON values.
 */
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const REQUIRED=Object.freeze([
 {name:"packaging-current.js",schema:null,maxBytes:1024*1024},
 {name:"app-data.json",schema:null,maxBytes:12*1024*1024},
 {name:"routing.json",schema:"deliveryos.odhen.product-routing.compact.v1",maxBytes:8*1024*1024},
 {name:"printer-map.json",schema:"deliveryos.runtime-printer-map.v1",maxBytes:1024*1024},
 {name:"non-production.json",schema:"deliveryos.non-production-items.v1",maxBytes:1024*1024},
 {name:"product-identity-cache-v1.json",schema:"deliveryos.product-identity-cache.v1",maxBytes:8*1024*1024},
 {name:"product-aliases-v1.json",schema:"deliveryos.academia-live-product-aliases.v1",maxBytes:1024*1024},
 {name:"human-order-overrides-v1.json",schema:"deliveryos.human-exact-order-overrides.v1",maxBytes:1024*1024},
]);
const CANONICAL_MOTOR_SHA256="1e4cf2475edb586d5dae88388d2adc7cf02013b00ec93c0371e3edb80f81342e";
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
const guardPath=(dir,name)=>path.join(dir,name);
function parseSource(buf){
 if(buf.length>=2&&buf[0]===0xff&&buf[1]===0xfe)
   return JSON.parse(buf.subarray(2).toString("utf16le"));
 return JSON.parse(buf.toString("utf8").replace(/^\uFEFF/,""));
}
function count(v){return Array.isArray(v)?v.length:
 v&&typeof v==="object"?Object.keys(v).length:-1;}
function statusFor(name,v){
 if(!v||typeof v!=="object"||Array.isArray(v))return "NOT_JSON_OBJECT";
 const valid=({
  "app-data.json":()=>Array.isArray(v.products),
  "routing.json":()=>v.products&&typeof v.products==="object"&&!Array.isArray(v.products),
  "printer-map.json":()=>Array.isArray(v.mappings),
  "non-production.json":()=>v.items&&typeof v.items==="object"&&!Array.isArray(v.items),
  "product-identity-cache-v1.json":()=>Array.isArray(v.rows),
  "product-aliases-v1.json":()=>Array.isArray(v.aliases),
  "human-order-overrides-v1.json":()=>Array.isArray(v.orders),
 })[name];
 return valid?.()?"VALID_SHAPE":"REQUIRED_COLLECTION_MISSING";
}
/** Evidence is intentionally local and sanitized. Source files are NOT exported. */
function auditCandidatePrerequisitesV711(dir,opt={}){
 const allowTestMotor=opt.expectedMotorSha256??CANONICAL_MOTOR_SHA256;
 const rejected=new Set(),files=[];
 const root=path.resolve(dir);
 let rootOk=false;
 try{const s=fs.lstatSync(root);rootOk=s.isDirectory()&&!s.isSymbolicLink();}
 catch{rejected.add("SOURCE_DIRECTORY_MISSING_OR_UNTRUSTED");}
 if(!rootOk)rejected.add("SOURCE_DIRECTORY_MISSING_OR_UNTRUSTED");
 for(const source of REQUIRED){
  let sha=null,bytes=null,ok=false,shape="NOT_READ",schema="NOT_EXAMINED";
  try{
   const target=guardPath(root,source.name),stat1=fs.lstatSync(target);
   if(!rootOk||stat1.isSymbolicLink()||!stat1.isFile())
     throw Error("NONREGULAR_FILE");
   if(stat1.size<=0||stat1.size>source.maxBytes)throw Error("SOURCE_SIZE");
   const data=fs.readFileSync(target),stat2=fs.lstatSync(target);
   if(stat2.ino!==stat1.ino||stat2.size!==stat1.size||
      stat2.mtimeMs!==stat1.mtimeMs||stat2.ctimeMs!==stat1.ctimeMs)
      throw Error("SOURCE_CHANGED_DURING_READ");
   bytes=data.length;sha=hash(data);
   if(source.name==="packaging-current.js"){
     shape="CODE_BYTES_ONLY";schema="JAVASCRIPT";
     if(sha!==allowTestMotor)throw Error("CANONICAL_MOTOR_SHA256_MISMATCH");
   }else{
     const obj=parseSource(data);schema=String(obj?.schema??"NO_SCHEMA_FIELD");
     shape=statusFor(source.name,obj);
     if(source.schema&&schema!==source.schema)throw Error("SOURCE_SCHEMA_MISMATCH");
     if(shape!=="VALID_SHAPE")throw Error("SOURCE_SHAPE_MISMATCH");
   }
   ok=true;
  }catch(e){
   const code=/^(?:SOURCE_CHANGED_DURING_READ|SOURCE_SIZE|CANONICAL_MOTOR_SHA256_MISMATCH|SOURCE_SCHEMA_MISMATCH|SOURCE_SHAPE_MISMATCH|NONREGULAR_FILE)$/.test(e?.message)
    ?e.message:"SOURCE_ABSENT_UNREADABLE_OR_UNPARSEABLE";
   rejected.add(source.name+":"+code);
  }
  files.push({file:source.name,status:ok?"MATCHED":"BLOCKED",sha256:ok?sha:null,
   bytes:ok?bytes:null,schema:ok?schema:null,shape:ok?shape:null});
 }
 const status=rejected.size===0?
  "SOURCE_PREFLIGHT_MATCH_ONLY_NO_DEPLOY_AUTHORIZATION":"BLOCKED";
 return {schema:"deliveryos.consumer-v711-read-only-preflight.v1",
  status,files,blockers:[...rejected].sort(),
  safeguards:{sql:false,state_write:false,service_restart:false,print:false,
   spooler:false,source_values_exported:false,
   authenticates_windows_service:false,validates_human_turn:false,
   validates_runtime_permissions:false,authorizes_cutover:false}};
}
module.exports={auditCandidatePrerequisitesV711,REQUIRED,CANONICAL_MOTOR_SHA256};
if(require.main===module){
 const source=process.argv[2];
 if(!source){process.stderr.write("USAGE: node auditar_preflight_consumidor_v711.js <shadow_directory>\n");process.exit(2)}
 const result=auditCandidatePrerequisitesV711(source);
 process.stdout.write(JSON.stringify(result)+"\n");
 process.exit(result.status==="BLOCKED"?4:0);
}
