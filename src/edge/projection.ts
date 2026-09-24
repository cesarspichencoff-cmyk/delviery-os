/**
 * Identity graph is a projection, not source truth.
 * It is rebuilt deterministically from the durable observation journal.
 */
import { OrderIdentityGraph } from "./identityGraph";
import type { EdgeSourceObservation } from "./simulator";

export function rebuildIdentityGraph(observations: readonly EdgeSourceObservation[]): OrderIdentityGraph {
  const graph = new OrderIdentityGraph();
  const ordered = [...observations].sort((a, b) => {
    const byObserved = a.observed_at.localeCompare(b.observed_at);
    if (byObserved !== 0) return byObserved;
    return a.observation_id.localeCompare(b.observation_id);
  });

  for (const observation of ordered) {
    for (const proposal of observation.correlation_proposals ?? []) {
      graph.upsert(
        observation.source_ref,
        proposal.target,
        proposal.evidence,
        observation.observed_at,
      );
    }
  }
  return graph;
}