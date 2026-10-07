"use strict";

export type PaperEvidence =
  | "NOT_OBSERVED"
  | "PRINTED_OBSERVED"
  | "PHYSICALLY_CONFIRMED"
  | "AMBIGUOUS";

export type FiscalEvidence =
  | "WAIT_NATIVE_AUTHORIZATION"
  | "AUTHORIZED_RECONCILED"
  | "CONTINGENCY_OR_ERROR"
  | "AMBIGUOUS";

export interface PairedOrderDocumentState {
  order_key: string;
  arrival_index: number;
  comanda: PaperEvidence;
  fiscal: FiscalEvidence;
  danfe: PaperEvidence;
}

export interface StrictPairingPolicy {
  policy: "COMANDA_THEN_DANFE_STRICT_FIFO";
  same_physical_queue_proven: boolean;
  same_physical_queue_source_refs: string[];
  native_fiscal_authority: "TEKNISA_ODHEN";
  native_fiscal_emission_owned_by_deliveryos: false;
  native_danfe_submission_contract_proven: boolean;
}

export type PairingAction =
  | "ALLOW_COMANDA_SUBMISSION"
  | "WAIT_NATIVE_NFCE_AUTHORIZATION"
  | "ALLOW_DANFE_SUBMISSION"
  | "ADVANCE_TO_NEXT_ORDER"
  | "BLOCK_RECONCILIATION_REQUIRED"
  | "QUEUE_EMPTY";

export interface StrictPairingDecision {
  schema: "deliveryos.strict-comanda-danfe-pairing-decision.v1";
  policy: StrictPairingPolicy["policy"];
  head_order_key: string | null;
  action: PairingAction;
  activation_ready: boolean;
  blocking_reasons: string[];
  later_orders_blocked: string[];
  invariant: "COMANDA_A_DANFE_A_BEFORE_COMANDA_B";
  effect_boundary: {
    fiscal_emission: false;
    sefaz_call: false;
    odhen_write: false;
    database_write: false;
    print_submission: false;
  };
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function printed(value: PaperEvidence): boolean {
  return value === "PRINTED_OBSERVED" || value === "PHYSICALLY_CONFIRMED";
}

function ambiguousPaper(value: PaperEvidence): boolean {
  return value === "AMBIGUOUS";
}

/**
 * Pure FIFO planner for César's physical pairing rule:
 *
 *   Comanda A -> DANFE A -> Comanda B -> DANFE B
 *
 * It never emits NFC-e and never submits a print job. The native Teknisa/Odhen
 * fiscal authorization remains authoritative. This planner only decides which
 * paper would be eligible next after the required evidence exists.
 */
export function planStrictComandaDanfePairing(
  orders: readonly PairedOrderDocumentState[],
  policy: StrictPairingPolicy,
): StrictPairingDecision {
  const blocking = new Set<string>();

  if (policy.policy !== "COMANDA_THEN_DANFE_STRICT_FIFO") {
    blocking.add("INVALID_PAIRING_POLICY");
  }
  if (!policy.same_physical_queue_proven) {
    blocking.add("SAME_PHYSICAL_QUEUE_NOT_PROVEN");
  }
  if (policy.same_physical_queue_source_refs.length === 0) {
    blocking.add("SAME_PHYSICAL_QUEUE_SOURCE_REF_REQUIRED");
  }
  if (policy.native_fiscal_authority !== "TEKNISA_ODHEN") {
    blocking.add("NATIVE_FISCAL_AUTHORITY_MISMATCH");
  }
  if (policy.native_fiscal_emission_owned_by_deliveryos !== false) {
    blocking.add("DELIVERYOS_MUST_NOT_OWN_FISCAL_EMISSION");
  }

  const normalized = [...orders]
    .map((order) => ({
      ...order,
      order_key: clean(order.order_key),
    }))
    .sort((a, b) => a.arrival_index - b.arrival_index);

  const seen = new Set<string>();
  for (const order of normalized) {
    if (!order.order_key) blocking.add("ORDER_KEY_REQUIRED");
    if (!Number.isInteger(order.arrival_index) || order.arrival_index < 0) {
      blocking.add("INVALID_ARRIVAL_INDEX");
    }
    if (seen.has(order.order_key)) {
      blocking.add(`DUPLICATE_ORDER_KEY:${order.order_key}`);
    }
    seen.add(order.order_key);
  }

  const headIndex = normalized.findIndex(
    (order) => !(printed(order.comanda) && printed(order.danfe)),
  );

  if (headIndex < 0) {
    return {
      schema: "deliveryos.strict-comanda-danfe-pairing-decision.v1",
      policy: policy.policy,
      head_order_key: null,
      action: normalized.length ? "ADVANCE_TO_NEXT_ORDER" : "QUEUE_EMPTY",
      activation_ready:
        blocking.size === 0 && policy.native_danfe_submission_contract_proven,
      blocking_reasons: [...blocking].sort(),
      later_orders_blocked: [],
      invariant: "COMANDA_A_DANFE_A_BEFORE_COMANDA_B",
      effect_boundary: {
        fiscal_emission: false,
        sefaz_call: false,
        odhen_write: false,
        database_write: false,
        print_submission: false,
      },
    };
  }

  const head = normalized[headIndex];
  const later = normalized
    .slice(headIndex + 1)
    .filter((order) => !(printed(order.comanda) && printed(order.danfe)))
    .map((order) => order.order_key);

  let action: PairingAction;

  if (
    blocking.size > 0 ||
    ambiguousPaper(head.comanda) ||
    ambiguousPaper(head.danfe) ||
    head.fiscal === "AMBIGUOUS" ||
    head.fiscal === "CONTINGENCY_OR_ERROR"
  ) {
    if (ambiguousPaper(head.comanda)) blocking.add("COMANDA_PRINT_EFFECT_AMBIGUOUS");
    if (ambiguousPaper(head.danfe)) blocking.add("DANFE_PRINT_EFFECT_AMBIGUOUS");
    if (head.fiscal === "AMBIGUOUS") blocking.add("NATIVE_FISCAL_STATE_AMBIGUOUS");
    if (head.fiscal === "CONTINGENCY_OR_ERROR") {
      blocking.add("NATIVE_FISCAL_STATE_REQUIRES_OPERATOR");
    }
    action = "BLOCK_RECONCILIATION_REQUIRED";
  } else if (!printed(head.comanda)) {
    action = "ALLOW_COMANDA_SUBMISSION";
  } else if (head.fiscal !== "AUTHORIZED_RECONCILED") {
    action = "WAIT_NATIVE_NFCE_AUTHORIZATION";
  } else if (!printed(head.danfe)) {
    action = "ALLOW_DANFE_SUBMISSION";
    if (!policy.native_danfe_submission_contract_proven) {
      blocking.add("NATIVE_DANFE_SUBMISSION_CONTRACT_NOT_PROVEN");
    }
  } else {
    action = "ADVANCE_TO_NEXT_ORDER";
  }

  return {
    schema: "deliveryos.strict-comanda-danfe-pairing-decision.v1",
    policy: policy.policy,
    head_order_key: head.order_key,
    action,
    activation_ready:
      blocking.size === 0 && policy.native_danfe_submission_contract_proven,
    blocking_reasons: [...blocking].sort(),
    later_orders_blocked: later,
    invariant: "COMANDA_A_DANFE_A_BEFORE_COMANDA_B",
    effect_boundary: {
      fiscal_emission: false,
      sefaz_call: false,
      odhen_write: false,
      database_write: false,
      print_submission: false,
    },
  };
}
