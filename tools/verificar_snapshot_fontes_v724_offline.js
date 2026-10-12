"use strict";
/**
 * V7.24: execute only snapshot of pinned V2 and eight bytes-identical rule
 * assets in a disposable sandbox. No real reader/service, print or SQL.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),
 os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {lineageMatchesPinnedSources,RULE_FILES,parseArgs}=
 require("./gerar_tres_vias_v2_gate_v720_offline.js");
const gate=fs.readFileSync(path.join(__dirname,
 "gerar_tres_vias_v2_gate_v720_offline.js"),"utf8");
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const NAMES=["packaging-current.js",...RULE_FILES];
const origins=[
 "tata-academia:installed/packaging-current.js",
 "tata-academia:installed/app-data.json",
 ...RULE_FILES.slice(1).map(n=>"deliveryos:installed/"+n)
];
const corpus=new Map(NAMES.map((n,i)=>[n,Buffer.from("fictional-source-"+i)]));
const decision={
 rule_lineage:{
  academy_rule_refs:origins.slice(0,2).map((n,i)=>n+"#sha256="+sha(corpus.get(NAMES[i]))),
  delivery_rule_refs:origins.slice(2).map((n,i)=>n+"#sha256="+sha(corpus.get(NAMES[i+2])))
 }
};
let count=0;
function check(label,fn){fn();count++;console.log("PASS "+count+" "+label);}
check("exact eight consumed source digests accepted only when all match",()=>{
 assert.equal(RULE_FILES.length,7);
 assert.equal(NAMES.length,8);
 assert.equal(lineageMatchesPinnedSources(decision,corpus),true);
});
check("all eight source changes independently invalidate lineage",()=>{
 for(const name of NAMES){
  const revised=new Map(corpus);
  revised.set(name,Buffer.from("changed-source-"+name));
  assert.equal(lineageMatchesPinnedSources(decision,revised),false,name);
 }
});
check("lineage reordering, omission and added fake hash fail closed",()=>{
 const d=structuredClone(decision);
 d.rule_lineage.delivery_rule_refs.reverse();
 assert.equal(lineageMatchesPinnedSources(d,corpus),false);
 d.rule_lineage.delivery_rule_refs.pop();
 assert.equal(lineageMatchesPinnedSources(d,corpus),false);
 d.rule_lineage.delivery_rule_refs=decision.rule_lineage.delivery_rule_refs.concat("forged#sha256="+"a".repeat(64));
 assert.equal(lineageMatchesPinnedSources(d,corpus),false);
});
check("malformed decision or missing source cannot claim provenance",()=>{
 for(const bad of [null,{},[],{rule_lineage:{}},{rule_lineage:{academy_rule_refs:[],delivery_rule_refs:[]}}])
  assert.equal(lineageMatchesPinnedSources(bad,corpus),false);
 const noMotor=new Map(corpus);noMotor.delete("packaging-current.js");
 assert.equal(lineageMatchesPinnedSources(decision,noMotor),false);
});
check("executable, proof, motor and every rule are staged before subprocess",()=>{
 const proc=gate.indexOf("const child=spawnSync(");
 for(const token of [
  "fs.writeFileSync(isolatedConsumer,code",
  "for(const [name,bytes] of ruleSources)",
  "fs.writeFileSync(path.join(isolatedDir,name),bytes",
  "fs.writeFileSync(proofPath,proofSource",
  "fs.writeFileSync(renderMotorPath,rendererMotor",
  "const child=spawnSync(process.execPath,[isolatedConsumer,eventPath]"
 ]){
  assert.ok(gate.includes(token),token);
  if(!token.startsWith("const child="))assert.ok(gate.indexOf(token)<proc,token);
 }
 assert.ok(gate.includes("cwd:dir"));
 assert.ok(gate.includes("lineageMatchesPinnedSources(decision,ruleSources)"));
 assert.ok(gate.indexOf("lineageMatchesPinnedSources(decision,ruleSources)")<
  gate.indexOf("verifyLiveReaderPairV68(event,decision)"));
});
check("renderer receives exact snapshotted proof and canonical motor",()=>{
 assert.ok(gate.includes('"--proof",proofPath,"--motor",renderMotorPath'));
 assert.ok(gate.includes("sha(readBound(proofPath))===sha(proofSource)"));
 assert.ok(gate.includes("sha(readBound(renderMotorPath))===sha(rendererMotor)"));
 assert.ok(gate.includes("RULE_FILES.every(name=>sha(readBound(path.join(consumerSourceDir,name)))==="));
 assert.ok(gate.includes("sha(readBound(path.join(isolatedDir,name)))===sha(bytes)"));
});
check("symlinks rejected by source reader, effectful paths absent",()=>{
 assert.ok(gate.includes("fs.lstatSync(file)"));
 assert.ok(gate.includes("stat.isSymbolicLink()"));
 assert.ok(gate.includes('if(process.platform!=="linux")'));
 assert.ok(gate.includes("withoutNodePreloads(process.env)"));
 assert.ok(!/\b(?:printer\.print|spooler\.write|Set-Service|Start-Service)\b/.test(gate));
});
check("only five explicit sources; cached/manual decision cannot enter",()=>{
 assert.throws(()=>parseArgs(["--decision","/tmp/stale"]),/FIVE_EXPLICIT_LOCAL_SOURCES_REQUIRED/);
 assert.throws(()=>parseArgs([]),/FIVE_EXPLICIT_LOCAL_SOURCES_REQUIRED/);
});
console.log("THERMAL_SOURCE_SNAPSHOT_V724="+count+"/"+count+
 " PINNED V2, EIGHT_RULES, RENDER_PROOF SNAPSHOT NO_PRINT");
