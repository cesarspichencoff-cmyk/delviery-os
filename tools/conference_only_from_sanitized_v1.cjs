"use strict";
/**
 * Offline, side-effect-free adapter of the EXISTING sanitized native-chain replay
 * to a single conference descriptor. Never renders or prints a ticket.
 * It is intentionally NOT a production adapter or an authority source.
 *
 * Contract input: tata.comandas.shadow-sanitized-result.v1
 * Contract output: tata.comandas.conference-only-sanitized.v1
 */
const crypto = require("node:crypto");
const SCHEMA = "tata.comandas.conference-only-sanitized.v1";
const SRC = "tata.comandas.shadow-sanitized-result.v1";
const HEX64 = /^[a-f0-9]{64}$/;
const EFFECTS = Object.freeze({print:false, spooler:false, network:false, sql:false,
  sequence_write:false, service:false, fiscal:false, deploy:false});
const STATIONS = new Set(["COZINHA", "DELIVERY SUSHI 1", "DELIVERY SUSHI 2",
  "BALCAOSUSHI1", "BALCAOSUSHI2"]);
const VIEW_KEYS = new Set(["kind", "station", "item_lines", "escpos_bytes", "text_trace_sha256"]);
const isObj = x => x !== null && typeof x === "object" && !Array.isArray(x);
const validHash = x => typeof x === "string" && HEX64.test(x);
const noReasons = x => Array.isArray(x?.reasons) && x.reasons.length === 0;
function output(status, reason, conference=null, suppressed=0, approved=false, shadowCorrelation=null) {
  return {schema:SCHEMA,status,reason,conference,
    suppressed_native_production_views:suppressed,
    finance_note_excluded_in_shadow_only:approved,
    shadow_revision_correlation_sha256:shadowCorrelation,
    sequence_number:null,live_sequence_attested:false,
    first_native_dispatch_proven:false,physical_print_authorized:false,
    operational_ready:false,escpos_bytes:0,effects:EFFECTS};
}
function hold(reason){return output("HOLD",reason);}
function projectConferenceFromSanitizedReplayV1(src) {
  // Validate the exact established sanitized runner shape, not a fresh claim.
  if (!isObj(src) || src.schema !== SRC || src.status !== "SHADOW_PAIR_REPLAYED" ||
      !validHash(src.bundle_manifest_sha256) ||
      !validHash(src.native_event_sha256) || !validHash(src.v2_decision_sha256) ||
      src.event_source_freshness !== "UNATTESTED_EXTERNAL_INPUT" ||
      src.v2_consumer_executed !== false ||
      src.independent_origin_attested !== false ||
      src.human_approval_cryptographically_authenticated !== false ||
      !isObj(src.effects) || !["print","spooler","sql","service","sequence_write"].every(k=>src.effects[k]===false) ||
      Object.values(src.effects).some(x=>x!==false))
    return hold("SANITIZED_REPLAY_PROVENANCE_OR_EFFECTS_INVALID");
  const L=src.layers;
  if (!isObj(L) || L.L1?.status !== "NATIVE_REVISION_CONSISTENT" ||
      L.L2?.status !== "NATIVE_ORDER_TIME_WINDOW" ||
      L.L3?.status !== "NATIVE_CONTENT_PROVEN" ||
      L.L4?.status !== "VIRTUAL_VIEWS_READY" ||
      ![L.L1,L.L2,L.L3,L.L4].every(noReasons))
    return hold("CHAIN_CONTENT_OR_VIRTUAL_VIEWS_HOLD");
  if (L.L5?.status !== "HOLD" || !Array.isArray(L.L5.reasons) ||
      L.L5.reasons.length < 1 || L.L5.reasons.some(x=>typeof x!=="string"||x.length<3) ||
      (Object.hasOwn(L.L5, "tata_number") && L.L5.tata_number != null))
    return hold("LIVE_SEQUENCE_NOT_AN_OFFLINE_SHADOW_RESULT");
  if (typeof src.note_excluded_in_shadow_only !== "boolean")
    return hold("NOTE_REVIEW_SIGNAL_MISSING");
  const v=src.views,l4=L.L4;
  if (!Array.isArray(v) || !Array.isArray(l4.stations) ||
      v.length < 2 || v.length > 6 || l4.stations.length !== v.length ||
      l4.view_count !== v.length || l4.production_view_count !== v.length-1 ||
      l4.conference_view_count !== 1 || new Set(l4.stations).size !== v.length)
    return hold("VIEW_COUNT_OR_STATION_LIST_INVALID");
  let conference=null, production=0;
  for(let i=0;i<v.length;i++) {
    const x=v[i];
    if (!isObj(x) || Object.keys(x).some(k=>!VIEW_KEYS.has(k)) ||
        x.station !== l4.stations[i] || !Number.isSafeInteger(x.item_lines) ||
        x.item_lines < 1 || x.item_lines > 10000 || x.escpos_bytes !== 0 ||
        !validHash(x.text_trace_sha256))
      return hold("VIEW_NOT_SANITIZED_OR_BYTES_PRESENT");
    if (x.kind === "CONFERENCIA" && x.station === "CONFERENCIA") {
      if (conference) return hold("DUPLICATE_CONFERENCE");
      conference=x;
    } else if (x.kind === "PRODUCAO" && STATIONS.has(x.station)) {
      production++;
    } else return hold("UNEXPECTED_STATION_OR_VIEW_KIND");
  }
  if (conference === null || production !== v.length-1)
    return hold("CONFERENCE_AND_PRODUCTION_PARTITION_FAILED");
  // Stable for the identical EVENT+DECISION revision across bundle updates.
  // This is an opaque SHADOW correlation, never an operational order key,
  // a deduplication receipt, an attestation, or a first-dispatch witness.
  const shadowCorrelation=crypto.createHash("sha256").update(
    "TATA-CONFERENCE-SHADOW-REVISION-V1\0"+
    src.native_event_sha256+":"+src.v2_decision_sha256+":"+
    conference.text_trace_sha256,"utf8").digest("hex");
  return output("CONFERENCE_SHADOW_SANITIZED_ONLY_NOT_FOR_PRINT",null,
    {station:"CONFERENCIA", line_count:conference.item_lines,
     text_trace_sha256:conference.text_trace_sha256, escpos_bytes:0},
    production,src.note_excluded_in_shadow_only,shadowCorrelation);
}
module.exports={SCHEMA,EFFECTS,projectConferenceFromSanitizedReplayV1};
