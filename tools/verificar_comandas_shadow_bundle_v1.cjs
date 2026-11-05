"use strict";
/** Offline only: sealed candidate, synthetic source claims, real archived 9627 pair. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {spawnSync}=require("node:child_process");
const {build,verify}=require("./comandas_shadow_bundle_v1.cjs");
const {snapshotHash}=require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const ROOT=path.resolve(__dirname,".."),load=n=>JSON.parse(fs.readFileSync(path.join(ROOT,"data",n),"utf8"));
const work=fs.mkdtempSync(path.join(os.tmpdir(),"comandas-bundle-gate-"));
let count=0;function test(name,fn){fn();process.stdout.write("PASS "+(++count)+" "+name+"\n");}
try{
 const output=path.join(work,"bundle");
 test("closed package includes the exact conference-only tools and verifies all digests",()=>{
  const b=build(output);
  assert.equal(b.status,"BUNDLE_BUILT_VERIFIED");
  assert.equal(b.candidate_files,34);
  assert.ok(b.compiled_files>=10);
  const attrs=fs.readFileSync(path.join(ROOT,".gitattributes"),"utf8");
  for(const path of ["docs/comandas/CANDIDATA_HOMOLOGACAO_CADEIA_NATIVA_V1.manifest.json",
    "tools/comandas_shadow_bundle_v1.cjs","tools/comandas_shadow_offline_run_v1.cjs"])
   assert.ok(attrs.split(/\r?\n/).includes(path+" -text"),path);
  const candidateBytes=fs.readFileSync(path.join(ROOT,"docs/comandas/CANDIDATA_HOMOLOGACAO_CADEIA_NATIVA_V1.manifest.json"));
  const digest=require("node:crypto").createHash("sha256").update(candidateBytes).digest("hex");
  assert.equal(b.candidate_manifest_sha256,digest);
  const meta=JSON.parse(fs.readFileSync(path.join(output,"shadow-bundle.manifest.json"),"utf8"));
  assert.equal(meta.source_commit,undefined);
  assert.equal(meta.conference_runner,"tools/comandas_conference_only_shadow_runner_v1.cjs");
  for(const p of ["tools/conference_only_from_sanitized_v1.cjs",
    "tools/comandas_conference_only_shadow_runner_v1.cjs"])
   assert.ok(meta.files.some(f=>f.path===p),p);
  assert.equal(meta.source_baseline_commit,"4d660808f73e611023c30e71ac0f86e6c5db8833");
  assert.equal(verify(output).files_verified,b.files_verified);
 });
 const {run}=require(path.join(output,"tools/comandas_shadow_offline_run_v1.cjs"));
 const {runConferenceOnlyV1}=require(path.join(output,
  "tools/comandas_conference_only_shadow_runner_v1.cjs"));
 test("bundle imports executable pure replay without node_modules or compiler",()=>{
  assert.equal(typeof run,"function");
  assert.equal(typeof runConferenceOnlyV1,"function");
 });
 test("offline pair CLI suppresses sensitive filename in exception output",()=>{
  const marker="PRIVATE_ORDER_IDENTIFIER_MUST_NOT_LEAK";
  const nonexistent=path.join(work,marker+".json");
  const runner=path.join(output,"tools/comandas_shadow_offline_run_v1.cjs");
  const p=spawnSync(process.execPath,[runner,nonexistent,nonexistent],
     {encoding:"utf8",timeout:15000});
  assert.equal(p.error,undefined);
  assert.equal(p.status,1);
  assert.equal(p.stdout,"");
  assert.equal(p.stderr,"SHADOW_PAIR_HOLD\n");
  assert.ok(!p.stderr.includes(marker));
 });
 test("conference-only CLI also suppresses sensitive filename on failed read",()=>{
  const marker="PRIVATE_CONFERENCE_IDENTIFIER_MUST_NOT_LEAK";
  const nonexistent=path.join(work,marker+".json");
  const runner=path.join(output,"tools/comandas_conference_only_shadow_runner_v1.cjs");
  const p=spawnSync(process.execPath,[runner,nonexistent,nonexistent],
     {encoding:"utf8",timeout:15000});
  assert.equal(p.error,undefined);
  assert.equal(p.status,4);
  assert.equal(p.stdout,"");
  assert.equal(p.stderr,"CONFERENCE_ONLY_SHADOW_HOLD\n");
  assert.ok(!p.stderr.includes(marker));
 });
 const sources=path.join(work,"sources");fs.mkdirSync(sources);
 const original=load("tata_reader_real_read_cdarvprod_success_20261005_v1.json");
 const replay=load("tata_reader_real_order_unified_replay_success_20261005_v2.json");
 const canon=s=>{const v=String(s).replace(/\./g,"");return v[0]+"."+v.slice(1,3)+"."+v.slice(3,5)+"."+v.slice(5,8)+"."+v.slice(8,10)};
 const names=Object.fromEntries(replay.production.flatMap(p=>p.lines).map(l=>[l.product_code,l.product_name]));
 const cls={
  "9.80.00.010.00":{family:"combinado",subfamily:"kids",station:"combinados"},
  "9.10.00.080.00":{family:"entrada",subfamily:"entrada_quente",station:"cozinha_quentes"},
  "9.10.00.020.00":{family:"entrada",subfamily:"entrada_quente",station:"cozinha_quentes"},
  "9.30.00.090.00":{family:"dupla",subfamily:"sushi",station:"duplas"}
 };
 const put=(name,obj)=>fs.writeFileSync(path.join(sources,name),JSON.stringify(obj));
 fs.copyFileSync(path.join(ROOT,"tools/fixtures/canonical-packaging-v63-pinned.js"),path.join(sources,"packaging-current.js"));
 put("app-data.json",{products:[]});
 put("product-identity-cache-v1.json",{schema:"deliveryos.product-identity-cache.v1",
  rows:original.observed_items.map(v=>({CDPRODUTO:v.CDPRODUTO,canonical:canon(v.CDARVPROD),
   NMPRODUTO:names[canon(v.CDARVPROD)]}))});
 put("product-aliases-v1.json",{schema:"deliveryos.academia-live-product-aliases.v1",
  aliases:original.observed_items.map(v=>({live_name:names[canon(v.CDARVPROD)],
   canonical_code:canon(v.CDARVPROD),classification:{...cls[canon(v.CDARVPROD)],review_required:false}}))});
 put("human-order-overrides-v1.json",{schema:"deliveryos.human-exact-order-overrides.v1",orders:[]});
 put("routing.json",load("odhen_product_routing_compact_v1.json"));
 put("printer-map.json",load("runtime_printer_map_v1.json"));
 put("non-production.json",load("non_production_delivery_items_v1.json"));
 const o=original.observed_order;
 const order={CDFILIAL:o.CDFILIAL,CDLOJA:o.CDLOJA,NRVENDAREST:o.NRVENDAREST,NRCOMANDA:o.NRCOMANDA,
  NRCOMANDAEXT:o.NRCOMANDAEXT,IDORGCMDVENDA:o.IDORGCMDVENDA,IDSTCOMANDA:o.IDSTCOMANDA,
  DTHRABERMESA:o.DTHRABERMESA,items:structuredClone(original.observed_items),
  observation_scan_complete:true,observation_rows:[]};
 const blocker=["SERVICE_STATE_DATE_MISMATCH_ORDER_DATE","SERVICE_STATE_EXPIRED_FOR_ORDER"];
 const ev={schema:"deliveryos.tata-reader-stable-order-event.v1",
  order_key:[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join("|"),
  snapshot_hash:snapshotHash(order),order,service_resolution:{
   service:null,evidence:"UNKNOWN",source_ref:null,blockers:blocker},
  ready_for_downstream_shadow:false,blockers:blocker};
 const eventFile=path.join(work,"event9627.json");fs.writeFileSync(eventFile,JSON.stringify(ev));
 // The test generates its own V2 decision on Foxxy only. This is NOT a bundle
 // feature and is forbidden on the CAIXA host due to the V7.14 absolute state path.
 const hostSeq="C:\\ProgramData\\TataComandaReader\\state\\tata-sequence-state.json";
 if(fs.existsSync(hostSeq))throw Error("TEST_CONSUMER_ABSOLUTE_HOST_STATE_PRESENT");
 const consumer=path.join(sources,"consumer.cjs");
 fs.copyFileSync(path.join(ROOT,"runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs"),consumer);
 const produced=spawnSync(process.execPath,[consumer,eventFile],{encoding:"utf8",timeout:20000});
 assert.ok([0,5].includes(produced.status)&&produced.stdout,"TEST_CONSUMER_UNAVAILABLE");
 const decision=JSON.parse(produced.stdout);
 const decisionFile=path.join(work,"decision9627.json");fs.writeFileSync(decisionFile,JSON.stringify(decision));
 test("archived V7.14 decision & event yield 3 virtual views with no bytes",()=>{
  const out=run(eventFile,decisionFile);
  assert.equal(out.status,"SHADOW_PAIR_REPLAYED");
  assert.equal(out.layers.L1.status,"NATIVE_REVISION_CONSISTENT");
  assert.equal(out.layers.L3.status,"NATIVE_CONTENT_PROVEN");
  assert.equal(out.layers.L4.status,"VIRTUAL_VIEWS_READY");
  assert.equal(out.layers.L5.status,"HOLD");
  assert.equal(out.views.length,3);
  assert.ok(out.views.every(v=>v.escpos_bytes===0));
  assert.equal(out.v2_consumer_executed,false);
 });
 const paymentEvent=structuredClone(ev);
 const financialNote="PAGO ONLINE (VALOR: 99.00) ID: 456 - COD. P/ CANCELAMENTO: 789";
 paymentEvent.order.observation_rows=[{source_field:"DSOBSCOMANDA",
  value:financialNote,scope_hint:"order",join_proven:true}];
 paymentEvent.snapshot_hash=snapshotHash(paymentEvent.order);
 const paymentFile=path.join(work,"event-payment.json");
 fs.writeFileSync(paymentFile,JSON.stringify(paymentEvent));
 const paymentProduced=spawnSync(process.execPath,[consumer,paymentFile],
  {encoding:"utf8",timeout:20000});
 assert.ok([0,5].includes(paymentProduced.status)&&paymentProduced.stdout,
  "TEST_PAYMENT_CONSUMER_UNAVAILABLE");
 const paymentDecision=JSON.parse(paymentProduced.stdout);
 const paymentDecisionFile=path.join(work,"decision-payment.json");
 fs.writeFileSync(paymentDecisionFile,JSON.stringify(paymentDecision));
 const crypto=require("node:crypto"),digest=x=>crypto.createHash("sha256").update(x).digest("hex");
 const exactClaim={
  schema:"tata.comandas.note-disposition-claim.v1",
  scope:"SHADOW_VIEW_ONLY",classification:"NON_PRODUCTION_SENSITIVE_PAYMENT_CANCEL_METADATA",
  action:"EXCLUDE_FROM_PRODUCTION_TICKETS",source_field:"DSOBSCOMANDA",
  human_review_reference:"human-review:fixture-authorized-20261103",
  order_key_digest:digest(paymentEvent.order_key),
  snapshot_hash:paymentEvent.snapshot_hash.toLowerCase(),
  decision_fingerprint:paymentDecision.fingerprint.toLowerCase(),
  note_content_sha256:digest(financialNote),
  event_file_sha256:digest(fs.readFileSync(paymentFile)),
  decision_file_sha256:digest(fs.readFileSync(paymentDecisionFile))
 };
 const claimPath=path.join(work,"payment-review-claim.json");
 fs.writeFileSync(claimPath,JSON.stringify(exactClaim));
 test("default real-shape financial note retains HOLD without human disposition",()=>{
  const out=run(paymentFile,paymentDecisionFile);
  assert.equal(out.layers.L4.status,"HOLD");
  assert.equal(out.views.length,0);
  assert.equal(out.note_excluded_in_shadow_only,false);
 });
 test("bound finance-only claim preserves original note but excludes it from 3 virtual views",()=>{
  const b1=fs.readFileSync(paymentFile),b2=fs.readFileSync(paymentDecisionFile);
  const out=run(paymentFile,paymentDecisionFile,claimPath);
  assert.equal(out.layers.L1.status,"NATIVE_REVISION_CONSISTENT");
  assert.equal(out.layers.L3.status,"NATIVE_CONTENT_PROVEN");
  assert.equal(out.layers.L4.status,"VIRTUAL_VIEWS_READY");
  assert.equal(out.layers.L5.status,"HOLD");
  assert.equal(out.views.length,3);
  assert.equal(out.note_excluded_in_shadow_only,true);
  assert.equal(out.human_approval_cryptographically_authenticated,false);
  assert.ok(out.views.every(v=>v.escpos_bytes===0));
  assert.equal(JSON.stringify(out).includes(financialNote),false);
  assert.equal(Buffer.compare(fs.readFileSync(paymentFile),b1),0);
  assert.equal(Buffer.compare(fs.readFileSync(paymentDecisionFile),b2),0);
 });
 test("bound finance note yields exactly one sanitized conference, no production output or print",()=>{
  const c=runConferenceOnlyV1(paymentFile,paymentDecisionFile,claimPath);
  assert.equal(c.status,"CONFERENCE_SHADOW_SANITIZED_ONLY_NOT_FOR_PRINT",JSON.stringify(c));
  assert.deepEqual([c.conference.station,c.suppressed_native_production_views],["CONFERENCIA",2]);
  assert.equal(c.finance_note_excluded_in_shadow_only,true);
  assert.equal(c.conference.escpos_bytes,0);
  assert.equal(c.sequence_number,null);
  assert.equal(c.operational_ready,false);
  assert.equal(c.physical_print_authorized,false);
  assert.ok(/^[a-f0-9]{64}$/.test(c.shadow_revision_correlation_sha256));
  assert.equal(c.shadow_revision_correlation_sha256,
    runConferenceOnlyV1(paymentFile,paymentDecisionFile,claimPath).shadow_revision_correlation_sha256);
  assert.equal(JSON.stringify(c).includes(financialNote),false);
 });
 test("without an exact note review, conference-only wrapper fails closed",()=>{
  const c=runConferenceOnlyV1(paymentFile,paymentDecisionFile);
  assert.equal(c.status,"HOLD");
  assert.equal(c.conference,null);
  assert.equal(c.physical_print_authorized,false);
 });
 test("Sushi 1-only payment note yields exactly 2 shadow views, with exact count and no paper",()=>{
  const one=structuredClone(paymentEvent);
  one.order.items=one.order.items.filter(x=>canon(x.CDARVPROD)==="9.30.00.090.00");
  assert.equal(one.order.items.length,1);
  one.snapshot_hash=snapshotHash(one.order);
  const oneEventFile=path.join(work,"one-event-payment.json");
  fs.writeFileSync(oneEventFile,JSON.stringify(one));
  const oneProduced=spawnSync(process.execPath,[consumer,oneEventFile],
   {encoding:"utf8",timeout:20000});
  assert.ok([0,5].includes(oneProduced.status)&&oneProduced.stdout,
   "ONE_ITEM_CONSUMER_UNAVAILABLE");
  const oneDecision=JSON.parse(oneProduced.stdout);
  const oneDecisionFile=path.join(work,"one-decision-payment.json");
  fs.writeFileSync(oneDecisionFile,JSON.stringify(oneDecision));
  const oneClaim={...exactClaim,snapshot_hash:one.snapshot_hash.toLowerCase(),
   decision_fingerprint:oneDecision.fingerprint.toLowerCase(),
   event_file_sha256:digest(fs.readFileSync(oneEventFile)),
   decision_file_sha256:digest(fs.readFileSync(oneDecisionFile))};
  const oneClaimFile=path.join(work,"one-note-review-claim.json");
  fs.writeFileSync(oneClaimFile,JSON.stringify(oneClaim));
  const out=run(oneEventFile,oneDecisionFile,oneClaimFile);
  assert.equal(out.layers.L1.status,"NATIVE_REVISION_CONSISTENT");
  assert.equal(out.layers.L3.status,"NATIVE_CONTENT_PROVEN");
  assert.equal(out.layers.L4.status,"VIRTUAL_VIEWS_READY");
  assert.equal(out.layers.L4.view_count,2);
  assert.equal(out.layers.L4.production_view_count,1);
  assert.equal(out.layers.L4.conference_view_count,1);
  assert.deepEqual(out.layers.L4.stations,["DELIVERY SUSHI 1","CONFERENCIA"]);
  assert.equal(out.views.length,2);
  assert.equal(out.layers.L5.status,"HOLD");
  assert.equal(out.note_excluded_in_shadow_only,true);
  assert.ok(out.views.every(v=>v.escpos_bytes===0));
  assert.equal(JSON.stringify(out).includes(financialNote),false);
 });
 test("copied unreviewed claim or changed native file byte fails before replay",()=>{
  const bad={...exactClaim,event_file_sha256:"0".repeat(64)};
  const badPath=path.join(work,"bad-payment-review-claim.json");
  fs.writeFileSync(badPath,JSON.stringify(bad));
  assert.throws(()=>run(paymentFile,paymentDecisionFile,badPath),/NOTE_DISPOSITION_INPUT_FILE_DIGEST_MISMATCH/);
  const altered=structuredClone(paymentEvent);
  altered.order.items[0].QTPRODCOMVEN="9.000";
  const alteredPath=path.join(work,"altered-event-payment.json");
  fs.writeFileSync(alteredPath,JSON.stringify(altered));
  assert.throws(()=>run(alteredPath,paymentDecisionFile,claimPath),/NOTE_DISPOSITION_INPUT_FILE_DIGEST_MISMATCH/);
 });
 test("modified native revision cannot be used with old V2 decision",()=>{
  const corrupt=structuredClone(ev);
  corrupt.order.items[0].QTPRODCOMVEN="2.000";
  const p=path.join(work,"event-tampered.json");fs.writeFileSync(p,JSON.stringify(corrupt));
  const out=run(p,decisionFile);
  assert.equal(out.status,"HOLD");
  assert.equal(out.layers.L1.status,"HOLD");
  assert.equal(out.views.length,0);
 });
 test("tampered V2 decision fingerprint cannot project any view",()=>{
  const wrong=structuredClone(decision);wrong.fingerprint="f".repeat(64);
  const p=path.join(work,"decision-tampered.json");fs.writeFileSync(p,JSON.stringify(wrong));
  const out=run(eventFile,p);
  assert.equal(out.status,"HOLD");assert.equal(out.views.length,0);
 });
 test("modified bundle code blocks before any data read",()=>{
  fs.appendFileSync(path.join(output,"src/production/nativeReaderChainV1.ts"),"\n");
  assert.throws(()=>run(eventFile,decisionFile),/BUNDLE_FILE_DRIFT/);
  assert.throws(()=>runConferenceOnlyV1(eventFile,decisionFile),/BUNDLE_FILE_DRIFT/);
 });
}finally{fs.rmSync(work,{recursive:true,force:true})}
process.stdout.write("COMANDAS_SHADOW_BUNDLE_V1="+count+"/"+count+" PASS PAIR_ONLY\n");
