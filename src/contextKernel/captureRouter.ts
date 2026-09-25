/**
 * Universal Capture Router v0.1.
 *
 * The classifier may be human, model or deterministic upstream. This module
 * only routes an already-classified capture. It never performs the external
 * effect itself.
 */

export type CaptureIntent =
  | "COMMITMENT"
  | "CALENDAR"
  | "WORK_FOLLOWUP"
  | "PERSONAL_FOLLOWUP"
  | "IDEA"
  | "QUESTION"
  | "OCCURRENCE"
  | "UNKNOWN";

export type CaptureDomain = "WORK" | "PERSONAL" | "MIXED" | "UNKNOWN";

export type ClassificationBasis =
  | "EXPLICIT_HUMAN"
  | "DETERMINISTIC_RULE"
  | "MODEL_CLASSIFICATION"
  | "UNKNOWN";

export type CaptureRouteTarget =
  | "COMMITMENT_LEDGER"
  | "CALENDAR_DRAFT"
  | "TRELLO_DRAFT"
  | "IDEA_INBOX"
  | "CHATGPT_QUERY"
  | "INCIDENT_INBOX"
  | "REVIEW_REQUIRED";

export interface CaptureClassification {
  capture_id: string;
  source_ref: string;
  captured_at: string;
  intent: CaptureIntent;
  domain: CaptureDomain;
  basis: ClassificationBasis;
  due_at?: string;
  target_ref?: string;
}

export interface CaptureRouteDecision {
  capture_id: string;
  target: CaptureRouteTarget;
  external_write_authorized: false;
  requires_review: boolean;
  due_at?: string;
  target_ref?: string;
}

export function routeCapture(
  capture: CaptureClassification,
): CaptureRouteDecision {
  assertSafe(capture.capture_id, "capture_id");
  assertSafe(capture.source_ref, "source_ref");
  assertTimestamp(capture.captured_at, "captured_at");
  if (capture.due_at !== undefined) assertTimestamp(capture.due_at, "due_at");
  if (capture.target_ref !== undefined) assertSafe(capture.target_ref, "target_ref");

  if (capture.intent === "UNKNOWN" || capture.basis === "UNKNOWN") {
    return decision(capture, "REVIEW_REQUIRED", true);
  }

  switch (capture.intent) {
    case "COMMITMENT":
      return decision(capture, "COMMITMENT_LEDGER", false);
    case "CALENDAR":
      return decision(capture, "CALENDAR_DRAFT", false);
    case "WORK_FOLLOWUP":
      return decision(capture, "TRELLO_DRAFT", false);
    case "PERSONAL_FOLLOWUP":
      return decision(capture, "COMMITMENT_LEDGER", false);
    case "IDEA":
      return decision(capture, "IDEA_INBOX", false);
    case "QUESTION":
      return decision(capture, "CHATGPT_QUERY", false);
    case "OCCURRENCE":
      return decision(capture, "INCIDENT_INBOX", false);
    case "UNKNOWN":
      return decision(capture, "REVIEW_REQUIRED", true);
  }
}

function decision(
  capture: CaptureClassification,
  target: CaptureRouteTarget,
  requiresReview: boolean,
): CaptureRouteDecision {
  return {
    capture_id: capture.capture_id,
    target,
    external_write_authorized: false,
    requires_review: requiresReview,
    due_at: capture.due_at,
    target_ref: capture.target_ref,
  };
}

const SAFE_REF = /^[A-Za-z0-9._:-]{1,160}$/;

function assertSafe(value: string, field: string): void {
  if (!SAFE_REF.test(value)) throw new Error(`unsafe_${field}`);
}

function assertTimestamp(value: string, field: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`invalid_${field}`);
}
