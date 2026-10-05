"use strict";
const assert=require("node:assert/strict");
const {buildReportSourceEnvelope}=require("../runtime/reporting/report_source_envelope_v1.cjs");

const event={
  schema:"deliveryos.tata-reader-stable-order-event.v1",
  order_key:"0001|01|0000349363|0000348932",
  snapshot_hash:"ABC123",
  observed_at:"2026-10-05T18:10:00-03:00",
  order:{
    CDFILIAL:"0001",CDLOJA:"01",NRVENDAREST:"0000349363",NRCOMANDA:"0000348932",
    NRCOMANDAEXT:"8332",IDORGCMDVENDA:"DLV_IFO",IDSTCOMANDA:"X",
    DTHRABERMESA:"2026-10-05T14:39:57-03:00",
    items:[{NRPRODCOMVEN:"000001",CDPRODUTO:"9050508000",CDARVPROD:"9050508000",QTPRODCOMVEN:"2.000",IDSTPRCOMVEN:"4"}]
  },
  service_resolution:{service:"LUNCH",evidence:"HUMAN_CONFIRMED_RULE",blockers:[]},
  ready_for_downstream_shadow:true,
  blockers:[],
  effects:{database_read:true}
};
const decision={
  schema:"deliveryos.live-shadow-decision.v1",
  ready:true,blocking_reasons:[],fingerprint:"FP1",snapshot_hash:"ABC123",
  order_key:"0001|01|0000349363|0000348932",ifood_sequence:"8332",teknisa_sequence:"0000348932",
  service:event.service_resolution,items:[],packaging:null,kits:null,sequence:{shadow_candidate:"001",binding_written:false},
  effects:{database_write:false,print:false,fiscal_action:false}
};

const a=buildReportSourceEnvelope(event,decision,{generatedAt:"2026-10-05T18:11:00-03:00"});
const b=buildReportSourceEnvelope(event,decision,{generatedAt:"2026-10-05T18:12:00-03:00"});
assert.equal(a.schema,"tata.delivery-report-source-envelope.v1");
assert.equal(a.specversion,"1.0");
assert.equal(a.source,"deliveryos://caixa-mooca/0001/01");
assert.equal(a.id,b.id);
assert.equal(a.identity.nr_comanda_ext,"8332");
assert.equal(a.privacy.customer_pii_persisted,false);
assert.equal(a.effects.print,false);
assert.equal(a.effects.fiscal_action,false);
assert.equal(Object.hasOwn(a.source_event.order,"customer_name"),false);
assert.throws(
  ()=>buildReportSourceEnvelope(event,{...decision,snapshot_hash:"OTHER"}),
  /REPORT_ENVELOPE_SNAPSHOT_MISMATCH/
);
assert.throws(
  ()=>buildReportSourceEnvelope(event,{...decision,order_key:"OTHER"}),
  /REPORT_ENVELOPE_ORDER_KEY_MISMATCH/
);
console.log("report-source-envelope-v1: ok");
