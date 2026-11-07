"use strict";
/**
 * P0 private replay — LOCAL ONLY, needs the private TATÁ Academia checkout:
 *   ACADEMIA_ROOT=<path to tata-academia at evolucao/v33-product-pass> \
 *   node tools/comandas_replay_real_privado_p0.cjs
 *
 * Feeds the REAL archived native revisions 9627 and 9092 (ids, items,
 * quantities, native states — already committed in data/) through the ACTUAL
 * V2 consumer candidate with the REAL pinned Academy catalog and motor, the
 * committed Retail routing and printer registry, and the legacy 14/10 daily
 * service-state exactly as the installed watcher reads it; then through the
 * native chain. Prints statuses, reasons, counts and hashes only.
 * Writes only a temporary sandbox that it deletes. No host, SQL, queue or print.
 */
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {spawnSync}=require("node:child_process");
const {snapshotHash}=require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {runNativeChainV1}=require("./comandas_cadeia_nativa_v1_offline.cjs");
const N=require("../dist/src/production/nativeReaderChainV1.js");
const {loadPinnedMotor}=require("./comandas_cadeia_nativa_v1_offline.cjs");
// Catalog-equivalence evidence checked against the REAL catalog: every listed
// entry exists, shares the recorded composition hash and classification, and
// the pinned motor returns byte-identical JSON for each entry (differential).
function verifyEquivalence(eq,app,motorBytes){
 const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
 const byId=new Map(app.products.map(p=>[p.id,p]));
 const {motor}=loadPinnedMotor(motorBytes);
 return eq.records.map(r=>{
  const entries=r.academy_entry_ids.map(id=>byId.get(id));
  const exist=entries.every(Boolean);
  const sameText=exist&&entries.every(e=>sha(Buffer.from(e.descricao,"utf8"))===r.shared.descricao_sha256);
  const sameClass=exist&&entries.every(e=>["family","subfamily","station"]
   .every(k=>e.classification?.[k]===r.shared.classification[k])&&e.classification.review_required===false);
  const outputs=exist?entries.map(e=>{const x=[{product:{nome:r.native_name,classification:e.classification},quantity:1}];
   return JSON.stringify([motor.packComanda(x),motor.kitVerdict(x)]);}):[];
  const sameMotor=outputs.length>1&&outputs.every(o=>o===outputs[0]);
  return {id:r.id,entries_exist:exist,identical_composition:sameText,identical_classification:sameClass,
   identical_motor_output:sameMotor,verified:exist&&sameText&&sameClass&&sameMotor};
 });
}
const ROOT=path.join(__dirname,"..");
const PINS={"data/app-data.json":"d4cc9ba91c850314ffa9bd45fb9dfd1dea3d3c22",
 "lib/packaging-current.js":"3167c309f02a0ad5a84fb43043b8866e3bee873c"};
const blob=b=>crypto.createHash("sha1").update(Buffer.concat([Buffer.from("blob "+b.length+"\0"),b])).digest("hex");
const load=f=>JSON.parse(fs.readFileSync(path.join(ROOT,"data",f),"utf8"));
const canon=v=>{v=String(v).replace(/\./g,"");return v[0]+"."+v.slice(1,3)+"."+v.slice(3,5)+"."+v.slice(5,8)+"."+v.slice(8,10);};

