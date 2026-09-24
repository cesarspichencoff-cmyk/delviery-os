/**
 * TATÁ Edge — pure shadow simulator.
 *
 * Represents observations before they are admitted to the canonical event spine.
 * Fixtures only: no network, browser, printer, filesystem or production I/O.
 */

import {
  type IdentityRef,
  type LinkEvidence,
  OrderIdentityGraph,
} from "./identityGraph";

export type ObservationSourceMode = "synthetic" | "live_observed";

export type ObservationKind =
  | "ifood_order"
  | "ifood_portal"
  | "teknisa_sale"
  | "print_job"
  | "delivery_trip"
  | "review"
  | "auth_state"
  | "tata_os_receipt";

export interface CorrelationProposal {
  target: IdentityRef;
  evidence: LinkEvidence[];
}

export interface EdgeSourceObservation {
  observation_id: string;
  source_mode: ObservationSourceMode;
  kind: ObservationKind;
  source_ref: IdentityRef;
  observed_at: string;
  occurred_at?: string;
  correlation_proposals?: CorrelationProposal[];
  payload: Record<string, unknown>;
}

export interface ShadowReplayResult {
  accepted_observations: number;
  duplicate_observations: number;
  links: ReturnType<OrderIdentityGraph["all"]>;
  snapshot: string;
}

export class EdgeShadowHarness {
  private readonly seen = new Set<string>();
  private readonly graph = new OrderIdentityGraph();
  private duplicates = 0;

  ingest(observation: EdgeSourceObservation): boolean {
    if (this.seen.has(observation.observation_id)) {
      this.duplicates += 1;
      return false;
    }

    this.seen.add(observation.observation_id);

    for (const proposal of observation.correlation_proposals ?? []) {
      this.graph.upsert(
        observation.source_ref,
        proposal.target,
        proposal.evidence,
        observation.observed_at,
      );
    }

    return true;
  }

  result(): ShadowReplayResult {
    const links = this.graph.all();
    return {
      accepted_observations: this.seen.size,
      duplicate_observations: this.duplicates,
      links,
      snapshot: JSON.stringify(links),
    };
  }
}

export function replay(
  observations: EdgeSourceObservation[],
  passes = 1,
): ShadowReplayResult {
  const harness = new EdgeShadowHarness();
  for (let pass = 0; pass < passes; pass += 1) {
    for (const observation of observations) harness.ingest(observation);
  }
  return harness.result();
}
