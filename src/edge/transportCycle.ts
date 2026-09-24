/**
 * One read-only Edge transport cycle.
 *
 * Session health is admitted as safe metadata. Portal capture happens only
 * while the session is healthy. Print observation is independent, so an iFood
 * auth problem never blocks print observation.
 */
import { EdgeAdmissionPipeline } from "./admission";
import type { EdgeSourceObservation } from "./simulator";
import {
  networkCaptureToPortalRecord,
  safeSessionMetadata,
  type BrowserSessionHealth,
  type IfoodBrowserReadOnlyTransport,
} from "./ifood/browserTransport";
import { portalRecordToObservation } from "./ifood/sidecar";
import { observePrintJobs, type PrintSnapshotSource } from "./print/observer";

export interface EdgeTransportCycleResult {
  session_health: BrowserSessionHealth;
  auth_observations: number;
  portal_observations: number;
  download_metadata_observed: number;
  print_observations: number;
}

export async function runReadOnlyTransportCycle(args: {
  pipeline: EdgeAdmissionPipeline;
  browser: IfoodBrowserReadOnlyTransport;
  printSource: PrintSnapshotSource;
  unit_id: string;
}): Promise<EdgeTransportCycleResult> {
  const session = await args.browser.sessionHealth();
  const authObservation: EdgeSourceObservation = {
    observation_id: ["ifood-auth", session.profile_id, session.observed_at, session.health].join(":"),
    kind: "auth_state",
    source_ref: {
      source: "ifood",
      kind: "auth_session",
      id: session.profile_id,
      unit_id: args.unit_id,
    },
    observed_at: session.observed_at,
    payload: safeSessionMetadata(session),
  };
  args.pipeline.admit(authObservation);

  let portalObservations = 0;
  let downloadMetadataObserved = 0;
  if (session.health === "HEALTHY") {
    const captures = await args.browser.collectStructured();
    for (const capture of captures) {
      args.pipeline.admit(portalRecordToObservation(networkCaptureToPortalRecord(capture)));
      portalObservations += 1;
    }
    const downloads = await args.browser.collectDownloadMetadata();
    downloadMetadataObserved = downloads.length;
  }

  const print = await observePrintJobs(args.printSource);
  for (const item of print) args.pipeline.admit(item.observation);

  return {
    session_health: session.health,
    auth_observations: 1,
    portal_observations: portalObservations,
    download_metadata_observed: downloadMetadataObserved,
    print_observations: print.length,
  };
}