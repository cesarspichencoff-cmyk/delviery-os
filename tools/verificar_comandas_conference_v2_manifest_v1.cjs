"use strict";
/** Byte-exact manifest + no-print contract for Conference V2 code integration. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const ROOT=path.resolve(__dirname,"..");
const manifest=require("../docs/comandas/CANDIDATA_INTEGRACAO_CONFERENCIA_V2.manifest.json");
const gitBlob=b=>crypto.createHash("sha1").update(
 Buffer.concat([Buffer.from("blob "+b.length+"\0"),b])).digest("hex");
const read=p=>{
 assert.equal(typeof p,"string");assert.ok(!p.includes("..")&&!path.isAbsolute(p));
 return fs.readFileSync(path.join(ROOT,p));
};
let n=0;
const check=(name,fn)=>{fn();process.stdout.write("PASS "+(++n)+" "+name+"\n");};
check("exact shadow baseline manifest remains unchanged",()=>{
 assert.equal(manifest.schema,"tata.comandas.conference-v2-code-integration-manifest.v1");
 assert.equal(manifest.status,"CODE_REVIEW_AND_OFFLINE_TEST_ONLY");
 assert.equal(gitBlob(read(manifest.base_shadow_candidate.path)),
  manifest.base_shadow_candidate.git_blob);
});
check("new V2 modules are byte-pinned without path or role drift",()=>{
 assert.equal(manifest.additional_runtime_modules.length,5);
 const paths=manifest.additional_runtime_modules.map(x=>x.path);
 assert.equal(new Set(paths).size,5);
 for(const item of manifest.additional_runtime_modules){
  assert.match(item.git_blob,/^[a-f0-9]{40}$/);
  assert.equal(gitBlob(read(item.path)),item.git_blob,item.path);
 }
});
check("writer and attester have no disposable SQLite lab dependency",()=>{
 for(const name of ["comandas_sequence_v2_authorized_ledger_core_v1.cjs",
   "comandas_sequence_v2_independent_attester_core_v1.cjs"]){
  const code=read("tools/"+name).toString("utf8");
  assert.ok(code.includes("comandas_sequence_v2_native_pair_eligibility_v1.cjs"));
  assert.ok(!code.includes('require("./comandas_sequence_v2_native_lab_v1.cjs")'));
  assert.ok(!code.includes('require("./comandas_sequence_v2_sqlite_lab.cjs")'));
 }
});
check("new integration modules do not import host, printer or network primitives",()=>{
 for(const item of manifest.additional_runtime_modules){
  const code=read(item.path).toString("utf8");
  assert.doesNotMatch(code,/require\(["'](?:node:)?(?:child_process|fs|fs\/promises|net|http|https|tls|dgram|serialport|printer)["']\)/);
 }
 const M=require("./comandas_conference_sequence_v2_integration_v1.cjs");
 assert.equal(M.EFFECTS.print,false);
 assert.equal(M.EFFECTS.spooler,false);
 assert.equal(M.EFFECTS.network,false);
 assert.equal(M.preflightConferenceV2(null).status,"HOLD");
 assert.equal(M.bindPreparedConferenceV2({}).status,"HOLD");
 assert.equal(M.reviewAttestedConferenceV2({}).status,"HOLD");
});
check("production attester anchors remain empty, and print authority is forbidden",()=>{
 const trust=JSON.parse(read("data/tata_sequence_attesters_v1.json"));
 assert.deepEqual(trust.attesters,[]);
 assert.deepEqual(trust.writer_key_ids,[]);
 assert.equal(manifest.effect_authorization.production_print,false);
 assert.equal(manifest.effect_authorization.sqlite_production_write,false);
 assert.equal(manifest.effect_authorization.merge,false);
 assert.ok(manifest.blocked_by_design.some(x=>x.includes("shadow-only financial")));
 assert.ok(manifest.blocked_by_design.some(x=>x.includes("watermarked")));
});
process.stdout.write("COMANDAS_CONFERENCE_V2_MANIFEST="+n+"/"+n+
 " BYTE_PINNED CODE_ONLY NO_PRINT\n");
