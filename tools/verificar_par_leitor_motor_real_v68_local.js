"use strict";
/** Synthetic v1 stable-event/decision envelope built from a historical 04/10
 * order fixture. Tests interface compatibility, NOT a captured live event.
 * Does not read SQL, reader folders, printers or installed service.
 */
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),
 crypto=require("node:crypto");
const {archivedCompleteInput}=require("./verificar_real_order_tickets_v46.js");
const {run}=require("./gerar_tres_vias_par_leitor_v68_offline.js");
const motorPath=process.argv[2];
if(!motorPath||process.argv.length!==3)
 throw Error("USAGE: node tools/verificar_par_leitor_motor_real_v68_local.js <exact-pinned-motor-path>");
const fixture=archivedCompleteInput();
const catalog={
 "COMBINADO KIDS":"0000001705","EDAMAME":"0000001430",
 "NASU NO MISSO":"0000001418","SUSHI DE UNAGUI":"0000001535",
};
const classifications={
 "COMBINADO KIDS":{family:"combinado",station:"enrolados_quentes",review_required:false},
 "EDAMAME":{family:"entrada",station:"cozinha_quentes",review_required:false},
 "NASU NO MISSO":{family:"entrada",station:"cozinha_quentes",review_required:false},
 "SUSHI DE UNAGUI":{family:"dupla",station:"duplas",review_required:false},
};
const orderTime="2026-10-04T22:58:50-03:00";
const items=fixture.source_items;
const service={service:"LUNCH",evidence:"HUMAN_CONFIRMED_RULE",
 source_ref:"historical-04-10:synthetic-current-lunch-replay-not-historical-shift",blockers:[]};
const hash="c".repeat(64);
const event={schema:"deliveryos.tata-reader-stable-order-event.v1",
 order_key:"SYNTHETIC_REPLAY_04_10_0000348850",snapshot_hash:hash,
 observed_at:orderTime,ready_for_downstream_shadow:true,blockers:[],
 service_resolution:structuredClone(service),order:{
 CDFILIAL:"0001",CDLOJA:"01",NRCOMANDA:"0000348850",
 NRCOMANDAEXT:"9627",IDORGCMDVENDA:"DLV_IFO",
 items:items.map((s,i)=>({
  NRPRODCOMVEN:String(i+1).padStart(6,"0"),
  CDPRODUTO:catalog[s.product_name],
  CDARVPROD:s.product_code.replace(/\./g,""),
  QTPRODCOMVEN:s.quantity+".000",IDSTPRCOMVEN:"A"}))}};
const targetsFor=s=>fixture.production_plan.print_intents.flatMap(intent=>
 intent.lines.some(l=>l.item_index===s.item_index)?
 [{printer_code:intent.printer.printer_code,printer_name:intent.printer.printer_name}]:[]);
const decision={schema:"deliveryos.live-shadow-decision.v1",
 order_key:event.order_key,snapshot_hash:hash,
 ifood_sequence:"9627",teknisa_sequence:"0000348850",service:structuredClone(service),
 ready:true,blocking_reasons:[],
 items:items.map((s,i)=>({item_index:i+1,CDPRODUTO:catalog[s.product_name],
  canonical_code:s.product_code,product_name:s.product_name,quantity:s.quantity,
  routing_status:"ROUTED",targets:targetsFor(s),
  classification:classifications[s.product_name],
  classification_source:"SYNTHETIC_REPLAY_CLASSIFICATION_V65"})),
 packaging:{has_unknown:false,total_items:items.reduce((a,s)=>a+s.quantity,0)},
 kits:{status:"FACT"},sequence:{shadow_candidate:"001",binding_written:false},
 rule_lineage:{academy_rule_refs:["SYNTHETIC_REPLAY_PINNED_CURRENT_MOTOR"],
  delivery_rule_refs:["SYNTHETIC_REPLAY_ARCHIVED_PRINT_PLAN"]}};
const core={order_key:decision.order_key,snapshot_hash:decision.snapshot_hash,
 ifood_sequence:decision.ifood_sequence,teknisa_sequence:decision.teknisa_sequence,
 service:decision.service,items:decision.items,packaging:decision.packaging,
 kits:decision.kits,sequence:decision.sequence};
decision.fingerprint=crypto.createHash("sha256").update(JSON.stringify(core)).digest("hex");
const delivery={pedido_interno:fixture.id,pedido_externo:"9627",
 items:items.map(s=>({item_index:s.item_index,codigo:s.product_code,
  nome:s.product_name,quantidade:s.quantity,observacoes:s.observations})),
 order_observations:[]};
const production={join_key_proof:"DLV_NRCOMANDA_PROVEN",
 pedido_interno_from_dlv:fixture.id,
 lines:fixture.production_plan.print_intents.flatMap(intent=>intent.lines.map(l=>({
  nome:l.product_name,quantidade:l.quantity,tx_prod_com_ven:[],
  printer_key:intent.printer.printer_code})))};
const enriched={schema:"deliveryos.reconciled-reader-pair-proof.v68.offline",
 delivery,production,production_plan:fixture.production_plan,
 current_product_identities:items.map(s=>({
  item_index:s.item_index,product_code:s.product_code,product_name:s.product_name,
  quantity:s.quantity,classification:{family:classifications[s.product_name].family,
   station:classifications[s.product_name].station},
  packaging_role:s.product_name==="COMBINADO KIDS"?"CLOSED_COMBO":"OTHER",
  station_proof:"CURRENT_MOTOR_PROVEN",
  proof:"CURRENT_PRODUCT_IDENTITY_CROSSWALK_PROVEN",
  source_ref:"SYNTHETIC_ARCHIVED_REPLAY_INPUT:"+catalog[s.product_name]})),
 item_observation_proofs:items.map(s=>({
  item_index:s.item_index,canonical_code:s.product_code,
  status:"PROVEN_NONE_FOR_THIS_ITEM",source_ref:"SANITIZED_HISTORY_20261005:EXACT_ORDER",
  snapshot_hash:hash,delivery_observations:[],production_observations:[]}))};
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-v68-synthetic-pair-input-"));
const files=[["event.json",event],["decision.json",decision],["proof.json",enriched]]
 .map(([name,data])=>{const p=path.join(temp,name);fs.writeFileSync(p,JSON.stringify(data,null,2));return p});
const result=run(["--event",files[0],"--decision",files[1],
 "--proof",files[2],"--motor",motorPath]);
if(!result.ok)throw Error("SYNTHETIC_EVENT_TO_PROOF_REPLAY_BLOCKED");
if(result.manifest.outputs.map(x=>x.boxes).join(",")!=="2,4,6")
 throw Error("ARCHIVED_MOTOR_BOX_COUNT_REGRESSION");
console.log("STABLE_EVENT_TO_REAL_MOTOR_V68=PASS SYNTHETIC/ARCHIVED ONLY; NO LIVE EVENT READ");
