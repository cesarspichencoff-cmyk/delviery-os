"use strict";
/**
 * V7.30 WINDOWS CI ONLY — fictional fixture, actual pinned V2 executable,
 * existing V6.8 gate, two station outputs and one conference output.
 * Never run on restaurant PCs: creates one synthetic temporary sequence
 * file under an ephemeral GitHub-hosted Windows runner's ProgramData.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),os=require("node:os"),crypto=require("node:crypto");
const gate=require("./gerar_vias_reader_v730_shadow.js");
const {blob}=require("./gerar_tres_vias_par_leitor_v68_offline.js");
const {PACKAGING_SOURCE_BLOB_V63}=require(
 "../dist/src/production/currentPackagingBridgeV63.js");
assert.equal(process.platform,"win32","WINDOWS_CI_ONLY");
assert.equal(process.env.GITHUB_ACTIONS,"true","EPHEMERAL_GITHUB_RUNNER_REQUIRED");
assert.equal(process.env.RUNNER_OS,"Windows","EPHEMERAL_WINDOWS_RUNNER_REQUIRED");
const source=path.join(__dirname,"fixtures","canonical-packaging-v63-pinned.js");
const candidate=path.join(__dirname,"..","runtime","shadow",
 "live_shadow_consumer_v2_candidate_v714.cjs");
assert.equal(blob(fs.readFileSync(source)),PACKAGING_SOURCE_BLOB_V63);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"tata-v730-win-ci-"));
const dir=path.join(tmp,"consumer");fs.mkdirSync(dir);
const seqPath="C:\\ProgramData\\TataComandaReader\\state\\tata-sequence-state.json";
const seqDir=path.dirname(seqPath);
let createdSequence=false;
const json=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+"\n",{flag:"wx"});
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const products=[
 {id:"99001",code:"9.10.05.072.00",name:"SUSHI SALMAO",family:"dupla",
  station:"duplas",route:"00009"},
 {id:"99002",code:"9.20.00.010.00",name:"TEMAKI SALMAO",family:"temaki",
  station:"enrolados",route:"00006"}
];
function make(){
 fs.copyFileSync(source,path.join(dir,"packaging-current.js"));
 fs.copyFileSync(candidate,path.join(dir,"consumer.cjs"));
 const config={
  "app-data.json":{products:[]},
  "routing.json":{schema:"deliveryos.odhen.product-routing.compact.v1",
    products:Object.fromEntries(products.map(p=>[p.code,[p.route]]))},
  "printer-map.json":{schema:"deliveryos.runtime-printer-map.v1",
    mappings:[{printer_code:"00009",printer_name:"WINDOWS_CI_SUSHI"},
      {printer_code:"00006",printer_name:"WINDOWS_CI_ENROLADOS"}]},
  "non-production.json":{schema:"deliveryos.non-production-items.v1",items:{}},
  "product-identity-cache-v1.json":{schema:"deliveryos.product-identity-cache.v1",
    rows:products.map(p=>({CDPRODUTO:p.id,canonical:p.code,NMPRODUTO:p.name}))},
  "product-aliases-v1.json":{schema:"deliveryos.academia-live-product-aliases.v1",
    aliases:products.map(p=>({live_name:p.name,canonical_code:p.code,
      classification:{family:p.family,station:p.station,review_required:false}}))},
  "human-order-overrides-v1.json":{
    schema:"deliveryos.human-exact-order-overrides.v1",orders:[]}
 };
 for(const [name,value] of Object.entries(config))
  json(path.join(dir,name),value);
 const order={
  CDFILIAL:"0001",CDLOJA:"01",NRVENDAREST:"0000000001",
  NRCOMANDA:"0000000001",NRCOMANDAEXT:"1001",IDORGCMDVENDA:"DLV_TEST",
  IDSTCOMANDA:"A",DTHRABERMESA:"2026-10-11T12:00:00.0000000",
  items:products.map((p,i)=>({
    NRPRODCOMVEN:String(i+1).padStart(6,"0"),CDPRODUTO:p.id,
    CDARVPROD:p.code.replace(/\./g,""),QTPRODCOMVEN:"1.000",IDSTPRCOMVEN:"A"
  })),observation_scan_complete:true,observation_rows:[]
 };
 const header=["CDFILIAL","CDLOJA","NRVENDAREST","NRCOMANDA",
  "NRCOMANDAEXT","IDORGCMDVENDA","IDSTCOMANDA","DTHRABERMESA"];
 const raw=["NRPRODCOMVEN","CDPRODUTO","CDARVPROD","QTPRODCOMVEN","IDSTPRCOMVEN"];
 const hashed=Object.fromEntries(header.map(k=>[k,order[k]]));
 hashed.items=order.items.map(p=>Object.fromEntries(raw.map(k=>[k,p[k]])));
 const digest=sha(Buffer.from(JSON.stringify(hashed)));
 const event={schema:"deliveryos.tata-reader-stable-order-event.v1",
  order_key:[order.CDFILIAL,order.CDLOJA,order.NRVENDAREST,order.NRCOMANDA].join("|"),snapshot_hash:digest,
  ready_for_downstream_shadow:true,blockers:[],
  service_resolution:{service:"LUNCH",evidence:"HUMAN_CONFIRMED_RULE",
    source_ref:"fixture:fictional-service-only",blockers:[]},order};
 json(path.join(tmp,"event.json"),event);
 const delivery={pedido_interno:order.NRCOMANDA,pedido_externo:order.NRCOMANDAEXT,
  items:products.map((p,i)=>({item_index:i,codigo:p.code,nome:p.name,
    quantidade:1,observacoes:[]})),order_observations:[]};
 const production={join_key_proof:"DLV_NRCOMANDA_PROVEN",
  pedido_interno_from_dlv:order.NRCOMANDA,
  lines:products.map(p=>({nome:p.name,quantidade:1,
    tx_prod_com_ven:[],printer_key:p.route}))};
 const plan={schema:"deliveryos.production-print-plan.v1",
  order_id:order.NRCOMANDA,ready_for_shadow_payload:true,blocking_reasons:[],
  print_intents:products.map((p,i)=>({
    printer:{printer_name:p.route==="00009"?"WINDOWS_CI_SUSHI":"WINDOWS_CI_ENROLADOS",
      printer_code:p.route},
    intent_fingerprint:String(i+7).repeat(64),
    identifiers:{ifood_sequence:order.NRCOMANDAEXT,
      teknisa_sequence:order.NRCOMANDA,tata_sequence:"001",order_time:"12:00"},
    lines:[{item_index:i,product_code:p.code,product_name:p.name,
      quantity:1,item_observations:[],mount_group_id:"OLD_"+i,
      box_label:i===0?"CX 240":"CX 450",prep_components:[]}]
  }))};
 const identities=products.map((p,i)=>({item_index:i,product_code:p.code,
   product_name:p.name,quantity:1,
   classification:{station:p.station,family:p.family},
   packaging_role:"OTHER",station_proof:"CURRENT_MOTOR_PROVEN",
   proof:"CURRENT_PRODUCT_IDENTITY_CROSSWALK_PROVEN",
   source_ref:"fixture:fictional-current-product:"+p.code}));
 const observationProofs=products.map((p,i)=>({item_index:i,
   canonical_code:p.code,snapshot_hash:digest,
   status:"PROVEN_NONE_FOR_THIS_ITEM",
   source_ref:"fixture:fictional-observation:"+p.id,
   delivery_observations:[],production_observations:[]}));
 const proof={schema:"deliveryos.reconciled-reader-pair-proof.v68.offline",
   delivery,production,production_plan:plan,
   current_product_identities:identities,item_observation_proofs:observationProofs};
 json(path.join(tmp,"proof.json"),proof);
 return event;
}
const argv=["--event",path.join(tmp,"event.json"),
 "--consumer",path.join(dir,"consumer.cjs"),
 "--proof",path.join(tmp,"proof.json"),"--motor",source];
let completed=false;
try{
 assert.ok(!fs.existsSync(seqPath),
   "CI runner already has sequence path; refuse to overwrite existing state");
 fs.mkdirSync(seqDir,{recursive:true});
 json(seqPath,{schema:"deliveryos.tata-sequence-state.v1",next_value:1});
 createdSequence=true;
 const event=make();
 const positive=gate.run(argv);
 assert.equal(positive.ok,true,
  "Windows full V2/V6.8/3-vias gate: "+JSON.stringify(positive.report));
 assert.equal(positive.report.vias.length,3);
 assert.equal(positive.report.status,"SHADOW_THREE_VIAS_IN_MEMORY_NO_PRINT");
 assert.equal(positive.report.effects.print,false);
 assert.equal(positive.report.effects.spooler_write,false);
 assert.equal(positive.report.effects.sequence_binding_write,false);
 assert.equal(positive.report.service_hook_installed,false);
 assert.equal(positive.report.windows_isolation_proven,false);
 console.log("PASS V730 Windows CI real Node subprocess + V6.8 + 3 in-memory vias");
 const eventPath=path.join(tmp,"event.json");
 fs.unlinkSync(eventPath);
 event.ready_for_downstream_shadow=false;
 event.blockers=["SERVICE_STATE_EXPIRED_FOR_ORDER"];
 json(eventPath,event);
 const blocked=gate.run(argv);
 assert.equal(blocked.ok,false);
 assert.deepEqual(blocked.report.reasons,["UPSTREAM_WATCHER_BLOCKED"]);
 assert.deepEqual(blocked.report.vias,[]);
 console.log("PASS V730 Windows CI expired-shift event yields no preview");
 completed=true;
}finally{
 fs.rmSync(tmp,{recursive:true,force:true});
 if(createdSequence)fs.rmSync(seqPath,{force:true});
}
if(completed)console.log("THERMAL_WINDOWS_SINGLE_SHADOW_V730=2/2 NO_SERVICE NO_PRINT");
