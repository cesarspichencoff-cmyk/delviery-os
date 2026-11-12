"use strict";
/**
 * STRICT READ-ONLY pair replay. Takes an archived watcher event and its
 * pre-existing V2 decision, both from an approved source. DOES NOT execute
 * V7.14: that legacy consumer has an absolute Windows sequence-state read.
 * Never generates paper, changes files, touches services, SQL, or sequences.
 * Live source freshness and independent authority are always UNATTESTED.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const ROOT=path.resolve(__dirname,"..");
const {verify}=require("./comandas_shadow_bundle_v1.cjs");
const {runNativeChainV1}=require("./comandas_cadeia_nativa_v1_offline.cjs");
const DATA={
 routing:"data/odhen_product_routing_compact_v1.json",
 printers:"data/runtime_printer_map_v1.json",
 calibration:"data/production_printer_calibration_registry_v1.json",
 equivalence:"data/comandas_catalog_equivalence_v1.json",
 kits:"data/comandas_kit_rules_human_v1.json",
 attesters:"data/tata_sequence_attesters_v1.json",
 motor:"tools/fixtures/canonical-packaging-v63-pinned.js"
};
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const readJson=p=>JSON.parse(fs.readFileSync(p,"utf8"));
function source(filename,limit){
 if(!path.isAbsolute(filename))throw Error("SOURCE_PATH_MUST_BE_ABSOLUTE");
 const x=fs.lstatSync(filename);
 if(!x.isFile()||x.isSymbolicLink()||x.size<1||x.size>limit)
  throw Error("SOURCE_NOT_REGULAR_OR_LIMIT");
 return fs.readFileSync(filename);
}
function readSourceJSON(filename,limit){
 const b=source(filename,limit);
 return {record:JSON.parse(b.toString("utf8")),hash:sha(b),
  raw_json:b.toString("utf8")};
}
function run(eventPath,decisionPath,reviewClaimPath){
 const proof=verify(ROOT);
 const {record:event,hash:eventSha,raw_json:eventRaw}=readSourceJSON(eventPath,2000000);
 const {record:decision,hash:decisionSha,raw_json:decisionRaw}=readSourceJSON(decisionPath,3000000);
 if(event.schema!=="deliveryos.tata-reader-stable-order-event.v1"||
   decision.schema!=="deliveryos.live-shadow-decision.v1"||
   typeof event.order_key!=="string"||
   !/^[a-f0-9]{64}$/i.test(String(event.snapshot_hash))||
   !event.order||!Array.isArray(event.order.items))
  throw Error("NATIVE_PAIR_SCHEMA_INVALID");
 // One private human-disposition record, tied to these EXACT source file
 // bytes. It is NOT an authenticated production or print permission.
 let reviewClaim=null;
 if(reviewClaimPath!==undefined){
  const claim=readSourceJSON(reviewClaimPath,8192).record;
  if(claim.event_file_sha256!==eventSha||claim.decision_file_sha256!==decisionSha)
   throw Error("NOTE_DISPOSITION_INPUT_FILE_DIGEST_MISMATCH");
  reviewClaim=claim;
 }
 // Pure evaluator validates four-part key, exact snapshot and V8.57 fingerprint.
 // No trust is conferred by a label or by a matching self-declared source hash.
 const out=runNativeChainV1({
  event,decision,note_disposition_claim:reviewClaim,
  // The existing reader already fetched the two exact source files. Pass
  // their text in memory only for a SHADOW note disposition: the chain checks
  // both actual file hashes AND semantic equality before excluding any note.
  // No source content leaves this runner's sanitized output.
  note_source_file_pair:reviewClaim?{event_json:eventRaw,decision_json:decisionRaw}:undefined,
  routing:readJson(path.join(ROOT,DATA.routing)),
  printer_map:readJson(path.join(ROOT,DATA.printers)),
  calibration:readJson(path.join(ROOT,DATA.calibration)),
  catalog_equivalence:readJson(path.join(ROOT,DATA.equivalence)),
  kit_rules:readJson(path.join(ROOT,DATA.kits)),
  sequence_attesters:readJson(path.join(ROOT,DATA.attesters)),
  motor_source:fs.readFileSync(path.join(ROOT,DATA.motor))
 });
 if(out.physical_effect_authorized!==false||Object.values(out.effects).some(x=>x!==false)||
   out.views.some(x=>x.escpos_bytes!==0)||out.layers.L5?.tata_number)
  throw Error("NO_PRINT_OR_LIVE_SEQUENCE_INVARIANT");
 const codes=a=>Array.isArray(a)?a.filter(x=>/^[A-Z0-9_:.+-]{3,130}$/.test(String(x))).slice(0,35):[];
 const layers={};
 for(const [k,v] of Object.entries(out.layers))
  layers[k]={status:v.status,reasons:codes(v.reasons)};
 if(out.layers.L4){
  const v=out.layers.L4;
  layers.L4.view_count=Number.isInteger(v.view_count)?v.view_count:out.views.length;
  layers.L4.production_view_count=Number.isInteger(v.production_view_count)?v.production_view_count:0;
  layers.L4.conference_view_count=Number.isInteger(v.conference_view_count)?v.conference_view_count:0;
  layers.L4.stations=Array.isArray(v.stations)?v.stations.filter(s=>typeof s==="string"&&
    /^(?:COZINHA|CONFERENCIA|DELIVERY SUSHI [12]|BALCAOSUSHI[12])$/.test(s)):[];
 }
 return {schema:"tata.comandas.shadow-sanitized-result.v1",
  status:out.layers.L1?.status==="NATIVE_REVISION_CONSISTENT"?"SHADOW_PAIR_REPLAYED":"HOLD",
  bundle_manifest_sha256:proof.manifest_sha256,
  native_event_sha256:eventSha,v2_decision_sha256:decisionSha,
  event_source_freshness:"UNATTESTED_EXTERNAL_INPUT",
  v2_consumer_executed:false,independent_origin_attested:false,
  layers,note_excluded_in_shadow_only:out.layers.L4?.note_disposition==="EXCLUDED_FOR_SHADOW_ONLY",
  human_approval_cryptographically_authenticated:false,
  views:out.views.map(x=>({kind:x.kind,station:x.station,
    item_lines:x.lines,escpos_bytes:x.escpos_bytes,text_trace_sha256:x.text_trace_sha256})),
  effects:{print:false,spooler:false,sql:false,service:false,sequence_write:false}};
}
if(require.main===module){
 try{
  if(process.argv.length!==4&&process.argv.length!==5)
   throw Error("USAGE_ABSOLUTE_EVENT_DECISION_OPTIONAL_NOTE_REVIEW_PATH");
  process.stdout.write(JSON.stringify(run(process.argv[2],process.argv[3],process.argv[4]))+"\n");
 }catch(_error){
  // Never reveal exception messages: filesystem errors can include source paths,
  // and upstream messages may carry customer or order information.
  process.stderr.write("SHADOW_PAIR_HOLD\n");
  process.exitCode=1;
 }
}
module.exports={run};
