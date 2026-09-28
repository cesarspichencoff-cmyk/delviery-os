"use strict";

const assert = require("node:assert/strict");

const Passive = require("../dist/src/shadow/passivePrintLog.js");
const Tail = require("../dist/src/shadow/passivePrintTail.js");
const Shadow = require("../dist/src/shadow/odhenReadonly.js");

const syntheticBlock = [
  "PEDIDO: 170512",
  "IFOOD: ABC123",
  "EMISSAO: 2026-09-28 04:45",
  "CLIENTE: PESSOA FICTICIA",
  "TELEFONE: 11999999999",
  "ENDERECO: RUA FICTICIA 100",
  "PAGAMENTO: CARTAO 999,99",
  "1 x Uramaki de Salmao",
  "* SEM CEBOLINHA",
  "2 x Sashimi de Salmao",
  "OBS.: PORTARIA",
  "TOTAL: 999,99",
].join("\r\n");

const profile = {
  schema: "deliveryos.shadow.print-log-profile.v1",
  id: "synthetic-v1",
  proof: "SYNTHETIC_ONLY",
  full_block_framing_proven: false,
  order_id: /PEDIDO:\s*(?<pedido>\d+)/i,
  external_order_id: /IFOOD:\s*(?<externo>\S+)/i,
  emission: /EMISSAO:\s*(?<emissao>[^\r\n]+)/i,
  item_line: /^(?<quantidade>\d+(?:[.,]\d+)?)\s*x\s*(?<nome>.+)$/i,
  item_observation_line: /^\*\s*(?<observacao>.+)$/i,
  order_observation_line: /^OBS\.:\s*(?<observacao>.+)$/i,
};

const projection = Passive.projectPassivePrintBlock(syntheticBlock, profile);

assert.equal(projection.ready_for_live_shadow, false);
assert.ok(projection.blocking_reasons.includes("PRINT_PROFILE_NOT_REAL_SAMPLE_PROVEN"));
assert.ok(projection.blocking_reasons.includes("PRINT_BLOCK_FRAMING_NOT_PROVEN"));
assert.equal(projection.ids.pedido_interno, "170512");
assert.equal(projection.ids.pedido_externo, "ABC123");
assert.equal(projection.items.length, 2);
assert.equal(projection.items[0].nome, "Uramaki de Salmao");
assert.equal(projection.items[0].quantidade, 1);
assert.deepEqual(projection.items[0].observacoes, ["SEM CEBOLINHA"]);
assert.equal(projection.items[1].quantidade, 2);
assert.deepEqual(projection.order_observations, ["PORTARIA"]);
assert.equal(projection.source_contract.tx_prod_com_ven, "ABSENT_FROM_DELIVERY_REPORT_SOURCE");
assert.equal(projection.source_contract.nr_venda_rest, "ABSENT_FROM_SOURCE");

const serialized = JSON.stringify(projection);
for (const forbidden of [
  "PESSOA FICTICIA",
  "11999999999",
  "RUA FICTICIA",
  "CARTAO 999,99",
  "TOTAL: 999,99",
]) {
  assert.equal(serialized.includes(forbidden), false, "raw/PII leaked: " + forbidden);
}
assert.equal(projection.privacy.raw_text_retained, false);
assert.equal(projection.privacy.pii_fields_copied, false);
assert.match(projection.privacy.raw_sha256_only, /^[a-f0-9]{64}$/);

const raw = Passive.passivePrintProjectionToOdhenRaw(projection);
assert.equal(raw.NRCOMANDA, "170512");
assert.equal(raw.NRCOMANDAEXT, "ABC123");
assert.equal(raw.NRVENDAREST, null);
assert.equal(raw.observation_scan_complete, false);
assert.deepEqual(
  raw.observation_rows.map((x) => [x.source_field, x.value, x.scope_hint]),
  [
    ["PRINT_ITEM_OBS_MERGED", "SEM CEBOLINHA", "item"],
    ["PRINT_ORDER_OBS", "PORTARIA", "order"],
  ],
);

const normalized = Shadow.normalizeOdhenShadow(raw);
assert.equal(normalized.ready_for_motor, false);
assert.ok(normalized.blocking_reasons.includes("OBSERVATION_SOURCE_NOT_PROVEN_COMPLETE"));

const file = {
  path: "C:\\TEKNISA\\odhen-perifericos\\Log\\MES\\2026_09_28_IMP_X.txt",
  size: 1000,
  mtime_ms: 1,
  file_id: "A",
};

const initial = Tail.planPassiveTail(null, file);
assert.equal(initial.decision, "INITIAL_SNAPSHOT");
assert.equal(initial.read_from, null);
assert.equal(initial.next_checkpoint.offset, 1000);
assert.ok(initial.blocking_reasons.includes("INITIAL_BASELINE_ONLY_DO_NOT_REPLAY_HISTORY"));

const noChange = Tail.planPassiveTail(initial.next_checkpoint, { ...file, mtime_ms: 2 });
assert.equal(noChange.decision, "NO_CHANGE");

const append = Tail.planPassiveTail(initial.next_checkpoint, { ...file, size: 1250, mtime_ms: 3 });
assert.equal(append.decision, "APPEND");
assert.equal(append.read_from, 1000);
assert.equal(append.read_to, 1250);
assert.equal(append.effects.source_write, false);
assert.equal(append.effects.print_call, false);

const rotated = Tail.planPassiveTail(initial.next_checkpoint, {
  ...file,
  file_id: "B",
  size: 12,
  mtime_ms: 4,
});
assert.equal(rotated.decision, "ROTATED_OR_REPLACED");
assert.equal(rotated.read_from, null);

const truncated = Tail.planPassiveTail(initial.next_checkpoint, {
  ...file,
  size: 800,
  mtime_ms: 5,
});
assert.equal(truncated.decision, "TRUNCATED");
assert.equal(truncated.read_from, null);

const missing = Tail.planPassiveTail(initial.next_checkpoint, null);
assert.equal(missing.decision, "SOURCE_MISSING");
assert.ok(missing.blocking_reasons.includes("SOURCE_UNAVAILABLE"));

console.log("passive-print-log-v132: ok");
