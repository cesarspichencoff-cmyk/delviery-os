"use strict";
/**
 * Offline, fake-only TM-T20X Conference night density candidates.
 * No printer, spooler, network, process spawn, driver, NVRAM, service or SQL.
 * Does NOT authorize real jobs or set the TM-T20X global customized density.
 *
 * Manufacturer: TM-T20X supports GS ( K <fn=49> (print density).
 * m=2/4/6: relative 110%/120%/130% of criterion density; actual darkness
 * depends on the current printer setting, paper and thermals. Not calibrated.
 *
 * Optical/production approval is still REQUIRED before any physical reuse.
 */
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {renderConferenceTicketFigmaV48}=require("../dist/src/production/operationalTicketEscposFigmaV48.js");
const {layoutVirtualPaperV1}=require("./comandas_papel_virtual_escpos_v1_offline.cjs");
const digest=bytes=>crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex");
const densityCommand=m=>Buffer.from([0x1d,0x28,0x4b,0x02,0x00,0x31,m]);
const fixtureItem=(i,n,q,notes=[])=>({
  source_item_index:i,product_code:"FICTICIO"+i,quantity:q,
  print_name:n,observations:notes,finishing:[],kitchen_dependencies:[]
});
function fakeConference(){
  return {
    order_id:"SOMENTE-EXEMPLO",revision:1,
    identifiers:{ifood:"TESTE001",teknisa:"FICTICIO01",tata:"001",hour:"19:45"},
    boxes:[
      {position:"C1",model:"750",status:"PROVEN",physical_box_count:1,
       items:[fixtureItem(0,"SUSHI DE SALMÃO",1,["SEM CEBOLINHA"]),
              fixtureItem(1,"URAMAKI CALIFÓRNIA",2)],operator_field:"Op. ________"},
      {position:"C2",model:"450",status:"PROVEN",physical_box_count:1,
       items:[fixtureItem(2,"HOT ROLL",1,["SEM MOLHO"])],
       operator_field:"Op. ________"}
    ],
    items_without_proven_box:[],items_without_physical_box:[],
    bags:[{label:"G",quantity:1}],kits:[{label:"Kit p/2",quantity:1}],
    accompaniments:[{label:"GARI",quantity:1},{label:"TARE",quantity:1}],
    warnings:[],ready_for_semantic_preview:true
  };
}
function previewOnlyDensity(source,m){
  assert.ok([2,4,6].includes(m),"ONLY_DOCUMENTED_RELATIVE_CANDIDATES");
  assert.ok(Buffer.isBuffer(source)&&source.length===701);
  assert.equal(digest(source),"ebd2ec398614aa1ab306e23f2fc359d0168d66af2e9881ee61723d193555a576");
  assert.deepEqual(Array.from(source.subarray(0,2)),[0x1b,0x40],"EXPECTED_ESC_INIT");
  const strong=densityCommand(m),reset=densityCommand(0);
  // ESC @ -> temporary job density -> exact original text -> restore criterion.
  const result=Buffer.concat([source.subarray(0,2),strong,source.subarray(2),reset]);
  assert.equal(result.length,source.length+14);
  assert.ok(result.subarray(2,9).equals(strong));
  assert.ok(result.subarray(result.length-7).equals(reset));
  assert.ok(Buffer.concat([result.subarray(0,2),
    result.subarray(9,result.length-7)]).equals(source),"TEXT_AND_GEOMETRY_IDENTICAL");
  for(let i=0;i+1<result.length;i++)
    assert.ok(!(result[i]===0x1d&&result[i+1]===0x56),"NO_CUT");
  return {m,relative_criterion_multiplier:1+m*0.05,bytes:result.length,
    sha256:digest(result),criterion_restored: true,
    all_original_content_preserved:true,original_layout_preserved:true,
    physical_darkness_verified:false,operational_authority:false};
}
function run(){
  const v=renderConferenceTicketFigmaV48(fakeConference());
  assert.equal(v.ready_for_offline_preview,true);
  assert.equal(v.ready_for_operational_print,false);
  assert.deepEqual(v.blocking_reasons,[]);
  assert.ok(v.text_trace.startsWith("SIMULAÇÃO · NÃO PRODUZIR\nCONFERÊNCIA\n"));
  assert.ok(v.text_trace.includes("iFood #TESTE001")&&v.text_trace.includes("TEKNISA FICTICIO01"));
  const source=Buffer.from(v.bytes);
  const layout=layoutVirtualPaperV1(source);
  assert.deepEqual(layout.errors,[]);
  assert.deepEqual(layout.overflow,[]);
  assert.equal(layout.printable_dots,576);
  assert.equal(layout.lines.length,19);
  assert.equal(digest(source),"ebd2ec398614aa1ab306e23f2fc359d0168d66af2e9881ee61723d193555a576");
  const candidates=[2,4,6].map(m=>previewOnlyDensity(source,m));
  assert.equal(new Set(candidates.map(x=>x.sha256)).size,3);
  assert.ok(candidates.every(c=>c.criterion_restored&&c.original_layout_preserved&&!c.operational_authority));
  return {
    status:"THREE_NIGHT_DENSITY_CANDIDATES_OFFLINE_PASS",
    target_model:"TM-T20X", source:"ALL_SYNTHETIC_CONFERENCE_NOT_REAL_ORDER",
    source_sha256:digest(source),source_bytes:source.length,
    source_modelled_length_mm:layout.length_mm,
    candidates,manufacturer_reference:"EPSON_GS_(K_FN49",
    note:"RELATIVE_TO_UNKNOWN_DEVICE_CRITERION. STRONGEST_NOT_YET_OPTICALLY_ACCEPTED.",
    effects:{print:false,spooler:false,driver_change:false,global_density_change:false,
      service:false,network:false,sql:false,cut:false},
    current_printer_configuration_unchanged:true,
    real_order_integration_authorized:false
  };
}
if(require.main===module)console.log(JSON.stringify(run(),null,2));
module.exports={run,previewOnlyDensity,fakeConference};
