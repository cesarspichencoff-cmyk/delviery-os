"use strict";
/**
 * Drift gate for the shadow homologation candidate. Recomputes the measured
 * dependency closure and requires it to equal the pinned manifest exactly;
 * any change to a candidate file must re-pin the manifest in the same commit.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {buildManifest,byteExactAttributeGaps,MANIFEST}=require("./comandas_candidata_homologacao_v1.cjs");
const ROOT=path.join(__dirname,"..");
const pinned=JSON.parse(fs.readFileSync(path.join(ROOT,MANIFEST),"utf8"));
const now=buildManifest();
let n=0;function test(name,fn){fn();console.log("PASS "+(++n)+" "+name);}
// Runs FIRST and on every OS: a missing '-text' would otherwise surface only
// on a Windows CRLF checkout as an opaque blob mismatch (PR #135, run 41398285659).
test("every candidate file keeps exact bytes on Windows ('-text' in .gitattributes)",()=>{
 const attrs=fs.readFileSync(path.join(ROOT,".gitattributes"),"utf8");
 assert.deepEqual(byteExactAttributeGaps(now,attrs),[]);
 // Counterexample: dropping one protection line must be detected.
 const target="tools/comandas_cadeia_nativa_v1_offline.cjs";
 const dropped=attrs.split("\n").filter(l=>l.trim()!==target+" -text").join("\n");
 assert.deepEqual(byteExactAttributeGaps(now,dropped),[target]);
 assert.equal(now.eol_policy,"BYTE_EXACT_GIT_BLOB; every file above is '-text' in .gitattributes");
});
test("measured closure equals the pinned manifest byte-for-byte",()=>{
 assert.deepEqual(now,pinned);
});
test("closure is complete and carries no process, network or print capability",()=>{
 assert.deepEqual(now.unresolved_relative_requires,[]);
 assert.deepEqual(now.capability_flags.child_process,[]);
 assert.deepEqual(now.capability_flags.network,[]);
 assert.deepEqual(now.node_builtins,["crypto","fs","path","util","vm"]);
 for(const f of now.code){
  const t=fs.readFileSync(path.join(ROOT,f.path),"utf8");
  assert.doesNotMatch(t,/printDirect|\bspawn(?:Sync)?\(|POST \/print|localhost:4013|:3000\/print/,f.path);
 }
});
test("consumer and motor are the already-pinned bytes, not new forks",()=>{
 const consumer=now.code.find(f=>f.path==="runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs");
 assert.equal(consumer.git_blob,"8e75fea85437d063c2f6ee2df09ee33962d42ce6");
 const motor=now.runtime_data.find(f=>f.path==="tools/fixtures/canonical-packaging-v63-pinned.js");
 assert.equal(motor.git_blob,"3167c309f02a0ad5a84fb43043b8866e3bee873c");
 // The only file writer in the closure is the consumer's own evidence file.
 assert.deepEqual(now.capability_flags.file_write,["runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs"]);
});
test("manifest declares no install, service, queue, print or sequence effect",()=>{
 for(const v of Object.values(now.effects))assert.equal(v,false);
});
console.log("COMANDAS_HOMOLOGATION_CANDIDATE_V1="+n+"/"+n+" FILES="+now.code.length+"+"+now.runtime_data.length+" SHADOW_ONLY");
