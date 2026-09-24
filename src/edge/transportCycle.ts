/**
 * One read-only Edge transport cycle.
 *
 * Source failures are isolated: browser trouble must not block print
 * observation, and print trouble must not erase browser observations.
 * Only generic failure classes cross the boundary.
 */
import { EdgeAdmissionPipeline } from "./admission";
import type { EdgeSourceObservation } from "./simulator";
import {
  networkCaptureToPortalRecord,
  safeBrowserProfileId,
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
  source_mode: "synthetic" | "live_observed";
  now?: () => Date;
}): Promise<EdgeTransportCycleResult> {
  const now = args.now ?? (() => new Date());

  let session: BrowserSessionSnapshot;
  let sessionStatus: TransportStageStatus = "ok";
  try {
    const reported = await args.browser.sessionHealth();
    if (reported.source_mode !== args.source_mode) {
      sessionStatus = "failed";
      session = {
        source_mode: args.source_mode,
        health: "UNKNOWN",
        observed_at: now().toISOString(),
        profile_id: "unknown-session",
        reason: "source_mode_mismatch",
      };
    } else {
      session = reported;
    }
  } catch {
    sessionStatus = "failed";
    session = {
      source_mode: args.source_mode,
      health: "UNKNOWN",
      observed_at: now().toISOString(),
      profile_id: "unknown-session",
      reason: "session_probe_failed",
    };
  }

  const profileId = safeBrowserProfileId(session.profile_id);
  const authObservation: EdgeSourceObservation = {
    source_mode: session.source_mode,
    observation_id: [
      "ifood-auth",
      profileId,
      session.observed_at,
      session.health,
    ].join(":"),
    kind: "auth_state",
    source_ref: {
      source: "ifood",
      kind: "auth_session",
      id: profileId,
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
      if (captures.some((capture) => capture.source_mode !== args.source_mode)) {
        throw new Error("source_mode_mismatch");
      }
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
      if (downloads.some((download) => download.source_mode !== args.source_mode)) {
        throw new Error("source_mode_mismatch");
      }
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