function main(){
 const A=process.env.ACADEMIA_ROOT;
 if(!A)return {status:"SKIPPED",reason:"ACADEMIA_ROOT_NOT_SET_PRIVATE_CATALOG_UNAVAILABLE"};
 const academy={};
 for(const [rel,pin] of Object.entries(PINS)){
  const bytes=fs.readFileSync(path.join(A,rel));
  if(blob(bytes)!==pin)return {status:"HOLD",reason:"ACADEMY_PIN_MISMATCH:"+rel};
  academy[rel]=bytes;
 }
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"tata-p0-private-"));
 try{
  const dir=path.join(temp,"consumer");fs.mkdirSync(dir);
  fs.copyFileSync(path.join(ROOT,"runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs"),path.join(dir,"consumer.cjs"));
  fs.writeFileSync(path.join(dir,"packaging-current.js"),academy["lib/packaging-current.js"]);
  fs.writeFileSync(path.join(dir,"app-data.json"),academy["data/app-data.json"]);
  const put=(f,o)=>fs.writeFileSync(path.join(dir,f),JSON.stringify(o));
  const routing=load("odhen_product_routing_compact_v1.json"),printers=load("runtime_printer_map_v1.json");
  put("routing.json",routing);put("printer-map.json",printers);
  put("non-production.json",load("non_production_delivery_items_v1.json"));
  put("product-aliases-v1.json",{schema:"deliveryos.academia-live-product-aliases.v1",aliases:[]});
  put("human-order-overrides-v1.json",{schema:"deliveryos.human-exact-order-overrides.v1",orders:[]});
  const r9627=load("tata_reader_real_read_cdarvprod_success_20261005_v1.json");
  const n9627=Object.fromEntries(load("tata_reader_real_order_unified_replay_success_20261005_v2.json")
   .production.flatMap(p=>p.lines).map(l=>[l.product_code,l.product_name]));
  const r9092=load("tata_reader_real_read_success_20261003_v1.json");
  const rt9092=load("tata_reader_real_order_expected_route_direct_identity_20261004_v1.json");
  const items9092=r9092.observed_items.map(x=>{const r=rt9092.items.find(v=>v.sql_cdproduto===x.CDPRODUTO);
   return {NRPRODCOMVEN:x.NRPRODCOMVEN,CDPRODUTO:x.CDPRODUTO,CDARVPROD:r.cdarvprod_raw,
    QTPRODCOMVEN:x.QTPRODCOMVEN,IDSTPRCOMVEN:x.IDSTPRCOMVEN};});
  put("product-identity-cache-v1.json",{schema:"deliveryos.product-identity-cache.v1",rows:[
   ...r9627.observed_items.map(x=>({CDPRODUTO:x.CDPRODUTO,canonical:canon(x.CDARVPROD),NMPRODUTO:n9627[canon(x.CDARVPROD)]})),
   ...r9092.observed_items.map((x,i)=>({CDPRODUTO:x.CDPRODUTO,canonical:canon(items9092[i].CDARVPROD),NMPRODUTO:x.NMPRODUTO.trim()}))]});
  const equivalence=load("comandas_catalog_equivalence_v1.json");
  const app=JSON.parse(academy["data/app-data.json"].toString("utf8"));
  const equivalenceChecks=verifyEquivalence(equivalence,app,academy["lib/packaging-current.js"]);
  const equivalenceVerified=equivalence.academy_catalog.git_blob===PINS["data/app-data.json"]&&
   equivalenceChecks.every(c=>c.verified);
  const cases=[["9627",r9627.observed_order,r9627.observed_items],["9092",r9092.observed_order,items9092]];
  const report=[];
  for(const [id,o,items] of cases){
   const order={CDFILIAL:o.CDFILIAL,CDLOJA:o.CDLOJA,NRVENDAREST:o.NRVENDAREST,NRCOMANDA:o.NRCOMANDA,
    NRCOMANDAEXT:o.NRCOMANDAEXT,IDORGCMDVENDA:o.IDORGCMDVENDA,IDSTCOMANDA:o.IDSTCOMANDA,
    DTHRABERMESA:o.DTHRABERMESA,items:structuredClone(items),observation_scan_complete:true,observation_rows:[]};
   const legacy=order.DTHRABERMESA.slice(0,10)!=="2026-10-14"?["SERVICE_STATE_DATE_MISMATCH_ORDER_DATE"]:[];
   const event={schema:"deliveryos.tata-reader-stable-order-event.v1",
    order_key:[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join("|"),snapshot_hash:snapshotHash(order),order,
    service_resolution:{service:null,evidence:"UNKNOWN",source_ref:null,blockers:legacy},
    ready_for_downstream_shadow:legacy.length===0,blockers:legacy};
   const ep=path.join(temp,"event-"+id+".json");fs.writeFileSync(ep,JSON.stringify(event));
   const c=spawnSync(process.execPath,[path.join(dir,"consumer.cjs"),ep],{encoding:"utf8",timeout:20000});
   const decision=JSON.parse(c.stdout);
   const cls=N.classifyConsumerBlockersV1(decision.blocking_reasons,event.blockers);
   const out=runNativeChainV1({event,decision,routing,printer_map:printers,
    calibration:load("production_printer_calibration_registry_v1.json"),
    motor_source:academy["lib/packaging-current.js"],
    catalog_equivalence:equivalenceVerified?equivalence:{records:[]},
    kit_rules:load("comandas_kit_rules_human_v1.json")});
   report.push({order:id,native_header:order.IDSTCOMANDA,
    native_item_states:[...new Set(items.map(x=>x.IDSTPRCOMVEN))],lines:items.length,
    consumer:{ready:decision.ready,content_blockers:cls.content,
     legacy_service_state:cls.legacy_service_state,paired_destination:cls.paired_destination.map(x=>x.canonical_code),
     sequence:cls.sequence},
    layers:Object.fromEntries(Object.entries(out.layers).map(([k,l])=>[k,{status:l.status,reasons:l.reasons}])),
    window:out.layers.L2?.window??null,
    catalog_resolution:out.layers.L3?.catalog_resolution??null,
    kit_rule:out.layers.L3?.kit_rule?.id??null,
    views:out.views.map(v=>({kind:v.kind,station:v.station,lines:v.lines,escpos_bytes:v.escpos_bytes,
     text_trace_sha256:v.text_trace_sha256}))});
  }
  return {status:"PRIVATE_REPLAY_COMPLETE",academy_pins:PINS,
   catalog_equivalence:{verified:equivalenceVerified,checks:equivalenceChecks},report,
   effects:{host:false,sql:false,queue:false,print:false,sequence_write:false}};
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
if(require.main===module)process.stdout.write(JSON.stringify(main(),null,1)+"\n");
module.exports={main};
