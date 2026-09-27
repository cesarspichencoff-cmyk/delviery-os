import { EXPECTED_BARRIERS } from "./expectedBarrier";

export const BARRIER_CAPTURE_CONTRACT_VERSION =
  "barrier-capture-contract@0.1.0";

export type OperationalSubtype =
  | "ITEM_MISSING"
  | "WRONG_ITEM"
  | "OTHER";

export type BarrierCaptureAnswer =
  | "REPORTED_DONE"
  | "REPORTED_NOT_DONE"
  | "UNABLE_TO_CONFIRM"
  | "REPORTED_NOT_APPLICABLE";

export interface BarrierCapturePrompt {
  barrier_id: string;
  label_pt_br: string;
}

export interface BarrierCapturePlan {
  version: typeof BARRIER_CAPTURE_CONTRACT_VERSION;
  subtype: OperationalSubtype;
  show_matrix: boolean;
  prompts: BarrierCapturePrompt[];
  answer_options: readonly BarrierCaptureAnswer[];
  evidence_basis: "OPERATOR_SELF_REPORT";
  capture_status: "SHADOW_DESIGN";
  attention_authority: "NONE";
  external_effect_authorized: false;
}

export interface BarrierCaptureResponse {
  barrier_id: string;
  answer: BarrierCaptureAnswer;
}

export interface BarrierCaptureInterpretation {
  barrier_id: string;
  reported_execution:
    | "REPORTED_DONE"
    | "REPORTED_NOT_DONE"
    | "UNKNOWN"
    | "REPORTED_NOT_APPLICABLE";
  evidence_basis: "OPERATOR_SELF_REPORT";
  barrier_failure_proven: false;
  barrier_compliance_proven: false;
  guilt_inferred: false;
  cause_proven: false;
  attention_authority: "NONE";
  external_effect_authorized: false;
}

const ANSWERS = [
  "REPORTED_DONE",
  "REPORTED_NOT_DONE",
  "UNABLE_TO_CONFIRM",
  "REPORTED_NOT_APPLICABLE",
] as const;

const LABELS = new Map<string, string>([
  [
    "IDENTIFY_BEFORE_ADVANCE",
    "O item estava identificado antes de seguir?",
  ],
  [
    "REUNITE_COMPLETE_ORDER",
    "Todos os volumes do pedido foram reunidos antes da saída?",
  ],
  [
    "PHYSICAL_POST_PRINT_CHECK",
    "Houve conferência física após impressão ou ajuste?",
  ],
  [
    "FINAL_DIVERGENCE_CONFERENCE",
    "Houve conferência final antes da saída?",
  ],
  [
    "EXACT_PRODUCT_QUANTITY_MATCH",
    "Produto e quantidade conferiam com o pedido?",
  ],
  [
    "CUSTOMER_OBSERVATION_CHECK",
    "As observações do cliente foram conferidas?",
  ],
  [
    "MANUAL_CORRECTION_PHYSICAL_CHECK",
    "Se houve correção manual, ela foi conferida fisicamente?",
  ],
]);

const BARRIERS_BY_SUBTYPE: Record<OperationalSubtype, readonly string[]> = {
  ITEM_MISSING: [
    "IDENTIFY_BEFORE_ADVANCE",
    "REUNITE_COMPLETE_ORDER",
    "PHYSICAL_POST_PRINT_CHECK",
    "FINAL_DIVERGENCE_CONFERENCE",
  ],
  WRONG_ITEM: [
    "EXACT_PRODUCT_QUANTITY_MATCH",
    "CUSTOMER_OBSERVATION_CHECK",
    "MANUAL_CORRECTION_PHYSICAL_CHECK",
    "FINAL_DIVERGENCE_CONFERENCE",
  ],
  OTHER: [],
};

const KNOWN_BARRIERS = new Set(
  EXPECTED_BARRIERS.map((item) => item.barrier_id),
);

export function buildBarrierCapturePlan(
  subtype: OperationalSubtype,
): BarrierCapturePlan {
  const barrierIds = BARRIERS_BY_SUBTYPE[subtype];
  const prompts = barrierIds.map((barrierId) => {
    if (!KNOWN_BARRIERS.has(barrierId)) {
      throw new Error("barrier_capture_unknown_expected_barrier");
    }
    const label = LABELS.get(barrierId);
    if (!label) throw new Error("barrier_capture_label_missing");
    return { barrier_id: barrierId, label_pt_br: label };
  });

  return {
    version: BARRIER_CAPTURE_CONTRACT_VERSION,
    subtype,
    show_matrix: prompts.length > 0,
    prompts,
    answer_options: ANSWERS,
    evidence_basis: "OPERATOR_SELF_REPORT",
    capture_status: "SHADOW_DESIGN",
    attention_authority: "NONE",
    external_effect_authorized: false,
  };
}

export function interpretBarrierCapture(
  subtype: OperationalSubtype,
  responses: readonly BarrierCaptureResponse[],
): BarrierCaptureInterpretation[] {
  const plan = buildBarrierCapturePlan(subtype);
  const expected = new Set(plan.prompts.map((item) => item.barrier_id));
  const seen = new Set<string>();

  for (const response of responses) {
    if (!expected.has(response.barrier_id)) {
      throw new Error("barrier_capture_response_outside_plan");
    }
    if (seen.has(response.barrier_id)) {
      throw new Error("barrier_capture_duplicate_response");
    }
    if (!ANSWERS.includes(response.answer)) {
      throw new Error("barrier_capture_answer_invalid");
    }
    seen.add(response.barrier_id);
  }

  if (seen.size !== expected.size) {
    throw new Error("barrier_capture_required_response_missing");
  }

  return responses.map((response) => ({
    barrier_id: response.barrier_id,
    reported_execution:
      response.answer === "UNABLE_TO_CONFIRM"
        ? "UNKNOWN"
        : response.answer,
    evidence_basis: "OPERATOR_SELF_REPORT" as const,
    barrier_failure_proven: false as const,
    barrier_compliance_proven: false as const,
    guilt_inferred: false as const,
    cause_proven: false as const,
    attention_authority: "NONE" as const,
    external_effect_authorized: false as const,
  }));
}
