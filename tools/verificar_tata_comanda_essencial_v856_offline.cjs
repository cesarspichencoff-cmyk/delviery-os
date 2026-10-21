"use strict";
const assert=require("node:assert/strict");
const {projectTataComandaEssencial,SCHEMA,EFFECTS}=
 require("./tata_comanda_essencial_v856_offline.cjs");
const copy=x=>JSON.parse(JSON.stringify(x));
const native="0000348850",sale="0000349281",sha="b".repeat(64);
const fixture={
 ifood:{schema:"deliveryos.ifood-paper-observation.v1",store:"001",
  day:"2026-10-20",short_id:"9627",status:"CONFIRMED",
  items_complete:true,capture_ref:"IF_CAPTURE_SAME_ORDER_R001",
  items:[{name:"Combo sushi",quantity:2,notes:["SEM CEBOLINHA","ALERGIA A CAMARAO"]},
   {name:"Temaki salmao",quantity:1,notes:[]}]},
 teknisa_orders:[{schema:"deliveryos.teknisa-native-order-observation.v1",
  store:"001",day:"2026-10-20",origin:"DLV_IFO",
  NRCOMANDAEXT:"9627",NRCOMANDA:native,NRVENDAREST:sale,
  items_complete:true,notes_complete:true,
  items:[{name:"COMBO SUSHI",quantity:2,notes:["sem cebolinha","alergia a camarao"]},
   {name:"Temaki salmao",quantity:1,notes:[]}]}],
 tata_sequence_binding:{
  schema:"tata.comanda.existing-sequence-observation.v1",
  kind:"EXISTING_TATA_SEQUENCE",tata_sequence:"001",
  store:"001",day:"2026-10-20",ifood_short_id:"9627",
  NRCOMANDA:native,NRVENDAREST:sale,
  snapshot_hash:sha,source_ref:"TATA_READER_EXISTING_R001",
  ifood_capture_ref:"IF_CAPTURE_SAME_ORDER_R001"
 }
};
let n=0;
function check(x){
 const r=projectTataComandaEssencial(x);
 assert.equal(r.schema,SCHEMA);assert.deepEqual(r.effects,EFFECTS);
 assert.equal(r.ready_for_operational_print,false);
 assert.equal(r.actual_print_proven,false);
 assert.equal(r.source_attestation_proven,false);
 assert.equal(r.canonical_ifood_uuid_proven,false);
 assert.equal(r.bytes.length,0);
 if(r.status==="HOLD"){
  assert.equal(r.ready_for_offline_preview,false);
  assert.equal(r.preview_lines.length,0);
  assert.equal(r.essential,null);
 }
 return r;
}
function test(name,fn){fn();n++;console.log("PASS "+n+" "+name);}
test("essential preview iFood sequence full product quantity notes present",()=>{
 const r=check(fixture);assert.equal(r.status,"ESSENTIAL_PREVIEW_READY_HOLD");
 assert.equal(r.essential_fields_present,true);
 assert.ok(r.preview_lines.includes("IFOOD 9627 | TATA 001"));
 assert.ok(r.preview_lines.includes("2 X COMBO SUSHI"));
 assert.ok(r.preview_lines.includes("1 X TEMAKI SALMAO"));
 assert.ok(r.preview_lines.includes("  OBS: ALERGIA A CAMARAO"));
});
test("uninvoked motor omits optional fields but keeps essentials",()=>{
 const r=check(fixture);
 for(const k of ["caixa","sacola","kit"])assert.equal(r.optional[k],null);
 assert.equal(r.packaging_ready,false);
 assert.ok(!r.preview_lines.some(line=>/^(CAIXA|SACOLA|KIT):/.test(line)));
 assert.ok(r.preview_lines.some(line=>line.includes("IFOOD 9627 | TATA 001")));
});
test("unverified optional labels do not override an uninvoked motor",()=>{
 const x=copy(fixture);x.packaging={caixa:{status:"PROVEN",label:"750"}};
 assert.equal(check(x).optional.caixa,null);
});
test("synthetic V6.3 motor bridge resolves box bag and kit together",()=>{
 const x=copy(fixture),items=x.ifood.items;
 x.packaging_motor={
  blob_sha:"3167c309f02a0ad5a84fb43043b8866e3bee873c",
  entries:items.map((v,i)=>({source_item_index:i,quantity:v.quantity,
   station_proof:"CURRENT_MOTOR_PROVEN",
   product:{nome:v.name,classification:{station:"sushi"}}})),
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
 const r=check(x);
 assert.equal(r.status,"HOLD");
 assert.equal(r.reason,"PACKAGING_MOTOR_BRIDGE_BLOCKED");
 assert.equal(r.packaging_ready,undefined);
});
test("spoofed motor with exact-looking SHA and fake bytes is refused",()=>{
 const x=copy(fixture);
 x.packaging_motor={entries:[],blob_sha:"3167c309f02a0ad5a84fb43043b8866e3bee873c",
 motor_bytes:Buffer.from("FORGED_MOTOR_BYTES".repeat(8))};
 const r=check(x);
 assert.equal(r.status,"HOLD");
 assert.equal(r.reason,"PACKAGING_MOTOR_BRIDGE_BLOCKED");
});
test("invalid empty iFood identifier blocks",()=>{
 const x=copy(fixture);x.ifood.short_id="";assert.equal(check(x).status,"HOLD");
});
test("missing order item blocks",()=>{
 const x=copy(fixture);x.ifood.items=[];
 assert.equal(check(x).status,"HOLD");
});
test("quantity zero blocks",()=>{
 const x=copy(fixture);x.ifood.items[0].quantity=0;
 assert.equal(check(x).status,"HOLD");
});
test("decimal sold quantity blocks",()=>{
 const x=copy(fixture);x.ifood.items[0].quantity=1.5;
 assert.equal(check(x).status,"HOLD");
});
test("quantity mismatch native blocks",()=>{
 const x=copy(fixture);x.teknisa_orders[0].items[0].quantity=3;
 assert.equal(check(x).status,"HOLD");
});
test("missing native row blocks",()=>{
 const x=copy(fixture);x.teknisa_orders=[];
 assert.equal(check(x).status,"HOLD");
});
test("duplicated short IDs block candidate",()=>{
 const x=copy(fixture);x.teknisa_orders.push(copy(x.teknisa_orders[0]));
 assert.equal(check(x).status,"HOLD");
});
test("wrong day native blocks",()=>{
 const x=copy(fixture);x.teknisa_orders[0].day="2026-10-19";
 assert.equal(check(x).status,"HOLD");
});
test("cancelled order does not show preview",()=>{
 const x=copy(fixture);x.ifood.status="CANCELLED";
 assert.equal(check(x).status,"HOLD");
});
test("contradictory item note blocks",()=>{
 const x=copy(fixture);x.teknisa_orders[0].items[0].notes=["COM CEBOLINHA"];
 assert.equal(check(x).status,"HOLD");
});
test("missing TATA sequence binding blocks",()=>{
 const x=copy(fixture);delete x.tata_sequence_binding;
 assert.equal(check(x).status,"HOLD");
});
test("missing TATA sequence blocks",()=>{
 const x=copy(fixture);x.tata_sequence_binding.tata_sequence="";
 assert.equal(check(x).status,"HOLD");
});
test("two digit sequence never made up by padding",()=>{
 const x=copy(fixture);x.tata_sequence_binding.tata_sequence="1";
 assert.equal(check(x).status,"HOLD");
});
test("four digit sequence never silently truncated",()=>{
 const x=copy(fixture);x.tata_sequence_binding.tata_sequence="0001";
 assert.equal(check(x).status,"HOLD");
});
test("sequence from other native order blocks",()=>{
 const x=copy(fixture);x.tata_sequence_binding.NRCOMANDA="0000349999";
 assert.equal(check(x).status,"HOLD");
});
test("sequence from other native sale blocks",()=>{
 const x=copy(fixture);x.tata_sequence_binding.NRVENDAREST="0000349999";
 assert.equal(check(x).status,"HOLD");
});
test("sequence of other iFood short ID blocks",()=>{
 const x=copy(fixture);x.tata_sequence_binding.ifood_short_id="1111";
 assert.equal(check(x).status,"HOLD");
});
test("sequence from other day blocks",()=>{
 const x=copy(fixture);x.tata_sequence_binding.day="2026-10-19";
 assert.equal(check(x).status,"HOLD");
});
test("sequence from other store blocks",()=>{
 const x=copy(fixture);x.tata_sequence_binding.store="999";
 assert.equal(check(x).status,"HOLD");
});
test("unknown TATA snapshot hash blocks",()=>{
 const x=copy(fixture);x.tata_sequence_binding.snapshot_hash="UNVERIFIED";
 assert.equal(check(x).status,"HOLD");
});
test("unlinked iFood capture reference blocks",()=>{
 const x=copy(fixture);x.tata_sequence_binding.ifood_capture_ref="OTHER_CAPTURE";
 assert.equal(check(x).status,"HOLD");
});
test("missing capture reference blocks",()=>{
 const x=copy(fixture);delete x.ifood.capture_ref;
 assert.equal(check(x).status,"HOLD");
});
test("source ref required for sequence",()=>{
 const x=copy(fixture);x.tata_sequence_binding.source_ref="";
 assert.equal(check(x).status,"HOLD");
});
test("fiscal completely missing does not block four essential fields",()=>{
 const x=copy(fixture);x.fiscal_rows=[];
 const r=check(x);assert.equal(r.status,"ESSENTIAL_PREVIEW_READY_HOLD");
 assert.ok(r.preview_lines.includes("IFOOD 9627 | TATA 001"));
});
test("A DEFINIR not allowed for any product name",()=>{
 const x=copy(fixture);x.ifood.items[0].name="A DEFINIR";
 x.teknisa_orders[0].items[0].name="A DEFINIR";
 const r=check(x);assert.equal(r.status,"HOLD");
});
test("A DEFINIR not allowed for iFood or sequence",()=>{
 const x=copy(fixture);x.tata_sequence_binding.tata_sequence="A DEFINIR";
 assert.equal(check(x).status,"HOLD");
});
test("no fake valid packet with invalid custom line breaks",()=>{
 const x=copy(fixture);x.ifood.items[0].name="COMBO\nFAKE";
 x.teknisa_orders[0].items[0].name="COMBO\nFAKE";
 assert.equal(check(x).status,"HOLD");
});
test("plain null blocks without exceptions",()=>{
 assert.equal(check(null).status,"HOLD");
});
console.log("TATA_COMANDA_ESSENCIAL_V856="+n+"/"+n+
 " MANDATORY_IFOOD_TATA_PRODUCT_QUANTITY NO_PRINT NO_SEQUENCE_WRITE");
