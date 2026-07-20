import { CONTRACT_VERSION_FULL } from "../foundation/contract";
import type { OccurrenceState } from "../foundation/enums";
import type { DomainEvent } from "../foundation/types";
import { DomainError } from "../foundation/types";
import type { InMemoryEventLog } from "../foundation/event-log";

export interface Occurrence {
  occurrence_id: string;
  unit_id: string;
  type: string;
  source_channel: string;
  related_delivery_id?: string;
  related_trip_id?: string;
  state: OccurrenceState;
  report: string;
  hypothesis?: string;
  promised_action?: string;
  executed_action?: string;
  evidence?: string;
  owner_role: string;
  confirmation: "known" | "unknown" | "none";
  /** Piloto: só bloqueia disponibilidade se true */
  blocks_availability: boolean;
  opened_at: string;
  opened_by: string;
  closed_at?: string;
  closed_by?: string;
  contract_version: string;
  version: number;
}

export function openOccurrence(
  log: InMemoryEventLog,
  input: {
    occurrence_id: string;
    unit_id: string;
    type: string;
    source_channel: string;
    report: string;
    owner_role: string;
    opened_by: string;
    occurred_at: string;
    blocks_availability?: boolean;
    related_trip_id?: string;
    related_delivery_id?: string;
  },
): Occurrence {
  if (!input.report.trim()) {
    throw new DomainError("PRECONDITION_FAILED", "Occurrence exige relato");
  }
  log.append({
    object_type: "occurrence",
    object_id: input.occurrence_id,
    event_type: "occurrence_opened",
    occurred_at: input.occurred_at,
    origin: "ops_console",
    actor_id: input.opened_by,
    idempotency_key: `occurrence_opened:${input.occurrence_id}`,
    payload: {
      type: input.type,
      blocks_availability: input.blocks_availability === true,
      related_trip_id: input.related_trip_id,
    },
  });
  return {
    occurrence_id: input.occurrence_id,
    unit_id: input.unit_id,
    type: input.type,
    source_channel: input.source_channel,
    related_delivery_id: input.related_delivery_id,
    related_trip_id: input.related_trip_id,
    state: "aberta",
    report: input.report,
    owner_role: input.owner_role,
    confirmation: "none",
    blocks_availability: input.blocks_availability === true,
    opened_at: input.occurred_at,
    opened_by: input.opened_by,
    contract_version: CONTRACT_VERSION_FULL,
    version: 1,
  };
}

export function resolveOccurrence(
  log: InMemoryEventLog,
  occ: Occurrence,
  input: {
    closed_by: string;
    occurred_at: string;
    state:
      | "resolvida"
      | "fechada_sem_confirmacao"
      | "nao_resolvida"
      | "informacao_insuficiente";
    executed_action?: string;
    evidence?: string;
    confirmation?: "known" | "unknown" | "none";
  },
): Occurrence {
  if (occ.closed_at) {
    throw new DomainError("INVALID_TRANSITION", "Occurrence já fechada");
  }
  log.append({
    object_type: "occurrence",
    object_id: occ.occurrence_id,
    event_type: "occurrence_closed",
    occurred_at: input.occurred_at,
    origin: "ops_console",
    actor_id: input.closed_by,
    idempotency_key: `occurrence_closed:${occ.occurrence_id}`,
    payload: {
      state: input.state,
      blocks_availability: occ.blocks_availability,
    },
  });
  return {
    ...occ,
    state: input.state,
    executed_action: input.executed_action,
    evidence: input.evidence,
    confirmation: input.confirmation ?? "unknown",
    closed_at: input.occurred_at,
    closed_by: input.closed_by,
    version: occ.version + 1,
  };
}

export type { DomainEvent };
