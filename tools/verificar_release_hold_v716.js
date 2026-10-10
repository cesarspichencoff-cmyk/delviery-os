"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const root=path.join(__dirname,"..");
const manifest=JSON.parse(fs.readFileSync(path.join(root,
 "runtime/shadow/thermal-consumer-release-hold.v1.json"),"utf8"));
const gitBlob=buf=>crypto.createHash("sha1").update("blob "+buf.length+"\0").update(buf).digest("hex");
let n=0;const check=(label,fn)=>{fn();n++;console.log("PASS "+n+" "+label)};
check("V7.16 PR manifest stays draft and forbids all live effects",()=>{
 assert.equal(manifest.schema,"deliveryos.thermal-consumer-release-hold.v1");
 assert.equal(manifest.status,"DRAFT_HOLD_NOT_INSTALLED");
 assert.equal(manifest.world_evidence_status,"NOT_PROVEN");
 assert.ok(Object.values(manifest.effect_boundaries).every(x=>x===false));
});
check("V7.16 only candidate V7.14 is marked for eventual post-review selection",()=>{
 assert.equal(manifest.preferred_future_candidate.path,
  "runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs");
 assert.equal(manifest.preferred_future_candidate.installed,false);
 assert.equal(manifest.preferred_future_candidate.print_authorized,false);
});
check("V7.16 exact blob of future candidate matches locked content",()=>{
 const raw=fs.readFileSync(path.join(root,manifest.preferred_future_candidate.path));
 assert.equal(gitBlob(raw),manifest.preferred_future_candidate.git_blob_sha1);
});
check("V7.16 old candidates explicitly deprecated, not silently eligible",()=>{
 assert.deepEqual(manifest.deprecated_do_not_install.map(x=>x.path).sort(),[
  "runtime/shadow/live_shadow_consumer_v2_candidate_v710.cjs",
  "runtime/shadow/live_shadow_consumer_v2_candidate_v712.cjs",
  "runtime/shadow/live_shadow_consumer_v2_candidate_v713.cjs"].sort());
 assert.ok(manifest.deprecated_do_not_install.every(x=>x.reason.length>12));
});
check("V7.16 manifest provides no operational printer target nor deployment command",()=>{
 const m=JSON.stringify(manifest);
 for(const s of ["printer_ip","shell_command","spooler_target","production_print_path","credentials"])
  assert.ok(!m.includes('"'+s+'"'));
});
check("V7.16 every material cutover requirement remains OPEN",()=>{
 assert.equal(manifest.requires_before_any_real_cutover.length,8);
 assert.ok(manifest.requires_before_any_real_cutover.includes(
  "CURRENT_HUMAN_SHIFT_APPROVAL_EFFECTIVE_FROM_TIMESTAMP"));
 assert.ok(manifest.requires_before_any_real_cutover.includes(
  "ORDER_EXACT_SNAPSHOT_OBSERVATIONS_JOIN"));
 assert.ok(manifest.requires_before_any_real_cutover.includes(
  "SEPARATE_PRINT_ACCEPTANCE_CAIXA_ITAIM"));
});
check("V7.16 three historic paper drawings carry original SHA-256 anchors",()=>{
 assert.deepEqual(manifest.design_goldens,{
  kitchen:"041151f766725456d5487578375ac7c011c6bfa113ceaa52e1976a56d90e9db8",
  sushi:"87ea691d76e57dca24ef104671c53119b53dfc60ec3d5d12739d1c864babd88f",
  conference:"f7a4cd64b85f3611abd5259c30d97f53d2cd7fcb9b3732faef50f794071d79a2",
 });
});
check("V7.16 no automated installer exists in release manifest scope",()=>{
 assert.ok(!/deploy\s*:\s*true|installed\s*:\s*true|print_authorized\s*:\s*true/.test(
  JSON.stringify(manifest)));
});
console.log("THERMAL_RELEASE_HOLD_V716="+n+"/"+n+" DRAFT NO_DEPLOY NO_PRINT DRAWING_PINNED");
