/**
 * Trello -> Context Kernel commitment boundary.
 *
 * List names are not interpreted here. The caller must configure each list
 * role explicitly. Card title/description/comments never enter the commitment
 * ledger through this adapter.
 *
 * Trello completion can produce DONE_UNVERIFIED, never PROVEN_CLOSED.
 */
import type {
  CommitmentDomain,
  CommitmentEvent,
  CommitmentStatus,
} from "../commitments";

export type TrelloListRole =
  | "OPEN"
  | "WAITING"
  | "DONE_UNVERIFIED"
  | "CANCELLED"
  | "IGNORE";

export interface TrelloSafeCard {
  card_ref: string;
  board_ref: string;
  list_ref: string;
  observed_at: string;
  due_at?: string;
  due_complete: boolean;
  assignee_ref?: string;
}

export interface TrelloSourcePolicy {
  board_ref: string;
  domain: CommitmentDomain;
  subject_code: string;
  list_roles: Record<string, TrelloListRole>;
}

export interface TrelloCommitmentProjection {
  disposition: "ADMIT" | "UNMAPPED" | "IGNORE";
  events: CommitmentEvent[];
}

export function trelloCardToCommitmentEvents(
  card: TrelloSafeCard,
  policy: TrelloSourcePolicy,
): TrelloCommitmentProjection {
  if (card.board_ref !== policy.board_ref) {
    return { disposition: "UNMAPPED", events: [] };
  }

  const listRole = policy.list_roles[card.list_ref];
  if (!listRole) {
    return { disposition: "UNMAPPED", events: [] };
  }

  if (listRole === "IGNORE") {
    return { disposition: "IGNORE", events: [] };
  }

  const commitmentId = `trello-card:${card.card_ref}`;
  const prefix = `trello:${card.card_ref}`;

  const events: CommitmentEvent[] = [{
    event_id: `${prefix}:created`,
    commitment_id: commitmentId,
    observed_at: card.observed_at,
    type: "CREATED",
    domain: policy.domain,
    subject_code: policy.subject_code,
    source_ref: `trello:${card.board_ref}:${card.card_ref}`,
    assignee_ref: card.assignee_ref,
    due_at: card.due_at,
  }];

  if (card.due_complete) {
    events.push({
      event_id: `${prefix}:status:done-unverified`,
      commitment_id: commitmentId,
      observed_at: card.observed_at,
      type: "STATUS_SET",
      status: "DONE_UNVERIFIED",
    });
    return { disposition: "ADMIT", events };
  }

  const mappedStatus = mapRoleToStatus(listRole);
  if (mappedStatus !== "OPEN") {
    events.push({
      event_id: `${prefix}:status:${mappedStatus.toLowerCase()}`,
      commitment_id: commitmentId,
      observed_at: card.observed_at,
      type: "STATUS_SET",
      status: mappedStatus,
    });
  }

  return { disposition: "ADMIT", events };
}

function mapRoleToStatus(
  role: Exclude<TrelloListRole, "IGNORE">,
): Exclude<CommitmentStatus, "PROVEN_CLOSED"> {
  switch (role) {
    case "OPEN":
      return "OPEN";
    case "WAITING":
      return "WAITING";
    case "DONE_UNVERIFIED":
      return "DONE_UNVERIFIED";
    case "CANCELLED":
      return "CANCELLED";
  }
}
