"use strict";
const assert = require("node:assert/strict");
const {audit,VERSION} = require("./reconciliar_neemo_teknisa_v1.cjs");
const D = "a".repeat(64), E="b".repeat(64), D2="c".repeat(64);
const teknisa=(key="T.10", rev="R1", digest=D,unit="ITAIM")=>
  ({unit_id:unit,origin_code:"DLV_NMO",order_key:key,revision:rev,snapshot_sha256:digest,observed_at:"2026-10-12T15:00:00-03:00"});
const neemo=(id="N.20",rev="V1",unit="ITAIM")=>
  ({unit_id:unit,order_id:id,revision:rev,observed_at:"2026-10-12T15:02:00-03:00"});
const link=(t="T.10",n="N.20",tRev="R1",nRev="V1",unit="ITAIM",hash=D)=>
  ({unit_id:unit,teknisa_order_key:t,teknisa_revision:tRev,teknisa_snapshot_sha256:hash,
    neemo_order_id:n,neemo_revision:nRev,evidence_sha256:E,
    evidence_kind:"independent_source_export"});
const input=(t=[teknisa()],n=[neemo()],l=[link()])=>({schema:VERSION,teknisa:t,neemo:n,links:l});
let ok=0;
function test(name,fn){fn();ok++;console.log("ok "+name);}
test("NI1 explicit snapshot pinned candidate requires outside authentication",()=>{
  const r=audit(input());
  assert.equal(r.candidates_with_exact_pins,1);
  assert.equal(r.status,"REVIEW_ONLY_NOT_WORLD_PROOF");
  assert.equal(r.permits_trip_creation,false);
  assert.equal(r.permits_operational_claim,false);
});
test("NI2 no explicit mapping is UNKNOWN, never match by same number",()=>{
  const r=audit(input([teknisa("123")],[neemo("123")],[]));
  assert.equal(r.candidates_with_exact_pins,0);
  assert.equal(r.unlinked_teknisa,1);
  assert.equal(r.unlinked_neemo,1);
});
test("NI3 wrong unit never crosses stores",()=>{
  const r=audit(input([teknisa("T.10","R1",D,"ITAIM")],[neemo("N.20","V1","PINHEIROS")]));
  assert.equal(r.candidates_with_exact_pins,0);
  assert.equal(r.missing_source,1);
});
test("NI4 revision mismatch blocks without fallbacks",()=>{
  const r=audit(input([teknisa("T.10","R2")],[neemo()]));
  assert.equal(r.candidates_with_exact_pins,0);
  assert.equal(r.missing_source,1);
});
test("NI5 changed quantity/observation fingerprint blocks",()=>{
  const r=audit(input([teknisa("T.10","R1",D2)],[neemo()]));
  assert.equal(r.candidates_with_exact_pins,0);
  assert.equal(r.revision_or_snapshot_drift,1);
});
test("NI6 two revisions create ambiguity rather than guessing latest",()=>{
  const r=audit(input([teknisa("T.10","R1"),teknisa("T.10","R2")],[neemo()]));
  assert.equal(r.candidates_with_exact_pins,0);
  assert.equal(r.revision_or_snapshot_drift,1);
});
test("NI7 two Teknisa orders for the same Neemo refuse a match",()=>{
  const r=audit(input([teknisa("T.10"),teknisa("T.11")],[neemo()],[link(),link("T.11")]));
  assert.equal(r.candidates_with_exact_pins,0);
  assert.equal(r.ambiguous_or_duplicate,2);
});
test("NI8 repeated mapping is not eligible",()=>{
  const r=audit(input([teknisa()],[neemo()],[link(),link()]));
  assert.equal(r.candidates_with_exact_pins,0);
  assert.ok(r.ambiguous_or_duplicate>0);
});
test("NI9 no PII / unknown fields allowed",()=>{
  assert.throws(()=>audit(input([{...teknisa(),phone:"11999999999"}])),/SCHEMA_INVALID/);
  assert.throws(()=>audit(input([teknisa()],[{...neemo(),customer:"Alice"}])),/SCHEMA_INVALID/);
});
test("NI10 invalid evidence type never accepted",()=>{
  const l={...link(),evidence_kind:"timestamp_similarity"};
  assert.throws(()=>audit(input([teknisa()],[neemo()],[l])),/LINK_EVIDENCE_KIND_INVALID/);
});
test("NI11 no order IDs appear in aggregate output",()=>{
  const r=audit(input([teknisa("SECRET.TEK")],[neemo("SECRET.NEE")],[link("SECRET.TEK","SECRET.NEE")]));
  assert.doesNotMatch(JSON.stringify(r),/SECRET|order_key|order_id|snapshot_sha256|observed_at/);
});
test("NI12 no link authorized to start Trip, print or claim operations",()=>{
  const r=audit(input());
  assert.equal(r.permits_trip_creation,false);
  assert.equal(r.permits_printing,false);
  assert.equal(r.permits_operational_claim,false);
});
test("NI13 codigo de origem iFood nao pode entrar em vinculacao Neemo",()=>{
  assert.throws(
    ()=>audit(input([{...teknisa(),origin_code:"DLV_IFO"}])),
    /TEKNISA_NON_NEEMO_ORIGIN_HOLD/,
  );
});
test("NI14 ForSale tambem nao pode ser promovido a Neemo",()=>{
  assert.throws(
    ()=>audit(input([{...teknisa(),origin_code:"DLV_FOS"}])),
    /TEKNISA_NON_NEEMO_ORIGIN_HOLD/,
  );
});
test("NI15 origem ausente ou inventada falha fechado",()=>{
  const faltando={...teknisa()};delete faltando.origin_code;
  assert.throws(()=>audit(input([faltando])),/SCHEMA_INVALID/);
  assert.throws(
    ()=>audit(input([{...teknisa(),origin_code:"DLV_NMO_FALSO"}])),
    /TEKNISA_NON_NEEMO_ORIGIN_HOLD/,
  );
});
test("NI16 referencia externa sozinha nao valida Neemo",()=>{
  assert.throws(
    ()=>audit(input([{...teknisa(),NRCOMANDAEXT:"123"}])),
    /SCHEMA_INVALID/,
  );
});
console.log("NEEMO_TEK_CORRELATION_REVIEW="+ok+"/16 PASS (SYNTHETIC_ONLY)");
