import {
  routeEvidenceDebt,
  type InvestigatorDecision,
} from "./investigator";
import {
  EXPECTED_BARRIERS,
  type ExpectedBarrierAssessmentSet,
} from "./expectedBarrier";

export const BARRIER_EVIDENCE_DEBT_VERSION =
  "barrier-evidence-debt@0.1.0";

export interface BarrierEvidenceRouteHint {
  episode_id: string;
  barrier_id: string;
  trusted_source_available?: boolean;
  operational_owner_available?: boolean;
  capture_next_time_possible?: boolean;
}

export interface BarrierEvidenceDebtRecord {
  debt_id: string;
  episode_id: string;
  mechanism_key: string;
  barrier_id: string;
  evidence_code: string;
  capture_requirement_code: string;
  academia_claim_ids: string[];
  route: InvestigatorDecision["route"];
  evidence_status: "UNKNOWN";
  barrier_failure_proven: false;
  barrier_compliance_proven: false;
  guilt_inferred: false;
  cause_proven: false;
  cesar_context_needed: false;
  capture_contract_status: "DESIGN_ONLY";
  external_effect_authorized: false;
}

export interface BarrierEvidenceDebtPlan {
  version: typeof BARRIER_EVIDENCE_DEBT_VERSION;
  mapped_episode_count: number;
  debt_count: number;
  unique_capture_requirement_count: number;
  route_counts: Record<InvestigatorDecision["route"], number>;
  cesar_route_count: 0;
  barrier_failure_proven_count: 0;
  barrier_compliance_proven_count: 0;
  direct_attention_reasons_created: 0;
  external_effects_authorized: false;
  debts: BarrierEvidenceDebtRecord[];
}

const SAFE_CODE = /^[A-Za-z0-9._:-]{1,220}$/;
const BARRIERS_BY_ID = new Map(
  EXPECTED_BARRIERS.map((barrier) => [barrier.barrier_id, barrier] as const),
);

export function buildBarrierEvidenceDebtPlan(args: {
  assessments: ExpectedBarrierAssessmentSet;
  hints?: readonly BarrierEvidenceRouteHint[];
}): BarrierEvidenceDebtPlan {
  const candidates = args.assessments.assessments.flatMap((assessment) =>
    assessment.knowledge_status === "MAPPED_EXPECTED_BARRIERS"
      ? assessment.barrier_ids.map((barrierId) => ({
          assessment,
          barrierId,
          key: hintKey(assessment.episode_id, barrierId),
        }))
      : [],
  );

  const candidateKeys = new Set(candidates.map((item) => item.key));
  const hints = normalizeHints(args.hints ?? [], candidateKeys);
  const debts = candidates.map(({ assessment, barrierId, key }) => {
    const barrier = BARRIERS_BY_ID.get(barrierId);
    if (!barrier) throw new Error("barrier_evidence_unknown_barrier");
    const hint = hints.get(key);
    const evidenceCode = "BARRIER_EXECUTION." + barrierId;
    const debtId = "barrier:" + assessment.episode_id + ":" + barrierId;
    const captureCode = "CAPTURE.BARRIER." + barrierId;
    assertSafeCode(evidenceCode, "evidence_code");
    assertSafeCode(debtId, "debt_id");
    assertSafeCode(captureCode, "capture_requirement_code");

    const decision = routeEvidenceDebt({
      debt_id: debtId,
      evidence_code: evidenceCode,
      trusted_source_available:
        hint?.trusted_source_available === true,
      operational_owner_available:
        hint?.operational_owner_available === true,
      cesar_context_needed: false,
      capture_next_time_possible:
        hint?.capture_next_time_possible ?? true,
    });
    if (decision.route === "CESAR") {
      throw new Error("barrier_evidence_cesar_route_forbidden");
    }

    return {
      debt_id: debtId,
      episode_id: assessment.episode_id,
      mechanism_key: assessment.mechanism_key,
      barrier_id: barrierId,
      evidence_code: evidenceCode,
      capture_requirement_code: captureCode,
      academia_claim_ids: [...barrier.academia_claim_ids].sort(),
      route: decision.route,
      evidence_status: "UNKNOWN" as const,
      barrier_failure_proven: false as const,
      barrier_compliance_proven: false as const,
      guilt_inferred: decision.guilt_inferred,
      cause_proven: decision.cause_proven,
      cesar_context_needed: false as const,
      capture_contract_status: "DESIGN_ONLY" as const,
      external_effect_authorized: false as const,
    };
  });

  const routeCounts = emptyRouteCounts();
  for (const debt of debts) routeCounts[debt.route] += 1;
  if (routeCounts.CESAR !== 0) {
    throw new Error("barrier_evidence_cesar_route_forbidden");
  }

  return {
    version: BARRIER_EVIDENCE_DEBT_VERSION,
    mapped_episode_count: args.assessments.mapped_episode_count,
    debt_count: debts.length,
    unique_capture_requirement_count:
      new Set(debts.map((item) => item.capture_requirement_code)).size,
    route_counts: routeCounts,
    cesar_route_count: 0,
    barrier_failure_proven_count: 0,
    barrier_compliance_proven_count: 0,
    direct_attention_reasons_created: 0,
    external_effects_authorized: false,
    debts,
  };
}

function normalizeHints(
  input: readonly BarrierEvidenceRouteHint[],
  candidateKeys: ReadonlySet<string>,
): Map<string, BarrierEvidenceRouteHint> {
  const result = new Map<string, BarrierEvidenceRouteHint>();
  for (const hint of input) {
    assertSafeCode(hint.episode_id, "hint_episode_id");
    assertSafeCode(hint.barrier_id, "hint_barrier_id");
    const key = hintKey(hint.episode_id, hint.barrier_id);
    if (!candidateKeys.has(key)) {
      throw new Error("barrier_evidence_hint_without_debt");
    }
    if (result.has(key)) {
      throw new Error("barrier_evidence_duplicate_hint");
    }
    result.set(key, { ...hint });
  }
  return result;
}

function hintKey(episodeId: string, barrierId: string): string {
  return episodeId + "|" + barrierId;
}

function emptyRouteCounts(): Record<InvestigatorDecision["route"], number> {
  return {
    TRUSTED_SOURCE: 0,
    OPERATIONAL_OWNER: 0,
    CESAR: 0,
    CAPTURE_NEXT_TIME: 0,
    KEEP_UNKNOWN: 0,
  };
}

function assertSafeCode(value: string, field: string): void {
  if (!SAFE_CODE.test(value)) {
    throw new Error("barrier_evidence_unsafe_" + field);
  }
}
