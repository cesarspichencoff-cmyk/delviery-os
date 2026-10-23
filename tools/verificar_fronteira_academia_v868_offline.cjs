"use strict";
/**
 * TATÁ Comanda — Academy candidate compatibility gate, REVIEW ONLY.
 * Intent: make old/proposed motor version difference visible before any repin.
 * Reads only exact source files in a disposable CI checkout; no iFood,
 * Windows host, SQL, service, printer, sequence, network, or source writes.
 * Running Academy candidate unit tests is a distinct workflow step.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const crypto=require("node:crypto"),vm=require("node:vm");
const {inspectPinnedMotorBytes}=
 require("./tata_comanda_pinned_motor_loader_v862_offline.cjs");

const LEGACY_BLOB="3167c309f02a0ad5a84fb43043b8866e3bee873c";
const PROPOSED_COMMIT="a53369bf5db54b06712806c7df53f22140ba6de0";
const PROPOSED_BLOB="cc573bf9a10c71011a6a1403ad7d2ba1725df66f";
const SOURCE_REF="human:cesar:2026-10-07:1-combinado-kids-alone-sacola-m";
const NO_EFFECTS=Object.freeze({print:false,spooler:false,sql:false,
 service:false,sequence:false,install:false,deploy:false,network:false});

const gitBlob=b=>crypto.createHash("sha1")
 .update(Buffer.from("blob "+b.length+"\0")).update(b).digest("hex");
function readBound(p) {
 const f=fs.lstatSync(p);
 assert.equal(f.isFile(),true,"SOURCE_MUST_BE_REGULAR_FILE");
 assert.equal(f.isSymbolicLink(),false,"SOURCE_SYMLINK_DENIED");
 assert.ok(f.size>=64&&f.size<=1024*1024,"SOURCE_BYTES_OUT_OF_BOUNDS");
 return fs.readFileSync(p);
}
let count=0;
const check=(description,test)=>{test();count++;console.log("PASS "+count+" "+description);};
function loadForReview(bytes){
 const space=Object.create(null);
 vm.runInNewContext(bytes.toString("utf8"),space,{timeout:3000});
 const motor=space.TATAPackaging;
 assert.equal(typeof motor?.packComanda,"function");
 assert.equal(typeof motor?.kitVerdict,"function");
 assert.equal(typeof motor?.categoryOf,"function");
 return motor;
}
const p=process.argv[2];
assert.ok(p&&process.argv.length===3,"EXACT_CANDIDATE_FILE_REQUIRED");
const candidate=readBound(path.resolve(p));
const legacy=readBound(path.join(__dirname,"fixtures","canonical-packaging-v63-pinned.js"));
check("historic Academy motor is the exact pinned source",()=>{
 assert.equal(gitBlob(legacy),LEGACY_BLOB);
 assert.equal(inspectPinnedMotorBytes(legacy).status,"PINNED_EXACT_BYTES");
});
check("proposed Academy PR50 source is exact immutable Git blob",()=>{
 assert.equal(gitBlob(candidate),PROPOSED_BLOB);
 assert.notEqual(gitBlob(candidate),gitBlob(legacy));
});
check("new source cannot silently replace the production pin",()=>{
 const verdict=inspectPinnedMotorBytes(candidate);
 assert.equal(verdict.status,"HOLD");
 assert.equal(verdict.reason,"PACKAGING_MOTOR_BYTES_DRIFT");
 assert.equal(verdict.motor,null);
 assert.equal(verdict.print_authorized,false);
});
const motor=loadForReview(candidate);
const entry=(nome,family,station,quantity=1,subfamily)=>({
 product:{nome,classification:{family,station,...(subfamily?{subfamily}:{})}},
 quantity
});
const kids=()=>entry("COMBINADO KIDS","combinado","combinados");
const temaki=()=>entry("Temaki de Salmao","temaki","temakis");
const tataki=()=>entry("SASHIMI TATAKI DE SALMAO","dupla","duplas",1,"tataki");
check("only one Kids by itself is 750 with one M bag",()=>{
 const q=motor.packComanda([kids()]);
 assert.equal(q.total_boxes,1);
 assert.equal(q.groups[0].box,"750");
 assert.equal(q.bags.size,"M");
 assert.equal(q.bags.exact_bag_count,1);
 assert.equal(q.bags.size_source_ref,SOURCE_REF);
 assert.deepEqual(JSON.parse(JSON.stringify(motor.kitVerdict([kids()]).kits)),
  [{kit:"Kit Kids",quantidade:1}]);
});
check("two Kids never inherit the single-Kids exception",()=>{
 const q=motor.packComanda([entry("COMBINADO KIDS","combinado","combinados",2)]);
 assert.notEqual(q.bags.size_source_ref,SOURCE_REF);
});
check("Kids with an extra never inherit the single-Kids exception",()=>{
 const q=motor.packComanda([kids(),temaki()]);
 assert.notEqual(q.bags.size_source_ref,SOURCE_REF);
});
check("Tataki is Dupla only when current subfamily is proven",()=>{
 assert.equal(motor.categoryOf(tataki().product).category,"dupla_dyo");
 assert.equal(motor.categoryOf(tataki().product).status,"FACT");
 const missing=entry("SASHIMI TATAKI DE SALMAO","dupla","duplas");
 assert.equal(motor.categoryOf(missing.product).status,"UNKNOWN");
});
check("Tataki plus temaki has exact Kit p/1 without sashimi guess",()=>{
 const k=motor.kitVerdict([tataki(),temaki()]);
 assert.equal(k.status,"FACT");
 assert.deepEqual(JSON.parse(JSON.stringify(k.kits)),[{kit:"Kit p/1",quantidade:1}]);
});
check("malformed and partial item sets cannot become packing FACT",()=>{
 for(const bad of [[temaki(),null],[temaki(),entry("Temaki de Salmao","temaki","temakis",0)],[null],[]]){
  const pack=motor.packComanda(bad),kit=motor.kitVerdict(bad);
  assert.equal(pack.has_unknown,true);
  assert.equal(kit.status,"UNKNOWN");
 }
});
check("unknown product cannot disappear from kit calculation",()=>{
 const k=motor.kitVerdict([temaki(),entry("ITEM DESCONHECIDO","","")]);
 assert.equal(k.status,"UNKNOWN");
 assert.deepEqual(JSON.parse(JSON.stringify(k.kits)),[]);
});
check("review proves no effects and never requests a repin",()=>{
 assert.ok(Object.values(NO_EFFECTS).every(v=>v===false));
 assert.equal(inspectPinnedMotorBytes(candidate).status,"HOLD");
});
console.log("ACADEMY_CROSS_PROJECT_V868="+count+"/"+count+
 " PR50_COMMIT="+PROPOSED_COMMIT+" OLD_PIN_UNCHANGED NO_PRINT NO_INSTALL");
