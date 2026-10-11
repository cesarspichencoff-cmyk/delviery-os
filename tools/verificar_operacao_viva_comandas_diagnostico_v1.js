"use strict";
/** Offline-only contract test: never opens a printer, network or live source. */
const assert = require("node:assert/strict");
const { archivedResult, archivedCompleteInput } = require("./verificar_real_order_tickets_v46.js");
const { splitTwoKitchenTicketsV47 } = require("../dist/src/production/twoKitchenTicketsV47.js");
const { buildKitchenSeparatedBundleV47 } = require("../dist/src/production/kitchenSeparatedOfflineBundleV47.js");
const { diagnosticarComandasParaOperacaoVivaV1: diagnose } =
  require("../dist/src/production/operacaoVivaComandasDiagnosticoV1.js");

let passes = 0;
function test(label, fn) {
  fn();
  passes++;
  console.log("PASS " + String(passes).padStart(2, "0") + " " + label);
}
function originalBundle() {
  const t = archivedResult();
  const src = archivedCompleteInput().source_items;
  return buildKitchenSeparatedBundleV47(t, splitTwoKitchenTicketsV47(src, t, null));
}
function safe(data) {
  assert.equal(data.fonte, "PROVA_SHADOW_OFFLINE_NAO_AUTORITATIVA");
  assert.equal(data.identidade_pedido, null);
  assert.equal(data.estado_pedido_observado, null);
  assert.equal(data.ocorrido_em_origem, null);
  assert.equal(data.comprova_papel_fisico, false);
  assert.equal(data.emite_fato_operacional, false);
  assert.equal(data.define_foco, false);
  assert.equal(data.autoriza_impressao, false);
  assert.equal(data.autoriza_integracao_produtiva, false);
  assert.deepEqual(data.effects, {
    print:false, spooler_write:false, odhen_write:false,
    stock_write:false, persistence_write:false,
  });
  assert.deepEqual(Object.keys(data.canais).sort(),
    ["OTHER_PRODUCTION","KITCHEN_COMPONENTS","KITCHEN_DISHES","CONFERENCE"].sort());
}

const original = originalBundle();
test("archived source stays a diagnostic, never a live order", () => {
  const v=diagnose(original); safe(v);
  assert.equal(v.integridade_estrutura,"VALIDA");
  assert.equal(v.canais.CONFERENCE, "DISPONIVEL_OFFLINE");
  assert.equal(v.canais.OTHER_PRODUCTION, "DISPONIVEL_OFFLINE");
  assert.equal(v.canais.KITCHEN_DISHES, "DISPONIVEL_OFFLINE");
  assert.equal(v.canais.KITCHEN_COMPONENTS, "NAO_GERADO_NA_AMOSTRA");
  assert.equal(v.exige_revisao,true); // unresolved kitchen dependency remains visible
});
test("diagnostic does not expose identities, items, text_trace or ESC/POS", () => {
  const data=JSON.stringify(diagnose(original));
  for(const item of ["bytes","text_trace","blocking_reasons","NRCOMANDA","product_code",
    "print_name","source_item_index","observations","operator_field"]) {
    assert.equal(data.includes(item),false,item);
  }
});
test("synthetic sensitive source note and reason are never copied", () => {
  const b=structuredClone(original);
  b.review_reasons.push("CUSTOMER_NAME JOAO SILVA / 11999999999");
  b.jobs[0].proof.text_trace += "\nENDERECO SECRETO 123";
  const out=JSON.stringify(diagnose(b));
  assert.equal(out.includes("JOAO SILVA"),false);
  assert.equal(out.includes("ENDERECO"),false);
});
test("invalid schema becomes indeterminate", () => {
  const b=structuredClone(original); b.schema="future-version";
  const v=diagnose(b);safe(v);assert.equal(v.integridade_estrutura,"INDETERMINADA");
  assert.equal(v.motivo_indisponibilidade,"PACOTE_INVALIDO");
});
test("live-print flag is rejected", () => {
  const b=structuredClone(original); b.ready_for_automatic_operational_print=true;
  assert.equal(diagnose(b).integridade_estrutura,"INDETERMINADA");
});
test("spooler effect is rejected even if data otherwise passes", () => {
  const b=structuredClone(original); b.effects.spooler_write=true;
  assert.equal(diagnose(b).integridade_estrutura,"INDETERMINADA");
});
test("printer-specific proof effect is rejected", () => {
  const b=structuredClone(original); b.jobs[0].proof.effects.print=true;
  assert.equal(diagnose(b).integridade_estrutura,"INDETERMINADA");
});
test("unexpected channel is rejected", () => {
  const b=structuredClone(original); b.jobs[0].channel="DELIVERY_RIDER";
  assert.equal(diagnose(b).integridade_estrutura,"INDETERMINADA");
});
test("mismatched byte count is rejected", () => {
  const b=structuredClone(original); b.jobs[0].proof.byte_count++;
  assert.equal(diagnose(b).integridade_estrutura,"INDETERMINADA");
});
test("incorrect byte value is rejected", () => {
  const b=structuredClone(original); b.jobs[0].proof.bytes[0]=999;
  assert.equal(diagnose(b).integridade_estrutura,"INDETERMINADA");
});
test("blocked proof claiming bytes is rejected", () => {
  const b=structuredClone(original);
  const row=b.jobs.shift();
  row.proof.ready_for_offline_preview=false;
  b.blocked_proofs.push(row);
  assert.equal(diagnose(b).integridade_estrutura,"INDETERMINADA");
});
test("a real semantic blocker remains a blocker in diagnostic", () => {
  const b=structuredClone(original);
  const row=b.jobs.shift();
  row.proof.ready_for_offline_preview=false;
  row.proof.bytes=[];
  row.proof.byte_count=0;
  row.proof.blocking_reasons=["TEST_INVALID_SOURCE_NOTE"];
  b.blocked_proofs.push(row);
  const x=diagnose(b);safe(x);
  assert.equal(x.integridade_estrutura,"VALIDA");
  assert.equal(x.canais[row.channel],"BLOQUEADO_OFFLINE");
  assert.equal(x.exige_revisao,true);
  assert.equal(JSON.stringify(x).includes("TEST_INVALID_SOURCE_NOTE"),false);
});
test("mixed statuses are never reported as completely available", () => {
  const b=structuredClone(original);
  const blocked=structuredClone(b.jobs[0]);
  blocked.proof.ready_for_offline_preview=false;
  blocked.proof.bytes=[];
  blocked.proof.byte_count=0;
  blocked.proof.blocking_reasons=["BLOCKED"];
  b.blocked_proofs.push(blocked);
  const x=diagnose(b);safe(x);
  assert.equal(x.canais[blocked.channel],"MISTO_OFFLINE");
  assert.equal(x.exige_revisao,true);
});
test("empty input is indeterminate rather than a healthy empty shift", () => {
  assert.equal(diagnose({}).integridade_estrutura,"INDETERMINADA");
  assert.equal(diagnose(null).integridade_estrutura,"INDETERMINADA");
  assert.equal(diagnose([]).integridade_estrutura,"INDETERMINADA");
});
test("unknown review fields never promote an operation", () => {
  const b=structuredClone(original); b.review_reasons=[];
  const x=diagnose(b);safe(x);
  assert.equal(x.integridade_estrutura,"VALIDA");
  assert.equal(x.autoriza_integracao_produtiva,false);
});
console.log("operacao-viva-comandas-diagnostico-v1: " + passes + "/" + passes +
  " PASS; SHADOW ONLY; no live producer, no device I/O");
