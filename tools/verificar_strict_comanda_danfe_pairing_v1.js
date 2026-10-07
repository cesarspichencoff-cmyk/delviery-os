"use strict";

const assert = require("node:assert/strict");
const {
  planStrictComandaDanfePairing,
} = require("../dist/src/production/strictComandaDanfePairing.js");

const provenPolicy = {
  policy: "COMANDA_THEN_DANFE_STRICT_FIFO",
  same_physical_queue_proven: true,
  same_physical_queue_source_refs: [
    "teknisa:MSDEQuery.php#BUSCA_IMPRESSORA_DELIVERY:NRSEQIMPRLOJA7->00001",
    "teknisa:MSDEQuery.php#BUSCA_DADOS_IMPRESSORA_NFCE:NRSEQIMPRLOJA3->00001",
    "teknisa:IMPRLOJA:0001/01/00001=CAIXA",
  ],
  native_fiscal_authority: "TEKNISA_ODHEN",
  native_fiscal_emission_owned_by_deliveryos: false,
  native_danfe_submission_contract_proven: true,
};

function order(key, index, comanda, fiscal, danfe) {
  return {
    order_key: key,
    arrival_index: index,
    comanda,
    fiscal,
    danfe,
  };
}

{
  const d = planStrictComandaDanfePairing(
    [
      order("A", 1, "NOT_OBSERVED", "WAIT_NATIVE_AUTHORIZATION", "NOT_OBSERVED"),
      order("B", 2, "NOT_OBSERVED", "WAIT_NATIVE_AUTHORIZATION", "NOT_OBSERVED"),
    ],
    provenPolicy,
  );
  assert.equal(d.action, "ALLOW_COMANDA_SUBMISSION");
  assert.equal(d.head_order_key, "A");
  assert.deepEqual(d.later_orders_blocked, ["B"]);
  assert.equal(d.activation_ready, true);
}

{
  const d = planStrictComandaDanfePairing(
    [
      order("A", 1, "PRINTED_OBSERVED", "WAIT_NATIVE_AUTHORIZATION", "NOT_OBSERVED"),
      order("B", 2, "NOT_OBSERVED", "WAIT_NATIVE_AUTHORIZATION", "NOT_OBSERVED"),
    ],
    provenPolicy,
  );
  assert.equal(d.action, "WAIT_NATIVE_NFCE_AUTHORIZATION");
  assert.deepEqual(d.later_orders_blocked, ["B"]);
}

{
  const d = planStrictComandaDanfePairing(
    [
      order("A", 1, "PRINTED_OBSERVED", "AUTHORIZED_RECONCILED", "NOT_OBSERVED"),
      order("B", 2, "NOT_OBSERVED", "WAIT_NATIVE_AUTHORIZATION", "NOT_OBSERVED"),
    ],
    provenPolicy,
  );
  assert.equal(d.action, "ALLOW_DANFE_SUBMISSION");
  assert.deepEqual(d.later_orders_blocked, ["B"]);
}

{
  const d = planStrictComandaDanfePairing(
    [
      order("A", 1, "PRINTED_OBSERVED", "AUTHORIZED_RECONCILED", "PRINTED_OBSERVED"),
      order("B", 2, "NOT_OBSERVED", "WAIT_NATIVE_AUTHORIZATION", "NOT_OBSERVED"),
    ],
    provenPolicy,
  );
  assert.equal(d.action, "ALLOW_COMANDA_SUBMISSION");
  assert.equal(d.head_order_key, "B");
  assert.deepEqual(d.later_orders_blocked, []);
}

{
  const d = planStrictComandaDanfePairing(
    [
      order("A", 1, "AMBIGUOUS", "AUTHORIZED_RECONCILED", "NOT_OBSERVED"),
      order("B", 2, "NOT_OBSERVED", "WAIT_NATIVE_AUTHORIZATION", "NOT_OBSERVED"),
    ],
    provenPolicy,
  );
  assert.equal(d.action, "BLOCK_RECONCILIATION_REQUIRED");
  assert.ok(d.blocking_reasons.includes("COMANDA_PRINT_EFFECT_AMBIGUOUS"));
  assert.deepEqual(d.later_orders_blocked, ["B"]);
}

{
  const notActivated = {
    ...provenPolicy,
    native_danfe_submission_contract_proven: false,
  };
  const d = planStrictComandaDanfePairing(
    [
      order("A", 1, "PRINTED_OBSERVED", "AUTHORIZED_RECONCILED", "NOT_OBSERVED"),
    ],
    notActivated,
  );
  assert.equal(d.action, "ALLOW_DANFE_SUBMISSION");
  assert.equal(d.activation_ready, false);
  assert.ok(
    d.blocking_reasons.includes("NATIVE_DANFE_SUBMISSION_CONTRACT_NOT_PROVEN"),
  );
}

console.log("strict-comanda-danfe-pairing-v1: ok");
