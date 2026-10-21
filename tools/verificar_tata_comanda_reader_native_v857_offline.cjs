"use strict";
const assert=require("node:assert/strict");
const {projectReaderEssentials,snapshotHash,decisionHash,SCHEMA,EFFECTS}=
 require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const copy=x=>JSON.parse(JSON.stringify(x));
const {createHash}=require("node:crypto");
const blob="3167c309f02a0ad5a84fb43043b8866e3bee873c";
function withMotor(x){
 const items=x.decision.items;
 x.packaging_motor={
  blob_sha:blob,
  entries:items.map((v,i)=>({source_item_index:i,quantity:v.quantity,
   station_proof:"CURRENT_MOTOR_PROVEN",
   product:{nome:v.product_name,classification:{station:"sushi"}}})),
  motor:{
   packComanda:entries=>({groups:[{kind:"faixa",station:"sushi",
    box:"750",boxes:1,status:"PROVEN_CURRENT_HUMAN_RULE",
    products:entries.map(e=>({name:e.product.nome,quantity:e.quantity}))}],
    has_unknown:false,total_items:entries.reduce((n,e)=>n+e.quantity,0),
    bags:{size:"P",status:"PROVEN_OPERATIONAL_DOCUMENT",
     size_status:"FACT",exact_bag_count:1,exact_bag_count_status:"FACT"}}),
   kitVerdict:()=>({status:"FACT",kits:[{kit:"Kit p/1",quantidade:1}]})
  }
 };
 return x;
}
function review(x,disposition){
 const notes=x.decision.order_observations;
 x.order_note_disposition={order_key:x.event.order_key,
  snapshot_hash:x.event.snapshot_hash,
  decision_fingerprint:x.decision.fingerprint,
  note_sha256:createHash("sha256").update(JSON.stringify(notes)).digest("hex"),
  reviewer_ref:"REVIEW_FIXTURE_ONLY",disposition};
 return x;
}
function pair(){
 const order={
  CDFILIAL:"0001",CDLOJA:"01",NRVENDAREST:"0000349281",
  NRCOMANDA:"0000348850",NRCOMANDAEXT:"9627",
  IDORGCMDVENDA:"DLV_IFO",IDSTCOMANDA:"A",
  DTHRABERMESA:"2026-10-20T12:31:00.0000000",
  items:[
   {NRPRODCOMVEN:"000001",CDPRODUTO:"0000001111",
    CDARVPROD:"9200001000",QTPRODCOMVEN:"2.000",IDSTPRCOMVEN:"A"},
   {NRPRODCOMVEN:"000002",CDPRODUTO:"0000001112",
    CDARVPROD:"9200002000",QTPRODCOMVEN:"1.000",IDSTPRCOMVEN:"A"}
  ],observation_scan_complete:true,
  observation_rows:[
   {source_field:"DSOBSPEDDIGCMD",value:"SEM CEBOLINHA",
    scope_hint:"item",join_proven:true,item_index:0,CDPRODUTO:"0000001111"},
   {source_field:"TXPRODCOMVEN",value:"ALERGIA A CAMARAO",
    scope_hint:"item",join_proven:true,item_index:0,CDPRODUTO:"0000001111"},
   {source_field:"DSOBSCOMANDA",value:"ENTREGA NA PORTARIA",
    scope_hint:"order",join_proven:true}
  ]
 };
 const key=["0001","01","0000349281","0000348850"].join("|");
 const event={schema:"deliveryos.tata-reader-stable-order-event.v1",
  order_key:key,snapshot_hash:snapshotHash(order),order,
  ready_for_downstream_shadow:false,
  blockers:["SERVICE_STATE_DATE_MISMATCH_ORDER_DATE"],
  service_resolution:{service:null,evidence:"UNKNOWN",source_ref:null,
   blockers:["SERVICE_STATE_DATE_MISMATCH_ORDER_DATE"]}};
 const decision={schema:"deliveryos.live-shadow-decision.v1",
  order_key:key,snapshot_hash:event.snapshot_hash,
  ifood_sequence:"9627",teknisa_sequence:"0000348850",
  ready:false,blocking_reasons:["BAG_SIZE_NOT_FACT","KITS_NOT_FACT"],
  service:event.service_resolution,
  items:[
   {item_index:1,CDPRODUTO:"0000001111",canonical_code:"9.20.00.010.00",
    product_name:"COMBINADO SUSHI",quantity:2,
    observations:[{source_field:"DSOBSPEDDIGCMD",value:"SEM CEBOLINHA"},
     {source_field:"TXPRODCOMVEN",value:"ALERGIA A CAMARAO"}]},
   {item_index:2,CDPRODUTO:"0000001112",canonical_code:"9.20.00.020.00",
    product_name:"TEMAKI SALMAO",quantity:1,observations:[]}
  ],
  order_observations:[{source_field:"DSOBSCOMANDA",value:"ENTREGA NA PORTARIA"}],
  observation_scan_complete:true,
  packaging:{has_unknown:true,total_items:3},kits:{status:"UNKNOWN"},
  sequence:{shadow_candidate:"999",binding_written:false}
 };
 decision.fingerprint=decisionHash(decision);
 const sequence_state={schema:"deliveryos.tata-sequence-state.v1",
  policy:{width:3,min_value:1,max_value:999},next_value:20,
  bindings:[{scope_id:"STORE:0001|DATE:2026-10-20",
   teknisa_order_id:"0000348850",tata_sequence:"007"}]};
 return {event,decision,sequence_state};
}
if(require.main===module){
let n=0;
function test(name,fn){fn();n++;console.log("PASS "+n+" "+name);}
function audit(x){
 const r=projectReaderEssentials(x);
 assert.equal(r.schema,SCHEMA);assert.deepEqual(r.effects,EFFECTS);
 assert.equal(r.ready_for_operational_print,false);
 assert.equal(r.print_authorized,false);
 assert.equal(r.order_source_authenticated,false);
 assert.equal(r.ifood_gp_independently_observed,false);
 assert.equal(r.bytes.length,0);
 if(r.status==="HOLD"){
  assert.equal(r.essential,null);assert.deepEqual(r.preview_lines,[]);
  assert.equal(r.ready_for_offline_preview,false);
 }
 return r;
}
test("native reader pair + persisted sequence yields essential preview",()=>{
 const r=audit(pair());assert.equal(r.status,"SOURCE_NATIVE_ESSENTIAL_PREVIEW_HOLD");
 assert.equal(r.essential.ifood_short_id,"9627");
 assert.equal(r.essential.tata_sequence,"007");
 assert.ok(r.preview_lines.includes("IFOOD 9627 | TATA 007"));
});
test("shadow candidate 999 must not supersede persisted 007",()=>{
 const r=audit(pair());
 assert.equal(r.persisted_sequence_reused,true);
 assert.equal(r.essential.tata_sequence,"007");
 assert.ok(!r.preview_lines.includes("TATA 999"));
});
test("exact product and sold quantity retained",()=>{
 const r=audit(pair());assert.deepEqual(r.essential.items.map(x=>[x.name,x.quantity]),
  [["COMBINADO SUSHI",2],["TEMAKI SALMAO",1]]);
});
test("item allergy and SEM observation never silently removed",()=>{
 const r=audit(pair());
 assert.ok(r.preview_lines.includes("  OBS: SEM CEBOLINHA"));
 assert.ok(r.preview_lines.includes("  OBS: ALERGIA A CAMARAO"));
});
test("unclassified general note is explicitly pending, never silently dropped",()=>{
 const r=audit(pair());
 assert.equal(r.essential.order_observations_review_required,true);
 assert.ok(r.preview_lines.includes("OBS GERAL: CLASSIFICACAO PENDENTE - NAO IMPRIMIR"));
 assert.ok(!JSON.stringify(r.preview_lines).includes("ENTREGA NA PORTARIA"));
 assert.ok(!JSON.stringify(r.essential).includes("ENTREGA NA PORTARIA"));
 assert.equal(r.ready_for_operational_print,false);
});
test("uninvoked motor never generates fallback or invented packing fields",()=>{
 const r=audit(pair());assert.equal(r.ready_for_offline_preview,true);
 assert.equal(r.packaging_ready,false);assert.equal(r.motor_packaging_status,"NOT_EVALUATED");
 for(const k of ["caixa","sacola","kit"])assert.equal(r.optional[k],null);
 assert.ok(!r.preview_lines.some(s=>/^(CAIXA|SACOLA|KIT):/.test(s)));
});
test("forged engine object with valid-looking blob label cannot be trusted",()=>{
 const r=audit(withMotor(pair()));
 assert.equal(r.status,"HOLD");
 assert.equal(r.reason,"PACKAGING_MOTOR_BRIDGE_BLOCKED");
 assert.equal(r.packaging_ready,false);
});
test("wrong motor bytes reject even with exact source blob label",()=>{
 const x=withMotor(pair());
 x.packaging_motor.motor_bytes=Buffer.from("NOT_THE_ACADEMY_MOTOR".repeat(8));
 const r=audit(x);
 assert.equal(r.status,"HOLD");
 assert.equal(r.reason,"PACKAGING_MOTOR_BRIDGE_BLOCKED");
});
test("unverified caller packaging labels never override motor omission",()=>{
 const x=pair();x.packaging={caixa:{status:"PROVEN",label:"999"}};
 const r=audit(x);assert.equal(r.optional.caixa,null);
});
test("unreviewed general instruction allergy cannot be removed",()=>{
 const x=pair();x.event.order.observation_rows[2].value="ALERGIA A AMENDOIM";
 x.decision.order_observations[0].value="ALERGIA A AMENDOIM";
 x.event.snapshot_hash=snapshotHash(x.event.order);
 x.decision.snapshot_hash=x.event.snapshot_hash;
 x.decision.fingerprint=decisionHash(x.decision);
 const r=audit(x);
 assert.equal(r.essential.order_observations_review_required,true);
 assert.ok(r.preview_lines.some(s=>s.includes("CLASSIFICACAO PENDENTE")));
});
test("same-revision production note appears in separate section",()=>{
 const x=pair();x.event.order.observation_rows[2].value="SEM MOLHO";
 x.decision.order_observations[0].value="SEM MOLHO";
 x.event.snapshot_hash=snapshotHash(x.event.order);
 x.decision.snapshot_hash=x.event.snapshot_hash;
 x.decision.fingerprint=decisionHash(x.decision);
 const r=audit(review(x,"PRODUCTION"));
 assert.equal(r.essential.order_observations_review_required,false);
 assert.ok(r.preview_lines.includes("OBS GERAL: SEM MOLHO"));
});
test("explicitly reviewed non-production note excluded from preview",()=>{
 const r=audit(review(pair(),"NON_PRODUCTION"));
 assert.equal(r.essential.order_observations_review_required,false);
 assert.ok(!JSON.stringify(r.preview_lines).includes("ENTREGA NA PORTARIA"));
});
test("stale general-note review cannot silence current snapshot",()=>{
 const x=review(pair(),"NON_PRODUCTION");
 x.order_note_disposition.decision_fingerprint="a".repeat(64);
 const r=audit(x);assert.equal(r.essential.order_observations_review_required,true);
});
test("motor pin mismatch never becomes optional A DEFINIR",()=>{
 const x=withMotor(pair());x.packaging_motor.blob_sha="wrong";
 const r=audit(x);assert.equal(r.status,"HOLD");
 assert.equal(r.reason,"PACKAGING_MOTOR_BRIDGE_BLOCKED");
});
test("legacy old three-part order key rejected",()=>{
 const x=pair();x.event.order_key="0001|01|0000348850";
 assert.equal(audit(x).status,"HOLD");
});
test("missing iFood ID rejected",()=>{
 const x=pair();x.event.order.NRCOMANDAEXT="";
 assert.equal(audit(x).status,"HOLD");
});
test("different iFood ID in decision rejected",()=>{
 const x=pair();x.decision.ifood_sequence="1111";
 assert.equal(audit(x).status,"HOLD");
});
test("foreign store metadata rejected",()=>{
 const x=pair();x.event.order.CDLOJA="02";
 assert.equal(audit(x).status,"HOLD");
});
test("non iFood native origin rejected",()=>{
 const x=pair();x.event.order.IDORGCMDVENDA="DLV_OTHER";
 assert.equal(audit(x).status,"HOLD");
});
test("missing native sale ID rejected",()=>{
 const x=pair();x.event.order.NRVENDAREST="";
 assert.equal(audit(x).status,"HOLD");
});
test("cancelled native order status cannot become usable preview",()=>{
 const x=pair();x.event.order.IDSTCOMANDA="C";
 x.event.snapshot_hash=snapshotHash(x.event.order);
 x.decision.snapshot_hash=x.event.snapshot_hash;
 x.decision.fingerprint=decisionHash(x.decision);
 assert.equal(audit(x).status,"HOLD");
});
test("inactive native item cannot be used in production",()=>{
 const x=pair();x.event.order.items[0].IDSTPRCOMVEN="C";
 x.event.snapshot_hash=snapshotHash(x.event.order);
 x.decision.snapshot_hash=x.event.snapshot_hash;
 x.decision.fingerprint=decisionHash(x.decision);
 assert.equal(audit(x).status,"HOLD");
});
test("changed native product identity rejected even with recomputed hashes",()=>{
 const x=pair();x.event.order.items[0].CDARVPROD="9300001000";
 x.event.snapshot_hash=snapshotHash(x.event.order);
 x.decision.snapshot_hash=x.event.snapshot_hash;
 x.decision.fingerprint=decisionHash(x.decision);
 assert.equal(audit(x).status,"HOLD");
});
test("missing TATA state rejected despite candidate 999",()=>{
 const x=pair();delete x.sequence_state;
 assert.equal(audit(x).status,"HOLD");
});
test("missing persisted assignment rejected",()=>{
 const x=pair();x.sequence_state.bindings=[];
 assert.equal(audit(x).status,"HOLD");
});
test("different day scope cannot reuse 007",()=>{
 const x=pair();x.sequence_state.bindings[0].scope_id="STORE:0001|DATE:2026-10-19";
 assert.equal(audit(x).status,"HOLD");
});
test("different order cannot borrow sequence",()=>{
 const x=pair();x.sequence_state.bindings[0].teknisa_order_id="0000348851";
 assert.equal(audit(x).status,"HOLD");
});
test("duplicate sequence across native orders blocked",()=>{
 const x=pair();x.sequence_state.bindings.push({
  scope_id:"STORE:0001|DATE:2026-10-20",
  teknisa_order_id:"0000349999",tata_sequence:"007"});
 assert.equal(audit(x).status,"HOLD");
});
test("two sequences for the same order blocked",()=>{
 const x=pair();x.sequence_state.bindings.push({
  scope_id:"STORE:0001|DATE:2026-10-20",
  teknisa_order_id:"0000348850",tata_sequence:"008"});
 assert.equal(audit(x).status,"HOLD");
});
test("TATA assignment cannot be one digit",()=>{
 const x=pair();x.sequence_state.bindings[0].tata_sequence="7";
 assert.equal(audit(x).status,"HOLD");
});
test("invalid TATA assignment 000 rejected",()=>{
 const x=pair();x.sequence_state.bindings[0].tata_sequence="000";
 assert.equal(audit(x).status,"HOLD");
});
test("missing product name cannot appear as A DEFINIR",()=>{
 const x=pair();x.decision.items[0].product_name="A DEFINIR";
 assert.equal(audit(x).status,"HOLD");
});
test("empty product name rejected",()=>{
 const x=pair();x.decision.items[0].product_name="";
 assert.equal(audit(x).status,"HOLD");
});
test("raw zero quantity rejects despite decision 1",()=>{
 const x=pair();x.event.order.items[0].QTPRODCOMVEN="0.000";
 assert.equal(audit(x).status,"HOLD");
});
test("raw fractional quantity rejects",()=>{
 const x=pair();x.event.order.items[0].QTPRODCOMVEN="1.5";
 assert.equal(audit(x).status,"HOLD");
});
test("raw nonnumeric quantity rejected",()=>{
 const x=pair();x.event.order.items[0].QTPRODCOMVEN="unknown";
 assert.equal(audit(x).status,"HOLD");
});
test("same hash but swapped items blocked",()=>{
 const x=pair();x.decision.items.reverse();
 assert.equal(audit(x).status,"HOLD");
});
test("V2 item observation altered in decision blocked",()=>{
 const x=pair();x.decision.items[0].observations[0].value="COM CEBOLINHA";
 assert.equal(audit(x).status,"HOLD");
});
test("item observation added only in watcher blocked",()=>{
 const x=pair();x.event.order.observation_rows.push({
  source_field:"DSOBSDESCIT",value:"SEM ALHO",scope_hint:"item",
  join_proven:true,item_index:1,CDPRODUTO:"0000001112"});
 assert.equal(audit(x).status,"HOLD");
});
test("duplicate notes by source blocked",()=>{
 const x=pair();x.event.order.observation_rows.push(copy(x.event.order.observation_rows[0]));
 assert.equal(audit(x).status,"HOLD");
});
test("unjoined notes rejected",()=>{
 const x=pair();x.event.order.observation_rows[0].join_proven=false;
 assert.equal(audit(x).status,"HOLD");
});
test("general note lost in decision blocked",()=>{
 const x=pair();x.decision.order_observations=[];
 assert.equal(audit(x).status,"HOLD");
});
test("changed event revision blocked",()=>{
 const x=pair();x.event.snapshot_hash="a".repeat(64);
 assert.equal(audit(x).status,"HOLD");
});
test("changed decision fingerprint blocked",()=>{
 const x=pair();x.decision.fingerprint="a".repeat(64);
 assert.equal(audit(x).status,"HOLD");
});
test("spoofed item with regenerated decision fingerprint cannot escape event hash",()=>{
 const x=pair();x.decision.items[0].quantity=7;
 x.decision.fingerprint=decisionHash(x.decision);
 assert.equal(audit(x).status,"HOLD");
});
test("no full V2 observation scan means source incomplete",()=>{
 const x=pair();x.event.order.observation_scan_complete=false;
 assert.equal(audit(x).status,"HOLD");
});
test("missing source event pair",()=>{
 const x=pair();delete x.event;assert.equal(audit(x).status,"HOLD");
});
test("null input safe",()=>assert.equal(audit(null).status,"HOLD"));
console.log("TATA_COMANDA_READER_NATIVE_V857="+n+"/"+n+
 " READER_V2_PAIR PERSISTED_TATA_ID EXACT_ITEMS_NOTES NO_PRINT NO_SQL NO_HOST");

}
module.exports={syntheticReaderPairV857:pair};
