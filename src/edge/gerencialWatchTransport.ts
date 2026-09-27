/**
 * Transport-neutral request projection for the canonical Gerencial Watch
 * Context Kernel admission endpoint.
 *
 * This module builds request data only. It performs no network I/O.
 */
import type { EdgeWatchHandoffEnvelope } from "./gerencialWatchHandoff";

export const GERENCIAL_WATCH_EDGE_INGEST_PATH =
  "/sources/tata-edge/handoff" as const;

export interface GerencialWatchHandoffRequest {
  method: "POST";
  path: typeof GERENCIAL_WATCH_EDGE_INGEST_PATH;
  headers: {
    "content-type": "application/json";
  };
  body: string;
  external_effect_authorized: false;
}

export function buildGerencialWatchHandoffRequest(
  envelope: EdgeWatchHandoffEnvelope,
): GerencialWatchHandoffRequest {
  if (envelope.external_effect_authorized !== false) {
    throw new Error("edge_watch_external_effect_authority_forbidden");
  }
  if (envelope.global_coverage_claim !== "NOT_PROVIDED") {
    throw new Error("edge_watch_global_coverage_claim_forbidden");
  }

  return {
    method: "POST",
    path: GERENCIAL_WATCH_EDGE_INGEST_PATH,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(envelope),
    external_effect_authorized: false,
  };
}
