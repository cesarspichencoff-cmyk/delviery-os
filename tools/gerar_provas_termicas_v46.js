"use strict";
/* Produce offline text and ESC/POS binary samples from the pinned historical
 * real-order evidence. NEVER opens a printer, TCP endpoint or spooler.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { archivedResult, partiallyKnownResult } = require("./verificar_real_order_tickets_v46.js");
const { renderOperationalTicketsProofV46 } = require("../dist/src/production/operationalTicketEscposV46.js");

function safeFile(name) {
  return name.replace(/[^a-z0-9_-]/gi,"_");
}
function make() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(),"tata-v46-offline-"));
  const complete = renderOperationalTicketsProofV46(archivedResult());
  const partial = renderOperationalTicketsProofV46(partiallyKnownResult());
  const expected = [...complete.production, complete.conference];
  if (!expected.every((x) => x.ready_for_offline_preview &&
       x.ready_for_operational_print === false && x.effects.print === false &&
       x.effects.cut === false && x.bytes.length)) {
    throw new Error("COMPLETE_ORDER_PROOF_GATE_FAILED");
  }
  const records = [];
  for (const [index, result] of expected.entries()) {
    const name = safeFile(String(index+1).padStart(2,"0")+"-"+result.name);
    const buffer = Buffer.from(result.bytes);
    const bin = name+".escpos";
    const txt = name+".txt";
    fs.writeFileSync(path.join(target,bin),buffer);
    fs.writeFileSync(path.join(target,txt),result.text_trace+"\n","utf8");
    records.push({
      name:result.name, file:bin, text:txt,
      bytes:buffer.length, sha256:createHash("sha256").update(buffer).digest("hex"),
      profile:result.profile,
      can_send_to_real_printer:false,
    });
  }
  const manifest = {
    schema:"deliveryos.tata-v46-offline-real-order-proof.v1",
    source_refs:[
      "data/tata_reader_real_order_expected_route_cdarvprod_20261005_v1.json",
      "data/tata_reader_real_order_packaging_reference_20261005_v3.json",
      "data/tata_reader_real_order_unified_replay_success_20261005_v2.json",
      "data/tata_reader_real_order_observation_sanitized_20261005_v1.json",
    ],
    real_order_date:"2026-10-04",
    proof_replayed_on:"2026-10-08",
    sequence:"001_isolated_replay_not_live",
    outer_bag:"1_SACOLA_G_measured_exact_case_only",
    jobs:records,
    other_real_order:{
      evidence:"data/tata_reader_post_cutover_first_live_order_20261005_v1.json",
      status:"NOT_RENDERABLE_FOR_PHYSICAL_TEST",
      reasons:partial.conference.blocking_reasons,
      incomplete_packaging:partial.conference.text_trace.includes("EMBALAGEM A CONFERIR"),
    },
    physical_print_observed:false,
    cut_sent:false,
    spooler_written:false,
    printer_calibrated:false,
    figma_pixel_parity_proven:false,
    operational_print_authorized:false,
  };
  fs.writeFileSync(path.join(target,"manifest.json"),JSON.stringify(manifest,null,2)+"\n","utf8");
  console.log("OFFLINE_PROOF_DIR="+target);
  console.log("JOBS="+records.length);
  console.log("OTHER_ORDER_BLOCKED="+(!partial.conference.ready_for_offline_preview));
  return manifest;
}
if (require.main === module) make();
module.exports={make};
