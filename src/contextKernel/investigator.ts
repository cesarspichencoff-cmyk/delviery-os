/**
 * Gerente Investigador routing.
 *
 * Order is deliberate:
 * trusted source -> operational owner -> César -> improve next capture -> UNKNOWN.
 *
 * Evidence debt is never interpreted as guilt or cause.
 */

export type InvestigatorRoute =
  | "TRUSTED_SOURCE"
  | "OPERATIONAL_OWNER"
  | "CESAR"
  | "CAPTURE_NEXT_TIME"
  | "KEEP_UNKNOWN";

export interface EvidenceDebtCase {
  debt_id: string;
  evidence_code: string;
  trusted_source_available: boolean;
  operational_owner_available: boolean;
  cesar_context_needed: boolean;
  capture_next_time_possible: boolean;
}

export interface InvestigatorDecision {
  debt_id: string;
  route: InvestigatorRoute;
  evidence_code: string;
  guilt_inferred: false;
  cause_proven: false;
}

export function routeEvidenceDebt(
  item: EvidenceDebtCase,
): InvestigatorDecision {
  let route: InvestigatorRoute = "KEEP_UNKNOWN";

  if (item.trusted_source_available) {
    route = "TRUSTED_SOURCE";
  } else if (item.operational_owner_available) {
    route = "OPERATIONAL_OWNER";
  } else if (item.cesar_context_needed) {
    route = "CESAR";
  } else if (item.capture_next_time_possible) {
    route = "CAPTURE_NEXT_TIME";
  }

  return {
    debt_id: item.debt_id,
    route,
    evidence_code: item.evidence_code,
    guilt_inferred: false,
    cause_proven: false,
  };
}
