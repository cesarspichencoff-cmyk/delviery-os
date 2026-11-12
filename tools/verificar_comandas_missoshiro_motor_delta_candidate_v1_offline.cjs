"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {SCHEMA,SOURCE_BLOB,EFFECTS,patchPinnedMotorInMemory:patch}=
  require("./comandas_missoshiro_motor_delta_candidate_v1_offline.cjs");
const source=fs.readFileSync(path.join(__dirname,"fixtures","canonical-packaging-v63-pinned.js"),"utf8");
const baselineSource=source;
let passed=0;
function test(name,fn){fn();passed++;console.log("PASS "+passed+" "+name);}
function engine(src) {
  const realm=Object.create(null);
  vm.runInNewContext(src,realm,{filename:"isolated-packaging-candidate.js",timeout:2500});
  assert.ok(realm.TATAPackaging&&typeof realm.TATAPackaging.categoryOf==="function");
  return realm.TATAPackaging;
}
const baseline=engine(source);
const delta=patch(source);
const candidate=delta.candidate_source?engine(delta.candidate_source):null;
const item=(name,family="acompanhamento",station="cozinha_quentes")=>({
  nome:name,classification:{family,station}
});
const M=item("MISSOSHIRO");
test("requires exact original Git blob and reports no filesystem or print effects",()=>{
  assert.equal(delta.schema,SCHEMA);
  assert.equal(delta.status,"ISOLATED_CATEGORY_CANDIDATE_ONLY");
  assert.equal(delta.original_blob_sha1,SOURCE_BLOB);
  assert.ok(/^[a-f0-9]{64}$/.test(delta.candidate_sha256));
  assert.equal(Object.values(EFFECTS).every(x=>x===false),true);
  assert.equal(delta.operational_authorized,false);
  assert.equal(delta.print_authorized,false);
  assert.equal(delta.native_identity_proven,false);
  assert.equal(delta.kit_fixed,false);assert.equal(delta.bags_fixed,false);
});
test("legacy motor makes the reproducible erroneous 650 sealed classification",()=>{
  const c=baseline.categoryOf(M);
  assert.equal(c.category,"selada_650");assert.equal(c.box,"650");
});
test("isolated candidate identifies confirmed Missoshiro as isopor pot only",()=>{
  const c=candidate.categoryOf(M);
  assert.equal(c.category,"missoshiro_isopor_candidate");
  assert.equal(c.box,"POTE_ISOPOR");
  assert.equal(c.status,candidate.FACT);
  assert.equal(c.per_unit,true);
});
test("candidate packComanda truly uses isopor for one synthetic Missoshiro",()=>{
  const out=candidate.packComanda([{product:M,quantity:1}]);
  assert.equal(out.groups.length,1);
  assert.equal(out.groups[0].box,"POTE_ISOPOR");
  assert.notEqual(out.groups[0].box,"650");
});
test("candidate must still HOLD generic bag-size conclusions",()=>{
  const out=candidate.packComanda([{product:M,quantity:1}]);
  assert.equal(out.bags.size_status,candidate.UNKNOWN);
  assert.equal(delta.bags_fixed,false);
});
test("candidate detects that legacy kit logic still grants unapproved hot kit",()=>{
  const out=candidate.kitVerdict([{product:M,quantity:1}]);
  assert.ok(Array.isArray(out.kits));
  assert.equal(out.kits.some(x=>x.kit==="Kit Quente"),true,
    "Legacy kit conflict must remain visible, not silently approved");
  assert.equal(delta.kit_fixed,false);
});
test("missoshiro without exact authorized synthetic family and station is not classified as isopor",()=>{
  const inputs=[item("MISSOSHIRO","entrada","cozinha_quentes"),
    item("MISSOSHIRO","acompanhamento","balcao"),
    {nome:"MISSOSHIRO"},item("MISSOSHIRO","acompanhamento","sushi")];
  for(const x of inputs)assert.notEqual(candidate.categoryOf(x).category,"missoshiro_isopor_candidate");
});
test("similar names do not inherit human-confirmed isopor classification",()=>{
  for(const n of ["MISSOSHIRO ESPECIAL","NASU NO MISSO","MISSOSHIRO 2",
     "MISSOSHIRO-KIT","MISO SHIRO","MISSOSHIRO EXTRA"])
    assert.notEqual(candidate.categoryOf(item(n)).category,"missoshiro_isopor_candidate");
});
test("unreviewed Missoshiru alias remains unchanged, no silent generalization",()=>{
  const q=item("MISSOSHIRU");
  assert.equal(JSON.stringify(candidate.categoryOf(q)),JSON.stringify(baseline.categoryOf(q)));
});
test("unrelated category, packaging and kit results match the existing motor byte for byte in JSON",()=>{
  const other=[
    item("EDAMAME","entrada","cozinha_quentes"),
    item("NASU NO MISSO","entrada","cozinha_quentes"),
    item("CEVICHE","entrada","sushi_quentes"),
    item("GUIOZA","entrada","cozinha_quentes"),
    item("SUSHI DE SALMAO","dupla","duplas"),
    item("HOT ROLL","enrolado","enrolados"),
    item("COMBINADO EXECUTIVO SALMAO","combinado","combinados"),
    item("SALMAO/ATUM 1 PESSOA","combinado","combinados"),
    item("AGUA MINERAL C/GAS - UN","bebida","bar_bebidas")
  ];
  for(const p of other){
    assert.equal(JSON.stringify(candidate.categoryOf(p)),
                 JSON.stringify(baseline.categoryOf(p)));
    const fixture=[{product:p,quantity:1}];
    assert.equal(JSON.stringify(candidate.packComanda(fixture)),
                 JSON.stringify(baseline.packComanda(fixture)));
    assert.equal(JSON.stringify(candidate.kitVerdict(fixture)),
                 JSON.stringify(baseline.kitVerdict(fixture)));
  }
});
test("original source buffer is left byte-identical and compiled candidate is separate",()=>{
  assert.equal(source,baselineSource);
  assert.notEqual(delta.candidate_source,source);
  assert.equal(baseline.categoryOf(M).box,"650");
});
test("tampered motor bytes fail closed rather than patching a new release",()=>{
  const altered=source.replace('"guioza", "edamame", "missoshiro"',
                               '"guioza", "edamame", "other_word"');
  assert.notEqual(altered,source);
  const result=patch(altered);
  assert.equal(result.status,"HOLD");
  assert.equal(result.reason,"PINNED_BLOB_MISMATCH");
  assert.equal(result.candidate_source,null);
});
console.log("COMANDAS_MISSOSHIRO_DELTA_CANDIDATE="+passed+"/"+passed+
 " ISOLATED_CATEGORY_ONLY LEGACY_KIT_AND_BAG_HOLD NO_PRINT");
