/**
 * Durable commitment semantics for the César Context Kernel.
 *
 * This is an append-only projection model. It stores references/codes only;
 * source-specific free text and sensitive payloads belong to their source.
 */

export type CommitmentDomain = "WORK" | "PERSONAL" | "MIXED";

export type CommitmentStatus =
  | "OPEN"
  | "WAITING"
  | "DONE_UNVERIFIED"
  | "PROVEN_CLOSED"
  | "CANCELLED";

export interface CommitmentRecord {
  commitment_id: string;
  domain: CommitmentDomain;
  subject_code: string;
  source_ref: string;
  assignee_ref?: string;
  due_at?: string;
  status: CommitmentStatus;
  evidence_debt: string[];
  created_at: string;
  updated_at: string;
}

export type CommitmentEvent =
  | {
      event_id: string;
      commitment_id: string;
      observed_at: string;
      type: "CREATED";
      domain: CommitmentDomain;
      subject_code: string;
      source_ref: string;
      assignee_ref?: string;
      due_at?: string;
    }
  | {
      event_id: string;
      commitment_id: string;
      observed_at: string;
      type: "ASSIGNEE_SET";
      assignee_ref: string;
    }
  | {
      event_id: string;
      commitment_id: string;
      observed_at: string;
      type: "DUE_SET";
      due_at: string;
    }
  | {
      event_id: string;
      commitment_id: string;
      observed_at: string;
      type: "STATUS_SET";
      status: Exclude<CommitmentStatus, "PROVEN_CLOSED">;
    }
  | {
      event_id: string;
      commitment_id: string;
      observed_at: string;
      type: "EVIDENCE_REQUIRED";
      evidence_code: string;
    }
  | {
      event_id: string;
      commitment_id: string;
      observed_at: string;
      type: "EVIDENCE_SATISFIED";
      evidence_code: string;
    }
  | {
      event_id: string;
      commitment_id: string;
      observed_at: string;
      type: "CLOSED_PROVEN";
    };

const SAFE_CODE = /^[A-Za-z0-9._:-]{1,160}$/;

export function replayCommitments(
  events: readonly CommitmentEvent[],
): CommitmentRecord[] {
  const seen = new Set<string>();
  const records = new Map<string, CommitmentRecord>();

  for (const event of [...events].sort(
    (a, b) =>
      a.observed_at.localeCompare(b.observed_at) ||
      a.event_id.localeCompare(b.event_id),
  )) {
    assertSafeCode(event.event_id, "event_id");
    assertSafeCode(event.commitment_id, "commitment_id");
    if (seen.has(event.event_id)) continue;
    seen.add(event.event_id);

    if (event.type === "CREATED") {
      if (records.has(event.commitment_id)) {
        throw new Error("commitment_duplicate_create");
      }
      assertSafeCode(event.subject_code, "subject_code");
      assertSafeCode(event.source_ref, "source_ref");
      if (event.assignee_ref) assertSafeCode(event.assignee_ref, "assignee_ref");
      if (event.due_at) assertTimestamp(event.due_at, "due_at");
      records.set(event.commitment_id, {
        commitment_id: event.commitment_id,
        domain: event.domain,
        subject_code: event.subject_code,
        source_ref: event.source_ref,
        assignee_ref: event.assignee_ref,
        due_at: event.due_at,
        status: "OPEN",
        evidence_debt: [],
        created_at: event.observed_at,
        updated_at: event.observed_at,
      });
      continue;
    }

    const record = records.get(event.commitment_id);
    if (!record) throw new Error("commitment_event_before_create");
    if (record.status === "PROVEN_CLOSED" && event.type !== "EVIDENCE_SATISFIED") {
      throw new Error("commitment_closed_is_immutable");
    }

    switch (event.type) {
      case "ASSIGNEE_SET":
        assertSafeCode(event.assignee_ref, "assignee_ref");
        record.assignee_ref = event.assignee_ref;
        break;
      case "DUE_SET":
        assertTimestamp(event.due_at, "due_at");
        record.due_at = event.due_at;
        break;
      case "STATUS_SET":
        record.status = event.status;
        break;
      case "EVIDENCE_REQUIRED":
        assertSafeCode(event.evidence_code, "evidence_code");
        if (!record.evidence_debt.includes(event.evidence_code)) {
          record.evidence_debt.push(event.evidence_code);
          record.evidence_debt.sort();
        }
        break;
      case "EVIDENCE_SATISFIED":
        assertSafeCode(event.evidence_code, "evidence_code");
        record.evidence_debt = record.evidence_debt.filter(
          (code) => code !== event.evidence_code,
        );
        break;
      case "CLOSED_PROVEN":
        if (record.evidence_debt.length > 0) {
          throw new Error("commitment_evidence_debt_open");
        }
        record.status = "PROVEN_CLOSED";
        break;
    }
    record.updated_at = event.observed_at;
  }

  return [...records.values()]
    .map((record) => ({ ...record, evidence_debt: [...record.evidence_debt] }))
    .sort((a, b) => a.commitment_id.localeCompare(b.commitment_id));
}

function assertSafeCode(value: string, field: string): void {
  if (!SAFE_CODE.test(value)) throw new Error(`unsafe_${field}`);
}

function assertTimestamp(value: string, field: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`invalid_${field}`);
}
