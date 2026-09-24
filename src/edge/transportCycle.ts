/**
 * One read-only Edge transport cycle.
 *
 * Sources are isolated: an iFood/browser failure must not block print
 * observation, and a print-source failure must not erase browser observations.
 * Only safe generic failure classes cross into the result; raw exception
 * messages are intentionally not persisted or returned.
 */
import { EdgeAdmissionPipeline } from "./admission";
import type { EdgeSourceObservation } from "./simulator";
import {
  networkCaptureToPortalRecord,
  safeSessionMetadata,
  type BrowserSessionHealth,
  type BrowserSessionSnapshot,
  type IfoodBrowserReadOnlyTransport,
} from "./ifood/browserTransport";
import { portalRecordToObservation } from "./ifood/sidecar";
import { observePrintJobs, type PrintSnapshotSource } from "./print/observer";

export type TransportStageStatus = "ok" | "failed" | "skipped";

export interface EdgeTransportCycleResult {
  session_health: BrowserSessionHealth;
  session_status: TransportStageStatus;
  structured_status: TransportStageStatus;
  download_status: TransportStageStatus;
  print_status: TransportStageStatus;
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
  now?: () => Date;
}): Promise<EdgeTransportCycleResult> {
  const now = args.now ?? (() => new Date());

  let session: BrowserSessionSnapshot;
  let sessionStatus: TransportStageStatus = "ok";
  try {
    session = await args.browser.sessionHealth();
  } catch {
    sessionStatus = "failed";
    session = {
      health: "UNKNOWN",
      observed_at: now().toISOString(),
      profile_id: "unknown-session",
      reason: "session_probe_failed",
    };
  }

  const authObservation: EdgeSourceObservation = {
    observation_id: [
      "ifood-auth",
      session.profile_id,
      session.observed_at,
      session.health,
    ].join(":"),
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
  let structuredStatus: TransportStageStatus = "skipped";
  let downloadStatus: TransportStageStatus = "skipped";

  if (session.health === "HEALTHY") {
    structuredStatus = "ok";
    try {
      const captures = await args.browser.collectStructured();
      for (const capture of captures) {
        args.pipeline.admit(
          portalRecordToObservation(networkCaptureToPortalRecord(capture)),
        );
        portalObservations += 1;
      }
    } catch {
      structuredStatus = "failed";
    }

    downloadStatus = "ok";
    try {
      const downloads = await args.browser.collectDownloadMetadata();
      downloadMetadataObserved = downloads.length;
    } catch {
      downloadStatus = "failed";
    }
  }

  let printObservations = 0;
  let printStatus: TransportStageStatus = "ok";
  try {
    const print = await observePrintJobs(args.printSource);
    for (const item of print) args.pipeline.admit(item.observation);
    printObservations = print.length;
  } catch {
    printStatus = "failed";
  }

  return {
    session_health: session.health,
    session_status: sessionStatus,
    structured_status: structuredStatus,
    download_status: downloadStatus,
    print_status: printStatus,
    auth_observations: 1,
    portal_observations: portalObservations,
    download_metadata_observed: downloadMetadataObserved,
    print_observations: printObservations,
  };
}
